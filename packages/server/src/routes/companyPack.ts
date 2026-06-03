/**
 * /api/company-pack — v6.37 P3 user-curated 公司主题包.
 *
 * Lets a spectator define "our company's 12 NPCs" — 6-12 named
 * rats with optional role/personality hints — then start a Classic
 * game where those names replace the default roster. The pack is
 * private to its owner for listing purposes (GET /mine), but any
 * client knowing the unguessable `packId` can fetch it to play with
 * the same setup (so you can share a pack url with coworkers).
 *
 * Storage: packages/server/data/companyPacks.json
 *   { packs: { [packId]: CompanyPack } }
 *
 * Same atomic load/save shape as banwei.ts + hotQuotes.ts.
 */
import { Hono } from 'hono';
import { promises as fs } from 'node:fs';
import * as crypto from 'node:crypto';
import * as path from 'node:path';

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'companyPacks.json');

/** Validation knobs — picked to match GameEngine.MIN/MAX_PLAYERS
 *  (6..12) and keep name display tight in the GameMap pill. */
export const PACK_NAME_MIN = 1;
export const PACK_NAME_MAX = 32;
export const NPC_NAME_MIN = 1;
export const NPC_NAME_MAX = 16;
export const NPCS_MIN = 6;
export const NPCS_MAX = 12;
/** Hard cap on packs per user — keeps disk + listing bounded for
 *  power users. New POSTs beyond the cap return 429. */
export const PER_USER_PACK_CAP = 5;

export interface CompanyNpc {
  name: string;
  role?: string;
  personality?: string;
  /** v6.39 P3 — single emoji avatar glyph. Capped at 16 chars so a
   *  ZWJ-sequence emoji (e.g. 👨‍💻) fits but a paragraph can't sneak in. */
  avatar?: string;
}

export interface CompanyPack {
  packId: string;
  ownerUserId: string;
  name: string;
  npcs: CompanyNpc[];
  createdAt: number;
  updatedAt: number;
}

interface Store {
  packs: Record<string, CompanyPack>;
}

let cache: Store | null = null;

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    cache = JSON.parse(raw) as Store;
    if (!cache || typeof cache.packs !== 'object') cache = { packs: {} };
  } catch { cache = { packs: {} }; }
  return cache;
}

async function save(s: Store): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  // Atomic-rename — same trick as the other persistence routes. Avoids
  // a half-written file if the server gets killed mid-write.
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

/** v6.37 P3 — test helper to drop the in-memory + disk store. Exported
 *  for use in routes/__tests__/companyPack.test.ts only. */
export async function clearCompanyPacksForTest(): Promise<void> {
  cache = { packs: {} };
  try { await fs.unlink(DATA_FILE); } catch { /* missing is fine */ }
}

/** v6.37 P4 — engine-side read accessor. Returns a snapshot of the
 *  pack (or null when packId is unknown) without exposing the cache
 *  reference, so the engine can't mutate persisted state by accident. */
export async function getCompanyPackById(packId: string): Promise<CompanyPack | null> {
  const store = await load();
  const p = store.packs[packId];
  return p ? { ...p, npcs: p.npcs.map((n) => ({ ...n })) } : null;
}

function newPackId(): string {
  // 12 hex chars (48 bits) — short enough to share, low enough collision
  // risk for the per-user cap of 5.
  return crypto.randomBytes(6).toString('hex');
}

function trimStr(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t.length > 0 ? t : undefined;
}

function validateNpcs(raw: unknown): CompanyNpc[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < NPCS_MIN || raw.length > NPCS_MAX) return null;
  const out: CompanyNpc[] = [];
  for (const n of raw) {
    if (!n || typeof n !== 'object') return null;
    const name = trimStr((n as { name?: unknown }).name, NPC_NAME_MAX);
    if (!name || name.length < NPC_NAME_MIN) return null;
    const role = trimStr((n as { role?: unknown }).role, 32);
    const personality = trimStr((n as { personality?: unknown }).personality, 32);
    const avatar = trimStr((n as { avatar?: unknown }).avatar, 16);
    out.push({
      name,
      ...(role ? { role } : {}),
      ...(personality ? { personality } : {}),
      ...(avatar ? { avatar } : {}),
    });
  }
  // Names must be unique within a pack — otherwise GameMap would render
  // two identical pills + the LLM evidence parser would mis-attribute.
  const seen = new Set<string>();
  for (const n of out) {
    if (seen.has(n.name)) return null;
    seen.add(n.name);
  }
  return out;
}

