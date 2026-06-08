import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket, useSocketEvents } from '../hooks/useSocket';
import { getUserId } from '../utils/userId';
import EventPill from '../components/EventPill';
import PersonaCard from '../components/character/PersonaCard';
import IdleBeat from '../components/character/IdleBeat';
import {
  type GhostCommentItem,
  useGameId, usePhase, usePlayers, useRound, useTaskProgress,
  useCurrentSpeaker, useCurrentSpeech, useAvatarUrls, useGameActions,
} from '../stores/gameStore';
import PhaseHint from '../components/onboarding/PhaseHint';
import RoleLegend from '../components/onboarding/RoleLegend';
import PredictionBar from '../components/game/PredictionBar';
import EliminationReveal, { type EliminationEvent } from '../components/game/EliminationReveal';
import ReactionDanmaku, { type DanmakuTrigger } from '../components/game/ReactionDanmaku';
import { fetchReactionLine } from '../utils/reactionLine';
import { useNavigate } from 'react-router-dom';
import KillFlashOverlay from '../components/game/KillFlashOverlay';
import VoteEjectAnimation from '../components/game/VoteEjectAnimation';
import EmergencyMeetingTransition from '../components/game/EmergencyMeetingTransition';
import PhaseTransitionOverlay from '../components/game/PhaseTransitionOverlay';
import HighlightReel from '../components/game/HighlightReel';
import LottieAsset from '../components/LottieAsset';
import { ROLE_LABELS, teamForRole } from '../constants/roles';
import { lottie } from '../constants/lottie';
import { uid } from '../utils/uid';
import { playTtsFromUrl, stopTts, isAudioUnlocked, primeAudio, speakViaBrowserTTS, hasBrowserTTS } from '../utils/audioUnlock';
import { phaseIcons, teamIcons, personalityIcons, glyphIcons, Icon } from '../constants/icons';

// Vite proxies /avatars and /api to :3100, so relative URLs are best —
// they keep the browser on the same origin (5173) and avoid Safari ITP
// cross-port image-rendering quirks. We still keep the absolute SERVER_URL
// fallback for anything else that might need it.
const SERVER_URL = '';

const ROLE_VISUALS: Record<string, { emoji: string; label: string; color: string; glow: string }> = {
  // 打工人阵营
  villager_cat:   { emoji: '👨‍💻', label: '普通员工', color: '#4FC3F7', glow: '47, 195, 247' },
  detective_cat:  { emoji: '📋', label: 'HR总监', color: '#42A5F5', glow: '66, 165, 245' },
  medic_cat:      { emoji: '🛡️', label: '工会代表', color: '#E91E63', glow: '233, 30, 99' },
  engineer_cat:   { emoji: '💻', label: '程序员', color: '#FF9800', glow: '255, 152, 0' },
  bodyguard_cat:  { emoji: '⚖️', label: '法务顾问', color: '#5C6BC0', glow: '92, 107, 192' },
  medium_cat:     { emoji: '🔎', label: '内审专员', color: '#AB47BC', glow: '171, 71, 188' },
  vigilante_cat:  { emoji: '📊', label: '数据分析师', color: '#66BB6A', glow: '102, 187, 106' },
  adventurer_cat: { emoji: '🏆', label: '销售冠军', color: '#8D6E63', glow: '141, 110, 99' },
  mimic_cat:      { emoji: '🎒', label: '实习生', color: '#CE93D8', glow: '206, 147, 216' },
  politician_cat: { emoji: '🦊', label: '老油条', color: '#A1887F', glow: '161, 136, 127' },
  // 资本家阵营
  killer_dog:     { emoji: '👔', label: 'CEO', color: '#F44336', glow: '244, 67, 54' },
  spy_dog:        { emoji: '📽️', label: 'PPT高手', color: '#607D8B', glow: '96, 125, 139' },
  morphing_dog:   { emoji: '🎭', label: '甩锅王', color: '#FF7043', glow: '255, 112, 67' },
  ninja_dog:      { emoji: '🥷', label: '裁员专家', color: '#37474F', glow: '55, 71, 79' },
  hypnotist_dog:  { emoji: '🌀', label: 'PUA大师', color: '#7E57C2', glow: '126, 87, 194' },
  bomber_dog:     { emoji: '🔥', label: '内卷狂魔', color: '#D32F2F', glow: '211, 47, 47' },
  assassin_dog:   { emoji: '🗡️', label: '职场刺客', color: '#455A64', glow: '69, 90, 100' },
  silencer_dog:   { emoji: '🤐', label: '禁言管理', color: '#5C6BC0', glow: '92, 107, 192' },
  // 摸鱼阵营
  jester:         { emoji: '😎', label: '摆烂达人', color: '#FF4081', glow: '255, 64, 129' },
  phantom:        { emoji: '👻', label: '背锅侠', color: '#B39DDB', glow: '179, 157, 219' },
  pigeon:         { emoji: '🕊️', label: '鸽王', color: '#90CAF9', glow: '144, 202, 249' },
  lone_wolf:      { emoji: '🐺', label: '独行侠', color: '#78909C', glow: '120, 144, 156' },
  lover:          { emoji: '💕', label: '办公室恋人', color: '#F48FB1', glow: '244, 143, 177' },
};

