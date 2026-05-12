/**
 * profileGenerator — v1.3.0 LLM-personalized profile from quiz result.
 *
 * Input: an Archetype + the user's raw TraitVector (so we know which
 * traits they leaned into hardest within that archetype).
 *
 * Output: 3 catchphrases ("你的招牌话术") + 1 personal tagline. Both
 * appear on the shareable profile card. Cheap call (one LLM round-trip,
 * ~120 tokens) so we can run it on every quiz completion.
 *
 * Failure mode: returns the archetype's static defaults so the user
 * still gets a card on LLM downtime — never blocks the quiz finish.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { callLLMWithTimeout } from '../utils/llm';
import type { Archetype, TraitVector } from '@furball/shared';

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

const SYSTEM_PROMPT = `你是中文职场段子手 + 性格洞察师。
任务:基于用户的"打工人 archetype" + 性格维度数据,生成 3 句"招牌话术" + 1 句"个性 tagline"。

要求:
- 每句话术 8-22 字,口语化,有梗,带 archetype 的特质
- tagline 12-30 字,精炼自嘲,可以截图发朋友圈
- 严禁出现真人姓名、真公司名、政治、违法、色情内容
- 不要写"你的话术:""tagline:"等任何前缀
- 直接 JSON 输出,格式:{"catchphrases":["...","...","..."],"tagline":"..."}
- 必须严格 JSON,不要 markdown 围栏不要解释`;

export interface PersonalizedProfile {
  catchphrases: [string, string, string];
  tagline: string;
}

export async function generatePersonalizedProfile(
  archetype: Archetype,
  rawTraits: TraitVector,
): Promise<PersonalizedProfile> {
  const fallback: PersonalizedProfile = {
    catchphrases: [
      archetype.tagline,
      `典型的${archetype.name},不解释`,
      '社畜的尽头是社畜',
    ],
    tagline: archetype.tagline,
  };

  // Pick the user's top 3 traits to bias the LLM (make the catchphrases
  // really fit THIS user, not just the archetype average).
  const sortedTraits = (Object.entries(rawTraits) as Array<[string, number]>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const openai = getOpenAI();
  const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');

  const prompt =
    `Archetype:${archetype.name} ${archetype.emoji}\n` +
    `特质要点:${archetype.characterNotes.join(' / ')}\n` +
    `用户最强的 3 个性格维度:${sortedTraits.join(' / ')}\n\n` +
    `请输出 3 句招牌话术 + 1 句 tagline,严格 JSON 格式。`;

  const res = await callLLMWithTimeout('SUGGESTIONS', {
    model,
    system: SYSTEM_PROMPT,
    prompt,
    maxTokens: 220,
    temperature: 0.95,
  });
  if (!res.ok) return fallback;
  return parseProfileJson(res.text) ?? fallback;
}

function parseProfileJson(raw: string): PersonalizedProfile | null {
  try {
    let s = raw.trim();
    // Strip markdown fences in case the model didn't follow instructions.
    s = s.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    // Find first { ... last } in case of trailing prose.
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start < 0 || end < 0) return null;
    const slice = s.slice(start, end + 1);
    const obj = JSON.parse(slice) as Partial<PersonalizedProfile>;
    if (!obj.catchphrases || !Array.isArray(obj.catchphrases) || obj.catchphrases.length < 3) return null;
    if (!obj.tagline || typeof obj.tagline !== 'string') return null;
    // Length-clamp + filter empty
    const phrases = obj.catchphrases
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .map((p) => p.length > 30 ? p.slice(0, 30) : p)
      .slice(0, 3);
    if (phrases.length < 3) return null;
    return {
      catchphrases: [phrases[0], phrases[1], phrases[2]],
      tagline: obj.tagline.length > 50 ? obj.tagline.slice(0, 50) : obj.tagline,
    };
  } catch {
    return null;
  }
}
