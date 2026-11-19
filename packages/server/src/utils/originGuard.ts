/**
 * originGuard — v6.162 — 取代 `cors()` 全开(任意网页都能跨域调用全部接口)。
 *
 * 规则(HTTP 与 Socket.IO 共用):
 *   1. 没有 Origin 头 → 放行。服务端脚本、curl、社交平台爬虫抓 /share 都不带 Origin;
 *      浏览器发起的跨站请求一定带,所以拦截面不受影响。
 *   2. 同源(Origin 的 host == 请求的 Host)→ 放行。托管时前端与 API 同域同端口。
 *   3. 在 ALLOWED_ORIGINS(逗号分隔的完整 origin,如 https://zoo.example.com)里 → 放行。
 *   4. 未设置 ALLOWED_ORIGINS 且非 hosted:放行本机回环地址的任意端口(vite 5173、截图脚本等)。
 *   5. 其余一律拒绝。
 *
 * 只靠 CORS 响应头不够:CORS 只挡「读响应」,text/plain 的 POST 照样会执行;WebSocket 升级
 * 更是完全不受 CORS 约束。所以 HTTP 侧对不放行的 Origin 直接 403,Socket.IO 侧用
 * allowRequest 拒绝握手。
 */
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import type { ServerOptions } from 'socket.io';
import { isHosted } from './deployProfile';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function configuredOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function parseOrigin(origin: string): URL | null {
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * @param origin  请求的 Origin 头(可能缺失)
 * @param host    请求的 Host 头(用于同源判断;可能缺失)
 */
export function isOriginAllowed(origin: string | undefined | null, host?: string | null): boolean {
  if (!origin) return true;
  const u = parseOrigin(origin);
  if (!u) return false;
  if (host && u.host.toLowerCase() === host.trim().toLowerCase()) return true;
  const list = configuredOrigins();
  if (list.includes(u.origin)) return true;
  if (list.length === 0 && !isHosted() && LOOPBACK_HOSTS.has(u.hostname)) return true;
  return false;
}

/** HTTP 中间件:不放行的 Origin 直接 403。挂在所有路由之前。 */
export const originGuardMiddleware: MiddlewareHandler = async (c, next) => {
  if (!isOriginAllowed(c.req.header('origin'), c.req.header('host'))) {
    return c.json({ error: 'origin_not_allowed' }, 403);
  }
  await next();
};

/** 只给放行的跨域来源回 CORS 头(同源请求不需要)。 */
export function corsForAllowedOrigins(): MiddlewareHandler {
  return cors({
    origin: (origin, c) => (origin && isOriginAllowed(origin, c.req.header('host')) ? origin : null),
  });
}

/**
 * Socket.IO 的 Origin 规则。WebSocket 升级不受 CORS 约束,所以握手阶段用 allowRequest
 * 按同一套规则拒绝;cors 只管 long-polling 的响应头。
 */
export function socketOriginOptions(): Pick<ServerOptions, 'cors' | 'allowRequest'> {
  return {
    cors: { origin: (origin, cb) => cb(null, isOriginAllowed(origin)) },
    allowRequest: (req, cb) => cb(null, isOriginAllowed(req.headers.origin, req.headers.host)),
  };
}
