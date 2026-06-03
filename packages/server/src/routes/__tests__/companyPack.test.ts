/**
 * v6.37 P3 — companyPack route behavior.
 * Hono request-driven, atomic via clearCompanyPacksForTest.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  companyPackRoutes, clearCompanyPacksForTest,
  PER_USER_PACK_CAP, NPCS_MIN, getCompanyPackById,
} from '../companyPack';

beforeEach(async () => { await clearCompanyPacksForTest(); });

const NPCS_6 = Array.from({ length: NPCS_MIN }, (_, i) => ({ name: `R${i + 1}` }));

async function postCreate(
  userId: string,
  body: { name?: string; npcs?: unknown; packId?: string } = {},
) {
  return companyPackRoutes.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
    body: JSON.stringify({ name: '我们公司', npcs: NPCS_6, ...body }),
  });
}

describe('POST /api/company-pack (create)', () => {
  it('happy path', async () => {
    const r = await postCreate('alice');
    expect(r.status).toBe(200);
    const j = await r.json() as { pack: { packId: string; ownerUserId: string; npcs: unknown[] } };
    expect(j.pack.packId).toMatch(/^[0-9a-f]{12}$/);
    expect(j.pack.ownerUserId).toBe('alice');
    expect(j.pack.npcs).toHaveLength(6);
  });

  it('requires X-User-Id', async () => {
    const r = await companyPackRoutes.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', npcs: NPCS_6 }),
    });
    expect(r.status).toBe(400);
  });

  it('v6.39 P3 — stores + round-trips per-NPC emoji avatar', async () => {
    const withAvatars = NPCS_6.map((n, i) => ({ ...n, avatar: ['🐀', '🐱', '🐶', '🦊', '🐼', '🐯'][i] }));
    const r = await postCreate('alice', { npcs: withAvatars });
    expect(r.status).toBe(200);
    const j = await r.json() as { pack: { packId: string; npcs: Array<{ avatar?: string }> } };
    expect(j.pack.npcs[0].avatar).toBe('🐀');
    expect(j.pack.npcs[5].avatar).toBe('🐯');
    // round-trips through GET
    const got = await companyPackRoutes.request(`/${j.pack.packId}`);
    const gj = await got.json() as { pack: { npcs: Array<{ avatar?: string }> } };
    expect(gj.pack.npcs[2].avatar).toBe('🐶');
  });

  it('v6.39 P3 — over-long avatar value is dropped', async () => {
    const bad = NPCS_6.map((n) => ({ ...n, avatar: 'A'.repeat(50) }));
    const r = await postCreate('alice', { npcs: bad });
    expect(r.status).toBe(200);
    const j = await r.json() as { pack: { npcs: Array<{ avatar?: string }> } };
    // trimmed to 16 chars (not rejected — avatar is best-effort cosmetic)
    expect((j.pack.npcs[0].avatar ?? '').length).toBeLessThanOrEqual(16);
  });

  it('rejects missing / empty / overlong name', async () => {
    expect((await postCreate('alice', { name: '' })).status).toBe(400);
    expect((await postCreate('alice', { name: '   ' })).status).toBe(400);
    expect((await postCreate('alice', { name: 'A'.repeat(33) })).status).toBe(200); // truncated to 32 still ok
  });

  it('rejects npcs out of range (too few / too many / duplicates)', async () => {
    expect((await postCreate('alice', { npcs: [] })).status).toBe(400);
    expect((await postCreate('alice', { npcs: Array.from({ length: 13 }, (_, i) => ({ name: `n${i}` })) })).status).toBe(400);
    expect((await postCreate('alice', { npcs: [...NPCS_6.slice(0, 5), { name: 'R1' }] })).status).toBe(400);
  });

  it('caps per-user packs at PER_USER_PACK_CAP', async () => {
    for (let i = 0; i < PER_USER_PACK_CAP; i++) {
      const r = await postCreate('alice', { name: `pack-${i}` });
      expect(r.status).toBe(200);
    }
    const over = await postCreate('alice', { name: 'pack-over' });
    expect(over.status).toBe(429);
  });
});

describe('POST /api/company-pack (update)', () => {
  it('owner can update', async () => {
    const created = await postCreate('alice');
    const { pack } = await created.json() as { pack: { packId: string } };
    const r = await postCreate('alice', {
      packId: pack.packId,
      name: '我们公司 v2',
      npcs: NPCS_6.map((n) => ({ ...n, role: 'eng' })),
    });
    expect(r.status).toBe(200);
    const j = await r.json() as { pack: { name: string; npcs: Array<{ role?: string }> } };
    expect(j.pack.name).toBe('我们公司 v2');
    expect(j.pack.npcs[0].role).toBe('eng');
  });

  it('non-owner cannot update', async () => {
    const created = await postCreate('alice');
    const { pack } = await created.json() as { pack: { packId: string } };
    const r = await postCreate('bob', { packId: pack.packId });
    expect(r.status).toBe(403);
  });

  it('returns 404 for unknown packId', async () => {
    const r = await postCreate('alice', { packId: 'deadbeef0000' });
    expect(r.status).toBe(404);
  });
});

describe('GET /api/company-pack/:packId', () => {
  it('returns the pack', async () => {
    const created = await postCreate('alice', { name: '茶水间帮' });
    const { pack } = await created.json() as { pack: { packId: string } };
    const r = await companyPackRoutes.request(`/${pack.packId}`);
    expect(r.status).toBe(200);
    const j = await r.json() as { pack: { name: string } };
    expect(j.pack.name).toBe('茶水间帮');
  });

  it('404 on unknown id', async () => {
    const r = await companyPackRoutes.request('/notreal000000');
    expect(r.status).toBe(404);
  });
});

describe('DELETE /api/company-pack/:packId (v6.41 P4)', () => {
  async function del(packId: string, userId?: string) {
    return companyPackRoutes.request(`/${packId}`, {
      method: 'DELETE',
      headers: userId ? { 'X-User-Id': userId } : {},
    });
  }

  it('owner can delete; remaining count drops', async () => {
    await postCreate('alice', { name: 'A1' });
    const c2 = await postCreate('alice', { name: 'A2' });
    const { pack } = await c2.json() as { pack: { packId: string } };
    const r = await del(pack.packId, 'alice');
    expect(r.status).toBe(200);
    const j = await r.json() as { deleted: string; remaining: number };
    expect(j.deleted).toBe(pack.packId);
    expect(j.remaining).toBe(1);
    // Confirm it's gone from the listing.
    const mine = await companyPackRoutes.request('/mine', { headers: { 'X-User-Id': 'alice' } });
    const mj = await mine.json() as { total: number };
    expect(mj.total).toBe(1);
  });

  it('non-owner cannot delete (403)', async () => {
    const c1 = await postCreate('alice');
    const { pack } = await c1.json() as { pack: { packId: string } };
    const r = await del(pack.packId, 'bob');
    expect(r.status).toBe(403);
  });

  it('requires X-User-Id (400)', async () => {
    const c1 = await postCreate('alice');
    const { pack } = await c1.json() as { pack: { packId: string } };
    const r = await del(pack.packId);
    expect(r.status).toBe(400);
  });

  it('unknown packId → 404', async () => {
    const r = await del('deadbeef0000', 'alice');
    expect(r.status).toBe(404);
  });

  it('deleting frees a slot under the cap', async () => {
    for (let i = 0; i < PER_USER_PACK_CAP; i++) await postCreate('alice', { name: `p${i}` });
    // At cap — create rejected.
    expect((await postCreate('alice', { name: 'over' })).status).toBe(429);
    // Delete one, then create succeeds.
    const mine = await companyPackRoutes.request('/mine', { headers: { 'X-User-Id': 'alice' } });
    const mj = await mine.json() as { packs: Array<{ packId: string }> };
    const r = await del(mj.packs[0].packId, 'alice');
    expect(r.status).toBe(200);
    expect((await postCreate('alice', { name: 'now-fits' })).status).toBe(200);
  });
});

describe('GET /api/company-pack/mine', () => {
  it('only returns caller\'s packs, newest first', async () => {
    await postCreate('alice', { name: 'A1' });
    await new Promise((r) => setTimeout(r, 2));
    await postCreate('alice', { name: 'A2' });
    await postCreate('bob',   { name: 'B1' });
    const r = await companyPackRoutes.request('/mine', { headers: { 'X-User-Id': 'alice' } });
    const j = await r.json() as { packs: Array<{ name: string }>; total: number };
    expect(j.total).toBe(2);
    expect(j.packs.map((p) => p.name)).toEqual(['A2', 'A1']);
  });

  it('requires X-User-Id', async () => {
    const r = await companyPackRoutes.request('/mine');
    expect(r.status).toBe(400);
  });
});

describe('getCompanyPackById (engine accessor)', () => {
  it('returns a copy (engine can\'t mutate persistence)', async () => {
    const created = await postCreate('alice');
    const { pack } = await created.json() as { pack: { packId: string } };
    const snap = await getCompanyPackById(pack.packId);
    expect(snap?.packId).toBe(pack.packId);
    snap!.npcs[0].name = 'MUTATED';
    const again = await getCompanyPackById(pack.packId);
    expect(again?.npcs[0].name).not.toBe('MUTATED');
  });

  it('null for unknown id', async () => {
    expect(await getCompanyPackById('deadbeef0000')).toBeNull();
  });
});
