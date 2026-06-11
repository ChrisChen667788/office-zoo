/**
 * v6.83 — GameEngine.applyIntervention 白盒回归(观众筹码干预生效点)。
 * 纯道具经济在 shared/intervene.test.ts;夜杀矩阵在 roleAbilities.test.ts;
 * 这里锁 engine 层:校验/状态落点/时间线事件/一次性语义。
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../GameEngine';

function fresh(): GameEngine {
  const e = new GameEngine(8);
  e.createPlayers();
  return e;
}
const timelineOf = (e: GameEngine) =>
  (e as unknown as { timeline: Array<{ type: string; description: string }> }).timeline;

describe('GameEngine.applyIntervention', () => {
  it('shield:挂上保护 + 时间线落 intervene;重复挂被拒(shield_active)', () => {
    const e = fresh();
    const target = e.state.players[2];
    const r1 = e.applyIntervention('shield', target.id);
    expect(r1.accepted).toBe(true);
    expect((e as unknown as { interventionShieldId: string | null }).interventionShieldId).toBe(target.id);
    expect(timelineOf(e).some((t) => t.type === 'intervene' && t.description.includes(target.name))).toBe(true);

    const r2 = e.applyIntervention('shield', e.state.players[3].id);
    expect(r2).toEqual({ accepted: false, reason: 'shield_active' });
  });

  it('shield/spotlight:目标无效(不存在/已死)被拒', () => {
    const e = fresh();
    expect(e.applyIntervention('shield', 'nope').accepted).toBe(false);
    const dead = e.state.players[4];
    dead.isAlive = false;
    expect(e.applyIntervention('spotlight', dead.id)).toEqual({ accepted: false, reason: 'invalid_target' });
  });

  it('clue:无需目标,时间线落一条 🔍 线索(指名在场某鼠)', () => {
    const e = fresh();
    const r = e.applyIntervention('clue');
    expect(r.accepted).toBe(true);
    const ev = timelineOf(e).find((t) => t.type === 'intervene' && t.description.includes('🔍'));
    expect(ev).toBeTruthy();
    expect(e.state.players.some((p) => ev!.description.includes(p.name))).toBe(true);
  });

  it('spotlight:加进待消费集合(取走即消费的集合语义)', () => {
    const e = fresh();
    const target = e.state.players[1];
    expect(e.applyIntervention('spotlight', target.id).accepted).toBe(true);
    const ids = (e as unknown as { spotlightIds: Set<string> }).spotlightIds;
    expect(ids.has(target.id)).toBe(true);
    expect(ids.delete(target.id)).toBe(true);  // 模拟 speech 站点消费
    expect(ids.has(target.id)).toBe(false);    // 一次性
  });

  it('game_over 后一律拒绝', () => {
    const e = fresh();
    (e.state as { phase: string }).phase = 'game_over';
    expect(e.applyIntervention('clue')).toEqual({ accepted: false, reason: 'game_over' });
  });
});
