/**
 * betting/intervene.ts — v6.83 — 观众「筹码买干预」纯引擎。
 *
 * 把 v6.74 下注经济闭环:赢来的筹码能花 —— 买道具真的干预主对局剧情。
 *   🛡 保护协议  本轮某鼠免被"优化"(夜杀弹开,一次性)
 *   🔍 内部邮件  随机曝一条阵营线索(80% 真 20% 反,小道消息口径)
 *   🎭 聚光灯    指定鼠下轮发言加戏(prompt 注入,多讲+上情绪)
 *
 * 这里只管「道具表 / 限购 / 扣筹码」的纯逻辑;server socket 负责限流 + 喂引擎,
 * GameEngine 负责生效点。信任模型与 v6.74 一致:筹码记在客户端 localStorage
 * (可改,但只坑自己的体验),服务端靠每会话限流兜底,不当真金白银看。
 */
import type { BettingProgress } from './betting';

export type InterventionId = 'shield' | 'clue' | 'spotlight' | 'headhunt';

export interface InterventionItem {
  id: InterventionId;
  label: string;
  emoji: string;
  price: number;
  /** 每局每观众限购次数。 */
  perGameCap: number;
  /** 需要选目标鼠吗(clue 是随机曝,不用选)。 */
  needsTarget: boolean;
  desc: string;
  /** v6.87 — 仅双公司局可买(如猎头快递:强制跳槽,单公司局无意义)。 */
  dualOnly?: boolean;
}

export const INTERVENTION_ITEMS: InterventionItem[] = [
  { id: 'shield',    label: '裁员保护协议', emoji: '🛡', price: 300, perGameCap: 1, needsTarget: true,
    desc: '本轮这只鼠免被"优化"(挡一刀,一次性)' },
  { id: 'clue',      label: '内部邮件',     emoji: '🔍', price: 200, perGameCap: 2, needsTarget: false,
    desc: '随机曝一条阵营线索(小道消息,别全信)' },
  { id: 'spotlight', label: '聚光灯',       emoji: '🎭', price: 150, perGameCap: 2, needsTarget: true,
    desc: '下轮这只鼠发言加戏(多讲 + 上情绪)' },
  // v6.87 — 双公司专属:观众众筹一个 offer,强制目标鼠当场跳槽到对家(带内鬼身份过去)
  { id: 'headhunt',  label: '猎头快递',     emoji: '📦', price: 350, perGameCap: 1, needsTarget: true, dualOnly: true,
    desc: '强制这只鼠当场跳槽到对家公司(内鬼身份一起带走)' },
];

/** v6.87 — 当前模式下能买的道具(单公司局过滤掉 dualOnly)。 */
export function interventionsForMode(mode: 'single' | 'dual'): InterventionItem[] {
  return INTERVENTION_ITEMS.filter((i) => mode === 'dual' || !i.dualOnly);
}

export function interventionById(id: string): InterventionItem | undefined {
  return INTERVENTION_ITEMS.find((i) => i.id === id);
}

/** 每局每观众的购买台账(客户端按 gameId 持有,换局清零)。 */
export type InterventionLedger = Partial<Record<InterventionId, number>>;

export function canBuyIntervention(
  progress: Pick<BettingProgress, 'chips'>,
  ledger: InterventionLedger,
  id: InterventionId,
): { ok: boolean; reason?: 'unknown_item' | 'cap_reached' | 'insufficient_chips' } {
  const item = interventionById(id);
  if (!item) return { ok: false, reason: 'unknown_item' };
  if ((ledger[id] ?? 0) >= item.perGameCap) return { ok: false, reason: 'cap_reached' };
  if (progress.chips < item.price) return { ok: false, reason: 'insufficient_chips' };
  return { ok: true };
}

/**
 * 扣筹码 + 记台账(不可变)。注意:不走 placeBet —— 买道具不是下注,
 * 不该污染 lifetimeStaked/命中率统计。
 */
export function buyIntervention(
  progress: BettingProgress,
  ledger: InterventionLedger,
  id: InterventionId,
): { ok: boolean; reason?: string; progress: BettingProgress; ledger: InterventionLedger } {
  const check = canBuyIntervention(progress, ledger, id);
  if (!check.ok) return { ok: false, reason: check.reason, progress, ledger };
  const item = interventionById(id)!;
  return {
    ok: true,
    progress: { ...progress, chips: progress.chips - item.price },
    ledger: { ...ledger, [id]: (ledger[id] ?? 0) + 1 },
  };
}
