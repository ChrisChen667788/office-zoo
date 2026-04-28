/**
 * /api/share — endpoints supporting the viral video export pipeline.
 *
 * Only one route in v0.3.1: POST /api/share/captions. v0.4.0 will add
 * POST /api/share/render for the server-side ffmpeg pipeline + 16:9
 * horizontal output.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { generateCaptions, type CaptionInput } from '../services/highlightCaption';
import {
  transcodeToMp4,
  isFfmpegAvailable,
  MAX_INPUT_BYTES,
} from '../services/transcodeVideo';
import { validateBody } from '../utils/validate';

export const shareRoutes = new Hono();

// Cap at 10 highlights per request — defends against payload bombs while
// leaving headroom for future templates that pack more slides.
const HighlightSchema = z.object({
  kind: z.enum(['kill', 'vote_eject', 'roast', 'reversal', 'finale']),
  playerName: z.string().max(64).optional(),
  role: z.string().max(64).optional(),
  team: z.enum(['cat', 'dog', 'neutral']).optional(),
  headline: z.string().min(1).max(160),
  body: z.string().max(400).optional(),
  round: z.number().int().nonnegative().optional(),
});

const CaptionsRequestSchema = z.object({
  highlights: z.array(HighlightSchema).min(1).max(10),
});

shareRoutes.post('/captions', async (c) => {
  const v = await validateBody(c, CaptionsRequestSchema);
  if (!v.ok) return v.response;
  const items: CaptionInput[] = v.data.highlights;
  const captions = await generateCaptions(items);
  return c.json({ captions });
});

/** v0.4.0 — server-side transcode endpoint. Accepts a webm/mp4/etc video
 *  body (raw octet-stream), pipes through ffmpeg, returns h.264 mp4 with
 *  faststart so it plays everywhere (微信 / 抖音 / Twitter desktop).
 *
 *  Capability probe: GET /api/share/capabilities (read by client to decide
 *  whether to even surface the "🎞️ 转高清 mp4" button — when ffmpeg is
 *  missing the button is hidden so users don't see a broken affordance).
 */
shareRoutes.get('/capabilities', async (c) => {
  return c.json({
    transcode: await isFfmpegAvailable(),
    maxBytes: MAX_INPUT_BYTES,
  });
});

shareRoutes.post('/transcode', async (c) => {
  const ct = c.req.header('content-type') ?? '';
  if (!/^video\//i.test(ct) && !/^application\/octet-stream/i.test(ct)) {
    return c.json({ error: `unsupported content-type: ${ct}` }, 415);
  }
  // Hono exposes raw body via c.req.arrayBuffer().
  const raw = await c.req.arrayBuffer();
  if (raw.byteLength === 0) return c.json({ error: 'empty body' }, 400);

  const result = await transcodeToMp4(Buffer.from(raw));
  if (!result.ok) {
    const status =
      result.reason === 'no-ffmpeg' ? 503
    : result.reason === 'too-large' ? 413
    : result.reason === 'timeout'   ? 504
    :                                 500;
    return c.json({ error: result.message, reason: result.reason }, status);
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': result.mimeType,
      'Content-Length': result.buffer.length.toString(),
      'Cache-Control': 'no-store',
    },
  });
});
