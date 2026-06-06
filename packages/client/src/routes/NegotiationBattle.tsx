/**
 * NegotiationBattle.tsx — v6.58 — 「裁了么」闯关牌局 UI(方案 A）。
 *
 * 数值全跑在 shared/negotiation 的纯引擎里(client 直接 import reducer),服务端只
 * 给每次出牌配一句 HR 台词(POST /api/negotiation/hr-line,失败有兜底)。玩家=被裁
 * 员工:出话术卡打 HR 的预算/耐心,踩准克制、够本见好就收、贪过头被掀桌。
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BUDGET_MAX,
  CARD_POOL,
  type BattleState,
  type CardTag,
  type HRStanceId,
  chooseHRStance,
  compTierFromBudget,
  effectMultiplier,
  endRound,
  hrTakeStance,
  initBattle,
  playCard,
  settle,
  stanceById,
  tierLabel,
} from '@furball/shared';

const INIT = initBattle();
const MORALE_MAX = INIT.morale;
const PATIENCE_MAX = INIT.patience;

const TAG_CN: Record<CardTag, string> = {
  legal: '劳动法', tenure: '工龄', emotion: '情绪', insider: '爆料', market: '市场',
};

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.8, marginBottom: 3 }}>
        <span>{label}</span>
        <span>{Math.max(0, Math.round(value))}/{max}</span>
      </div>
      <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .35s ease' }} />
      </div>
    </div>
  );
}

const TIERS = [0, 1, 2, 3] as const;

export default function NegotiationBattle() {
  const navigate = useNavigate();
  const [battle, setBattle] = useState<BattleState>(() => initBattle());
  const [hrLine, setHrLine] = useState<string>(stanceById(INIT.stance).blurb);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string>(''); // 出牌结算的数值提示

  const stance = stanceById(battle.stance);
  const tier = compTierFromBudget(battle.budget);
  const over = battle.outcome.kind !== 'ongoing';

  const fetchHRLine = useCallback(
    async (cardId: string, stanceId: HRStanceId, outcomeKind: string) => {
      try {
        const r = await fetch('/api/negotiation/hr-line', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId, stanceId, outcomeKind }),
        });
        if (!r.ok) return null;
        const d = await r.json();
        return typeof d?.line === 'string' ? d.line : null;
      } catch {
        return null;
      }
    },
    [],
  );

  const onPlay = useCallback(
    async (cardId: string) => {
      if (busy || over) return;
      const card = CARD_POOL.find((c) => c.id === cardId)!;
      if (battle.chips < card.cost) return;
      const stanceId = battle.stance;
      const next = playCard(battle, cardId);
      const mult = effectMultiplier(card.tag, stance);
      const dealt = battle.budget - next.budget;
      setBattle(next);
      setFlash(`「${card.name}」×${mult} → HR 预算 −${dealt}`);
      setBusy(true);
      setHrLine('……');
      const line = await fetchHRLine(cardId, stanceId, next.outcome.kind);
      setHrLine(line ?? stanceById(stanceId).blurb);
      setBusy(false);
    },
    [battle, busy, over, stance, fetchHRLine],
  );

  const onEndTurn = useCallback(() => {
    if (busy || over) return;
    let next = endRound(battle);
    if (next.outcome.kind === 'ongoing') {
      next = hrTakeStance(next, chooseHRStance(next));
      setHrLine(stanceById(next.stance).blurb);
      setFlash(`回合 ${next.round} · HR 摆出「${stanceById(next.stance).name}」`);
    }
    setBattle(next);
  }, [battle, busy, over]);

  const onSettle = useCallback(async () => {
    if (busy || over) return;
    const next = settle(battle);
    setBattle(next);
    setBusy(true);
    const last = CARD_POOL[0].id;
    const line = await fetchHRLine(last, battle.stance, 'settled');
    setHrLine(line ?? '……行吧,就这个数。');
    setBusy(false);
  }, [battle, busy, over, fetchHRLine]);

  const restart = useCallback(() => {
    const s = initBattle();
    setBattle(s);
    setHrLine(stanceById(s.stance).blurb);
    setFlash('');
  }, []);

  const outcomeView = useMemo(() => {
    const o = battle.outcome;
    if (o.kind === 'ongoing') return null;
    const title =
      o.kind === 'flipped' ? '💥 HR 掀桌了!' : o.kind === 'caved' ? '😮‍💨 你认怂了' : '🤝 谈成了';
    const sub =
      o.kind === 'flipped'
        ? '一拍两散,走劳动仲裁,赔偿归零。贪过头了。'
        : o.kind === 'caved'
        ? `底气耗尽,只拿到 ${'multiple' in o ? o.multiple : ''}。`
        : `锁定赔偿:${'multiple' in o ? o.multiple : ''}`;
    return { title, sub };
  }, [battle.outcome]);

  return (
    <div style={{ minHeight: '100vh', background: '#0e1016', color: '#fff', padding: '16px', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={() => navigate('/fired')} style={btnGhost}>← 返回</button>
        <h2 style={{ fontSize: 18, margin: 0 }}>⚔️ 赔偿谈判·闯关牌局 <span style={{ fontSize: 12, opacity: 0.5 }}>Beta</span></h2>
      </div>

      {/* HR 区 */}
      <div style={{ background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>🧑‍💼 HR · 姿态「{stance.name}」</strong>
          <span style={{ fontSize: 12, opacity: 0.7 }}>第 {battle.round} 回合</span>
        </div>
        <div style={{ minHeight: 44, fontSize: 15, lineHeight: 1.5, fontStyle: 'italic', marginBottom: 10 }}>
          “{hrLine}”
        </div>
        <Bar label="💰 预算(打越低赔越多)" value={battle.budget} max={BUDGET_MAX} color="#ff6b6b" />
        <Bar label="😤 耐心(归零就掀桌)" value={battle.patience} max={PATIENCE_MAX} color="#ffa94d" />
      </div>

      {/* 赔偿阶梯 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {TIERS.map((t) => (
          <div key={t} style={{
            flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 8, fontSize: 13,
            background: t === tier ? 'rgba(120,200,120,0.25)' : 'rgba(255,255,255,0.05)',
            border: t === tier ? '1px solid rgba(120,220,120,0.6)' : '1px solid transparent',
            fontWeight: t === tier ? 700 : 400,
          }}>
            {tierLabel(t)}
          </div>
        ))}
      </div>

      {/* 玩家区 */}
      <div style={{ background: 'rgba(80,150,255,0.08)', border: '1px solid rgba(80,150,255,0.25)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <Bar label="🔥 底气(归零就认怂)" value={battle.morale} max={MORALE_MAX} color="#4dabf7" />
        <Bar label="🎟️ 筹码(出牌资源)" value={battle.chips} max={battle.chipMax} color="#a78bfa" />
        {flash && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{flash}</div>}
      </div>

      {/* 手牌 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
        {CARD_POOL.map((card) => {
          const mult = effectMultiplier(card.tag, stance);
          const afford = battle.chips >= card.cost && !over && !busy;
          const badge = mult === 1.5 ? '🔥克制 HR' : mult === 0.5 ? '🛡被挡' : '';
          return (
            <button
              key={card.id}
              onClick={() => onPlay(card.id)}
              disabled={!afford}
              style={{
                textAlign: 'left', padding: 10, borderRadius: 10, cursor: afford ? 'pointer' : 'not-allowed',
                background: afford ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
                border: mult === 1.5 ? '1px solid rgba(120,220,120,0.6)' : mult === 0.5 ? '1px solid rgba(255,120,120,0.4)' : '1px solid rgba(255,255,255,0.12)',
                color: '#fff', opacity: afford ? 1 : 0.45,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                <span>{card.name}</span><span>🎟️{card.cost}</span>
              </div>
              <div style={{ fontSize: 11, opacity: 0.7, margin: '2px 0' }}>
                {TAG_CN[card.tag]} · 力度 {card.pressure}{card.patienceHit ? ` · 激怒 ${card.patienceHit}` : ''}
              </div>
              {badge && <div style={{ fontSize: 11, color: mult === 1.5 ? '#8ce99a' : '#ffa8a8' }}>{badge}</div>}
            </button>
          );
        })}
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onEndTurn} disabled={busy || over} style={{ ...btnPrimary, flex: 1, opacity: busy || over ? 0.5 : 1 }}>
          结束本回合 →
        </button>
        <button onClick={onSettle} disabled={busy || over || tier === 0} style={{ ...btnGood, flex: 1, opacity: busy || over || tier === 0 ? 0.5 : 1 }}>
          ✅ 见好就收({tierLabel(tier)})
        </button>
      </div>
      <p style={{ fontSize: 11, opacity: 0.45, marginTop: 10, lineHeight: 1.6 }}>
        打 HR 预算爬赔偿阶梯;踩 HR 弱点(🔥)效果 ×1.5,撞克制(🛡)×0.5。够本就「见好就收」锁定,
        贪到耐心见底 HR 会掀桌、赔偿归零。
      </p>

      {/* 终局 */}
      {outcomeView && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#171a22', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: 24, maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>{outcomeView.title}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 6 }}>{outcomeView.sub}</div>
            <div style={{ fontSize: 13, opacity: 0.7, fontStyle: 'italic', marginBottom: 18 }}>HR:“{hrLine}”</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={restart} style={{ ...btnPrimary, flex: 1 }}>再来一局</button>
              <button onClick={() => navigate('/fired')} style={{ ...btnGhost, flex: 1 }}>回裁了么</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnGhost: React.CSSProperties = { background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: '#4263eb', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', cursor: 'pointer', fontSize: 14, fontWeight: 700 };
const btnGood: React.CSSProperties = { background: '#2f9e44', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', cursor: 'pointer', fontSize: 14, fontWeight: 700 };
