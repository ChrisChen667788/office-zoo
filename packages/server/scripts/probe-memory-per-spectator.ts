/**
 * probe-memory-per-spectator — v5.8.2 chunky-style verification.
 *
 *   npx tsx packages/server/scripts/probe-memory-per-spectator.ts
 *
 * Validates that memory writes/recalls scoped by target_user_id stay
 * isolated between spectators. Steps:
 *   1. Seed memory for sass-master tagged with spectator-A in game_X
 *   2. Seed DIFFERENT memory for sass-master tagged with spectator-B
 *      in the same game_X (simulating two people watching different
 *      AIs in different games)
 *   3. Recall as spectator-A → should ONLY see A's memories
 *   4. Recall as spectator-B → should ONLY see B's memories
 *   5. Recall without targetUserId → should see BOTH (global view)
 *   6. UAT forget with targetUserId → only A's memories dropped, B's intact
 *   7. cleanup
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

let pass = 0, fail = 0;
function step(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++; else fail++;
}

const ARCHE = 'sass-master-pspec';
const USER_A = 'spectator-alice-v582';
const USER_B = 'spectator-bob-v582';

async function main() {
  console.log('═══ v5.8.2 per-spectator scoping probe ═══\n');

  // Step 1+2 — seed A and B memories
  await writeMemoryBatch([
    {
      agentArchetype: ARCHE, targetUserId: USER_A,
      sourceGameId: 'game_X1', sourceRound: 2, kind: 'event',
      content: 'Alice 救过我一票, 是我的盟友',
      importance: 0.8,
    },
    {
      agentArchetype: ARCHE, targetUserId: USER_A,
      sourceGameId: 'game_X1', sourceRound: 3, kind: 'event',
      content: 'Alice 帮我反驳了王五的阴阳',
      importance: 0.7,
    },
    {
      agentArchetype: ARCHE, targetUserId: USER_B,
      sourceGameId: 'game_Y1', sourceRound: 2, kind: 'event',
      content: 'Bob 在第一轮就投我出局, 完全没救',
      importance: 0.9,
    },
    {
      agentArchetype: ARCHE, targetUserId: USER_B,
      sourceGameId: 'game_Y1', sourceRound: 1, kind: 'event',
      content: 'Bob 联合赵六针对我, 真是不讲武德',
      importance: 0.85,
    },
  ]);
  step('1+2. seed A & B memories', true, '4 entries (2 per spectator)');

  // Step 3 — recall as A only sees A's events
  const rA = await recallMemories({
    agentArchetype: ARCHE, targetUserId: USER_A,
    query: '盟友 救票', k: 5,
  });
  const allFromA = rA.every((m) => /Alice/.test(m.content));
  step('3. recall scope=A only sees A', allFromA && rA.length === 2,
    `${rA.length} hits, contents: ${rA.map(m => m.content.slice(0, 12)).join(' / ')}`);

  // Step 4 — recall as B only sees B's events
  const rB = await recallMemories({
    agentArchetype: ARCHE, targetUserId: USER_B,
    query: '盟友 救票', k: 5,
  });
  const allFromB = rB.every((m) => /Bob/.test(m.content));
  step('4. recall scope=B only sees B', allFromB && rB.length === 2,
    `${rB.length} hits, contents: ${rB.map(m => m.content.slice(0, 12)).join(' / ')}`);

  // Step 5 — recall WITHOUT targetUserId sees both
  const rAll = await recallMemories({
    agentArchetype: ARCHE,
    query: '盟友 救票 投我', k: 10,
  });
  step('5. recall scope=null sees both', rAll.length === 4,
    `${rAll.length} hits (expected 4)`);

  // Step 6 — UAT forget scoped to A only
  const resp = await fetch('http://localhost:3100/api/memory/forget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId: USER_A, archetype: ARCHE }),
  });
  const json = await resp.json() as { deleted?: number };
  step('6a. forget(A) deleted only A', json.deleted === 2,
    `deleted=${json.deleted} (expected 2)`);

  const rAAfter = await recallMemories({ agentArchetype: ARCHE, targetUserId: USER_A, query: 'test', k: 5 });
  const rBAfter = await recallMemories({ agentArchetype: ARCHE, targetUserId: USER_B, query: 'test', k: 5 });
  step('6b. after forget(A): A empty', rAAfter.length === 0, `A has ${rAAfter.length} (expected 0)`);
  step('6c. after forget(A): B intact', rBAfter.length === 2, `B has ${rBAfter.length} (expected 2)`);

  // Step 7 — cleanup
  await getPool().query(`DELETE FROM memory_entries WHERE agent_archetype = $1`, [ARCHE]);
  step('7. cleanup', true);

  console.log(`\n═══ ${pass} pass · ${fail} fail ═══`);
  await shutdown();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('💥', err);
  await shutdown().catch(() => {});
  process.exit(1);
});
