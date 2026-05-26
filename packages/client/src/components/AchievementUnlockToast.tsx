/**
 * AchievementUnlockToast — v6.30 P4. Listens for the
 * 'achievement:unlocked' CustomEvent and pops a 4s gold toast in the
 * top-right corner. Mounts globally in App so unlocks from any route
 * fire visually.
 *
 * Distinct from existing components/game/AchievementToast.tsx (that
 * one is parent-driven, in-game-only). This one is event-bus-driven,
 * lives at the App level, and decorates the cumulative spectator
 * achievements ratchet — not the per-round PredictionBar streak.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onAchievementUnlocked, type Achievement } from '../utils/achievements';

export default function AchievementUnlockToast() {
  const [current, setCurrent] = useState<Achievement | null>(null);

  useEffect(() => {
    return onAchievementUnlocked((a) => {
      setCurrent(a);
      const t = setTimeout(() => setCurrent(null), 4200);
      return () => clearTimeout(t);
    });
  }, []);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: -20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.94 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          style={{
            position: 'fixed', top: 70, right: 16,
            zIndex: 1100,
            minWidth: 260, maxWidth: 320,
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(15,14,46,0.96) 0%, rgba(26,16,64,0.96) 100%)',
            border: '1px solid rgba(255,215,0,0.55)',
            borderRadius: 12,
            boxShadow: '0 0 40px rgba(255,215,0,0.28), 0 12px 40px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(20px)',
            display: 'flex', gap: 10, alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <span style={{
            fontSize: 32,
            filter: 'drop-shadow(0 0 8px rgba(255,215,0,0.65))',
          }}>{current.emoji}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 9.5, fontWeight: 900, letterSpacing: '0.2em',
              color: '#FFD700', textTransform: 'uppercase',
            }}>🏆 解锁成就</div>
            <div style={{
              fontSize: 14, fontWeight: 900, color: '#fff', marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{current.label}</div>
            <div style={{
              fontSize: 10.5, color: 'rgba(255,255,255,0.65)', marginTop: 2,
              lineHeight: 1.4,
            }}>{current.desc}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
