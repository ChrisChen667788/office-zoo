/**
 * negotiation/sim.ts — v6.57 — heuristic players + full-battle driver for the
 * 「裁了么」闯关牌局. Both AI sides are scripted (this is an AI-vs-AI game the
 * spectator watches, same as the main social-deduction loop). Pure + rng-
 * injectable so a whole battle is deterministic and unit-testable.
 *
 * Strategy lives here; the数值 reducers live in battle.ts. Later versions swap
 * `chooseHRStance` / `chooseEmployeePlan` for LLM-assisted picks, but the
 * resolution stays数值-driven (per the proposal: 数值定结果,LLM 配台词).
 */
import {
  BattleConfig,
  BattleState,
  CARD_POOL,
  CompTier,
  HRStanceId,
  STANCE_POOL,
  compTierFromBudget,
  effectMultiplier,
  endRound,
  hrTakeStance,
  initBattle,
  playCard,
  settle,
  stanceById,
} from './battle';

/** Hard cap so a stalled battle can never loop forever (test-critical). */
export const MAX_ROUNDS = 30;

/** Employee's target comp tier (2N) + the patience level below which it bails
 *  and locks in whatever it's already won rather than risk a 掀桌. */
const TARGET_TIER: CompTier = 2;
const RISK_PATIENCE = 2;

function weightedPick<T>(items: readonly T[], weights: number[], rand: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * HR picks a stance. Bias toward harder stances (甩锅KPI / 威胁背调) as its
 * budget drains or patience runs low — a cornered HR plays dirtier.
 */
export function chooseHRStance(state: BattleState, rand: () => number = Math.random): HRStanceId {
  const desperate = state.budget <= 50 || state.patience <= 3;
  const weights = STANCE_POOL.map((s) => {
    if (s.id === 'threat') return desperate ? 4 : 1.5;
    if (s.id === 'kpi') return desperate ? 3 : 2;
    return 2; // pie / stall
  });
  return weightedPick(STANCE_POOL, weights, rand).id;
}

export interface EmployeePlan {
  settle: boolean;
  cardIds: string[];
}

/**
 * Employee decides the turn: bank the current tier (见好就收) when it's risky
 * or already good enough, else push by playing cards that exploit HR's current
 * stance (skip the tag HR resists, prefer the tag HR is weak to), greedily by
 * effective pressure, without blowing patience to 0 unless the play closes out
 * the budget (a winning shove).
 */
export function chooseEmployeePlan(state: BattleState): EmployeePlan {
  const tier = compTierFromBudget(state.budget);
  if (tier >= 1 && (tier >= TARGET_TIER || state.patience <= RISK_PATIENCE)) {
    return { settle: true, cardIds: [] };
  }

  const stance = stanceById(state.stance);
  const ranked = CARD_POOL.map((c) => ({ c, mult: effectMultiplier(c.tag, stance) }))
    .filter((x) => x.mult >= 1) // skip the resisted tag (×0.5 is a waste)
    .sort((a, b) => b.c.pressure * b.mult - a.c.pressure * a.mult || a.c.cost - b.c.cost);

  let chips = state.chips;
  let patience = state.patience;
  let budget = state.budget;
  const cardIds: string[] = [];
  for (const { c, mult } of ranked) {
    if (chips < c.cost) continue;
    const dealt = Math.round(c.pressure * mult);
    const wins = budget - dealt <= 0;
    if (patience - c.patienceHit <= 0 && !wins) continue; // don't 掀桌 unless it closes
    cardIds.push(c.id);
    chips -= c.cost;
    patience -= c.patienceHit;
    budget -= dealt;
    if (budget <= 0) break; // budget busted → HR fully 松口, stop spending
  }

  if (cardIds.length === 0) {
    if (tier >= 1) return { settle: true, cardIds: [] }; // can't push safely — bank it
    // tier 0 and stuck: chip away with the cheapest affordable, patience-safe card.
    const cheap = [...CARD_POOL]
      .sort((a, b) => a.cost - b.cost)
      .find((c) => c.cost <= state.chips && state.patience - c.patienceHit > 0);
    return { settle: false, cardIds: cheap ? [cheap.id] : [] };
  }
  return { settle: false, cardIds };
}

/**
 * Drive a full battle to a terminal outcome. Round = HR stance → employee
 * plan (settle or play cards) → endRound. Caps at MAX_ROUNDS, after which a
 * still-ongoing battle is banked at its current tier (never loops forever).
 */
export function simulateBattle(
  config: BattleConfig = {},
  rand: () => number = Math.random,
): BattleState {
  let s = initBattle(config);
  while (s.outcome.kind === 'ongoing' && s.round <= MAX_ROUNDS) {
    s = hrTakeStance(s, chooseHRStance(s, rand));
    if (s.outcome.kind !== 'ongoing') break;

    const plan = chooseEmployeePlan(s);
    if (plan.settle) {
      s = settle(s);
      break;
    }
    for (const id of plan.cardIds) {
      s = playCard(s, id);
      if (s.outcome.kind !== 'ongoing') break;
    }
    if (s.outcome.kind !== 'ongoing') break;
    s = endRound(s);
  }
  if (s.outcome.kind === 'ongoing') s = settle(s); // MAX_ROUNDS safety net
  return s;
}
