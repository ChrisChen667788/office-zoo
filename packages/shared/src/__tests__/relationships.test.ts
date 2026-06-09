/**
 * v6.75 — AI 记忆关系网纯引擎回归:情绪边累积/封顶 · 记仇记恩档 · 投票针对/抱团 ·
 * 旧账嘴替 · 从投票结果/终局派生事件(含 backstab 同阵营叛变)。
 */
import { describe, it, expect } from 'vitest';
import {
  relationDelta, emptyGraph, applyEvent, applyEvents, bondTier, feelingOf, edgeOf,
  strongestGrudge, strongestBond, topEdges, allEdges, grudgeTaunt, bondNod,
  eventsFromVoteResult, eventsFromGameEnd, resolveVoteWithGrudge, topFeuds, WEEK_MS,
  EDGE_CAP, GRUDGE_THRESHOLD, BOND_THRESHOLD, FOE_VOTE_THRESHOLD,
  type RelationEvent, type RelationEdge,
} from '../memory/relationships';

const ev = (over: Partial<RelationEvent> = {}): RelationEvent => ({
  actorId: 'a', subjectId: 'b', kind: 'voted_out', gameId: 'g1', round: 1, ts: 1, ...over,
});

describe('relationships — applyEvent 累积 + 方向', () => {
  it('voted_out:被投者(subject)记投票者(actor)的仇 = 负分边 subject→actor', () => {
    const g = applyEvent(emptyGraph(), ev({ actorId: 'tony', subjectId: 'lisa', kind: 'voted_out' }));
    expect(feelingOf(g, 'lisa', 'tony')).toBe(relationDelta('voted_out')); // lisa 记 tony
    expect(feelingOf(g, 'tony', 'lisa')).toBe(0);                          // 反向不动
  });
  it('多次同向累积,封顶在 -EDGE_CAP', () => {
    let g = emptyGraph();
    for (let i = 0; i < 10; i++) g = applyEvent(g, ev({ actorId: 't', subjectId: 'l', kind: 'voted_out' }));
    expect(feelingOf(g, 'l', 't')).toBe(-EDGE_CAP);
    expect(edgeOf(g, 'l', 't')!.count).toBe(10);
  });
  it('记恩抵消记仇(saved 拉回正)', () => {
    let g = applyEvent(emptyGraph(), ev({ actorId: 't', subjectId: 'l', kind: 'voted_out' })); // -32
    g = applyEvent(g, ev({ actorId: 't', subjectId: 'l', kind: 'saved' }));                    // +38
    expect(feelingOf(g, 'l', 't')).toBe(relationDelta('voted_out') + relationDelta('saved'));  // +6
  });
  it('自指事件忽略', () => {
    const g = applyEvent(emptyGraph(), ev({ actorId: 'x', subjectId: 'x' }));
    expect(allEdges(g)).toHaveLength(0);
  });
});

describe('relationships — bondTier', () => {
  it('分段:世仇/记仇/中立/交情/过命', () => {
    expect(bondTier(-80).tone).toBe('foe');
    expect(bondTier(GRUDGE_THRESHOLD).tone).toBe('cold');
    expect(bondTier(0).tone).toBe('neutral');
    expect(bondTier(BOND_THRESHOLD).tone).toBe('warm');
    expect(bondTier(80).tone).toBe('ally');
  });
});

