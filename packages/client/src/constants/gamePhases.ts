/**
 * gamePhases — v6.106(审计视觉 F-09)— 相位标签/图标/元素色的单一事实源。
 *
 * 之前 Classic.tsx(PHASE_NAMES)和 Immersive.tsx(PHASE_LABELS)各养一份完全相同的表,
 * 改一处漏一处迟早分叉;v6.98 的相位→米哈游元素色映射(PHASE_ELEMENT)也在两处重复。
 * 全部收编到这里,两端只 import。
 */
import { phaseIcons } from './icons';
import type { MihoyoElement } from './design';

export const GAME_PHASES: Record<string, { label: string; emoji: string; icon: string }> = {
  lobby:       { label: '待入职',   emoji: '⏳', icon: phaseIcons.lobby },
  role_reveal: { label: '岗位分配', emoji: '📋', icon: phaseIcons.role_reveal },
  free_roam:   { label: '日常搬砖', emoji: '💼', icon: phaseIcons.free_roam },
  meeting:     { label: '紧急全员会', emoji: '🚨', icon: phaseIcons.meeting },
  discussion:  { label: '职场撕逼', emoji: '🔥', icon: phaseIcons.discussion },
  voting:      { label: '投票裁员', emoji: '🗳️', icon: phaseIcons.voting },
  vote_result: { label: '裁员结果', emoji: '⚖️', icon: phaseIcons.vote_result },
  game_over:   { label: '散伙饭',   emoji: '🏆', icon: phaseIcons.game_over },
};

/** v6.98 — 相位→米哈游元素色:冷蓝待机 → 红全员会 → 粉撕逼 → 金投票,随节奏换气氛。 */
export const PHASE_ELEMENT: Record<string, MihoyoElement> = {
  lobby:       'frost',
  role_reveal: 'stigma',
  free_roam:   'aurora',
  meeting:     'inferno',
  discussion:  'void',
  voting:      'solar',
  vote_result: 'inferno',
  game_over:   'solar',
};
