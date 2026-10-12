/**
 * /api/llm — v6.167 — BYOK 模型设置面板的「测试连接」。
 *
 *   POST /api/llm/check  用请求头 X-Byok 里访客自己的 key:
 *     1. GET {baseURL}/models 拉模型列表(多数 OpenAI 兼容接口支持;拉不到不算失败)
 *     2. 用访客选的模型发一条极短的请求,确认 key、模型、余额都可用
 *     3. 若访客选了模型商语音 / MiniMax 语音,再合成两个字试试
 *   只回报成功与否、失败原因类别、耗时和模型 id 列表——绝不回显 key。
 */
import { Hono } from 'hono';
import { findProvider, resolveBaseURL } from '@furball/shared';
import { callLLMWithTimeout } from '../utils/llm';
import { chatModel, currentAi, currentByok } from '../utils/aiClient';
import { createRateLimiter } from '../utils/rateLimit';
import { clientIp } from '../utils/clientIp';
import { generateTTSAudio } from '../services/tts';

export const llmRoutes = new Hono();

const checkLimiter = createRateLimiter({ windowMs: 60_000, max: 12 });
const MODEL_ID_RE = /^[A-Za-z0-9._:/@+-]{1,128}$/;

/** GET {baseURL}/models → 模型 id 列表;任何失败返回 null(不影响连通性结论)。 */
export async function listProviderModels(baseURL: string, apiKey: string, timeoutMs = 8_000): Promise<string[] | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${baseURL.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    const j = await r.json() as { data?: Array<{ id?: unknown }> };
    if (!Array.isArray(j.data)) return null;
    const ids = j.data.map((m) => m?.id).filter((id): id is string => typeof id === 'string' && MODEL_ID_RE.test(id));
    return [...new Set(ids)].sort().slice(0, 300);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

llmRoutes.post('/check', async (c) => {
  const rate = checkLimiter.check(clientIp(c));
  if (!rate.ok) return c.json({ ok: false, reason: 'rate_limited', retryAfterSec: rate.retryAfterSec }, 429);

  const byok = currentByok();
  if (!byok) {
    const invalid = currentAi()?.byokError;
    return c.json({ ok: false, reason: invalid ? 'invalid_config' : 'need_key', detail: invalid }, 400);
  }

  const started = Date.now();
  const models = await listProviderModels(resolveBaseURL(byok), byok.apiKey);
  const res = await callLLMWithTimeout('CHECK', {
    model: chatModel('main', byok.model),
    prompt: '只回复两个字:收到',
    maxTokens: 16,
    temperature: 0,
  });

  let tts: 'browser' | 'ok' | 'failed' = 'browser';
  if (res.ok && byok.tts && byok.tts.mode !== 'browser') {
    tts = (await generateTTSAudio('收到', 'villager_cat')) ? 'ok' : 'failed';
  }

  return c.json({
    ok: res.ok,
    reason: res.ok ? undefined : res.reason,
    latencyMs: Date.now() - started,
    provider: byok.provider,
    providerName: findProvider(byok.provider)?.name,
    model: byok.model,
    models,
    modelListed: models ? models.includes(byok.model) : null,
    tts,
  }, res.ok ? 200 : 502);
});
