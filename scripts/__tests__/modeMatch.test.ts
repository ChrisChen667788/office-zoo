/**
 * v6.47 P1 — solidify the capture-script mode-verification logic
 * (previously a one-off mjs proof) into real vitest coverage. Guards
 * against a classic/immersive screenshot mislabel (the v6.43 bug).
 * v6.159 — 补充大写 V6 用例:Chromium innerText 把 Tailwind uppercase badge
 * 文字返回大写「V6」,修复正则加 i 标志后这些 case 必须通过。
 * fix(lane-phaseE) — mixedBadge fixture:真正触发 forbidBadge.test() 分支的
 * 覆盖用例,原 immersivePageUpper 因 wantBadge 短路而对 /i 修复透明。
 */
import { describe, it, expect } from 'vitest';
// .mjs pure module, no Playwright — importable straight into vitest.
import { matchesMode, CLASSIC_MODE, IMMERSIVE_MODE } from '../lib/modeMatch.mjs';

const classicPage    = { bodyText: '🏢 职场杀 · v6 ROUND 1 职场撕逼', hasCanvas: true };
const immersivePage  = { bodyText: '🎬 沉浸 · v6 ROUND 1 职场撕逼', hasCanvas: false };
// v6.159 — Chromium 大写 V6 变体 (Tailwind text-transform:uppercase)
const classicPageUpper   = { bodyText: '🏢 职场杀 · V6 ROUND 1 职场撕逼', hasCanvas: true };
const immersivePageUpper = { bodyText: '🎬 沉浸 · V6 ROUND 1 职场撕逼', hasCanvas: false };
// fix(lane-phaseE) — 同时含 wantBadge 词与大写沉浸 badge 的混合页面:
// 该 fixture 让 matchesMode 真正走到 forbidBadge.test() 分支,
// 从而区分有无 /i。immersivePageUpper 因 wantBadge=/职场杀/ 短路,对 /i 修复透明。
const mixedBadgePage = { bodyText: '🏢 职场杀 · V6 沉浸 · V6 ROUND 1', hasCanvas: true };

describe('matchesMode — classic/immersive disambiguation', () => {
  it('classic page passes the CLASSIC check', () => {
    expect(matchesMode(classicPage, CLASSIC_MODE)).toBe(true);
  });

  it('immersive page FAILS the CLASSIC check (no mislabel)', () => {
    expect(matchesMode(immersivePage, CLASSIC_MODE)).toBe(false);
  });

  it('immersive page passes the IMMERSIVE check', () => {
    expect(matchesMode(immersivePage, IMMERSIVE_MODE)).toBe(true);
  });

  it('classic page FAILS the IMMERSIVE check (no mislabel)', () => {
    expect(matchesMode(classicPage, IMMERSIVE_MODE)).toBe(false);
  });

  it('classic badge but NO canvas → CLASSIC fails (pre-game guard)', () => {
    expect(matchesMode({ bodyText: '🏢 职场杀 · v6', hasCanvas: false }, CLASSIC_MODE)).toBe(false);
  });

  it('immersive badge but canvas PRESENT → IMMERSIVE fails', () => {
    // Defends against a hypothetical future immersive variant that mounts
    // a GameMap canvas — we'd want the guard to reject, not silently pass.
    expect(matchesMode({ bodyText: '🎬 沉浸 · v6', hasCanvas: true }, IMMERSIVE_MODE)).toBe(false);
  });

  it('lobby page (neither badge) fails both checks', () => {
    const lobby = { bodyText: '正在组建公司…', hasCanvas: false };
    expect(matchesMode(lobby, CLASSIC_MODE)).toBe(false);
    expect(matchesMode(lobby, IMMERSIVE_MODE)).toBe(false);
  });

  it('canonical specs are mirror images (canvas + swapped badges)', () => {
    expect(CLASSIC_MODE.wantCanvas).toBe(true);
    expect(IMMERSIVE_MODE.wantCanvas).toBe(false);
    expect(CLASSIC_MODE.wantBadge.source).toBe(IMMERSIVE_MODE.forbidBadge.source);
    expect(IMMERSIVE_MODE.wantBadge.source).toBe(CLASSIC_MODE.forbidBadge.source);
  });

  // v6.159 — 大写 V6 用例:Chromium innerText 因 CSS text-transform:uppercase
  // 返回大写,修复正则加 i 后这些 case 必须通过。
  it('[v6.159] 大写 V6 的沉浸局 bodyText 能通过 IMMERSIVE 检查', () => {
    expect(matchesMode(immersivePageUpper, IMMERSIVE_MODE)).toBe(true);
  });

  it('[v6.159] 纯沉浸页面(不含经典 badge 词)→ wantBadge 短路,CLASSIC 检查返回 false', () => {
    // immersivePageUpper.bodyText 不含「职场杀」→ wantBadge.test()=false → matchesMode 立即返回 false。
    // forbidBadge 在此路径未被调用;forbidBadge /i 修复的覆盖由下方 mixedBadgePage 用例提供。
    expect(matchesMode(immersivePageUpper, CLASSIC_MODE)).toBe(false);
  });

  it('[v6.159] 经典局 bodyText 含「职场杀 · V6」仍通过 CLASSIC 检查', () => {
    expect(matchesMode(classicPageUpper, CLASSIC_MODE)).toBe(true);
  });

  // fix(lane-phaseE) / v6.159 规格用例 #2 — 真正触发 forbidBadge.test() 的门禁用例
  // 规格描述:「大写 V6 的沉浸 badge 会被 CLASSIC 的 forbid 拦下」
  // immersivePageUpper 因 wantBadge(/职场杀/) 不匹配而在第一个条件短路,
  // 从未到达 forbidBadge 分支 → 对 /i 修复完全透明。
  // mixedBadgePage 同时含 wantBadge 词与大写「沉浸 · V6」,必须经过 forbidBadge 才能判负。
  it('[v6.159] 大写 V6 的沉浸 badge 会被 CLASSIC 的 forbid 拦下(mixedBadge 覆盖 forbidBadge /i)', () => {
    // 若去掉 /i,forbidBadge=/沉浸 · v6/ 不匹配大写 V6 → matchesMode 返回 true(误判)
    // 加 /i 后 forbidBadge=/沉浸 · v6/i 匹配大写 V6 → 正确返回 false
    expect(matchesMode(mixedBadgePage, CLASSIC_MODE)).toBe(false);
  });
});
