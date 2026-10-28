/**
 * llmStats — v6.163 — 进程内的模型调用计数,/api/health 读取。
 * 只记次数与原因类别,不记提示词、不记 key。重启归零(够回答「上线后失败率多少」)。
 */
import type { LLMTimeoutKind } from './llm';

export type LlmFailReason = 'timeout' | 'error' | 'empty' | 'need_key' | 'key_rejected' | 'quota' | 'rate_limited';

interface Counters {
  calls: number;
  ok: number;
  fallbackOk: number;
  failed: Record<LlmFailReason, number>;
  byKind: Partial<Record<LLMTimeoutKind, { calls: number; failed: number }>>;
  since: number;
}

function fresh(): Counters {
  return {
    calls: 0, ok: 0, fallbackOk: 0,
    failed: { timeout: 0, error: 0, empty: 0, need_key: 0, key_rejected: 0, quota: 0, rate_limited: 0 },
    byKind: {},
    since: Date.now(),
  };
}

let c = fresh();

export function recordLlmCall(kind: LLMTimeoutKind, outcome: { ok: true; viaFallback?: boolean } | { ok: false; reason: LlmFailReason }): void {
  c.calls += 1;
  const k = (c.byKind[kind] ??= { calls: 0, failed: 0 });
  k.calls += 1;
  if (outcome.ok) {
    if (outcome.viaFallback) c.fallbackOk += 1; else c.ok += 1;
  } else {
    c.failed[outcome.reason] += 1;
    k.failed += 1;
  }
}

export function llmStatsSnapshot() {
  const failed = Object.values(c.failed).reduce((a, b) => a + b, 0);
  return {
    ...c,
    failedTotal: failed,
    failRate: c.calls ? +(failed / c.calls).toFixed(3) : 0,
  };
}

export function __resetLlmStatsForTest(): void {
  c = fresh();
}
