/**
 * BettingLeaderboard — v6.74 P3 — 下注盘「全网战绩榜」弹窗。
 *
 * 两榜切换:💰 筹码榜(谁身家最多)/ 🎯 神算榜(谁命中率最高,够样本才入围)。
 * 数据来自 GET /api/betting/leaderboard?sort=,自己那行高亮(按 8 位公开 id 比对)。
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { type BetRun, type BetSortBy, betHitRate, MIN_SETTLED_FOR_RATE } from '@furball/shared';
import { getUserId } from '../../utils/userId';

interface Props { onClose: () => void; }
const ACCENT = '#a78bfa';

export default function BettingLeaderboard({ onClose }: Props) {
  const [sort, setSort] = useState<BetSortBy>('chips');
  const [rows, setRows] = useState<BetRun[] | null>(null);
  const [total, setTotal] = useState(0);
  const myId = getUserId().slice(0, 8);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetch(`/api/betting/leaderboard?limit=20&sort=${sort}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setRows(d.top ?? []); setTotal(d.total ?? 0); } })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [sort]);

  const tab = (key: BetSortBy, label: string): React.CSSProperties => ({
    flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${sort === key ? ACCENT : 'rgba(255,255,255,0.14)'}`,
    background: sort === key ? 'rgba(167,139,250,0.22)' : 'rgba(255,255,255,0.04)', color: '#fff',
  });

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        style={{ width: 'min(420px, 94vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          background: 'rgba(15,16,26,0.97)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 16,
          padding: 16, color: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>🏆 赌怪榜</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', opacity: 0.6 }}>✕</button>
        </div>
        <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 10 }}>全网 {total} 位押注人 · 取个人身家峰值</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button onClick={() => setSort('chips')} style={tab('chips', '💰 筹码榜')}>💰 筹码榜</button>
          <button onClick={() => setSort('hitRate')} style={tab('hitRate', '🎯 神算榜')}>🎯 神算榜</button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <AnimatePresence mode="wait">
            {rows === null ? (
              <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ textAlign: 'center', padding: 28, opacity: 0.5, fontSize: 13 }}>载入中…</motion.div>
            ) : rows.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ textAlign: 'center', padding: 28, opacity: 0.5, fontSize: 13 }}>
                还没人上榜 · 押一把就是榜一大哥 🎰
              </motion.div>
            ) : (
              <motion.div key={sort} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {rows.map((r, i) => {
                  const mine = r.userId === myId;
                  const hr = betHitRate(r);
                  const lowSample = r.settled < MIN_SETTLED_FOR_RATE;
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
                  return (
                    <div key={r.userId + i} style={{ display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 10, fontSize: 13,
                      background: mine ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${mine ? ACCENT : 'rgba(255,255,255,0.07)'}` }}>
                      <span style={{ width: 24, textAlign: 'center', fontWeight: 700, opacity: i < 3 ? 1 : 0.6 }}>{medal}</span>
                      <span style={{ flex: 1, fontWeight: 600, fontFamily: 'monospace', opacity: 0.92 }}>
                        {r.userId}{mine ? ' (你)' : ''}
                      </span>
                      <span style={{ width: 72, textAlign: 'right', color: ACCENT, fontWeight: 800 }}>💰 {r.chips}</span>
                      <span style={{ width: 58, textAlign: 'right', fontSize: 11.5, opacity: lowSample ? 0.4 : 0.85 }}>
                        {r.settled > 0 ? `${Math.round(hr * 100)}%` : '—'}
                        <span style={{ fontSize: 9, opacity: 0.7 }}> {r.settled > 0 ? `${r.hits}/${r.settled}` : ''}</span>
                      </span>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
