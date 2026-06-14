/**
 * dual/smear.ts — v6.89 — 双公司「商业抹黑(曝料)」纯引擎。
 *
 * 补设计稿核心循环 step3 缺的那环:每司每回合可向对家放一条真假参半的内鬼线索,
 * 搅浑对面投票。这里只锁纯决策:出手概率 / 选谁黑 / 线索真假;真假参半 → 既可能
 * 帮对家锄奸,也可能骗对家裁掉自己人(加速对家自毁,喂 wipeout 终局)。
 *
 * 引擎层(GameEngine.maybeCrossSmear)用这些纯函数 + Math.random 注桩;命中后给
 * 被黑者加「舆论票」压力(SMEAR_PRESSURE),在 resolveVotes 计票时折进对家那一组。
 */

/** 每司每回合出手抹黑的概率(与挖角同档,克制不刷屏)。 */
export const SMEAR_CHANCE = 0.5;
/** 抹黑命中给被黑者加的「舆论票」(折进其本司投票计票)。 */
export const SMEAR_PRESSURE = 1;
/** 放出的线索为真的概率(>真<假;略偏真,但留足搅局空间)。 */
export const SMEAR_TRUTH_RATE = 0.55;

/** 这一回合该司是否出手(roll < SMEAR_CHANCE)。纯函数。 */
export function resolveSmear(roll: number): boolean {
  return roll < SMEAR_CHANCE;
}

/** 放出的线索是否为真(roll < SMEAR_TRUTH_RATE)。纯函数。 */
export function smearTruthful(roll: number): boolean {
  return roll < SMEAR_TRUTH_RATE;
}

/**
 * 选最该黑的对家鼠:完成任务最多者(最逼近垄断 → 最有威胁)。并列取传入顺序
 * 靠前者(确定性,可单测)。空列表返回 null。纯函数。
 */
export function pickSmearTarget<T extends { tasksDone: number }>(rivals: T[]): T | null {
  let best: T | null = null;
  for (const r of rivals) {
    if (!best || r.tasksDone > best.tasksDone) best = r;
  }
  return best;
}
