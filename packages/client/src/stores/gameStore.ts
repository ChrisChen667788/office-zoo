/**
 * Game state store — fine-grained selectors to minimize re-renders.
 *
 * ## Why atomic selectors?
 *
 * Default `useGameStore()` subscribes to the *entire* store; any `set(...)` call
 * (even `setAvatarUrl`) invalidates the root object reference and forces every
 * consumer to re-render. On a busy game turn, with 9 listeners dispatching 3-5
 * actions each, that's ~40 full re-renders of Classic.tsx per round.
 *
 * Each exported hook below (e.g. `usePhase`) subscribes only to its own slice,
 * so React skips renders when unrelated state mutates. Actions live under a
 * frozen `actions` object whose reference never changes, so
 * `useGameActions()` never re-renders.
 *
 * ## Usage
 *
 *   const phase = usePhase();
 *   const players = usePlayers();
 *   const { addSpeech, updateState } = useGameActions();
 *
 * Don't do: `const { phase, players } = useGameStore()` — re-renders on *every*
 * change because the object identity flips each `set()`.
 */
import { create } from 'zustand';
import { uid } from '../utils/uid';

/** Mirrors @furball/shared.Activity. Duplicated locally so the store doesn't
 *  need a build-time dep on shared (avoids monorepo rootDir headaches and
 *  keeps the client buildable in isolation). */
export type ActivityKind =
  | 'idle' | 'work' | 'chat' | 'sneak' | 'meeting' | 'commute';
export interface ActivityInfo {
  kind: ActivityKind;
  subject?: string;
  withId?: string;
  targetId?: string;
}

/** v0.6.2 — items players can be holding. Mirrors shared.ItemKind. */
export type ItemKindInfo = 'cup' | 'folder' | 'recorder' | 'badge' | 'paper' | 'mug';
export interface CarriedItemInfo {
  kind: ItemKindInfo;
  sourceFurnitureId?: string;
}

export interface GamePlayer {
  id: string;
  name: string;
  isAlive: boolean;
  /** Free-roam tick layer: `pathProgress`/`destination` are present only
   *  while the player is mid-corridor. Old GameEngine versions never set
   *  them, in which case clients render at the room centre as before. */
  position: {
    x: number;
    y: number;
    room: string;
    pathProgress?: number;
    destination?: string;
  };
  /** Optional — only populated by engine ≥ PR1. */
  activity?: ActivityInfo;
  /** Pre-formatted activity caption, e.g. "Frank 在 茶水间 倒第三杯咖啡". */
  activityText?: string;
  /** v0.6.2 — what the player is currently holding. Null when empty-handed. */
  carrying?: CarriedItemInfo | null;
  role?: string;
  team?: string;
  tasksCompleted: number;
  totalTasks: number;
  ghostVoteUsed?: boolean;
  personality?: string;
  /** v6.39 P3 — emoji avatar from a 公司主题包 NPC; GameMap renders it
   *  instead of the role image when present. */
  avatar?: string;
  /** v6.55 #2 — unique avatar key (falls back to role). */
  avatarKey?: string;
  /** v6.86 — 双公司模式所属公司('a'|'b');单公司 undefined。服务端已透传,
   *  此处补声明给 GameMap 双半区上色 + 公司外环用。 */
  companyId?: 'a' | 'b';
}

interface SpeechItem {
  playerId: string;
  playerName: string;
  text: string;
  role?: string;
  team?: string;
  /** v6.8 P4.1 — evidence references parsed from the speech text
   *  server-side. Each ref points back to a prior round speech the
   *  current speaker is citing. Optional — older speeches and ghost
   *  comments don't carry this. */
  evidence?: Array<{
    refToPlayerId: string;
    refToPlayerName: string;
    refToTextSnippet: string;
    kind: 'mention' | 'at_tag' | 'fuzzy';
  }>;
}

/** 离职员工弹幕 */
export interface GhostCommentItem {
  /** UUID — used as React key. String, not number, to avoid HMR/counter-reset collisions. */
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  role?: string;
  team?: string;
  timestamp: number;
}

