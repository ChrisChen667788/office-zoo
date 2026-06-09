/**
 * highlightPicker — pure function. Given a finished game's logs, picks the
 * top 3 most "shareable" moments to feed into the viral video exporter.
 *
 * Why a separate module:
 *   - Pure → easy to unit test, no React/canvas dep
 *   - Reusable from a future server-side video pipeline (Phase A v0.4.0)
 *   - Scoring rules are the design surface that will iterate the most;
 *     keeping them in one file means we can A/B-test "what counts as good
 *     content" without touching the renderer
 *
 * Scoring philosophy (April 2026 baseline — tune as we learn what gets
 * traction on B 站 / 抖音):
 *   - Real eliminations beat random speeches (stakes >> chatter)
 *   - Speeches with @-mentions are more "soap opera" — pick those over
 *     monologues
 *   - Aria-style 阿里黑话 keywords add comedy (我们的brand voice)
 *   - End-of-game / round-N highlights weighted higher than early ones
 *     because viewers want the climax
 */

import type {
  EliminationLogEntry,
  GamePlayer,
  PredictionLogEntry,
} from '../stores/gameStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HighlightKind =
  | 'kill'           // Dog 在某房间"优化"了某 cat
  | 'vote_eject'     // 集体投票开除一个人
  | 'roast'          // 某发言极有戏 (长 + @ + 黑话)
  | 'reversal'       // 你押 X, 实际 Y (PredictionBar 看走眼)
  | 'perfect_bluff'  // v6.73 卧底全程没露馅,赢到最后
  | 'comeback'       // v6.73 赢家阵营折损过半还翻盘
  | 'bloodbath'      // v6.73 一回合多人出局,腥风血雨
  | 'finale';        // 终局阵营揭晓

export interface SpeechRecord {
  playerId: string;
  playerName: string;
  text: string;
  role?: string;
  team?: 'cat' | 'dog' | 'neutral';
  /** Round it was spoken in — used to weight late-game speeches higher. */
  round?: number;
}

export interface Highlight {
  kind: HighlightKind;
  /** 0..100 — used for ranking only, not shown in UI. */
  score: number;
  /** Player at the centre of this moment. */
  playerId?: string;
  playerName?: string;
  role?: string;
  team?: 'cat' | 'dog' | 'neutral';
  /** Headline shown in big text on the share card. */
  headline: string;
  /** Optional body text — speech bubble, location, etc. */
  body?: string;
  /** Round this happened in (for the "R{n}" ribbon). */
  round?: number;
  /** v0.3.1+ — LLM-generated punchy short title (≤22 chars). When present
   *  the video render uses this above the headline as the bigger eye-catcher. */
  caption?: string;
}

export interface HighlightPickInput {
  players: GamePlayer[];
  eliminationLog: EliminationLogEntry[];
  speeches: SpeechRecord[];
  /** Final winner team — drives the finale slide. */
  winner?: 'cat' | 'dog' | 'neutral' | string;
  /** Total rounds played (for late-weight scoring). */
  totalRounds: number;
  /** v6.73 — 观众的预测记录。用来挖"反转/看走眼"名场面(押 X 结果 Y)。 */
  predictionLog?: PredictionLogEntry[];
}

// ---------------------------------------------------------------------------
// Scoring constants — tunable. All speeches/eliminations score independently
// then we sort + slice top N.
// ---------------------------------------------------------------------------

const KILL_BASE_SCORE = 65;
const VOTE_EJECT_BASE_SCORE = 60;
const SPEECH_BASE_SCORE = 25;
/** "@" mention or "@同学" pattern — speech feels like targeted drama. */
const SPEECH_AT_MENTION_BONUS = 12;
/** Each 阿里黑话 keyword hit (capped at 3) adds comedy weight. */
const SPEECH_JARGON_PER_KEYWORD = 4;
const SPEECH_JARGON_CAP = 12;
/** Bonus for speeches in the final third of the game (climax bias). */
const LATE_GAME_BONUS = 10;

// v6.73 — 高戏剧性名场面的基础分(故意压过普通 kill 65 / vote 60,让它们冒头)
const PERFECT_BLUFF_SCORE = 82; // 卧底全程没露馅,最炸
const COMEBACK_SCORE = 76;      // 折损过半还翻盘
const REVERSAL_SCORE = 70;      // 观众看走眼(押错)
const BLOODBATH_SCORE = 68;     // 一回合多杀

