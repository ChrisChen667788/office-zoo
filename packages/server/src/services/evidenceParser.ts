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
 *   3. **fuzzy**   — v6.50: epithet / paraphrase bridge. When the speaker
 *      gestures at someone without naming them ("某位说颗粒度的同学"), mine
 *      the descriptor keyword ("颗粒度") out of the indirect clause and cite
 *      whichever prior speaker actually said it. Lowest confidence, runs
 *      last to fill in players the first two passes missed.
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

// ---- Pass 3 (fuzzy) epithet / paraphrase bridge ------------------------

/** Opener markers that begin an indirect reference to a prior speaker. */
const EPITHET_OPENERS =
  /(某位|某个|某人|有位|有个|有人|那位|那个|这位|这个|前面|前边|上面|楼上|刚才|刚刚|之前)/g;

/** Openers that *by themselves* denote a person (end in 人/位), so the
 *  clause is referential even without a trailing role-noun. */
const PERSON_OPENER = /(某位|某人|有位|有人|那位|这位)/;

/** A trailing role-noun ("…的同学") OR a "verb + descriptor + 的" shape
 *  ("提对齐的") confirms the clause points at a person, not a thing. */
const ROLE_NOUN = /(同学|同事|哥们|姐妹|朋友|老哥|老姐|大哥|大姐|兄弟|的人)/;
const VERB_DE_SHAPE = /[说讲提聊谈].{1,10}的/;

/** Structural words stripped from a clause to leave only content
 *  descriptors. Applied longest-first (see sort below) so "说到" is removed
 *  before "说". Deliberately excludes risky single chars like 对/和/跟 that
 *  live inside real keywords (对齐, 和谐). */
const EPITHET_FUNCTION_WORDS = [
  // openers
  '某位', '某个', '某人', '有位', '有个', '有人', '那位', '那个', '这位', '这个',
  '前面', '前边', '上面', '楼上', '刚才', '刚刚', '之前',
  // role nouns
  '同学', '同事', '哥们', '姐妹', '朋友', '老哥', '老姐', '大哥', '大姐', '兄弟', '的人',
  // verbs / connectors
  '说到', '讲到', '提到', '聊到', '谈到', '强调', '主张', '认为', '觉得', '表示',
  '说', '讲', '提', '聊', '谈', '一直',
  // particles
  '的', '了', '着', '过', '地', '得', '那', '这', '个', '位', '有',
].sort((a, b) => b.length - a.length);

/** Over-generic descriptors that would over-cite (almost every speech
 *  mentions 方案/问题/…) — drop them so fuzzy stays high-precision. */
const EPITHET_STOPWORDS = new Set([
  '方案', '项目', '问题', '事情', '东西', '想法', '意思', '观点', '看法', '意见',
  '建议', '团队', '大家', '公司', '工作', '内容', '情况', '时候', '地方', '部分', '方面',
]);

/**
 * Pull the descriptor keyword(s) out of any indirect-reference clauses in
 * `speechText`. "某位说颗粒度的同学" → `['颗粒度']`; "刚才那个提对齐的" →
 * `['对齐']`. Returns `[]` when the speech names nobody indirectly.
 *
 * Pure + dependency-light so it can be unit-tested without a game. The
 * caller (extractEvidenceRefs Pass 3) bridges each keyword to whichever
 * prior speaker actually uttered it.
 */
export function extractEpithetKeywords(speechText: string): string[] {
  if (!speechText) return [];
  const keywords: string[] = [];
  const seen = new Set<string>();

  EPITHET_OPENERS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EPITHET_OPENERS.exec(speechText)) !== null) {
    // Window from the opener to the next clause boundary, capped so a
    // run-on sentence can't drag in unrelated words.
    const window = speechText.slice(m.index, m.index + 18);
    const clause = window.split(/[,，。!?！？;；、\n]/)[0];

    const referential =
      PERSON_OPENER.test(clause) || ROLE_NOUN.test(clause) || VERB_DE_SHAPE.test(clause);
    if (!referential) continue;

    // The paraphrase head ends at the first 的 ("说颗粒度的[同学]") — anything
    // after it is trailing commentary ("…的也对"), not the descriptor. Clauses
    // with no 的 ("讲到向下兼容") keep their whole body.
    const head = clause.split('的')[0];
    let stripped = head;
    for (const fw of EPITHET_FUNCTION_WORDS) stripped = stripped.split(fw).join(' ');

    for (const tok of stripped.split(/\s+/)) {
      const kw = tok.trim();
      if (kw.length < 2) continue; // single char = too noisy to bridge on
      if (EPITHET_STOPWORDS.has(kw)) continue;
      if (seen.has(kw)) continue;
      seen.add(kw);
      keywords.push(kw);
    }
  }
  return keywords;
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

  // Pass 3 — fuzzy epithet / paraphrase bridge (lowest confidence). Only
  // runs when the speech gestures at someone indirectly ("某位说颗粒度的
  // 同学"); bridges the mined descriptor keyword to whoever actually said
  // it. Fills players the first two passes missed.
  const epithetKeywords = extractEpithetKeywords(speechText);
  if (epithetKeywords.length > 0) {
    for (const prev of priorSpeeches) {
      if (prev.playerId === speakerId) continue;
      if (cited.has(prev.playerId)) continue;
      if (epithetKeywords.some((kw) => prev.text.includes(kw))) {
        cited.set(prev.playerId, {
          refToPlayerId: prev.playerId,
          refToPlayerName: prev.playerName,
          refToTextSnippet: clipSnippet(prev.text),
          kind: 'fuzzy',
        });
      }
    }
  }

  // Cap output. Map iteration order = insertion order, which preserves
  // at_tag ahead of mention ahead of fuzzy. Slice the rest off.
  const out = Array.from(cited.values());
  return out.length > MAX_EVIDENCE_PER_SPEECH
    ? out.slice(0, MAX_EVIDENCE_PER_SPEECH)
    : out;
}
