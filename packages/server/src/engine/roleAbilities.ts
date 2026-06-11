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

/**
 * v6.55 #2 — the cached avatar pool (mirrors packages/server/avatars/*.png and
 * imageGen.ts ROLE_ART_DETAILS). 23 distinct office-animal portraits; the
 * server already pushes all of them to the client. Used to give every player
 * in a game a UNIQUE avatar so duplicate-role rosters (e.g. 普通员工 ×2) don't
 * show the same face.
 */
export const AVATAR_POOL: readonly string[] = [
  'villager_cat', 'detective_cat', 'medic_cat', 'engineer_cat', 'bodyguard_cat',
  'medium_cat', 'vigilante_cat', 'adventurer_cat', 'mimic_cat', 'politician_cat',
  'killer_dog', 'spy_dog', 'morphing_dog', 'ninja_dog', 'hypnotist_dog',
  'bomber_dog', 'assassin_dog', 'silencer_dog',
  'jester', 'phantom', 'pigeon', 'lone_wolf', 'lover',
];

/**
 * Assign each player a UNIQUE avatar key. A player keeps its own role's avatar
 * when free (so a detective still looks like the detective); duplicate-role
 * players + roles missing from the pool draw an unused key instead. Returns a
 * playerId → avatarKey map. Pure + deterministic (no rng) so it's testable and
 * stable across reconnects. If players outnumber the pool (never in practice,
 * ≤10 vs 23) the overflow falls back to the role (an accepted dup).
 */
export function assignAvatarKeys(
  players: ReadonlyArray<{ id: string; role?: string }>,
  pool: readonly string[] = AVATAR_POOL,
): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  // Pass 1 — own-role avatar when still free.
  for (const p of players) {
    if (p.role && pool.includes(p.role) && !used.has(p.role)) {
      out[p.id] = p.role;
      used.add(p.role);
    }
  }
  // Pass 2 — fill the rest from unused pool keys (in pool order, deterministic).
  const spares = pool.filter((k) => !used.has(k));
  let si = 0;
  for (const p of players) {
    if (out[p.id]) continue;
    if (si < spares.length) {
      out[p.id] = spares[si++];
      used.add(out[p.id]);
    } else {
      out[p.id] = p.role ?? pool[0]; // pool exhausted — accept a dup (won't happen at ≤10)
    }
  }
  return out;
}

export interface KillResolution {
  /** 'blocked' = 工会代表/观众保护协议 nullified it; 'intercepted' = 法务顾问
   *  took the hit; 'kill' = the optimization lands on the original victim. */
  outcome: 'kill' | 'blocked' | 'intercepted';
  /** Who actually dies. null when blocked. For 'intercepted' this is the
   *  bodyguard (法务顾问), NOT the original victim. */
  dies: string | null;
  /** v6.83 — who blocked it (only set on 'blocked'): 'union' = 工会代表,
   *  'shield' = 观众筹码买的「裁员保护协议」。Engine 拿它选剧场文案。 */
  by?: 'union' | 'shield';
}

/**
 * v6.53 P1 — pure resolution of a single night kill against `victimId`,
 * given the round's protections. Priority: 观众保护协议(v6.83, nullify) >
 * 工会代表(nullify) > 法务顾问(intercept/sacrifice) > kill. The bodyguard
 * only intercepts when it's alive, guarding THIS victim, and not the victim
 * itself. Pure so the protection matrix is unit-testable without free-roam.
 */
export function resolveKillTarget(
  victimId: string,
  opts: {
    protectedId?: string;
    bodyguardTargetId?: string;
    bodyguardId?: string;
    bodyguardAlive?: boolean;
    /** v6.83 — 观众筹码买的一次性保护(消费由 engine 负责)。 */
    interventionShieldId?: string;
  },
): KillResolution {
  if (opts.interventionShieldId && victimId === opts.interventionShieldId) {
    return { outcome: 'blocked', dies: null, by: 'shield' };
  }
  if (opts.protectedId && victimId === opts.protectedId) {
    return { outcome: 'blocked', dies: null, by: 'union' };
  }
  if (
    opts.bodyguardTargetId && victimId === opts.bodyguardTargetId &&
    opts.bodyguardId && opts.bodyguardAlive && opts.bodyguardId !== victimId
  ) {
    return { outcome: 'intercepted', dies: opts.bodyguardId };
  }
  return { outcome: 'kill', dies: victimId };
}
