/**
 * dual/dual.ts — v6.85 — 双公司对抗纯引擎(设计稿 docs/DESIGN_DUAL_COMPANY.md,已拍板)。
 *
 * 拍板参数:4+4 鼠 · 跳槽内鬼身份带过去 · 单局 ~15 分钟。
 * 这里只有纯函数:公司分配 / 市占率竞速 / 挖人概率 / 跨司动作限额 / 终局判定 /
 * 跳槽的关系网事件派生。随机数(挖人 roll)由调用方注入;GameEngine 负责接线
 * (mode:'dual' 开关,夜杀/投票按公司分组 —— 那是 v6.85 P2/v6.86 的事)。
 */
import type { RelationEvent } from '../memory/relationships';

export type CompanyId = 'a' | 'b';

/** 拍板①:每公司 4 鼠(共 8,各藏 1 个资本家内鬼)。 */
export const DUAL_RATS_PER_COMPANY = 4;
/** 市占率赢线。 */
export const MARKET_WIN = 100;
/** 每完成 1 个任务给本公司加的市占率。4 工/司 × ~半数完成/轮 ≈ +18/轮 → ~6 轮垄断。 */
export const MARKET_STEP = 9;
/** 拍板③:~15 分钟 → 回合数硬上限(到了按市占率领先者判胜)。 */
export const MAX_DUAL_ROUNDS = 8;
/** 拍板②:跳槽鼠保留原阵营 —— 被挖走的内鬼继续在新东家潜伏。 */
export const DEFECTION_KEEPS_TEAM = true;

// ---------------------------------------------------------------------------
// 公司分配
// ---------------------------------------------------------------------------

/**
 * 8 鼠 → 4+4 两公司,**每公司恰好 1 个内鬼**(dogIds 必须给 2 个)。
 * 确定性:第 1 个 dog → a,第 2 个 → b;其余按输入顺序轮流补满。
 * 输入不合法(人数≠8 / dog≠2 / dog 不在名单)返回 null,调用方退回单公司模式。
 */
