/**
 * SquadBuddiesPanel — v6.15 P2 "你常和谁组队" Profile mini-viz.
 *
 * Fetches /api/squad/stats/me, renders the user's top co-members as a
 * horizontal bar viz (bar length = shared session count). Sits below
 * MySubmissionsPanel on /profile so the user sees:
 *
 *   - TopRatsPanel (AI rats they watch)
 *   - MySubmissionsPanel (UGC they wrote)
 *   - SquadBuddiesPanel (humans they squad with)  ← v6.15
 *
 * Three layers of "people in my OFFICE ZOO orbit" in one place.
 *
 * Hides when the user has joined 0 squads (no buddies yet — nothing to
 * visualize). Always visible during loading via a soft skeleton.
 */
import { useEffect, useState } from 'react';
import { getUserId } from '../../utils/userId';

interface CoMember {
  userId: string;
  displayName: string;
  sharedSessions: number;
}
interface SquadStats {
  totalSessions: number;
  cappedAt50: boolean;
  last7Days: number;
  last30Days: number;
  topCoMembers: CoMember[];
}

export default function SquadBuddiesPanel() {
  const [stats, setStats] = useState<SquadStats | null | undefined>(undefined);
  const myId = getUserId();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/squad/stats/me', { headers: { 'X-User-Id': myId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { stats: SquadStats | null }) => {
        if (!cancelled) setStats(d.stats ?? null);
      })
      .catch(() => { if (!cancelled) setStats(null); });
    return () => { cancelled = true; };
  }, [myId]);

  // Loading skeleton
  if (stats === undefined) {
    return (
      <div style={{
        width: '100%', maxWidth: 512, marginTop: 16,
        padding: '12px 16px', borderRadius: 14,
        background: 'rgba(176,134,255,0.04)',
        border: '1px dashed rgba(176,134,255,0.18)',
        textAlign: 'center', color: 'rgba(248,244,227,0.4)',
        fontSize: 11, fontWeight: 700,
      }}>攒局战绩加载中…</div>
    );
  }

  // No squads = hide. (Don't tease empty viz; the rest of Profile already
  // teases attendance via other channels.)
  if (!stats || stats.totalSessions === 0 || stats.topCoMembers.length === 0) {
    return null;
  }

  const maxShared = Math.max(1, ...stats.topCoMembers.map((m) => m.sharedSessions));

  return (
    <div style={{ width: '100%', maxWidth: 512, marginTop: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, padding: '0 4px',
      }}>
        <div style={{
          fontSize: 12, fontWeight: 900, letterSpacing: '0.18em',
          color: '#B086FF', textTransform: 'uppercase',
        }}>👥 你常和谁组队 · TOP {stats.topCoMembers.length}</div>
        <div style={{ fontSize: 9, color: 'rgba(248,244,227,0.4)', fontWeight: 600 }}>
          {stats.totalSessions}{stats.cappedAt50 ? '+' : ''} 局攒局 · 近 7 天 {stats.last7Days}
        </div>
      </div>

      <div style={{
        padding: '14px 18px', borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(20,15,40,0.85), rgba(124,58,237,0.18))',
        border: '1px solid rgba(176,134,255,0.32)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {stats.topCoMembers.map((m, i) => {
          const pct = (m.sharedSessions / maxShared) * 100;
          const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#B086FF' : '#FF4FA3';
          return (
            <div key={m.userId} style={{
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
            }}>
              {/* Rank chip */}
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flex: '0 0 22px',
                background: `${rankColor}28`, color: rankColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 900,
                border: `1px solid ${rankColor}55`,
              }}>{i + 1}</span>
              {/* Display name */}
              <span style={{
                fontWeight: 800, color: '#F8F4E3',
                minWidth: 80, maxWidth: 160,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{m.displayName}</span>
              {/* Bar */}
              <div style={{
                flex: 1, height: 8, borderRadius: 999,
                background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                position: 'relative',
              }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: `linear-gradient(90deg, ${rankColor}, ${rankColor}cc)`,
                  borderRadius: 999,
                  boxShadow: `0 0 8px ${rankColor}88`,
                  transition: 'width 0.5s ease-out',
                }} />
              </div>
              {/* Count */}
              <span style={{
                fontSize: 11, fontWeight: 900, color: rankColor,
                minWidth: 32, textAlign: 'right',
              }}>×{m.sharedSessions}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
