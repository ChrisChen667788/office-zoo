import { EventEmitter } from 'events';
import {
  type GameState,
  type GameConfig,
  type PlayerState,
  type GameEvent,
  type SerializedGameState,
  type SerializedPlayer,
  GamePhase,
  Team,
  WinCondition,
  Role,
  ROLE_PRESETS,
  ROLE_REGISTRY,
  DEFAULT_GAME_CONFIG,
  type Personality,
  ALL_PERSONALITIES,
  assignPersonalities,
  PERSONALITY_REGISTRY,
  roomCenter,
  MAP_W,
  MAP_H,
  eventsFromVoteResult,
  resolveVoteWithGrudge,
  emptyGraph,
  type RelationGraph,
  // v6.85 P2 — 双公司对抗纯引擎
  assignDualCompanies,
  poachChance,
  resolvePoach,
  eventsFromDefection,
  canCrossAction,
  recordCrossAction,
  dualWinner,
  feelingOf,
  MARKET_STEP,
  MARKET_WIN,
  type CompanyId,
  type CrossActionLedger,
  type MarketState,
  // v6.89 — 商业抹黑(曝料)纯引擎
  resolveSmear,
  smearTruthful,
  pickSmearTarget,
  SMEAR_PRESSURE,
} from '@furball/shared';
import { TaskManager } from './TaskManager';
import { BaseAgent } from '../agents/BaseAgent';
import { logger } from '../utils/logger';
import { recordGameResults, recordVoteAgainst } from '../services/characterStatsStore';
import { recordSpectatorViews } from '../services/userCharacterViewsStore';
import { getWeeklyLeaders } from '../services/characterVoteStore';
// v6.51 P1 — cross-game 公司主题包 memory (NPCs remember prior games).
import { listPackMemories, recordPackGame } from '../services/packMemoryStore';
import { formatPackMemoryForNpc, summarizeWinner } from '../services/packMemoryFormat';
// v6.52 P1 — special cat-role night actions (detective investigate / medic protect).
import { chooseInvestigateTarget, chooseProtectTarget, teamLabel, resolveKillTarget, assignAvatarKeys } from './roleAbilities';
import { logEngineCrash } from '../services/crashLog';
import { assignRoomActivity, commuteCaption, pickAnchor, pickCarriedItem } from './activity';
// Activity + PlayerTickInfo are new — added separately to keep the diff
// against the original import block obvious. PlayerState is already imported
// above as a type, so we don't repeat it here.
import type { PlayerTickInfo } from '@furball/shared';

const AI_NAMES = [
  'Tony', 'Lisa', 'Kevin', 'Amy', 'David', 'Frank',
  'Grace', 'Helen', 'Jack', 'Mike', 'Ruby', 'Oscar',
  '张总', '李总', '小王', '小陈', '阿强', '老赵',
  '陈姐', '实习生小明',
];

const ROOMS = [
  '开放工区', '茶水间', '会议室', 'HR办公室', '服务器机房',
  '监控室', '产品部', '老板办公室', '文印室', '电梯间',
];

