/**
 * billingStore — v6.51 P3 — server-side source of truth for who's paying.
 *
 * The client keeps a localStorage entitlement cache (utils/entitlement.ts),
 * but that's per-browser + spoofable. Once real Stripe is wired, the
 * webhook (checkout.session.completed) writes the authoritative record
 * here keyed by the pseudonymous X-User-Id (client_reference_id), and the
 * client mirrors it via GET /api/billing/status.
 *
 * Same boring store pattern as the rest (atomic write / lazy cache / ENOENT
 * tolerant). On disk: packages/server/data/billing.json
 *   Shape: { byUser: { "<userId>": BillingRecord } }
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'billing.json');

export type BillingPlan = 'monthly' | 'annual';
export type BillingStatus = 'active' | 'cancelled' | null;

export interface BillingRecord {
  status: BillingStatus;
  plan: BillingPlan | null;
  /** Unix ms the record was last written. */
  since: number;
  /** Stripe customer / subscription ids for support + future cancellation
   *  sync. Optional — present once a real checkout completes. */
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

interface StoreShape {
  byUser: Record<string, BillingRecord>;
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.byUser || typeof parsed.byUser !== 'object') return { byUser: {} };
    return { byUser: parsed.byUser };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { byUser: {} };
    console.error('[billingStore] load failed, starting empty:', err);
    return { byUser: {} };
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

/** Read a user's billing record. Returns an inactive record when none. */
export async function getBilling(userId: string): Promise<BillingRecord> {
  const s = await ensureLoaded();
  return s.byUser[userId] ?? { status: null, plan: null, since: 0 };
}

/** Upsert a user's billing record (called by the verified webhook). */
export async function setBilling(userId: string, rec: BillingRecord): Promise<void> {
  const s = await ensureLoaded();
  s.byUser[userId] = rec;
  await persist(s);
}

/** Test-only cache reset. */
export function __resetBillingCacheForTests(): void {
  cache = null;
  loadPromise = null;
}
