/**
 * PredictionBar — spectator gamification.
 *
 * Office Arena is a watch-mode product: the AI plays, the user watches. Without
 * *some* input channel the viewer has nothing to do during the 30-60s discussion
 * phases — and without skin-in-the-game, AI drama doesn't hook. This bar asks
 * "谁会被投出?" during discussion/voting and resolves once the vote lands.
 *
 * Design notes:
 *  - **No wagers, just accuracy.** Stake-based mechanics (coins/XP) would push
 *    toward loss aversion. We want replay motivation ("improve my read over 10
 *    games"), so the ratchet is cumulative hit rate + streak — dopamine from
 *    pattern recognition, not from sunk cost.
 *  - **localStorage persistence.** Stats and per-round picks survive refresh
 *    and tab close; this matters because a single game is ~5 rounds, and users
 *    naturally reload mid-game during dev.
 *  - **Per-round pick key includes gameId+round.** Prevents leaking a previous
 *    round's pick into the next round's picker, and prevents a returning user
 *    from seeing someone else's pick if they open the same URL.
 *  - **Resolution guarded by `resolvedKey`.** `vote_result` can arrive via
 *    phase_change AND via the explicit game:vote_result event; we don't want
 *    to double-count. The key is "gameId.round" so a *new* round can resolve
 *    independently without resetting state manually.
 *
 * ## Achievement layer (2026-04)
 *
 * Streak milestones fire a Steam-style toast via `AchievementToast`. Each
 * tier (5/7/10/15) fires at most once per session — `sessionTiers` tracks
 * which ones have already popped, and resets when `gameId` changes so a
 * fresh game earns fresh medals.
 *
 * The toast is scheduled 1.2s after the vote resolves (`BADGE_DELAY_MS`)
 * so it doesn't collide with EliminationReveal's own SFX + shake. Streak-
 * continuation chimes (`sfx.playStreak`) use a shorter 0.6s delay for the
 * same reason.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameActions, type GamePlayer } from '../../stores/gameStore';
import { sfx } from '../../utils/sfx';
import AchievementToast, { type AchievementData } from './AchievementToast';
import { achievementIcons, glyphIcons, Icon } from '../../constants/icons';

const STATS_KEY = 'office-arena.prediction-stats';
const PICK_PREFIX = 'office-arena.pick.';

/** Delay after vote_result before firing streak SFX — lets EliminationReveal's
 *  gavel SFX breathe. Badge fanfare uses a longer delay for the same reason. */
const STREAK_SFX_DELAY_MS = 600;
const BADGE_DELAY_MS = 1200;

interface Stats {
  total: number;
  correct: number;
  streak: number;
  bestStreak: number;
}
const DEFAULT_STATS: Stats = { total: 0, correct: 0, streak: 0, bestStreak: 0 };

/** Medal tiers. Kept in ascending order — resolver picks the highest unlocked
 *  threshold that hasn't fired this session, so each pop is the actual level
 *  the user reached (not every intermediate tier at once). */
interface Tier {
  threshold: number;
  emoji: string;
  /** AI-generated medal art URL; <Icon> falls back to `emoji` if the image 404s. */
  icon: string;
  label: string;
  sub: string;
  color: string;
  glow: string;
}
const TIERS: Tier[] = [
  {
    threshold: 5,
    emoji: '🥉',
    icon: achievementIcons.bronze,
    label: '连中五元',
    sub: '职场观察员 · 入门',
    color: '#cd7f32',
    glow: 'rgba(205,127,50,0.55)',
  },
  {
    threshold: 7,
    emoji: '🥈',
    icon: achievementIcons.silver,
    label: '神算子',
    sub: '洞穿 PUA · 七连命中',
    color: '#d4d4d8',
    glow: 'rgba(212,212,216,0.55)',
  },
  {
    threshold: 10,
    emoji: '🥇',
    icon: achievementIcons.gold,
    label: '人间观察官',
    sub: '十连不倒 · 卷王本王',
    color: '#ffd700',
    glow: 'rgba(255,215,0,0.65)',
  },
  {
    threshold: 15,
    emoji: '👑',
    icon: achievementIcons.crown,
    label: '公司卧底',
    sub: '十五连屠杀 · 真·老板视角',
    color: '#f472b6',
    glow: 'rgba(244,114,182,0.6)',
  },
];

function readStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? { ...DEFAULT_STATS, ...JSON.parse(raw) } : DEFAULT_STATS;
  } catch {
    return DEFAULT_STATS;
  }
}
function writeStats(s: Stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* quota — swallow, non-critical */
  }
}
function pickKey(gameId: string, round: number) {
  return `${PICK_PREFIX}${gameId}.${round}`;
}

interface Props {
  gameId: string;
  phase: string;
  round: number;
  players: GamePlayer[];
  /** playerId of the most recently eliminated member, or null on tie. */
  lastEliminated: string | null;
  /** Bumps whenever a fresh vote_result event lands — used as the resolve trigger. */
  voteResultTick: number;
}

