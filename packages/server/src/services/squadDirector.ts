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
  ARCHETYPE_PAIRS,
  findArchetype,
  type Archetype,
  type SquadMember,
  type SquadAct,
  type SquadRecap,
  type RegionId,
  type IndustryId,
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
  //
  // v3.0.0 — roster now includes the region/industry tribe tag so the
  // LLM can write geographically/industrially-accurate jokes (国企
  // dad jokes vs FAANG OKR speak vs 杭州花名 culture).
  const roster = opts.members
    .map((m, i) => {
      const arc = m.archetypeId ? findArchetype(m.archetypeId) : null;
      const traits = arc?.characterNotes.slice(0, 3).join('; ') ?? '没参加过测试,中性 office body';
      const tag = arc ? `${arc.emoji} ${arc.name}` : '🐀 路人甲';
      const tribeBits: string[] = [];
      if (arc?.region   && arc.region   !== 'generic') tribeBits.push(`region=${arc.region}`);
      if (arc?.industry && arc.industry !== 'generic') tribeBits.push(`industry=${arc.industry}`);
      const tribeSuffix = tribeBits.length > 0 ? ` [${tribeBits.join(', ')}]` : '';
      return `  ${i + 1}. id=${m.userId}${tribeSuffix} | ${tag} · ${m.displayName} · 特质:${traits}`;
    })
    .join('\n');

  // v3.0.0 — pre-compute the squad's group dynamics and feed the LLM
  // a "chemistry" hint. Without this, every squad got the same
  // generic 5-act arc regardless of mix. With it, an 国企+大厂 room
  // gets a culture-clash drama; a room of all 北漂 gets a 群像剧;
  // a rival pair present gets a 火药味 arc. The hint is advisory,
  // not prescriptive — the LLM still owns the actual writing.
  const chemistry = analyzeSquadChemistry(opts.members);
  const chemistryBlock = chemistry
    ? `\n\n小队化学反应分析(导演必读 — 这些动力学应在 5 幕里有所体现):\n${chemistry}`
    : '';

  const briefBlock = opts.scenarioBrief
    ? `\n\n额外背景设定(由 host 提供):\n${opts.scenarioBrief}`
    : '';

  const prompt =
    `Squad 成员名册(共 ${opts.members.length} 人):\n${roster}` +
    chemistryBlock +
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

// ────────────────────────────────────────────────────────────────────
// v3.0.0 — Squad chemistry analyzer
//
// Pure function over the member roster — returns 0-N stage-direction
// bullets that the LLM treats as advisory. Heuristics:
//
//   1. CULTURE CLASH — opposing industry tribes present
//        (国企 vs 大厂 = "iron rice bowl meets OKR speak")
//   2. SHARED TRIBE — all (or majority) belong to the same region
//        ("all 北漂 → 群像剧 about shared struggles")
//   3. RIVAL PAIR — two members are ARCHETYPE_PAIRS rivals
//        ("天敌同台 → 火药味 from the start")
//   4. TRAIT EXTREMES — wide spread on a single dim (e.g. grind
//      max 0.95 vs min 0.1) → "卷王 vs 摆烂 的张力"
//   5. SOLO TRIBE OUTLIER — exactly one member with a tribe in a
//      sea of generics → "他/她在这桌格格不入"
//
// Returns a markdown-bulleted block. Empty string when no notable
// dynamics — common case for v1.x archetype-only squads.
// ────────────────────────────────────────────────────────────────────

/** Industry pairs that read as natural culture-clash. Hand-picked,
 *  not derived (the "iron rice bowl vs hustler" frame is a specific
 *  cultural trope, not a math result). */
const CULTURE_CLASH_INDUSTRY: Array<[IndustryId, IndustryId, string]> = [
  ['soe', 'faang',    '国企的稳定 vs 大厂的 OKR — 文化冲突大戏'],
  ['soe', 'startup',  '国企的"红头文件"思维 vs 创业的"all in"狂热'],
  ['soe', 'mcn',      '国企的体面 vs 网红的流量 — 两个时代的同框'],
  ['faang','edu',     '大厂的"颗粒度对齐" vs 教培的"私域裂变" — 黑话互殴'],
  ['finance','startup','金融的风控 vs 创业的赌博 — 两种风险偏好'],
  ['finance','mcn',   '金融的西装 vs 网红的灯架 — 体面感 vs 表演感'],
];

const CULTURE_CLASH_REGION: Array<[RegionId, RegionId, string]> = [
  ['beijing', 'chengdu',  '北漂 996 vs 成都摆烂 — 两种活法'],
  ['shanghai','beijing',  '沪上精致 vs 京味儿野 — Manner 和煎饼的对话'],
  ['shenzhen','chengdu',  '深圳搞钱 vs 成都火锅 — 价值观的两极'],
  ['overseas','beijing',  '海外润人 vs 还在五道口卷的人'],
  ['hangzhou','beijing',  '杭州花名 vs 北京真名 — 互联网两大流派'],
];

