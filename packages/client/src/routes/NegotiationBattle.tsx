/**
 * NegotiationBattle.tsx — 「裁了么」闯关牌局 UI。
 *
 * v6.58 方案 A:数值跑在 shared/negotiation 纯引擎,服务端只配 HR 台词。
 * v6.59 方案 B(局间成长)+ C(职场遗物):开局先进「准备」界面 —— 看职级/经验/遣散费,
 *   选 BOSS 难度(职级解锁)、选一件一次性遗物;打完按结果给经验+遣散费(localStorage
 *   持久化),升职级解锁进阶卡 + 更狠的 BOSS。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  DEFAULT_HAND_SIZE,
  type DeckState,
  initDeck,
  refillHand,
  discardCard,
  discardHand,
  type Loadout,
  buildDeckIds,
  buyRelic,
  buyCopy,
  buyUpgrade,
  baseCardId,
  RELIC_PRICE,
  COPY_PRICE,
  UPGRADE_PRICE,
  MAX_EXTRA_COPIES,
  settlementVibe,
  buildBridge,
  type NegRun,
  type NegRunSubmit,
} from '@furball/shared';
import { battleStatIcons, negotiationCardIcons, Icon } from '../constants/icons';
import { downloadNegotiationShareCard, shareNegotiationCard } from '../utils/negotiationShareCard';
import { getUserId } from '../utils/userId';

const TAG_CN: Record<CardTag, string> = {
  legal: '劳动法', tenure: '工龄', emotion: '情绪', insider: '爆料', market: '市场',
};

const STORE_KEY = 'oz_neg_progress_v1';
// v6.64 — Progress 同时是商店 Loadout(severance 既是奖励货币也是商店货币)。
interface Progress {
  xp: number; severance: number; wins: number;
  ownedRelics: string[];
  extraCopies: Record<string, number>;
  upgrades: Record<string, boolean>;
}
function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        xp: p.xp || 0, severance: p.severance || 0, wins: p.wins || 0,
        ownedRelics: Array.isArray(p.ownedRelics) ? p.ownedRelics : [],
        extraCopies: p.extraCopies && typeof p.extraCopies === 'object' ? p.extraCopies : {},
        upgrades: p.upgrades && typeof p.upgrades === 'object' ? p.upgrades : {},
      };
    }
  } catch { /* ignore */ }
  return { xp: 0, severance: 0, wins: 0, ownedRelics: [], extraCopies: {}, upgrades: {} };
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
const VIBE_DOT: Record<'win' | 'meh' | 'lose', string> = { win: '#22c55e', meh: '#fbbf24', lose: '#ef4444' };

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
  const [deck, setDeck] = useState<DeckState | null>(null);
  const rewardedRef = useRef(false);

  // v6.66 — 战绩榜 + 主对局桥接。
  const [params] = useSearchParams();
  const bridgeFor = (params.get('for') || '').slice(0, 24); // 替哪只被裁的鼠谈(主对局桥接)
  const [wall, setWall] = useState<NegRun[] | null>(null);
  const [wallOpen, setWallOpen] = useState(false);

  const career = levelFromXp(progress.xp);
  const level = career.level;
  const boss = bossById(bossId);

  // v6.66 — 从主对局「替 TA 谈赔偿」进来时,按鼠名预选一档已解锁 BOSS。
  useEffect(() => {
    if (bridgeFor) setBossId(buildBridge(bridgeFor, levelFromXp(progress.xp).level).bossId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeFor]);

  const loadWall = useCallback(() => {
    fetch('/api/negotiation/leaderboard?limit=10')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { top: NegRun[] }) => setWall(Array.isArray(d.top) ? d.top : []))
      .catch(() => setWall([]));
  }, []);

  const startBattle = useCallback(() => {
    const { config, excludeStances } = applyRelics(relicId ? [relicId] : [], { ...boss.config });
    const loadout: Loadout = {
      severance: progress.severance, ownedRelics: progress.ownedRelics,
      extraCopies: progress.extraCopies, upgrades: progress.upgrades,
    };
    const deckIds = buildDeckIds(unlockedCardIds(level), loadout); // 含复制份数 + 升级标记
    const s = initBattle(config);
    setBattle(s);
    setDeck(initDeck(deckIds, DEFAULT_HAND_SIZE));
    setMaxes({ morale: s.morale, patience: s.patience, budget: Math.max(BUDGET_MAX, s.budget) });
    setExclude(excludeStances);
    setHrLine(stanceById(s.stance).blurb);
    setFlash(''); setReward(null); setLeveledTo(null);
    rewardedRef.current = false;
    setPhase('battle');
  }, [boss, relicId, level, progress]);

  // 商店:用 shop 纯函数买东西,买成功就持久化(severance 既是奖励也是货币)。
  const buy = useCallback((fn: (lo: Loadout) => Loadout | null) => {
    setProgress((prev) => {
      const next = fn({ severance: prev.severance, ownedRelics: prev.ownedRelics, extraCopies: prev.extraCopies, upgrades: prev.upgrades });
      if (!next) return prev; // 买不起 / 非法 / 到顶
      const np = { ...prev, ...next };
      saveProgress(np);
      return np;
    });
  }, []);

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
      const np = { ...prev, xp, severance: prev.severance + r.severance, wins: prev.wins + (won ? 1 : 0) };
      saveProgress(np);
      return np;
    });

    // v6.66 — 上报全网战绩榜(取本局结果;userId + ts 服务端注入)。锦上添花,失败不打扰。
    const o = battle.outcome;
    const oc = o.kind as 'settled' | 'caved' | 'flipped';
    const tierNow = 'tier' in o ? o.tier : 0;
    const run: NegRunSubmit = {
      severance: r.severance, xp: r.xp, outcomeKind: oc,
      tier: tierNow, multiple: 'multiple' in o ? o.multiple : '未谈成',
      bossId: boss.id, bossName: boss.name, bossEmoji: boss.emoji,
      careerTitle: levelFromXp(progress.xp + r.xp).title,
      vibe: settlementVibe({ outcomeKind: oc, tier: tierNow }),
      rounds: battle.round,
      ...(relicId ? { relicName: RELIC_POOL.find((x) => x.id === relicId)?.name } : {}),
    };
    fetch('/api/negotiation/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
      body: JSON.stringify(run),
    }).catch(() => { /* 榜单失败不影响本局 */ });
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
    setDeck((d) => (d ? discardCard(d, cardId) : d)); // 打出的牌进弃牌堆
    setFlash(`「${card.name}」×${mult} → HR 预算 −${dealt}`);
    setBusy(true); setHrLine('……');
    const line = await fetchHRLine(cardId, stanceId, next.outcome.kind);
    setHrLine(line ?? stanceById(stanceId).blurb);
    setBusy(false);
  }, [battle, busy, fetchHRLine]);

  const onEndTurn = useCallback(() => {
    if (!battle || busy || battle.outcome.kind !== 'ongoing') return;
    setDeck((d) => (d ? refillHand(discardHand(d), DEFAULT_HAND_SIZE) : d)); // 弃剩余手牌 + 重抽
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

        {/* v6.66 — 主对局桥接横幅:替被裁的鼠去谈赔偿 */}
        {bridgeFor && (
          <div style={{
            ...card, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10,
            border: '1px solid rgba(110,231,183,0.45)', background: 'rgba(110,231,183,0.10)',
          }}>
            <span style={{ fontSize: 26 }}>🎯</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{buildBridge(bridgeFor, level).banner}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                TA 在局里被裁了 —— 你替 TA 跟 HR 把赔偿谈回来。已按职级配好对手,也可手动改。
              </div>
            </div>
          </div>
        )}

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

        {/* 遗物:已买的可装备一件;没买的去商店买(花遣散费,永久拥有) */}
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
          职场遗物(装备一件;商店买后永久拥有)· 可用 💸 <b>{progress.severance}</b>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
          {RELIC_POOL.map((r) => {
            const owned = progress.ownedRelics.includes(r.id);
            const sel = relicId === r.id;
            return (
              <div key={r.id} style={{
                ...rowBtn,
                border: sel ? '1px solid rgba(220,180,90,0.85)' : '1px solid rgba(255,255,255,0.12)',
                background: sel ? 'rgba(220,170,70,0.16)' : 'rgba(255,255,255,0.05)',
              }}>
                <div style={{ fontWeight: 700 }}>{r.emoji} {r.name}</div>
                <div style={{ fontSize: 11, opacity: 0.72, margin: '2px 0 6px' }}>{r.blurb}</div>
                {owned ? (
                  <button onClick={() => setRelicId(sel ? null : r.id)}
                    style={{ ...chipBtn, background: sel ? '#2f9e44' : 'rgba(255,255,255,0.14)' }}>
                    {sel ? '✓ 已装备' : '装备'}
                  </button>
                ) : (
                  <button onClick={() => buy((lo) => buyRelic(lo, r.id))} disabled={progress.severance < RELIC_PRICE}
                    style={{ ...chipBtn, opacity: progress.severance < RELIC_PRICE ? 0.4 : 1 }}>
                    买 · 💸{RELIC_PRICE}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 卡牌商店:复制(同名多张)/ 升级(力度 +) —— deck-building */}
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>卡牌商店(复制 💸{COPY_PRICE} · 升级 💸{UPGRADE_PRICE})</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
          {unlockedCardIds(level).map((id) => {
            const c = cardById(id); if (!c) return null;
            const copies = 1 + (progress.extraCopies[id] ?? 0);
            const upgraded = !!progress.upgrades[id];
            const capped = copies >= 1 + MAX_EXTRA_COPIES;
            return (
              <div key={id} style={{ ...rowBtn, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {c.name}{upgraded ? '+' : ''} <span style={{ opacity: 0.5, fontSize: 11 }}>×{copies}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button onClick={() => buy((lo) => buyCopy(lo, id))} disabled={progress.severance < COPY_PRICE || capped}
                    style={{ ...chipBtn, flex: 1, opacity: progress.severance < COPY_PRICE || capped ? 0.4 : 1 }}>
                    {capped ? '满' : '复制'}
                  </button>
                  <button onClick={() => buy((lo) => buyUpgrade(lo, id))} disabled={progress.severance < UPGRADE_PRICE || upgraded}
                    style={{ ...chipBtn, flex: 1, opacity: progress.severance < UPGRADE_PRICE || upgraded ? 0.4 : 1 }}>
                    {upgraded ? '已升' : '升级'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* v6.66 — 全网战绩榜(晒图入口:每行可重画那局的战绩卡) */}
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={() => { setWallOpen((o) => !o); if (!wallOpen && wall === null) loadWall(); }}
            style={{ ...rowBtn, width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
            <span style={{ fontWeight: 700 }}>🏆 全网战绩榜 <span style={{ fontSize: 11, opacity: 0.55 }}>遣散费排名</span></span>
            <span style={{ fontSize: 12, opacity: 0.6 }}>{wallOpen ? '收起 ▲' : '展开 ▼'}</span>
          </button>
          {wallOpen && (
            <div style={{ ...card, marginTop: 8 }}>
              {wall === null && <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', padding: '10px 0' }}>⏳ 加载中…</div>}
              {wall && wall.length === 0 && <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', padding: '10px 0' }}>还没人上榜 —— 打一局,你就是榜一。</div>}
              {wall && wall.map((row, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13,
                  borderTop: i ? '1px solid rgba(255,255,255,0.07)' : 'none',
                }}>
                  <span style={{ width: 22, textAlign: 'center', fontWeight: 800, opacity: 0.7 }}>{i + 1}</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: VIBE_DOT[row.vibe], flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.bossEmoji} <b>{row.severance}</b> 个月 · {row.multiple}
                    <span style={{ opacity: 0.55 }}> · {row.careerTitle}</span>
                  </span>
                  <button
                    title="生成这局的战绩卡"
                    onClick={() => downloadNegotiationShareCard({
                      outcomeKind: row.outcomeKind, tier: row.tier, multiple: row.multiple,
                      bossName: row.bossName, bossEmoji: row.bossEmoji, relicName: row.relicName,
                      rounds: row.rounds, severance: row.severance, xp: row.xp, careerTitle: row.careerTitle,
                    })}
                    style={{ ...chipBtn, padding: '2px 8px', width: 'auto', flexShrink: 0 }}>📸</button>
                </div>
              ))}
            </div>
          )}
        </div>

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

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.6, marginBottom: 6 }}>
        <span>🂠 手牌(回合结束重抽)</span>
        <span>牌库 {deck?.draw.length ?? 0} · 弃 {deck?.discard.length ?? 0}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 14, minHeight: 64 }}>
        {(deck?.hand ?? []).map((id, i) => {
          const c = cardById(id); if (!c) return null;
          const mult = effectMultiplier(c.tag, stance);
          const afford = battle.chips >= c.cost && !over && !busy;
          const badge = mult === 1.5 ? '🔥克制 HR' : mult === 0.5 ? '🛡被挡' : '';
          return (
            <button key={`${id}-${i}`} onClick={() => onPlay(id)} disabled={!afford}
              style={{
                textAlign: 'left', padding: 10, borderRadius: 10, cursor: afford ? 'pointer' : 'not-allowed',
                background: afford ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
                border: mult === 1.5 ? '1px solid rgba(120,220,120,0.6)' : mult === 0.5 ? '1px solid rgba(255,120,120,0.4)' : '1px solid rgba(255,255,255,0.12)',
                color: '#fff', opacity: afford ? 1 : 0.45,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon src={negotiationCardIcons[baseCardId(id)]} emoji="🃏" size={18} alt="" />{c.name}
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
            <button
              onClick={() => {
                const o = battle.outcome;
                if (o.kind === 'ongoing') return;
                const input = {
                  outcomeKind: o.kind,
                  tier: 'tier' in o ? o.tier : 0,
                  multiple: 'multiple' in o ? o.multiple : '未谈成',
                  bossName: boss.name, bossEmoji: boss.emoji,
                  relicName: relicId ? RELIC_POOL.find((r) => r.id === relicId)?.name : undefined,
                  rounds: battle.round,
                  severance: reward?.severance ?? 0,
                  xp: reward?.xp ?? 0,
                  careerTitle: levelFromXp(progress.xp).title,
                };
                shareNegotiationCard(input).then((ok) => { if (!ok) downloadNegotiationShareCard(input); });
              }}
              style={{ ...btnGood, width: '100%', marginBottom: 8, background: '#7048e8' }}>
              📸 生成战绩卡
            </button>
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
const chipBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700, width: '100%' };
