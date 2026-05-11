/**
 * scenarioStore — file-backed persistence for user-generated 裁了么 scenarios.
 *
 * v0.8.0. Mirrors `scriptStore.ts`'s shape exactly so the same playbook
 * applies: atomic-rename writes, lazy load on first read, in-memory cache,
 * graceful empty-store on missing file.
 *
 * Why not a single shared store? Different domain objects (talkshow bits
 * vs HR scenarios), different validation paths, different lookup keys.
 * Splitting keeps each concern small + the JSON files easy to inspect.
 *
 * On disk: <repo-root>/packages/server/data/user_scenarios.json
 *   Shape: { scenarios: StoredScenario[] }
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FiredScenario } from '@furball/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'user_scenarios.json');

/** v0.8.0 — like-tracking + recency for the scenario, parallel to
 *  scriptStore.StoredScript. v0.8.1 adds `createdBy` (a pseudonymous
 *  per-browser id stored in localStorage) so users can filter to "我的
 *  创作". */
export interface StoredScenario extends FiredScenario {
  likes?: number;
  /** Unix ms — set on initial addUserScenario. */
  createdAt?: number;
  /** v0.8.1 — pseudonymous user id from the X-User-Id header. NOT a
   *  cryptographic identity; just a uuid the client stashes in
   *  localStorage on first visit. Powers the "我的创作" filter. */
  createdBy?: string;
  /** v0.9.2 — total chat sessions opened on this scenario. Drives
   *  monthly leaderboard alongside likes. */
  plays?: number;
}

interface StoreShape {
  scenarios: StoredScenario[];
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.scenarios || !Array.isArray(parsed.scenarios)) {
      return { scenarios: [] };
    }
    const now = Date.now();
    const scenarios = parsed.scenarios.map((s, idx) => ({
      ...s,
      likes:     typeof s.likes === 'number' ? s.likes : 0,
      plays:     typeof s.plays === 'number' ? s.plays : 0,
      createdAt: typeof s.createdAt === 'number'
        ? s.createdAt
        : (now - (parsed.scenarios!.length - idx) * 1000),
    }));
    return { scenarios };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { scenarios: [] };
    }
    console.error('[scenarioStore] load failed, starting empty:', err);
    return { scenarios: [] };
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

/** All user-generated scenarios. DO NOT mutate the returned array. */
export async function listUserScenarios(): Promise<StoredScenario[]> {
  const s = await ensureLoaded();
  return s.scenarios;
}

/** Find a single user scenario by id, or null. */
export async function findUserScenario(id: string): Promise<StoredScenario | null> {
  const s = await ensureLoaded();
  return s.scenarios.find((x) => x.id === id) ?? null;
}

/** Append + persist. Stamps createdAt + likes=0 for fresh entries; preserves
 *  likes if the same id already existed (matches scriptStore behaviour).
 *  v0.8.1: optional `createdBy` is recorded for "my creations" filter. */
export async function addUserScenario(
  scenario: FiredScenario,
  meta?: { createdBy?: string },
): Promise<void> {
  const s = await ensureLoaded();
  const stamped: StoredScenario = {
    ...scenario,
    likes:     0,
    createdAt: Date.now(),
    createdBy: meta?.createdBy,
  };
  const idx = s.scenarios.findIndex((x) => x.id === scenario.id);
  if (idx >= 0) {
    // Preserve community feedback + creator-id on re-write.
    stamped.likes     = s.scenarios[idx].likes ?? 0;
    stamped.createdBy = s.scenarios[idx].createdBy ?? meta?.createdBy;
    s.scenarios[idx] = stamped;
  } else {
    s.scenarios.push(stamped);
  }
  await persist(s);
}

/** v0.8.1 — increment the like counter for `id`. Mirrors scriptStore. */
export async function incrementScenarioLike(id: string): Promise<number | null> {
  const s = await ensureLoaded();
  const idx = s.scenarios.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  s.scenarios[idx].likes = (s.scenarios[idx].likes ?? 0) + 1;
  await persist(s);
  return s.scenarios[idx].likes!;
}

/** v0.8.1 — undo a like, floors at 0 (parallel to scriptStore). */
export async function decrementScenarioLike(id: string): Promise<number | null> {
  const s = await ensureLoaded();
  const idx = s.scenarios.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  s.scenarios[idx].likes = Math.max(0, (s.scenarios[idx].likes ?? 0) - 1);
  await persist(s);
  return s.scenarios[idx].likes!;
}

/** v0.9.2 — bump play counter (called when /chat opens this scenario
 *  for the first message of a session). Soft-fails on missing id. */
export async function incrementScenarioPlay(id: string): Promise<void> {
  const s = await ensureLoaded();
  const idx = s.scenarios.findIndex((x) => x.id === id);
  if (idx < 0) return;
  s.scenarios[idx].plays = (s.scenarios[idx].plays ?? 0) + 1;
  await persist(s);
}

/** Mint a unique id with the `fired-u-XXXXXX` namespace (parallel to
 *  scriptStore's bit-u-…). 6 random base36 chars. */
export function mintUserScenarioId(): string {
  const rnd = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `fired-u-${rnd}`;
}
