/**
 * /api/llm — v6.169.5 — BYOK 模型设置面板的「检测模型」(原「测试连接」)。
 *
 *   POST /api/llm/check
 *     1. 有页面 key(byok):用访客的凭据跑完整能力探针,source = 'byok'。
 *     2. 没有页面 key、keyMode === 'server' 且服务器配了 key:用 .env 配置跑探针,
 *        source = 'server';语音一律 skipped(服务器模式不测语音)。
 *     3. 两者都没有:保持原样返回 need_key。
 *
 *   返回体向后兼容:ok / reason / latencyMs / provider / providerName / model /
 *   models / modelListed / tts —— 同时新增 capability / source。
 *   HTTP 状态:C1 pass = 200;否则 502(与现在一致)。
 *
 *   安全:绝不回显任何 key。
 */
import { Hono } from 'hono';
import { findProvider, resolveBaseURL } from '@furball/shared';
import { chatModel, currentAi, currentByok, keyMode, envChatEndpoint, envDefaultModelId } from '../utils/aiClient';
import { createRateLimiter } from '../utils/rateLimit';
import { clientIp } from '../utils/clientIp';
import { runCapabilityProbe } from '../utils/capabilityProbe';
import type { CapabilityReport } from '@furball/shared';

export const llmRoutes = new Hono();

const checkLimiter = createRateLimiter({ windowMs: 60_000, max: 12 });
/**
 * 用服务器 .env key 的检测另外限流:一次检测要调 8 次模型,花的是运营者的钱;打开局域网监听(FURBALL_HOST)后
 * 同一网络的人都能点。正常人一次配置最多重测两三次,所以每个来源 10 分钟 3 次。
 */
const serverCheckLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 3 });

/**
 * 检测里的失败(key 被拒、限流……)已经写在检测结果里了。调用层会把它们记进本次请求的 failures,
 * byokMiddleware 再转成 X-Llm-Error 响应头,前端据此弹「AI 正在用兜底台词」——对检测来说是误报,清掉。
 */
function dropProbeFailures(): void {
  currentAi()?.failures?.clear();
}
/** 把 C8 状态映射成向后兼容的 tts 字段。 */
function mapTtsField(report: CapabilityReport): 'browser' | 'ok' | 'failed' {
  const c8 = report.items.find((i) => i.id === 'tts');
  if (!c8 || c8.status === 'skipped') return 'browser';
  return c8.status === 'pass' ? 'ok' : 'failed';
}

llmRoutes.post('/check', async (c) => {
  const rate = checkLimiter.check(clientIp(c));
  if (!rate.ok) return c.json({ ok: false, reason: 'rate_limited', retryAfterSec: rate.retryAfterSec }, 429);

  const byok = currentByok();
  // 页面上配了 key 但配置不合法(地址不允许等):直接报错,不能悄悄改测服务器的 .env 模型。
  const invalid = currentAi()?.byokError;
  if (!byok && invalid) return c.json({ ok: false, reason: 'invalid_config', detail: invalid }, 400);

  if (byok) {
    // --- 有页面 key:用 byok 配置跑探针 ---
    const { report, models } = await runCapabilityProbe({
      source: 'byok',
      provider: byok.provider,
      model: byok.model,
      modelFor: (tier) => chatModel(tier, byok.model),
      baseURL: resolveBaseURL(byok),
      apiKey: byok.apiKey,
      tts: (byok.tts && byok.tts.mode !== 'browser') ? 'run' : 'none',
    });
    dropProbeFailures();

    const c1 = report.items.find((i) => i.id === 'connect');
    const c1Ok = c1?.status === 'pass';

    return c.json({
      ok: c1Ok,
      reason: c1Ok ? undefined : (c1?.reason ?? 'error'),
      latencyMs: report.totalMs,
      provider: byok.provider,
      providerName: findProvider(byok.provider)?.name,
      model: byok.model,
      models,
      modelListed: models ? models.includes(byok.model) : null,
      tts: mapTtsField(report),
      // v6.169.5 — 新增字段
      capability: report,
      source: 'byok' as const,
    }, c1Ok ? 200 : 502);
  }

  // --- 没有页面 key ---
  if (keyMode() === 'server') {
    const { baseURL, apiKey: serverKey } = envChatEndpoint();
    if (serverKey) {
      const serverRate = serverCheckLimiter.check(clientIp(c));
      if (!serverRate.ok) return c.json({ ok: false, reason: 'rate_limited', retryAfterSec: serverRate.retryAfterSec }, 429);
      // 用 .env 配置跑探针;模型与发言调用点(BaseAgent)用的是同一个
      const serverModelId = envDefaultModelId();

      const { report, models } = await runCapabilityProbe({
        source: 'server',
        provider: 'openai', // .env 模式固定显示 openai(实际 base URL 由 envChatEndpoint 决定)
        model: serverModelId,
        modelFor: (tier) => chatModel(tier, serverModelId),
        baseURL,
        apiKey: serverKey,
        tts: 'none', // server 模式不测语音
      });
      dropProbeFailures();

      const c1 = report.items.find((i) => i.id === 'connect');
      const c1Ok = c1?.status === 'pass';

      return c.json({
        ok: c1Ok,
        reason: c1Ok ? undefined : (c1?.reason ?? 'error'),
        latencyMs: report.totalMs,
        provider: 'openai',
        providerName: 'OpenAI Compatible',
        model: serverModelId,
        models,
        modelListed: models ? models.includes(serverModelId) : null,
        tts: 'browser' as const,
        capability: report,
        source: 'server' as const,
      }, c1Ok ? 200 : 502);
    }
  }

  // --- 都没有:保持原样 ---
  return c.json({ ok: false, reason: 'need_key' }, 400);
});
