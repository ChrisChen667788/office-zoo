/**
 * hostedFeatures — v6.168 — 托管版的功能收口(owner 决策:暂不开发收款、B2B 冻结)。
 *
 *   payments      Premium 假结账 / Stripe 演示:托管版关闭(只会翻本地标记,对公众是误导)
 *   b2b           B2B 白标:无鉴权的公开写接口,托管版关闭
 *   wrappedEmail  Wrapped 邮件订阅:没有隐私政策之前托管版不收集邮箱
 *
 * 本机自部署保持原样。前端从 /api/config 读同一份开关隐藏入口,服务端对应接口直接 404。
 */
import type { MiddlewareHandler } from 'hono';
import { isHosted } from './deployProfile';

export interface FeatureFlags {
  payments: boolean;
  b2b: boolean;
  wrappedEmail: boolean;
}

export function featureFlags(): FeatureFlags {
  const hosted = isHosted();
  return { payments: !hosted, b2b: !hosted, wrappedEmail: !hosted };
}

const GATED: Array<[RegExp, keyof FeatureFlags]> = [
  [/^\/api\/billing(\/|$)/, 'payments'],
  [/^\/api\/b2b(\/|$)/, 'b2b'],
  [/^\/api\/wrapped(\/|$)/, 'wrappedEmail'],
];

export const hostedFeatureGate: MiddlewareHandler = async (c, next) => {
  const flags = featureFlags();
  for (const [re, flag] of GATED) {
    if (re.test(c.req.path) && !flags[flag]) return c.json({ error: 'feature_disabled', feature: flag }, 404);
  }
  await next();
};
