/**
 * v6.52 P1 — pure night-action target selection.
 */
import { describe, it, expect } from 'vitest';
import { Team } from '@furball/shared';
import {
  chooseInvestigateTarget, chooseProtectTarget, teamLabel, resolveKillTarget,
  assignAvatarKeys, AVATAR_POOL,
} from '../roleAbilities';

const alive = [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
// deterministic rand: always picks index 0 of the pool.
const first = () => 0;
// picks the last of the pool (just under 1).
const last = () => 0.999;

describe('chooseInvestigateTarget', () => {
  it('never returns the detective itself', () => {
    expect(chooseInvestigateTarget('p0', alive, new Set(), first)).toBe('p1');
  });

  it('prefers a not-yet-checked target', () => {
    // p1 already checked → first-of-pool should skip to p2.
    expect(chooseInvestigateTarget('p0', alive, new Set(['p1']), first)).toBe('p2');
  });

  it('falls back to any other player once everyone is checked', () => {
    const checked = new Set(['p1', 'p2', 'p3']);
    const out = chooseInvestigateTarget('p0', alive, checked, first);
    expect(out).toBe('p1'); // pool = all others again
  });

  it('returns null when the detective is the only one alive', () => {
    expect(chooseInvestigateTarget('p0', [{ id: 'p0' }], new Set(), first)).toBeNull();
  });
});

describe('chooseProtectTarget', () => {
  it('prefers protecting someone other than self', () => {
    expect(chooseProtectTarget('p0', alive, first)).toBe('p1');
    expect(chooseProtectTarget('p0', alive, last)).toBe('p3');
  });

  it('self-protects only when alone', () => {
    expect(chooseProtectTarget('p0', [{ id: 'p0' }], first)).toBe('p0');
  });

  it('returns null on empty roster', () => {
    expect(chooseProtectTarget('p0', [], first)).toBeNull();
  });
});

describe('teamLabel', () => {
  it('maps each team to its faction label', () => {
    expect(teamLabel(Team.DOG)).toBe('资本家(管理层)');
    expect(teamLabel(Team.CAT)).toBe('打工人');
    expect(teamLabel(Team.NEUTRAL)).toBe('摸鱼人(中立)');
  });
});

describe('resolveKillTarget (protection matrix)', () => {
  it('kills the victim when there is no protection', () => {
    expect(resolveKillTarget('v', {})).toEqual({ outcome: 'kill', dies: 'v' });
  });

  it('工会代表 nullify takes priority — nobody dies', () => {
    expect(resolveKillTarget('v', { protectedId: 'v' })).toEqual({ outcome: 'blocked', dies: null, by: 'union' });
  });

  it('v6.83 观众保护协议 blocks — by: shield', () => {
    expect(resolveKillTarget('v', { interventionShieldId: 'v' }))
      .toEqual({ outcome: 'blocked', dies: null, by: 'shield' });
  });

  it('v6.83 shield 只罩目标鼠 — 别人照裁', () => {
    expect(resolveKillTarget('v', { interventionShieldId: 'other' }))
      .toEqual({ outcome: 'kill', dies: 'v' });
  });

  it('v6.83 shield 优先级高于工会 + 法务(by 标 shield)', () => {
    const r = resolveKillTarget('v', {
      interventionShieldId: 'v', protectedId: 'v',
      bodyguardTargetId: 'v', bodyguardId: 'bg', bodyguardAlive: true,
    });
    expect(r).toEqual({ outcome: 'blocked', dies: null, by: 'shield' });
  });

  it('法务顾问 intercepts — bodyguard dies in the victim\'s place', () => {
    const r = resolveKillTarget('v', { bodyguardTargetId: 'v', bodyguardId: 'bg', bodyguardAlive: true });
    expect(r).toEqual({ outcome: 'intercepted', dies: 'bg' });
  });

  it('medic nullify beats bodyguard intercept when both cover the victim', () => {
    const r = resolveKillTarget('v', {
      protectedId: 'v', bodyguardTargetId: 'v', bodyguardId: 'bg', bodyguardAlive: true,
    });
    expect(r.outcome).toBe('blocked');
  });

  it('bodyguard guarding a DIFFERENT player does not intercept', () => {
    const r = resolveKillTarget('v', { bodyguardTargetId: 'other', bodyguardId: 'bg', bodyguardAlive: true });
    expect(r).toEqual({ outcome: 'kill', dies: 'v' });
  });

  it('a dead bodyguard cannot intercept', () => {
    const r = resolveKillTarget('v', { bodyguardTargetId: 'v', bodyguardId: 'bg', bodyguardAlive: false });
    expect(r).toEqual({ outcome: 'kill', dies: 'v' });
  });

  it('bodyguard cannot body-block for itself (no free save)', () => {
    // bodyguard IS the victim and guarding itself → just a normal kill.
    const r = resolveKillTarget('bg', { bodyguardTargetId: 'bg', bodyguardId: 'bg', bodyguardAlive: true });
    expect(r).toEqual({ outcome: 'kill', dies: 'bg' });
  });
});

describe('assignAvatarKeys (unique per-player avatars)', () => {
  it('gives duplicate-role players DISTINCT keys (the 普通员工 ×2 case)', () => {
    const players = [
      { id: 'p0', role: 'villager_cat' },
      { id: 'p1', role: 'villager_cat' },
      { id: 'p2', role: 'detective_cat' },
    ];
    const keys = assignAvatarKeys(players);
    expect(keys.p0).toBe('villager_cat');      // first keeps its own
    expect(keys.p1).not.toBe('villager_cat');  // second gets a spare
    expect(keys.p2).toBe('detective_cat');     // unique role keeps its own
    expect(new Set(Object.values(keys)).size).toBe(3); // all distinct
  });

  it('keeps every unique-role player on its own avatar', () => {
    const players = [
      { id: 'a', role: 'detective_cat' },
      { id: 'b', role: 'medic_cat' },
      { id: 'c', role: 'killer_dog' },
    ];
    expect(assignAvatarKeys(players)).toEqual({
      a: 'detective_cat', b: 'medic_cat', c: 'killer_dog',
    });
  });

  it('produces all-distinct keys for a full 10-player roster', () => {
    const players = [
      'detective_cat', 'medic_cat', 'engineer_cat', 'bodyguard_cat', 'vigilante_cat',
      'villager_cat', 'killer_dog', 'morphing_dog', 'ninja_dog', 'jester',
    ].map((role, i) => ({ id: `p${i}`, role }));
    const keys = assignAvatarKeys(players);
    expect(new Set(Object.values(keys)).size).toBe(10);
    for (const k of Object.values(keys)) expect(AVATAR_POOL).toContain(k);
  });

  it('assigns a spare when a role is not in the pool', () => {
    const keys = assignAvatarKeys([{ id: 'x', role: 'unknown_role' }]);
    expect(AVATAR_POOL).toContain(keys.x);
  });
});