const ALI_JARGON = [
  '赋能', '拉通', '对齐', '打透', '沉淀', '闭环', '对焦', '梭哈', '破局',
  '颗粒度', '底层逻辑', '抓手', '链路', '心智', '势能', '基本盘', '主航道',
  'OKR', 'KPI', '体感', '复盘', '同学',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pick up to `count` highlights, sorted by descending score.
 * Always returns a `finale` highlight last so the video has a closer.
 *
 * Default `count` = 3 because that's what the v0.3.0 video template renders.
 * Pass a different number for future longer/shorter templates.
 */
export function pickHighlights(
  input: HighlightPickInput,
  count = 3,
): Highlight[] {
  const all: Highlight[] = [
    ...scoreEliminations(input.eliminationLog, input.totalRounds),
    ...scoreSpeeches(input.speeches, input.totalRounds),
    // v6.73 — 高戏剧性名场面(从已有日志推断,无需新数据)
    ...scoreReversals(input.predictionLog ?? [], input.totalRounds),
    ...detectPerfectBluff(input),
    ...detectComeback(input),
    ...detectBloodbath(input.eliminationLog),
  ];

  // Stable sort by score desc — `Array.prototype.sort` is stable in modern JS.
  all.sort((a, b) => b.score - a.score);

  // Dedupe by playerId so we don't end up with three Frank moments.
  const seenPlayers = new Set<string>();
  const picked: Highlight[] = [];
  for (const h of all) {
    if (picked.length >= count) break;
    if (h.playerId && seenPlayers.has(h.playerId)) continue;
    if (h.playerId) seenPlayers.add(h.playerId);
    picked.push(h);
  }

  // Always append a finale frame so the video has an ending — even if
  // the game had zero eliminations / speeches (shouldn't happen, but
  // defensive for early phases / dev mode).
  const finale = buildFinale(input);
  if (finale) picked.push(finale);

  return picked;
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function scoreEliminations(
  log: EliminationLogEntry[],
  totalRounds: number,
): Highlight[] {
  return log.map((e): Highlight => {
    const base = e.type === 'kill' ? KILL_BASE_SCORE : VOTE_EJECT_BASE_SCORE;
    const lateBonus = roundLateBonus(e.round, totalRounds);
    const score = base + lateBonus;
    const headline = e.type === 'kill'
      ? `${e.playerName} 在 ${e.location ?? '某处'} 被"优化"了`
      : `${e.playerName} 被全员投票开除`;
    const body = e.role
      ? `身份揭晓:${e.role}`
      : undefined;
    return {
      kind: e.type === 'kill' ? 'kill' : 'vote_eject',
      score,
      playerId: e.playerId,
      playerName: e.playerName,
      role: e.role,
      team: e.team,
      headline,
      body,
      round: e.round,
    };
  });
}

function scoreSpeeches(
  speeches: SpeechRecord[],
  totalRounds: number,
): Highlight[] {
  return speeches
    .map((s): Highlight => {
      const len = s.text?.length ?? 0;
      // Length contributes — but only up to 100 chars, then diminishing.
      const lenScore = Math.min(len, 100) * 0.15;
      const atBonus = /@/.test(s.text) ? SPEECH_AT_MENTION_BONUS : 0;
      // Count distinct jargon keywords hit (max SPEECH_JARGON_CAP).
      const jargonHits = new Set<string>();
      for (const kw of ALI_JARGON) {
        if (s.text.includes(kw)) jargonHits.add(kw);
      }
      const jargonScore = Math.min(
        jargonHits.size * SPEECH_JARGON_PER_KEYWORD,
        SPEECH_JARGON_CAP,
      );
      const lateBonus = roundLateBonus(s.round, totalRounds);
      const score = SPEECH_BASE_SCORE + lenScore + atBonus + jargonScore + lateBonus;

      // Trim very long speeches to a quotable lede (~80 chars + ellipsis).
      const quotable = len > 80 ? s.text.slice(0, 80).trim() + '…' : s.text;
      return {
        kind: 'roast',
        score,
        playerId: s.playerId,
        playerName: s.playerName,
        role: s.role,
        team: s.team,
        headline: `${s.playerName} 开炮:`,
        body: quotable,
        round: s.round,
      };
    })
    // Drop trivially-short speeches — "好的同学" isn't a highlight.
    .filter((h) => (h.body?.length ?? 0) >= 16);
}

function roundLateBonus(
  round: number | undefined,
  totalRounds: number,
): number {
  if (!round || !totalRounds) return 0;
  // Last third of the game gets the full bonus, scaled linearly.
  const ratio = Math.max(0, Math.min(1, round / Math.max(1, totalRounds)));
  return ratio > 0.66 ? LATE_GAME_BONUS : Math.round(LATE_GAME_BONUS * ratio * 0.6);
}

// v6.73 — 观众押错 →「反转/看走眼」名场面。每条押错的预测出一帧,排序决定取哪条。
function scoreReversals(log: PredictionLogEntry[], totalRounds: number): Highlight[] {
  return log
    .filter((p) => !p.correct && p.actualName && p.pickName)
    .map((p): Highlight => ({
      kind: 'reversal',
      score: REVERSAL_SCORE + roundLateBonus(p.round, totalRounds),
      headline: '你看走眼了',
      body: `押的是 ${p.pickName},结果出局的是 ${p.actualName}`,
      round: p.round,
    }));
}

// v6.73 — 卧底(资本家 dog)活到最后、全程没被票出 + 阵营赢 = 完美伪装。
function detectPerfectBluff(input: HighlightPickInput): Highlight[] {
  if (input.winner !== 'dog') return [];
  const ejected = new Set(input.eliminationLog.map((e) => e.playerId));
  const survivor = input.players.find((p) => p.isAlive && p.team === 'dog' && !ejected.has(p.id));
  if (!survivor) return [];
  return [{
    kind: 'perfect_bluff',
    score: PERFECT_BLUFF_SCORE,
    playerId: survivor.id,
    playerName: survivor.name,
    team: 'dog',
    headline: `${survivor.name} 全程没露馅`,
    body: '资本家卧底,演到最后赢麻了',
    round: input.totalRounds,
  }];
}

// v6.73 — 赢家阵营折损 ≥2 且 ≥ 对家折损 = 绝地翻盘。
function detectComeback(input: HighlightPickInput): Highlight[] {
  const w = input.winner;
  if (!w || w === 'none' || w === 'neutral') return [];
  let winLost = 0, foeLost = 0;
  for (const e of input.eliminationLog) {
    if (e.team === w) winLost++;
    else if (e.team) foeLost++;
  }
  if (winLost < 2 || winLost < foeLost) return [];
  const label = w === 'cat' ? '打工人' : w === 'dog' ? '资本家' : String(w);
  return [{
    kind: 'comeback',
    score: COMEBACK_SCORE,
    team: w as 'cat' | 'dog' | 'neutral',
    headline: '绝地翻盘',
    body: `${label}折损 ${winLost} 人还是赢了`,
    round: input.totalRounds,
  }];
}

// v6.73 — 同一回合 ≥2 人出局 = 腥风血雨。取出局最多的那个回合。
function detectBloodbath(log: EliminationLogEntry[]): Highlight[] {
  const byRound = new Map<number, EliminationLogEntry[]>();
  for (const e of log) {
    const arr = byRound.get(e.round) ?? [];
    arr.push(e);
    byRound.set(e.round, arr);
  }
  let best: { round: number; entries: EliminationLogEntry[] } | null = null;
  for (const [round, entries] of byRound) {
    if (entries.length >= 2 && (!best || entries.length > best.entries.length)) {
      best = { round, entries };
    }
  }
  if (!best) return [];
  return [{
    kind: 'bloodbath',
    score: BLOODBATH_SCORE,
    headline: `第 ${best.round} 回合 · 腥风血雨`,
    body: `${best.entries.length} 人同时出局:${best.entries.map((e) => e.playerName).join('、')}`,
    round: best.round,
  }];
}

function buildFinale(input: HighlightPickInput): Highlight | null {
  const team = input.winner;
  if (!team || team === 'none') {
    return {
      kind: 'finale',
      score: 0,
      headline: '散伙饭',
      body: '本局结束 · 没有赢家,只有打工人',
      round: input.totalRounds,
    };
  }
  const label =
    team === 'cat'     ? '打工人胜利'
  : team === 'dog'     ? '资本家胜利'
  : team === 'neutral' ? '摸鱼党胜利'
  : `${team} 胜利`;
  const survivors = input.players.filter((p) => p.isAlive).map((p) => p.name);
  return {
    kind: 'finale',
    score: 0,
    headline: label,
    body: survivors.length
      ? `幸存:${survivors.join(' / ')}`
      : '全员阵亡',
    team: team as 'cat' | 'dog' | 'neutral',
    round: input.totalRounds,
  };
}