export const companyPackRoutes = new Hono();

/**
 * POST /api/company-pack
 * Body: { packId?, name, npcs: [{name, role?, personality?}] }
 *   - With packId  → update existing (only owner)
 *   - Without      → create new (caps at PER_USER_PACK_CAP per user)
 */
companyPackRoutes.post('/', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ error: 'X-User-Id required' }, 400);
  const body = await c.req.json().catch(() => ({})) as {
    packId?: string; name?: unknown; npcs?: unknown;
  };
  const name = trimStr(body.name, PACK_NAME_MAX);
  if (!name || name.length < PACK_NAME_MIN) {
    return c.json({ error: 'name required (1-32 chars)' }, 400);
  }
  const npcs = validateNpcs(body.npcs);
  if (!npcs) {
    return c.json({ error: `npcs must be ${NPCS_MIN}-${NPCS_MAX} unique-name entries` }, 400);
  }

  const store = await load();
  const now = Date.now();

  if (body.packId) {
    const existing = store.packs[body.packId];
    if (!existing) return c.json({ error: 'pack not found' }, 404);
    if (existing.ownerUserId !== userId) return c.json({ error: 'forbidden' }, 403);
    const updated: CompanyPack = { ...existing, name, npcs, updatedAt: now };
    store.packs[body.packId] = updated;
    await save(store);
    return c.json({ pack: updated });
  }

  // Create — enforce per-user cap
  const mine = Object.values(store.packs).filter((p) => p.ownerUserId === userId);
  if (mine.length >= PER_USER_PACK_CAP) {
    return c.json({
      error: `pack cap reached (${PER_USER_PACK_CAP})`,
      total: mine.length,
    }, 429);
  }
  const packId = newPackId();
  const pack: CompanyPack = {
    packId, ownerUserId: userId, name, npcs,
    createdAt: now, updatedAt: now,
  };
  store.packs[packId] = pack;
  await save(store);
  return c.json({ pack });
});

/**
 * GET /api/company-pack/mine
 * Lists the caller's own packs. Headers: X-User-Id required.
 * Must be declared BEFORE /:packId so Hono doesn't capture "mine" as
 * a packId. The trailing-slash variant is handled too for clients
 * that normalize URLs.
 */
companyPackRoutes.get('/mine', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ error: 'X-User-Id required' }, 400);
  const store = await load();
  const packs = Object.values(store.packs)
    .filter((p) => p.ownerUserId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return c.json({ packs, total: packs.length, cap: PER_USER_PACK_CAP });
});

/**
 * GET /api/company-pack/:packId
 * Returns the pack public-style (no owner verification — packId is
 * the share token). Useful for "join my game with my pack" flow.
 */
companyPackRoutes.get('/:packId', async (c) => {
  const packId = c.req.param('packId');
  const store = await load();
  const pack = store.packs[packId];
  if (!pack) return c.json({ error: 'pack not found' }, 404);
  return c.json({ pack });
});

/**
 * DELETE /api/company-pack/:packId — v6.41 P4 owner-only delete.
 *
 * Unlike GET (open — packId is a share token), delete verifies the
 * caller owns the pack so a shared link can't be used to nuke someone
 * else's roster. Lets a user clear a slot once they hit the
 * PER_USER_PACK_CAP. Idempotent-ish: a missing pack returns 404,
 * a non-owner returns 403, success returns the remaining count.
 */
companyPackRoutes.delete('/:packId', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ error: 'X-User-Id required' }, 400);
  const packId = c.req.param('packId');
  const store = await load();
  const pack = store.packs[packId];
  if (!pack) return c.json({ error: 'pack not found' }, 404);
  if (pack.ownerUserId !== userId) return c.json({ error: 'forbidden' }, 403);
  delete store.packs[packId];
  await save(store);
  const remaining = Object.values(store.packs).filter((p) => p.ownerUserId === userId).length;
  return c.json({ deleted: packId, remaining, cap: PER_USER_PACK_CAP });
});
