/**
 * v6.25 P7 — sample test (1/3) for the v7.0 testing skeleton.
 *
 * Covers lastWords.ts pure logic: pickLastWords + pickNewHire.
 * Both are deterministic on seed, so a snapshot-style assertion is
 * stable. No mocking required.
 */
import { describe, it, expect } from 'vitest';
import { pickLastWords, pickNewHire } from '../lastWords';

describe('pickLastWords', () => {
  it('returns a personality-specific line when personality is known', () => {
    const result = pickLastWords('workaholic', 1);
    // workaholic pool has 3 lines; any of them is valid.
    expect(result).toMatch(/OKR|飞书云文档|周报/);
  });

  it('falls back to GENERIC_POOL when personality is undefined', () => {
    const result = pickLastWords(undefined, 1);
    expect(result).toMatch(/拜了|回家|你们继续卷/);
  });

  it('falls back to GENERIC_POOL when personality is unknown', () => {
    const result = pickLastWords('nonexistent_personality', 1);
    expect(result).toMatch(/拜了|回家|你们继续卷/);
  });

  it('is deterministic on same (personality, seed)', () => {
    const a = pickLastWords('sycophant', 42);
    const b = pickLastWords('sycophant', 42);
    expect(a).toBe(b);
  });

  it('produces different lines across seeds within same personality', () => {
    // Try a wide seed range — at least 2 distinct lines should appear
    // (pool size 3, so 100 seeds will almost certainly hit all 3).
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(pickLastWords('sycophant', i));
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});

describe('pickNewHire', () => {
  it('picks from squad pool when activeNames given and < 90% used', () => {
    // Only 3 active out of 20 — should pick a squad rat.
    const result = pickNewHire(7, ['Tony', 'Lisa', '老赵']);
    expect(result.realName).not.toBeNull();
    // Name should be prefixed with a hire-role decoration.
    expect(result.name).toMatch(/^(实习生|应届生|外包同学|校招生|试用期|替补) /);
  });

  it('falls back to NEW_HIRE_NAMES when activeNames missing', () => {
    const result = pickNewHire(7);
    expect(result.realName).toBeNull();
    // Generic pool names contain the hire-role marker inline (e.g.
    // "实习生小郁" without a space) — assert tagline exists.
    expect(result.tagline.length).toBeGreaterThan(0);
  });

  it('does not pick an active name as the new hire', () => {
    const active = ['Tony', 'Lisa', 'Kevin', 'Amy', 'David'];
    for (let i = 0; i < 50; i++) {
      const result = pickNewHire(i, active);
      if (result.realName) {
        expect(active).not.toContain(result.realName);
      }
    }
  });

  it('is deterministic on same (seed, activeNames)', () => {
    const a = pickNewHire(99, ['Tony', 'Lisa']);
    const b = pickNewHire(99, ['Tony', 'Lisa']);
    expect(a).toEqual(b);
  });
});
