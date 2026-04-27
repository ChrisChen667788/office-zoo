/**
 * AchievementToast — one-shot floating notification when a milestone drops.
 *
 * ## Why
 *
 * PredictionBar's cumulative streak is the only ratchet the spectator has.
 * Without any unlock feedback, hitting 5-in-a-row feels the same as hitting
 * 2-in-a-row: number goes up, dopamine is flat. Steam/PSN-style achievement
 * popups are the cheapest-to-build, highest-recall reward format — they
 * exist *outside* the game's normal UI surface, which makes them feel like
 * genuine recognition rather than a stat update.
 *
 * ## Contract
 *
 * Parent owns the `data` state. Setting `data` to a non-null value triggers
 * the pop; the component self-dismisses after `lingerMs` (default 3800ms)
 * by calling `onDone()`. Setting `data` to a different non-null object
 * while one is already visible replaces the current one (no queue — if
 * three tiers fire in rapid succession, only the latest shows; that's OK
 * because each tier strictly supersedes the previous).
 *
 * ## Visual stack
 *
 *  - Spring entry from top with scale/Y transform
 *  - Animated specular sheen sweeping across the card once
 *  - Icon wobble on entry
 *  - z-[85] — above EliminationReveal (80), below HighlightReel (90)
 */
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LottieAsset from '../LottieAsset';
import { lottie } from '../../constants/lottie';
import { Icon } from '../../constants/icons';

export interface AchievementData {
  id: string | number;
  emoji: string;
  /** Optional AI-generated medal art URL. Falls back to `emoji` if absent / 404. */
  icon?: string;
  label: string;
  sub: string;
  color: string;
  /** RGBA glow color used for shadows and sheen. */
  glow: string;
}

interface Props {
  data: AchievementData | null;
  onDone: () => void;
  lingerMs?: number;
}

export default function AchievementToast({
  data,
  onDone,
  lingerMs = 3800,
}: Props) {
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(onDone, lingerMs);
    return () => clearTimeout(t);
  }, [data?.id, lingerMs, onDone]);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key={data.id}
          className="fixed left-1/2 z-[85] pointer-events-none"
          style={{ top: '11%', translateX: '-50%' }}
          initial={{ y: -30, opacity: 0, scale: 0.85 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -40, opacity: 0, scale: 0.92 }}
          transition={{ type: 'spring', damping: 20, stiffness: 280 }}
        >
          <div
            className="relative px-6 py-3.5 rounded-2xl flex items-center gap-3 overflow-hidden"
            style={{
              background:
                'linear-gradient(135deg, rgba(20,18,50,0.96), rgba(36,26,70,0.96))',
              border: `2px solid ${data.color}`,
              boxShadow: `0 0 50px ${data.glow}, 0 10px 32px rgba(0,0,0,0.45)`,
              backdropFilter: 'blur(20px)',
              minWidth: 280,
            }}
          >
            {/* Sheen sweep — fires once on entry */}
            <motion.div
              className="absolute top-0 bottom-0 w-16 pointer-events-none"
              initial={{ x: -120 }}
              animate={{ x: 420 }}
              transition={{ duration: 1.4, delay: 0.35, ease: 'easeOut' }}
              style={{
                background: `linear-gradient(90deg, transparent, ${data.color}88, transparent)`,
                filter: 'blur(10px)',
              }}
            />
            {/* Radial accent behind the emoji */}
            <motion.div
              className="absolute -left-2 -top-2 w-24 h-24 rounded-full pointer-events-none"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 0.7, 0], scale: [0.5, 1.4, 1] }}
              transition={{ duration: 1.1 }}
              style={{
                background: `radial-gradient(circle, ${data.color}55 0%, transparent 70%)`,
                filter: 'blur(12px)',
              }}
            />

            {/* Icon with wobble — Lottie check-and-stars plays once behind
                the emoji to punctuate the unlock; emoji stays the primary
                identifier so each achievement remains recognisable. */}
            <motion.div
              className="text-4xl flex-shrink-0 relative w-12 h-12 flex items-center justify-center"
              animate={{
                rotate: [0, -14, 12, -6, 0],
                scale: [1, 1.25, 1],
              }}
              transition={{ duration: 0.85, times: [0, 0.25, 0.5, 0.75, 1] }}
              style={{ filter: `drop-shadow(0 0 14px ${data.glow})` }}
            >
              <motion.div
                className="absolute inset-[-18px] pointer-events-none"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0, 0.9, 0], scale: [0.6, 1.1, 1] }}
                transition={{ duration: 1.6, ease: 'easeOut' }}
              >
                <LottieAsset src={lottie.success} size="100%" loop={false} />
              </motion.div>
              <span className="relative" style={{ display: 'inline-flex' }}>
                {data.icon
                  ? <Icon src={data.icon} emoji={data.emoji} size={44} />
                  : data.emoji}
              </span>
            </motion.div>

            <div className="relative">
              <div className="text-[9px] tracking-[0.22em] text-white/45 uppercase font-black">
                Achievement
              </div>
              <div
                className="text-lg font-black leading-tight"
                style={{
                  color: data.color,
                  textShadow: `0 0 12px ${data.glow}`,
                }}
              >
                {data.label}
              </div>
              <div className="text-[11px] text-white/60 mt-0.5">{data.sub}</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
