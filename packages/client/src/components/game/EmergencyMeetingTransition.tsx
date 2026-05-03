/**
 * EmergencyMeetingTransition — v0.5.1-C.
 *
 * Plays a one-shot "🚨 紧急全员会" cinematic when the engine flips into the
 * MEETING phase. Helps the user understand the gear-shift from "everyone is
 * roaming around" to "everyone is now around the round table arguing".
 *
 * Sequence (~1.4 s total):
 *   0.00–0.18 s  red sweep wipes top→bottom over the whole viewport
 *   0.18–0.85 s  big "🚨 紧急全员会" headline pops in centre, slight shake
 *   0.85–1.40 s  headline scales up and fades; sweep fades out
 *
 * Only fires on phase TRANSITION into 'meeting' — not on every render where
 * `phase === 'meeting'` is already true. Component remembers its last seen
 * phase in a ref so coming back from a re-render doesn't re-trigger.
 *
 * Driven by the `phase` prop directly so the parent doesn't have to bump an
 * id; this component is the natural home for "fire-on-phase-change" effects.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../../utils/sfx';

interface Props {
  phase: string;
}

export default function EmergencyMeetingTransition({ phase }: Props) {
  const lastPhaseRef = useRef<string>(phase);
  const [tickId, setTickId] = useState(0);

  useEffect(() => {
    if (phase === 'meeting' && lastPhaseRef.current !== 'meeting') {
      setTickId((n) => n + 1);
      // Klaxon klakson + bass rumble timed to land on the headline downbeat
      // (~700 ms into the 1.4 s cinematic). v0.5.1-C complete.
      try { sfx.playAlert(); } catch { /* sfx not unlocked yet — silent */ }
    }
    lastPhaseRef.current = phase;
  }, [phase]);

  return (
    <AnimatePresence>
      {tickId > 0 && <Cinematic key={tickId} />}
    </AnimatePresence>
  );
}

function Cinematic() {
  // Self-unmount after 1.4 s so the AnimatePresence parent doesn't keep
  // remounting if the consumer re-renders mid-animation.
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 1400);
    return () => clearTimeout(t);
  }, []);
  if (done) return null;

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        pointerEvents: 'none',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {/* Red sweep wipe — translates from -100% Y to +100% Y across the screen */}
      <motion.div
        initial={{ y: '-100%' }}
        animate={{ y: ['-100%', '0%', '100%'] }}
        transition={{ duration: 1.0, ease: 'easeInOut', times: [0, 0.18, 1] }}
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(255,40,80,0) 0%, rgba(255,40,80,0.55) 50%, rgba(255,40,80,0) 100%)',
        }}
      />

      {/* Headline — scales in with a subtle shake, then scales out */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7, x: 0 }}
        animate={{
          opacity: [0, 1, 1, 0],
          scale: [0.7, 1.0, 1.05, 1.4],
          x: [0, -4, 4, -2, 2, 0],
        }}
        transition={{
          opacity: { duration: 1.1, times: [0, 0.18, 0.7, 1], delay: 0.18 },
          scale:   { duration: 1.1, times: [0, 0.25, 0.7, 1], delay: 0.18 },
          x:       { duration: 0.5, times: [0, 0.2, 0.4, 0.6, 0.8, 1], delay: 0.18 },
        }}
        style={{
          position: 'relative',
          padding: '20px 44px',
          borderRadius: 24,
          background: 'rgba(8,4,16,0.85)',
          border: '2px solid rgba(255,40,80,0.85)',
          boxShadow: '0 0 60px rgba(255,40,80,0.55), inset 0 0 24px rgba(255,40,80,0.35)',
          fontSize: 56,
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '0.04em',
          textShadow: '0 4px 20px rgba(255,40,80,0.85)',
          backdropFilter: 'blur(12px)',
        }}
      >
        🚨 紧急全员会
      </motion.div>
    </motion.div>
  );
}
