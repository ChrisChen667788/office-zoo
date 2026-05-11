/**
 * tacticSummarizer — LLM-distill a fired-mode round into a 1-2 sentence
 * "what tactic did the player use" string. Stored in memoryStore and
 * later injected into the HR system prompt so HR can pre-empt repeats.
 *
 * v0.8.2.
 *
 * Why one short summary rather than feeding the whole transcript back?
 *  - Prompt budget — HR system prompt already runs 600+ chars. Stuffing
 *    a 4 KB transcript on every /chat call would blow the cost ceiling
 *    and give the model too much to attend to.
 *  - Generalizable signal — the model needs the SHAPE of the tactic
 *    ("先要书面证据,然后引《劳动合同法》第40条施压"), not the verbatim
 *    chat. A summary is exactly that.
 *  - Cheap — one call per round, runs after the scoring already happened.
 *
 * Failure mode: returns a generic placeholder ("玩家用常规话术应对") so the
 * caller can still record SOMETHING and surface a play count. Better
 * than dropping the memory record entirely on transient LLM failure.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { callLLMWithTimeout } from '../utils/llm';

let _openai: ReturnType<typeof createOpenAI> | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = createOpenAI({
      apiKey:  process.env.OPENAI_API_KEY  ?? process.env.QINGYUN_API_KEY  ?? '',
      baseURL: process.env.OPENAI_BASE_URL ?? process.env.QINGYUN_BASE_URL ?? 'https://api.qingyuntop.top/v1',
    });
  }
  return _openai;
}

const SYSTEM_PROMPT = `你是裁员谈判复盘助手,从一段员工 vs HR 的谈判记录里,提炼出员工使用的核心策略。

输出要求:
- 一句话(20-40 个汉字),简洁犀利
- 抓住"主线打法",不要罗列所有细节
- 例:"先要书面解除证明,再引《劳动合同法》第40条压赔偿金"
- 例:"用三期保护(怀孕)硬刚,拒绝任何调岗"
- 例:"被 PUA 话术带偏,最后接受了低于法定的赔偿"
- 直接出正文,不要"以下是""总结:"等前缀
- 不要换行,不要 emoji,不要标点开头`;

export async function summarizeTactic(opts: {
  scenarioTitle: string;
  outcome: 'win' | 'partial' | 'lose';
  messages: Array<{ role: 'user' | 'hr'; content: string }>;
}): Promise<string> {
  const openai = getOpenAI();
  const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');

  // Convert chat to a compact transcript. Cap the body at ~2 KB to stay
  // within reasonable prompt budget — long rounds get truncated to the
  // first + last 8 turns (which usually contain the setup + the closer
  // where the strategy is most legible).
  const transcript = compactTranscript(opts.messages);

  const prompt =
    `场景:${opts.scenarioTitle}\n` +
    `结局:${outcomeLabel(opts.outcome)}\n\n` +
    `谈判记录:\n${transcript}\n\n` +
    `请用一句话总结员工的核心打法。`;

  const res = await callLLMWithTimeout('SUGGESTIONS', {
    model,
    system: SYSTEM_PROMPT,
    prompt,
    maxTokens: 80,
    temperature: 0.6,
  });
  if (!res.ok) {
    return outcomeFallback(opts.outcome);
  }
  return sanitize(res.text) || outcomeFallback(opts.outcome);
}

function outcomeLabel(o: 'win' | 'partial' | 'lose'): string {
  if (o === 'win')     return '员工胜诉,拿到合理赔偿';
  if (o === 'partial') return '部分让步,赔偿低于应得';
  return '员工接受公司低赔甚至自离';
}

function outcomeFallback(o: 'win' | 'partial' | 'lose'): string {
  if (o === 'win')     return '玩家用常规法律话术拿到了合理赔偿';
  if (o === 'partial') return '玩家部分施压成功,赔偿低于法定';
  return '玩家被 HR 套路带偏,接受了低于法定的方案';
}

function compactTranscript(
  messages: Array<{ role: 'user' | 'hr'; content: string }>,
): string {
  const lines = messages.map((m) =>
    `${m.role === 'user' ? '员工' : 'HR'}: ${m.content.slice(0, 200)}`,
  );
  // Truncate by keeping first 8 + last 8 turns when total exceeds 16
  if (lines.length <= 16) return lines.join('\n');
  return [
    ...lines.slice(0, 8),
    '【…中间略…】',
    ...lines.slice(-8),
  ].join('\n');
}

function sanitize(raw: string): string {
  let out = (raw ?? '').trim();
  out = out.replace(/^[「『""''《【\[]+/, '').replace(/[」』""''》】\]]+$/, '');
  out = out.replace(/^(?:总结|核心打法|策略)\s*[:：]\s*/, '');
  out = out.replace(/^(?:玩家|员工)\s*[:：]\s*/, '');
  out = out.split(/[\n\r]/, 1)[0].trim();
  // Hard cap: 60 chars (target was 20-40, leave a little overflow buffer)
  if (out.length > 60) out = out.slice(0, 60);
  return out;
}
