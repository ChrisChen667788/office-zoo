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

export interface KillResolution {
  /** 'blocked' = 工会代表 nullified it; 'intercepted' = 法务顾问 took the hit;
   *  'kill' = the optimization lands on the original victim. */
  outcome: 'kill' | 'blocked' | 'intercepted';
  /** Who actually dies. null when blocked. For 'intercepted' this is the
   *  bodyguard (法务顾问), NOT the original victim. */
  dies: string | null;
}

/**
 * v6.53 P1 — pure resolution of a single night kill against `victimId`,
 * given the round's protections. Priority: 工会代表(nullify) >
 * 法务顾问(intercept/sacrifice) > kill. The bodyguard only intercepts when
 * it's alive, guarding THIS victim, and not the victim itself. Pure so the
 * protection matrix is unit-testable without running free-roam.
 */
export function resolveKillTarget(
  victimId: string,
  opts: {
    protectedId?: string;
    bodyguardTargetId?: string;
    bodyguardId?: string;
    bodyguardAlive?: boolean;
  },
): KillResolution {
  if (opts.protectedId && victimId === opts.protectedId) {
    return { outcome: 'blocked', dies: null };
  }
  if (
    opts.bodyguardTargetId && victimId === opts.bodyguardTargetId &&
    opts.bodyguardId && opts.bodyguardAlive && opts.bodyguardId !== victimId
  ) {
    return { outcome: 'intercepted', dies: opts.bodyguardId };
  }
  return { outcome: 'kill', dies: victimId };
}
