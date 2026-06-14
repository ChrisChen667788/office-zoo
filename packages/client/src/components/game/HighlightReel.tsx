/**
 * HighlightReel — 终局战报 / post-game recap modal.
 *
 * ## Why this exists
 *
 * The existing `game_over` UX was a single-line event ("散伙饭! 打工人阵营 获胜!")
 * followed by either Immersive's win banner or — in Classic — no modal at all.
 * For a spectator game this is the *payoff moment*: the whole point of watching
 * 5-10 minutes of AI drama is the reveal. Competitive games (Among Us, Werewolf
 * Judge) linger here for 30-60s with animations, sound, stat callouts. We were
 * giving it zero airtime.
 *
 * ## Sections (scrollable, single card)
 *
 *  1. **Winner crest** — team emoji + gradient headline, sized to command attention
 *  2. **Round-by-round timeline** — every kill/vote with role reveal; the "oh so
 *     THAT'S who the CEO was" beat
 *  3. **Prediction scorecard** — this-game hit rate vs. all-time (if user engaged
 *     with PredictionBar); skipped if no picks were made
 *  4. **Role dossier grid** — all players with roles revealed, sorted
 *     alive→dead within each team
 *  5. **Actions** — 再来一局 / 返回大厅
 *
 * ## Data sources
 *
 * Reads from gameStore slices: `players`, `winner`, `round`, `eliminationLog`,
 * `predictionLog`. These are populated by Classic/Immersive handlers as the
 * game unfolds, so the reel is a pure presentation layer — no socket coupling.
 *
 * ## Trigger
 *
 * Mounts whenever `phase === 'game_over'` AND `winner` is a real team (not
 * 'none'). The `visible` state starts true so the modal appears immediately
 * when rendered. User can dismiss with a button or by clicking the backdrop.
 */
import { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  useEliminationLog,
  usePlayers,
  usePredictionLog,
  useRound,
  useWinner,
  usePhase,
  useGameActions,
  useGameId,
  useMarket,
  useDualMode,
} from '../../stores/gameStore';
import { ROLE_LABELS, teamForRole, TEAM_LABELS } from '../../constants/roles';
import { sfx } from '../../utils/sfx';
import {
  copyShareCardToClipboard,
  downloadShareCard,
  type ShareCardData,
} from '../../utils/shareCard';
// v6.87 — 双公司「公司战报」分享卡
import { copyCompanyBattleCard, downloadCompanyBattleCard } from '../../utils/companyBattleCard';
import type { BattleCardInput } from '@furball/shared';
import LottieAsset from '../LottieAsset';
import { lottie } from '../../constants/lottie';
import { teamIcons, glyphIcons, Icon, expressionIcon } from '../../constants/icons';
import ShareVideoButton from './ShareVideoButton';

interface WinnerConfig {
  emoji: string;
  /** AI-generated team crest art URL used in the DOM. Share-card canvas still
   *  uses `emoji` so the exported PNG is self-contained. */
  icon: string;
  label: string;
  color: string;
  /** CSS gradient string — used for JSX backgrounds. */
  gradient: string;
  /** Two-hex-stop tuple — used by the canvas share-card generator. */
  gradientStops: [string, string];
  sub: string;
  /** Optional Lottie to play on the crest; falls back to emoji if omitted
      or if the asset fails to load. Share card still uses emoji so the
      social-ready image doesn't depend on runtime asset availability. */
  lottie?: string;
  /** If true, overlay a one-shot confetti Lottie behind the reel crest. */
  celebratory?: boolean;
}

