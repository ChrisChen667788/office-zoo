/**
 * VoteDuel — v6.18 P3 双人 1v1 投票 duel route.
 *
 * One route handles 3 states:
 *   1. /duel/new                     — host BallotPicker → POST create → redirect /duel/<id>
 *   2. /duel/:id when guest not joined → show host ballot + guest BallotPicker
 *   3. /duel/:id when both filled    → side-by-side comparison + live score
 *
 * Ballot size BALLOT_SIZE_FE (3) matches server. Each pick = (rat, personality).
 * No duplicate rats per ballot.
 *
 * "Live" score: comparison happens any time (current /votes/leaders).
 * The duel can re-render every fetch — leaders rotate during the week
 * as more users cast votes, so duel score is alive until week ends.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CHARACTERS, ALL_CHARACTER_NAMES } from '@furball/shared';
import { PERSONALITY_LABELS_LITE, ALL_PERSONALITY_IDS } from '../constants/personalityLabels';
import { getUserId } from '../utils/userId';
import EventPill from '../components/EventPill';

const BALLOT_SIZE_FE = 3;

interface BallotPick { rat: string; personality: string }

interface DuelData {
  duelId: string;
  weekKey: string;
  createdAt: number;
  hostUserId: string;
  hostBallot: BallotPick[];
  guestUserId?: string;
  guestBallot?: BallotPick[];
}
interface Scores {
  hostScore: number;
  guestScore: number;
  perPickHost: Array<BallotPick & { matched: boolean; currentDominant: string | null }>;
  perPickGuest: Array<BallotPick & { matched: boolean; currentDominant: string | null }>;
  leadersWeekKey: string;
}

export default function VoteDuel() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const myId = getUserId();

  const [duel, setDuel] = useState<DuelData | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const isCreating = id === 'new';

  useEffect(() => {
    if (isCreating || !id) return;
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/characters/votes/duels/${encodeURIComponent(id!)}`);
        if (!r.ok) { setLoadErr(r.status === 404 ? '决斗不存在' : `加载失败 ${r.status}`); return; }
        const d = (await r.json()) as { duel: DuelData; scores: Scores | null };
        if (cancelled) return;
        setDuel(d.duel);
        setScores(d.scores);
      } catch {
        if (!cancelled) setLoadErr('加载失败');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, isCreating]);

  /**
   * v6.19 P1 — poll for guest joining while we're the waiting host.
   * 5s interval (cheap; duel data ~500B). Stops on guest joined OR
   * unmount. The CharacterFocusModal trick from v6.11 P4 doesn't apply
   * here since we need explicit re-fetch.
   */
  useEffect(() => {
    if (isCreating || !id || !duel) return;
    // Already joined → no need to poll
    if (duel.guestBallot) return;
    // Only the host needs to poll (guest sees the JoinView directly)
    if (duel.hostUserId !== myId) return;
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/characters/votes/duels/${encodeURIComponent(id)}`);
        if (!r.ok) return;
        const d = (await r.json()) as { duel: DuelData; scores: Scores | null };
        if (d.duel.guestBallot) {
          // Guest joined — flip to result view
          setDuel(d.duel);
          setScores(d.scores);
        }
      } catch { /* silent retry next tick */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [id, isCreating, duel, myId]);

  return (
    <div className="flex flex-col items-center px-4 py-8 min-h-screen"
      style={{
        background:
          'radial-gradient(ellipse at 25% 18%, rgba(255,79,163,0.25) 0%, transparent 45%),' +
          'radial-gradient(ellipse at 78% 82%, rgba(255,215,0,0.18) 0%, transparent 50%),' +
          'radial-gradient(ellipse at 50% 50%, #2D1B69 0%, #1a0d35 60%, #0a0a1e 100%)',
      }}>
      <div className="w-full max-w-2xl flex items-center justify-between mb-4">
        <button onClick={() => navigate('/')}
          className="text-xs px-3 py-1.5 rounded-full font-bold"
          style={{ background: 'rgba(255,255,255,0.85)', color: '#0a0a0a', border: '2px solid #0a0a0a' }}>← 首页</button>
        <EventPill stars={5} subtle>⚔️ 鼠人选秀 · 1v1 斗投</EventPill>
        <div style={{ width: 60 }} />
      </div>

      {isCreating && <CreateView onCreated={(newId) => navigate(`/duel/${newId}`)} />}

      {!isCreating && loadErr && (
        <div className="text-rose-300/85 text-sm py-12">⚠️ {loadErr}</div>
      )}

      {!isCreating && !duel && !loadErr && (
        <div className="text-white/55 text-sm py-12">⏳ 加载中…</div>
      )}

      {!isCreating && duel && (
        duel.guestBallot && scores
          ? <ResultView duel={duel} scores={scores} myId={myId} />
          : duel.hostUserId === myId
            ? <WaitingHostView duel={duel} />
            : <JoinView duel={duel} onJoined={(d, s) => { setDuel(d); setScores(s); }} />
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function BallotPicker({
  onChange,
  picks,
}: {
  onChange: (next: BallotPick[]) => void;
  picks: BallotPick[];
}) {
  function setRat(slot: number, rat: string) {
    const next = [...picks];
    next[slot] = { ...next[slot], rat };
    onChange(next);
  }
  function setPersonality(slot: number, personality: string) {
    const next = [...picks];
    next[slot] = { ...next[slot], personality };
    onChange(next);
  }
  // For each slot, disable rats already picked in other slots
  const pickedRats = new Set(picks.filter((p, i) => p.rat).map((p) => p.rat));
  return (
    <div className="flex flex-col gap-3 w-full">
      {Array.from({ length: BALLOT_SIZE_FE }).map((_, slot) => {
        const pick = picks[slot] ?? { rat: '', personality: '' };
        return (
          <div key={slot} style={{
            padding: '10px 12px', borderRadius: 12,
            background: 'rgba(20,15,40,0.6)',
            border: '1px solid rgba(255,79,163,0.32)',
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 12, fontWeight: 900, color: '#FFD700',
              minWidth: 22,
            }}>#{slot + 1}</span>
            <select
              value={pick.rat}
              onChange={(e) => setRat(slot, e.target.value)}
              style={{
                flex: '1 1 130px', padding: '6px 8px', borderRadius: 6,
                background: 'rgba(0,0,0,0.4)', color: '#F8F4E3',
                border: '1px solid rgba(255,255,255,0.18)',
                fontFamily: 'inherit', fontSize: 12,
              }}>
              <option value="">— 选鼠人 —</option>
              {ALL_CHARACTER_NAMES.map((name) => {
                const c = CHARACTERS[name];
                const taken = pickedRats.has(name) && pick.rat !== name;
                return (
                  <option key={name} value={name} disabled={taken}>
                    {c?.emoji} {c?.epithet ?? name}{taken ? ' (已选)' : ''}
                  </option>
                );
              })}
            </select>
            <span style={{ color: '#FF4FA3', fontWeight: 900 }}>→</span>
            <select
              value={pick.personality}
              onChange={(e) => setPersonality(slot, e.target.value)}
              style={{
                flex: '1 1 110px', padding: '6px 8px', borderRadius: 6,
                background: 'rgba(0,0,0,0.4)', color: '#F8F4E3',
                border: '1px solid rgba(255,255,255,0.18)',
                fontFamily: 'inherit', fontSize: 12,
              }}>
              <option value="">— 选 personality —</option>
              {ALL_PERSONALITY_IDS.map((p) => {
                const pl = PERSONALITY_LABELS_LITE[p];
                return <option key={p} value={p}>{pl.emoji} {pl.label}</option>;
              })}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function CreateView({ onCreated }: { onCreated: (duelId: string) => void }) {
  const [picks, setPicks] = useState<BallotPick[]>(
    Array.from({ length: BALLOT_SIZE_FE }, () => ({ rat: '', personality: '' })),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = picks.every((p) => p.rat && p.personality);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/characters/votes/duels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
        body: JSON.stringify({ ballot: picks }),
      });
      if (!r.ok) { setErr(`创建失败 (${r.status})`); return; }
      const data = await r.json();
      onCreated(data.duelId);
    } catch {
      setErr('网络错误');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-xl">
      <div className="text-center mb-4">
        <div style={{
          fontSize: 11, fontWeight: 900, letterSpacing: '0.18em',
          color: '#FFD700', textTransform: 'uppercase', marginBottom: 6,
        }}>⚔️ 创建斗投</div>
        <div style={{ fontSize: 12, color: 'rgba(248,244,227,0.7)', lineHeight: 1.5 }}>
          选 {BALLOT_SIZE_FE} 只鼠 + 各自的 personality. 创建后拿到 share
          链接给朋友, 对方填完自己的 ballot, 实时对比谁押中 weekly leader
          多. 每押中 1 票 1 分.
        </div>
      </div>
      <BallotPicker picks={picks} onChange={setPicks} />
      {err && <div className="mt-3 text-rose-300 text-xs text-center">{err}</div>}
      <button
        onClick={submit}
        disabled={!valid || busy}
        className="mt-4 w-full py-3 rounded-xl font-black"
        style={{
          background: valid
            ? 'linear-gradient(135deg, #FFD700 0%, #FF4FA3 50%, #B086FF 100%)'
            : 'rgba(255,255,255,0.08)',
          color: valid ? '#1a0d35' : 'rgba(255,255,255,0.4)',
          cursor: !valid || busy ? 'not-allowed' : 'pointer',
          fontSize: 14, letterSpacing: '0.05em',
        }}>
        {busy ? '创建中…' : '✓ 锁定我的 ballot → 邀请朋友'}
      </button>
    </div>
  );
}

function WaitingHostView({ duel }: { duel: DuelData }) {
  const shareUrl = `${window.location.origin}/duel/${duel.duelId}`;
  const [copied, setCopied] = useState(false);
  const [bigSuccess, setBigSuccess] = useState(false); // big screen-flash overlay
  // OS share availability (mobile / Safari macOS support it)
  const hasOsShare = typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setBigSuccess(true);
      setTimeout(() => setCopied(false), 1500);
      setTimeout(() => setBigSuccess(false), 900);
    } catch { /* user can manually copy from input */ }
  }
  async function osShare() {
    const navShare = (navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> }).share;
    if (!navShare) return;
    try {
      await navShare({
        title: 'OFFICE ZOO · 1v1 鼠人斗投',
        text: '我押了 3 只鼠人 + personality, 来跟我斗投, 看谁更懂大众心理 ⚔️',
        url: shareUrl,
      });
      // 用户从 native picker 选完 share target 后到这里. 也算"已复制"
      setBigSuccess(true);
      setTimeout(() => setBigSuccess(false), 900);
    } catch { /* user cancelled OR not allowed in iframe — silent */ }
  }
  return (
    <div className="w-full max-w-xl">
      <div className="text-center mb-4">
        <div style={{
          fontSize: 11, fontWeight: 900, letterSpacing: '0.18em',
          color: '#FFD700', textTransform: 'uppercase', marginBottom: 6,
        }}>📤 等朋友加入 · {duel.weekKey}</div>
        <div style={{ fontSize: 12, color: 'rgba(248,244,227,0.7)' }}>
          复制链接发给朋友. 对方进入后填自己的 ballot, 双方实时对比.
        </div>
      </div>
      <div style={{
        padding: '10px 12px', borderRadius: 12,
        background: 'rgba(20,15,40,0.85)',
        border: '1px solid rgba(255,215,0,0.45)',
        display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14,
      }}>
        <input
          readOnly value={shareUrl}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: '#F8F4E3', fontFamily: 'inherit', fontSize: 12,
            outline: 'none',
          }}
          onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
        />
        <button onClick={copy}
          style={{
            padding: '4px 10px', borderRadius: 6,
            background: copied
              ? 'linear-gradient(135deg, #5be24a, #22c55e)'
              : 'linear-gradient(135deg, #FFD700, #FFA947)',
            color: '#1a0d35', fontWeight: 900, fontSize: 11,
            border: 'none', cursor: 'pointer',
            letterSpacing: '0.05em',
          }}>{copied ? '✓ 已复制' : '复制'}</button>
        {hasOsShare && (
          <button onClick={osShare}
            style={{
              padding: '4px 10px', borderRadius: 6,
              background: 'linear-gradient(135deg, #FF4FA3, #B086FF)',
              color: '#FFFFFF', fontWeight: 900, fontSize: 11,
              border: 'none', cursor: 'pointer',
              letterSpacing: '0.05em',
            }}>📤 系统分享</button>
        )}
      </div>

      {/* v6.19 P1 — polling indicator: "waiting" pulse so user knows
           we're auto-checking every 5s for guest joining. */}
      <div style={{
        marginBottom: 12, textAlign: 'center', fontSize: 11,
        color: 'rgba(255,215,0,0.65)', letterSpacing: '0.05em',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 999,
          background: 'rgba(255,215,0,0.06)',
          border: '1px dashed rgba(255,215,0,0.32)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#FFD700',
            animation: 'duelPulse 1.2s ease-in-out infinite',
          }} />
          每 5 秒自动检查朋友是否已加入 …
        </span>
        <style>{`
          @keyframes duelPulse {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.4); }
          }
          @keyframes bigSuccessIn {
            0%   { opacity: 0; transform: scale(0.3) rotate(-8deg); }
            60%  { opacity: 1; transform: scale(1.15) rotate(2deg); }
            100% { opacity: 1; transform: scale(1) rotate(0deg); }
          }
        `}</style>
      </div>

      <BallotPreview title="你的 ballot" picks={duel.hostBallot} />

      {/* v6.19 P1 — big success overlay after copy / OS share. Fades
           naturally in 900ms, non-blocking. */}
      {bigSuccess && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            padding: '24px 40px', borderRadius: 24,
            background: 'linear-gradient(135deg, rgba(91,226,74,0.95), rgba(34,197,94,0.92))',
            color: '#0a3017', fontSize: 48, fontWeight: 900,
            letterSpacing: '0.04em',
            boxShadow: '0 20px 60px rgba(34,197,94,0.55), 0 0 80px rgba(91,226,74,0.4)',
            animation: 'bigSuccessIn 0.42s cubic-bezier(0.22, 1.4, 0.36, 1)',
          }}>
            ✓ 已分享
          </div>
        </div>
      )}
    </div>
  );
}

function JoinView({ duel, onJoined }: { duel: DuelData; onJoined: (d: DuelData, s: Scores) => void }) {
  const [picks, setPicks] = useState<BallotPick[]>(
    Array.from({ length: BALLOT_SIZE_FE }, () => ({ rat: '', personality: '' })),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = picks.every((p) => p.rat && p.personality);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/characters/votes/duels/${encodeURIComponent(duel.duelId)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
        body: JSON.stringify({ ballot: picks }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setErr(e.error ?? `加入失败 (${r.status})`);
        return;
      }
      const data = await r.json();
      onJoined(data.duel, data.scores);
    } catch { setErr('网络错误'); }
    finally { setBusy(false); }
  }

  return (
    <div className="w-full max-w-xl">
      <div className="text-center mb-4">
        <div style={{
          fontSize: 11, fontWeight: 900, letterSpacing: '0.18em',
          color: '#FFD700', textTransform: 'uppercase', marginBottom: 6,
        }}>👋 朋友邀请你斗投 · {duel.weekKey}</div>
        <div style={{ fontSize: 12, color: 'rgba(248,244,227,0.7)' }}>
          对方已锁 {BALLOT_SIZE_FE} 鼠. 你也选 {BALLOT_SIZE_FE} 鼠 +
          personality, 实时对比谁更懂大众.
        </div>
      </div>
      <BallotPreview title="对方的 ballot" picks={duel.hostBallot} />
      <div className="mt-4 mb-2 text-[11px] font-black text-white/55 tracking-widest">
        你的 BALLOT
      </div>
      <BallotPicker picks={picks} onChange={setPicks} />
      {err && <div className="mt-3 text-rose-300 text-xs text-center">{err}</div>}
      <button
        onClick={submit}
        disabled={!valid || busy}
        className="mt-4 w-full py-3 rounded-xl font-black"
        style={{
          background: valid
            ? 'linear-gradient(135deg, #FF4FA3 0%, #B086FF 100%)'
            : 'rgba(255,255,255,0.08)',
          color: valid ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
          cursor: !valid || busy ? 'not-allowed' : 'pointer',
          fontSize: 14, letterSpacing: '0.05em',
        }}>
        {busy ? '提交中…' : '⚔️ 锁定 ballot → 实时对比'}
      </button>
    </div>
  );
}

function ResultView({ duel, scores, myId }: { duel: DuelData; scores: Scores; myId: string }) {
  // v6.20 P1 — three viewer roles, not just two. Spectators (visitors
  // who weren't host or guest) get a neutral "Host vs Guest" third-
  // person frame instead of being misattributed to one side.
  const role: 'host' | 'guest' | 'spectator' =
    duel.hostUserId === myId ? 'host'
    : duel.guestUserId === myId ? 'guest'
    : 'spectator';

  // Decide column labels + score attribution per role
  const left = role === 'guest'
    ? { label: '你的 ballot', score: scores.guestScore, picks: scores.perPickGuest, accent: '#FFD700' }
    : { label: 'Host ballot', score: scores.hostScore, picks: scores.perPickHost, accent: '#FFD700' };
  const right = role === 'guest'
    ? { label: '对方 ballot', score: scores.hostScore, picks: scores.perPickHost, accent: '#FF4FA3' }
    : role === 'host'
      ? { label: '对方 ballot', score: scores.guestScore, picks: scores.perPickGuest, accent: '#FF4FA3' }
      : { label: 'Guest ballot', score: scores.guestScore, picks: scores.perPickGuest, accent: '#FF4FA3' };

  // Verdict text per role — first-person for host/guest, third-person
  // for spectator.
  const winner: 'left' | 'right' | 'tie' =
    left.score > right.score ? 'left' : left.score < right.score ? 'right' : 'tie';
  const verdictText = role === 'spectator'
    ? winner === 'tie' ? '⚖️ 双方打平'
      : winner === 'left' ? '👑 Host 领先' : '👑 Guest 领先'
    : winner === 'tie' ? '⚖️ 打平'
      : (role === 'host' && winner === 'left') || (role === 'guest' && winner === 'left')
        ? '✓ 你 lead' : '✗ 对方 lead';
  const verdictGradient =
    winner === 'tie' ? 'linear-gradient(135deg, #FFD700, #B086FF)'
    : (role === 'host' && winner === 'left') || (role === 'guest' && winner === 'left')
      ? 'linear-gradient(135deg, #5be24a, #22c55e)'
      : role === 'spectator'
        ? 'linear-gradient(135deg, #FFD700, #FF4FA3)'
        : 'linear-gradient(135deg, #ff4757, #ff6347)';

  return (
    <div className="w-full max-w-2xl">
      <div className="text-center mb-4">
        <div style={{
          fontSize: 11, fontWeight: 900, letterSpacing: '0.18em',
          color: '#FFD700', textTransform: 'uppercase', marginBottom: 6,
        }}>
          🏟️ 斗投实时比分 · {duel.weekKey}
          {role === 'spectator' && (
            <span style={{
              marginLeft: 8, padding: '1px 6px', borderRadius: 4,
              background: 'rgba(176,134,255,0.18)', color: '#B086FF',
              fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
            }}>👁️ 围观</span>
          )}
        </div>
        <div style={{
          fontSize: 28, fontWeight: 900,
          background: verdictGradient,
          WebkitBackgroundClip: 'text', backgroundClip: 'text',
          color: 'transparent', marginBottom: 4,
        }}>{verdictText}</div>
        <div style={{
          fontSize: 16, color: 'rgba(248,244,227,0.75)', fontWeight: 800,
        }}>
          {role === 'spectator' ? (
            <>
              Host <span style={{ color: '#FFD700' }}>{scores.hostScore}</span>
              {' · '}
              Guest <span style={{ color: '#FF4FA3' }}>{scores.guestScore}</span>
            </>
          ) : (
            <>
              你 <span style={{ color: '#FFD700' }}>{left.score}</span>
              {' · '}
              对方 <span style={{ color: '#FF4FA3' }}>{right.score}</span>
            </>
          )}
          <span style={{ marginLeft: 8, fontSize: 10, color: 'rgba(248,244,227,0.4)' }}>
            / 总分 {BALLOT_SIZE_FE}
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(248,244,227,0.4)', marginTop: 8 }}>
          比分实时变化 — 大众继续投票 → leaders 漂移 → 分数刷新
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PicksColumn title={left.label} picks={left.picks} accent={left.accent} />
        <PicksColumn title={right.label} picks={right.picks} accent={right.accent} />
      </div>
    </div>
  );
}

function PicksColumn({ title, picks, accent }: {
  title: string;
  picks: Array<BallotPick & { matched: boolean; currentDominant: string | null }>;
  accent: string;
}) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 14,
      background: 'rgba(20,15,40,0.85)',
      border: `1px solid ${accent}55`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
        color: accent, textTransform: 'uppercase', marginBottom: 8,
      }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {picks.map((p, i) => {
          const char = CHARACTERS[p.rat];
          const myPick = PERSONALITY_LABELS_LITE[p.personality];
          const dom = p.currentDominant ? PERSONALITY_LABELS_LITE[p.currentDominant] : null;
          return (
            <div key={i} style={{
              padding: '8px 10px', borderRadius: 10,
              background: p.matched
                ? 'rgba(91,226,74,0.10)'
                : 'rgba(255,255,255,0.03)',
              border: p.matched
                ? '1px solid rgba(91,226,74,0.55)'
                : '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                color: '#F8F4E3', fontWeight: 800,
              }}>
                <span style={{ fontSize: 16 }}>{char?.emoji}</span>
                <span style={{
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{char?.epithet ?? p.rat}</span>
                {p.matched && (
                  <span style={{
                    fontSize: 11, fontWeight: 900, color: '#5be24a',
                  }}>✓ +1</span>
                )}
              </div>
              <div style={{
                marginTop: 4, fontSize: 10, color: 'rgba(248,244,227,0.6)',
                display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
              }}>
                你押: <span style={{ color: myPick?.color, fontWeight: 700 }}>
                  {myPick?.emoji} {myPick?.label}
                </span>
                {dom && (
                  <>
                    <span style={{ color: 'rgba(248,244,227,0.3)' }}>·</span>
                    当前: <span style={{ color: dom.color, fontWeight: 700 }}>
                      {dom.emoji} {dom.label}
                    </span>
                  </>
                )}
                {!dom && <span style={{ opacity: 0.4 }}>· 当前无人投票</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BallotPreview({ title, picks }: { title: string; picks: BallotPick[] }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 12,
      background: 'rgba(20,15,40,0.6)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
        color: '#FFD700', textTransform: 'uppercase', marginBottom: 6,
      }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {picks.map((p, i) => {
          const c = CHARACTERS[p.rat];
          const pl = PERSONALITY_LABELS_LITE[p.personality];
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
              color: '#F8F4E3', fontWeight: 800,
            }}>
              <span style={{ fontSize: 16 }}>{c?.emoji}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c?.epithet ?? p.rat}
              </span>
              <span style={{ color: pl?.color, fontWeight: 700, fontSize: 11 }}>
                → {pl?.emoji} {pl?.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
