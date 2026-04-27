/**
 * PhaseHint — ambient bottom banner that explains the current game phase.
 *
 * Animates in when `phase` changes, auto-dismisses after a few seconds,
 * and re-appears on the next phase transition. Purely informational:
 * never steals focus, never blocks interaction.
 *
 * Rationale: first-time viewers watching Classic/Immersive don't have
 * context for what "讨论" or "vote_result" means in gameplay terms,
 * so a 1-sentence contextual blurb accelerates comprehension.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PHASE_HINTS: Record<string, { icon: string; title: string; hint: string; color: string }> = {
  lobby: {
    icon: '⏳',
    title: '待入职',
    hint: '公司正在组建员工队伍,请稍候……',
    color: '#a855f7',
  },
  role_reveal: {
    icon: '📋',
    title: '岗位分配',
    hint: '每位员工拿到自己的工位和身份,暗中盘算本回合策略。',
    color: '#2fb8ff',
  },
  free_roam: {
    icon: '💼',
    title: '日常搬砖',
    hint: '打工人做 KPI 任务冲进度条,资本家伺机偷偷"优化"掉落单员工。',
    color: '#4FC3F7',
  },
  meeting: {
    icon: '🚨',
    title: '紧急全员会',
    hint: '系统公告昨晚谁被"优化"了,全员被召回会议室。',
    color: '#ef4444',
  },
  discussion: {
    icon: '🔥',
    title: '职场撕逼',
    hint: 'AI 员工按座次发言甩锅,暗藏线索的发言会影响随后投票。',
    color: '#fb923c',
  },
  voting: {
    icon: '🗳️',
    title: '投票裁员',
    hint: '全员投票决定开除谁。平票则无人下岗,资本家可以继续潜伏。',
    color: '#fbbf24',
  },
  vote_result: {
    icon: '⚖️',
    title: '裁员结果',
    hint: '公布投票结果。被开除者退场,但离职员工还有一次"劳动仲裁票"。',
    color: '#8b5cf6',
  },
  game_over: {
    icon: '🏆',
    title: '散伙饭',
    hint: '胜负已分,查看本局统计。',
    color: '#10b981',
  },
};

interface PhaseHintProps {
  phase: string;
  /** Auto-dismiss timeout in ms. 0 keeps it sticky. */
  dismissAfter?: number;
}

export default function PhaseHint({ phase, dismissAfter = 6000 }: PhaseHintProps) {
  const [visible, setVisible] = useState(true);
  const info = PHASE_HINTS[phase];

  // Re-show + schedule dismiss every time phase flips.
  useEffect(() => {
    if (!info) return;
    setVisible(true);
    if (dismissAfter <= 0) return;
    const t = setTimeout(() => setVisible(false), dismissAfter);
    return () => clearTimeout(t);
  }, [phase, info, dismissAfter]);

  if (!info) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
          initial={{ y: 40, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        >
          <div
            className="flex items-center gap-3 rounded-xl px-5 py-3 max-w-md"
            style={{
              background: 'rgba(15, 14, 46, 0.92)',
              border: `1px solid ${info.color}55`,
              boxShadow: `0 0 24px ${info.color}33, inset 0 1px 0 rgba(255,255,255,0.05)`,
              backdropFilter: 'blur(20px)',
            }}
          >
            <span className="text-2xl" aria-hidden>{info.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold tracking-wider" style={{ color: info.color }}>
                {info.title}
              </div>
              <div className="text-[11px] text-white/70 leading-snug mt-0.5">
                {info.hint}
              </div>
            </div>
            <button
              onClick={() => setVisible(false)}
              aria-label="关闭提示"
              className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
