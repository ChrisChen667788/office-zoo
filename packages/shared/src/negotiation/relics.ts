/**
 * negotiation/relics.ts — v6.59 — 方案 C「职场遗物」(纯函数)。
 *
 * 一次性道具,开局选一个,break 一条基础规则造 Balatro 式爽点。MVP 把效果落在两处
 * 可纯函数化的地方:① 改写 initBattle 的 config(回血/翻倍/砍预算);② 封印 HR 的某个
 * 姿态(录音笔让 HR 不敢威胁背调)。需要逐回合 hook 的更复杂遗物留给后续。
 */
import { BattleConfig, HRStanceId } from './battle';

export interface Relic {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
}

export const RELIC_POOL: readonly Relic[] = [
  { id: 'union_card', name: '工会卡',     emoji: '🪧', blurb: '每回合多回 1 点筹码 —— 出牌更阔绰。' },
  { id: 'recorder',   name: '录音笔',     emoji: '🎙️', blurb: '本局 HR 不敢用「威胁背调」。' },
  { id: 'big_offer',  name: '大厂 offer', emoji: '🎁', blurb: '有大厂 offer 撑腰,底气翻倍 —— 但 HR 知道你想走,耐心 −2、更易掀桌。' },
  { id: 'comp_calc',  name: '赔偿计算器', emoji: '🧮', blurb: '开局直接把 HR 预算砍掉 18,先削一刀。' },
];

export function relicById(id: string): Relic | undefined {
  return RELIC_POOL.find((r) => r.id === id);
}

export interface RelicEffects {
  config: BattleConfig;
  /** 被遗物封印、HR 不能摆的姿态。 */
  excludeStances: HRStanceId[];
}

/**
 * 把选中的遗物叠加到基础 config 上,返回最终 config + 被封印的姿态。纯函数:不改
 * 入参。未知 id 忽略。
 */
export function applyRelics(relicIds: readonly string[], base: BattleConfig = {}): RelicEffects {
  const config: BattleConfig = { ...base };
  const excludeStances: HRStanceId[] = [];
  for (const id of relicIds) {
    switch (id) {
      case 'union_card':
        config.chipRegen = (config.chipRegen ?? 2) + 1;
        break;
      case 'recorder':
        if (!excludeStances.includes('threat')) excludeStances.push('threat');
        break;
      case 'big_offer':
        // 注意:不碰 budget —— playCard 把预算 clamp 到 BUDGET_MAX,翻倍会被立刻夹回,
        // 没意义。改成「底气×2(更耐打)+ 耐心−2(更易掀桌)」的纯风险/回报。
        config.morale = (config.morale ?? 100) * 2;
        config.patience = (config.patience ?? 8) - 2;
        break;
      case 'comp_calc':
        config.budget = (config.budget ?? 100) - 18;
        break;
      default:
        break; // 未知遗物忽略
    }
  }
  return { config, excludeStances };
}
