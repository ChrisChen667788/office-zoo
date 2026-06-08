/**
 * reactionFlavor.ts — v6.69 — 主对局裁员瞬间的「群众吐槽」LLM 演出层。
 *
 * 谁被优化 / 被投票开除时,让一群"吃瓜群众 / 前同事"发一句**结合当局上下文**(被裁的是谁、
 * 什么身份、什么性格)的阴阳怪气弹幕。复用 fired-mode 的 FIRED_HR_MODEL 链路;LLM 不可用
 * 时优雅降级到 shared 的静态吐槽池(`pickReaction`),所以断网 / 不烧额度也有词。
 *
 * buildReactionPrompt / sanitizeReactionLine / fallbackReactionLine 都是纯函数,可单测;
 * generateReactionLine 是 LLM 包装。
 */
import { createOpenAI } from '@ai-sdk/openai';
import { callLLMWithTimeout } from '../utils/llm';
import { pickReaction, type ReactionKind } from '@furball/shared';

export interface ReactionLineContext {
  kind: ReactionKind;          // kill(夜间优化)/ vote(投票开除)/ leak / survive
  victimName: string;          // 被裁的鼠名
  victimRole?: string;         // 身份标签(人话,如"数据分析师")—— 客户端直接传 label
  victimPersonality?: string;  // 性格标签(如"卷王")
  byName?: string;             // 谁动的手(投票发起 / 关键投票人),可空
}

const SYSTEM_PROMPT =
  '你是一群在中国互联网公司里围观裁员的"吃瓜群众 / 前同事"。看到有人被优化或被投票开除,' +
  '你发一句**阴阳怪气、接地气、能让人想截图**的弹幕吐槽 —— 职场牛马互相调侃那种,带点黑色幽默和自嘲。' +
  '只输出这一句弹幕本身(最多 30 字),不要引号、不要解释、不要旁白、不要 @ 谁。' +
  '不得辱骂、不涉政治 / 违法,阴阳到位即可。';

const KIND_CUE: Record<ReactionKind, string> = {
  kill: '这位是被资本"夜间优化"了(悄无声息下岗)。',
  vote: '这位是被全员投票开除了(同事亲手投出去的)。',
  leak: '这位被前同事爆料 / 抓到了把柄。',
  survive: '这位侥幸又苟过了一轮,还没轮到 TA。',
};

/** 组装 system + user prompt。victimName 为空 → null(让调用方走兜底)。 */
export function buildReactionPrompt(ctx: ReactionLineContext): { system: string; prompt: string } | null {
  const name = (ctx.victimName ?? '').trim();
  if (!name) return null;
  const bits = [`刚刚出局的同事:${name}`];
  if (ctx.victimRole) bits.push(`身份:${ctx.victimRole}`);
  if (ctx.victimPersonality) bits.push(`性格:${ctx.victimPersonality}`);
  if (ctx.byName) bits.push(`动手的是:${ctx.byName}`);
  const prompt =
    `${KIND_CUE[ctx.kind] ?? KIND_CUE.vote}\n` +
    `${bits.join(' · ')}\n` +
    '以吃瓜群众的口吻,发一句弹幕吐槽:';
  return { system: SYSTEM_PROMPT, prompt };
}

/** 收口:去引号 / 折行 / @,夹到单行 ≤ 30 字。纯函数。 */
export function sanitizeReactionLine(raw: string): string {
  const oneLine = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“”'']+|["“”'']+$/g, '')
    .replace(/^@\S+\s*/, '');
  return oneLine.slice(0, 30);
}

/** 确定性兜底(LLM 不可用 / 名字非法时):走 shared 静态吐槽池。纯函数。 */
export function fallbackReactionLine(ctx: ReactionLineContext): string {
  const seed = [...(ctx.victimName ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = pickReaction(ctx.kind, seed);
  return `${r.emoji} ${r.text}`;
}

// LLM 链路(复用 fired-mode 的 HR 模型;env 同源)。
let _openai: ReturnType<typeof createOpenAI> | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? '',
      baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.vectorengine.ai/v1',
    });
  }
  return _openai;
}
function getModel(): string {
  return process.env.FIRED_HR_MODEL ?? process.env.OPENAI_MODEL ?? 'claude-opus-4-7';
}

/** 生成一句群众吐槽。LLM 失败 / 超时 → 静态池兜底(永不抛)。返回不带"群众:"前缀的纯句。 */
export async function generateReactionLine(ctx: ReactionLineContext): Promise<string> {
  const built = buildReactionPrompt(ctx);
  if (!built) return fallbackReactionLine(ctx);
  try {
    const res = await callLLMWithTimeout('REACTION_LINE', {
      model: getOpenAI()(getModel()),
      system: built.system,
      prompt: built.prompt,
      maxTokens: 60,
      temperature: 1.0,
    });
    if (!res.ok || !res.text?.trim()) return fallbackReactionLine(ctx);
    const cleaned = sanitizeReactionLine(res.text);
    return cleaned || fallbackReactionLine(ctx);
  } catch {
    return fallbackReactionLine(ctx);
  }
}
