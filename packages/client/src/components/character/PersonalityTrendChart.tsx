/**
 * PersonalityTrendChart — v6.15 P1 30-day SVG stacked-area chart.
 *
 * Renders the per-day personality split of the user's spectator events
 * from /api/characters/me/trend's rawEvents. Top-4 personalities get
 * their own colored area; remaining 4 collapse into a single "其他"
 * grey area to avoid spaghetti at the bottom.
 *
 * Pure SVG — no charting lib dep. Hover any day shows a tooltip with
 * the per-personality breakdown. Empty days are zero-tall (chart
 * shrinks naturally on quiet weeks).
 *
 * Why stacked area (not lines): "personality mix" reads better as
 * proportions than as 8 independent lines. The eye sees "which color
 * dominates each day" at a glance.
 */
import { useMemo, useState } from 'react';

interface ViewEvent {
  ts: number;
  characterName: string;
  personality?: string;
  won: boolean;
}

// v6.16 P2 — promoted to shared constants module.
import { PERSONALITY_LABELS_LITE } from '../../constants/personalityLabels';
const OTHER_COLOR = '#666';
const OTHER_LABEL = '其他';

interface Props {
  rawEvents: ViewEvent[];
  windowDays?: number;
}

const W = 480;
const H = 180;
const PAD_L = 20;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 26;

