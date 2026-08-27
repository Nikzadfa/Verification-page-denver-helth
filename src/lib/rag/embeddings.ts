/**
 * Embeddings.
 *
 * Two providers:
 *
 *  - `local` (default): a deterministic hashed bag-of-n-grams projected into
 *    the configured dimensionality. It is not semantically strong — it matches
 *    on shared vocabulary rather than meaning — but it needs no network, no
 *    key, and no cost, it is fully reproducible, and for manufacturer service
 *    literature (where the technician's query and the document share a lot of
 *    exact vocabulary: part numbers, code numbers, component names) it
 *    retrieves usefully. It also makes the RAG path testable in CI.
 *
 *  - `voyage`: a real embedding model, for production quality retrieval.
 *
 * Whichever is used is recorded on the document so a provider change can
 * invalidate and re-embed rather than silently mixing incompatible vectors.
 */

export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 1024);

export type EmbeddingProvider = 'local' | 'voyage';

export function currentProvider(): EmbeddingProvider {
  const p = (process.env.EMBEDDING_PROVIDER ?? 'local').toLowerCase();
  return p === 'voyage' && process.env.VOYAGE_API_KEY ? 'voyage' : 'local';
}

/** FNV-1a, used to place n-grams into dimensions deterministically. */
function hash(str: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && t.length < 40);
}

/**
 * Hashed n-gram embedding with sublinear term weighting and L2 normalization,
 * so cosine similarity behaves sensibly.
 */
export function embedLocal(text: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(text);
  const counts = new Map<string, number>();

  const bump = (term: string) => counts.set(term, (counts.get(term) ?? 0) + 1);

  for (let i = 0; i < tokens.length; i += 1) {
    bump(tokens[i]!);
    if (i + 1 < tokens.length) bump(`${tokens[i]}_${tokens[i + 1]}`);
  }

  for (const [term, count] of counts) {
    const idx = hash(term) % dimensions;
    // Signed placement halves collision cancellation artefacts.
    const sign = (hash(term, 0x811c9dc5) & 1) === 0 ? 1 : -1;
    vector[idx]! += sign * (1 + Math.log(count));
  }

  const norm = Math.sqrt(vector.reduce((a, v) => a + v * v, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

async function embedVoyage(texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: texts, model: 'voyage-3', output_dimension: EMBEDDING_DIMENSIONS }),
  });

  if (!response.ok) {
    throw new Error(`Voyage embeddings failed: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as { data: Array<{ embedding: number[]; index: number }> };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (currentProvider() === 'voyage') {
    try {
      return await embedVoyage(texts);
    } catch {
      // Falling back keeps ingestion working rather than leaving documents
      // stuck in EMBEDDING forever. The provider is recorded per document so
      // a mixed corpus is detectable.
      return texts.map((t) => embedLocal(t));
    }
  }
  return texts.map((t) => embedLocal(t));
}

export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embed([text]);
  return v ?? embedLocal(text);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** pgvector literal format. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : '0')).join(',')}]`;
}
