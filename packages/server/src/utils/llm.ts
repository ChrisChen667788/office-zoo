/**
 * LLM call helpers — add timeout + structured error handling.
 *
 * The `ai` SDK's generateText() does not have a built-in timeout. Without one
 * a single hung request (API stall, proxy issue) can block the entire game's
 * discussion phase indefinitely. Every caller MUST go through one of the
 * helpers below so timeout behaviour is uniform.
 *
 * Timeout budgets (per-call) — chosen based on expected token output:
 *   SPEECH      = 15s  (60-120 chars * ~10 tok/s ≈ 3-6s upstream, + network)
 *   GHOST       = 10s  (short 10-25 char danmaku)
 *   VOTE        =  6s  (just "player_0" or "skip")
 *   CHAT_REPLY  = 20s  (HR dialogue can be 2-4 sentences, sometimes slow)
 *   SCORING     = 15s  (JSON output ~200 tokens)
 *   SUGGESTIONS = 15s  (3 JSON items ~150 tokens each)
 *   DIRECTOR    = 75s  (v3.5.0 — squad director writes ~1800 tokens of
 *                       structured JSON on a premium model like
 *                       claude-opus-4-7 / gpt-5.5; budget is generous
 *                       because the user is already on the "AI 编剧中…"
 *                       teaser screen and tolerance is high)
 */

import { generateText } from 'ai';

export const LLM_TIMEOUTS = {
  SPEECH: 15_000,
  GHOST: 10_000,
  VOTE: 6_000,
  CHAT_REPLY: 20_000,
  SCORING: 15_000,
  SUGGESTIONS: 15_000,
  DIRECTOR: 75_000,
} as const;

export type LLMTimeoutKind = keyof typeof LLM_TIMEOUTS;

export interface LLMCallResult {
  ok: boolean;
  text: string;
  /** Present when ok=false — "timeout" | "error" | "empty" */
  reason?: 'timeout' | 'error' | 'empty';
  errorMessage?: string;
}

/**
 * Call generateText with a hard timeout budget. Never throws — failures are
 * represented by `ok: false` so callers can take fallback action without a
 * try/catch ladder.
 *
 * @example
 *   const res = await callLLMWithTimeout('SPEECH', {
 *     model, system: this.systemPrompt, prompt, maxTokens: 340, temperature: 1.0,
 *   });
 *   if (!res.ok) return this.fallbackSpeech();
 *   return res.text.trim();
 */
export async function callLLMWithTimeout(
  kind: LLMTimeoutKind,
  options: Parameters<typeof generateText>[0],
): Promise<LLMCallResult> {
  const timeoutMs = LLM_TIMEOUTS[kind];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { text } = await generateText({
      ...options,
      abortSignal: controller.signal,
    });
    clearTimeout(timer);

    const trimmed = text?.trim() ?? '';
    if (!trimmed) {
      // Empty response from primary — try Minimax fallback before giving up.
      return await tryMinimaxFallback(kind, options) ?? { ok: false, text: '', reason: 'empty' };
    }
    return { ok: true, text: trimmed };
  } catch (err) {
    clearTimeout(timer);
    // AbortError (timeout) vs other error
    const isTimeout =
      (err as Error)?.name === 'AbortError' || controller.signal.aborted;

    // Both timeout AND HTTP error paths get a Minimax retry — the user's
    // QingYun proxy is rate-limited / quota-exhausted, but Minimax M2 is
    // currently the only chat model their plan supports, so without this
    // fallback every LLM call falls through to the canned `fallbackSpeech`.
    const minimaxResult = await tryMinimaxFallback(kind, options);
    if (minimaxResult) return minimaxResult;

    if (isTimeout) {
      return {
        ok: false,
        text: '',
        reason: 'timeout',
        errorMessage: `LLM call exceeded ${timeoutMs}ms budget (kind=${kind})`,
      };
    }
    return {
      ok: false,
      text: '',
      reason: 'error',
      errorMessage: (err as Error)?.message ?? String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Minimax LLM fallback — chat completion via api.minimaxi.com/v1/text/chatcompletion_v2
//
// Probed Apr 2026 against the user's sk-cp-… plan:
//   MiniMax-M2          ✅ returns real completions
//   MiniMax-M1 / Text-01 ❌ choices:null (no quota)
//   abab6.5*-chat        ❌ choices:null (no quota)
//
// We translate the ai-sdk options shape (system / prompt / maxTokens /
// temperature) into Minimax's OpenAI-compatible message array and parse the
// first choice's content. Sticky-dead flag avoids repeat retries.
// ---------------------------------------------------------------------------
let minimaxLlmDead = false;

async function tryMinimaxFallback(
  kind: LLMTimeoutKind,
  options: Parameters<typeof generateText>[0],
): Promise<LLMCallResult | null> {
  if (minimaxLlmDead) return null;
  const key = process.env.MINIMAX_API_KEY ?? '';
  if (!key) return null;

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  // ai-sdk lets `system` be a string OR an array of message-content blocks.
  const systemStr = typeof options.system === 'string' ? options.system : '';
  if (systemStr) messages.push({ role: 'system', content: systemStr });
  // ai-sdk's `prompt` is similarly polymorphic; we only handle the string case
  // because every caller in this codebase passes a string.
  const promptStr = typeof options.prompt === 'string' ? options.prompt : '';
  if (promptStr) messages.push({ role: 'user', content: promptStr });
  if (!messages.length) return null;

  const timeoutMs = LLM_TIMEOUTS[kind];
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);

  try {
    const resp = await fetch('https://api.minimaxi.com/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({
        model: process.env.MINIMAX_LLM_MODEL || 'MiniMax-M2',
        messages,
        // The user's plan supports MiniMax-M2 specifically; other Minimax
        // models return null choices. Override via env if their account
        // gets upgraded.
        //
        // Default raised to 512 (was 256) so longer agent speeches don't
        // truncate. The caller's hint takes priority — speech callers pass
        // 480, vote/ghost pass <=100, so the default only kicks in for
        // unmapped paths.
        max_tokens: (options as any).maxTokens ?? 512,
        temperature: (options as any).temperature ?? 0.8,
      }),
    });
    clearTimeout(t);

    if (!resp.ok) {
      console.warn(`[LLM/Minimax-M2 ${kind}] HTTP ${resp.status}`);
      if (resp.status === 401) minimaxLlmDead = true;
      return null;
    }
    const data = await resp.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      base_resp?: { status_code?: number; status_msg?: string };
    };
    if (data.base_resp && data.base_resp.status_code !== 0) {
      const code = data.base_resp.status_code ?? 0;
      console.warn(`[LLM/Minimax-M2 ${kind}] ${code}: ${data.base_resp.status_msg}`);
      if ([1008, 2061].includes(code)) minimaxLlmDead = true;
      return null;
    }
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) return null;
    return { ok: true, text };
  } catch (err) {
    clearTimeout(t);
    console.warn(`[LLM/Minimax-M2 ${kind}] threw`, (err as Error)?.message);
    return null;
  }
}
