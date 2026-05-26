/**
 * v6.30 P4 — achievements util behavior tests. Uses the same in-memory
 * Storage shim pattern as leakStats.test.ts to skip jsdom.
 */
import { describe, it, expect, beforeEach } from 'vitest';

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
(globalThis as unknown as { localStorage: Storage }).localStorage = memStore;

// Minimal CustomEvent + window shim so the dispatch in tryUnlock
// doesn't crash in node env (workspace vitest default).
class FakeCustomEvent<T> {
  type: string; detail: T;
  constructor(type: string, init: { detail: T }) {
    this.type = type; this.detail = init.detail;
  }
}
(globalThis as unknown as { CustomEvent: typeof FakeCustomEvent }).CustomEvent = FakeCustomEvent;
// Window stub — event handlers are tracked in a Map so we can fire
// dispatches into them.
const winHandlers = new Map<string, Array<(e: unknown) => void>>();
(globalThis as unknown as { window: { addEventListener: (k: string, h: (e: unknown) => void) => void; removeEventListener: (k: string, h: (e: unknown) => void) => void; dispatchEvent: (e: { type: string }) => void } }).window = {
  addEventListener: (k, h) => {
    const arr = winHandlers.get(k) ?? [];
    arr.push(h);
    winHandlers.set(k, arr);
  },
  removeEventListener: (k, h) => {
    const arr = winHandlers.get(k);
    if (arr) winHandlers.set(k, arr.filter((x) => x !== h));
  },
  dispatchEvent: (e) => {
    const arr = winHandlers.get(e.type);
    if (arr) for (const h of arr) h(e);
  },
};

import {
  ACHIEVEMENTS,
  getUnlocked,
  isUnlocked,
  tryUnlock,
  bumpProgress,
  setProgress,
  getProgress,
  refreshAuto,
  onAchievementUnlocked,
} from '../achievements';
import { recordLeakSubmit, recordLeakQuoted } from '../leakStats';

beforeEach(() => {
  memStore.clear();
  winHandlers.clear();
});

describe('achievements registry', () => {
  it('has 12 achievements', () => {
    expect(ACHIEVEMENTS).toHaveLength(12);
  });

  it('every achievement has an id, emoji, label, desc', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toBeTruthy();
      expect(a.emoji).toBeTruthy();
      expect(a.label).toBeTruthy();
      expect(a.desc).toBeTruthy();
    }
  });

  it('ids are unique', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('storage + idempotence', () => {
  it('starts empty', () => {
    expect(getUnlocked().size).toBe(0);
  });

  it('tryUnlock once returns true, subsequent calls false', () => {
    expect(tryUnlock('leak_first')).toBe(true);
    expect(tryUnlock('leak_first')).toBe(false);
    expect(isUnlocked('leak_first')).toBe(true);
  });

  it('bumpProgress accumulates', () => {
    bumpProgress('talkshow_played', 3);
    bumpProgress('talkshow_played', 2);
    expect(getProgress('talkshow_played')).toBe(5);
  });

  it('setProgress is monotonic (does not lower)', () => {
    setProgress('foo', 5);
    setProgress('foo', 3); // lower — should be ignored
    expect(getProgress('foo')).toBe(5);
  });
});

describe('check predicates + refreshAuto', () => {
  it('refreshAuto unlocks leak_first when leakStats has ≥ 1 submission', () => {
    recordLeakSubmit('hello');
    // recordLeakSubmit triggers maybeRefreshAchievements via dynamic
    // import, which is async — call refreshAuto manually to ensure
    // synchronous test verification.
    refreshAuto();
    expect(isUnlocked('leak_first')).toBe(true);
    expect(isUnlocked('leak_5')).toBe(false);
  });

  it('crossing 5-submission threshold unlocks leak_5', () => {
    for (let i = 0; i < 5; i++) recordLeakSubmit(`leak ${i}`);
    refreshAuto();
    expect(isUnlocked('leak_5')).toBe(true);
  });

  it('quote_first unlocks when a leak is quoted', () => {
    recordLeakSubmit('test');
    recordLeakQuoted('test', 'Tony');
    refreshAuto();
    expect(isUnlocked('quote_first')).toBe(true);
  });

  it('completionist locks until other 11 are unlocked', () => {
    expect(isUnlocked('completionist')).toBe(false);
    // Unlock 10 — still false
    for (let i = 0; i < 10; i++) tryUnlock(ACHIEVEMENTS[i].id);
    refreshAuto();
    expect(isUnlocked('completionist')).toBe(false);
    // Unlock 11th — now completionist should auto-unlock
    tryUnlock(ACHIEVEMENTS[10].id);
    refreshAuto();
    expect(isUnlocked('completionist')).toBe(true);
  });
});

describe('event bus', () => {
  it('onAchievementUnlocked fires for new unlocks', () => {
    const received: string[] = [];
    const unsub = onAchievementUnlocked((a) => received.push(a.id));
    tryUnlock('leak_first');
    expect(received).toEqual(['leak_first']);
    unsub();
    tryUnlock('leak_5');
    expect(received).toEqual(['leak_first']); // unsub'd; no longer receiving
  });

  it('repeated tryUnlock does not re-fire event', () => {
    const received: string[] = [];
    onAchievementUnlocked((a) => received.push(a.id));
    tryUnlock('leak_first');
    tryUnlock('leak_first');
    expect(received).toHaveLength(1);
  });
});