// Team / phase / personality visual configs.
// Each row carries its AI-icon URL + an emoji fallback so the UI never
// renders a broken image even mid-regeneration.
const TEAM_CONFIG: Record<string, { label: string; emoji: string; icon: string; color: string; accent: string }> = {
  cat:     { label: '打工人', emoji: '👨‍💻', icon: teamIcons.cat,     color: '#2fb8ff', accent: '47, 184, 255' },
  dog:     { label: '资本家', emoji: '👔',   icon: teamIcons.dog,     color: '#ff4757', accent: '255, 71, 87' },
  neutral: { label: '摸鱼党', emoji: '😎',   icon: teamIcons.neutral, color: '#a855f7', accent: '168, 85, 247' },
};

const PHASE_LABELS: Record<string, { label: string; emoji: string; icon: string }> = {
  lobby:       { label: '待入职',   emoji: '⏳', icon: phaseIcons.lobby },
  role_reveal: { label: '岗位分配', emoji: '📋', icon: phaseIcons.role_reveal },
  free_roam:   { label: '日常搬砖', emoji: '💼', icon: phaseIcons.free_roam },
  meeting:     { label: '紧急全员会', emoji: '🚨', icon: phaseIcons.meeting },
  discussion:  { label: '职场撕逼', emoji: '🔥', icon: phaseIcons.discussion },
  voting:      { label: '投票裁员', emoji: '🗳️', icon: phaseIcons.voting },
  vote_result: { label: '裁员结果', emoji: '⚖️', icon: phaseIcons.vote_result },
  game_over:   { label: '散伙饭',   emoji: '🏆', icon: phaseIcons.game_over },
};

// v6.16 P2 — see Classic.tsx; promoted to shared constants module.
import { PERSONALITY_LABELS } from '../constants/personalityLabels';

function getTeamForRole(role: string): string {
  if (role.endsWith('_cat')) return 'cat';
  if (role.endsWith('_dog')) return 'dog';
  return 'neutral';
}

// How long to wait for `game:speech_audio` after a `game:speech` event before
// giving up and reading the speech via browser TTS. Minimax speech-2.8-hd
// typically takes 2-4 s to generate + transmit, so we wait 4.5 s. Once
// real audio arrives we also call window.speechSynthesis.cancel() to stop
// any browser-TTS that already started — see playTtsFromUrl in audioUnlock.
const BROWSER_TTS_DELAY_MS = 4500;

// Map role → speaker gender hint. Aligns with ROLE_VOICES in tts.ts so the
// browser-TTS fallback at least picks a plausibly-gendered system voice.
function inferGenderFromRole(role?: string): 'male' | 'female' | undefined {
  if (!role) return undefined;
  const female = new Set([
    'medic_cat', 'mimic_cat', 'silencer_dog', 'lover',
    'pigeon', 'adventurer_cat',
  ]);
  if (female.has(role)) return 'female';
  return 'male';
}

