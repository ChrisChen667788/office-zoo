import { Hono } from 'hono';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  SCENARIOS as FIRED_SCENARIOS,
  HR_PERSONALITIES,
  type FiredScenario,
  type HRPersonality,
} from '@furball/shared';
import { callLLMWithTimeout } from '../utils/llm';
import { logger } from '../utils/logger';
import { validateBody } from '../utils/validate';
import {
  listUserScenarios,
  findUserScenario,
  addUserScenario,
  incrementScenarioLike,
  decrementScenarioLike,
  incrementScenarioPlay,
} from '../services/scenarioStore';
import { generateFiredScenario } from '../services/firedScenarioGenerator';
import { createRateLimiter } from '../utils/rateLimit';
import {
  listMemories,
  listScenarioStats,
  recordMemory,
} from '../services/memoryStore';
import { summarizeTactic } from '../services/tacticSummarizer';
import { findProfile } from '../services/profileStore';
import {
  listPacks,
  findPack,
  addPack,
  incrementPackLike,
  decrementPackLike,
  incrementPackPlay,
  mintPackId,
} from '../services/packStore';
import type { FiredPack } from '@furball/shared';

// v0.9.0 — pack creation gets the same 5/hr cap as scenario gen because
// it's UGC that other users will see. Like + browse are unlimited.
const packCreateLimiter = createRateLimiter({ windowMs: 3600_000, max: 5 });

// Per-IP dedup for pack hearts (parallel to scriptStore + scenarioStore).
const packLikedByIp = new Set<string>();

// v0.8.0 — same 5/hour/IP cap as talkshow's /generate. Scenario gen is even
// more expensive (1400 maxTokens vs talkshow's 480) so the limit matters
// more here.
const scenarioGenLimiter = createRateLimiter({ windowMs: 3600_000, max: 5 });

function ipFromHono(c: { req: { header: (k: string) => string | undefined } }): string {
  const fwd = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip');
  if (fwd) return fwd.split(',')[0].trim();
  return c.req.header('host') ?? 'unknown';
}

/** v0.8.1 — pull the per-IP-like dedup key for a scenario. Mirrors talkshow's
 *  approach (in-memory Set, resets on restart, fine at our scale). Seed
 *  scenarios get an in-memory like counter; user scenarios persist to disk. */
const scenarioLikedByIp = new Set<string>();
const seedScenarioLikes = new Map<string, number>();
/** v0.9.2 — same in-mem-only treatment for seed plays. */
const seedScenarioPlays = new Map<string, number>();
const seedPackPlays     = new Map<string, number>(); // unused for now (no seed packs); placeholder for symmetry

const routeLog = logger.child({ component: 'fired' });

// ---------------------------------------------------------------------------
// Zod schemas — reject bad input at the edge.
// ---------------------------------------------------------------------------
const ChatMessageSchema = z.object({
  role: z.enum(['user', 'hr']),
  // Cap at 2k chars to prevent prompt-stuffing / giant OpenAI bills.
  content: z.string().min(1).max(2000),
});

const ChatRequestSchema = z.object({
  scenarioId: z.string().min(1).max(64),
  personalityId: z.enum(['rookie', 'veteran', 'demon']),
  // Cap conversation length — upstream MAX_ROUNDS is 10, but we also need
  // to cap total messages to prevent DoS via huge history.
  messages: z.array(ChatMessageSchema).max(40),
});

const TTSRequestSchema = z.object({
  text: z.string().min(1).max(500),
  personalityId: z.enum(['rookie', 'veteran', 'demon']),
});

const SuggestRequestSchema = z.object({
  scenarioId: z.string().min(1).max(64),
  messages: z.array(ChatMessageSchema).min(1).max(40),
});

// ---------------------------------------------------------------------------
// OpenAI setup — lazy init so env vars are loaded by dotenv first
// ---------------------------------------------------------------------------
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
function getModel() {
  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
}

// ---------------------------------------------------------------------------
// Types — request types are derived from the zod schemas above (single source
// of truth). Response-shape types stay hand-written since they're not validated.
// ---------------------------------------------------------------------------
type ChatMessage = z.infer<typeof ChatMessageSchema>;

interface TurnScores {
  legalKnowledge: number;
  negotiationSkill: number;
  emotionalControl: number;
  evidenceAwareness: number;
}

interface Outcome {
  compensationMonths: number;
  maxPossible: number;
  summary: string;
}

// Maximum number of user exchanges before forced game over.
// Keeps conversations focused and prevents runaway API costs.
const MAX_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Voice instructions per HR personality (for TTS)
// ---------------------------------------------------------------------------
const HR_VOICE_INSTRUCTIONS: Record<string, string> = {
  rookie: '紧张、不自信、说话犹豫',
  veteran: '平静、专业、打太极的语气',
  demon: '威严、施压、PUA的语气',
};

