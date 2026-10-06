/**
 * v6.160 — 真人席位提示框状态机(纯函数,Classic.tsx 用 useReducer 驱动)。
 *
 * 修集成审查确认的两处问题:
 *  - 迟到的旧轮 `game:seat_prompt` 覆盖当前轮:引擎每轮只发一次发言 prompt + 一次投票
 *    prompt(GameEngine 主循环 round++ 后各跑一次 runDiscussion / runVoting),所以同一 kind
 *    只接受回合号严格大于已见过的;再跟 `game:state` 同步来的当前回合比,低于当前回合的
 *    一律丢弃(覆盖"本轮 prompt 还没到、上一轮的先迟到"的情况)。
 *  - `game:over` 后提示框残留:终局一次清空发言框、投票框和超时提示。
 *
 * `now` 由调用方传入,保持纯函数便于单测。
 */

export interface SeatSpeechPrompt {
  playerId: string;
  kind: 'speech';
  timeoutMs: number;
  round: number;
  expiresAt: number;
  submitted: boolean;
}

export interface SeatVotePrompt {
  playerId: string;
  kind: 'vote';
  candidates: string[];
  timeoutMs: number;
  round: number;
  expiresAt: number;
  submitted: boolean;
}

export interface SeatPromptState {
  speech: SeatSpeechPrompt | null;
  vote: SeatVotePrompt | null;
  timeoutMsg: string | null;
  /** 最近一次 game:state 里的回合号;0 = 还没收到。 */
  currentRound: number;
  /** 每个 kind 已接受过的最大回合号(超时/退座清空提示框后仍保留,用来挡重复和迟到)。 */
  lastRound: { speech: number; vote: number };
}

export const initialSeatPromptState: SeatPromptState = {
  speech: null,
  vote: null,
  timeoutMsg: null,
  currentRound: 0,
  lastRound: { speech: 0, vote: 0 },
};

export type SeatPromptAction =
  | {
      type: 'prompt';
      playerId: string;
      kind: string;
      timeoutMs: number;
      round: number;
      candidates?: string[];
      now: number;
    }
  | { type: 'submitted'; kind: 'speech' | 'vote' }
  | { type: 'timeout'; kind: string }
  | { type: 'dismiss_timeout' }
  | { type: 'sync_round'; round: number }
  /** 主动退座:提示框交还 AI。 */
  | { type: 'clear' }
  | { type: 'game_over' }
  /** 换局:连同回合记录一起清零。 */
  | { type: 'reset' };

/** 这条 prompt 是否已过期(旧轮迟到或同轮重复)。 */
export function isStaleSeatPrompt(
  state: Pick<SeatPromptState, 'currentRound' | 'lastRound'>,
  kind: 'speech' | 'vote',
  round: number,
): boolean {
  return round <= state.lastRound[kind] || round < state.currentRound;
}

export function seatPromptReducer(state: SeatPromptState, action: SeatPromptAction): SeatPromptState {
  switch (action.type) {
    case 'prompt': {
      if (action.kind !== 'speech' && action.kind !== 'vote') return state;
      if (isStaleSeatPrompt(state, action.kind, action.round)) return state;
      const base = {
        playerId: action.playerId,
        timeoutMs: action.timeoutMs,
        round: action.round,
        expiresAt: action.now + action.timeoutMs,
        submitted: false,
      };
      const lastRound = { ...state.lastRound, [action.kind]: action.round };
      return action.kind === 'speech'
        ? { ...state, lastRound, speech: { ...base, kind: 'speech' } }
        : { ...state, lastRound, vote: { ...base, kind: 'vote', candidates: action.candidates ?? [] } };
    }
    case 'submitted':
      if (action.kind === 'speech') {
        return state.speech ? { ...state, speech: { ...state.speech, submitted: true } } : state;
      }
      return state.vote ? { ...state, vote: { ...state.vote, submitted: true } } : state;
    case 'timeout':
      return {
        ...state,
        timeoutMsg: `⏰ 超时,第 ${action.kind === 'speech' ? '发言' : '投票'} 轮由 AI 代打`,
        speech: action.kind === 'speech' ? null : state.speech,
        vote: action.kind === 'vote' ? null : state.vote,
      };
    case 'dismiss_timeout':
      return { ...state, timeoutMsg: null };
    case 'sync_round':
      return action.round > state.currentRound ? { ...state, currentRound: action.round } : state;
    case 'clear':
      return { ...state, speech: null, vote: null };
    case 'game_over':
      return { ...state, speech: null, vote: null, timeoutMsg: null };
    case 'reset':
      return initialSeatPromptState;
    default:
      return state;
  }
}
