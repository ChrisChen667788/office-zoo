/**
 * replayStore — v6.54 — file-backed persistence of finished games for the
 * 🎬 对局回放 feature. Engines are in-memory + destroyed ~60s after game_over,
 * so without this a finished game's timeline is gone. We snapshot the final
 * roster + event timeline keyed by gameId.
 *
 * Same boring store pattern (atomic write / lazy cache / ENOENT tolerant) as
 * the rest. Capped ring buffer (oldest evicted) so the file can't grow without
 * bound — the Premium "unlimited replay storage" perk is the future per-user
 * uncapped tier (needs real auth); the free/shared store keeps the last N.
 *
 * On disk: packages/server/data/replays.json
 *   { byId: { "<gameId>": ReplayRecord }, order: ["<gameId>", …] }  // order oldest-first
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReplayRecord } from '@furball/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'replays.json');

/** Keep the most recent N games; oldest evicted on overflow. */
const MAX_REPLAYS = 50;

interface StoreShape {
  byId: Record<string, ReplayRecord>;
  /** gameIds oldest-first — the eviction queue. */
  order: string[];
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return {
      byId: parsed.byId && typeof parsed.byId === 'object' ? parsed.byId : {},
      order: Array.isArray(parsed.order) ? parsed.order : [],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { byId: {}, order: [] };
    console.error('[replayStore] load failed, starting empty:', err);
    return { byId: {}, order: [] };
  }
}

async function ensureLoaded(): Promise<StoreShape> {
  if (cache) return cache;
  if (!loadPromise) loadPromise = loadFromDisk().then((s) => (cache = s));
  return loadPromise;
}

async function persist(state: StoreShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

/** Persist one finished game. Idempotent on gameId (re-save overwrites in
 *  place without duplicating the eviction-queue entry). Evicts the oldest
 *  once over MAX_REPLAYS. */
export async function saveReplay(rec: ReplayRecord): Promise<void> {
  const s = await ensureLoaded();
  if (!s.byId[rec.gameId]) s.order.push(rec.gameId);
  s.byId[rec.gameId] = rec;
  while (s.order.length > MAX_REPLAYS) {
    const evicted = s.order.shift();
    if (evicted) delete s.byId[evicted];
  }
  await persist(s);
}

/** One replay by gameId, or null. */
export async function getReplay(gameId: string): Promise<ReplayRecord | null> {
  const s = await ensureLoaded();
  return s.byId[gameId] ?? null;
}

/** Most-recent replays, newest-first, capped at `limit`. */
export async function listRecentReplays(limit = 20): Promise<ReplayRecord[]> {
  const s = await ensureLoaded();
  return s.order
    .slice(-limit)
    .reverse()
    .map((id) => s.byId[id])
    .filter((r): r is ReplayRecord => !!r);
}

/** Test-only cache reset. */
export function __resetReplayCacheForTests(): void {
  cache = null;
  loadPromise = null;
}
