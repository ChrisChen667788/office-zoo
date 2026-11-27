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

export interface LlmRuntime {
  /** byok:服务器不提供模型 API,必须配置自己的 key;server:本机 .env(配了自己的 key 时优先用)。 */
  keyMode: 'server' | 'byok';
  /** 设置面板里是否允许「其他 OpenAI 兼容接口」(自填 base URL)。 */
  customBaseUrl: boolean;
  /**
   * v6.169.5 — 服务器 .env 能不能提供文本模型(主路 OPENAI_API_KEY / QINGYUN_API_KEY,或只配了 MiniMax 备路)。
   * 老服务器没有这个字段时为 undefined,按「不知道」处理(不显示未配置横幅)。
   */
  serverKeyConfigured?: boolean;
  /** v6.169.5 — 本机 .env 模式下的模型名(配了 key 才有),用来读「检测服务器模型」的缓存。 */
  serverModel?: string;
}

export interface RuntimeConfig {
  profile: 'local' | 'hosted';
  analytics: { umami: { scriptUrl: string; websiteId: string } | null };
  features: FeatureFlags;
  llm: LlmRuntime;
}

const FEATURES_OFF: FeatureFlags = { payments: false, b2b: false, wrappedEmail: false };
/** 老服务器(没有 features 字段)= 本机自部署的历史行为,全部开启。 */
const FEATURES_LEGACY: FeatureFlags = { payments: true, b2b: true, wrappedEmail: true };

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  profile: 'local',
  analytics: { umami: null },
  features: FEATURES_LEGACY,
  llm: { keyMode: 'server', customBaseUrl: true },
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
        llm: { ...DEFAULT_RUNTIME_CONFIG.llm, ...(j?.llm ?? {}) },
      }))
      .catch(() => publish(DEFAULT_RUNTIME_CONFIG));
  }
  return pending;
}

/** 同步读取(还没拿到配置时为 null)。 */
export function peekRuntimeConfig(): RuntimeConfig | null {
  return current;
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

/**
 * v6.169 — Premium 场景点下去怎么办。
 *   open    可以选(不是 Premium 场景 / 已是会员 / 这个站点不收款,没有付费墙)
 *   locked  有付费墙,去升级页
 *   pending 配置还没到,不知道有没有付费墙:先不响应点击
 * 入口按钮在配置到达前按「关」处理没问题(晚几十毫秒出现);但「锁」不能按关处理 ——
 * 那样本机部署在配置到达前的一瞬间,Premium 场景是能选中并开始的。
 */
export type PremiumGate = 'open' | 'locked' | 'pending';

export function premiumGate(isPremiumScenario: boolean | undefined, hasPremium: boolean, cfg: RuntimeConfig | null): PremiumGate {
  if (!isPremiumScenario || hasPremium) return 'open';
  if (cfg === null) return 'pending';
  return cfg.features.payments ? 'locked' : 'open';
}

/** 测试用:清掉缓存。 */
export function __resetRuntimeConfigForTest(): void {
  pending = null;
  current = null;
}
