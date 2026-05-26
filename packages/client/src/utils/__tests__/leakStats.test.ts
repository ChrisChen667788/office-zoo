/**
 * v6.27 P4 — leakStats pure-fn behavior. In-memory localStorage shim
 * sidesteps jsdom complexity (workspace default is 'node' env, and
 * jsdom-via-directive has been flaky across Node versions).
 */
import { describe, it, expect, beforeEach } from 'vitest';

// In-memory shim. Installed before importing leakStats so module-level
// guards (`typeof localStorage === 'undefined'`) see the polyfill.
class MemStore implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const memStore = new MemStore();
// Install on globalThis so leakStats module picks it up at import time.
(globalThis as unknown as { localStorage: Storage }).localStorage = memStore;

import {
  recordLeakSubmit,
  recordLeakQuoted,
  getLeakStats,
  hitRate,
} from '../leakStats';

beforeEach(() => {
  memStore.clear();
});

describe('leakStats', () => {
  it('starts empty', () => {
    const s = getLeakStats();
    expect(s.submitted).toBe(0);
    expect(s.quoted).toBe(0);
    expect(s.history).toHaveLength(0);
  });

  it('records submission + bumps counter + appends history', () => {
    recordLeakSubmit('@Tony 偷过我工位');
    const s = getLeakStats();
    expect(s.submitted).toBe(1);
    expect(s.quoted).toBe(0);
    expect(s.history).toHaveLength(1);
    expect(s.history[0].text).toBe('@Tony 偷过我工位');
    expect(s.history[0].quotedBy).toBeUndefined();
  });

  it('records quote + marks history entry + bumps counter', () => {
    recordLeakSubmit('@Frank 装大度');
    recordLeakQuoted('@Frank 装大度', 'Helen');
    const s = getLeakStats();
    expect(s.submitted).toBe(1);
    expect(s.quoted).toBe(1);
    expect(s.history[0].quotedBy).toBe('Helen');
    expect(s.history[0].quotedAt).toBeGreaterThan(0);
  });

  it('quote with no prior submit is a no-op (anti-spoof)', () => {
    recordLeakQuoted('phantom hint', 'Mike');
    const s = getLeakStats();
    expect(s.quoted).toBe(0);
    expect(s.history).toHaveLength(0);
  });

  it('hit rate = quoted / submitted', () => {
    recordLeakSubmit('a');
    recordLeakSubmit('b');
    recordLeakSubmit('c');
    recordLeakQuoted('a', 'X');
    recordLeakQuoted('b', 'Y');
    const s = getLeakStats();
    expect(hitRate(s)).toBeCloseTo(2 / 3, 5);
  });

  it('hit rate is 0 when nothing submitted', () => {
    expect(hitRate(getLeakStats())).toBe(0);
  });

  it('trims input to 80 chars + matches by prefix', () => {
    const longText = 'A'.repeat(200);
    recordLeakSubmit(longText);
    recordLeakQuoted(longText, 'Tony');
    const s = getLeakStats();
    expect(s.history[0].text).toHaveLength(80);
    expect(s.quoted).toBe(1);
  });

  it('history caps at 50 entries (FIFO)', () => {
    for (let i = 0; i < 60; i++) recordLeakSubmit(`leak ${i}`);
    const s = getLeakStats();
    expect(s.history).toHaveLength(50);
    // First-in dropped: oldest visible should be #10
    expect(s.history[0].text).toBe('leak 10');
    // Submitted counter is NOT capped — that's cumulative.
    expect(s.submitted).toBe(60);
  });

  it('survives corrupted localStorage gracefully', () => {
    memStore.setItem('office-zoo.leaks.stats', '{not valid json');
    const s = getLeakStats();
    expect(s.submitted).toBe(0);
    expect(s.history).toHaveLength(0);
  });

  it('only marks the most recent unquoted matching entry', () => {
    recordLeakSubmit('repeated leak');
    recordLeakSubmit('repeated leak'); // duplicate text
    recordLeakQuoted('repeated leak', 'first-quoter');
    const s = getLeakStats();
    expect(s.quoted).toBe(1);
    // Two history entries; only the LATER one is marked (LIFO scan).
    expect(s.history[0].quotedBy).toBeUndefined();
    expect(s.history[1].quotedBy).toBe('first-quoter');
  });
});
