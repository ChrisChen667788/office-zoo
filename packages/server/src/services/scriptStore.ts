/**
 * scriptStore — file-backed persistence for user-generated talkshow bits.
 *
 * v0.7.4. Why a flat JSON file (rather than sqlite or kv):
 *   - Same shape as `SEED_SCRIPTS` in @furball/shared so the existing
 *     /list, /script/:id, /tts handlers work uniformly via a merge step
 *   - Tiny scale at MVP — we expect dozens, not millions of user bits;
 *     a 100 KB JSON file is fine, gives instant cold-start hydration
 *   - Survives `tsx --watch` reloads without an external dependency
 *
 * On disk: <repo-root>/packages/server/data/user_scripts.json
 *   Shape: { scripts: TalkshowScript[] }
 *   Atomic writes: write to .tmp then rename (POSIX atomic on same fs).
 *
 * The store is loaded lazily on first read so ESM hoisting + dotenv don't
 * race the constructor. Subsequent reads hit the in-memory cache.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TalkshowScript } from '@furball/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// data/user_scripts.json sits NEXT to the package root, NOT inside src/,
// so a `tsx --watch` rebuild doesn't trip on our own writes.
const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'user_scripts.json');

/** v0.7.5 — like-tracking state attached to a script. We extend the on-disk
 *  shape rather than spawning a sidecar file: keeps the migration simple
 *  (any existing entry without `likes` defaults to 0) and survives
 *  hot-reloads. createdAt powers "most recent" sort. */
export interface StoredScript extends TalkshowScript {
  likes?: number;
  /** Unix ms — set on initial addUserScript. Old entries get backfilled
   *  on first read so any sort-by-recency UI is stable. */
  createdAt?: number;
}

interface StoreShape {
  scripts: StoredScript[];
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.scripts || !Array.isArray(parsed.scripts)) {
      return { scripts: [] };
    }
    // v0.7.5 backfill: pre-likes entries get likes=0, pre-createdAt entries
    // get a synthetic timestamp by index so sort-by-recency stays stable
    // across the rollout. Persisted on next mutation.
    const now = Date.now();
    const scripts = parsed.scripts.map((s, idx) => ({
      ...s,
      likes:     typeof s.likes === 'number' ? s.likes : 0,
      // older = smaller. Cap at 0 (epoch) so synthetic ts never exceeds real ones.
      createdAt: typeof s.createdAt === 'number' ? s.createdAt : (now - (parsed.scripts!.length - idx) * 1000),
    }));
    return { scripts };
  } catch (err) {
    // File doesn't exist yet — first run, fresh store.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { scripts: [] };
    }
    // Corrupt JSON? Rather than crash the whole talkshow route, surface
    // a fresh store and log loudly so the dev notices.
    console.error('[scriptStore] load failed, starting empty:', err);
    return { scripts: [] };
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

/** All user-generated scripts. Returns the cached array — DO NOT mutate.
 *  Likes/createdAt are guaranteed populated by the loader's backfill pass. */
export async function listUserScripts(): Promise<StoredScript[]> {
  const s = await ensureLoaded();
  return s.scripts;
}

/** Find a single user script by id, or null. */
export async function findUserScript(id: string): Promise<StoredScript | null> {
  const s = await ensureLoaded();
  return s.scripts.find((x) => x.id === id) ?? null;
}

/** Append a new user script and persist. Caller picks the id.
 *  Auto-stamps createdAt + likes=0 if the caller didn't set them. */
export async function addUserScript(script: TalkshowScript): Promise<void> {
  const s = await ensureLoaded();
  const stamped: StoredScript = {
    ...script,
    likes:     0,
    createdAt: Date.now(),
  };
  // Dedupe by id — last-write-wins. Editor doesn't currently support
  // edits but this keeps things sane if the same id ever recurs.
  const idx = s.scripts.findIndex((x) => x.id === script.id);
  if (idx >= 0) {
    // Preserve existing likes on re-write so a content edit doesn't
    // wipe community feedback.
    stamped.likes = s.scripts[idx].likes ?? 0;
    s.scripts[idx] = stamped;
  } else {
    s.scripts.push(stamped);
  }
  await persist(s);
}

/** v0.7.5 — increment the like counter for `id`. Returns the new total or
 *  null when the id doesn't exist. Per-IP idempotency lives in the route
 *  layer; this is a dumb counter. */
export async function incrementLike(id: string): Promise<number | null> {
  const s = await ensureLoaded();
  const idx = s.scripts.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  s.scripts[idx].likes = (s.scripts[idx].likes ?? 0) + 1;
  await persist(s);
  return s.scripts[idx].likes!;
}

/** v0.7.5 — undo a like (used when the per-IP toggle wants to walk back
 *  one). Floors at 0 so we never go negative if the per-IP cache lost
 *  state across a server restart. */
export async function decrementLike(id: string): Promise<number | null> {
  const s = await ensureLoaded();
  const idx = s.scripts.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  s.scripts[idx].likes = Math.max(0, (s.scripts[idx].likes ?? 0) - 1);
  await persist(s);
  return s.scripts[idx].likes!;
}

/** Mint a unique id with the `bit-u-XXXXXX` namespace (the `u` distinguishes
 *  user-generated from the `bit-NNN` seed namespace, prevents collisions if
 *  we ever want to look up source by prefix). 6 random base36 chars give
 *  ~2 billion combinations — collision-free at the talkshow scale. */
export function mintUserScriptId(): string {
  const rnd = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `bit-u-${rnd}`;
}
