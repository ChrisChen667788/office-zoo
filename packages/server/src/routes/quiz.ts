/**
 * /api/quiz — v1.3.0 personality quiz routes.
 *
 *   POST /score   { answers: number[] }     →  computes archetype + saves profile
 *   GET  /me                                 →  this user's profile (or 404 if none)
 *
 * X-User-Id header is REQUIRED on /score (we need somewhere to persist).
 * Stateless re-quiz: posting again overwrites the previous profile.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../utils/validate';
import { createRateLimiter } from '../utils/rateLimit';
import {
  ARCHETYPES,
  QUIZ_QUESTIONS,
  emptyTraitVector,
  addTraitDelta,
  scoreArchetypes,
  extractTribeFromAnswers,
} from '@furball/shared';
import {
  generatePersonalizedProfile,
} from '../services/profileGenerator';
import { findProfile, saveProfile, type UserProfile } from '../services/profileStore';
import { getEvolutionPayload } from '../services/archetypeEvolution';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'quiz' });
const limiter = createRateLimiter({ windowMs: 600_000, max: 6 }); // 6 quiz scores per 10 min

function ipFromHono(c: { req: { header: (k: string) => string | undefined } }): string {
  const fwd = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip');
  if (fwd) return fwd.split(',')[0].trim();
  return c.req.header('host') ?? 'unknown';
}

export const quizRoutes = new Hono();

const ScoreSchema = z.object({
  /** One answer index (0-3) per question. Length must match
   *  QUIZ_QUESTIONS. We validate length + range here so a malformed
   *  client never trips a downstream out-of-bounds. */
  answers: z.array(z.number().int().min(0).max(3)).length(QUIZ_QUESTIONS.length),
});

quizRoutes.post('/score', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ error: 'X-User-Id header required' }, 400);

  const ip = ipFromHono(c);
  const limit = limiter.check(ip);
  if (!limit.ok) {
    return c.json({
      error: 'rate limited',
      message: `测试太频繁了,${Math.ceil(limit.retryAfterSec / 60)} 分钟后再试`,
      retryAfterSec: limit.retryAfterSec,
    }, 429, { 'Retry-After': String(limit.retryAfterSec) });
  }

  const v = await validateBody(c, ScoreSchema);
  if (!v.ok) return v.response;
  const { answers } = v.data;

  // Sum trait deltas from each answer.
  let traits = emptyTraitVector();
  for (let i = 0; i < QUIZ_QUESTIONS.length; i++) {
    const q = QUIZ_QUESTIONS[i];
    const idx = answers[i];
    const ans = q.answers[idx];
    if (ans) traits = addTraitDelta(traits, ans.delta);
  }

  // v2.0.0 — extract region/industry signal from the same answers, so
  // the new 12 tribe-flavored archetypes can outrank generic ones with
  // similar trait shapes. Falls back to v1.x cosine-only when no
  // region/industry-tagged answer was selected.
  const tribe = extractTribeFromAnswers(answers);

  // Cosine-match against all 24 archetypes (tribe bonus applied inside).
  const ranked = scoreArchetypes(traits, tribe);
  const top3: [string, string, string] = [
    ranked[0].archetype.id,
    ranked[1]?.archetype.id ?? ranked[0].archetype.id,
    ranked[2]?.archetype.id ?? ranked[0].archetype.id,
  ];

  // LLM-generate personalized catchphrases for the winning archetype.
  // This adds ~3-5s latency to the quiz finish — worth it because the
  // catchphrases are the most-screenshotted part of the card.
  const personalized = await generatePersonalizedProfile(ranked[0].archetype, traits);

  const profile: UserProfile = {
    userId,
    topArchetypes: top3,
    traits,
    personalized,
    takenAt: Date.now(),
  };
  await saveProfile(profile);

  log.info('Quiz scored', {
    userId: userId.slice(0, 8) + '…',
    top: top3[0],
    score: ranked[0].score.toFixed(2),
  });

  return c.json({ profile, ranked: ranked.slice(0, 5).map((r) => ({
    archetypeId: r.archetype.id, score: r.score,
  })) });
});

quizRoutes.get('/me', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ profile: null });
  const profile = await findProfile(userId);
  return c.json({ profile });
});

quizRoutes.get('/archetypes', (c) => {
  // Convenience endpoint for the client (matches the shape `findArchetype`
  // does in shared, but lets clients fetch the full catalogue without
  // bundling the whole shared package if we ever do code-splitting).
  return c.json({ archetypes: ARCHETYPES });
});

/** v1.5.1 — evolution payload. Origin vs current archetype + cumulative
 *  drift + recent events. Anonymous (no quiz) returns null so the
 *  Profile page can render a "take the quiz first" nudge instead. */
quizRoutes.get('/evolution/me', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ evolution: null });
  const evolution = await getEvolutionPayload(userId);
  return c.json({ evolution });
});
