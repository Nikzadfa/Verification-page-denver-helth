/**
 * Vector store operations.
 *
 * Prisma cannot type a pgvector column, so writes and similarity search go
 * through raw SQL. Everything is parameterized — no string interpolation of
 * user input — and the vector literal is built by toVectorLiteral() from
 * numbers we produced, never from request data.
 */

import type { EquipmentType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { chunkDocument, contextualizeForEmbedding } from './chunk';
import { EMBEDDING_DIMENSIONS, embed, embedOne, toVectorLiteral } from './embeddings';

export interface IngestParams {
  documentId: string;
  text: string;
}

export interface IngestResult {
  chunkCount: number;
  tokenCount: number;
}

/**
 * Chunk, embed and store a document's extracted text. Runs in stages so the
 * admin UI can show progress, and marks the document FAILED with a readable
 * reason rather than leaving it stuck.
 */
export async function ingestDocument({ documentId, text }: IngestParams): Promise<IngestResult> {
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id: documentId },
    include: { manufacturer: true },
  });
  if (!doc) throw new Error(`Document ${documentId} not found`);

  try {
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: 'CHUNKING', statusError: null },
    });

    const chunks = chunkDocument(text);
    if (chunks.length === 0) {
      throw new Error(
        'No usable text was extracted. If this is a scanned PDF it needs OCR before it can be indexed.',
      );
    }

    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: 'EMBEDDING', chunkCount: chunks.length },
    });

    // Replace rather than append, so re-ingesting a corrected document does
    // not leave the old chunks retrievable alongside the new ones.
    await prisma.documentChunk.deleteMany({ where: { documentId } });

    const BATCH = 32;
    let tokenCount = 0;

    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const texts = batch.map((c) =>
        contextualizeForEmbedding(c, {
          title: doc.title,
          manufacturer: doc.manufacturer?.name ?? null,
          modelSeries: doc.modelSeries,
          publication: doc.publication,
        }),
      );
      const vectors = await embed(texts);

      for (let j = 0; j < batch.length; j += 1) {
        const chunk = batch[j]!;
        const vector = vectors[j];
        if (!vector || vector.length !== EMBEDDING_DIMENSIONS) continue;
        tokenCount += chunk.tokens;

        await prisma.$executeRaw`
          INSERT INTO "DocumentChunk"
            ("id", "documentId", "ordinal", "page", "section", "content", "tokens",
             "manufacturerId", "companyId", "equipmentTypes", "embedding", "createdAt")
          VALUES (
            gen_random_uuid(),
            ${documentId},
            ${chunk.ordinal},
            ${chunk.page},
            ${chunk.section},
            ${chunk.content},
            ${chunk.tokens},
            ${doc.manufacturerId},
            ${doc.companyId},
            ${doc.equipmentTypes}::"EquipmentType"[],
            ${toVectorLiteral(vector)}::vector,
            NOW()
          )
          ON CONFLICT ("documentId", "ordinal") DO UPDATE
            SET "content" = EXCLUDED."content",
                "embedding" = EXCLUDED."embedding",
                "section" = EXCLUDED."section",
                "page" = EXCLUDED."page"
        `;
      }
    }

    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: 'READY', chunkCount: chunks.length, statusError: null },
    });

    return { chunkCount: chunks.length, tokenCount };
  } catch (error) {
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        status: 'FAILED',
        statusError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      },
    });
    throw error;
  }
}

export interface SearchParams {
  query: string;
  manufacturerId?: string | null;
  equipmentType?: EquipmentType | null;
  /** Scopes to platform-wide documents plus this company's private ones. */
  companyId?: string | null;
  limit?: number;
  /** Cosine distance ceiling. Lower is stricter. */
  maxDistance?: number;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentType: string;
  manufacturer: string | null;
  publication: string | null;
  page: number | null;
  section: string | null;
  content: string;
  distance: number;
  similarity: number;
}

/**
 * Filtered vector search. The filter is applied in SQL rather than after
 * retrieval so a Carrier query cannot come back full of Trane chunks that then
 * get discarded, leaving too few results.
 */
export async function searchKnowledge(params: SearchParams): Promise<RetrievedChunk[]> {
  const limit = params.limit ?? 6;
  const maxDistance = params.maxDistance ?? 0.75;
  const vector = toVectorLiteral(await embedOne(params.query));

  const rows = await prisma.$queryRaw<
    Array<{
      chunkId: string;
      documentId: string;
      documentTitle: string;
      documentType: string;
      manufacturer: string | null;
      publication: string | null;
      page: number | null;
      section: string | null;
      content: string;
      distance: number;
    }>
  >`
    SELECT
      c."id"            AS "chunkId",
      c."documentId"    AS "documentId",
      d."title"         AS "documentTitle",
      d."type"::text    AS "documentType",
      m."name"          AS "manufacturer",
      d."publication"   AS "publication",
      c."page"          AS "page",
      c."section"       AS "section",
      c."content"       AS "content",
      (c."embedding" <=> ${vector}::vector) AS "distance"
    FROM "DocumentChunk" c
    JOIN "KnowledgeDocument" d ON d."id" = c."documentId"
    LEFT JOIN "Manufacturer" m ON m."id" = d."manufacturerId"
    WHERE d."status" = 'READY'
      AND c."embedding" IS NOT NULL
      AND (c."companyId" IS NULL OR c."companyId" = ${params.companyId ?? null})
      AND (${params.manufacturerId ?? null}::text IS NULL OR c."manufacturerId" = ${params.manufacturerId ?? null})
      AND (
        ${params.equipmentType ?? null}::text IS NULL
        OR cardinality(c."equipmentTypes") = 0
        OR ${params.equipmentType ?? null}::"EquipmentType" = ANY(c."equipmentTypes")
      )
      AND (c."embedding" <=> ${vector}::vector) < ${maxDistance}
    ORDER BY c."embedding" <=> ${vector}::vector
    LIMIT ${limit}
  `;

  return rows.map((r) => ({ ...r, similarity: Math.round((1 - r.distance) * 1000) / 1000 }));
}

/** Delete a document and everything derived from it. */
export async function deleteDocument(documentId: string): Promise<void> {
  await prisma.knowledgeDocument.delete({ where: { id: documentId } });
}
