/**
 * reflectionLoop — v5.9.0 Phase B reflection layer.
 *
 * Every N rounds (or after K accumulated events), an agent's recent
 * episodic memories are condensed by an LLM into 3-5 high-level
 * "beliefs" — durable judgments about the game/people that drive
 * decisions more directly than raw events.
 *
 * Inspired by Smallville's reflection mechanism (Park et al. 2023):
 *   events  ── observe ──>  episodic memory stream
 *   episodic ── reflect ──>  high-level beliefs ── inject ──> next-turn prompt
 *
 * Beliefs are written as kind='belief' with importance = 0.7 (higher
 * than the default 0.5 for events). recallMemories then weights belief
 * importance by 1.5× in the composite score, so beliefs naturally
 * surface above their constituent events.
 *
 * Trigger policy (per RFC §4.2):
 *   - every 5 rounds, OR
 *   - when >10 unreflected events have accumulated for this agent
 *     (whichever comes first)
 *
 * Caching (RFC §5.7):
 *   - content-hash the input event-set; if we've reflected on this
 *     exact set before, reuse the prior belief output. Hit rate is
 *     high because reflection is per-agent and most agents see the
 *     same "round happened" events from their archetype peers.
 *
 * Failure semantics: best-effort. If the LLM call fails / times out,
 * we don't write any beliefs — the next trigger will retry with the
 * larger event set. Reflection is a quality booster, not a correctness
 * dependency.
 */

import { createHash } from 'node:crypto';
import { getPool, ensureSchema } from './pgvectorClient';
import { writeMemory } from './memoryWrite';
import { embedOne } from './memoryEmbedder';
import { callLLMWithTimeout } from '../utils/llm';
import { createOpenAI } from '@ai-sdk/openai';
import pgvector from 'pgvector/pg';
import { logger } from '../utils/logger';

const refLog = logger.child({ component: 'reflection' });

// Lazy provider construction — ESM module imports are hoisted ABOVE
// dotenv.config() in script entrypoints, so reading process.env at
// module-init time gives empty strings + the bogus 'gpt-5.4-mini'
// default. We saw this fail loudly with "Invalid token" from Qingyun
// during v5.9.0 probe (2026-05-22). Build on first call instead.
let _openai: ReturnType<typeof createOpenAI> | null = null;
function openai() {
  if (!_openai) {
    _openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? '',
      baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.qingyuntop.top/v1',
    });
  }
  return _openai;
}
function model() {
  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
}

/** Trigger thresholds — see RFC §4.2. */
const ROUND_TRIGGER = 5;
const EVENT_TRIGGER = 10;

/** Belief importance baseline. recallMemories then weights belief
 *  importance by × 1.5 in the composite score. 0.7 × 1.5 = 1.05
 *  (clamped to 1) means a belief always wins the importance subscore
 *  vs any event (default 0.5 × 1 = 0.5). */
const BELIEF_BASE_IMPORTANCE = 0.7;

/** Cache: hash of (archetype, sorted event-id-set) → array of belief strings.
 *  In-process memory; loss across restarts is fine — next trigger reflects
 *  the same set again, costs one LLM call. */
const reflectionCache = new Map<string, string[]>();
const CACHE_MAX = 256;

function cacheKey(archetype: string, targetUserId: string | null, eventIds: number[]): string {
  return createHash('sha256')
    .update(`${archetype}\0${targetUserId ?? ''}\0${[...eventIds].sort((a, b) => a - b).join(',')}`)
    .digest('hex');
}

function cacheSet(key: string, beliefs: string[]): void {
  reflectionCache.set(key, beliefs);
  while (reflectionCache.size > CACHE_MAX) {
    const oldest = reflectionCache.keys().next().value;
    if (oldest !== undefined) reflectionCache.delete(oldest);
  }
}

interface ReflectionInput {
  agentArchetype: string;
  targetUserId?: string | null;
  /** Game id this reflection is being triggered IN (for provenance —
   *  beliefs are tagged with this so future filters can scope by game). */
  sourceGameId: string;
  /** Current round number — beliefs get this as their sourceRound. */
  currentRound: number;
}

/** Pull recent unreflected events. "Unreflected" = no belief exists yet
 *  whose source event-set includes them. v5.9.0 uses a simple heuristic:
 *  events newer than the most recent belief for this (archetype, target). */
async function pullUnreflectedEvents(input: ReflectionInput): Promise<Array<{ id: number; content: string; round: number | null }>> {
  const pool = getPool();
  // Most recent belief timestamp for this scope (the high-water mark).
  const filters = ['agent_archetype = $1', `kind = 'belief'`];
  const params: unknown[] = [input.agentArchetype];
  if (input.targetUserId) {
    filters.push(`target_user_id = $${params.length + 1}`);
    params.push(input.targetUserId);
  } else {
    filters.push(`target_user_id IS NULL`);
  }
  const { rows: hwRows } = await pool.query<{ ts: Date | null }>(
    `SELECT MAX(ts) AS ts FROM memory_entries WHERE ${filters.join(' AND ')}`,
    params,
  );
  const since = hwRows[0]?.ts ?? new Date(0);

  // Pull events newer than the watermark.
  const evFilters = ['agent_archetype = $1', `kind = 'event'`, 'ts > $2'];
  const evParams: unknown[] = [input.agentArchetype, since];
  if (input.targetUserId) {
    evFilters.push(`target_user_id = $${evParams.length + 1}`);
    evParams.push(input.targetUserId);
  } else {
    evFilters.push(`target_user_id IS NULL`);
  }
  const { rows } = await pool.query<{ id: number; content: string; source_round: number | null }>(
    `SELECT id, content, source_round
       FROM memory_entries
      WHERE ${evFilters.join(' AND ')}
      ORDER BY ts ASC`,
    evParams,
  );
  return rows.map((r) => ({ id: r.id, content: r.content, round: r.source_round }));
}

