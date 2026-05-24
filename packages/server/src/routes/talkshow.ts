/**
 * /api/talkshow — v0.7.0 班味单口 (Workplace Standup) routes.
 *
 * Endpoints:
 *   GET  /list           seed catalogue + user-generated bits (id + meta only)
 *   GET  /script/:id     full script body for one bit (seed OR user)
 *   POST /tts            generate Minimax TTS for a script — returns mp3 bytes
 *   POST /generate       v0.7.4 — LLM-write a new bit from {topic, persona,
 *                        tag}, persist to scriptStore, return the script
 *
 * Why a dedicated route module rather than reusing /api/tts:
 *   - Voice persona → Minimax voice_id mapping is talkshow-specific
 *     (we want curated personalities, not the generic role-voice table)
 *   - Future v0.7.5 will host server-rendered videos here too, so this is
 *     the natural namespace for everything talkshow-shaped
 */
import { Hono } from 'hono';
import { z } from 'zod';
import {
  SEED_SCRIPTS,
  type TalkshowPersona,
  type TalkshowScript,
} from '@furball/shared';
import { generateTTSAudio } from '../services/tts';
import { generateTalkshowScript } from '../services/talkshowGenerator';
import {
  listUserScripts,
  findUserScript,
  addUserScript,
  incrementLike,
  decrementLike,
  incrementScriptPlay,
} from '../services/scriptStore';
import { validateBody } from '../utils/validate';
import { createRateLimiter } from '../utils/rateLimit';
import { recordEvolutionEvent, talkshowCreateDelta } from '../services/archetypeEvolution';
import {
  submitTalkshow,
  getMonthlyHighlights,
  listUserSubmissions,
  likeSubmission,
  listPending,
  reviewSubmission,
} from '../services/talkshowUgcStore';

// v0.7.6 — generate is the most expensive route (LLM body + LLM title +
// disk write). Cap it at 5 requests per IP per hour so a single user
// can't burn a month of QingYun quota in 30 seconds. Liking + listening
// is unlimited (cheap, server-cached).
const generateLimiter = createRateLimiter({ windowMs: 3600_000, max: 5 });

export const talkshowRoutes = new Hono();

// ── v0.7.5 per-IP like dedup ────────────────────────────────────────────
// In-memory Set keyed by `${ip}::${scriptId}`. Cleared on process restart;
// not perfect (double-vote across restarts is possible) but good enough for
// the scale we're at, and crucially it's free + zero-deps. Migrate to redis
// at v0.8.x if we ever care about cross-instance dedup.
const likedByIp = new Set<string>();
function ipFrom(c: { req: { header: (k: string) => string | undefined } }): string {
  // Vite dev / production proxy both set x-forwarded-for. Localhost test
  // requests fall through to the connection-remote-addr fallback.
  const fwd = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip');
  if (fwd) return fwd.split(',')[0].trim();
  return c.req.header('host') ?? 'unknown';
}

// Seed-script like counters live in memory only — they reset on restart.
// Acceptable trade-off: seeds are curated content, the long-tail engagement
// number we care about is on user bits. If we ever want persistent seed
// likes, promote SEED_SCRIPTS into scriptStore on first boot.
const seedLikes = new Map<string, number>();
/** v0.9.2 — same in-mem-only treatment for seed play counts. */
const seedPlays = new Map<string, number>();

// Persona → role hint string. The /api/tts pipeline reads role to look up
// a Minimax voice_id; we map our talkshow personas onto the equivalent
// role IDs that already drive the right voice in `tts.ts`.
const PERSONA_TO_ROLE_HINT: Record<TalkshowPersona, string> = {
  shaonv:   'medic_cat',     // → female-shaonv
  yujie:    'silencer_dog',  // → female-yujie
  qingse:   'engineer_cat',  // → male-qn-qingse-jingpin
  jingying: 'detective_cat', // → male-qn-jingying
  badao:    'killer_dog',    // → male-qn-badao
  qingnian: 'villager_cat',  // → male-qn-qingse (neutral young voice)
};

