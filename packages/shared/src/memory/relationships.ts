/**
 * memory/relationships.ts — v6.75 — ②AI 记忆关系网纯引擎。
 *
 * 鼠人跨局记仇 / 记恩:一只鼠(按 **archetype id** 这个持久身份,不是某一局的临时 playerId)
 * 对另一只鼠累积一条「情绪边」分数(-100 世仇 … +100 过命交情)。投票把我投出去 = 我记你仇;
 * 救过我 / 同阵营一起赢 = 我记你恩。投票时如果候选里有我的世仇,就能甩一句「上次你卖过我」。
 *
 * 全纯函数、无随机、无 I/O、不碰时间(ts 由调用方注入)。服务端 store 负责把图落盘 + 把一局的
 * 投票结果喂进来,客户端「关系网」UI 负责画。这是一层**结构化社交图谱**,跟既有的 pgvector
 * 情景记忆流(memoryWrite/Recall,DB-gated、模糊召回)互补——那层喂 LLM prompt,这层能画成图。
 */

/** 一只鼠对另一只鼠做的事的种类(决定情绪边怎么动)。 */
export type RelationKind =
  | 'voted_out'   // actor 投票把 subject 投出去了 → subject 记仇
  | 'backstab'    // actor 同阵营却把 subject 投出(叛变)→ subject 记大仇
  | 'framed'      // actor 在场上带节奏指认 subject(没投出)→ subject 小记仇
  | 'defended'    // actor 替 subject 说话洗白 → subject 小记恩
  | 'saved'       // actor 救了 subject(法务挡刀 / 医生保护)→ subject 记恩
  | 'allied_win'; // actor & subject 同阵营一起赢 → 互相记恩

/** 一桩跨局事件:actor 对 subject 做了 kind 这件事;产生情绪的是 subject。 */
export interface RelationEvent {
  actorId: string;    // 做事的鼠(archetype id)
  subjectId: string;  // 被作用、产生情绪的鼠(archetype id)
  kind: RelationKind;
  gameId: string;
  round: number;
  ts: number;
}

/** subject 对 actor 的情绪边(holder=谁的情绪,about=对谁)。 */
export interface RelationEdge {
  holderId: string;
  aboutId: string;
  score: number;        // -EDGE_CAP … +EDGE_CAP
  count: number;        // 累计事件数
  lastKind: RelationKind;
  lastGameId: string;
  lastTs: number;
}

export interface RelationGraph {
  edges: Record<string, RelationEdge>; // key = `${holderId}->${aboutId}`
}

export const EDGE_CAP = 100;
/** 低于此 = 记仇(投票会针对 + 甩旧账);高于对称值 = 交情。 */
export const GRUDGE_THRESHOLD = -25;
export const BOND_THRESHOLD = 25;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 每种事件对情绪边的增量。 */
export function relationDelta(kind: RelationKind): number {
  switch (kind) {
    case 'backstab':   return -45;
    case 'voted_out':  return -32;
    case 'framed':     return -18;
    case 'defended':   return 20;
    case 'saved':      return 38;
    case 'allied_win': return 16;
    default:           return 0;
  }
}

export function emptyGraph(): RelationGraph {
  return { edges: {} };
}
export function edgeKey(holderId: string, aboutId: string): string {
  return `${holderId}->${aboutId}`;
}

/** 把一桩事件并进图(不可变,返回新图);自指事件忽略。 */
export function applyEvent(graph: RelationGraph, ev: RelationEvent): RelationGraph {
  const holderId = ev.subjectId;
  const aboutId = ev.actorId;
  if (!holderId || !aboutId || holderId === aboutId) return graph;
  const key = edgeKey(holderId, aboutId);
  const prev = graph.edges[key];
  const score = clamp((prev?.score ?? 0) + relationDelta(ev.kind), -EDGE_CAP, EDGE_CAP);
  return {
    edges: {
      ...graph.edges,
      [key]: {
        holderId, aboutId, score,
        count: (prev?.count ?? 0) + 1,
        lastKind: ev.kind, lastGameId: ev.gameId, lastTs: ev.ts,
      },
    },
  };
}