/**
 * Elimination log — append-only record of every kill/vote in the game.
 *
 * Populated by the Classic/Immersive socket handlers, consumed by HighlightReel
 * at game_over. Lives in the store (not a component) because the same data
 * feeds both modes and must survive mid-game remounts (StrictMode, HMR).
 */
export interface EliminationLogEntry {
  /** Monotonic id — also drives the `EliminationReveal` trigger. */
  id: number;
  round: number;
  type: 'kill' | 'vote';
  playerId: string;
  playerName: string;
  role?: string;
  team?: 'cat' | 'dog' | 'neutral';
  location?: string;
  timestamp: number;
  /** v6.41 P2 — emoji avatar from a 公司主题包 NPC, so HighlightReel's
   *  timeline shows the custom glyph in the recap instead of just the
   *  generic kill/vote icon. Undefined for default rosters. */
  avatar?: string;
}

/**
 * Prediction log — per-round outcome of the user's pick.
 *
 * PredictionBar is the sole writer (on vote_result resolution). HighlightReel
 * reads it to compute "this game" accuracy separate from the all-time stats
 * that PredictionBar persists in localStorage.
 */
export interface PredictionLogEntry {
  round: number;
  pickId: string;
  pickName: string;
  actualId: string | null;
  actualName: string | null;
  correct: boolean;
}

interface GameActions {
  setGameId: (id: string) => void;
  updateState: (state: any) => void;
  /** Merge per-tick free-roam updates (position + activity) into existing
   *  players. Lighter than `updateState` — only touches the moving fields. */
  applyTick: (tick: {
    players: Array<{
      id: string;
      position: GamePlayer['position'];
      activity?: ActivityInfo;
      activityText?: string;
      carrying?: CarriedItemInfo | null;
    }>;
    tickAt: number;
  }) => void;
  setSpeaker: (playerId: string | null) => void;
  addSpeech: (speech: SpeechItem) => void;
  setDiscussionProgress: (current: number, total: number, round: number) => void;
  clearDiscussionProgress: () => void;
  clearSpeeches: () => void;
  addGhostComment: (comment: Omit<GhostCommentItem, 'id' | 'timestamp'>) => void;
  clearGhostComments: () => void;
  /** v6.22 — push the ghost-vote map eagerly from vote_result handler
   *  so the GhostVoteDot overlay can highlight indicted alives within
   *  the same tick as the elimination reveal. */
  setGhostVotes: (ghostVotes: Record<string, string> | null | undefined) => void;
  /** v6.24 P2 — incremental merge driven by the real-time
   *  `game:ghost_vote_cast` event. Each ghost's vote arrives separately
   *  during voting phase so the 👻 dot tally + GhostChatPanel ally
   *  count update one-at-a-time instead of in a single vote_result batch. */
  mergeGhostVote: (ghostId: string, target: string) => void;
  /** v6.36 P3 — set the roster of hot-nominated names emitted by
   *  the server in `game:hot_names`. Drives the 🔥 badge overlay on
   *  GameMap sprites. Pass [] to clear (also done on reset). */
  setHotNames: (names: string[]) => void;
  setAvatarUrl: (role: string, url: string) => void;
  pushElimination: (entry: Omit<EliminationLogEntry, 'id' | 'timestamp'>) => number;
  pushPrediction: (entry: PredictionLogEntry) => void;
  reset: () => void;
}

interface GameStore {
  // ── State ────────────────────────────────────────────────
  gameId: string | null;
  phase: string;
  players: GamePlayer[];
  round: number;
  taskProgress: number;
  winner: string;
  votes: Record<string, string>;
  ghostVotes: Record<string, string>;
  /** v6.86 — 双公司模式标记 + 实时市占率(对撞条);单公司 undefined。 */
  mode?: 'single' | 'dual';
  market?: { a: number; b: number };