const WINNER_CONFIG: Record<string, WinnerConfig> = {
  cat_win: {
    emoji: '👨‍💻',
    icon: teamIcons.cat,
    label: '打工人胜利',
    color: '#2fb8ff',
    gradient: 'linear-gradient(135deg, #2fb8ff, #a855f7)',
    gradientStops: ['#2fb8ff', '#a855f7'],
    sub: '资本家出局,加班少了一点点',
    lottie: lottie.trophy,
    celebratory: true,
  },
  dog_win: {
    emoji: '👔',
    icon: teamIcons.dog,
    label: '资本家胜利',
    color: '#ff4757',
    gradient: 'linear-gradient(135deg, #ff4757, #f97316)',
    gradientStops: ['#ff4757', '#f97316'],
    sub: '公司成功完成架构调整',
  },
  neutral_win: {
    emoji: '😎',
    icon: teamIcons.neutral,
    label: '摸鱼党胜利',
    color: '#a855f7',
    gradient: 'linear-gradient(135deg, #a855f7, #ec4899)',
    gradientStops: ['#a855f7', '#ec4899'],
    sub: '卷?不卷!全员下班摸鱼',
    lottie: lottie.success,
    celebratory: true,
  },
  // v6.86 — 双公司对抗终局。两司皆为打工人公司,用蓝/橙区分阵营(同 GameMap
  // 对撞条配色)。没有 COMPANY_*_WIN 时双司局会黑屏,务必保留。
  company_a_win: {
    emoji: '🅰',
    icon: teamIcons.cat,
    label: 'A 司笑到最后',
    color: '#4c9eff',
    gradient: 'linear-gradient(135deg, #4c9eff, #2563eb)',
    gradientStops: ['#4c9eff', '#2563eb'],
    sub: '抢下市场、防住内鬼,B 司连夜搬空工位',
    lottie: lottie.trophy,
    celebratory: true,
  },
  company_b_win: {
    emoji: '🅱',
    icon: teamIcons.cat,
    label: 'B 司笑到最后',
    color: '#ff8a3d',
    gradient: 'linear-gradient(135deg, #ff8a3d, #f97316)',
    gradientStops: ['#ff8a3d', '#f97316'],
    sub: '抢下市场、防住内鬼,A 司连夜搬空工位',
    lottie: lottie.trophy,
    celebratory: true,
  },
};

const TEAM_COLOR: Record<'cat' | 'dog' | 'neutral', string> = {
  cat: '#2fb8ff',
  dog: '#ff4757',
  neutral: '#a855f7',
};

// Some servers emit `'cat'`/`'dog'` as the winner; others emit
// `'cat_win'`/`'dog_win'`. Normalize both into the config keys above so the
// reel works against either contract.
function normalizeWinner(w: string): string {
  if (w === 'cat' || w === 'cat_win') return 'cat_win';
  if (w === 'dog' || w === 'dog_win') return 'dog_win';
  if (w === 'neutral' || w === 'neutral_win') return 'neutral_win';
  // v6.86 — 双公司终局键(server 直接发 WinCondition,这里容忍简写)
  if (w === 'company_a' || w === 'company_a_win') return 'company_a_win';
  if (w === 'company_b' || w === 'company_b_win') return 'company_b_win';
  return w;
}

function makeFileName(d: ShareCardData): string {
  return `office-zoo-${d.winner}-${d.date.replace(/-/g, '')}.png`;
}