/** 批量并入(按顺序 reduce)。 */
export function applyEvents(graph: RelationGraph, evs: readonly RelationEvent[]): RelationGraph {
  return evs.reduce(applyEvent, graph);
}

export type BondTone = 'foe' | 'cold' | 'neutral' | 'warm' | 'ally';
export interface BondTier { label: string; emoji: string; tone: BondTone; }

/** 分数 → 关系档(画图 / 卡片用)。 */
export function bondTier(score: number): BondTier {
  if (score <= -60) return { label: '世仇', emoji: '💢', tone: 'foe' };
  if (score <= GRUDGE_THRESHOLD) return { label: '记仇', emoji: '😒', tone: 'cold' };
  if (score < BOND_THRESHOLD) return { label: '点头之交', emoji: '😐', tone: 'neutral' };
  if (score < 60) return { label: '有交情', emoji: '🙂', tone: 'warm' };
  return { label: '过命交情', emoji: '🤝', tone: 'ally' };
}

export function edgeOf(graph: RelationGraph, holderId: string, aboutId: string): RelationEdge | null {
  return graph.edges[edgeKey(holderId, aboutId)] ?? null;
}
/** holder 对 about 的情绪分(没有边算 0)。 */
export function feelingOf(graph: RelationGraph, holderId: string, aboutId: string): number {
  return edgeOf(graph, holderId, aboutId)?.score ?? 0;
}

/** holder 在候选里最记仇的那只(分最低且 ≤ 记仇阈值);没有则 null。投票针对 + 甩旧账用。 */
export function strongestGrudge(
  graph: RelationGraph, holderId: string, candidateIds: readonly string[],
): RelationEdge | null {
  let worst: RelationEdge | null = null;
  for (const c of candidateIds) {
    if (c === holderId) continue;
    const e = edgeOf(graph, holderId, c);
    if (e && e.score <= GRUDGE_THRESHOLD && (!worst || e.score < worst.score)) worst = e;
  }
  return worst;
}

/** holder 在候选里最罩着的那只(分最高且 ≥ 交情阈值);没有则 null。保票 / 抱团用。 */
export function strongestBond(
  graph: RelationGraph, holderId: string, candidateIds: readonly string[],
): RelationEdge | null {
  let best: RelationEdge | null = null;
  for (const c of candidateIds) {
    if (c === holderId) continue;
    const e = edgeOf(graph, holderId, c);
    if (e && e.score >= BOND_THRESHOLD && (!best || e.score > best.score)) best = e;
  }
  return best;
}

/** holder 的所有情绪边,按 |score| 降序(给个人关系卡用)。 */
export function topEdges(graph: RelationGraph, holderId: string, n?: number): RelationEdge[] {
  const out = Object.values(graph.edges)
    .filter((e) => e.holderId === holderId && e.score !== 0)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  return typeof n === 'number' ? out.slice(0, Math.max(0, n)) : out;
}

/** 整张图的边,按 |score| 降序(给全局「关系网」图谱用);可选只取够浓的(|score|≥minAbs)。 */
export function allEdges(graph: RelationGraph, minAbs = 0): RelationEdge[] {
  return Object.values(graph.edges)
    .filter((e) => Math.abs(e.score) >= minAbs)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
}

// ---------------------------------------------------------------------------
// 旧账嘴替:holder 见到 about(基于这条边)甩一句。纯查表,无随机 —— 用 round 选句保证可测。
// ---------------------------------------------------------------------------
const GRUDGE_LINES: Record<'foe' | 'cold', string[]> = {
  foe: [
    '上辈子的仇这辈子接着报,今天就送你回家。',
    '又是你?见你一次投你一次,不寒碜。',
    '咱俩这梁子结大了,正好,这票我投得不带犹豫。',
  ],
  cold: [
    '上次就是你把我卖了,这次轮到你了。',
    '别以为我忘了上把你投我那一票。',
    '旧账还没算呢,这票先记你头上。',
  ],
};
const BOND_LINES: Record<'warm' | 'ally', string[]> = {
  ally: [
    '上次你替我挡了刀,这把我罩着你。',
    '过命的交情,我这票绝不投你。',
    '自己人,放心,我帮你盯着别人。',
  ],
  warm: [
    '上次你帮过我,这回我记着。',
    '咱有交情,我先信你一把。',
    '看在老交情份上,这轮我不针对你。',
  ],
};

