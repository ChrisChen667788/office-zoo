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

interface StoreShape {
  scripts: TalkshowScript[];
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
    return { scripts: parsed.scripts };
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

/** All user-generated scripts. Returns the cached array — DO NOT mutate. */
export async function listUserScripts(): Promise<TalkshowScript[]> {
  const s = await ensureLoaded();
  return s.scripts;
}

/** Find a single user script by id, or null. */
export async function findUserScript(id: string): Promise<TalkshowScript | null> {
  const s = await ensureLoaded();
  return s.scripts.find((x) => x.id === id) ?? null;
}

/** Append a new user script and persist. Caller picks the id. */
export async function addUserScript(script: TalkshowScript): Promise<void> {
  const s = await ensureLoaded();
  // Dedupe by id — last-write-wins. Editor doesn't currently support
  // edits but this keeps things sane if the same id ever recurs.
  const idx = s.scripts.findIndex((x) => x.id === script.id);
  if (idx >= 0) s.scripts[idx] = script;
  else          s.scripts.push(script);
  await persist(s);
}

/** Mint a unique id with the `bit-u-XXXXXX` namespace (the `u` distinguishes
 *  user-generated from the `bit-NNN` seed namespace, prevents collisions if
 *  we ever want to look up source by prefix). 6 random base36 chars give
 *  ~2 billion combinations — collision-free at the talkshow scale. */
export function mintUserScriptId(): string {
  const rnd = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `bit-u-${rnd}`;
}
