/**
 * v6.64 — 局间商店纯经济 + 升级卡解析回归。买遗物/复制/升级的余额与上限校验,
 * buildDeckIds 的份数 + 升级标记,cardById 的 '+' 升级解析。
 */
import { describe, it, expect } from 'vitest';
import { UPGRADE_PRESSURE, baseCardId, cardById } from '../negotiation/battle';
import {
  COPY_PRICE,
  MAX_EXTRA_COPIES,
  RELIC_PRICE,
  UPGRADE_PRICE,
  buildDeckIds,
  buyCopy,
  buyRelic,
  buyUpgrade,
  emptyLoadout,
} from '../negotiation/shop';

describe('battle — 升级卡 cardById(+)', () => {
  it("'<id>+' resolves to a boosted variant", () => {
    const base = cardById('tenure_push')!;
    const up = cardById('tenure_push+')!;
    expect(up.pressure).toBe(base.pressure + UPGRADE_PRESSURE);
    expect(up.name.endsWith('+')).toBe(true);
    expect(up.tag).toBe(base.tag); // 类别不变(克制关系一致)
  });
  it('baseCardId strips the +', () => {
    expect(baseCardId('labor_law+')).toBe('labor_law');
    expect(baseCardId('labor_law')).toBe('labor_law');
  });
  it('unknown id still undefined', () => {
    expect(cardById('nope+')).toBeUndefined();
  });
});

describe('shop — buyRelic', () => {
  it('deducts price and grants ownership', () => {
    const lo = { ...emptyLoadout(), severance: 20 };
    const after = buyRelic(lo, 'recorder')!;
    expect(after.severance).toBe(20 - RELIC_PRICE);
    expect(after.ownedRelics).toContain('recorder');
  });
  it('null when broke / already owned / bad id', () => {
    expect(buyRelic({ ...emptyLoadout(), severance: 1 }, 'recorder')).toBeNull();
    expect(buyRelic({ ...emptyLoadout(), severance: 99, ownedRelics: ['recorder'] }, 'recorder')).toBeNull();
    expect(buyRelic({ ...emptyLoadout(), severance: 99 }, 'nope')).toBeNull();
  });
});

describe('shop — buyCopy / buyUpgrade', () => {
  it('buyCopy increments extraCopies up to the cap', () => {
    let lo = { ...emptyLoadout(), severance: 100 };
    for (let i = 0; i < MAX_EXTRA_COPIES; i++) lo = buyCopy(lo, 'labor_law')!;
    expect(lo.extraCopies.labor_law).toBe(MAX_EXTRA_COPIES);
    expect(buyCopy(lo, 'labor_law')).toBeNull(); // 到顶
  });
  it('buyCopy null when broke / bad card', () => {
    expect(buyCopy({ ...emptyLoadout(), severance: 1 }, 'labor_law')).toBeNull();
    expect(buyCopy({ ...emptyLoadout(), severance: 99 }, 'nope')).toBeNull();
  });
  it('buyUpgrade flags the card once', () => {
    const lo = { ...emptyLoadout(), severance: 20 };
    const after = buyUpgrade(lo, 'noncompete')!;
    expect(after.severance).toBe(20 - UPGRADE_PRICE);
    expect(after.upgrades.noncompete).toBe(true);
    expect(buyUpgrade(after, 'noncompete')).toBeNull(); // 不能重复升级
  });
});

describe('shop — buildDeckIds', () => {
  it('one of each by default', () => {
    const ids = buildDeckIds(['a', 'b', 'c'], emptyLoadout());
    expect(ids).toEqual(['a', 'b', 'c']);
  });
  it('adds extra copies and applies upgrade marker', () => {
    const lo = { ...emptyLoadout(), extraCopies: { a: 2 }, upgrades: { b: true } };
    const ids = buildDeckIds(['a', 'b', 'c'], lo);
    expect(ids.filter((x) => x === 'a').length).toBe(3); // 1 + 2 copies
    expect(ids).toContain('b+');
    expect(ids).not.toContain('b'); // upgraded → only the + version
    expect(ids).toContain('c');
  });
});