export default function PredictionBar({
  gameId,
  phase,
  round,
  players,
  lastEliminated,
  voteResultTick,
}: Props) {
  const [pick, setPick] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [resolvedKey, setResolvedKey] = useState<string>('');
  const [achievement, setAchievement] = useState<AchievementData | null>(null);
  /** Tiers fired during this game (Set of threshold numbers). */
  const [sessionTiers, setSessionTiers] = useState<Set<number>>(new Set());
  // Timer refs so we can cancel pending scheduled SFX if the bar unmounts or
  // the user dismisses the achievement early.
  const streakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Writer into gameStore.predictionLog so HighlightReel can compute per-game
  // stats separate from the all-time localStorage tally.
  const { pushPrediction } = useGameActions();

  // Lazy-load stats once — reading localStorage in useState init would run
  // during SSR and trip vite ssr checks. useEffect mount is safe.
  useEffect(() => {
    setStats(readStats());
  }, []);

  // Re-hydrate pick whenever round or gameId changes (new round = clean slate).
  useEffect(() => {
    if (!gameId) return;
    try {
      setPick(localStorage.getItem(pickKey(gameId, round)));
    } catch {
      setPick(null);
    }
  }, [gameId, round]);

  // New game → fresh achievement session. Tiers earned in a past game should
  // still re-trigger in the next game, because "this session" is the natural
  // unit of recognition.
  useEffect(() => {
    setSessionTiers(new Set());
    setAchievement(null);
  }, [gameId]);

  // Cleanup any pending timers on unmount.
  useEffect(
    () => () => {
      if (streakTimer.current) clearTimeout(streakTimer.current);
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
    },
    [],
  );

  // Resolve once per round when a vote_result lands AND the user had a pick.
  // Driven by `voteResultTick` so we don't race phase updates — Classic.tsx
  // bumps the tick inside the `game:vote_result` socket handler.
  useEffect(() => {
    if (voteResultTick <= 0) return;
    if (!pick) return;
    const key = `${gameId}.${round}.${voteResultTick}`;
    if (resolvedKey === key) return;
    setResolvedKey(key);

    const correct = lastEliminated === pick;
    let nextStreak = 0;
    setStats((prev) => {
      nextStreak = correct ? prev.streak + 1 : 0;
      const next: Stats = {
        total: prev.total + 1,
        correct: prev.correct + (correct ? 1 : 0),
        streak: nextStreak,
        bestStreak: Math.max(prev.bestStreak, nextStreak),
      };
      writeStats(next);
      return next;
    });

    // Record this prediction into the per-game log for HighlightReel.
    // Names resolved from `players` so the reel renders readable text even
    // if the eliminated player is later reshaped by late state updates.
    const pickedPlayer = players.find((p) => p.id === pick);
    const actualPlayer = lastEliminated
      ? players.find((p) => p.id === lastEliminated)
      : null;
    pushPrediction({
      round,
      pickId: pick,
      pickName: pickedPlayer?.name || '?',
      actualId: lastEliminated ?? null,
      actualName: actualPlayer?.name ?? null,
      correct,
    });

    // ── Achievement + audio layer ─────────────────────────────────────
    if (correct) {
      // Find the highest tier the user has just reached but not yet fired.
      // Iterating from top→bottom means a jump from streak 4 → 10 only fires
      // the 10 tier, not 5/7/10 as three separate pops.
      let earnedTier: Tier | null = null;
      for (let i = TIERS.length - 1; i >= 0; i--) {
        const t = TIERS[i];
        if (nextStreak >= t.threshold && !sessionTiers.has(t.threshold)) {
          earnedTier = t;
          break;
        }
      }

      if (earnedTier) {
        // Mark all tiers ≤ earned as fired (user "passed through" them).
        setSessionTiers((prev) => {
          const next = new Set(prev);
          for (const t of TIERS) if (nextStreak >= t.threshold) next.add(t.threshold);
          return next;
        });
        // Delay both the sound and the toast so EliminationReveal lands first.
        if (badgeTimer.current) clearTimeout(badgeTimer.current);
        badgeTimer.current = setTimeout(() => {
          sfx.playBadge();
          setAchievement({
            id: `${gameId}.${round}.${earnedTier!.threshold}`,
            emoji: earnedTier!.emoji,
            icon: earnedTier!.icon,
            label: earnedTier!.label,
            sub: `${earnedTier!.sub} · 连中 ×${nextStreak}`,
            color: earnedTier!.color,
            glow: earnedTier!.glow,
          });
        }, BADGE_DELAY_MS);
      } else if (nextStreak >= 2) {
        // Non-milestone hit still chimes — reinforces the "still on it" feeling.
        if (streakTimer.current) clearTimeout(streakTimer.current);
        streakTimer.current = setTimeout(() => {
          sfx.playStreak();
        }, STREAK_SFX_DELAY_MS);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voteResultTick]);

  const choose = (pid: string) => {
    // Disable changes during or after resolution — the result is locked.
    if (phase !== 'discussion' && phase !== 'voting') return;
    if (pid !== pick) sfx.playPick(); // tick only on actual change
    setPick(pid);
    try {
      localStorage.setItem(pickKey(gameId, round), pid);
    } catch {
      /* quota — swallow */
    }
  };

  // Only visible during the meeting→vote arc.
  const barVisible =
    phase === 'discussion' || phase === 'voting' || phase === 'vote_result';

  const alive = players.filter((p) => p.isAlive);
  const pickedPlayer = pick ? players.find((p) => p.id === pick) : null;
  const actualPlayer = lastEliminated
    ? players.find((p) => p.id === lastEliminated)
    : null;
  const accuracy =
    stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const isResolved =
    phase === 'vote_result' &&
    resolvedKey === `${gameId}.${round}.${voteResultTick}` &&
    voteResultTick > 0;
  const wasCorrect = pick !== null && lastEliminated === pick;

  return (
    <>
      <AnimatePresence>
        {barVisible && (
          <motion.div
            className="fixed bottom-4 left-4 z-40 rounded-2xl overflow-hidden"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            style={{
              background: 'rgba(15, 14, 46, 0.92)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(47, 184, 255, 0.22)',
              boxShadow: '0 0 24px rgba(47,184,255,0.1)',
              width: 280,
            }}
          >
            {/* Header — title + running accuracy */}
            <div
              className="px-3 py-2 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-1.5">
                <span>🎯</span>
                <span className="text-[11px] font-bold tracking-wide text-white/80">
                  押本轮谁被开
                </span>
              </div>
              <span className="text-[10px] text-white/45">
                {stats.total > 0
                  ? `${stats.correct}/${stats.total} · ${accuracy}%`
                  : '新手'}
              </span>
            </div>

            {/* Body — picker or resolution */}
            <AnimatePresence mode="wait" initial={false}>
              {isResolved ? (
                <motion.div
                  key="resolved"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="p-3 text-center"
                >
                  <motion.div
                    className="mb-0.5 flex justify-center"
                    animate={
                      wasCorrect ? { rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] } : {}
                    }
                    transition={{ duration: 0.5 }}
                  >
                    {wasCorrect
                      ? <Icon src={glyphIcons.predictionCorrect} emoji="🎯" size={36} />
                      : <Icon src={glyphIcons.predictionWrong} emoji="🙅" size={36} />}
                  </motion.div>
                  <div
                    className="text-sm font-black mb-1"
                    style={{ color: wasCorrect ? '#6ee7b7' : '#f87171' }}
                  >
                    {wasCorrect ? '精准预判!' : '走眼了'}
                  </div>
                  <div className="text-[11px] text-white/60 leading-snug">
                    你押{' '}
                    <span className="font-bold text-white/90">
                      {pickedPlayer?.name || '—'}
                    </span>
                    {' · '}
                    实际{' '}
                    <span className="font-bold text-white/90">
                      {actualPlayer?.name || '平票'}
                    </span>
                  </div>
                  {stats.streak > 1 && wasCorrect && (
                    <div
                      className="text-[10px] mt-1.5 font-bold inline-flex items-center justify-center gap-1"
                      style={{
                        color: '#fbbf24',
                        textShadow: '0 0 6px rgba(251,191,36,0.5)',
                      }}
                    >
                      <Icon src={glyphIcons.streakFire} emoji="🔥" size={12} />
                      连中 ×{stats.streak} · 纪录 ×{stats.bestStreak}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="picker"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="p-2"
                >
                  <div className="text-[10px] text-white/55 px-1 pb-1.5 leading-snug">
                    {pickedPlayer ? (
                      <>
                        已押{' '}
                        <span className="text-white font-bold">
                          {pickedPlayer.name}
                        </span>{' '}
                        · 点击可换
                      </>
                    ) : phase === 'discussion' ? (
                      '听发言,挑一个最可疑的'
                    ) : phase === 'voting' ? (
                      '正在投票,锁定判断'
                    ) : (
                      '等待本轮结果'
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {alive.map((p) => {
                      const isPick = p.id === pick;
                      const team =
                        p.team ??
                        (p.role?.endsWith('_dog')
                          ? 'dog'
                          : p.role?.endsWith('_cat')
                            ? 'cat'
                            : 'neutral');
                      const teamColor =
                        team === 'cat'
                          ? '#2fb8ff'
                          : team === 'dog'
                            ? '#ff4757'
                            : '#a855f7';
                      return (
                        <button
                          key={p.id}
                          onClick={() => choose(p.id)}
                          className="flex flex-col items-center px-1 py-1.5 rounded-lg transition hover:scale-[1.04] active:scale-95"
                          style={{
                            background: isPick
                              ? 'rgba(47,184,255,0.2)'
                              : 'rgba(255,255,255,0.035)',
                            border: isPick
                              ? '1px solid rgba(47,184,255,0.55)'
                              : '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <div
                            className="text-[10px] flex items-center justify-center"
                            style={{ color: teamColor, minHeight: 12 }}
                          >
                            {isPick
                              ? <Icon src={glyphIcons.predictionTarget} emoji="🎯" size={12} />
                              : '·'}
                          </div>
                          <div className="text-[10px] text-white/85 font-semibold truncate w-full text-center">
                            {p.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed-position achievement toast — z-[85] above EliminationReveal. */}
      <AchievementToast data={achievement} onDone={() => setAchievement(null)} />
    </>
  );
}
