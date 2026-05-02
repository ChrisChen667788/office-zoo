/**
 * /api/talkshow — v0.7.0 班味单口 (Workplace Standup) routes.
 *
 * Three endpoints:
 *   GET  /list           returns the seed script catalogue (id + meta only,
 *                        text shipped via the dedicated /script/:id call so
 *                        the list response stays small)
 *   GET  /script/:id     full script body for one bit
 *   POST /tts            generate Minimax TTS for a script — returns mp3
 *                        bytes. Same /api/tts code path under the hood, but
 *                        with the talkshow-specific voice mapping baked in.
 *
 * Why a dedicated route module rather than reusing /api/tts:
 *   - Voice persona → Minimax voice_id mapping is talkshow-specific
 *     (we want curated personalities, not the generic role-voice table)
 *   - Future v0.7.2 will host server-rendered videos here too, so this is
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

talkshowRoutes.get('/list', (c) => {
  // Strip `text` from list view — the player fetches it separately when they
  // tap a card. Keeps the list payload < 4 KB even for 100+ scripts.
  const summary = SEED_SCRIPTS.map(({ text: _t, ...rest }: TalkshowScript) => rest);
  return c.json({ scripts: summary });
});

// ---------- /script/:id ----------------------------------------------------

talkshowRoutes.get('/script/:id', (c) => {
  const id = c.req.param('id');
  const script = SEED_SCRIPTS.find((s) => s.id === id);
  if (!script) return c.json({ error: 'script not found' }, 404);
  return c.json(script);
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

  if (scriptId) {
    const script = SEED_SCRIPTS.find((s) => s.id === scriptId);
    if (!script) return c.json({ error: 'script not found' }, 404);
    body = script.text;
    voiceHint = PERSONA_TO_ROLE_HINT[script.persona];
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
      // Talkshow audio is deterministic per script — long cache OK.
      'Cache-Control': scriptId ? 'public, max-age=86400' : 'no-store',
    },
  });
});
