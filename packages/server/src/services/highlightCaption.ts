/**
 * highlightCaption — given the structured highlights from the client's
 * `pickHighlights`, ask an LLM for a punchy one-line caption per slide.
 *
 * Why server-side: the LLM key never touches the browser. We re-use the
 * existing `callLLMWithTimeout` chain (QingYun → MiniMax-M2 fallback) so a
 * captions request degrades gracefully when one provider is down.
 *
 * Output policy:
 *   - Exactly one caption per highlight, same order as input
 *   - <= 22 Chinese chars (fits 1 line on the 1080-wide vertical card)
 *   - No quotes / no parens / no version notes (sanitised)
 *   - On any provider failure: return the original headline as fallback
 *     so the video render never blocks on a captioning miss
 *
 * Why we don't batch all highlights into one LLM call:
 *   - Easier to enforce per-line length cap (one prompt → one line)
 *   - Failures are localised (1 caption falls back, 2 still get the LLM win)
 *   - Parallel `Promise.all` keeps wall-clock under 5 s for 3 highlights
 */

import { callLLMWithTimeout } from '../utils/llm';
import { createOpenAI } from '@ai-sdk/openai';

// Caption length cap — measured in JS characters (good enough for CJK
// since 1 char ≈ 1 visual width unit on the share-card font).
const MAX_CAPTION_LEN = 22;

export interface CaptionInput {
  kind: 'kill' | 'vote_eject' | 'roast' | 'reversal' | 'perfect_bluff' | 'comeback' | 'bloodbath' | 'finale';
  playerName?: string;
  role?: string;
  team?: 'cat' | 'dog' | 'neutral';
  headline: string;
  body?: string;
  round?: number;
}

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

export async function generateCaptions(items: CaptionInput[]): Promise<string[]> {
  const out = await Promise.all(items.map(captionOne));
  return out;
}

async function captionOne(item: CaptionInput): Promise<string> {
  const fallback = sanitize(item.headline);
  const prompt = buildPrompt(item);
  try {
    const openai = getOpenAI();
    const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
    const res = await callLLMWithTimeout('SUGGESTIONS', {
      model,
      system: SYSTEM_PROMPT,
      prompt,
      // Captions are short — give the model just enough room.
      maxTokens: 60,
      temperature: 0.95,
    });
    if (!res.ok) return fallback;
    const cleaned = sanitize(res.text);
    if (!cleaned || cleaned.length < 4) return fallback;
    return cleaned;
  } catch {
    return fallback;
  }
}

const SYSTEM_PROMPT = `你是短视频文案手,专写抖音/B站职场小剧场的"爆款一句话标题"。
风格要求:
- 精炼,**不超过 22 个汉字**,严禁啰嗦
- 阴阳怪气、班味、互联网黑话、爆点、反转
- 直接输出标题正文,不加书名号、引号、括号、注释、emoji 前缀
- 不要写"以下是""标题:""版本:"等任何前缀
- 不要分行,只输出一行
- 不要解释,只输出标题`;

function buildPrompt(item: CaptionInput): string {
  const role = item.role ? ` (身份:${item.role})` : '';
  const team =
    item.team === 'cat' ? '打工人阵营'
  : item.team === 'dog' ? '资本家阵营'
  : item.team === 'neutral' ? '摸鱼党阵营'
  : '';
  const ctx =
    item.kind === 'kill'       ? `事件:${item.playerName}${role} 在游戏里被资本家"优化"了。`
  : item.kind === 'vote_eject' ? `事件:${item.playerName}${role} 被全员投票开除${team ? `,身份是${team}` : ''}。`
  : item.kind === 'roast'      ? `事件:${item.playerName} 在会议上发表了一段暴论:"${item.body ?? ''}"`
  : item.kind === 'reversal'   ? `事件:你押 ${item.playerName} 但实际开除的是别人,看走眼了。`
  : item.kind === 'perfect_bluff' ? `事件:${item.playerName} 是资本家卧底,全程没露馅,演到最后赢了。`
  : item.kind === 'comeback'   ? `事件:${team || '赢家阵营'}折损过半,绝地翻盘逆风翻盘。`
  : item.kind === 'bloodbath'  ? `事件:这一回合多人同时出局,腥风血雨:${item.body ?? ''}`
  :                              `事件:本局结束,${item.headline}。`;

  const round = item.round ? `(第 ${item.round} 轮)` : '';
  return `${ctx} ${round}\n\n请生成一句不超过 22 字的爆款短视频标题,直接输出。`;
}

/**
 * Strip the same meta-commentary patterns BaseAgent.sanitizeSpeech catches,
 * plus length-clip to MAX_CAPTION_LEN. Always returns a clean string,
 * possibly empty.
 */
function sanitize(raw: string): string {
  let out = (raw ?? '').trim();
  // Strip wrapping quotes / brackets / book marks
  out = out.replace(/^[「『""''《【\[]+/, '').replace(/[」』""''》】\]]+$/, '');
  // Drop common meta prefixes
  out = out.replace(/^(?:标题|短视频标题|爆款标题|输出|回复)\s*[:：]\s*/, '');
  out = out.replace(/^(?:好的|当然)[,，。]?\s*/, '');
  // Cut at first newline (LLM occasionally emits multiple lines)
  out = out.split(/[\n\r]/, 1)[0].trim();
  // Drop trailing parenthetical commentary like "(更狠的版本)"
  out = out.replace(/\s*[（(](?:以下|以上|注|另外|另一种|更狠|另一版本|说明)[\s\S]*$/, '').trim();
  // Length cap — keep the first MAX_CAPTION_LEN chars + soft ellipsis if cut.
  if (out.length > MAX_CAPTION_LEN) {
    out = out.slice(0, MAX_CAPTION_LEN - 1) + '…';
  }
  return out;
}
