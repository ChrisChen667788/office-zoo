/**
 * v6.160 — 席位提示框状态机:旧轮迟到 prompt 不覆盖当前轮;终局清空。
 */
import { describe, it, expect } from 'vitest';
import {
  seatPromptReducer as r,
  initialSeatPromptState as init,
  type SeatPromptAction,
  type SeatPromptState,
} from '../seatPrompts';

const speech = (round: number, now = 1000): SeatPromptAction =>
  ({ type: 'prompt', playerId: 'p1', kind: 'speech', timeoutMs: 45_000, round, now });
const vote = (round: number, candidates = ['p2', 'p3']): SeatPromptAction =>
  ({ type: 'prompt', playerId: 'p1', kind: 'vote', timeoutMs: 30_000, round, candidates, now: 1000 });

const run = (...actions: SeatPromptAction[]): SeatPromptState => actions.reduce(r, init);

describe('seat_prompt 回合号守卫', () => {
  it('接受新一轮的发言 prompt,expiresAt = now + timeoutMs', () => {
    const s = run({ type: 'sync_round', round: 1 }, speech(1, 5000));
    expect(s.speech).toMatchObject({ round: 1, expiresAt: 50_000, submitted: false });
  });

  it('上一轮的发言 prompt 晚到,不覆盖当前轮', () => {
    const s = run(speech(3), speech(2));
    expect(s.speech?.round).toBe(3);
  });

  it('本轮 prompt 还没到、上一轮的先迟到:低于 game:state 当前回合的丢弃', () => {
    const s = run({ type: 'sync_round', round: 4 }, speech(3));
    expect(s.speech).toBeNull();
  });

  it('同一轮重复到达不会把已提交的提示框重置成未提交', () => {
    const s = run(speech(2), { type: 'submitted', kind: 'speech' }, speech(2));
    expect(s.speech).toMatchObject({ round: 2, submitted: true });
  });

  it('超时清掉提示框后,同轮/旧轮 prompt 迟到也不会复活', () => {
    const s = run(speech(2), { type: 'timeout', kind: 'speech' }, speech(2), speech(1));
    expect(s.speech).toBeNull();
    expect(s.timeoutMsg).toContain('发言');
  });

  it('投票同理,并且发言与投票的回合记录互不干扰', () => {
    const s = run(speech(5), vote(5), vote(4, ['x']));
    expect(s.vote).toMatchObject({ round: 5, candidates: ['p2', 'p3'] });
    expect(s.speech?.round).toBe(5);
  });

  it('未知 kind 忽略', () => {
    const s = run({ type: 'prompt', playerId: 'p1', kind: 'night', timeoutMs: 1, round: 9, now: 0 });
    expect(s).toEqual(init);
  });
});

describe('终局 / 退座 / 换局', () => {
  it('game_over 清空发言框、投票框和超时提示', () => {
    const s = run(speech(2), vote(2), { type: 'timeout', kind: 'vote' }, speech(3), { type: 'game_over' });
    expect(s.speech).toBeNull();
    expect(s.vote).toBeNull();
    expect(s.timeoutMsg).toBeNull();
  });

  it('退座(clear)清空提示框和超时提示,但保留回合记录,旧 prompt 迟到不复活', () => {
    const s = run(speech(2), { type: 'timeout', kind: 'vote' }, { type: 'clear' }, speech(2));
    expect(s.speech).toBeNull();
    expect(s.timeoutMsg).toBeNull();
  });

  it('换局(reset)后新一局的第 1 轮 prompt 能正常出现', () => {
    const s = run({ type: 'sync_round', round: 7 }, speech(7), { type: 'reset' }, { type: 'sync_round', round: 1 }, speech(1));
    expect(s.speech?.round).toBe(1);
  });
});

describe('提交回执与超时提示', () => {
  it('submitted 只标记对应 kind', () => {
    const s = run(speech(1), vote(1), { type: 'submitted', kind: 'vote' });
    expect(s.vote?.submitted).toBe(true);
    expect(s.speech?.submitted).toBe(false);
  });

  it('没有提示框时 submitted 不凭空造一个', () => {
    expect(run({ type: 'submitted', kind: 'speech' }).speech).toBeNull();
  });

  it('dismiss_timeout 只关提示,不动提示框', () => {
    const s = run(speech(1), { type: 'timeout', kind: 'vote' }, { type: 'dismiss_timeout' });
    expect(s.timeoutMsg).toBeNull();
    expect(s.speech?.round).toBe(1);
  });
});
