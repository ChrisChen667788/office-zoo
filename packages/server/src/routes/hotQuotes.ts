/**
 * /api/hot-quotes — v6.33 P4 班味金句池.
 *
 * Spectator-curated weekly quote pool. Users submit a one-liner;
 * server stores in hotQuotes.json with author + ts + week key. Pool
 * is drawn from when GameEngine starts a fresh game — top-K most-
 * recent quotes get injected into leakedHints alongside any user-
 * specific PSYWAR submissions, so AI rats in the new game may quote
 * them in their discussion.
 *
 * Endpoints:
 *   POST /api/hot-quotes        body { text }, header X-User-Id
 *     Persists. Bumps the user's per-week submission count (caps at 5
 *     to prevent spam — banwei +5 per submit subject to that cap).
 *   GET  /api/hot-quotes         no auth
 *     Returns recent 50 (newest first) for the optional /hot-quotes
 *     client browse page (out of scope this round).
 *   GET  /api/hot-quotes/recent  no auth, internal helper
 *     Returns top K=20 most recent quote TEXTS only — fed into
 *     GameEngine on createPlayers(). Bounded array keeps payload small.
 *
 * Storage: data/hot_quotes.json — capped 200 entries (FIFO drop).
 */
import { Hono } from 'hono';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { isoWeekKey } from './banwei';

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'hot_quotes.json');
const TOTAL_CAP = 200;
const PER_USER_PER_WEEK_CAP = 5;
const RECENT_K = 20;

interface Entry {
  id: string;
  text: string;
  userId: string;
  weekKey: string;
  ts: number;
}

interface Store {
  entries: Entry[];
}

let cache: Store | null = null;

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    cache = JSON.parse(raw) as Store;
    if (!cache || !Array.isArray(cache.entries)) cache = { entries: [] };
  } catch { cache = { entries: [] }; }
  return cache;
}

async function save(s: Store): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

/** Exported for GameEngine.createPlayers — feeds the cross-spectator
 *  quote pool into leakedHints so AI rats may quote them. Returns up
 *  to RECENT_K texts, newest first. */
export async function getRecentHotQuoteTexts(): Promise<string[]> {
  const s = await load();
  return s.entries
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .slice(0, RECENT_K)
    .map((e) => e.text);
}

/** Exported for testing. */
export async function clearHotQuotesForTest(): Promise<void> {
  cache = { entries: [] };
  try { await fs.unlink(DATA_FILE); } catch { /* noop */ }
}

export const hotQuotesRoutes = new Hono();

hotQuotesRoutes.post('/', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ error: 'X-User-Id required' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const raw = String(body?.text ?? '').trim();
  if (!raw || raw.length > 80) {
    return c.json({ error: 'text required (1-80 chars after trim)' }, 400);
  }

  const weekKey = isoWeekKey();
  const store = await load();
  // Per-user per-week submission cap
  const userThisWeek = store.entries.filter((e) => e.userId === userId && e.weekKey === weekKey).length;
  if (userThisWeek >= PER_USER_PER_WEEK_CAP) {
    return c.json({
      error: 'per-user weekly cap reached',
      cap: PER_USER_PER_WEEK_CAP,
      thisWeek: userThisWeek,
    }, 429);
  }

  const entry: Entry = {
    id: `hq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text: raw,
    userId,
    weekKey,
    ts: Date.now(),
  };
  store.entries.push(entry);
  if (store.entries.length > TOTAL_CAP) {
    store.entries = store.entries.slice(-TOTAL_CAP);
  }
  await save(store);
  return c.json({ accepted: true, entry, userThisWeek: userThisWeek + 1, cap: PER_USER_PER_WEEK_CAP });
});

hotQuotesRoutes.get('/', async (c) => {
  const s = await load();
  const recent = s.entries
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 50)
    .map((e) => ({ id: e.id, text: e.text, weekKey: e.weekKey, ts: e.ts }));
  return c.json({ entries: recent });
});

hotQuotesRoutes.get('/recent', async (c) => {
  const texts = await getRecentHotQuoteTexts();
  return c.json({ texts });
});
