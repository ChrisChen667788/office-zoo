/**
 * clientIp — v6.162 — 限流用的客户端 IP,全仓统一从这里取。
 *
 * 旧写法(各路由各写一份 ipFrom)取 X-Forwarded-For 的**第一个**地址,而这一项是客户端
 * 自己能随便填的:带一个随机 XFF 头就能绕过所有按 IP 的限流。没有 XFF 时又退到 Host 头,
 * 等于所有人共用一个桶。
 *
 * 现在:
 *   - TRUST_PROXY_HOPS=N(hosted 默认 1,local 默认 0)表示前面有 N 层可信反向代理。
 *     每层代理把它看到的对端地址追加到 XFF 末尾,所以真实客户端是倒数第 N 个——
 *     客户端自己伪造的那些都在它左边,取不到。
 *   - N=0 或没有 XFF:用 TCP 连接的对端地址(@hono/node-server 的 c.env.incoming)。
 */
import type { IncomingMessage } from 'node:http';
import { envInt, isHosted } from './deployProfile';

interface HeaderSource {
  req: { header: (name: string) => string | undefined };
  env?: unknown;
}

export function trustProxyHops(): number {
  return envInt('TRUST_PROXY_HOPS', isHosted() ? 1 : 0);
}

/** 从 XFF 链里取第 hops 个可信代理看到的地址;链比 hops 短时取最左边(最接近客户端的已知地址)。 */
export function pickForwardedFor(xff: string | undefined, hops: number): string | null {
  if (!xff || hops <= 0) return null;
  const chain = xff.split(',').map((s) => s.trim()).filter(Boolean);
  if (chain.length === 0) return null;
  return chain[Math.max(0, chain.length - hops)] ?? null;
}

export function clientIp(c: HeaderSource): string {
  const fromProxy = pickForwardedFor(c.req.header('x-forwarded-for'), trustProxyHops());
  if (fromProxy) return fromProxy;
  const incoming = (c.env as { incoming?: IncomingMessage } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}

/** Socket.IO 握手版:同样的规则,数据来自 handshake。 */
export function socketClientIp(handshake: { headers: Record<string, string | string[] | undefined>; address: string }): string {
  const raw = handshake.headers['x-forwarded-for'];
  const xff = Array.isArray(raw) ? raw.join(',') : raw;
  return pickForwardedFor(xff, trustProxyHops()) ?? handshake.address ?? 'unknown';
}
