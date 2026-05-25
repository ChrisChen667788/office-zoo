/**
 * MyDuelsPanel — v6.20 P3 "我的斗投战绩" on /profile.
 *
 * Fetches /api/characters/votes/duels/me, renders each duel as a
 * compact row:
 *   - weekKey
 *   - your score · opponent score
 *   - verdict W/L/T chip
 *   - status: 等加入 (no guest) / 实时 (joined)
 *   - click → /duel/:id (deep-link to full result view)
 *
 * Sits below MyBallotsPanel — together they document the user's
 * weekly vote participation (solo ballots + 1v1 duels).
 *
 * Live scoring: this panel only stores duel raw data. It re-computes
 * "your score" using whatever /votes/leaders looks like RIGHT NOW
 * (matches v6.18 P3 scoreDuel logic — keeps consistent). Stale duels
 * from previous weeks won't auto-resolve since current leaders may not
 * carry their old winning personality; we accept this drift as a
 * feature (stale duels grey out).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserId } from '../../utils/userId';
import { PERSONALITY_LABELS_LITE } from '../../constants/personalityLabels';

interface BallotPick { rat: string; personality: string }
interface Duel {
  duelId: string;
  weekKey: string;
  createdAt: number;
  hostUserId: string;
  hostBallot: BallotPick[];
  guestUserId?: string;
  guestBallot?: BallotPick[];
  joinedAt?: number;
}

interface LeadersPayload {
  leaders: Record<string, string>;
}

export default function MyDuelsPanel() {
  const navigate = useNavigate();
  const myId = getUserId();
  const [duels, setDuels] = useState<Duel[] | null>(null);
  const [leaders, setLeaders] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/characters/votes/duels/me', { headers: { 'X-User-Id': myId } })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      // Current week leaders for live score recomputation (1 call, reused
      // across all duels in the panel).
      fetch('/api/characters/votes/leaders')
        .then((r) => (r.ok ? r.json() : { leaders: {} })),
    ])
      .then(([dData, lData]: [{ duels: Duel[] }, LeadersPayload]) => {
        if (cancelled) return;
        setDuels(dData.duels ?? []);
        setLeaders(lData.leaders ?? {});
      })
      .catch(() => { if (!cancelled) setDuels([]); });
    return () => { cancelled = true; };
  }, [myId]);

  if (duels === null) return null; // silent loading

  if (duels.length === 0) {
    return (
      <div style={{
        width: '100%', maxWidth: 512, marginTop: 16,
        padding: '14px 18px', borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(255,79,163,0.06), rgba(176,134,255,0.04))',
        border: '1px dashed rgba(255,79,163,0.32)',
        color: 'rgba(248,244,227,0.65)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 900, letterSpacing: '0.15em',
          color: '#FF4FA3', textTransform: 'uppercase', marginBottom: 6,
        }}>⚔️ 我的斗投战绩</div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          还没斗过. 去
          <button
            onClick={() => navigate('/duel/new')}
            style={{
              background: 'transparent', border: 'none', color: '#FFD700',
              fontWeight: 700, cursor: 'pointer', padding: '0 4px',
              textDecoration: 'underline', textDecorationStyle: 'dashed',
              fontFamily: 'inherit',
            }}>/duel/new</button>
          创建一场 1v1, 选 3 鼠 + personality 押 weekly leader, 跟朋友比谁更懂大众.
        </div>
      </div>
    );
  }

  // Compute aggregate stats
  const filled = duels.filter((d) => d.guestBallot);
  let wins = 0, losses = 0, ties = 0;
  for (const d of filled) {
    const youAreHost = d.hostUserId === myId;
    const myBallot = youAreHost ? d.hostBallot : d.guestBallot!;
    const oppBallot = youAreHost ? d.guestBallot! : d.hostBallot;
    const myScore = myBallot.filter((p) => leaders[p.rat] === p.personality).length;
    const oppScore = oppBallot.filter((p) => leaders[p.rat] === p.personality).length;
    if (myScore > oppScore) wins++;
    else if (myScore < oppScore) losses++;
    else ties++;
  }

  return (
    <div style={{ width: '100%', maxWidth: 512, marginTop: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, padding: '0 4px',
      }}>
        <div style={{
          fontSize: 12, fontWeight: 900, letterSpacing: '0.18em',
          color: '#FF4FA3', textTransform: 'uppercase',
        }}>⚔️ 我的斗投战绩 · {duels.length} 局</div>
        <div style={{ fontSize: 10, color: 'rgba(248,244,227,0.55)', fontWeight: 700 }}>
          <span style={{ color: '#5be24a' }}>{wins}W</span>
          <span style={{ color: 'rgba(248,244,227,0.3)', margin: '0 3px' }}>/</span>
          <span style={{ color: '#ff6347' }}>{losses}L</span>
          {ties > 0 && (
            <>
              <span style={{ color: 'rgba(248,244,227,0.3)', margin: '0 3px' }}>/</span>
              <span>{ties}T</span>
            </>
          )}
        </div>
      </div>

      <div style={{
        padding: '10px 12px', borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(20,15,40,0.85), rgba(255,79,163,0.10))',
        border: '1px solid rgba(255,79,163,0.32)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {duels.map((d) => {
          const youAreHost = d.hostUserId === myId;
          const oppUserId = youAreHost ? (d.guestUserId ?? null) : d.hostUserId;
          const status: 'waiting' | 'live' = d.guestBallot ? 'live' : 'waiting';
          let myScore: number | null = null, oppScore: number | null = null;
          let verdictChip: { label: string; color: string } | null = null;
          if (status === 'live') {
            const myBallot = youAreHost ? d.hostBallot : d.guestBallot!;
            const oppBallot = youAreHost ? d.guestBallot! : d.hostBallot;
            myScore = myBallot.filter((p) => leaders[p.rat] === p.personality).length;
            oppScore = oppBallot.filter((p) => leaders[p.rat] === p.personality).length;
            verdictChip = myScore > oppScore
              ? { label: 'W', color: '#5be24a' }
              : myScore < oppScore
                ? { label: 'L', color: '#ff6347' }
                : { label: 'T', color: '#FFD700' };
          }
          return (
            <button
              key={d.duelId}
              onClick={() => navigate(`/duel/${d.duelId}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer', color: '#F8F4E3',
                fontFamily: 'inherit', textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,79,163,0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            >
              {/* W/L/T chip OR ⏳ */}
              {verdictChip ? (
                <span style={{
                  width: 24, height: 24, borderRadius: 6, flex: '0 0 24px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900,
                  background: `${verdictChip.color}22`, color: verdictChip.color,
                  border: `1px solid ${verdictChip.color}66`,
                }}>{verdictChip.label}</span>
              ) : (
                <span style={{
                  width: 24, height: 24, borderRadius: 6, flex: '0 0 24px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12,
                  background: 'rgba(255,215,0,0.12)', color: '#FFD700',
                  border: '1px dashed rgba(255,215,0,0.45)',
                }}>⏳</span>
              )}

              {/* week + opp + role */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, color: 'rgba(248,244,227,0.85)',
                  display: 'flex', gap: 6, alignItems: 'baseline',
                }}>
                  <span>{d.weekKey}</span>
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 4,
                    background: youAreHost ? 'rgba(255,215,0,0.18)' : 'rgba(176,134,255,0.18)',
                    color: youAreHost ? '#FFD700' : '#B086FF',
                    fontWeight: 800, letterSpacing: '0.04em',
                  }}>{youAreHost ? '你 host' : '你 guest'}</span>
                </div>
                <div style={{
                  fontSize: 9.5, color: 'rgba(248,244,227,0.5)', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                }}>
                  对手: {oppUserId ? `${oppUserId.slice(0, 16)}…` : '等加入'}
                </div>
              </div>

              {/* Score or status */}
              {status === 'live' && myScore !== null && oppScore !== null ? (
                <span style={{
                  fontSize: 13, fontWeight: 900, color: '#F8F4E3',
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{ color: '#FFD700' }}>{myScore}</span>
                  <span style={{ color: 'rgba(248,244,227,0.4)', margin: '0 4px' }}>:</span>
                  <span style={{ color: '#FF4FA3' }}>{oppScore}</span>
                </span>
              ) : (
                <span style={{
                  fontSize: 10, color: 'rgba(248,244,227,0.55)', fontStyle: 'italic',
                }}>等加入</span>
              )}
              {/* v6.21 P1 — 再约一局: skip row click, jump direct to
                   /duel/new?rematch=<duelId> with previous picks prefilled.
                   Only meaningful when duel already concluded (guestBallot
                   exists) — for waiting duels the user can still send the
                   share link instead. */}
              {status === 'live' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/duel/new?rematch=${encodeURIComponent(d.duelId)}`);
                  }}
                  title={`再约一局 — 复用你上次的 ballot 当起点, opponent ${oppUserId?.slice(0, 8)}…`}
                  style={{
                    padding: '4px 8px', borderRadius: 6,
                    background: 'rgba(176,134,255,0.16)', color: '#B086FF',
                    fontWeight: 800, fontSize: 10,
                    border: '1px solid rgba(176,134,255,0.55)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  ↻ 再约
                </button>
              )}
              <span style={{ fontSize: 10, color: 'rgba(248,244,227,0.4)' }}>→</span>
            </button>
          );
        })}
      </div>
      <div style={{
        marginTop: 6, fontSize: 9.5, color: 'rgba(248,244,227,0.4)',
        textAlign: 'center', fontStyle: 'italic',
      }}>
        click 任意行查看 ballot + 实时分数. 比分活的 — leaders 漂移 → 分数刷新.
      </div>
    </div>
  );
}
