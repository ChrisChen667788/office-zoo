/**
 * v6.160 — 裁了么场景广场的筛选口径,收成一个纯函数。
 *
 * 之前 FiredLanding 里主网格、未到季区块、两个筛选芯片的计数各写一份过滤:主网格在
 * v6.158 加了「只放当季」,芯片计数没跟上,把未到季的季节限定场景也数进去,芯片上的数字
 * 比点开后主网格里能看到的多。现在四处共用这里的规则:
 *  - visible:mine/tribe 筛选后、当季(或无季节限定)的场景 → 主网格
 *  - offSeason:同样筛选后、未到季的季节限定场景 → 「🕰 季节限定(未到季)」区块
 *  - mineCount / tribeCount:芯片数字 = 在另一个芯片当前状态下点开它后主网格的条数
 *    (只数当季;另一个芯片已激活时按交集算 —— v6.160 复核发现只数全量会比网格多)
 *
 * 计数可能因另一个芯片而变成 0:FiredLanding 渲染芯片时要用「计数 > 0 或自身已激活」,
 * 否则已激活的芯片会被隐藏、用户关不掉。
 */
import { isScenarioInSeason, type FiredScenario } from '@furball/shared';

export interface FiredTribe {
  industry?: string;
  region?: string;
}

export interface FiredFilterOptions {
  mineOnly: boolean;
  tribeOnly: boolean;
  myId: string;
  tribe?: FiredTribe | null;
  /** 判定当季用的日期;缺省为现在。 */
  date?: Date;
}

export interface FiredFilterResult<T> {
  visible: T[];
  offSeason: T[];
  mineCount: number;
  tribeCount: number;
}

type Filterable = FiredScenario & { createdBy?: string };

function hasTribe(tribe: FiredTribe | null | undefined): tribe is FiredTribe {
  return !!(tribe?.industry || tribe?.region);
}

/** 行业或地域任一匹配即算「我的圈子」(v2.4.0 起的 OR 口径)。 */
function inTribe(s: Filterable, tribe: FiredTribe): boolean {
  return (!!tribe.industry && s.industry === tribe.industry)
    || (!!tribe.region && s.region === tribe.region);
}

export function filterFiredScenarios<T extends Filterable>(
  scenarios: readonly T[],
  opts: FiredFilterOptions,
): FiredFilterResult<T> {
  const date = opts.date ?? new Date();
  const tribe = hasTribe(opts.tribe) ? opts.tribe : null;

  let filtered = scenarios.slice();
  if (opts.mineOnly) filtered = filtered.filter((s) => s.createdBy === opts.myId);
  if (opts.tribeOnly && tribe) filtered = filtered.filter((s) => inTribe(s, tribe));

  const inSeason = scenarios.filter((s) => isScenarioInSeason(s, date));
  const isMine = (s: T) => s.createdBy === opts.myId;
  // 点开「我的创作」时,「我的圈子」若已激活仍然生效;反之亦然。
  const mineBase = opts.tribeOnly && tribe ? inSeason.filter((s) => inTribe(s, tribe)) : inSeason;
  const tribeBase = opts.mineOnly ? inSeason.filter(isMine) : inSeason;
  return {
    visible: filtered.filter((s) => isScenarioInSeason(s, date)),
    offSeason: filtered.filter((s) => !!s.seasonal && !isScenarioInSeason(s, date)),
    mineCount: mineBase.filter(isMine).length,
    tribeCount: tribe ? tribeBase.filter((s) => inTribe(s, tribe)).length : 0,
  };
}
