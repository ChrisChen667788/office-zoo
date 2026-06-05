/**
 * v6.52 P2 — core game-loop resolution coverage.
 *
 * The existing GameEngine.test.ts covers construction + leak detection but
 * NEVER exercised the actual win/lose/vote machinery — the most important
 * gameplay code. These tests drive the private resolvers directly (via
 * `as any`, the same pragmatic white-box approach the repo already uses for
 * internals) without touching the LLM: we set up state, call the resolver,
 * assert the mutation.
 *
 *   - resolveVotes: unique-max elimination, tie = nobody out, ghost votes
 *     counted equally, all-skip = nobody out.
 *   - checkWin: CAT_WIN (dogs cleared), DOG_WIN (dogs ≥ cats), task victory,
 *     and the no-win steady state.
 *   - resolveNightActions (v6.52 P1): medic protection target, detective
 *     investigation accrual + private intel.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../GameEngine';
import { Role, Team, WinCondition } from '@furball/shared';

function freshEngine(count = 8): GameEngine {
  const e = new GameEngine(count);
  e.createPlayers();
  return e;
}

describe('GameEngine — resolveVotes (vote resolution)', () => {
  it('eliminates the unique top-voted player', async () => {
    const e = freshEngine(8);
    const p = e.state.players;
    const target = p[3];
    e.state.votes = {
      [p[0].id]: target.id, [p[1].id]: target.id, [p[2].id]: target.id,
    };
    await (e as unknown as { resolveVotes(): Promise<void> }).resolveVotes();
    expect(e.state.players.find((x) => x.id === target.id)!.isAlive).toBe(false);
  });

  it('a tie eliminates nobody', async () => {
    const e = freshEngine(8);
    const p = e.state.players;
    e.state.votes = { [p[0].id]: p[2].id, [p[1].id]: p[3].id }; // 1–1 at max
    await (e as unknown as { resolveVotes(): Promise<void> }).resolveVotes();
    expect(e.state.players.find((x) => x.id === p[2].id)!.isAlive).toBe(true);
    expect(e.state.players.find((x) => x.id === p[3].id)!.isAlive).toBe(true);
  });

  it('ghost votes count equally and can break a tie', async () => {
    const e = freshEngine(8);
    const p = e.state.players;
    e.state.votes = { [p[0].id]: p[2].id, [p[1].id]: p[3].id }; // tie 1–1
    e.state.ghostVotes = { [p[5].id]: p[3].id }; // tips p3 → 2
    await (e as unknown as { resolveVotes(): Promise<void> }).resolveVotes();
    expect(e.state.players.find((x) => x.id === p[3].id)!.isAlive).toBe(false);
    expect(e.state.players.find((x) => x.id === p[2].id)!.isAlive).toBe(true);
  });

  it('all-skip eliminates nobody', async () => {
    const e = freshEngine(8);
    const p = e.state.players;
    e.state.votes = { [p[0].id]: 'skip', [p[1].id]: 'skip' };
    await (e as unknown as { resolveVotes(): Promise<void> }).resolveVotes();
    expect(e.state.players.every((x) => x.isAlive)).toBe(true);
  });
});

describe('GameEngine — checkWin (win conditions)', () => {
  const checkWin = (e: GameEngine) =>
    (e as unknown as { checkWin(): boolean }).checkWin();

  it('CAT_WIN when all dogs (资本家) are eliminated', () => {
    const e = freshEngine(8);
    for (const p of e.state.players) if (p.team === Team.DOG) p.isAlive = false;
    expect(checkWin(e)).toBe(true);
    expect(e.state.winner).toBe(WinCondition.CAT_WIN);
  });

  it('DOG_WIN when dogs reach parity with cats', () => {
    const e = freshEngine(8);
    const dogCount = e.state.players.filter((p) => p.team === Team.DOG).length;
    let aliveCats = e.state.players.filter((p) => p.team === Team.CAT).length;
    for (const c of e.state.players.filter((p) => p.team === Team.CAT)) {
      if (dogCount >= aliveCats) break;
      c.isAlive = false;
      aliveCats--;
    }
    expect(checkWin(e)).toBe(true);
    expect(e.state.winner).toBe(WinCondition.DOG_WIN);
  });

  it('CAT_WIN on task completion (taskProgress ≥ 100)', () => {
    const e = freshEngine(8); // 2 dogs < 5 cats → first two branches skip
    e.state.taskProgress = 100;
    expect(checkWin(e)).toBe(true);
    expect(e.state.winner).toBe(WinCondition.CAT_WIN);
  });

  it('no win while dogs alive, dogs < cats, tasks incomplete', () => {
    const e = freshEngine(8);
    e.state.taskProgress = 40;
    expect(checkWin(e)).toBe(false);
    expect(e.state.winner).toBe(WinCondition.NONE);
  });
});

describe('GameEngine — resolveNightActions (role abilities)', () => {
  const night = (e: GameEngine) =>
    (e as unknown as { resolveNightActions(): void }).resolveNightActions();

  it('medic protects a living player other than itself', () => {
    const e = freshEngine(8);
    const medic = e.state.players.find((p) => p.role === Role.MEDIC_CAT)!;
    night(e);
    const id = e.state.protectedPlayerId;
    expect(id).toBeTruthy();
    expect(id).not.toBe(medic.id);
    expect(e.state.players.find((p) => p.id === id)!.isAlive).toBe(true);
  });

  it('detective investigates a new target each round (accrues)', () => {
    const e = freshEngine(8);
    night(e);
    night(e);
    const seen = (e as unknown as { investigatedByDetective: Set<string> }).investigatedByDetective;
    expect(seen.size).toBe(2);
  });

  it('detective receives private intel it can act on', () => {
    const e = freshEngine(8);
    const detective = e.state.players.find((p) => p.role === Role.DETECTIVE_CAT)!;
    night(e);
    const agent = (e as unknown as { agents: Map<string, unknown> }).agents.get(detective.id);
    const intel = (agent as { roleIntel: string[] }).roleIntel;
    expect(intel.length).toBeGreaterThan(0);
    expect(intel[0]).toContain('查了');
  });

  it('protection is refreshed every round (never stale)', () => {
    const e = freshEngine(8);
    night(e);
    expect(e.state.protectedPlayerId).toBeTruthy();
    night(e);
    expect(e.state.protectedPlayerId).toBeTruthy();
  });
});
