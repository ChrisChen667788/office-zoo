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
} from '../services/scriptStore';
import { validateBody } from '../utils/validate';

export const talkshowRoutes = new Hono();

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

talkshowRoutes.get('/list', async (c) => {
  // v0.7.4 — merge user-generated bits with seeds. User bits go FIRST so
  // they're top-of-grid (encourages creation + makes "I just made one" a
  // visible reward). Both pools strip `text` (full body fetched via
  // /script/:id on tap).
  const userScripts = await listUserScripts();
  const merge = (src: TalkshowScript[], source: 'user' | 'seed') =>
    src.map(({ text: _t, ...rest }) => ({ ...rest, source }));
  const summary = [
    ...merge(userScripts, 'user'),
    ...merge(SEED_SCRIPTS,  'seed'),
  ];
  return c.json({ scripts: summary });
});

// ---------- /script/:id ----------------------------------------------------

talkshowRoutes.get('/script/:id', async (c) => {
  const id = c.req.param('id');
  // Look in both pools — user-generated bits use the `bit-u-...` namespace,
  // seeds use `bit-NNN`, but we don't depend on that prefix in case we ever
  // reshuffle ids.
  const seed = SEED_SCRIPTS.find((s) => s.id === id);
  if (seed) return c.json({ ...seed, source: 'seed' });
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
  const v = await validateBody(c, GenerateRequestSchema);
  if (!v.ok) return v.response;
  const { topic, persona, tag } = v.data;

  // The actual writer call. Returns null when the LLM chain (QingYun →
  // Minimax-M2 fallback) is fully unavailable — we surface that as 502
  // so the client can show "暂时不能生成,先听看现成的吧" instead of
  // pretending we wrote something.
  const script = await generateTalkshowScript({ topic, persona, tag });
  if (!script) {
    return c.json({ error: 'LLM unavailable, try again' }, 502);
  }
  await addUserScript(script);
  return c.json({ ...script, source: 'user' });
});
