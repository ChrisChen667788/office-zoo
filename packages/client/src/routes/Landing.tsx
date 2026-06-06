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
import DailyShareCardModal from '../components/DailyShareCardModal';
import type { DailyShareCardData } from '../utils/dailyShareCard';
import { prefetchAllCharacterStats, prefetchWeeklyLeaders } from '../components/character/PersonaCard';
import DailyRatSpotlight from '../components/character/DailyRatSpotlight';
import UgcHighlightsCarousel from '../components/character/UgcHighlightsCarousel';
import { primeAudio } from '../utils/audioUnlock';
import { colors } from '../constants/design';
import { lottie } from '../constants/lottie';
import { useT, setLocale, LOCALE_OPTIONS, type Locale, type DictKey } from '../utils/i18n';
import { getUserId } from '../utils/userId';

/** v1.4.0 — shape returned by /api/daily/me. Kept inline (small,
 *  no cross-package import) so we don't add another util module. */
interface DailyDrama {
  date: string;
  kind: 'fired' | 'talkshow' | 'pack' | 'pvp';
  targetId: string | null;
  targetTitle: string;
  targetEmoji: string;
  cta: { label: string; href: string };
  teaser: string;
  archetypeEmoji?: string;
  archetypeName?: string;
}
import { modeIcons, Icon } from '../constants/icons';

// v6.28 P4 — 9 added once ROLE_PRESETS[9] (v6.27 P1) landed. The
// 6→8→9→10 ladder gives users a "1-step-up from default" option;
// without it the previous 8→10 jump skipped the natural increment.
// v6.56 — 11/12 added so 内审专员(MEDIUM, 11+) + 销售冠军(ADVENTURER, 12)
// rosters can actually spawn (their night skills are wired server-side).
const PLAYER_COUNTS = [6, 8, 9, 10, 11, 12] as const;
type GameMode = 'classic' | 'immersive' | 'fired' | 'talkshow';

