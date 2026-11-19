import { Hono } from 'hono';
import { z } from 'zod';
import { generateTTSAudio } from '../services/tts';
import { validateBody } from '../utils/validate';
import { createRateLimiter } from '../utils/rateLimit';
import { clientIp } from '../utils/clientIp';
import { envInt } from '../utils/deployProfile';

export const ttsRoutes = new Hono();

// v6.162 — 此前无限流:一个脚本就能把 TTS 额度刷空。前端对局里的语音走 Socket 通道
// (socketHandler 的发言队列),不经过这个接口,所以这里的额度只防刷,不影响正常玩。
// 默认每 IP 每小时 120 次,TTS_RATE_LIMIT_PER_HOUR 可调。
let ttsLimiter: ReturnType<typeof createRateLimiter> | null = null;
let ttsLimiterMax = -1;
function limiter() {
  const max = envInt('TTS_RATE_LIMIT_PER_HOUR', 120);
  if (!ttsLimiter || max !== ttsLimiterMax) {
    ttsLimiter = createRateLimiter({ windowMs: 3600_000, max });
    ttsLimiterMax = max;
  }
  return ttsLimiter;
}

// Cap text at 500 chars — TTS providers typically charge per character + clip
// very long strings anyway. Role is free-form so games can pass role IDs.
const TTSGenerateSchema = z.object({
  text: z.string().min(1).max(500),
  role: z.string().max(64).optional(),
});

ttsRoutes.post('/generate', async (c) => {
  const rate = limiter().check(clientIp(c));
  if (!rate.ok) {
    return c.json({ error: 'rate_limited', retryAfterSec: rate.retryAfterSec }, 429);
  }
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
