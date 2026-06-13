/**
 * packMemoryFormat — pure formatting for cross-game 公司主题包 memory
 * (v6.51 P1). NO fs / NO game-engine imports, so the whole module is
 * unit-testable without spinning up a game or touching disk.
 *
 * The companion store (packMemoryStore) persists one `PackGameMemory` per
 * finished game keyed by packId. This module turns a pack's recent game
 * history into a per-NPC system-prompt snippet, so a company-pack NPC
 * carries grudges/loyalties across games ("上一局你把我票出去了" energy)
 * instead of every game being a blank slate.
 *
 * Design notes:
 *   - We only encode survived-vs-eliminated + winning faction per game.
 *     That's fully derivable from the final game state (no need to
 *     instrument every elimination site) and already enough for cross-game
 *     drama. Per-vote "who betrayed whom" is a future enrichment.
 *   - The snippet tells the NPC to *act on* the history without breaking
 *     character by literally narrating "我记得上一局" (which reads as the
 *     model leaking its own memory plumbing).
 */
import { WinCondition } from '@furball/shared';

/** One finished game's outcome, from the pack's point of view. Persisted
 *  by packMemoryStore; defined here so the pure module owns the shape and
 *  the store/tests import it without pulling in fs. */
export interface PackGameMemory {
  /** Unix ms when the game ended. */
  ts: number;
  /** Human-readable winning faction, see summarizeWinner(). */
  winnerLabel: string;
  /** NPC display names still alive at GAME_OVER. */
  survivors: string[];
  /** NPC display names eliminated by GAME_OVER. */
  eliminated: string[];
  /** All NPC display names that played this game (survivors ∪ eliminated). */
  roster: string[];
}

/** How many past games to surface to an NPC (newest first). Keeps the
 *  prompt bounded — older grudges fade. */
export const MAX_PACK_RECALL = 3;

const WINNER_LABELS: Record<WinCondition, string> = {
  [WinCondition.CAT_WIN]: '资本家(管理层)',
  [WinCondition.DOG_WIN]: '打工人',
  [WinCondition.NEUTRAL_WIN]: '摸鱼人',
  // v6.85 P2 — 双公司模式终局
  [WinCondition.COMPANY_A_WIN]: 'A 公司',
  [WinCondition.COMPANY_B_WIN]: 'B 公司',
  [WinCondition.NONE]: '未分胜负',
};

/** Map a WinCondition to the faction label used in memory snippets. */
export function summarizeWinner(winner: WinCondition): string {
  return WINNER_LABELS[winner] ?? '未分胜负';
}

/**
 * Build the cross-game memory snippet for one NPC, or '' when there's
 * nothing relevant (no history, or this NPC never appeared in it).
 *
 * @param npcName   The NPC's display name as it appears in pack rosters.
 * @param memories  This pack's game history, oldest-first (as stored).
 */
export function formatPackMemoryForNpc(
  npcName: string,
  memories: PackGameMemory[] | undefined,
): string {
  if (!memories || memories.length === 0) return '';

  // Only games this NPC actually played, newest first, capped.
  const played = memories
    .filter((g) => g.roster?.includes(npcName))
    .slice(-MAX_PACK_RECALL)
    .reverse();
  if (played.length === 0) return '';

  const whenLabels = ['最近一局', '上一局', '更早一局'];
  const lines = played.map((g, i) => {
    const survived = g.survivors.includes(npcName);
    const fate = survived ? '你活到了最后' : '你那局被裁了';
    return `· ${whenLabels[i] ?? '更早'}: ${fate},赢家是${g.winnerLabel}阵营。`;
  });

  return [
    `【跨局恩怨 · 公司主题包】你和这帮同事在这个主题包里交过 ${played.length} 次手:`,
    ...lines,
    '带着这些旧账进这一局 —— 可以记仇、记恩、翻旧账暗示对手,但别出戏地直说"我记得上一局"。',
  ].join('\n');
}
