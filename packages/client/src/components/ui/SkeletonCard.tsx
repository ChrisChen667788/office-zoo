/**
 * SkeletonCard — shimmer placeholder for grid card loading states.
 *
 * v0.9.2.1. Replaces the bland "⏳ 加载中…" text we had on talkshow / fired /
 * pack lists. Renders the rough shape of a card (top row with two pill
 * shapes, a multi-line title block, and a bottom-row meta strip) using
 * the `.shimmer` utility from index.css.
 *
 * Three variants:
 *   - 'compact' (~140 px tall) — talkshow grid cards
 *   - 'standard' (~168 px) — fired scenarios
 *   - 'rich' (~180 px) — packs (with the slot-emoji preview row)
 *
 * Pass `count` to render a row of N skeletons; default 6 fills a typical
 * 3-column grid above the fold.
 */

interface SkeletonCardProps {
  variant?: 'compact' | 'standard' | 'rich';
  count?: number;
}

export function SkeletonCard({ variant = 'standard', count = 1 }: SkeletonCardProps) {
  const minH = variant === 'compact' ? 140 : variant === 'rich' ? 180 : 168;

  const single = (k: number) => (
    <div
      key={k}
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{
        minHeight: minH,
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Top row — tag pill + meta */}
      <div className="flex items-center justify-between">
        <div className="shimmer" style={{ height: 16, width: 56, borderRadius: 999 }} />
        <div className="shimmer" style={{ height: 12, width: 32, borderRadius: 4 }} />
      </div>
      {/* Title — 2 lines */}
      <div className="space-y-1.5">
        <div className="shimmer" style={{ height: 14, width: '88%', borderRadius: 4 }} />
        <div className="shimmer" style={{ height: 14, width: '60%', borderRadius: 4 }} />
      </div>
      {/* Bottom row — persona/emoji + heart pill */}
      <div className="flex items-center gap-2 mt-auto">
        <div className="shimmer" style={{ height: 12, width: 60, borderRadius: 4 }} />
        {variant === 'rich' && (
          <div className="shimmer ml-1" style={{ height: 14, width: 90, borderRadius: 4 }} />
        )}
        <div className="shimmer ml-auto" style={{ height: 18, width: 48, borderRadius: 999 }} />
      </div>
    </div>
  );

  if (count === 1) return single(0);
  return (
    <>
      {Array.from({ length: count }, (_, i) => single(i))}
    </>
  );
}
