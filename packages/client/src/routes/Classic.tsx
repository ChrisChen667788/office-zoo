import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket, useSocketEvents } from '../hooks/useSocket';
import {
  type GhostCommentItem,
  usePhase, usePlayers, useRound, useTaskProgress,
  useSpeechHistory, useGhostComments, useAvatarUrls,
  useCurrentSpeaker, useDiscussionProgress,
  useGhostVotes, useHotNames,
  useGameActions, useMarket, useDualMode,
} from '../stores/gameStore';
import GameMap from '../components/game/GameMap';
import GhostChatPanel from '../components/game/GhostChatPanel';
import ReactionDanmaku, { type DanmakuTrigger } from '../components/game/ReactionDanmaku';
import { pickReaction } from '@furball/shared';
import { fetchReactionLine } from '../utils/reactionLine';
import PhaseHint from '../components/onboarding/PhaseHint';
import RoleLegend from '../components/onboarding/RoleLegend';
import BettingBar from '../components/game/BettingBar';
import { RelationNetworkButton } from '../components/game/RelationNetworkPanel';
import EliminationReveal, { type EliminationEvent } from '../components/game/EliminationReveal';
import KillFlashOverlay from '../components/game/KillFlashOverlay';
import EmergencyMeetingTransition from '../components/game/EmergencyMeetingTransition';
import PhaseTransitionOverlay from '../components/game/PhaseTransitionOverlay';
import VoteEjectAnimation from '../components/game/VoteEjectAnimation';
import HighlightReel from '../components/game/HighlightReel';
import { ROLE_LABELS, teamForRole } from '../constants/roles';
import EventPill from '../components/EventPill';
import PersonaCard from '../components/character/PersonaCard';
import IdleBeat from '../components/character/IdleBeat';
import { uid } from '../utils/uid';
import { playTtsFromUrl, stopTts, speakViaBrowserTTS, hasBrowserTTS } from '../utils/audioUnlock';
import { sfx, isSfxMuted } from '../utils/sfx';
import { recordLeakSubmit, recordLeakQuoted } from '../utils/leakStats';
import { phaseIcons, personalityIcons, glyphIcons, Icon } from '../constants/icons';

// Vite proxies /avatars and /api to :3100 — use relative URLs to keep the
// browser on the same origin (5173) and dodge cross-port image rendering quirks.
const SERVER_URL = '';

const PHASE_NAMES: Record<string, { label: string; emoji: string; icon: string }> = {
  lobby:       { label: '待入职',   emoji: '⏳', icon: phaseIcons.lobby },
  role_reveal: { label: '岗位分配', emoji: '📋', icon: phaseIcons.role_reveal },
  free_roam:   { label: '日常搬砖', emoji: '💼', icon: phaseIcons.free_roam },
  meeting:     { label: '紧急全员会', emoji: '🚨', icon: phaseIcons.meeting },
  discussion:  { label: '职场撕逼', emoji: '🔥', icon: phaseIcons.discussion },
  voting:      { label: '投票裁员', emoji: '🗳️', icon: phaseIcons.voting },
  vote_result: { label: '裁员结果', emoji: '⚖️', icon: phaseIcons.vote_result },
  game_over:   { label: '散伙饭',   emoji: '🏆', icon: phaseIcons.game_over },
};

// v6.16 P2 — promoted to shared constants/personalityLabels.ts.
// Local re-export kept as alias to minimize blast radius on call sites.
import { PERSONALITY_LABELS } from '../constants/personalityLabels';

/** Same gender heuristic as Immersive.tsx — kept as a separate function so
 *  Classic can be edited independently. The role->gender map is small and
 *  changes rarely; duplicating beats sharing a mid-stack util for clarity. */
function inferGenderFromRoleClassic(role?: string): 'male' | 'female' | undefined {
  if (!role) return undefined;
  const female = new Set([
    'medic_cat', 'mimic_cat', 'silencer_dog', 'lover',
    'pigeon', 'adventurer_cat',
  ]);
  if (female.has(role)) return 'female';
  return 'male';
}

interface EventLogEntry {
  id: number;
  type: 'speech' | 'vote' | 'kill' | 'phase' | 'system' | 'ghost' | 'reaction' | 'defection' | 'smear';
  text: string;
  timestamp: number;
}

