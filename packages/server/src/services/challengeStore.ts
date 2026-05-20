/**
 * challengeStore — v4.0.0 fired-mode "challenge a friend" store.
 *
 * A user finishes a fired-chat scenario and presses "📤 挑战朋友".
 * Server mints a short code; user shares the resulting link with a
 * friend (WeChat / 朋友圈 / wherever). Friend opens it, sees the
 * challenger's result + the scenario context, plays the same scenario.
 * When the friend's result lands, we surface a side-by-side comparison
 * share card.
 *
 * Storage choices:
 *  - In-memory Map only (no disk persist). Challenges are ephemeral
 *    social hooks, not durable game state. 24h TTL — long enough for
 *    "玩完发朋友圈,朋友下班后接挑战" but short enough that the Map
 *    stays bounded.
 *  - Short codes via random base36, 6 chars (~2.2B namespace,
 *    collision-resistant for 24h).
 *  - No anonymous gating: anyone with the link can accept, including
 *    the challenger themselves replaying. We DO track who completed
 *    via the X-User-Id header so the comparison card shows the right
 *    archetype/name pair.
 *
 * Failure modes:
 *  - Code not found / expired → 404. Client routes back to /fired.
 *  - Challenge already completed → returns the completed state so the
 *    UI can render the comparison card directly.
 *  - Same user accepts their own challenge → allowed (replay); the
 *    challengeeResult overwrites previous. Surfaced in UI as "你
 *    挑战自己" so the friend-comparison framing doesn't mislead.
 */

import type { Archetype } from '@furball/shared';

export interface ChallengeResult {
  compensationMonths: number;
  maxPossible: number;
  /** Computed letter grade S/A/B/C/D — same shape as FiredResult's. */
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  /** Optional tactic summary from /memory/record. Surfaced as a
   *  one-liner under each name in the comparison card. */
  tactic?: string;
  /** Completion timestamp. Used for "5 分钟前" relative time. */
  ts: number;
}

export interface ChallengeParticipantInfo {
  /** Pseudonymous X-User-Id (truncated for display). */
  userId: string;
  /** Display name, falls back to "员工" if unset. */
  displayName: string;
  /** Archetype emoji + name for the card chip. */
  archetypeId?: string;
  archetypeName?: string;
  archetypeEmoji?: string;
}

export interface Challenge {
  code: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioEmoji: string;
  createdAt: number;
  challenger: ChallengeParticipantInfo;
  challengerResult: ChallengeResult;
  /** Populated once a friend completes the scenario via this link. */
  challengee?: ChallengeParticipantInfo;
  challengeeResult?: ChallengeResult;
}

const TTL_MS = 24 * 60 * 60 * 1000;     // 24 hours
const MAX_CHALLENGES = 5_000;            // sanity cap; sweep below evicts old first

const store = new Map<string, Challenge>();

/** Sweep expired challenges every 10 min. */
let sweepStarted = false;
function startSweeper() {
  if (sweepStarted) return;
  sweepStarted = true;
  setInterval(() => {
    const cutoff = Date.now() - TTL_MS;
    for (const [code, ch] of store) {
      if (ch.createdAt < cutoff) store.delete(code);
    }
    // Cap-trim: if still over MAX, drop oldest first.
    if (store.size > MAX_CHALLENGES) {
      const sorted = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
      const toDrop = sorted.slice(0, store.size - MAX_CHALLENGES);
      for (const [code] of toDrop) store.delete(code);
    }
  }, 10 * 60 * 1000).unref();
}

function mintCode(): string {
  // 6 chars base36 ≈ 2.2B namespace. Prefix "vs-" so it reads as a
  // challenge link, not a random scenario id.
  for (let attempt = 0; attempt < 16; attempt++) {
    const rnd = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
    const code = `vs-${rnd}`;
    if (!store.has(code)) return code;
  }
  // Astronomically unlikely; bail with timestamp to guarantee uniqueness.
  return `vs-${Date.now().toString(36)}`;
}

