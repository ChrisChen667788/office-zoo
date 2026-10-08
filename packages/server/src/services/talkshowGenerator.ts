/**
 * talkshowGenerator — LLM-driven user-bit writer for v0.7.4.
 *
 * Goal: take a one-line topic + a persona + a tag, produce a 80-260 字
 * standup bit in the same voice as SEED_SCRIPTS. Reuses the existing
 * QingYun → Minimax-M2 chain via callLLMWithTimeout so a downed primary
 * provider doesn't break user creation.
 *
 * Output is a `TalkshowScript` ready to drop into scriptStore + serve via
 * the existing /list, /script/:id, /tts handlers — no new client logic
 * needed beyond a "create" CTA.
 *
 * Safety net:
 *  - Length-bounded by maxTokens + post-trim
 *  - Title separately generated (≤ 22 字 like seed titles)
 *  - Sanitizer strips meta-prefixes (the same pattern highlightCaption uses)
 *  - On LLM failure → return null so the route returns 502 cleanly
 */

import { createOpenAI } from '@ai-sdk/openai';
import { callLLMWithTimeout } from '../utils/llm';
import type {
  TalkshowScript, TalkshowPersona, TalkshowTag,
} from '@furball/shared';
import { mintUserScriptId } from './scriptStore';

const PERSONA_HINTS: Record<TalkshowPersona, string> = {
  shaonv:    '20 多岁刚入职的女生,语气可爱但带点无奈,偶尔吐槽老板',
  yujie:     '30 多岁职场老炮女性,语气冷静中带讽刺,看穿一切',
  qingse:    '20 多岁刚毕业的男生,语气真诚带迷茫,自嘲为主',
  jingying:  '30 多岁中层管理者男性,语气精明克制,善于揭露行业潜规则',
  badao:     '40 多岁创业老板,语气霸气但偶尔暴露韭菜本质,反差萌',
  qingnian:  '中性叙述者,语气平和但观察犀利,适合段子的旁观者视角',
  lingling:  '00后整顿职场的零零后,21 岁,怼天怼地不惯着老板,语气直接、网感强、爱用梗,该顶就顶',
};

const TAG_HINTS: Record<TalkshowTag, string> = {
  overtime:  '加班 / 周报 / 早会',
  kpi:       'KPI / OKR / 绩效',
  pua:       'PUA / 画饼 / 老板话术',
  age:       '35 岁中年危机 / 转型 / 求职',
  slacking:  '摸鱼 / 划水 / 假装工作',
  jargon:    '互联网黑话 / 阿里词汇 / 翻译梗',
  hr:        'HR 谈话 / 裁员 / 入职面试',
  boss:      '老板 / 高管 / 大佬话术',
  meta:      '自嘲 / 行业观察',
};

const SCRIPT_SYSTEM_PROMPT = `你是中文脱口秀编剧,专写"班味单口"风格的职场段子。
风格要求:
- 结构必须是:Setup(铺垫真实场景)→ Punchline(反转/暴击)→ Tag(再补一刀)
- 全文 100-220 个汉字之间,严禁啰嗦
- 用口语化表达,带"我"的第一视角讲述
- 拒绝写"以下是""标题:""段子如下"等任何前缀,直接出正文
- 不要任何 emoji、不要分行(段子是一段连贯的口播)
- 不要写舞台动作、停顿提示、笑点说明,只写说话的内容
- 必须扣紧给定的话题和 persona 风格

【内容安全 · 必须遵守】
- 严禁出现任何真人姓名(包括明星/政客/企业家/网红的本名或绰号),如必须提及一律用"我老板""我同事""我朋友"等通用代称
- 严禁出现任何真实公司全称(如"阿里""字节""腾讯""华为"等),如必须提及一律说"我们公司""一家大厂""某个独角兽"
- 严禁政治、违法、色情、暴力、自伤内容
- 如果输入话题包含上述敏感内容,请改写成不指名道姓的版本继续完成段子,不要拒绝或返回错误`;

const TITLE_SYSTEM_PROMPT = `你是短视频文案手,给一段脱口秀写一句"爆款标题"。
风格要求:
- 不超过 22 个汉字
- 阴阳怪气、反转、班味
- 直接输出标题正文,不要书名号、引号、emoji 前缀、"标题:"等任何前缀
- 一行,一行就够`;

let _openai: ReturnType<typeof createOpenAI> | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? process.env.QINGYUN_API_KEY ?? '',
      baseURL: process.env.OPENAI_BASE_URL ?? process.env.QINGYUN_BASE_URL ?? 'https://api.qingyuntop.top/v1',
    });
  }
  return _openai;
}

export interface GenerateInput {
  topic: string;
  persona: TalkshowPersona;
  tag: TalkshowTag;
}

/** Generate a full TalkshowScript from a one-line topic. Returns null if
 *  the LLM chain (QingYun → Minimax-M2 fallback) is fully unavailable. */
