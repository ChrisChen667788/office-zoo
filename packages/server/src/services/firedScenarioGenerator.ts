/**
 * firedScenarioGenerator — LLM-driven UGC scenario writer for v0.8.0.
 *
 * Goal: take a one-line user description ("我是 35 岁前端,公司说要优化高龄
 * 高薪员工") + a difficulty hint + an emoji, produce a complete
 * `FiredScenario` record (title + description + legalSituation +
 * hrOpeningLine + playerContext + winCondition + maxCompensation) ready to
 * drop into scenarioStore + the existing FiredChat round flow.
 *
 * Approach: ONE structured-JSON LLM call (not seven serial calls). We
 * prompt the model to return strict JSON; the parser is strict about
 * required fields and falls back to a sensible default for missing
 * pieces rather than rejecting the whole response. This keeps cost +
 * latency low (one round-trip) and lets us use the same call-with-timeout
 * helper that powers the talkshow generator.
 *
 * Returns null when the LLM chain (QingYun → Minimax-M2 fallback) is
 * fully unavailable OR when the JSON parse + validation fails — both
 * surface as 502 in the route.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { callLLMWithTimeout } from '../utils/llm';
import type { FiredScenario } from '@furball/shared';
import { mintUserScenarioId } from './scenarioStore';

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

export interface GenerateScenarioInput {
  /** Free-form user description of the layoff scenario. 8-300 字. */
  description: string;
  /** 1-3 difficulty level. Higher = HR uses more sophisticated tactics. */
  difficulty: 1 | 2 | 3;
  /** Emoji for the card — picked by the user from a small palette. */
  emoji: string;
}

const SYSTEM_PROMPT = `你是中国劳动法实务咨询师 + 职场剧本作者,专门为"裁了么"模拟器写新关卡。

输入是一句用户对真实裁员场景的描述。请生成一个完整的关卡 JSON,字段如下:

{
  "title":          "8-16 字关卡标题,要 punchy,体现核心冲突",
  "description":    "30-60 字背景描述,陈述事件,不要写法律分析",
  "legalSituation": "120-260 字法律分析,要包含:相关法条编号、违法点、应得赔偿(N/N+1/2N)、实务关键点。务必准确,不能编造法条。",
  "hrOpeningLine":  "60-150 字 HR 开场白,要油滑、PUA 风、铺路让员工自愿走人。第一人称,直接说话内容,不要加引号或舞台动作。",
  "playerContext":  "60-150 字玩家背景:岗位、工龄、月薪、关键事实(有无录音、有无书面证据、家庭情况)",
  "winCondition":   "20-40 字胜利条件,要求具体可验证,例如 '获得违法解除 2N 赔偿金'",
  "maxCompensation": 数字, 表示最高可争取的赔偿月数,根据工龄+赔偿系数估算
}

【内容安全】
- 严禁出现真实公司/真人姓名,统一用"公司""HR""你""你的领导"等代称
- 法条引用必须真实(《劳动合同法》第几条),不能编造条文号
- 不写违法、政治敏感、色情、自伤内容

【输出格式】
- 直接返回纯 JSON 对象,不要 markdown、不要 \`\`\`json 包裹、不要任何前后文
- 字段名严格按上面列的英文 key,不要漏写、不要加多
- maxCompensation 是数字,不是字符串`;

export async function generateFiredScenario(
  input: GenerateScenarioInput,
): Promise<FiredScenario | null> {
  const openai = getOpenAI();
  const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  const difficultyHint =
    input.difficulty === 1 ? '简单 — HR 直接、套路浅、员工只要懂基本法条就能赢'
  : input.difficulty === 2 ? '中等 — HR 会画饼、打感情牌、员工要识破软话术'
                           : '困难 — HR 是老油条,会用组织架构、绩效造假、口头承诺等多层套路';

  const prompt =
    `用户描述的场景:${input.description}\n\n` +
    `难度:${input.difficulty} (${difficultyHint})\n\n` +
    `请按系统消息要求,直接输出关卡 JSON。`;

  const res = await callLLMWithTimeout('CHAT_REPLY', {
    model,
    system: SYSTEM_PROMPT,
    prompt,
    // 7 fields × ~100 字 average ≈ 700 字 ≈ 1100 tokens, with JSON keys + buffer
    maxTokens: 1400,
    temperature: 0.85,
  });
  if (!res.ok) return null;

  // Extract JSON — model sometimes wraps it in ```json``` despite the prompt.
  const json = extractJson(res.text);
  if (!json) return null;

  // Validate + slot defaults.
  const parsed = parseScenario(json, input);
  return parsed;
}

