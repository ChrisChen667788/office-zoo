/**
 * personalityLabels — v6.16 single source of truth for client-side
 * personality presentation (label / emoji / color / icon URL).
 *
 * Replaces 7 near-duplicate Record literals scattered across Classic /
 * Immersive / Result / FiredChat / PersonaCard / TopRatsPanel /
 * PersonalityTrendChart. The label / emoji / color triple appeared in
 * every file; some also needed the icon image URL from
 * `personalityIcons`.
 *
 * Two exports for the two use shapes:
 *   - PERSONALITY_LABELS — full entry { label, emoji, color, icon }.
 *     Use in components that render the <Icon> component with image fallback.
 *   - PERSONALITY_LABELS_LITE — same minus icon. Use in components that
 *     only render emoji + label + color (popover / chip / chart).
 *
 * Both export the SAME entries — just different keys. Maintaining a
 * single canonical map prevents drift (e.g. one file accidentally
 * having `'暴躁老哥'` vs `'暴躁哥'`).
 */
import { personalityIcons } from './icons';

export interface PersonalityLabel {
  label: string;
  emoji: string;
  color: string;
  icon: string;  // PNG URL from personalityIcons
}

export interface PersonalityLabelLite {
  label: string;
  emoji: string;
  color: string;
}

export const PERSONALITY_LABELS: Record<string, PersonalityLabel> = {
  social_butterfly:   { label: '社牛',   emoji: '🦋', icon: personalityIcons.social_butterfly,   color: '#FF6B9D' },
  introvert:          { label: '社恐',   emoji: '🐢', icon: personalityIcons.introvert,          color: '#7EC8E3' },
  contrarian:         { label: '杠精',   emoji: '🔨', icon: personalityIcons.contrarian,         color: '#FF4444' },
  sycophant:          { label: '舔狗',   emoji: '🐶', icon: personalityIcons.sycophant,          color: '#FFB347' },
  passive_aggressive: { label: '阴阳人', emoji: '🌗', icon: personalityIcons.passive_aggressive, color: '#B19CD9' },
  hot_tempered:       { label: '暴躁哥', emoji: '🌋', icon: personalityIcons.hot_tempered,       color: '#FF6347' },
  smooth_operator:    { label: '老狐狸', emoji: '🦊', icon: personalityIcons.smooth_operator,    color: '#DAA520' },
  workaholic:         { label: '卷王',   emoji: '📈', icon: personalityIcons.workaholic,         color: '#00CED1' },
};

/** Same entries minus the icon URL — for components that don't need it. */
export const PERSONALITY_LABELS_LITE: Record<string, PersonalityLabelLite> = Object.fromEntries(
  Object.entries(PERSONALITY_LABELS).map(([id, v]) => [id, {
    label: v.label, emoji: v.emoji, color: v.color,
  }]),
);

/** Ordered list of all personality ids — useful for selectors that need
 *  to render every option (e.g. v6.16 vote ballot). */
export const ALL_PERSONALITY_IDS = Object.keys(PERSONALITY_LABELS);
