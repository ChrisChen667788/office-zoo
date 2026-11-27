/**
 * v6.169.5 — deriveModelStatus 分支覆盖测试。
 */
import { describe, it, expect } from 'vitest';
import { deriveModelStatus } from '../modelStatus';
import type { CapabilityReport } from '@furball/shared';

function makeReport(overall: CapabilityReport['overall']): CapabilityReport {
  return {
    v: 1,
    overall,
    items: [],
    source: 'byok',
    provider: 'deepseek',
    model: 'deepseek-chat',
    checkedAt: Date.now(),
    totalMs: 100,
  };
}

describe('deriveModelStatus', () => {
  // ── 有页面 key ───────────────────────────────────────────────────────────
  it('有 byok + 无报告 → unchecked', () => {
    expect(deriveModelStatus({ keyMode: 'byok', serverKeyConfigured: undefined, hasByok: true, report: null })).toBe('unchecked');
  });

  it('有 byok + pass 报告 → pass', () => {
    expect(deriveModelStatus({ keyMode: 'byok', serverKeyConfigured: undefined, hasByok: true, report: makeReport('pass') })).toBe('pass');
  });

  it('有 byok + warn 报告 → warn', () => {
    expect(deriveModelStatus({ keyMode: 'byok', serverKeyConfigured: undefined, hasByok: true, report: makeReport('warn') })).toBe('warn');
  });

  it('有 byok + fail 报告 → fail', () => {
    expect(deriveModelStatus({ keyMode: 'byok', serverKeyConfigured: undefined, hasByok: true, report: makeReport('fail') })).toBe('fail');
  });

  it('有 byok + incomplete 报告 → unchecked', () => {
    expect(deriveModelStatus({ keyMode: 'byok', serverKeyConfigured: undefined, hasByok: true, report: makeReport('incomplete') })).toBe('unchecked');
  });

  // ── 没有页面 key ─────────────────────────────────────────────────────────
  it('byok 模式 + 无 byok → unconfigured', () => {
    expect(deriveModelStatus({ keyMode: 'byok', serverKeyConfigured: undefined, hasByok: false, report: null })).toBe('unconfigured');
  });

  it('server 模式 + serverKeyConfigured=false → unconfigured', () => {
    expect(deriveModelStatus({ keyMode: 'server', serverKeyConfigured: false, hasByok: false, report: null })).toBe('unconfigured');
  });

  it('server 模式 + serverKeyConfigured=true + 无报告 → server', () => {
    expect(deriveModelStatus({ keyMode: 'server', serverKeyConfigured: true, hasByok: false, report: null })).toBe('server');
  });

  it('server 模式 + serverKeyConfigured=true + pass 报告 → pass', () => {
    const r = { ...makeReport('pass'), source: 'server' as const };
    expect(deriveModelStatus({ keyMode: 'server', serverKeyConfigured: true, hasByok: false, report: r })).toBe('pass');
  });

  it('server 模式 + serverKeyConfigured=true + fail 报告 → fail', () => {
    const r = { ...makeReport('fail'), source: 'server' as const };
    expect(deriveModelStatus({ keyMode: 'server', serverKeyConfigured: true, hasByok: false, report: r })).toBe('fail');
  });

  it('server 模式 + serverKeyConfigured=undefined(老服务器) → server', () => {
    expect(deriveModelStatus({ keyMode: 'server', serverKeyConfigured: undefined, hasByok: false, report: null })).toBe('server');
  });

  // serverKeyConfigured=true 但有 byok 时仍然按 byok 处理
  it('server 模式 + 有 byok + serverKeyConfigured=true → pass(按报告走)', () => {
    const r = makeReport('pass');
    expect(deriveModelStatus({ keyMode: 'server', serverKeyConfigured: true, hasByok: true, report: r })).toBe('pass');
  });
});
