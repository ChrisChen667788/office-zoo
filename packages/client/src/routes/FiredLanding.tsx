/**
 * FiredLanding — "裁了么" scenario/difficulty picker.
 *
 * Harmonized with the main Landing page: same bento layout language,
 * same aurora background system, same glass panels, but shifted to
 * the red/amber heat palette that lives in design.ts as the danger/warn
 * pair. No more free-floating saturated orbs.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFiredStore, type PersonalityId } from '../stores/firedStore';
import { useFiredProgress, FIRED_LEVELS, totalStars } from '../stores/firedProgress';
import {
  SCENARIOS as SHARED_SCENARIOS,
  type FiredScenario,
  type FiredPack,
  type FiredPersonalityId,
  type PackSlot,
} from '@furball/shared';
import SfxToggle from '../components/game/SfxToggle';
import { colors } from '../constants/design';
import { getUserId } from '../utils/userId';
import { SkeletonCard } from '../components/ui/SkeletonCard';
import { EmptyState } from '../components/ui/EmptyState';
import { isPremium, subscribeEntitlement } from '../utils/entitlement';
import { findArchetype, type Archetype } from '@furball/shared';
import type { UserProfile } from '../utils/profileTypes';

/** v0.8.0 — superset of FiredScenario that the /scenarios endpoint returns:
 *  same fields plus a `source` flag distinguishing seed catalogue from
 *  user-generated bits. Drives the ✨ amber rim on the card.
 *  v0.8.1 adds `likes` (community feedback count) and `createdBy`
 *  (pseudonymous id, drives "我的创作" filter). */
type ScenarioWithSource = FiredScenario & {
  source?: 'seed' | 'user';
  likes?: number;
  createdBy?: string;
  /** v0.9.2 — total chat sessions opened on this scenario. */
  plays?: number;
  /** v1.0.0 — Premium-locked scenario (FAANG pack). Already on
   *  FiredScenario (shared/data/fired.ts) but explicit here for the
   *  client-side render branches. */
  premium?: boolean;
};

/** v0.8.1/v0.9.2 — sort modes for the scenario grid, mirroring talkshow. */
type FiredSortMode = 'default' | 'hot' | 'new' | 'monthly';

type EntryMode = 'chapters' | 'custom' | 'packs';

interface Personality {
  id: PersonalityId;
  emoji: string;
  title: string;
  description: string;
  color: string;
}

const PERSONALITIES: Personality[] = [
  {
    id: 'rookie',
    emoji: '😊',
    title: '菜鸟 HR',
    description: '刚入行的 HR 小白,话术生硬,容易露出破绽。',
    color: colors.semantic.success,
  },
  {
    id: 'veteran',
    emoji: '😏',
    title: '老油条 HR',
    description: '经验丰富,善打感情牌,软硬兼施。',
    color: colors.semantic.warn,
  },
  {
    id: 'demon',
    emoji: '👿',
    title: '魔鬼 HR',
    description: '心理战大师,威逼利诱,PUA 高手,极难对付。',
    color: colors.semantic.danger,
  },
];

