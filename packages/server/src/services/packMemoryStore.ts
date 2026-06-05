/**
 * packMemoryStore — file-backed cross-game memory for 公司主题包 (v6.51 P1).
 *
 * Mirrors memoryStore.ts exactly (atomic-rename writes, lazy load, in-mem
 * cache, capped, ENOENT-tolerant) so the same boring, well-trodden patterns
 * apply. Where memoryStore is keyed by (userId, scenarioId) for fired mode,
 * this is keyed by packId — the memory belongs to the *pack* (a shared cast
 * of NPCs), not to any one watcher, so every game with that pack builds on
 * the same history and the NPCs feel like recurring coworkers.
 *
 * On disk: <repo-root>/packages/server/data/pack_memory.json
 *   Shape: { byPack: { "<packId>": PackGameMemory[] } }  // newest last
 *
 * Like the other stores: packId is not a security boundary, just a lookup
 * key. Worst case of a forged id is reading another pack's public outcomes.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackGameMemory } from './packMemoryFormat';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'pack_memory.json');

/** Keep the last N games per pack; oldest dropped on overflow. */
const MAX_GAMES_PER_PACK = 5;

interface StoreShape {
  /** packId → PackGameMemory[] (newest last) */
  byPack: Record<string, PackGameMemory[]>;
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.byPack || typeof parsed.byPack !== 'object') {
      return { byPack: {} };
    }
    return { byPack: parsed.byPack };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { byPack: {} };
    }
    console.error('[packMemoryStore] load failed, starting empty:', err);
    return { byPack: {} };
  }
}

async function ensureLoaded(): Promise<StoreShape> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = loadFromDisk().then((s) => {
      cache = s;
      return s;
    });
  }
  return loadPromise;
}

async function persist(state: StoreShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

/** This pack's game history, oldest-first. Empty array when none. Returns
 *  the live ref — DO NOT mutate. */
export async function listPackMemories(packId: string): Promise<PackGameMemory[]> {
  const s = await ensureLoaded();
  return s.byPack[packId] ?? [];
}

/** Append one finished game's memory and persist. Caps at
 *  MAX_GAMES_PER_PACK, oldest dropped on overflow. */
export async function recordPackGame(packId: string, mem: PackGameMemory): Promise<void> {
  const s = await ensureLoaded();
  if (!s.byPack[packId]) s.byPack[packId] = [];
  s.byPack[packId].push(mem);
  if (s.byPack[packId].length > MAX_GAMES_PER_PACK) {
    s.byPack[packId] = s.byPack[packId].slice(-MAX_GAMES_PER_PACK);
  }
  await persist(s);
}

/** Test-only: drop the in-memory cache so a test can re-read fresh from
 *  disk (or from a fixture it just wrote). */
export function __resetPackMemoryCacheForTests(): void {
  cache = null;
  loadPromise = null;
}
