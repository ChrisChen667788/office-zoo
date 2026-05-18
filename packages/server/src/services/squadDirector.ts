/**
 * squadDirector — v1.4.1 5-act office sitcom generator.
 *
 * Called once per squad when the host hits "开演". Single LLM call
 * (~1200 tokens) — produces all 5 acts + recap as strict JSON.
 *
 * Failure mode: returns a synthesized fallback story so the squad
 * always has something to read. The fallback is template-driven
 * (per-member dialogue keyed off archetype.commonTactics) — passable
 * but obvious not-LLM, signaling "try again later" without breaking
 * the room.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { callLLMWithTimeout } from '../utils/llm';
import {
  SQUAD_DIRECTOR_SYSTEM_PROMPT,
  SQUAD_ACT_COUNT,
  findArchetype,
  type SquadMember,
  type SquadAct,
  type SquadRecap,
} from '@furball/shared';

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

interface DirectorResult {
  acts: SquadAct[];
  recap: SquadRecap;
}

export async function directSquadStory(opts: {
  members: SquadMember[];
  scenarioBrief?: string;
}): Promise<DirectorResult> {
  // Build the squad roster block — gives the LLM each member's id,
  // emoji, name, archetype, and 3-4 traits to anchor on. The ids are
  // critical: the LLM must use them verbatim in `speakerUserId` so
  // the client can route lines back to the right card.
  const roster = opts.members
    .map((m, i) => {
      const arc = m.archetypeId ? findArchetype(m.archetypeId) : null;
      const traits = arc?.characterNotes.slice(0, 3).join('; ') ?? '没参加过测试,中性 office body';
      const tag = arc ? `${arc.emoji} ${arc.name}` : '🐀 路人甲';
      return `  ${i + 1}. id=${m.userId} | ${tag} · ${m.displayName} · 特质:${traits}`;
    })
    .join('\n');

  const briefBlock = opts.scenarioBrief
    ? `\n\n额外背景设定(由 host 提供):\n${opts.scenarioBrief}`
    : '';

  const prompt =
    `Squad 成员名册(共 ${opts.members.length} 人):\n${roster}` +
    briefBlock +
    `\n\n请按格式输出严格 JSON,${SQUAD_ACT_COUNT} 幕 + recap。所有 speakerUserId 必须从上面 id= 那一栏抄一致 (除非用 "narrator")。realLifePrompt.targetUserId 同理。`;

  const openai = getOpenAI();
  const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');

  const res = await callLLMWithTimeout('SCORING', {
    model,
    system: SQUAD_DIRECTOR_SYSTEM_PROMPT,
    prompt,
    // 5 acts × ~250 tokens + recap ≈ 1400; cap generous since this is
    // the highest-value LLM call in the product.
    maxTokens: 1800,
    temperature: 0.95,
  });

  if (res.ok) {
    const parsed = parseDirectorJson(res.text);
    if (parsed) return parsed;
  }
  // Fallback — templated story so the squad isn't blocked on LLM down.
  return fallbackStory(opts.members);
}

/** Strict JSON parser tolerating markdown fences + trailing prose. */
function parseDirectorJson(raw: string): DirectorResult | null {
  try {
    let s = raw.trim();
    s = s.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start < 0 || end < 0) return null;
    const obj = JSON.parse(s.slice(start, end + 1)) as Partial<DirectorResult>;
    if (!obj.acts || !Array.isArray(obj.acts) || obj.acts.length < 3) return null;
    if (!obj.recap || typeof obj.recap !== 'object') return null;
    // Light validation: every act needs index + title + beats array.
    for (const a of obj.acts) {
      if (typeof a.index !== 'number' || typeof a.title !== 'string') return null;
      if (!Array.isArray(a.beats) || a.beats.length === 0) return null;
      for (const b of a.beats) {
        if (typeof b.speakerUserId !== 'string') return null;
        if (typeof b.speakerLabel !== 'string') return null;
        if (typeof b.line !== 'string') return null;
      }
    }
    return obj as DirectorResult;
  } catch {
    return null;
  }
}

/** Template-driven fallback. Picks each member's archetype catchphrase
 *  and slots it into a generic week-arc structure. Reads as "the LLM
 *  was down" but better than an error toast. */
function fallbackStory(members: SquadMember[]): DirectorResult {
  const labels: Record<string, string> = {};
  for (const m of members) {
    const arc = m.archetypeId ? findArchetype(m.archetypeId) : null;
    labels[m.userId] = arc ? `${arc.emoji} ${arc.name} · ${m.displayName}` : `🐀 ${m.displayName}`;
  }

  const titles = ['周一早会的预言', '茶水间的真相', '下午临时加班通知', '群消息互怼夜', '周五复盘会的反转'];

  const acts: SquadAct[] = Array.from({ length: SQUAD_ACT_COUNT }, (_, i) => {
    const idx = i + 1;
    const beats = [
      { speakerUserId: 'narrator' as const, speakerLabel: '旁白', line: `第 ${idx} 幕 - ${titles[i]}。` },
      ...members.slice(0, 3).map((m) => {
        const arc = m.archetypeId ? findArchetype(m.archetypeId) : null;
        const tactic = arc?.tagline ?? '一切尽在不言中。';
        return {
          speakerUserId: m.userId,
          speakerLabel: labels[m.userId],
          line: tactic,
        };
      }),
    ];
    return {
      index: idx,
      title: `第 ${idx} 幕 · ${titles[i]}`,
      beats,
      realLifePrompt: i === 2 ? {
        targetUserId: members[Math.min(1, members.length - 1)].userId,
        prompt: '@你 你今晚还加班吗?',
      } : undefined,
    };
  });

  const recap: SquadRecap = {
    headline: '这一桌的故事 — AI 编剧暂时离线,模板版凑合看',
    awards: members.slice(0, 4).map((m, i) => ({
      userId: m.userId,
      label: ['💎 MVP', '🎭 戏精', '👻 隐身王', '🦊 老油条'][i] || '✦ 出场',
      line: labels[m.userId],
    })),
    closer: '编剧 AI 在路上,稍后试试 "重新开演" 拿真版本',
  };

  return { acts, recap };
}
