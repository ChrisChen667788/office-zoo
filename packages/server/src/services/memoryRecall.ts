/**
 * memoryRecall — v5.8.1 score-then-rank retrieval for agent memories.
 *
 * Ranking formula (RFC §3.1 — implementation of record):
 *   score = relevance * 0.5  +  recency * 0.3  +  importance * 0.2
 *
 * - relevance: 1 - cosine_distance(query_embedding, entry_embedding).
 *              For NULL-embedding rows (RFC §5.6 fallback), relevance
 *              falls back to a LIKE substring match score in {0, 0.3}.
 *              Lower than any real cosine match so vector hits win,
 *              but non-zero so the entry isn't silently invisible.
 * - recency:   exponential decay with half-life 24 h on `decay_ts` (or
 *              `ts` if decay_ts is NULL). Mapped to [0, 1].
 * - importance: stored field, already in [0, 1].
 *
 * Two-stage execution:
 *   1. SQL fetches top-K by raw vector distance (HNSW index) AND a
 *      separate LIKE fallback set for NULL-embedding rows. Both bounded
 *      to RECALL_SQL_LIMIT (default 20) so the application-layer rank
 *      step doesn't process arbitrarily many rows.
 *   2. JS computes the composite score, sorts, returns top-k.
 *
 * Why two-stage (vs pure SQL):
 *   - Postgres ranking with a custom weighted formula across normalised
 *     distance + custom recency is awkward; doing it in JS keeps the
 *     formula readable + tunable. K is small (≤ 20 rows), the rank is
 *     micro-second work.
 */

import { getPool, ensureSchema } from './pgvectorClient';
import { embedOne } from './memoryEmbedder';
import pgvector from 'pgvector/pg';
import type { MemoryKind } from './memoryWrite';

export interface RecallQuery {
  /** REQUIRED — narrow to memories belonging to this archetype. */
  agentArchetype: string;
  /** Free-text query that gets embedded for cosine search. Often the
   *  current speech context or "who I'm reacting to" sentence. */
  query: string;
  /** Optional narrowing — limit to memories about a specific human. */
  targetUserId?: string | null;
  /** Optional narrowing — limit to memories about a specific AI player. */
  targetPlayerId?: string | null;
  /** Optional narrowing — only consider entries of this kind. */
  kind?: MemoryKind;
  /** How many top-ranked entries to return. Default 5. */
  k?: number;
}

export interface RecalledMemory {
  id: number;
  agentArchetype: string;
  kind: MemoryKind;
  content: string;
  sourceGameId: string | null;
  sourceRound: number | null;
  ts: Date;
  importance: number;
  /** 0-1 composite score, monotone with "this memory matters here". */
  score: number;
  /** Individual subscores — for tuning + debug. */
  scoreBreakdown: {
    relevance: number;
    recency: number;
    importance: number;
  };
}

const RECALL_SQL_LIMIT = 20;
const RECENCY_HALF_LIFE_MS = 24 * 60 * 60 * 1000; // 1 day

/** Decay 1.0 → 0.5 over RECENCY_HALF_LIFE_MS, → 0 at infinity. */
function recencyScore(ts: Date): number {
  const ageMs = Date.now() - ts.getTime();
  if (ageMs <= 0) return 1;
  return Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS);
}

/** LIKE-substring fallback relevance for NULL-embedding rows. Returns
 *  0.3 if any whitespace-split query token appears in content, else 0. */
function fallbackRelevance(query: string, content: string): number {
  const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
  for (const t of tokens) {
    if (content.includes(t)) return 0.3;
  }
  return 0;
}

interface RawRow {
  id: number;
  agent_archetype: string;
  kind: MemoryKind;
  content: string;
  source_game_id: string | null;
  source_round: number | null;
  ts: Date;
  importance: number;
  /** For vector-matched rows: cosine distance ∈ [0, 2]. Null for LIKE-fallback rows. */
  distance: number | null;
}

