/**
 * roleAbilities — v6.52 P1 — pure night-action target selection for the
 * special cat roles. No engine/LLM deps so it's unit-testable; the engine
 * wires the results (protection blocks a kill; investigation becomes the
 * detective agent's private intel).
 *
 * Target selection is heuristic (these are AI-only games — the spectator
 * watches), and `rand` is injectable so tests are deterministic.
 */
import { Team } from '@furball/shared';

/** HR总监(DETECTIVE_CAT): each round investigates one living player's team.
 *  Prefers someone not yet checked; falls back to any other living player
 *  once everyone's been seen. Returns null when no valid target. */
export function chooseInvestigateTarget(
  detectiveId: string,
  alive: ReadonlyArray<{ id: string }>,
  alreadyChecked: ReadonlySet<string>,
  rand: () => number = Math.random,
): string | null {
  const fresh = alive.filter((p) => p.id !== detectiveId && !alreadyChecked.has(p.id));
  const pool = fresh.length > 0 ? fresh : alive.filter((p) => p.id !== detectiveId);
  if (pool.length === 0) return null;
  return pool[Math.floor(rand() * pool.length)].id;
}

/** 工会代表(MEDIC_CAT): each round protects one living player from the
 *  night kill. Prefers protecting someone other than self (more useful);
 *  self-protects only when alone. Returns null when no valid target. */
export function chooseProtectTarget(
  medicId: string,
  alive: ReadonlyArray<{ id: string }>,
  rand: () => number = Math.random,
): string | null {
  const others = alive.filter((p) => p.id !== medicId);
  const pool = others.length > 0 ? others : alive;
  if (pool.length === 0) return null;
  return pool[Math.floor(rand() * pool.length)].id;
}

/** Faction label for the detective's intel line (what the AI "learned"). */
export function teamLabel(team: Team): string {
  if (team === Team.DOG) return '资本家(管理层)';
  if (team === Team.CAT) return '打工人';
  return '摸鱼人(中立)';
}
