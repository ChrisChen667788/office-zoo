#!/usr/bin/env npx tsx
/**
 * regen-archetype-portraits — v6.98 CLI 补齐 archetype 二次元立绘。
 *
 * archetype-portraits/ 目录默认空(gitignored,部署时再生)。这里走
 * archetypeAvatarGen 的多供应商图链(doubao-seedream / 青云 / openai / minimax 兜底,
 * 实测 doubao 18s 出一张,不依赖卡住的 MiniMax 视频余额)生成全部立绘。
 *
 * Usage:
 *   npx tsx scripts/regen-archetype-portraits.ts              # 补缺失
 *   npx tsx scripts/regen-archetype-portraits.ts sass_master  # 指定
 *
 * 产物:packages/server/public/archetype-portraits/<id>.png(gitignored)。
 */
import 'dotenv/config';
import {
  generateArchetypePortrait,
  ARCHETYPE_IDS_WITH_ART,
} from '../packages/server/src/services/archetypeAvatarGen';

const args = process.argv.slice(2);
const explicit = args.filter((a) => !a.startsWith('-'));
const ids = explicit.length
  ? explicit.filter((id) => ARCHETYPE_IDS_WITH_ART.includes(id))
  : ARCHETYPE_IDS_WITH_ART;

if (explicit.length && ids.length === 0) {
  console.error(`无匹配 archetype。已知:${ARCHETYPE_IDS_WITH_ART.join(', ')}`);
  process.exit(1);
}

(async () => {
  console.log(`\n生成 ${ids.length} 张 archetype 二次元立绘:${ids.join(', ')}\n`);
  const t0 = Date.now();
  const results = await Promise.all(
    ids.map((id) => generateArchetypePortrait(id).then((url) => ({ id, url }))),
  );
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  let ok = 0;
  for (const r of results) {
    if (r.url) { ok++; console.log(`  ✓ ${r.id} → ${r.url}`); }
    else console.error(`  ✗ ${r.id} 失败(看上面图链日志)`);
  }
  console.log(`\n${ok}/${ids.length} 生成完毕,用时 ${dt}s`);
  if (ok < ids.length) process.exit(1);
})();
