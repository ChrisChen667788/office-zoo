/**
 * v6.82 — mpShell 纯函数回归(web-view 壳页原生兜底判定 + 公司包头像条裁剪)。
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { shouldUseWebview, avatarStrip } = require('../utils/mpShell.js') as {
  shouldUseWebview: (webBase: unknown) => boolean;
  avatarStrip: (npcs: unknown, max?: number) => { emojis: string[]; more: number };
};

describe('shouldUseWebview', () => {
  it('example.com 占位符 → false(部署前不渲染白屏 web-view)', () => {
    expect(shouldUseWebview('https://office-zoo-web.example.com')).toBe(false);
  });
  it('真 https 域名 → true', () => {
    expect(shouldUseWebview('https://zoo.mycorp.cn')).toBe(true);
  });
  it('http / 空 / 非串 → false(小程序 web-view 只认 https)', () => {
    expect(shouldUseWebview('http://zoo.mycorp.cn')).toBe(false);
    expect(shouldUseWebview('')).toBe(false);
    expect(shouldUseWebview(undefined)).toBe(false);
  });
});

describe('avatarStrip', () => {
  const npc = (avatar?: string) => (avatar ? { name: 'x', avatar } : { name: 'x' });
  it('取 emoji,没设 avatar 回退 🐀', () => {
    const { emojis, more } = avatarStrip([npc('🦊'), npc(), npc('🐼')]);
    expect(emojis).toEqual(['🦊', '🐀', '🐼']);
    expect(more).toBe(0);
  });
  it('超过 max 折叠成 more', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => npc(i % 2 ? '🐱' : undefined));
    const { emojis, more } = avatarStrip(twelve, 8);
    expect(emojis).toHaveLength(8);
    expect(more).toBe(4);
  });
  it('非数组 / 空数组安全', () => {
    expect(avatarStrip(null)).toEqual({ emojis: [], more: 0 });
    expect(avatarStrip([])).toEqual({ emojis: [], more: 0 });
  });
});
