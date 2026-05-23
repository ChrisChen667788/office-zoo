/**
 * PhaseTransitionOverlay — v6.8 P2 mihoyo-style phase change stinger.
 *
 * Subscribes to gameStore.phase. When the phase changes, renders a
 * ~620 ms overlay:
 *   1. Golden horizontal wipe streak (gradient bar) sweeping L → R
 *   2. Centered EVENT pill with the new phase's Chinese name + emoji
 *   3. Brief golden ring shadow pulse around the pill
 *
 * Fires sfx.playPhaseTransition() at start. pointer-events: none so the
 * underlying chat / map remains clickable. Sits at z-50 between content
 * and modals.
 *
 * **Skipped phases** — the engine already has dedicated cinematics for
 * these and double-stacking looks busy:
 *   - `meeting`     → EmergencyMeetingTransition (1.4 s klaxon)
 *   - `vote_result` → EliminationReveal (cinematic vote ceremony)
 *
 * Also skipped: the very first mount with phase=`lobby` (initial paint
 * isn't a transition, just a load). We track `lastPhase` in a ref so
 * coming back from a re-render with the same phase doesn't re-fire.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePhase } from '../../stores/gameStore';
import { sfx } from '../../utils/sfx';

// Phase id → human label + emoji. Subset of Classic.tsx's PHASE_NAMES;
// kept local so this component can be dropped into any route without
// import-tangling. Add new phases here as the engine grows.
const PHASE_DISPLAY: Record<string, { label: string; sub: string; emoji: string; tint: string }> = {
  lobby:        { label: '待入职',     sub: 'WAITING ROOM',   emoji: '⏳', tint: '#FFD700' },
  role_reveal:  { label: '岗位分配',   sub: 'ROLE REVEAL',    emoji: '📋', tint: '#FFA947' },
  free_roam:    { label: '日常搬砖',   sub: 'DAY SHIFT',      emoji: '💼', tint: '#4ECDC4' },
  discussion:   { label: '茶水间会议', sub: 'WATER COOLER',   emoji: '💬', tint: '#B086FF' },
  voting:       { label: '投票表决',   sub: 'VOTE NOW',       emoji: '🗳️', tint: '#FF4FA3' },
  game_over:    { label: '本季终局',   sub: 'SEASON OVER',    emoji: '🏁', tint: '#FFD700' },
};

// Phases handled by dedicated cinematics elsewhere — never show our
// overlay for these or we double-stack.
const SKIP_PHASES = new Set(['meeting', 'vote_result']);

export default function PhaseTransitionOverlay() {
  const phase = usePhase();
  const lastPhaseRef = useRef<string>(phase);
  const [showPhase, setShowPhase] = useState<string | null>(null);

  useEffect(() => {
    // Skip the initial mount — first paint is not a transition.
    if (lastPhaseRef.current === phase) return;
    const prev = lastPhaseRef.current;
    lastPhaseRef.current = phase;

    // Don't render for phases that have their own cinematic.
    if (SKIP_PHASES.has(phase)) return;
    // Don't render leaving lobby for the first time either — the route
    // mount already creates enough motion.
    if (prev === 'lobby' && phase === 'role_reveal') {
      // Actually DO render for role_reveal — it's the ceremonial first
      // transition. Falling through.
    }

    const display = PHASE_DISPLAY[phase];
    if (!display) return;

    setShowPhase(phase);
    sfx.playPhaseTransition();

    // Auto-clear after 620 ms (covers wipe + pill linger + exit fade).
    const timer = setTimeout(() => setShowPhase(null), 620);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <AnimatePresence>
      {showPhase && (() => {
        const d = PHASE_DISPLAY[showPhase];
        if (!d) return null;
        return (
          <motion.div
            key={showPhase}
            style={{
              position: 'fixed', inset: 0,
              zIndex: 50, pointerEvents: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
          >
            {/* Golden wipe — diagonal bar sweeping L → R across the screen. */}
            <motion.div
              initial={{ x: '-120vw' }}
              animate={{ x: '120vw' }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute', top: '40%', left: 0, height: '20%', width: '60vw',
                background: `linear-gradient(95deg,
                  transparent 0%,
                  rgba(255,215,0,0.0) 15%,
                  rgba(255,215,0,0.35) 45%,
                  rgba(255,169,71,0.55) 50%,
                  rgba(255,215,0,0.35) 55%,
                  rgba(255,215,0,0.0) 85%,
                  transparent 100%)`,
                filter: 'blur(2px)',
                mixBlendMode: 'screen',
                transform: 'skewX(-12deg)',
              }}
            />

            {/* Centered EVENT pill — pops in 0.18s, hangs 0.25s, exits in 0.18s. */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 8 }}
              animate={{
                scale: [0.6, 1.08, 1.0],
                opacity: [0, 1, 1],
                y: [8, -2, 0],
              }}
              transition={{ duration: 0.36, times: [0, 0.5, 1], ease: [0.34, 1.56, 0.64, 1] }}
              style={{
                position: 'relative',
                padding: '14px 28px',
                borderRadius: 999,
                background: `linear-gradient(135deg, ${d.tint} 0%, #FFA947 100%)`,
                color: '#1a0d35',
                fontWeight: 900,
                fontSize: 18,
                letterSpacing: '-0.01em',
                display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: `
                  0 0 24px ${d.tint}88,
                  0 0 60px ${d.tint}55,
                  inset 0 0 0 2px rgba(255,255,255,0.4),
                  inset 0 2px 8px rgba(255,255,255,0.5)
                `,
                textShadow: '0 1px 0 rgba(255,255,255,0.45)',
              }}
            >
              <span style={{ fontSize: 22 }}>{d.emoji}</span>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                <span>{d.label}</span>
                <span style={{
                  fontSize: 9, marginTop: 4, opacity: 0.7, letterSpacing: '0.22em',
                }}>{d.sub}</span>
              </div>
            </motion.div>

            {/* Subtle vignette tint sweep — adds depth, masks underlying
                content for 200ms so the eye locks on the pill. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.32, 0] }}
              transition={{ duration: 0.55, times: [0, 0.4, 1], ease: 'easeOut' }}
              style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(ellipse at center,
                  transparent 0%, transparent 35%,
                  rgba(10,10,30,0.45) 80%, rgba(10,10,30,0.7) 100%)`,
              }}
            />
          </motion.div>
        );
      })()}
    </AnimatePresence>
  );
}
