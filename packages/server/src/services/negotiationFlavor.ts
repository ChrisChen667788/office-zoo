/**
 * negotiationFlavor.ts — v6.58 — 「裁了么」闯关牌局的 LLM 演出层。
 *
 * 数值由 shared/negotiation 的纯引擎定(谁赢、掉多少血),这一层只负责给每次出牌
 * 配一句**有戏的 HR 台词**(数值定结果,LLM 配台词)。复用 fired-mode 的
 * FIRED_HR_MODEL 链路。LLM 不可用时优雅降级到一句确定性的兜底台词,所以断网 /
 * 不烧额度也能玩。
 *
 * buildHRLinePrompt / relationOf / fallbackHRLine / sanitizeHRLine 都是纯函数,
 * 可单测;generateHRLine 是 LLM 包装。
 */
import { createOpenAI } from '@ai-sdk/openai';
import { callLLMWithTimeout } from '../utils/llm';
import { cardById, stanceById, type HRStanceId } from '@furball/shared';

export type CardRelation = 'resist' | 'weak' | 'normal';
export type NegotiationOutcomeKind = 'ongoing' | 'settled' | 'caved' | 'flipped';

export interface HRLineContext {
  cardId: string;
  stanceId: HRStanceId;
  outcomeKind?: NegotiationOutcomeKind;
}

const SYSTEM_PROMPT =
  '你在演一个中国互联网公司裁员谈判里的 HR。被裁员工正用各种话术跟你争赔偿,你要' +
  '寸土必争但又得装得体面。始终在角色内,用口语化中文回 1 句(最多 30 字),要有戏、' +
  '接地气、能让人想截图。只输出这句台词本身,不要引号、不要解释、不要旁白。' +
  '不得辱骂、不涉政治/违法,职场阴阳到位即可。';

/** 这张卡 vs 当前姿态的关系:被克 / 命中弱点 / 势均力敌。纯函数。 */
export function relationOf(cardId: string, stanceId: HRStanceId): CardRelation {
  const card = cardById(cardId);
  const stance = stanceById(stanceId);
  if (!card) return 'normal';
  if (stance.resists.includes(card.tag)) return 'resist';
  if (stance.weakTo.includes(card.tag)) return 'weak';
  return 'normal';
}

const RELATION_CUE: Record<CardRelation, string> = {
  resist: '这张话术正好被你的姿态克制 —— 你占上风,可以四两拨千斤、轻描淡写化解。',
  weak: '这张话术正好戳中你这个姿态的软肋 —— 你被将了一军,嘴上要硬、心里有点慌。',
  normal: '双方势均力敌 —— 你不松口,继续周旋。',
};

const OUTCOME_CUE: Record<NegotiationOutcomeKind, string> = {
  ongoing: '',
  settled: '谈判到此结束:你最终松口同意了这个赔偿数,说一句下台阶的收尾话。',
  caved: '员工撑不住认怂、接受了现状:说一句胜利者姿态但留点体面的话。',
  flipped: '你被惹毛了,直接掀桌"那就走劳动仲裁",一拍两散:说一句撕破脸的狠话。',
};

/** 组装 system + user prompt。卡 id 非法 → null(让调用方走兜底)。 */
export function buildHRLinePrompt(ctx: HRLineContext): { system: string; prompt: string } | null {
  const card = cardById(ctx.cardId);
  const stance = stanceById(ctx.stanceId);
  if (!card) return null;
  const rel = relationOf(ctx.cardId, ctx.stanceId);
  const outcomeKind = ctx.outcomeKind ?? 'ongoing';
  const prompt =
    `你当前的姿态是「${stance.name}」(${stance.blurb})。\n` +
    `员工打出话术卡「${card.name}」:“${card.blurb}”。\n` +
    `${RELATION_CUE[rel]}\n` +
    (OUTCOME_CUE[outcomeKind] ? `${OUTCOME_CUE[outcomeKind]}\n` : '') +
    '用 HR 的口吻回这一句:';
  return { system: SYSTEM_PROMPT, prompt };
}

/** 收口:去引号 / 折行,夹到单行 ≤ 40 字,防 LLM 跑飞。纯函数。 */
export function sanitizeHRLine(raw: string): string {
  const oneLine = raw.replace(/\s+/g, ' ').trim().replace(/^["“”'']+|["“”'']+$/g, '');
  return oneLine.slice(0, 40);
}

/** 确定性兜底台词(LLM 不可用 / 卡非法时)。纯函数,永远在角色内。 */
export function fallbackHRLine(ctx: HRLineContext): string {
  const stance = stanceById(ctx.stanceId);
  switch (ctx.outcomeKind) {
    case 'flipped':
      return '行,那咱们就劳动仲裁见,别怪我没提醒你。';
    case 'settled':
      return '……行吧,就这个数,到此为止,签字走流程。';
    case 'caved':
      return '想通了就好,年轻人别冲动,签了吧。';
    default:
      break;
  }
  const rel = relationOf(ctx.cardId, ctx.stanceId);
  if (rel === 'weak') return `${stance.blurb}……(被噎了一下,语气松动)`;
  if (rel === 'resist') return `${stance.blurb}(滴水不漏)`;
  return stance.blurb;
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
function getHRModel(): string {
  return process.env.FIRED_HR_MODEL ?? process.env.OPENAI_MODEL ?? 'claude-opus-4-7';
}

/** 给一次出牌生成 HR 台词。LLM 失败 / 超时 → 兜底台词(永不抛)。 */
export async function generateHRLine(ctx: HRLineContext): Promise<string> {
  const built = buildHRLinePrompt(ctx);
  if (!built) return fallbackHRLine(ctx);
  try {
    const res = await callLLMWithTimeout('NEGOTIATION_HR_LINE', {
      model: getOpenAI()(getHRModel()),
      system: built.system,
      prompt: built.prompt,
      maxTokens: 80,
      temperature: 0.95,
    });
    if (!res.ok || !res.text?.trim()) return fallbackHRLine(ctx);
    return sanitizeHRLine(res.text);
  } catch {
    return fallbackHRLine(ctx);
  }
}
