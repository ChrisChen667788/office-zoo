/**
 * FeatureGate — v6.168 — 托管版关闭的页面(收款 / B2B)直接访问时回首页。
 * 配置未到达时先不渲染(避免托管版闪一下 Premium 页)。
 */
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useRuntimeConfig, type FeatureFlags } from '../utils/runtimeConfig';

export default function FeatureGate({ flag, children }: { flag: keyof FeatureFlags; children: ReactNode }) {
  const cfg = useRuntimeConfig();
  if (!cfg) return null;
  return cfg.features[flag] ? <>{children}</> : <Navigate to="/" replace />;
}