interface ModeSpec {
  key: GameMode;
  icon: string;        // AI-generated icon URL (from constants/icons.ts)
  iconFallback: string; // emoji shown briefly while the PNG loads or on 404
  badge: string;
  /** v1.2.1 — title/tagline now reference i18n dict keys instead of hard-
   *  coded zh-CN strings. Resolved at render time via t(). The features
   *  list stays untranslated for v1.2.1 (3 chips, low risk; v1.2.3
   *  will localize them when we expand the dict). */
  titleKey: DictKey;
  taglineKey: DictKey;
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
    titleKey:   'mode.classic.title',
    taglineKey: 'mode.classic.body',
    features: ['AI 员工内卷', '分房间互怼', '暗线下黑手'],
    accent: colors.brand.neon,
    accent2: colors.brand.violet,
  },
  {
    key: 'immersive',
    icon: modeIcons.immersive,
    iconFallback: '🎤',
    badge: '02',
    titleKey:   'mode.immersive.title',
    taglineKey: 'mode.immersive.body',
    features: ['8 名鼠人开口', '人设全程在线', '阴阳怪气合集'],
    accent: '#a855f7',
    accent2: colors.brand.neon,
  },
  {
    key: 'fired',
    icon: modeIcons.fired,
    iconFallback: '⚖️',
    badge: '03',
    titleKey:   'mode.fired.title',
    taglineKey: 'mode.fired.body',
    features: ['真法条撑腰', '四维打分', '多结局演完'],
    accent: colors.semantic.danger,
    accent2: colors.semantic.warn,
  },
  {
    key: 'talkshow',
    icon: '',
    iconFallback: '🎤',
    badge: '04',
    titleKey:   'mode.talkshow.title',
    taglineKey: 'mode.talkshow.body',
    features: ['真人音色播报', '8 种人格切换', '段子库每周更新'],
    accent: '#ff5588',
    accent2: '#7c3aed',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  // v1.2.0 — i18n. `t()` for translations, `locale` re-renders on toggle.
  const { t, locale } = useT();

  // v1.4.0 — daily drama. Server returns personalized "today's drama"
  // when the user has a quiz profile; null otherwise (we keep the legacy
  // "你是哪种打工人?" hero CTA in that case).
  const [daily, setDaily] = useState<DailyDrama | null>(null);
  useEffect(() => {
    fetch('/api/daily/me', { headers: { 'X-User-Id': getUserId() } })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { drama: DailyDrama | null } | null) => {
        if (d?.drama) setDaily(d.drama);
      })
      .catch(() => { /* anonymous — keep legacy CTA */ });
    // v6.13 — warm PersonaCard cache so any rat hover anywhere in the
    // app (Classic chat / Result / Profile / B2bEmbed) is instant.
    // Fire-and-forget; failures silently fall back to per-hover fetch.
    prefetchAllCharacterStats();
    // v6.18 P2 — also warm the weekly-dominant cache so the small "本周
    // dominant" chip in PersonaCard header reads sync (no fetch latency).
    prefetchWeeklyLeaders();
  }, []);

  // v1.5.0 — share-card modal. Daily card's 📤 button toggles this with
  // a preview-mode payload (no result block — Landing doesn't know
  // whether the user has played today; that's FiredResult's job).
  // v3.3.1 — share card now pulls the user's nextMilestone (if any)
  // so the bottom strip surfaces "下一站 · 反卷青年 · 再玩 1 局攒局"
  // as a viral hook ("challenge me to evolve").
  const [shareOpen, setShareOpen] = useState(false);
  const [shareData, setShareData] = useState<DailyShareCardData | null>(null);
  const openShareForDaily = useCallback(async (d: DailyDrama) => {
    // Best-effort milestone fetch — anonymous users / network errors
    // just get a milestone-less card (still useful).
    let milestone: DailyShareCardData['milestone'] | undefined;
    try {
      const r = await fetch('/api/quiz/evolution/me', { headers: { 'X-User-Id': getUserId() } });
      if (r.ok) {
        const json = await r.json() as {
          evolution: {
            nextMilestone?: {
              archetypeEmoji: string;
              archetypeName: string;
              estimatedPlays: number;
              suggestedActivity: string;
            };
          } | null;
        };
        const m = json.evolution?.nextMilestone;
        if (m) {
          milestone = {
            archetypeLabel: `${m.archetypeEmoji} ${m.archetypeName}`,
            estimatedPlays: m.estimatedPlays,
            suggestedActivity: m.suggestedActivity,
          };
        }
      }
    } catch { /* silent — milestone is a nice-to-have */ }

    setShareData({
      date: d.date,
      kind: d.kind,
      targetTitle: d.targetTitle,
      targetEmoji: d.targetEmoji,
      teaser: d.teaser,
      archetype: d.archetypeName && d.archetypeEmoji
        ? { emoji: d.archetypeEmoji, name: d.archetypeName }
        : undefined,
      milestone,
      // No result on Landing — purely a teaser-mode share.
    });
    setShareOpen(true);
  }, []);
  const [mode, setMode] = useState<GameMode>('classic');
  const [playerCount, setPlayerCount] = useState<number>(8);
  const [isCreating, setIsCreating] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  // v6.37 P4 — chosen 公司主题包 id (null = default AI_NAMES roster).
  // Lazy-loaded from /api/company-pack/mine after the user gesture, so
  // anonymous landings don't pay the extra fetch.
  const [companyPackId, setCompanyPackId] = useState<string | null>(null);
  const [companyPacks, setCompanyPacks] = useState<Array<{ packId: string; name: string; npcs: unknown[] }> | null>(null);
  useEffect(() => {
    fetch('/api/company-pack/mine', { headers: { 'X-User-Id': getUserId() } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setCompanyPacks(d.packs ?? []))
      .catch(() => setCompanyPacks([]));
  }, []);

  // v6.38 P4 — accept ?pack=<id> from a shared CompanyPackView "直接开局"
  // link. Fetch that pack and merge it into the picker (deduped), then
  // auto-select it so the next "进入" plays with the shared roster
  // WITHOUT the user having to import a personal copy first. This is the
  // flow that groups coworkers under one packId for the pack leaderboard.
  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get('pack');
    if (!shared || !/^[0-9a-f]{12}$/.test(shared)) return;
    fetch(`/api/company-pack/${shared}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        const p = d.pack as { packId: string; name: string; npcs: unknown[] };
        setCompanyPacks((prev) => {
          const list = prev ?? [];
          return list.some((x) => x.packId === p.packId) ? list : [...list, p];
        });
        setCompanyPackId(p.packId);
        setMode('classic');
      })
      .catch(() => { /* bad link — just ignore, default roster */ });
  }, []);
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
    if (target === 'talkshow')  { navigate('/talkshow'); return; }
    if (target === 'immersive') { navigate('/immersive/new'); return; }
    setIsCreating(true);
    // v5.8.2 — userId enables per-spectator chunky-style memory in
    // BaseAgent. Server treats it as optional (back-compat).
    // v6.37 P4 — companyPackId only sent if the user picked one + the
    // pack has ≥ playerCount NPCs (server fail-opens but we may as well
    // not bother shipping invalid ids).
    const picked = companyPacks?.find((p) => p.packId === companyPackId);
    const packId = picked && picked.npcs.length >= playerCount ? picked.packId : undefined;
    // v6.38 P4 — remember the pack so BanweiIndexCard can tag this week's
    // snapshot, feeding the "你公司内部 Top" leaderboard filter.
    if (packId) {
      try { localStorage.setItem('office-arena.lastPackId', packId); } catch { /* ignore */ }
    }
    // v6.39 P4 — capture region/industry at game-start so even a
    // ?pack= 直接开局 session (where the user may never open Profile that
    // day) still tags the leaderboard correctly. Best-effort + async:
    // reads the quiz profile, maps to archetype tribe, caches to
    // localStorage. BanweiIndexCard reads these on its next POST.
    void (async () => {
      try {
        const r = await fetch('/api/quiz/me', { headers: { 'X-User-Id': getUserId() } });
        if (!r.ok) return;
        const j = await r.json();
        const { findArchetype } = await import('@furball/shared');
        const a = j?.profile ? findArchetype(j.profile.topArchetypes[0]) : null;
        if (a?.region && a.region !== 'generic') localStorage.setItem('office-arena.lastRegion', a.region);
        if (a?.industry && a.industry !== 'generic') localStorage.setItem('office-arena.lastIndustry', a.industry);
      } catch { /* tagging is best-effort */ }
    })();
    socket.emit('game:create', {
      playerCount, mode: target, userId: getUserId(),
      ...(packId ? { companyPackId: packId } : {}),
    });
  }, [isCreating, mode, playerCount, navigate, socket, companyPackId, companyPacks]);

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
            <span className="text-[12px] font-black tracking-[0.18em] text-white/80">{t('brand.wordmark')}</span>
            <span className="text-[10px] text-white/40 mt-1">{t('brand.tagline')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* v1.2.2 — locale dropdown. Was a 2-button pill in v1.2.0; with
              4 locales (zh/en/ja/ko) the pill no longer fits mobile, so
              flipped to a single button + popover. Native names render
              inside (简体中文 / English / 日本語 / 한국어). */}
          <LocaleDropdown locale={locale} />
          {/* v1.4.1 — Squad mode entry. Pink so it reads as
              "play with friends" not "enterprise". */}
          <button
            onClick={() => navigate('/squad/new')}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide px-3 py-1.5 rounded-full transition"
            style={{
              color: '#ff8aa6',
              background: 'rgba(255,85,136,0.10)',
              border: '1px solid rgba(255,85,136,0.32)',
            }}
            title="2-4 个朋友各有 archetype, AI 编 5 幕剧"
          >
            🎭 攒局
          </button>
          {/* v1.1.0 — B 端 SaaS 入口 (律所/HR培训采购) */}
          <button
            onClick={() => navigate('/b2b')}
            className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide px-3 py-1.5 rounded-full transition"
            style={{
              color: 'rgba(255,255,255,0.75)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
            title="Law firm white-label / HR training sandbox"
          >
            {t('header.b2b')}
          </button>
          {/* v1.0.0 — Premium chip in header. Tasteful amber gradient
              that doesn't shout. Routes to /premium paywall page. */}
          <button
            onClick={() => navigate('/premium')}
            className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide px-3 py-1.5 rounded-full transition relative overflow-hidden hover-sheen"
            style={{
              color: '#fff',
              background: 'linear-gradient(135deg, rgba(255,184,76,0.30), rgba(255,85,136,0.18))',
              border: '1px solid rgba(255,184,76,0.55)',
              boxShadow: '0 4px 14px rgba(255,184,76,0.25)',
            }}
            title="解锁 海外大厂剧本 + 律师入口 + voice clone + 无限回放"
          >
            👑 Premium
          </button>
          <button
            onClick={() => setRulesOpen(true)}
            className="text-xs tracking-wider text-white/55 hover:text-white/90 transition px-3 py-2"
          >
            {t('header.howToPlay')}
          </button>
          {/* v6.0.0 — Settings entry. Tiny gear icon, intentionally
              understated so it doesn't compete with the play CTAs.
              Houses AI-memory controls + forget mechanism. */}
          <button
            onClick={() => navigate('/settings')}
            className="text-base text-white/55 hover:text-white/90 transition px-2 py-2"
            title="设置 / AI 记忆"
            aria-label="settings"
          >
            ⚙️
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
            {/* v6.1 — 米哈游风 EVENT BANNER. 替代旧 eyebrow pill,
                凸显"新版本上线"的活动感, 配 5★ 装饰 + 金色 gradient. */}
            <motion.div className="flex items-center gap-3 mb-5"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, rgba(255,215,0,0.18), rgba(176,134,255,0.18), rgba(255,79,163,0.16))',
                  border: '1px solid rgba(255,215,0,0.55)',
                  boxShadow: '0 6px 22px rgba(255,215,0,0.18), inset 0 1px 0 rgba(255,255,255,0.16)',
                }}
              >
                <motion.span className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#FFD700', boxShadow: '0 0 10px #FFD700' }}
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
                <span className="text-[11px] tracking-[0.22em] uppercase font-black"
                  style={{
                    background: 'linear-gradient(180deg, #fff 0%, #FFD58A 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}>
                  v6.1 · NEW EVENT · AI 同事会记住你
                </span>
                <span className="text-[9px] tracking-[0.18em] font-black px-1.5 py-0.5 rounded"
                  style={{
                    background: 'linear-gradient(90deg, #FFD700, #FFA947)',
                    color: '#1a0d35',
                  }}>★★★★★</span>
              </div>
              <LottieAsset src={lottie.helloBot} size={40} />
            </motion.div>

            {/* v6.7 — brand mark + wordmark. AI-generated mihoyo-style
                cyberpunk rat logo lives left of the wordmark on desktop,
                above it on mobile (flex-col → md:flex-row). Glow ring
                shadow keeps it visible on the dark hero background. */}
            <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 mb-4">
              <motion.img
                src="/brand-logo.png"
                alt="OFFICE ZOO 鼠人 logo"
                width={120}
                height={120}
                className="rounded-2xl"
                style={{
                  width: 'clamp(96px, 14vw, 140px)',
                  height: 'clamp(96px, 14vw, 140px)',
                  boxShadow:
                    '0 0 32px rgba(255,79,163,0.45), 0 0 80px rgba(124,58,237,0.32), inset 0 0 0 2px rgba(255,215,0,0.45)',
                }}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.18, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
              <h1
                className="font-black leading-[0.92] tracking-[-0.04em]"
                style={{ fontSize: 'clamp(3rem, 8vw, 7rem)' }}
              >
                <span className="text-gradient-brand">OFFICE ZOO</span>
              </h1>
            </div>
            <p className="text-white/85 text-base md:text-xl font-semibold tracking-tight mb-3">
              0 点散场,鼠人不睡
            </p>
            <p className="text-white/50 text-xs md:text-sm max-w-xl leading-relaxed mb-5">
              一家被裁掉的公司,9 名 AI 鼠人 24h 互卷。
              你不是玩家,是那只盯着 KPI 屏的 HR —— 选个模式,看戏。
            </p>

            {/* v6.14 P1 — daily featured rat spotlight. Same character
                surfaces for ALL users on a given day = shared
                conversation hook. Click pops PersonaCard via deep-link. */}
            <div className="mb-4 w-full max-w-md mx-auto">
              <DailyRatSpotlight />
            </div>

            {/* v6.17 P1 — small chip to discover the global votes
                leaderboard. Sits just under the daily spotlight.
                v6.29 P4 — 周年回顾 chip sits sibling, gold-accent so
                it's distinct from the rose vote chip. */}
            <div className="mb-4 flex items-center justify-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => navigate('/character-votes')}
                className="text-[10px] px-3 py-1 rounded-full font-bold tracking-wide transition hover:scale-105"
                style={{
                  background: 'rgba(255,79,163,0.10)', color: '#FF4FA3',
                  border: '1px solid rgba(255,79,163,0.45)',
                  letterSpacing: '0.06em',
                }}
              >🗳️ 看本周 12 鼠投票排行榜 →</button>
              <button
                type="button"
                onClick={() => navigate('/anniversary')}
                className="text-[10px] px-3 py-1 rounded-full font-bold tracking-wide transition hover:scale-105"
                style={{
                  background: 'rgba(255,215,0,0.10)', color: '#FFD700',
                  border: '1px solid rgba(255,215,0,0.45)',
                  letterSpacing: '0.06em',
                }}
              >🎉 v6 周年回顾 · 28 轮 →</button>
            </div>

            {/* v6.14 P2 — approved UGC carousel surface. Hides itself
                when there are 0 approved entries so an empty product
                doesn't tease an empty strip. Closes the loop
                "Maker approve → Landing surface → user sees". */}
            <div className="mb-4 w-full max-w-2xl mx-auto">
              <UgcHighlightsCarousel />
            </div>

            {/* v1.4.0 — daily drama card OR v1.3.0 quiz CTA. The card
                wins when the user has a profile (= taken the quiz);
                otherwise the quiz invite stays. Both pull the eye via
                Y2K-tinged accent palette so the hero never feels static
                even after the user has scrolled past it 10 times. */}
            {daily ? (
              <>
                <DailyDramaCard
                  drama={daily}
                  onJump={() => navigate(daily.cta.href)}
                  onRetake={() => navigate('/quiz')}
                  onShare={() => openShareForDaily(daily)}
                />
                {/* v5.0.0 — entry to the global "today's challenge"
                    leaderboard. Sits right under the personalized
                    daily card so users discover it without it
                    competing for top-of-hero attention. */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => navigate('/fired/daily-challenge')}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-bold text-[12px] transition hover-sheen"
                    style={{
                      color: '#9be6ff',
                      background: 'rgba(0,221,255,0.10)',
                      border: '1px solid rgba(0,221,255,0.40)',
                    }}
                    title="今天全网都在玩同一关 · 看自己卡在第几名"
                  >
                    🌐 全网今日挑战 · 看榜
                  </button>
                  {/* v5.4.0 — 班味占卜入口. 紫色配色跟卡牌主色一致,
                      跟青色的全网挑战 chip 视觉上区分开. */}
                  <button
                    onClick={() => navigate('/fortune')}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-bold text-[12px] transition hover-sheen"
                    style={{
                      color: '#c9b3ff',
                      background: 'rgba(124,58,237,0.14)',
                      border: '1px solid rgba(124,58,237,0.45)',
                    }}
                    title="每天 1 张塔罗式班味卡 · 今日运势 + 一个微行动"
                  >
                    🔮 班味占卜 · 抽今天的牌
                  </button>
                  {/* v6.5.0 — 周报生成器入口. 金色配色, 跟米哈游 EventPill
                      同色系, 视觉上跟其他 chip 形成"主推新版本"的等级感. */}
                  <button
                    onClick={() => navigate('/weekly')}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-bold text-[12px] transition hover-sheen"
                    style={{
                      color: '#1a0d35',
                      background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                      border: '1px solid rgba(255,215,0,0.55)',
                      boxShadow: '0 4px 14px rgba(255,215,0,0.28)',
                    }}
                    title="1 句关键事件 → 4 风格周报 (阿里黑话/PUA/装腔/直球)"
                  >
                    📊 周报生成器 · v6.5 NEW ✨
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => navigate('/quiz')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-black text-sm transition relative overflow-hidden hover-sheen"
                style={{
                  background: 'linear-gradient(135deg, #ffe300 0%, #ff2d92 50%, #6e00ff 100%)',
                  color: '#0a0a0a',
                  border: '2px solid #0a0a0a',
                  boxShadow: '4px 4px 0 0 #0a0a0a, 0 0 24px rgba(255,45,146,0.45)',
                  letterSpacing: '0.02em',
                }}
                title="8 道题 · 90 秒 · 拿到你的「班味卡」"
              >
                ✨ 你是哪种打工人?生成你的「班味卡」 →
              </button>
            )}

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

            {/* v0.7.0 — bumped to 4 columns so 班味单口 fits without
                wrapping the 经典/全程开麦/裁了么 trio onto two rows. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
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

                  {/* v6.37 P4 — 公司主题包 picker. Shown only when the
                      user has ≥ 1 pack saved (otherwise just a "去自建"
                      hint link). Selecting a pack swaps the default
                      AI_NAMES roster for the user's NPCs at game start. */}
                  <div className="mt-3 rounded-2xl p-4 md:p-5 glass flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="text-xs tracking-[0.18em] uppercase text-white/45 mb-1">公司主题包</div>
                      <div className="text-sm text-white/80">
                        {companyPacks && companyPacks.length > 0
                          ? '用你自己定义的鼠人开局'
                          : '6-12 名鼠人, 你来命名 →'}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setCompanyPackId(null)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold transition"
                        style={{
                          background: companyPackId === null
                            ? 'linear-gradient(135deg, #4ECDC4 0%, #2fb8ff 100%)'
                            : 'rgba(255,255,255,0.05)',
                          color: companyPackId === null ? '#0a0a1e' : 'rgba(255,255,255,0.55)',
                          border: companyPackId === null
                            ? '1px solid rgba(78,205,196,0.55)' : '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        默认
                      </button>
                      {(companyPacks ?? []).map((p) => {
                        const tooSmall = p.npcs.length < playerCount;
                        const active = companyPackId === p.packId;
                        return (
                          <button
                            key={p.packId}
                            type="button"
                            onClick={() => !tooSmall && setCompanyPackId(p.packId)}
                            disabled={tooSmall}
                            title={tooSmall ? `这个包只有 ${p.npcs.length} 个鼠人, 当前要 ${playerCount} 个` : undefined}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition"
                            style={{
                              background: active
                                ? 'linear-gradient(135deg, #FFD700 0%, #FFA947 100%)'
                                : 'rgba(255,255,255,0.05)',
                              color: active ? '#0a0a1e' : tooSmall ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.75)',
                              border: active ? '1px solid rgba(255,215,0,0.55)' : '1px solid rgba(255,255,255,0.06)',
                              cursor: tooSmall ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {p.name} {tooSmall ? '×' : `· ${p.npcs.length}`}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => navigate('/company-pack/edit')}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white/55 hover:text-white/85 transition"
                        style={{ border: '1px dashed rgba(255,255,255,0.18)' }}
                      >+ 新建</button>
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
                {locale === 'zh-CN' ? '当前' : locale === 'en-US' ? 'Active' : locale === 'ja-JP' ? '現在' : '현재'} · {t(activeSpec.titleKey)} ·{' '}
                {mode === 'classic'
                  ? (locale === 'zh-CN' ? `${playerCount} 名鼠人`
                     : locale === 'en-US' ? `${playerCount} agents`
                     : locale === 'ja-JP' ? `AI ${playerCount}名`
                     : `AI ${playerCount}명`)
                  : mode === 'immersive'
                    ? (locale === 'zh-CN' ? '8 名鼠人' : locale === 'en-US' ? '8 agents' : locale === 'ja-JP' ? 'AI 8名' : 'AI 8명')
                    : (locale === 'zh-CN' ? '1v1 仲裁' : locale === 'en-US' ? '1v1 arbitration' : locale === 'ja-JP' ? '1対1 仲裁' : '1대1 중재')}
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

      {/* v1.5.0 — daily-drama share-card preview. Lazy-renders the PNG
          inside a modal so users can copy / download without leaving
          the landing flow. */}
      <DailyShareCardModal
        open={shareOpen}
        data={shareData}
        onClose={() => setShareOpen(false)}
      />
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
  // v1.2.1 — resolve title + tagline from i18n dict.
  const { t: tt } = useT();
  const title   = tt(spec.titleKey);
  const tagline = tt(spec.taglineKey);
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
        aria-label={`preview ${title}`}
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
          <Icon src={spec.icon} emoji={spec.iconFallback} size={iconSize} alt={title} />
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
          {title}
        </h3>
        <p className={`${taglineCls} text-white/55 ${tall ? 'mb-5' : 'mb-3'} leading-relaxed`}>{tagline}</p>

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

// ───────────────────────────────────────────────────────────────────────
// v1.2.2 — Locale dropdown menu.
// ───────────────────────────────────────────────────────────────────────
function LocaleDropdown({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = LOCALE_OPTIONS.find((o) => o.code === locale);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide px-3 py-1.5 rounded-full transition"
        style={{
          color: 'rgba(255,255,255,0.78)',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
        aria-label="Switch language"
        aria-expanded={open}
      >
        🌐 {active?.label ?? locale}
        <span className="text-[8px] opacity-65">▾</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1.5 z-40 rounded-xl py-1 min-w-[150px]"
            style={{
              background: 'linear-gradient(180deg, #15122e, #0d0b25)',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: '0 14px 32px rgba(0,0,0,0.55)',
            }}
          >
            {LOCALE_OPTIONS.map((o) => (
              <button
                key={o.code}
                onClick={() => { setLocale(o.code); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-[12px] transition flex items-center justify-between gap-2"
                style={{
                  color: o.code === locale ? '#fff' : 'rgba(255,255,255,0.7)',
                  background: o.code === locale ? 'rgba(76,158,255,0.12)' : 'transparent',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = o.code === locale ? 'rgba(76,158,255,0.12)' : 'transparent'; }}
              >
                <span>{o.label}</span>
                {o.code === locale && <span className="text-[10px] opacity-70">✓</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// v1.4.0 — Daily drama hero card. Shown to identified users with a quiz
// profile; replaces the static "你是哪种打工人?" CTA so the hero feels
// fresh every day. Y2K-tinged but quieter than the quiz CTA (smaller +
// rectangular + thinner border) so it doesn't dominate the dark hero.
// ───────────────────────────────────────────────────────────────────────
function DailyDramaCard({
  drama, onJump, onRetake, onShare,
}: {
  drama: DailyDrama;
  onJump: () => void;
  onRetake: () => void;
  /** v1.5.0 — opens the share-card preview modal in teaser mode. */
  onShare: () => void;
}) {
  // Per-kind gradient. Each kind gets its own vibe so a returning
  // user can pattern-match the card at a glance.
  const grad =
    drama.kind === 'fired'    ? 'linear-gradient(135deg, #ff3355 0%, #ff8a4c 100%)'
  : drama.kind === 'talkshow' ? 'linear-gradient(135deg, #ff5588 0%, #7c3aed 100%)'
  : drama.kind === 'pack'     ? 'linear-gradient(135deg, #ffb84c 0%, #ff5588 100%)'
  :                             'linear-gradient(135deg, #7c3aed 0%, #00ddff 100%)';
  const kindLabel =
    drama.kind === 'fired'    ? '裁员谈判'
  : drama.kind === 'talkshow' ? '今日段子'
  : drama.kind === 'pack'     ? '今日挑战'
  :                             'PvP 邀请';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-xl mx-auto rounded-2xl overflow-hidden cursor-pointer hover-sheen relative"
      style={{
        background: 'rgba(15,14,46,0.78)',
        border: '2px solid rgba(255,184,76,0.45)',
        boxShadow: '0 18px 48px rgba(255,184,76,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onJump}
    >
      <div className="flex items-stretch">
        {/* Left strip — kind emoji + label, archetype-aware tint */}
        <div
          className="flex-shrink-0 w-20 md:w-24 flex flex-col items-center justify-center py-4 px-2"
          style={{ background: grad, color: '#fff' }}
        >
          <div className="text-3xl md:text-4xl leading-none mb-1.5"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))' }}>
            {drama.targetEmoji}
          </div>
          <div className="text-[9px] tracking-[0.18em] font-black uppercase"
            style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.4)' }}>
            {kindLabel}
          </div>
        </div>
        {/* Right body — teaser + CTA */}
        <div className="flex-1 p-4 md:p-5 text-left">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] tracking-[0.22em] uppercase font-bold"
              style={{ color: 'rgba(255,184,76,0.85)' }}>
              ✦ 今日剧情
            </span>
            {drama.archetypeName && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                style={{
                  color: '#b086ff',
                  background: 'rgba(176,134,255,0.12)',
                  border: '1px solid rgba(176,134,255,0.35)',
                }}
                title="按你的班味卡 archetype 推荐"
              >
                {drama.archetypeEmoji} {drama.archetypeName}
              </span>
            )}
          </div>
          <div className="text-sm md:text-base text-white/95 font-bold leading-snug mb-2">
            {drama.teaser}
          </div>
          <div className="text-[11px] text-white/55 mb-3 truncate">
            {drama.targetTitle}
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); onJump(); }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full font-black text-xs tracking-wide"
              style={{
                background: grad,
                color: '#fff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
                textShadow: '1px 1px 0 rgba(0,0,0,0.35)',
              }}
            >
              {drama.cta.label}
            </button>
            {/* v1.5.0 — share-card button. Stays compact next to "重测"
                so the CTA pill doesn't lose dominance. */}
            <button
              onClick={(e) => { e.stopPropagation(); onShare(); }}
              className="text-[10px] text-white/55 hover:text-white/95 transition px-2 py-1 rounded shrink-0"
              title="生成今日剧情分享卡 (1080×1350 PNG)"
            >
              📤 分享
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRetake(); }}
              className="text-[10px] text-white/45 hover:text-white/85 transition px-2 py-1 rounded shrink-0"
              title="重测班味卡"
            >
              ↻ 重测
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