describe('relationships — 投票针对 / 抱团', () => {
  it('strongestGrudge 选候选里最记仇的一只', () => {
    let g = emptyGraph();
    g = applyEvents(g, [
      ev({ actorId: 'mike', subjectId: 'me', kind: 'voted_out' }),  // -32
      ev({ actorId: 'bob', subjectId: 'me', kind: 'backstab' }),    // -45 ← 最狠
    ]);
    const worst = strongestGrudge(g, 'me', ['mike', 'bob', 'zoe']);
    expect(worst?.aboutId).toBe('bob');
    expect(strongestGrudge(g, 'me', ['zoe'])).toBeNull(); // 候选里没仇人
  });
  it('strongestBond 选候选里最罩着的一只', () => {
    const g = applyEvents(emptyGraph(), [
      ev({ actorId: 'amy', subjectId: 'me', kind: 'saved' }),       // +38
      ev({ actorId: 'amy', subjectId: 'me', kind: 'allied_win' }),  // +16 → 54
    ]);
    expect(strongestBond(g, 'me', ['amy', 'zoe'])?.aboutId).toBe('amy');
  });
});

describe('relationships — 旧账嘴替', () => {
  it('记仇关系才出 taunt,交情关系出 nod', () => {
    const foe = applyEvents(emptyGraph(), Array.from({ length: 3 }, () => ev({ actorId: 't', subjectId: 'l', kind: 'backstab' })));
    const foeEdge = edgeOf(foe, 'l', 't')!;
    expect(grudgeTaunt(foeEdge, 0)).toBeTruthy();
    expect(bondNod(foeEdge, 0)).toBe('');
    const ally = applyEvents(emptyGraph(), Array.from({ length: 3 }, () => ev({ actorId: 'a', subjectId: 'l', kind: 'saved' })));
    const allyEdge = edgeOf(ally, 'l', 'a')!;
    expect(bondNod(allyEdge, 0)).toBeTruthy();
    expect(grudgeTaunt(allyEdge, 0)).toBe('');
  });
  it('round 确定性选句(同 round 同句)', () => {
    const foe = applyEvent(emptyGraph(), ev({ actorId: 't', subjectId: 'l', kind: 'backstab' }));
    const e = edgeOf(foe, 'l', 't')!;
    expect(grudgeTaunt(e, 5)).toBe(grudgeTaunt(e, 5));
  });
});

describe('relationships — 从投票结果派生事件', () => {
  it('被开除者记住每个投他的人;同阵营投他=backstab', () => {
    const evs = eventsFromVoteResult({
      gameId: 'g1', round: 2, ts: 99,
      votes: { tony: 'lisa', mike: 'lisa', lisa: 'tony', zoe: 'bob' }, // tony+mike 投 lisa
      eliminatedArch: 'lisa',
      teamOf: { tony: 'cat', mike: 'dog', lisa: 'dog', zoe: 'cat', bob: 'cat' }, // mike 与 lisa 同队
    });
    // lisa 记 tony(voted_out)+ mike(backstab,同 dog);不记 zoe(没投 lisa)/不记自己
    const subjects = evs.map((e) => `${e.subjectId}<-${e.actorId}:${e.kind}`).sort();
    expect(subjects).toEqual(['lisa<-mike:backstab', 'lisa<-tony:voted_out']);
  });
  it('平票无人开除 → 投票不产生记仇;saved 产生记恩', () => {
    const evs = eventsFromVoteResult({
      gameId: 'g', round: 1, ts: 1, votes: { a: 'b', b: 'a' }, eliminatedArch: null,
      saved: { actorArch: 'doc', subjectArch: 'b' },
    });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ actorId: 'doc', subjectId: 'b', kind: 'saved' });
  });
  it('eventsFromGameEnd:同阵营赢家两两互记恩', () => {
    const evs = eventsFromGameEnd({ gameId: 'g', ts: 1, winnerArchs: ['a', 'b', 'c'] });
    // 3 人两两双向 → 3 对 × 2 = 6 条 allied_win
    expect(evs).toHaveLength(6);
    expect(evs.every((e) => e.kind === 'allied_win')).toBe(true);
    const g = applyEvents(emptyGraph(), evs);
    expect(feelingOf(g, 'a', 'b')).toBe(relationDelta('allied_win'));
    expect(feelingOf(g, 'b', 'a')).toBe(relationDelta('allied_win'));
  });
});

