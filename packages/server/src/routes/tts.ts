import { Hono } from 'hono';
import { z } from 'zod';
import { generateTTSAudio } from '../services/tts';
import { validateBody } from '../utils/validate';

export const ttsRoutes = new Hono();

// Cap text at 500 chars — TTS providers typically charge per character + clip
// very long strings anyway. Role is free-form so games can pass role IDs.
const TTSGenerateSchema = z.object({
  text: z.string().min(1).max(500),
  role: z.string().max(64).optional(),
});

ttsRoutes.post('/generate', async (c) => {
  const v = await validateBody(c, TTSGenerateSchema);
  if (!v.ok) return v.response;
  const { text, role } = v.data;

  const audioBuffer = await generateTTSAudio(text, role);
  if (!audioBuffer) {
    return c.json({ error: 'TTS generation failed' }, 500);
  }

  // Buffer → Uint8Array so TS BodyInit accepts it cleanly (pre-existing fix).
  return new Response(new Uint8Array(audioBuffer), {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
    },
  });
});