// ---------- /list ----------------------------------------------------------

/** v0.9.2 — last-30-day window for the "monthly" leaderboard. Calendar
 *  month boundaries would create empty-state spikes on day 1; rolling
 *  30 days dodges that. Shared across all 3 list endpoints. */
const MONTHLY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

talkshowRoutes.get('/list', async (c) => {
  // v0.7.4 — merge user-generated bits with seeds.
  // v0.7.5 — supports ?sort=hot|new|default
  // v0.9.2 — adds ?sort=monthly (last 30 days, ranked by likes×3 + plays)
  // Both pools strip `text` (full body fetched via /script/:id on tap).
  const sort = c.req.query('sort') ?? 'default';
  const userScripts = await listUserScripts();

  // Project both pools to the same wire shape with `source` + `likes` + `plays`.
  type Wire = Omit<TalkshowScript, 'text'> & {
    source: 'user' | 'seed';
    likes: number;
    plays: number;
    /** Unix ms — used by the hot/new sorts, not displayed in the UI. */
    createdAt: number;
    /** v0.8.1 — surfaced so the client can render "我的创作" filter
     *  without an extra round-trip. Only present on user bits. */
    createdBy?: string;
  };
  const userWire: Wire[] = userScripts.map(({ text: _t, ...rest }) => ({
    ...rest,
    source:    'user',
    likes:     rest.likes ?? 0,
    plays:     rest.plays ?? 0,
    createdAt: rest.createdAt ?? 0,
    createdBy: rest.createdBy,
  }));
  // Seeds get in-memory likes + plays + a fixed-low createdAt so they
  // always sort below user bits in 'new'. They can be liked + played, so
  // a popular seed CAN make the monthly leaderboard.
  const seedWire: Wire[] = SEED_SCRIPTS.map(({ text: _t, ...rest }, i) => ({
    ...rest,
    source:    'seed',
    likes:     seedLikes.get(rest.id) ?? 0,
    plays:     seedPlays.get(rest.id) ?? 0,
    createdAt: i,                                   // fixed, monotonic, < real ms
  }));

  let summary: Wire[];
  if (sort === 'hot') {
    summary = [...userWire, ...seedWire].sort(
      (a, b) => b.likes - a.likes || b.createdAt - a.createdAt,
    );
  } else if (sort === 'new') {
    summary = [...userWire, ...seedWire].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  } else if (sort === 'monthly') {
    // v0.9.2 — last 30 days filter + ranking by community engagement.
    // Score = likes × 3 + plays. Likes are scarcer (active vote of approval),
    // plays are abundant (passive consumption); 3:1 ratio biases the
    // leaderboard toward genuinely loved content rather than just "got
    // shared once and listened to 10 times".
    // Seed bits skip the window filter (their synthetic createdAt is < 100,
    // so otherwise they'd never appear) — they qualify by their in-memory
    // plays/likes which DID happen this month.
    const now = Date.now();
    const cutoff = now - MONTHLY_WINDOW_MS;
    const eligible = [
      ...userWire.filter((w) => w.createdAt >= cutoff),
      ...seedWire,            // seeds always eligible; their plays gate inclusion
    ];
    summary = eligible.sort((a, b) => {
      const sa = a.likes * 3 + a.plays;
      const sb = b.likes * 3 + b.plays;
      return sb - sa || b.createdAt - a.createdAt;
    });
  } else {
    // default: user bits first by recency, then seeds in their curated order
    summary = [
      ...userWire.sort((a, b) => b.createdAt - a.createdAt),
      ...seedWire,
    ];
  }
  return c.json({ scripts: summary });
});

// ---------- /script/:id ----------------------------------------------------

