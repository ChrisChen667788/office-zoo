/**
 * Design tokens — single source of truth for color, spacing, radius, shadow.
 *
 * ## Why a separate module, not just index.css variables?
 *
 * CSS variables are great for styling, but TS/framer-motion inline styles need
 * JS values. Duplicating hex codes between `.css` `:root` and `styles={...}`
 * props is the most common source of "why does this almost match?" bugs.
 * This module exports both:
 *   - Raw JS values (for Framer / inline `style=` props)
 *   - `cssVar('name')` helper, whose output goes into `var(--name)` strings so
 *     Tailwind-ish CSS can reference the same token.
 *
 * ## Visual direction — "0 点的写字楼"
 *
 * Deep navy base (#050510) with restrained neon accents. We retired the
 * saturated #2fb8ff → #5e17ff Y2K gradient pair because it read as "generic
 * AI product landing", and leaned into a darker, more cinematic palette that
 * sits between Linear's Space Grotesk minimalism and Arc's glass-first chrome.
 *
 * Primary accent (brand.neon = #4c9eff) is a slightly-deeper cyan; paired
 * with brand.violet it still signals "打工人". The red/yellow semantic
 * pair comes from the "vote" (劳动仲裁 amber) and "kill" (danger red) beats
 * that already lived in the game's visual vocabulary.
 */

export const colors = {
  /** Layered surface colors — use `elev` for cards, `surface` for nested panels. */
  bg: {
    base: '#050510',
    elev: '#0b0c1e',
    surface: '#14152a',
    overlay: 'rgba(6, 6, 18, 0.72)',
  },
  brand: {
    /** Primary accent — used on CTAs, focus rings, progress bars. */
    neon: '#4c9eff',
    violet: '#7c3aed',
    /** Shimmer / highlight (lighter than neon, for sparkle/specular). */
    glow: '#7fd4ff',
  },
  team: {
    cat: '#4c9eff',
    dog: '#ff3355',
    neutral: '#a855f7',
  },
  semantic: {
    success: '#9cff57',
    warn: '#ffb84c',
    danger: '#ff3355',
    info: '#4c9eff',
    /** Ghost comments / 仲裁 — distinct from success by hue. */
    ghost: '#6ee7b7',
  },
  text: {
    primary: 'rgba(255,255,255,0.96)',
    secondary: 'rgba(255,255,255,0.72)',
    tertiary: 'rgba(255,255,255,0.48)',
    muted: 'rgba(255,255,255,0.32)',
    faint: 'rgba(255,255,255,0.18)',
  },
  stroke: {
    faint: 'rgba(255,255,255,0.04)',
    subtle: 'rgba(255,255,255,0.08)',
    normal: 'rgba(255,255,255,0.14)',
    strong: 'rgba(255,255,255,0.28)',
  },
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  x2l: 32,
  x3l: 48,
  x4l: 64,
} as const;

export const shadow = {
  sm: '0 1px 3px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.14)',
  md: '0 6px 18px rgba(0,0,0,0.38), 0 2px 4px rgba(0,0,0,0.18)',
  lg: '0 20px 48px rgba(0,0,0,0.5), 0 6px 14px rgba(0,0,0,0.2)',
  glow: (rgba: string) => `0 0 32px ${rgba}, 0 0 64px ${rgba.replace(/[\d.]+\)$/, '0.15)')}`,
  glowBlue:
    '0 0 36px rgba(76,158,255,0.28), 0 0 72px rgba(76,158,255,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
  glowRed:
    '0 0 36px rgba(255,51,85,0.32), 0 0 72px rgba(255,51,85,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
  inset: 'inset 0 1px 0 rgba(255,255,255,0.08)',
} as const;

/** Unified font stack — no webfont download to keep first-paint clean. */
export const font = {
  display:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  body: 'inherit',
  mono:
    'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, "Roboto Mono", monospace',
} as const;

