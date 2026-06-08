/**
 * negotiation/shop.ts — v6.64 — 局间「商店」纯经济(方案 B 深化)。
 *
 * 用攒下的遣散费(severance)在局间买东西:解锁遗物 / 给话术卡多塞一份 / 升级一张卡。
 * 这些组成一个持久 Loadout(客户端 localStorage 存),开局据此组牌、可装备已买遗物。
 * 纯函数:buy* 校验余额/重复,返回新 Loadout(买不起/非法→null);buildDeckIds 把
 * 解锁卡 + loadout 摊成这一局的牌 id 列表(含份数 + 升级 '+' 标记)。
 */
import { cardById } from './battle';
import { relicById } from './relics';

export interface Loadout {
  severance: number;                    // 可花的遣散费
  ownedRelics: string[];                // 已买下的遗物 id
  extraCopies: Record<string, number>;  // 卡 id → 额外份数
  upgrades: Record<string, boolean>;    // 卡 id → 是否已升级(变 '+')
}

export function emptyLoadout(): Loadout {
  return { severance: 0, ownedRelics: [], extraCopies: {}, upgrades: {} };
}

export const RELIC_PRICE = 8;
export const COPY_PRICE = 4;
export const UPGRADE_PRICE = 6;
export const MAX_EXTRA_COPIES = 2; // 每张卡最多额外 2 份(共 3 张),防牌库被灌爆

/** 买一件遗物(永久拥有)。已拥有 / 买不起 / 非法 id → null。 */
export function buyRelic(lo: Loadout, relicId: string): Loadout | null {
  if (!relicById(relicId)) return null;
  if (lo.ownedRelics.includes(relicId)) return null;
  if (lo.severance < RELIC_PRICE) return null;
  return { ...lo, severance: lo.severance - RELIC_PRICE, ownedRelics: [...lo.ownedRelics, relicId] };
}

/** 给某张卡再塞一份(deck-building 复制)。封顶 MAX_EXTRA_COPIES。 */
export function buyCopy(lo: Loadout, cardId: string): Loadout | null {
  if (!cardById(cardId)) return null;
  if ((lo.extraCopies[cardId] ?? 0) >= MAX_EXTRA_COPIES) return null;
  if (lo.severance < COPY_PRICE) return null;
  return {
    ...lo,
    severance: lo.severance - COPY_PRICE,
    extraCopies: { ...lo.extraCopies, [cardId]: (lo.extraCopies[cardId] ?? 0) + 1 },
  };
}

/** 升级某张卡(力度 +UPGRADE_PRESSURE,变 '+')。已升级 / 买不起 → null。 */
export function buyUpgrade(lo: Loadout, cardId: string): Loadout | null {
  if (!cardById(cardId)) return null;
  if (lo.upgrades[cardId]) return null;
  if (lo.severance < UPGRADE_PRICE) return null;
  return { ...lo, severance: lo.severance - UPGRADE_PRICE, upgrades: { ...lo.upgrades, [cardId]: true } };
}

/**
 * 用解锁卡 id + loadout 摊出这一局的牌 id 列表:每张卡 1 + extraCopies 份,升级过的
 * 用 '+' 版 id。纯函数。
 */
export function buildDeckIds(unlockedIds: readonly string[], lo: Loadout): string[] {
  const out: string[] = [];
  for (const id of unlockedIds) {
    const finalId = lo.upgrades[id] ? `${id}+` : id;
    const copies = 1 + (lo.extraCopies[id] ?? 0);
    for (let i = 0; i < copies; i++) out.push(finalId);
  }
  return out;
}