export default function HighlightReel() {
  const phase = usePhase();
  const players = usePlayers();
  const round = useRound();
  const winner = useWinner();
  const gameId = useGameId();
  const market = useMarket();      // v6.86 — 双公司终局市占率(单公司 undefined)
  const isDual = useDualMode();
  const eliminationLog = useEliminationLog();
  const predictionLog = usePredictionLog();
  const { reset } = useGameActions();
  const navigate = useNavigate();

  const [dismissed, setDismissed] = useState(false);
  /**
   * Share-card action status. `idle` is resting; `working` disables the
   * buttons while the canvas paints; `copied` / `downloaded` flash a
   * confirmation label for 1.6s; `unsupported` triggers download fallback.
   */
  const [shareStatus, setShareStatus] = useState<
    'idle' | 'working' | 'copied' | 'downloaded' | 'error'
  >('idle');

  const winnerKey = normalizeWinner(winner);
  const winCfg = WINNER_CONFIG[winnerKey];

  // Derived stats — memoized because this re-computes on every player/log diff
  // otherwise (and these are O(n) over log length).
  const stats = useMemo(() => {
    const total = predictionLog.length;
    const hits = predictionLog.filter((p) => p.correct).length;
    const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0;
    // Longest in-game streak — resets on miss.
    let longest = 0;
    let cur = 0;
    for (const p of predictionLog) {
      if (p.correct) {
        cur += 1;
        longest = Math.max(longest, cur);
      } else {
        cur = 0;
      }
    }
    return { total, hits, accuracy, longest };
  }, [predictionLog]);

  // Sort: alive first, then by team, then by name — keeps the "heroes"
  // (surviving workers vs. surviving CEOs) clustered for the reveal.
  const rankedPlayers = useMemo(() => {
    const rank = (t: string) => (t === 'cat' ? 0 : t === 'dog' ? 1 : 2);
    return [...players].sort((a, b) => {
      if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
      const ta = a.team ?? teamForRole(a.role);
      const tb = b.team ?? teamForRole(b.role);
      if (ta !== tb) return rank(ta) - rank(tb);
      return a.name.localeCompare(b.name);
    });
  }, [players]);

  const goLobby = () => {
    reset();
    navigate('/');
  };

  // Build the canvas share-card payload. Memoized so we don't re-allocate
  // the large player/timeline arrays when only shareStatus flips.
  const shareData = useMemo<ShareCardData | null>(() => {
    if (!winCfg) return null;
    const date = new Date().toISOString().slice(0, 10);
    return {
      winner: winnerKey,
      winnerLabel: winCfg.label,
      winnerEmoji: winCfg.emoji,
      winnerColor: winCfg.color,
      winnerGradient: winCfg.gradientStops,
      winnerSub: winCfg.sub,
      round,
      totalElim: eliminationLog.length,
      timeline: eliminationLog.map((e) => {
        const team = (e.team ?? 'neutral') as 'cat' | 'dog' | 'neutral';
        return {
          round: e.round,
          type: e.type,
          name: e.playerName,
          roleLabel: e.role ? ROLE_LABELS[e.role] || e.role : '—',
          teamColor: TEAM_COLOR[team],
          location: e.location,
        };
      }),
      prediction:
        stats.total > 0
          ? {
              hits: stats.hits,
              total: stats.total,
              accuracy: stats.accuracy,
              longest: stats.longest,
            }
          : undefined,
      players: rankedPlayers.map((p) => {
        const team = (p.team ?? teamForRole(p.role)) as
          | 'cat'
          | 'dog'
          | 'neutral';
        return {
          name: p.name,
          roleLabel: p.role ? ROLE_LABELS[p.role] || p.role : '—',
          isAlive: p.isAlive,
          teamColor: TEAM_COLOR[team],
          teamLabel: TEAM_LABELS[team],
        };
      }),
      date,
    };
  }, [winnerKey, winCfg, round, eliminationLog, stats, rankedPlayers]);

  const flashShare = (s: 'copied' | 'downloaded' | 'error') => {
    setShareStatus(s);
    setTimeout(() => setShareStatus('idle'), 1800);
  };

  const handleCopy = async () => {
    if (!shareData || shareStatus === 'working') return;
    setShareStatus('working');
    const ok = await copyShareCardToClipboard(shareData);
    if (ok) return flashShare('copied');
    // Clipboard write unsupported (older Safari/Firefox) — fall back to
    // download so the user isn't left with a dead button.
    try {
      await downloadShareCard(shareData, makeFileName(shareData));
      flashShare('downloaded');
    } catch {
      flashShare('error');
    }
  };

  const handleDownload = async () => {
    if (!shareData || shareStatus === 'working') return;
    setShareStatus('working');
    try {
      await downloadShareCard(shareData, makeFileName(shareData));
      flashShare('downloaded');
    } catch {
      flashShare('error');
    }
  };

  // v6.87 — 公司战报卡:从 store 现取数据(players 带 companyId / market / winner)。
  const battleInput = useMemo<BattleCardInput | null>(() => {
    if (!isDual || !market) return null;
    const winCompany: 'a' | 'b' | null =
      winnerKey === 'company_a_win' ? 'a' : winnerKey === 'company_b_win' ? 'b' : null;
    if (!winCompany) return null;
    return {
      winner: winCompany,
      market,
      round,
      date: new Date().toISOString().slice(0, 10),
      players: players
        .filter((p) => p.companyId === 'a' || p.companyId === 'b')
        .map((p) => ({
          companyId: p.companyId as 'a' | 'b',
          name: p.name,
          isAlive: p.isAlive,
          roleLabel: p.role ? ROLE_LABELS[p.role] : undefined,
          tasksCompleted: p.tasksCompleted,
        })),
    };
  }, [isDual, market, winnerKey, round, players]);

  const [battleMsg, setBattleMsg] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const handleBattleCard = async () => {
    if (!battleInput || battleMsg === 'working') return;
    setBattleMsg('working');
    try {
      const copied = await copyCompanyBattleCard(battleInput);
      if (!copied) await downloadCompanyBattleCard(battleInput);
      setBattleMsg('done');
    } catch {
      try { await downloadCompanyBattleCard(battleInput); setBattleMsg('done'); }
      catch { setBattleMsg('error'); }
    }
    setTimeout(() => setBattleMsg('idle'), 2600);
  };

  const shouldShow =
    !dismissed && phase === 'game_over' && !!winner && winner !== 'none' && !!winCfg;

  // Fire a one-shot fanfare when the reel first appears for a given game.
  // Key = phase+winner so a new round with a different winner re-triggers,
  // but dismissing and re-opening the same reel does not duplicate.
  const fanfareFiredRef = useRef<string>('');
  useEffect(() => {
    if (phase !== 'game_over' || !winner || winner === 'none') {
      fanfareFiredRef.current = '';
      return;
    }
    const key = `${phase}-${winner}`;
    if (fanfareFiredRef.current === key) return;
    fanfareFiredRef.current = key;
    if (winnerKey === 'dog_win') sfx.playLose();
    else sfx.playWin();
  }, [phase, winner, winnerKey]);

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            background: 'rgba(4, 4, 20, 0.78)',
            backdropFilter: 'blur(14px)',
          }}
          onClick={() => setDismissed(true)}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 200 }}
            className="relative rounded-3xl overflow-hidden"
            style={{
              background: 'rgba(15, 14, 46, 0.96)',
              backdropFilter: 'blur(30px)',
              border: `1px solid ${winCfg.color}44`,
              boxShadow: `0 0 80px ${winCfg.color}40, 0 20px 80px rgba(0,0,0,0.6)`,
              width: 'min(720px, 96vw)',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Ambient glow bleeding through the top edge */}
            <div
              className="absolute top-0 left-0 right-0 h-44 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse at 50% 0%, ${winCfg.color}33 0%, transparent 70%)`,
              }}
            />

            {/* ── Section 1: Winner crest ────────────────────────────── */}
            <div className="relative px-8 pt-8 pb-5 text-center">
              {/* Confetti rain behind the crest on celebratory endings.
                  Positioned as an absolute overlay so it doesn't push the
                  emoji/lottie layout around. */}
              {winCfg.celebratory && (
                <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
                  <LottieAsset
                    src={lottie.confetti}
                    width="100%"
                    height="100%"
                    loop={false}
                    style={{ mixBlendMode: 'screen', opacity: 0.9 }}
                  />
                </div>
              )}
              {winCfg.lottie ? (
                <motion.div
                  className="relative mx-auto mb-2"
                  style={{ width: 140, height: 140, filter: `drop-shadow(0 0 24px ${winCfg.color}aa)` }}
                  initial={{ scale: 0.4, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 10, stiffness: 180, delay: 0.1 }}
                >
                  <LottieAsset
                    src={winCfg.lottie}
                    size={140}
                    loop
                    fallback={<div className="text-7xl leading-[140px]">{winCfg.emoji}</div>}
                  />
                </motion.div>
              ) : (
                <motion.div
                  className="mb-2 relative flex justify-center"
                  initial={{ scale: 0.4, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 10, stiffness: 180, delay: 0.1 }}
                  style={{ filter: `drop-shadow(0 0 24px ${winCfg.color}aa)` }}
                >
                  <Icon src={winCfg.icon} emoji={winCfg.emoji} size={112} />
                </motion.div>
              )}
              <motion.h2
                className="text-4xl font-black mb-1.5"
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                style={{
                  background: winCfg.gradient,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '0.02em',
                }}
              >
                {winCfg.label}
              </motion.h2>
              <div className="text-xs text-white/45 tracking-wide mb-2">{winCfg.sub}</div>
              {/* v6.86 — 双公司终局市占率对比 */}
              {isDual && market && (
                <div className="flex items-center justify-center gap-3 mb-2 text-xs font-semibold">
                  <span style={{ color: '#4c9eff' }}>🅰 {market.a}%</span>
                  <span className="text-white/25">市占</span>
                  <span style={{ color: '#ff8a3d' }}>🅱 {market.b}%</span>
                </div>
              )}
              <div className="text-[11px] text-white/35 tracking-[0.15em] uppercase">
                历时 {round} 轮 · {eliminationLog.length} 次出局
              </div>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto px-6 pb-4" style={{ scrollbarWidth: 'thin' }}>
              {/* ── Section 2: Timeline ──────────────────────────────── */}
              {eliminationLog.length > 0 && (
                <section className="mb-4">
                  <SectionHeader icon="📜" iconSrc={glyphIcons.timelineRecap} title="复盘" subtitle="这一局谁先下岗" />
                  <div
                    className="rounded-xl px-3 py-2.5 space-y-1.5"
                    style={{
                      background: 'rgba(255,255,255,0.025)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    {eliminationLog.map((e, i) => {
                      const teamColor = e.team ? TEAM_COLOR[e.team] : '#888';
                      const roleText = e.role
                        ? ROLE_LABELS[e.role] || e.role
                        : '—';
                      const teamText = e.team ? TEAM_LABELS[e.team] : '';
                      return (
                        <motion.div
                          key={e.id}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + i * 0.06 }}
                          className="flex items-center gap-2.5 text-[13px]"
                        >
                          <span
                            className="text-[10px] font-bold tracking-wider w-10 text-center py-0.5 rounded-md"
                            style={{
                              color: 'rgba(255,255,255,0.5)',
                              background: 'rgba(255,255,255,0.04)',
                            }}
                          >
                            R{e.round || '?'}
                          </span>
                          <span className="inline-flex items-center">
                            {e.type === 'kill'
                              ? <Icon src={glyphIcons.timelineKill} emoji="🔪" size={18} />
                              : <Icon src={glyphIcons.timelineVote} emoji="🗳️" size={18} />}
                          </span>
                          {/* v6.70 — 被优化角色表情立绘(惊恐/委屈),复盘里也认得出谁 */}
                          <Icon
                            src={expressionIcon(e.type, e.playerName)}
                            emoji={e.type === 'kill' ? '😵' : '😭'}
                            size={26}
                            alt=""
                            style={{ borderRadius: '30%', objectFit: 'cover', border: `1px solid ${teamColor}55`, flexShrink: 0 }}
                          />
                          {/* v6.41 P2 — 公司主题包 emoji avatar badge, shown
                              before the name so a custom-pack rat is
                              recognizable in the recap. */}
                          {e.avatar && (
                            <span
                              className="inline-grid place-items-center rounded-full text-[13px]"
                              style={{
                                width: 22, height: 22,
                                background: 'rgba(15,14,46,0.9)',
                                border: `1px solid ${teamColor}66`,
                              }}
                            >{e.avatar}</span>
                          )}
                          <span className="font-bold text-white/90">{e.playerName}</span>
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{
                              color: teamColor,
                              background: `${teamColor}18`,
                              border: `1px solid ${teamColor}44`,
                            }}
                          >
                            {roleText}
                          </span>
                          <span className="text-[11px] text-white/45 ml-auto">
                            {e.type === 'kill'
                              ? `在 ${e.location || '某处'} 被优化`
                              : `被全员投票开除 · ${teamText}`}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── Section 3: Prediction scorecard ──────────────────── */}
              {stats.total > 0 && (
                <section className="mb-4">
                  <SectionHeader icon="🎯" iconSrc={glyphIcons.predictionTarget} title="你的预测" subtitle="本局观众席战绩" />
                  <div className="grid grid-cols-3 gap-2">
                    <StatCard label="命中率" value={`${stats.accuracy}%`} accent="#6ee7b7" />
                    <StatCard
                      label="命中 / 参与"
                      value={`${stats.hits} / ${stats.total}`}
                      accent="#fbbf24"
                    />
                    <StatCard
                      label="最长连中"
                      value={`×${stats.longest}`}
                      accent={stats.longest >= 3 ? '#f97316' : '#a855f7'}
                    />
                  </div>
                  {/* Per-round hit/miss ribbon */}
                  <div className="flex gap-1 mt-2 justify-center">
                    {predictionLog.map((p, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.5 + i * 0.05 }}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-[13px]"
                        style={{
                          background: p.correct
                            ? 'rgba(110,231,183,0.15)'
                            : 'rgba(248,113,113,0.12)',
                          border: `1px solid ${
                            p.correct ? 'rgba(110,231,183,0.45)' : 'rgba(248,113,113,0.35)'
                          }`,
                        }}
                        title={`R${p.round}: 押 ${p.pickName} · 实际 ${p.actualName || '平票'}`}
                      >
                        {p.correct ? '✓' : '✗'}
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Section 4: Role dossier ──────────────────────────── */}
              <section className="mb-4">
                <SectionHeader icon="🎭" iconSrc={glyphIcons.dossierMask} title="阵营揭晓" subtitle="谁演得最好" />
                <div className="grid grid-cols-2 gap-2">
                  {rankedPlayers.map((p, i) => {
                    const team = (p.team ?? teamForRole(p.role)) as 'cat' | 'dog' | 'neutral';
                    const color = TEAM_COLOR[team];
                    const roleLabel = p.role ? ROLE_LABELS[p.role] || p.role : '—';
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 + i * 0.04 }}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
                        style={{
                          background: p.isAlive
                            ? `${color}10`
                            : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${p.isAlive ? color + '33' : 'rgba(255,255,255,0.06)'}`,
                          opacity: p.isAlive ? 1 : 0.55,
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black flex-shrink-0"
                          style={{
                            background: `${color}22`,
                            border: `1px solid ${color}66`,
                            color,
                          }}
                        >
                          {p.isAlive ? '✓' : '✕'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-bold text-white/95 truncate">
                            {p.name}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="font-semibold" style={{ color }}>
                              {roleLabel}
                            </span>
                            <span className="text-white/25">·</span>
                            <span className="text-white/45">{TEAM_LABELS[team]}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* ── Footer actions ──────────────────────────────────── */}
            <div
              className="px-6 py-4 flex gap-2 items-center justify-between flex-wrap"
              style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.25)',
              }}
            >
              {/* Share cluster — viral video first (the big lever), share
                  card second (legacy), download last */}
              <div className="flex gap-2 flex-wrap">
                <ShareVideoButton />
                <button
                  onClick={handleCopy}
                  disabled={shareStatus === 'working' || !shareData}
                  className="px-4 py-2 rounded-xl text-[12px] font-bold transition hover:brightness-125 active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                  style={{
                    color:
                      shareStatus === 'copied' || shareStatus === 'downloaded'
                        ? '#6ee7b7'
                        : shareStatus === 'error'
                          ? '#f87171'
                          : 'rgba(255,255,255,0.85)',
                    background:
                      shareStatus === 'copied' || shareStatus === 'downloaded'
                        ? 'rgba(110,231,183,0.12)'
                        : shareStatus === 'error'
                          ? 'rgba(248,113,113,0.12)'
                          : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${
                      shareStatus === 'copied' || shareStatus === 'downloaded'
                        ? 'rgba(110,231,183,0.35)'
                        : shareStatus === 'error'
                          ? 'rgba(248,113,113,0.35)'
                          : 'rgba(255,255,255,0.1)'
                    }`,
                  }}
                >
                  {shareStatus === 'working'
                    ? '渲染中…'
                    : shareStatus === 'copied'
                      ? '✅ 已复制到剪贴板'
                      : shareStatus === 'downloaded'
                        ? '✅ 已保存到本地'
                        : shareStatus === 'error'
                          ? '失败,再试一次'
                          : '📋 复制战报图'}
                </button>
                <button
                  onClick={handleDownload}
                  disabled={shareStatus === 'working' || !shareData}
                  className="px-3 py-2 rounded-xl text-[12px] font-bold transition hover:brightness-125 active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                  style={{
                    color: 'rgba(255,255,255,0.7)',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  title="下载为 PNG"
                >
                  💾
                </button>
                {/* v6.87 — 双公司局专属:公司战报卡(两司战报对比图) */}
                {battleInput && (
                  <button
                    onClick={handleBattleCard}
                    disabled={battleMsg === 'working'}
                    className="px-4 py-2 rounded-xl text-[12px] font-bold transition hover:brightness-125 active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                    style={{
                      color: battleMsg === 'done' ? '#6ee7b7' : battleMsg === 'error' ? '#f87171' : '#fff',
                      background: 'linear-gradient(135deg, rgba(76,158,255,0.18), rgba(255,138,61,0.18))',
                      border: '1px solid rgba(255,255,255,0.18)',
                    }}
                    title="生成双公司战报图"
                  >
                    {battleMsg === 'working' ? '渲染中…'
                      : battleMsg === 'done' ? '✅ 战报已出'
                        : battleMsg === 'error' ? '失败,再试' : '🏢 公司战报'}
                  </button>
                )}
              </div>

              {/* Primary action cluster */}
              <div className="flex gap-2">
                <button
                  onClick={() => setDismissed(true)}
                  className="px-4 py-2 rounded-xl text-[12px] font-bold transition hover:brightness-125 active:scale-95"
                  style={{
                    color: 'rgba(255,255,255,0.7)',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  继续围观
                </button>
                {/* v6.54 — jump to the full event-timeline replay (deep-linkable). */}
                <button
                  onClick={() => gameId && navigate(`/result/${gameId}`)}
                  disabled={!gameId}
                  className="px-4 py-2 rounded-xl text-[12px] font-bold transition hover:brightness-125 active:scale-95 disabled:opacity-40"
                  style={{
                    color: 'rgba(255,255,255,0.88)',
                    background: 'rgba(124,58,237,0.18)',
                    border: '1px solid rgba(124,58,237,0.4)',
                  }}
                >
                  🎬 看完整回放
                </button>
                <button
                  onClick={goLobby}
                  className="px-5 py-2 rounded-xl text-[12px] font-black transition hover:brightness-115 active:scale-95"
                  style={{
                    color: '#fff',
                    background: winCfg.gradient,
                    boxShadow: `0 0 20px ${winCfg.color}55`,
                  }}
                >
                  再来一局 →
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Small presentational helpers — kept inline to avoid file sprawl ── */

function SectionHeader({
  icon,
  iconSrc,
  title,
  subtitle,
}: {
  /** Emoji fallback displayed if no `iconSrc` is given or the image 404s. */
  icon: string;
  /** AI-generated icon URL. When present, rendered via <Icon> with emoji fallback. */
  iconSrc?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2 px-1">
      {iconSrc
        ? <Icon src={iconSrc} emoji={icon} size={18} />
        : <span className="text-base">{icon}</span>}
      <span className="text-[13px] font-black text-white/90 tracking-wide">{title}</span>
      <span className="text-[10px] text-white/35">{subtitle}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 text-center"
      style={{
        background: `${accent}10`,
        border: `1px solid ${accent}33`,
      }}
    >
      <div
        className="text-xl font-black leading-tight"
        style={{ color: accent, textShadow: `0 0 10px ${accent}55` }}
      >
        {value}
      </div>
      <div className="text-[10px] text-white/50 tracking-wide mt-0.5">{label}</div>
    </div>
  );
}