/** Shared gradient recipes — keep in one place so they read consistently. */
export const gradients = {
  brand: 'linear-gradient(135deg, #4c9eff 0%, #7c3aed 100%)',
  brandGlow: 'linear-gradient(135deg, #4c9eff 0%, #7c3aed 60%, #ec4899 100%)',
  cat: 'linear-gradient(135deg, #4c9eff 0%, #7c3aed 100%)',
  dog: 'linear-gradient(135deg, #ff3355 0%, #ff8a4c 100%)',
  neutral: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
  fired: 'linear-gradient(135deg, #ff3355 0%, #ff7a1a 55%, #ffb84c 100%)',
  /** Moody aurora used on Landing. */
  pageBg:
    'radial-gradient(ellipse at 15% -10%, rgba(124,58,237,0.22) 0%, transparent 55%), radial-gradient(ellipse at 85% 0%, rgba(76,158,255,0.18) 0%, transparent 45%), radial-gradient(ellipse at 50% 110%, rgba(236,72,153,0.12) 0%, transparent 50%), linear-gradient(180deg, #050510 0%, #070818 100%)',
  // ── v0.9.2.1 — per-UGC-mode card backgrounds. Subtle gradient washes
  //    that sit at ~6-12% alpha so they tint glass cards without
  //    dominating the content. Each mode gets its own emotional tone:
  //      talkshow = creative pink/violet
  //      fired    = urgent red/amber
  //      pack     = collectible gold/pink
  cardTalkshow:
    'linear-gradient(135deg, rgba(255,85,136,0.08) 0%, rgba(124,58,237,0.06) 50%, rgba(76,158,255,0.04) 100%)',
  cardFired:
    'linear-gradient(135deg, rgba(255,51,85,0.08) 0%, rgba(255,138,76,0.05) 100%)',
  cardPack:
    'linear-gradient(135deg, rgba(255,184,76,0.10) 0%, rgba(255,85,136,0.05) 100%)',
  /** v0.9.2.1 — leaderboard winner card (top 3 monthly). Stronger
   *  amber wash + pink kiss to feel "podium". */
  cardMedal:
    'linear-gradient(135deg, rgba(255,184,76,0.18) 0%, rgba(255,85,136,0.08) 50%, rgba(124,58,237,0.05) 100%)',
} as const;

// ──────────────────────────────────────────────────────────────────────────
// v0.9.2.1 — Motion tokens. Same idea as `radius` / `shadow`: single source
// of truth for all easings + durations so micro-interactions feel consistent.
// Names match the framer-motion `transition` shape so they drop in directly.
// ──────────────────────────────────────────────────────────────────────────
export const motion = {
  /** Snappy — for hover lifts, button presses (≤200 ms). */
  snap:    { duration: 0.16, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
  /** Standard — default for state changes (~300 ms). */
  smooth:  { duration: 0.30, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
  /** Cinematic — page entrances, hero reveals (~500 ms). */
  cinema:  { duration: 0.50, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  /** Slow loop — for breathing pulses (≥800 ms). */
  breathe: { duration: 1.2, ease: 'easeInOut' as const },
} as const;

// ──────────────────────────────────────────────────────────────────────────
// v0.9.2.1 — Card archetypes. Inline-style objects ready to spread into a
// `style={{...}}`. Each is a triple of (background, border, boxShadow) that
// composes the look. Subset is enough for 90% of UGC card surfaces — for
// fully custom cards, fall back to inline styles + token references.
// ──────────────────────────────────────────────────────────────────────────
export const cardStyle = {
  /** Default frost — quiet, used as the resting state for grid cards. */
  frost: {
    background: 'rgba(255,255,255,0.025)',
    border: `1px solid ${colors.stroke.subtle}`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  /** "你创造的" amber rim — used on user-generated content the current
   *  visitor authored (matches the "我的" filter chip color). */
  mine: {
    background: gradients.cardPack,
    border: '1px solid rgba(255,184,76,0.32)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  /** Top-3 monthly leaderboard medal card. */
  medal: {
    background: gradients.cardMedal,
    border: '1px solid rgba(255,184,76,0.55)',
    boxShadow: '0 10px 36px rgba(255,184,76,0.22), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  /** Talkshow content card (creative gradient). */
  talkshow: {
    background: gradients.cardTalkshow,
    border: '1px solid rgba(255,85,136,0.20)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  /** Fired (urgent) content card. */
  fired: {
    background: gradients.cardFired,
    border: '1px solid rgba(255,51,85,0.25)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  },
} as const;

/**
 * Helper:  `cssVar('brand-neon')` → `'var(--brand-neon)'`. Keeps JS sites
 * referencing the exact same tokens as CSS without requiring imports on both
 * sides when the variable already exists in index.css.
 */
export function cssVar(name: string): string {
  return `var(--${name})`;
}
