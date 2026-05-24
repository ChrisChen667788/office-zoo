/**
 * Result — compact end-of-game screen.
 *
 * Mostly superseded by HighlightReel's in-game overlay, but the /result/:gameId
 * route is kept as a deep-linkable fallback (e.g. replay button, shared URL).
 * Styling matches the rest of the redesigned chrome so nobody hits it and
 * thinks they've landed on the old build.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { usePlayers, useWinner, useRound, useGameActions } from '../stores/gameStore';
import { colors } from '../constants/design';
import { lottie } from '../constants/lottie';
import LottieAsset from '../components/LottieAsset';
import PersonaCard from '../components/character/PersonaCard';

const TEAM_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  cat:     { label: '打工人阵营', emoji: '👨‍💻', color: colors.team.cat },
  dog:     { label: '资本家阵营', emoji: '👔', color: colors.team.dog },
  neutral: { label: '摸鱼阵营',  emoji: '😎', color: colors.team.neutral },
};

const PERSONALITY_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  social_butterfly:   { label: '社牛', emoji: '🦋', color: '#FF6B9D' },
  introvert:          { label: '社恐', emoji: '🐢', color: '#7EC8E3' },
  contrarian:         { label: '杠精', emoji: '🔨', color: '#ff3355' },
  sycophant:          { label: '舔狗', emoji: '🐶', color: '#FFB347' },
  passive_aggressive: { label: '阴阳人', emoji: '🌗', color: '#B19CD9' },
  hot_tempered:       { label: '暴躁哥', emoji: '🌋', color: '#FF6347' },
  smooth_operator:    { label: '老狐狸', emoji: '🦊', color: '#DAA520' },
  workaholic:         { label: '卷王', emoji: '📈', color: '#00CED1' },
};

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
};

export default function Result() {
  useParams(); // keeps the signature; gameId not directly used
  const navigate = useNavigate();
  const players = usePlayers();
  const winner = useWinner();
  const round = useRound();
  const { reset } = useGameActions();

  const winInfo = WIN_LABELS[winner] || WIN_LABELS.none;
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.team === b.team) return a.isAlive === b.isAlive ? 0 : a.isAlive ? -1 : 1;
    const order = ['cat', 'dog', 'neutral'];
    return order.indexOf(a.team || '') - order.indexOf(b.team || '');
  });

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-8 noise" style={{ background: '#050510' }}>
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
