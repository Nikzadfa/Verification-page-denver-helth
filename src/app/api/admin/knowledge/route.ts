import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { knowledgeDocSchema } from '@/lib/api/schemas';
import { handle, ok } from '@/lib/api/respond';
import { prisma } from '@/lib/db';
import { ingestDocument } from '@/lib/rag/store';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();
  const documents = await prisma.knowledgeDocument.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { manufacturer: { select: { name: true } } },
  });
  return ok({ documents });
});

export const POST = handle(async (request: NextRequest) => {
  const admin = await requireAdmin();
  const body = knowledgeDocSchema.parse(await request.json());

  const manufacturer = body.manufacturerSlug
    ? await prisma.manufacturer.findUnique({ where: { slug: body.manufacturerSlug }, select: { id: true } })
    : null;

  const document = await prisma.knowledgeDocument.create({
    data: {
      title: body.title,
      type: body.type,
      manufacturerId: manufacturer?.id ?? null,
      companyId: body.companyPrivate ? admin.companyId : null,
      uploadedById: admin.id,
      equipmentTypes: body.equipmentTypes,
      modelSeries: body.modelSeries,
      publication: body.publication ?? null,
      status: 'PENDING',
    },
  });

  try {
    const result = await ingestDocument({ documentId: document.id, text: body.text });
    // Re-read: ingestion advances the row through CHUNKING/EMBEDDING to READY,
    // so the object created above is already stale by the time we reply.
    const ingested = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: document.id } });
    return ok({ document: ingested, chunks: result.chunkCount }, 201);
  } catch (error) {
    // The document row survives with status FAILED and the reason attached, so
    // the administrator can see what happened rather than the upload
    // disappearing.
    const failed = await prisma.knowledgeDocument.findUnique({ where: { id: document.id } });
    return ok(
      {
        document: failed ?? document,
        chunks: 0,
        error: error instanceof Error ? error.message : 'Ingestion failed.',
      },
      201,
    );
  }
});
