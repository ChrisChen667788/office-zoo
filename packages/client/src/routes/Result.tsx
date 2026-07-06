/**
 * Result — compact end-of-game screen.
 *
 * Mostly superseded by HighlightReel's in-game overlay, but the /result/:gameId
 * route is kept as a deep-linkable fallback (e.g. replay button, shared URL).
 * Styling matches the rest of the redesigned chrome so nobody hits it and
 * thinks they've landed on the old build.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { groupTimelineByRound, digestReplay, bondTier, type ReplayRecord, type ReplayPlayer, type RelationEdge } from '@furball/shared';
import { usePlayers, useWinner, useRound, useGameActions } from '../stores/gameStore';
import { colors, mihoyo } from '../constants/design';
import { lottie } from '../constants/lottie';
import LottieAsset from '../components/LottieAsset';
import PersonaCard from '../components/character/PersonaCard';

const TEAM_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  cat:     { label: '打工人阵营', emoji: '👨‍💻', color: colors.team.cat },
  dog:     { label: '资本家阵营', emoji: '👔', color: colors.team.dog },
  neutral: { label: '摸鱼阵营',  emoji: '😎', color: colors.team.neutral },
};

// v6.16 P2 — promoted to shared. Note: Result used `#ff3355` for
// contrarian, all other files use `#FF4444`. Shared dict picks the
// majority value; the slight magenta tilt in Result intentionally
// dropped for brand consistency.
import { PERSONALITY_LABELS_LITE as PERSONALITY_LABELS } from '../constants/personalityLabels';

type WinLabel = {
  title: string;
  subtitle: string;
  emoji: string;
  accent: string;
  /** Optional Lottie to play above the emoji fallback; omit for neutral/loss screens. */
  lottie?: string;
  /** Show a confetti overlay — reserved for celebratory endings. */
  celebratory?: boolean;
};

const WIN_LABELS: Record<string, WinLabel> = {
  cat_win:     { title: '打工人阵营胜利', subtitle: '打工人终于赶走了资本家', emoji: '🎉', accent: colors.brand.neon,     lottie: lottie.trophy, celebratory: true },
  dog_win:     { title: '资本家阵营胜利', subtitle: '全员被优化,公司完蛋了', emoji: '💀', accent: colors.semantic.danger },
  neutral_win: { title: '摸鱼阵营胜利',   subtitle: '摸鱼才是最终赢家',       emoji: '😎', accent: colors.team.neutral,  lottie: lottie.success, celebratory: true },
  none:        { title: '散伙饭',         subtitle: '公司倒闭,没有赢家',     emoji: '🤷', accent: colors.semantic.warn },
  // v6.88 — 双公司回放(没有这两条,双司局回放会错标成「散伙饭」)。
  company_a_win: { title: '🅰 A 司笑到最后', subtitle: '抢下市场 / 防住内鬼,B 司搬空工位', emoji: '🅰', accent: '#4c9eff', lottie: lottie.trophy, celebratory: true },
  company_b_win: { title: '🅱 B 司笑到最后', subtitle: '抢下市场 / 防住内鬼,A 司搬空工位', emoji: '🅱', accent: '#ff8a3d', lottie: lottie.trophy, celebratory: true },
};

const DUAL_REASON_CN: Record<string, string> = {
  monopoly: '市场垄断', wipeout: '对家团灭', insiders_down: '双内鬼皆裁 · 比市占', round_cap: '回合耗尽 · 市占定胜',
};

// v6.54 — timeline event-type → icon for the 🎬 replay log.
const EVENT_ICON: Record<string, string> = {
  kill: '🔪', vote_out: '🗳️', vote_skip: '🤷', protect: '🛡️',
  intercept: '⚖️', role_action: '🔍', body_found: '🚨',
  ghost_vote: '👻', game_over: '🏆', leak_acked: '📣',
};

