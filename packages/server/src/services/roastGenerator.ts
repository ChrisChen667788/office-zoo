/**
 * roastGenerator — v6.55 #4 — 班味单口「专属吐槽」.
 *
 * User types what's eating them today ("老板天天画饼还 PUA") → LLM spits out a
 * handful of punchy 阴阳怪气 / 自嘲 one-liners they can read + TTS-play for pure
 * emotional payoff. Ephemeral (not persisted) — it's a vent, not UGC.
 *
 * buildRoastPrompt + parseRoastLines are pure → unit-tested; generateRoast
 * wraps the LLM call (reuses the same QingYun→fallback chain as everything else).
 */
import { createOpenAI } from '@ai-sdk/openai';
import { callLLMWithTimeout } from '../utils/llm';

let _openai: ReturnType<typeof createOpenAI> | null = null;
function openai() {
  if (!_openai) {
    _openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? process.env.QINGYUN_API_KEY ?? '',
      baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.qingyuntop.top/v1',
    });
  }
  return _openai;
}
function modelName(): string {
  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
}

const ROAST_SYSTEM = `你是当代打工人的「嘴替」—— 专门把憋在心里的职场委屈,翻译成又毒又好笑、能让人当场出气的金句。
风格:阴阳怪气 + 黑色幽默 + 牛马自嘲,像脱口秀 punchline。站在打工人这边,替 TA 出气。
硬性要求:
1. 每句独立成段,短促有力(12-30 字),适合念出来。
2. 阴阳、反讽、夸张、谐音梗都行,要"爽"要"解气",但不带脏字、不人身攻击具体真人、不涉政不违法。
3. 别讲大道理、别安慰、别"建议",就是纯纯地嘴替出气。
4. 只输出金句本身,一行一句,不要序号、不要前后说明、不要引号。`;

const MAX_LINES = 5;
const MAX_LINE_CHARS = 60;

/** Build the user-facing prompt from their vent topic. */
export function buildRoastPrompt(topic: string): string {
  const t = (topic ?? '').trim().slice(0, 200);
  return `今天打工人想出气的点:「${t}」\n\n围绕这件事,给我 4-5 句最解气的阴阳/自嘲金句,一行一句。`;
}

/** Clean the raw LLM output into a tidy list of lines: strip numbering /
 *  bullets / quotes, drop empties + meta lines, clamp count + length. Pure. */
export function parseRoastLines(raw: string): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const rawLine of raw.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    // strip leading "1." / "1、" / "- " / "• " / "·" ordinals + bullets
    line = line.replace(/^\s*(?:\d+\s*[.、)）]|[-*•·])\s*/, '');
    // strip wrapping quotes / brackets
    line = line.replace(/^["'「『（(【\[]+/, '').replace(/["'」』）)】\]]+$/, '').trim();
    if (!line) continue;
    // drop obvious meta / refusal / preamble lines
    if (/^(以下|这里|好的|没问题|当然|注[:：]|说明[:：])/.test(line)) continue;
    if (line.length > MAX_LINE_CHARS) line = line.slice(0, MAX_LINE_CHARS - 1) + '…';
    out.push(line);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

/** Generate a few roast one-liners for the topic. Returns [] on LLM failure
 *  so the route can 502 cleanly. */
export async function generateRoast(topic: string): Promise<string[]> {
  const res = await callLLMWithTimeout('SPEECH', {
    model: openai()(modelName()),
    system: ROAST_SYSTEM,
    prompt: buildRoastPrompt(topic),
    maxTokens: 360,
    temperature: 1.05,
  });
  if (!res.ok) return [];
  return parseRoastLines(res.text);
}
