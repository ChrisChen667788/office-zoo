/**
 * BanweiIndexCard — v6.32 P5 周报 班味指数 0-100.
 *
 * Posts current client-side counters (gamesSeen / talkshowPlayed /
 * anniversaryVisited) to /api/banwei. Server merges with its own
 * per-user leak tallies, computes score + WoW delta + persists.
 *
 * UI: big score badge (gradient color tier), 5-axis breakdown bar,
 * week-over-week chevron (↗ / ↘ / =). Sits in Profile.
 */
import { useEffect, useState } from 'react';
import { getUserId } from '../../utils/userId';
import { getProgress } from '../../utils/achievements';
import { getLeakStats } from '../../utils/leakStats';

interface Snapshot {
  weekKey: string;
  leaks: number;
  leakQuotes: number;
  gamesSeen: number;
  talkshowPlayed: number;
  anniversaryVisited: number;
  score: number;
}

interface Response {
  thisWeek: Snapshot;
  prior: Snapshot | null;
  delta: number | null;
}

export default function BanweiIndexCard() {
  const [data, setData] = useState<Response | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    const body = {
      gamesSeen: getProgress('classic_finished'),
      talkshowPlayed: getProgress('talkshow_played'),
      anniversaryVisited: getProgress('anniversary_finished'),
    };
    // Also surface client-only leak stats so server has a fallback if
    // its in-memory tally got reset on restart. (Server reads its own
    // tally as authoritative; this is just informative.)
    void getLeakStats();
    fetch('/api/banwei', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify(body),
    })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
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
      }}>📈 班味指数暂不可用 ({err})</div>
    );
  }
  if (!data) return null;

  const { thisWeek, prior, delta } = data;
  const tier = scoreTier(thisWeek.score);
  const arrow = delta === null ? '·' : delta > 0 ? '↗' : delta < 0 ? '↘' : '=';
  const arrowColor = delta === null ? 'rgba(255,255,255,0.4)' : delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : 'rgba(255,255,255,0.6)';

  return (
    <div style={{
      marginTop: 16, padding: 14, borderRadius: 14,
      background: 'rgba(15,14,46,0.6)',
      border: `1px solid ${tier.accent}55`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
            color: tier.accent, textTransform: 'uppercase', marginBottom: 4,
          }}>📈 BANWEI INDEX · 班味指数</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            本周 {thisWeek.weekKey} · 你的"班味"得分综合: PSYWAR + 经典局 + 段子 + 周年
          </div>
        </div>
      </div>

      {/* Score + WoW */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
        <div style={{
          width: 84, height: 84, borderRadius: 16,
          background: `linear-gradient(135deg, ${tier.accent} 0%, ${tier.accent2} 100%)`,
          display: 'grid', placeItems: 'center',
          boxShadow: `0 0 20px ${tier.accent}55`,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 30, fontWeight: 900, color: '#0a0a1e',
              fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            }}>{thisWeek.score}</div>
            <div style={{
              fontSize: 8, fontWeight: 900, color: 'rgba(10,10,30,0.7)',
              letterSpacing: '0.15em', marginTop: 2,
            }}>SCORE</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 14, fontWeight: 900, color: tier.accent, marginBottom: 4,
          }}>{tier.label}</div>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 6,
            fontSize: 11, color: 'rgba(255,255,255,0.55)',
          }}>
            {prior ? (
              <>
                <span>上周 {prior.score}</span>
                <span style={{ color: arrowColor, fontWeight: 900, fontSize: 16 }}>{arrow}</span>
                <span style={{ color: arrowColor }}>
                  {delta === 0 ? '持平' : `${delta! > 0 ? '+' : ''}${delta}`}
                </span>
              </>
            ) : (
              <span>第一次班味打卡, 下周回来看变化 →</span>
            )}
          </div>
        </div>
      </div>

      {/* Breakdown bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <BreakRow label="爆料投递" count={thisWeek.leaks}      cap={10} weight={3} />
        <BreakRow label="AI 引用" count={thisWeek.leakQuotes} cap={5}  weight={6} />
        <BreakRow label="经典局"  count={thisWeek.gamesSeen}   cap={5}  weight={4} />
        <BreakRow label="段子听" count={thisWeek.talkshowPlayed} cap={5} weight={2} />
        <BreakRow label="周年回顾" count={thisWeek.anniversaryVisited} cap={1} weight={10} />
      </div>
    </div>
  );
}

function BreakRow({ label, count, cap, weight }: { label: string; count: number; cap: number; weight: number }) {
  const pct = cap > 0 ? Math.min(100, (count / cap) * 100) : 0;
  const contrib = Math.min(count, cap) * weight;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
      <span style={{ width: 64, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
      <div style={{
        flex: 1, height: 6, borderRadius: 4,
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: pct >= 100 ? 'linear-gradient(90deg, #FFD700, #FFA947)' : 'linear-gradient(90deg, #4ECDC4, #B086FF)',
          transition: 'width 0.32s ease-out',
        }} />
      </div>
      <span style={{
        fontSize: 10, color: 'rgba(255,255,255,0.55)',
        fontVariantNumeric: 'tabular-nums', width: 50, textAlign: 'right',
      }}>{count}/{cap} +{contrib}</span>
    </div>
  );
}

function scoreTier(score: number): { label: string; accent: string; accent2: string } {
  if (score >= 80) return { label: '班味永动机 🔥', accent: '#FFD700', accent2: '#FFA947' };
  if (score >= 60) return { label: '资深打工人 💼', accent: '#FF4FA3', accent2: '#7c3aed' };
  if (score >= 40) return { label: '稳定输出中 ⚙️', accent: '#4ECDC4', accent2: '#2fb8ff' };
  if (score >= 20) return { label: '边缘观察员 👀', accent: '#B086FF', accent2: '#7c3aed' };
  return { label: '试用期 🌱', accent: 'rgba(255,255,255,0.55)', accent2: 'rgba(255,255,255,0.3)' };
}