talkshowRoutes.get('/script/:id', async (c) => {
  const id = c.req.param('id');
  // Look in both pools — user-generated bits use the `bit-u-...` namespace,
  // seeds use `bit-NNN`, but we don't depend on that prefix in case we ever
  // reshuffle ids. v0.7.5: also surface `likes` (from in-mem map for seeds,
  // from store for user bits) so the player view can show + heart from the
  // first paint.
  const seed = SEED_SCRIPTS.find((s) => s.id === id);
  if (seed) return c.json({ ...seed, source: 'seed', likes: seedLikes.get(id) ?? 0 });
  const user = await findUserScript(id);
  if (user) return c.json({ ...user, source: 'user' });
  return c.json({ error: 'script not found' }, 404);
});

// ---------- /tts -----------------------------------------------------------

const TtsRequestSchema = z.object({
  scriptId: z.string().min(1).max(64).optional(),
  // Inline text path — used by v0.7.1 character editor to preview a script
  // before it lands in SEED_SCRIPTS.
  text: z.string().min(1).max(2000).optional(),
  persona: z.enum([
    'shaonv', 'yujie', 'qingse', 'jingying', 'badao', 'qingnian',
  ] as const).optional(),
});

talkshowRoutes.post('/tts', async (c) => {
  const v = await validateBody(c, TtsRequestSchema);
  if (!v.ok) return v.response;
  const { scriptId, text, persona } = v.data;

  let body: string | undefined = text;
  let voiceHint: string | undefined;
  let isUserGenerated = false;

  if (scriptId) {
    const seed = SEED_SCRIPTS.find((s) => s.id === scriptId);
    const script = seed ?? await findUserScript(scriptId);
    if (!script) return c.json({ error: 'script not found' }, 404);
    body = script.text;
    voiceHint = PERSONA_TO_ROLE_HINT[script.persona];
    isUserGenerated = !seed;
  }
  if (persona) {
    voiceHint = PERSONA_TO_ROLE_HINT[persona];
  }

  if (!body) {
    return c.json({ error: 'either scriptId or text is required' }, 400);
  }

  const audio = await generateTTSAudio(body, voiceHint);
  if (!audio) {
    return c.json({ error: 'TTS generation failed' }, 502);
  }

  // v0.9.2 — bump play count when TTS succeeds for a known scriptId.
  // Fire-and-forget so a slow disk write never blocks the audio response.
  // Inline-text TTS calls (no scriptId, used by editor preview) skip this.
  if (scriptId) {
    if (isUserGenerated) {
      void incrementScriptPlay(scriptId);
    } else {
      seedPlays.set(scriptId, (seedPlays.get(scriptId) ?? 0) + 1);
    }
  }

  return new Response(new Uint8Array(audio), {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audio.length.toString(),
      // Seed audio is deterministic per script — long cache OK.
      // User-generated audio: scriptId is also deterministic per text but
      // someone might re-generate the same id (unlikely with random ids).
      // Use a 1h cache for user bits — still cuts repeat-listen latency,
      // doesn't lock in content if we ever add re-generation.
      'Cache-Control': scriptId
        ? (isUserGenerated ? 'public, max-age=3600' : 'public, max-age=86400')
        : 'no-store',
    },
  });
});

// ---------- /generate (v0.7.4) ---------------------------------------------

const GenerateRequestSchema = z.object({
  topic:   z.string().min(4).max(200),
  persona: z.enum([
    'shaonv', 'yujie', 'qingse', 'jingying', 'badao', 'qingnian',
  ] as const),
  tag:     z.enum([
    'overtime', 'kpi', 'pua', 'age', 'slacking',
    'jargon', 'hr', 'boss', 'meta',
  ] as const),
});