export async function generateTalkshowScript(
  input: GenerateInput,
): Promise<TalkshowScript | null> {
  const openai = getOpenAI();
  const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  const personaHint = PERSONA_HINTS[input.persona] ?? '中性叙述者';
  const tagHint     = TAG_HINTS[input.tag] ?? '职场观察';

  // ---- 1. Body of the bit ----
  const bodyPrompt =
    `主题:${input.topic}\n` +
    `话题分类:${tagHint}\n` +
    `叙述者人设:${personaHint}\n\n` +
    `请按上述要求写一段 100-220 字的脱口秀段子,直接出正文。`;
  const bodyRes = await callLLMWithTimeout('CHAT_REPLY', {
    model,
    system: SCRIPT_SYSTEM_PROMPT,
    prompt: bodyPrompt,
    // ~220 汉字 × 1.5 token/char ≈ 330,留点 buffer
    maxTokens: 480,
    temperature: 1.0,
  });
  if (!bodyRes.ok) return null;
  const body = sanitizeBody(bodyRes.text);
  if (!body || body.length < 40) return null;

  // ---- 2. Title — fired off in parallel candidate-style would burn
  //         tokens; keep it serial since body must succeed first anyway. ----
  const titlePrompt =
    `下面这段脱口秀,请给一个不超过 22 字的爆款标题,直接出标题:\n\n${body}`;
  const titleRes = await callLLMWithTimeout('SUGGESTIONS', {
    model,
    system: TITLE_SYSTEM_PROMPT,
    prompt: titlePrompt,
    maxTokens: 60,
    temperature: 0.95,
  });
  // Title failure is not fatal — fall back to a snippet of the topic so the
  // user still gets a card they can share.
  const title = titleRes.ok
    ? sanitizeTitle(titleRes.text) || fallbackTitle(input.topic)
    : fallbackTitle(input.topic);

  // ---- 3. Estimate spoken duration. Talkshow seeds run ~5-7 字/秒
  //         depending on persona; we average to 6 字/秒 + 3s buffer. ----
  const durationSec = Math.max(15, Math.min(60, Math.round(body.length / 6) + 3));

  return {
    id: mintUserScriptId(),
    title,
    tag: input.tag,
    persona: input.persona,
    durationSec,
    text: body,
  };
}

// ---------------------------------------------------------------------------
// Sanitizers — lifted from highlightCaption's playbook, adjusted for body
// (which is allowed to be long, unlike a 22-char title).
// ---------------------------------------------------------------------------

function sanitizeBody(raw: string): string {
  let out = (raw ?? '').trim();
  // Drop wrapping quotes / brackets
  out = out.replace(/^[「『""''《【\[]+/, '').replace(/[」』""''》】\]]+$/, '');
  // Drop common meta prefixes
  out = out.replace(/^(?:好的|当然|没问题)[,，。!!]?\s*/, '');
  out = out.replace(/^(?:以下是?|这是|段子如下|内容如下|脱口秀如下|标题|正文)\s*[:：]?\s*/, '');
  // Strip line breaks — the seed format is one continuous spoken passage.
  out = out.replace(/[\r\n]+/g, ' ');
  // Drop trailing meta-commentary like "(这段段子...)"
  out = out.replace(/\s*[（(](?:以上|以下|说明|备注|另一种|更狠|另一版本|标题|分析)[\s\S]*$/, '').trim();
  // v0.7.6 — post-generation scrub. Catches the most common real names /
  // big-tech mentions the LLM occasionally lets through despite the prompt.
  // Replacement is intentionally generic so the joke still reads.
  out = scrubSensitiveNames(out);
  // Hard cap at 260 字 — protects TTS cost + matches seed length norms.
  if (out.length > 260) out = out.slice(0, 260) + '。';
  return out;
}

/** v0.7.6 — replace real-tech-company / real-person names with generic
 *  equivalents. Same approach as the highlight-caption sanitizer: regex
 *  list, soft replacement, never throws. */
const SENSITIVE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/阿里(?:巴巴)?/g,         '一家大厂'],
  [/腾讯/g,                   '一家大厂'],
  [/字节(?:跳动)?|抖音/g,    '一家短视频公司'],
  [/百度/g,                   '一家搜索公司'],
  [/华为/g,                   '一家硬件大厂'],
  [/京东/g,                   '一家电商公司'],
  [/拼多多/g,                 '一家电商公司'],
  [/美团/g,                   '一家本地生活公司'],
  [/小米/g,                   '一家硬件大厂'],
  [/网易/g,                   '一家互联网公司'],
  [/微软|谷歌|苹果|亚马逊|Meta|Facebook/gi, '一家外企'],
  [/马云|马化腾|张一鸣|李彦宏|刘强东|雷军|任正非/g, '某个老板'],
  [/习近平|普京|拜登|特朗普|金正恩/g, '某个领导人'],
];
function scrubSensitiveNames(text: string): string {
  let out = text;
  for (const [pat, sub] of SENSITIVE_REPLACEMENTS) {
    out = out.replace(pat, sub);
  }
  return out;
}

function sanitizeTitle(raw: string): string {
  let out = (raw ?? '').trim();
  out = out.replace(/^[「『""''《【\[]+/, '').replace(/[」』""''》】\]]+$/, '');
  out = out.replace(/^(?:标题|爆款标题|短视频标题)\s*[:：]\s*/, '');
  out = out.replace(/^(?:好的|当然)[,，。]?\s*/, '');
  out = out.split(/[\n\r]/, 1)[0].trim();
  if (out.length > 22) out = out.slice(0, 22);
  return out;
}

function fallbackTitle(topic: string): string {
  const t = topic.trim().split(/[\n\r]/, 1)[0].trim();
  return t.length > 22 ? t.slice(0, 22) : t || '我编的一段班味暴论';
}
