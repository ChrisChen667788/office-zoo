/**
 * v6.47 P1 — solidify the capture-script mode-verification logic
 * (previously a one-off mjs proof) into real vitest coverage. Guards
 * against a classic/immersive screenshot mislabel (the v6.43 bug).
 */
import { describe, it, expect } from 'vitest';
// .mjs pure module, no Playwright — importable straight into vitest.
import { matchesMode, CLASSIC_MODE, IMMERSIVE_MODE } from '../lib/modeMatch.mjs';

const classicPage = { bodyText: '🏢 职场杀 · v6 ROUND 1 职场撕逼', hasCanvas: true };
const immersivePage = { bodyText: '🎬 沉浸 · v6 ROUND 1 职场撕逼', hasCanvas: false };

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
});