  /** v6.36 P3 — names hot-nominated via hot-quote submissions ≥ 1 in the
   *  last 7 days. GameMap renders a 🔥 badge on matching sprites so
   *  spectators see the link between their nomination and the game world. */
  hotNames: string[];

  // Speech state
  currentSpeaker: string | null;
  currentSpeech: SpeechItem | null;
  speechHistory: SpeechItem[];

  /** v6.8 P4.2 — wave progress within the current discussion phase.
   *  `current` is 1-based (first speech = 1), `total` is the full
   *  queue size. Both reset to 0 when discussion ends. Last 2 indices
   *  (current >= total - 1) are the "pressure window" trigger. */
  discussionProgress: { current: number; total: number; round: number };

  // Ghost comments (弹幕)
  ghostComments: GhostCommentItem[];

  // Post-game recap data — accumulated across the game's lifetime,
  // consumed by HighlightReel on game_over.
  eliminationLog: EliminationLogEntry[];
  predictionLog: PredictionLogEntry[];

  // Avatar URLs
  avatarUrls: Record<string, string>;

  // ── Actions (stable reference) ───────────────────────────
  actions: GameActions;
}

const INITIAL_STATE = {
  gameId: null,
  phase: 'lobby',
  players: [],
  round: 0,
  taskProgress: 0,
  winner: 'none',
  votes: {},
  ghostVotes: {},
  hotNames: [],
  currentSpeaker: null,
  currentSpeech: null,
  speechHistory: [],
  discussionProgress: { current: 0, total: 0, round: 0 },
  ghostComments: [],
  eliminationLog: [],
  predictionLog: [],
  avatarUrls: {},
} satisfies Omit<GameStore, 'actions'>;

// Monotonic — shared across all pushElimination calls within a session so ids
// stay unique even if state arrays are spliced. Persists across store resets
// since it's module-level; that's fine because it only needs uniqueness, not
// monotonicity from zero.
let elimIdCounter = 0;

