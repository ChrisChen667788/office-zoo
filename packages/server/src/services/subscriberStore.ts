/**
 * subscriberStore — v6.51 P4 — file-backed list of 班味 Wrapped email
 * subscribers. Same boring store pattern (atomic write / lazy cache /
 * ENOENT tolerant). On disk: packages/server/data/wrapped_subscribers.json
 *   Shape: { byEmail: { "<email>": Subscriber } }   // email = normalized key
 *
 * Keyed by normalized email so re-subscribing is idempotent. userId (the
 * pseudonymous X-User-Id) is stored when available so a future digest can
 * pull the right person's Wrapped data.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'wrapped_subscribers.json');

export interface Subscriber {
  email: string;
  userId?: string;
  /** Unix ms first subscribed. */
  since: number;
  /** false after an unsubscribe (kept as a tombstone for re-subscribe + so
   *  a digest run skips them without losing the audit trail). */
  active: boolean;
}

interface StoreShape {
  byEmail: Record<string, Subscriber>;
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.byEmail || typeof parsed.byEmail !== 'object') return { byEmail: {} };
    return { byEmail: parsed.byEmail };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { byEmail: {} };
    console.error('[subscriberStore] load failed, starting empty:', err);
    return { byEmail: {} };
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

/** Add or re-activate a subscriber (idempotent on normalized email). */
export async function addSubscriber(email: string, userId?: string): Promise<void> {
  const s = await ensureLoaded();
  const existing = s.byEmail[email];
  s.byEmail[email] = {
    email,
    userId: userId ?? existing?.userId,
    since: existing?.since ?? Date.now(),
    active: true,
  };
  await persist(s);
}

/** Mark a subscriber inactive (tombstone). No-op if unknown. */
export async function removeSubscriber(email: string): Promise<void> {
  const s = await ensureLoaded();
  const existing = s.byEmail[email];
  if (!existing) return;
  s.byEmail[email] = { ...existing, active: false };
  await persist(s);
}

/** Look up one subscriber (any state) by normalized email. */
export async function getSubscriber(email: string): Promise<Subscriber | null> {
  const s = await ensureLoaded();
  return s.byEmail[email] ?? null;
}

/** All currently-active subscribers — the digest send list. */
export async function listActiveSubscribers(): Promise<Subscriber[]> {
  const s = await ensureLoaded();
  return Object.values(s.byEmail).filter((x) => x.active);
}

/** Test-only cache reset. */
export function __resetSubscriberCacheForTests(): void {
  cache = null;
  loadPromise = null;
}
