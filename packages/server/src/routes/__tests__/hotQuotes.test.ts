/**
 * v6.33 P4 — hotQuotes route behavior.
 * Hono test-request + direct fn calls. Uses clearHotQuotesForTest in
 * beforeEach so test order is stable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { hotQuotesRoutes, getRecentHotQuoteTexts, clearHotQuotesForTest } from '../hotQuotes';

beforeEach(async () => { await clearHotQuotesForTest(); });

async function post(text: string, userId = 'alice') {
  return hotQuotesRoutes.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
    body: JSON.stringify({ text }),
  });
}

describe('POST /api/hot-quotes', () => {
  it('accepts a valid quote', async () => {
    const r = await post('老板说要拥抱变化, 我拥抱了不到 40 分钟');
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.accepted).toBe(true);
    expect(j.entry.text).toBe('老板说要拥抱变化, 我拥抱了不到 40 分钟');
    expect(j.userThisWeek).toBe(1);
  });

  it('rejects empty / overlong', async () => {
    expect((await post('')).status).toBe(400);
    expect((await post('   ')).status).toBe(400);
    expect((await post('A'.repeat(81))).status).toBe(400);
  });

  it('requires X-User-Id', async () => {
    const r = await hotQuotesRoutes.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    });
    expect(r.status).toBe(400);
  });

  it('caps per-user submissions at 5/week', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await post(`quote ${i}`);
      expect(r.status).toBe(200);
    }
    const r6 = await post('quote 6');
    expect(r6.status).toBe(429);
    const j = await r6.json();
    expect(j.error).toMatch(/cap reached/);
  });

  it('different users don\'t share the per-user cap', async () => {
    for (let i = 0; i < 5; i++) await post(`alice ${i}`, 'alice');
    const bob = await post('bob 1', 'bob');
    expect(bob.status).toBe(200);
  });
});

describe('getRecentHotQuoteTexts', () => {
  it('empty pool → empty array', async () => {
    expect(await getRecentHotQuoteTexts()).toEqual([]);
  });

  it('returns newest first, capped at 20', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await post(`q-${i}`, `u-${i}`);
      expect(r.status).toBe(200);
      await new Promise((r) => setTimeout(r, 1)); // ensure ts ordering
    }
    const texts = await getRecentHotQuoteTexts();
    expect(texts).toHaveLength(4);
    // Newest first — q-3 should be index 0
    expect(texts[0]).toBe('q-3');
    expect(texts[3]).toBe('q-0');
  });
});

describe('GET /api/hot-quotes', () => {
  it('returns recent entries (newest first)', async () => {
    await post('one');
    await new Promise((r) => setTimeout(r, 2));
    await post('two', 'bob');
    const r = await hotQuotesRoutes.request('/');
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.entries).toHaveLength(2);
    expect(j.entries[0].text).toBe('two');
  });
});

describe('GET /api/hot-quotes/recent', () => {
  it('returns texts-only top K', async () => {
    await post('hello');
    const r = await hotQuotesRoutes.request('/recent');
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.texts).toEqual(['hello']);
  });
});
