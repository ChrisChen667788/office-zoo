/**
 * dailyDrama — v1.4.0 personalized "今日剧情" generator.
 *
 * Goal: open the app on day N → there's already today's drama waiting,
 * tuned to your archetype. Return-visit hook + small but reliable
 * dopamine spike. Same drama for the same user all day; resets at
 * local midnight (server side: UTC date).
 *
 * Determinism: hash(userId + UTC date) seeds a PRNG that picks:
 *   - kind: 'fired' | 'talkshow' | 'pack' | 'pvp'
 *   - target: a specific scenarioId / scriptId / packId / null(fresh PvP)
 *
 * Then a single LLM call generates a one-line teaser ("今天 HR 又找你了
 * — 你被怀疑..."). LLM failure → fallback canned line so the card always
 * renders.
 *
 * Cache: in-memory Map<userId, {date, drama}>. Same user hitting the
 * endpoint multiple times in a day gets the cached drama (no LLM
 * burn). Cache cleared by date rollover.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { callLLMWithTimeout } from '../utils/llm';
import {
  ARCHETYPES,
  SCENARIOS as FIRED_SCENARIOS,
  SEED_SCRIPTS,
  findArchetype,
  type Archetype,
} from '@furball/shared';
import { findProfile } from './profileStore';
import { listPacks } from './packStore';

export type DramaKind = 'fired' | 'talkshow' | 'pack' | 'pvp';

export interface DailyDrama {
  /** YYYY-MM-DD (UTC) — date this drama is for. Cleared at midnight. */
  date: string;
  kind: DramaKind;
  /** Target id depends on kind: scenarioId / scriptId / packId / null for pvp. */
  targetId: string | null;
  /** Inline display data so the client doesn't need a 2nd fetch. */
  targetTitle: string;
  targetEmoji: string;
  /** Deeplink the card CTA should navigate to. */
  cta: { label: string; href: string };
  /** LLM-generated 1-line teaser. Falls back to canned line on LLM down. */
  teaser: string;
  /** When archetype-aware, surfaces emoji + name for the header chip. */
  archetypeEmoji?: string;
  archetypeName?: string;
}

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

// In-mem cache: userId → DailyDrama. We also key by date to bust on rollover.
const cache = new Map<string, DailyDrama>();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Deterministic 32-bit hash so today's drama is reproducible per user. */
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG seeded with the daily hash. */
function makePrng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYSTEM_PROMPT = `你是社畜剧情编剧。给你一个"今日剧情"的设定,写一句"开场提醒",像短视频开头那样勾住人。
要求:
- 一句话,18-30 个汉字
- 第二人称,对着用户说("今天 HR 又找你了, 你被怀疑...")
- 必须扣紧场景 + 用户的 archetype 性格
- 不要写"你是 XX 类型",直接进剧情
- 严禁真人姓名/真公司名/政治内容
- 直接出正文,不要"开场提醒:"等任何前缀`;

async function generateTeaser(opts: {
  archetype: Archetype | null;
  kind: DramaKind;
  title: string;
}): Promise<string> {
  const fallback =
    opts.kind === 'fired'    ? `今天 HR 把你叫到了会议室 — 主题:${opts.title}`
  : opts.kind === 'talkshow' ? `今天有人转给你看一段:《${opts.title}》— 笑出鹅叫`
  : opts.kind === 'pack'     ? `今天朋友丢给你一个挑战:5 关闯关包《${opts.title}》`
  :                            `今天有人邀请你当 PvP 房间的工人 — 朋友扮 HR 跟你硬碰硬`;

  const openai = getOpenAI();
  const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');

  const archetypePart = opts.archetype
    ? `用户性格:${opts.archetype.emoji}${opts.archetype.name}(${opts.archetype.tagline})`
    : '用户性格:未测试';

  const kindPart =
    opts.kind === 'fired'    ? `今天的剧情是裁员谈判:${opts.title}`
  : opts.kind === 'talkshow' ? `今天给用户推一段脱口秀:${opts.title}`
  : opts.kind === 'pack'     ? `今天给用户推一个 5 关闯关包:${opts.title}`
  :                            '今天邀请用户开 PvP 房间(朋友扮 HR)';

  const res = await callLLMWithTimeout('SUGGESTIONS', {
    model,
    system: SYSTEM_PROMPT,
    prompt: `${archetypePart}\n${kindPart}\n\n请写一句开场提醒,18-30 字。`,
    maxTokens: 80,
    temperature: 1.0,
  });
  if (!res.ok) return fallback;
  const cleaned = res.text.trim()
    .replace(/^[「『""'']+/, '').replace(/[」』""'']+$/, '')
    .replace(/^(?:开场提醒|提醒|开场)\s*[:：]\s*/, '')
    .split(/[\n\r]/, 1)[0]
    .trim();
  if (!cleaned || cleaned.length < 6) return fallback;
  return cleaned.length > 50 ? cleaned.slice(0, 50) : cleaned;
}

