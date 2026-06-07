/**
 * negotiation/progression.ts — v6.59 — 方案 B「打工人生涯」局间成长(纯函数)。
 *
 * 每局结束按结果给**经验 + 遣散费**;经验攒到阈值升职级(实习生→老油条→维权斗士→
 * 劳动法之神),职级解锁**进阶话术卡**和**更难的 BOSS HR**(HR专员→HRD→CEO,预算更厚、
 * 赔率更高)。全部纯 + 无副作用,持久化(localStorage)在客户端做。
 */
import { BattleConfig, BattleOutcome, CARD_POOL } from './battle';

// ---------------------------------------------------------------------------
// 职级阶梯
// ---------------------------------------------------------------------------
export interface CareerLevel {
  level: number;
  title: string;
  minXp: number;
}

export const CAREER_LEVELS: readonly CareerLevel[] = [
  { level: 1, title: '实习生', minXp: 0 },
  { level: 2, title: '老油条', minXp: 60 },
  { level: 3, title: '维权斗士', minXp: 180 },
  { level: 4, title: '劳动法之神', minXp: 400 },
];

/** 当前 xp 对应的职级(取 minXp ≤ xp 的最高档)。 */
export function levelFromXp(xp: number): CareerLevel {
  let cur = CAREER_LEVELS[0];
  for (const l of CAREER_LEVELS) if (xp >= l.minXp) cur = l;
  return cur;
}

/** 下一级(已满级则 null)。 */
export function nextLevel(xp: number): CareerLevel | null {
  const cur = levelFromXp(xp);
  return CAREER_LEVELS.find((l) => l.level === cur.level + 1) ?? null;
}

/** 升级进度条:[本级已积累, 到下一级所需跨度]。满级 → span=null。 */
export function xpProgress(xp: number): { into: number; span: number | null } {
  const cur = levelFromXp(xp);
  const nxt = nextLevel(xp);
  if (!nxt) return { into: xp - cur.minXp, span: null };
  return { into: xp - cur.minXp, span: nxt.minXp - cur.minXp };
}

// ---------------------------------------------------------------------------
// BOSS 难度阶梯 — config 覆盖 initBattle 默认值,rewardMult 放大收益。
// ---------------------------------------------------------------------------
export interface BossTier {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  minLevel: number;
  rewardMult: number;
  config: BattleConfig;
}

export const BOSS_TIERS: readonly BossTier[] = [
  { id: 'hr',  name: 'HR 专员',     emoji: '🧑‍💼', minLevel: 1, rewardMult: 1,   blurb: '刚入行,嘴还嫩,好说话。',           config: { budget: 90,  patience: 9 } },
  { id: 'hrd', name: 'HRD 总监',    emoji: '💼',   minLevel: 2, rewardMult: 1.6, blurb: '老江湖,预算厚、套路深。',           config: { budget: 110, patience: 8 } },
  { id: 'ceo', name: 'CEO 亲自下场', emoji: '👑',   minLevel: 3, rewardMult: 2.4, blurb: '要钱没有,要命一条 —— 但赔得最狠。', config: { budget: 130, patience: 7 } },
];

export function bossById(id: string): BossTier {
  return BOSS_TIERS.find((b) => b.id === id) ?? BOSS_TIERS[0];
}

/** 当前职级解锁了哪些 BOSS。 */
export function unlockedBosses(level: number): BossTier[] {
  return BOSS_TIERS.filter((b) => b.minLevel <= level);
}

// ---------------------------------------------------------------------------
// 进阶卡解锁(本体在 battle.ts 的 UNLOCKABLE_CARDS,这里只管「几级解锁哪张」)。
// ---------------------------------------------------------------------------
export const CARD_UNLOCKS: Record<number, string[]> = {
  2: ['arbitration'],   // 老油条:仲裁威胁
  3: ['media_expose'],  // 维权斗士:媒体曝光
};

/** 当前职级能用的全部卡 id(starter + 已解锁进阶卡)。 */
export function unlockedCardIds(level: number): string[] {
  const ids = CARD_POOL.map((c) => c.id);
  for (const [lvl, cards] of Object.entries(CARD_UNLOCKS)) {
    if (level >= Number(lvl)) ids.push(...cards);
  }
  return ids;
}

/** 刚跨过某级时这一级新解锁的卡 id(用于"升职解锁 X"提示)。 */
export function cardsUnlockedAtLevel(level: number): string[] {
  return CARD_UNLOCKS[level] ?? [];
}

// ---------------------------------------------------------------------------
// 结算奖励 — 按赔偿档 × BOSS 倍率给经验 + 遣散费。掀桌给点安慰;认怂打折。
// ---------------------------------------------------------------------------
export interface Reward {
  xp: number;
  severance: number; // 遣散费:一个纯收集/炫耀货币(单位:个月工资,夸张化)
}

const TIER_BASE: Record<number, { xp: number; sev: number }> = {
  0: { xp: 5, sev: 0 },
  1: { xp: 20, sev: 1 },
  2: { xp: 40, sev: 3 },
  3: { xp: 70, sev: 6 },
};

export function awardFromOutcome(outcome: BattleOutcome, rewardMult = 1): Reward {
  if (outcome.kind === 'ongoing') return { xp: 0, severance: 0 };
  if (outcome.kind === 'flipped') return { xp: 3, severance: 0 }; // 掀桌:仲裁失败,只给点经验安慰
  const tier = 'tier' in outcome ? outcome.tier : 0;
  const base = TIER_BASE[tier] ?? TIER_BASE[0];
  const cavePenalty = outcome.kind === 'caved' ? 0.7 : 1; // 认怂打折(没顶住)
  return {
    xp: Math.round(base.xp * rewardMult * cavePenalty),
    severance: Math.round(base.sev * rewardMult * cavePenalty),
  };
}
