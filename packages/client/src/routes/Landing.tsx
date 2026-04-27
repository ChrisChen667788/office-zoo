/**
 * Landing — "0 点的写字楼" mode-select entry.
 *
 * Previous iteration leaned on a saturated cyan/purple Y2K gradient that read
 * as "generic AI product landing". This rewrite adopts a more restrained,
 * cinematic palette: deep navy base, two aurora blobs instead of eight orbs,
 * left-aligned display type with tight tracking, and a bento of mode cards
 * that each carry their own accent color so visual hierarchy isn't just
 * "which one is blue-er".
 *
 * Design tokens imported from `constants/design.ts` so inline styles and
 * `var(--token)` references in `index.css` stay in sync.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket, useSocketEvent } from '../hooks/useSocket';
import RulesModal, { shouldAutoShowRules, markRulesSeen } from '../components/onboarding/RulesModal';
import SfxToggle from '../components/game/SfxToggle';
import LottieAsset from '../components/LottieAsset';
import { primeAudio } from '../utils/audioUnlock';
import { colors } from '../constants/design';
import { lottie } from '../constants/lottie';
import { modeIcons, Icon } from '../constants/icons';

const PLAYER_COUNTS = [6, 8, 10] as const;
type GameMode = 'classic' | 'immersive' | 'fired';

interface ModeSpec {
  key: GameMode;
  icon: string;        // AI-generated icon URL (from constants/icons.ts)
  iconFallback: string; // emoji shown briefly while the PNG loads or on 404
  badge: string;
  title: string;
  tagline: string;
  features: string[];
  accent: string; // used for active-state tint & bullet dots
  accent2: string; // secondary tint for inner glow
}

const MODES: ModeSpec[] = [
  {
    key: 'classic',
    icon: modeIcons.classic,
    iconFallback: '🏢',
    badge: '01',
    title: '鼠人公司',
    tagline: '2.5D 写字楼 · 自由摸鱼',
    features: ['AI 员工内卷', '分房间互怼', '暗线下黑手'],
    accent: colors.brand.neon,
    accent2: colors.brand.violet,
  },
  {
    key: 'immersive',
    icon: modeIcons.immersive,
    iconFallback: '🎤',
    badge: '02',
    title: '全程开麦',
    tagline: 'AI 真人语音 · 戏精剧场',
    features: ['8 名鼠人开口', '人设全程在线', '阴阳怪气合集'],
    accent: '#a855f7',
    accent2: colors.brand.neon,
  },
  {
    key: 'fired',
    icon: modeIcons.fired,
    iconFallback: '⚖️',
    badge: '03',
    title: '裁了么',
    tagline: '1v1 怼 HR · 现场仲裁',
    features: ['真法条撑腰', '四维打分', '多结局演完'],
    accent: colors.semantic.danger,
    accent2: colors.semantic.warn,
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<GameMode>('classic');
  const [playerCount, setPlayerCount] = useState<number>(8);
  const [isCreating, setIsCreating] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const { socket, connected } = useSocket();
  // Track the mode the user most recently requested. Captured at click-time
  // so the game:created handler never races with subsequent setMode() calls
  // (previously: clicking "进入" on card A, then hovering card B, then receiving
  //  game:created would navigate to B's route — classic/immersive would mix).
  const pendingModeRef = useRef<GameMode | null>(null);

  useEffect(() => {
    if (shouldAutoShowRules()) {
      setRulesOpen(true);
      markRulesSeen();
    }
  }, []);

  useSocketEvent<{ gameId: string }>('game:created', ({ gameId }) => {
    setIsCreating(false);
    // Landing currently only creates classic games (immersive/fired short-circuit
    // in handleStart). Honour whatever mode was requested at click-time rather
    // than reading current state — avoids route-mode desync.
    const requested = pendingModeRef.current ?? 'classic';
    pendingModeRef.current = null;
    if (requested === 'immersive') {
      navigate(`/immersive/${gameId}`);
    } else {
      navigate(`/classic/${gameId}`);
    }
  });

  // Unified entry point: pick a mode and fire its entry flow in one action.
  // Accepts optional `nextMode` so cards can directly start their own mode
  // without the legacy "select, then hit the big CTA" two-step. This also
  // primes the audio context via the user gesture so TTS can play later
  // without being blocked by Safari's autoplay policy.
  const handleStart = useCallback((nextMode?: GameMode) => {
    if (isCreating) return;
    const target = nextMode ?? mode;
    if (target !== mode) setMode(target);
    pendingModeRef.current = target;
    primeAudio();            // unlock <audio> playback now, while we have a gesture
    if (target === 'fired')     { navigate('/fired'); return; }
    if (target === 'immersive') { navigate('/immersive/new'); return; }
    setIsCreating(true);
    socket.emit('game:create', { playerCount, mode: target });
  }, [isCreating, mode, playerCount, navigate, socket]);

  const activeSpec = MODES.find((m) => m.key === mode)!;

  return (
    <div
      className="relative min-h-screen overflow-hidden noise"
      style={{ background: colors.bg.base }}
    >
      {/* -- Background aurora layers. Two big blurred blobs + one faint red
            accent under Fired mode to hint at the palette without shouting. -- */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="aurora"
          style={{
            top: '-20%',
            left: '-10%',
            width: '60vmax',
            height: '60vmax',
            ['--c' as never]: 'rgba(124, 58, 237, 0.45)',
            opacity: 0.45,
          }}
        />
        <div
          className="aurora"
          style={{
            top: '10%',
            right: '-15%',
            width: '55vmax',
            height: '55vmax',
            ['--c' as never]: 'rgba(76, 158, 255, 0.45)',
            opacity: 0.4,
          }}
        />
        <div
          className="aurora"
          style={{
            bottom: '-25%',
            left: '30%',
            width: '50vmax',
            height: '50vmax',
            ['--c' as never]: mode === 'fired'
              ? 'rgba(255, 51, 85, 0.35)'
              : 'rgba(236, 72, 153, 0.22)',
            opacity: 0.35,
          }}
        />
        {/* Dot grid overlay, ultra-faint */}
        <div
          className="absolute inset-0 grid-dots"
          style={{ opacity: 0.6, maskImage: 'linear-gradient(180deg, black 20%, transparent 100%)' }}
        />
      </div>

      {/* Top navigation — minimal wordmark + utility cluster. */}
      <header className="relative z-20 flex items-center justify-between px-6 md:px-12 py-5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-[15px] tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #ff5588 0%, #7c3aed 50%, #4c9eff 100%)',
              boxShadow: '0 10px 28px rgba(124,58,237,0.42), inset 0 1px 0 rgba(255,255,255,0.22)',
            }}
          >
            ZOO
          </div>
          <div className="hidden md:flex flex-col leading-none">
            <span className="text-[12px] font-black tracking-[0.18em] text-white/80">OFFICE ZOO</span>
            <span className="text-[10px] text-white/40 mt-1">AI 鼠人 24h 营业</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setRulesOpen(true)}
            className="text-xs tracking-wider text-white/55 hover:text-white/90 transition px-3 py-2"
          >
            怎么玩
          </button>
          <SfxToggle />
        </div>
      </header>

      {/* Hero — full-width single-column layout. The product wordmark sits up
          top, three GIANT mode cards fill the centre (always parallel, never
          rotating), and the player-count strip lives below. This replaces the
          old asymmetric bento that buried the modes in a side column. */}
      <main className="relative z-10 px-4 md:px-10 pt-2 md:pt-6 pb-20">
        <div className="mx-auto max-w-[1400px] flex flex-col items-center">

          {/* -- Hero wordmark + tagline (compact, centred) ----------------- */}
          <motion.section
            className="w-full flex flex-col items-center text-center mb-10 md:mb-14"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Eyebrow pill — Gen-Z phrasing instead of corporate "Workplace Deduction". */}
            <div className="flex items-center gap-3 mb-5">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{
                  background: 'rgba(255,85,136,0.10)',
                  border: '1px solid rgba(255,85,136,0.28)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#ff5588', boxShadow: '0 0 10px #ff5588' }} />
                <span className="text-[11px] tracking-[0.2em] uppercase text-white/80 font-bold">
                  班味剧场 · AI 员工内卷模拟
                </span>
              </div>
              <LottieAsset src={lottie.helloBot} size={40} />
            </div>

            {/* Wordmark — bilingual, gradient, low-key huge. */}
            <h1
              className="font-black leading-[0.92] tracking-[-0.04em] mb-4"
              style={{ fontSize: 'clamp(3rem, 8vw, 7rem)' }}
            >
              <span className="text-gradient-brand">OFFICE ZOO</span>
            </h1>
            <p className="text-white/85 text-base md:text-xl font-semibold tracking-tight mb-3">
              0 点散场,鼠人不睡
            </p>
            <p className="text-white/50 text-xs md:text-sm max-w-xl leading-relaxed">
              一家被裁掉的公司,9 名 AI 鼠人 24h 互卷。
              你不是玩家,是那只盯着 KPI 屏的 HR —— 选个模式,看戏。
            </p>

            {/* Stat strip — keep but shrink, slot under the headline */}
            <div className="flex gap-6 md:gap-10 mt-7">
              <StatCell label="模式" value="3" accent={colors.brand.neon} />
              <StatCell label="AI 鼠人" value="6 – 10" accent={colors.brand.violet} />
              <StatCell label="仲裁条款" value="4" accent={colors.semantic.warn} />
            </div>
          </motion.section>

          {/* -- 3 BIG parallel mode cards. ALWAYS 3 columns at md+, stacks
                vertically only on phone. ModeBento is the same component but
                rendered taller via the `tall` prop so each card commands real
                attention instead of being a thumbnail. ---------------------- */}
          <div className="w-full">
            <div className="flex items-baseline justify-between mb-4 px-1">
              <h2 className="text-xs tracking-[0.25em] uppercase text-white/45">选个模式 / pick your poison</h2>
              <span className="text-[10px] tracking-[0.2em] uppercase text-white/30 hidden sm:inline">
                tap card to enter
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              {MODES.map((m, i) => (
                <ModeBento
                  key={m.key}
                  spec={m}
                  active={mode === m.key}
                  busy={isCreating && pendingModeRef.current === m.key}
                  disabled={m.key === 'classic' && !connected}
                  onSelect={() => setMode(m.key)}
                  onEnter={() => handleStart(m.key)}
                  delay={0.18 + i * 0.08}
                  tall
                />
              ))}
            </div>

            {/* Player count — only for classic. Same animated collapse. */}
            <AnimatePresence initial={false}>
              {mode === 'classic' && (
                <motion.div
                  key="player-count"
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 18 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="rounded-2xl p-4 md:p-5 glass flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="text-xs tracking-[0.18em] uppercase text-white/45 mb-1">员工人数</div>
                      <div className="text-sm text-white/80">人多 = 戏长 · 人少 = 互撕快</div>
                    </div>
                    <div className="flex gap-2">
                      {PLAYER_COUNTS.map((c) => (
                        <motion.button
                          key={c}
                          onClick={() => setPlayerCount(c)}
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.96 }}
                          className="px-4 py-2 rounded-xl text-sm font-semibold transition"
                          style={{
                            background: playerCount === c
                              ? 'linear-gradient(135deg, #ff5588 0%, #7c3aed 100%)'
                              : 'rgba(255,255,255,0.05)',
                            color: playerCount === c ? '#fff' : 'rgba(255,255,255,0.55)',
                            border: playerCount === c
                              ? '1px solid rgba(255,85,136,0.55)'
                              : '1px solid rgba(255,255,255,0.06)',
                            boxShadow: playerCount === c
                              ? '0 6px 18px rgba(255,85,136,0.32)' : 'none',
                          }}
                        >
                          {c} 人
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer status strip — always visible, telegraphs which mode is
                primed and offers a quick-rules link. No big duplicate CTA bar
                here: each mode card already has its own "进入 →" pill. */}
            <div className="mt-6 md:mt-8 flex items-center justify-between flex-wrap gap-3 text-[11px] tracking-wider uppercase text-white/45">
              <div>
                当前 · {activeSpec.title} ·{' '}
                {mode === 'classic' ? `${playerCount} 名鼠人` : mode === 'immersive' ? '8 名鼠人' : '1v1 仲裁'}
              </div>
              <button
                onClick={() => setRulesOpen(true)}
                className="text-white/55 hover:text-white/90 transition"
              >
                规则手册 →
              </button>
            </div>
          </div>
        </div>
      </main>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

/* ======================================================================
 * Sub-components
 * ==================================================================== */

function StatCell({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="relative pl-3 py-2.5"
      style={{ borderLeft: `2px solid ${accent}` }}
    >
      <div className="text-[10px] tracking-[0.2em] uppercase text-white/40 mb-0.5">{label}</div>
      <div className="text-lg font-bold text-white/90 tabular-nums leading-none">{value}</div>
    </div>
  );
}

interface ModeBentoProps {
  spec: ModeSpec;
  active: boolean;
  busy: boolean;         // this card's mode is the one currently in flight
  disabled: boolean;     // socket not connected (classic only)
  onSelect: () => void;  // hover/tap card body — update preview strip
  onEnter: () => void;   // click "进入 →" — start this specific mode
  delay: number;
  /** When true, the card renders with the larger hero geometry — bigger
   *  icon, more padding, taller min-height. Used by the centred 3-col layout
   *  where each card has the full screen width / 3 to itself. */
  tall?: boolean;
}

// Each card is an independent "enter this mode" button now. Body tap still
// updates the preview-strip selection, but the dedicated "进入 →" pill fires
// the actual game:create for that specific mode. This is the fix for the
// earlier "clicking the arrow does nothing / every mode routes through the
// big central CTA" bug — and prevents the classic/immersive race that used
// to happen when setMode() changed mid-handshake.
function ModeBento({ spec, active, busy, disabled, onSelect, onEnter, delay, tall }: ModeBentoProps) {
  const [pressed, setPressed] = useState(false);
  const padCls = tall ? 'p-7 md:p-8' : 'p-5';
  const minH   = tall ? 'min-h-[320px] md:min-h-[360px]' : 'min-h-[210px]';
  const iconBox = tall ? 'w-16 h-16' : 'w-11 h-11';
  const iconSize = tall ? 50 : 32;
  const titleCls = tall ? 'text-2xl md:text-3xl' : 'text-lg';
  const taglineCls = tall ? 'text-[13px] md:text-sm' : 'text-[12px]';
  const featureCls = tall ? 'text-[12px] md:text-[13px]' : 'text-[11px]';
  return (
    <motion.div
      className={`group relative overflow-hidden rounded-2xl text-left transition-all duration-300 ${padCls} ${minH}`}
      style={{
        background: active
          ? `linear-gradient(155deg, ${spec.accent}1a 0%, ${spec.accent2}10 100%)`
          : 'rgba(255,255,255,0.025)',
        border: active
          ? `1px solid ${spec.accent}66`
          : '1px solid rgba(255,255,255,0.06)',
        boxShadow: active
          ? `0 10px 36px ${spec.accent}28, inset 0 1px 0 rgba(255,255,255,0.06)`
          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
      whileHover={{ y: -3 }}
      // Animate must include opacity + y so the entry transition resolves —
      // otherwise the framer-motion `initial` opacity:0 sticks (cards render
      // invisibly) because animate only declared `scale`.
      animate={{ scale: pressed ? 0.985 : 1, opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 16 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onHoverStart={onSelect}
    >
      {/* Corner glow — only on active. */}
      {active && (
        <motion.div
          aria-hidden
          className="absolute -top-12 -right-12 w-36 h-36 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${spec.accent}38 0%, transparent 70%)` }}
          animate={{ opacity: [0.45, 0.85, 0.45] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Body: an accessible button that (a) selects this mode for preview and
          (b) is visually the whole tile except the explicit "进入" pill below. */}
      <button
        type="button"
        onClick={onSelect}
        className="absolute inset-0 z-0 w-full h-full cursor-pointer"
        aria-label={`preview ${spec.title}`}
      />

      {/* Top row — icon tile + numeric badge */}
      <div className={`relative z-10 flex items-start justify-between pointer-events-none ${tall ? 'mb-7' : 'mb-6'}`}>
        <div
          className={`${iconBox} rounded-xl grid place-items-center overflow-hidden`}
          style={{
            background: active
              ? `linear-gradient(135deg, ${spec.accent}40 0%, ${spec.accent2}25 100%)`
              : 'rgba(255,255,255,0.04)',
            border: `1px solid ${active ? spec.accent + '55' : 'rgba(255,255,255,0.06)'}`,
          }}
        >
          <Icon src={spec.icon} emoji={spec.iconFallback} size={iconSize} alt={spec.title} />
        </div>
        <div
          className={`${tall ? 'text-[12px]' : 'text-[10px]'} font-mono tracking-[0.2em]`}
          style={{ color: active ? spec.accent : 'rgba(255,255,255,0.28)' }}
        >
          {spec.badge}
        </div>
      </div>

      {/* Title + tagline */}
      <div className="relative z-10 pointer-events-none">
        <h3
          className={`${titleCls} font-black mb-1.5 tracking-tight`}
          style={{ color: active ? '#fff' : 'rgba(255,255,255,0.92)' }}
        >
          {spec.title}
        </h3>
        <p className={`${taglineCls} text-white/55 ${tall ? 'mb-5' : 'mb-3'} leading-relaxed`}>{spec.tagline}</p>

        <ul className={`flex flex-col gap-1.5 ${tall ? 'mb-6' : 'mb-4'}`}>
          {spec.features.map((f) => (
            <li
              key={f}
              className={`${featureCls} flex items-center gap-2`}
              style={{ color: active ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.45)' }}
            >
              <span
                className="w-1 h-1 rounded-full"
                style={{
                  background: active ? spec.accent : 'rgba(255,255,255,0.28)',
                  boxShadow: active ? `0 0 6px ${spec.accent}` : 'none',
                }}
              />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* ENTER pill — the card's primary action. Sits above the overlay button
          (z-20) and stops propagation so tapping it starts the game rather
          than toggling the preview. */}
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPressed(true);
          setTimeout(() => setPressed(false), 200);
          onEnter();
        }}
        disabled={disabled || busy}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.97 }}
        className={`relative z-20 inline-flex items-center gap-1.5 rounded-xl font-bold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed ${
          tall ? 'px-5 py-2.5 text-sm' : 'px-3.5 py-2 text-xs'
        }`}
        style={{
          background: busy
            ? `linear-gradient(135deg, ${spec.accent}60 0%, ${spec.accent2}45 100%)`
            : `linear-gradient(135deg, ${spec.accent}55 0%, ${spec.accent2}35 100%)`,
          border: `1px solid ${spec.accent}90`,
          color: '#fff',
          boxShadow: active ? `0 6px 18px ${spec.accent}55` : `0 2px 8px ${spec.accent}22`,
        }}
      >
        {busy ? '进入中…' : disabled ? '连接中…' : '进入'}
        {!busy && <span aria-hidden>→</span>}
      </motion.button>

      {/* Active indicator dot */}
      {active && (
        <motion.div
          aria-hidden
          className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full"
          style={{ background: spec.accent, boxShadow: `0 0 10px ${spec.accent}` }}
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}
