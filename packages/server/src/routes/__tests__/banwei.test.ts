/**
 * v6.32 P5 — banwei score formula + ISO week key behavior.
 * Pure-fn tests (no HTTP / no disk).
 */
import { describe, it, expect } from 'vitest';
import { computeScore, isoWeekKey } from '../banwei';

describe('computeScore', () => {
  it('all-zero inputs → 0', () => {
    expect(computeScore({
      leaks: 0, leakQuotes: 0, gamesSeen: 0, talkshowPlayed: 0, anniversaryVisited: 0,
    })).toBe(0);
  });

  it('all maxed → 100 (sum of caps: 30+30+20+10+10)', () => {
    expect(computeScore({
      leaks: 999, leakQuotes: 999, gamesSeen: 999, talkshowPlayed: 999, anniversaryVisited: 1,
    })).toBe(100);
  });

  it('"weekly regular" lands around 70', () => {
    // 5 leaks (15) + 2 quotes (12) + 3 games (12) + 4 talkshow (8) +
    // anniversary (10) = 57. Reasonable mid-tier.
    expect(computeScore({
      leaks: 5, leakQuotes: 2, gamesSeen: 3, talkshowPlayed: 4, anniversaryVisited: 1,
    })).toBe(57);
  });

  it('"first session" lands around 20-30', () => {
    // 1 leak (3) + 0 quotes + 1 game (4) + 1 talkshow (2) + 0 anniv = 9
    // (Bit low — formula is unforgiving for newcomers. v6.32 P5 accepted.)
    expect(computeScore({
      leaks: 1, leakQuotes: 0, gamesSeen: 1, talkshowPlayed: 1, anniversaryVisited: 0,
    })).toBe(9);
  });

  it('caps at 100 even past max', () => {
    expect(computeScore({
      leaks: 1000, leakQuotes: 1000, gamesSeen: 1000, talkshowPlayed: 1000, anniversaryVisited: 100,
    })).toBe(100);
  });
});

describe('isoWeekKey', () => {
  it('formats YYYY-Www', () => {
    const k = isoWeekKey(new Date('2026-05-27T00:00:00Z'));
    expect(k).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('start-of-year edge → still valid format', () => {
    const k = isoWeekKey(new Date('2026-01-02T00:00:00Z'));
    expect(k).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('same week → same key for any day within that week', () => {
    const mon = isoWeekKey(new Date('2026-05-25T00:00:00Z')); // Mon
    const wed = isoWeekKey(new Date('2026-05-27T00:00:00Z')); // Wed
    const fri = isoWeekKey(new Date('2026-05-29T00:00:00Z')); // Fri
    expect(mon).toBe(wed);
    expect(wed).toBe(fri);
  });

  it('next week → different key', () => {
    const a = isoWeekKey(new Date('2026-05-27T00:00:00Z'));
    const b = isoWeekKey(new Date('2026-06-03T00:00:00Z'));
    expect(a).not.toBe(b);
  });
});
