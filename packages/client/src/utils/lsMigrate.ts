/**
 * lsMigrate — v6.25 P8. One-shot localStorage key migration from the
 * legacy `office-arena.*` namespace (pre-v6.7 brand) to `office-zoo.*`.
 *
 * Background: v6.7 renamed the product but intentionally left storage
 * keys alone so users wouldn't lose mute prefs, prediction stats, or
 * rules-modal dismissal flags. By v6.25 the brand is firmly OFFICE ZOO
 * and the dual-key situation is technical debt — the rest of the code
 * has already been edited to read from the new namespace, this module
 * does the one-time copy so existing users carry their state over.
 *
 * Migration is gated by `office-zoo.lsmigrated.v1 === '1'` flag — runs
 * exactly once per browser. Idempotent (re-running is a no-op).
 *
 * Strategy: walk all localStorage keys, copy any starting with
 * `office-arena.` to its `office-zoo.` equivalent IF the destination
 * doesn't already exist (don't clobber post-migration writes). Leaves
 * the old keys untouched so users who roll back keep their data.
 *
 * Called once from main.tsx before React mounts.
 */

const MIGRATION_FLAG = 'office-zoo.lsmigrated.v1';
const OLD_PREFIX = 'office-arena.';
const NEW_PREFIX = 'office-zoo.';

export function migrateLocalStorage(): { migrated: number; alreadyDone: boolean } {
  // SSR / non-browser safety. Vite SSR is unlikely here, but if anyone
  // ever uses this module from a non-DOM context, the early return
  // keeps things crash-free.
  if (typeof window === 'undefined' || !window.localStorage) {
    return { migrated: 0, alreadyDone: true };
  }
  const ls = window.localStorage;

  // Idempotency gate. The flag itself uses the new namespace so a
  // partial first run still records progress at the end (atomic at
  // the localStorage write level, fine in practice).
  if (ls.getItem(MIGRATION_FLAG) === '1') {
    return { migrated: 0, alreadyDone: true };
  }

  let migrated = 0;
  try {
    // Snapshot keys before iterating — modifying localStorage during a
    // .key(i) walk is well-defined per spec but easy to miscount.
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(OLD_PREFIX)) keys.push(k);
    }

    for (const oldKey of keys) {
      const newKey = NEW_PREFIX + oldKey.slice(OLD_PREFIX.length);
      // Don't clobber a value the user already created under the new
      // key (unlikely but possible if they used a dev build that
      // pre-shipped a new-key writer).
      if (ls.getItem(newKey) !== null) continue;
      const val = ls.getItem(oldKey);
      if (val === null) continue;
      try {
        ls.setItem(newKey, val);
        migrated += 1;
      } catch {
        // Quota exceeded or storage disabled mid-run — stop here, leave
        // the flag unset so a future run can try again on a fresh tab.
        return { migrated, alreadyDone: false };
      }
    }

    ls.setItem(MIGRATION_FLAG, '1');
  } catch {
    // Total storage failure — silently fall back. The product runs
    // without persisted prefs (mute/seen-rules will just default).
    return { migrated, alreadyDone: false };
  }

  return { migrated, alreadyDone: false };
}
