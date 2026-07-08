/**
 * v6.130 — Phase C 真人场边发言 · engine 级回归:
 * pushHumanSpeech 的 接收/署名格式化/滑窗/每轮每角色 cap/事件发射。
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../GameEngine';
import { HUMAN_SPEECH_PER_ROUND_CAP } from '@furball/shared';

function engine(): GameEngine {
  const e = new GameEngine(8);
  e.createPlayers();
  return e;
}
type AnyEngine = {
  humanSpeeches: string[];
  timeline: Array<{ type: string; description: string }>;
};
const inner = (e: GameEngine) => e as unknown as AnyEngine;

describe('engine — pushHumanSpeech', () => {
  it('接收合法发言:进滑窗(带角色署名)+ 时间线 + 发 human_speech 事件', () => {
    const e = engine();
    let emitted: unknown = null;
    e.on('human_speech', (d: unknown) => { emitted = d; });
    const r = e.pushHumanSpeech('union', '别欺负实习生');
    expect(r.accepted).toBe(true);
    expect(inner(e).humanSpeeches).toHaveLength(1);
    expect(inner(e).humanSpeeches[0]).toContain('真人工会代表');
    expect(inner(e).humanSpeeches[0]).toContain('别欺负实习生');
    expect(inner(e).timeline.some((t) => t.type === 'human_speech')).toBe(true);
    expect((emitted as { label: string }).label).toBe('工会代表');
  });

  it('空文本 / 未知角色拒收', () => {
    const e = engine();
    expect(e.pushHumanSpeech('hr', '   ').accepted).toBe(false);
    expect(e.pushHumanSpeech('boss' as never, 'x').accepted).toBe(false);
  });

  it('每轮每角色 cap:超过 HUMAN_SPEECH_PER_ROUND_CAP 拒收(不同角色互不影响)', () => {
    const e = engine();
    for (let i = 0; i < HUMAN_SPEECH_PER_ROUND_CAP; i++) {
      expect(e.pushHumanSpeech('hr', `发言 ${i}`).accepted).toBe(true);
    }
    const over = e.pushHumanSpeech('hr', '再来一条');
    expect(over.accepted).toBe(false);
    expect(over.reason).toBe('round_cap');
    // 另一个角色不受影响
    expect(e.pushHumanSpeech('lawyer', '法条提示').accepted).toBe(true);
  });

  it('滑窗 cap 6:老发言被挤出', () => {
    const e = engine();
    // 用两个角色绕过每轮 cap(3+3),再推第 7 条(换轮)
    for (let i = 0; i < 3; i++) e.pushHumanSpeech('hr', `hr${i}`);
    for (let i = 0; i < 3; i++) e.pushHumanSpeech('union', `un${i}`);
    e.state.round += 1; // 模拟进入下一轮,cap 重新计
    e.pushHumanSpeech('hr', '第七条');
    expect(inner(e).humanSpeeches).toHaveLength(6);
    expect(inner(e).humanSpeeches[0]).toContain('hr1'); // hr0 被挤出
    expect(inner(e).humanSpeeches[5]).toContain('第七条');
  });
});
