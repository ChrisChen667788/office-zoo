/**
 * VoteEjectAnimation — v0.5.1-B.
 *
 * Companion overlay to `EliminationReveal` that fires only on type='vote'
 * eliminations. Adds two extra dramatic flourishes that EliminationReveal
 * doesn't already cover:
 *
 *   1. 8 red ✕ marks orbit the screen centre for ~1 s, then snap inward
 *      (visualises "the whole room voted to kick this person out").
 *   2. A wide black-and-amber banner slides up from the bottom edge with
 *      "💼 {name} 已被全员投票开除", lingers 1.5 s, slides back down.
 *
 * Parent (Classic / Immersive) bumps `triggerId` when a fresh vote eject
 * lands. Same id = no-op. Sits at z-85 (above EliminationReveal's z-80
 * backdrop, below modals).
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  /** Bump on every fresh vote eject; equal id is a no-op. */
  triggerId: number;
  /** Player name to show in the banner — required for the banner to render. */
  playerName?: string;
}

const ORBIT_COUNT = 8;
const ANIM_DURATION_MS = 2400;

export default function VoteEjectAnimation({ triggerId, playerName }: Props) {
  const lastIdRef = useRef<number>(0);
  const [active, setActive] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    if (!triggerId || triggerId === lastIdRef.current || !playerName) return;
    lastIdRef.current = triggerId;
    setActive({ id: triggerId, name: playerName });
    // Note: SFX intentionally NOT fired here. EliminationReveal's vote
    // path already calls sfx.playVote() (gavel + ceremonial chord) in
    // lockstep with this overlay, so doubling up here would echo. We
    // own the visuals; EliminationReveal owns the audio for vote events.
    const t = setTimeout(() => setActive(null), ANIM_DURATION_MS);
    return () => clearTimeout(t);
  }, [triggerId, playerName]);

  return (
    <AnimatePresence>
      {active && <Cinematic key={active.id} name={active.name} />}
    </AnimatePresence>
  );
}

function Cinematic({ name }: { name: string }) {
  // Pre-compute the orbit angles so render is O(N), not O(N²) on re-render.
  const angles: number[] = [];
  for (let i = 0; i < ORBIT_COUNT; i++) {
    angles.push((i / ORBIT_COUNT) * Math.PI * 2);
  }

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 85,
        pointerEvents: 'none',
      }}
    >
      {/* Orbit of red Xs — start at outer ring, rotate 1.25 turns, snap inward */}
      <div
        style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: 0, height: 0,
        }}
      >
        {angles.map((angle, i) => (
          <motion.div
            key={i}
            initial={{
              x: Math.cos(angle) * 280,
              y: Math.sin(angle) * 280,
              scale: 0.3,
              opacity: 0,
              rotate: 0,
            }}
            animate={{
              x: [
                Math.cos(angle) * 280,
                Math.cos(angle + Math.PI * 2.5) * 280,
                Math.cos(angle + Math.PI * 2.5) * 60,
              ],
              y: [
                Math.sin(angle) * 280,
                Math.sin(angle + Math.PI * 2.5) * 280,
                Math.sin(angle + Math.PI * 2.5) * 60,
              ],
              scale: [0.3, 1.0, 1.4, 0],
              opacity: [0, 1, 1, 0],
              rotate: [0, 360, 540],
            }}
            transition={{
              duration: 1.4,
              delay: i * 0.04,
              times: [0, 0.4, 0.85, 1],
              ease: 'easeOut',
            }}
            style={{
              position: 'absolute',
              fontSize: 56,
              fontWeight: 900,
              color: '#ff3355',
              textShadow: '0 0 16px rgba(255,51,85,0.85)',
              filter: 'drop-shadow(0 0 12px rgba(255,51,85,0.6))',
            }}
          >
            ✕
          </motion.div>
        ))}
      </div>

      {/* Bottom banner — slides up, lingers, slides back down */}
      <motion.div
        initial={{ y: 200, opacity: 0 }}
        animate={{
          y: [200, 0, 0, 200],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          duration: 2.2,
          times: [0, 0.18, 0.82, 1],
          ease: 'easeInOut',
        }}
        style={{
          position: 'absolute',
          bottom: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '18px 38px',
          borderRadius: 18,
          background:
            'linear-gradient(135deg, rgba(8,4,16,0.95) 0%, rgba(40,12,8,0.95) 100%)',
          border: '2px solid rgba(255,184,76,0.85)',
          boxShadow:
            '0 0 50px rgba(255,184,76,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
          fontSize: 30,
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '0.04em',
          textShadow: '0 2px 12px rgba(255,184,76,0.6)',
          backdropFilter: 'blur(14px)',
          whiteSpace: 'nowrap',
        }}
      >
        💼 <span style={{ color: '#ffb84c' }}>{name}</span> 已被全员投票开除
      </motion.div>
    </motion.div>
  );
}
