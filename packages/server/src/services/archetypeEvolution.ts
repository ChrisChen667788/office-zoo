/**
 * archetypeEvolution — v1.5.1 trait drift from gameplay.
 *
 * The quiz (v1.3.0) gave each user a fixed 6-dim trait vector + a top
 * archetype. v1.5.1 evolves that vector based on what they actually
 * *do* in the app — heavy negotiation wins push grind+ambition,
 * passive-aggressive plays push snark+cynicism, etc. After enough
 * accumulated drift, the user's matched archetype changes — surfaced
 * to the user as "你已经演化为 X" (the most viral moment in this loop).
 *
 * ## Design choices
 *
 *  - Drift is stored SEPARATELY from the original `traits` vector. This
 *    preserves the "你最初是 X" line on the Profile page so the
 *    transition arc is legible. Effective trait = traits + drift.
 *  - Per-event delta magnitudes are small (0.05 - 0.5). Total drift is
 *    clamped to ±1.5 per trait so a single sleep-deprived weekend of
 *    grinding doesn't permanently warp identity. Decay isn't implemented
 *    in v1.5.1 — if users complain the chart "sticks", a half-life can
 *    come in v1.5.x.
 *  - Heuristic deltas (not LLM) because the events are well-defined
 *    finite outcomes (win/lose/ratio/rounds). LLM would burn tokens for
 *    a deterministic mapping. Squad / talkshow / pack hooks can come
 *    later with similar heuristic tables.
 *
 * ## Event types (v1.5.1 ships fired-completion only)
 *
 *   fired-completion  — POST /api/fired/memory/record fires this
 *   squad-end         — squadHandler when status → 'ended' (TODO)
 *   talkshow-create   — talkshow route on segment creation (TODO)
 *   pack-complete     — fired/pack route on 5/5 slot completion (TODO)
 */

import type { TraitVector, TraitId } from '@furball/shared';
import { ARCHETYPES, findArchetype, scoreArchetypes } from '@furball/shared';
import { findProfile, saveProfile, type EvolutionEvent, type UserProfile } from './profileStore';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'archetypeEvolution' });

/** Cap drift magnitude per dim — keeps identity bounded so power users
 *  don't permanently warp into an archetype they barely match. */
const DRIFT_CLAMP = 1.5;

/** Capped events on the profile — older ones drop off the tail. */
const MAX_EVENTS = 20;

const TRAIT_KEYS: TraitId[] = ['grind', 'snark', 'ambition', 'empathy', 'cynicism', 'visibility'];

/** Human-readable Chinese label per trait — used to compose summary
 *  strings ("卷度 +0.3") that the client surfaces verbatim. */
const TRAIT_LABEL: Record<TraitId, string> = {
  grind:      '卷度',
  snark:      '阴阳度',
  ambition:   '进取心',
  empathy:    '人情味',
  cynicism:   '摆烂度',
  visibility: '存在感',
};

// ────────────────────────────────────────────────────────────────────
// Delta heuristics — pure functions, no I/O, easy to unit-test.
// ────────────────────────────────────────────────────────────────────

export interface FiredCompletionInput {
  /** 'win' | 'partial' | 'lose' from outcome enum. */
  outcome: 'win' | 'partial' | 'lose';
  /** compensationMonths / maxPossible — already clamped 0-1 by caller. */
  finalRatio: number;
  /** Number of user messages in the chat. */
  tookRounds: number;
}

/** Derive a 6-dim trait delta from a finished fired-chat round.
 *
 *  Heuristics (deliberately tuned to be readable, not statistical):
 *    - win + high-ratio (≥0.8) → ambition+0.4, grind+0.2 (confidence ↑)
 *    - win + mid ratio          → ambition+0.2, empathy+0.1
 *    - partial                  → empathy+0.1, snark+0.1 (折中, 人情味)
 *    - lose                     → cynicism+0.3, snark+0.2 (摆烂 + 阴阳)
 *    - very short (≤4 rounds)   → +0.1 snark (说话冲)
 *    - very long  (≥8 rounds)   → +0.1 empathy (耐心谈)
 */
