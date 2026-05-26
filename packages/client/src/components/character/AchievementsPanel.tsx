/**
 * AchievementsPanel — v6.30 P4. Renders the 12-achievement grid
 * on /profile/me, locked items dimmed. Re-evaluates on mount + on
 * window focus so users who unlock something in another tab see it
 * fresh when they switch back.
 */
import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, getUnlocked, refreshAuto } from '../../utils/achievements';

export default function AchievementsPanel() {
  const [unlocked, setUnlocked] = useState<Set<string>>(() => getUnlocked());

  useEffect(() => {
    const refresh = () => {
      refreshAuto();
      setUnlocked(getUnlocked());
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('achievement:unlocked', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('achievement:unlocked', refresh);
    };
  }, []);

  const total = ACHIEVEMENTS.length;
  const got = unlocked.size;
  const pct = total > 0 ? Math.round((got / total) * 100) : 0;

  return (
    <div style={{
      marginTop: 16, padding: 14, borderRadius: 14,
      background: 'rgba(15,14,46,0.6)',
      border: '1px solid rgba(255,215,0,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
            color: '#FFD58A', textTransform: 'uppercase', marginBottom: 4,
          }}>🏆 Achievements · 班味成就</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            一边玩一边解锁 — 全 {total} 个里程碑
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#FFD700', fontVariantNumeric: 'tabular-nums' }}>
            {got}<span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}> / {total}</span>
          </div>
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {pct}%
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden', marginBottom: 12,
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: 'linear-gradient(90deg, #FFD700, #FFA947)',
          transition: 'width 0.32s ease-out',
        }} />
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 8,
      }}>
        {ACHIEVEMENTS.map((a) => {
          const open = unlocked.has(a.id);
          return (
            <div
              key={a.id}
              title={a.desc}
              style={{
                padding: '8px 10px', borderRadius: 8,
                background: open ? 'rgba(255,215,0,0.10)' : 'rgba(255,255,255,0.03)',
                border: open ? '1px solid rgba(255,215,0,0.45)' : '1px solid rgba(255,255,255,0.08)',
                opacity: open ? 1 : 0.45,
                transition: 'all 0.22s ease',
                cursor: 'help',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{
                  fontSize: 18,
                  filter: open ? 'none' : 'grayscale(0.8)',
                }}>{a.emoji}</span>
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: open ? '#FFD700' : 'rgba(255,255,255,0.55)',
                  flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{a.label}</span>
              </div>
              <div style={{
                fontSize: 9.5, lineHeight: 1.4,
                color: open ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.4)',
              }}>{a.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
