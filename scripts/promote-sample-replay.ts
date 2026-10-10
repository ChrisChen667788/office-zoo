/**
 * v6.168 — 把本机的一局真实回放提升为「示例对局」(随仓库发布,没配 key 的访客也能看)。
 *
 * 不调用任何模型:只读本机 replays.json,脱敏后写入 packages/server/assets-pack/sample-replays/。
 * 先正常玩一局(v6.168 起回放会记录 AI 发言),再:
 *
 *   npx tsx scripts/promote-sample-replay.ts --list
 *   npx tsx scripts/promote-sample-replay.ts <gameId>          # 预览脱敏结果
 *   npx tsx scripts/promote-sample-replay.ts <gameId> --yes    # 确认写入
 *
 * 脱敏规则见 packages/server/src/services/sampleReplays.ts(去掉真人发言 / 真人场边事件,
 * 拒绝用了自定义公司主题包名字的对局)。写入前请通读预览——发布出去的是 AI 生成内容,
 * 页面会标注「AI 生成」。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReplayRecord } from '../packages/shared/src/replay';
import { DATA_DIR } from '../packages/server/src/utils/dataDir';
import { AI_NAMES } from '../packages/server/src/engine/aiNames';
import { sampleReplayDir, sanitizeForSample } from '../packages/server/src/services/sampleReplays';

const args = process.argv.slice(2);
const storeFile = path.join(DATA_DIR, 'replays.json');
if (!fs.existsSync(storeFile)) {
  console.error(`找不到 ${storeFile}(先在本机完整玩一局)`);
  process.exit(1);
}
const store = JSON.parse(fs.readFileSync(storeFile, 'utf8')) as { byId: Record<string, ReplayRecord>; order: string[] };

if (args.includes('--list') || args.length === 0) {
  console.log('gameId                      结束时间              回合  AI发言  可用');
  for (const id of [...store.order].reverse()) {
    const r = store.byId[id];
    const res = sanitizeForSample(r, AI_NAMES);
    const ai = (r.speeches ?? []).filter((s) => !s.byHuman).length;
    console.log(`${id.padEnd(27)} ${new Date(r.endedAt).toISOString().slice(0, 19)}  ${String(r.rounds).padStart(4)}  ${String(ai).padStart(6)}  ${res.ok ? '✓' : '✗ ' + res.problems[0]}`);
  }
  process.exit(0);
}

const gameId = args.find((a) => !a.startsWith('--'))!;
const rec = store.byId[gameId];
if (!rec) {
  console.error(`没有这局回放:${gameId}(用 --list 查看)`);
  process.exit(1);
}
const res = sanitizeForSample(rec, AI_NAMES);
if (!res.ok || !res.record) {
  console.error('不能作为示例对局:\n  - ' + res.problems.join('\n  - '));
  process.exit(1);
}
const out = res.record;
console.log(`→ ${out.gameId}:${out.players.length} 人 · ${out.rounds} 回合 · AI 发言 ${out.speeches?.length} 条`);
console.log(`  已去掉真人发言 ${res.dropped.humanSpeeches} 条、真人场边事件 ${res.dropped.userTextEvents} 条`);
console.log('--- 发言预览(全部)---');
for (const s of out.speeches ?? []) console.log(`  [R${s.round}] ${s.playerName}:${s.text}`);

if (!args.includes('--yes')) {
  console.log('\n预览完毕。确认内容没问题后加 --yes 写入。');
  process.exit(0);
}
fs.mkdirSync(sampleReplayDir(), { recursive: true });
const file = path.join(sampleReplayDir(), `${out.gameId}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n', 'utf8');
console.log(`✓ 已写入 ${path.relative(process.cwd(), file)}(提交后托管版首页会出现「看一局示例对局」)`);
