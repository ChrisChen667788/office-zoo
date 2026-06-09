/**
 * v6.77 ① — 关系网反哺投票「真 engine 集成」回归。
 *
 * v6.76 把 resolveVoteWithGrudge(纯函数)接进了 GameEngine.runVoting,但当时只用 throwaway
 * 脚本验过 store 往返,没有持久回归。这里跑真引擎:freshEngine → createPlayers(拿到真 archetype)
 * → 往 relationStore 种一段世仇 → mock 掉所有 agent 的 generateVote(不碰 LLM)→ 调私有 runVoting
 * → 断言「世仇候选时基础票被真的改投」+ 时间线落了旧账;另证普通记仇(未到世仇)不强改票。
 *
 * relationStore 是单例缓存,test 的 ingest 和引擎 runVoting 里的 dynamic import 命中同一份模块缓存,
 * 所以种进去的图引擎能读到。每个 case 前清缓存+删盘文件做隔离,跑完删文件不留痕(data/ 本就 gitignore)。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../GameEngine';
import { ingestRelationEvents, __resetRelationCacheForTest } from '../../services/relationStore';
import type { RelationEvent } from '@furball/shared';

const DATA_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data/relations.json');

async function cleanStore(): Promise<void> {
  __resetRelationCacheForTest();
  await fs.rm(DATA_FILE, { force: true });
}

/** 把所有 agent 的 generateVote 换成「都投 bystander」,这样只有被种了世仇的 voter 会被改票。 */
function stubAllVotes(e: GameEngine, bystanderId: string): void {
  const agents = (e as unknown as { agents: Map<string, { generateVote: unknown }> }).agents;
  for (const [, agent] of agents) {
    agent.generateVote = async () => bystanderId;
  }
}

const runVoting = (e: GameEngine) => (e as unknown as { runVoting(): Promise<void> }).runVoting();
const timelineOf = (e: GameEngine) => (e as unknown as { timeline: Array<{ type: string; description: string }> }).timeline;

describe('GameEngine — 关系网反哺投票(真 engine 集成)', () => {
  beforeEach(cleanStore);
  afterAll(cleanStore);

  it('候选里有世仇时,基础票被真的改投世仇 + 时间线落旧账', async () => {
    const e = new GameEngine(8);
    e.createPlayers();
    const players = e.state.players;
    const voter = players[0];
    const foe = players[3];
    const bystander = players[5];

    // 种世仇:foe 两次同阵营把 voter 投出 → voter 对 foe = -90(世仇 ≤ -60)
    const evs: RelationEvent[] = [1, 2].map((round) => ({
      actorId: foe.personality!, subjectId: voter.personality!,
      kind: 'backstab', gameId: 'gSeed', round, ts: round,
    }));
    await ingestRelationEvents(evs);

    stubAllVotes(e, bystander.id); // 所有人基础票都投 bystander
    await runVoting(e);

    // voter 的票从 bystander 被改投到世仇 foe
    expect(e.state.votes[voter.id]).toBe(foe.id);
    // 没仇的人保持原票
    expect(e.state.votes[players[1].id]).toBe(bystander.id);
    // 时间线落了一条「翻旧账改投」,点名 foe
    const grudge = timelineOf(e).filter((t) => t.type === 'grudge_vote');
    expect(grudge.length).toBeGreaterThanOrEqual(1);
    expect(grudge[0].description).toContain(foe.name);
  });

  it('只有普通记仇(未到世仇阈值)时不强改票', async () => {
    const e = new GameEngine(8);
    e.createPlayers();
    const players = e.state.players;
    const voter = players[0];
    const mild = players[3];
    const bystander = players[5];

    // 一次 voted_out = -32:记仇但没到世仇 -60,不该强改票(只该进 prompt)
    await ingestRelationEvents([{
      actorId: mild.personality!, subjectId: voter.personality!,
      kind: 'voted_out', gameId: 'g', round: 1, ts: 1,
    }]);

    stubAllVotes(e, bystander.id);
    await runVoting(e);

    expect(e.state.votes[voter.id]).toBe(bystander.id); // 维持基础票
    expect(timelineOf(e).filter((t) => t.type === 'grudge_vote')).toHaveLength(0);
  });
});