export default function FiredLanding() {
  const navigate = useNavigate();
  const { setScenario, setPersonality, reset } = useFiredStore();
  const { unlockedLevels, stars, lastClearedLevel } = useFiredProgress();

  const [entryMode, setEntryMode] = useState<EntryMode>('chapters');
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [selectedPersonality, setSelectedPersonality] = useState<PersonalityId>('veteran');

  // v0.8.0 — fetched scenarios. Falls back to SHARED_SCENARIOS until the
  // /api/fired/scenarios call resolves so the page never shows an empty
  // grid. After fetch, both pools are merged with user bits at the front.
  const [scenarios, setScenarios] = useState<ScenarioWithSource[]>(
    () => SHARED_SCENARIOS.map((s) => ({ ...s, source: 'seed' as const })),
  );
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [packCreatorOpen, setPackCreatorOpen] = useState(false);
  // v1.0.0 — Premium subscription state, reactive so unlocking in
  // another tab takes effect without reload.
  const [premium, setPremium] = useState<boolean>(() => isPremium());
  useEffect(() => subscribeEntitlement((e) => {
    setPremium(e.status === 'active' || e.status === 'trialing');
  }), []);
  // v0.8.1 — sort mode for the scenario grid + per-IP liked-set + mine filter
  const [sortMode, setSortMode] = useState<FiredSortMode>('default');
  const [mineOnly, setMineOnly] = useState(false);
  /** v2.1.0 — "show only scenarios in my tribe's industry". Lights up
   *  only when the user's archetype has an industry tag (i.e. they
   *  picked one of the new 12 region/industry archetypes) AND at
   *  least one scenario carries that tag. */
  const [tribeOnly, setTribeOnly] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const myId = useMemo(() => getUserId(), []);
  // v1.3.4 — fetched once on mount; powers the "适合你" pack sort +
  // future personalization features. null when user is anonymous.
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    fetch('/api/quiz/me', { headers: { 'X-User-Id': myId } })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { profile: UserProfile | null } | null) => {
        if (d?.profile) setProfile(d.profile);
      })
      .catch(() => { /* anonymous */ });
  }, [myId]);
  const myArchetype: Archetype | null = useMemo(() => {
    if (!profile?.topArchetypes?.[0]) return null;
    return findArchetype(profile.topArchetypes[0]) ?? null;
  }, [profile]);
  // v0.8.2 — per-scenario stats for THIS user (play count, best ratio,
  // last tactic). Drives the "你打过 N 次" badge so users see their
  // history at a glance + know the HR has memory.
  interface MemStat {
    playCount: number;
    bestRatio: number;
    lastOutcome: 'win' | 'partial' | 'lose';
    lastTactic: string;
  }
  const [memStats, setMemStats] = useState<Record<string, MemStat>>({});
  useEffect(() => {
    let cancelled = false;
    fetch('/api/fired/memory/me', { headers: { 'X-User-Id': myId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { stats?: Record<string, MemStat> }) => {
        if (!cancelled && d.stats) setMemStats(d.stats);
      })
      .catch(() => { /* soft-fail — badges just don't show */ });
    return () => { cancelled = true; };
  }, [myId]);
  const reloadScenarios = useRef<(opts?: { sort?: FiredSortMode }) => Promise<void>>();
  useEffect(() => {
    let cancelled = false;
    const load = async (opts?: { sort?: FiredSortMode }) => {
      try {
        const sort = opts?.sort ?? sortMode;
        const url = sort === 'default' ? '/api/fired/scenarios' : `/api/fired/scenarios?sort=${sort}`;
        const r = await fetch(url);
        const d = await r.json();
        if (cancelled) return;
        const next = (d.scenarios ?? []) as ScenarioWithSource[];
        setScenarios(next);
        // v0.8.1 — bulk-fetch which scenarios THIS IP has already hearted
        // so the cards paint correctly on first frame.
        const ids = next.map((s) => s.id).join(',');
        if (ids) {
          fetch(`/api/fired/like-state?ids=${encodeURIComponent(ids)}`)
            .then((r2) => r2.json())
            .then((d2: { liked?: string[] }) => {
              if (!cancelled && Array.isArray(d2.liked)) {
                setLikedIds(new Set(d2.liked));
              }
            })
            .catch(() => { /* soft-fail */ });
        }
      } catch {
        // Soft-fail: seed catalogue is already in state, user just doesn't
        // see the (possibly empty) UGC layer this load.
      }
    };
    reloadScenarios.current = load;
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode]);

  /** v0.8.1 — toggle like for `id` with optimistic UI + rollback on
   *  network fail (parallel to talkshow's toggleLike). */
  const toggleLikeFired = async (id: string) => {
    const wasLiked = likedIds.has(id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(id); else next.add(id);
      return next;
    });
    setScenarios((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, likes: Math.max(0, (s.likes ?? 0) + (wasLiked ? -1 : 1)) } : s,
      ),
    );
    try {
      const resp = await fetch('/api/fired/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: id, liked: !wasLiked }),
      });
      if (!resp.ok) throw new Error(`like ${resp.status}`);
      const data = await resp.json() as { likes: number };
      setScenarios((prev) =>
        prev.map((s) => (s.id === id ? { ...s, likes: data.likes } : s)),
      );
    } catch {
      // Rollback
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(id); else next.delete(id);
        return next;
      });
      setScenarios((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, likes: Math.max(0, (s.likes ?? 0) + (wasLiked ? 1 : -1)) } : s,
        ),
      );
    }
  };

  /** v0.8.1 — derived: scenarios after the mine + tribe filters (sorting
   *  is server-side, applied via /scenarios?sort=). v2.1.0 layers a
   *  tribe filter on top — independent boolean, both can be active. */
  const visibleScenarios = useMemo(() => {
    let out = scenarios;
    if (mineOnly)  out = out.filter((s) => s.createdBy === myId);
    if (tribeOnly && myArchetype?.industry) {
      out = out.filter((s) => s.industry === myArchetype.industry);
    }
    return out;
  }, [scenarios, mineOnly, tribeOnly, myArchetype, myId]);
  const mineCountFired = useMemo(
    () => scenarios.filter((s) => s.createdBy === myId).length,
    [scenarios, myId],
  );
  /** v2.1.0 — how many scenarios match the user's tribe industry?
   *  Used to decide whether to render the tribe filter chip at all
   *  (don't show "0 results" filter). */
  const tribeCountFired = useMemo(() => {
    if (!myArchetype?.industry) return 0;
    return scenarios.filter((s) => s.industry === myArchetype.industry).length;
  }, [scenarios, myArchetype]);

  const handleStart = () => {
    if (!selectedScenario) return;
    reset();
    setScenario(selectedScenario);
    setPersonality(selectedPersonality);
    navigate('/fired/chat');
  };

  // Launch a level — same flow as custom but driven by the level definition.
  // `level` number is stashed in sessionStorage so FiredResult can call
  // `awardLevel(level, outcome)` after the game ends without re-deriving it.
  const handleStartLevel = (levelNum: number) => {
    const level = FIRED_LEVELS.find((l) => l.level === levelNum);
    if (!level) return;
    if (!unlockedLevels.includes(levelNum)) return;
    reset();
    setScenario(level.scenarioId);
    setPersonality(level.personalityId);
    try { sessionStorage.setItem('office-zoo.active-level', String(levelNum)); } catch { /* noop */ }
    navigate('/fired/chat');
  };

  const activePersonality = PERSONALITIES.find((p) => p.id === selectedPersonality)!;
  const totalEarnedStars = totalStars(stars);
  const maxStars = FIRED_LEVELS.length * 3;

  return (
    <div
      className="relative min-h-screen overflow-hidden noise"
      style={{ background: colors.bg.base }}
    >
      {/* -- Aurora background — heat-tinted ------------------------------ */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="aurora"
          style={{
            top: '-20%',
            left: '-10%',
            width: '60vmax',
            height: '60vmax',
            ['--c' as never]: 'rgba(255, 51, 85, 0.38)',
            opacity: 0.5,
          }}
        />
        <div
          className="aurora"
          style={{
            top: '5%',
            right: '-15%',
            width: '55vmax',
            height: '55vmax',
            ['--c' as never]: 'rgba(255, 138, 76, 0.32)',
            opacity: 0.42,
          }}
        />
        <div
          className="aurora"
          style={{
            bottom: '-25%',
            left: '30%',
            width: '50vmax',
            height: '50vmax',
            ['--c' as never]: 'rgba(255, 184, 76, 0.22)',
            opacity: 0.35,
          }}
        />
        <div
          className="absolute inset-0 grid-dots"
          style={{ opacity: 0.55, maskImage: 'linear-gradient(180deg, black 20%, transparent 100%)' }}
        />
      </div>

      {/* -- Header ------------------------------------------------------- */}
      <header className="relative z-20 flex items-center justify-between px-8 md:px-14 py-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-xs tracking-wider text-white/55 hover:text-white transition"
        >
          <span>←</span> 返回首页
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-[0.28em] uppercase text-white/40 hidden md:inline">
            AI Labor Negotiation
          </span>
          <SfxToggle />
        </div>
      </header>

      {/* -- Main --------------------------------------------------------- */}
      <main className="relative z-10 px-6 md:px-14 pb-20">
        <div className="mx-auto max-w-6xl">
          {/* Hero heading */}
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
              style={{
                background: 'rgba(255,51,85,0.1)',
                border: '1px solid rgba(255,51,85,0.28)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff3355', boxShadow: '0 0 10px #ff3355' }} />
              <span className="text-[11px] tracking-[0.2em] uppercase text-white/75">劳动仲裁模拟</span>
            </div>

            <h1
              className="font-black leading-[0.92] tracking-[-0.03em] mb-3"
              style={{ fontSize: 'clamp(3rem, 6.5vw, 5.5rem)' }}
            >
              <span className="text-gradient-heat">裁了么</span>
            </h1>
            <p className="text-white/55 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
              5 关闯关 · 跟 AI HR 斗智斗勇 · 边玩边学劳动法
              <br className="hidden md:block" />
              每关一条法条,通关解锁下一个 BOSS。
            </p>

            {/* Achievement summary chip + mode tabs */}
            <div className="mt-6 flex flex-col items-center gap-4">
              <div
                className="inline-flex items-center gap-3 px-4 py-2 rounded-full"
                style={{
                  background: 'rgba(255,184,76,0.10)',
                  border: '1px solid rgba(255,184,76,0.3)',
                }}
              >
                <span className="text-[15px]" style={{ filter: 'drop-shadow(0 0 6px rgba(255,184,76,0.7))' }}>⭐</span>
                <span className="text-sm font-black tabular-nums" style={{ color: '#ffb84c' }}>
                  {totalEarnedStars} / {maxStars}
                </span>
                <span className="text-[10px] tracking-[0.2em] uppercase text-white/50">总成就</span>
                <span className="w-px h-3 bg-white/15" />
                <span className="text-[11px] text-white/65 font-bold">
                  {lastClearedLevel > 0 ? `已通过第 ${lastClearedLevel} 关` : '尚未通关'}
                </span>
              </div>
              <div
                className="inline-flex p-1 rounded-2xl"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {(['chapters', 'custom', 'packs'] as EntryMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setEntryMode(m)}
                    className="relative px-4 py-1.5 rounded-xl text-xs font-bold tracking-wide transition"
                    style={{
                      color: entryMode === m ? '#fff' : 'rgba(255,255,255,0.55)',
                      background: entryMode === m
                        ? 'linear-gradient(135deg, #ff3355 0%, #ff8a4c 100%)'
                        : 'transparent',
                      boxShadow: entryMode === m ? '0 4px 14px rgba(255,51,85,0.35)' : 'none',
                    }}
                  >
                    {m === 'chapters' ? '🎯 闯关模式'
                   : m === 'custom'   ? '⚙️ 自由练习'
                   :                    '📦 闯关包'}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Chapter mode — 5 progressive HR levels */}
          <AnimatePresence mode="wait">
          {entryMode === 'chapters' && (
          <motion.div
            key="chapters"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {FIRED_LEVELS.map((lvl) => {
              const unlocked = unlockedLevels.includes(lvl.level);
              const earned = (stars[lvl.level] ?? 0) as 0 | 1 | 2 | 3;
              return (
                <motion.button
                  key={lvl.level}
                  onClick={() => handleStartLevel(lvl.level)}
                  disabled={!unlocked}
                  whileHover={unlocked ? { y: -2 } : {}}
                  whileTap={unlocked ? { scale: 0.99 } : {}}
                  className="relative overflow-hidden rounded-2xl p-5 md:p-6 w-full text-left flex items-center gap-4 disabled:cursor-not-allowed"
                  style={{
                    background: unlocked
                      ? `linear-gradient(135deg, ${lvl.accent}14 0%, rgba(255,255,255,0.025) 75%)`
                      : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${unlocked ? lvl.accent + '55' : 'rgba(255,255,255,0.06)'}`,
                    opacity: unlocked ? 1 : 0.45,
                    boxShadow: unlocked ? `0 8px 28px ${lvl.accent}22, inset 0 1px 0 rgba(255,255,255,0.06)` : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                  }}
                >
                  {/* Big level badge */}
                  <div
                    className="w-16 h-16 md:w-20 md:h-20 rounded-2xl grid place-items-center text-3xl md:text-4xl shrink-0"
                    style={{
                      background: unlocked
                        ? `linear-gradient(135deg, ${lvl.accent}40 0%, ${lvl.accent}10 100%)`
                        : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${unlocked ? lvl.accent + '66' : 'rgba(255,255,255,0.08)'}`,
                      filter: unlocked ? `drop-shadow(0 0 12px ${lvl.accent}55)` : 'grayscale(0.6)',
                    }}
                  >
                    {unlocked ? lvl.badge : '🔒'}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[10px] font-mono tracking-[0.22em] px-2 py-0.5 rounded-full"
                        style={{
                          color: unlocked ? lvl.accent : 'rgba(255,255,255,0.35)',
                          background: unlocked ? `${lvl.accent}15` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${unlocked ? lvl.accent + '40' : 'rgba(255,255,255,0.06)'}`,
                        }}
                      >
                        LV {lvl.level.toString().padStart(2, '0')}
                      </span>
                      <h3 className="text-lg md:text-xl font-black tracking-tight" style={{ color: unlocked ? '#fff' : 'rgba(255,255,255,0.55)' }}>
                        {lvl.title}
                      </h3>
                    </div>
                    <p className="text-[12px] md:text-[13px] text-white/55 leading-relaxed mb-2">
                      {lvl.subtitle}
                    </p>
                    <p className="text-[11px] text-white/35 italic">
                      📚 {lvl.legalLesson}
                    </p>
                  </div>

                  {/* Stars + CTA */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex gap-0.5">
                      {[1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className="text-[15px]"
                          style={{
                            color: i <= earned ? '#ffb84c' : 'rgba(255,255,255,0.18)',
                            filter: i <= earned ? 'drop-shadow(0 0 6px rgba(255,184,76,0.6))' : 'none',
                          }}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    {unlocked ? (
                      <span
                        className="text-xs font-bold tracking-wide px-3 py-1.5 rounded-lg"
                        style={{
                          background: `${lvl.accent}25`,
                          border: `1px solid ${lvl.accent}55`,
                          color: '#fff',
                        }}
                      >
                        {earned > 0 ? '再战 →' : '挑战 →'}
                      </span>
                    ) : (
                      <span className="text-[10px] text-white/40">
                        通关 LV{lvl.level - 1} 解锁
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
          )}
          </AnimatePresence>

          {/* Custom mode — original scenario+personality picker, hidden by default */}
          <AnimatePresence mode="wait">
          {entryMode === 'custom' && (
          <motion.div
            key="custom"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* -- Scenario column (left) ---------------------------------- */}
            <motion.section
              className="lg:col-span-7"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-xs tracking-[0.25em] uppercase text-white/45">
                  <span style={{ color: colors.semantic.danger }}>01</span> · 选择剧本
                </h2>
                <span className="text-[10px] tracking-[0.2em] uppercase text-white/30">
                  {scenarios.length} scenarios
                </span>
              </div>

              {/* v0.8.1 sort / filter chips — same UX as talkshow's so
                  cross-mode users get a familiar pattern. Mine chip only
                  shows up when the user has actually created something. */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                <FiredChip active={sortMode === 'default' && !mineOnly}
                  onClick={() => { setSortMode('default'); setMineOnly(false); }}
                  color="#ffffff">✨ 推荐</FiredChip>
                <FiredChip active={sortMode === 'hot' && !mineOnly}
                  onClick={() => { setSortMode('hot'); setMineOnly(false); }}
                  color="#ff5588">🔥 最热</FiredChip>
                <FiredChip active={sortMode === 'new' && !mineOnly}
                  onClick={() => { setSortMode('new'); setMineOnly(false); }}
                  color="#4c9eff">🆕 最新</FiredChip>
                <FiredChip active={sortMode === 'monthly' && !mineOnly}
                  onClick={() => { setSortMode('monthly'); setMineOnly(false); }}
                  color="#ffb84c">🏆 月度榜</FiredChip>
                {mineCountFired > 0 && (
                  <FiredChip active={mineOnly}
                    onClick={() => setMineOnly((v) => !v)}
                    color="#ffb84c">
                    👤 我的创作 · {mineCountFired}
                  </FiredChip>
                )}
                {/* v2.1.0 — tribe filter chip. Renders only when the
                    user's archetype carries an industry tag AND at
                    least one scenario matches that tag. Color picks
                    its archetype.colors.start so the chip reads as
                    "tribe-personalized". */}
                {tribeCountFired > 0 && myArchetype?.industry && (
                  <FiredChip active={tribeOnly}
                    onClick={() => setTribeOnly((v) => !v)}
                    color={myArchetype.colors.start}>
                    {myArchetype.emoji} 我的圈子 · {tribeCountFired}
                  </FiredChip>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* v0.8.0 — creator CTA. First slot in the grid; tapping
                    opens the modal. After successful generate the scenario
                    list reloads and the user is auto-selected on the new
                    one so they can pick a personality + start the round. */}
                {!mineOnly && <CreateScenarioCard onOpen={() => setCreatorOpen(true)} />}
                {visibleScenarios.map((scenario, idx) => {
                  const active = selectedScenario === scenario.id;
                  // v0.9.2 — top 3 cards in monthly mode get a 🥇🥈🥉 badge.
                  const medalGlyph = sortMode === 'monthly' && !mineOnly && idx < 3
                    ? (idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉')
                    : null;
                  // v1.0.0 — Premium-locked card. Click routes to paywall
                  // instead of selecting the scenario.
                  const isLocked = scenario.premium && !premium;
                  return (
                    <motion.button
                      key={scenario.id}
                      onClick={() => {
                        if (isLocked) {
                          navigate('/premium');
                          return;
                        }
                        setSelectedScenario(scenario.id);
                      }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.985 }}
                      className="hover-sheen frost-card relative overflow-hidden rounded-2xl p-5 text-left transition min-h-[168px]"
                      style={{
                        background: medalGlyph
                          ? 'linear-gradient(155deg, rgba(255,184,76,0.20) 0%, rgba(255,85,136,0.06) 100%)'
                          : active
                            ? 'linear-gradient(155deg, rgba(255,51,85,0.14) 0%, rgba(255,138,76,0.08) 100%)'
                            : 'rgba(255,255,255,0.025)',
                        border: medalGlyph
                          ? '1px solid rgba(255,184,76,0.55)'
                          : active
                            ? '1px solid rgba(255,51,85,0.55)'
                            : '1px solid rgba(255,255,255,0.06)',
                        boxShadow: medalGlyph
                          ? '0 10px 36px rgba(255,184,76,0.22), inset 0 1px 0 rgba(255,255,255,0.06)'
                          : active
                            ? '0 10px 36px rgba(255,51,85,0.2), inset 0 1px 0 rgba(255,255,255,0.06)'
                            : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      }}
                    >
                      {medalGlyph && (
                        <div
                          className="medal-pulse absolute top-2 left-2 text-2xl leading-none select-none z-20"
                          aria-label={`月度榜第 ${idx + 1} 名`}
                        >
                          {medalGlyph}
                        </div>
                      )}
                      {/* v1.0.0 Premium 标签 — locked 状态下大且清晰; 已订阅时
                          只在卡角放一个小 👑 表明这是 Premium 内容。 */}
                      {scenario.premium && (
                        <div
                          className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide"
                          style={{
                            color: '#ffb84c',
                            background: isLocked
                              ? 'linear-gradient(135deg, rgba(255,184,76,0.22), rgba(255,85,136,0.10))'
                              : 'rgba(255,184,76,0.10)',
                            border: `1px solid ${isLocked ? 'rgba(255,184,76,0.55)' : 'rgba(255,184,76,0.32)'}`,
                            boxShadow: isLocked ? '0 4px 14px rgba(255,184,76,0.3)' : 'none',
                          }}
                        >
                          {isLocked ? '👑 Premium · 升级解锁' : '👑 Premium'}
                        </div>
                      )}
                      {/* Locked overlay — soft veil + lock glyph centered.
                          Sits ABOVE content but BELOW the medal/Premium chips
                          so they remain readable. */}
                      {isLocked && (
                        <div
                          className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
                          style={{
                            background: 'radial-gradient(circle at 50% 50%, rgba(8,6,24,0.10) 0%, rgba(8,6,24,0.62) 100%)',
                            backdropFilter: 'blur(0.5px)',
                          }}
                        >
                          <div
                            className="text-3xl"
                            style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.55))' }}
                          >
                            🔒
                          </div>
                        </div>
                      )}
                      {active && (
                        <motion.div
                          aria-hidden
                          className="absolute -top-12 -right-12 w-36 h-36 rounded-full pointer-events-none"
                          style={{ background: 'radial-gradient(circle, rgba(255,51,85,0.3) 0%, transparent 70%)' }}
                          animate={{ opacity: [0.45, 0.85, 0.45] }}
                          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
                      <div className="relative z-10">
                        <div className="flex items-start justify-between mb-4">
                          <div
                            className="w-11 h-11 rounded-xl grid place-items-center text-xl"
                            style={{
                              background: active
                                ? 'linear-gradient(135deg, rgba(255,51,85,0.3) 0%, rgba(255,138,76,0.18) 100%)'
                                : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${active ? 'rgba(255,51,85,0.55)' : 'rgba(255,255,255,0.06)'}`,
                            }}
                          >
                            {scenario.emoji}
                          </div>
                          <div className="flex flex-col items-end gap-1 mt-1">
                            <div className="flex gap-0.5">
                              {Array.from({ length: 3 }, (_, i) => (
                                <span
                                  key={i}
                                  className="text-[11px]"
                                  style={{
                                    color: i < scenario.difficulty ? '#ffb84c' : 'rgba(255,255,255,0.18)',
                                    filter: i < scenario.difficulty ? 'drop-shadow(0 0 4px rgba(255,184,76,0.6))' : 'none',
                                  }}
                                >
                                  ★
                                </span>
                              ))}
                            </div>
                            {/* v0.8.2 — per-user memory badge. Only shows
                                when the user has actually played this
                                scenario before (memStats has an entry).
                                Communicates that the HR will remember. */}
                            {memStats[scenario.id] && (
                              <span
                                className="px-1.5 py-0.5 rounded-full font-bold tracking-wide text-[9px] inline-flex items-center gap-1"
                                style={{
                                  color: '#b086ff',
                                  background: 'rgba(124,58,237,0.15)',
                                  border: '1px solid rgba(124,58,237,0.4)',
                                }}
                                title={`HR 记得你 · 上次套路:${memStats[scenario.id].lastTactic}`}
                              >
                                🧠 {memStats[scenario.id].playCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <h3
                          className="text-base font-bold mb-1.5 tracking-tight flex items-center gap-2"
                          style={{ color: active ? '#fff' : 'rgba(255,255,255,0.82)' }}
                        >
                          {scenario.title}
                          {scenario.source === 'user' && (
                            <span
                              className="px-1.5 py-0.5 rounded-full font-bold tracking-wide text-[9px]"
                              style={{
                                color: '#ffb84c',
                                background: 'rgba(255,184,76,0.15)',
                                border: '1px solid rgba(255,184,76,0.4)',
                              }}
                              title="社区创作"
                            >
                              ✨ 用户
                            </span>
                          )}
                        </h3>
                        <p
                          className="text-[12px] leading-relaxed"
                          style={{ color: active ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.4)' }}
                        >
                          {scenario.description}
                        </p>
                        {/* v0.8.1 — like pill in the bottom corner. Tap
                            stops bubbling so the card-level select handler
                            doesn't fire. Hidden behind a min-3 likes
                            threshold for seeds (so empty seed cards don't
                            shout 0 hearts), always visible for user bits
                            so creators see traction. */}
                        {(scenario.source === 'user' || (scenario.likes ?? 0) > 0) && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); toggleLikeFired(scenario.id); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation();
                                e.preventDefault();
                                toggleLikeFired(scenario.id);
                              }
                            }}
                            className="absolute bottom-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] cursor-pointer transition"
                            style={{
                              color: likedIds.has(scenario.id) ? '#ff5588' : 'rgba(255,255,255,0.55)',
                              background: likedIds.has(scenario.id)
                                ? 'rgba(255,85,136,0.12)'
                                : 'rgba(0,0,0,0.25)',
                              border: `1px solid ${likedIds.has(scenario.id)
                                ? 'rgba(255,85,136,0.45)'
                                : 'rgba(255,255,255,0.10)'}`,
                            }}
                            title={likedIds.has(scenario.id) ? '已喜欢 · 再点取消' : '喜欢这一关'}
                          >
                            <span className="leading-none">{likedIds.has(scenario.id) ? '❤' : '♡'}</span>
                            <span className="tabular-nums">{scenario.likes ?? 0}</span>
                          </span>
                        )}
                        {/* v0.9.2 — play count badge, only when > 0. */}
                        {(scenario.plays ?? 0) > 0 && (
                          <span
                            className="absolute bottom-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] tabular-nums"
                            style={{
                              color: 'rgba(255,255,255,0.55)',
                              background: 'rgba(0,0,0,0.25)',
                              border: '1px solid rgba(255,255,255,0.10)',
                            }}
                            title="累计开局次数"
                          >
                            ▶ {scenario.plays ?? 0}
                          </span>
                        )}
                      </div>
                      {active && (
                        <motion.div
                          aria-hidden
                          className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full"
                          style={{ background: '#ff3355', boxShadow: '0 0 10px #ff3355' }}
                          animate={{ opacity: [1, 0.35, 1] }}
                          transition={{ duration: 1.6, repeat: Infinity }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </motion.section>

            {/* -- HR difficulty column (right) ---------------------------- */}
            <motion.section
              className="lg:col-span-5"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-xs tracking-[0.25em] uppercase text-white/45">
                  <span style={{ color: colors.semantic.warn }}>02</span> · HR 难度
                </h2>
                <span className="text-[10px] tracking-[0.2em] uppercase text-white/30">pick your opponent</span>
              </div>
              <div className="flex flex-col gap-3">
                {PERSONALITIES.map((p) => {
                  const active = selectedPersonality === p.id;
                  return (
                    <motion.button
                      key={p.id}
                      onClick={() => setSelectedPersonality(p.id)}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.985 }}
                      className="relative overflow-hidden rounded-2xl p-4 text-left flex items-center gap-4"
                      style={{
                        background: active ? `${p.color}14` : 'rgba(255,255,255,0.025)',
                        border: `1px solid ${active ? p.color + '66' : 'rgba(255,255,255,0.06)'}`,
                        boxShadow: active
                          ? `0 8px 28px ${p.color}22, inset 0 1px 0 rgba(255,255,255,0.06)`
                          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      }}
                    >
                      <div
                        className="w-12 h-12 rounded-xl grid place-items-center text-2xl shrink-0"
                        style={{
                          background: active ? `${p.color}30` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${active ? p.color + '55' : 'rgba(255,255,255,0.06)'}`,
                        }}
                      >
                        {p.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-bold text-sm mb-0.5"
                          style={{ color: active ? '#fff' : 'rgba(255,255,255,0.82)' }}
                        >
                          {p.title}
                        </div>
                        <div
                          className="text-[11px] leading-relaxed"
                          style={{ color: active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)' }}
                        >
                          {p.description}
                        </div>
                      </div>
                      {active && (
                        <motion.div
                          aria-hidden
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: p.color, boxShadow: `0 0 10px ${p.color}` }}
                          animate={{ opacity: [1, 0.35, 1] }}
                          transition={{ duration: 1.6, repeat: Infinity }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* CTA panel */}
              <div
                className="mt-5 rounded-2xl p-5"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="text-[11px] tracking-[0.2em] uppercase text-white/45 mb-2">准备就绪</div>
                <div className="text-white/85 text-sm mb-4 leading-relaxed">
                  {selectedScenario ? (
                    <>剧本已选 · 对手 <span style={{ color: activePersonality.color }}>{activePersonality.title}</span></>
                  ) : (
                    '先在左侧选一个被优化的剧本。'
                  )}
                </div>
                <motion.button
                  onClick={handleStart}
                  disabled={!selectedScenario}
                  whileHover={selectedScenario ? { scale: 1.015, y: -1 } : {}}
                  whileTap={selectedScenario ? { scale: 0.985 } : {}}
                  className="relative w-full overflow-hidden py-3.5 rounded-xl text-sm font-semibold tracking-wide disabled:opacity-35 disabled:cursor-not-allowed"
                  style={{
                    background: selectedScenario
                      ? 'linear-gradient(135deg, #ff3355 0%, #ff8a4c 100%)'
                      : 'rgba(255,255,255,0.04)',
                    color: '#fff',
                    boxShadow: selectedScenario
                      ? '0 10px 40px rgba(255,51,85,0.35), inset 0 1px 0 rgba(255,255,255,0.18)'
                      : 'none',
                  }}
                >
                  {selectedScenario && (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 opacity-35"
                      style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)' }}
                      animate={{ x: ['-110%', '210%'] }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2.5 }}
                    />
                  )}
                  <span className="relative z-10">
                    {selectedScenario ? '进入谈判室 →' : '选择剧本后解锁'}
                  </span>
                </motion.button>
                {/* v0.9.3 — alternative entry: real human plays HR via PvP
                    room. Only meaningful once a scenario is picked. Subtle
                    secondary button to avoid stealing focus from the
                    primary AI-HR flow. */}
                {selectedScenario && (
                  <button
                    onClick={() => navigate(`/fired/room/new?scenarioId=${selectedScenario}`)}
                    className="hover-sheen mt-2.5 w-full py-2.5 rounded-xl text-[12px] font-semibold tracking-wide transition relative overflow-hidden"
                    style={{
                      color: '#fff',
                      background:
                        'linear-gradient(135deg, rgba(124,58,237,0.20), rgba(255,85,136,0.16))',
                      border: '1px solid rgba(124,58,237,0.45)',
                    }}
                    title="跟你朋友 PvP — 他扮 HR,你跟他谈判"
                  >
                    🤝 邀请朋友扮 HR (PvP)
                  </button>
                )}
              </div>
            </motion.section>
          </motion.div>
          )}

          {/* v0.9.0 — UGC pack browse + create */}
          {entryMode === 'packs' && (
            <PacksTab
              key="packs"
              scenarios={scenarios}
              myId={myId}
              myArchetype={myArchetype}
              onCreateOpen={() => setPackCreatorOpen(true)}
            />
          )}
          </AnimatePresence>
        </div>
      </main>

      {/* v0.8.0 — UGC scenario creator modal. Lives outside the AnimatePresence
          for entryMode so it stays mounted across chapters/custom toggles. */}
      <AnimatePresence>
        {creatorOpen && (
          <CreateScenarioModal
            onCancel={() => setCreatorOpen(false)}
            onCreated={async (scenario) => {
              setCreatorOpen(false);
              if (reloadScenarios.current) await reloadScenarios.current();
              // Auto-switch to "custom" tab + select the new scenario so
              // the user just has to pick a personality and hit Start.
              setEntryMode('custom');
              setSelectedScenario(scenario.id);
            }}
          />
        )}
      </AnimatePresence>

      {/* v0.9.0 — UGC pack creator modal. */}
      <AnimatePresence>
        {packCreatorOpen && (
          <CreatePackModal
            scenarios={scenarios}
            onCancel={() => setPackCreatorOpen(false)}
            onCreated={(pack) => {
              setPackCreatorOpen(false);
              navigate(`/fired/pack/${pack.id}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// v0.8.0 — UGC scenario creator
// ---------------------------------------------------------------------------

const SCENARIO_EMOJIS = ['🐣', '🗣️', '🔄', '🤰', '📊', '🪪', '🏭', '🤝', '🏢', '🍵', '⚖️', '🎭'];

const SCENARIO_SAMPLES = [
  '我是 35 岁前端,公司说要优化高薪员工',
  '入职第三个月 HR 突然说我"不胜任",要试用期不通过',
  '怀孕第四个月被通知岗位取消,公司只赔 1 个月',
  '老板口头承诺 N+1,签字时只给一个月',
  '部门集体被裁,公司说是"组织优化",不算裁员',
];

function CreateScenarioCard({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.button
      onClick={onOpen}
      whileHover={{ y: -2, scale: 1.005 }}
      whileTap={{ scale: 0.98 }}
      className="text-left rounded-2xl p-5 transition flex flex-col items-center justify-center gap-2 min-h-[168px] cursor-pointer"
      style={{
        background:
          'radial-gradient(circle at 20% 0%, rgba(255,51,85,0.18), rgba(255,138,76,0.10) 60%, transparent), rgba(255,255,255,0.03)',
        border: '1px dashed rgba(255,51,85,0.45)',
        boxShadow: '0 8px 24px -12px rgba(255,51,85,0.4)',
      }}
    >
      <div className="text-3xl mb-1">⚖️</div>
      <div className="text-base font-bold text-white/90">自己造一关</div>
      <div className="text-[12px] text-white/55 text-center px-2 leading-relaxed">
        说说你的真实裁员场景<br/>AI 写出完整 HR 剧本
      </div>
    </motion.button>
  );
}

function CreateScenarioModal({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (scenario: FiredScenario) => void;
}) {
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2);
  const [emoji, setEmoji] = useState<string>(SCENARIO_EMOJIS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sample = useMemo(
    () => SCENARIO_SAMPLES[Math.floor(Math.random() * SCENARIO_SAMPLES.length)],
    [],
  );

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  const canSubmit = description.trim().length >= 8 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      const resp = await fetch('/api/fired/generate-scenario', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // v0.8.1 — pseudonymous creator id so the user can later filter
          // to "我的创作".
          'X-User-Id': getUserId(),
        },
        body: JSON.stringify({ description: description.trim(), difficulty, emoji }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `生成失败 (${resp.status})`);
      }
      const full = (await resp.json()) as FiredScenario;
      onCreated(full);
    } catch (e) {
      setErrMsg((e as Error).message ?? '生成失败,稍后再试');
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(8,6,24,0.78)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.96, opacity: 0 }}
        animate={{ y: 0,  scale: 1,    opacity: 1 }}
        exit={{    y: 20, scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          background: 'linear-gradient(180deg,#1a0d2e,#0d0a25)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white">⚖️ 造一关裁员剧本</h3>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-white/45 hover:text-white/85 transition text-xl leading-none disabled:opacity-30"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5">
          一句话讲讲你的真实场景（8-300 字越具体越好,会自动屏蔽真名/真公司）
        </label>
        <textarea
          ref={inputRef}
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 300))}
          disabled={submitting}
          rows={4}
          placeholder={`例如:${sample}`}
          className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-rose-400/40 transition resize-none"
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        />
        <div className="text-right text-[10px] text-white/35 mt-1 tabular-nums">{description.length}/300</div>

        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5 mt-3">难度</label>
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d as 1 | 2 | 3)}
              disabled={submitting}
              className="rounded-lg py-2 text-xs font-bold transition flex items-center justify-center gap-0.5"
              style={{
                background: difficulty === d
                  ? 'linear-gradient(135deg,rgba(255,51,85,0.25),rgba(255,138,76,0.18))'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${difficulty === d ? 'rgba(255,51,85,0.55)' : 'rgba(255,255,255,0.08)'}`,
                color: difficulty === d ? '#fff' : 'rgba(255,255,255,0.6)',
              }}
            >
              {Array.from({ length: 3 }, (_, i) => (
                <span key={i} style={{ color: i < d ? '#ffb84c' : 'rgba(255,255,255,0.18)' }}>★</span>
              ))}
            </button>
          ))}
        </div>

        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5 mt-3">封面 emoji</label>
        <div className="grid grid-cols-6 gap-1.5">
          {SCENARIO_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              disabled={submitting}
              className="aspect-square rounded-lg text-lg transition"
              style={{
                background: emoji === e
                  ? 'linear-gradient(135deg,rgba(255,51,85,0.25),rgba(255,138,76,0.18))'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${emoji === e ? 'rgba(255,51,85,0.55)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {e}
            </button>
          ))}
        </div>

        {errMsg && (
          <div className="mt-3 text-[12px] text-amber-300/90">⚠️ {errMsg}</div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold tracking-wide text-white/65 transition disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-5 py-2 rounded-xl text-xs font-bold tracking-wide text-white transition disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg,#ff3355,#ff8a4c)',
              boxShadow: '0 6px 18px rgba(255,51,85,0.45)',
            }}
          >
            {submitting ? '⚖️ AI 起草中…(~10s)' : '✨ 生成剧本'}
          </button>
        </div>

        <div className="mt-3 text-[10px] text-white/35 leading-relaxed">
          AI 会根据你的描述生成完整法律分析 + HR 开场白 + 玩家背景。生成的关卡进入剧本库,所有人可见。请勿输入真人姓名或真公司名(系统会自动替换)。
        </div>
      </motion.div>
    </motion.div>
  );
}

/** v0.8.1 — sort/filter chip mirroring talkshow's `Chip` component but
 *  styled to fit the fired-mode danger/amber palette. Inline because we
 *  use it in exactly one place; promoting to a shared component when a
 *  3rd caller appears. */
function FiredChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-bold tracking-wide transition"
      style={{
        color: active ? '#fff' : 'rgba(255,255,255,0.55)',
        background: active ? `${color}30` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? color + '88' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {children}
    </button>
  );
}

// ===========================================================================
// v0.9.0 — UGC packs (browse + create)
// ===========================================================================

// v1.3.4 — adds 'foryou' which client-side reorders by archetype
// shineScenarioId affinity. Server unaware — we re-sort the default
// list using the user's quiz profile.
type PackSortMode = 'default' | 'hot' | 'new' | 'monthly' | 'foryou';

interface PackWithMeta extends FiredPack {
  slotCount?: number;
}

function PacksTab({
  scenarios,
  myId,
  onCreateOpen,
  myArchetype,
}: {
  scenarios: ScenarioWithSource[];
  myId: string;
  onCreateOpen: () => void;
  /** v1.3.4 — when set, "🧠 适合你" sort chip surfaces and re-orders
   *  packs by how well their slot scenarios match the user's archetype
   *  shineScenarioId + adjacent emotional tone scenarios. */
  myArchetype: Archetype | null;
}) {
  const navigate = useNavigate();
  const scenarioById = useMemo(
    () => new Map(scenarios.map((s) => [s.id, s])),
    [scenarios],
  );
  const [packs, setPacks] = useState<PackWithMeta[]>([]);
  const [sortMode, setSortMode] = useState<PackSortMode>('default');
  const [mineOnly, setMineOnly] = useState(false);
  const [likedPacks, setLikedPacks] = useState<Set<string>>(new Set());
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Load packs for the chosen sort mode + this IP's hearted set.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = sortMode === 'default'
          ? '/api/fired/packs'
          : `/api/fired/packs?sort=${sortMode}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`packs ${r.status}`);
        const d = await r.json() as { packs: PackWithMeta[] };
        if (cancelled) return;
        const next = d.packs ?? [];
        setPacks(next);
        const ids = next.map((p) => p.id).join(',');
        if (ids) {
          fetch(`/api/fired/packs/like-state?ids=${encodeURIComponent(ids)}`)
            .then((r2) => r2.json())
            .then((d2: { liked?: string[] }) => {
              if (!cancelled && Array.isArray(d2.liked)) setLikedPacks(new Set(d2.liked));
            })
            .catch(() => { /* soft-fail */ });
        }
      } catch (e) {
        if (!cancelled) setLoadErr((e as Error).message ?? '加载失败');
      }
    })();
    return () => { cancelled = true; };
  }, [sortMode]);

  const togglePackLike = async (id: string) => {
    const wasLiked = likedPacks.has(id);
    setLikedPacks((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(id); else next.add(id);
      return next;
    });
    setPacks((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, likes: Math.max(0, (p.likes ?? 0) + (wasLiked ? -1 : 1)) } : p,
      ),
    );
    try {
      const r = await fetch('/api/fired/packs/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: id, liked: !wasLiked }),
      });
      if (!r.ok) throw new Error(`like ${r.status}`);
      const d = await r.json() as { likes: number };
      setPacks((prev) => prev.map((p) => (p.id === id ? { ...p, likes: d.likes } : p)));
    } catch {
      setLikedPacks((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(id); else next.delete(id);
        return next;
      });
      setPacks((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, likes: Math.max(0, (p.likes ?? 0) + (wasLiked ? 1 : -1)) } : p,
        ),
      );
    }
  };

  const visiblePacks = useMemo(() => {
    let out = mineOnly ? packs.filter((p) => p.createdBy === myId) : packs;
    // v1.3.4 — "适合你" client-side re-rank by archetype affinity.
    // Score per pack = +5 if any slot.scenarioId matches the archetype's
    // shineScenarioId, +1 per slot whose personality matches the
    // archetype's "natural opponent" tone (demon for grinder/iron-maiden,
    // veteran for sass/veteran/deck-wizard, rookie for ghost/slacker
    // etc). Stable secondary sort by likes desc so equal-score packs
    // surface the better-liked one first.
    if (sortMode === 'foryou' && myArchetype) {
      const shineId = myArchetype.shineScenarioId;
      const preferred: Record<string, 'rookie' | 'veteran' | 'demon'> = {
        grinder: 'demon', 'iron-maiden': 'demon', 'sass-master': 'veteran',
        veteran: 'veteran', 'deck-wizard': 'veteran', pleaser: 'demon',
        ghost: 'rookie', slacker: 'rookie', nihilist: 'veteran',
        'show-pony': 'demon', 'anti-grinder': 'veteran', 'drama-queen': 'demon',
      };
      const wantedPersonality = preferred[myArchetype.id];
      out = [...out]
        .map((p, idx) => {
          let score = 0;
          for (const slot of (p.slots ?? [])) {
            if (slot.scenarioId === shineId) score += 5;
            if (wantedPersonality && slot.personalityId === wantedPersonality) score += 1;
          }
          return { p, idx, score };
        })
        .sort((a, b) => b.score - a.score
                     || (b.p.likes ?? 0) - (a.p.likes ?? 0)
                     || a.idx - b.idx)
        .map((e) => e.p);
    }
    return out;
  }, [packs, mineOnly, myId, sortMode, myArchetype]);
  const minePackCount = useMemo(
    () => packs.filter((p) => p.createdBy === myId).length,
    [packs, myId],
  );

  return (
    <motion.div
      key="packs"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-xs tracking-[0.25em] uppercase text-white/45">
          <span style={{ color: '#ff5588' }}>📦</span> · 闯关包
        </h2>
        <span className="text-[10px] tracking-[0.2em] uppercase text-white/30">
          {packs.length} packs
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        <FiredChip active={sortMode === 'default' && !mineOnly}
          onClick={() => { setSortMode('default'); setMineOnly(false); }}
          color="#ffffff">✨ 推荐</FiredChip>
        <FiredChip active={sortMode === 'hot' && !mineOnly}
          onClick={() => { setSortMode('hot'); setMineOnly(false); }}
          color="#ff5588">🔥 最热</FiredChip>
        <FiredChip active={sortMode === 'new' && !mineOnly}
          onClick={() => { setSortMode('new'); setMineOnly(false); }}
          color="#4c9eff">🆕 最新</FiredChip>
        <FiredChip active={sortMode === 'monthly' && !mineOnly}
          onClick={() => { setSortMode('monthly'); setMineOnly(false); }}
          color="#ffb84c">🏆 月度榜</FiredChip>
        {/* v1.3.4 — "适合你" archetype-affinity sort. Only when user
            has a quiz profile (so anonymous users don't see a dead chip). */}
        {myArchetype && (
          <FiredChip active={sortMode === 'foryou' && !mineOnly}
            onClick={() => { setSortMode('foryou'); setMineOnly(false); }}
            color="#b086ff">
            🧠 适合你 · {myArchetype.emoji}
          </FiredChip>
        )}
        {minePackCount > 0 && (
          <FiredChip active={mineOnly}
            onClick={() => setMineOnly((v) => !v)}
            color="#ffb84c">
            👤 我的闯关包 · {minePackCount}
          </FiredChip>
        )}
      </div>

      {loadErr && (
        <EmptyState emoji="⚠️" title="闯关包加载失败" body={loadErr}
          cta={{ label: '↻ 重试', onClick: () => window.location.reload() }}
          glow="rgba(255,184,76,0.18)" />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!mineOnly && (
          <CreatePackCard onOpen={onCreateOpen} />
        )}
        {/* v0.9.2.1 — empty state instead of bland text. Different copy
            depending on filter: 'mine' = encourage create; otherwise =
            "be the first" pioneer hook. Plus there's the create card
            in slot 0 already, so the empty state focuses on context. */}
        {visiblePacks.length === 0 && !loadErr && (
          mineOnly ? (
            <EmptyState
              emoji="📦"
              title="你还没造过闯关包"
              body="挑 5 个剧本组合,朋友拿到链接就能挑战同一组"
              cta={{ label: '✨ 造第一个', onClick: onCreateOpen }}
            />
          ) : (
            <EmptyState
              emoji="🎯"
              title="还没有闯关包"
              body="做第一个开拓者?5 关组合,通关后链接分享给朋友"
              cta={{ label: '✨ 造第一个', onClick: onCreateOpen }}
              glow="rgba(255,85,136,0.18)"
            />
          )
        )}
        {visiblePacks.map((pack, idx) => {
          const isMine = pack.createdBy === myId;
          const liked = likedPacks.has(pack.id);
          const playCount = pack.plays ?? 0;
          // v0.9.2 — top-3 monthly leaderboard medals.
          const medalGlyph = sortMode === 'monthly' && !mineOnly && idx < 3
            ? (idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉')
            : null;
          // Build a tiny preview of the 5 slot scenarios (emoji row).
          const slotEmojis = pack.slots.map(
            (s) => scenarioById.get(s.scenarioId)?.emoji ?? '⚖️',
          );
          return (
            <motion.button
              key={pack.id}
              onClick={() => navigate(`/fired/pack/${pack.id}`)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.985 }}
              className="hover-sheen frost-card text-left rounded-2xl p-4 transition flex flex-col gap-3 min-h-[180px] relative overflow-hidden"
              style={{
                background: medalGlyph
                  ? 'linear-gradient(135deg, rgba(255,184,76,0.16), rgba(255,85,136,0.06))'
                  : isMine
                    ? 'linear-gradient(135deg, rgba(255,184,76,0.10), rgba(255,255,255,0.02))'
                    : 'linear-gradient(135deg, rgba(255,85,136,0.06), rgba(124,58,237,0.04))',
                border: `1px solid ${medalGlyph
                  ? 'rgba(255,184,76,0.55)'
                  : isMine ? 'rgba(255,184,76,0.32)' : 'rgba(255,85,136,0.25)'}`,
                boxShadow: medalGlyph ? '0 6px 24px rgba(255,184,76,0.25)' : undefined,
              }}
            >
              {medalGlyph && (
                <div
                  className="medal-pulse absolute top-2 left-2 text-2xl leading-none select-none z-20"
                  aria-label={`月度榜第 ${idx + 1} 名`}
                >
                  {medalGlyph}
                </div>
              )}
              <div className="flex items-start justify-between">
                <div className={`text-3xl ${medalGlyph ? 'pl-9' : ''}`}>{pack.emoji}</div>
                {isMine && (
                  <span className="px-1.5 py-0.5 rounded-full font-bold tracking-wide text-[9px]"
                    style={{
                      color: '#ffb84c',
                      background: 'rgba(255,184,76,0.15)',
                      border: '1px solid rgba(255,184,76,0.4)',
                    }}>
                    ✨ 我的
                  </span>
                )}
              </div>
              <div>
                <div className="text-base font-bold text-white/95 leading-snug mb-1">
                  {pack.title}
                </div>
                <div className="text-[12px] text-white/55 line-clamp-2 leading-relaxed">
                  {pack.description}
                </div>
              </div>
              <div className="mt-auto flex items-center gap-2 text-[11px]">
                <div className="flex gap-0.5">
                  {slotEmojis.map((em, i) => (
                    <span key={i} className="opacity-80">{em}</span>
                  ))}
                </div>
                {/* v0.9.2 — play count badge, only when > 0. Sits in the
                    same line as slot count + heart so the metadata row
                    stays compact. */}
                {playCount > 0 && (
                  <span className="text-white/40 tabular-nums" title="累计开包次数">
                    ▶ {playCount}
                  </span>
                )}
                <span className="text-white/35 ml-auto">{pack.slots.length} 关</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); togglePackLike(pack.id); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      togglePackLike(pack.id);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full cursor-pointer transition"
                  style={{
                    color: liked ? '#ff5588' : 'rgba(255,255,255,0.55)',
                    background: liked ? 'rgba(255,85,136,0.12)' : 'rgba(0,0,0,0.25)',
                    border: `1px solid ${liked ? 'rgba(255,85,136,0.45)' : 'rgba(255,255,255,0.10)'}`,
                  }}
                >
                  <span>{liked ? '❤' : '♡'}</span>
                  <span className="tabular-nums">{pack.likes ?? 0}</span>
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

function CreatePackCard({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.button
      onClick={onOpen}
      whileHover={{ y: -2, scale: 1.005 }}
      whileTap={{ scale: 0.98 }}
      className="text-left rounded-2xl p-5 transition flex flex-col items-center justify-center gap-2 min-h-[180px] cursor-pointer"
      style={{
        background:
          'radial-gradient(circle at 20% 0%, rgba(255,85,136,0.18), rgba(124,58,237,0.10) 60%, transparent), rgba(255,255,255,0.03)',
        border: '1px dashed rgba(255,85,136,0.45)',
        boxShadow: '0 8px 24px -12px rgba(255,85,136,0.4)',
      }}
    >
      <div className="text-3xl mb-1">📦</div>
      <div className="text-base font-bold text-white/90">造一个闯关包</div>
      <div className="text-[12px] text-white/55 text-center px-2 leading-relaxed">
        挑 5 个剧本 + 难度<br/>朋友拿到链接就能挑战
      </div>
    </motion.button>
  );
}

const PACK_EMOJI_PALETTE = ['📦', '🎯', '🔥', '💼', '⚖️', '🪪', '🌪️', '🧨', '🐉', '👹', '👻', '🩸'];
const PACK_PERSONALITIES: Array<{ id: FiredPersonalityId; label: string; color: string }> = [
  { id: 'rookie',  label: '😊 菜鸟',   color: '#6ee7b7' },
  { id: 'veteran', label: '😏 老油条', color: '#ffb84c' },
  { id: 'demon',   label: '👿 魔鬼',   color: '#ff4757' },
];

function CreatePackModal({
  scenarios,
  onCancel,
  onCreated,
}: {
  scenarios: ScenarioWithSource[];
  onCancel: () => void;
  onCreated: (pack: FiredPack) => void;
}) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji]             = useState(PACK_EMOJI_PALETTE[0]);
  /** Slots is an array of (scenarioId, personalityId) — null until the
   *  user picks. Default personality = 'veteran' (middle difficulty). */
  const [slots, setSlots] = useState<Array<PackSlot | null>>(
    () => Array.from({ length: 5 }, () => null),
  );
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg]         = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  const allFilled = slots.every((s) => s !== null);
  const canSubmit = title.trim().length >= 2 && description.trim().length >= 4 && allFilled && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      const r = await fetch('/api/fired/packs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': getUserId(),
        },
        body: JSON.stringify({
          title:       title.trim(),
          description: description.trim(),
          emoji,
          slots: slots.filter((s): s is PackSlot => s !== null),
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `创建失败 (${r.status})`);
      }
      const pack = await r.json() as FiredPack;
      onCreated(pack);
    } catch (e) {
      setErrMsg((e as Error).message ?? '创建失败,稍后再试');
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(8,6,24,0.78)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.96, opacity: 0 }}
        animate={{ y: 0,  scale: 1,    opacity: 1 }}
        exit={{    y: 20, scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl rounded-2xl p-6 max-h-[92vh] overflow-y-auto"
        style={{
          background: 'linear-gradient(180deg,#1a0d2e,#0d0a25)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white">📦 造一个闯关包</h3>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-white/45 hover:text-white/85 transition text-xl leading-none disabled:opacity-30"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* Title */}
        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5">
          闯关包名字 (2-32 字)
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 32))}
          disabled={submitting}
          placeholder="比如:大厂裁员实战 5 关"
          className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-rose-400/40 transition mb-3"
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        />

        {/* Description */}
        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5">
          一句话介绍 (4-140 字)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 140))}
          disabled={submitting}
          rows={2}
          placeholder="写给玩家看的:这组关卡讲什么主题、为什么值得打"
          className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-rose-400/40 transition resize-none"
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        />
        <div className="text-right text-[10px] text-white/35 mt-1 tabular-nums mb-3">
          {description.length}/140
        </div>

        {/* Emoji picker */}
        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5">封面 emoji</label>
        <div className="grid grid-cols-6 gap-1.5 mb-4">
          {PACK_EMOJI_PALETTE.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              disabled={submitting}
              className="aspect-square rounded-lg text-lg transition"
              style={{
                background: emoji === e
                  ? 'linear-gradient(135deg,rgba(255,85,136,0.25),rgba(124,58,237,0.18))'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${emoji === e ? 'rgba(255,85,136,0.55)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {e}
            </button>
          ))}
        </div>

        {/* 5 slots */}
        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5">
          5 关排序(从易到难推荐:菜鸟 → 老油条 → 魔鬼)
        </label>
        <div className="space-y-2 mb-4">
          {slots.map((slot, idx) => (
            <PackSlotPicker
              key={idx}
              index={idx}
              slot={slot}
              scenarios={scenarios}
              disabled={submitting}
              onChange={(next) => {
                setSlots((prev) => prev.map((s, i) => (i === idx ? next : s)));
              }}
            />
          ))}
        </div>

        {errMsg && (
          <div className="text-[12px] text-amber-300/90 mb-3">⚠️ {errMsg}</div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold tracking-wide text-white/65 transition disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-5 py-2 rounded-xl text-xs font-bold tracking-wide text-white transition disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
              boxShadow: '0 6px 18px rgba(255,85,136,0.45)',
            }}
          >
            {submitting ? '🛠️ 打包中…' : '✨ 创建闯关包'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PackSlotPicker({
  index,
  slot,
  scenarios,
  disabled,
  onChange,
}: {
  index: number;
  slot: PackSlot | null;
  scenarios: ScenarioWithSource[];
  disabled: boolean;
  onChange: (next: PackSlot) => void;
}) {
  const sc = slot ? scenarios.find((s) => s.id === slot.scenarioId) : null;
  return (
    <div
      className="rounded-xl p-3 flex items-center gap-3"
      style={{
        background: slot ? 'rgba(255,85,136,0.06)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${slot ? 'rgba(255,85,136,0.25)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{
          background: 'rgba(255,85,136,0.12)',
          color: '#ff8aa6',
          border: '1px solid rgba(255,85,136,0.3)',
        }}
      >
        {index + 1}
      </div>
      <div className="flex-1 grid grid-cols-2 gap-2">
        <select
          value={slot?.scenarioId ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            onChange({ scenarioId: id, personalityId: slot?.personalityId ?? 'veteran' });
          }}
          className="rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-rose-400/40 transition truncate"
          style={{
            background: 'rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <option value="" style={{ background: '#1a0d2e' }}>选剧本…</option>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id} style={{ background: '#1a0d2e' }}>
              {s.emoji} {s.title}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {PACK_PERSONALITIES.map((p) => {
            const active = slot?.personalityId === p.id;
            return (
              <button
                key={p.id}
                disabled={disabled || !slot}
                onClick={() => slot && onChange({ ...slot, personalityId: p.id })}
                className="flex-1 px-1 py-1 rounded-md text-[10px] font-bold transition disabled:opacity-40"
                style={{
                  color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                  background: active ? `${p.color}30` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? p.color + '88' : 'rgba(255,255,255,0.06)'}`,
                }}
                title={p.label}
              >
                {p.label.split(' ')[0]}
              </button>
            );
          })}
        </div>
      </div>
      {sc && (
        <div className="text-[10px] text-white/45 flex-shrink-0 hidden md:block">
          {sc.emoji}
        </div>
      )}
    </div>
  );
}
