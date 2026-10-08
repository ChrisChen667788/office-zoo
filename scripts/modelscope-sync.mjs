#!/usr/bin/env node
/**
 * v6.160 — 把当前 git HEAD 同步到 ModelScope 同名项目 haozi667788/office-zoo,并刷新模型卡。
 * 照 wind-comic 的 scripts/modelscope-sync.mjs 做法,三件每次都要按顺序做的事:
 *
 * 1. **只传 git 跟踪的内容**(git archive HEAD),不传工作目录 —— 否则 .env、node_modules、
 *    未提交草稿会一起出去。
 * 2. **文件夹上传会用仓库根 README.md 覆盖模型卡**,而 GitHub 版 README 是相对路径图片,
 *    在 ModelScope 上渲染不出来。传完立刻用 docs/modelscope-intro.md 重刷模型卡并校验。
 * 3. **不带 --sync**:它会删掉「远端有、本地无」的文件,且 ModelScope 无法找回。
 *
 * 首次运行会先建库(MIT 许可、公开);库已存在则跳过。
 *
 * 令牌只从环境变量 MODELSCOPE_API_TOKEN 读,不写盘、不打印;请在你自己的终端里运行:
 *   MODELSCOPE_API_TOKEN=<你的令牌> npm run ms:sync
 *   npm run ms:sync -- --card-only      # 只重刷模型卡
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MS_REPO, MS_RESOLVE, cardLooksClobbered, redact, tokenProblem } from './lib/modelscopeCard.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CARD_SRC = path.join(ROOT, 'docs/modelscope-intro.md');

function sh(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf-8', maxBuffer: 1 << 28, cwd: ROOT, ...opts });
  } catch (e) {
    throw new Error(redact(`${e.stdout || ''}${e.stderr || ''}${e.message}`).slice(0, 800));
  }
}

/** modelscope CLI 自带的 Python(用它的 SDK 建库,指定 MIT 许可;CLI 自动建库默认是 Apache 2.0)。 */
function modelscopePython() {
  const bin = sh('which', ['modelscope']).trim();
  const shebang = fs.readFileSync(bin, 'utf8').split('\n')[0];
  if (!shebang.startsWith('#!')) throw new Error(`读不到 ${bin} 的解释器`);
  return shebang.slice(2).trim();
}

function ensureRepo() {
  const py = modelscopePython();
  const code = [
    'import os',
    'from modelscope.hub.api import HubApi',
    'api = HubApi()',
    `repo = ${JSON.stringify(MS_REPO)}`,
    'tok = os.environ["MODELSCOPE_API_TOKEN"]',
    'if api.repo_exists(repo, repo_type="model", token=tok):',
    '    print("exists")',
    'else:',
    '    api.create_repo(repo, token=tok, repo_type="model", visibility="public", license="MIT",',
    '                    chinese_name="OFFICE ZOO 班味剧场", exist_ok=True)',
    '    print("created")',
  ].join('\n');
  return sh(py, ['-c', code]).trim().split('\n').pop();
}

function exportTracked(dest) {
  fs.mkdirSync(dest, { recursive: true });
  const tar = path.join(dest, '.export.tar');
  fs.writeFileSync(tar, execFileSync('git', ['archive', 'HEAD'], { cwd: ROOT, maxBuffer: 1 << 30 }));
  sh('tar', ['-xf', tar, '-C', dest]);
  fs.unlinkSync(tar);
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      e.isDirectory() ? walk(p) : files.push(path.relative(dest, p));
    }
  })(dest);
  return files;
}

async function main() {
  const cardOnly = process.argv.includes('--card-only');
  const bad = tokenProblem(process.env.MODELSCOPE_API_TOKEN);
  if (bad) { console.error(`[ms-sync] ${bad}`); process.exit(2); }
  process.env.MODELSCOPE_API_TOKEN = process.env.MODELSCOPE_API_TOKEN.trim();

  // 模型卡必须先是最新的(README 改了没重跑生成脚本就别传)
  sh('node', ['scripts/gen-modelscope-intro.mjs', '--check']);

  console.log(`[ms-sync] 仓库 ${MS_REPO}:${ensureRepo() === 'created' ? '已新建(MIT,公开)' : '已存在'}`);

  if (!cardOnly) {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'office-zoo-ms-'));
    try {
      const files = exportTracked(dest);
      const leaked = files.filter((f) => /(^|\/)\.env(\.|$)(?!example)/.test(f));
      if (leaked.length) throw new Error(`导出里出现环境变量文件 ${leaked.join(', ')} —— 中止`);
      console.log(`[ms-sync] 导出 ${files.length} 个 git 跟踪文件(HEAD ${sh('git', ['rev-parse', '--short', 'HEAD']).trim()})`);
      console.log('[ms-sync] 上传中(不带 --sync,不会删除远端独有文件)…');
      const out = sh('modelscope', ['upload', MS_REPO, '.', '--repo-type', 'model',
        '--commit-message', `sync ${sh('git', ['describe', '--tags', '--always']).trim()}`], { cwd: dest });
      console.log(redact(out).split('\n').filter((l) => /Existed|Uploaded|Failed|Committed|Elapsed/.test(l)).join('\n'));
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  }

  console.log('[ms-sync] 重刷模型卡(文件夹上传会用 GitHub 版 README 覆盖它)…');
  sh('modelscope', ['upload', MS_REPO, CARD_SRC, 'README.md', '--repo-type', 'model']);

  const r = await fetch(`${MS_RESOLVE}/README.md`, { headers: { 'User-Agent': 'office-zoo-sync' } });
  const card = r.ok ? await r.text() : '';
  const { rel, ms, clobbered } = cardLooksClobbered(card);
  console.log(`[ms-sync] 校验:模型卡 ${card.length} 字符 · 自托管图 ${ms} · 残留相对资源 ${rel}`);
  if (!card || clobbered) { console.error('[ms-sync] ❌ 模型卡没刷成功(取不到或仍是 GitHub 版)'); process.exit(1); }
  console.log(`[ms-sync] ✅ 完成:https://modelscope.cn/models/${MS_REPO}`);
}

main().catch((e) => { console.error('[ms-sync]', redact(e?.message || e)); process.exit(1); });
