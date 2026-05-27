/**
 * /api/banwei — v6.32 P5 班味指数 (Workplace Vibe Index).
 *
 * Personalized weekly "你这周有多班味" score, 0-100. Synthesized from
 * counters the rest of the app already feeds (no new client wiring):
 *
 *   leaks      — PSYWAR 战术 @ 投递数 (server stats)
 *   leakQuotes — AI 引用条数 (server stats)
 *   gamesSeen  — Classic 完成局数 (client localStorage; passed via body)
 *   talkshow   — Talkshow 段子听完数 (client localStorage; passed via body)
 *
 * Score formula: weighted sum, capped at 100. Each axis caps at its own
 * "you're a regular" bar so a single power user can't dominate.
 *
 * GET /api/banwei?week=YYYY-Www
 *   Read-only: returns score + breakdown + week-over-week delta. Week
 *   default: current ISO week. Storage backing the WoW delta lives in
 *   `banwei.json` on disk, keyed by (userId, weekKey).
 *
 * POST /api/banwei
 *   Body { gamesSeen, talkshowPlayed, anniversaryVisited } —
 *   client-tracked counters fed to the score calc. Server merges with
 *   its own (leaks/leakQuotes) tallies + persists for WoW comparison.
 */
import { Hono } from 'hono';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'banwei.json');

interface Snapshot {
  weekKey: string;
  leaks: number;
  leakQuotes: number;
  gamesSeen: number;
  talkshowPlayed: number;
  anniversaryVisited: number;
  score: number;
  takenAt: number;
}

interface Store {
  // keyed by userId, then list of week snapshots (capped 12 recent)
  byUser: Record<string, Snapshot[]>;
}

let cache: Store | null = null;

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    cache = JSON.parse(raw) as Store;
    if (!cache || typeof cache.byUser !== 'object') cache = { byUser: {} };
  } catch { cache = { byUser: {} }; }
  return cache;
}

async function save(s: Store): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(s, null, 2), 'utf8');
}

/** ISO week key — e.g. "2026-W21". Sunday-rollover but close enough
 *  for spectator analytics; nobody quizzes us on calendar precision. */
export function isoWeekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Score formula. Each axis caps at its bar so power users top out at
 *  100 without dominating any single dim. Weights tuned for a "weekly
 *  regular" to land near 70, a "first session" near 20. */
export function computeScore(s: Omit<Snapshot, 'score' | 'takenAt' | 'weekKey'>): number {
  const leak       = Math.min(s.leaks, 10) * 3;          // cap 30
  const leakQuote  = Math.min(s.leakQuotes, 5) * 6;      // cap 30
  const games      = Math.min(s.gamesSeen, 5) * 4;       // cap 20
  const talkshow   = Math.min(s.talkshowPlayed, 5) * 2;  // cap 10
  const anniv      = Math.min(s.anniversaryVisited, 1) * 10; // cap 10
  return Math.min(100, leak + leakQuote + games + talkshow + anniv);
}

export const banweiRoutes = new Hono();

// Hook into v6.31 P5 server stats to read leaks/leakQuotes per user
// without importing the module cyclically.
import { getPerUserLeaks, getPerUserLeakQuotes } from './stats';

banweiRoutes.post('/', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ error: 'X-User-Id required' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const gamesSeen = clampInt(body?.gamesSeen);
  const talkshowPlayed = clampInt(body?.talkshowPlayed);
  const anniversaryVisited = clampInt(body?.anniversaryVisited, 0, 1);

  const leaks = getPerUserLeaks(userId);
  const leakQuotes = getPerUserLeakQuotes(userId);
  const partial = { leaks, leakQuotes, gamesSeen, talkshowPlayed, anniversaryVisited };
  const score = computeScore(partial);

  const weekKey = isoWeekKey();
  const store = await load();
  const arr = store.byUser[userId] ?? [];
  // Upsert THIS week's entry
  const idx = arr.findIndex((s) => s.weekKey === weekKey);
  const snap: Snapshot = { weekKey, ...partial, score, takenAt: Date.now() };
  if (idx >= 0) arr[idx] = snap;
  else arr.push(snap);
  // Cap recent 12 weeks
  if (arr.length > 12) arr.splice(0, arr.length - 12);
  store.byUser[userId] = arr;
  await save(store);

  // Prior week for WoW delta
  const prior = findPriorWeek(arr, weekKey);
  const delta = prior ? score - prior.score : null;

  return c.json({ thisWeek: snap, prior, delta });
});

banweiRoutes.get('/', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ error: 'X-User-Id required' }, 400);
  const wantWeek = c.req.query('week') ?? isoWeekKey();
  const store = await load();
  const arr = store.byUser[userId] ?? [];
  const thisWeek = arr.find((s) => s.weekKey === wantWeek) ?? null;
  const prior = findPriorWeek(arr, wantWeek);
  const delta = thisWeek && prior ? thisWeek.score - prior.score : null;
  return c.json({ thisWeek, prior, delta, history: arr });
});

function clampInt(v: unknown, min = 0, max = 999): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function findPriorWeek(arr: Snapshot[], wantWeek: string): Snapshot | null {
  // Returns the most recent snapshot whose weekKey is strictly less
  // than wantWeek by ISO lexicographic order (works for YYYY-Www).
  let best: Snapshot | null = null;
  for (const s of arr) {
    if (s.weekKey < wantWeek && (!best || s.weekKey > best.weekKey)) best = s;
  }
  return best;
}