export async function recallMemories(q: RecallQuery): Promise<RecalledMemory[]> {
  await ensureSchema();
  const k = q.k ?? 5;
  const queryVec = await embedOne(q.query);

  // Branch on whether we got a query embedding:
  //   - vec OK: vector candidates (HNSW) + LIKE fallback union'd, sorted in JS
  //   - vec failed: pure LIKE fallback (recall is degraded but not zero)
  const pool = getPool();
  const filters: string[] = ['agent_archetype = $1'];
  const params: unknown[] = [q.agentArchetype];
  if (q.targetUserId !== undefined && q.targetUserId !== null) {
    filters.push(`target_user_id = $${params.length + 1}`);
    params.push(q.targetUserId);
  }
  if (q.targetPlayerId !== undefined && q.targetPlayerId !== null) {
    filters.push(`target_player_id = $${params.length + 1}`);
    params.push(q.targetPlayerId);
  }
  if (q.kind) {
    filters.push(`kind = $${params.length + 1}`);
    params.push(q.kind);
  }
  const whereBase = filters.join(' AND ');

  let rows: RawRow[];
  if (queryVec) {
    // Union vector-matched + null-embedding entries. The vector branch
    // uses the HNSW index (the `<=>` operator triggers it); the NULL
    // branch is small (rows without embedding are an exception state).
    const vecParam = `$${params.length + 1}`;
    const limitParam = `$${params.length + 2}`;
    const { rows: r } = await pool.query<RawRow>(
      `
      (
        SELECT id, agent_archetype, kind, content,
               source_game_id, source_round, ts, importance,
               embedding <=> ${vecParam} AS distance
          FROM memory_entries
         WHERE ${whereBase}
           AND embedding IS NOT NULL
         ORDER BY embedding <=> ${vecParam}
         LIMIT ${limitParam}
      )
      UNION ALL
      (
        SELECT id, agent_archetype, kind, content,
               source_game_id, source_round, ts, importance,
               NULL::float8 AS distance
          FROM memory_entries
         WHERE ${whereBase}
           AND embedding IS NULL
         ORDER BY ts DESC
         LIMIT ${limitParam}
      )
      `,
      [...params, pgvector.toSql(queryVec), RECALL_SQL_LIMIT],
    );
    rows = r;
  } else {
    // Pure LIKE fallback — most recent matching rows.
    const limitParam = `$${params.length + 1}`;
    const { rows: r } = await pool.query<RawRow>(
      `SELECT id, agent_archetype, kind, content,
              source_game_id, source_round, ts, importance,
              NULL::float8 AS distance
         FROM memory_entries
        WHERE ${whereBase}
        ORDER BY ts DESC
        LIMIT ${limitParam}`,
      [...params, RECALL_SQL_LIMIT],
    );
    rows = r;
  }

  // Score + rank
  // v5.9.0 — beliefs (kind='belief') get their importance weighted
  // × 1.5 in the composite score (clamped to 1.0). Rationale:
  // reflection-derived beliefs are higher-signal than the events
  // they're built from, and should naturally surface above them
  // when both match a query. The clamp keeps the formula a convex
  // combination, so total score stays comparable across kinds.
  const BELIEF_IMPORTANCE_BOOST = 1.5;
  const scored: RecalledMemory[] = rows.map((r) => {
    const relevance = r.distance !== null
      ? Math.max(0, 1 - r.distance)             // cosine: 0 = identical, 2 = opposite
      : fallbackRelevance(q.query, r.content);
    const recency = recencyScore(r.ts);
    const rawImportance = Math.max(0, Math.min(1, r.importance));
    const importance = r.kind === 'belief'
      ? Math.min(1, rawImportance * BELIEF_IMPORTANCE_BOOST)
      : rawImportance;
    const score = relevance * 0.5 + recency * 0.3 + importance * 0.2;
    return {
      id: r.id,
      agentArchetype: r.agent_archetype,
      kind: r.kind,
      content: r.content,
      sourceGameId: r.source_game_id,
      sourceRound: r.source_round,
      ts: r.ts,
      importance,
      score,
      scoreBreakdown: { relevance, recency, importance },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
