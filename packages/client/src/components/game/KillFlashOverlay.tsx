/**
 * KillFlashOverlay — v0.5.1-A.
 *
 * Drops a fullscreen red flash + screen shake the moment a kill event fires.
 * Sits in front of EliminationReveal in z-order so the flash hits first
 * (~250 ms) and EliminationReveal's longer dramatic overlay slides in over
 * top of the fading flash. Together they make the "被裁瞬间" feel like a
 * cinematic moment instead of a calm log entry.
 *
 * Driven by a monotonic id prop — bumping the id re-triggers the animation,
 * passing the same id is a no-op (idempotent). The parent component (Classic /
 * Immersive) bumps the id inside the `'game:kill'` socket handler.
 *
 * Animation budget: 0.45 s total (flash + shake). Tries to hand off cleanly
 * before EliminationReveal's spring anim kicks in at ~0.5 s.
 */
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../../utils/sfx';

interface KillFlashOverlayProps {
  /** Bump this number whenever a fresh kill event lands. Same id = no-op. */
  triggerId: number;
}

const FLASH_DURATION_MS = 450;

export default function KillFlashOverlay({ triggerId }: KillFlashOverlayProps) {
  // Track the last id we played so re-renders don't re-trigger the same flash.
  const lastPlayedRef = useRef<number>(0);
  // Force-remount key so AnimatePresence treats each fresh kill as a new mount.
  const visibleRef = useRef<number>(0);

  useEffect(() => {
    if (!triggerId || triggerId === lastPlayedRef.current) return;
    lastPlayedRef.current = triggerId;
    visibleRef.current = triggerId;
    // Fire the kill SFX synchronously with the visual hit.
    try { sfx.playKill(); } catch { /* sfx not unlocked yet — silent fail */ }
  }, [triggerId]);

  // Show the overlay for FLASH_DURATION_MS, then unmount via state-less timer.
  // We re-render on triggerId so the flash is naturally one-shot.
  return (
    <AnimatePresence>
      {triggerId === visibleRef.current && triggerId > 0 && (
        <FlashFrame key={triggerId} />
      )}
    </AnimatePresence>
  );
}

function FlashFrame() {
  // Self-unmount after the flash finishes — keeps the DOM clean and lets
  // AnimatePresence remove us cleanly.
  const removeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      removeRef.current?.remove();
    }, FLASH_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      ref={removeRef}
      initial={{ opacity: 0 }}
      animate={{
        opacity: [0, 1, 0.55, 0],
        x: [0, -8, 6, -4, 3, 0],   // shake left/right
      }}
      exit={{ opacity: 0 }}
      transition={{
        opacity: { duration: FLASH_DURATION_MS / 1000, times: [0, 0.05, 0.35, 1] },
        x:       { duration: 0.30, times: [0, 0.2, 0.4, 0.6, 0.8, 1] },
      }}
      // pointer-events:none — never intercept clicks
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95, // above EliminationReveal's z-80 backdrop, below modals (z-100+)
        pointerEvents: 'none',
        // Inset shadow + radial gradient = "blood on the lens" feel
        background:
          'radial-gradient(ellipse at center, rgba(255,40,80,0.0) 25%, rgba(255,40,80,0.55) 100%)',
        boxShadow: 'inset 0 0 240px 80px rgba(255,40,80,0.85)',
        // Safari sometimes ignores filter on fixed elements unless we hint
        willChange: 'opacity, transform',
      }}
    />
  );
}