export const useGameStore = create<GameStore>((set) => ({
  ...INITIAL_STATE,

  actions: {
    setGameId: (id) => set({ gameId: id }),

    /**
     * Absorb an authoritative server snapshot, and — critically — self-heal
     * any **orphan deaths** that slipped past the explicit kill/vote_result
     * handlers.
     *
     * ## Why orphan deaths happen
     *
     * Server's only two "isAlive = false" paths both emit events:
     *   - `runFreeRoam` → `emit('kill', …)`  (server/engine/GameEngine.ts:236)
     *   - `runVoting`   → `emit('vote_result', …)` (…:518)
     *
     * But socket.io can drop events in two edge cases:
     *   1. **Join gap** — server emits `kill` between `game:create` and the
     *      client's `game:join` succeeding. Room membership isn't established
     *      yet, so the emit lands in `/dev/null` from the client's perspective.
     *   2. **Reconnect loss** — an event fires during a 2-3s network blip
     *      while the socket reconnect handshake is pending. Default socket.io
     *      transport does not replay missed events on reconnect.
     *
     * When that happens, `game:state` still arrives (and is re-sent every
     * phase change), carrying the authoritative `players[].isAlive = false`.
     * So the UI shows the player as dead in the map/dossier, but the
     * HighlightReel timeline has a gap where a row should be.
     *
     * ## Self-heal strategy
     *
     * Diff the previous `players` state against the incoming one:
     *  - If a player transitioned `isAlive: true → false`
     *  - AND the store doesn't already have an elimination entry for that
     *    `playerId`
     *  - Synthesize a `kill`-type entry with `location: undefined` (we don't
     *    know whether it was a kill or a vote-out; `kill` is the more common
     *    path for missed events, and the reel copy "被优化" reads naturally)
     *
     * The very first `updateState` call is a baseline — no `prev` entry for
     * any player — so all currently-dead players are skipped (no false
     * positives on join-to-mid-game scenario in the future).
     */
    updateState: (state) =>
      set((s) => {
        // Map of previously-seen alive status by id. Players not in the map
        // are treated as "newly observed" and skipped (baseline).
        const wasAlive = new Map(s.players.map((p) => [p.id, p.isAlive]));
        const hasElim = new Set(s.eliminationLog.map((e) => e.playerId));
        const patched: EliminationLogEntry[] = [];

        for (const p of state.players) {
          const prev = wasAlive.get(p.id);
          if (prev === true && p.isAlive === false && !hasElim.has(p.id)) {
            const role: string | undefined = p.role;
            const team: 'cat' | 'dog' | 'neutral' = role?.endsWith('_cat')
              ? 'cat'
              : role?.endsWith('_dog')
                ? 'dog'
                : 'neutral';
            patched.push({
              id: ++elimIdCounter,
              round: state.round,
              // We can't reliably distinguish kill vs. vote-out here. Kill is
              // the more common "missed event" path (free-roam kills land
              // during phase transitions; vote-outs are in-phase). The copy
              // "被优化" on a kill entry reads fine even if it was actually
              // a vote — the round/timeline context still carries weight.
              type: 'kill',
              playerId: p.id,
              playerName: p.name,
              role,
              team,
              location: undefined,
              timestamp: Date.now(),
            });
          }
        }

        // v6.90 — 去重玩家(按 id 取首次出现)。防御:若服务端某次发来含重复 id 的
        // 玩家列表(如同一 socket 串了两局的状态),重复的 React key 会让 BettingBar /
        // KillFlashOverlay 的 AnimatePresence 直接抛错 → 整个旁观端白屏崩溃。这里兜住。
        const seenPid = new Set<string>();
        const uniquePlayers = (state.players as GamePlayer[]).filter((p) =>
          seenPid.has(p.id) ? false : (seenPid.add(p.id), true));

        return {
          phase: state.phase,
          players: uniquePlayers,
          round: state.round,
          taskProgress: state.taskProgress,
          winner: state.winner,
          votes: state.votes,
          ghostVotes: state.ghostVotes || {},
          // v6.86 — 双公司:模式 + 实时市占率(undefined 时单公司,UI 自动隐藏对撞条)
          mode: state.mode,
          market: state.market,
          eliminationLog: patched.length
            ? [...s.eliminationLog, ...patched]
            : s.eliminationLog,
        };
      }),

    /** Apply a `game:tick` payload from the engine free-roam loop.
     *  Merges position + activity into the matching player record without
     *  touching unrelated fields (role/team/isAlive/etc). New keys silently
     *  ignored if the player isn't in our list — defensive against
     *  reconnect ordering quirks. */
    applyTick: (tick) =>
      set((s) => {
        if (!tick?.players?.length) return {};
        const byId = new Map(tick.players.map((p) => [p.id, p]));
        const next = s.players.map((p) => {
          const t = byId.get(p.id);
          if (!t) return p;
          return {
            ...p,
            position: t.position,
            activity: t.activity,
            activityText: t.activityText,
            // v0.6.2 — keep `carrying` in sync (null = empty hands).
            carrying: t.carrying ?? null,
          };
        });
        return { players: next };
      }),

    setSpeaker: (playerId) => set({ currentSpeaker: playerId }),

    addSpeech: (speech) =>
      set((s) => ({
        currentSpeech: speech,
        speechHistory: [...s.speechHistory, speech],
      })),

    setDiscussionProgress: (current, total, round) =>
      set({ discussionProgress: { current, total, round } }),

    clearDiscussionProgress: () =>
      set({ discussionProgress: { current: 0, total: 0, round: 0 } }),

    clearSpeeches: () =>
      set({
        speechHistory: [], currentSpeech: null, currentSpeaker: null,
        discussionProgress: { current: 0, total: 0, round: 0 },
      }),

    addGhostComment: (comment) =>
      set((s) => ({
        ghostComments: [
          ...s.ghostComments,
          { ...comment, id: uid(), timestamp: Date.now() },
        ],
      })),

    clearGhostComments: () => set({ ghostComments: [] }),

    // v6.22 — push ghostVotes eagerly from vote_result. The next full
    // game:state snapshot would re-apply them, but waiting for it means
    // the GhostVoteDot overlay misses its dramatic "right after vote
    // reveal" moment.
    setGhostVotes: (ghostVotes) => set({ ghostVotes: ghostVotes || {} }),

    // v6.24 P2 — incremental merge from game:ghost_vote_cast events.
    // Each call adds/updates one (ghostId → target) entry, preserving
    // any prior entries from the same voting round.
    mergeGhostVote: (ghostId, target) =>
      set((s) => ({ ghostVotes: { ...s.ghostVotes, [ghostId]: target } })),

    // v6.36 P3 — push the hot-nominated roster names. Server only emits
    // the event when non-empty so we default the payload defensively.
    setHotNames: (names) => set({ hotNames: names ?? [] }),

    setAvatarUrl: (role, url) =>
      set((s) => ({
        avatarUrls: { ...s.avatarUrls, [role]: url },
      })),

    pushElimination: (entry) => {
      const id = ++elimIdCounter;
      set((s) => ({
        eliminationLog: [
          ...s.eliminationLog,
          { ...entry, id, timestamp: Date.now() },
        ],
      }));
      return id;
    },

    pushPrediction: (entry) =>
      set((s) => ({ predictionLog: [...s.predictionLog, entry] })),

    reset: () => set({ ...INITIAL_STATE }),
  },
}));

