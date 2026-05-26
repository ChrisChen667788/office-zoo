/**
 * leakStats — v6.27 P4. Tracks the user's psy-war 爆料 命中率 in
 * localStorage so MyLeaksPanel can render submitted / quoted / hit-rate
 * % on the Profile page.
 *
 * Pure client-side: anonymous-friendly (no backend dep), survives across
 * games, never expires (user gets to brag cumulatively). Cap recent
 * history at HISTORY_CAP entries so disk doesn't bloat for power users.
 *
 * Keyed under v6.7-era `office-zoo.*` namespace (matches the v6.25 P8
 * migration). Schema versioned via `v` field for future migrations.
 */

const KEY = 'office-zoo.leaks.stats';
const HISTORY_CAP = 50;
const SCHEMA_VERSION = 1;

export interface LeakHistoryEntry {
  /** First 80 chars of the leak text (matches server slice). */
  text: string;
  /** Submission timestamp (Date.now()). */
  ts: number;
  /** Set when AI quoted this leak — undefined until quoted. */
  quotedBy?: string;
  /** Quote timestamp (Date.now()). undefined until quoted. */
  quotedAt?: number;
}

export interface LeakStats {
  v: number;
  submitted: number;
  quoted: number;
  history: LeakHistoryEntry[];
}

function emptyStats(): LeakStats {
  return { v: SCHEMA_VERSION, submitted: 0, quoted: 0, history: [] };
}

function safeRead(): LeakStats {
  if (typeof localStorage === 'undefined') return emptyStats();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as Partial<LeakStats>;
    if (!parsed || typeof parsed !== 'object') return emptyStats();
    return {
      v: parsed.v ?? SCHEMA_VERSION,
      submitted: parsed.submitted ?? 0,
      quoted: parsed.quoted ?? 0,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return emptyStats();
  }
}

function safeWrite(stats: LeakStats): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch { /* quota exhausted — silent no-op */ }
}

/** Record a freshly-submitted leak. Pushes to history + bumps submitted. */
export function recordLeakSubmit(text: string): void {
  const trimmed = (text ?? '').trim().slice(0, 80);
  if (!trimmed) return;
  const stats = safeRead();
  stats.submitted += 1;
  stats.history.push({ text: trimmed, ts: Date.now() });
  if (stats.history.length > HISTORY_CAP) stats.history.shift();
  safeWrite(stats);
  // v6.30 P4 — re-evaluate count-based achievements (leak_first / leak_5).
  void maybeRefreshAchievements();
}

/** Mark a leak as AI-quoted. Matches by trimmed prefix. If never
 *  submitted via this client (e.g. someone else's tip on another tab),
 *  still bumps quoted but no history mutation. */
export function recordLeakQuoted(text: string, byName: string): void {
  const trimmed = (text ?? '').trim().slice(0, 80);
  if (!trimmed) return;
  const stats = safeRead();
  // Find the most recent matching unquoted history entry.
  let mutated = false;
  for (let i = stats.history.length - 1; i >= 0; i--) {
    const h = stats.history[i];
    if (h.text === trimmed && !h.quotedBy) {
      h.quotedBy = byName;
      h.quotedAt = Date.now();
      mutated = true;
      break;
    }
  }
  if (mutated) {
    stats.quoted += 1;
    safeWrite(stats);
    // v6.30 P4 — re-evaluate (quote_first / quote_3).
    void maybeRefreshAchievements();
  }
}

/** v6.30 P4 — dynamic import to avoid circular dep: achievements.ts
 *  imports getLeakStats, and now leakStats wants to call refreshAuto.
 *  Lazy import + fire-and-forget keeps the dep graph linear at load
 *  time and just-in-time for runtime. */
async function maybeRefreshAchievements() {
  try {
    const mod = await import('./achievements');
    mod.refreshAuto();
  } catch { /* SSR / unit-test env without dynamic-import support */ }
}

/** Read the current snapshot — for MyLeaksPanel render. */
export function getLeakStats(): LeakStats {
  return safeRead();
}

/** Hit rate as 0-1 fraction. 0 when no submissions. */
export function hitRate(stats: LeakStats): number {
  return stats.submitted > 0 ? stats.quoted / stats.submitted : 0;
}
