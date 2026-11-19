/**
 * v6.160 — ModelScope 模型卡转换 + 令牌预检。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  absolutize, toModelScopeCard, cardLooksClobbered, tokenProblem, redact, applyTokenKeystrokes, MS_RESOLVE, GH_BASE,
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

/**
 * 粘贴标记被拆在两块里送来,令牌就进不去(同款脚本在 wind-comic 10-28 实测):
 * Claude 桌面版的终端面板里粘贴令牌,报「第 1 个字符不是可打印 ASCII(共 45 个字符)」。
 * 令牌 39 个字符,多出的 6 个正是开头标记 `ESC[200~` —— ESC 单独一块、`[200~令牌…` 是下一块,
 * 只在单块里剥标记,两块各自凑不成完整标记,于是原样拼进了令牌。令牌本身没错。
 */
describe('applyTokenKeystrokes · 粘贴标记跨块', () => {
  // 39 个字符、形如真令牌的占位串(全 0,不是真令牌)
  const DUMMY = `ms-${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}`;
  const S = '\x1b[200~';
  const E = '\x1b[201~';

  /** 按块喂给按键处理,返回回车 / 放弃那一刻的结果;都没发生就返回 null */
  function feed(chunks: string[]) {
    let buf = '';
    for (const c of chunks) {
      const r = applyTokenKeystrokes(buf, c);
      if (r.abort) return { abort: true, buf: r.buf };
      buf = r.buf;
      if (r.done) return { abort: false, buf };
    }
    return null;
  }

  it.each([
    ['ESC 单独一块(实测形态)', ['\x1b', `[200~${DUMMY}${E}`, '\r']],
    ['逐字节送达', [...`${S}${DUMMY}${E}\r`]],
    ['开头标记拆成三段', ['\x1b[', '20', `0~${DUMMY}${E}\r`]],
    ['结束标记被拆开', [`${S}${DUMMY}\x1b`, '[201~', '\r']],
    ['粘贴内容自带回车,结束标记还没到', ['\x1b', `[200~${DUMMY}\r${E}`]],
  ])('%s → 得到原令牌并通过预检', (_name, chunks) => {
    const r = feed(chunks as string[]);
    expect(r).toMatchObject({ abort: false, buf: DUMMY });
    expect(tokenProblem(r!.buf)).toBeNull();
  });

  it('正常侧不变:整块粘贴、手敲、退格、Ctrl-C / Ctrl-D 放弃', () => {
    expect(feed([`${S}${DUMMY}${E}\r`])).toMatchObject({ abort: false, buf: DUMMY });
    expect(feed([DUMMY, '\r'])).toMatchObject({ abort: false, buf: DUMMY });
    expect(feed(['ms-ab', 'x\u007fc\n'])).toMatchObject({ abort: false, buf: 'ms-abc' });
    expect(feed(['ms-a', '\u0003'])).toMatchObject({ abort: true });
    // raw 模式下 Ctrl-D 不是 EOF,而是一个 0x04 字节 —— 不当放弃处理就会被悄悄拼进令牌
    expect(feed(['ms-a', '\u0004'])).toMatchObject({ abort: true });
  });

  it('漏网的 ESC 给出能照做的提示,而且不回显令牌', () => {
    const msg = tokenProblem(`${S}${DUMMY}`) ?? '';
    expect(msg).toMatch(/第 1 个字符不是可打印 ASCII\(共 45 个字符\)/);
    expect(msg).toMatch(/控制符.*令牌本身没错.*重新粘贴/);
    expect(msg).not.toContain(DUMMY);
  });
});