export function firedCompletionDelta(input: FiredCompletionInput): Partial<TraitVector> {
  const delta: Partial<TraitVector> = {};
  const add = (k: TraitId, v: number) => { delta[k] = (delta[k] ?? 0) + v; };

  if (input.outcome === 'win') {
    if (input.finalRatio >= 0.8) {
      add('ambition', 0.4);
      add('grind', 0.2);
    } else {
      add('ambition', 0.2);
      add('empathy', 0.1);
    }
  } else if (input.outcome === 'partial') {
    add('empathy', 0.1);
    add('snark', 0.1);
  } else { // lose
    add('cynicism', 0.3);
    add('snark', 0.2);
  }

  if (input.tookRounds <= 4) add('snark', 0.1);
  if (input.tookRounds >= 8) add('empathy', 0.1);

  return delta;
}

// ────────────────────────────────────────────────────────────────────
// Persistence + queries
// ────────────────────────────────────────────────────────────────────

function zeroDrift(): TraitVector {
  return { grind: 0, snark: 0, ambition: 0, empathy: 0, cynicism: 0, visibility: 0 };
}

function applyDelta(drift: TraitVector, delta: Partial<TraitVector>): TraitVector {
  const next: TraitVector = { ...drift };
  for (const k of TRAIT_KEYS) {
    next[k] = Math.max(-DRIFT_CLAMP, Math.min(DRIFT_CLAMP, (next[k] ?? 0) + (delta[k] ?? 0)));
  }
  return next;
}

/** Compose a one-line zh-CN summary of a delta — used in EvolutionEvent
 *  feed lines. e.g. "卷度 +0.4 · 进取心 +0.2". */
function summarizeDelta(delta: Partial<TraitVector>): string {
  const parts: string[] = [];
  for (const k of TRAIT_KEYS) {
    const v = delta[k];
    if (v === undefined || v === 0) continue;
    const sign = v > 0 ? '+' : '';
    parts.push(`${TRAIT_LABEL[k]} ${sign}${v.toFixed(1)}`);
  }
  return parts.length ? parts.join(' · ') : '小幅微调';
}

export interface RecordEvolutionResult {
  /** The delta that was applied (post-cap). */
  delta: Partial<TraitVector>;
  /** One-line summary built from the delta. */
  summary: string;
  /** True iff this event flipped the user's top archetype. UI uses this
   *  to fire the "你已演化为 X" celebration. */
  transitioned: boolean;
  /** Archetype id BEFORE this event (effective top). */
  fromArchetype: string;
  /** Archetype id AFTER this event (effective top). */
  toArchetype: string;
  /** Updated event list count — useful telemetry. */
  eventCount: number;
}

/** Apply an evolution event to the user's profile + persist.
 *
 *  Anonymous (no profile) users no-op silently — evolution requires
 *  a baseline quiz. Returns null in that case so callers can decide
 *  whether to surface a "take the quiz" nudge.
 *
 *  Fire-and-forget safe: throws are caught in the caller's `void` use.
 */
export async function recordEvolutionEvent(
  userId: string,
  kind: EvolutionEvent['kind'],
  delta: Partial<TraitVector>,
  /** Optional caller-supplied prefix that gets prepended to the
   *  delta summary, e.g. "拿下 8 个月赔偿". */
  summaryPrefix?: string,
): Promise<RecordEvolutionResult | null> {
  const profile = await findProfile(userId).catch(() => null);
  if (!profile) return null;

  const prevDrift = profile.traitDrift ?? zeroDrift();
  const prevEffective = effectiveTraits(profile.traits, prevDrift);
  const prevTop = scoreArchetypes(prevEffective)[0]?.archetype.id ?? profile.topArchetypes[0];

  const nextDrift = applyDelta(prevDrift, delta);
  const nextEffective = effectiveTraits(profile.traits, nextDrift);
  const ranked = scoreArchetypes(nextEffective);
  const nextTop = ranked[0]?.archetype.id ?? prevTop;

  const summaryBody = summarizeDelta(delta);
  const summary = summaryPrefix ? `${summaryPrefix} — ${summaryBody}` : summaryBody;
  const event: EvolutionEvent = { ts: Date.now(), kind, delta, summary };

  const events = [event, ...(profile.evolutionEvents ?? [])].slice(0, MAX_EVENTS);

  // Refresh topArchetypes to reflect the new effective ranking. Keeps
  // /api/quiz/me and downstream consumers (talkshow voice picker,
  // daily drama selector) consistent — they all read topArchetypes[0].
  const newTop3: [string, string, string] = [
    ranked[0]?.archetype.id ?? profile.topArchetypes[0],
    ranked[1]?.archetype.id ?? profile.topArchetypes[1],
    ranked[2]?.archetype.id ?? profile.topArchetypes[2],
  ];

  const updated: UserProfile = {
    ...profile,
    traitDrift: nextDrift,
    evolutionEvents: events,
    topArchetypes: newTop3,
  };
  await saveProfile(updated);

  const transitioned = prevTop !== nextTop;
  if (transitioned) {
    log.info({
      userId: userId.slice(0, 8) + '…',
      from: prevTop, to: nextTop, kind,
    }, 'Archetype transition');
  }

  return {
    delta,
    summary,
    transitioned,
    fromArchetype: prevTop,
    toArchetype: nextTop,
    eventCount: events.length,
  };
}

