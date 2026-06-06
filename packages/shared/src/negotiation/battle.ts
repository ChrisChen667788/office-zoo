/**
 * negotiation/battle.ts — v6.57 — 「裁了么」闯关模式 · 方案 A 的纯数值核心。
 *
 * 把一次裁员谈判变成回合制话术牌局(提案见 docs/FIRED_GAMEPLAY_PROPOSAL.md):
 *  - 你出「话术卡」打 HR 的「预算 / 耐心」;
 *  - HR 每回合摆一个「姿态」,克制 / 被克制某些卡类 → build 博弈;
 *  - 赔偿阶梯 = 抽取风险:打到 N+1 可见好就收,继续贪 2N/3N 但 HR 可能掀桌
 *    (耐心归零 → 劳动仲裁 → 赔率归零)。
 *
 * 这一层是纯函数 + 可注入 rng,先用 vitest 锁死数值;LLM 实时台词 + 客户端 UI
 * 在后续版本接入(playCard 的 blurb / stance 的 blurb 就是给 LLM 演的种子)。
 */

// ---------------------------------------------------------------------------
// 卡类 — 用于「克制矩阵」。HR 的每个姿态克制一类、怕一类。
// ---------------------------------------------------------------------------
export type CardTag = 'legal' | 'tenure' | 'emotion' | 'insider' | 'market';

export interface NegotiationCard {
  id: string;
  name: string;
  tag: CardTag;
  /** 出牌消耗的筹码。 */
  cost: number;
  /** 基础「打 HR 预算」的力度(实际效果再乘克制系数)。 */
  pressure: number;
  /** 对 HR 耐心的消耗 —— 越「撕破脸」的卡越高,越快逼近掀桌。 */
  patienceHit: number;
  /** 一句 flavor,后续 LLM 可据此生成 HR 的回怼台词。 */
  blurb: string;
}

// ---------------------------------------------------------------------------
// HR 姿态(招式)— resists 的卡类被打 ×0.5,weakTo 的卡类被打 ×1.5。
// ---------------------------------------------------------------------------
export type HRStanceId = 'pie' | 'stall' | 'kpi' | 'threat';

export interface HRStance {
  id: HRStanceId;
  name: string;
  resists: CardTag[];
  weakTo: CardTag[];
  /** 摆这个姿态时每回合对玩家底气的压制。 */
  moraleDrain: number;
  blurb: string;
}

// ---------------------------------------------------------------------------
// 内容池(starter set)。可扩展;数值可在 vitest 里平衡。
// ---------------------------------------------------------------------------
export const CARD_POOL: readonly NegotiationCard[] = [
  { id: 'tenure_push',  name: '工龄施压', tag: 'tenure',  cost: 2, pressure: 14, patienceHit: 1, blurb: '我在这干了八年,没功劳也有苦劳。' },
  { id: 'labor_law',    name: '劳动法引用', tag: 'legal',  cost: 2, pressure: 12, patienceHit: 1, blurb: '《劳动合同法》第四十七条,补偿按工龄算。' },
  { id: 'noncompete',   name: '竞业反将', tag: 'market',  cost: 3, pressure: 18, patienceHit: 2, blurb: '要我签竞业?那竞业补偿这块也得聊聊。' },
  { id: 'sob_story',    name: '情绪施压', tag: 'emotion', cost: 1, pressure: 8,  patienceHit: 0, blurb: '我上有老下有小,这时候让我走……' },
  { id: 'insider_dirt', name: '内部爆料', tag: 'insider', cost: 3, pressure: 20, patienceHit: 3, blurb: '财务那点事,我可都还记着。' },
  { id: 'beg',          name: '装可怜',   tag: 'emotion', cost: 1, pressure: 6,  patienceHit: 0, blurb: '求你了 HR,再给我一个月缓冲。' },
  { id: 'outside_offer',name: '外部 offer', tag: 'market', cost: 2, pressure: 13, patienceHit: 1, blurb: '我手上有别家 offer,谈不拢我马上走。' },
  { id: 'recording',    name: '录音暗示', tag: 'legal',   cost: 2, pressure: 15, patienceHit: 2, blurb: '刚才的对话……我手机一直开着呢。' },
];