talkshowRoutes.post('/generate', async (c) => {
  // v0.7.6 — rate limit FIRST, before any LLM work. Idempotent: doesn't
  // count rejected requests against the bucket.
  const ip = ipFrom(c);
  const limit = generateLimiter.check(ip);
  if (!limit.ok) {
    return c.json(
      {
        error: 'rate limited',
        message: `每小时最多 5 段,${Math.ceil(limit.retryAfterSec / 60)} 分钟后再试`,
        retryAfterSec: limit.retryAfterSec,
      },
      429,
      // Honor the standard Retry-After header so well-behaved clients
      // back off automatically.
      { 'Retry-After': String(limit.retryAfterSec) },
    );
  }

  const v = await validateBody(c, GenerateRequestSchema);
  if (!v.ok) return v.response;
  const { topic, persona, tag } = v.data;

  // v0.7.6 — pre-LLM topic safety check. Reject obvious abuse (real-name
  // mentions, slurs, illegal content) before burning the LLM call. The
  // generator's prompt also tells the model to refuse, but a hard reject
  // here saves cost AND gives a clearer error.
  const safety = checkTopicSafety(topic);
  if (!safety.ok) {
    return c.json({ error: 'topic rejected', message: safety.reason }, 400);
  }

  const script = await generateTalkshowScript({ topic, persona, tag });
  if (!script) {
    return c.json({ error: 'LLM unavailable, try again' }, 502);
  }
  // v0.8.1 — capture pseudonymous creator id so the client can filter
  // to "我的创作" later. Optional header; missing is fine.
  const createdBy = (c.req.header('x-user-id') ?? '').slice(0, 64) || undefined;
  await addUserScript(script, { createdBy });

  // v2.0.1 — archetype evolution. Creating a talkshow segment counts as
  // a small "ambitious creative output" event.
  // v3.1.1 — promoted from fire-and-forget to awaited so we can return
  // the evolution payload to the client (toast surface). Anonymous
  // creators (no profile) still no-op silently via recordEvolutionEvent
  // returning null.
  let evolution = null;
  if (createdBy) {
    evolution = await recordEvolutionEvent(
      createdBy,
      'talkshow-create',
      talkshowCreateDelta(),
      `创作了《${script.title}》`,
    ).catch(() => null);
  }

  return c.json({ ...script, source: 'user', likes: 0, createdBy, evolution });
});

// ── v0.7.6 topic safety ────────────────────────────────────────────────
// Cheap regex pre-filter. Not a content-moderation pipeline — for that
// we'd plug in something like Anthropic's moderation endpoint or a
// dedicated classifier. Goal here: catch the 95% of obvious abuse
// (politicians' names, illegal trade, gore) without a false-positive on
// "我老板让我..." style legitimate workplace satire. Soft policy: if a
// flagged term is a substring of a longer clearly-OK phrase, the prompt's
// LLM-side guard catches it.
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // High-risk political names — anyone notable enough to defame in a Chinese
  // public-facing app. Keeping the list short + obvious; expand as needed.
  { pattern: /习近平|普京|拜登|特朗普|金正恩|蔡英文/, reason: '不接受真实政治人物姓名' },
  // Illegal / harm content
  { pattern: /(?:儿童色情|强奸|诈骗教学|毒品交易|杀人|自杀方法)/, reason: '不接受违法或自伤内容' },
  // Slurs (very small starter set; keep adding)
  { pattern: /(?:傻逼|操你|nmsl)/i, reason: '请避免脏话和侮辱' },
];
function checkTopicSafety(topic: string): { ok: true } | { ok: false; reason: string } {
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(topic)) return { ok: false, reason };
  }
  return { ok: true };
}

// ---------- /like (v0.7.5) -------------------------------------------------

const LikeRequestSchema = z.object({
  scriptId: z.string().min(1).max(64),
  /** false = unlike (toggle off). Defaults to true so the simple
   *  "POST /like {scriptId}" call from the heart button is concise. */
  liked: z.boolean().optional(),
});

