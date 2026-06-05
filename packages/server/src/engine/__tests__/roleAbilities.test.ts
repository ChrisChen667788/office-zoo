/**
 * v6.52 P1 — pure night-action target selection.
 */
import { describe, it, expect } from 'vitest';
import { Team } from '@furball/shared';
import {
  chooseInvestigateTarget, chooseProtectTarget, teamLabel, resolveKillTarget,
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
    expect(resolveKillTarget('v', { protectedId: 'v' })).toEqual({ outcome: 'blocked', dies: null });
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