// Voice names per personality
const HR_VOICE_NAMES: Record<string, string> = {
  rookie: 'shimmer',
  veteran: 'onyx',
  demon: 'ash',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** v0.8.0 — look up a scenario by id, checking the seed catalogue first
 *  (cheap, in-memory) then the user-generated store (file-backed). Async
 *  because the user store touches disk. All callers were already inside
 *  async route handlers so propagating the await is one keystroke each. */
async function getScenario(id: string): Promise<FiredScenario | undefined> {
  const seed = FIRED_SCENARIOS.find((s) => s.id === id);
  if (seed) return seed;
  const user = await findUserScenario(id);
  return user ?? undefined;
}

function getPersonality(id: string): HRPersonality | undefined {
  return HR_PERSONALITIES.find((p) => p.id === id);
}

/** v0.8.2 — surface readable Chinese for the outcome enum so the prompt
 *  block reads natural ("胜诉" vs "win"). */
function outcomeZh(o: 'win' | 'partial' | 'lose'): string {
  if (o === 'win')     return '胜诉';
  if (o === 'partial') return '部分胜诉';
  return '失败';
}

/**
 * Build the system prompt for the HR role-play.
 *
 * v0.8.2 — when prior `memories` exist for this (user, scenario), inject
 * them into the prompt so HR can pre-empt repeated tactics. The block
 * appears AFTER the scenario context so the model sees the situation
 * first, then "oh and you've met this person before, here's what they
 * pulled last time". Empty memories array → no injection (legacy
 * behaviour preserved).
 */
import type { PlayMemory } from '../services/memoryStore';
import { ARCHETYPE_WEAK_SPOTS, findArchetype } from '@furball/shared';

/** v1.3.2 — archetype context the HR prompt builder consumes when the
 *  user has taken the personality quiz. `null` for guests / pre-quiz
 *  users; the system prompt then matches v1.3.1 behavior exactly. */
interface ArchetypeContext {
  id: string;
  name: string;
  emoji: string;
  intro: string;
  ammo: string[];
  /** Personality difficulty determines how aggressively the weak-spots
   *  are deployed. demon = full ammo + explicit instructions to PUA;
   *  veteran = use them as subtle subtext; rookie = barely tinted. */
  aggressiveness: 'subtle' | 'medium' | 'full';
}

function buildHRSystemPrompt(
  scenario: FiredScenario,
  personality: HRPersonality,
  memories: PlayMemory[] = [],
  archetype: ArchetypeContext | null = null,
): string {
  const memoryBlock = memories.length === 0 ? '' : `

【重要 — 你认得这位员工 (v0.8.2 记忆层)】
这位员工之前在你这关已经来过 ${memories.length} 次,套路如下:
${memories.map((m, i) => `  ${i + 1}. [${outcomeZh(m.outcome)}, ${m.tookRounds}轮] ${m.tactic}`).join('\n')}

请预判这些招数,不要再被绕进去:
- 如果员工又用同样的法律条文施压,你可以反驳"这条上次已经讨论过,公司立场没变"
- 如果员工在重复成功的话术,提前掐断,转换战场
- 但仍要保持 HR 的角色扮演风格,不要直接说"我记得你"`;

  const archetypeBlock = !archetype ? '' : (
    archetype.aggressiveness === 'subtle' ? `

【人物档案 (v1.3.2)】
${archetype.intro}
适当感受这个员工的性格特质,但不要刻意针对。` :

    archetype.aggressiveness === 'medium' ? `

【人物档案 (v1.3.2)】
${archetype.intro}
你已经看过他的人事档案,在对话中可以巧妙利用这些性格特质,但保持专业。
参考话术:
${archetype.ammo.slice(0, 2).map((s, i) => `  ${i + 1}. ${s}`).join('\n')}` :

    /* full */ `

【⚠️ 人物档案 — 戳他痛点 (v1.3.2)】
${archetype.intro}
你 HR 系统里有他的完整心理画像,要用最狠的方式 PUA 他的弱点。
精确弹药库(挑 1-2 条用,自然融入对话):
${archetype.ammo.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}

要求:
- 不要原样念出弹药条目,要消化成你 HR 的语气
- 每轮对话最多戳一次弱点,过度会反作用
- 必须自然融入场景,不要让员工察觉你在按剧本 PUA
- 如果员工识破你的套路,假装"我只是想帮你",换一条弹药`
  );

  return `${personality.systemPrompt}

当前场景: ${scenario.title}
场景描述: ${scenario.description}
员工情况: ${scenario.playerContext}
法律背景: ${scenario.legalSituation}
最大赔偿: ${scenario.maxCompensation}个月工资${memoryBlock}${archetypeBlock}

你正在扮演这位HR，与即将被裁员的员工进行谈判。根据你的性格特点进行对话。
重要规则:
- 始终保持角色扮演，不要跳出HR的身份
- 根据场景中的公司立场和你的性格来回应
- 如果员工提出合理的法律依据，你可以适当让步，但要尽量减少公司赔偿
- 对话要自然真实，像真实的裁员谈判一样
- 用中文回复，控制在2-4句话以内
- 你的常用话术: ${personality.commonTactics.join('、')}`;
}

/**
 * Format the message history into a prompt string for the AI.
 */
function formatConversation(messages: ChatMessage[]): string {
  return messages
    .map((m) => (m.role === 'hr' ? `HR: ${m.content}` : `员工: ${m.content}`))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const firedRouter = new Hono();

// ---------------------------------------------------------------------------
// POST /chat  (mounted at /api/fired/chat)
// ---------------------------------------------------------------------------
firedRouter.post('/chat', async (c) => {
  try {
    const v = await validateBody(c, ChatRequestSchema);
    if (!v.ok) return v.response;
    const { scenarioId, personalityId, messages } = v.data;

    const scenario = await getScenario(scenarioId);
    if (!scenario) {
      return c.json({ error: `Unknown scenario: ${scenarioId}` }, 400);
    }

    const personality = getPersonality(personalityId);
    if (!personality) {
      return c.json({ error: `Unknown personality: ${personalityId}` }, 400);
    }

    // v0.8.2 — pull this user's prior memories for the scenario so HR
    // pre-empts repeated tactics. Missing X-User-Id header (legacy
    // clients) → empty memories → prompt is identical to v0.8.1.
    const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
    const memories = userId ? await listMemories(userId, scenarioId) : [];

    // v1.3.2 — load the user's quiz profile (if any) so HR can PUA
    // their archetype-specific weak spots. Aggressiveness scales with
    // personality difficulty: rookie HR barely uses them, demon HR
    // weaponizes the full ammo list. Soft-fails to null on missing
    // profile / store error so legacy users get the v1.3.1 prompt.
    let archetypeCtx: Parameters<typeof buildHRSystemPrompt>[3] = null;
    if (userId) {
      try {
        const profile = await findProfile(userId);
        if (profile?.topArchetypes?.[0]) {
          const arc = findArchetype(profile.topArchetypes[0]);
          const ws = arc ? ARCHETYPE_WEAK_SPOTS[arc.id] : undefined;
          if (arc && ws) {
            archetypeCtx = {
              id: arc.id, name: arc.name, emoji: arc.emoji,
              intro: ws.intro, ammo: ws.ammo,
              aggressiveness:
                personalityId === 'demon'   ? 'full'
              : personalityId === 'veteran' ? 'medium'
              :                                'subtle',
            };
          }
        }
      } catch { /* profileStore down — non-critical, continue without */ }
    }

    const systemPrompt = buildHRSystemPrompt(scenario, personality, memories, archetypeCtx);
    const conversation = formatConversation(messages);

    // ------ 1. Generate HR response (creative, temperature 0.9) ------
    const isInit = messages.length === 0;
    const userTurnCount = messages.filter((m) => m.role === 'user').length;
    // forceOver=true after the player has spoken MAX_ROUNDS times
    const forceOver = userTurnCount >= MAX_ROUNDS;

    // v0.9.2 — bump play count when this is a fresh chat session.
    // Fire-and-forget so a slow disk write never blocks LLM call below.
    // Counts a "play" when the chat opens (isInit), not per turn — that
    // way a 10-round game = 1 play, not 10.
    if (isInit) {
      const isUserScenario = !FIRED_SCENARIOS.some((s) => s.id === scenarioId);
      if (isUserScenario) {
        void incrementScenarioPlay(scenarioId);
      } else {
        seedScenarioPlays.set(scenarioId, (seedScenarioPlays.get(scenarioId) ?? 0) + 1);
      }
    }

    const hrPrompt = isInit
      ? `你是HR，现在把员工叫到会议室，开始这场裁员谈判。请说出你的开场白（2-3句话，符合你的性格特点和场景设定）。`
      : forceOver
        ? `以下是到目前为止的对话:\n${conversation}\n\n双方已经谈判了${MAX_ROUNDS}轮,现在必须给出最终答复——告诉员工公司的最终决定和赔偿方案(2-3句话)。`
        : `以下是到目前为止的对话:\n${conversation}\n\n请以HR的身份回复员工最新的发言。`;

    const hrRes = await callLLMWithTimeout('CHAT_REPLY', {
      model: getOpenAI()(getModel()),
      system: systemPrompt,
      prompt: hrPrompt,
      maxTokens: 400,
      temperature: 0.9,
    });
    if (!hrRes.ok) {
      routeLog.error(
        { route: 'chat', reason: hrRes.reason, errorMessage: hrRes.errorMessage },
        'HR response LLM failed',
      );
      return c.json(
        {
          error:
            hrRes.reason === 'timeout'
              ? 'HR 响应超时，请稍后重试'
              : 'HR 服务暂时不可用，请稍后重试',
        },
        503,
      );
    }
    const hrResponse = hrRes.text;

    // ------ 2. Score the player's performance (consistent, temperature 0.3) ------
    // Skip scoring for initial greeting (no user input yet)
    let scoringRaw = '';
    if (!isInit) {
      const scoringPrompt = `你是一位劳动法专家和谈判教练。请评估以下裁员谈判中员工的表现。

场景: ${scenario.title}
法律背景: ${scenario.legalSituation}

对话记录:
${conversation}

HR最新回复: ${hrResponse}

请严格按照以下JSON格式返回评分（0-100分）和分析，不要包含任何其他内容:
{
  "scores": {
    "legalKnowledge": <number>,
    "negotiationSkill": <number>,
    "emotionalControl": <number>,
    "evidenceAwareness": <number>
  },
  "lawyerTip": "<给员工的一句悄悄话建议，如果没有特别建议则为null>",
  "keyMoment": "<如果这是关键转折点则描述，否则为null>",
  "isOver": <boolean>,
  "outcome": <如果isOver为true则返回{"compensationMonths": <number>, "maxPossible": <number>, "summary": "<结果总结>"}，否则为null>
}`;

      const scoringRes = await callLLMWithTimeout('SCORING', {
        model: getOpenAI()(getModel()),
        system: '你是一个严格输出JSON的评分系统。只输出合法的JSON，不要输出任何其他内容。',
        prompt: scoringPrompt,
        maxTokens: 500,
        temperature: 0.3,
      });
      if (!scoringRes.ok) {
        routeLog.warn(
          { route: 'chat', reason: scoringRes.reason },
          'scoring LLM failed — falling back to default scores',
        );
        // scoringRaw stays empty; the try/catch below will skip parsing and keep defaults
      } else {
        scoringRaw = scoringRes.text;
      }
    }

    // Parse scoring JSON
    let scores: TurnScores = {
      legalKnowledge: isInit ? 0 : 50,
      negotiationSkill: isInit ? 0 : 50,
      emotionalControl: isInit ? 0 : 50,
      evidenceAwareness: isInit ? 0 : 50,
    };
    let lawyerTip: string | null = null;
    let keyMoment: string | null = null;
    let isOver = false;
    let outcome: Outcome | null = null;

    try {
      if (!scoringRaw) throw new Error('skip-scoring');
      // Strip markdown code fences if present
      const cleaned = scoringRaw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.scores) {
        scores = {
          legalKnowledge: clampScore(parsed.scores.legalKnowledge),
          negotiationSkill: clampScore(parsed.scores.negotiationSkill),
          emotionalControl: clampScore(parsed.scores.emotionalControl),
          evidenceAwareness: clampScore(parsed.scores.evidenceAwareness),
        };
      }
      lawyerTip = parsed.lawyerTip ?? null;
      keyMoment = parsed.keyMoment ?? null;
      isOver = !!parsed.isOver;
      if (isOver && parsed.outcome) {
        const rawMonths = Number(parsed.outcome.compensationMonths) || 0;
        outcome = {
          compensationMonths: Math.min(rawMonths, scenario.maxCompensation),
          maxPossible: Number(parsed.outcome.maxPossible) || 0,
          summary: String(parsed.outcome.summary || '谈判结束'),
        };
      }
    } catch (parseErr) {
      if ((parseErr as Error).message !== 'skip-scoring') {
        routeLog.error(
          { route: 'chat', err: parseErr },
          'failed to parse scoring JSON',
        );
      }
      // Continue with defaults -- the HR response is still valid
    }

    // Force game over after MAX_ROUNDS user exchanges
    if (forceOver) {
      isOver = true;
      if (!outcome) {
        const avgScore =
          (scores.legalKnowledge +
            scores.negotiationSkill +
            scores.emotionalControl +
            scores.evidenceAwareness) /
          4;
        const compensationMonths = Math.round((avgScore / 100) * scenario.maxCompensation);
        outcome = {
          compensationMonths,
          maxPossible: scenario.maxCompensation,
          summary: `谈判已达${MAX_ROUNDS}轮上限,根据你的表现,最终获得${compensationMonths}个月工资补偿。`,
        };
      }
    }

    // Round number = how many user exchanges have been processed (including current).
    // For init, round=0. After first user reply processed, round=1. etc.
    // v1.3.2 — surface archetype context to the client so it can render
    // the "🧠 HR 看了你的档案" notice on the first turn.
    const response = {
      hrMessage: hrResponse.trim(),
      scores,
      lawyerTip,
      keyMoment,
      isOver,
      outcome,
      round: userTurnCount,
      maxRounds: MAX_ROUNDS,
      archetypeContext: archetypeCtx ? {
        id:    archetypeCtx.id,
        name:  archetypeCtx.name,
        emoji: archetypeCtx.emoji,
        aggressiveness: archetypeCtx.aggressiveness,
      } : null,
    };

    return c.json(response);
  } catch (err) {
    routeLog.error({ route: 'chat', err }, 'unexpected error');
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /tts  (mounted at /api/fired/tts)
// ---------------------------------------------------------------------------
firedRouter.post('/tts', async (c) => {
  try {
    const v = await validateBody(c, TTSRequestSchema);
    if (!v.ok) return v.response;
    const { text, personalityId } = v.data;

    const apiKey = process.env.QINGYUN_API_KEY || '';
    const baseUrl = process.env.QINGYUN_BASE_URL || 'https://api.qingyuntop.top/v1';

    if (!apiKey) {
      return c.json({ error: 'TTS service not configured' }, 500);
    }

    const voice = HR_VOICE_NAMES[personalityId] || 'onyx';
    const instructions = HR_VOICE_INSTRUCTIONS[personalityId];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        input: text,
        voice,
        speed: 1.0,
        response_format: 'mp3',
        instructions,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      routeLog.error(
        { route: 'tts', status: response.status, body: errText.slice(0, 200) },
        'TTS API error',
      );
      return c.json({ error: 'TTS generation failed' }, 500);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 100) {
      return c.json({ error: 'TTS generation returned empty audio' }, 500);
    }

    // Return as base64 data URL
    const base64 = buffer.toString('base64');
    const dataUrl = `data:audio/mpeg;base64,${base64}`;

    return c.json({ audio: dataUrl });
  } catch (err) {
    routeLog.error({ route: 'tts', err }, 'unexpected error');
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /suggest  (mounted at /api/fired/suggest)
// ---------------------------------------------------------------------------
firedRouter.post('/suggest', async (c) => {
  try {
    const v = await validateBody(c, SuggestRequestSchema);
    if (!v.ok) return v.response;
    const { scenarioId, messages } = v.data;

    const scenario = await getScenario(scenarioId);
    if (!scenario) {
      return c.json({ error: `Unknown scenario: ${scenarioId}` }, 400);
    }

    const conversation = formatConversation(messages);

    const suggestRes = await callLLMWithTimeout('SUGGESTIONS', {
      model: getOpenAI()(getModel()),
      system: `你是一位劳动法专家，正在帮助一位即将被裁员的员工准备回应。
场景: ${scenario.title}
法律背景: ${scenario.legalSituation}

请为员工生成3个不同风格的回复建议。严格按照以下JSON格式返回，不要包含任何其他内容:
[
  { "text": "<激进/强硬风格的回复>", "style": "aggressive" },
  { "text": "<冷静/理性风格的回复>", "style": "calm" },
  { "text": "<引用法律条文风格的回复>", "style": "legal" }
]

每个回复控制在1-2句话，要具体且实用。`,
      prompt: `对话记录:\n${conversation}\n\n请为员工生成3个回复建议。`,
      maxTokens: 400,
      temperature: 0.8,
    });

    // Hardcoded fallback — used on timeout / parse error / LLM failure
    const fallbackSuggestions = [
      { text: '我不同意这个方案，请给出合法的裁员依据。', style: 'aggressive' },
      { text: '我理解公司的情况，但我们能否协商一个更合理的补偿方案？', style: 'calm' },
      { text: '根据劳动合同法，公司需要提前30天通知或支付代通知金。', style: 'legal' },
    ];

    // Parse suggestions JSON
    let suggestions: Array<{ text: string; style: string }> = [];

    if (!suggestRes.ok) {
      routeLog.warn(
        { route: 'suggest', reason: suggestRes.reason },
        'suggestion LLM failed — using fallback',
      );
      suggestions = fallbackSuggestions;
    } else {
      try {
        const cleaned = suggestRes.text
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .trim();
        const parsed = JSON.parse(cleaned);

        if (Array.isArray(parsed)) {
          suggestions = parsed.slice(0, 3).map((s: { text?: string; style?: string }) => ({
            text: String(s.text || ''),
            style: ['aggressive', 'calm', 'legal'].includes(String(s.style))
              ? String(s.style)
              : 'calm',
          }));
        }
        if (suggestions.length < 3) {
          // LLM returned partial/invalid array — top up with fallbacks
          suggestions = fallbackSuggestions;
        }
      } catch (parseErr) {
        routeLog.error(
          { route: 'suggest', err: parseErr },
          'failed to parse suggestions JSON',
        );
        suggestions = fallbackSuggestions;
      }
    }

    return c.json({ suggestions });
  } catch (err) {
    routeLog.error({ route: 'suggest', err }, 'unexpected error');
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function clampScore(val: unknown): number {
  const n = Number(val);
  if (isNaN(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ---------------------------------------------------------------------------
// v0.8.0 — UGC scenario routes
// ---------------------------------------------------------------------------

/** GET /api/fired/scenarios — merged seed + user-generated catalogue.
 *  v0.8.1 supports `?sort=hot|new|default`, mirroring talkshow's /list.
 *  v0.9.2 adds `?sort=monthly` (last 30 days, ranked by likes×3 + plays).
 *  Each scenario carries `likes`, `plays`, and `createdAt` (synthetic-
 *  monotonic for seeds so they sink in 'new'). */
firedRouter.get('/scenarios', async (c) => {
  const sort = c.req.query('sort') ?? 'default';
  const userScenarios = await listUserScenarios();

  type Wire = FiredScenario & {
    source: 'seed' | 'user';
    likes: number;
    plays: number;
    createdAt: number;
    /** v0.8.1 — surfaced so the client can render "我的创作" filter
     *  without a second round-trip. */
    createdBy?: string;
  };
  const userWire: Wire[] = userScenarios.map((s) => ({
    ...s,
    source:    'user',
    likes:     s.likes ?? 0,
    plays:     s.plays ?? 0,
    createdAt: s.createdAt ?? 0,
    createdBy: s.createdBy,
  }));
  const seedWire: Wire[] = FIRED_SCENARIOS.map((s, i) => ({
    ...s,
    source:    'seed',
    likes:     seedScenarioLikes.get(s.id) ?? 0,
    plays:     seedScenarioPlays.get(s.id) ?? 0,
    createdAt: i,                                    // fixed, monotonic, < real ms
  }));

  let scenarios: Wire[];
  if (sort === 'hot') {
    scenarios = [...userWire, ...seedWire].sort(
      (a, b) => b.likes - a.likes || b.createdAt - a.createdAt,
    );
  } else if (sort === 'new') {
    scenarios = [...userWire, ...seedWire].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  } else if (sort === 'monthly') {
    // v0.9.2 — same monthly leaderboard rules as talkshow /list.
    // Score = likes × 3 + plays; user-content gated by 30-day window;
    // seeds always eligible (qualified by current-month plays/likes).
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const eligible = [
      ...userWire.filter((w) => w.createdAt >= cutoff),
      ...seedWire,
    ];
    scenarios = eligible.sort((a, b) => {
      const sa = a.likes * 3 + a.plays;
      const sb = b.likes * 3 + b.plays;
      return sb - sa || b.createdAt - a.createdAt;
    });
  } else {
    scenarios = [
      ...userWire.sort((a, b) => b.createdAt - a.createdAt),
      ...seedWire,
    ];
  }
  return c.json({ scenarios });
});

// ---------- v0.8.1 like / like-state ---------------------------------------

const LikeRequestSchema = z.object({
  scenarioId: z.string().min(1).max(64),
  liked: z.boolean().optional(),
});

firedRouter.post('/like', async (c) => {
  const v = await validateBody(c, LikeRequestSchema);
  if (!v.ok) return v.response;
  const { scenarioId } = v.data;
  const ip = ipFromHono(c);
  const dedupKey = `${ip}::${scenarioId}`;
  const liked = v.data.liked ?? !scenarioLikedByIp.has(dedupKey);

  const inSeeds = FIRED_SCENARIOS.some((s) => s.id === scenarioId);
  const isUser  = !inSeeds && (await findUserScenario(scenarioId)) !== null;
  if (!inSeeds && !isUser) {
    return c.json({ error: 'scenario not found' }, 404);
  }

  const wasLiked = scenarioLikedByIp.has(dedupKey);
  if (liked === wasLiked) {
    const likes = inSeeds
      ? (seedScenarioLikes.get(scenarioId) ?? 0)
      : ((await findUserScenario(scenarioId))?.likes ?? 0);
    return c.json({ scenarioId, liked, likes });
  }

  let likes: number | null;
  if (liked) {
    scenarioLikedByIp.add(dedupKey);
    if (inSeeds) {
      likes = (seedScenarioLikes.get(scenarioId) ?? 0) + 1;
      seedScenarioLikes.set(scenarioId, likes);
    } else {
      likes = await incrementScenarioLike(scenarioId);
    }
  } else {
    scenarioLikedByIp.delete(dedupKey);
    if (inSeeds) {
      likes = Math.max(0, (seedScenarioLikes.get(scenarioId) ?? 0) - 1);
      seedScenarioLikes.set(scenarioId, likes);
    } else {
      likes = await decrementScenarioLike(scenarioId);
    }
  }

  return c.json({ scenarioId, liked, likes: likes ?? 0 });
});

firedRouter.get('/like-state', (c) => {
  const idsParam = c.req.query('ids') ?? '';
  if (!idsParam) return c.json({ liked: [] });
  const ip = ipFromHono(c);
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const liked = ids.filter((id) => scenarioLikedByIp.has(`${ip}::${id}`));
  return c.json({ liked });
});

const GenerateScenarioSchema = z.object({
  description: z.string().min(8).max(300),
  difficulty:  z.union([z.literal(1), z.literal(2), z.literal(3)]),
  // Single-grapheme emoji from the user's picker.
  emoji:       z.string().min(1).max(4),
});

/** POST /api/fired/generate-scenario — LLM-write a complete FiredScenario
 *  from a one-line description + difficulty + emoji. Persists via
 *  scenarioStore + returns the full record so the client can immediately
 *  navigate into the chat with the new scenarioId. */
firedRouter.post('/generate-scenario', async (c) => {
  const ip = ipFromHono(c);
  const limit = scenarioGenLimiter.check(ip);
  if (!limit.ok) {
    return c.json(
      {
        error: 'rate limited',
        message: `每小时最多 5 关,${Math.ceil(limit.retryAfterSec / 60)} 分钟后再试`,
        retryAfterSec: limit.retryAfterSec,
      },
      429,
      { 'Retry-After': String(limit.retryAfterSec) },
    );
  }

  const v = await validateBody(c, GenerateScenarioSchema);
  if (!v.ok) return v.response;
  const { description, difficulty, emoji } = v.data;

  // Cheap pre-LLM safety pass — same patterns the talkshow generator uses.
  // The LLM prompt also enforces these, but a hard reject here saves cost
  // and gives the user a clearer error.
  const block = checkScenarioSafety(description);
  if (block) {
    return c.json({ error: 'topic rejected', message: block }, 400);
  }

  const scenario = await generateFiredScenario({ description, difficulty, emoji });
  if (!scenario) {
    return c.json({ error: 'LLM unavailable, try again' }, 502);
  }
  // v0.8.1 — capture the pseudonymous creator id (uuid stashed in
  // localStorage on first visit) so the client can later filter to "我
  // 创建的". Cap length to dodge header abuse. Missing header is fine
  // (legacy clients) — the row just won't show up under "我的创作".
  const createdBy = (c.req.header('x-user-id') ?? '').slice(0, 64) || undefined;
  await addUserScenario(scenario, { createdBy });
  routeLog.info('User scenario generated', {
    id: scenario.id, difficulty, len: scenario.description.length,
    createdBy: createdBy ? createdBy.slice(0, 8) + '…' : 'anon',
  });
  return c.json({ ...scenario, source: 'user', likes: 0, createdBy });
});

const SCENARIO_BLOCKED: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /习近平|普京|拜登|特朗普|金正恩|蔡英文/, reason: '不接受真实政治人物姓名' },
  { pattern: /(?:儿童色情|强奸|诈骗教学|毒品交易|杀人|自杀方法)/, reason: '不接受违法或自伤内容' },
];
function checkScenarioSafety(text: string): string | null {
  for (const { pattern, reason } of SCENARIO_BLOCKED) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

// ---------------------------------------------------------------------------
// v0.8.2 — Memory layer
// ---------------------------------------------------------------------------

const MemoryRecordSchema = z.object({
  scenarioId: z.string().min(1).max(64),
  outcome: z.enum(['win', 'partial', 'lose']),
  /** Final compensation actually achieved (0 to scenario.maxCompensation). */
  compensationMonths: z.number().min(0).max(120),
  /** Used to compute finalRatio for the badge. */
  maxPossible: z.number().min(0).max(120),
  /** Round count = number of user messages. Helps the "你 7 轮就赢了"
   *  surface on the FiredLanding badge. */
  tookRounds: z.number().int().min(1).max(40),
  /** Full chat history — the summarizer reads this to extract tactic.
   *  Capped at 40 to match the existing chat schema. */
  messages: z.array(ChatMessageSchema).min(1).max(40),
});

/** POST /api/fired/memory/record — called from FiredResult after a round
 *  ends. Server LLM-summarizes the player's tactic in ~30 chars and
 *  appends a PlayMemory record. Falls back to a generic outcome string
 *  if the LLM is unavailable so we always record SOMETHING (the badge
 *  count is more useful than a perfect tactic string).
 *
 *  No rate limit: this is a write tied to a finished gameplay session
 *  (heavily gated by the 10-round chat flow above), can't be spammed
 *  cheaply. */
firedRouter.post('/memory/record', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) {
    // Anonymous users don't get persistent memory. Surface a clear error
    // instead of a silent no-op so debugging is easy.
    return c.json({ error: 'X-User-Id header required for memory recording' }, 400);
  }
  const v = await validateBody(c, MemoryRecordSchema);
  if (!v.ok) return v.response;
  const { scenarioId, outcome, compensationMonths, maxPossible, tookRounds, messages } = v.data;

  const scenario = await getScenario(scenarioId);
  if (!scenario) return c.json({ error: 'scenario not found' }, 404);

  const tactic = await summarizeTactic({
    scenarioTitle: scenario.title,
    outcome,
    messages,
  });

  const finalRatio = maxPossible > 0
    ? Math.max(0, Math.min(1, compensationMonths / maxPossible))
    : 0;

  await recordMemory(userId, scenarioId, {
    ts: Date.now(),
    outcome,
    tactic,
    tookRounds,
    finalRatio,
  });

  routeLog.info('Memory recorded', {
    user: userId.slice(0, 8) + '…', scenarioId, outcome, tookRounds, tactic,
  });

  return c.json({ ok: true, tactic });
});

/** GET /api/fired/memory/me — bulk return per-scenario stats for the
 *  current user, for FiredLanding to render "你打过 N 次" badges. Empty
 *  object when no X-User-Id (anonymous). */
firedRouter.get('/memory/me', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ stats: {} });
  const stats = await listScenarioStats(userId);
  return c.json({ stats });
});

// ---------------------------------------------------------------------------
// v0.9.0 — UGC packs
// ---------------------------------------------------------------------------

const PackSlotSchema = z.object({
  scenarioId:    z.string().min(1).max(64),
  personalityId: z.enum(['rookie', 'veteran', 'demon']),
});
const PackCreateSchema = z.object({
  title:       z.string().min(2).max(32),
  description: z.string().min(4).max(140),
  emoji:       z.string().min(1).max(4),
  // v1 is fixed-length 5; enforced strictly so the play view's slot
  // grid can be statically laid out.
  slots:       z.array(PackSlotSchema).length(5),
});

/** GET /api/fired/packs — merged pack catalogue with sort.
 *  ?sort=hot|new|monthly|default. v0.9.2 adds monthly: last-30-day
 *  filter + score = likes×3 + plays. Each pack returns with `slotCount`
 *  (always 5 for v1) for symmetry with future variable-length packs. */
firedRouter.get('/packs', async (c) => {
  const sort = c.req.query('sort') ?? 'default';
  const packs = await listPacks();

  type Wire = FiredPack & { slotCount: number };
  let sorted: FiredPack[];
  if (sort === 'hot') {
    sorted = [...packs].sort(
      (a, b) => (b.likes ?? 0) - (a.likes ?? 0)
              || (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );
  } else if (sort === 'new') {
    sorted = [...packs].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } else if (sort === 'monthly') {
    // v0.9.2 — last-30-day window + community engagement score (likes×3 + plays).
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    sorted = packs
      .filter((p) => (p.createdAt ?? 0) >= cutoff)
      .sort((a, b) => {
        const sa = (a.likes ?? 0) * 3 + (a.plays ?? 0);
        const sb = (b.likes ?? 0) * 3 + (b.plays ?? 0);
        return sb - sa || (b.createdAt ?? 0) - (a.createdAt ?? 0);
      });
  } else {
    sorted = [...packs].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  const wire: Wire[] = sorted.map((p) => ({
    ...p,
    likes:     p.likes ?? 0,
    plays:     p.plays ?? 0,
    slotCount: p.slots?.length ?? 0,
  }));
  return c.json({ packs: wire });
});

/** POST /api/fired/packs — create a new pack. Validates that every
 *  scenarioId in slots actually exists (in seeds OR user-generated)
 *  before persisting, so the play view doesn't crash on a typo. */
firedRouter.post('/packs', async (c) => {
  const ip = ipFromHono(c);
  const limit = packCreateLimiter.check(ip);
  if (!limit.ok) {
    return c.json({
      error: 'rate limited',
      message: `每小时最多 5 个闯关包,${Math.ceil(limit.retryAfterSec / 60)} 分钟后再试`,
      retryAfterSec: limit.retryAfterSec,
    }, 429, { 'Retry-After': String(limit.retryAfterSec) });
  }

  const v = await validateBody(c, PackCreateSchema);
  if (!v.ok) return v.response;
  const { title, description, emoji, slots } = v.data;

  // Validate every scenarioId exists. One round-trip per slot to getScenario;
  // bail early on first miss. With 5 slots this is fast even when half hit
  // the file-backed user store.
  for (const slot of slots) {
    const found = await getScenario(slot.scenarioId);
    if (!found) {
      return c.json({
        error: 'scenario not found',
        message: `闯关包里有一关找不到了:${slot.scenarioId}`,
      }, 400);
    }
  }

  const createdBy = (c.req.header('x-user-id') ?? '').slice(0, 64) || undefined;
  const pack: FiredPack = {
    id: mintPackId(),
    title:       title.trim(),
    description: description.trim(),
    emoji,
    slots,
    createdBy,
    createdAt: Date.now(),
    likes: 0,
  };
  await addPack(pack);
  routeLog.info('Pack created', {
    id: pack.id,
    slots: slots.length,
    createdBy: createdBy ? createdBy.slice(0, 8) + '…' : 'anon',
  });
  return c.json(pack);
});

/** POST /api/fired/packs/like — toggle a pack's heart for THIS IP.
 *  Same dedup pattern as /like and /talkshow/like. */
const PackLikeSchema = z.object({
  packId: z.string().min(1).max(64),
  liked:  z.boolean().optional(),
});
firedRouter.post('/packs/like', async (c) => {
  const v = await validateBody(c, PackLikeSchema);
  if (!v.ok) return v.response;
  const { packId } = v.data;
  const ip = ipFromHono(c);
  const dedupKey = `${ip}::${packId}`;
  const liked = v.data.liked ?? !packLikedByIp.has(dedupKey);

  const pack = await findPack(packId);
  if (!pack) return c.json({ error: 'pack not found' }, 404);

  const wasLiked = packLikedByIp.has(dedupKey);
  if (liked === wasLiked) {
    return c.json({ packId, liked, likes: pack.likes ?? 0 });
  }

  let likes: number | null;
  if (liked) {
    packLikedByIp.add(dedupKey);
    likes = await incrementPackLike(packId);
  } else {
    packLikedByIp.delete(dedupKey);
    likes = await decrementPackLike(packId);
  }
  return c.json({ packId, liked, likes: likes ?? 0 });
});

/** GET /api/fired/packs/like-state?ids=… — bulk per-IP liked check
 *  (mirrors /like-state for scenarios). Hearts paint correctly on
 *  first frame without N round-trips.
 *
 *  IMPORTANT: this route MUST be registered BEFORE the catch-all
 *  /packs/:id below or Hono will match `like-state` as the dynamic
 *  segment and 404 every request (regression discovered in v0.9.0
 *  e2e probe — "pack not found" instead of like list). */
firedRouter.get('/packs/like-state', (c) => {
  const idsParam = c.req.query('ids') ?? '';
  if (!idsParam) return c.json({ liked: [] });
  const ip = ipFromHono(c);
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const liked = ids.filter((id) => packLikedByIp.has(`${ip}::${id}`));
  return c.json({ liked });
});

/** GET /api/fired/packs/:id — full pack record. Registered LAST among
 *  the /packs/* routes so the literal paths (/like, /like-state) win
 *  the dispatcher race. Hono matches in registration order.
 *  v0.9.2 — bumps play count on each load (fire-and-forget). */
firedRouter.get('/packs/:id', async (c) => {
  const id = c.req.param('id');
  const pack = await findPack(id);
  if (!pack) return c.json({ error: 'pack not found' }, 404);
  void incrementPackPlay(id);
  return c.json(pack);
});
