/**
 * bench-memory-100games — v5.8.1 polish stress test.
 *
 *   npx tsx packages/server/scripts/bench-memory-100games.ts
 *
 * Simulates 100 games × 5 rounds × 6 surviving agents ≈ 3000 memory
 * entries — the upper-bound load for a moderately active user a few
 * weeks into v6.0 rollout. Measures:
 *
 *   - batch write latency (round-end pattern: 6 entries/batch)
 *   - recall latency (HNSW vector search) p50/p95
 *   - recall latency (LIKE fallback) for NULL-embedding rows
 *   - table size + index size after the run
 *
 * Pass thresholds (RFC §6 SLO sanity):
 *   - batch write p95   ≤ 1200 ms (Qingyun embed is the dominant cost)
 *   - HNSW recall p95   ≤ 200 ms
 *   - LIKE recall p95   ≤ 80 ms (no embedding API hit)
 *
 * Cost: 3000 entries × ~0.0001 = ~$0.3 in Qingyun embeddings.
 * Cleanup at end leaves the DB empty for the test cohort.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import { writeMemoryBatch } from '../src/services/memoryWrite';
import { recallMemories } from '../src/services/memoryRecall';
import { getPool, shutdown } from '../src/services/pgvectorClient';

const GAMES = 100;
const ROUNDS_PER_GAME = 5;
const SURVIVORS_PER_ROUND = 6;
const BENCH_PREFIX = 'bench-archetype';   // 8 fake personalities
const ARCHETYPES = Array.from({ length: 8 }, (_, i) => `${BENCH_PREFIX}-${i}`);

// Realistic event content shapes — mix of subjects + verbs so embedding
// recall has meaningful semantic distance to work with.
const VICTIMS = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十'];
const ACTIONS = [
  '被全员投票开除',
  '阴阳怪气地说我颗粒度不够',
  '联合其他人针对我',
  '在第一句就指名说我是 dog',
  '救了我一票',
  '画大饼说一切都会好的',
  '甩锅说这件事 owner 是我',
  '突然反水投我',
];

function p(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

async function main() {
  console.log('═══ v5.8.1 100-game memory bench ═══\n');

  const writeLatencies: number[] = [];
  const hnswLatencies: number[] = [];
  const likeLatencies: number[] = [];

  // ----------------- Phase 1 — Write -----------------
  console.log(`Phase 1: write — ${GAMES} games × ${ROUNDS_PER_GAME} rounds × ${SURVIVORS_PER_ROUND} entries`);
  console.log('         (one batched-embed API call per round-end)');
  const t0 = Date.now();
  let written = 0;

  for (let g = 0; g < GAMES; g++) {
    const gameId = `bench-game-${g.toString().padStart(3, '0')}`;
    for (let r = 1; r <= ROUNDS_PER_GAME; r++) {
      const victim = VICTIMS[Math.floor(Math.random() * VICTIMS.length)];
      const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
      const entries = Array.from({ length: SURVIVORS_PER_ROUND }, (_, i) => ({
        agentArchetype: ARCHETYPES[i],
        sourceGameId: gameId,
        sourceRound: r,
        kind: 'event' as const,
        content: `在 ${gameId} 第${r}轮, @${victim} ${action}, 我活了下来`,
        importance: 0.5,
      }));
      const tBatch = Date.now();
      await writeMemoryBatch(entries);
      writeLatencies.push(Date.now() - tBatch);
      written += entries.length;
    }
    if ((g + 1) % 10 === 0) {
      const elapsed = Date.now() - t0;
      const rate = (written / elapsed * 1000).toFixed(1);
      process.stdout.write(`\r  game ${g + 1}/${GAMES} · ${written} entries · ${rate} entries/sec`);
    }
  }
  const writeTotal = Date.now() - t0;
  console.log(`\n  done in ${(writeTotal / 1000).toFixed(1)}s · ${written} entries\n`);

  // ----------------- Phase 2 — HNSW recall -----------------
  console.log('Phase 2: HNSW recall — 50 random queries × random archetype');
  const queries = [
    '王五 阴阳 颗粒度',
    '我被投出局了, 谁干的',
    '张三 救票 盟友',
    '甩锅 owner',
    '画大饼 期权',
  ];
  for (let i = 0; i < 50; i++) {
    const archetype = ARCHETYPES[i % ARCHETYPES.length];
    const query = queries[i % queries.length];
    const t = Date.now();
    await recallMemories({ agentArchetype: archetype, query, k: 5 });
    hnswLatencies.push(Date.now() - t);
  }
  console.log(`  ${hnswLatencies.length} queries · p50 ${p(hnswLatencies, 0.5)}ms · p95 ${p(hnswLatencies, 0.95)}ms · max ${Math.max(...hnswLatencies)}ms\n`);

  // ----------------- Phase 3 — LIKE fallback -----------------
  // Force LIKE path by inserting a row with NULL embedding, then querying
  // with gibberish that won't match any vector but DOES contain its content tokens.
  console.log('Phase 3: LIKE fallback — 20 queries against NULL-embedding rows');
  // Inject a few NULL-embed rows to give LIKE something to find.
  await getPool().query(
    `INSERT INTO memory_entries (agent_archetype, kind, content, importance)
     VALUES ($1, 'event', 'NULL_EMBED_PROBE_unique_token_xyzzy', 0.5)`,
    [ARCHETYPES[0]],
  );
  for (let i = 0; i < 20; i++) {
    const t = Date.now();
    // Use a string that will trigger LIKE matching on the unique token.
    // We override embedOne effectively by passing a phrase the embedding
    // will still go through but the LIKE fallback path will also pick up.
    await recallMemories({
      agentArchetype: ARCHETYPES[0],
      query: 'xyzzy unique probe',
      k: 3,
    });
    likeLatencies.push(Date.now() - t);
  }
  console.log(`  ${likeLatencies.length} queries · p50 ${p(likeLatencies, 0.5)}ms · p95 ${p(likeLatencies, 0.95)}ms · max ${Math.max(...likeLatencies)}ms\n`);

  // ----------------- Phase 4 — Sizes -----------------
  console.log('Phase 4: storage sizes');
  const { rows: sizeRows } = await getPool().query<{
    table_size: string; index_size: string; row_count: number;
  }>(
    `SELECT
       pg_size_pretty(pg_total_relation_size('memory_entries')) AS table_size,
       pg_size_pretty(pg_indexes_size('memory_entries')) AS index_size,
       (SELECT count(*)::int FROM memory_entries
          WHERE agent_archetype LIKE $1 || '%') AS row_count`,
    [BENCH_PREFIX],
  );
  const sz = sizeRows[0];
  console.log(`  total size: ${sz.table_size} · indexes: ${sz.index_size} · bench rows: ${sz.row_count}`);

  // ----------------- Pass/fail -----------------
  console.log('\n═══ SLO check ═══');
  const writeP95 = p(writeLatencies, 0.95);
  const hnswP95  = p(hnswLatencies, 0.95);
  const likeP95  = p(likeLatencies, 0.95);
  const checks = [
    { name: 'batch write p95',   actual: writeP95, threshold: 1200 },
    { name: 'HNSW recall p95',   actual: hnswP95,  threshold: 200 },
    { name: 'LIKE recall p95',   actual: likeP95,  threshold: 80 },
  ];
  let allPass = true;
  for (const c of checks) {
    const pass = c.actual <= c.threshold;
    if (!pass) allPass = false;
    console.log(`  ${pass ? '✅' : '❌'} ${c.name}: ${c.actual}ms (≤ ${c.threshold}ms)`);
  }

  // ----------------- Cleanup -----------------
  console.log('\nPhase 5: cleanup');
  const { rowCount } = await getPool().query(
    `DELETE FROM memory_entries WHERE agent_archetype LIKE $1 || '%'`,
    [BENCH_PREFIX],
  );
  console.log(`  deleted ${rowCount} bench entries`);

  await shutdown().catch(() => {});
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error('💥 unhandled:', err);
  await shutdown().catch(() => {});
  process.exit(1);
});
