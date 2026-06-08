/**
 * negotiation/leaderboard.ts — v6.66 — 闯关牌局「全网战绩榜」的纯排序层。
 *
 * 打完一局把这局的成绩(遣散费 / 赔偿档 / 对手 / 职级 / 基调…)上报,服务端按
 * userId 留**个人最佳**一条,这里管「怎么算分 / 谁更强 / 怎么 upsert / 怎么排名」。
 * 纯函数,无 I/O —— 服务端 store 负责落盘,客户端战绩墙负责画。
 *
 * 排序口径:遣散费(个月)是头牌指标,赔偿档次之,同档比谁回合更少(更利落),
 * 最后按时间新鲜度兜底。
 */
export interface NegRun {
  userId: string;
  severance: number;   // 本局拿到的遣散费(个月) —— 榜单头牌指标
  xp: number;          // 本局经验(战绩墙重画卡面用)
  outcomeKind: 'settled' | 'caved' | 'flipped'; // 结局(战绩墙重画卡面用)
  tier: number;        // 赔偿档 0-3
  multiple: string;    // '3N' / 'N+1' / '未谈成'
  bossId: string;      // hr / hrd / ceo / capital
  bossName: string;
  bossEmoji: string;
  careerTitle: string; // 维权斗士 …
  vibe: 'win' | 'meh' | 'lose';
  rounds: number;
  relicName?: string;
  ts: number;          // 服务端落戳(ms)
}

/** 上榜可提交字段(userId + ts 由服务端注入,不信任客户端)。 */
export type NegRunSubmit = Omit<NegRun, 'userId' | 'ts'>;

/**
 * 单局战力分。遣散费主导(×1000),赔偿档次之(×40),同分时回合越少越好
 * (利落加成,封顶 12 防止刷小局),保证「6 回合 3N」压过「9 回合 3N」。
 */
export function runScore(r: Pick<NegRun, 'severance' | 'tier' | 'rounds'>): number {
  const tidy = Math.max(0, 12 - Math.max(0, r.rounds)); // 回合越少加成越高
  return r.severance * 1000 + r.tier * 40 + tidy;
}

/** a 是否比 b 强(分高;同分比新鲜度,新的赢)。 */
export function isBetterRun(a: NegRun, b: NegRun): boolean {
  const sa = runScore(a);
  const sb = runScore(b);
  if (sa !== sb) return sa > sb;
  return a.ts >= b.ts;
}

/**
 * 把一条新成绩并进榜单:同 userId 只保留个人最佳(新的更强才替换),否则追加。
 * 返回新数组(不可变)。
 */
export function upsertBestRun(list: readonly NegRun[], run: NegRun): NegRun[] {
  const out = list.filter((r) => r.userId !== run.userId);
  const existing = list.find((r) => r.userId === run.userId);
  out.push(existing && !isBetterRun(run, existing) ? existing : run);
  return out;
}

/** 排名:战力分降序,同分比时间新鲜度降序;可选截断 top-N。 */
export function rankRuns(list: readonly NegRun[], limit?: number): NegRun[] {
  const sorted = [...list].sort((a, b) => {
    const d = runScore(b) - runScore(a);
    return d !== 0 ? d : b.ts - a.ts;
  });
  return typeof limit === 'number' ? sorted.slice(0, Math.max(0, limit)) : sorted;
}
