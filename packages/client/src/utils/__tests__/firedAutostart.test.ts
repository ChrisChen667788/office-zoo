/**
 * v6.169 — 首页「5 分钟速通」直达裁了么第一关。
 */
import { describe, it, expect } from 'vitest';
import { FIRED_AUTOSTART_PATH, autostartLevel, isAutostart } from '../firedAutostart';
import { FIRED_LEVELS } from '../../stores/firedProgress';

describe('firedAutostart', () => {
  it('速通入口带 autostart=true,解析严格', () => {
    expect(FIRED_AUTOSTART_PATH).toBe('/fired/chat?autostart=true');
    expect(isAutostart('?autostart=true')).toBe(true);
    expect(isAutostart('?autostart=1')).toBe(false);
    expect(isAutostart('')).toBe(false);
  });

  it('永远是第一关:场景与 HR 都来自关卡定义', () => {
    const lv = autostartLevel();
    expect(lv.level).toBe(1);
    expect(lv).toBe(FIRED_LEVELS.find((l) => l.level === 1));
    expect(lv.scenarioId).toBeTruthy();
    expect(['rookie', 'veteran', 'demon']).toContain(lv.personalityId);
  });
});