/** Effective traits = quiz base + cumulative drift, clamped to ≥0
 *  (cosine math wants non-negative). Drift can push individual dims
 *  above 1 — we don't re-normalize because archetype vectors don't
 *  either and the cosine is scale-invariant. */
export function effectiveTraits(base: TraitVector, drift: TraitVector): TraitVector {
  return {
    grind:      Math.max(0, base.grind      + (drift.grind      ?? 0)),
    snark:      Math.max(0, base.snark      + (drift.snark      ?? 0)),
    ambition:   Math.max(0, base.ambition   + (drift.ambition   ?? 0)),
    empathy:    Math.max(0, base.empathy    + (drift.empathy    ?? 0)),
    cynicism:   Math.max(0, base.cynicism   + (drift.cynicism   ?? 0)),
    visibility: Math.max(0, base.visibility + (drift.visibility ?? 0)),
  };
}

// ────────────────────────────────────────────────────────────────────
// Read API — feeds /api/quiz/evolution/me
// ────────────────────────────────────────────────────────────────────

export interface EvolutionPayload {
  /** Original quiz vector. */
  originTraits: TraitVector;
  /** Cumulative drift (zero vector when no events yet). */
  drift: TraitVector;
  /** Effective = origin + drift, clamped ≥0. Re-scoring source. */
  effectiveTraits: TraitVector;
  /** Original top archetype (computed from origin vector). */
  originArchetypeId: string;
  /** Current top archetype (computed from effective). May === origin
   *  if no transition has happened yet. */
  currentArchetypeId: string;
  /** True iff origin !== current — UI shows transition banner. */
  evolved: boolean;
  /** Recent event feed (newest first). */
  events: EvolutionEvent[];
  /** Top-3 archetype ranking now (with similarity scores). Client
   *  uses this to render "second-place archetype is breathing down
   *  your neck" affordances. */
  ranked: Array<{ archetypeId: string; score: number; archetypeName: string; archetypeEmoji: string }>;
}

export async function getEvolutionPayload(userId: string): Promise<EvolutionPayload | null> {
  const profile = await findProfile(userId).catch(() => null);
  if (!profile) return null;

  const drift = profile.traitDrift ?? zeroDrift();
  const effective = effectiveTraits(profile.traits, drift);
  const originRanked = scoreArchetypes(profile.traits);
  const ranked = scoreArchetypes(effective);
  const originTop = originRanked[0]?.archetype.id ?? profile.topArchetypes[0];
  const currentTop = ranked[0]?.archetype.id ?? profile.topArchetypes[0];

  return {
    originTraits: profile.traits,
    drift,
    effectiveTraits: effective,
    originArchetypeId: originTop,
    currentArchetypeId: currentTop,
    evolved: originTop !== currentTop,
    events: profile.evolutionEvents ?? [],
    ranked: ranked.slice(0, 5).map((r) => ({
      archetypeId: r.archetype.id,
      score: r.score,
      archetypeName: r.archetype.name,
      archetypeEmoji: r.archetype.emoji,
    })),
  };
}

// Touch the imports so tree-shaking doesn't drop them — both are used
// by callers via the re-exported helpers.
void ARCHETYPES;
void findArchetype;