describe('relationships — topEdges 排序', () => {
  it('按 |score| 降序', () => {
    const g = applyEvents(emptyGraph(), [
      ev({ actorId: 'x', subjectId: 'me', kind: 'framed' }),    // -18
      ev({ actorId: 'y', subjectId: 'me', kind: 'backstab' }),  // -45
      ev({ actorId: 'z', subjectId: 'me', kind: 'saved' }),     // +38
    ]);
    expect(topEdges(g, 'me').map((e) => e.aboutId)).toEqual(['y', 'z', 'x']);
  });
});

describe('relationships — topFeuds(本周最毒世仇榜)', () => {
  const now = 1_000_000_000;
  const mk = (over: Partial<RelationEdge>): RelationEdge => ({
    holderId: 'h', aboutId: 'a', score: -70, count: 2, lastKind: 'backstab', lastGameId: 'g', lastTs: now, ...over,
  });
  it('只收记仇级 + 本周内,按最毒(score 升序)排', () => {
    const edges = [
      mk({ aboutId: 'mild', score: -30 }),                              // 记仇,本周
      mk({ aboutId: 'foe', score: -88 }),                               // 世仇,本周 ← 最毒
      mk({ aboutId: 'pal', score: 70 }),                                // 交情 → 排除
      mk({ aboutId: 'stale', score: -95, lastTs: now - WEEK_MS - 1 }),  // 够毒但过期 → 排除
    ];
    expect(topFeuds(edges, now, 3).map((e) => e.aboutId)).toEqual(['foe', 'mild']);
  });
  it('n 截断', () => {
    const edges = [mk({ aboutId: 'a', score: -90 }), mk({ aboutId: 'b', score: -80 }), mk({ aboutId: 'c', score: -70 })];
    expect(topFeuds(edges, now, 2)).toHaveLength(2);
  });
});

describe('relationships — resolveVoteWithGrudge(反哺投票)', () => {
  const foeGraph = applyEvents(emptyGraph(), [
    ev({ actorId: 'foe', subjectId: 'me', kind: 'backstab' }),  // -45
    ev({ actorId: 'foe', subjectId: 'me', kind: 'backstab' }),  // -90 → 世仇
    ev({ actorId: 'mild', subjectId: 'me', kind: 'voted_out' }), // -32 → 只记仇,不到世仇
  ]);
  it('候选里有世仇且没投他 → 改投世仇 + 甩旧账', () => {
    const r = resolveVoteWithGrudge({ basePick: 'mild', candidateIds: ['mild', 'foe', 'zoe'], graph: foeGraph, holderId: 'me', round: 0 });
    expect(r.pick).toBe('foe');
    expect(r.redirected).toBe(true);
    expect(r.taunt.length).toBeGreaterThan(0);
  });
  it('本就投世仇 → 不算改票,但认仇甩话', () => {
    const r = resolveVoteWithGrudge({ basePick: 'foe', candidateIds: ['mild', 'foe'], graph: foeGraph, holderId: 'me' });
    expect(r.pick).toBe('foe');
    expect(r.redirected).toBe(false);
    expect(r.foeId).toBe('foe');
  });
  it('只有普通记仇(未到世仇阈值)→ 不强改票', () => {
    const r = resolveVoteWithGrudge({ basePick: 'zoe', candidateIds: ['mild', 'zoe'], graph: foeGraph, holderId: 'me' });
    expect(r.pick).toBe('zoe');
    expect(r.redirected).toBe(false);
    expect(r.foeId).toBeNull();
  });
  it('世仇不在候选里 → 不动', () => {
    const r = resolveVoteWithGrudge({ basePick: 'zoe', candidateIds: ['zoe', 'mild'], graph: foeGraph, holderId: 'me' });
    expect(r.redirected).toBe(false);
    expect(FOE_VOTE_THRESHOLD).toBeLessThan(GRUDGE_THRESHOLD); // 世仇门槛比记仇更严
  });
});