export default function Classic() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  // Atomic slice subscriptions — component re-renders only when the slice it
  // reads actually changes, rather than on every unrelated `set()` call.
  const phase = usePhase();
  const players = usePlayers();
  const round = useRound();
  const taskProgress = useTaskProgress();
  // v6.86 — 双公司:实时市占率 + 模式标记(单公司时 market undefined → 对撞条隐藏)
  const market = useMarket();
  const isDual = useDualMode();
  const speechHistory = useSpeechHistory();
  const currentSpeaker = useCurrentSpeaker();
  const discussionProgress = useDiscussionProgress();
  const ghostComments = useGhostComments();
  const ghostVotes = useGhostVotes();
  const hotNames = useHotNames();
  const avatarUrls = useAvatarUrls();
  const { updateState, applyTick, setSpeaker, addSpeech, setDiscussionProgress, clearDiscussionProgress, addGhostComment, setAvatarUrl, pushElimination, reset, setGhostVotes, mergeGhostVote, setHotNames } =
    useGameActions();

  const { socket, connected, connecting, reconnectAttempt } = useSocket();

  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [activeDanmaku, setActiveDanmaku] = useState<GhostCommentItem[]>([]);
  // v6.25 P1 — set of psy-war leak texts the server has acked. The
  // chat panel queries it to render "👂 AI 听到了" on the matching
  // bubble. Lives in component state (resets on remount).
  const [ackedLeaks, setAckedLeaks] = useState<Set<string>>(new Set());
  // v6.26 P1 — map of leak text → most recent quote info (which AI
  // quoted it, when, what speech). Upgrades the badge from 👂 to ✨
  // and also lets the SpeechHistory bubble mark "✨ 引用前同事爆料".
  const [quotedLeaks, setQuotedLeaks] = useState<Map<string, { byPlayerId: string; byPlayerName: string; speechText: string; ts: number }>>(new Map());
  // v6.30 P3 — rate-limit signals from server (v6.29 P5). lockedUntilMs
  // is a one-shot 60s window cool-down; sessionLocked is terminal for
  // this socket session. Both feed into GhostChatPanel as props.
  const [lockedUntilMs, setLockedUntilMs] = useState<number | undefined>(undefined);
  const [sessionLocked, setSessionLocked] = useState(false);
  // Elimination reveal: monotonic id + payload. Bumping id triggers the overlay.
  const [lastElim, setLastElim] = useState<EliminationEvent | null>(null);
  // v6.68 — 群众吐槽弹幕触发(被裁/出局时丢一个,飘过地图)
  const [danmaku, setDanmaku] = useState<DanmakuTrigger | null>(null);
  // v6.69 — 每只鼠在地图上的归一化坐标(GameMap 节流上报,写 ref 不触发重渲染)
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
  const dmIdRef = useRef(0); // 弹幕单调 id(静态 + LLM 各占一个,确保 effect 重触发)
  // v6.26 P5 — DEV hook for Playwright probes. Registers a global
  // function that fires a synthetic elim event with realistic mock data
  // so we can visual-verify the reveal modal + 班味物件 + 新员工 frame
  // without waiting ~3 minutes for a real elimination to land.
  // Tree-shaken in prod (import.meta.env.DEV gate).
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    (window as unknown as { __triggerMockElim?: (kind?: 'vote' | 'kill') => void }).__triggerMockElim = (kind = 'vote') => {
      const victim = players[0] ?? { id: 'mock', name: 'Tony', role: 'engineer_cat', personality: 'workaholic' };
      setLastElim({
        id: ++elimIdRef.current,
        type: kind,
        playerName: victim.name,
        roleLabel: '工程师',
        team: 'cat',
        location: kind === 'kill' ? '茶水间' : undefined,
        personality: victim.personality ?? 'workaholic',
      });
    };
    return () => {
      delete (window as unknown as { __triggerMockElim?: unknown }).__triggerMockElim;
    };
  }, [players]);

  // v6.32 P2 — DEV hook for the cooldown ring probe. Fires the same
  // setters as the real game:psy_war_rate_limited handler (v6.30 P3),
  // bypassing the need to throttle a real game.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    (window as unknown as { __triggerMockRateLimit?: (sec: number, session?: boolean) => void }).__triggerMockRateLimit = (sec, session = false) => {
      if (session) setSessionLocked(true);
      else setLockedUntilMs(Date.now() + sec * 1000);
    };
    return () => {
      delete (window as unknown as { __triggerMockRateLimit?: unknown }).__triggerMockRateLimit;
    };
  }, []);
  // Prediction bar resolution: separate tick so the bar only resolves on a
  // real vote_result event, not on arbitrary phase toggles.
  const [lastVoteEliminated, setLastVoteEliminated] = useState<string | null>(null);
  const [voteResultTick, setVoteResultTick] = useState(0);
  // v6.87 — 双公司终局赢家('a'/'b'),驱动下注盘公司盘口结算。
  const [companyWinner, setCompanyWinner] = useState<'a' | 'b' | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const elimIdRef = useRef(0);
  // v6.87 — 换局清掉上一局的公司赢家,确保下注盘公司盘口的结算 effect(依赖 gameWinner)
  // 在新一局能正常 null→'a'/'b' 触发(防 Router 复用 Classic 实例时残留)。
  useEffect(() => { setCompanyWinner(null); }, [gameId]);
  // Browser-TTS fallback bookkeeping — see Immersive.tsx for the rationale.
  const pendingSpeechRef = useRef<{ text: string; gender?: 'male' | 'female' } | null>(null);
  const browserTtsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which (gameId) we've already emitted join+start for. Guards both:
  //   - React StrictMode double-invocation (dev)
  //   - Re-runs when deps churn (e.g. the `socket` or `pushEvent` identity
  //     drifting across re-renders — currently stable, but defensive).
  // Re-join IS allowed after a reconnect because `connected` flipping
  // false→true will not change this ref, but we also shouldn't double-start
  // a game that's already in progress. Server treats `game:start` on a
  // started game as a no-op; re-emitting on reconnect is therefore safe.
  const joinedRef = useRef<string | null>(null);

  const pushEvent = useCallback((type: EventLogEntry['type'], text: string) => {
    setEventLog((prev) => [...prev, { id: nextId.current++, type, text, timestamp: Date.now() }]);
  }, []);

  // v6.69 — 一只鼠被裁/出局时点燃"群众吐槽":先即时丢静态弹幕 + 事件,再异步拉一句
  // LLM 实时吐槽(结合身份/性格)追加。弹幕都从被裁工位坐标冒出来(拿不到则横向飘)。
  const fireReactions = useCallback((
    kind: 'kill' | 'vote',
    victimId: string,
    victimName: string,
    victim?: { role?: string; personality?: string },
  ) => {
    const origin = posRef.current[victimId];
    const groupId = ++dmIdRef.current;           // 本次裁员一组
    const evId = 2_000_000 + groupId;            // 受控日志 id(不撞 pushEvent 的 nextId)
    // v6.72 — 即时:静态一条(弹幕 1 颗 + 日志 1 行),不依赖网络先有反应
    const r0 = pickReaction(kind, groupId);
    setDanmaku({ id: groupId, kind, text: r0.text, emoji: r0.emoji, origin, groupId });
    setEventLog((prev) => [...prev, { id: evId, type: 'reaction', text: `${r0.emoji} 群众:${r0.text}`, timestamp: Date.now() }]);
    // 异步:LLM 那句到了就**替换**静态(弹幕 + 日志都替,不叠加);失败则静态留着
    const victimRole = victim?.role ? ROLE_LABELS[victim.role] : undefined;
    const victimPersonality = victim?.personality ? PERSONALITY_LABELS[victim.personality]?.label : undefined;
    void fetchReactionLine({ kind, victimName, victimRole, victimPersonality }).then((line) => {
      if (!line) return;
      setDanmaku({ id: ++dmIdRef.current, kind, text: line, emoji: '🗣️', origin, groupId, replace: true });
      setEventLog((prev) => prev.map((e) => (e.id === evId ? { ...e, text: `🗣️ 群众:${line}` } : e)));
      // v6.70 — 用浏览器 TTS 把这句"群众吐槽"念出来(吃瓜路人音:略快略高);静音时不念
      if (!isSfxMuted()) void speakViaBrowserTTS(line, { rate: 1.12, pitch: 1.3 });
    });
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [eventLog]);

  // Join + start once the socket is connected. `joinedRef` ensures exactly one
  // join per gameId across StrictMode double-mount and dep-identity churn.
  useEffect(() => {
    if (!gameId || !connected) return;
    if (joinedRef.current === gameId) return;
    joinedRef.current = gameId;
    // Clear any prior-game recap data (eliminationLog/predictionLog) so
    // HighlightReel for the new game starts empty. Safe: this component owns
    // the Classic route and we've just switched to a new gameId.
    reset();
    socket.emit('game:join', gameId);
    pushEvent('system', `已入职公司`);
    socket.emit('game:start', gameId);
  }, [gameId, connected, socket, pushEvent, reset]);

  // Stop any in-flight TTS when leaving the route so audio doesn't bleed
  // into Result / Landing. Shared audio element is owned by audioUnlock.ts.
  useEffect(() => stopTts, []);

  // Register all game-event listeners once. `useSocketEvents` handles cleanup on
  // unmount — the old code had 9 redundant `on`/`off` pairs prone to drift.
  useSocketEvents({
    'game:state': (state: any) => updateState(state),

    // PR1 free-roam tick — high-frequency lightweight payload (~1.5s cadence
    // during free_roam phase only). Carries position + activity per player so
    // GameMap can animate movement and show what each player is doing.
    'game:tick': (data: any) => applyTick(data),

    'game:phase_change': (data: { phase: string }) => {
      const p = PHASE_NAMES[data.phase];
      // Event log stores plain text — use the emoji fallback here, not the
      // URL. Rendered phase chip below uses the <Icon> component for image.
      pushEvent('phase', `${p?.emoji || '📌'} ${p?.label || data.phase}`);
      // v6.8 P4.2 — wave progress is per-discussion. Reset whenever we
      // leave discussion (server only emits during discussion anyway, but
      // clearing here lets the UI hide the bar between rounds).
      if (data.phase !== 'discussion') clearDiscussionProgress();
      // v6.24 P2 — clear last round's ghost-vote tally when a new voting
      // round starts so the incremental ghost_vote_cast events land in
      // a fresh map. (vote_result already overrides on conclusion, but
      // we want the GameMap dots to fade away when voting begins.)
      if (data.phase === 'voting') setGhostVotes({});
    },

    // Speaker spotlight: GameMap uses currentSpeaker to draw a pulsing
    // ring + scale-bump on the active player's avatar.
    'game:speech_start': (data: { playerId: string }) => setSpeaker(data.playerId),
    'game:speech_end': () => setSpeaker(null),

    // v6.8 P4.2 — wave progress. Updates progress bar + fires tick SFX
    // when entering the last 2 of the round (pressure window).
    'game:discussion_progress': (data: { current: number; total: number; round: number }) => {
      setDiscussionProgress(data.current, data.total, data.round);
      // Pressure window: last 2 speeches of the round. Tick on entry only.
      if (data.total > 0 && data.current >= data.total - 1) {
        sfx.playTick();
      }
    },

    'game:speech': (data: {
      playerId: string; playerName: string; text: string;
      role?: string; team?: string;
      evidence?: Array<{
        refToPlayerId: string; refToPlayerName: string;
        refToTextSnippet: string; kind: 'mention' | 'at_tag' | 'fuzzy';
      }>;
    }) => {
      addSpeech(data);
      pushEvent('speech', `${data.playerName}: ${data.text}`);
      // Schedule a browser-TTS fallback in case the server can't generate
      // audio (api quota exhausted). The race is resolved in `game:speech_audio`
      // — see Immersive.tsx for the full design rationale.
      const gender = inferGenderFromRoleClassic(data.role);
      pendingSpeechRef.current = { text: data.text, gender };
      if (browserTtsTimerRef.current) clearTimeout(browserTtsTimerRef.current);
      browserTtsTimerRef.current = setTimeout(() => {
        const pending = pendingSpeechRef.current;
        if (pending && hasBrowserTTS()) {
          speakViaBrowserTTS(pending.text, { genderHint: pending.gender });
        }
        pendingSpeechRef.current = null;
      }, 4500); // Minimax speech-2.8-hd takes ~2-4s; wait 4.5s before fallback
    },

    'game:speech_audio': async (data: { audioUrl: string }) => {
      // Shared audio element unlocked by the initial "进入" gesture in Landing.
      // Cancel the pending browser-TTS fallback; if the URL playback then
      // fails we re-trigger browser TTS using the captured speech text.
      if (browserTtsTimerRef.current) {
        clearTimeout(browserTtsTimerRef.current);
        browserTtsTimerRef.current = null;
      }
      const pending = pendingSpeechRef.current;
      pendingSpeechRef.current = null;

      const ok = await playTtsFromUrl(data.audioUrl);
      if (!ok && pending && hasBrowserTTS()) {
        await speakViaBrowserTTS(pending.text, { genderHint: pending.gender });
      }
    },

    // v6.24 P2 — incremental ghost vote signal. One event per ghost
    // as they vote during voting phase; merge into ghostVotes map so
    // GameMap dots light up progressively (drama!).
    'game:ghost_vote_cast': (data: { ghostId: string; ghostName: string; target: string }) => {
      mergeGhostVote(data.ghostId, data.target);
      pushEvent('ghost', `👻 ${data.ghostName} 投了劳动仲裁票`);
    },

    // v6.25 P1 — server acked a psy-war leak. Add its text to the
    // ackedLeaks set so GhostChatPanel shows "👂 AI 听到了" on the
    // matching bubble. Text is server-trimmed to 80 chars to match
    // the slice() in pushLeakedHint.
    // v6.29 P5 — server rejected a psy-war submission due to rate limit.
    // Surface in the event log + v6.30 P3 drive GhostChatPanel visible
    // disabled/cooldown state.
    'game:psy_war_rate_limited': (data: { reason: 'window_cap' | 'session_cap'; retryAfterMs: number }) => {
      if (data.reason === 'session_cap') {
        pushEvent('ghost', '⛔ 本场爆料配额已用完 (20 条上限)');
        setSessionLocked(true);
      } else {
        const sec = Math.ceil(data.retryAfterMs / 1000);
        pushEvent('ghost', `⏳ 爆料频率限速, 等 ${sec}s 再投`);
        setLockedUntilMs(Date.now() + data.retryAfterMs);
      }
    },

    'game:psy_war_acked': (data: { text: string; total: number }) => {
      setAckedLeaks((prev) => {
        const next = new Set(prev);
        next.add(data.text);
        return next;
      });
      pushEvent('ghost', `👂 AI 收到匿名爆料 (累计 ${data.total} 条)`);
    },

    // v6.26 P1 — server detected an AI speech quoting one of the active
    // leaks. Upgrade the GhostChatPanel badge from 👂 to ✨ and let
    // the SpeechHistory bubble surface the link via quotedLeaks lookup.
    'game:leak_quoted': (data: { hintText: string; byPlayerId: string; byPlayerName: string; speechText: string }) => {
      setQuotedLeaks((prev) => {
        const next = new Map(prev);
        next.set(data.hintText, { byPlayerId: data.byPlayerId, byPlayerName: data.byPlayerName, speechText: data.speechText, ts: Date.now() });
        return next;
      });
      pushEvent('ghost', `✨ ${data.byPlayerName} 引用了前同事爆料`);
      // v6.27 P4 — mark the leak as quoted in local stats. Profile's
      // MyLeaksPanel will display the bumped hit rate next time the
      // user lands there.
      recordLeakQuoted(data.hintText, data.byPlayerName);
    },

    'game:ghost_comment': (data: { playerId: string; playerName: string; text: string; role?: string; team?: string }) => {
      addGhostComment(data);
      pushEvent('ghost', `👻 ${data.playerName}: ${data.text}`);
      // UUID React key — "Date.now() + Math.random()" could collide on fast bursts.
      const item: GhostCommentItem = {
        id: uid(),
        ...data,
        timestamp: Date.now(),
      };
      setActiveDanmaku((prev) => [...prev, item]);
      setTimeout(() => {
        setActiveDanmaku((prev) => prev.filter((d) => d.id !== item.id));
      }, 6000);
    },

    'game:vote_result': (data: {
      votes: Record<string, string>; ghostVotes?: Record<string, string>;
      eliminated?: string; playerName?: string; eliminatedPersonality?: string;
      // v6.86 — dual mode merges both companies' results into ONE emit so the
      // client never double-fires. Each entry is one company's round outcome.
      dualEliminations?: Array<{ company?: 'a' | 'b'; eliminated?: string; eliminatedPersonality?: string }>;
    }) => {
      // Normalise to a uniform list of eliminations regardless of mode. The
      // top-level eliminated/playerName is the "primary" (drives PredictionBar
      // + the one-at-a-time dramatic reveal); dual adds a second company.
      const COMPANY_TAG: Record<'a' | 'b', string> = { a: '🅰', b: '🅱' };
      type Elim = { id: string; name: string; personality?: string; tag?: string };
      const elims: Elim[] = [];
      if (data.dualEliminations) {
        for (const r of data.dualEliminations) {
          if (!r.eliminated) continue;
          const victim = players.find((p) => p.id === r.eliminated);
          elims.push({
            id: r.eliminated,
            name: victim?.name ?? '某员工',
            personality: r.eliminatedPersonality ?? victim?.personality,
            tag: r.company ? COMPANY_TAG[r.company] : undefined,
          });
        }
      } else if (data.eliminated && data.playerName) {
        elims.push({ id: data.eliminated, name: data.playerName, personality: data.eliminatedPersonality });
      }

      let msg = elims.length
        ? elims.map((e) => `${e.tag ? e.tag + ' ' : ''}${e.name} 被投票开除`).join(' · ')
        : '投票平局，无人被开除';
      if (data.ghostVotes && Object.keys(data.ghostVotes).length > 0) {
        msg += ` (含${Object.keys(data.ghostVotes).length}票劳动仲裁)`;
      }
      pushEvent('vote', msg);
      // v6.22 — push ghost-vote tally into store immediately. The next
      // full game:state snapshot would carry it too, but we want the
      // GameMap "👻 N" dot above indicted alives to show up the same
      // beat as the elimination reveal, not 1-2s later.
      setGhostVotes(data.ghostVotes);

      // Drive the PredictionBar resolution exactly once per vote event — on the
      // primary elimination (first in the list; null on a tie).
      setLastVoteEliminated(elims[0]?.id ?? null);
      setVoteResultTick((n) => n + 1);

      // Recap log + crowd reactions for EVERY elimination (HighlightReel replay,
      // betting payout, danmaku). The dramatic reveal popup is one-at-a-time, so
      // only the primary clobbers setLastElim — secondary still gets recap+react.
      elims.forEach((e, i) => {
        const victim = players.find((p) => p.id === e.id);
        if (i === 0) {
          setLastElim({
            id: ++elimIdRef.current,
            type: 'vote',
            playerName: e.name,
            roleLabel: victim?.role ? ROLE_LABELS[victim.role] : undefined,
            team: teamForRole(victim?.role),
            // v6.24 P1 — prefer the personality the server attached to the
            // event itself; fall back to the players.find lookup. The event
            // is authoritative since it's set at elimination time on the
            // server, immune to client-side state-update races.
            personality: e.personality ?? victim?.personality,
            avatar: victim?.avatar, // v6.67 — 立绘弹出用真头像(有 pack 头像时)
          });
        }
        // v6.67/68/69 — 群众吐槽:静态即时 + LLM 实时,弹幕从被裁工位冒出
        fireReactions('vote', e.id, e.name, victim);
        // Append to persistent recap log so HighlightReel can replay later.
        pushElimination({
          round,
          type: 'vote',
          playerId: e.id,
          playerName: e.name,
          role: victim?.role,
          team: teamForRole(victim?.role),
          avatar: victim?.avatar,
        });
      });
    },

    'game:kill': (data: { victimId: string; victimName?: string; location?: string; victimPersonality?: string }) => {
      const victim = players.find((p) => p.id === data.victimId);
      const name = data.victimName || victim?.name || '???';
      pushEvent('kill', `${name} 在${data.location || '某处'}被"优化"了!`);

      setLastElim({
        id: ++elimIdRef.current,
        type: 'kill',
        playerName: name,
        roleLabel: victim?.role ? ROLE_LABELS[victim.role] : undefined,
        team: teamForRole(victim?.role),
        location: data.location,
        // v6.24 P1 — same authoritative-event-first pattern as vote_result.
        personality: data.victimPersonality ?? victim?.personality,
        avatar: victim?.avatar, // v6.67 — 立绘弹出用得上(有 pack 头像就用真的)
      });
      // v6.67/68/69 — 群众吐槽:静态即时 + LLM 实时,弹幕从被裁工位冒出
      fireReactions('kill', data.victimId, name, victim);
      pushElimination({
        round,
        type: 'kill',
        playerId: data.victimId,
        playerName: name,
        role: victim?.role,
        team: teamForRole(victim?.role),
        location: data.location,
        avatar: victim?.avatar,
      });
    },

    'game:over': (data: { winner: string; market?: { a: number; b: number } }) => {
      // v6.86 — winner is a WinCondition string ('cat_win'/'dog_win' or the
      // dual-mode 'company_a_win'/'company_b_win'). Map all of them; keep the
      // legacy 'cat'/'dog' aliases as a belt-and-braces fallback.
      const WIN_CN: Record<string, string> = {
        cat_win: '打工人阵营', cat: '打工人阵营',
        dog_win: '资本家阵营', dog: '资本家阵营',
        company_a_win: '🅰 A 司', company_b_win: '🅱 B 司',
      };
      const w = WIN_CN[data.winner] ?? data.winner;
      const tail = data.market ? `(市占 🅰${data.market.a}% : 🅱${data.market.b}%)` : '';
      pushEvent('system', `散伙饭! ${w} 获胜!${tail}`);
      // v6.87 — 把终局公司赢家落进 state,触发下注盘公司盘口一次性结算。
      if (data.winner === 'company_a_win') setCompanyWinner('a');
      else if (data.winner === 'company_b_win') setCompanyWinner('b');
      // v6.31 P2 — bump classic_finished progress for the achievement.
      void import('../utils/achievements').then((m) => m.bumpProgress('classic_finished', 1));
    },

    'game:avatar_ready': (data: { role: string; url: string }) => {
      setAvatarUrl(data.role, `${SERVER_URL}${data.url}`);
    },

    // v6.36 P3 — server tells us which roster names landed via hot-quote
    // nominations (≥ 1 mention in the last 7 days). GameMap renders a
    // 🔥 badge on those sprites so spectators see their nomination
    // surface in this game. Only fired when non-empty, so receiving the
    // event itself is the trigger.
    'game:hot_names': (data: { names: string[] }) => {
      setHotNames(data.names);
      pushEvent('system', `🔥 本局热门鼠人: ${data.names.join('、')}`);
    },

    // v6.86 — 双公司挖角/跳槽 live banner。成功跳槽用 'defection' 染色(橙红,
    // 区别于正经播报),失败用 system。companyId 徽标随下一帧 game:state 翻面。
    'game:cross_action': (data: { kind: 'defection' | 'poach_failed' | 'smear'; text: string; targetName: string }) => {
      // 跳槽成功 → 橙红 defection;曝料抹黑 → 黄系 smear(造谣搅局);其余走系统色。
      pushEvent(data.kind === 'defection' ? 'defection' : data.kind === 'smear' ? 'smear' : 'system', data.text);
    },
  });

  // Log reconnect transitions into the event log so players see what's happening.
  useEffect(() => {
    if (!connected && connecting && reconnectAttempt > 0) {
      pushEvent('system', `⚠️ 网络中断,正在重连 (第 ${reconnectAttempt} 次)...`);
    } else if (connected && reconnectAttempt === 0 && eventLog.some((e) => e.text.startsWith('⚠️ 网络'))) {
      pushEvent('system', '✅ 已重新连接');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, connecting, reconnectAttempt]);

  const eventTypeStyles: Record<string, { color: string; bg: string }> = {
    speech: { color: 'rgba(255,255,255,0.85)', bg: 'transparent' },
    vote:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.05)' },
    kill:   { color: '#ef4444', bg: 'rgba(239,68,68,0.05)' },
    phase:  { color: '#2fb8ff', bg: 'rgba(47,184,255,0.05)' },
    system: { color: '#a855f7', bg: 'rgba(168,85,247,0.05)' },
    ghost:  { color: '#6ee7b7', bg: 'rgba(110,231,183,0.05)' },
    // v6.67 — 吃瓜群众表情包吐槽,粉系区别于正经播报
    reaction: { color: '#f472b6', bg: 'rgba(244,114,182,0.07)' },
    // v6.86 — 双公司挖角成功,橙红高亮(招牌背叛时刻)
    defection: { color: '#ff8a3d', bg: 'rgba(255,138,61,0.08)' },
    // v6.89 — 商业抹黑曝料,黄系(造谣搅局,半真半假)
    smear: { color: '#fbbf24', bg: 'rgba(251,191,36,0.07)' },
  };

  const phaseInfo = PHASE_NAMES[phase] || { label: phase, emoji: '🎮', icon: '' };
  const alivePlayers = players.filter((p) => p.isAlive);
  const deadPlayers = players.filter((p) => !p.isAlive);
  const alive = alivePlayers.length;

  return (
    <div style={{
      position: 'relative',
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#050510',
      color: 'rgba(255,255,255,0.92)', overflow: 'hidden',
    }}>
      {/* Ambient aurora — two subtle blobs so the map/panel don't sit on a flat color. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0,
      }}>
        <div className="aurora" style={{
          top: '-20%', left: '-10%', width: '55vmax', height: '55vmax',
          ['--c' as never]: 'rgba(124,58,237,0.28)', opacity: 0.35,
        }} />
        <div className="aurora" style={{
          top: '20%', right: '-15%', width: '50vmax', height: '50vmax',
          ['--c' as never]: 'rgba(76,158,255,0.32)', opacity: 0.3,
        }} />
      </div>

      {/* Top bar — frosted glass, tighter type scale */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'rgba(6,6,18,0.55)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        borderBottom: '1px solid rgba(76,158,255,0.1)',
      }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* v6.4 — EventPill 替换旧 gradient text title, 跟其他路由统一 */}
          <EventPill stars={5} subtle>🏢 职场杀 · v6</EventPill>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
            padding: '3px 10px', borderRadius: 999,
            color: 'rgba(76,158,255,0.75)',
            background: 'rgba(76,158,255,0.08)',
            border: '1px solid rgba(76,158,255,0.2)',
            fontVariantNumeric: 'tabular-nums',
          }}>ROUND {round}</span>
          <span style={{
            fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 500,
            padding: '3px 10px', borderRadius: 999,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {alive}/{players.length} 在职
          </span>
        </div>

        <motion.div key={phase} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 999,
            background: 'linear-gradient(135deg, rgba(76,158,255,0.14) 0%, rgba(124,58,237,0.1) 100%)',
            border: '1px solid rgba(76,158,255,0.28)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 16px rgba(76,158,255,0.14)',
          }}>
          <Icon src={phaseInfo.icon} emoji={phaseInfo.emoji} size={16} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>{phaseInfo.label}</span>
        </motion.div>

        {/* Task progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.22em' }}>OKR</span>
          <div style={{
            flex: 1, height: 6, borderRadius: 999, overflow: 'hidden',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <motion.div animate={{ width: `${Math.min(taskProgress, 100)}%` }}
              style={{
                height: '100%', borderRadius: 999,
                background: 'linear-gradient(90deg, #4c9eff 0%, #7c3aed 100%)',
                boxShadow: '0 0 10px rgba(76,158,255,0.45)',
              }}
              transition={{ duration: 0.5 }} />
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right' }}>{Math.round(taskProgress)}%</span>
        </div>
      </div>

      {/* v6.86 — 双公司「市占率对撞条」:A 司蓝从左推、B 司橙从右推,中线对撞。
          单公司模式 market undefined → 整条不渲染。 */}
      {isDual && market && (
        <div style={{
          position: 'relative', zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 20px',
          background: 'rgba(6,6,18,0.7)',
          borderBottom: '1px solid rgba(255,138,61,0.14)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#4c9eff', minWidth: 64 }}>
            🅰 {Math.round(market.a)}%
          </span>
          {/* 拔河条:蓝(A)从左、橙(B)填剩余,分界线 = 双方市占率之比;谁高谁把中线往对面推 */}
          <div style={{
            flex: 1, height: 14, borderRadius: 999, overflow: 'hidden', display: 'flex',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <motion.div
              animate={{ width: `${market.a + market.b > 0 ? (market.a / (market.a + market.b)) * 100 : 50}%` }}
              transition={{ duration: 0.5 }}
              style={{ height: '100%', background: 'linear-gradient(90deg,#2563eb,#4c9eff)', boxShadow: '0 0 10px rgba(76,158,255,0.5)' }} />
            <div style={{ flex: 1, height: '100%', background: 'linear-gradient(90deg,#ff8a3d,#f97316)', boxShadow: '0 0 10px rgba(255,138,61,0.5)' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#ff8a3d', minWidth: 64, textAlign: 'right' }}>
            🅱 {Math.round(market.b)}%
          </span>
        </div>
      )}

      {/* Main content — v6.25 P2 responsive: row on ≥768px, column-stack
          on mobile (game-stage on top, game-side scrolls below). */}
      <div className="game-layout-row">
        {/* Left: Game map + danmaku overlay */}
        <div className="game-stage">
          <GameMap
            players={players}
            avatarUrls={avatarUrls}
            currentSpeakerId={currentSpeaker}
            ghostVotes={ghostVotes}
            hotNames={hotNames}
            onPositions={(pos) => { posRef.current = pos; }}
          />

          {/* v6.68 — 吃瓜群众表情包弹幕,飘过地图 */}
          <ReactionDanmaku trigger={danmaku} />

          {/* v6.22 — 前同事吐槽群 panel. Right-bottom floating, collapsed
              by default to a small "👻 N" pill. Re-uses the same
              ghostComments store as the danmaku above, so server-side
              ghost LLM calls do double duty.
              v6.23 P3 — alivePlayers fuel the "战术 @" psy-war dialog. */}
          <GhostChatPanel
            comments={ghostComments}
            avatarUrls={avatarUrls}
            alivePlayers={players.filter((p) => p.isAlive).map((p) => ({ id: p.id, name: p.name }))}
            // v6.25 P1 — promote psy-war from ritual UI to real AI input.
            // Server stores in leakedHints FIFO → injects into next
            // discussion prompt as anonymous ex-coworker tip.
            onPsyWarLeak={(text) => {
              socket.emit('game:psy_war_leak', text);
              // v6.27 P4 — bump local hit-rate stats (MyLeaksPanel reads).
              recordLeakSubmit(text);
            }}
            ackedTexts={ackedLeaks}
            // v6.26 P1 — quotedTexts upgrades badge 👂 → ✨ when AI
            // actually quotes the leak in a speech.
            quotedTexts={new Set(quotedLeaks.keys())}
            // v6.30 P3 — rate-limit signals from server.
            lockedUntilMs={lockedUntilMs}
            sessionLocked={sessionLocked}
            // v6.27 P3 — clicking the ✨ badge scrolls the matching
            // speech bubble into view + golden flash (mirror of v6.8
            // P4.1 evidence jump). Maps leak text → speech text via
            // quotedLeaks, computes the hash, queries by data attr.
            onJumpToQuotedSpeech={(leakText) => {
              const entry = quotedLeaks.get(leakText);
              if (!entry) return;
              let h = 0;
              for (let k = 0; k < entry.speechText.length; k++) h = ((h << 5) - h) + entry.speechText.charCodeAt(k);
              const el = document.querySelector(`[data-speech-text-hash="${h}"]`) as HTMLElement | null;
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.transition = 'background 0.25s ease-out';
                el.style.background = 'rgba(255,215,0,0.18)';
                setTimeout(() => { el.style.background = ''; }, 1500);
              }
            }}
          />

          {/* 弹幕 Danmaku overlay */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
          }}>
            <AnimatePresence>
              {activeDanmaku.map((d, i) => (
                <motion.div key={d.id}
                  initial={{ x: '110%', opacity: 0.9 }}
                  animate={{ x: '-110%', opacity: 0.9 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 6, ease: 'linear' }}
                  style={{
                    position: 'absolute',
                    top: `${12 + (i % 5) * 18}%`,
                    whiteSpace: 'nowrap',
                    fontSize: 14,
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: 20,
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(110,231,183,0.3)',
                    color: '#6ee7b7',
                    textShadow: '0 0 8px rgba(110,231,183,0.5)',
                  }}>
                  <span style={{ opacity: 0.6, marginRight: 6, display: 'inline-flex', verticalAlign: 'middle' }}>
                    <Icon src={glyphIcons.ghostSpeech} emoji="👻" size={14} />
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', marginRight: 4, fontSize: 12 }}>{d.playerName}:</span>
                  {d.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Event panel — frosted glass (game-side class handles
            mobile responsiveness via index.css media query). */}
        <div className="game-side">
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid rgba(76,158,255,0.08)',
            fontWeight: 700, fontSize: 11, letterSpacing: '0.24em',
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
          }}>
            EVENT LOG
            {!connected && <span style={{ color: '#ef4444', marginLeft: 8, fontSize: 11 }}>Disconnected</span>}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
            <AnimatePresence>
              {eventLog.map((entry) => {
                const s = eventTypeStyles[entry.type] || eventTypeStyles.speech;
                return (
                  <motion.div key={entry.id}
                    initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      padding: '6px 8px', marginBottom: 2, borderRadius: 8, fontSize: 12,
                      lineHeight: 1.6, background: s.bg,
                      borderLeft: `2px solid ${s.color}30`,
                    }}>
                    <span style={{ color: s.color, fontWeight: entry.type === 'kill' ? 700 : 400 }}>
                      {entry.text}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={logEndRef} />
          </div>

          {/* v6.8 P4.2 — discussion wave progress bar. Shown only while
               server is emitting progress for the current discussion. The
               last 2 speeches (pressure window) flip to red + pulse. */}
          {discussionProgress.total > 0 && (() => {
            const { current, total } = discussionProgress;
            const pct = Math.min(100, Math.round((current / total) * 100));
            const isPressure = current >= total - 1;
            const barColor = isPressure ? '#ff4757' : '#FFD700';
            return (
              <div style={{
                borderTop: '1px solid rgba(255,215,0,0.08)',
                padding: '6px 12px 8px',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 4, fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: isPressure ? '#ff4757' : 'rgba(255,215,0,0.6)',
                }}>
                  <span>讨论进度 · 第 {discussionProgress.round} 轮</span>
                  <span>{current} / {total}{isPressure ? ' · 最后窗口' : ''}</span>
                </div>
                <div style={{
                  position: 'relative', height: 4, borderRadius: 999,
                  background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                }}>
                  <motion.div
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    style={{
                      height: '100%', borderRadius: 999,
                      background: `linear-gradient(90deg, ${barColor} 0%, ${isPressure ? '#ff6b8a' : '#FFA947'} 100%)`,
                      boxShadow: `0 0 8px ${barColor}88`,
                      animation: isPressure ? 'pressurePulse 0.85s ease-in-out infinite' : 'none',
                    }}
                  />
                </div>
                <style>{`
                  @keyframes pressurePulse {
                    0%, 100% { box-shadow: 0 0 8px #ff475788, 0 0 0 rgba(255,71,87,0); }
                    50%      { box-shadow: 0 0 18px #ff4757cc, 0 0 24px rgba(255,71,87,0.55); }
                  }
                `}</style>
              </div>
            );
          })()}

          {/* Recent speeches */}
          <div style={{
            borderTop: '1px solid rgba(47,184,255,0.08)',
            padding: '8px 12px', maxHeight: 200, overflowY: 'auto',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 6, minHeight: 22,
            }}>
              <div style={{
                fontSize: 11, color: 'rgba(47,184,255,0.4)',
                fontWeight: 700, letterSpacing: '0.1em',
              }}>SPEECHES</div>
              {/* v6.8 P3 — show the currently-thinking AI's personality-aware
                   idle beat when LLM hasn't yet emitted a speech event. */}
              {currentSpeaker && (() => {
                const speakingPlayer = players.find((p) => p.id === currentSpeaker);
                if (!speakingPlayer) return null;
                return (
                  <IdleBeat
                    personality={speakingPlayer.personality}
                    tint="#FFD700"
                    size={16}
                    showCaption={true}
                  />
                );
              })()}
            </div>
            {speechHistory.slice(-5).map((s, i) => {
              const speaker = players.find((p) => p.id === s.playerId);
              const pLabel = speaker?.personality ? PERSONALITY_LABELS[speaker.personality] : null;
              return (
                <div key={i}
                  data-speech-player={s.playerId}
                  // v6.27 P3 — text-hash anchor lets the GhostChatPanel
                  // ✨ chip jump to THIS specific bubble (not just any
                  // bubble by this speaker). Hash trick (sum char codes)
                  // is good enough — collisions across a single round's
                  // speech list are vanishingly rare.
                  data-speech-text-hash={(() => {
                    let h = 0;
                    for (let k = 0; k < s.text.length; k++) h = ((h << 5) - h) + s.text.charCodeAt(k);
                    return String(h);
                  })()}
                  style={{
                    fontSize: 12, padding: '4px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    color: 'rgba(255,255,255,0.7)',
                  }}>
                  {/* v6.8 — wrap speaker name in PersonaCard so the user
                       can hover/click to see this rat's epithet + 反差 chip
                       + catchphrases. Keeps the original color coding
                       (cat blue / dog red / neutral violet) inside. */}
                  <PersonaCard playerName={s.playerName} personality={speaker?.personality}>
                    <span style={{
                      fontWeight: 700,
                      color: s.team === 'cat' ? '#2fb8ff' : s.team === 'dog' ? '#ff4757' : '#a855f7',
                      borderBottom: '1px dashed rgba(255,215,0,0.4)',
                    }}>
                      {s.playerName}
                    </span>
                  </PersonaCard>
                  {pLabel && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2,
                      fontSize: 9, marginLeft: 4, padding: '1px 4px', borderRadius: 3,
                      background: `${pLabel.color}15`, color: pLabel.color,
                      border: `1px solid ${pLabel.color}30`,
                    }}>
                      <Icon src={pLabel.icon} emoji={pLabel.emoji} size={10} />
                      {pLabel.label}
                    </span>
                  )}
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>: </span>
                  {/* v6.26 P1 — gold ✨ chip when this speech was the
                      one that quoted a psy-war leak. Detection happens
                      on the server (substring match against leakedHints)
                      and arrives via game:leak_quoted → quotedLeaks Map.
                      Tooltip exposes which leak got referenced. */}
                  {(() => {
                    const matchedQuote = Array.from(quotedLeaks.entries()).find(
                      ([, info]) => info.speechText === s.text,
                    );
                    if (!matchedQuote) return null;
                    return (
                      <span
                        title={`引用了: "${matchedQuote[0].slice(0, 40)}"`}
                        style={{
                          display: 'inline-block', marginRight: 6,
                          padding: '0 6px', borderRadius: 4,
                          background: 'rgba(255,215,0,0.25)',
                          fontSize: 9, fontWeight: 900, letterSpacing: '0.06em',
                          color: '#FFD700', verticalAlign: 'middle',
                          boxShadow: '0 0 8px rgba(255,215,0,0.4)',
                        }}
                      >✨ 引用前同事爆料</span>
                    );
                  })()}
                  {s.text}
                  {/* v6.8 P4.1 — evidence chips: who this speaker is citing
                       from earlier in the round. Click jumps to the cited
                       speech (scrolls into view + golden flash). */}
                  {s.evidence && s.evidence.length > 0 && (
                    <div style={{
                      marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4,
                      paddingLeft: 8, borderLeft: '2px solid rgba(255,215,0,0.18)',
                    }}>
                      {s.evidence.map((ev, j) => (
                        <button
                          key={j}
                          type="button"
                          title={`${ev.refToPlayerName}: ${ev.refToTextSnippet}`}
                          onClick={() => {
                            // Find the cited row in the same scroll list and
                            // flash-highlight it for ~1.5s. Uses data-speech-id
                            // selector below.
                            const el = document.querySelector(
                              `[data-speech-player="${ev.refToPlayerId}"]`,
                            ) as HTMLElement | null;
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.style.transition = 'background 0.25s ease-out';
                              el.style.background = 'rgba(255,215,0,0.12)';
                              setTimeout(() => { el.style.background = ''; }, 1500);
                            }
                          }}
                          style={{
                            fontSize: 9.5, padding: '1px 6px', borderRadius: 999,
                            background: ev.kind === 'at_tag'
                              ? 'rgba(255,215,0,0.16)' : 'rgba(124,58,237,0.16)',
                            color: ev.kind === 'at_tag' ? '#FFD700' : '#B086FF',
                            border: `1px solid ${ev.kind === 'at_tag' ? 'rgba(255,215,0,0.45)' : 'rgba(124,58,237,0.45)'}`,
                            cursor: 'pointer', fontWeight: 700,
                            letterSpacing: '0.02em',
                          }}
                        >
                          ↳ 引用 {ev.refToPlayerName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {speechHistory.length === 0 && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>等待全员大会...</div>
            )}
          </div>

          {/* Dead players observer panel */}
          {deadPlayers.length > 0 && (
            <div style={{
              borderTop: '1px solid rgba(110,231,183,0.1)',
              padding: '8px 12px', maxHeight: 140, overflowY: 'auto',
            }}>
              <div style={{
                fontSize: 11, color: 'rgba(110,231,183,0.5)', marginBottom: 6,
                fontWeight: 700, letterSpacing: '0.1em',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Icon src={glyphIcons.ghostSpeech} emoji="👻" size={12} /> 离职旁观席
              </div>
              {deadPlayers.map((p) => {
                const pLabel = p.personality ? PERSONALITY_LABELS[p.personality] : null;
                return (
                <div key={p.id} style={{
                  fontSize: 11, padding: '3px 0',
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: 'rgba(255,255,255,0.4)',
                  flexWrap: 'wrap',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: p.ghostVoteUsed ? 'rgba(255,255,255,0.15)' : '#6ee7b7',
                    boxShadow: p.ghostVoteUsed ? 'none' : '0 0 6px rgba(110,231,183,0.5)',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  {pLabel && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '1px 4px', borderRadius: 3,
                      background: `${pLabel.color}15`, color: pLabel.color,
                      border: `1px solid ${pLabel.color}30`,
                    }}>
                      <Icon src={pLabel.icon} emoji={pLabel.emoji} size={10} />
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, padding: '1px 5px', borderRadius: 4,
                    background: p.ghostVoteUsed
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(110,231,183,0.1)',
                    color: p.ghostVoteUsed
                      ? 'rgba(255,255,255,0.25)'
                      : 'rgba(110,231,183,0.7)',
                    border: `1px solid ${p.ghostVoteUsed ? 'rgba(255,255,255,0.05)' : 'rgba(110,231,183,0.2)'}`,
                  }}>
                    {p.ghostVoteUsed ? '仲裁已用' : '仲裁票 ×1'}
                  </span>
                  {/* v6.66 — 牌局机制反哺主对局:替这只被裁的鼠去闯关牌局谈赔偿 */}
                  <button
                    onClick={() => navigate(`/fired/battle?for=${encodeURIComponent(p.name)}`)}
                    title={`替 ${p.name} 去跟 HR 谈赔偿(闯关牌局)`}
                    style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4, cursor: 'pointer',
                      background: 'rgba(167,139,250,0.15)', color: 'rgba(196,181,253,0.95)',
                      border: '1px solid rgba(167,139,250,0.4)',
                    }}>
                    ⚔️ 谈赔偿
                  </button>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating phase-hint banner — auto-dismisses, informational only */}
      <PhaseHint phase={phase} />

      {/* Role reference panel — opens on demand */}
      <RoleLegend />

      {/* v6.74 — 观众下注盘(原 PredictionBar 升级:筹码 + 赔率 + 派彩) */}
      {gameId && (
        <BettingBar
          gameId={gameId}
          phase={phase}
          round={round}
          players={players}
          lastEliminated={lastVoteEliminated}
          voteResultTick={voteResultTick}
          onIntervene={(itemId, targetId) => socket.emit('game:intervene', { itemId, targetId })}
          mode={isDual ? 'dual' : 'single'}
          companyMarket={market}
          gameWinner={companyWinner}
        />
      )}

      {/* v6.75 — 🕸️ 跨局恩怨录入口(右下角) */}
      <RelationNetworkButton />

      {/* Dramatic elimination moment — fullscreen 3s overlay */}
      <EliminationReveal latest={lastElim} activeNames={players.map((p) => p.name)} />

      {/* v0.5.1-A: kill flash hits ~250ms before EliminationReveal — strictly
          a `kill` event triggers the red overlay; vote ejections route to
          the vote-eject animation in the EliminationReveal layer instead. */}
      <KillFlashOverlay triggerId={lastElim?.type === 'kill' ? lastElim.id : 0} />

      {/* v0.5.1-B: vote-eject orbit + bottom banner. Fires only on vote
          eliminations (kill events route to KillFlashOverlay above). */}
      <VoteEjectAnimation
        triggerId={lastElim?.type === 'vote' ? lastElim.id : 0}
        playerName={lastElim?.type === 'vote' ? lastElim.playerName : undefined}
      />

      {/* v0.5.1-C: meeting alert — fires whenever phase flips to 'meeting'. */}
      <EmergencyMeetingTransition phase={phase} />

      {/* v6.8 P2: phase transition stinger (0.62s wipe + EVENT pill + SFX)
           for non-meeting / non-vote_result phases. The meeting cinematic
           and EliminationReveal already own their phases, so this layer
           covers role_reveal / free_roam / discussion / voting / game_over. */}
      <PhaseTransitionOverlay />

      {/* End-of-game recap — appears on phase === 'game_over' with a winner */}
      <HighlightReel />
    </div>
  );
}
