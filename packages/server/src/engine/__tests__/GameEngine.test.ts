/**
 * v6.26 P2 — server-side GameEngine state-machine basics.
 *
 * Avoids touching the LLM (BaseAgent.generateSpeech) — those paths
 * require OPENAI_API_KEY + network. Instead exercises:
 *   1. Constructor: 9-player roster with roles + personalities assigned.
 *   2. Serialization: getSerializedState() shape + personality included.
 *   3. pushLeakedHint (v6.25 P1): FIFO cap 5, 80-char clamp, emits.
 *   4. Initial phase + state.
 *
 * Doesn't run the full async game loop (which sleeps real seconds in
 * between phases) — that's a future integration test.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../GameEngine';

/**
 * Helper — engine + createPlayers() in one shot. GameEngine has a 2-step
 * setup (ctor builds shell, createPlayers() shuffles roles + personalities)
 * so tests need to call both.
 */
function newEngine(count = 9): GameEngine {
  const e = new GameEngine(count);
  e.createPlayers();
  return e;
}

describe('GameEngine — state machine basics', () => {
  it('constructs with 8 players (preset size), all alive, in lobby phase', () => {
    const engine = newEngine(8);
    expect(engine.state.players).toHaveLength(8);
    expect(engine.state.phase).toBe('lobby');
    expect(engine.state.players.every((p) => p.isAlive)).toBe(true);
  });

  it('assigns a personality + role to each player', () => {
    const engine = newEngine(8);
    for (const p of engine.state.players) {
      expect(p.personality).toBeTruthy();
      expect(p.role).toBeTruthy();
      expect(p.team).toBeTruthy();
    }
  });

  it('player names are unique within a game', () => {
    const engine = newEngine(8);
    const names = engine.state.players.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('SerializedPlayer includes personality on serialization', () => {
    const engine = newEngine(8);
    const ser = engine.getSerializedState();
    expect(ser.players).toHaveLength(8);
    for (const p of ser.players) {
      expect(p.personality).toBeTruthy();
    }
  });

  it('shell-only constructor produces no players until createPlayers() runs', () => {
    const engine = new GameEngine(8);
    // Two-phase setup: ctor builds shell, createPlayers() populates roster.
    expect(engine.state.players).toHaveLength(0);
    expect(engine.state.phase).toBe('lobby');
    engine.createPlayers();
    expect(engine.state.players).toHaveLength(8);
  });
});

describe('GameEngine — pushLeakedHint (v6.25 P1)', () => {
  it('accepts a valid hint and emits leak_acked', () => {
    const engine = newEngine(8);
    const acks: Array<{ text: string; total: number }> = [];
    engine.on('leak_acked', (data: { text: string; total: number }) => acks.push(data));
    const r = engine.pushLeakedHint('小心 Tony, 他在装');
    expect(r.accepted).toBe(true);
    expect(acks).toHaveLength(1);
    expect(acks[0].text).toBe('小心 Tony, 他在装');
    expect(acks[0].total).toBe(1);
  });

  it('rejects empty strings', () => {
    const engine = newEngine(8);
    const r1 = engine.pushLeakedHint('');
    const r2 = engine.pushLeakedHint('   ');
    expect(r1.accepted).toBe(false);
    expect(r2.accepted).toBe(false);
  });

  it('caps the FIFO buffer at 5 entries', () => {
    const engine = newEngine(8);
    const acks: Array<{ text: string; total: number }> = [];
    engine.on('leak_acked', (data: { text: string; total: number }) => acks.push(data));
    for (let i = 0; i < 8; i++) {
      engine.pushLeakedHint(`hint ${i}`);
    }
    // 8 accepted but cap is 5 — last ack's total reports cap reached.
    expect(acks).toHaveLength(8);
    expect(acks[acks.length - 1].total).toBe(5);
  });

  it('trims hint to 80 chars', () => {
    const engine = newEngine(8);
    const acks: Array<{ text: string; total: number }> = [];
    engine.on('leak_acked', (data: { text: string; total: number }) => acks.push(data));
    const longHint = 'A'.repeat(200);
    engine.pushLeakedHint(longHint);
    expect(acks[0].text.length).toBe(80);
  });
});

describe('GameEngine — detectLeakQuote (v6.26 P1)', () => {
  it('returns null when no hints buffered', () => {
    const engine = newEngine(8);
    expect(engine.detectLeakQuote('随便一句话')).toBeNull();
  });

  it('returns null for empty speech', () => {
    const engine = newEngine(8);
    engine.pushLeakedHint('@Frank 偷过我工位的零食');
    expect(engine.detectLeakQuote('')).toBeNull();
  });

  it('matches a 4-char window from any hint', () => {
    const engine = newEngine(8);
    engine.pushLeakedHint('@Frank 偷过我工位的零食');
    // Speech contains '偷过我工' — 4-char window from the hint.
    const r = engine.detectLeakQuote('我听说有人偷过我工位上的咖啡');
    expect(r).toBe('@Frank 偷过我工位的零食');
  });

  it('does not match when speech only shares short tokens', () => {
    const engine = newEngine(8);
    engine.pushLeakedHint('@Frank 偷过我工位的零食');
    // No 4-char run from the hint appears.
    const r = engine.detectLeakQuote('今天天气真好');
    expect(r).toBeNull();
  });

  it('returns the matched hint, not just true', () => {
    const engine = newEngine(8);
    engine.pushLeakedHint('A 在装大度');
    engine.pushLeakedHint('B 在偷茶水');
    // Speech matches the second hint.
    const r = engine.detectLeakQuote('听说 B 在偷茶水间的零食');
    expect(r).toBe('B 在偷茶水');
  });

  it('rejects matches that are only punctuation/whitespace windows', () => {
    const engine = newEngine(8);
    engine.pushLeakedHint('   ,,,,    ');
    // Hint after trim is too short to scan — should return null.
    const r = engine.detectLeakQuote(',,,,');
    expect(r).toBeNull();
  });
});

describe('GameEngine — ghostVotes tally shape', () => {
  it('initial ghostVotes is empty', () => {
    const engine = newEngine(8);
    expect(engine.state.ghostVotes).toEqual({});
  });

  it('serialized state echoes ghostVotes', () => {
    const engine = newEngine(8);
    // Manually inject as if a ghost cast — bypasses async loop.
    engine.state.ghostVotes = { 'player_8': 'player_3' };
    const ser = engine.getSerializedState();
    expect(ser.ghostVotes).toEqual({ 'player_8': 'player_3' });
  });
});