/** 记仇旧账嘴替(holder 对 about);不是记仇关系返回空串。round 用来确定性选句。 */
export function grudgeTaunt(edge: RelationEdge, round = 0): string {
  const tone = bondTier(edge.score).tone;
  if (tone !== 'foe' && tone !== 'cold') return '';
  const pool = GRUDGE_LINES[tone];
  return pool[((round % pool.length) + pool.length) % pool.length];
}

/** 记恩抱团嘴替(holder 对 about);不是交情关系返回空串。 */
export function bondNod(edge: RelationEdge, round = 0): string {
  const tone = bondTier(edge.score).tone;
  if (tone !== 'warm' && tone !== 'ally') return '';
  const pool = BOND_LINES[tone];
  return pool[((round % pool.length) + pool.length) % pool.length];
}

// ---------------------------------------------------------------------------
// 从一局的结果派生事件(纯)。调用方先把 playerId 映射成 archetype id 再传进来。
// ---------------------------------------------------------------------------
export interface VoteResultInput {
  gameId: string;
  round: number;
  ts: number;
  /** 投票者 archetype → 被投 archetype(已映射)。 */
  votes: Record<string, string>;
  /** 本轮被开除的 archetype(平票为 null)。 */
  eliminatedArch: string | null;
  /** archetype → 阵营标签,用来判 backstab(同阵营却投我)。任意阵营串,只做相等比较。可选。 */
  teamOf?: Record<string, string>;
  /** 本轮发生的救人(法务挡刀 / 医生),actor 救了 subject。可选。 */
  saved?: { actorArch: string; subjectArch: string } | null;
}

/** 一轮投票 → 记仇/记恩事件流。被开除者记住每一个投他的人(同阵营=叛变记大仇)。 */
export function eventsFromVoteResult(input: VoteResultInput): RelationEvent[] {
  const evs: RelationEvent[] = [];
  const { gameId, round, ts } = input;
  if (input.eliminatedArch) {
    const elim = input.eliminatedArch;
    for (const [voter, target] of Object.entries(input.votes)) {
      if (target !== elim || voter === elim) continue;
      const sameTeam =
        !!input.teamOf && !!input.teamOf[voter] && input.teamOf[voter] === input.teamOf[elim];
      evs.push({ actorId: voter, subjectId: elim, kind: sameTeam ? 'backstab' : 'voted_out', gameId, round, ts });
    }
  }
  if (input.saved && input.saved.actorArch !== input.saved.subjectArch) {
    evs.push({ actorId: input.saved.actorArch, subjectId: input.saved.subjectArch, kind: 'saved', gameId, round, ts });
  }
  return evs;
}

/** 终局 → 同阵营赢家两两「一起赢」记恩事件(无向,各记一条)。 */
export function eventsFromGameEnd(args: {
  gameId: string; ts: number; winnerArchs: readonly string[];
}): RelationEvent[] {
  const evs: RelationEvent[] = [];
  const ws = Array.from(new Set(args.winnerArchs));
  for (let i = 0; i < ws.length; i++) {
    for (let j = i + 1; j < ws.length; j++) {
      evs.push({ actorId: ws[j], subjectId: ws[i], kind: 'allied_win', gameId: args.gameId, round: 0, ts: args.ts });
      evs.push({ actorId: ws[i], subjectId: ws[j], kind: 'allied_win', gameId: args.gameId, round: 0, ts: args.ts });
    }
  }
  return evs;
}
