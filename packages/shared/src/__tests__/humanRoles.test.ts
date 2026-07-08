/**
 * v6.124 — Phase C 真人场边角色纯引擎回归:角色表 / 认领台账(一人一角·一角一人)/
 * 释放 / prompt 格式化。
 */
import { describe, it, expect } from 'vitest';
import {
  HUMAN_ROLES, humanRoleById, claimRole, releaseUserRoles, roleOfUser,
  formatHumanSpeechForPrompt, HUMAN_SPEECH_MAX_LEN, HUMAN_SPEECH_PER_ROUND_CAP,
  type RoleClaims,
} from '../human/roles';

describe('human/roles — 角色表', () => {
  it('四角色齐备:hr/union/lawyer/reporter,各有 label/emoji/promptTag', () => {
    expect(HUMAN_ROLES.map((r) => r.id)).toEqual(['hr', 'union', 'lawyer', 'reporter']);
    for (const r of HUMAN_ROLES) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.promptTag).toContain('真人');
    }
    expect(humanRoleById('lawyer')!.label).toBe('吃瓜律师');
    expect(humanRoleById('nope')).toBeUndefined();
  });
});

describe('human/roles — 认领台账', () => {
  it('空台账可认领;一角一人', () => {
    const r1 = claimRole({}, 'hr', 'u1');
    expect(r1.ok).toBe(true);
    expect(r1.claims.hr).toBe('u1');
    const r2 = claimRole(r1.claims, 'hr', 'u2');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('role_taken');
  });
  it('一人一角:占了 hr 再抢 union 被拒', () => {
    const c: RoleClaims = { hr: 'u1' };
    const r = claimRole(c, 'union', 'u1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('already_has_role');
  });
  it('幂等:重复认领自己已有的角色 ok 且台账不变', () => {
    const c: RoleClaims = { hr: 'u1' };
    const r = claimRole(c, 'hr', 'u1');
    expect(r.ok).toBe(true);
    expect(r.claims).toEqual(c);
  });
  it('未知角色拒绝', () => {
    const r = claimRole({}, 'boss' as never, 'u1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unknown_role');
  });
  it('releaseUserRoles 只释放该用户;roleOfUser 查询', () => {
    const c: RoleClaims = { hr: 'u1', union: 'u2' };
    expect(roleOfUser(c, 'u1')).toBe('hr');
    expect(roleOfUser(c, 'u3')).toBeNull();
    const after = releaseUserRoles(c, 'u1');
    expect(after).toEqual({ union: 'u2' });
  });
});

describe('human/roles — prompt 格式化', () => {
  it('带角色署名 + 截断到上限', () => {
    const line = formatHumanSpeechForPrompt('union', '  别欺负实习生  ');
    expect(line).toContain('真人工会代表');
    expect(line).toContain('别欺负实习生');
    const long = formatHumanSpeechForPrompt('hr', 'x'.repeat(500));
    expect(long.length).toBeLessThanOrEqual(HUMAN_SPEECH_MAX_LEN + 40); // 署名头 + 截断正文
  });
  it('常量 sanity:每轮上限 ≥1,长度上限合理', () => {
    expect(HUMAN_SPEECH_PER_ROUND_CAP).toBeGreaterThanOrEqual(1);
    expect(HUMAN_SPEECH_MAX_LEN).toBeGreaterThanOrEqual(50);
  });
});
