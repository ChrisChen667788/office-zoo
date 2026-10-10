/**
 * GET /api/config — v6.163 — 前端在运行时读取的公开配置。
 *
 * 为什么放运行时而不是 VITE_ 构建变量:同一个 Docker 镜像换几个环境变量就能开关统计、
 * 切换部署形态,不用为每个部署单独重新构建前端。这里只放**可以公开**的东西
 * (统计脚本地址、站点 id、部署形态),不放任何密钥。
 */
import { Hono } from 'hono';
import { deployProfile } from '../utils/deployProfile';
import { featureFlags } from '../utils/hostedFeatures';

export interface PublicAnalyticsConfig {
  umami: { scriptUrl: string; websiteId: string } | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 只接受 https(或本机 http)的脚本地址 + UUID 形式的站点 id;任一不合法就当没配置。 */
export function analyticsConfig(): PublicAnalyticsConfig {
  const scriptUrl = process.env.UMAMI_SCRIPT_URL?.trim() ?? '';
  const websiteId = process.env.UMAMI_WEBSITE_ID?.trim() ?? '';
  if (!scriptUrl || !UUID_RE.test(websiteId)) return { umami: null };
  try {
    const u = new URL(scriptUrl);
    const localHttp = u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);
    if (u.protocol !== 'https:' && !localHttp) return { umami: null };
    return { umami: { scriptUrl: u.toString(), websiteId } };
  } catch {
    return { umami: null };
  }
}

export const configRoutes = new Hono();

configRoutes.get('/', (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({
    profile: deployProfile(),
    analytics: analyticsConfig(),
    // v6.168 — 托管版功能收口(收款 / B2B / 邮箱订阅),前端据此隐藏入口
    features: featureFlags(),
  });
});