function randomRoom(): string {
  return ROOMS[Math.floor(Math.random() * ROOMS.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** v6.35 P5 — weighted sample-without-replacement. Each item picks
 *  with probability proportional to its weight (clamped ≥ 0.01 so
 *  zero-weight items still have a tiny chance, preventing a single
 *  trending name from dominating every game). Used by createPlayers
 *  to bias the AI roster toward hot-quote-nominated names.
 *
 *  Exported (v6.36 P1) for direct vitest invocation — math sanity
 *  checks live in GameEngine.test.ts. */
export function weightedSample<T>(items: T[], weights: number[], count: number): T[] {
  const pool = items.map((it, i) => ({ it, w: Math.max(0.01, weights[i] ?? 1) }));
  const out: T[] = [];
  for (let k = 0; k < count && pool.length > 0; k++) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    out.push(pool[idx].it);
    pool.splice(idx, 1);
  }
  return out;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** v6.30 P5 — cross-topic stopwords. These bigrams + English tokens
 *  appear in too many UNRELATED speeches to be useful overlap signal
 *  (e.g. "工位" / "OKR" / "CEO" — most office speech mentions them).
 *  v6.28 P2 FP audit identified 6/8 tripped pairs that hinged on
 *  exactly these tokens. Dropping them from BOTH hint and speech
 *  token sets pushes baseline FP rate down without hurting true
 *  positives (real leaks rely on names + distinctive verbs, not
 *  generic 班味 vocabulary). */
const LEAK_STOPWORDS = new Set<string>([
  // Cross-topic CJK bigrams (the words EVERY speech mentions)
  '工位', '加班', '老板', 'HR', '会议', '周报', '同事', '公司',
  '今天', '昨天', '上次', '下次', '一下', '一个', '一次',
  // Generic English business jargon
  'okr', 'kpi', 'ceo', 'cto', 'hr', 'pua', 'ai', 'q1', 'q2', 'q3', 'q4',
  'pm', 'pr', 'prd',
  // Numeric "N 分钟" / "N 小时" generic
  '分钟', '小时',
]);

/** v6.27 P2 — split text into content tokens for Jaccard-style fuzzy
 *  leak-quote detection. Strategy:
 *    - Whitespace + Chinese-punct first-pass split.
 *    - English runs (`[A-Za-z0-9_]+` length ≥ 2) kept as one token.
 *    - Chinese runs (CJK Unified Ideographs) yielded as overlapping
 *      2-char bigrams ("我工位的" → {"我工","工位","位的"}). Bigrams
 *      capture local context cheaply and handle paraphrase ordering.
 *    - All else (single English chars, single CJK chars, pure punct)
 *      dropped as stop tokens.
 *    - v6.30 P5: drop LEAK_STOPWORDS so cross-topic words don't carry
 *      Jaccard weight.
 *  Returns a Set so callers can do O(1) overlap. */
function leakTokenize(text: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  // Split on punctuation + whitespace runs
  const segments = text.split(/[\s,，。!?！？@\-_'"()（）【】《》:：;；、~`*]+/);
  for (const seg of segments) {
    if (!seg) continue;
    // Walk char-by-char; segregate ASCII alnum runs vs CJK runs.
    let i = 0;
    while (i < seg.length) {
      const c = seg.charCodeAt(i);
      // ASCII alnum (and underscore) run
      if ((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f) {
        let j = i + 1;
        while (j < seg.length) {
          const cj = seg.charCodeAt(j);
          if (!((cj >= 0x30 && cj <= 0x39) || (cj >= 0x41 && cj <= 0x5a) || (cj >= 0x61 && cj <= 0x7a) || cj === 0x5f)) break;
          j++;
        }
        const tok = seg.slice(i, j).toLowerCase();
        if (tok.length >= 2 && !LEAK_STOPWORDS.has(tok)) out.add(tok);
        i = j;
        continue;
      }
      // CJK Unified Ideographs (basic + extended A — covers ~99% of
      // Chinese content). Emit 2-char bigrams.
      if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) {
        let j = i + 1;
        while (j < seg.length) {
          const cj = seg.charCodeAt(j);
          if (!((cj >= 0x4e00 && cj <= 0x9fff) || (cj >= 0x3400 && cj <= 0x4dbf))) break;
          j++;
        }
        const run = seg.slice(i, j);
        for (let k = 0; k + 2 <= run.length; k++) {
          const bg = run.slice(k, k + 2);
          if (!LEAK_STOPWORDS.has(bg)) out.add(bg);
        }
        i = j;
        continue;
      }
      i++;
    }
  }
  return out;
}

/** v6.37 P4 — set of valid personality strings, used by the pack-override
 *  path in createPlayers to whitelist user-submitted personality hints. */
const VALID_PERSONALITIES = new Set<string>(ALL_PERSONALITIES);

/** v6.38 P2 — a single NPC entry from a 公司主题包, passed to
 *  createPlayers as an override. `role`/`personality` are optional
 *  free-text hints the user picked in the editor. */
export interface PackNpcOverride {
  name: string;
  personality?: string;
  role?: string;
  /** v6.39 P3 — emoji avatar glyph; rendered client-side in place of
   *  the role image. */
  avatar?: string;
}

/** v6.38 P2 — map a pack's free-text role hint to a TEAM lean. 管理层
 *  (manager/hr/finance) lean 资本家/dog; 一线打工人 (engineer/pm/designer/
 *  sales) lean 打工人/cat. Anything else → no lean (undefined). Kept as a
 *  plain object so the editor's role dropdown ids stay the single source
 *  of truth (see client CompanyPackEdit ROLE_HINTS). */
const ROLE_HINT_TEAM_LEAN: Record<string, Team> = {
  manager: Team.DOG,
  hr: Team.DOG,
  finance: Team.DOG,
  engineer: Team.CAT,
  pm: Team.CAT,
  designer: Team.CAT,
  sales: Team.CAT,
};

/**
 * v6.38 P2 — assign a fixed role multiset to players honoring per-player
 * team-lean hints, WITHOUT changing which roles exist (so cat/dog/neutral
 * balance is byte-identical to a normal game).
 *
 * Two passes:
 *   1. Players whose hint maps to an available role of the leaning team
 *      grab one (popped from that team's bucket).
 *   2. Remaining players take whatever roles are left, in pool order.
 *
 * `rolePool` is consumed by reference-free copies; returns a `Role[]`
 * aligned to player index. Bucketed by the actual team string so exotic
 * teams (e.g. lover) are handled generically.
 */
function assignRolesWithTeamLean(
  rolePool: Role[],
  roleHints: (string | undefined)[],
): Role[] {
  const count = rolePool.length;
  // Bucket available roles by their team string.
  const byTeam = new Map<string, Role[]>();
  for (const r of rolePool) {
    const team = ROLE_REGISTRY[r].team as string;
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team)!.push(r);
  }
  const result: (Role | undefined)[] = new Array(count).fill(undefined);

  // Pass 1 — satisfy team leans where a matching role is still available.
  for (let i = 0; i < count; i++) {
    const hint = roleHints[i];
    const lean = hint ? ROLE_HINT_TEAM_LEAN[hint] : undefined;
    if (lean) {
      const bucket = byTeam.get(lean as string);
      if (bucket && bucket.length > 0) result[i] = bucket.pop()!;
    }
  }

  // Pass 2 — flatten whatever's left and fill the unassigned slots.
  const remaining: Role[] = [];
  for (const bucket of byTeam.values()) remaining.push(...bucket);
  let ri = 0;
  for (let i = 0; i < count; i++) {
    if (result[i] === undefined) result[i] = remaining[ri++];
  }
  return result as Role[];
}

export class GameEngine extends EventEmitter {
  readonly state: GameState;
  /** Wall-clock when this engine was created — used by TTL sweeper. */
  readonly createdAt: number = Date.now();
  /** v5.8.2 — spectator's X-User-Id (from game:create payload). Optional:
   *  anonymous-friendly games keep null here, in which case memory entries
   *  for this game store target_user_id=NULL (degrades to v5.8.1 behaviour:
   *  agent-archetype-only memory chain, not per-spectator). */
  readonly spectatorUserId: string | null;
  private agents: Map<string, BaseAgent> = new Map();
  private taskManager: TaskManager;
  private timeline: GameEvent[] = [];
  private running = false;
  private destroyed = false;
  private discussionResolver?: () => void;
  /** v6.52 P1 — players the HR总监(detective) has already investigated, so it
   *  spends each round's check on someone new until the roster's exhausted. */
  private investigatedByDetective: Set<string> = new Set();
  /** v6.53 P2 — same, for the 数据分析师(vigilante)'s OKR-output checks. */
  private investigatedByVigilante: Set<string> = new Set();
  /** v6.56 — dead employees the 内审专员(medium) has already audited. */
  private auditedByMedium: Set<string> = new Set();
  /** v6.56 — living players the 销售冠军(adventurer) has already tailed. */
  private trackedByAdventurer: Set<string> = new Set();
  /** Compressed record of last round's discussion — fed into next round's context for memory. */
  private lastRoundSpeeches: Array<{ name: string; text: string }> = [];
  /** v6.25 P1 — psy-war leaks submitted by the spectator via GhostChatPanel's
   *  战术 @ button. FIFO, cap 5. Fed into BaseAgent.generateSpeech as
   *  "anonymous ex-coworker tips" the AI can quote/discredit/ignore.
   *  Cleared each round (`pushLeakedHint` keeps a sliding window). */
  private leakedHints: string[] = [];

  /** v6.83 — 观众筹码买的「裁员保护协议」:罩住的 playerId,挡一刀即消费。 */
  private interventionShieldId: string | null = null;
  /** v6.85 P2 — 双公司跨司动作台账(每司每回合限 1 次挖人)。 */
  private crossLedger: CrossActionLedger = {};
  /** v6.89 — 商业抹黑独立台账(每司每回合限 1 次曝料,不占挖角额度)。 */
  private smearLedger: CrossActionLedger = {};
  /** v6.89 — 抹黑给被黑者加的「舆论票」(targetId→票数,每轮投票前清空,
   *  resolveVotes 计票时折进其本司那一组)。 */
  private smearPressure: Record<string, number> = {};
  /** v6.83 — 观众「聚光灯」:这些鼠下次发言加戏(取走即消费)。 */
  private spotlightIds = new Set<string>();
  /** Child logger bound to this engine's gameId — created lazily. */
  private _log?: ReturnType<typeof logger.child>;
  private get log() {
    if (!this._log) this._log = logger.child({ gameId: this.state.id, component: 'engine' });
    return this._log;
  }

  constructor(configOrPlayerCount: Partial<GameConfig> | number = {}, spectatorUserId?: string) {
    super();
    this.spectatorUserId = spectatorUserId ?? null;
    const config: Partial<GameConfig> =
      typeof configOrPlayerCount === 'number'
        ? { playerCount: configOrPlayerCount }
        : configOrPlayerCount;
    const mergedConfig: GameConfig = { ...DEFAULT_GAME_CONFIG, ...config };
    this.state = {
      id: `game_${Date.now()}`,
      phase: GamePhase.LOBBY,
      players: [],
      round: 0,
      taskProgress: 0,
      winner: WinCondition.NONE,
      votes: {},
      ghostVotes: {},
      config: mergedConfig,
    };
    this.taskManager = new TaskManager(ROOMS);
  }

  // ---------- Setup ----------

  createPlayers(
    weeklyLeaders: Record<string, string> = {},
    nominationCounts: Map<string, number> = new Map(),
    packOverride?: { npcs: PackNpcOverride[] },
    packMemoryByName: Record<string, string> = {},
  ): void {
    const count = this.state.config.playerCount;
    const preset = ROLE_PRESETS[count] ?? ROLE_PRESETS[8];
    const rolePool: Role[] = shuffle([...preset.cat, ...preset.dog, ...preset.neutral]);

    // v6.37 P4 / v6.38 P2 — pack override skips the weighted-sample step
    // and takes names verbatim from the user-curated 公司主题包. We shuffle
    // the pack as whole TUPLES so each name keeps its own personality +
    // role hint aligned (v6.38 P2 fix — previously names were shuffled
    // independently of the index-aligned personalities array, so after
    // the shuffle a name could be paired with another NPC's personality).
    // Pack is validated server-side (6-12 unique names); we fall back to
    // the AI_NAMES weighted sample whenever the pack is too small.
    let names: string[];
    let packRoleHints: (string | undefined)[] = [];
    let packAvatars: (string | undefined)[] = [];
    const personalities = assignPersonalities(count);
    if (packOverride && packOverride.npcs.length >= count) {
      const chosen = shuffle([...packOverride.npcs]).slice(0, count);
      names = chosen.map((n) => n.name);
      packRoleHints = chosen.map((n) => n.role);
      packAvatars = chosen.map((n) => n.avatar);
      // Personality hints now read from the SAME shuffled tuple, so
      // name↔personality stays consistent. Invalid hints fall through
      // to the dealt default.
      for (let i = 0; i < count; i++) {
        const hint = chosen[i].personality;
        if (hint && VALID_PERSONALITIES.has(hint)) {
          personalities[i] = hint as Personality;
        }
      }
    } else {
      // v6.35 P5 — weight each name by its hot-quote nomination count
      // over the last 7 days. weight = 1 + 0.5 × min(mentions, 5) — caps
      // at 3.5x so even a heavily-quoted rat doesn't show up every game.
      const weights = AI_NAMES.map((n) => 1 + 0.5 * Math.min(nominationCounts.get(n) ?? 0, 5));
      names = weightedSample(AI_NAMES, weights, count);
    }

    // v6.38 P2 — role soft-preference. The pack's free-text role hint
    // ("manager" / "engineer" / …) maps to a TEAM lean (管理层→资本家/dog,
    // 打工人岗→cat). We redistribute the existing role multiset so hinted
    // players tend to land on their leaning team — WITHOUT changing which
    // roles exist, so the cat/dog/neutral balance is byte-identical to a
    // normal game. No-hint / unmappable-hint players take whatever's left.
    const roles = assignRolesWithTeamLean(rolePool, packRoleHints);

    // v6.16 P1 — apply per-character weekly-vote bias. For each named
    // player whose character has a "this week's winner" personality,
    // 50% chance to swap (or overwrite) their dealt personality toward
    // that winner. Reflects user votes back into actual gameplay.
    for (let i = 0; i < count; i++) {
      const leader = weeklyLeaders[names[i]];
      if (!leader || personalities[i] === (leader as Personality) || Math.random() >= 0.5) continue;
      // Prefer swap (preserves overall personality distribution if count ≤ 8)
      const swapAt = personalities.findIndex((p, j) => j !== i && p === (leader as Personality));
      if (swapAt >= 0) {
        [personalities[i], personalities[swapAt]] = [personalities[swapAt], personalities[i]];
      } else {
        // No one has it — accept a duplicate. assignPersonalities already
        // cycles when count > 8 so duplicates are allowed.
        personalities[i] = leader as Personality;
      }
    }

    for (let i = 0; i < count; i++) {
      const role = roles[i];
      const info = ROLE_REGISTRY[role];
      const personality = personalities[i];
      const player: PlayerState = {
        id: `player_${i}`,
        name: names[i],
        role,
        team: info.team,
        isAlive: true,
        position: { x: 0, y: 0, room: '开放工区' },
        tasks: [],
        killCooldown: 0,
        emergencyMeetings: this.state.config.emergencyMeetings,
        ghostVoteUsed: false,
        personality,
        // v6.39 P3 — carry the pack NPC's emoji avatar (undefined for
        // default rosters); aligned with names via the shuffled tuples.
        avatar: packAvatars[i],
      };
      this.state.players.push(player);

      // Create AI agent for this player (with personality)
      // v5.8.2 — engine pipes its spectatorUserId into every agent so
      // memory recall + write scope to this watcher's chunky-style chain.
      const agent = new BaseAgent(
        player.id, player.name, role, info.team,
        personality as Personality, this.spectatorUserId,
        // v6.51 P1 — per-NPC cross-game memory snippet (empty string for
        // default rosters or first-time pack NPCs).
        packMemoryByName[player.name],
      );
      this.agents.set(player.id, agent);
    }

    // Assign tasks to cat-team players
    for (const p of this.state.players) {
      if (p.team === Team.CAT) {
        p.tasks = this.taskManager.assignTasks(p.id, this.state.config.taskCount);
      }
    }

    // v6.55 #2 — give every player a UNIQUE avatar key so duplicate-role
    // rosters (普通员工 ×2 etc.) don't share a face. Deterministic; client
    // resolves avatarUrls[avatarKey ?? role].
    const avatarKeys = assignAvatarKeys(this.state.players);
    for (const p of this.state.players) p.avatarKey = avatarKeys[p.id];

    // v6.85 P2 — 双公司模式:8 鼠 → 4+4,每公司恰好 1 内鬼(ROLE_PRESETS[8]
    // 正好 2 狗)。分配失败(人数/狗数不符)静默退回单公司,游戏照常。
    if (this.state.config.mode === 'dual') {
      const dogs = this.state.players.filter((p) => p.team === Team.DOG).map((p) => p.id);
      const assignment = assignDualCompanies(this.state.players.map((p) => p.id), dogs);
      if (assignment) {
        for (const p of this.state.players) p.companyId = assignment[p.id];
        this.addEvent('dual_start', '🏢⚔️🏢 双公司对抗开局 — A 司 vs B 司,抢市场、防内鬼、互相挖人');
      } else {
        this.state.config.mode = 'single';
        this._log?.warn?.({ count: this.state.players.length, dogs: dogs.length }, 'dual assignment failed, fallback to single');
      }
    }
  }

  // ---------- Main game loop ----------

  async startGame(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // v6.16 P1 — pull this week's character vote leaders (Record<name, personality>)
    // and pipe them to createPlayers as a 50% bias. Fail-open: if the store throws
    // / file missing, we fall back to pure-random assignment (game still starts).
    let weeklyLeaders: Record<string, string> = {};
    try {
      const wl = await getWeeklyLeaders();
      weeklyLeaders = wl.leaders;
    } catch {
      /* fail-open — vote bias is polish, not gating */
    }
    // v6.35 P5 — fetch hot-quotes nominations BEFORE createPlayers so
    // the weighted sample uses the latest 7-day counts. Fail-open: if
    // hot quotes module errors, fall back to uniform shuffle (empty map).
    let nominationCounts = new Map<string, number>();
    try {
      const { getRecentNominationCounts } = await import('../routes/hotQuotes');
      nominationCounts = await getRecentNominationCounts(AI_NAMES);
    } catch { /* uniform fallback */ }

    // v6.37 P4 — if game was created with a companyPackId, fetch the
    // pack server-side and pass the names/personalities as overrides.
    // Fail-open: missing/invalid pack falls back to the default
    // AI_NAMES roster so a broken share link never blocks game start.
    let packOverride: { npcs: PackNpcOverride[] } | undefined;
    const packMemoryByName: Record<string, string> = {};
    if (this.state.config.companyPackId) {
      try {
        const { getCompanyPackById } = await import('../routes/companyPack');
        const pack = await getCompanyPackById(this.state.config.companyPackId);
        if (pack && pack.npcs.length >= this.state.config.playerCount) {
          // Pass whole NPC tuples — createPlayers shuffles them together
          // so name↔personality↔role stay aligned (v6.38 P2).
          packOverride = {
            npcs: pack.npcs.map((n) => ({
              name: n.name,
              personality: n.personality,
              role: n.role,
              avatar: n.avatar,
            })),
          };
          // v6.51 P1 — load this pack's game history once and pre-format a
          // per-NPC grudge snippet keyed by name. createPlayers looks it up
          // after the roster shuffle. Fail-open like everything pack-related.
          const memories = await listPackMemories(this.state.config.companyPackId);
          if (memories.length > 0) {
            for (const n of pack.npcs) {
              const snippet = formatPackMemoryForNpc(n.name, memories);
              if (snippet) packMemoryByName[n.name] = snippet;
            }
          }
        }
      } catch { /* fail-open — pack is a bonus, not a gate */ }
    }
    this.createPlayers(weeklyLeaders, nominationCounts, packOverride, packMemoryByName);
    // v6.31 P5 — bump server stats counters once roster is populated.
    // v6.36 P3 — include hot-nominated names (count ≥ 1) so the client
    // can show a 🔥 "热门" badge on sprites the audience asked for.
    const hotNames = this.state.players
      .map((p) => p.name)
      .filter((n) => (nominationCounts.get(n) ?? 0) >= 1);
    this.emit('roster_created', {
      names: this.state.players.map((p) => p.name),
      hotNames,
    });
    // v6.33 P4 — seed leakedHints with recent spectator-submitted 班味
    // 金句 (hotQuotes pool, top 5 recent). Per-user PSYWAR submissions
    // still arrive live via socket and append on top — pool just gives
    // every game some baseline "voice from the audience" texture even
    // if no current spectator submits during this round.
    try {
      const { getRecentHotQuoteTexts } = await import('../routes/hotQuotes');
      const seeds = (await getRecentHotQuoteTexts()).slice(0, 5);
      for (const t of seeds) this.pushLeakedHint(t);
    } catch { /* hot quotes optional — never block game start */ }
    this.emitState();

    // ROLE_REVEAL
    await this.setPhase(GamePhase.ROLE_REVEAL);
    await delay(3000);

    // v6.55 #1 — wrap the whole live loop so a single phase throwing (a
    // transient LLM/TTS/network hiccup, or an edge case as players die) can't
    // leave the game FROZEN mid-phase. Before this, an uncaught throw exited
    // the loop with `running` still true and no game_over emitted → every
    // client stuck forever ("报错卡死"). Now: log it, emit a graceful
    // game_over so clients unfreeze, and ALWAYS clear `running` in finally so
    // the engine can be torn down and a fresh game started cleanly.
    try {
      // Main loop
      while (this.running && this.state.winner === WinCondition.NONE) {
        this.state.round++;

        // FREE_ROAM
        await this.setPhase(GamePhase.FREE_ROAM);
        await this.runFreeRoam();

        if (this.checkWin()) break;

        // MEETING
        await this.setPhase(GamePhase.MEETING);
        await delay(2000);

        // DISCUSSION
        await this.setPhase(GamePhase.DISCUSSION);
        await this.runDiscussion();

        // VOTING
        await this.setPhase(GamePhase.VOTING);
        await this.runVoting();

        // VOTE_RESULT
        await this.setPhase(GamePhase.VOTE_RESULT);
        await this.resolveVotes();
        await delay(3000);

        if (this.checkWin()) break;
      }

      // GAME_OVER
      await this.setPhase(GamePhase.GAME_OVER);
      // v6.8 — fold final state into per-character stats. Fire-and-forget;
      // recordGameResults swallows its own errors so a stats write can never
      // block GAME_OVER signaling. Stats power PersonaCard's 战绩 line.
      void recordGameResults(this.state);
      // v6.10 — fold spectator's per-character views into their personal
      // ledger. Only when spectatorUserId is set (anonymous spectators
      // don't accumulate personalized history). Powers personalized
      // "你看过的 Top 3" on /profile.
      if (this.spectatorUserId) {
        void recordSpectatorViews(this.spectatorUserId, this.state);
      }
      // v6.51 P1 — fold this game's outcome into the pack's cross-game memory
      // so the recurring cast carries grudges/loyalties into the next game.
      // Fire-and-forget; never blocks GAME_OVER. Only when a company pack was used.
      if (this.state.config.companyPackId) {
        const packId = this.state.config.companyPackId;
        void recordPackGame(packId, {
          ts: Date.now(),
          winnerLabel: summarizeWinner(this.state.winner),
          survivors: this.state.players.filter((p) => p.isAlive).map((p) => p.name),
          eliminated: this.state.players.filter((p) => !p.isAlive).map((p) => p.name),
          roster: this.state.players.map((p) => p.name),
        }).catch((err) => console.error('[packMemory] record failed:', err));
      }
    } catch (err) {
      // A phase threw — contain it so the game ends instead of freezing.
      this.log.error({ err }, 'game loop aborted — ending gracefully to avoid a frozen game');
      // Persist a greppable crash record (stdout isn't captured when the dev
      // server runs detached) so a recurrence can actually be root-caused.
      void logEngineCrash({ gameId: this.state.id, round: this.state.round, phase: this.state.phase, err });
      try {
        this.state.phase = GamePhase.GAME_OVER;
        this.addEvent('game_over', '本局出了点状况,提前散场了(可以重开一局)');
        this.emit('game_over', { winner: this.state.winner, reason: 'engine_error' });
        this.emitState();
      } catch {
        /* even the graceful-exit emit failed — nothing more we can safely do */
      }
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    this.running = false;
  }

  /**
   * Fully tear down this engine: stop the main loop, release any pending
   * discussion awaits, detach all listeners, and drop agent references.
   * Idempotent — safe to call multiple times (TTL sweep + disconnect cleanup
   * may race).
   *
   * Callers MUST remove the engine from their game Map after calling this,
   * otherwise the memory it still references (state, timeline) won't be freed.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;

    // Unblock any awaiter in runDiscussion — otherwise the engine's async
    // stack frame is kept alive by the pending Promise, leaking memory.
    this.discussionResolver?.();
    this.discussionResolver = undefined;

    // Drop all EventEmitter listeners (socket handler, future subscribers).
    this.removeAllListeners();

    // Drop strong refs to agents + timeline so V8 can reclaim them even if
    // an outer closure retained this engine.
    this.agents.clear();
    this.timeline.length = 0;
    this.lastRoundSpeeches = [];
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  // ---------- Phase runners ----------

  /**
   * Free-roam phase — v0.5+ uses a true real-time loop instead of the old
   * 1.5 s discrete steps.
   *
   * Loop = `FREE_ROAM_TICKS` ticks of `TICK_INTERVAL_MS` each (default
   * 36 × 250 ms = 9 s, same total wall-clock as before).
   *
   * Per tick:
   *   1. For each alive player:
   *      a. Integrate position by velocity (px += vx * dt)
   *      b. If commuting AND close to destination room centre → arrive
   *      c. If settled, occasionally pick a new destination (commute) OR
   *         a new in-room micro-target (gentle wander around the room)
   *   2. Refresh the activity caption every 5th tick (~1.25s) so tooltips
   *      don't go stale and the LLM isn't being asked every 250 ms
   *   3. Emit `tick` with positions + velocities; client uses these for
   *      dead-reckoning between snapshots.
   *
   * Kill / task / body-discovery logic is preserved verbatim from the old
   * loop, just deferred to after the ticks finish.
   */
  private async runFreeRoam(): Promise<void> {
    const TICK_INTERVAL_MS = 250;          // 4 Hz, matches the v0.5 plan
    const FREE_ROAM_TICKS = 36;            // 36 × 250 ms = 9 s
    const COMMUTE_START_PROB = 0.06;       // per tick (~1.4%/sec aggregate over 9s)
    /** Commute speed in logical units / second. ROOM_RECTS coords go up to
     *  1000 × 700, so ~120 px/s gives a ~3-4 s cross-map walk — feels human. */
    const SPEED_PX_PER_SEC = 140;
    /** "Arrived" radius in logical units. Larger → less stuttery snap; small
     *  enough that we still pick a unique room reliably. */
    const ARRIVE_RADIUS = 24;
    const dt = TICK_INTERVAL_MS / 1000;

    // Initial settle: bootstrap rooms + activities + drop player on the room
    // centre. Wipes any stale commute state from a prior round.
    for (const p of this.alivePlayers()) {
      if (!p.position.room) p.position.room = randomRoom();
      const c = roomCenter(p.position.room) ?? { x: MAP_W / 2, y: MAP_H / 2 };
      p.position.x = c.x;
      p.position.y = c.y;
      p.position.vx = 0;
      p.position.vy = 0;
      p.position.pathProgress = undefined;
      p.position.destination = undefined;
      const roommates = this.playersInRoom(p.position.room);
      const a = assignRoomActivity(p, roommates);
      p.activity = a.activity;
      p.activityText = a.activityText;
    }
    this.emitState(); // baseline state with activities populated

    for (let t = 0; t < FREE_ROAM_TICKS; t++) {
      if (!this.running || this.destroyed) return;

      for (const p of this.alivePlayers()) {
        // 1. Integrate position by velocity
        if (p.position.vx || p.position.vy) {
          p.position.x += (p.position.vx ?? 0) * dt;
          p.position.y += (p.position.vy ?? 0) * dt;
        }

        const isCommuting = !!p.position.destination;
        if (isCommuting) {
          // Arrival check — close enough to dest room centre?
          const dest = roomCenter(p.position.destination!);
          if (dest) {
            const dx = dest.x - p.position.x;
            const dy = dest.y - p.position.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= ARRIVE_RADIUS * ARRIVE_RADIUS) {
              // Arrived at room centre: finalise room + pick activity, then
              // (v0.6.1) immediately walk toward a furniture anchor that
              // matches the activity. Player visibly drifts to a desk /
              // sofa / coffee machine instead of clustering at the centre.
              p.position.room = p.position.destination!;
              p.position.destination = undefined;
              p.position.pathProgress = undefined;
              const roommates = this.playersInRoom(p.position.room);
              const a = assignRoomActivity(p, roommates);
              p.activity = a.activity;
              p.activityText = a.activityText;
              const anchor = pickAnchor(p, a.activity);
              if (anchor) {
                // Aim velocity at the furniture anchor; the next few ticks
                // will integrate toward it. Once close enough we treat that
                // as the new "settled" position via the in-room arrival
                // check below (the if (isCommuting) branch only fires when
                // destination is set, so we use vx/vy with no destination
                // → the in-room movement is its own micro-state).
                const adx = anchor.x - p.position.x;
                const ady = anchor.y - p.position.y;
                const adist = Math.sqrt(adx * adx + ady * ady) || 1;
                p.position.vx = (adx / adist) * SPEED_PX_PER_SEC * 0.6;
                p.position.vy = (ady / adist) * SPEED_PX_PER_SEC * 0.6;
                // v0.6.2 — pick a carried item that fits this furniture.
                p.carrying = pickCarriedItem(a.activity, anchor.kind);
              } else {
                // No furniture matched — sit at room centre as before.
                p.position.x = dest.x;
                p.position.y = dest.y;
                p.position.vx = 0;
                p.position.vy = 0;
                p.carrying = pickCarriedItem(a.activity, null);
              }
            } else {
              // Still en-route — refresh velocity vector (in case dest moved
              // OR our speed needs a steady-state update; cheap enough to
              // recompute every tick).
              const dist = Math.sqrt(distSq);
              p.position.vx = (dx / dist) * SPEED_PX_PER_SEC;
              p.position.vy = (dy / dist) * SPEED_PX_PER_SEC;
              // Keep pathProgress as a 0..1 hint for legacy v0.4 clients.
              const fromCenter = roomCenter(p.position.room);
              if (fromCenter) {
                const totalDx = dest.x - fromCenter.x;
                const totalDy = dest.y - fromCenter.y;
                const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
                if (totalDist > 0) {
                  const traveled = Math.sqrt(
                    (p.position.x - fromCenter.x) ** 2 +
                    (p.position.y - fromCenter.y) ** 2
                  );
                  p.position.pathProgress = Math.max(0, Math.min(1, traveled / totalDist));
                }
              }
            }
          }
        } else if (p.position.vx || p.position.vy) {
          // v0.6.1 — in-room walk toward a furniture anchor (set on
          // arrival above). Reuse the same arrival check at a tighter
          // radius so the player snaps cleanly to the anchor instead of
          // overshooting on a fast tick. No room change.
          const ANCHOR_ARRIVE_RADIUS = 10;
          // Re-derive the anchor target from the activity so we're not
          // chasing stale coordinates if the activity changed mid-walk.
          const anchor = pickAnchor(p, p.activity ?? { kind: 'idle' });
          if (!anchor) {
            // Affinity gone — kill velocity, settle in place.
            p.position.vx = 0;
            p.position.vy = 0;
          } else {
            const adx = anchor.x - p.position.x;
            const ady = anchor.y - p.position.y;
            const adistSq = adx * adx + ady * ady;
            if (adistSq <= ANCHOR_ARRIVE_RADIUS * ANCHOR_ARRIVE_RADIUS) {
              // Snap + stop. Subsequent ticks fall through to the settled
              // branch and stay put until COMMUTE_START_PROB fires.
              p.position.x = anchor.x;
              p.position.y = anchor.y;
              p.position.vx = 0;
              p.position.vy = 0;
            } else {
              const adist = Math.sqrt(adistSq);
              p.position.vx = (adx / adist) * SPEED_PX_PER_SEC * 0.6;
              p.position.vy = (ady / adist) * SPEED_PX_PER_SEC * 0.6;
            }
          }
        } else if (Math.random() < COMMUTE_START_PROB) {
          // Pick a different room to walk to.
          const choices = ROOMS.filter((r) => r !== p.position.room);
          const destRoom = choices[Math.floor(Math.random() * choices.length)];
          const dest = roomCenter(destRoom);
          if (dest) {
            p.position.destination = destRoom;
            p.position.pathProgress = 0;
            const dx = dest.x - p.position.x;
            const dy = dest.y - p.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            p.position.vx = (dx / dist) * SPEED_PX_PER_SEC;
            p.position.vy = (dy / dist) * SPEED_PX_PER_SEC;
            p.activity = { kind: 'commute' };
            p.activityText = commuteCaption(p, destRoom);
            // v0.6.2 — drop whatever they were holding before walking off
            // (no carrying-while-walking; future v0.6.3 may keep persistent
            // items like 工牌 on a permanent slot).
            p.carrying = null;
          }
        } else {
          // Settled at anchor (or never picked one). Activity caption
          // refresh + occasional anchor-shuffle when the activity changes.
          if (t % 5 === 4) {
            const roommates = this.playersInRoom(p.position.room);
            const a = assignRoomActivity(p, roommates);
            const oldKind = p.activity?.kind;
            p.activity = a.activity;
            p.activityText = a.activityText;
            // If activity kind changed, pick a new anchor (may walk to a
            // different desk / sofa / coffee machine in the same room).
            if (oldKind !== a.activity.kind) {
              const newAnchor = pickAnchor(p, a.activity);
              if (newAnchor) {
                const ndx = newAnchor.x - p.position.x;
                const ndy = newAnchor.y - p.position.y;
                const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
                if (ndist > 12) {
                  p.position.vx = (ndx / ndist) * SPEED_PX_PER_SEC * 0.5;
                  p.position.vy = (ndy / ndist) * SPEED_PX_PER_SEC * 0.5;
                }
              }
            }
          }
        }
      }

      // Broadcast the lightweight tick payload for client-side dead-reckoning.
      const tickPayload: PlayerTickInfo[] = this.state.players.map((p) => ({
        id: p.id,
        position: p.position,
        activity: p.activity,
        activityText: p.activityText,
        // v0.6.2 — carried item refreshed every tick.
        carrying: p.carrying ?? null,
      }));
      this.emit('tick', { players: tickPayload, tickAt: Date.now() });

      await delay(TICK_INTERVAL_MS);
    }

    // ---- Post-roam: original kill / task / body-discovery logic ----
    // Force everyone to settle on their target room so the kill check works
    // on real room residency, not "currently mid-corridor".
    for (const p of this.alivePlayers()) {
      if (p.position.destination) {
        const dest = roomCenter(p.position.destination);
        p.position.room = p.position.destination;
        if (dest) {
          p.position.x = dest.x;
          p.position.y = dest.y;
        }
        p.position.destination = undefined;
        p.position.pathProgress = undefined;
        p.position.vx = 0;
        p.position.vy = 0;
      }
    }

    // v6.52 P1 — resolve special-role night actions (medic protect / detective
    // investigate) BEFORE the kill so a protected target survives this round.
    this.resolveNightActions();

    // Dogs attempt kills
    const dogs = this.alivePlayers().filter((p) => p.team === Team.DOG && p.killCooldown <= 0);
    for (const dog of dogs) {
      const nearby = this.alivePlayers().filter(
        (p) => p.id !== dog.id && p.team !== Team.DOG && p.position.room === dog.position.room
          // v6.85 P2 — 双公司:内鬼只裁本公司同事(跳槽后跟着裁新东家)
          && (this.state.config.mode !== 'dual' || p.companyId === dog.companyId)
      );
      if (nearby.length > 0) {
        const victim = nearby[Math.floor(Math.random() * nearby.length)];
        // Attempt is consumed regardless of outcome (no re-pick on a save).
        dog.killCooldown = this.state.config.killCooldown;

        // v6.52 P1 / v6.53 P1 — resolve protections: 工会代表 nullifies,
        // 法务顾问 body-blocks (dies in the victim's place), else it lands.
        const bodyguard = this.state.players.find((p) => p.role === Role.BODYGUARD_CAT);
        const res = resolveKillTarget(victim.id, {
          protectedId: this.state.protectedPlayerId,
          bodyguardTargetId: this.state.bodyguardTargetId,
          bodyguardId: bodyguard?.id,
          bodyguardAlive: bodyguard?.isAlive ?? false,
          // v6.83 — 观众筹码买的一次性保护协议
          interventionShieldId: this.interventionShieldId ?? undefined,
        });

        if (res.outcome === 'blocked') {
          if (res.by === 'shield') {
            this.interventionShieldId = null; // 挡一刀即消费
            this.addEvent('intervene', `🛡 观众众筹的「裁员保护协议」生效 — ${victim.name} 这刀被合同条款弹开了`);
          } else {
            this.addEvent('protect', `${victim.name} 本来要被"优化",被工会代表暗中保住了`);
          }
          this.emitState();
          break;
        }

        // Whoever actually goes down — the victim, or the 法务顾问 who threw
        // itself in front.
        const downed = this.state.players.find((p) => p.id === res.dies) ?? victim;
        downed.isAlive = false;
        this.state.deadBodyLocation = downed.position.room;

        if (res.outcome === 'intercepted') {
          this.addEvent('intercept', `${downed.name}(法务顾问)用法律手段替 ${victim.name} 挡了一刀,自己被"优化"了`);
        } else {
          this.addEvent('kill', `${dog.name} 在 ${downed.position.room} "优化"了 ${downed.name}`);
        }
        this.emit('kill', {
          killerId: dog.id,
          killerName: dog.name,
          victimId: downed.id,
          victimName: downed.name,
          location: downed.position.room,
          // v6.24 P1 — include personality so the client's EliminationReveal
          // doesn't race a stale players.find lookup.
          victimPersonality: downed.personality,
        });
        this.emitState();
        break; // Only one kill per free-roam
      }
    }

    // Cat players do tasks
    for (const p of this.alivePlayers().filter((pp) => pp.team === Team.CAT)) {
      this.taskManager.progressTasks(p.id, p.position.room);
    }
    this.updateTaskProgress();

    // Reduce kill cooldowns
    for (const p of this.alivePlayers()) {
      if (p.killCooldown > 0) p.killCooldown--;
    }

    // Random body discovery triggers meeting
    if (this.state.deadBodyLocation) {
      const discoverer = this.alivePlayers().find(
        (p) => p.position.room === this.state.deadBodyLocation && p.team !== Team.DOG
      );
      if (discoverer) {
        this.state.meetingCaller = discoverer.id;
        this.addEvent('body_found', `${discoverer.name} 在 ${this.state.deadBodyLocation} 发现有人被裁了!`);
      }
    }
  }

  /** Return all alive players currently in a given room (excludes commuters). */
  private playersInRoom(room: string): PlayerState[] {
    return this.alivePlayers().filter(
      (p) => p.position.room === room && typeof p.position.pathProgress !== 'number',
    );
  }

  private async runDiscussion(): Promise<void> {
    const alive = this.alivePlayers();
    const dead = this.deadPlayers();
    const context = this.buildDiscussionContext();

    // Speakers go in a randomized order so the "first speaker sets the tone" role rotates.
    const speakingOrder = shuffle(alive);

    // ------------------------------------------------------------------
    // 2-wave parallelization. The original implementation generated each
    // speech sequentially so late speakers could react to earlier ones
    // (cascading debate). That correctness property is worth preserving,
    // but 8 × ~4s serial ≈ 32 s is unacceptable for UX.
    //
    // Compromise: split speakers into two waves (first-half, second-half).
    // Wave 1 speaks in parallel to set the tone. Wave 2 speaks in parallel
    // while seeing ALL of Wave 1's speeches as prior context. This keeps
    // the "responders react to openers" dynamic natural debates already
    // have, while cutting wall-clock to 2 × ~4s ≈ 8-10s.
    //
    // For tiny games (≤3 alive) a single wave is fine — there's not much
    // back-and-forth to lose.
    // ------------------------------------------------------------------
    const WAVE_COUNT = speakingOrder.length <= 3 ? 1 : 2;
    const waveSize = Math.ceil(speakingOrder.length / WAVE_COUNT);
    const waves: PlayerState[][] = [];
    for (let i = 0; i < speakingOrder.length; i += waveSize) {
      waves.push(speakingOrder.slice(i, i + waveSize));
    }

    const speeches: Array<{ playerId: string; playerName: string; text: string; role: string; team: Team }> = [];

    for (const wave of waves) {
      // Snapshot priorSpeeches AT WAVE START so all speakers in this wave see
      // the same context (deterministic). Speakers within a wave don't react
      // to each other — they react to the wave(s) before them.
      const priorSpeeches = speeches.map((s) => ({ name: s.playerName, text: s.text }));

      const waveResults = await Promise.allSettled(
        wave.map(async (player) => {
          const agent = this.agents.get(player.id);
          if (!agent) {
            return { player, text: this.fallbackSpeech(player) };
          }
          // BaseAgent.generateSpeech never throws (callLLMWithTimeout returns
          // fallback on failure), but wrap anyway — any future change that
          // lets it throw shouldn't short-circuit the wave.
          try {
            // v5.8.1 — pass game scope so BaseAgent can recall cross-game
            // memories for this personality archetype. Safe to pass even
            // when memory subsystem is down (recall fails open).
            const text = await agent.generateSpeech(context, priorSpeeches, {
              gameId: this.state.id,
              round: this.state.round,
              // v6.25 P1 — feed user-submitted psy-war leaks into the
              // speech prompt. AI may believe / discredit / ignore based
              // on personality. Capped to 5 in BaseAgent itself.
              leakedHints: this.leakedHints,
              // v6.83 — 观众聚光灯:取走即消费(delete 返回 true = 本次加戏)。
              spotlight: this.spotlightIds.delete(player.id),
            });
            return { player, text };
          } catch {
            return { player, text: this.fallbackSpeech(player) };
          }
        }),
      );

      // Preserve the speakingOrder sequence inside each wave so the UI shows
      // speeches in a consistent order (not dependent on which LLM call
      // returned first).
      for (let i = 0; i < wave.length; i++) {
        const r = waveResults[i];
        const player = wave[i];
        const text =
          r.status === 'fulfilled' ? r.value.text : this.fallbackSpeech(player);
        speeches.push({
          playerId: player.id,
          playerName: player.name,
          text,
          role: player.role,
          team: player.team,
        });
      }
    }

    // Remember this round's speeches so future rounds can reference them
    this.lastRoundSpeeches = speeches.map((s) => ({ name: s.playerName, text: s.text }));

    // Ghost comments (弹幕吐槽) — no cascading reaction needed, fully parallel.
    if (dead.length > 0) {
      const ghostResults = await Promise.allSettled(
        dead.map(async (ghost) => {
          const agent = this.agents.get(ghost.id);
          if (!agent) return null;
          const text = await agent.generateGhostComment(context);
          return {
            playerId: ghost.id,
            playerName: ghost.name,
            text,
            role: ghost.role,
            team: ghost.team,
          };
        }),
      );
      const ghostComments = ghostResults
        .filter(
          (r): r is PromiseFulfilledResult<{
            playerId: string;
            playerName: string;
            text: string;
            role: string;
            team: Team;
          }> => r.status === 'fulfilled' && r.value !== null,
        )
        .map((r) => r.value);
      if (ghostComments.length > 0) {
        this.emit('ghost_comments', ghostComments);
      }
    }

    // Emit all speeches as a batch - socket handler will process sequentially
    // Wait for socket handler to signal completion via resolveDiscussion()
    //
    // Deadlock defense: if the socket handler crashes / all clients disconnect
    // / processSpeechQueue hangs, we MUST still unblock the game loop or the
    // whole game halts indefinitely (and eventually runs out of sockets).
    //
    // Budget: 8 speeches × ~20s each + buffer ≈ 4 min. Anything beyond that is
    // pathological — force resolve so the game can advance to voting.
    const DISCUSSION_HARD_TIMEOUT_MS = 4 * 60 * 1000;

    const waitForPlayback = new Promise<void>((resolve) => {
      this.discussionResolver = resolve;
    });

    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      hardTimer = setTimeout(() => {
        this.log.warn(
          { timeoutMs: DISCUSSION_HARD_TIMEOUT_MS },
          'discussion playback exceeded hard timeout — force-resolving',
        );
        resolve();
      }, DISCUSSION_HARD_TIMEOUT_MS);
    });

    try {
      this.emit('discussion_speeches', speeches);
      await Promise.race([waitForPlayback, timeoutPromise]);
    } finally {
      if (hardTimer) clearTimeout(hardTimer);
      // Always clear the resolver — if the timeout won the race, the socket
      // handler may still invoke resolveDiscussion() later; make it a no-op.
      this.discussionResolver = undefined;
    }
  }

  /** Called by socket handler when all speeches have been played */
  resolveDiscussion(): void {
    this.discussionResolver?.();
    this.discussionResolver = undefined;
  }

  private async runVoting(): Promise<void> {
    this.state.votes = {};
    this.state.ghostVotes = {};
    this.smearPressure = {}; // v6.89 — 每轮投票前清掉上一轮的抹黑舆论票
    const alive = this.alivePlayers();
    const dead = this.deadPlayers().filter((p) => !p.ghostVoteUsed);
    const context = this.buildDiscussionContext();
    const aliveCandidates = alive.map((p) => ({ id: p.id, name: p.name }));

    // v6.75 ① — 关系网反哺投票:先把整图 + archetype↔playerId 映射备好(best-effort);投完
    // 票后用真·世仇把票拽过去(不只嘴上记仇)。读图失败退回空图 = 不反哺,绝不阻断投票。
    const relationGraph = await this.loadRelationGraphSafe();
    const archByPlayer = new Map<string, string>();
    const playerByArch = new Map<string, string>();
    const nameById = new Map<string, string>();
    for (const p of alive) {
      nameById.set(p.id, p.name);
      if (p.personality) {
        archByPlayer.set(p.id, p.personality);
        if (!playerByArch.has(p.personality)) playerByArch.set(p.personality, p.id);
      }
    }

    // v6.85 P2 — 双公司:先跑跨司动作(挖人,吃关系图),再各司关起门投票。
    const isDual = this.state.config.mode === 'dual';
    if (isDual) {
      await this.maybeCrossActions(relationGraph);
      this.maybeCrossSmear(); // v6.89 — 挖角之后放风抹黑(给被黑者加舆论票)
    }
    /** 双公司时投票/旧账都只在本公司圈内;单公司 = 全员。 */
    const candidatesFor = (p: PlayerState) =>
      isDual && p.companyId
        ? aliveCandidates.filter((c) =>
            this.state.players.find((x) => x.id === c.id)?.companyId === p.companyId)
        : aliveCandidates;

    // All alive players vote simultaneously
    const votePromises = alive.map(async (player) => {
      const agent = this.agents.get(player.id);
      if (!agent) return;

      const myCandidates = candidatesFor(player);
      const myCandidateArchs = myCandidates
        .map((c) => archByPlayer.get(c.id))
        .filter((a): a is string => !!a);
      try {
        const target = await agent.generateVote(context, myCandidates);
        this.state.votes[player.id] = this.grudgeRedirect(
          player, target, relationGraph, archByPlayer, playerByArch, nameById, myCandidateArchs,
        );
      } catch {
        // Random vote on failure(双公司时也只随机到本公司)
        const others = myCandidates.filter((c) => c.id !== player.id);
        const pick = others[Math.floor(Math.random() * others.length)];
        this.state.votes[player.id] = pick?.id ?? 'skip';
      }
    });

    // Dead players use ghost vote (劳动仲裁投票) - each can only vote once ever.
    //
    // v6.24 P2 — emit a real-time `ghost_vote_cast` event the instant each
    // ghost picks their target, so the GhostChatPanel ally indicator and
    // the GameMap 👻N dot can update incrementally during voting phase
    // (previously the tally arrived in one batch at vote_result).
    const ghostVotePromises = dead.map(async (ghost) => {
      const agent = this.agents.get(ghost.id);
      if (!agent) return;

      try {
        const target = await agent.generateGhostVote(context, candidatesFor(ghost));
        if (target !== 'pass') {
          this.state.ghostVotes[ghost.id] = target;
          ghost.ghostVoteUsed = true;
          this.addEvent('ghost_vote', `离职员工 ${ghost.name} 发起了劳动仲裁投票!`);
          // Real-time signal — single ghost just voted.
          this.emit('ghost_vote_cast', {
            ghostId: ghost.id,
            ghostName: ghost.name,
            target,
          });
        }
      } catch {
        // Ghost votes default to pass on failure (save for later)
      }
    });

    // Use allSettled: a single rejection from Promise.all short-circuits the
    // remaining voters, but their async writes to state.votes / state.ghostVotes
    // still land — potentially AFTER resolveVotes() has run, producing phantom
    // votes. allSettled guarantees every voter has finished writing before we
    // tally. Inner try/catch should already prevent rejection, but this is the
    // last line of defense for unexpected sync failures (e.g. corrupted agent).
    const settled = await Promise.allSettled([...votePromises, ...ghostVotePromises]);
    const rejections = settled.filter((r) => r.status === 'rejected');
    if (rejections.length > 0) {
      this.log.warn(
        {
          rejected: rejections.length,
          total: settled.length,
          reasons: rejections.map((r) => (r as PromiseRejectedResult).reason),
        },
        'vote promises rejected unexpectedly',
      );
    }

    // v6.8 — record per-character suspicion tally for PersonaCard stats.
    // Looks up each vote target's character name (lookup-by-id from the
    // alive roster) and bumps their suspicionsReceived counter. Ghost
    // votes count the same — they're still suspicion votes against the
    // target. Fire-and-forget; recordVoteAgainst swallows its own errors.
    const idToName = new Map<string, string>();
    for (const p of this.state.players) idToName.set(p.id, p.name);
    for (const targetId of [
      ...Object.values(this.state.votes),
      ...Object.values(this.state.ghostVotes),
    ]) {
      if (targetId === 'skip') continue;
      const targetName = idToName.get(targetId);
      if (targetName) void recordVoteAgainst(targetName, this.state.id);
    }
  }

  private async resolveVotes(): Promise<void> {
    // v6.85 P2 — 分组结算:单公司 = 一个全员组(行为与历史版本完全一致);
    // 双公司 = 按投票者所属公司拆两组,各组独立计票/独立开除(一轮最多裁 2 人,
    // 每司 1 人)。每组发自己的 vote_result(双司时带 company 字段;客户端
    // 双司适配在 v6.86 演出层 —— 当前 dual 尚无 UI 入口,不影响线上)。
    const isDual = this.state.config.mode === 'dual';
    const companyOf = (pid: string): CompanyId | undefined =>
      this.state.players.find((p) => p.id === pid)?.companyId;
    const groups: Array<{ company?: CompanyId; votes: Record<string, string>; ghostVotes: Record<string, string> }> =
      isDual
        ? (['a', 'b'] as const).map((c) => ({
            company: c,
            votes: Object.fromEntries(Object.entries(this.state.votes).filter(([vid]) => companyOf(vid) === c)),
            ghostVotes: Object.fromEntries(Object.entries(this.state.ghostVotes).filter(([gid]) => companyOf(gid) === c)),
          }))
        : [{ votes: this.state.votes, ghostVotes: this.state.ghostVotes }];

    // v6.86 — 各组算各组的,但**只发一次 vote_result**(单司 1 组=原行为;
    // 双司把两组结果并进 dualEliminations[],避免客户端收到两次 vote_result 造成
    // 裁员立绘闪屏 / 下注盘双计 / ghostVotes 覆盖)。
    type ElimResult = { company?: CompanyId; eliminated?: string; eliminatedRole?: string; eliminatedPersonality?: string };
    const results: ElimResult[] = [];

    for (const g of groups) {
      const tally: Record<string, number> = {};
      for (const target of Object.values(g.votes)) tally[target] = (tally[target] || 0) + 1;
      for (const target of Object.values(g.ghostVotes)) tally[target] = (tally[target] || 0) + 1;
      // v6.89 — 商业抹黑舆论票:只折进被黑者本司那一组(单司局 smearPressure 恒空,零影响)。
      if (isDual) {
        for (const [tid, n] of Object.entries(this.smearPressure)) {
          if (companyOf(tid) === g.company) tally[tid] = (tally[tid] || 0) + n;
        }
      }

      const maxVotes = Object.values(tally).reduce((m, c) => Math.max(m, c), 0);
      const topCandidates = maxVotes > 0
        ? Object.entries(tally).filter(([, c]) => c === maxVotes)
        : [];
      const eliminated: string | undefined = topCandidates.length === 1 ? topCandidates[0][0] : undefined;

      const res: ElimResult = { company: g.company, eliminated };
      const tag = g.company ? `【${g.company === 'a' ? 'A 司' : 'B 司'}】` : '';

      if (eliminated && eliminated !== 'skip') {
        const player = this.state.players.find((p) => p.id === eliminated);
        if (player) {
          player.isAlive = false;
          res.eliminatedRole = player.role;
          res.eliminatedPersonality = player.personality;
          const ghostVoters = Object.keys(g.ghostVotes).filter((gid) => g.ghostVotes[gid] === eliminated);
          const ghostSuffix = ghostVoters.length > 0 ? ` (含${ghostVoters.length}票劳动仲裁)` : '';
          this.addEvent('vote_out', `${tag}${player.name} 被投票开除了${ghostSuffix}! 职位: ${ROLE_REGISTRY[player.role as Role]?.displayNameCN ?? player.role}`);
        }
      } else {
        this.addEvent('vote_skip', `${tag}投票平局，无人被开除`);
      }
      results.push(res);

      // v6.75 — 关系网按组喂(双司各喂各的票面,被裁者只记本司投他的人)
      void this.recordRoundRelations({
        gameId: this.state.id, round: this.state.round,
        votes: { ...g.votes },
        players: this.state.players.map((p) => ({
          id: p.id, personality: p.personality, team: p.team as unknown as string | undefined,
        })),
        eliminatedId: eliminated && eliminated !== 'skip' ? eliminated : null,
      });
    }

    // 主被裁者(单司就是唯一那个;双司取第一个真被裁的,给立绘/下注盘用单值口径)
    const primary = results.find((r) => r.eliminated && r.eliminated !== 'skip') ?? results[0];
    const eliminated = primary?.eliminated;

    this.emit('vote_result', {
      votes: this.state.votes,
      ghostVotes: this.state.ghostVotes,
      eliminated,
      eliminatedRole: primary?.eliminatedRole,
      // v6.24 P1 — include eliminated personality so client's
      // EliminationReveal can read it directly instead of doing a
      // potentially-stale players.find lookup.
      eliminatedPersonality: primary?.eliminatedPersonality,
      // v6.86 — 双公司:两司开除汇总(单司 undefined)。客户端用它显示「A 司开了X / B 司开了Y」。
      ...(this.state.config.mode === 'dual' ? { dualEliminations: results } : {}),
    });

    // v5.8.1 — round-end memory writes. Fire-and-forget; failure must
    // not block the engine tick. We snapshot the data the hook needs
    // BEFORE the void IIFE because the engine state mutates as the
    // game advances and we don't want races.
    const eliminatedSnapshot = eliminated && eliminated !== 'skip'
      ? this.state.players.find((p) => p.id === eliminated)
      : null;
    const survivorsSnapshot = this.state.players
      .filter((p) => p.isAlive)
      .map((p) => ({ id: p.id, name: p.name, personality: p.personality }));
    const gameId = this.state.id;
    const round = this.state.round;
    void this.recordRoundMemory({
      gameId, round,
      eliminated: eliminatedSnapshot
        ? { id: eliminatedSnapshot.id, name: eliminatedSnapshot.name, personality: eliminatedSnapshot.personality }
        : null,
      survivors: survivorsSnapshot,
    });

    // (v6.75 的关系网钩子已在上面的分组循环里按组喂 —— 双司各记各的账。)

    this.state.deadBodyLocation = undefined;
    this.state.meetingCaller = undefined;
    this.emitState();
  }

  /** v5.8.1 — per-round memory batch. One entry per surviving agent
   *  (witness summary) + a high-importance self-entry for whoever got
   *  eliminated. Skips agents without a personality (memory is keyed by
   *  personality archetype — no personality = no chunky-style identity).
   *
   *  Importance ranks:
   *  - 0.5 default for witness ("我看到了 X 被投出")
   *  - 0.9 for self-elimination ("我被开除了") — strongest signal
   *  - 0.8 for skip-round ("没人被投, 我活下来一轮")
   *
   *  Fully best-effort: a single failed embedding or DB hiccup loses
   *  the round's memories but doesn't impact the live game. */
  private async recordRoundMemory(args: {
    gameId: string;
    round: number;
    eliminated: { id: string; name: string; personality?: string } | null;
    survivors: Array<{ id: string; name: string; personality?: string }>;
  }): Promise<void> {
    try {
      // Lazy-require so engine doesn't carry a hard dependency on pgvector
      // for tests that stand it up in isolation. Dynamic ESM import keeps
      // the module unloaded until the first round-end actually fires.
      const { writeMemoryBatch } = await import('../services/memoryWrite');
      const entries = [];
      const elimDescriptor = args.eliminated
        ? `${args.eliminated.name} 被投票开除`
        : '本轮平票, 没人被开除';
      // v5.8.2 — tag every entry with the spectator's userId (null for
      // anonymous games). Future recalls filtered by target_user_id only
      // see memories from games THIS spectator watched.
      const spectator = this.spectatorUserId;
      // Witness entries for survivors
      for (const s of args.survivors) {
        if (!s.personality) continue;
        // Don't write a witness entry to the eliminated agent here —
        // they get a higher-importance self-entry below.
        if (args.eliminated && s.id === args.eliminated.id) continue;
        entries.push({
          agentArchetype: s.personality,
          targetUserId: spectator,
          sourceGameId: args.gameId,
          sourceRound: args.round,
          kind: 'event' as const,
          content: `在 game ${args.gameId} 第${args.round}轮全员会议, ${elimDescriptor}, 我活了下来`,
          importance: args.eliminated ? 0.5 : 0.6,
          targetPlayerId: args.eliminated?.id ?? null,
        });
      }
      // Self-elimination entry — strongest memory signal.
      if (args.eliminated && args.eliminated.personality) {
        entries.push({
          agentArchetype: args.eliminated.personality,
          targetUserId: spectator,
          sourceGameId: args.gameId,
          sourceRound: args.round,
          kind: 'event' as const,
          content: `在 game ${args.gameId} 第${args.round}轮全员会议, 我被同事们投票开除了`,
          importance: 0.9,
        });
      }
      if (entries.length === 0) return;
      await writeMemoryBatch(entries);
      this._log?.debug({ count: entries.length, round: args.round }, 'wrote round memory');

      // v5.9.0 — reflection trigger. Every ROUND_TRIGGER (=5) rounds, the
      // surviving agents' accumulated event memories get condensed into
      // 3-5 high-level beliefs. We fire reflection per unique personality
      // so we don't waste LLM calls on duplicate (archetype, spectator)
      // pairs (an 8-player game has 8 personalities, but each only
      // needs one reflection pass).
      const { maybeReflect } = await import('../services/reflectionLoop');
      const uniqueArchetypes = Array.from(
        new Set(args.survivors.map((s) => s.personality).filter((p): p is string => !!p))
      );
      // Reuse the spectator binding declared above for the witness writes.
      // Fire in parallel — each reflection is independent. Each call is
      // self-gated by maybeReflect's threshold check, so calling it on
      // every round-end is safe and cheap when no trigger has fired.
      const results = await Promise.allSettled(
        uniqueArchetypes.map((arche) =>
          maybeReflect({
            agentArchetype: arche,
            targetUserId: spectator,
            sourceGameId: args.gameId,
            currentRound: args.round,
          })
        )
      );
      const triggered = results.filter(
        (r): r is PromiseFulfilledResult<{ triggered: boolean; beliefsWritten?: number }> =>
          r.status === 'fulfilled' && r.value.triggered === true
      );
      if (triggered.length > 0) {
        const totalBeliefs = triggered.reduce((s, r) => s + (r.value.beliefsWritten ?? 0), 0);
        this._log?.info({
          archetypes: triggered.length,
          beliefs: totalBeliefs,
          round: args.round,
        }, 'reflection fired');
      }
    } catch (err) {
      this._log?.debug({ err: (err as Error).message }, 'memory write skipped');
    }
  }

  /** v6.75 — 跨局「关系网」ingest。把这轮投票(playerId 键)映射成 archetype 键,派生
   *  记仇/记恩事件喂进 relationStore。被开除者记住每个投他的人(同阵营=叛变)。纯查表 + 一次落盘,
   *  best-effort:任何失败只记 debug,绝不阻断引擎 tick。平票轮(无人开除)直接跳过。 */
  private async recordRoundRelations(args: {
    gameId: string;
    round: number;
    votes: Record<string, string>;
    players: Array<{ id: string; personality?: string; team?: string }>;
    eliminatedId: string | null;
  }): Promise<void> {
    try {
      if (!args.eliminatedId) return; // 平票:这轮不记仇
      const idToArch = new Map<string, string>();
      const teamOf: Record<string, string> = {};
      for (const p of args.players) {
        if (!p.personality) continue;
        idToArch.set(p.id, p.personality);
        if (p.team) teamOf[p.personality] = p.team;
      }
      const eliminatedArch = idToArch.get(args.eliminatedId);
      if (!eliminatedArch) return;
      // playerId 键的投票 → archetype 键(同局每个 archetype 唯一,1:1 映射)
      const votes: Record<string, string> = {};
      for (const [voterId, targetId] of Object.entries(args.votes)) {
        const va = idToArch.get(voterId);
        const ta = idToArch.get(targetId);
        if (va && ta) votes[va] = ta;
      }
      const events = eventsFromVoteResult({
        gameId: args.gameId, round: args.round, ts: Date.now(),
        votes, eliminatedArch, teamOf,
      });
      if (events.length === 0) return;
      const { ingestRelationEvents } = await import('../services/relationStore');
      await ingestRelationEvents(events);
      this._log?.debug?.({ count: events.length, eliminatedArch, round: args.round }, 'recorded relations');
    } catch (err) {
      this._log?.debug?.({ err: (err as Error).message }, 'relation ingest skipped');
    }
  }

  // ---------- Win condition check ----------

  private checkWin(): boolean {
    // v6.85 P2 — 双公司模式走独立终局矩阵(垄断/团灭/双鬼皆裁/回合上限)
    if (this.state.config.mode === 'dual') return this.checkDualWin();

    const aliveCats = this.alivePlayers().filter((p) => p.team === Team.CAT).length;
    const aliveDogs = this.alivePlayers().filter((p) => p.team === Team.DOG).length;

    if (aliveDogs === 0) {
      this.state.winner = WinCondition.CAT_WIN;
      this.addEvent('game_over', '资本家全部被赶走，打工人阵营获胜!');
      this.emit('game_over', { winner: WinCondition.CAT_WIN, reason: '资本家全部被赶走' });
      return true;
    }

    if (aliveDogs >= aliveCats) {
      this.state.winner = WinCondition.DOG_WIN;
      this.addEvent('game_over', '资本家已控制公司，资本家阵营获胜!');
      this.emit('game_over', { winner: WinCondition.DOG_WIN, reason: '资本家已控制公司' });
      return true;
    }

    // Task victory
    if (this.state.taskProgress >= 100) {
      this.state.winner = WinCondition.CAT_WIN;
      this.addEvent('game_over', '所有OKR已完成，打工人阵营获胜!');
      this.emit('game_over', { winner: WinCondition.CAT_WIN, reason: '所有OKR已完成' });
      return true;
    }

    return false;
  }

  // ---------- v6.85 P2 — 双公司终局 ----------

  /** 市占率 = 各司完成任务数 × STEP(纯派生,跳槽鼠带着业绩走——按当前 companyId 计)。 */
  private dualMarket(): MarketState {
    const done = (c: CompanyId) => this.state.players
      .filter((p) => p.companyId === c)
      .reduce((sum, p) => sum + p.tasks.filter((t) => t.completed).length, 0);
    return {
      a: Math.min(MARKET_WIN, done('a') * MARKET_STEP),
      b: Math.min(MARKET_WIN, done('b') * MARKET_STEP),
    };
  }

  /** 双公司终局:shared dualWinner 矩阵 → WinCondition + 剧场文案。 */
  private checkDualWin(): boolean {
    const aliveOf = (c: CompanyId) => this.alivePlayers().filter((p) => p.companyId === c);
    const market = this.dualMarket();
    const verdict = dualWinner({
      market,
      aliveA: aliveOf('a').length,
      aliveB: aliveOf('b').length,
      insiderAliveA: aliveOf('a').some((p) => p.team === Team.DOG),
      insiderAliveB: aliveOf('b').some((p) => p.team === Team.DOG),
      round: this.state.round,
    });
    if (!verdict.reason) return false;

    const REASON_CN: Record<string, string> = {
      monopoly: '市占率 100% — 市场垄断',
      wipeout: '对面团灭 — 全员被"优化"光了',
      insiders_down: '两边内鬼都被裁 — 比市占率定胜负',
      round_cap: '财年结束 — 比市占率定胜负',
    };
    const winner = verdict.winner === 'a'
      ? WinCondition.COMPANY_A_WIN
      : verdict.winner === 'b' ? WinCondition.COMPANY_B_WIN : WinCondition.NONE;
    const label = verdict.winner ? `${verdict.winner === 'a' ? 'A' : 'B'} 司获胜` : '两败俱伤,无人获胜';
    this.state.winner = winner;
    this.addEvent('game_over', `🏢⚔️🏢 ${label}!${REASON_CN[verdict.reason]}(市占率 A ${market.a}% : B ${market.b}%)`);
    this.emit('game_over', { winner, reason: REASON_CN[verdict.reason], market, dualReason: verdict.reason });
    return true;
  }

  /**
   * v6.85 P2 — 跨司动作(每司每回合限 1 次,50% 概率出手):挖角对面跟本司
   * 关系最好的鼠。概率走 shared poachChance(吃 v6.75 关系图);成功 → 跳槽
   * (companyId 翻面,**team 保留** —— 拍板②内鬼带身份)+ 老东家全员记 backstab。
   * 全程 best-effort,失败不阻断回合。
   */
  private async maybeCrossActions(graph: RelationGraph): Promise<void> {
    try {
      for (const company of ['a', 'b'] as const) {
        if (!canCrossAction(this.crossLedger, company, this.state.round)) continue;
        if (Math.random() >= 0.5) continue; // 这轮按兵不动
        const rival: CompanyId = company === 'a' ? 'b' : 'a';
        const recruiters = this.alivePlayers().filter((p) => p.companyId === company);
        const targets = this.alivePlayers().filter((p) => p.companyId === rival);
        if (recruiters.length === 0 || targets.length === 0) continue;

        // 选对面「对本司最有好感」的鼠(target 对任一 recruiter 的最高关系分)
        let best: { target: PlayerState; feeling: number } | null = null;
        for (const t of targets) {
          if (!t.personality) continue;
          const feeling = Math.max(...recruiters.map((r) =>
            r.personality ? feelingOf(graph, t.personality, r.personality) : 0));
          if (!best || feeling > best.feeling) best = { target: t, feeling };
        }
        if (!best) continue;

        this.crossLedger = recordCrossAction(this.crossLedger, company, this.state.round);
        const chance = poachChance(best.feeling);
        const tag = company === 'a' ? 'A 司' : 'B 司';
        if (resolvePoach(chance, Math.random())) {
          const defectMsg = `🤝 ${tag}挖角成功 — ${best.target.name} 拿着 offer 跳槽了(原同事连夜把 TA 移出群聊)`;
          this.performDefection(best.target, company, defectMsg);
        } else {
          const failMsg = `📩 ${tag}给 ${best.target.name} 发了 offer,被原地已读不回(忠诚度拉满)`;
          this.addEvent('poach_failed', failMsg);
          this.emit('cross_action', {
            kind: 'poach_failed', text: failMsg, company,
            targetId: best.target.id, targetName: best.target.name,
          });
        }
        this.emitState();
      }
    } catch (err) {
      this._log?.debug?.({ err: (err as Error).message }, 'cross action skipped');
    }
  }

  /**
   * v6.87 — 跳槽执行(AI 挖角成功 + 观众「猎头快递」共用):翻 companyId(team 不动,
   * 拍板②内鬼带身份)→ 落 defection 事件 + 实时 cross_action banner → 老东家全员记
   * backstab 喂关系图(fire-and-forget)。调用前 target.companyId 仍是「老东家」。
   */
  private performDefection(target: PlayerState, toCompany: CompanyId, text: string): void {
    const from = target.companyId;
    const oldColleagues = this.state.players
      .filter((p) => p.companyId === from && p.id !== target.id && p.personality)
      .map((p) => p.personality);
    target.companyId = toCompany;
    this.addEvent('defection', text);
    this.emit('cross_action', {
      kind: 'defection', text, company: toCompany,
      targetId: target.id, targetName: target.name,
    });
    if (target.personality) {
      const evs = eventsFromDefection({
        defectorArch: target.personality,
        oldColleagueArchs: oldColleagues,
        gameId: this.state.id, round: this.state.round, ts: Date.now(),
      });
      void import('../services/relationStore')
        .then(({ ingestRelationEvents }) => ingestRelationEvents(evs))
        .catch(() => { /* 关系网锦上添花 */ });
    }
  }

  /**
   * v6.89 — 商业抹黑(曝料):每司每回合(限 1 次,独立台账)~50% 向对家放一条真假
   * 参半的内鬼线索 —— 黑对家最逼近垄断的鼠(任务最多)。命中给被黑者加 SMEAR_PRESSURE
   * 「舆论票」,resolveVotes 计票时折进对家那一组(搅浑投票 / 加速对家自毁)。全程
   * best-effort,失败不阻断回合。Math.random 注桩可测(每出手司消耗 2 个 roll:出手判定 + 真假)。
   */
  private maybeCrossSmear(): void {
    try {
      for (const company of ['a', 'b'] as const) {
        if (!canCrossAction(this.smearLedger, company, this.state.round)) continue;
        if (!resolveSmear(Math.random())) continue; // 这轮不放风
        const rival: CompanyId = company === 'a' ? 'b' : 'a';
        const rivals = this.alivePlayers().filter((p) => p.companyId === rival);
        if (rivals.length === 0) continue;
        const pick = pickSmearTarget(
          rivals.map((p) => ({ ref: p, tasksDone: p.tasks.filter((t) => t.completed).length })),
        );
        if (!pick) continue;
        const target = pick.ref;

        this.smearLedger = recordCrossAction(this.smearLedger, company, this.state.round);
        const truthful = smearTruthful(Math.random());
        const shownTeam = truthful ? target.team : (target.team === Team.DOG ? Team.CAT : Team.DOG);
        const label = shownTeam === Team.DOG ? '资本家卧底' : '打工人卧底';
        const tag = company === 'a' ? 'A 司' : 'B 司';
        this.smearPressure[target.id] = (this.smearPressure[target.id] ?? 0) + SMEAR_PRESSURE;
        const msg = `📰 ${tag}放风抹黑 —— 内部邮件指认对家 ${target.name} 是${label}(真假参半,但够搅浑对面投票了)`;
        this.addEvent('smear', msg);
        this.emit('cross_action', {
          kind: 'smear', text: msg, company,
          targetId: target.id, targetName: target.name,
        });
      }
    } catch (err) {
      this._log?.debug?.({ err: (err as Error).message }, 'cross smear skipped');
    }
  }

  // ---------- Serialization ----------

  getSerializedState(): SerializedGameState {
    return {
      id: this.state.id,
      phase: this.state.phase,
      players: this.state.players.map((p): SerializedPlayer => ({
        id: p.id,
        name: p.name,
        isAlive: p.isAlive,
        position: p.position,
        // Include free-roam fields when present so the initial state hydrate
        // already shows everyone's activity — clients don't have to wait for
        // the first `game:tick` to learn who's doing what.
        activity: p.activity,
        activityText: p.activityText,
        // v0.6.2 — carried item, optional. Old clients ignore.
        carrying: p.carrying ?? null,
        role: p.role,
        team: p.team,
        tasksCompleted: p.tasks.filter((t) => t.completed).length,
        totalTasks: p.tasks.length,
        ghostVoteUsed: p.ghostVoteUsed,
        personality: p.personality,
        avatar: p.avatar,
        avatarKey: p.avatarKey,
        // v6.86 — 双公司所属(单公司 undefined)
        companyId: p.companyId,
      })),
      round: this.state.round,
      taskProgress: this.state.taskProgress,
      winner: this.state.winner,
      votes: this.state.votes,
      ghostVotes: this.state.ghostVotes,
      // v6.86 — 双公司:模式标记 + 实时市占率(对撞条数据源)
      ...(this.state.config.mode === 'dual'
        ? { mode: 'dual' as const, market: this.dualMarket() }
        : {}),
    };
  }

  getTimeline(): GameEvent[] {
    return [...this.timeline];
  }

  getState(): GameState {
    return this.state;
  }

  /** v6.25 P1 — append a spectator-submitted psy-war leak. Sliding
   *  window cap 5, FIFO. Length cap 80 chars to keep prompt tight.
   *  Emits 'leak_acked' so socket handler can confirm to client. */
  pushLeakedHint(rawText: string): { accepted: boolean; reason?: string } {
    const text = (rawText ?? '').trim().slice(0, 80);
    if (text.length === 0) return { accepted: false, reason: 'empty' };
    this.leakedHints.push(text);
    if (this.leakedHints.length > 5) this.leakedHints.shift();
    this.emit('leak_acked', { text, total: this.leakedHints.length });
    return { accepted: true };
  }

  /**
   * v6.83 — 观众「筹码买干预」生效点。socket handler 限流校验后调进来;
   * 筹码扣减在客户端纯引擎(信任模型同 v6.74,服务端限流兜底)。
   *   shield    给 targetId 挂一次性「裁员保护协议」(夜杀弹开,见 resolveKillTarget)
   *   clue      随机抽一只在场鼠,曝一条阵营线索(80% 真 / 20% 反,小道消息口径)
   *   spotlight 给 targetId 下次发言加戏(BaseAgent prompt 注入,取走即消费)
   */
  applyIntervention(
    itemId: 'shield' | 'clue' | 'spotlight' | 'headhunt',
    targetId?: string,
  ): { accepted: boolean; reason?: string } {
    if (this.state.phase === 'game_over') return { accepted: false, reason: 'game_over' };

    if (itemId === 'clue') {
      const pool = this.alivePlayers();
      if (pool.length === 0) return { accepted: false, reason: 'no_targets' };
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const truthful = Math.random() < 0.8;
      const shownTeam = truthful
        ? pick.team
        : (pick.team === Team.DOG ? Team.CAT : Team.DOG);
      const label = shownTeam === Team.DOG ? '资本家那边' : '打工人这边';
      this.addEvent('intervene', `🔍 观众买通了内部邮箱 — 背景调查显示 ${pick.name} 更像${label}的人(小道消息,别全信)`);
      // v6.110(审计玩法 F6)— 花 200 筹码的结果不能只躺 event log 小字:
      // 专属事件推客户端弹「内部邮件」卡,买完立刻有仪式感。
      this.emit('intervene_clue', { targetName: pick.name, label });
      this.emitState();
      return { accepted: true };
    }

    const target = this.state.players.find((p) => p.id === targetId && p.isAlive);
    if (!target) return { accepted: false, reason: 'invalid_target' };

    if (itemId === 'shield') {
      if (this.interventionShieldId) return { accepted: false, reason: 'shield_active' };
      this.interventionShieldId = target.id;
      this.addEvent('intervene', `🛡 观众众筹了一份「裁员保护协议」罩住 ${target.name} — 本轮裁不动`);
      this.emitState();
      return { accepted: true };
    }

    if (itemId === 'headhunt') {
      // v6.87 — 猎头快递:仅双公司局有效;强制目标跳槽到对家(复用 AI 挖角同一套
      // 跳槽逻辑 —— 翻 companyId、内鬼身份带走、老东家记 backstab)。不吃 crossLedger
      // 限额(这是观众真金白银买的,不占 AI 每回合那一次)。
      if (this.state.config.mode !== 'dual' || !target.companyId) {
        return { accepted: false, reason: 'not_dual' };
      }
      const toCompany: CompanyId = target.companyId === 'a' ? 'b' : 'a';
      const tag = toCompany === 'a' ? 'A 司' : 'B 司';
      this.performDefection(target, toCompany, `📦 观众众筹的「猎头快递」砸到 ${target.name} 头上 — 当场打包跳槽去了 ${tag}(内鬼身份一起带走)`);
      this.emitState();
      return { accepted: true };
    }

    // spotlight
    this.spotlightIds.add(target.id);
    this.addEvent('intervene', `🎭 观众给 ${target.name} 打了聚光灯 — 下轮发言加戏`);
    this.emitState();
    return { accepted: true };
  }

  /** v6.26 P1 / v6.27 P2 — detect if a generated speech quotes any of
   *  the current leakedHints. Hybrid two-tier match:
   *
   *    Tier 1 — sliding 8-char substring (4 in v6.27 P2 → 5 in v6.30 P5
   *             → 8 in v6.31 P4). Each bump audit-driven: v6.30 dropped
   *             generic "那个 PRD" overlap, v6.31 dropped "Helen" /
   *             "40 分钟" / "工位贴满" tier-1 leakage. 8 chars demands
   *             a full proper-noun + verb-phrase verbatim quote.
   *    Tier 2 — token-level Jaccard overlap on content tokens. Catches
   *             paraphrases the LLM rewrites — "听说有同事偷过工位的
   *             零食" still shares the {听说, 同事, 偷过, 工位, 零食}
   *             content-token set with "@Frank 偷过我工位的零食".
   *             Threshold: ≥ 42% of the SHORTER side's content tokens
   *             must overlap (was 0.30 v6.27 P2; v6.31 P4 raised
   *             to 0.42 after audit showed 工位贴满-style overlap at
   *             40% exactly producing FP; 0.42 kills them while keeping
   *             real paraphrase like Frank case at 43% intact).
   *
   *  Tokenization splits on whitespace + Chinese punctuation, then
   *  yields:
   *    - English words as-is
   *    - Chinese strings as bigrams (overlapping 2-char windows)
   *  Tokens shorter than 2 chars are dropped (stop words).
   *
   *  Public so socketHandler can call it right after `game:speech`
   *  emit and broadcast `game:leak_quoted` events. */
  detectLeakQuote(speechText: string): string | null {
    const speech = speechText ?? '';
    if (speech.length === 0 || this.leakedHints.length === 0) return null;

    // Tier 1 — substring (cheap, high-confidence)
    for (const hint of this.leakedHints) {
      const h = hint.trim();
      if (h.length < 8) continue;
      for (let i = 0; i + 8 <= h.length; i++) {
        const w = h.slice(i, i + 8);
        if (/^[\s,，。!?@\-_'"()]+$/.test(w)) continue;
        if (speech.includes(w)) return hint;
      }
    }

    // Tier 2 — token Jaccard (catches paraphrase)
    const speechTokens = leakTokenize(speech);
    if (speechTokens.size < 2) return null;
    for (const hint of this.leakedHints) {
      const hintTokens = leakTokenize(hint);
      if (hintTokens.size < 2) continue;
      let overlap = 0;
      for (const t of hintTokens) if (speechTokens.has(t)) overlap++;
      const smaller = Math.min(hintTokens.size, speechTokens.size);
      const ratio = overlap / smaller;
      if (ratio >= 0.42) return hint;
    }
    return null;
  }

  // ---------- Helpers ----------

  private alivePlayers(): PlayerState[] {
    return this.state.players.filter((p) => p.isAlive);
  }

  private deadPlayers(): PlayerState[] {
    return this.state.players.filter((p) => !p.isAlive);
  }

  private async setPhase(phase: GamePhase): Promise<void> {
    this.state.phase = phase;
    this.addEvent('phase_change', `阶段切换: ${phase}`);
    this.emit('phase_change', { phase, round: this.state.round });
    this.emitState();
  }

  private emitState(): void {
    this.emit('state', this.getSerializedState());
  }

  /**
   * v6.52 P1 / v6.53 P1+P2 — resolve the special cat roles' night actions for
   * this round. Runs at the start of post-roam, BEFORE the kill, so the
   * protectors can affect this round's "优化". Each finding becomes the acting
   * agent's PRIVATE intel (only they can act on it in discussion / voting) —
   * the spectator only sees a vague log line, never the result, so the
   * deduction stays interesting.
   *
   * Ability coverage (only roles that appear in ROLE_PRESETS are wired):
   *   ✅ DETECTIVE_CAT (HR总监)    — hard faction read         [presets 6/8/9/10/11/12]
   *   ✅ MEDIC_CAT     (工会代表)  — nullify-protect            [presets 6/8/9/10/11/12]
   *   ✅ BODYGUARD_CAT (法务顾问)  — body-block (dies for ward) [presets 9/10/11/12]
   *   ✅ VIGILANTE_CAT (数据分析师)— OKR-backlog soft tell      [presets 10/11/12]
   *   ✅ MEDIUM_CAT    (内审专员)  — audit the DEAD's faction    [presets 11/12]   (v6.56)
   *   ✅ ADVENTURER_CAT(销售冠军)  — tail a living player's room [preset 12]       (v6.56)
   *   ▪️ ENGINEER_CAT  (程序员)    — positioning flavor only, no deduction power
   */
  private resolveNightActions(): void {
    // Protections are per-round — clear last round's cover first.
    this.state.protectedPlayerId = undefined;
    this.state.bodyguardTargetId = undefined;
    const alive = this.alivePlayers();

    // 工会代表 (MEDIC_CAT) — nullify-protect one living player from tonight's kill.
    const medic = alive.find((p) => p.role === Role.MEDIC_CAT);
    if (medic) {
      const targetId = chooseProtectTarget(medic.id, alive);
      if (targetId) {
        this.state.protectedPlayerId = targetId;
        const target = this.state.players.find((p) => p.id === targetId);
        this.agents.get(medic.id)?.addRoleIntel(
          `你(工会代表)这一轮暗中罩着 ${target?.name ?? targetId},挡住了针对 TA 的"优化"。`,
        );
      }
    }

    // 法务顾问 (BODYGUARD_CAT) — body-block: if its ward is attacked, it dies
    // instead. Distinct from the medic's clean nullify (v6.53 P1).
    const bodyguard = alive.find((p) => p.role === Role.BODYGUARD_CAT);
    if (bodyguard) {
      const targetId = chooseProtectTarget(bodyguard.id, alive);
      if (targetId) {
        this.state.bodyguardTargetId = targetId;
        const target = this.state.players.find((p) => p.id === targetId);
        this.agents.get(bodyguard.id)?.addRoleIntel(
          `你(法务顾问)这一轮贴身护着 ${target?.name ?? targetId},真出事你会用法律手段替 TA 挡下(自己担风险)。`,
        );
      }
    }

    // 数据分析师 (VIGILANTE_CAT) — pull one living player's OKR backlog. Cats
    // carry real tasks; 资本家/摸鱼神 carry none, so a 0-backlog is a soft
    // "not a real worker" tell (can't tell 资本家 from 摸鱼神 — distinct from
    // the detective's hard faction read). v6.53 P2.
    const vigilante = alive.find((p) => p.role === Role.VIGILANTE_CAT);
    if (vigilante) {
      const targetId = chooseInvestigateTarget(vigilante.id, alive, this.investigatedByVigilante);
      if (targetId) {
        this.investigatedByVigilante.add(targetId);
        const target = this.state.players.find((p) => p.id === targetId);
        if (target) {
          const backlog = target.tasks?.length ?? 0;
          this.agents.get(vigilante.id)?.addRoleIntel(
            `你(数据分析师)调了 ${target.name} 的 OKR 后台:TA 名下挂着 ${backlog} 个待办${backlog === 0 ? '(一个活都没有,可疑)' : ''}。`,
          );
          this.addEvent('role_action', '📊 数据分析师这一轮扒了一个人的 OKR 后台');
        }
      }
    }

    // HR总监 (DETECTIVE_CAT) — learn one living player's true faction.
    const detective = alive.find((p) => p.role === Role.DETECTIVE_CAT);
    if (detective) {
      const targetId = chooseInvestigateTarget(detective.id, alive, this.investigatedByDetective);
      if (targetId) {
        this.investigatedByDetective.add(targetId);
        const target = this.state.players.find((p) => p.id === targetId);
        if (target) {
          this.agents.get(detective.id)?.addRoleIntel(
            `你(HR总监)查了 ${target.name} 的真实绩效档案:TA 属于 ${teamLabel(target.team)}阵营。`,
          );
          this.addEvent('role_action', '🔍 HR总监这一轮暗中查了一个人的底');
        }
      }
    }

    // 内审专员 (MEDIUM_CAT) — audit ONE departed (dead) employee's file and
    // learn their true faction. Distinct from HR总监 (which reads the LIVING):
    // the 内审专员 reads the dead, so it can retroactively confirm "was that
    // fired person actually 资本家?". Nothing to audit until someone's left
    // (round 1 → null → skipped). v6.56.
    const medium = alive.find((p) => p.role === Role.MEDIUM_CAT);
    if (medium) {
      const dead = this.state.players.filter((p) => !p.isAlive);
      const targetId = chooseInvestigateTarget(medium.id, dead, this.auditedByMedium);
      if (targetId) {
        this.auditedByMedium.add(targetId);
        const target = this.state.players.find((p) => p.id === targetId);
        if (target) {
          this.agents.get(medium.id)?.addRoleIntel(
            `你(内审专员)翻了已离职的 ${target.name} 的档案:TA 当年其实属于 ${teamLabel(target.team)}阵营。`,
          );
          this.addEvent('role_action', '🔎 内审专员这一轮查了一份离职员工的档案');
        }
      }
    }

    // 销售冠军 (ADVENTURER_CAT) — 人脉广: tail ONE living player and learn where
    // they ended up tonight + who else was in that room (co-location). A soft
    // tell for who's grouping with whom (e.g. a 资本家 lurking near a victim).
    // v6.56.
    const adventurer = alive.find((p) => p.role === Role.ADVENTURER_CAT);
    if (adventurer) {
      const targetId = chooseInvestigateTarget(adventurer.id, alive, this.trackedByAdventurer);
      if (targetId) {
        this.trackedByAdventurer.add(targetId);
        const target = this.state.players.find((p) => p.id === targetId);
        if (target) {
          const room = target.position?.room ?? '某处';
          const others = alive
            .filter((p) => p.id !== target.id && p.position?.room === room)
            .map((p) => p.name);
          const company = others.length ? `身边还有 ${others.join('、')}` : '独来独往、身边没人';
          this.agents.get(adventurer.id)?.addRoleIntel(
            `你(销售冠军)靠人脉摸到 ${target.name} 今晚的行踪:TA 在 ${room},${company}。`,
          );
          this.addEvent('role_action', '🏆 销售冠军这一轮追踪了一个人的行踪');
        }
      }
    }
  }

  private addEvent(type: string, description: string): void {
    this.timeline.push({
      round: this.state.round,
      phase: this.state.phase,
      type,
      description,
      timestamp: Date.now(),
    });
  }

  /** v6.75 ① — 读跨局关系图,任何失败(没 store / IO 错)都退回空图,绝不阻断投票。 */
  private async loadRelationGraphSafe(): Promise<RelationGraph> {
    try {
      const { getRelationGraph } = await import('../services/relationStore');
      return await getRelationGraph();
    } catch {
      return emptyGraph();
    }
  }

  /**
   * v6.75 ① — 关系网反哺投票:基础票之上,若候选里有 voter 的**真·世仇**(≤FOE 阈值)且没投他,
   * 就把票拽过去 + 时间线甩一句旧账。archetype 维度算,映射回本局 playerId。任何缺失退回原票。
   * v6.85 P2 — candidateArchs 由调用方限定(双公司时只含本司,世仇在对面拽不动票)。
   */
  private grudgeRedirect(
    voter: PlayerState,
    basePickId: string,
    graph: RelationGraph,
    archByPlayer: Map<string, string>,
    playerByArch: Map<string, string>,
    nameById: Map<string, string>,
    candidateArchs?: readonly string[],
  ): string {
    try {
      const holderId = voter.personality;
      const basePick = archByPlayer.get(basePickId);
      if (!holderId || !basePick) return basePickId;
      const r = resolveVoteWithGrudge({
        basePick,
        candidateIds: candidateArchs ?? [...archByPlayer.values()],
        graph,
        holderId,
        round: this.state.round,
      });
      if (!r.redirected || !r.foeId) return basePickId;
      const foePlayerId = playerByArch.get(r.foeId);
      if (!foePlayerId || foePlayerId === basePickId) return basePickId;
      const foeName = nameById.get(foePlayerId) ?? '老冤家';
      this.addEvent('grudge_vote', `🗡️ ${voter.name} 翻旧账改投 ${foeName}:${r.taunt}`);
      // v6.111(审计玩法 F12)— 跨局恩怨是最强留存钩子,但入口(恩怨录按钮)藏得深;
      // 恩怨真发生时推实时事件,客户端给按钮点红,引导用户发现关系网。
      this.emit('grudge_vote', { voterName: voter.name, foeName, taunt: r.taunt });
      return foePlayerId;
    } catch {
      return basePickId;
    }
  }

  private updateTaskProgress(): void {
    const catPlayers = this.state.players.filter((p) => p.team === Team.CAT);
    if (catPlayers.length === 0) {
      this.state.taskProgress = 0;
      return;
    }
    const totalTasks = catPlayers.reduce((sum, p) => sum + p.tasks.length, 0);
    const completedTasks = catPlayers.reduce(
      (sum, p) => sum + p.tasks.filter((t) => t.completed).length,
      0
    );
    this.state.taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }

  private buildDiscussionContext(): string {
    const alive = this.alivePlayers();
    const playerList = alive.map((p) => `${p.name}(在${p.position.room})`).join('、');
    const deadPlayers = this.state.players.filter((p) => !p.isAlive);
    const deadNames = deadPlayers.map((p) => p.name).join('、');

    let ctx = `第${this.state.round}轮全员大会。在职员工: ${playerList}。`;
    if (deadNames) {
      ctx += ` 已被裁员: ${deadNames}。`;
      const ghostVoters = deadPlayers.filter((p) => !p.ghostVoteUsed);
      if (ghostVoters.length > 0) {
        ctx += ` 注意: ${ghostVoters.map(p => p.name).join('、')}仍持有劳动仲裁投票权(各1票)!`;
      }
    }
    if (this.state.deadBodyLocation) {
      ctx += ` 有人在${this.state.deadBodyLocation}被"优化"了!`;
      const nearBody = alive.filter((p) => p.position.room === this.state.deadBodyLocation);
      if (nearBody.length > 0) {
        ctx += ` 事发时在${this.state.deadBodyLocation}附近的人: ${nearBody.map(p => p.name).join('、')}(非常可疑!)。`;
      }
    }
    if (this.state.meetingCaller) {
      const caller = this.state.players.find((p) => p.id === this.state.meetingCaller);
      if (caller) ctx += ` 紧急会议由 ${caller.name} 发起。`;
    }

    const recentEvents = this.timeline.filter(e => e.round === this.state.round);
    if (recentEvents.length > 0) {
      ctx += ` 本轮事件: ${recentEvents.map(e => e.description).join('; ')}。`;
    }

    // Last round's speeches — feed in 3 most memorable lines so feuds carry over
    if (this.lastRoundSpeeches.length > 0 && this.state.round > 1) {
      const recap = this.lastRoundSpeeches.slice(-3)
        .map((s) => `${s.name}上轮说过:"${s.text.slice(0, 60)}${s.text.length > 60 ? '...' : ''}"`)
        .join(' | ');
      ctx += ` 上一轮会议记忆: ${recap}。`;
    }

    ctx += ' 注意:这是一场激烈的职场辩论!要用职场黑话互相质疑、指名道姓、戳穿对方话术,揪出藏在公司里的资本家内鬼。要有针对性地回应前面同事的发言,形成真正的辩论,而不是各说各话!';
    return ctx;
  }

  private fallbackSpeech(player: PlayerState): string {
    if (player.team === Team.DOG) {
      const lines = [
        '这个事情的owner到底是谁？我建议大家先对齐一下信息再来甩锅！',
        '你们有完没完？我OKR都快做完了，凭什么说我摸鱼？拿出数据来！',
        '笑死了，真正的资本家就在你们身边，你们还在这瞎猜！先看看谁KPI最低！',
        '我看你才最可疑吧？天天开会不产出，你的工作量经得起审计吗？',
        '你说我可疑？我上个季度绩效3.75好吧！你呢？连周报都写不好的人有什么资格质疑我！',
        '行行行，格局打开一点好不好？我觉得我们应该聚焦核心链路，而不是互相甩锅！',
        '你这是典型的转移视线！越是大声嚷嚷的人越有问题，大家拉齐认知看清楚了！',
        '我的产出大家有目共睹，你倒是说说你的不在场证明？哑巴了？',
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }
    if (player.team === Team.CAT) {
      const lines = [
        '别装了！你天天说赋能赋能，你到底干了啥活？大家赶紧投他！',
        '又画大饼？你倒是先把上次的OKR兑现了啊！说好的年终奖呢？',
        '你刚才的发言漏洞百出，全是黑话没有干货！你不是内鬼谁是内鬼！',
        '兄弟们，这种天天开会不干活的，不裁他裁谁？我敢打赌就是他！',
        '你说你一直在搬砖？那为什么每次有人被裁你都恰好不在现场？',
        '我已经盯了你好几轮了，你的活动轨迹完全不像在做任务，纯摸鱼！',
        '别被他PUA了！他每次发言都在试图让我们互相怀疑，经典资本家战术！',
        '你说的降本增效是不是就是降我的本增你的效？大家醒醒！',
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }
    const neutralLines = [
      '都别吵了，反正都是给资本家打工，谁走不是走，我就看看戏！',
      '哟，又在团建呢？上次团建完就裁了三个人呢，大家小心啊！',
      '我倒觉得你们两个都挺可疑的，不如一起开除算了？反正公司不缺人！',
      '你们吵你们的，我继续摸鱼。不过话说回来，有人注意到某些人一直沉默不语吗？',
    ];
    return neutralLines[Math.floor(Math.random() * neutralLines.length)];
  }
}