/** Pick today's drama for a user. Returns from cache when possible. */
export async function getDailyDrama(userId: string): Promise<DailyDrama> {
  const date = todayUTC();
  const cached = cache.get(userId);
  if (cached && cached.date === date) return cached;

  // Resolve archetype.
  const profile = await findProfile(userId).catch(() => null);
  const archetype = profile?.topArchetypes?.[0]
    ? findArchetype(profile.topArchetypes[0]) ?? null
    : null;

  // Seeded PRNG.
  const prng = makePrng(hash32(userId + ':' + date));

  // Pick drama kind. Weight slightly toward fired+talkshow (the most
  // satisfying single-tap experiences); pack is heavier-commitment so
  // weight lower; pvp depends on having a friend so weight lowest.
  const kindRoll = prng();
  const kind: DramaKind =
    kindRoll < 0.40 ? 'fired'
  : kindRoll < 0.75 ? 'talkshow'
  : kindRoll < 0.92 ? 'pack'
  :                   'pvp';

  let drama: Omit<DailyDrama, 'teaser' | 'date'>;

  if (kind === 'fired') {
    // Pick order (most-specific → fallback):
    //   1. archetype.shineScenarioId — exact hand-curated pairing
    //   2. v2.4.0 — region match (NEW; parallel to industry tier).
    //      Tribe archetypes have BOTH region + industry; region wins
    //      because "this scenario knows I'm a 海外润人" lands harder
    //      than "this scenario is FAANG-flavored".
    //   3. v2.1.0 — industry match
    //   4. random free scenario
    //
    // Premium-aware: when a tribe match exists ONLY in the premium
    // pool (e.g. all overseas-tagged scenarios are premium), the
    // picker still surfaces it as the daily — the client renders a 🔒
    // overlay and routes the CTA to /premium. This is a conversion
    // hook by design: showing "today's overseas drama is locked"
    // beats showing a generic non-matching free drama.
    const free    = FIRED_SCENARIOS.filter((s) => !s.premium);
    const allPool = FIRED_SCENARIOS;
    const matchIn = (pool: typeof FIRED_SCENARIOS, predicate: (s: typeof pool[number]) => boolean) =>
      pool.filter(predicate);

    // shineScenarioId stays free-only (v2.1.0 behavior): if the
    // archetype's hand-curated pairing is premium, fall through to the
    // tribe tiers. The "premium-as-conversion" surface only applies
    // when the user's TRIBE has zero free matches — a hand-curated
    // shine pointing at a premium scenario is more often a tagging
    // accident than an intentional conversion play.
    const shine = archetype && free.find((s) => s.id === archetype.shineScenarioId);
    const regionMatchesFree   = archetype?.region   ? matchIn(free,    (s) => s.region   === archetype.region)   : [];
    const regionMatchesAll    = archetype?.region   ? matchIn(allPool, (s) => s.region   === archetype.region)   : [];
    const industryMatchesFree = archetype?.industry ? matchIn(free,    (s) => s.industry === archetype.industry) : [];
    const industryMatchesAll  = archetype?.industry ? matchIn(allPool, (s) => s.industry === archetype.industry) : [];

    // Free first per tier; fall over to premium-allowed only when free
    // returns empty (the conversion case).
    const pickRegion   = regionMatchesFree.length   > 0 ? regionMatchesFree[Math.floor(prng() * regionMatchesFree.length)]
                       : regionMatchesAll.length    > 0 ? regionMatchesAll[Math.floor(prng() * regionMatchesAll.length)]
                       : undefined;
    const pickIndustry = industryMatchesFree.length > 0 ? industryMatchesFree[Math.floor(prng() * industryMatchesFree.length)]
                       : industryMatchesAll.length  > 0 ? industryMatchesAll[Math.floor(prng() * industryMatchesAll.length)]
                       : undefined;
    const pick = shine ?? pickRegion ?? pickIndustry ?? free[Math.floor(prng() * free.length)];
    drama = {
      kind: 'fired',
      targetId: pick.id,
      targetTitle: pick.title,
      targetEmoji: pick.emoji,
      cta: { label: '走进谈判室 →', href: `/fired?focus=${pick.id}` },
    };
  } else if (kind === 'talkshow') {
    // Pick order (most-specific → fallback):
    //   1. archetype.region match (v2.3.0 NEW) — if user is tribe-tagged
    //      (北漂/沪漂/etc), prefer scripts dedicated to that city. This
    //      reads as "the bot knows you're from Shanghai" which lands.
    //   2. archetype.shineTalkshowTag — semantic tag match from v1.x
    //   3. anything random from the full pool
    const regionPool = archetype?.region
      ? SEED_SCRIPTS.filter((s) => s.region === archetype.region)
      : [];
    const tagPool = archetype
      ? SEED_SCRIPTS.filter((s) => s.tag === archetype.shineTalkshowTag)
      : [];
    const pool =
      regionPool.length > 0 ? regionPool
    : tagPool.length    > 0 ? tagPool
    :                         SEED_SCRIPTS;
    const pick = pool[Math.floor(prng() * pool.length)];
    drama = {
      kind: 'talkshow',
      targetId: pick.id,
      targetTitle: pick.title,
      targetEmoji: '🎤',
      cta: { label: '听这段 →', href: `/talkshow?id=${pick.id}` },
    };
  } else if (kind === 'pack') {
    const all = await listPacks().catch(() => []);
    if (all.length === 0) {
      // No user packs yet — degrade to fired pick.
      const free = FIRED_SCENARIOS.filter((s) => !s.premium);
      const pick = free[Math.floor(prng() * free.length)];
      drama = {
        kind: 'fired',
        targetId: pick.id,
        targetTitle: pick.title,
        targetEmoji: pick.emoji,
        cta: { label: '走进谈判室 →', href: `/fired?focus=${pick.id}` },
      };
    } else {
      const pick = all[Math.floor(prng() * all.length)];
      drama = {
        kind: 'pack',
        targetId: pick.id,
        targetTitle: pick.title,
        targetEmoji: pick.emoji ?? '📦',
        cta: { label: '挑战 5 关 →', href: `/fired/pack/${pick.id}` },
      };
    }
  } else {
    // PvP — no specific target, just an open invite.
    const free = FIRED_SCENARIOS.filter((s) => !s.premium);
    const seed = free[Math.floor(prng() * free.length)];
    drama = {
      kind: 'pvp',
      targetId: seed.id,
      targetTitle: seed.title,
      targetEmoji: '🤝',
      cta: { label: '叫朋友扮 HR →', href: `/fired/room/new?scenarioId=${seed.id}` },
    };
  }

  const teaser = await generateTeaser({
    archetype,
    kind: drama.kind,
    title: drama.targetTitle,
  });

  const out: DailyDrama = {
    date, ...drama, teaser,
    archetypeEmoji: archetype?.emoji,
    archetypeName: archetype?.name,
  };
  cache.set(userId, out);
  return out;
}

export function _resetDailyDramaCache() { cache.clear(); }

// Touch ARCHETYPES so it stays imported (used implicitly by findArchetype
// via the shared module — keeps tree-shaking happy).
void ARCHETYPES;