/** Pull the first JSON object out of a string. Tolerates ```json``` fences,
 *  leading prose, and trailing commentary. Returns null when nothing
 *  parseable is present. */
function extractJson(text: string): unknown | null {
  // Strip ```json ... ``` fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  // Find the first {…} block (greedy → grabs the whole object even with
  // nested quotes, which is fine for our flat schema).
  const match = candidate.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function parseScenario(
  raw: unknown,
  input: GenerateScenarioInput,
): FiredScenario | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  // All required fields — if any is missing or wildly off, reject the
  // whole response (we'd rather show "try again" than ship a malformed
  // scenario). Lengths are loose: trust the LLM, just clamp obvious
  // outliers + scrub names like the talkshow path.
  const title          = pickString(r.title,          8,  40);
  const description    = pickString(r.description,    20, 120);
  const legalSituation = pickString(r.legalSituation, 80, 600);
  const hrOpeningLine  = pickString(r.hrOpeningLine,  30, 300);
  const playerContext  = pickString(r.playerContext,  30, 300);
  const winCondition   = pickString(r.winCondition,   10, 80);
  if (!title || !description || !legalSituation || !hrOpeningLine || !playerContext || !winCondition) {
    return null;
  }

  let maxCompensation = typeof r.maxCompensation === 'number'
    ? r.maxCompensation
    : Number(r.maxCompensation);
  if (!Number.isFinite(maxCompensation) || maxCompensation <= 0) {
    // Fallback by difficulty so the slider still has a sane bound.
    maxCompensation = input.difficulty === 1 ? 2 : input.difficulty === 2 ? 6 : 10;
  }
  // Clamp to plausible range. 1 month minimum, 24 months ceiling.
  maxCompensation = Math.max(1, Math.min(24, Math.round(maxCompensation * 10) / 10));

  return {
    id: mintUserScenarioId(),
    title:          scrubNames(title),
    description:    scrubNames(description),
    legalSituation,                              // legal text MUST mention companies generically; the prompt enforces this
    hrOpeningLine:  scrubNames(hrOpeningLine),
    playerContext:  scrubNames(playerContext),
    winCondition,
    difficulty:     input.difficulty,
    emoji:          input.emoji,
    maxCompensation,
  };
}

/** Pull a string of expected length out of unknown. Trims and length-clamps;
 *  returns null when the field is absent / empty / wrong type. */
function pickString(v: unknown, min: number, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t.length < min) return null;
  return t.length > max ? t.slice(0, max) : t;
}

/** Same name-scrubbing logic as talkshowGenerator — replace big-tech / real
 *  people names with generic equivalents so user prompts that drop a name
 *  in still produce a publishable scenario. */
const SCRUB: Array<[RegExp, string]> = [
  [/阿里(?:巴巴)?/g, '一家大厂'],
  [/腾讯/g,         '一家大厂'],
  [/字节(?:跳动)?|抖音/g, '一家短视频公司'],
  [/百度/g,         '一家搜索公司'],
  [/华为/g,         '一家硬件大厂'],
  [/京东|拼多多/g,   '一家电商公司'],
  [/美团/g,         '一家本地生活公司'],
  [/小米/g,         '一家硬件大厂'],
  [/网易/g,         '一家互联网公司'],
  [/微软|谷歌|苹果|亚马逊|Meta|Facebook/gi, '一家外企'],
  [/马云|马化腾|张一鸣|李彦宏|刘强东|雷军|任正非/g, '某个老板'],
];
function scrubNames(s: string): string {
  let out = s;
  for (const [pat, sub] of SCRUB) out = out.replace(pat, sub);
  return out;
}
