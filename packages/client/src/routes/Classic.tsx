import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket, useSocketEvents } from '../hooks/useSocket';
import {
  type GhostCommentItem,
  usePhase, usePlayers, useRound, useTaskProgress,
  useSpeechHistory, useGhostComments, useAvatarUrls,
  useCurrentSpeaker,
  useGameActions,
} from '../stores/gameStore';
import GameMap from '../components/game/GameMap';
import PhaseHint from '../components/onboarding/PhaseHint';
import RoleLegend from '../components/onboarding/RoleLegend';
import PredictionBar from '../components/game/PredictionBar';
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

const PERSONALITY_LABELS: Record<string, { label: string; emoji: string; icon: string; color: string }> = {
  social_butterfly:   { label: '社牛',   emoji: '🦋', icon: personalityIcons.social_butterfly,   color: '#FF6B9D' },
  introvert:          { label: '社恐',   emoji: '🐢', icon: personalityIcons.introvert,          color: '#7EC8E3' },
  contrarian:         { label: '杠精',   emoji: '🔨', icon: personalityIcons.contrarian,         color: '#FF4444' },
  sycophant:          { label: '舔狗',   emoji: '🐶', icon: personalityIcons.sycophant,          color: '#FFB347' },
  passive_aggressive: { label: '阴阳人', emoji: '🌗', icon: personalityIcons.passive_aggressive, color: '#B19CD9' },
  hot_tempered:       { label: '暴躁哥', emoji: '🌋', icon: personalityIcons.hot_tempered,       color: '#FF6347' },
  smooth_operator:    { label: '老狐狸', emoji: '🦊', icon: personalityIcons.smooth_operator,    color: '#DAA520' },
  workaholic:         { label: '卷王',   emoji: '📈', icon: personalityIcons.workaholic,         color: '#00CED1' },
};

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
  type: 'speech' | 'vote' | 'kill' | 'phase' | 'system' | 'ghost';
  text: string;
  timestamp: number;
}

export default function Classic() {
  const { gameId } = useParams<{ gameId: string }>();

  // Atomic slice subscriptions — component re-renders only when the slice it
  // reads actually changes, rather than on every unrelated `set()` call.
  const phase = usePhase();
  const players = usePlayers();
  const round = useRound();
  const taskProgress = useTaskProgress();
  const speechHistory = useSpeechHistory();
  const currentSpeaker = useCurrentSpeaker();
  const ghostComments = useGhostComments();
  const avatarUrls = useAvatarUrls();
  const { updateState, applyTick, setSpeaker, addSpeech, addGhostComment, setAvatarUrl, pushElimination, reset } =
    useGameActions();

  const { socket, connected, connecting, reconnectAttempt } = useSocket();

  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [activeDanmaku, setActiveDanmaku] = useState<GhostCommentItem[]>([]);
  // Elimination reveal: monotonic id + payload. Bumping id triggers the overlay.
  const [lastElim, setLastElim] = useState<EliminationEvent | null>(null);
  // Prediction bar resolution: separate tick so the bar only resolves on a
  // real vote_result event, not on arbitrary phase toggles.
  const [lastVoteEliminated, setLastVoteEliminated] = useState<string | null>(null);
  const [voteResultTick, setVoteResultTick] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const elimIdRef = useRef(0);
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
    },

    // Speaker spotlight: GameMap uses currentSpeaker to draw a pulsing
    // ring + scale-bump on the active player's avatar.
    'game:speech_start': (data: { playerId: string }) => setSpeaker(data.playerId),
    'game:speech_end': () => setSpeaker(null),

    'game:speech': (data: { playerId: string; playerName: string; text: string; role?: string; team?: string }) => {
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

    'game:vote_result': (data: { votes: Record<string, string>; ghostVotes?: Record<string, string>; eliminated?: string; playerName?: string }) => {
      let msg = data.eliminated && data.playerName
        ? `${data.playerName} 被投票开除` : '投票平局，无人被开除';
      if (data.ghostVotes && Object.keys(data.ghostVotes).length > 0) {
        msg += ` (含${Object.keys(data.ghostVotes).length}票劳动仲裁)`;
      }
      pushEvent('vote', msg);

      // Drive the PredictionBar resolution exactly once per vote event.
      setLastVoteEliminated(data.eliminated ?? null);
      setVoteResultTick((n) => n + 1);

      // Drive the dramatic reveal — only on actual eliminations (ties skip it).
      if (data.eliminated && data.playerName) {
        const victim = players.find((p) => p.id === data.eliminated);
        setLastElim({
          id: ++elimIdRef.current,
          type: 'vote',
          playerName: data.playerName,
          roleLabel: victim?.role ? ROLE_LABELS[victim.role] : undefined,
          team: teamForRole(victim?.role),
        });
        // Append to persistent recap log so HighlightReel can replay later.
        pushElimination({
          round,
          type: 'vote',
          playerId: data.eliminated,
          playerName: data.playerName,
          role: victim?.role,
          team: teamForRole(victim?.role),
        });
      }
    },

    'game:kill': (data: { victimId: string; victimName?: string; location?: string }) => {
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
      });
      pushElimination({
        round,
        type: 'kill',
        playerId: data.victimId,
        playerName: name,
        role: victim?.role,
        team: teamForRole(victim?.role),
        location: data.location,
      });
    },

    'game:over': (data: { winner: string }) => {
      const w = data.winner === 'cat' ? '打工人阵营' : data.winner === 'dog' ? '资本家阵营' : data.winner;
      pushEvent('system', `散伙饭! ${w} 获胜!`);
    },

    'game:avatar_ready': (data: { role: string; url: string }) => {
      setAvatarUrl(data.role, `${SERVER_URL}${data.url}`);
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

      {/* Main content */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Game map + danmaku overlay */}
        <div style={{ flex: 7, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <GameMap
            players={players}
            avatarUrls={avatarUrls}
            currentSpeakerId={currentSpeaker}
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

        {/* Right: Event panel — frosted glass */}
        <div style={{
          flex: 3, display: 'flex', flexDirection: 'column',
          background: 'rgba(6,6,18,0.45)',
          backdropFilter: 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: 'blur(20px) saturate(140%)',
          borderLeft: '1px solid rgba(76,158,255,0.1)',
        }}>
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
                <div key={i} style={{
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
                  {s.text}
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

      {/* Spectator prediction layer — gamifies watching (bottom-left) */}
      {gameId && (
        <PredictionBar
          gameId={gameId}
          phase={phase}
          round={round}
          players={players}
          lastEliminated={lastVoteEliminated}
          voteResultTick={voteResultTick}
        />
      )}

      {/* Dramatic elimination moment — fullscreen 3s overlay */}
      <EliminationReveal latest={lastElim} />

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
