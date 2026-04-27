/**
 * SfxToggle — small icon button that flips the global SFX mute state.
 *
 * Lives as a generic UI atom (not tied to any particular screen) so both
 * Landing and in-game chrome can place it where space allows. State comes
 * from `utils/sfx.ts` which persists the preference in localStorage; we
 * hydrate once on mount and mirror subsequent flips back into the store.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { isSfxMuted, setSfxMuted, sfx } from '../../utils/sfx';

interface Props {
  /** Override the default absolute positioning; pass '' to place inline. */
  className?: string;
  /** Optional tooltip label; defaults to describing current state. */
  title?: string;
}

export default function SfxToggle({ className, title }: Props) {
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return isSfxMuted();
    } catch {
      return false;
    }
  });

  // Keep in sync on mount — protects against other tabs / HMR mismatches.
  useEffect(() => {
    setMuted(isSfxMuted());
  }, []);

  const toggle = useCallback(() => {
    const next = !muted;
    setSfxMuted(next);
    setMuted(next);
    // Play a tiny feedback chime when unmuting, so the user immediately
    // hears the feature is back. Silent when muting — would be absurd.
    if (!next) sfx.playPick();
  }, [muted]);

  return (
    <motion.button
      onClick={toggle}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.92 }}
      aria-pressed={!muted}
      title={title ?? (muted ? '音效已关闭 · 点击开启' : '音效已开启 · 点击静音')}
      className={
        className ??
        'relative w-9 h-9 rounded-xl grid place-items-center text-white/75 hover:text-white transition'
      }
      style={{
        background: muted ? 'rgba(255,255,255,0.02)' : 'rgba(76,158,255,0.08)',
        border: `1px solid ${muted ? 'rgba(255,255,255,0.08)' : 'rgba(76,158,255,0.28)'}`,
        boxShadow: muted ? 'none' : '0 0 16px rgba(76,158,255,0.18)',
      }}
    >
      {/* Icon — mute bars + slash vs waves */}
      {muted ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}

      {/* Active dot — indicates "on" at a glance */}
      {!muted && (
        <motion.span
          aria-hidden
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
          style={{ background: '#4c9eff', boxShadow: '0 0 6px #4c9eff' }}
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
}
