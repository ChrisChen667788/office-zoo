/**
 * runtimeConfig — v6.163 — 读服务器 GET /api/config(公开运行时配置,不含任何密钥),整页只请求一次。
 * 拿不到(老服务器 / 网络错误)时用本机默认值,前端照常工作。
 *
 * v6.168 — 加 features(托管版收口:收款 / B2B / 邮箱订阅)与 React hook。配置到达之前
 * features 一律按「关」处理:托管版不会闪出 Premium / B2B 入口,本机开发晚几十毫秒出现而已。
 */
import { useSyncExternalStore } from 'react';

export interface FeatureFlags {
  payments: boolean;
  b2b: boolean;
  wrappedEmail: boolean;
}

export interface RuntimeConfig {
  profile: 'local' | 'hosted';
  analytics: { umami: { scriptUrl: string; websiteId: string } | null };
  features: FeatureFlags;
}

const FEATURES_OFF: FeatureFlags = { payments: false, b2b: false, wrappedEmail: false };
/** 老服务器(没有 features 字段)= 本机自部署的历史行为,全部开启。 */
const FEATURES_LEGACY: FeatureFlags = { payments: true, b2b: true, wrappedEmail: true };

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  profile: 'local',
  analytics: { umami: null },
  features: FEATURES_LEGACY,
};

let pending: Promise<RuntimeConfig> | null = null;
let current: RuntimeConfig | null = null;
const listeners = new Set<() => void>();

function publish(cfg: RuntimeConfig): RuntimeConfig {
  current = cfg;
  for (const l of listeners) l();
  return cfg;
}

export function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (!pending) {
    pending = fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Partial<RuntimeConfig> | null) => publish({
        ...DEFAULT_RUNTIME_CONFIG,
        ...(j ?? {}),
        analytics: { ...DEFAULT_RUNTIME_CONFIG.analytics, ...(j?.analytics ?? {}) },
        features: { ...FEATURES_LEGACY, ...(j?.features ?? {}) },
      }))
      .catch(() => publish(DEFAULT_RUNTIME_CONFIG));
  }
  return pending;
}

/** React:配置到达前返回 null。 */
export function useRuntimeConfig(): RuntimeConfig | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); void getRuntimeConfig(); return () => listeners.delete(cb); },
    () => current,
    () => current,
  );
}

/** React:功能开关;配置到达前全部按关处理。 */
export function useFeatures(): FeatureFlags {
  return useRuntimeConfig()?.features ?? FEATURES_OFF;
}

/** 测试用:清掉缓存。 */
export function __resetRuntimeConfigForTest(): void {
  pending = null;
  current = null;
}
