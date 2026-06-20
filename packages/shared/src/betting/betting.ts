/**
 * betting/betting.ts — v6.74 — 观众下注盘的纯引擎。
 *
 * 旁观局把"看戏"升级成"有筹码的看戏":每回合开盘口押「谁被投票开除」,整局押「谁笑到最后」。
 * 赔率按概率倒数算(概率越低赔越高)+ house edge;押中按**下注时锁定的赔率**派彩。筹码本地存,
 * 每日补给 + 破产兜底。全部纯函数、无 I/O、无随机,可 vitest 锁死;UI / 持久化在客户端做。
 */

export type MarketKind = 'round_vote' | 'winning_team' | 'company_winner';

export interface BetOption {
  id: string;
  label: string;
  /** 模型概率 0..1,一个盘口内 ≈ 求和为 1。赔率由它推。 */
  prob: number;
}

export interface BetMarket {
  id: string;             // `${gameId}:r${round}:vote` / `${gameId}:winner`
  kind: MarketKind;
  round: number;          // winning_team 用 0
  title: string;
  options: BetOption[];
  status: 'open' | 'settled';
  winnerOptionId?: string;
}

export interface Bet {
  marketId: string;
  optionId: string;
  optionLabel: string;
  stake: number;
  odds: number;           // 下注瞬间锁定的赔率(派彩按这个,不随后续变动)
  round: number;
}

export interface BettingProgress {
  chips: number;
  lifetimeWon: number;
  lifetimeStaked: number;
  bestWin: number;
  settled: number;        // 已结算注数
  hits: number;           // 押中注数
  lastDripTs: number;     // 上次每日补给(ms)
}

export const STARTING_CHIPS = 500;
export const DAILY_DRIP = 200;
export const DRIP_INTERVAL_MS = 86_400_000; // 24h
export const BANKRUPT_FLOOR = 50;           // 破产兜底:余额低于此直接补到此
export const HOUSE_EDGE = 0.08;
export const MIN_ODDS = 1.05;

export function emptyProgress(now = 0): BettingProgress {
  return { chips: STARTING_CHIPS, lifetimeWon: 0, lifetimeStaked: 0, bestWin: 0, settled: 0, hits: 0, lastDripTs: now };
}

/** 赔率:概率越低赔越高;带 house edge;封下限 MIN_ODDS;两位小数。 */
export function oddsFromProb(prob: number, edge = HOUSE_EDGE): number {
  const p = Math.max(0.02, Math.min(0.98, prob));
  return Math.max(MIN_ODDS, Math.round((1 / p) * (1 - edge) * 100) / 100);
}

/** 给每个 option 附上赔率(展示用)。 */
export function withOdds(options: BetOption[], edge = HOUSE_EDGE): (BetOption & { odds: number })[] {
  return options.map((o) => ({ ...o, odds: oddsFromProb(o.prob, edge) }));
}

/** 单注派彩:押中 → round(stake × 锁定赔率),否则 0。 */
export function settleBet(bet: Bet, winnerOptionId: string): number {
  return bet.optionId === winnerOptionId ? Math.round(bet.stake * bet.odds) : 0;
}

/** 一组注的总派彩。 */
export function totalPayout(bets: Bet[], winnerOptionId: string): number {
  return bets.reduce((s, b) => s + settleBet(b, winnerOptionId), 0);
}

/** 下注:够筹码才扣(返回 ok=false 表示余额不足 / 非法额)。 */
export function placeBet(p: BettingProgress, stake: number): { ok: boolean; next: BettingProgress } {
  if (!Number.isFinite(stake) || stake <= 0 || stake > p.chips) return { ok: false, next: p };
  return { ok: true, next: { ...p, chips: p.chips - stake, lifetimeStaked: p.lifetimeStaked + stake } };
}

/** 结算入账:加派彩 + 更新统计。won 用于命中率。 */
export function creditResult(p: BettingProgress, payout: number, won: boolean): BettingProgress {
  return {
    ...p,
    chips: p.chips + Math.max(0, payout),
    lifetimeWon: p.lifetimeWon + Math.max(0, payout),
    bestWin: Math.max(p.bestWin, payout),
    settled: p.settled + 1,
    hits: p.hits + (won ? 1 : 0),
  };
}

