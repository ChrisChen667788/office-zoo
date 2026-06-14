/**
 * v6.89 — 双公司商业抹黑纯引擎回归:出手阈值 / 真假阈值 / 选黑目标。
 */
import { describe, it, expect } from 'vitest';
import {
  resolveSmear, smearTruthful, pickSmearTarget,
  SMEAR_CHANCE, SMEAR_TRUTH_RATE, SMEAR_PRESSURE,
} from '../dual/smear';

describe('smear — 出手 / 真假阈值', () => {
  it('resolveSmear:roll < SMEAR_CHANCE 才出手', () => {
    expect(resolveSmear(SMEAR_CHANCE - 0.01)).toBe(true);
    expect(resolveSmear(SMEAR_CHANCE)).toBe(false);       // 边界:>= 不出手
    expect(resolveSmear(0.99)).toBe(false);
  });
  it('smearTruthful:roll < SMEAR_TRUTH_RATE 为真', () => {
    expect(smearTruthful(SMEAR_TRUTH_RATE - 0.01)).toBe(true);
    expect(smearTruthful(SMEAR_TRUTH_RATE)).toBe(false);
    expect(smearTruthful(0.9)).toBe(false);
  });
  it('常量自洽:概率在 (0,1),压力为正整数', () => {
    expect(SMEAR_CHANCE).toBeGreaterThan(0);
    expect(SMEAR_CHANCE).toBeLessThan(1);
    expect(SMEAR_TRUTH_RATE).toBeGreaterThan(0);
    expect(SMEAR_TRUTH_RATE).toBeLessThan(1);
    expect(SMEAR_PRESSURE).toBeGreaterThanOrEqual(1);
  });
});

describe('smear — 选黑目标', () => {
  it('选完成任务最多者(最逼近垄断)', () => {
    const t = pickSmearTarget([
      { id: 'x', tasksDone: 1 },
      { id: 'y', tasksDone: 4 },
      { id: 'z', tasksDone: 2 },
    ]);
    expect(t?.id).toBe('y');
  });
  it('并列取传入顺序靠前者(确定性)', () => {
    const t = pickSmearTarget([
      { id: 'first', tasksDone: 3 },
      { id: 'second', tasksDone: 3 },
    ]);
    expect(t?.id).toBe('first');
  });
  it('空列表 → null', () => {
    expect(pickSmearTarget([])).toBeNull();
  });
});
