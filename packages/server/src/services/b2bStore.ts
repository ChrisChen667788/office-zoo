/**
 * b2bStore — v1.1.0 white-label embed configs.
 *
 * A law firm or HR-training vendor builds an embed via /b2b, gets a
 * B2bConfig with a mint-id, and uses that id as the iframe src on their
 * own site (`https://office-zoo.com/embed/<id>`).
 *
 * Same JSON-file persistence pattern as scriptStore + scenarioStore + packStore.
 * Stored at: packages/server/data/b2b_configs.json
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { B2bConfig } from '@furball/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'b2b_configs.json');

interface StoreShape {
  configs: B2bConfig[];
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.configs || !Array.isArray(parsed.configs)) return { configs: [] };
    return { configs: parsed.configs };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { configs: [] };
    console.error('[b2bStore] load failed:', err);
    return { configs: [] };
  }
}

async function ensureLoaded(): Promise<StoreShape> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = loadFromDisk().then((s) => { cache = s; return s; });
  }
  return loadPromise;
}

async function persist(state: StoreShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

export async function listConfigs(): Promise<B2bConfig[]> {
  const s = await ensureLoaded();
  return s.configs;
}
export async function findConfig(id: string): Promise<B2bConfig | null> {
  const s = await ensureLoaded();
  return s.configs.find((c) => c.id === id) ?? null;
}
export async function addConfig(cfg: B2bConfig): Promise<void> {
  const s = await ensureLoaded();
  const stamped: B2bConfig = { ...cfg, createdAt: cfg.createdAt ?? Date.now() };
  const idx = s.configs.findIndex((c) => c.id === cfg.id);
  if (idx >= 0) s.configs[idx] = stamped;
  else          s.configs.push(stamped);
  await persist(s);
}
export function mintConfigId(): string {
  const rnd = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `b2b-${rnd}`;
}