/** Derive S/A/B/C/D from compensation ratio. Mirror of client's getGrade. */
export function gradeFromOutcome(months: number, maxMonths: number): ChallengeResult['grade'] {
  if (maxMonths <= 0) return 'C';
  const ratio = months / maxMonths;
  if (ratio >= 0.95) return 'S';
  if (ratio >= 0.8)  return 'A';
  if (ratio >= 0.6)  return 'B';
  if (ratio >= 0.4)  return 'C';
  return 'D';
}

export function createChallenge(input: {
  scenarioId: string;
  scenarioTitle: string;
  scenarioEmoji: string;
  challenger: ChallengeParticipantInfo;
  challengerResult: Omit<ChallengeResult, 'ts'>;
}): Challenge {
  startSweeper();
  const challenge: Challenge = {
    code: mintCode(),
    scenarioId: input.scenarioId,
    scenarioTitle: input.scenarioTitle,
    scenarioEmoji: input.scenarioEmoji,
    createdAt: Date.now(),
    challenger: input.challenger,
    challengerResult: { ...input.challengerResult, ts: Date.now() },
  };
  store.set(challenge.code, challenge);
  return challenge;
}

export function getChallenge(code: string): Challenge | null {
  const ch = store.get(code);
  if (!ch) return null;
  if (Date.now() - ch.createdAt > TTL_MS) {
    store.delete(code);
    return null;
  }
  return ch;
}

export function completeChallenge(
  code: string,
  challengee: ChallengeParticipantInfo,
  result: Omit<ChallengeResult, 'ts'>,
): Challenge | null {
  const ch = getChallenge(code);
  if (!ch) return null;
  ch.challengee = challengee;
  ch.challengeeResult = { ...result, ts: Date.now() };
  return ch;
}

/** v4.3.0 — leaderboard helpers. All read from the same in-mem store
 *  (no separate index). For the current store cap (5000 entries) +
 *  TTL (24h) the linear scans below are well under 1 ms. */

/** Latest N completed challenges (both sides done), newest first.
 *  Powers the "最近的对决" section on FiredLanding + the standalone
 *  /fired/leaderboard page. */
export function listLatestCompletedChallenges(limit = 20): Challenge[] {
  const completed: Challenge[] = [];
  for (const ch of store.values()) {
    if (ch.challengee && ch.challengeeResult) completed.push(ch);
  }
  completed.sort((a, b) =>
    (b.challengeeResult!.ts ?? 0) - (a.challengeeResult!.ts ?? 0),
  );
  return completed.slice(0, limit);
}

/** Most-lopsided victories — the "biggest spreads" angle. Returns
 *  challenges where the gap between the two sides is largest (in
 *  RATIO terms, not absolute months, so a 5/5 vs 0/5 outranks an
 *  11/12 vs 6/12). Drives the "笑死, 朋友被打到 0 月" share angle. */
export function listBiggestSpreadChallenges(limit = 10): Challenge[] {
  const completed = listLatestCompletedChallenges(5000);
  const scored = completed.map((ch) => {
    const c = ch.challengerResult;
    const e = ch.challengeeResult!;
    const cR = c.maxPossible > 0 ? c.compensationMonths / c.maxPossible : 0;
    const eR = e.maxPossible > 0 ? e.compensationMonths / e.maxPossible : 0;
    return { ch, spread: Math.abs(cR - eR) };
  });
  scored.sort((a, b) => b.spread - a.spread);
  return scored.slice(0, limit).map((x) => x.ch);
}

/** Helper to build a ChallengeParticipantInfo from a profile + display. */
export function infoFromProfile(opts: {
  userId: string;
  displayName?: string;
  archetype?: Pick<Archetype, 'id' | 'name' | 'emoji'> | null;
}): ChallengeParticipantInfo {
  return {
    userId: opts.userId,
    displayName: opts.displayName?.trim() || '员工',
    archetypeId: opts.archetype?.id,
    archetypeName: opts.archetype?.name,
    archetypeEmoji: opts.archetype?.emoji,
  };
}
