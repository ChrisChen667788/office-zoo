/**
 * v6.158 — GET /api/fired/scenarios 必须把 `seasonal` 字段下发给客户端。
 *
 * 防的是「组件测试里喂了 prop,接口实际从不下发」这类事故:FiredLanding 按 seasonal
 * 分区展示,如果路由哪天改成显式字段映射而漏掉 seasonal,客户端会静默把季节限定场景
 * 当成常驻场景。所以这里**直接请求真实路由**(firedRouter.request),不在测试里复刻映射逻辑。
 * UGC 存储桩成空列表,避免读写磁盘。
 */
import { describe, it, expect, vi } from 'vitest';
import { SCENARIOS as FIRED_SCENARIOS } from '@furball/shared';

vi.mock('../../services/scenarioStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/scenarioStore')>()),
  listUserScenarios: async () => [],
}));

const { firedRouter } = await import('../fired');

type WireScenario = { id: string; source: string; seasonal?: { months: number[]; label: string } };

async function fetchScenarios(query = ''): Promise<WireScenario[]> {
  const res = await firedRouter.request(`/scenarios${query}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { scenarios: WireScenario[] };
  return body.scenarios;
}

describe('GET /scenarios — seasonal 字段真实下发 (v6.158)', () => {
  it('每个带 seasonal 的种子场景在响应里都带着同样的 seasonal', async () => {
    const wire = await fetchScenarios();
    const seeded = FIRED_SCENARIOS.filter((s) => s.seasonal);
    expect(seeded.length).toBeGreaterThanOrEqual(2);
    for (const s of seeded) {
      const w = wire.find((x) => x.id === s.id);
      expect(w, `响应里缺少场景 ${s.id}`).toBeDefined();
      expect(w!.seasonal).toEqual(s.seasonal);
    }
  });

  it('具体取值:春节限定 [1,2]、双 11 限定 [10,11];常驻场景不带 seasonal', async () => {
    const wire = await fetchScenarios();
    const byId = new Map(wire.map((w) => [w.id, w]));
    expect(byId.get('spring-layoff-rush')?.seasonal).toEqual({ months: [1, 2], label: '春节限定' });
    expect(byId.get('double11-overtime-bill')?.seasonal).toEqual({ months: [10, 11], label: '双 11 限定' });
    expect(byId.get('offer-revoked-before-onboard')).toBeDefined();
    expect(byId.get('offer-revoked-before-onboard')!.seasonal).toBeUndefined();
  });

  it('各排序分支(hot / new / monthly)同样保留 seasonal', async () => {
    for (const q of ['?sort=hot', '?sort=new', '?sort=monthly']) {
      const wire = await fetchScenarios(q);
      expect(wire.find((w) => w.id === 'spring-layoff-rush')?.seasonal?.months, q).toEqual([1, 2]);
    }
  });
});