export default function Result() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const livePlayers = usePlayers();
  const liveWinner = useWinner();
  const liveRound = useRound();
  const { reset } = useGameActions();

  // v6.54 — load the persisted replay so /result/:gameId works on deep-link /
  // refresh (the live store is empty then) AND so we can show the full event
  // timeline the store never kept. The live store is the instant fallback.
  const [replay, setReplay] = useState<ReplayRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const [relEdges, setRelEdges] = useState<RelationEdge[]>([]);
  useEffect(() => {
    if (!gameId) return;
    let on = true;
    fetch(`/api/replay/${encodeURIComponent(gameId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((rec: ReplayRecord) => { if (on) setReplay(rec); })
      .catch(() => { /* evicted / not yet saved — live store carries it */ });
    return () => { on = false; };
  }, [gameId]);

  // v6.75 ② — 本局恩怨录:拉跨局关系网,赛后只亮「在场这几只」之间的恩怨。
  useEffect(() => {
    let on = true;
    fetch('/api/relations?minAbs=25')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('relations'))))
      .then((d) => { if (on) setRelEdges(Array.isArray(d?.edges) ? d.edges : []); })
      .catch(() => { /* 关系网锦上添花,拉不到就不显示 */ });
    return () => { on = false; };
  }, []);

  const players: ReplayPlayer[] = replay?.players ?? (livePlayers as ReplayPlayer[]);
  const winner = replay?.winner ?? liveWinner;
  const round = replay?.rounds ?? liveRound;
  const timeline = replay?.timeline ?? [];
  const rounds = groupTimelineByRound(timeline);

  const shareReplay = () => {
    if (!gameId) return;
    const url = `${window.location.origin}/result/${gameId}`;
    // v6.75 ② — 把本局头牌恩怨捎进分享文案(没有就只发链接)。
    const top = castGrudges[0];
    const grudge = top
      ? `「办公室恩怨录」${nameOfArch(top.holderId)}${bondTier(top.score).emoji}${nameOfArch(top.aboutId)}(${bondTier(top.score).label}) · `
      : '';
    const text = `${grudge}OFFICE ZOO 战绩回放 ${url}`;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const winInfo = WIN_LABELS[winner] || WIN_LABELS.none;
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.team === b.team) return a.isAlive === b.isAlive ? 0 : a.isAlive ? -1 : 1;
    const order = ['cat', 'dog', 'neutral'];
    return order.indexOf(a.team || '') - order.indexOf(b.team || '');
  });

  // 只保留「本局在场两只鼠之间」的恩怨边(API 已按 |score| 降序),取前 3 条上榜。
  const castArch = new Set(players.map((p) => p.personality).filter(Boolean) as string[]);
  const nameOfArch = (arch: string) => players.find((p) => p.personality === arch)?.name ?? arch;
  const castGrudges = relEdges
    .filter((e) => castArch.has(e.holderId) && castArch.has(e.aboutId))
    .slice(0, 3);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-8 noise" style={{ background: mihoyo.mesh.heroDawn }}>
      {/* Aurora background — tinted by winner accent so the scene reads at a glance. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aurora" style={{
          top: '-25%', left: '-10%', width: '60vmax', height: '60vmax',
          ['--c' as never]: `${winInfo.accent}55`, opacity: 0.42,
        }} />
        <div className="aurora" style={{
          bottom: '-25%', right: '-10%', width: '55vmax', height: '55vmax',
          ['--c' as never]: 'rgba(124,58,237,0.24)', opacity: 0.35,
        }} />
        <div className="absolute inset-0 grid-dots" style={{ opacity: 0.5, maskImage: 'linear-gradient(180deg, black 20%, transparent 100%)' }} />
      </div>

      {/* Confetti overlay — only on celebratory wins, sits above aurora but below content. */}
      {winInfo.celebratory && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 flex items-start justify-center overflow-hidden">
          <LottieAsset
            src={lottie.confetti}
            width="min(1200px, 140vw)"
            height="min(900px, 100vh)"
            loop={false}
            style={{ mixBlendMode: 'screen', opacity: 0.85 }}
          />
        </div>
      )}

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 text-center mb-10"
      >
        {winInfo.lottie ? (
          <div
            className="mx-auto mb-2"
            style={{ width: 200, height: 200, filter: `drop-shadow(0 0 40px ${winInfo.accent}66)` }}
          >
            <LottieAsset
              src={winInfo.lottie}
              size={200}
              loop
              fallback={<div className="text-6xl leading-[200px]">{winInfo.emoji}</div>}
            />
          </div>
        ) : (
          <div className="text-6xl mb-4" style={{ filter: `drop-shadow(0 0 24px ${winInfo.accent}55)` }}>
            {winInfo.emoji}
          </div>
        )}
        <h1 className="text-4xl md:text-5xl font-black tracking-[-0.02em] text-white mb-2">
          {winInfo.title}
        </h1>
        <p className="text-white/55 text-base mb-2">{winInfo.subtitle}</p>
        {/* v6.88 — 双公司回放:终局市占率拔河条 + 缘由 + 跳槽次数 */}
        {replay?.mode === 'dual' && replay.market && (
          <div className="mx-auto mb-3 max-w-md">
            <div className="flex items-center gap-2 text-sm font-bold mb-1.5">
              <span style={{ color: '#4c9eff' }}>🅰 {replay.market.a}%</span>
              <div className="flex-1 h-3 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ width: `${replay.market.a + replay.market.b > 0 ? (replay.market.a / (replay.market.a + replay.market.b)) * 100 : 50}%`, background: '#4c9eff' }} />
                <div style={{ flex: 1, background: '#ff8a3d' }} />
              </div>
              <span style={{ color: '#ff8a3d' }}>🅱 {replay.market.b}%</span>
            </div>
            <p className="text-white/40 text-xs">
              🏆 {replay.dualReason ? DUAL_REASON_CN[replay.dualReason] ?? '' : ''}
              {(() => { const n = digestReplay(timeline).defections; return n > 0 ? ` · 🤝 ${n} 次跳槽` : ''; })()}
            </p>
          </div>
        )}
        <p className="text-white/35 text-xs tracking-[0.2em] uppercase">共经历 {round} 个工作日</p>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl w-full mb-10"
      >
        {sortedPlayers.map((player, i) => {
          const teamInfo = TEAM_LABELS[player.team || 'neutral'] || TEAM_LABELS.neutral;
          return (
            <motion.div
              key={player.id}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05 * i }}
              className="rounded-2xl p-4 text-center"
              style={{
                background: player.isAlive ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)',
                border: `1px solid ${player.isAlive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
                opacity: player.isAlive ? 1 : 0.6,
                boxShadow: `inset 3px 0 0 ${teamInfo.color}`,
              }}
            >
              <div className="text-2xl mb-1">{teamInfo.emoji}</div>
              {/* v6.13 — wrap name in PersonaCard so post-game player can
                   click any rat to see full IP + 反差 + 战绩 + share. The
                   战后回看 moment is the natural peak for IP exploration. */}
              <PersonaCard playerName={player.name} personality={player.personality}>
                <div className="text-white font-bold text-sm tracking-tight inline-block"
                  style={{ borderBottom: '1px dashed rgba(255,215,0,0.4)' }}>
                  {player.name}
                </div>
              </PersonaCard>
              {player.personality && PERSONALITY_LABELS[player.personality] && (
                <div className="mt-1.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      color: PERSONALITY_LABELS[player.personality].color,
                      background: `${PERSONALITY_LABELS[player.personality].color}18`,
                      border: `1px solid ${PERSONALITY_LABELS[player.personality].color}35`,
                    }}>
                    {PERSONALITY_LABELS[player.personality].emoji} {PERSONALITY_LABELS[player.personality].label}
                  </span>
                </div>
              )}
              <div className="text-[11px] mt-1.5" style={{ color: teamInfo.color }}>
                {player.role || '未知'} · {teamInfo.label}
              </div>
              <div className="text-[11px] mt-1 tracking-wide" style={{ color: player.isAlive ? colors.semantic.success : colors.semantic.danger }}>
                {player.isAlive ? '在职' : '已离职'}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* v6.75 ② — 本局恩怨录:跨局记仇/记恩,只亮在场两只之间的。 */}
      {castGrudges.length > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="relative z-10 w-full max-w-2xl mb-8"
        >
          <h2 className="text-white/70 text-sm font-bold tracking-wide mb-3 text-center">🕸️ 本局恩怨录 · 跨局记仇记恩</h2>
          <div className="space-y-2">
            {castGrudges.map((e, i) => {
              const t = bondTier(e.score);
              const foe = t.tone === 'foe' || t.tone === 'cold';
              return (
                <div key={i} className="flex items-center gap-2 text-[12px] rounded-lg px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${foe ? 'rgba(239,68,68,0.22)' : 'rgba(34,197,94,0.22)'}` }}>
                  <span className="text-base flex-shrink-0">{t.emoji}</span>
                  <span className="flex-1 text-white/80">
                    <b className="text-white">{nameOfArch(e.holderId)}</b>
                    {foe ? ' 还记着 ' : ' 念着 '}
                    <b className="text-white">{nameOfArch(e.aboutId)}</b>
                    <span className="text-white/45"> 的{foe ? '仇' : '恩'}</span>
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ color: foe ? '#ef4444' : '#22c55e', background: foe ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)' }}>
                    {t.label} {e.score > 0 ? '+' : ''}{e.score}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-white/30 text-[10px] text-center mt-2">恩怨跨局累积 · 世仇下一局会被真的优先投票 🗡️</p>
        </motion.div>
      )}

      {/* v6.54 — 🎬 full event-timeline replay (from the persisted record). */}
      {rounds.length > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="relative z-10 w-full max-w-2xl mb-8"
        >
          <h2 className="text-white/70 text-sm font-bold tracking-wide mb-3 text-center">
            📜 完整回放 · {timeline.length} 个事件
          </h2>
          <div className="space-y-4">
            {rounds.map((g) => (
              <div key={g.round}>
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-1.5">
                  {g.round === 0 ? '赛前' : `第 ${g.round} 个工作日`}
                </div>
                <div className="space-y-1">
                  {g.events.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-[12px] text-white/75 rounded-lg px-3 py-1.5"
                      style={{ background: 'rgba(255,255,255,0.03)' }}
                    >
                      <span className="flex-shrink-0">{EVENT_ICON[e.type] ?? '▪️'}</span>
                      <span className="flex-1">{e.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {gameId && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          onClick={shareReplay}
          whileTap={{ scale: 0.97 }}
          className="relative z-10 mb-3 px-5 py-2 rounded-xl text-xs font-semibold tracking-wide text-white/85"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}
        >
          {copied ? '✓ 回放链接已复制' : '🔗 复制回放链接'}
        </motion.button>
      )}

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        onClick={() => { reset(); navigate('/'); }}
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.985 }}
        className="relative z-10 overflow-hidden px-8 py-3.5 rounded-2xl text-sm font-semibold tracking-wide text-white"
        style={{
          background: 'linear-gradient(135deg, #4c9eff 0%, #7c3aed 100%)',
          boxShadow: '0 10px 40px rgba(76,158,255,0.32), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      >
        <motion.span
          aria-hidden
          className="absolute inset-0 opacity-35"
          style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)' }}
          animate={{ x: ['-110%', '210%'] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2.5 }}
        />
        <span className="relative z-10">回到招聘大厅 →</span>
      </motion.button>
    </div>
  );
}
