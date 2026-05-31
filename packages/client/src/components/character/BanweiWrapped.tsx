/**
 * BanweiWrapped — v6.39 P6 班味年终回顾 (Spotify-Wrapped 风).
 *
 * Aggregates everything we already track into a single "你的这一年有多
 * 班味" recap card, expandable from a collapsed teaser on Profile:
 *
 *   - 班味峰值周 + 分数（banwei history max）
 *   - 平均班味 + 打卡周数（history length + mean）
 *   - 趋势（最近一周 vs 第一周，↗/↘/=）
 *   - 爆料命中率（leakStats submitted/quoted）
 *   - 解锁成就数（achievements getUnlocked().size / total）
 *   - 一句"年度班味人格"标签（按峰值分段）
 *
 * All data is client-side / from existing endpoints — no new server work.
 * Collapsed by default so it doesn't push the rest of Profile down.
 */
import { useEffect, useState } from 'react';
import { getUserId } from '../../utils/userId';
import { getLeakStats } from '../../utils/leakStats';
import { getUnlocked, ACHIEVEMENTS } from '../../utils/achievements';
import { downloadBanweiWrappedCard } from '../../utils/banweiWrappedCard';

interface Snapshot { weekKey: string; score: number; }
interface BanweiGetResponse { history: Snapshot[]; }

interface WrappedStats {
  weeks: number;
  peakScore: number;
  peakWeek: string;
  avgScore: number;
  trend: number | null; // last - first, null if <2 weeks
  leaksSubmitted: number;
  leaksQuoted: number;
  hitRate: number | null; // quoted/submitted, null if 0 submitted
  achUnlocked: number;
  achTotal: number;
}

/** Year-end persona by peak score — a punchier label than the weekly tier. */
function yearPersona(peak: number): { label: string; emoji: string; accent: string } {
  if (peak >= 80) return { label: '年度班味永动机', emoji: '🔥', accent: '#FFD700' };
  if (peak >= 60) return { label: '资深职场显眼包', emoji: '💼', accent: '#FF4FA3' };
  if (peak >= 40) return { label: '稳定输出打工人', emoji: '⚙️', accent: '#4ECDC4' };
  if (peak >= 20) return { label: '边缘潜水观察员', emoji: '👀', accent: '#B086FF' };
  return { label: '试用期摸鱼选手', emoji: '🌱', accent: 'rgba(255,255,255,0.6)' };
}

