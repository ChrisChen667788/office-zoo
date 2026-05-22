/**
 * probe-memory-write-recall — v5.8.1 write + recall round-trip.
 *
 *   npx tsx packages/server/scripts/probe-memory-write-recall.ts
 *
 * Validates memoryWrite + memoryRecall pair against the pgvector
 * infrastructure stood up in v5.8.0. Steps:
 *   1. writeMemory single
 *   2. writeMemoryBatch (5 entries, batch embed + multi-row INSERT)
 *   3. recall with strong semantic match → expect top hit
 *   4. recall with kind filter → expect filtered subset only
 *   5. recall with NO matching query (gibberish) → expect recency-only top
 *   6. cleanup
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import { writeMemory, writeMemoryBatch } from '../src/services/memoryWrite';
import { recallMemories } from '../src/services/memoryRecall';
import { getPool, shutdown } from '../src/services/pgvectorClient';

let pass = 0, fail = 0;
function step(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++; else fail++;
}

const TEST_AGENT = 'sass-master-probe';

async function main() {
  console.log('═══ v5.8.1 memoryWrite + memoryRecall probe ═══\n');

  // Step 1
  const singleId = await writeMemory({
    agentArchetype: TEST_AGENT,
    sourceGameId: 'g-probe-A',
    sourceRound: 3,
    kind: 'event',
    content: '在 game_A 第3轮, 我目睹 @张三 阴阳怪气地投了 @李四 出局',
    importance: 0.7,
  });
  step('1. writeMemory single', singleId !== null, `id=${singleId}`);

  // Step 2 — batch with 5 mixed events
  const batchIds = await writeMemoryBatch([
    { agentArchetype: TEST_AGENT, sourceGameId: 'g-probe-B', sourceRound: 1, kind: 'event', content: '在 game_B 第1轮, @王五 第一个发言就阴阳我' },
    { agentArchetype: TEST_AGENT, sourceGameId: 'g-probe-B', sourceRound: 2, kind: 'event', content: '在 game_B 第2轮, @赵六 救了我一票' },
    { agentArchetype: TEST_AGENT, sourceGameId: 'g-probe-B', sourceRound: 3, kind: 'event', content: '在 game_B 第3轮, 我自己被全员投了出局' },
    { agentArchetype: TEST_AGENT, sourceGameId: 'g-probe-B', sourceRound: 0, kind: 'belief', content: '我相信 @赵六 是打工人阵营的盟友, 应该保护', importance: 0.8 },
    { agentArchetype: TEST_AGENT, sourceGameId: 'g-probe-C', sourceRound: 1, kind: 'relationship', content: '@王五 对我有敌意, 跨局都在攻击我' },
  ]);
  const batchOk = batchIds.every((id) => id !== null);
  step('2. writeMemoryBatch', batchOk, `${batchIds.length} ids: ${batchIds.join(',')}`);

  // Step 3 — strong semantic match
  const r3 = await recallMemories({
    agentArchetype: TEST_AGENT,
    query: '王五 阴阳 攻击我',
    k: 3,
  });
  const top3 = r3[0];
  step('3. recall semantic match', r3.length > 0 && /王五/.test(top3.content),
    top3 ? `top: "${top3.content.slice(0, 40)}…" score=${top3.score.toFixed(3)} (rel ${top3.scoreBreakdown.relevance.toFixed(2)})` : 'no hits');

  // Step 4 — kind filter
  const r4 = await recallMemories({
    agentArchetype: TEST_AGENT,
    query: '盟友 保护',
    kind: 'belief',
    k: 5,
  });
  const allBelief = r4.length > 0 && r4.every((m) => m.kind === 'belief');
  step('4. recall kind=belief filter', allBelief, `${r4.length} entries, all belief`);

  // Step 5 — gibberish query, recency falls back
  const r5 = await recallMemories({
    agentArchetype: TEST_AGENT,
    query: 'asdfasdf qwer1234 nonsense',
    k: 1,
  });
  step('5. recall gibberish → recency-dominated',
    r5.length === 1 && r5[0].scoreBreakdown.recency > 0.95,
    r5[0] ? `top score=${r5[0].score.toFixed(3)} recency=${r5[0].scoreBreakdown.recency.toFixed(3)}` : 'no hits');

  // Step 6 — cleanup
  try {
    const { rowCount } = await getPool().query(
      `DELETE FROM memory_entries WHERE agent_archetype = $1`,
      [TEST_AGENT],
    );
    step('6. cleanup', true, `deleted ${rowCount} rows`);
  } catch (err) {
    step('6. cleanup', false, (err as Error).message);
  }

  console.log(`\n═══ ${pass} pass · ${fail} fail ═══`);
  await shutdown().catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('💥 unhandled:', err);
  await shutdown().catch(() => {});
  process.exit(1);
});
