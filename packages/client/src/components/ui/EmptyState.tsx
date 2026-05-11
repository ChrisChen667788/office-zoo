/**
 * EmptyState — illustrated empty grid placeholder.
 *
 * v0.9.2.1. Replaces bland text strings like "还没有闯关包,做第一个开拓者?"
 * with a soft glowing emoji + heading + body + optional CTA. Looks more
 * intentional than a single line of muted text and gives the user
 * something to do (the CTA).
 *
 * The emoji floats subtly via `.floaty` from index.css. The whole block is
 * wrapped in a soft radial-glow background so it reads as a designed
 * centerpiece, not a fallback error.
 */

import type { CSSProperties, ReactNode } from 'react';

interface EmptyStateProps {
  /** Hero glyph — emoji or any character. Big (4xl). */
  emoji: string;
  /** Headline — bold, white. */
  title: string;
  /** Body copy under the title. Optional. */
  body?: ReactNode;
  /** Optional CTA at the bottom. Provide both label + onClick. */
  cta?: { label: string; onClick: () => void };
  /** Glow tint (rgba). Defaults to violet so it slots into both
   *  talkshow + fired layouts without re-tuning. */
  glow?: string;
  /** Extra wrapper styles (margin overrides, etc). */
  style?: CSSProperties;
}

export function EmptyState({
  emoji,
  title,
  body,
  cta,
  glow = 'rgba(124,58,237,0.18)',
  style,
}: EmptyStateProps) {
  return (
    <div
      className="col-span-full flex flex-col items-center justify-center text-center py-12 px-4"
      style={style}
    >
      <div
        className="relative w-24 h-24 grid place-items-center mb-4"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${glow} 0%, transparent 65%)`,
        }}
      >
        <span className="text-5xl floaty select-none" aria-hidden>
          {emoji}
        </span>
      </div>
      <h3 className="text-base font-bold text-white/90 mb-1.5">{title}</h3>
      {body && (
        <p className="text-[12px] text-white/55 max-w-xs leading-relaxed">{body}</p>
      )}
      {cta && (
        <button
          onClick={cta.onClick}
          className="mt-4 px-5 py-2 rounded-xl text-xs font-bold tracking-wide text-white transition"
          style={{
            background: 'linear-gradient(135deg, #ff5588, #7c3aed)',
            boxShadow: '0 6px 18px rgba(255,85,136,0.35)',
          }}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
