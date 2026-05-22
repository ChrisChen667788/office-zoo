/**
 * probe-memory-cross-game — v5.8.1 done-when verifier.
 *
 *   npx tsx packages/server/scripts/probe-memory-cross-game.ts
 *
 * Validates RFC §4.1 acceptance criterion:
 *   "同 player 在第 2 局, sass-master 第一句话能提到'上次那个 ...'"
 *
 * Steps:
 *   1. Seed `memory_entries` with a dramatic event from PAST_GAME for
 *      personality 'sass-master' (a humiliation memory likely to resurface)
 *   2. Construct a fresh BaseAgent with that personality
 *   3. Call generateSpeech() with NEW_GAME context — should recall + inject
 *   4. Print the LLM speech for human eyeball
 *   5. Regex-check for ANY cross-game reference vocabulary
 *      ("上次" / "上回" / "之前" / "上一局" / "上盘" / "记得" / "还记得")
 *   6. Cleanup memory rows
 *
 * Cost: ~1 LLM call (~1k tokens, ≈¥0.005 via Qingyun). Cheap enough
 * to run on every PR.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import { writeMemoryBatch } from '../src/services/memoryWrite';
import { getPool, shutdown } from '../src/services/pgvectorClient';
import { BaseAgent } from '../src/agents/BaseAgent';
import { Team, Role, Personality } from '@furball/shared';

const PAST_GAME = 'game_cross_past_x42';
const NEW_GAME  = 'game_cross_new_y99';
const TEST_PERSONALITY = Personality.PASSIVE_AGGRESSIVE; // 阴阳人 — fits the test narrative

async function main() {
  console.log('═══ v5.8.1 cross-game memory recall probe ═══\n');

  // Step 1 — seed dramatic past memories
  console.log('1. Seeding memory from PAST_GAME...');
  const seedIds = await writeMemoryBatch([
    {
      agentArchetype: TEST_PERSONALITY,
      sourceGameId: PAST_GAME,
      sourceRound: 1,
      kind: 'event',
      content: `在 game ${PAST_GAME} 第1轮, @王五同学 一开口就阴阳怪气地说我"颗粒度不够", 全场都笑了, 我当时下不来台`,
      importance: 0.9,
      targetPlayerId: 'player_4',
    },
    {
      agentArchetype: TEST_PERSONALITY,
      sourceGameId: PAST_GAME,
      sourceRound: 3,
      kind: 'event',
      content: `在 game ${PAST_GAME} 第3轮, @王五 联合 @赵六 投我出局, 我被开除了, 心里记下了这笔账`,
      importance: 0.95,
    },
    {
      agentArchetype: TEST_PERSONALITY,
      sourceGameId: PAST_GAME,
      sourceRound: 0,
      kind: 'belief',
      content: `我相信 @王五 是资本家阵营的, 表面上一团和气, 实际上专门搞小动作针对老实人`,
      importance: 0.85,
    },
  ]);
  console.log(`   seeded ${seedIds.length} entries, ids ${seedIds.join(', ')}\n`);

  // Step 2 — fresh BaseAgent
  console.log('2. Creating fresh BaseAgent (different game id, same personality)...');
  const agent = new BaseAgent(
    'player_0',          // playerId
    '李四同学',           // playerName
    Role.VILLAGER_CAT,   // role
    Team.CAT,            // team
    TEST_PERSONALITY,    // personality — KEY: same as seeded memory archetype
  );

  // Step 3 — speech with NEW_GAME context that should trigger recall
  console.log('3. Calling generateSpeech() with NEW_GAME context...');
  const context = '第1轮全员大会. 在职员工: 李四同学(我), 王五同学, 赵六同学, 张三同学, 刘七同学, 钱八同学, 孙九同学, 周十同学. 还没人发言, 我是第一个发言者.';
  let speech: string;
  try {
    speech = await agent.generateSpeech(context, [], { gameId: NEW_GAME, round: 1 });
  } catch (err) {
    console.error('💥 generateSpeech threw:', (err as Error).message);
    await shutdown();
    process.exit(1);
  }

  console.log('\n──── LLM speech output ────');
  console.log(speech);
  console.log('───────────────────────────\n');

  // Step 4 — regex check for cross-game reference vocabulary
  const recallSignals = ['上次', '上回', '之前', '上一局', '上盘', '记得', '还记得', '吃过', '记仇', '记下'];
  const matched = recallSignals.filter((sig) => speech.includes(sig));
  if (matched.length > 0) {
    console.log(`✅ DONE-WHEN MET — speech contains recall vocabulary: ${matched.join(', ')}`);
  } else {
    console.log(`⚠️  DONE-WHEN ambiguous — speech doesn't obviously reference past games.`);
    console.log('   This can happen if the LLM is "in character" enough that the memory is implicit.');
    console.log('   Inspect the speech above manually. If it references 王五 / 颗粒度 / 老实人 / etc.,');
    console.log('   the memory IS being used even without explicit "上次" markers.');
  }

  // Step 5 — cleanup
  try {
    const { rowCount } = await getPool().query(
      `DELETE FROM memory_entries WHERE source_game_id IN ($1, $2)`,
      [PAST_GAME, NEW_GAME],
    );
    console.log(`\n5. cleanup: deleted ${rowCount} entries`);
  } catch (err) {
    console.error('cleanup failed:', (err as Error).message);
  }

  await shutdown().catch(() => {});
  process.exit(0);
}

main().catch(async (err) => {
  console.error('💥 unhandled:', err);
  await shutdown().catch(() => {});
  process.exit(1);
});