export default function PersonalityTrendChart({ rawEvents, windowDays = 30 }: Props) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  // Pre-compute the daily buckets + top-4 series.
  const { days, series, maxStack, dayLabels } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayMs = now.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const startMs = todayMs - (windowDays - 1) * dayMs;

    // Day index → personality counts.
    const buckets: Record<string, number>[] = Array.from({ length: windowDays }, () => ({}));
    const totalsByPersonality: Record<string, number> = {};
    for (const e of rawEvents) {
      if (!e.personality) continue;
      const idx = Math.floor((e.ts - startMs) / dayMs);
      if (idx < 0 || idx >= windowDays) continue;
      buckets[idx][e.personality] = (buckets[idx][e.personality] ?? 0) + 1;
      totalsByPersonality[e.personality] = (totalsByPersonality[e.personality] ?? 0) + 1;
    }

    // Pick top-4 personalities globally. Rest go into "OTHER" bucket.
    const top4 = Object.entries(totalsByPersonality)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id]) => id);

    // Per-day stacked array — [series0, series1, series2, series3, other]
    const series: { id: string; label: string; color: string; perDay: number[] }[] = [];
    for (const id of top4) {
      const meta = PERSONALITY_LABELS_LITE[id] ?? { label: id, emoji: '·', color: '#888' };
      series.push({
        id, label: meta.label, color: meta.color,
        perDay: buckets.map((b) => b[id] ?? 0),
      });
    }
    // OTHER series: sum everything not in top-4 per day.
    const otherPerDay = buckets.map((b) => {
      let sum = 0;
      for (const [p, c] of Object.entries(b)) {
        if (!top4.includes(p)) sum += c;
      }
      return sum;
    });
    if (otherPerDay.some((v) => v > 0)) {
      series.push({ id: 'other', label: OTHER_LABEL, color: OTHER_COLOR, perDay: otherPerDay });
    }

    // Max stack height across all days for Y-axis scale.
    const maxStack = Math.max(
      1,
      ...buckets.map((b, idx) => series.reduce((sum, s) => sum + s.perDay[idx], 0)),
    );

    // Day labels — show every 5 days + last to keep axis readable.
    const dayLabels = Array.from({ length: windowDays }, (_, i) => {
      const d = new Date(startMs + i * dayMs);
      const show = i === 0 || i === windowDays - 1 || (i + 1) % 7 === 0;
      return show ? `${d.getMonth() + 1}/${d.getDate()}` : '';
    });

    return { days: windowDays, series, maxStack, dayLabels };
  }, [rawEvents, windowDays]);

  if (rawEvents.length === 0 || series.length === 0) {
    return (
      <div style={{
        width: '100%', maxWidth: W, height: 80, margin: '8px auto 0',
        borderRadius: 10, border: '1px dashed rgba(255,215,0,0.18)',
        background: 'rgba(255,215,0,0.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(248,244,227,0.4)', fontSize: 11, fontWeight: 600,
      }}>30 天还无观战数据 — 看一局 Classic 让趋势跑起来</div>
    );
  }

  // Build stacked area paths.
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xOf = (i: number) => PAD_L + (i / (days - 1)) * innerW;
  const yOf = (val: number) => PAD_T + innerH - (val / maxStack) * innerH;

  // Cumulative sums per day for stacking.
  const cum: number[][] = series.map(() => Array(days).fill(0));
  for (let d = 0; d < days; d++) {
    let running = 0;
    for (let s = 0; s < series.length; s++) {
      running += series[s].perDay[d];
      cum[s][d] = running;
    }
  }

  function areaPath(seriesIdx: number): string {
    const upper = cum[seriesIdx];
    const lower = seriesIdx === 0 ? Array(days).fill(0) : cum[seriesIdx - 1];
    let path = `M ${xOf(0)} ${yOf(upper[0])}`;
    for (let i = 1; i < days; i++) {
      path += ` L ${xOf(i)} ${yOf(upper[i])}`;
    }
    // Walk back along lower edge.
    for (let i = days - 1; i >= 0; i--) {
      path += ` L ${xOf(i)} ${yOf(lower[i])}`;
    }
    path += ' Z';
    return path;
  }

  return (
    <div style={{ width: '100%', maxWidth: W, margin: '10px auto 0' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Y-axis dotted grid lines */}
        {[0, 0.5, 1].map((p) => (
          <line key={p} x1={PAD_L} x2={W - PAD_R}
            y1={PAD_T + innerH * (1 - p)} y2={PAD_T + innerH * (1 - p)}
            stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}
            strokeDasharray="2 3" />
        ))}
        {/* Max-stack label top-left */}
        <text x={PAD_L} y={PAD_T - 4} fontSize={9}
          fill="rgba(248,244,227,0.4)" fontWeight={700}>{maxStack}</text>

        {/* Stacked area paths */}
        {series.map((s, i) => (
          <path key={s.id} d={areaPath(i)} fill={s.color}
            fillOpacity={0.65} stroke={s.color} strokeWidth={0.8} />
        ))}

        {/* Invisible hover hit zones per day */}
        {Array.from({ length: days }).map((_, i) => {
          const x = xOf(i) - (innerW / (days - 1)) / 2;
          const w = innerW / (days - 1);
          return (
            <rect key={i} x={x} y={PAD_T} width={w} height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverDay(i)}
              onMouseLeave={() => setHoverDay((cur) => (cur === i ? null : cur))}
              style={{ cursor: 'crosshair' }} />
          );
        })}

        {/* Hover guide line + dot per series */}
        {hoverDay !== null && (
          <>
            <line x1={xOf(hoverDay)} x2={xOf(hoverDay)} y1={PAD_T} y2={PAD_T + innerH}
              stroke="rgba(255,215,0,0.55)" strokeWidth={1} strokeDasharray="3 2" />
            {series.map((s, i) => (
              cum[i][hoverDay] > (i === 0 ? 0 : cum[i - 1][hoverDay]) && (
                <circle key={s.id} cx={xOf(hoverDay)} cy={yOf(cum[i][hoverDay])}
                  r={3} fill={s.color} stroke="#0a0a1e" strokeWidth={1.5} />
              )
            ))}
          </>
        )}

        {/* X-axis day labels */}
        {dayLabels.map((label, i) => label && (
          <text key={i} x={xOf(i)} y={H - 8} fontSize={8.5}
            textAnchor="middle" fill="rgba(248,244,227,0.45)" fontWeight={600}>{label}</text>
        ))}
      </svg>

      {/* Tooltip below chart when hovering */}
      {hoverDay !== null && (
        <div style={{
          marginTop: 6, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(20,15,40,0.85)',
          border: '1px solid rgba(255,215,0,0.32)',
          fontSize: 11, color: 'rgba(248,244,227,0.85)',
        }}>
          <div style={{ fontWeight: 800, color: '#FFD700', marginBottom: 4 }}>
            {(() => {
              const dayMs = 24 * 60 * 60 * 1000;
              const todayMs = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
              const startMs = todayMs - (windowDays - 1) * dayMs;
              const d = new Date(startMs + hoverDay * dayMs);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            })()}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {series.map((s) => s.perDay[hoverDay] > 0 && (
              <span key={s.id} style={{ color: s.color, fontWeight: 700 }}>
                {s.label} ×{s.perDay[hoverDay]}
              </span>
            ))}
            {series.every((s) => s.perDay[hoverDay] === 0) && (
              <span style={{ color: 'rgba(248,244,227,0.4)' }}>这天没看戏</span>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{
        marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8,
        fontSize: 9.5, fontWeight: 700,
      }}>
        {series.map((s) => (
          <span key={s.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: s.color,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 2, background: s.color,
              boxShadow: `0 0 4px ${s.color}88`,
            }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