/** 每日补给 + 破产兜底:跨天给 DAILY_DRIP;余额低于 floor 直接补到 floor。纯函数(now 外部传)。 */
export function applyDrip(p: BettingProgress, now: number): BettingProgress {
  let next = p;
  if (now - p.lastDripTs >= DRIP_INTERVAL_MS) {
    next = { ...next, chips: next.chips + DAILY_DRIP, lastDripTs: now };
  }
  if (next.chips < BANKRUPT_FLOOR) {
    next = { ...next, chips: BANKRUPT_FLOOR };
  }
  return next;
}

// ---------------------------------------------------------------------------
// 盘口构建(从对局状态)
// ---------------------------------------------------------------------------
function normProb<T extends { weight: number }>(items: T[]): (T & { prob: number })[] {
  const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0) || 1;
  return items.map((i) => ({ ...i, prob: Math.max(0, i.weight) / total }));
}

/**
 * v6.93 — 把鬼魂投票(ghostId → targetId)聚成「每个目标被投了几票」的热度表。
 * 直接喂给 roundVoteMarket 的 `heat`:被多票指认的人出局概率↑、赔率↓,押他赔得少、
 * 押冷门押中赔得多 —— 旁观者下注从「瞎猜」变「读局」。纯函数,可单测。
 */
export function tallyGhostHeat(ghostVotes: Record<string, string> | null | undefined): Record<string, number> {
  const heat: Record<string, number> = {};
  if (!ghostVotes) return heat;
  for (const target of Object.values(ghostVotes)) {
    if (!target) continue;
    heat[target] = (heat[target] ?? 0) + 1;
  }
  return heat;
}

/** 「谁被投票开除」盘口:候选 = 在场玩家;heat(被指认热度,如鬼魂票数)抬高出局概率 → 压低赔率。 */
export function roundVoteMarket(
  gameId: string,
  round: number,
  candidates: { id: string; name: string; heat?: number }[],
): BetMarket {
  const weighted = normProb(candidates.map((c) => ({ id: c.id, label: c.name, weight: 1 + (c.heat ?? 0) * 2 })));
  return {
    id: `${gameId}:r${round}:vote`,
    kind: 'round_vote',
    round,
    title: `第 ${round} 回合 · 谁被投票开除?`,
    options: weighted.map((w) => ({ id: w.id, label: w.label, prob: w.prob })),
    status: 'open',
  };
}

/** 「谁笑到最后」盘口:阵营存活人数越多,夺冠概率越高 → 赔率越低。 */
export function winningTeamMarket(
  gameId: string,
  aliveByTeam: { cat: number; dog: number; neutral: number },
): BetMarket {
  const weighted = normProb(
    [
      { id: 'cat', label: '打工人', weight: aliveByTeam.cat },
      { id: 'dog', label: '资本家', weight: aliveByTeam.dog },
      { id: 'neutral', label: '摸鱼党', weight: aliveByTeam.neutral },
    ].filter((t) => t.weight > 0),
  );
  return {
    id: `${gameId}:winner`,
    kind: 'winning_team',
    round: 0,
    title: '谁笑到最后?',
    options: weighted.map((w) => ({ id: w.id, label: w.label, prob: w.prob })),
    status: 'open',
  };
}

/**
 * v6.87 — 双公司局「哪家公司笑到最后」盘口(二选一)。option id = 'a' / 'b'(对齐
 * CompanyId + WinCondition.COMPANY_A/B_WIN)。权重融合存活人数与市占率 —— 终局既可能
 * 靠垄断(看市占)也可能靠团灭(看人数),两者各占一半量纲:存活 ×2(0-8)、市占 /12.5
 * (0-8)。整局只开一个,终局按 winner('a'/'b')一次性结算。
 */
export function companyWinnerMarket(
  gameId: string,
  a: { alive: number; market: number },
  b: { alive: number; market: number },
  labels: { a: string; b: string } = { a: 'A 司', b: 'B 司' },
): BetMarket {
  const weightOf = (c: { alive: number; market: number }) =>
    Math.max(0, c.alive) * 2 + Math.max(0, c.market) / 12.5;
  const weighted = normProb([
    { id: 'a', label: labels.a, weight: weightOf(a) },
    { id: 'b', label: labels.b, weight: weightOf(b) },
  ]);
  return {
    id: `${gameId}:company`,
    kind: 'company_winner',
    round: 0,
    title: '哪家公司笑到最后?',
    options: weighted.map((w) => ({ id: w.id, label: w.label, prob: w.prob })),
    status: 'open',
  };
}
