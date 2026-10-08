#!/usr/bin/env node
/**
 * v6.160 — 从 README.md 生成 ModelScope 模型卡 docs/modelscope-intro.md。
 *
 * 规则见 scripts/lib/modelscopeCard.mjs。改了 README.md 后重跑并把生成文件一起提交,
 * 否则 ModelScope 上的模型卡会和 GitHub 主页漂移。
 *
 * Run: npm run gen:modelscope-intro
 *      node scripts/gen-modelscope-intro.mjs --check   # 只校验是否已是最新(不写盘,过期则退出码 1)
 */
import fs from 'node:fs';
import path from 'node:path';
import { toModelScopeCard, cardLooksClobbered } from './lib/modelscopeCard.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'README.md');
const OUT = path.join(ROOT, 'docs/modelscope-intro.md');

const card = toModelScopeCard(fs.readFileSync(SRC, 'utf8'));
const { rel, ms } = cardLooksClobbered(card);
if (rel > 0) {
  console.error(`✕ 生成结果里仍有 ${rel} 处相对路径资源引用 —— 转换规则漏了某种写法`);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== card) {
    console.error('✕ docs/modelscope-intro.md 不是最新,请跑 npm run gen:modelscope-intro 后提交');
    process.exit(1);
  }
  console.log('✓ docs/modelscope-intro.md 已是最新');
} else {
  fs.writeFileSync(OUT, card);
  console.log(`✓ docs/modelscope-intro.md(${card.length} 字符,ModelScope 自托管图 ${ms} 处,相对资源引用 0)`);
}