export function assignDualCompanies(
  playerIds: readonly string[],
  dogIds: readonly string[],
): Record<string, CompanyId> | null {
  if (playerIds.length !== DUAL_RATS_PER_COMPANY * 2) return null;
  if (dogIds.length !== 2) return null;
  if (!dogIds.every((d) => playerIds.includes(d))) return null;

  const out: Record<string, CompanyId> = {};
  out[dogIds[0]] = 'a';
  out[dogIds[1]] = 'b';
  const counts: Record<CompanyId, number> = { a: 1, b: 1 };
  for (const id of playerIds) {
    if (out[id]) continue;
    const pick: CompanyId = counts.a <= counts.b
      ? (counts.a < DUAL_RATS_PER_COMPANY ? 'a' : 'b')
      : (counts.b < DUAL_RATS_PER_COMPANY ? 'b' : 'a');
    out[id] = pick;
    counts[pick]++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 市占率竞速
// ---------------------------------------------------------------------------

export interface MarketState { a: number; b: number; }

export function emptyMarket(): MarketState {
  return { a: 0, b: 0 };
}

/** 完成 completedTasks 个任务 → 本公司市占率 +STEP×N,封顶 MARKET_WIN(不可变)。 */
export function advanceMarket(m: MarketState, company: CompanyId, completedTasks: number): MarketState {
  const inc = Math.max(0, Math.floor(completedTasks)) * MARKET_STEP;
  return { ...m, [company]: Math.min(MARKET_WIN, m[company] + inc) };
}

/** 谁先垄断(都没到 / 同轮双到 → null,双到极罕见,按平局继续)。 */
export function marketWinner(m: MarketState): CompanyId | null {
  const aWin = m.a >= MARKET_WIN;
  const bWin = m.b >= MARKET_WIN;
  if (aWin && !bWin) return 'a';
  if (bWin && !aWin) return 'b';
  return null;
}

// ---------------------------------------------------------------------------
// 挖人(跨司 offer)
// ---------------------------------------------------------------------------

/**
 * 跳槽概率:底 15% + 关系分加成(目标对挖人公司发起鼠的 feeling/200),
 * 夹在 [5%, 60%]。世仇(-100)≈5%,过命交情(+90)=60%。
 */
export function poachChance(feelingTowardRecruiter: number): number {
  const c = 0.15 + feelingTowardRecruiter / 200;
  return Math.max(0.05, Math.min(0.6, Math.round(c * 100) / 100));
}

/** roll ∈ [0,1) 由调用方注入(纯函数不掷骰)。 */
export function resolvePoach(chance: number, roll: number): boolean {
  return roll < chance;
}

/**
 * 跳槽 → 关系网事件:老东家**在场同事**全员视为被背叛(subject=老同事,
 * actor=跳槽鼠,kind=backstab)。拍板②的身份保留由 engine 落实(team 不动),
 * 这里只派生情绪面。
 */
export function eventsFromDefection(args: {
  defectorArch: string;
  oldColleagueArchs: readonly string[];
  gameId: string;
  round: number;
  ts: number;
}): RelationEvent[] {
  return args.oldColleagueArchs
    .filter((c) => c && c !== args.defectorArch)
    .map((colleague) => ({
      actorId: args.defectorArch,
      subjectId: colleague,
      kind: 'backstab' as const,
      gameId: args.gameId,
      round: args.round,
      ts: args.ts,
    }));
}

// ---------------------------------------------------------------------------
// 跨司动作限额(每公司每回合 1 次:挖人或曝料二选一)
// ---------------------------------------------------------------------------

/** company → 上次使用跨司动作的回合号。 */
export type CrossActionLedger = Partial<Record<CompanyId, number>>;

export function canCrossAction(ledger: CrossActionLedger, company: CompanyId, round: number): boolean {
  return ledger[company] !== round;
}

export function recordCrossAction(ledger: CrossActionLedger, company: CompanyId, round: number): CrossActionLedger {
  return { ...ledger, [company]: round };
}

// ---------------------------------------------------------------------------
// 终局判定(设计稿三终局 + 回合上限兜底)
// ---------------------------------------------------------------------------

export type DualEndReason = 'monopoly' | 'wipeout' | 'insiders_down' | 'round_cap';

export interface DualVerdict { winner: CompanyId | null; reason: DualEndReason | null; }

/**
 * 优先级:🏆 垄断 > 💀 对面团灭(活人 ≤1)> 🐀 双内鬼皆裁(比市占率)> 回合上限
 * (到 MAX_DUAL_ROUNDS 比市占率)。市占率打平 → winner null(reason 仍给,演出层
 * 播「两败俱伤」)。没满足任何终局 → {null, null} 继续打。
 */
export function dualWinner(args: {
  market: MarketState;
  aliveA: number;
  aliveB: number;
  insiderAliveA: boolean;
  insiderAliveB: boolean;
  round: number;
}): DualVerdict {
  const mw = marketWinner(args.market);
  if (mw) return { winner: mw, reason: 'monopoly' };

  const aDead = args.aliveA <= 1;
  const bDead = args.aliveB <= 1;
  if (aDead !== bDead) return { winner: aDead ? 'b' : 'a', reason: 'wipeout' };
  if (aDead && bDead) return { winner: marketLead(args.market), reason: 'wipeout' };

  if (!args.insiderAliveA && !args.insiderAliveB) {
    return { winner: marketLead(args.market), reason: 'insiders_down' };
  }

  if (args.round >= MAX_DUAL_ROUNDS) {
    return { winner: marketLead(args.market), reason: 'round_cap' };
  }
  return { winner: null, reason: null };
}

function marketLead(m: MarketState): CompanyId | null {
  if (m.a === m.b) return null;
  return m.a > m.b ? 'a' : 'b';
}
