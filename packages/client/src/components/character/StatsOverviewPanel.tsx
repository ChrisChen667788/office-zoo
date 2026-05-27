/**
 * StatsOverviewPanel — v6.32 P1. Renders /api/stats/overview into
 * three pieces: global trio (totalGames / totalSpeeches / totalLeaks),
 * Top 5 rats podium, per-user hit-rate gauge.
 *
 * Sits in Profile alongside MyLeaksPanel + AchievementsPanel. Polls
 * once on mount + on window focus (cheap endpoint, no socket needed).
 * Anonymous-friendly — if X-User-Id sends a stranger id, user block
 * comes back zeroed and the gauge displays "—".
 */
import { useEffect, useState } from 'react';
import { getUserId } from '../../utils/userId';

interface StatsResponse {
  global: {
    totalGames: number;
    activeGames: number;
    totalPlayersSpawned: number;
    totalSpeeches: number;
    totalLeaks: number;
    totalLeakQuotes: number;
    hitRate: number;
    topRats: Array<{ name: string; count: number }>;
  };
  user: null | {
    leaks: number;
    leakQuotes: number;
    hitRate: number;
  };
  serverUptimeSec: number;
}

export default function StatsOverviewPanel() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = () => {
      fetch('/api/stats/overview', {
        headers: { 'X-User-Id': getUserId() },
      })
        .then((r) => r.ok ? r.json() : Promise.reject(r.status))
        .then((d) => { setData(d as StatsResponse); setErr(null); })
        .catch((e) => setErr(String(e)));
    };
    fetchStats();
    window.addEventListener('focus', fetchStats);
    return () => window.removeEventListener('focus', fetchStats);
  }, []);

  if (err) {
    return (
      <div style={{
        marginTop: 16, padding: 14, borderRadius: 14,
        background: 'rgba(15,14,46,0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center',
      }}>
        📊 stats 暂未就绪 ({err})
      </div>
    );
  }
  if (!data) return null;

  const g = data.global;
  const u = data.user;
  const userHitRate = u && u.leaks > 0 ? u.hitRate : null;

  return (
    <div style={{
      marginTop: 16, padding: 14, borderRadius: 14,
      background: 'rgba(15,14,46,0.6)',
      border: '1px solid rgba(78,205,196,0.32)',
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
          color: '#4ECDC4', textTransform: 'uppercase', marginBottom: 4,
        }}>📊 SERVER STATS · 全网概览</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
          服务器累计 (启动以来) · 启动 {formatUptime(data.serverUptimeSec)} · 实时刷新
        </div>
      </div>

      {/* Global trio */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14,
      }}>
        <StatBox label="开局" value={g.totalGames} sub={`${g.activeGames} 在线`} color="#4ECDC4" />
        <StatBox label="鼠人发言" value={g.totalSpeeches} sub="累计 speech" color="#FFD700" />
        <StatBox label="爆料" value={g.totalLeaks} sub={`命中 ${g.totalLeakQuotes}`} color="#B086FF" />
      </div>

      {/* Top 5 rats podium */}
      {g.topRats.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
            marginBottom: 6,
          }}>🐀 出场最多 TOP 5</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {g.topRats.map((rat, i) => {
              const max = g.topRats[0].count;
              const pct = max > 0 ? (rat.count / max) * 100 : 0;
              const trophy = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i];
              return (
                <div key={rat.name} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 11.5,
                }}>
                  <span style={{ width: 18 }}>{trophy}</span>
                  <span style={{ width: 70, color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{rat.name}</span>
                  <div style={{
                    flex: 1, height: 6, borderRadius: 4,
                    background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${pct}%`, height: '100%',
                      background: 'linear-gradient(90deg, #4ECDC4, #B086FF)',
                      transition: 'width 0.32s ease-out',
                    }} />
                  </div>
                  <span style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.6)',
                    fontVariantNumeric: 'tabular-nums', width: 30, textAlign: 'right',
                  }}>{rat.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-user hit-rate gauge */}
      <div style={{
        padding: '10px 12px', borderRadius: 10,
        background: 'rgba(176,134,255,0.10)',
        border: '1px solid rgba(176,134,255,0.32)',
      }}>
        <div style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em',
          color: '#B086FF', textTransform: 'uppercase', marginBottom: 6,
        }}>你的全网命中率</div>
        {userHitRate === null ? (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            还没投过爆料 — Classic 模式里点 战术 @ 试试
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#FFD700', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(userHitRate * 100)}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.45)' }}>%</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                height: 8, borderRadius: 4,
                background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${Math.min(100, userHitRate * 100)}%`, height: '100%',
                  background: 'linear-gradient(90deg, #B086FF, #FFD700)',
                  transition: 'width 0.32s ease-out',
                }} />
              </div>
              <div style={{
                fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 4,
              }}>
                {u!.leakQuotes} / {u!.leaks} 条被 AI 引用
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div style={{
      padding: '8px 8px 7px', borderRadius: 8,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
        color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase',
        marginTop: 2,
      }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h${m}m`;
}
