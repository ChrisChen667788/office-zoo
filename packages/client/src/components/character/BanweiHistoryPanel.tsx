/**
 * BanweiHistoryPanel — v6.37 P2 你最近 12 周班味曲线 + 历史最佳周.
 *
 * Reads /api/banwei (GET) — same store BanweiIndexCard POSTs into. The
 * server already caps history at 12 snapshots per user (banwei.ts:116),
 * so we just render whatever comes back.
 *
 * UI: SVG sparkline (no recharts dep — too heavy for a 12-point line),
 * y-axis 0..100 with subtle gridline at 50; circle marker on each
 * data point, gold halo on the all-time-best week's marker; tooltip
 * via native <title> for "<weekKey> · <score>" on hover.
 *
 * Empty / one-point states render an inline call-to-action instead
 * of a broken-looking chart.
 */
import { useEffect, useState } from 'react';
import { getUserId } from '../../utils/userId';

interface Snapshot {
  weekKey: string;
  score: number;
}

interface Response {
  thisWeek: Snapshot | null;
  prior: Snapshot | null;
  delta: number | null;
  history: Snapshot[];
}

const W = 320;
const H = 120;
const PAD_X = 18;
const PAD_Y = 14;

export default function BanweiHistoryPanel() {
  const [data, setData] = useState<Response | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    fetch('/api/banwei', { headers: { 'X-User-Id': userId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { setData(d as Response); setErr(null); })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) {
    return (
      <div style={{
        marginTop: 16, padding: 14, borderRadius: 14,
        background: 'rgba(15,14,46,0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center',
      }}>📅 班味存档暂不可用 ({err})</div>
    );
  }
  if (!data) return null;

  const history = data.history ?? [];
  const sortedAsc = [...history].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
  const best = sortedAsc.reduce<Snapshot | null>(
    (top, s) => (!top || s.score > top.score ? s : top), null,
  );

  return (
    <div style={{
      marginTop: 16, padding: 14, borderRadius: 14,
      background: 'rgba(15,14,46,0.6)',
      border: '1px solid rgba(78,205,196,0.3)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
            color: '#4ECDC4', textTransform: 'uppercase', marginBottom: 4,
          }}>📅 BANWEI HISTORY · 我的班味档案</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            最近 {sortedAsc.length}/12 周 · 看你卷得稳不稳
          </div>
        </div>
        {best && (
          <div style={{
            fontSize: 10, color: '#FFD700', fontWeight: 800,
            letterSpacing: '0.05em', textAlign: 'right',
          }}>
            🏆 最高 {best.score}
            <div style={{ fontSize: 9, color: 'rgba(255,215,0,0.55)', fontWeight: 600 }}>
              {best.weekKey}
            </div>
          </div>
        )}
      </div>

      {sortedAsc.length < 2 ? (
        <div style={{
          padding: 18, textAlign: 'center', fontSize: 12,
          color: 'rgba(255,255,255,0.45)',
        }}>
          🌱 至少 2 周才能画曲线 · 下周回来看趋势
        </div>
      ) : (
        <Sparkline points={sortedAsc} best={best} />
      )}
    </div>
  );
}

function Sparkline({ points, best }: { points: Snapshot[]; best: Snapshot | null }) {
  const xs = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / Math.max(1, points.length - 1);
  // Y axis fixed 0..100; bigger score = higher pixel position
  const ys = (s: number) => H - PAD_Y - (s / 100) * (H - PAD_Y * 2);
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.score).toFixed(1)}`)
    .join(' ');
  // Filled area under the line for visual weight
  const fillPath = `${linePath} L ${xs(points.length - 1).toFixed(1)} ${(H - PAD_Y).toFixed(1)} L ${xs(0).toFixed(1)} ${(H - PAD_Y).toFixed(1)} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      preserveAspectRatio="none"
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
    >
      {/* Gridline at 50 — eyeball reference for "above/below mid" */}
      <line
        x1={PAD_X} x2={W - PAD_X}
        y1={ys(50)} y2={ys(50)}
        stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" strokeWidth="0.8"
      />
      {/* Area fill */}
      <path d={fillPath} fill="rgba(78,205,196,0.15)" />
      {/* Line */}
      <path d={linePath} fill="none" stroke="#4ECDC4" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Data points */}
      {points.map((p, i) => {
        const isBest = !!best && p.weekKey === best.weekKey;
        return (
          <g key={p.weekKey}>
            {isBest && (
              <circle
                cx={xs(i)} cy={ys(p.score)} r="6"
                fill="rgba(255,215,0,0.25)" stroke="rgba(255,215,0,0.5)" strokeWidth="0.8"
              />
            )}
            <circle
              cx={xs(i)} cy={ys(p.score)} r={isBest ? 3.2 : 2.4}
              fill={isBest ? '#FFD700' : '#4ECDC4'}
              stroke="rgba(15,14,46,0.95)" strokeWidth="0.8"
            >
              <title>{p.weekKey} · {p.score} 分</title>
            </circle>
          </g>
        );
      })}
      {/* X-axis labels — first / last week for orientation. */}
      <text
        x={PAD_X} y={H - 2}
        fontSize="8" fill="rgba(255,255,255,0.42)"
        fontFamily="ui-monospace, SF Mono, Menlo, monospace"
      >{points[0].weekKey}</text>
      <text
        x={W - PAD_X} y={H - 2}
        textAnchor="end"
        fontSize="8" fill="rgba(255,255,255,0.42)"
        fontFamily="ui-monospace, SF Mono, Menlo, monospace"
      >{points[points.length - 1].weekKey}</text>
    </svg>
  );
}
