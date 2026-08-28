/**
 * Chunking for manufacturer service literature.
 *
 * Service manuals are not prose. They are tables, code lists, numbered
 * sequences and step procedures, and a naive fixed-window splitter will cut a
 * fault-code table in half and leave the code number in one chunk and its
 * meaning in another — which is exactly the retrieval failure that produces a
 * confidently wrong answer.
 *
 * So this splitter:
 *  - prefers to break on headings and blank lines
 *  - keeps a numbered/lettered list item with its content
 *  - never splits inside what looks like a table row
 *  - overlaps chunks so a procedure that straddles a boundary is retrievable
 *    from either side
 */

export interface Chunk {
  ordinal: number;
  content: string;
  page: number | null;
  section: string | null;
  tokens: number;
}

export interface ChunkOptions {
  targetChars?: number;
  overlapChars?: number;
  /** Page markers in the extracted text, e.g. "\f" or "[[page 12]]". */
  pagePattern?: RegExp;
}

const HEADING = /^(?:[A-Z][A-Z0-9 \-/&.,'()]{6,}|#{1,6}\s+.+|\d+(?:\.\d+)*\s+[A-Z].{4,})$/;
const TABLE_ROW = /\S\s{2,}\S|\|\s*\S/;
const LIST_ITEM = /^\s*(?:\d+[.)]|[a-z][.)]|[-•*])\s+/i;

/** Rough token estimate. Good enough for budgeting a retrieval context. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkDocument(text: string, options: ChunkOptions = {}): Chunk[] {
  const targetChars = options.targetChars ?? 2400;
  const overlapChars = options.overlapChars ?? 250;
  const pagePattern = options.pagePattern ?? /\[\[page\s+(\d+)\]\]|\f/gi;

  // Split into page-tagged segments first so citations can carry a page.
  const pages = splitPages(text, pagePattern);
  const chunks: Chunk[] = [];
  let ordinal = 0;

  for (const page of pages) {
    const lines = page.content.split(/\r?\n/);
    let currentSection: string | null = null;
    let buffer: string[] = [];
    let bufferChars = 0;

    const flush = () => {
      const content = buffer.join('\n').trim();
      if (!content) {
        buffer = [];
        bufferChars = 0;
        return;
      }
      chunks.push({
        ordinal: ordinal++,
        content,
        page: page.page,
        section: currentSection,
        tokens: estimateTokens(content),
      });
      // Carry an overlap tail so a procedure split across a boundary is still
      // retrievable from the following chunk.
      const tail: string[] = [];
      let tailChars = 0;
      for (let i = buffer.length - 1; i >= 0 && tailChars < overlapChars; i -= 1) {
        tail.unshift(buffer[i]!);
        tailChars += buffer[i]!.length + 1;
      }
      buffer = tail;
      bufferChars = tailChars;
    };

    for (const line of lines) {
      const trimmed = line.trim();

      if (HEADING.test(trimmed) && trimmed.length < 90) {
        // A heading starts a new logical unit — flush before it, not after.
        if (bufferChars > targetChars * 0.35) flush();
        currentSection = trimmed.replace(/^#+\s*/, '');
      }

      buffer.push(line);
      bufferChars += line.length + 1;

      if (bufferChars < targetChars) continue;

      // At the size limit, look for a clean place to break rather than
      // cutting mid-structure.
      const isMidTable = TABLE_ROW.test(trimmed);
      const isMidList = LIST_ITEM.test(trimmed);
      const nextIsBlank = trimmed === '';

      if (nextIsBlank || (!isMidTable && !isMidList)) {
        flush();
      } else if (bufferChars > targetChars * 1.8) {
        // Hard cap: a 40-row table would otherwise grow without bound.
        flush();
      }
    }

    flush();
  }

  return chunks.filter((c) => c.content.replace(/\s/g, '').length > 40);
}

function splitPages(text: string, pattern: RegExp): Array<{ page: number | null; content: string }> {
  const out: Array<{ page: number | null; content: string }> = [];
  let lastIndex = 0;
  let currentPage: number | null = null;

  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const content = text.slice(lastIndex, match.index);
    if (content.trim()) out.push({ page: currentPage, content });
    currentPage = match[1] ? Number(match[1]) : (currentPage ?? 0) + 1;
    lastIndex = match.index + match[0].length;
  }

  const tail = text.slice(lastIndex);
  if (tail.trim()) out.push({ page: currentPage, content: tail });

  return out.length ? out : [{ page: null, content: text }];
}

/**
 * Prefix each chunk with its document and section before embedding. Without
 * this, a chunk that reads "Code 31: pressure switch did not close" embeds
 * without any signal about which manual or which board it belongs to, and
 * retrieval across a multi-manufacturer corpus becomes a coin flip.
 */
export function contextualizeForEmbedding(
  chunk: Chunk,
  doc: { title: string; manufacturer?: string | null; modelSeries?: string[]; publication?: string | null },
): string {
  const header = [
    doc.manufacturer ? `Manufacturer: ${doc.manufacturer}` : null,
    `Document: ${doc.title}`,
    doc.publication ? `Publication: ${doc.publication}` : null,
    doc.modelSeries?.length ? `Applies to: ${doc.modelSeries.join(', ')}` : null,
    chunk.section ? `Section: ${chunk.section}` : null,
    chunk.page ? `Page: ${chunk.page}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return `${header}\n\n${chunk.content}`;
}
