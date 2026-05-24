/**
 * CharacterVoteModal — v6.16 P1 "鼠人选秀" vote ballot overlay.
 *
 * Triggered from PersonaCard popover's 🗳️ button. Centered modal
 * showing:
 *   - Current week's vote distribution (8 personality bars by count)
 *   - User's current ballot for this rat (highlighted chip)
 *   - 8 click-to-vote chips — each click POSTs and re-fetches
 *
 * 1 vote per (user × character × week). Re-voting overwrites; the
 * modal reflects the new dominant immediately.
 *
 * Sits at z-index 250 (above CharacterFocusModal's 200 so user can
 * vote from inside a focus-modal session too).
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PERSONALITY_LABELS_LITE, ALL_PERSONALITY_IDS } from '../../constants/personalityLabels';
import { getUserId } from '../../utils/userId';

interface Tally {
  votes: Record<string, number>;
  totalVotes: number;
}

interface HistoryEntry {
  weekKey: string;
  dominant: string | null;
  totalVotes: number;
}

interface Props {
  characterName: string;
  epithet: string;
  emoji: string;
  open: boolean;
  onClose: () => void;
}

export default function CharacterVoteModal({ characterName, epithet, emoji, open, onClose }: Props) {
  const [tally, setTally] = useState<Tally | null>(null);
  const [dominant, setDominant] = useState<string | null>(null);
  const [weekKey, setWeekKey] = useState<string>('');
  const [myVote, setMyVote] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // personality currently being voted

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const myId = getUserId();
    Promise.all([
      fetch(`/api/characters/${encodeURIComponent(characterName)}/votes`)
        .then((r) => (r.ok ? r.json() : null)),
      fetch('/api/characters/votes/me', { headers: { 'X-User-Id': myId } })
        .then((r) => (r.ok ? r.json() : null)),
      // v6.17 P2 — last 4 weeks' winner trend for this rat
      fetch(`/api/characters/${encodeURIComponent(characterName)}/votes/history?weeks=4`)
        .then((r) => (r.ok ? r.json() : null)),
    ]).then(([votesData, meData, historyData]) => {
      if (cancelled) return;
      if (votesData) {
        setTally(votesData.tally);
        setDominant(votesData.dominant);
        setWeekKey(votesData.weekKey);
      }
      if (meData?.ballot) {
        setMyVote(meData.ballot[characterName] ?? null);
      }
      if (historyData?.history) {
        setHistory(historyData.history as HistoryEntry[]);
      }
    }).catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [open, characterName]);

  async function vote(personality: string) {
    if (busy) return;
    setBusy(personality);
    try {
      const r = await fetch(`/api/characters/${encodeURIComponent(characterName)}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': getUserId(),
        },
        body: JSON.stringify({ personality }),
      });
      if (!r.ok) return;
      const data = await r.json();
      setTally(data.tally);
      setDominant(data.dominant);
      setWeekKey(data.weekKey);
      setMyVote(personality);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 250,
            background: 'rgba(10, 10, 30, 0.82)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{
              maxWidth: 480, width: '100%',
              padding: 24, borderRadius: 18,
              background: 'linear-gradient(165deg, rgba(20,15,40,0.97) 0%, rgba(45,27,105,0.92) 100%)',
              border: '1px solid rgba(255,215,0,0.45)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(255,79,163,0.25)',
              color: '#F8F4E3', position: 'relative',
            }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              style={{
                position: 'absolute', top: 10, right: 10,
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)', color: '#F8F4E3',
                border: '1px solid rgba(255,215,0,0.32)', cursor: 'pointer',
                fontSize: 14, fontWeight: 900,
              }}
              aria-label="Close"
            >×</button>

            {/* Header */}
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <div style={{
                fontSize: 10, fontWeight: 900, letterSpacing: '0.22em',
                color: '#FFD700', textTransform: 'uppercase', marginBottom: 6,
              }}>🗳️ 鼠人选秀 · 本周投票</div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 32 }}>{emoji}</span>
                <div>
                  <div style={{
                    fontSize: 18, fontWeight: 900,
                    background: 'linear-gradient(135deg, #FFD700 0%, #FF4FA3 50%, #B086FF 100%)',
                    WebkitBackgroundClip: 'text', backgroundClip: 'text',
                    color: 'transparent',
                  }}>{epithet}</div>
                  <div style={{
                    fontSize: 9, color: 'rgba(248,244,227,0.55)',
                    letterSpacing: '0.1em', fontWeight: 700,
                  }}>{characterName.toUpperCase()} · {weekKey}</div>
                </div>
              </div>
            </div>

            {/* Prompt */}
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 14,
              background: 'rgba(255,215,0,0.06)',
              border: '1px solid rgba(255,215,0,0.18)',
              fontSize: 11, color: 'rgba(248,244,227,0.78)', lineHeight: 1.5,
            }}>
              你想让 <strong style={{ color: '#FFD700' }}>{characterName}</strong> 下周
              更多以哪种 personality 出场? 投票决定下周 GameEngine 选 personality 时的
              50% bias.{' '}
              {dominant && (
                <span style={{ color: PERSONALITY_LABELS_LITE[dominant]?.color }}>
                  当前 winner: {PERSONALITY_LABELS_LITE[dominant]?.emoji}{' '}
                  {PERSONALITY_LABELS_LITE[dominant]?.label}
                </span>
              )}
            </div>

            {/* 8 vote chips, grid 4×2 */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12,
            }}>
              {ALL_PERSONALITY_IDS.map((id) => {
                const p = PERSONALITY_LABELS_LITE[id];
                const count = tally?.votes[id] ?? 0;
                const isMine = myVote === id;
                const isDominant = dominant === id && count > 0;
                return (
                  <button
                    key={id}
                    onClick={() => vote(id)}
                    disabled={busy !== null}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '10px 4px', borderRadius: 10,
                      background: isMine
                        ? `linear-gradient(135deg, ${p.color}28, ${p.color}14)`
                        : 'rgba(255,255,255,0.04)',
                      border: isMine
                        ? `2px solid ${p.color}`
                        : isDominant
                          ? `1px solid ${p.color}88`
                          : '1px solid rgba(255,255,255,0.08)',
                      color: p.color,
                      cursor: busy ? 'wait' : 'pointer',
                      transition: 'all 0.18s ease',
                      fontFamily: 'inherit',
                      boxShadow: isMine ? `0 0 12px ${p.color}55` : 'none',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{p.emoji}</span>
                    <span style={{ fontSize: 10, fontWeight: 800 }}>{p.label}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: count > 0 ? p.color : 'rgba(248,244,227,0.35)',
                    }}>{count} 票</span>
                    {isMine && (
                      <span style={{
                        fontSize: 8, padding: '1px 4px', borderRadius: 4,
                        background: `${p.color}45`, color: '#F8F4E3',
                        fontWeight: 800, letterSpacing: '0.04em',
                      }}>你的票</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* v6.17 P2 — 4 周 winner 趋势 strip. 只在有 history 数据时显示,
                 让用户看到这只鼠这季 personality 演化轨迹. */}
            {history && history.length > 0 && (
              <div style={{
                marginTop: 14, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(176,134,255,0.06)',
                border: '1px solid rgba(176,134,255,0.18)',
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 900, letterSpacing: '0.15em',
                  color: '#B086FF', textTransform: 'uppercase', marginBottom: 6,
                }}>📈 过去 {history.length} 周 winner</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {history.map((h) => {
                    const isCurrent = h.weekKey === weekKey;
                    const p = h.dominant ? PERSONALITY_LABELS_LITE[h.dominant] : null;
                    return (
                      <div key={h.weekKey} style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 3,
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: p ? `${p.color}22` : 'rgba(255,255,255,0.04)',
                          border: `1.5px solid ${p ? p.color + '88' : 'rgba(255,255,255,0.08)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 18,
                          boxShadow: isCurrent && p ? `0 0 12px ${p.color}55` : 'none',
                        }}>{p?.emoji ?? '·'}</div>
                        <span style={{
                          fontSize: 8, color: 'rgba(248,244,227,0.5)', fontWeight: 700,
                          letterSpacing: '0.04em',
                        }}>{h.weekKey.replace(/^\d{4}-/, '')}</span>
                        {p && (
                          <span style={{
                            fontSize: 8, color: p.color, fontWeight: 800,
                          }}>{p.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer hint */}
            <div style={{
              fontSize: 9.5, color: 'rgba(248,244,227,0.4)', textAlign: 'center',
              fontStyle: 'italic', marginTop: 10,
            }}>
              {myVote
                ? '已投票. 想改可以点其他选项, 本周内随时换.'
                : '点任意 personality 投出你这一周的票.'}
              {' '}共 {tally?.totalVotes ?? 0} 票
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
