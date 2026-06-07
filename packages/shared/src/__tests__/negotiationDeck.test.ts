/**
 * v6.63 — 闯关牌局抽牌/弃牌/洗牌纯函数回归。重点:牌不丢不重复(守恒)、牌库空了
 * 能把弃牌堆洗回来、确定性洗牌。
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HAND_SIZE,
  type DeckState,
  discardCard,
  discardHand,
  initDeck,
  refillHand,
  shuffle,
  totalCards,
} from '../negotiation/deck';

function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CARDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']; // 8 张
const sortedAll = (d: DeckState) => [...d.draw, ...d.hand, ...d.discard].sort();

describe('deck — shuffle', () => {
  it('is a permutation (same multiset)', () => {
    expect(shuffle(CARDS, rng(1)).sort()).toEqual([...CARDS].sort());
  });
  it('is deterministic for a seed', () => {
    expect(shuffle(CARDS, rng(42))).toEqual(shuffle(CARDS, rng(42)));
  });
  it('does not mutate the input', () => {
    const src = [...CARDS];
    shuffle(src, rng(3));
    expect(src).toEqual(CARDS);
  });
});

describe('deck — initDeck', () => {
  it('draws a starting hand and loses no cards', () => {
    const d = initDeck(CARDS, 5, rng(7));
    expect(d.hand.length).toBe(5);
    expect(d.draw.length).toBe(3);
    expect(d.discard.length).toBe(0);
    expect(totalCards(d)).toBe(8);
    expect(sortedAll(d)).toEqual([...CARDS].sort());
  });
  it('defaults to DEFAULT_HAND_SIZE', () => {
    expect(initDeck(CARDS, undefined, rng(1)).hand.length).toBe(DEFAULT_HAND_SIZE);
  });
});

describe('deck — discardCard / discardHand', () => {
  it('discardCard moves one card hand→discard', () => {
    const d0 = initDeck(CARDS, 5, rng(2));
    const card = d0.hand[0];
    const d1 = discardCard(d0, card);
    expect(d1.hand.length).toBe(4);
    expect(d1.discard).toContain(card);
    expect(totalCards(d1)).toBe(8);
  });
  it('discardCard is a no-op for a card not in hand', () => {
    const d0 = initDeck(CARDS, 5, rng(2));
    expect(discardCard(d0, 'zzz')).toBe(d0);
  });
  it('discardHand dumps the whole hand', () => {
    const d0 = initDeck(CARDS, 5, rng(2));
    const d1 = discardHand(d0);
    expect(d1.hand.length).toBe(0);
    expect(d1.discard.length).toBe(5);
    expect(totalCards(d1)).toBe(8);
  });
});

describe('deck — refillHand', () => {
  it('tops the hand back up to handSize', () => {
    let d = initDeck(CARDS, 5, rng(9));
    d = discardCard(d, d.hand[0]); // hand 4
    d = refillHand(d, 5, rng(9));
    expect(d.hand.length).toBe(5);
    expect(totalCards(d)).toBe(8);
  });

  it('reshuffles the discard pile when the draw pile runs out', () => {
    // 8 cards, hand 5 → draw 3. Discard the hand (5) then refill: needs 5, draw
    // only has 3 → must reshuffle the 5 discards back in.
    let d = initDeck(CARDS, 5, rng(11));
    d = discardHand(d);            // draw 3, hand 0, discard 5
    d = refillHand(d, 5, rng(11)); // draw 3 then reshuffle discard(5)
    expect(d.hand.length).toBe(5);
    expect(totalCards(d)).toBe(8);
    expect(sortedAll(d)).toEqual([...CARDS].sort()); // 不丢不重
  });

  it('never invents or drops cards across a full turn cycle', () => {
    let d = initDeck(CARDS, 5, rng(5));
    for (let turn = 0; turn < 12; turn++) {
      // play the first two affordable-ish cards (just the first two in hand)
      for (const c of [...d.hand].slice(0, 2)) d = discardCard(d, c);
      d = refillHand(discardHand(d), 5, rng(turn + 1));
      expect(totalCards(d)).toBe(8);
      expect(sortedAll(d)).toEqual([...CARDS].sort());
    }
  });

  it('stops gracefully if every card is gone (cannot over-draw)', () => {
    const empty: DeckState = { draw: [], hand: [], discard: [] };
    expect(refillHand(empty, 5, rng(1))).toEqual(empty);
  });
});