export const STANCE_POOL: readonly HRStance[] = [
  // 克制矩阵补全(v6.57):五种卡类各被恰好一个姿态克制、且各被恰好一个姿态怕,
  // 没有任何姿态对同一卡类既克制又害怕(否则克制系数有歧义)。
  { id: 'pie',    name: '画饼',    resists: ['emotion'],          weakTo: ['market'],            moraleDrain: 8,  blurb: '公司正在转型,留下来大有前途。' },
  { id: 'stall',  name: '拖延',    resists: ['legal'],            weakTo: ['emotion'],           moraleDrain: 5,  blurb: '这事我得往上报,你再等等。' },
  { id: 'kpi',    name: '甩锅KPI', resists: ['tenure', 'insider'], weakTo: ['legal'],            moraleDrain: 10, blurb: '你这季度 KPI 没达标,工龄、那些旧账都跟这事无关。' },
  { id: 'threat', name: '威胁背调', resists: ['market'],           weakTo: ['insider', 'tenure'], moraleDrain: 15, blurb: '闹大了,对你以后找工作可不好看。' },
];

export function cardById(id: string): NegotiationCard | undefined {
  return CARD_POOL.find((c) => c.id === id);
}
export function stanceById(id: HRStanceId): HRStance {
  return STANCE_POOL.find((s) => s.id === id) ?? STANCE_POOL[0];
}

// ---------------------------------------------------------------------------
// 赔偿阶梯 — HR 预算越低 → 赔偿越高。0=没谈成, 1=N+1, 2=2N, 3=3N(全松口)。
// ---------------------------------------------------------------------------
export type CompTier = 0 | 1 | 2 | 3;

export const BUDGET_MAX = 100;

/** 预算 >66→0,≤66→N+1,≤33→2N,≤0→3N。 */
export function compTierFromBudget(budget: number): CompTier {
  if (budget <= 0) return 3;
  if (budget <= 33) return 2;
  if (budget <= 66) return 1;
  return 0;
}

export function tierLabel(tier: CompTier): string {
  return ['未谈成', 'N+1', '2N', '3N'][tier];
}

/** 克制系数:被姿态克制 ×0.5,命中姿态弱点 ×1.5,否则 ×1。 */
export function effectMultiplier(tag: CardTag, stance: HRStance): number {
  if (stance.resists.includes(tag)) return 0.5;
  if (stance.weakTo.includes(tag)) return 1.5;
  return 1;
}

// ---------------------------------------------------------------------------
// 对局状态
// ---------------------------------------------------------------------------
export type BattleOutcome =
  | { kind: 'ongoing' }
  | { kind: 'settled'; tier: CompTier; multiple: string } // 见好就收 / 打到 HR 松口(预算≤0)
  | { kind: 'caved'; tier: CompTier; multiple: string }   // 底气归零,被迫接受当前档
  | { kind: 'flipped'; tier: 0; multiple: string };       // HR 掀桌,仲裁,赔率归零

export interface BattleState {
  // 玩家(被裁员工)
  morale: number;      // 底气,≤0 → 认怂接受当前档
  chips: number;       // 筹码(出牌资源)
  chipRegen: number;   // 每回合回筹码
  chipMax: number;
  // HR
  budget: number;      // 预算,越低 → 赔偿档越高
  patience: number;    // 耐心,≤0 → 掀桌仲裁(归零)
  stance: HRStanceId;  // 本回合 HR 姿态
  // 进度
  round: number;
  log: string[];
  outcome: BattleOutcome;
}

export interface BattleConfig {
  morale?: number;
  chips?: number;
  chipRegen?: number;
  chipMax?: number;
  budget?: number;
  patience?: number;
  startStance?: HRStanceId;
}

