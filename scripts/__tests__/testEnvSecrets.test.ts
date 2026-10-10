/**
 * v6.165 — 测试进程绝不能拿到真实密钥,也绝不能对外发请求。
 *
 * 事故:imageGen / iconGen 顶部 `import 'dotenv/config'`,任何 import 了它们的测试(含对局与
 * Socket 测试)都把开发者本机 .env 的真实 key 读进来,一次变异测试因此真的用用户的 key 调了
 * 外部生图接口。这里锁住三件事:
 *   1. 业务模块(入口 env.ts / 独立脚本除外)不得 import dotenv——用 TS 编译器解析 import,不 grep;
 *   2. 即使导入了这些模块,密钥类环境变量在测试里仍是空串;.env.example 里每个密钥变量都在置空名单里;
 *   3. 对外 fetch 被拦截。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { BLANK_SECRETS } from '../../vitest.config';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SERVER_SRC = path.join(ROOT, 'packages/server/src');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'scripts') walk(p, out); }
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

function importedModules(file: string): string[] {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false);
  const mods: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      mods.push(n.moduleSpecifier.text);
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      mods.push(n.arguments[0].text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return mods;
}

describe('测试进程里没有真实密钥', () => {
  it('业务模块不 import dotenv(只有入口 env.ts 可以)', () => {
    const offenders = walk(SERVER_SRC)
      .filter((f) => path.basename(f) !== 'env.ts')
      .filter((f) => importedModules(f).some((m) => m === 'dotenv' || m.startsWith('dotenv/')))
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('导入曾经加载 .env 的模块之后,密钥变量仍为空', async () => {
    await import('../../packages/server/src/services/imageGen');
    await import('../../packages/server/src/services/iconGen');
    await import('../../packages/server/src/socket/socketHandler');
    for (const k of Object.keys(BLANK_SECRETS)) expect(process.env[k], k).toBe('');
  });

  it('.env.example 里每个密钥类变量都在置空名单里', () => {
    const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    const names = [...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);
    const secrets = [...new Set(names.filter((n) => /(KEY|TOKEN|SECRET)$/.test(n) || n === 'MINIMAX_GROUP_ID'))];
    expect(secrets.length).toBeGreaterThan(5);
    expect(secrets.filter((n) => !(n in BLANK_SECRETS))).toEqual([]);
  });

  it('对外 fetch 被拦截,本机回环照常放行判定', async () => {
    await expect(fetch('https://api.example.com/v1/images/generations')).rejects.toThrow(/blocked external fetch/);
    await expect(fetch('http://127.0.0.1:9/never')).rejects.not.toThrow(/blocked external fetch/);
  });
});
