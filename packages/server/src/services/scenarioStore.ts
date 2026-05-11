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
 *  scriptStore.StoredScript. */
export interface StoredScenario extends FiredScenario {
  likes?: number;
  /** Unix ms — set on initial addUserScenario. */
  createdAt?: number;
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
 *  likes if the same id already existed (matches scriptStore behaviour). */
export async function addUserScenario(scenario: FiredScenario): Promise<void> {
  const s = await ensureLoaded();
  const stamped: StoredScenario = {
    ...scenario,
    likes:     0,
    createdAt: Date.now(),
  };
  const idx = s.scenarios.findIndex((x) => x.id === scenario.id);
  if (idx >= 0) {
    stamped.likes = s.scenarios[idx].likes ?? 0;
    s.scenarios[idx] = stamped;
  } else {
    s.scenarios.push(stamped);
  }
  await persist(s);
}

/** Mint a unique id with the `fired-u-XXXXXX` namespace (parallel to
 *  scriptStore's bit-u-…). 6 random base36 chars. */
export function mintUserScenarioId(): string {
  const rnd = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `fired-u-${rnd}`;
}