export default function Immersive() {
  const { socket, connected } = useSocket();
  const navigate = useNavigate();

  // Atomic slice subscriptions — prevents whole-component re-renders on
  // unrelated state changes (e.g. avatar URL updates during active speech).
  const gameId = useGameId();
  const phase = usePhase();
  const players = usePlayers();
  const round = useRound();
  const taskProgress = useTaskProgress();
  const currentSpeaker = useCurrentSpeaker();
  const currentSpeech = useCurrentSpeech();
  const avatarUrls = useAvatarUrls();
  const {
    setGameId, updateState, applyTick, setSpeaker, addSpeech, addGhostComment, setAvatarUrl,
    pushElimination, reset, mergeGhostVote,
  } = useGameActions();

  const [speechText, setSpeechText] = useState('');
  const [activeDanmaku, setActiveDanmaku] = useState<GhostCommentItem[]>([]);
  const [audioBlocked, setAudioBlocked] = useState(false);   // shows "tap to enable voice" when play() is rejected
  const createdRef = useRef(false);
  // Pending browser-TTS state — captured on `game:speech`, consumed/cancelled
  // on `game:speech_audio`. See the speech handler for the full race logic.
  const pendingSpeechRef = useRef<{ text: string; gender?: 'male' | 'female' } | null>(null);
  const browserTtsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Elimination reveal + prediction bar plumbing — mirrors Classic.tsx.
  // See Classic.tsx for the detailed rationale on monotonic ids and the
  // separate `voteResultTick` that drives PredictionBar resolution.
  const [lastElim, setLastElim] = useState<EliminationEvent | null>(null);
  // v6.68 — 沉浸局对齐:群众吐槽弹幕触发
  const [danmaku, setDanmaku] = useState<DanmakuTrigger | null>(null);
  const dmIdRef = useRef(0);
  // v6.69 — 静态弹幕即时 + LLM 实时那句追加(沉浸局是圆桌布局,弹幕横向飘,不带工位坐标)。
  const fireReactions = (kind: 'kill' | 'vote', victimName: string, victim?: { role?: string; personality?: string }) => {
    setDanmaku({ id: ++dmIdRef.current, kind });
    const victimRole = victim?.role ? ROLE_LABELS[victim.role] : undefined;
    const victimPersonality = victim?.personality ? PERSONALITY_LABELS[victim.personality]?.label : undefined;
    void fetchReactionLine({ kind, victimName, victimRole, victimPersonality }).then((line) => {
      if (line) setDanmaku({ id: ++dmIdRef.current, kind, text: line, emoji: '🗣️' });
    });
  };
  const [lastVoteEliminated, setLastVoteEliminated] = useState<string | null>(null);
  const [voteResultTick, setVoteResultTick] = useState(0);
  const elimIdRef = useRef(0);

  // Register all socket event handlers — auto-cleaned on unmount.
  useSocketEvents({
    'game:created': (data: { gameId: string }) => {
      setGameId(data.gameId);
      socket.emit('game:start', data.gameId);
    },
    'game:state': (state: any) => updateState(state),
    // PR1 free-roam tick — see Classic.tsx for rationale.
    'game:tick': (data: any) => applyTick(data),
    'game:speech_start': (data: { playerId: string }) => {
      setSpeaker(data.playerId);
      setSpeechText('');
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
      setSpeechText(data.text);
      // Schedule a browser-TTS fallback. If `game:speech_audio` arrives within
      // BROWSER_TTS_DELAY_MS we cancel this; otherwise we read the speech via
      // the browser's native synth so the user always hears something even
      // when the API quota is exhausted. The pending speech text+gender is
      // captured in a ref so the audio handler can decide whether to skip.
      const gender = inferGenderFromRole(data.role);
      pendingSpeechRef.current = { text: data.text, gender };
      if (browserTtsTimerRef.current) clearTimeout(browserTtsTimerRef.current);
      browserTtsTimerRef.current = setTimeout(() => {
        const pending = pendingSpeechRef.current;
        if (pending && hasBrowserTTS()) {
          speakViaBrowserTTS(pending.text, { genderHint: pending.gender });
        }
        pendingSpeechRef.current = null;
      }, BROWSER_TTS_DELAY_MS);
    },
    'game:speech_end': () => setSpeaker(null),
    'game:speech_audio': async (data: { audioUrl: string }) => {
      // Server audio arrived — cancel the pending browser-TTS fallback and
      // route through the shared, gesture-unlocked element. If play() is
      // rejected (Safari autoplay), fall back to browser TTS using the
      // text we just captured for this speech.
      if (browserTtsTimerRef.current) {
        clearTimeout(browserTtsTimerRef.current);
        browserTtsTimerRef.current = null;
      }
      const pending = pendingSpeechRef.current;
      pendingSpeechRef.current = null;

      const ok = await playTtsFromUrl(data.audioUrl);
      if (ok) {
        setAudioBlocked(false);
        return;
      }
      // URL playback failed — try browser TTS as last resort.
      if (pending && hasBrowserTTS()) {
        await speakViaBrowserTTS(pending.text, { genderHint: pending.gender });
        setAudioBlocked(false);
      } else if (!isAudioUnlocked()) {
        setAudioBlocked(true);
      }
    },
    'game:avatar_ready': (data: { role: string; url: string }) =>
      setAvatarUrl(data.role, `${SERVER_URL}${data.url}`),

    // Elimination events — newly wired for Immersive (were previously only in Classic).
    // Without these, Immersive had no EliminationReveal trigger and no recap data
    // for HighlightReel, so the dramatic beats went entirely unpublished.
    'game:vote_result': (data: { votes: Record<string, string>; ghostVotes?: Record<string, string>; eliminated?: string; playerName?: string; eliminatedPersonality?: string }) => {
      setLastVoteEliminated(data.eliminated ?? null);
      setVoteResultTick((n) => n + 1);
      if (data.eliminated && data.playerName) {
        const victim = players.find((p) => p.id === data.eliminated);
        setLastElim({
          id: ++elimIdRef.current,
          type: 'vote',
          playerName: data.playerName,
          roleLabel: victim?.role ? ROLE_LABELS[victim.role] : undefined,
          team: teamForRole(victim?.role),
          // v6.24 P1 — prefer event-authoritative personality.
          personality: data.eliminatedPersonality ?? victim?.personality,
          // v6.41 P2 — carry pack emoji avatar into the reveal + recap.
          avatar: victim?.avatar,
        });
        fireReactions('vote', data.playerName, victim); // v6.68/69 — 群众吐槽(静态+LLM)
        pushElimination({
          round,
          type: 'vote',
          playerId: data.eliminated,
          playerName: data.playerName,
          role: victim?.role,
          team: teamForRole(victim?.role),
          avatar: victim?.avatar,
        });
      }
    },

    'game:kill': (data: { victimId: string; victimName?: string; location?: string; victimPersonality?: string }) => {
      const victim = players.find((p) => p.id === data.victimId);
      const name = data.victimName || victim?.name || '???';
      setLastElim({
        id: ++elimIdRef.current,
        type: 'kill',
        playerName: name,
        roleLabel: victim?.role ? ROLE_LABELS[victim.role] : undefined,
        team: teamForRole(victim?.role),
        location: data.location,
        // v6.24 P1 — prefer event-authoritative personality.
        personality: data.victimPersonality ?? victim?.personality,
        // v6.41 P2 — carry pack emoji avatar into the reveal + recap.
        avatar: victim?.avatar,
      });
      fireReactions('kill', name, victim); // v6.68/69 — 群众吐槽(静态+LLM)
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

    'game:over': (data: any) => {
      if (data.winner) updateState({ ...data, phase: 'game_over' });
    },
    // v6.24 P2 — real-time ghost vote signal (mirrors Classic handler).
    'game:ghost_vote_cast': (data: { ghostId: string; ghostName: string; target: string }) => {
      mergeGhostVote(data.ghostId, data.target);
    },

    'game:ghost_comment': (data: { playerId: string; playerName: string; text: string; role?: string; team?: string }) => {
      addGhostComment(data);
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
  });

  // Kick off the game once (guarded by `createdRef`) — wait for connection first
  // so the create event doesn't land in the reconnect buffer.
  useEffect(() => {
    if (!connected || createdRef.current) return;
    createdRef.current = true;
    reset();
    // v5.8.2 — userId enables per-spectator chunky-style AI memory.
    socket.emit('game:create', { playerCount: 8, mode: 'immersive', userId: getUserId() });
  }, [connected, socket, reset]);

  // Pause any playing TTS audio when leaving the route.
  useEffect(() => stopTts, []);

  const circleRadius = Math.min(280, typeof window !== 'undefined' ? window.innerWidth * 0.28 : 280);
  const phaseInfo = PHASE_LABELS[phase] || { label: phase, emoji: '🎮', icon: '' };

  return (
    <div className="fixed inset-0 overflow-hidden noise"
      style={{ background: '#050510' }}>

      {/* Ambient aurora layers — restrained pair instead of pulsing orbs */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="aurora" style={{
          top: '-15%', left: '-8%', width: '60vmax', height: '60vmax',
          ['--c' as never]: 'rgba(124,58,237,0.32)', opacity: 0.38,
        }} />
        <div className="aurora" style={{
          bottom: '-20%', right: '-10%', width: '55vmax', height: '55vmax',
          ['--c' as never]: 'rgba(76,158,255,0.32)', opacity: 0.35,
        }} />
        <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(76,158,255,0.06) 0%, transparent 60%)', filter: 'blur(40px)' }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none grid-dots"
        style={{ opacity: 0.45, maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 70%)' }} />

      {/* 弹幕 Danmaku overlay for ghost comments */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
        <AnimatePresence>
          {activeDanmaku.map((d, i) => (
            <motion.div key={d.id}
              initial={{ x: '110vw', opacity: 0.85 }}
              animate={{ x: '-110vw', opacity: 0.85 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 7, ease: 'linear' }}
              style={{
                position: 'absolute',
                top: `${8 + (i % 6) * 12}%`,
                whiteSpace: 'nowrap',
                fontSize: 15,
                fontWeight: 700,
                padding: '5px 16px',
                borderRadius: 24,
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(6px)',
                border: '1px solid rgba(110,231,183,0.25)',
                color: '#6ee7b7',
                textShadow: '0 0 12px rgba(110,231,183,0.4)',
              }}>
              <Icon src={glyphIcons.ghostSpeech} emoji="👻" size={18} style={{ marginRight: 8, opacity: 0.75, verticalAlign: 'middle' }} />
              <span style={{ color: 'rgba(255,255,255,0.45)', marginRight: 6, fontSize: 13 }}>{d.playerName}:</span>
              {d.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Task progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 z-20"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <motion.div className="h-full" initial={{ width: '0%' }}
          animate={{ width: `${Math.min(taskProgress, 100)}%` }}
          style={{ background: 'linear-gradient(90deg, #4c9eff 0%, #7c3aed 100%)', boxShadow: '0 0 12px rgba(76,158,255,0.55)' }}
          transition={{ duration: 0.5 }} />
      </div>

      {/* v6.4 — floating mihoyo badge top-left, 不干扰 phase chip 居中布局 */}
      <div className="absolute top-4 left-4 z-30">
        <EventPill stars={5} subtle>🎬 沉浸 · v6</EventPill>
      </div>

      {/* Audio-autoplay fallback banner. Only shows if the shared audio
          element couldn't be unlocked from Landing's "进入" gesture (rare —
          usually means the user clicked a back-button mid-flow or landed
          directly on /immersive/:id without going through Landing). Tapping
          the banner primes the audio and immediately replays the last clip. */}
      {audioBlocked && (
        <motion.button
          onClick={() => {
            primeAudio();
            setAudioBlocked(false);
          }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 right-4 z-30 px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #ff3355 0%, #7c3aed 100%)',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(124,58,237,0.4)',
          }}
        >
          <span>🔇</span>
          <span>点击开启语音</span>
        </motion.button>
      )}

      {/* Phase indicator */}
      <motion.div className="absolute top-6 left-1/2 -translate-x-1/2 z-20"
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <AnimatePresence mode="wait">
          <motion.div key={phase + round}
            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-2">
            {round > 0 && (
              <span className="text-[10px] font-bold tracking-[0.3em] uppercase tabular-nums"
                style={{ color: 'rgba(76,158,255,0.8)' }}>
                ROUND {round}
              </span>
            )}
            <div className="flex items-center gap-2.5 px-5 py-2 rounded-full"
              style={{
                background: 'linear-gradient(135deg, rgba(76,158,255,0.14) 0%, rgba(124,58,237,0.1) 100%)',
                backdropFilter: 'blur(20px) saturate(140%)',
                WebkitBackdropFilter: 'blur(20px) saturate(140%)',
                border: '1px solid rgba(76,158,255,0.28)',
                boxShadow: '0 4px 24px rgba(76,158,255,0.16), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}>
              <Icon src={phaseInfo.icon} emoji={phaseInfo.emoji} size={22} alt={phaseInfo.label} />
              <span className="text-base font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {phaseInfo.label}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Game over → HighlightReel takes over (see bottom of component).
          The old inline winner banner here was superseded by the reel's
          richer timeline + dossier UX. */}

      {/* Player circle */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ width: circleRadius * 2 + 160, height: circleRadius * 2 + 160 }}>
          {players.map((player, i) => {
            const angle = (2 * Math.PI * i) / players.length - Math.PI / 2;
            const x = Math.cos(angle) * circleRadius;
            const y = Math.sin(angle) * circleRadius;
            const role = player.role || 'villager_cat';
            const visual = ROLE_VISUALS[role] || { emoji: '❓', label: role, color: '#888', glow: '136,136,136' };
            const team = player.team || getTeamForRole(role);
            const teamCfg = TEAM_CONFIG[team] || TEAM_CONFIG.neutral;
            const isSpeaking = currentSpeaker === player.id;
            const avatarSrc = avatarUrls[player.avatarKey || role]; // v6.55 #2 — unique per player

            return (
              <motion.div key={player.id} className="absolute flex flex-col items-center"
                style={{ left: '50%', top: '50%', width: 130, marginLeft: -65, marginTop: -65 }}
                initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                animate={{ opacity: 1, scale: 1, x, y }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 200, damping: 20 }}>

                {/* Speech bubble (when LLM has produced text) OR idle micro-action
                     (during the speech_start → speech "thinking" window). The
                     v6.8 P3 IdleBeat replaces what used to be empty space and
                     gives each personality its own thinking animation. */}
                <AnimatePresence>
                  {isSpeaking && speechText && (
                    <motion.div className="absolute -top-20 left-1/2 -translate-x-1/2 w-52 z-10"
                      initial={{ opacity: 0, y: 8, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.9 }}
                      transition={{ duration: 0.25 }}>
                      <div className="px-3 py-2 rounded-xl text-xs leading-relaxed text-center line-clamp-3"
                        style={{
                          background: 'rgba(15,14,46,0.8)',
                          backdropFilter: 'blur(16px)',
                          border: `1px solid rgba(${visual.glow}, 0.3)`,
                          color: 'rgba(255,255,255,0.9)',
                          boxShadow: `0 0 16px rgba(${visual.glow}, 0.15)`,
                        }}>
                        {speechText}
                      </div>
                      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45"
                        style={{
                          background: 'rgba(15,14,46,0.8)',
                          borderRight: `1px solid rgba(${visual.glow}, 0.3)`,
                          borderBottom: `1px solid rgba(${visual.glow}, 0.3)`,
                        }} />
                    </motion.div>
                  )}
                  {isSpeaking && !speechText && (
                    <motion.div
                      key="idle"
                      className="absolute -top-14 left-1/2 -translate-x-1/2 z-10"
                      initial={{ opacity: 0, y: 6, scale: 0.92 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.92 }}
                      transition={{ duration: 0.18 }}
                    >
                      <IdleBeat
                        personality={player.personality}
                        tint={`rgb(${visual.glow})`}
                        size={22}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Player card - glassmorphism */}
                <motion.div className="relative flex flex-col items-center p-2 rounded-2xl"
                  style={{
                    background: isSpeaking ? `rgba(${visual.glow}, 0.06)` : 'rgba(15,14,46,0.3)',
                    backdropFilter: 'blur(12px)',
                    border: isSpeaking
                      ? `1px solid rgba(${visual.glow}, 0.4)`
                      : `1px solid rgba(255,255,255,0.06)`,
                    opacity: player.isAlive ? 1 : 0.35,
                    filter: player.isAlive ? 'none' : 'grayscale(0.8)',
                  }}
                  animate={isSpeaking ? {
                    boxShadow: [
                      `0 0 20px rgba(${visual.glow}, 0.2)`,
                      `0 0 40px rgba(${visual.glow}, 0.35)`,
                      `0 0 20px rgba(${visual.glow}, 0.2)`,
                    ],
                  } : { boxShadow: '0 0 0px transparent' }}
                  transition={isSpeaking ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}>

                  {/* Avatar */}
                  <div className="relative w-16 h-16 rounded-full flex items-center justify-center overflow-hidden"
                    style={{
                      border: `2px solid ${isSpeaking ? visual.color : teamCfg.color}`,
                      boxShadow: isSpeaking ? `0 0 16px rgba(${visual.glow}, 0.4)` : 'none',
                    }}>
                    {isSpeaking && (
                      <motion.div className="absolute inset-0 rounded-full"
                        style={{ border: `2px solid rgba(${visual.glow}, 0.6)` }}
                        animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0, 0.8] }}
                        transition={{ duration: 1.5, repeat: Infinity }} />
                    )}
                    <RoleAvatar
                      src={avatarSrc}
                      label={visual.label}
                      emoji={visual.emoji}
                      glow={visual.glow}
                    />
                    {!player.isAlive && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xl font-bold text-red-400">
                        ✕
                      </div>
                    )}
                  </div>

                  {/* Team badge */}
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center overflow-hidden"
                    style={{
                      background: `rgba(${teamCfg.accent}, 0.15)`,
                      border: `1px solid rgba(${teamCfg.accent}, 0.3)`,
                      backdropFilter: 'blur(8px)',
                    }}>
                    <Icon src={teamCfg.icon} emoji={teamCfg.emoji} size={14} alt={teamCfg.label} />
                  </div>

                  {/* Name */}
                  <span className="mt-1.5 text-xs font-bold truncate w-full text-center"
                    style={{ color: isSpeaking ? visual.color : 'rgba(255,255,255,0.85)' }}>
                    {player.name}
                  </span>

                  {/* Role label */}
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5"
                    style={{
                      color: visual.color,
                      background: `rgba(${visual.glow}, 0.1)`,
                      border: `1px solid rgba(${visual.glow}, 0.15)`,
                    }}>
                    {visual.label}
                  </span>

                  {/* Personality badge */}
                  {player.personality && PERSONALITY_LABELS[player.personality] && (() => {
                    const pl = PERSONALITY_LABELS[player.personality!];
                    return (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 inline-flex items-center gap-1"
                        style={{
                          color: pl.color,
                          background: `${pl.color}15`,
                          border: `1px solid ${pl.color}30`,
                        }}>
                        <Icon src={pl.icon} emoji={pl.emoji} size={11} alt={pl.label} />
                        {pl.label}
                      </span>
                    );
                  })()}

                  {/* Ghost vote indicator for dead players */}
                  {!player.isAlive && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5"
                      style={{
                        color: player.ghostVoteUsed ? 'rgba(255,255,255,0.25)' : '#6ee7b7',
                        background: player.ghostVoteUsed ? 'rgba(255,255,255,0.04)' : 'rgba(110,231,183,0.1)',
                        border: `1px solid ${player.ghostVoteUsed ? 'rgba(255,255,255,0.06)' : 'rgba(110,231,183,0.25)'}`,
                        textShadow: player.ghostVoteUsed ? 'none' : '0 0 6px rgba(110,231,183,0.4)',
                      }}>
                      {player.ghostVoteUsed ? '仲裁已用' : '⚖️ 仲裁票'}
                    </span>
                  )}

                  {/* v6.66 — 牌局机制反哺主对局:替这只被裁的鼠去闯关牌局谈赔偿 */}
                  {!player.isAlive && (
                    <button
                      onClick={() => navigate(`/fired/battle?for=${encodeURIComponent(player.name)}`)}
                      title={`替 ${player.name} 去跟 HR 谈赔偿(闯关牌局)`}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5"
                      style={{
                        color: 'rgba(196,181,253,0.95)',
                        background: 'rgba(167,139,250,0.15)',
                        border: '1px solid rgba(167,139,250,0.4)',
                      }}>
                      ⚔️ 谈赔偿
                    </button>
                  )}
                </motion.div>
              </motion.div>
            );
          })}

          {/* Center orb */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
            <motion.div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl"
              style={{
                background: 'linear-gradient(135deg, rgba(76,158,255,0.14) 0%, rgba(124,58,237,0.1) 100%)',
                backdropFilter: 'blur(18px) saturate(140%)',
                WebkitBackdropFilter: 'blur(18px) saturate(140%)',
                border: '1px solid rgba(76,158,255,0.2)',
                boxShadow: '0 0 36px rgba(76,158,255,0.14), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}>
              💼
            </motion.div>
          </div>
        </div>
      </div>

      {/* Bottom speech panel — frosted glass */}
      <AnimatePresence>
        {currentSpeech && (
          <motion.div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-full max-w-xl px-4"
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
            <div className="rounded-2xl px-6 py-4 glass-strong">
              <div className="flex items-center gap-3 mb-2">
                {/* Speaking indicator */}
                <div className="flex items-center gap-1">
                  {[0,1,2].map((i) => (
                    <motion.div key={i} className="w-1 rounded-full"
                      style={{ background: ROLE_VISUALS[currentSpeech.role || '']?.color || '#4c9eff' }}
                      animate={{ height: [4, 14, 4] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </div>
                {/* v6.8 — PersonaCard hover/click for IP + 反差 chip. The
                     enclosing span keeps the existing color/weight. */}
                <PersonaCard
                  playerName={currentSpeech.playerName}
                  personality={players.find((p) => p.id === currentSpeech.playerId)?.personality}
                >
                  <span className="text-sm font-bold" style={{
                    color: 'rgba(255,255,255,0.95)',
                    borderBottom: '1px dashed rgba(255,215,0,0.4)',
                  }}>
                    {currentSpeech.playerName}
                  </span>
                </PersonaCard>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide"
                  style={{
                    color: ROLE_VISUALS[currentSpeech.role || '']?.color || '#888',
                    background: `rgba(${ROLE_VISUALS[currentSpeech.role || '']?.glow || '136,136,136'}, 0.12)`,
                    border: `1px solid rgba(${ROLE_VISUALS[currentSpeech.role || '']?.glow || '136,136,136'}, 0.25)`,
                  }}>
                  {ROLE_VISUALS[currentSpeech.role || '']?.label || currentSpeech.role}
                </span>
                {/* Personality badge in speech panel */}
                {(() => {
                  const sp = players.find((p) => p.id === currentSpeech.playerId);
                  const pl = sp?.personality ? PERSONALITY_LABELS[sp.personality] : null;
                  return pl ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide inline-flex items-center gap-1"
                      style={{
                        color: pl.color,
                        background: `${pl.color}15`,
                        border: `1px solid ${pl.color}30`,
                      }}>
                      <Icon src={pl.icon} emoji={pl.emoji} size={12} alt={pl.label} />
                      {pl.label}
                    </span>
                  ) : null;
                })()}
              </div>
              <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.88)' }}>
                {currentSpeech.text}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading state — Lottie magnifier replaces the flat CSS spinner.
          Fallback to the original spinner if the JSON fails to load. */}
      {!gameId && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <motion.div className="flex flex-col items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <LottieAsset
              src={lottie.search}
              size={180}
              fallback={
                <motion.div className="w-12 h-12 rounded-full mt-16"
                  style={{ border: '2px solid rgba(76,158,255,0.18)', borderTop: '2px solid #4c9eff' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
              }
            />
            <span className="text-sm font-medium tracking-wide" style={{ color: 'rgba(76,158,255,0.8)' }}>
              正在组建公司…
            </span>
          </motion.div>
        </div>
      )}

      {/* Floating phase-hint banner — auto-dismisses after a few seconds per phase */}
      {gameId && <PhaseHint phase={phase} />}

      {/* Role reference panel — opens on demand (always available after join) */}
      {gameId && <RoleLegend />}

      {/* Spectator prediction layer — mode parity with Classic */}
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

      {/* Dramatic elimination moment — 3s fullscreen on every kill/vote-out */}
      {/* v6.68 — 沉浸局对齐:群众吐槽弹幕飘过全屏 */}
      <ReactionDanmaku trigger={danmaku} fixed />

      <EliminationReveal latest={lastElim} activeNames={players.map((p) => p.name)} />

      {/* v0.5.1 punchy animation pack — same wiring as Classic.tsx. */}
      <KillFlashOverlay triggerId={lastElim?.type === 'kill' ? lastElim.id : 0} />
      <VoteEjectAnimation
        triggerId={lastElim?.type === 'vote' ? lastElim.id : 0}
        playerName={lastElim?.type === 'vote' ? lastElim.playerName : undefined}
      />
      <EmergencyMeetingTransition phase={phase} />

      {/* v6.8 P2 — phase transition stinger for non-cinematic phases */}
      <PhaseTransitionOverlay />

      {/* End-of-game recap — replaces the old winner banner */}
      <HighlightReel />
    </div>
  );
}

/**
 * RoleAvatar — small isolation component that owns its own "did the image
 * fail to load" state. The previous inline imperative version mutated DOM
 * via `e.target.style.display = 'none'`, but those direct style writes
 * survive React re-renders and prevent recovery when the URL later becomes
 * valid (e.g. after a Content-Type fix on the server side). React state
 * + key={src} resets cleanly whenever the avatar URL changes.
 */
function RoleAvatar({
  src,
  label,
  emoji,
  glow,
}: {
  src: string | undefined;
  label: string;
  emoji: string;
  glow: string;
}) {
  const [failed, setFailed] = useState(false);
  // Reset the "failed" memory whenever the URL changes — otherwise an
  // earlier broken-image event keeps the avatar permanently downgraded
  // even after the server starts serving the right Content-Type.
  useEffect(() => { setFailed(false); }, [src]);
  const showImg = !!src && !failed;
  return (
    <>
      {showImg && (
        <img
          key={src}
          src={src}
          alt={label}
          className="w-full h-full object-cover"
          onLoad={() => setFailed(false)}
          onError={() => setFailed(true)}
        />
      )}
      {!showImg && (
        <div
          className="absolute inset-0 flex items-center justify-center text-2xl"
          style={{ background: `linear-gradient(135deg, rgba(${glow},0.3), rgba(${glow},0.1))` }}
        >
          {emoji}
        </div>
      )}
    </>
  );
}
