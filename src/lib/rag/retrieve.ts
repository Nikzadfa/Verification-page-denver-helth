/**
 * Retrieval for the diagnostic loop.
 *
 * The rule this file enforces: manufacturer-specific claims must be backed by
 * a retrieved document, and the citation travels with the claim all the way to
 * the service report. When nothing is retrieved, the caller is told so
 * explicitly rather than being handed an empty array it might quietly ignore.
 */

import { prisma } from '@/lib/db';
import type { EngineState } from '@/lib/engine/types';
import { VERIFY_NOTICE } from '@/lib/faultcodes/types';
import { type RetrievedChunk, searchKnowledge } from './store';

export interface Citation {
  documentId: string;
  documentTitle: string;
  publication: string | null;
  page: number | null;
  section: string | null;
  snippet: string;
  similarity: number;
}

export interface RetrievalResult {
  citations: Citation[];
  /** Formatted for insertion into a prompt. */
  contextBlock: string;
  /** True when the question needed manufacturer data and none was found. */
  unsupported: boolean;
  notice: string | null;
}

const SNIPPET_CHARS = 900;

export function toCitation(chunk: RetrievedChunk): Citation {
  return {
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    publication: chunk.publication,
    page: chunk.page,
    section: chunk.section,
    snippet: chunk.content.slice(0, SNIPPET_CHARS),
    similarity: chunk.similarity,
  };
}

/**
 * Detects whether a question actually needs manufacturer documentation. A
 * question about how superheat works does not; a question about what a
 * specific board's flame-current minimum is does.
 */
const NEEDS_MANUFACTURER_DATA =
  /\b(spec|specification|nameplate|rating plate|charge weight|manifold pressure|setpoint|torque|part number|wiring diagram|sequence of operation|fault code|error code|status code|resistance (?:range|value)|microamp|minimum|maximum|rated|derate|altitude)\b/i;

export async function retrieveForQuestion(params: {
  question: string;
  manufacturerSlug?: string | null;
  equipmentType?: EngineState['context']['equipmentType'] | null;
  companyId?: string | null;
  limit?: number;
}): Promise<RetrievalResult> {
  const manufacturerId = params.manufacturerSlug
    ? (await prisma.manufacturer.findUnique({ where: { slug: params.manufacturerSlug }, select: { id: true } }))?.id ?? null
    : null;

  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await searchKnowledge({
      query: params.question,
      manufacturerId,
      equipmentType: params.equipmentType && params.equipmentType !== 'UNKNOWN' ? params.equipmentType : null,
      companyId: params.companyId ?? null,
      limit: params.limit ?? 6,
    });

    // If a manufacturer filter returned nothing, retry unfiltered — a
    // cross-brand troubleshooting guide is better than no source at all, and
    // the citation makes the provenance visible.
    if (chunks.length === 0 && manufacturerId) {
      chunks = await searchKnowledge({
        query: params.question,
        equipmentType: params.equipmentType && params.equipmentType !== 'UNKNOWN' ? params.equipmentType : null,
        companyId: params.companyId ?? null,
        limit: params.limit ?? 6,
      });
    }
  } catch {
    // A missing pgvector extension or an unmigrated database must degrade to
    // "no sources", not to a 500 in the middle of a diagnosis.
    chunks = [];
  }

  const citations = chunks.map(toCitation);
  const needsDocs = NEEDS_MANUFACTURER_DATA.test(params.question);
  const unsupported = needsDocs && citations.length === 0;

  return {
    citations,
    contextBlock: formatContext(citations),
    unsupported,
    notice: unsupported
      ? `This question needs a manufacturer specification and there is no document in the knowledge base covering ${
          params.manufacturerSlug ?? 'this equipment'
        }. Do not accept a number for it from the assistant — read it off the rating plate or the manufacturer's literature. ${VERIFY_NOTICE}`
      : null,
  };
}

/** Retrieval keyed to the current diagnostic step rather than a free question. */
export async function retrieveForStep(
  state: EngineState,
  testLabel: string,
  companyId?: string | null,
): Promise<RetrievalResult> {
  const query = [
    state.context.manufacturer,
    state.context.modelNumber,
    state.context.controlBoard,
    state.context.equipmentType.replace(/_/g, ' ').toLowerCase(),
    testLabel,
    state.context.faultCode ? `fault code ${state.context.faultCode}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return retrieveForQuestion({
    question: query,
    manufacturerSlug: state.context.manufacturer ? slugify(state.context.manufacturer) : null,
    equipmentType: state.context.equipmentType,
    companyId,
    limit: 4,
  });
}

function formatContext(citations: Citation[]): string {
  if (citations.length === 0) return '';
  return citations
    .map(
      (c, i) =>
        `[${i + 1}] ${c.documentTitle}${c.publication ? ` (${c.publication})` : ''}${
          c.page ? `, page ${c.page}` : ''
        }${c.section ? ` — ${c.section}` : ''}\n${c.snippet}`,
    )
    .join('\n\n---\n\n');
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
