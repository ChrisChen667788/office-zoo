/**
 * /api/daily-challenge — v5.0.0 global today-only challenge route.
 *
 * Companion to v1.4.0's per-user /api/daily/me (which serves the
 * tribe-personalized daily drama). This route serves the SAME-FOR-
 * EVERYONE daily challenge — same scenario, public leaderboard,
 * resets at UTC midnight.
 *
 * Endpoints:
 *   GET  /today                — fetch today's scenario + top-20 leaderboard
 *   POST /today/complete       — record (or improve) your result for today
 *
 * Both endpoints anonymous-tolerate (no X-User-Id = no per-user
 * leaderboard slice on GET; POST returns 400 since we need a userId
 * to attribute the entry).
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../utils/validate';
import { findArchetype } from '@furball/shared';
import { findProfile } from '../services/profileStore';
import {
  getDailyChallengeSummary,
  recordDailyChallengeResult,
} from '../services/dailyChallengeStore';

export const dailyChallengeRoutes = new Hono();

dailyChallengeRoutes.get('/today', (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64) || undefined;
  const summary = getDailyChallengeSummary({ userId });
  return c.json({ summary });
});

const CompleteSchema = z.object({
  scenarioId: z.string().min(1).max(64),
  displayName: z.string().min(1).max(24).optional(),
  result: z.object({
    compensationMonths: z.number().min(0).max(120),
    maxPossible: z.number().min(0).max(120),
    grade: z.enum(['S', 'A', 'B', 'C', 'D']),
    tactic: z.string().max(200).optional(),
  }),
});

dailyChallengeRoutes.post('/today/complete', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ error: 'X-User-Id header required' }, 400);
  const v = await validateBody(c, CompleteSchema);
  if (!v.ok) return v.response;

  // Resolve archetype for the leaderboard display chip.
  const profile = await findProfile(userId).catch(() => null);
  const archetype = profile?.topArchetypes?.[0]
    ? findArchetype(profile.topArchetypes[0]) ?? null
    : null;

  const result = recordDailyChallengeResult({
    userId,
    displayName: v.data.displayName,
    archetype,
    scenarioId: v.data.scenarioId,
    compensationMonths: v.data.result.compensationMonths,
    maxPossible: v.data.result.maxPossible,
    grade: v.data.result.grade,
    tactic: v.data.result.tactic,
  });
  return c.json(result);
});
