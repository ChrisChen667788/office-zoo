/**
 * bodyLimits — v6.169 — 请求体大小上限。
 *
 * 此前没有任何上限:托管版上任何人都能 POST 几个 GB 撑爆内存 —— `/api/share/transcode` 先把整段
 * 请求体读进内存、再判断是否超过 50MB。现在:
 *   - `/api/share/transcode`(唯一收视频的接口):50MB,超过就在读的过程中截断;
 *   - 其余 `/api/*`:1MB(都是小 JSON;最大的是裁了么对话历史,远小于此)。
 * 有 Content-Length 的请求直接按头判断;分块上传的边读边计数。
 */
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { MAX_INPUT_BYTES } from '../services/transcodeVideo';

export const API_BODY_LIMIT = 1024 * 1024;
export const TRANSCODE_PATH = '/api/share/transcode';

const tooLarge = (c: Context) => c.json({ error: 'payload too large' }, 413);
const apiLimit = bodyLimit({ maxSize: API_BODY_LIMIT, onError: tooLarge });
const transcodeLimit = bodyLimit({ maxSize: MAX_INPUT_BYTES, onError: tooLarge });

export function applyBodyLimits(app: Hono): void {
  app.use('/api/*', (c, next) => (c.req.path === TRANSCODE_PATH ? transcodeLimit(c, next) : apiLimit(c, next)));
}
