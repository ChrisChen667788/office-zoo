/**
 * negotiation/deck.ts — v6.63 — 「裁了么」闯关牌局的抽牌/弃牌/洗牌(纯函数)。
 *
 * 让牌局更有 roguelike 牌库感:不再每回合摊开所有卡,而是从牌库(draw)抽一手
 * (hand),打出去/回合结束的进弃牌堆(discard),牌库抽空就把弃牌堆洗回来。
 * 可注入 rng,确定性、可单测。卡的内容/数值仍在 battle.ts;这里只搬运 id。
 */

export interface DeckState {
  draw: string[];     // 牌库(顶在数组头)
  hand: string[];     // 当前手牌
  discard: string[];  // 弃牌堆
}

export const DEFAULT_HAND_SIZE = 5;

/** Fisher–Yates,纯函数(返回新数组),rng 可注入。 */
export function shuffle<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 用一组卡 id 起一副牌:洗进牌库,抽出起手 handSize 张。 */
export function initDeck(
  cardIds: readonly string[],
  handSize: number = DEFAULT_HAND_SIZE,
  rand: () => number = Math.random,
): DeckState {
  const draw = shuffle(cardIds, rand);
  const hand = draw.splice(0, Math.max(0, handSize));
  return { draw, hand, discard: [] };
}

/** 补抽到 handSize 张;牌库空了就把弃牌堆洗回牌库。都空了就停(手可能不满)。 */
export function refillHand(
  state: DeckState,
  handSize: number = DEFAULT_HAND_SIZE,
  rand: () => number = Math.random,
): DeckState {
  let draw = [...state.draw];
  const hand = [...state.hand];
  let discard = [...state.discard];
  while (hand.length < handSize) {
    if (draw.length === 0) {
      if (discard.length === 0) break; // 真的没牌可抽了
      draw = shuffle(discard, rand);
      discard = [];
    }
    hand.push(draw.shift() as string);
  }
  return { draw, hand, discard };
}

/** 打出一张手牌:从手牌移到弃牌堆。不在手里则原样返回。 */
export function discardCard(state: DeckState, cardId: string): DeckState {
  const i = state.hand.indexOf(cardId);
  if (i < 0) return state;
  const hand = [...state.hand];
  hand.splice(i, 1);
  return { draw: [...state.draw], hand, discard: [...state.discard, cardId] };
}

/** 回合结束:把剩余手牌全部弃掉(下回合重新抽)。 */
export function discardHand(state: DeckState): DeckState {
  if (state.hand.length === 0) return state;
  return { draw: [...state.draw], hand: [], discard: [...state.discard, ...state.hand] };
}

/** 牌库 + 手牌 + 弃牌 的总数(用于守恒断言 / UI"剩余"提示)。 */
export function totalCards(state: DeckState): number {
  return state.draw.length + state.hand.length + state.discard.length;
}