export default function BanweiWrapped() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<WrappedStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || stats) return; // lazy — only fetch on first expand
    const userId = getUserId();
    if (!userId) return;
    fetch('/api/banwei', { headers: { 'X-User-Id': userId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: BanweiGetResponse) => {
        const hist = [...(d.history ?? [])].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
        const leak = getLeakStats();
        const peak = hist.reduce<Snapshot | null>((t, s) => (!t || s.score > t.score ? s : t), null);
        const avg = hist.length ? Math.round(hist.reduce((sum, s) => sum + s.score, 0) / hist.length) : 0;
        const trend = hist.length >= 2 ? hist[hist.length - 1].score - hist[0].score : null;
        setStats({
          weeks: hist.length,
          peakScore: peak?.score ?? 0,
          peakWeek: peak?.weekKey ?? '—',
          avgScore: avg,
          trend,
          leaksSubmitted: leak.submitted,
          leaksQuoted: leak.quoted,
          hitRate: leak.submitted > 0 ? Math.round((leak.quoted / leak.submitted) * 100) : null,
          achUnlocked: getUnlocked().size,
          achTotal: ACHIEVEMENTS.length,
        });
        setErr(null);
      })
      .catch((e) => setErr(String(e)));
  }, [open, stats]);

  const persona = stats ? yearPersona(stats.peakScore) : null;

  return (
    <div style={{
      marginTop: 16, padding: 14, borderRadius: 14,
      background: 'linear-gradient(135deg, rgba(45,27,105,0.6) 0%, rgba(15,14,46,0.6) 100%)',
      border: '1px solid rgba(176,134,255,0.4)',
    }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', padding: 0, color: 'inherit',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
            color: '#B086FF', textTransform: 'uppercase', marginBottom: 4,
          }}>🎁 BANWEI WRAPPED · 班味年终回顾</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            你这一年到底有多班味? 点开看战报 →
          </div>
        </div>
        <span style={{
          fontSize: 18, color: '#B086FF',
          transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s',
        }}>›</span>
      </button>

      {open && err && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
          🎁 年终回顾暂不可用 ({err})
        </div>
      )}

      {open && stats && persona && (
        <div style={{ marginTop: 14 }}>
          {/* Persona hero */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14,
            padding: 12, borderRadius: 12,
            background: `linear-gradient(135deg, ${persona.accent}22 0%, transparent 100%)`,
            border: `1px solid ${persona.accent}55`,
          }}>
            <div style={{ fontSize: 44, lineHeight: 1 }}>{persona.emoji}</div>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', marginBottom: 2 }}>
                你的年度班味人格
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: persona.accent }}>{persona.label}</div>
            </div>
          </div>

          {/* Stat grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <StatCell label="班味峰值" value={String(stats.peakScore)} sub={stats.peakWeek} accent="#FFD700" />
            <StatCell label="打卡周数" value={`${stats.weeks} 周`} sub={`平均 ${stats.avgScore}`} accent="#4ECDC4" />
            <StatCell
              label="班味趋势"
              value={stats.trend === null ? '—' : stats.trend > 0 ? `↗ +${stats.trend}` : stats.trend < 0 ? `↘ ${stats.trend}` : '= 持平'}
              sub={stats.trend === null ? '至少 2 周' : '首周 → 最近'}
              accent={stats.trend === null ? 'rgba(255,255,255,0.5)' : stats.trend > 0 ? '#22c55e' : stats.trend < 0 ? '#ef4444' : 'rgba(255,255,255,0.6)'}
            />
            <StatCell
              label="爆料命中率"
              value={stats.hitRate === null ? '—' : `${stats.hitRate}%`}
              sub={`投 ${stats.leaksSubmitted} · 中 ${stats.leaksQuoted}`}
              accent="#FF4FA3"
            />
          </div>

          {/* Achievements bar */}
          <div style={{
            marginTop: 10, padding: 10, borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>🏅 成就解锁</span>
              <span style={{ color: '#FFD700', fontWeight: 800 }}>{stats.achUnlocked}/{stats.achTotal}</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                width: `${stats.achTotal ? Math.round((stats.achUnlocked / stats.achTotal) * 100) : 0}%`,
                height: '100%', background: 'linear-gradient(90deg, #FFD700, #FFA947)',
              }} />
            </div>
          </div>

          {/* v6.40 P3 — 1080×1350 PNG export of the wrapped recap. */}
          <button
            type="button"
            onClick={() => downloadBanweiWrappedCard({
              personaLabel: persona.label,
              personaEmoji: persona.emoji,
              personaAccent: persona.accent,
              weeks: stats.weeks,
              peakScore: stats.peakScore,
              peakWeek: stats.peakWeek,
              avgScore: stats.avgScore,
              trend: stats.trend,
              hitRate: stats.hitRate,
              leaksSubmitted: stats.leaksSubmitted,
              leaksQuoted: stats.leaksQuoted,
              achUnlocked: stats.achUnlocked,
              achTotal: stats.achTotal,
            })}
            style={{
              marginTop: 12, width: '100%', padding: '10px 16px', borderRadius: 10,
              background: 'linear-gradient(135deg, #B086FF 0%, #7c3aed 100%)',
              color: '#fff', fontWeight: 900, fontSize: 13, border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 14px rgba(176,134,255,0.32)',
            }}
          >📤 下载年终回顾海报 (1080×1350)</button>

          <div style={{
            marginTop: 10, fontSize: 9.5, color: 'rgba(255,255,255,0.35)',
            textAlign: 'center', lineHeight: 1.5,
          }}>
            🎬 数据综合自你的班味指数 / 爆料战绩 / 成就墙 · 全部本地汇总
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div style={{
      padding: 10, borderRadius: 10,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: accent, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}
