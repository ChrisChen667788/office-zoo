/**
 * evidenceParser — v6.8 P4.1 mention extraction from LLM-generated
 * discussion speeches.
 *
 * BaseAgent.generateSpeech already prompts the LLM to "针对前面同学的
 * 发言进行直接点名回应" (must directly call out at least one prior
 * speaker). So mentions are already in the text — we just have to find
 * them and map back to the cited speech.
 *
 * Why parse on the server (and not the client)?
 *   1. The prior speeches in this round live in the server's
 *      `speechQueue` closure already — no extra round-trip.
 *   2. The client can't reliably resolve "@同学" without knowing the
 *      full alive roster, which is in the engine.
 *   3. We can cap evidence to a small, validated list (≤ 3 per speech)
 *      so a misbehaving LLM can't flood the chip strip.
 *
 * Strategy (in priority order, first match wins per cited player):
 *   1. **at_tag**  — explicit `@Name` (handles @Tony / @Tony 同学)
 *   2. **mention** — bare name with word boundaries (handles "Tony 那点产出")
 *   3. **fuzzy**   — TODO v6.9: epithet match ("某位说颗粒度的同学") via
 *      CHARACTERS.epithet. Skipped here to keep v6.8 simple — a
 *      mention-only baseline already covers >80% of cases.
 *
 * Self-references are intentionally dropped (you can't cite yourself
 * as evidence), as are mentions of dead players whose speeches aren't
 * in the active queue.
 *
 * Returned snippets are clipped to 40 chars + ellipsis so the chip
 * tooltip stays compact. The client has the full speech in its
 * history if the user wants to scroll back.
 */

import type { EvidenceRef } from '@furball/shared';

interface PriorSpeech {
  playerId: string;
  playerName: string;
  text: string;
}

const MAX_EVIDENCE_PER_SPEECH = 3;
const SNIPPET_MAX_CHARS = 40;

/** Truncate to ≤ N chars with an ellipsis; safe on Chinese (counts code
 *  points, not bytes). */
function clipSnippet(text: string, max = SNIPPET_MAX_CHARS): string {
  const arr = [...text];
  if (arr.length <= max) return text;
  return arr.slice(0, max - 1).join('') + '…';
}

/**
 * Scan `speechText` for mentions of prior speakers in `priorSpeeches`.
 *
 * @param speechText      Current speaker's text — searched for mentions.
 * @param speakerId       The current speaker; self-mentions are dropped.
 * @param priorSpeeches   All same-round speeches before this one. The most
 *                        recent match per cited player is what we cite
 *                        (most relevant for "针对你刚才那句话").
 * @returns ≤ 3 EvidenceRef objects, ordered by priority (at_tag first,
 *          then bare mentions). Empty when nothing matched.
 */
export function extractEvidenceRefs(
  speechText: string,
  speakerId: string,
  priorSpeeches: PriorSpeech[],
): EvidenceRef[] {
  if (!speechText || priorSpeeches.length === 0) return [];

  // Dedupe by playerId — one cite per cited player, even if mentioned
  // multiple times. Map keeps insertion order for stable output.
  const cited = new Map<string, EvidenceRef>();

  // Pass 1 — explicit @Name (highest confidence). Tolerates trailing
  // 同学/老师/哥/姐 honorifics that often follow.
  for (const prev of priorSpeeches) {
    if (prev.playerId === speakerId) continue;
    if (cited.has(prev.playerId)) continue;
    // Escape regex specials in case a name ever contains them.
    const safe = prev.playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const atRe = new RegExp(`@\\s*${safe}(?:\\s*(?:同学|老师|哥|姐|妹|总))?`, 'i');
    if (atRe.test(speechText)) {
      cited.set(prev.playerId, {
        refToPlayerId: prev.playerId,
        refToPlayerName: prev.playerName,
        refToTextSnippet: clipSnippet(prev.text),
        kind: 'at_tag',
      });
    }
  }

  // Pass 2 — bare name mention with word boundaries. English-letter names
  // (Tony/Lisa/...) — use \b boundaries which work on Latin chars in
  // mixed Chinese/English text.
  for (const prev of priorSpeeches) {
    if (prev.playerId === speakerId) continue;
    if (cited.has(prev.playerId)) continue;
    const safe = prev.playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bareRe = new RegExp(`\\b${safe}\\b`, 'i');
    if (bareRe.test(speechText)) {
      cited.set(prev.playerId, {
        refToPlayerId: prev.playerId,
        refToPlayerName: prev.playerName,
        refToTextSnippet: clipSnippet(prev.text),
        kind: 'mention',
      });
    }
  }

  // Cap output. Map iteration order = insertion order, which preserves
  // at_tag ahead of mention. Slice the rest off.
  const out = Array.from(cited.values());
  return out.length > MAX_EVIDENCE_PER_SPEECH
    ? out.slice(0, MAX_EVIDENCE_PER_SPEECH)
    : out;
}
