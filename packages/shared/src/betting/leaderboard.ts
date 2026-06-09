/**
 * betting/leaderboard.ts — v6.74 P3 — 观众下注盘「全网战绩榜」的纯排序层。
 *
 * 每个 userId 留**身家最高的一次快照**(mirror 闯关榜的 upsertBest 口径:峰值身家不被
 * 之后的烂局抹掉,当高分榜用)。这里只管「怎么算命中率 / 谁更阔 / 怎么 upsert / 怎么排名」。
 * 纯函数,无 I/O —— 服务端 store 负责落盘,客户端榜单负责画。
 *
 * 两种榜:
 *   · 'chips'   筹码榜 —— 身家降序(头牌「谁筹码最多」),同分比命中率、再比新鲜度。
 *   · 'hitRate' 神算榜 —— 命中率降序,但**够样本**(≥MIN_SETTLED_FOR_RATE)才入围,
 *               防 1/1=100% 那种运气哥屠榜;不够样本的沉底。
 */
export interface BetRun {
  userId: string;
  chips: number;        // 当前身家(快照) —— 筹码榜头牌指标
  settled: number;      // 累计结算注数
  hits: number;         // 累计押中注数
  bestWin: number;      // 单笔最高派彩(炫一下手气)
  lifetimeWon: number;  // 累计赢取筹码
  ts: number;           // 服务端落戳(ms)
}

/** 上榜可提交字段(userId + ts 由服务端注入,不信任客户端)。 */
export type BetRunSubmit = Omit<BetRun, 'userId' | 'ts'>;

/** 神算榜入围门槛:结算注数够这个数才比命中率,否则当运气哥沉底。 */
export const MIN_SETTLED_FOR_RATE = 5;

export type BetSortBy = 'chips' | 'hitRate';

/** 命中率 0–1(没结算过算 0)。 */
export function betHitRate(r: Pick<BetRun, 'settled' | 'hits'>): number {
  return r.settled > 0 ? r.hits / r.settled : 0;
}

/** a 是否比 b「更阔」:身家高;同身家比命中率;再比新鲜度(新的赢)。 */
export function isBetterBetRun(a: BetRun, b: BetRun): boolean {
  if (a.chips !== b.chips) return a.chips > b.chips;
  const ha = betHitRate(a);
  const hb = betHitRate(b);
  if (ha !== hb) return ha > hb;
  return a.ts >= b.ts;
}

/**
 * 把一条新快照并进榜单:同 userId 只保留**身家最高**那条(更阔才替换),否则追加。
 * 返回新数组(不可变)。
 */
export function upsertBestBetRun(list: readonly BetRun[], run: BetRun): BetRun[] {
  const out = list.filter((r) => r.userId !== run.userId);
  const existing = list.find((r) => r.userId === run.userId);
  out.push(existing && !isBetterBetRun(run, existing) ? existing : run);
  return out;
}

/** 入围神算榜的资格(够样本)。 */
function rateEligible(r: BetRun): boolean {
  return r.settled >= MIN_SETTLED_FOR_RATE;
}

/**
 * 排名:
 *   · 'chips'   身家降序 → 命中率降序 → 新鲜度降序。
 *   · 'hitRate' 够样本者优先(运气哥沉底),命中率降序 → 身家降序 → 新鲜度降序。
 * 可选截断 top-N。
 */
export function rankBetRuns(list: readonly BetRun[], limit?: number, sortBy: BetSortBy = 'chips'): BetRun[] {
  const sorted = [...list].sort((a, b) => {
    if (sortBy === 'hitRate') {
      const ea = rateEligible(a) ? 1 : 0;
      const eb = rateEligible(b) ? 1 : 0;
      if (ea !== eb) return eb - ea;            // 够样本的排前
      const hd = betHitRate(b) - betHitRate(a); // 命中率降序
      if (hd !== 0) return hd;
      if (b.chips !== a.chips) return b.chips - a.chips;
      return b.ts - a.ts;
    }
    // 'chips'
    if (b.chips !== a.chips) return b.chips - a.chips;
    const hd = betHitRate(b) - betHitRate(a);
    if (hd !== 0) return hd;
    return b.ts - a.ts;
  });
  return typeof limit === 'number' ? sorted.slice(0, Math.max(0, limit)) : sorted;
}
