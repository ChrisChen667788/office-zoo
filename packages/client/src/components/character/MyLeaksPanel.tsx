/**
 * MyLeaksPanel — v6.27 P4 "你的爆料命中率" Profile section.
 *
 * Mirrors MyBallotsPanel / MyDuelsPanel pattern. Reads localStorage
 * leakStats (no backend dep — anonymous-friendly), shows submitted /
 * quoted / hit-rate %, plus a small history list of recent leaks with
 * ✨ markers on the ones AI actually quoted.
 *
 * Empty state: soft nudge "去 Classic 模式开个战术 @ 试试" to drive
 * users into the v6.25 P1 + v6.26 P1 PSYWAR feature.
 *
 * Why on /profile: the hit-rate is a personal-identity bragging metric
 * ("I'm 60% effective at manipulating AI") that pairs naturally with
 * MyBallotsPanel and MyDuelsPanel. Profile is the natural home.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLeakStats, hitRate, type LeakStats } from '../../utils/leakStats';

export default function MyLeaksPanel() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<LeakStats | null>(null);

  // Reads from localStorage on mount + on focus (user may have submitted
  // leaks in another tab during this session). Focus listener is cheap
  // and reads a single localStorage key.
  useEffect(() => {
    const refresh = () => setStats(getLeakStats());
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  if (!stats) return null;
  const rate = hitRate(stats);
  const rateLabel = stats.submitted > 0 ? `${Math.round(rate * 100)}%` : '—';
  // Color the rate by tier — 50%+ gold, 20-49% violet, <20% white-soft.
  const rateColor = rate >= 0.5 ? '#FFD700' : rate >= 0.2 ? '#B086FF' : 'rgba(248,244,227,0.55)';

  const recent = [...stats.history].reverse().slice(0, 8);

  return (
    <div style={{
      marginTop: 16, padding: 14, borderRadius: 14,
      background: 'rgba(15,14,46,0.6)',
      border: '1px solid rgba(176,134,255,0.25)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, marginBottom: 8,
      }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
            color: '#FFD58A', textTransform: 'uppercase', marginBottom: 4,
          }}>👻 LEAK STATS · 你的爆料命中率</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            Classic 模式的"战术 @" 给 AI 发匿名前同事爆料 — 这里看 AI 真引用了几条
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          title="去 Landing 启动经典模式"
          style={{
            padding: '4px 10px', borderRadius: 8,
            background: 'rgba(176,134,255,0.16)',
            color: '#B086FF',
            fontWeight: 800, fontSize: 10,
            border: '1px solid rgba(176,134,255,0.45)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >投点 @ ↗</button>
      </div>

      {/* Stat trio — 3 number boxes in a row, big numbers + small caption */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12,
      }}>
        <StatBox label="已提交" value={stats.submitted} color="rgba(248,244,227,0.85)" />
        <StatBox label="AI 引用" value={stats.quoted} color="#FFD700" />
        <StatBox label="命中率" value={rateLabel} color={rateColor} />
      </div>

      {/* Recent leak history list — collapsed in empty state */}
      {recent.length === 0 ? (
        <div style={{
          padding: '14px 10px', textAlign: 'center',
          color: 'rgba(255,255,255,0.4)', fontSize: 11,
          background: 'rgba(255,255,255,0.02)', borderRadius: 8,
        }}>
          还没投过 — Classic 开局后, 鬼魂群里点 "战术 @" 试试
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
            marginBottom: 2,
          }}>最近 {recent.length} 条 (✨ = AI 引用)</div>
          {recent.map((h, i) => (
            <div key={`${h.ts}-${i}`} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 9px', borderRadius: 6,
              background: h.quotedBy ? 'rgba(255,215,0,0.10)' : 'rgba(255,255,255,0.04)',
              border: h.quotedBy ? '1px solid rgba(255,215,0,0.32)' : '1px solid transparent',
              fontSize: 11,
            }}>
              <span style={{
                fontSize: 10, color: h.quotedBy ? '#FFD700' : 'rgba(255,255,255,0.3)',
                width: 14, textAlign: 'center',
              }}>{h.quotedBy ? '✨' : '·'}</span>
              <span style={{
                flex: 1, color: 'rgba(255,255,255,0.78)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{h.text}</span>
              {h.quotedBy && (
                <span style={{ fontSize: 9.5, color: '#FFD700', fontWeight: 700 }}>
                  → {h.quotedBy}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{
      padding: '8px 6px', borderRadius: 8,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color }}>
        {value}
      </div>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
        color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase',
        marginTop: 2,
      }}>{label}</div>
    </div>
  );
}
