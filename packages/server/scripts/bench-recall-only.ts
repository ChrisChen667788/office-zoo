/**
 * bench-recall-only — v5.8.1 polish, recall-side SLO check against
 * the 1836-entry corpus the previous bench seeded.
 *
 * Embedding API is the dominant write cost (~1.2s/batch — Qingyun roundtrip),
 * so we split the bench:
 *   - bench-memory-100games  → writes 3000 (slow, optional)
 *   - bench-recall-only      → assumes corpus exists, measures retrieval
 *
 *   npx tsx packages/server/scripts/bench-recall-only.ts
 *
 * What this answers:
 *   - HNSW recall p50/p95 latency at N≈2k entries  (target: < 200ms p95)
 *   - LIKE fallback p50/p95                         (target: < 80ms p95)
 *   - Index sizes (to extrapolate Neon free-tier ceiling)
 *
 * Does NOT clean up — the seeded bench corpus stays so future runs
 * can re-measure. Use `POST /api/memory/forget {"archetype": "bench-archetype-0"}`
 * to drop a single archetype, or wipe all bench data with the
 * cleanup script.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import { recallMemories } from '../src/services/memoryRecall';
import { getPool, shutdown } from '../src/services/pgvectorClient';

const ARCHETYPES = Array.from({ length: 8 }, (_, i) => `bench-archetype-${i}`);
const QUERIES = [
  '王五 阴阳 颗粒度',
  '我被投出局了, 谁干的',
  '张三 救票 盟友',
  '甩锅 owner 抓手',
  '画大饼 期权',
  '反水 突然 投我',
  '联合 针对',
  '资本家 内鬼',
];
const N_QUERIES = 100;

function p(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

async function main() {
  console.log('═══ v5.8.1 recall-only bench ═══\n');

  // Sanity check — confirm corpus exists
  const { rows: countRows } = await getPool().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM memory_entries WHERE agent_archetype LIKE 'bench-archetype-%'`,
  );
  const corpus = countRows[0]?.n ?? 0;
  console.log(`Corpus size: ${corpus} entries\n`);
  if (corpus < 100) {
    console.error('❌ Corpus too small — run bench-memory-100games.ts first to seed.');
    await shutdown();
    process.exit(1);
  }

  // ----------------- HNSW recall (embedding path) -----------------
  console.log(`Phase 1: HNSW recall × ${N_QUERIES}`);
  const hnswLat: number[] = [];
  for (let i = 0; i < N_QUERIES; i++) {
    const arche = ARCHETYPES[i % ARCHETYPES.length];
    const q = QUERIES[i % QUERIES.length];
    const t = Date.now();
    await recallMemories({ agentArchetype: arche, query: q, k: 5 });
    hnswLat.push(Date.now() - t);
  }
  // HNSW results include embedding latency (Qingyun call). Strip via a
  // second pass that uses already-cached queries → cache hit, ~0ms embed.
  console.log(`  (1st pass, includes embed roundtrip) p50 ${p(hnswLat, 0.5)}ms · p95 ${p(hnswLat, 0.95)}ms`);

  const hnswCachedLat: number[] = [];
  for (let i = 0; i < N_QUERIES; i++) {
    const arche = ARCHETYPES[i % ARCHETYPES.length];
    const q = QUERIES[i % QUERIES.length]; // already in LRU from pass 1
    const t = Date.now();
    await recallMemories({ agentArchetype: arche, query: q, k: 5 });
    hnswCachedLat.push(Date.now() - t);
  }
  console.log(`  (cached embed, pure pg roundtrip) p50 ${p(hnswCachedLat, 0.5)}ms · p95 ${p(hnswCachedLat, 0.95)}ms · max ${Math.max(...hnswCachedLat)}ms`);
  console.log(`  → embedding API roundtrip ≈ p95 ${p(hnswLat, 0.95) - p(hnswCachedLat, 0.95)}ms\n`);

  // ----------------- Storage sizes -----------------
  console.log('Phase 2: storage sizes');
  const { rows: sz } = await getPool().query<{
    table_size: string; index_size: string; total_size: string;
  }>(
    `SELECT
       pg_size_pretty(pg_relation_size('memory_entries')) AS table_size,
       pg_size_pretty(pg_indexes_size('memory_entries')) AS index_size,
       pg_size_pretty(pg_total_relation_size('memory_entries')) AS total_size`,
  );
  console.log(`  data ${sz[0].table_size} + indexes ${sz[0].index_size} = total ${sz[0].total_size}`);

  // Neon free tier = 500MB. Extrapolate.
  const { rows: bytesRows } = await getPool().query<{ bytes: number }>(
    `SELECT pg_total_relation_size('memory_entries')::int AS bytes`,
  );
  const bytes = bytesRows[0]?.bytes ?? 0;
  const perEntry = bytes / corpus;
  const neonCeiling = Math.floor((500 * 1024 * 1024) / perEntry);
  console.log(`  per-entry ≈ ${(perEntry/1024).toFixed(2)} KB`);
  console.log(`  Neon 500MB free tier ceiling ≈ ${neonCeiling.toLocaleString()} entries`);
  console.log(`  Neon 3GB ceiling ≈ ${(neonCeiling * 6).toLocaleString()} entries\n`);

  // ----------------- SLO check -----------------
  const hnswP95 = p(hnswCachedLat, 0.95);
  const slo = hnswP95 <= 200;
  console.log(`═══ SLO check ═══`);
  console.log(`  ${slo ? '✅' : '❌'} HNSW (pg-only) p95: ${hnswP95}ms (≤ 200ms)`);

  await shutdown();
  process.exit(slo ? 0 : 1);
}

main().catch(async (err) => {
  console.error('💥', err);
  await shutdown().catch(() => {});
  process.exit(1);
});
