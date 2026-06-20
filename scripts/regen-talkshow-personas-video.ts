#!/usr/bin/env npx tsx
/**
 * regen-talkshow-personas-video — v6.94 CLI to (re)generate the 6 talkshow
 * 「活立绘」循环动态视频(MiniMax 海螺图生视频)。
 *
 * Usage:
 *   npx tsx scripts/regen-talkshow-personas-video.ts              # only missing
 *   npx tsx scripts/regen-talkshow-personas-video.ts --force      # regen all
 *   npx tsx scripts/regen-talkshow-personas-video.ts shaonv yujie # specific
 *
 * 读首帧:packages/server/public/talkshow-personas/<id>.png(先跑图片生成)
 * 写产物:packages/server/public/talkshow-personas-video/<id>.mp4
 * 读 key:monorepo 根 .env 的 MINIMAX_VIDEO_API_KEY(回退 MINIMAX_API_KEY)。
 *
 * 视频是异步任务且单段 1-5 分钟,这里**并发**提交+各自轮询,墙钟≈最慢一段。
 * 成本:海螺图生视频按 时长×分辨率 计费(512P/6s 较省);6 段一轮。缓存后不再重生。
 */

import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  generatePersonaVideo,
  TALKSHOW_PERSONA_VIDEO_IDS,
} from '../packages/server/src/services/talkshowVideoGen';

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const ROOT = path.resolve(__dirname2, '..');
const OUT_DIR = path.join(ROOT, 'packages/server/public/talkshow-personas-video');

const args = process.argv.slice(2);
const force = args.includes('--force');
const explicitIds = args.filter((a) => !a.startsWith('--'));

const ids = explicitIds.length > 0
  ? explicitIds.filter((id) => TALKSHOW_PERSONA_VIDEO_IDS.includes(id))
  : TALKSHOW_PERSONA_VIDEO_IDS;

if (explicitIds.length > 0 && ids.length === 0) {
  console.error(`No matching personas. Known ids: ${TALKSHOW_PERSONA_VIDEO_IDS.join(', ')}`);
  process.exit(1);
}

// 仅补缺时:跳过已存在的 mp4;--force 时全部重生。
const targets = force ? ids : ids.filter((id) => !fs.existsSync(path.join(OUT_DIR, `${id}.mp4`)));

if (targets.length === 0) {
  console.log(`✓ 所有视频已存在,无需生成(--force 可强制重生)。目录:${OUT_DIR}`);
  process.exit(0);
}

(async () => {
  console.log(`\n${force ? '强制重生' : '补齐缺失'} ${targets.length} 段活立绘视频: ${targets.join(', ')}`);
  console.log('(并发提交 + 各自轮询,单段约 1-5 分钟,请耐心等待…)\n');

  const start = Date.now();
  const results = await Promise.all(targets.map((id) => generatePersonaVideo(id)));
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  let ok = 0;
  for (const r of results) {
    if (r.ok) { ok++; console.log(`  ✓ ${r.persona} → ${r.path}`); }
    else console.error(`  ✗ ${r.persona}: ${r.reason}`);
  }
  console.log(`\n${ok}/${targets.length} 段生成完毕,用时 ${elapsed}s`);
  if (ok < targets.length) {
    console.error('⚠️ 有失败 —— 看上面原因(配额/权限/GroupId 等);客户端会自动回退静态立绘。');
    process.exit(1);
  }
  console.log(`✓ 产物在 ${OUT_DIR}`);
})();