export function analyzeSquadChemistry(members: SquadMember[]): string {
  const arcs: Array<{ m: SquadMember; arc: Archetype | null }> = members.map((m) => ({
    m,
    arc: m.archetypeId ? findArchetype(m.archetypeId) ?? null : null,
  }));

  const lines: string[] = [];

  // 1. Culture clash — industry contrast
  const industries = new Set<IndustryId>();
  for (const x of arcs) {
    if (x.arc?.industry && x.arc.industry !== 'generic') industries.add(x.arc.industry);
  }
  for (const [a, b, hint] of CULTURE_CLASH_INDUSTRY) {
    if (industries.has(a) && industries.has(b)) {
      lines.push(`• 行业碰撞 — ${hint}`);
      break; // one culture clash per arc keeps the story focused
    }
  }

  // 2. Culture clash — region contrast (only if no industry clash fired)
  if (lines.length === 0) {
    const regions = new Set<RegionId>();
    for (const x of arcs) {
      if (x.arc?.region && x.arc.region !== 'generic') regions.add(x.arc.region);
    }
    for (const [a, b, hint] of CULTURE_CLASH_REGION) {
      if (regions.has(a) && regions.has(b)) {
        lines.push(`• 地域碰撞 — ${hint}`);
        break;
      }
    }
  }

  // 3. Shared tribe — all (or 2/3+) same region/industry
  const regionCounts: Partial<Record<RegionId, number>> = {};
  const industryCounts: Partial<Record<IndustryId, number>> = {};
  for (const x of arcs) {
    if (x.arc?.region   && x.arc.region   !== 'generic') regionCounts[x.arc.region]     = (regionCounts[x.arc.region]     ?? 0) + 1;
    if (x.arc?.industry && x.arc.industry !== 'generic') industryCounts[x.arc.industry] = (industryCounts[x.arc.industry] ?? 0) + 1;
  }
  const majority = (n: number) => n >= Math.ceil(members.length * 2 / 3);
  for (const [r, n] of Object.entries(regionCounts)) {
    if (n !== undefined && majority(n)) {
      lines.push(`• 同城群像 — ${n}/${members.length} 人都是 ${r} 圈,可以写成"我们这一波 ${r} 人"的共同苦水`);
    }
  }
  for (const [i, n] of Object.entries(industryCounts)) {
    if (n !== undefined && majority(n)) {
      lines.push(`• 同行业群像 — ${n}/${members.length} 人都在 ${i} 行业,共同的术语 / 痛点 / 内行黑话可以密集出现`);
    }
  }

  // 4. Rival pair present — drives natural conflict
  for (let i = 0; i < arcs.length; i++) {
    for (let j = i + 1; j < arcs.length; j++) {
      const a = arcs[i].arc, b = arcs[j].arc;
      if (!a || !b) continue;
      const aPair = ARCHETYPE_PAIRS[a.id];
      const bPair = ARCHETYPE_PAIRS[b.id];
      if (aPair?.rival === b.id || bPair?.rival === a.id) {
        lines.push(`• 天敌同台 — ${a.emoji}${a.name} 和 ${b.emoji}${b.name} 互为天敌,从第一幕开始就有摩擦`);
        break;
      }
    }
  }

  // 5. Trait extremes — find the dim with widest spread
  if (arcs.every((x) => x.arc)) {
    const traitNames: Record<string, string> = {
      grind: '卷度', snark: '阴阳度', ambition: '进取心',
      empathy: '人情味', cynicism: '摆烂度', visibility: '存在感',
    };
    let bestDim: string | null = null;
    let bestSpread = 0;
    for (const dim of Object.keys(traitNames)) {
      const vals = arcs.map((x) => x.arc!.traits[dim as keyof typeof x.arc.traits]);
      const spread = Math.max(...vals) - Math.min(...vals);
      if (spread > bestSpread) { bestSpread = spread; bestDim = dim; }
    }
    if (bestDim && bestSpread >= 0.7) {
      const dimName = traitNames[bestDim];
      lines.push(`• ${dimName}的两极 — 这桌最${dimName.replace('度', '').replace('心', '').replace('味', '').replace('感', '')}的和最不${dimName.replace('度', '').replace('心', '').replace('味', '').replace('感', '')}的差距很大,可以做对照镜头`);
    }
  }

  // 6. Solo outlier — exactly one tribe member in a sea of generics
  const tribeMembers = arcs.filter((x) => x.arc?.region || x.arc?.industry);
  if (tribeMembers.length === 1 && arcs.length >= 3) {
    const out = tribeMembers[0].arc!;
    const what = out.region !== 'generic' && out.region ? out.region : out.industry;
    lines.push(`• 单点外人 — 这桌只有 ${out.emoji}${out.name} 一个 ${what} 背景,其他人都是中性 office body,可以写成"格格不入"的张力`);
  }

  return lines.join('\n');
}
