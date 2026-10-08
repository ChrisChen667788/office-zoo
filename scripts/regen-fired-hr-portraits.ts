#!/usr/bin/env npx tsx
/**
 * regen-fired-hr-portraits — v6.99 生成「裁了么 黑心 HR 反派」立绘(菜鸟/老油条/魔鬼)。
 *
 * Usage:
 *   npx tsx scripts/regen-fired-hr-portraits.ts          # 补缺失
 *   npx tsx scripts/regen-fired-hr-portraits.ts demon    # 指定
 *
 * 产物:packages/server/public/fired-hr-portraits/<id>.png(gitignored,部署时再生)。
 */
import 'dotenv/config';
import { generateFiredHrPortrait, FIRED_HR_IDS } from '../packages/server/src/services/firedHrPortraitGen';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const ids = args.length ? args.filter((id) => FIRED_HR_IDS.includes(id)) : FIRED_HR_IDS;
if (args.length && ids.length === 0) {
  console.error(`无匹配 HR。已知:${FIRED_HR_IDS.join(', ')}`);
  process.exit(1);
}

(async () => {
  console.log(`\n生成 ${ids.length} 张 HR 反派立绘:${ids.join(', ')}\n`);
  const t0 = Date.now();
  const results = await Promise.all(ids.map((id) => generateFiredHrPortrait(id).then((url) => ({ id, url }))));
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  let ok = 0;
  for (const r of results) {
    if (r.url) { ok++; console.log(`  ✓ ${r.id} → ${r.url}`); }
    else console.error(`  ✗ ${r.id} 失败`);
  }
  console.log(`\n${ok}/${ids.length} 生成完毕,用时 ${dt}s`);
  if (ok < ids.length) process.exit(1);
})();
