/**
 * LeaderboardPanel — v6.36 P4 公开 班味 Top-10.
 *
 * Reads /api/leaderboard/banwei (which reduces over banwei.json) to
 * surface the public top-10 scoreboard across all spectators. Caller's
 * own row gets highlighted by matching the truncated userIdPrefix
 * against `getUserId().slice(0, 8)`.
 *
 * Privacy note: server only returns the first 8 chars of each userId,
 * so a passerby can't reverse-engineer identities. Your own row is
 * recognizable because you know your own uid.
 *
 * UI: ranked list, gradient-tinted top 3, "你 →" pointer on your row.
 */
import { useEffect, useState } from 'react';
import { getUserId } from '../../utils/userId';

interface Row {
  userIdPrefix: string;
  score: number;
  weekKey: string;
}

interface Response {
  top: Row[];
  total: number;
  weekKey: string;
}

const MEDAL = ['🥇', '🥈', '🥉'] as const;
/** Tint by rank: gold → silver → bronze → neutral. */
const RANK_ACCENT = ['#FFD700', '#C0C0C0', '#CD7F32'] as const;

export default function LeaderboardPanel() {
  const [data, setData] = useState<Response | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const myPrefix = getUserId().slice(0, 8);

  useEffect(() => {
    fetch('/api/leaderboard/banwei?limit=10')
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
      }}>🏆 班味排行榜暂不可用 ({err})</div>
    );
  }
  if (!data) return null;

  return (
    <div style={{
      marginTop: 16, padding: 14, borderRadius: 14,
      background: 'rgba(15,14,46,0.6)',
      border: '1px solid rgba(255,215,0,0.35)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
            color: '#FFD700', textTransform: 'uppercase', marginBottom: 4,
          }}>🏆 BANWEI LEADERBOARD · 班味 TOP 10</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            本周 {data.weekKey} · 全网共 {data.total} 位打工人参与
          </div>
        </div>
      </div>

      {data.top.length === 0 ? (
        <div style={{
          padding: 18, textAlign: 'center', fontSize: 12,
          color: 'rgba(255,255,255,0.45)',
        }}>
          🐀 还没人打卡, 你可以是本周第一个上榜的鼠人 →
        </div>
      ) : (
        <ol style={{
          listStyle: 'none', padding: 0, margin: 0,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {data.top.map((row, i) => {
            const isMe = row.userIdPrefix === myPrefix;
            const accent: string = i < 3 ? RANK_ACCENT[i] : 'rgba(255,255,255,0.35)';
            const medal: string = i < 3 ? MEDAL[i] : `#${i + 1}`;
            return (
              <li
                key={`${row.userIdPrefix}-${i}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 10px', borderRadius: 8,
                  background: isMe ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.04)',
                  border: isMe ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.05)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span style={{
                  width: 28, textAlign: 'center', fontSize: 14, fontWeight: 900,
                  color: accent,
                }}>{medal}</span>
                <span style={{
                  flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.78)',
                  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                }}>
                  {row.userIdPrefix}
                  {isMe && (
                    <span style={{
                      marginLeft: 8, padding: '1px 6px', borderRadius: 4,
                      background: 'rgba(255,215,0,0.25)',
                      color: '#FFD700', fontSize: 10, fontWeight: 900,
                      letterSpacing: '0.08em',
                    }}>← 你</span>
                  )}
                </span>
                <span style={{
                  fontSize: 14, fontWeight: 900, color: accent,
                  minWidth: 36, textAlign: 'right',
                }}>{row.score}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div style={{
        marginTop: 10, fontSize: 9.5, color: 'rgba(255,255,255,0.35)',
        textAlign: 'center', letterSpacing: '0.04em', lineHeight: 1.5,
      }}>
        🔒 隐私: 仅显示你的 user id 前 8 位 · 谁也认不出别人, 但你能认出自己
      </div>
    </div>
  );
}