talkshowRoutes.post('/like', async (c) => {
  const v = await validateBody(c, LikeRequestSchema);
  if (!v.ok) return v.response;
  const { scriptId } = v.data;
  // If `liked` is omitted, behave as a toggle keyed by the dedup-Set state
  // for this IP. This makes the client UI dead simple: tap = flip.
  const ip = ipFrom(c);
  const dedupKey = `${ip}::${scriptId}`;
  const liked = v.data.liked ?? !likedByIp.has(dedupKey);

  // Lookup pool — user-generated bits hit scriptStore (persistent), seeds
  // hit the in-memory map. Either way we surface the same wire shape.
  const inSeeds = SEED_SCRIPTS.some((s) => s.id === scriptId);
  const isUser  = !inSeeds && (await findUserScript(scriptId)) !== null;
  if (!inSeeds && !isUser) {
    return c.json({ error: 'script not found' }, 404);
  }

  const wasLiked = likedByIp.has(dedupKey);
  if (liked === wasLiked) {
    // No-op — return current count without touching state.
    const likes = inSeeds
      ? (seedLikes.get(scriptId) ?? 0)
      : ((await findUserScript(scriptId))?.likes ?? 0);
    return c.json({ scriptId, liked, likes });
  }

  let likes: number | null;
  if (liked) {
    likedByIp.add(dedupKey);
    if (inSeeds) {
      likes = (seedLikes.get(scriptId) ?? 0) + 1;
      seedLikes.set(scriptId, likes);
    } else {
      likes = await incrementLike(scriptId);
    }
  } else {
    likedByIp.delete(dedupKey);
    if (inSeeds) {
      likes = Math.max(0, (seedLikes.get(scriptId) ?? 0) - 1);
      seedLikes.set(scriptId, likes);
    } else {
      likes = await decrementLike(scriptId);
    }
  }

  return c.json({ scriptId, liked, likes: likes ?? 0 });
});

/** GET /like-state?ids=a,b,c — bulk fetch the per-IP "have I liked this?"
 *  state for a batch of script ids. Lets the client paint hearts on cards
 *  on first load without N round-trips. */
talkshowRoutes.get('/like-state', (c) => {
  const idsParam = c.req.query('ids') ?? '';
  if (!idsParam) return c.json({ liked: [] });
  const ip = ipFrom(c);
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const liked = ids.filter((id) => likedByIp.has(`${ip}::${id}`));
  return c.json({ liked });
});

/* ─── v6.1 UGC 段子 ─────────────────────────────────────────────────────
 * 用户提交段子 → auto-moderation → pending (等 maker 手动 approve)
 * Maker 通过的段子进入月度精选池, 按 likes desc 排序
 * 给 talkshow 主页 "★ 本月精选 UGC" section 用
 * ────────────────────────────────────────────────────────────────────── */
const ugcSubmitLimiter = createRateLimiter({ windowMs: 3600_000, max: 3 });

const UgcSubmitSchema = z.object({
  title: z.string().min(4).max(40),
  text: z.string().min(30).max(800),
  tag: z.enum(['overtime', 'kpi', 'pua', 'age', 'slacking', 'jargon', 'hr', 'boss', 'meta']),
  region: z.enum(['beijing', 'shanghai', 'shenzhen', 'hangzhou', 'chengdu', 'overseas']).optional(),
});

talkshowRoutes.post('/ugc/submit', async (c) => {
  const userId = c.req.header('x-user-id')?.slice(0, 64);
  if (!userId || userId.length < 8) {
    return c.json({ error: '需要 X-User-Id header' }, 400);
  }
  const rateCheck = ugcSubmitLimiter.check(ipFrom(c));
  if (!rateCheck.ok) {
    return c.json({ error: '投稿太快, 1 小时最多 3 条' }, 429);
  }
  const v = await validateBody(c, UgcSubmitSchema);
  if (!v.ok) return v.response;
  const result = await submitTalkshow({
    userId,
    title: v.data.title,
    text: v.data.text,
    tag: v.data.tag,
    region: v.data.region,
  });
  if (!result.ok) return c.json({ error: result.reason }, 400);
  return c.json({
    id: result.entry.id,
    status: result.entry.status,
    // pending: 等 maker 审核, rejected: auto-moderation 被拒
    message: result.entry.status === 'pending'
      ? '✓ 投稿成功, 等待审核 (通常 24h 内)'
      : `✗ ${result.entry.rejectionReason ?? '审核未通过'}`,
  });
});