export function initBattle(config: BattleConfig = {}): BattleState {
  return {
    morale: config.morale ?? 100,
    chips: config.chips ?? 3,
    chipRegen: config.chipRegen ?? 2,
    chipMax: config.chipMax ?? 6,
    budget: config.budget ?? BUDGET_MAX,
    patience: config.patience ?? 8,
    stance: config.startStance ?? 'pie',
    round: 1,
    log: [],
    outcome: { kind: 'ongoing' },
  };
}

/** Terminal-state detector applied after every reducer. Pure. */
function evaluateOutcome(s: BattleState): BattleOutcome {
  if (s.outcome.kind !== 'ongoing') return s.outcome; // already terminal — latch
  if (s.patience <= 0) return { kind: 'flipped', tier: 0, multiple: tierLabel(0) };
  if (s.budget <= 0) {
    return { kind: 'settled', tier: 3, multiple: tierLabel(3) };
  }
  if (s.morale <= 0) {
    const tier = compTierFromBudget(s.budget);
    return { kind: 'caved', tier, multiple: tierLabel(tier) };
  }
  return { kind: 'ongoing' };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * 玩家出一张话术卡。校验:对局进行中 + 筹码够。扣筹码,按克制系数打 HR 预算,
 * 消耗 HR 耐心。返回新状态(不可变)。筹码不足 / 已结束 → 原样返回。
 */
export function playCard(state: BattleState, cardId: string): BattleState {
  if (state.outcome.kind !== 'ongoing') return state;
  const card = cardById(cardId);
  if (!card || state.chips < card.cost) return state;

  const stance = stanceById(state.stance);
  const mult = effectMultiplier(card.tag, stance);
  const dealt = Math.round(card.pressure * mult);

  const next: BattleState = {
    ...state,
    chips: state.chips - card.cost,
    budget: clamp(state.budget - dealt, 0, BUDGET_MAX),
    patience: state.patience - card.patienceHit,
    log: [
      ...state.log,
      `🃏 你打出「${card.name}」(×${mult})→ HR 预算 -${dealt}` +
        (card.patienceHit ? `,耐心 -${card.patienceHit}` : ''),
    ],
  };
  return { ...next, outcome: evaluateOutcome(next) };
}

/**
 * HR 摆出一个姿态(招式):设定本回合姿态 + 压制玩家底气。
 */
export function hrTakeStance(state: BattleState, stanceId: HRStanceId): BattleState {
  if (state.outcome.kind !== 'ongoing') return state;
  const stance = stanceById(stanceId);
  const next: BattleState = {
    ...state,
    stance: stanceId,
    morale: state.morale - stance.moraleDrain,
    log: [...state.log, `🧑‍💼 HR 摆出「${stance.name}」:${stance.blurb}(底气 -${stance.moraleDrain})`],
  };
  return { ...next, outcome: evaluateOutcome(next) };
}

/**
 * 回合结束:回筹码(封顶 chipMax)、耐心自然 -1(你在拖时间)、回合 +1。
 */
export function endRound(state: BattleState): BattleState {
  if (state.outcome.kind !== 'ongoing') return state;
  const next: BattleState = {
    ...state,
    chips: clamp(state.chips + state.chipRegen, 0, state.chipMax),
    patience: state.patience - 1,
    round: state.round + 1,
  };
  return { ...next, outcome: evaluateOutcome(next) };
}

/** 主动「见好就收」:锁定当前预算对应的赔偿档。tier 0 也允许(等于谈崩走人)。 */
export function settle(state: BattleState): BattleState {
  if (state.outcome.kind !== 'ongoing') return state;
  const tier = compTierFromBudget(state.budget);
  return {
    ...state,
    outcome: { kind: 'settled', tier, multiple: tierLabel(tier) },
    log: [...state.log, `✅ 你见好就收,锁定 ${tierLabel(tier)}。`],
  };
}
