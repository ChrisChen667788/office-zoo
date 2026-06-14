/**
 * dual/battleCard.ts — v6.87 — 双公司「公司战报」卡的纯数据/文案层。
 *
 * 把一局双公司对局的终局结果摊成卡面要画的:赢家标题 / 终局缘由 / 拔河条宽度 /
 * 两司各自的存活·MVP·花名册 / 一句嘴替。纯函数,可单测。真正的 canvas 绘制在
 * 客户端 utils/companyBattleCard.ts(jsdom 没 canvas 不便测,内容在这里锁死)。
 *
 * 复用 dual.ts 的 CompanyId / DualEndReason —— 与引擎终局口径一致。
 */
import type { CompanyId, DualEndReason } from './dual';

export const COMPANY_CARD_COLORS: Record<CompanyId, string> = { a: '#4c9eff', b: '#ff8a3d' };
export const COMPANY_CARD_TAG: Record<CompanyId, string> = { a: '🅰', b: '🅱' };

export interface BattleCardPlayerInput {
  name: string;
  isAlive: boolean;
  roleLabel?: string;
  /** 完成任务数 —— 用来挑 MVP(并列时取花名册靠前者)。 */
  tasksCompleted?: number;
}

export interface BattleCardInput {
  winner: CompanyId;
  market: { a: number; b: number };
  round: number;
  /** 公司名(绑了 pack 时);默认 A 司 / B 司。 */
  labels?: { a: string; b: string };
  /** 引擎终局缘由(可选;没有就从数据派生)。 */
  dualReason?: DualEndReason;
  /** 全体玩家(含两司、死活),按 companyId 分组。 */
  players: Array<BattleCardPlayerInput & { companyId: CompanyId }>;
  date: string; // YYYY-MM-DD
}

export interface BattleCardSide {
  company: CompanyId;
  label: string;
  color: string;
  tag: string;
  market: number;
  survivors: number;
  total: number;
  /** 存活里完成任务最多者(没活人则 null)。 */
  mvp: string | null;
  roster: Array<{ name: string; alive: boolean; roleLabel?: string }>;
  isWinner: boolean;
}

export interface BattleCard {
  winner: CompanyId;
  winnerLabel: string;     // "🅰 青藤 笑到最后"
  reasonText: string;      // "市场垄断" / "对家团灭" …
  market: { a: number; b: number };
  /** 拔河条:两段宽度之比(求和为 1;双 0 时各 0.5)。 */
  marketBar: { a: number; b: number };
  sides: { a: BattleCardSide; b: BattleCardSide };
  tagline: string;
  date: string;
}

const REASON_TEXT: Record<DualEndReason, string> = {
  monopoly: '市场垄断',
  wipeout: '对家团灭',
  insiders_down: '双内鬼皆裁 · 比市占',
  round_cap: '回合耗尽 · 市占定胜',
};

/** 没传 dualReason 时,从数据反推一个合理的缘由标签。 */
function deriveReason(input: BattleCardInput, sideA: BattleCardSide, sideB: BattleCardSide): string {
  const winSide = input.winner === 'a' ? sideA : sideB;
  const loseSide = input.winner === 'a' ? sideB : sideA;
  if (winSide.market >= 100) return REASON_TEXT.monopoly;
  if (loseSide.survivors <= 1) return REASON_TEXT.wipeout;
  return REASON_TEXT.round_cap;
}

function buildSide(
  company: CompanyId,
  input: BattleCardInput,
): BattleCardSide {
  const labels = input.labels ?? { a: 'A 司', b: 'B 司' };
  const roster = input.players.filter((p) => p.companyId === company);
  const alive = roster.filter((p) => p.isAlive);
  // MVP:存活里完成任务最多者(并列取花名册靠前)。
  let mvp: string | null = null;
  let best = -1;
  for (const p of alive) {
    const t = p.tasksCompleted ?? 0;
    if (t > best) { best = t; mvp = p.name; }
  }
  if (mvp === null && alive.length > 0) mvp = alive[0].name;
  return {
    company,
    label: labels[company],
    color: COMPANY_CARD_COLORS[company],
    tag: COMPANY_CARD_TAG[company],
    market: Math.max(0, Math.round(input.market[company] ?? 0)),
    survivors: alive.length,
    total: roster.length,
    mvp,
    roster: roster.map((p) => ({ name: p.name, alive: p.isAlive, roleLabel: p.roleLabel })),
    isWinner: input.winner === company,
  };
}

/** 把一局双公司终局摊成卡面内容。纯函数。 */
export function buildBattleCard(input: BattleCardInput): BattleCard {
  const sideA = buildSide('a', input);
  const sideB = buildSide('b', input);
  const winSide = input.winner === 'a' ? sideA : sideB;
  const loseSide = input.winner === 'a' ? sideB : sideA;

  const reasonText = input.dualReason ? REASON_TEXT[input.dualReason] : deriveReason(input, sideA, sideB);

  const total = sideA.market + sideB.market;
  const marketBar = total > 0
    ? { a: sideA.market / total, b: sideB.market / total }
    : { a: 0.5, b: 0.5 };

  // 嘴替:看赢得有多惨烈 —— 团灭 / 垄断 / 险胜分三档。
  let tagline: string;
  if (winSide.market >= 100) {
    tagline = `${winSide.tag} ${winSide.label} 把市场吃干抹净 —— 友商连工位都搬空了。`;
  } else if (loseSide.survivors <= 1) {
    tagline = `${loseSide.label} 被内鬼 + 裁员耗到只剩一只鼠,${winSide.label} 不战而胜。`;
  } else {
    const gap = Math.abs(winSide.market - loseSide.market);
    tagline = gap <= 10
      ? `${winSide.tag} ${winSide.label} 险胜 ${gap}% 市占 —— 这局打到最后一回合。`
      : `${winSide.tag} ${winSide.label} 以 ${winSide.market}% : ${loseSide.market}% 市占笑到最后。`;
  }

  return {
    winner: input.winner,
    winnerLabel: `${winSide.tag} ${winSide.label} 笑到最后`,
    reasonText,
    market: { a: sideA.market, b: sideB.market },
    marketBar,
    sides: { a: sideA, b: sideB },
    tagline,
    date: input.date,
  };
}
