/**
 * runtimeConfig — v6.163 — 读服务器 GET /api/config(公开运行时配置,不含任何密钥),整页只请求一次。
 * 拿不到(老服务器 / 网络错误)时用本机默认值,前端照常工作。
 */
export interface RuntimeConfig {
  profile: 'local' | 'hosted';
  analytics: { umami: { scriptUrl: string; websiteId: string } | null };
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  profile: 'local',
  analytics: { umami: null },
};

let pending: Promise<RuntimeConfig> | null = null;

export function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (!pending) {
    pending = fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Partial<RuntimeConfig> | null) => ({
        ...DEFAULT_RUNTIME_CONFIG,
        ...(j ?? {}),
        analytics: { ...DEFAULT_RUNTIME_CONFIG.analytics, ...(j?.analytics ?? {}) },
      }))
      .catch(() => DEFAULT_RUNTIME_CONFIG);
  }
  return pending;
}

/** 测试用:清掉缓存。 */
export function __resetRuntimeConfigForTest(): void {
  pending = null;
}
