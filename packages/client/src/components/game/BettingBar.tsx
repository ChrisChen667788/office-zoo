/**
 * BettingBar — v6.74 — 观众下注盘。把 PredictionBar 的「选谁出局」升级成「押筹码 + 赔率 + 派彩」。
 *
 * 每回合用在场玩家开一个「谁被投票开除」盘口(赔率 = 概率倒数 × house edge);押筹码 → 锁定赔率 →
 * vote_result 结算派彩。筹码本地存(每日补给 + 破产兜底)。仍写 gameStore.predictionLog,所以
 * HighlightReel 复盘 + v6.73「看走眼」名场面照常工作。数值全在 shared/betting 纯引擎里,这里只接 UI。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  type BettingProgress, type Bet, type BetMarket,
  emptyProgress, applyDrip, placeBet, settleBet, creditResult,
  roundVoteMarket, oddsFromProb,
} from '@furball/shared';
import { useGameActions, type GamePlayer } from '../../stores/gameStore';
import { sfx } from '../../utils/sfx';

const STORE_KEY = 'oz_betting_v1';
const STAKES = [20, 50, 100, 200] as const;

function load(): BettingProgress {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.chips === 'number') return { ...emptyProgress(0), ...p };
    }
  } catch { /* ignore */ }
  return emptyProgress(0);
}
function save(p: BettingProgress) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

interface Props {
  gameId: string;
  phase: string;
  round: number;
  players: GamePlayer[];
  /** playerId of the most recently eliminated member, or null on tie. */
  lastEliminated: string | null;
  /** Bumps whenever a fresh vote_result lands — the settle trigger. */
  voteResultTick: number;
}

const ACCENT = '#a78bfa';

export default function BettingBar({ gameId, phase, round, players, lastEliminated, voteResultTick }: Props) {
  const { pushPrediction } = useGameActions();
  const [prog, setProg] = useState<BettingProgress>(() => emptyProgress(0));
  const [stake, setStake] = useState<number>(50);
  const [open, setOpen] = useState<Bet | null>(null);
  const [toast, setToast] = useState<{ text: string; win: boolean } | null>(null);
  const resolvedRef = useRef<string>('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 挂载:读档 + 每日补给(Date.now 只在 effect 里用,纯引擎不碰时间)
  useEffect(() => {
    const existing = load();
    // 全新存档(lastDripTs 还是 0)→ 先把它戳成 now,免得一进来就白送一次每日补给(否则 500→700)
    const seeded = existing.lastDripTs === 0 ? { ...existing, lastDripTs: Date.now() } : existing;
    const p = applyDrip(seeded, Date.now());
    setProg(p); save(p);
  }, []);

  // 新局:清掉残留注 + 结算锁
  useEffect(() => { setOpen(null); resolvedRef.current = ''; }, [gameId]);

  const flashToast = useCallback((text: string, win: boolean) => {
    setToast({ text, win });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const alive = players.filter((p) => p.isAlive);
  const market: BetMarket = roundVoteMarket(gameId, round, alive.map((p) => ({ id: p.id, name: p.name })));
  const canBet = phase !== 'game_over' && !open && alive.length >= 2;

  const onBet = useCallback((optionId: string, optionLabel: string, odds: number) => {
    const res = placeBet(prog, stake);
    if (!res.ok) { flashToast('筹码不够', false); return; }
    setProg(res.next); save(res.next);
    setOpen({ marketId: market.id, optionId, optionLabel, stake, odds, round });
    sfx.playBadge();
  }, [prog, stake, market.id, round, flashToast]);

  // vote_result 结算
  useEffect(() => {
    if (voteResultTick <= 0 || !open || open.round !== round) return;
    const key = `${gameId}.${open.round}.${voteResultTick}`;
    if (resolvedRef.current === key) return;
    resolvedRef.current = key;

    const payout = settleBet(open, lastEliminated ?? '');
    const won = payout > 0;
    setProg((p) => { const np = creditResult(p, payout, won); save(np); return np; });

    // 仍写 predictionLog(HighlightReel 复盘 + v6.73 反转名场面)
    const actual = lastEliminated ? players.find((p) => p.id === lastEliminated) : null;
    pushPrediction({
      round: open.round, pickId: open.optionId, pickName: open.optionLabel,
      actualId: lastEliminated ?? null, actualName: actual?.name ?? null, correct: won,
    });

    flashToast(won ? `押中!+${payout} 筹码` : `没押中 −${open.stake}`, won);
    if (won) sfx.playWin(); else sfx.playLose();
    setOpen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voteResultTick]);

  const hitRate = prog.settled ? Math.round((prog.hits / prog.settled) * 100) : 0;
  const card: React.CSSProperties = {
    position: 'fixed', left: 12, bottom: 12, zIndex: 70, width: 270,
    background: 'rgba(13,14,22,0.92)', border: '1px solid rgba(167,139,250,0.28)',
    borderRadius: 14, padding: 12, backdropFilter: 'blur(12px)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)', color: '#fff', fontSize: 12,
  };

  return (
    <div style={card}>
      {/* 头:筹码 + 命中率 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontWeight: 800 }}>🎰 押一把</span>
        <span style={{ fontSize: 11, opacity: 0.85 }}>
          💰 <b style={{ color: ACCENT }}>{prog.chips}</b> · 命中 {hitRate}%
        </span>
      </div>

      <AnimatePresence mode="wait">
        {toast ? (
          <motion.div key="toast" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ textAlign: 'center', padding: '10px 0', fontWeight: 800, fontSize: 14,
              color: toast.win ? '#22c55e' : '#ef4444' }}>
            {toast.win ? '🎉 ' : '😭 '}{toast.text}
          </motion.div>
        ) : open ? (
          <motion.div key="open" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ textAlign: 'center', padding: '8px 0', opacity: 0.9 }}>
            已押 <b>{open.optionLabel}</b> @ <b style={{ color: ACCENT }}>{open.odds}×</b><br />
            <span style={{ fontSize: 11, opacity: 0.7 }}>{open.stake} 筹码 · 等开奖…</span>
          </motion.div>
        ) : canBet ? (
          <motion.div key="bet" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>第 {round} 回合 · 押谁被开除?</div>
            {/* 注额 */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {STAKES.map((s) => (
                <button key={s} onClick={() => setStake(s)} disabled={s > prog.chips}
                  style={{ flex: 1, padding: '4px 0', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${stake === s ? ACCENT : 'rgba(255,255,255,0.14)'}`,
                    background: stake === s ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.04)',
                    color: s > prog.chips ? 'rgba(255,255,255,0.3)' : '#fff', opacity: s > prog.chips ? 0.5 : 1 }}>
                  {s}
                </button>
              ))}
            </div>
            {/* 候选 + 赔率 */}
            <div style={{ maxHeight: 168, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {market.options.map((o) => {
                const odds = oddsFromProb(o.prob);
                return (
                  <button key={o.id} onClick={() => onBet(o.id, o.label, odds)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                      border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff' }}>
                    <span style={{ fontWeight: 600 }}>{o.label}</span>
                    <span style={{ color: ACCENT, fontWeight: 800 }}>{odds}×</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, opacity: 0.55 }}>
            {phase === 'game_over' ? '本局结束 · 下局再战' : '等下一回合开盘…'}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
