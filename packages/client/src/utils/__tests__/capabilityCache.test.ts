// @vitest-environment jsdom
/**
 * v6.169.5 — capabilityCache 单元测试。
 * 使用 jsdom 环境以获得 window/localStorage/crypto.subtle。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readCapability, writeCapability, fingerprintFor, fnv1a64 } from '../capabilityCache';
import type { CapabilityReport } from '@furball/shared';

function makeReport(overall: CapabilityReport['overall'] = 'pass'): CapabilityReport {
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

// localStorage mock
function makeMockStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
}

beforeEach(() => {
  const mockStorage = makeMockStorage();
  vi.stubGlobal('localStorage', mockStorage);
});

describe('fingerprintFor', () => {
  it('byok 指纹:不同 key 给出不同指纹', async () => {
    const a = await fingerprintFor({ v: 1, provider: 'deepseek', apiKey: 'sk-aaa', model: 'deepseek-chat' });
    const b = await fingerprintFor({ v: 1, provider: 'deepseek', apiKey: 'sk-bbb', model: 'deepseek-chat' });
    expect(a).not.toBe(b);
    expect(a.length).toBe(16);
  });

  it('server 指纹:用 model 而不用 key', async () => {
    const a = await fingerprintFor({ source: 'server', model: 'gpt-4o-mini' });
    const b = await fingerprintFor({ source: 'server', model: 'gpt-4o-mini' });
    expect(a).toBe(b);
    expect(a.length).toBe(16);
  });

  it('server 指纹:不同 model 给出不同指纹', async () => {
    const a = await fingerprintFor({ source: 'server', model: 'gpt-4o-mini' });
    const b = await fingerprintFor({ source: 'server', model: 'gpt-4o' });
    expect(a).not.toBe(b);
  });

  it('server 指纹不含 key(key 原文搜不到)', async () => {
    const fp = await fingerprintFor({ source: 'server', model: 'gpt-4o-mini' });
    // server 指纹只用 'server\n' + model,不含 key
    expect(fp).not.toContain('sk-');
  });
});

describe('readCapability / writeCapability', () => {
  it('写入后能命中', async () => {
    const fp = 'abcdef1234567890';
    const report = makeReport('pass');
    writeCapability(fp, report);
    const got = readCapability(fp);
    expect(got).not.toBeNull();
    expect(got?.overall).toBe('pass');
  });

  it('未写入时命中不到', () => {
    expect(readCapability('doesnotexist1234')).toBeNull();
  });

  it('超期条目被忽略', () => {
    const fp = 'expired1234567890';
    const report = makeReport('pass');
    writeCapability(fp, report);
    // 手动修改 savedAt 为 8 天前
    const raw = window.localStorage.getItem('office-zoo.capability.v1')!;
    const store = JSON.parse(raw) as Record<string, { report: CapabilityReport; savedAt: number }>;
    store[fp].savedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem('office-zoo.capability.v1', JSON.stringify(store));
    expect(readCapability(fp)).toBeNull();
  });

  it('超出 8 条时淘汰最旧的', () => {
    for (let i = 0; i < 9; i++) {
      writeCapability(`fp${i}`.padEnd(16, '0'), makeReport('pass'));
    }
    const raw = window.localStorage.getItem('office-zoo.capability.v1')!;
    const store = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(store).length).toBeLessThanOrEqual(8);
  });

  it('存储 getItem 抛错时不崩', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('private mode'); });
    expect(() => readCapability('abc')).not.toThrow();
    expect(readCapability('abc')).toBeNull();
  });

  it('存储 setItem 抛错时不崩', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    expect(() => writeCapability('abc'.padEnd(16, '0'), makeReport())).not.toThrow();
  });

  it('存储内容里搜不到 key 原文', async () => {
    const apiKey = 'sk-supersecretkey12345';
    const fp = await fingerprintFor({ v: 1, provider: 'deepseek', apiKey, model: 'deepseek-chat' });
    writeCapability(fp, makeReport('pass'));
    const raw = window.localStorage.getItem('office-zoo.capability.v1') ?? '';
    expect(raw).not.toContain(apiKey);
  });

  it('没有 crypto.subtle(局域网 http 打开)时退回 FNV 指纹,照样能写能读', async () => {
    const cfg = { v: 1 as const, provider: 'deepseek' as const, apiKey: 'sk-lan-test-0123456789', model: 'deepseek-chat' };
    const sha = await fingerprintFor(cfg);
    vi.stubGlobal('crypto', {});
    try {
      const fp = await fingerprintFor(cfg);
      expect(fp).toMatch(/^f[0-9a-f]{15}$/);
      expect(fp).not.toBe(sha);
      expect(fp).toBe(await fingerprintFor(cfg)); // 稳定
      expect(fp).not.toBe(await fingerprintFor({ ...cfg, apiKey: 'sk-lan-test-other' }));
      writeCapability(fp, makeReport('warn'));
      expect(readCapability(fp)?.overall).toBe('warn');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('FNV-1a 64 与标准测试向量一致', () => {
    // FNV-1a 64("") = cbf29ce484222325,("a") = af63dc4c8601ec8c;指纹去掉首位换成 f
    expect(fnv1a64('')).toBe('f' + 'cbf29ce484222325'.slice(1));
    expect(fnv1a64('a')).toBe('f' + 'af63dc4c8601ec8c'.slice(1));
  });
});
