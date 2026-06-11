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
  type InterventionLedger, type InterventionId,
  emptyProgress, applyDrip, placeBet, settleBet, creditResult,
  roundVoteMarket, oddsFromProb,
  INTERVENTION_ITEMS, buyIntervention,
} from '@furball/shared';
import { useGameActions, type GamePlayer } from '../../stores/gameStore';
import { sfx } from '../../utils/sfx';
import { getUserId } from '../../utils/userId';
import BettingLeaderboard from './BettingLeaderboard';

/** 结算后把当前身家快照上报全网战绩榜(锦上添花,失败静默)。 */
function reportScore(p: BettingProgress) {
  if (p.settled <= 0) return; // 没结算过不灌空号
  fetch('/api/betting/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
    body: JSON.stringify({
      chips: p.chips, settled: p.settled, hits: p.hits, bestWin: p.bestWin, lifetimeWon: p.lifetimeWon,
    }),
  }).catch(() => { /* 榜单失败不影响玩 */ });
}

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
  /** v6.83 — 干预道具下单回调(路由层接 socket.emit('game:intervene'))。
   *  不传则商店入口隐藏(如离线探针)。 */
  onIntervene?: (itemId: InterventionId, targetId?: string) => void;
}

const ACCENT = '#a78bfa';

export default function BettingBar({ gameId, phase, round, players, lastEliminated, voteResultTick, onIntervene }: Props) {
  const { pushPrediction } = useGameActions();
  const [prog, setProg] = useState<BettingProgress>(() => emptyProgress(0));
  const [stake, setStake] = useState<number>(50);
  const [open, setOpen] = useState<Bet | null>(null);
  const [toast, setToast] = useState<{ text: string; win: boolean } | null>(null);
  const [showLb, setShowLb] = useState(false);
  // v6.83 — 干预商店:开关 / 每局限购台账 / 待选目标的道具
  const [shopOpen, setShopOpen] = useState(false);
  const [ledger, setLedger] = useState<InterventionLedger>({});
  const [pendingItem, setPendingItem] = useState<InterventionId | null>(null);
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

  // 新局:清掉残留注 + 结算锁 + 干预台账
  useEffect(() => {
    setOpen(null); resolvedRef.current = '';
    setLedger({}); setShopOpen(false); setPendingItem(null);
  }, [gameId]);

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

  // v6.83 — 买干预道具:纯引擎扣筹码 + 记台账 → 路由层 socket 下单 → toast。
  const onBuyIntervention = useCallback((itemId: InterventionId, targetId?: string) => {
    const r = buyIntervention(prog, ledger, itemId);
    if (!r.ok) {
      flashToast(
        r.reason === 'insufficient_chips' ? '筹码不够 · 先去押两把'
          : r.reason === 'cap_reached' ? '这道具本局限购已满' : '买不了',
        false,
      );
      return;
    }
    setProg(r.progress); save(r.progress);
    setLedger(r.ledger);
    onIntervene?.(itemId, targetId);
    const item = INTERVENTION_ITEMS.find((i) => i.id === itemId)!;
    flashToast(`${item.emoji} ${item.label}已下单 — 看戏`, true);
    sfx.playBadge();
    setPendingItem(null);
    setShopOpen(false);
  }, [prog, ledger, onIntervene, flashToast]);

  // vote_result 结算
  useEffect(() => {
    if (voteResultTick <= 0 || !open || open.round !== round) return;
    const key = `${gameId}.${open.round}.${voteResultTick}`;
    if (resolvedRef.current === key) return;
    resolvedRef.current = key;

    const payout = settleBet(open, lastEliminated ?? '');
    const won = payout > 0;
    const np = creditResult(prog, payout, won);
    save(np); setProg(np);
    reportScore(np); // 上报身家快照到全网战绩榜(锦上添花)

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
    <>
    <div style={card}>
      {/* 头:筹码 + 命中率 + 🏆 榜 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 800 }}>🎰 押一把</span>
          <button onClick={() => setShowLb(true)} title="全网战绩榜"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, opacity: 0.85 }}>🏆</button>
          {onIntervene && (
            <button onClick={() => { setShopOpen((v) => !v); setPendingItem(null); }} title="干预商店 · 筹码能花了"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, opacity: 0.85 }}>🛒</button>
          )}
        </span>
        <span style={{ fontSize: 11, opacity: 0.85 }}>
          💰 <b style={{ color: ACCENT }}>{prog.chips}</b> · 命中 {hitRate}%
        </span>
      </div>

      {/* v6.83 — 干预商店:赢的筹码能花 —— 买道具真改剧情 */}
      {shopOpen && (
        <div>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
            🛒 干预商店 · 筹码真能改剧情
          </div>
          {pendingItem ? (
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
                {INTERVENTION_ITEMS.find((i) => i.id === pendingItem)?.emoji} 选目标鼠:
              </div>
              <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {alive.map((p) => (
                  <button key={p.id} onClick={() => onBuyIntervention(pendingItem, p.id)}
                    style={{ padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, textAlign: 'left',
                      border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff' }}>
                    {p.name}
                  </button>
                ))}
              </div>
              <button onClick={() => setPendingItem(null)}
                style={{ marginTop: 6, width: '100%', padding: '5px 0', borderRadius: 8, cursor: 'pointer', fontSize: 11,
                  border: '1px solid rgba(255,255,255,0.14)', background: 'none', color: 'rgba(255,255,255,0.6)' }}>
                ← 换个道具
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {INTERVENTION_ITEMS.map((item) => {
                const used = ledger[item.id] ?? 0;
                const soldOut = used >= item.perGameCap;
                const broke = prog.chips < item.price;
                const disabled = soldOut || broke;
                return (
                  <button key={item.id} disabled={disabled}
                    onClick={() => (item.needsTarget ? setPendingItem(item.id) : onBuyIntervention(item.id))}
                    style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '7px 10px', borderRadius: 8,
                      cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: disabled ? 0.45 : 1,
                      border: '1px solid rgba(167,139,250,0.22)', background: 'rgba(255,255,255,0.04)', color: '#fff' }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                      <span>{item.emoji} {item.label}</span>
                      <span style={{ color: ACCENT, fontWeight: 800 }}>💰{item.price}</span>
                    </span>
                    <span style={{ fontSize: 10, opacity: 0.55 }}>
                      {item.desc} · {soldOut ? '本局已用完' : `剩 ${item.perGameCap - used} 次`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!shopOpen && (
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
      )}
    </div>
    {showLb && <BettingLeaderboard onClose={() => setShowLb(false)} />}
    </>
  );
}
