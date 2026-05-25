/**
 * v6.25 P7 — sample test (3/3). Covers lsMigrate.ts namespace migration.
 *
 * Uses an in-memory localStorage polyfill assigned to globalThis.window
 * since vitest's default jsdom isn't bundled — keeps the test stub
 * minimal so it runs in node-only mode too.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { migrateLocalStorage } from '../lsMigrate';

class MemStorage {
  store = new Map<string, string>();
  get length() { return this.store.size; }
  key(i: number) { return Array.from(this.store.keys())[i] ?? null; }
  getItem(k: string) { return this.store.get(k) ?? null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

function installLS(): MemStorage {
  const mem = new MemStorage();
  // @ts-expect-error — minimal stub to drive the migration without jsdom.
  globalThis.window = { localStorage: mem as unknown as Storage };
  return mem;
}

describe('migrateLocalStorage', () => {
  beforeEach(() => {
    // @ts-expect-error — wipe between tests
    delete globalThis.window;
  });

  it('migrates office-arena.* keys to office-zoo.* and sets flag', () => {
    const mem = installLS();
    mem.setItem('office-arena.sfx.muted', '1');
    mem.setItem('office-arena.seen-rules', '1');
    mem.setItem('unrelated.key', 'leave-alone');

    const result = migrateLocalStorage();

    expect(result.alreadyDone).toBe(false);
    expect(result.migrated).toBe(2);
    expect(mem.getItem('office-zoo.sfx.muted')).toBe('1');
    expect(mem.getItem('office-zoo.seen-rules')).toBe('1');
    expect(mem.getItem('office-zoo.lsmigrated.v1')).toBe('1');
    // Unrelated keys untouched.
    expect(mem.getItem('unrelated.key')).toBe('leave-alone');
    // Old keys preserved (safety net).
    expect(mem.getItem('office-arena.sfx.muted')).toBe('1');
  });

  it('is idempotent — second run returns alreadyDone:true', () => {
    const mem = installLS();
    mem.setItem('office-arena.sfx.muted', '1');
    migrateLocalStorage();
    const second = migrateLocalStorage();
    expect(second.alreadyDone).toBe(true);
    expect(second.migrated).toBe(0);
  });

  it("doesn't clobber a pre-existing new-namespace value", () => {
    const mem = installLS();
    mem.setItem('office-arena.sfx.muted', 'old');
    mem.setItem('office-zoo.sfx.muted', 'new');
    migrateLocalStorage();
    expect(mem.getItem('office-zoo.sfx.muted')).toBe('new');
  });

  it('handles missing window gracefully (SSR-safe)', () => {
    // No installLS() call — window is undefined.
    const result = migrateLocalStorage();
    expect(result.alreadyDone).toBe(true);
    expect(result.migrated).toBe(0);
  });
});
