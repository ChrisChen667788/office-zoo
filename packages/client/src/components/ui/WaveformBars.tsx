/**
 * WaveformBars — animated equalizer visualizer for TTS playback.
 *
 * v0.9.2.1. Replaces the static avatar pulse on Talkshow PlayerView with a
 * music-app-style EQ bar group. Pure CSS animation (see `.eq-bar` in
 * index.css) — each bar gets a per-bar `animationDelay` so the wave
 * cascades. No JS RAF cost; bars freeze when `active=false` (visually
 * "muted").
 *
 * Use case: pair with the avatar disc so users get both an emotional
 * focus point (the face) AND a clean rhythm cue (the bars) while audio
 * plays. Looks premium without needing real audio analysis.
 */

interface WaveformBarsProps {
  /** When false, bars freeze at a flat resting height (no animation). */
  active: boolean;
  /** Number of bars; default 5 reads as a typical EQ row. */
  count?: number;
  /** Bar height in px (max). Default 18 — fits inline next to a label. */
  height?: number;
  /** Color for the bar gradient. Default falls back to .eq-bar's
   *  (#ff5588 → #7c3aed). Override per-mode (e.g., red/orange in fired). */
  color?: string;
}

export function WaveformBars({
  active,
  count = 5,
  height = 18,
  color,
}: WaveformBarsProps) {
  return (
    <span
      className="inline-flex items-end leading-none"
      style={{ height }}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="eq-bar"
          style={{
            height,
            // Stagger each bar by 1/4 cycle so they cascade rather than
            // pulse in unison. Modulo by count keeps the loop symmetric.
            animationDelay: `${(i * 0.16) % (count * 0.16)}s`,
            // Freeze at min height when inactive — gives a clean "muted"
            // affordance without removing the bars (layout stable).
            animationPlayState: active ? 'running' : 'paused',
            transform: active ? undefined : 'scaleY(0.35)',
            opacity: active ? undefined : 0.45,
            ...(color ? { background: color } : null),
          }}
        />
      ))}
    </span>
  );
}
