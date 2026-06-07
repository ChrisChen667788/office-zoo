/**
 * NegotiationBattle.tsx — 「裁了么」闯关牌局 UI。
 *
 * v6.58 方案 A:数值跑在 shared/negotiation 纯引擎,服务端只配 HR 台词。
 * v6.59 方案 B(局间成长)+ C(职场遗物):开局先进「准备」界面 —— 看职级/经验/遣散费,
 *   选 BOSS 难度(职级解锁)、选一件一次性遗物;打完按结果给经验+遣散费(localStorage
 *   持久化),升职级解锁进阶卡 + 更狠的 BOSS。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BUDGET_MAX,
  BOSS_TIERS,
  RELIC_POOL,
  type BattleState,
  type CardTag,
  type HRStanceId,
  type Reward,
  applyRelics,
  awardFromOutcome,
  bossById,
  cardById,
  chooseHRStance,
  compTierFromBudget,
  effectMultiplier,
  endRound,
  hrTakeStance,
  initBattle,
  levelFromXp,
  nextLevel,
  playCard,
  settle,
  stanceById,
  tierLabel,
  unlockedCardIds,
  xpProgress,
} from '@furball/shared';
import { battleStatIcons, negotiationCardIcons, Icon } from '../constants/icons';

const TAG_CN: Record<CardTag, string> = {
  legal: '劳动法', tenure: '工龄', emotion: '情绪', insider: '爆料', market: '市场',
};

const STORE_KEY = 'oz_neg_progress_v1';
interface Progress { xp: number; severance: number; wins: number }
function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const p = JSON.parse(raw); return { xp: p.xp || 0, severance: p.severance || 0, wins: p.wins || 0 }; }
  } catch { /* ignore */ }
  return { xp: 0, severance: 0, wins: 0 };
}
function saveProgress(p: Progress) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function Bar({ icon, emoji, label, value, max, color }: { icon?: string; emoji?: string; label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.8, marginBottom: 3 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {icon && <Icon src={icon} emoji={emoji} size={14} alt="" />}{label}
        </span><span>{Math.max(0, Math.round(value))}/{max}</span>
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
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [phase, setPhase] = useState<'prep' | 'battle'>('prep');
  const [bossId, setBossId] = useState('hr');
  const [relicId, setRelicId] = useState<string | null>(null);

  const [battle, setBattle] = useState<BattleState | null>(null);
  const [exclude, setExclude] = useState<HRStanceId[]>([]);
  const [maxes, setMaxes] = useState({ morale: 100, patience: 8, budget: BUDGET_MAX });
  const [hrLine, setHrLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [reward, setReward] = useState<Reward | null>(null);
  const [leveledTo, setLeveledTo] = useState<string | null>(null);
  const rewardedRef = useRef(false);

  const career = levelFromXp(progress.xp);
  const level = career.level;
  const boss = bossById(bossId);

  const startBattle = useCallback(() => {
    const { config, excludeStances } = applyRelics(relicId ? [relicId] : [], { ...boss.config });
    const s = initBattle(config);
    setBattle(s);
    setMaxes({ morale: s.morale, patience: s.patience, budget: Math.max(BUDGET_MAX, s.budget) });
    setExclude(excludeStances);
    setHrLine(stanceById(s.stance).blurb);
    setFlash(''); setReward(null); setLeveledTo(null);
    rewardedRef.current = false;
    setPhase('battle');
  }, [boss, relicId]);

  // 结算:对局一进入终局就发奖励 + 持久化(只发一次)。
  useEffect(() => {
    if (!battle || battle.outcome.kind === 'ongoing' || rewardedRef.current) return;
    rewardedRef.current = true;
    const r = awardFromOutcome(battle.outcome, boss.rewardMult);
    setReward(r);
    setProgress((prev) => {
      const before = levelFromXp(prev.xp).level;
      const xp = prev.xp + r.xp;
      const after = levelFromXp(xp);
      if (after.level > before) setLeveledTo(after.title);
      const won = battle.outcome.kind === 'settled' && 'tier' in battle.outcome && battle.outcome.tier >= 1;
      const np = { xp, severance: prev.severance + r.severance, wins: prev.wins + (won ? 1 : 0) };
      saveProgress(np);
      return np;
    });
  }, [battle, boss]);

  const fetchHRLine = useCallback(async (cardId: string, stanceId: HRStanceId, outcomeKind: string) => {
    try {
      const r = await fetch('/api/negotiation/hr-line', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, stanceId, outcomeKind }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      return typeof d?.line === 'string' ? d.line : null;
    } catch { return null; }
  }, []);

  const stance = battle ? stanceById(battle.stance) : stanceById('pie');
  const tier = battle ? compTierFromBudget(battle.budget) : 0;
  const over = !battle || battle.outcome.kind !== 'ongoing';
  const handIds = useMemo(() => unlockedCardIds(level), [level]);

  const onPlay = useCallback(async (cardId: string) => {
    if (!battle || busy || battle.outcome.kind !== 'ongoing') return;
    const card = cardById(cardId);
    if (!card || battle.chips < card.cost) return;
    const stanceId = battle.stance;
    const next = playCard(battle, cardId);
    const mult = effectMultiplier(card.tag, stanceById(stanceId));
    const dealt = battle.budget - next.budget;
    setBattle(next);
    setFlash(`「${card.name}」×${mult} → HR 预算 −${dealt}`);
    setBusy(true); setHrLine('……');
    const line = await fetchHRLine(cardId, stanceId, next.outcome.kind);
    setHrLine(line ?? stanceById(stanceId).blurb);
    setBusy(false);
  }, [battle, busy, fetchHRLine]);

  const onEndTurn = useCallback(() => {
    if (!battle || busy || battle.outcome.kind !== 'ongoing') return;
    let next = endRound(battle);
    if (next.outcome.kind === 'ongoing') {
      next = hrTakeStance(next, chooseHRStance(next, Math.random, exclude));
      setHrLine(stanceById(next.stance).blurb);
      setFlash(`回合 ${next.round} · HR 摆出「${stanceById(next.stance).name}」`);
    }
    setBattle(next);
  }, [battle, busy, exclude]);

  const onSettle = useCallback(async () => {
    if (!battle || busy || battle.outcome.kind !== 'ongoing') return;
    const next = settle(battle);
    setBattle(next);
    setBusy(true);
    const line = await fetchHRLine(handIds[0], battle.stance, 'settled');
    setHrLine(line ?? '……行吧,就这个数。');
    setBusy(false);
  }, [battle, busy, handIds, fetchHRLine]);

  // ---------- 准备界面 ----------
  if (phase === 'prep') {
    const xpp = xpProgress(progress.xp);
    const nxt = nextLevel(progress.xp);
    return (
      <div style={page}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button onClick={() => navigate('/fired')} style={btnGhost}>← 返回</button>
          <h2 style={{ fontSize: 18, margin: 0 }}>⚔️ 赔偿谈判·闯关牌局 <span style={{ fontSize: 12, opacity: 0.5 }}>Beta</span></h2>
        </div>

        {/* 职级 / 经验 / 遣散费 */}
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <strong style={{ fontSize: 17 }}>🧑‍🏭 {career.title} <span style={{ opacity: 0.5, fontSize: 13 }}>Lv.{level}</span></strong>
            <span style={{ fontSize: 13, opacity: 0.85 }}>💸 累计遣散费 <b>{progress.severance}</b> 个月 · 🏆 {progress.wins} 胜</span>
          </div>
          {xpp.span != null ? (
            <Bar label={`经验(距「${nxt?.title}」)`} value={xpp.into} max={xpp.span} color="#a78bfa" />
          ) : (
            <div style={{ fontSize: 12, opacity: 0.7 }}>已满级 · 劳动法之神 🎓</div>
          )}
        </div>

        {/* BOSS 选择 */}
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>选对手 HR(职级越高解锁越狠的 BOSS,赔得也越多)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {BOSS_TIERS.map((b) => {
            const locked = b.minLevel > level;
            const sel = bossId === b.id;
            return (
              <button key={b.id} disabled={locked} onClick={() => setBossId(b.id)}
                style={{
                  ...rowBtn, textAlign: 'left', cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.4 : 1,
                  border: sel ? '1px solid rgba(120,180,255,0.8)' : '1px solid rgba(255,255,255,0.12)',
                  background: sel ? 'rgba(80,150,255,0.16)' : 'rgba(255,255,255,0.05)',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>{b.emoji} {b.name} <span style={{ fontSize: 11, opacity: 0.6 }}>赔率 ×{b.rewardMult}</span></span>
                  {locked && <span style={{ fontSize: 11 }}>🔒 Lv.{b.minLevel}</span>}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{b.blurb}</div>
              </button>
            );
          })}
        </div>

        {/* 遗物选择 */}
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>带一件职场遗物(一次性,改写规则;可不带)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 8 }}>
          {RELIC_POOL.map((r) => {
            const sel = relicId === r.id;
            return (
              <button key={r.id} onClick={() => setRelicId(sel ? null : r.id)}
                style={{
                  ...rowBtn, textAlign: 'left', cursor: 'pointer',
                  border: sel ? '1px solid rgba(220,180,90,0.85)' : '1px solid rgba(255,255,255,0.12)',
                  background: sel ? 'rgba(220,170,70,0.16)' : 'rgba(255,255,255,0.05)',
                }}>
                <div style={{ fontWeight: 700 }}>{r.emoji} {r.name}</div>
                <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2 }}>{r.blurb}</div>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 14 }}>当前选择:{relicId ? RELIC_POOL.find((r) => r.id === relicId)?.name : '不带遗物'}</div>

        <button onClick={startBattle} style={{ ...btnPrimary, width: '100%', padding: 14, fontSize: 15 }}>
          开始谈判 ⚔️ vs {boss.emoji} {boss.name}
        </button>
      </div>
    );
  }

  // ---------- 对战界面 ----------
  if (!battle) return null;
  const outcomeView = (() => {
    const o = battle.outcome;
    if (o.kind === 'ongoing') return null;
    const title = o.kind === 'flipped' ? '💥 HR 掀桌了!' : o.kind === 'caved' ? '😮‍💨 你认怂了' : '🤝 谈成了';
    const sub = o.kind === 'flipped'
      ? '一拍两散,走劳动仲裁,赔偿归零。贪过头了。'
      : o.kind === 'caved' ? `底气耗尽,只拿到 ${'multiple' in o ? o.multiple : ''}。`
      : `锁定赔偿:${'multiple' in o ? o.multiple : ''}`;
    return { title, sub };
  })();

  return (
    <div style={page}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setPhase('prep')} style={btnGhost}>← 准备</button>
        <h2 style={{ fontSize: 16, margin: 0 }}>vs {boss.emoji} {boss.name}{relicId ? ` · ${RELIC_POOL.find((r) => r.id === relicId)?.emoji}` : ''}</h2>
      </div>

      <div style={{ ...card, background: 'rgba(255,80,80,0.08)', borderColor: 'rgba(255,80,80,0.25)', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>🧑‍💼 HR · 姿态「{stance.name}」</strong>
          <span style={{ fontSize: 12, opacity: 0.7 }}>第 {battle.round} 回合</span>
        </div>
        <div style={{ minHeight: 44, fontSize: 15, lineHeight: 1.5, fontStyle: 'italic', marginBottom: 10 }}>“{hrLine}”</div>
        <Bar icon={battleStatIcons.budget} emoji="💰" label="预算(打越低赔越多)" value={battle.budget} max={maxes.budget} color="#ff6b6b" />
        <Bar icon={battleStatIcons.patience} emoji="😤" label="耐心(归零就掀桌)" value={battle.patience} max={maxes.patience} color="#ffa94d" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {TIERS.map((t) => (
          <div key={t} style={{
            flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 8, fontSize: 13,
            background: t === tier ? 'rgba(120,200,120,0.25)' : 'rgba(255,255,255,0.05)',
            border: t === tier ? '1px solid rgba(120,220,120,0.6)' : '1px solid transparent',
            fontWeight: t === tier ? 700 : 400,
          }}>{tierLabel(t)}</div>
        ))}
      </div>

      <div style={{ ...card, background: 'rgba(80,150,255,0.08)', borderColor: 'rgba(80,150,255,0.25)', marginBottom: 12 }}>
        <Bar icon={battleStatIcons.morale} emoji="🔥" label="底气(归零就认怂)" value={battle.morale} max={maxes.morale} color="#4dabf7" />
        <Bar icon={battleStatIcons.chips} emoji="🎟️" label="筹码(出牌资源)" value={battle.chips} max={battle.chipMax} color="#a78bfa" />
        {flash && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{flash}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
        {handIds.map((id) => {
          const c = cardById(id); if (!c) return null;
          const mult = effectMultiplier(c.tag, stance);
          const afford = battle.chips >= c.cost && !over && !busy;
          const badge = mult === 1.5 ? '🔥克制 HR' : mult === 0.5 ? '🛡被挡' : '';
          return (
            <button key={id} onClick={() => onPlay(id)} disabled={!afford}
              style={{
                textAlign: 'left', padding: 10, borderRadius: 10, cursor: afford ? 'pointer' : 'not-allowed',
                background: afford ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
                border: mult === 1.5 ? '1px solid rgba(120,220,120,0.6)' : mult === 0.5 ? '1px solid rgba(255,120,120,0.4)' : '1px solid rgba(255,255,255,0.12)',
                color: '#fff', opacity: afford ? 1 : 0.45,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon src={negotiationCardIcons[id]} emoji="🃏" size={18} alt="" />{c.name}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <Icon src={battleStatIcons.chips} emoji="🎟️" size={12} alt="" />{c.cost}
                </span>
              </div>
              <div style={{ fontSize: 11, opacity: 0.7, margin: '2px 0' }}>
                {TAG_CN[c.tag]} · 力度 {c.pressure}{c.patienceHit ? ` · 激怒 ${c.patienceHit}` : ''}
              </div>
              {badge && <div style={{ fontSize: 11, color: mult === 1.5 ? '#8ce99a' : '#ffa8a8' }}>{badge}</div>}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onEndTurn} disabled={busy || over} style={{ ...btnPrimary, flex: 1, opacity: busy || over ? 0.5 : 1 }}>结束本回合 →</button>
        <button onClick={onSettle} disabled={busy || over || tier === 0} style={{ ...btnGood, flex: 1, opacity: busy || over || tier === 0 ? 0.5 : 1 }}>✅ 见好就收({tierLabel(tier)})</button>
      </div>
      <p style={{ fontSize: 11, opacity: 0.45, marginTop: 10, lineHeight: 1.6 }}>
        踩 HR 弱点(🔥)×1.5,撞克制(🛡)×0.5。够本就「见好就收」锁定,贪到耐心见底 HR 会掀桌、赔偿归零。
      </p>

      {outcomeView && (
        <div style={overlay}>
          <div style={{ background: '#171a22', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: 24, maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>{outcomeView.title}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 6 }}>{outcomeView.sub}</div>
            <div style={{ fontSize: 13, opacity: 0.7, fontStyle: 'italic', marginBottom: 14 }}>HR:“{hrLine}”</div>
            {reward && (
              <div style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 10, padding: 10, marginBottom: 14, fontSize: 14 }}>
                结算奖励:经验 <b>+{reward.xp}</b> · 遣散费 <b>+{reward.severance}</b> 个月
                {leveledTo && <div style={{ color: '#ffd43b', fontWeight: 800, marginTop: 6 }}>🎉 升职!现在是「{leveledTo}」,解锁新对手 / 新卡!</div>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPhase('prep')} style={{ ...btnPrimary, flex: 1 }}>再来一局</button>
              <button onClick={() => navigate('/fired')} style={{ ...btnGhost, flex: 1 }}>回裁了么</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const page: React.CSSProperties = { minHeight: '100vh', background: '#0e1016', color: '#fff', padding: 16, maxWidth: 720, margin: '0 auto' };
const card: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 14 };
const rowBtn: React.CSSProperties = { padding: 10, borderRadius: 10, color: '#fff' };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const btnGhost: React.CSSProperties = { background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: '#4263eb', color: '#fff', border: 'none', borderRadius: 8, padding: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700 };
const btnGood: React.CSSProperties = { background: '#2f9e44', color: '#fff', border: 'none', borderRadius: 8, padding: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700 };
