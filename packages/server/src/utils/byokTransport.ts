/**
 * byokTransport — v6.167 — 把访客的模型凭据从请求里取出来,绑到这次请求 / 这条 Socket 上。
 *
 *   HTTP:X-Byok 请求头(base64url JSON,见 shared/byok.ts)→ byokMiddleware → runWithAi
 *   Socket.IO:握手 auth.byok → socket.data.byok(io.use 中间件)
 *
 * 不合法的凭据一律当没配(不报 500),HTTP 侧回一个 X-Byok-Error 头让前端提示。
 * 凭据只活在内存里:这里不写日志、不落盘,也不把它放进任何会被序列化的结构。
 */
import type { MiddlewareHandler } from 'hono';
import type { Server as SocketServer } from 'socket.io';
import { BYOK_HEADER, decodeByok, type ByokConfig } from '@furball/shared';
import { checkCustomBaseUrl, runWithAi, type AiContext, type AiFailReason } from './aiClient';

export interface ParsedByok {
  byok: ByokConfig | null;
  error?: string;
}

export async function parseByok(raw: unknown): Promise<ParsedByok> {
  if (raw === undefined || raw === null || raw === '') return { byok: null };
  const cfg = decodeByok(raw);
  if (!cfg) return { byok: null, error: 'invalid_byok' };
  if (cfg.provider === 'custom') {
    const verdict = await checkCustomBaseUrl(cfg.baseURL ?? '');
    if (!verdict.ok) return { byok: null, error: verdict.reason };
  }
  return { byok: cfg };
}

export const byokMiddleware: MiddlewareHandler = async (c, next) => {
  const { byok, error } = await parseByok(c.req.header(BYOK_HEADER));
  const ctx: AiContext = { byok, failures: new Set<AiFailReason>(), ...(error ? { byokError: error } : {}) };
  await runWithAi(ctx, () => next());
  // 路由各自的兜底(罐头台词、模板)照旧;另外把「访客能自己处理」的失败告诉前端,
  // 前端统一弹「先配置模型」/「key 被拒」提示。只有原因类别,没有任何 key 内容。
  if (error) c.res.headers.set('X-Byok-Error', error);
  if (ctx.failures?.size) c.res.headers.set('X-Llm-Error', [...ctx.failures].join(','));
};

/** 每条 Socket 连接握手时解析一次;换 key 时前端会重连。 */
export function attachSocketByok(io: SocketServer): void {
  io.use(async (socket, next) => {
    const auth = socket.handshake.auth as { byok?: unknown } | undefined;
    const { byok, error } = await parseByok(auth?.byok);
    socket.data.byok = byok;
    if (error) socket.data.byokError = error;
    next();
  });
}

export function socketByok(socket: { data: { byok?: ByokConfig | null } }): ByokConfig | null {
  return socket.data.byok ?? null;
}
