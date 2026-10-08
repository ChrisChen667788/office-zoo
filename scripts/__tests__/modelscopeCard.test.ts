/**
 * v6.160 — ModelScope 模型卡转换 + 令牌预检。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  absolutize, toModelScopeCard, cardLooksClobbered, tokenProblem, redact, MS_RESOLVE, GH_BASE,
} from '../lib/modelscopeCard.mjs';

describe('absolutize', () => {
  it('assets → ModelScope 自托管,其余相对链接 → GitHub', () => {
    expect(absolutize('./assets/screenshots/01-landing.png')).toBe(`${MS_RESOLVE}/assets/screenshots/01-landing.png`);
    expect(absolutize('assets/brand/logo.png')).toBe(`${MS_RESOLVE}/assets/brand/logo.png`);
    expect(absolutize('docs/CHANGELOG.md')).toBe(`${GH_BASE}/blob/main/docs/CHANGELOG.md`);
    expect(absolutize('./docs/RELEASE_PROCESS.md')).toBe(`${GH_BASE}/blob/main/docs/RELEASE_PROCESS.md`);
    expect(absolutize('packages/miniprogram/')).toBe(`${GH_BASE}/tree/main/packages/miniprogram/`);
  });
  it('绝对地址、锚点、mailto 原样不动', () => {
    for (const ref of ['https://x.com/a.png', '//cdn/x.png', '#roadmap', 'mailto:a@b.c']) {
      expect(absolutize(ref)).toBe(ref);
    }
  });
});

describe('toModelScopeCard', () => {
  it('markdown 图片/链接、HTML src/href/srcset 全部改写', () => {
    const md = [
      '![x](./assets/a.png) [doc](docs/X.md "title") [web](https://a.b)',
      '<img src="assets/b.gif" /> <a href="LICENSE">l</a> <a href="#top">t</a>',
      '<source srcset="assets/c.png 1x, assets/c@2x.png 2x" />',
    ].join('\n');
    const card = toModelScopeCard(md);
    expect(card).toContain(`![x](${MS_RESOLVE}/assets/a.png)`);
    expect(card).toContain(`[doc](${GH_BASE}/blob/main/docs/X.md "title")`);
    expect(card).toContain('[web](https://a.b)');
    expect(card).toContain(`src="${MS_RESOLVE}/assets/b.gif"`);
    expect(card).toContain(`href="${GH_BASE}/blob/main/LICENSE"`);
    expect(card).toContain('href="#top"');
    expect(card).toContain(`srcset="${MS_RESOLVE}/assets/c.png 1x, ${MS_RESOLVE}/assets/c@2x.png 2x"`);
    expect(cardLooksClobbered(card).clobbered).toBe(false);
  });

  it('真实 README 转换后没有残留相对资源,且与提交的 docs/modelscope-intro.md 一致', () => {
    const root = path.resolve(__dirname, '../..');
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const card = toModelScopeCard(readme);
    expect(cardLooksClobbered(readme).clobbered).toBe(true);   // GitHub 版确实是相对路径
    expect(cardLooksClobbered(card)).toMatchObject({ clobbered: false, rel: 0 });
    expect(fs.readFileSync(path.join(root, 'docs/modelscope-intro.md'), 'utf8')).toBe(card);
  });
});

describe('tokenProblem / redact', () => {
  it('缺失、占位文字、√、中间空白都拦下,且提示里不含令牌', () => {
    expect(tokenProblem('')).toMatch(/缺 ModelScope 令牌/);
    expect(tokenProblem('你的令牌')).toMatch(/占位文字/);
    const cmd = 'cd ~/Downloads/furball-arena && git checkout main && MODELSCOPE_API_TOKEN=换成你的令牌 npm run ms:sync';
    expect(tokenProblem(cmd)).toMatch(/粘贴的是命令\(共 96 个字符\),不是令牌/);
    expect(tokenProblem('√ms-abc')).toMatch(/⌥V/);
    const msg = tokenProblem('ms-abc def') ?? '';
    expect(msg).toMatch(/空白/);
    expect(msg).not.toContain('ms-abc');
  });
  it('正常令牌通过(首尾空白容忍)', () => {
    expect(tokenProblem('  ms-0123456789abcdef \n')).toBeNull();
  });
  it('日志掩码', () => {
    expect(redact('https://oauth2:ms-1234567890ab@x/y fail ms-1234567890ab')).toBe('https://oauth2:***@x/y fail ms-***');
  });
});
