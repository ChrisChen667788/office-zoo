/**
 * CharacterVotes — v6.17 P1 全局选秀排行榜 page (route /character-votes).
 *
 * Shows all 12 rats with their current week vote distribution. Sorted
 * by totalVotes desc so high-engagement rats surface first. Rats with
 * 0 votes are listed at the bottom as "未开票" with a "去投票" prompt.
 *
 * Each rat row:
 *   - emoji + epithet + NAME
 *   - 8 personality bars (mini stacked horizontal — width by share of
 *     totalVotes)
 *   - dominant chip + total vote count
 *   - click anywhere on row → opens CharacterFocusModal via deep-link
 *     to the character so user can vote inline
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CHARACTERS, ALL_CHARACTER_NAMES } from '@furball/shared';
import { PERSONALITY_LABELS_LITE, ALL_PERSONALITY_IDS } from '../constants/personalityLabels';
import EventPill from '../components/EventPill';

interface RatVotes {
  name: string;
  tally: { votes: Record<string, number>; totalVotes: number };
  dominant: string | null;
}

interface AllPayload {
  weekKey: string;
  rats: RatVotes[];
}

interface HistoryEntry {
  weekKey: string;
  dominant: string | null;
  totalVotes: number;
}

interface HistoryAllPayload {
  weeks: string[];
  byCharacter: Record<string, HistoryEntry[]>;
}

export default function CharacterVotes() {
  const navigate = useNavigate();
  const [data, setData] = useState<AllPayload | null>(null);
  const [history, setHistory] = useState<HistoryAllPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/characters/votes/all').then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      // v6.18 P1 — parallel fetch 4 weeks history for the timeline matrix
      fetch('/api/characters/votes/history-all?weeks=4').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([allData, histData]: [AllPayload, HistoryAllPayload | null]) => {
        if (cancelled) return;
        setData(allData);
        if (histData) setHistory(histData);
      })
      .catch(() => { if (!cancelled) setErr('加载失败'); });
    return () => { cancelled = true; };
  }, []);

  // Merge: ALL_CHARACTER_NAMES filled in with empty tally for rats not
  // yet voted, so leaderboard always shows the full 12 (with non-voted
  // rats relegated to bottom).
  const merged: RatVotes[] = ALL_CHARACTER_NAMES.map((name) => {
    const found = data?.rats.find((r) => r.name === name);
    return found ?? { name, tally: { votes: {}, totalVotes: 0 }, dominant: null };
  }).sort((a, b) => b.tally.totalVotes - a.tally.totalVotes);

  function openCharacter(name: string) {
    // Go to Landing with ?character=N so CharacterFocusModal at app
    // root takes over, exact same path as DailyRatSpotlight.
    navigate(`/?character=${encodeURIComponent(name)}`);
  }

  return (
    <div className="flex flex-col items-center px-4 py-8 min-h-screen"
      style={{
        background:
          'radial-gradient(ellipse at 25% 18%, rgba(255,215,0,0.18) 0%, transparent 45%),' +
          'radial-gradient(ellipse at 78% 82%, rgba(255,79,163,0.18) 0%, transparent 50%),' +
          'radial-gradient(ellipse at 50% 50%, #2D1B69 0%, #1a0d35 60%, #0a0a1e 100%)',
      }}>
      <div className="w-full max-w-2xl flex items-center justify-between mb-4">
        <button onClick={() => navigate('/')}
          className="text-xs px-3 py-1.5 rounded-full font-bold"
          style={{ background: 'rgba(255,255,255,0.85)', color: '#0a0a0a', border: '2px solid #0a0a0a' }}>
          ← 首页
        </button>
        <EventPill stars={5} subtle>🗳️ 鼠人选秀 · 本周排行榜</EventPill>
        <div style={{ width: 60 }} />
      </div>

      {err && (
        <div className="text-rose-300/85 text-sm py-12">⚠️ {err}</div>
      )}

      {!data && !err && (
        <div className="text-white/55 text-sm py-12">⏳ 加载中…</div>
      )}

      {data && (
        <div className="w-full max-w-2xl flex flex-col gap-3">
          <div className="text-center mb-2">
            <div style={{
              fontSize: 11, fontWeight: 900, letterSpacing: '0.18em',
              color: '#FFD700', textTransform: 'uppercase',
            }}>本周 · {data.weekKey} · 共 12 只鼠</div>
            <div style={{ fontSize: 11, color: 'rgba(248,244,227,0.5)', marginTop: 4 }}>
              click 任意鼠人 → 投票 / 看历史 / 完整档案
            </div>
            <button
              onClick={() => navigate('/duel/new')}
              className="mt-3 text-xs px-4 py-1.5 rounded-full font-bold tracking-wide transition hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #FF4FA3 0%, #B086FF 100%)',
                color: '#FFFFFF', border: 'none',
                letterSpacing: '0.05em',
                boxShadow: '0 0 16px rgba(255,79,163,0.32)',
              }}
            >⚔️ 跟朋友 1v1 斗投 →</button>
          </div>

          {merged.map((rat, i) => {
            const char = CHARACTERS[rat.name];
            if (!char) return null;
            const isWinner = i === 0 && rat.tally.totalVotes > 0;
            return (
              <motion.button
                key={rat.name}
                onClick={() => openCharacter(rat.name)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * i, duration: 0.3 }}
                whileHover={{ y: -2 }}
                style={{
                  padding: '14px 16px', borderRadius: 14,
                  background: isWinner
                    ? 'linear-gradient(135deg, rgba(255,215,0,0.14), rgba(255,79,163,0.08))'
                    : rat.tally.totalVotes > 0
                      ? 'rgba(20,15,40,0.85)'
                      : 'rgba(20,15,40,0.4)',
                  border: isWinner
                    ? '1.5px solid rgba(255,215,0,0.62)'
                    : rat.tally.totalVotes > 0
                      ? '1px solid rgba(255,79,163,0.32)'
                      : '1px dashed rgba(255,255,255,0.08)',
                  cursor: 'pointer', textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: 8,
                  color: '#F8F4E3', fontFamily: 'inherit',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Rank chip */}
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%', flex: '0 0 28px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 900,
                    background: isWinner ? '#FFD700' : 'rgba(255,255,255,0.06)',
                    color: isWinner ? '#1a0d35' : 'rgba(248,244,227,0.55)',
                    border: isWinner ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  }}>{i === 0 && rat.tally.totalVotes > 0 ? '👑' : i + 1}</span>

                  {/* emoji + epithet + NAME */}
                  <span style={{ fontSize: 26, flex: '0 0 26px' }}>{char.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 900,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{char.epithet}</div>
                    <div style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      color: 'rgba(248,244,227,0.45)',
                    }}>{rat.name.toUpperCase()}</div>
                  </div>

                  {/* Dominant chip + total */}
                  {rat.dominant && PERSONALITY_LABELS_LITE[rat.dominant] && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 999,
                      background: `${PERSONALITY_LABELS_LITE[rat.dominant].color}22`,
                      color: PERSONALITY_LABELS_LITE[rat.dominant].color,
                      border: `1px solid ${PERSONALITY_LABELS_LITE[rat.dominant].color}55`,
                      fontSize: 11, fontWeight: 800,
                    }}>
                      {PERSONALITY_LABELS_LITE[rat.dominant].emoji}{' '}
                      {PERSONALITY_LABELS_LITE[rat.dominant].label}
                    </div>
                  )}
                  <span style={{
                    fontSize: 14, fontWeight: 900, color: '#FFD700',
                    minWidth: 36, textAlign: 'right',
                  }}>{rat.tally.totalVotes}</span>
                </div>

                {/* 8 personality bar mini-grid (only when has votes) */}
                {rat.tally.totalVotes > 0 ? (
                  <div style={{
                    display: 'flex', gap: 2, height: 8, borderRadius: 999, overflow: 'hidden',
                    background: 'rgba(255,255,255,0.04)',
                  }}>
                    {ALL_PERSONALITY_IDS.map((id) => {
                      const v = rat.tally.votes[id] ?? 0;
                      if (v === 0) return null;
                      const pct = (v / rat.tally.totalVotes) * 100;
                      const p = PERSONALITY_LABELS_LITE[id];
                      return (
                        <div key={id} title={`${p.label} ${v} 票`}
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(180deg, ${p.color}, ${p.color}cc)`,
                          }} />
                      );
                    })}
                  </div>
                ) : (
                  <div style={{
                    fontSize: 10, color: 'rgba(248,244,227,0.4)', fontStyle: 'italic',
                  }}>未开票 · 你来投第一票?</div>
                )}
              </motion.button>
            );
          })}

          {/* v6.18 P1 — 过去 4 周霸榜 timeline matrix. 只在 history
               有数据时显示. 12 rows × N week cols, 每格 emoji 圆按
               personality 着色. Rats with 0 history → row 显示
               '本季无投票'. */}
          {history && history.weeks.length > 0 && (
            <div className="mt-8">
              <div className="text-center mb-3">
                <div style={{
                  fontSize: 11, fontWeight: 900, letterSpacing: '0.18em',
                  color: '#B086FF', textTransform: 'uppercase',
                }}>📈 过去 {history.weeks.length} 周霸榜</div>
                <div style={{ fontSize: 10, color: 'rgba(248,244,227,0.45)', marginTop: 4 }}>
                  每只鼠各周得票最高的 personality (一周 1 格)
                </div>
              </div>
              <div style={{
                padding: '12px 14px', borderRadius: 14,
                background: 'rgba(20,15,40,0.85)',
                border: '1px solid rgba(176,134,255,0.32)',
              }}>
                {/* Week header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `120px repeat(${history.weeks.length}, 1fr)`,
                  gap: 4, marginBottom: 8, alignItems: 'center',
                }}>
                  <div></div>
                  {history.weeks.map((wk) => (
                    <div key={wk} style={{
                      textAlign: 'center', fontSize: 9, fontWeight: 700,
                      color: 'rgba(248,244,227,0.55)', letterSpacing: '0.06em',
                    }}>{wk.replace(/^\d{4}-/, '')}</div>
                  ))}
                </div>

                {/* 12 rows */}
                {ALL_CHARACTER_NAMES.map((name) => {
                  const char = CHARACTERS[name];
                  if (!char) return null;
                  const ratHist = history.byCharacter[name] ?? [];
                  return (
                    <div key={name} style={{
                      display: 'grid',
                      gridTemplateColumns: `120px repeat(${history.weeks.length}, 1fr)`,
                      gap: 4, marginBottom: 6, alignItems: 'center',
                    }}>
                      <button
                        type="button"
                        onClick={() => openCharacter(name)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: 'transparent', border: 'none',
                          padding: '4px 6px', cursor: 'pointer',
                          color: '#F8F4E3', fontFamily: 'inherit',
                          textAlign: 'left',
                        }}>
                        <span style={{ fontSize: 16 }}>{char.emoji}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 800,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{char.epithet}</span>
                      </button>
                      {history.weeks.map((wk) => {
                        const entry = ratHist.find((e) => e.weekKey === wk);
                        const dom = entry?.dominant;
                        const p = dom ? PERSONALITY_LABELS_LITE[dom] : null;
                        return (
                          <div key={wk} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {p ? (
                              <div title={`${p.label} (${entry?.totalVotes} 票)`}
                                style={{
                                  width: 26, height: 26, borderRadius: '50%',
                                  background: `${p.color}22`,
                                  border: `1px solid ${p.color}66`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 14,
                                }}>{p.emoji}</div>
                            ) : (
                              <div style={{
                                width: 26, height: 26, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px dashed rgba(255,255,255,0.08)',
                              }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