/** LLM call — condense N events into 3-5 belief lines. */
async function llmReflect(events: Array<{ content: string }>, archetypeHint: string): Promise<string[] | null> {
  const eventBlock = events.map((e, i) => `${i + 1}. ${e.content}`).join('\n');
  const system = `你是一个职场社交推理 AI 的反思层。从一系列零散事件中, 提炼出 3-5 条对人际关系 / 局势的高层判断 ("belief"). 输出格式: 每行一条, 用 "- " 开头, 不要编号, 不要解释, 不要 markdown 标题. 每条 30 字以内, 像 "我相信 X 是 Y" 或 "Z 跨局都在针对我" 这种简短判断.`;
  const prompt = `角色人格类型: ${archetypeHint}\n\n以下是你最近目睹 / 参与的事件:\n${eventBlock}\n\n请输出 3-5 条 high-level belief, 严格按上述格式.`;

  const res = await callLLMWithTimeout('SPEECH', {
    model: openai()(model()),
    system,
    prompt,
    maxTokens: 300,
    temperature: 0.5,
  });
  if (!res.ok) {
    refLog.warn({ reason: res.reason, errorMessage: 'errorMessage' in res ? res.errorMessage : undefined }, 'reflection LLM failed');
    return null;
  }
  // Parse beliefs — accept "- ", "1. ", or naked lines that look like beliefs.
  // First try "- " bullets (preferred); fall back to numbered list; fall back
  // to splitting on newlines and trimming. Different LLM personalities have
  // different formatting habits — robust parser absorbs that variance.
  const raw = res.text.trim();
  let lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
  if (lines.length === 0) {
    // Numbered list fallback ("1. ...", "2. ...")
    lines = raw
      .split('\n')
      .map((l) => l.trim().replace(/^\d+[.、]\s*/, ''))
      .filter((l) => l.length > 0);
  }
  // Length filter — beliefs should be 30-ish chars, definitely < 100.
  lines = lines.filter((l) => l.length > 0 && l.length <= 100);
  if (lines.length === 0) {
    refLog.warn({ raw: raw.slice(0, 180) }, 'reflection produced no parseable beliefs');
    return null;
  }
  return lines.slice(0, 5);
}

/** Public entrypoint. Idempotent — call after every round-end; this fn
 *  decides whether the trigger threshold is met. */
export async function maybeReflect(input: ReflectionInput): Promise<{
  triggered: boolean;
  reason?: string;
  beliefsWritten?: number;
  cacheHit?: boolean;
}> {
  await ensureSchema();
  const events = await pullUnreflectedEvents(input);
  const roundTrigger = input.currentRound > 0 && input.currentRound % ROUND_TRIGGER === 0;
  const eventTrigger = events.length >= EVENT_TRIGGER;

  if (!roundTrigger && !eventTrigger) {
    return { triggered: false, reason: `wait: round=${input.currentRound}, events=${events.length}` };
  }
  if (events.length === 0) {
    return { triggered: false, reason: 'no unreflected events' };
  }

  // Cache lookup
  const key = cacheKey(input.agentArchetype, input.targetUserId ?? null, events.map((e) => e.id));
  let beliefs = reflectionCache.get(key);
  let cacheHit = false;
  if (beliefs) {
    cacheHit = true;
    refLog.debug({ archetype: input.agentArchetype, key: key.slice(0, 8) }, 'reflection cache hit');
  } else {
    const llmOut = await llmReflect(events, input.agentArchetype);
    if (!llmOut) return { triggered: true, reason: 'llm failed' };
    beliefs = llmOut;
    cacheSet(key, beliefs);
  }

  // Write each belief as a separate memory_entries row so recall can
  // surface them individually by relevance.
  let written = 0;
  for (const text of beliefs) {
    const id = await writeMemory({
      agentArchetype: input.agentArchetype,
      targetUserId: input.targetUserId ?? null,
      sourceGameId: input.sourceGameId,
      sourceRound: input.currentRound,
      kind: 'belief',
      content: text,
      importance: BELIEF_BASE_IMPORTANCE,
    });
    if (id !== null) written++;
  }

  refLog.info({
    archetype: input.agentArchetype,
    targetUserId: input.targetUserId ?? null,
    eventCount: events.length,
    beliefsWritten: written,
    cacheHit,
  }, 'reflection complete');

  return { triggered: true, beliefsWritten: written, cacheHit };
}

/** Test helper — reset the in-process cache so probe scripts start clean. */
export function clearReflectionCache(): void {
  reflectionCache.clear();
}

// embed is imported but not directly called here — writeMemory handles it.
// Re-exporting embedOne is intentional in case future reflection variants
// want to embed beliefs differently (e.g. with a "this is a high-level
// judgment" prefix to skew the vector space).
export { embedOne, pgvector };