/* --------------------------------------------------------------------- */
/* Atomic selector hooks — prefer these in components.                    */
/*                                                                         */
/* Each hook subscribes to a single slice; components re-render only when  */
/* that slice changes. This replaces `const { a, b, c } = useGameStore()`  */
/* which subscribed to the whole store.                                    */
/* --------------------------------------------------------------------- */

export const useGameId = () => useGameStore((s) => s.gameId);
export const usePhase = () => useGameStore((s) => s.phase);
export const usePlayers = () => useGameStore((s) => s.players);
export const useRound = () => useGameStore((s) => s.round);
export const useTaskProgress = () => useGameStore((s) => s.taskProgress);
export const useWinner = () => useGameStore((s) => s.winner);
/** v6.86 — 双公司:实时市占率(undefined = 单公司,UI 隐藏对撞条)+ 模式标记。 */
export const useMarket = () => useGameStore((s) => s.market);
export const useDualMode = () => useGameStore((s) => s.mode === 'dual');

export const useCurrentSpeaker = () => useGameStore((s) => s.currentSpeaker);
export const useCurrentSpeech = () => useGameStore((s) => s.currentSpeech);
export const useSpeechHistory = () => useGameStore((s) => s.speechHistory);
export const useDiscussionProgress = () => useGameStore((s) => s.discussionProgress);

export const useGhostComments = () => useGameStore((s) => s.ghostComments);
export const useAvatarUrls = () => useGameStore((s) => s.avatarUrls);
// v6.22 — ghostVotes already lived in state (populated via game:state),
// but consumers (GhostVoteDot overlay) wanted a stable hook + the
// vote_result handler wanted to push them eagerly without waiting for
// the next full state snapshot.
export const useGhostVotes = () => useGameStore((s) => s.ghostVotes);

// v6.36 P3 — hot-nominated rat names from server `game:hot_names`.
// GameMap renders 🔥 badge on matching sprites so spectators see their
// hot-quote nominations actually surface in the next game.
export const useHotNames = () => useGameStore((s) => s.hotNames);

export const useEliminationLog = () => useGameStore((s) => s.eliminationLog);
export const usePredictionLog = () => useGameStore((s) => s.predictionLog);

/** Stable actions object — never causes re-render. Destructure freely. */
export const useGameActions = () => useGameStore((s) => s.actions);

// v6.22 dev-only — expose store on window so Playwright probes (and
// devtools console) can inject mock ghostComments/ghostVotes without
// waiting 3 minutes for a real elimination. Tree-shaken in production
// builds by Vite (import.meta.env.DEV is statically false there).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __officeZooStore?: typeof useGameStore }).__officeZooStore = useGameStore;
}
