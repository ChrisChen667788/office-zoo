/**
 * packStore — file-backed persistence for v0.9.0 UGC challenge packs.
 *
 * A "pack" = 5 user-curated (scenario, personality) pairs bundled as a
 * chapter-style sequence. Mirrors scriptStore + scenarioStore exactly so
 * the same code patterns apply: atomic-rename writes, lazy load, in-mem
 * cache, capped size, ENOENT-tolerant.
 *
 * On disk: <repo-root>/packages/server/data/user_packs.json
 *   Shape: { packs: FiredPack[] }
 *
 * Why a separate file from user_scenarios.json — different domain object,
 * different validation, different lookup keys. Splitting keeps each store
 * boring + the JSON files easy to inspect.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FiredPack } from '@furball/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'user_packs.json');

interface StoreShape {
  packs: FiredPack[];
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.packs || !Array.isArray(parsed.packs)) {
      return { packs: [] };
    }
    // Backfill likes/plays/createdAt for any pre-versioned entries (won't
    // fire for fresh stores but keeps us robust if the format ever changes).
    const now = Date.now();
    const packs = parsed.packs.map((p, idx) => ({
      ...p,
      likes:     typeof p.likes === 'number' ? p.likes : 0,
      plays:     typeof p.plays === 'number' ? p.plays : 0,
      createdAt: typeof p.createdAt === 'number'
        ? p.createdAt
        : (now - (parsed.packs!.length - idx) * 1000),
    }));
    return { packs };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { packs: [] };
    }
    console.error('[packStore] load failed, starting empty:', err);
    return { packs: [] };
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

/** All packs. Returns the live cache — DO NOT mutate. */
export async function listPacks(): Promise<FiredPack[]> {
  const s = await ensureLoaded();
  return s.packs;
}

/** Lookup by id. */
export async function findPack(id: string): Promise<FiredPack | null> {
  const s = await ensureLoaded();
  return s.packs.find((p) => p.id === id) ?? null;
}

/** Append + persist. Stamps createdAt + likes=0 if not provided.
 *  Preserves likes on re-write of an existing id. */
export async function addPack(pack: FiredPack): Promise<void> {
  const s = await ensureLoaded();
  const stamped: FiredPack = {
    ...pack,
    likes:     pack.likes     ?? 0,
    createdAt: pack.createdAt ?? Date.now(),
  };
  const idx = s.packs.findIndex((p) => p.id === pack.id);
  if (idx >= 0) {
    stamped.likes     = s.packs[idx].likes ?? 0;
    stamped.createdBy = s.packs[idx].createdBy ?? pack.createdBy;
    s.packs[idx] = stamped;
  } else {
    s.packs.push(stamped);
  }
  await persist(s);
}

/** Bump like counter. Returns new total or null when id missing. */
export async function incrementPackLike(id: string): Promise<number | null> {
  const s = await ensureLoaded();
  const idx = s.packs.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  s.packs[idx].likes = (s.packs[idx].likes ?? 0) + 1;
  await persist(s);
  return s.packs[idx].likes!;
}

/** Floor-at-zero unlike. */
export async function decrementPackLike(id: string): Promise<number | null> {
  const s = await ensureLoaded();
  const idx = s.packs.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  s.packs[idx].likes = Math.max(0, (s.packs[idx].likes ?? 0) - 1);
  await persist(s);
  return s.packs[idx].likes!;
}

/** v0.9.2 — bump play counter (called from GET /packs/:id). Soft-fails. */
export async function incrementPackPlay(id: string): Promise<void> {
  const s = await ensureLoaded();
  const idx = s.packs.findIndex((p) => p.id === id);
  if (idx < 0) return;
  s.packs[idx].plays = (s.packs[idx].plays ?? 0) + 1;
  await persist(s);
}

/** Mint a unique id with `pack-u-XXXXXX` namespace (parallel to bit-u-…
 *  and fired-u-…). 6 random base36 chars → ~2B combinations. */
export function mintPackId(): string {
  const rnd = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `pack-u-${rnd}`;
}