talkshowRoutes.get('/ugc/monthly', async (c) => {
  const limit = Math.max(1, Math.min(20, parseInt(c.req.query('limit') ?? '5', 10) || 5));
  const entries = await getMonthlyHighlights(limit);
  return c.json({
    period: 'last_30d',
    entries: entries.map((e) => ({
      id: e.id, title: e.title, text: e.text, tag: e.tag, region: e.region,
      likes: e.likes, createdAt: e.createdAt,
    })),
  });
});

talkshowRoutes.get('/ugc/me', async (c) => {
  const userId = c.req.header('x-user-id')?.slice(0, 64);
  if (!userId || userId.length < 8) {
    return c.json({ submissions: [] });
  }
  const entries = await listUserSubmissions(userId);
  return c.json({
    submissions: entries.map((e) => ({
      id: e.id, title: e.title, text: e.text, tag: e.tag,
      status: e.status, rejectionReason: e.rejectionReason,
      likes: e.likes, createdAt: e.createdAt,
    })),
  });
});

talkshowRoutes.post('/ugc/like/:id', async (c) => {
  const id = c.req.param('id');
  const ip = ipFrom(c);
  const dedupKey = `ugc::${ip}::${id}`;
  if (likedByIp.has(dedupKey)) {
    return c.json({ error: '已经点过赞了' }, 409);
  }
  const e = await likeSubmission(id);
  if (!e) return c.json({ error: '段子不存在或未审核' }, 404);
  likedByIp.add(dedupKey);
  return c.json({ id: e.id, likes: e.likes });
});

/* ─── v6.11 P2 — Maker (admin) UGC moderation ──────────────────────────
 * Token-gated. Reads MAKER_TOKEN at request time (not import time) so
 * a deploy that adds the env var doesn't need a restart. When the token
 * is missing entirely, all maker routes return 503 (closed) — safer
 * default than allowing anonymous moderation in prod.
 * ────────────────────────────────────────────────────────────────────── */
const MakerReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().min(1).max(200).optional(),
});

function checkMakerAuth(c: any): { ok: true } | { ok: false; resp: Response } {
  const expected = process.env.MAKER_TOKEN;
  if (!expected || expected.length < 16 || expected.startsWith('please_set')) {
    return { ok: false, resp: c.json({ error: 'maker channel closed (no MAKER_TOKEN env)' }, 503) };
  }
  const got = c.req.header('x-maker-token') ?? '';
  if (got !== expected) {
    return { ok: false, resp: c.json({ error: 'invalid maker token' }, 401) };
  }
  return { ok: true };
}

talkshowRoutes.get('/maker/pending', async (c) => {
  const auth = checkMakerAuth(c);
  if (!auth.ok) return auth.resp;
  const entries = await listPending();
  return c.json({
    pending: entries.map((e) => ({
      id: e.id, userId: e.userId,
      title: e.title, text: e.text, tag: e.tag, region: e.region,
      modNotes: e.modNotes, createdAt: e.createdAt,
    })),
  });
});

talkshowRoutes.post('/maker/review/:id', async (c) => {
  const auth = checkMakerAuth(c);
  if (!auth.ok) return auth.resp;
  const id = c.req.param('id');
  const v = await validateBody(c, MakerReviewSchema);
  if (!v.ok) return v.response;
  const entry = await reviewSubmission(id, v.data.decision, v.data.rejectionReason);
  if (!entry) return c.json({ error: '段子不存在' }, 404);
  return c.json({
    id: entry.id, status: entry.status,
    rejectionReason: entry.rejectionReason,
  });
});
