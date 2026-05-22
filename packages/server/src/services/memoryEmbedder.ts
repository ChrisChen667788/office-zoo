/**
 * memoryEmbedder — v5.8.0 OpenAI text-embedding-3-small via Qingyun.
 *
 * Why Qingyun + OpenAI (vs Minimax / local):
 *  - 2026-05-22 实测确认 Minimax 下架了 embedding 产品线
 *    (see docs/V5.8_MEMORY_RFC.md §5.2 三重证据)
 *  - Qingyun aggregator (OPENAI_BASE_URL in .env) routes OpenAI's
 *    text-embedding-3-small at 70-90% direct price (~¥0.00001 per
 *    short event memory). Already paid for via OPENAI_API_KEY.
 *
 * Public surface:
 *   - embedOne(text)         → Promise<number[] | null>
 *   - embedMany(texts)       → Promise<(number[] | null)[]>
 *   - clearEmbeddingCache()  (test helper)
 *
 * Failure semantics: returns `null` on any error (timeout, 5xx, parse
 * error). Caller stores NULL in the embedding column per RFC §5.6; the
 * recall path falls back to LIKE full-text when embedding is missing.
 * We DO NOT throw — embedding loss must not break the memory write path.
 *
 * Caching: content-hash LRU. Same exact content within 1024 entries
 * returns the cached vector — high hit rate for reflection passes that
 * re-embed identical event summaries.
 */

import { createHash } from 'node:crypto';

const MODEL = 'text-embedding-3-small';
const DIM = 1536;
const CACHE_MAX = 1024;
const TIMEOUT_MS = 8_000;

/* ---------- LRU cache (simple Map-based, no dep) -------------------- */
// Map iteration order = insertion order, so re-inserting an entry after
// `get` keeps it as "most recently used" for the size-cap eviction.

const cache = new Map<string, number[]>();

function hashKey(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function cacheGet(key: string): number[] | undefined {
  const v = cache.get(key);
  if (v) {
    // Re-insert to move to "most recent" position (LRU touch).
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}

function cacheSet(key: string, vec: number[]): void {
  cache.set(key, vec);
  while (cache.size > CACHE_MAX) {
    // Drop oldest (first key in iteration order).
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/* ---------- HTTP client ---------------------------------------------- */

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding: number[] }>;
  error?: { message: string };
}

async function callEmbeddingsApi(inputs: string[]): Promise<number[][] | null> {
  const base = (process.env.OPENAI_BASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.OPENAI_API_KEY ?? '';
  if (!base || !key) {
    console.error('[memoryEmbedder] OPENAI_BASE_URL or OPENAI_API_KEY missing');
    return null;
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${base}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      signal: ctl.signal,
      body: JSON.stringify({ model: MODEL, input: inputs }),
    });
    if (!resp.ok) {
      console.error(`[memoryEmbedder] HTTP ${resp.status} ${resp.statusText}`);
      return null;
    }
    const json = await resp.json() as OpenAIEmbeddingResponse;
    if (json.error) {
      console.error('[memoryEmbedder] API error:', json.error.message);
      return null;
    }
    if (!json.data || json.data.length !== inputs.length) {
      console.error('[memoryEmbedder] response shape mismatch');
      return null;
    }
    // Sanity-check dimension on the first vector — drift here would
    // silently break HNSW recall.
    const first = json.data[0]?.embedding;
    if (!first || first.length !== DIM) {
      console.error(`[memoryEmbedder] dim mismatch: got ${first?.length} want ${DIM}`);
      return null;
    }
    return json.data.map((d) => d.embedding);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.error(`[memoryEmbedder] timeout after ${TIMEOUT_MS}ms`);
    } else {
      console.error('[memoryEmbedder] fetch failed:', (err as Error).message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Public API ---------------------------------------------- */

/** Embed a single text. Returns null on failure (caller stores NULL). */
export async function embedOne(text: string): Promise<number[] | null> {
  if (!text) return null;
  const key = hashKey(text);
  const cached = cacheGet(key);
  if (cached) return cached;
  const result = await callEmbeddingsApi([text]);
  if (!result) return null;
  const vec = result[0];
  cacheSet(key, vec);
  return vec;
}

/** Batch embed. Returns array same length as input; each slot is the
 *  vector or null on individual failure (we re-issue cached entries
 *  without an API call; uncached entries go in one batched request). */
export async function embedMany(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  const out: (number[] | null)[] = new Array(texts.length).fill(null);
  const missingIdx: number[] = [];
  const missingText: string[] = [];

  texts.forEach((t, i) => {
    if (!t) return; // null slot
    const cached = cacheGet(hashKey(t));
    if (cached) {
      out[i] = cached;
    } else {
      missingIdx.push(i);
      missingText.push(t);
    }
  });

  if (missingText.length === 0) return out;

  const vectors = await callEmbeddingsApi(missingText);
  if (!vectors) {
    // Full-batch failure — leave the missing slots as null.
    // Cached slots are preserved.
    return out;
  }
  vectors.forEach((vec, j) => {
    const i = missingIdx[j];
    out[i] = vec;
    cacheSet(hashKey(missingText[j]), vec);
  });
  return out;
}

/** Test helper — wipes the in-process LRU. Not for production callers. */
export function clearEmbeddingCache(): void {
  cache.clear();
}

/** Telemetry — cache hit rate is informative for reflection batches. */
export function getEmbeddingCacheStats(): { size: number; max: number } {
  return { size: cache.size, max: CACHE_MAX };
}
