/**
 * BanweiIndexCard — v6.32 P5 周报 班味指数 0-100.
 *
 * Posts current client-side counters (gamesSeen / talkshowPlayed /
 * anniversaryVisited) to /api/banwei. Server merges with its own
 * per-user leak tallies, computes score + WoW delta + persists.
 *
 * UI: big score badge (gradient color tier), 5-axis breakdown bar,
 * week-over-week chevron (↗ / ↘ / =). Sits in Profile.
 */
import { useEffect, useState } from 'react';
import { findArchetype } from '@furball/shared';
import { getUserId } from '../../utils/userId';
import { getProgress } from '../../utils/achievements';
import { getLeakStats } from '../../utils/leakStats';
import { downloadBanweiShareCard } from '../../utils/banweiShareCard';
import type { UserProfile } from '../../utils/profileTypes';

interface Snapshot {
  weekKey: string;
  leaks: number;
  leakQuotes: number;
  gamesSeen: number;
  talkshowPlayed: number;
  anniversaryVisited: number;
  score: number;
}

interface Response {
  thisWeek: Snapshot;
  prior: Snapshot | null;
  delta: number | null;
}

export default function BanweiIndexCard() {
  const [data, setData] = useState<Response | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    // v6.37 P1 — derive region/industry tribe from the winning archetype
    // so the leaderboard can group by tribe. Best-effort: missing profile
    // (anonymous quizless user) just omits the tags. We fetch the profile
    // once on mount; if it returns before the banwei POST we attach the
    // tribe info, otherwise the POST goes through tribe-less (the server
    // will adopt the tribe on next week's POST).
    void (async () => {
      let region: string | undefined;
      let industry: string | undefined;
      try {
        const r = await fetch('/api/quiz/me', { headers: { 'X-User-Id': userId } });
        if (r.ok) {
          const j = await r.json() as { profile?: UserProfile | null };
          const a = j.profile ? findArchetype(j.profile.topArchetypes[0]) : null;
          region = a?.region && a.region !== 'generic' ? a.region : undefined;
          industry = a?.industry && a.industry !== 'generic' ? a.industry : undefined;
        }
      } catch { /* tribe-less POST is fine */ }

      // v6.38 P4 — last 公司主题包 the user started a game with, so the
      // leaderboard can group "你公司内部 Top". Written by Landing on
      // pack-game start; absent for users who never used a pack.
      const lastPackId = (() => {
        try { return localStorage.getItem('office-arena.lastPackId') || undefined; }
        catch { return undefined; }
      })();
      const body = {
        gamesSeen: getProgress('classic_finished'),
        talkshowPlayed: getProgress('talkshow_played'),
        anniversaryVisited: getProgress('anniversary_finished'),
        ...(region ? { region } : {}),
        ...(industry ? { industry } : {}),
        ...(lastPackId ? { lastPackId } : {}),
      };
      // Also surface client-only leak stats so server has a fallback if
      // its in-memory tally got reset on restart. (Server reads its own
      // tally as authoritative; this is just informative.)
      void getLeakStats();
      try {
        const r = await fetch('/api/banwei', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw r.status;
        const d = await r.json();
        setData(d as Response);
        setErr(null);
      } catch (e) {
        setErr(String(e));
      }
    })();
  }, []);

  if (err) {
    return (
      <div style={{
        marginTop: 16, padding: 14, borderRadius: 14,
        background: 'rgba(15,14,46,0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center',
      }}>📈 班味指数暂不可用 ({err})</div>
    );
  }
  if (!data) return null;

  const { thisWeek, prior, delta } = data;
  const tier = scoreTier(thisWeek.score);
  const arrow = delta === null ? '·' : delta > 0 ? '↗' : delta < 0 ? '↘' : '=';
  const arrowColor = delta === null ? 'rgba(255,255,255,0.4)' : delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : 'rgba(255,255,255,0.6)';

  return (
    <div style={{
      marginTop: 16, padding: 14, borderRadius: 14,
      background: 'rgba(15,14,46,0.6)',
      border: `1px solid ${tier.accent}55`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
            color: tier.accent, textTransform: 'uppercase', marginBottom: 4,
          }}>📈 BANWEI INDEX · 班味指数</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            本周 {thisWeek.weekKey} · 你的"班味"得分综合: PSYWAR + 经典局 + 段子 + 周年
          </div>
        </div>
      </div>

      {/* Score + WoW */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
        <div style={{
          width: 84, height: 84, borderRadius: 16,
          background: `linear-gradient(135deg, ${tier.accent} 0%, ${tier.accent2} 100%)`,
          display: 'grid', placeItems: 'center',
          boxShadow: `0 0 20px ${tier.accent}55`,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 30, fontWeight: 900, color: '#0a0a1e',
              fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            }}>{thisWeek.score}</div>
            <div style={{
              fontSize: 8, fontWeight: 900, color: 'rgba(10,10,30,0.7)',
              letterSpacing: '0.15em', marginTop: 2,
            }}>SCORE</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 14, fontWeight: 900, color: tier.accent, marginBottom: 4,
          }}>{tier.label}</div>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 6,
            fontSize: 11, color: 'rgba(255,255,255,0.55)',
          }}>
            {prior ? (
              <>
                <span>上周 {prior.score}</span>
                <span style={{ color: arrowColor, fontWeight: 900, fontSize: 16 }}>{arrow}</span>
                <span style={{ color: arrowColor }}>
                  {delta === 0 ? '持平' : `${delta! > 0 ? '+' : ''}${delta}`}
                </span>
              </>
            ) : (
              <span>第一次班味打卡, 下周回来看变化 →</span>
            )}
          </div>
        </div>
      </div>

      {/* Breakdown bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <BreakRow label="爆料投递" count={thisWeek.leaks}      cap={10} weight={3} />
        <BreakRow label="AI 引用" count={thisWeek.leakQuotes} cap={5}  weight={6} />
        <BreakRow label="经典局"  count={thisWeek.gamesSeen}   cap={5}  weight={4} />
        <BreakRow label="段子听" count={thisWeek.talkshowPlayed} cap={5} weight={2} />
        <BreakRow label="周年回顾" count={thisWeek.anniversaryVisited} cap={1} weight={10} />
      </div>

      {/* v6.33 P4 — spectator-curated 班味金句池 submit. Quotes go
          into shared server pool, seeded into next game's leakedHints
          so AI rats may quote them in discussion. Per-user weekly cap
          enforced server-side; UI silently grays on 429. */}
      <HotQuoteSubmit />

      {/* v6.33 P3 — 1-click PNG share card (1080×1350 IG-portrait) */}
      <button
        type="button"
        onClick={() => downloadBanweiShareCard({
          weekKey: thisWeek.weekKey,
          score: thisWeek.score,
          tierLabel: tier.label.replace(/[🔥💼⚙️👀🌱]/g, '').trim(),
          tierEmoji: tier.label.match(/[🔥💼⚙️👀🌱]/)?.[0] ?? '🐀',
          breakdown: {
            leaks: { count: thisWeek.leaks, cap: 10 },
            leakQuotes: { count: thisWeek.leakQuotes, cap: 5 },
            gamesSeen: { count: thisWeek.gamesSeen, cap: 5 },
            talkshowPlayed: { count: thisWeek.talkshowPlayed, cap: 5 },
            anniversaryVisited: { count: thisWeek.anniversaryVisited, cap: 1 },
          },
          priorScore: prior?.score ?? null,
        })}
        style={{
          marginTop: 12, width: '100%', padding: '10px 16px',
          borderRadius: 10,
          background: `linear-gradient(135deg, ${tier.accent} 0%, ${tier.accent2} 100%)`,
          color: '#0a0a1e',
          fontWeight: 900, fontSize: 13, letterSpacing: '0.04em',
          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: `0 4px 16px ${tier.accent}40`,
        }}
      >📤 下载班味海报 1080×1350</button>
    </div>
  );
}

function BreakRow({ label, count, cap, weight }: { label: string; count: number; cap: number; weight: number }) {
  const pct = cap > 0 ? Math.min(100, (count / cap) * 100) : 0;
  const contrib = Math.min(count, cap) * weight;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
      <span style={{ width: 64, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
      <div style={{
        flex: 1, height: 6, borderRadius: 4,
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: pct >= 100 ? 'linear-gradient(90deg, #FFD700, #FFA947)' : 'linear-gradient(90deg, #4ECDC4, #B086FF)',
          transition: 'width 0.32s ease-out',
        }} />
      </div>
      <span style={{
        fontSize: 10, color: 'rgba(255,255,255,0.55)',
        fontVariantNumeric: 'tabular-nums', width: 50, textAlign: 'right',
      }}>{count}/{cap} +{contrib}</span>
    </div>
  );
}

/* ── v6.33 P4 — 班味金句池 submit ─────────────────────────────── */
function HotQuoteSubmit() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'cap' | 'err'>('idle');
  const [thisWeek, setThisWeek] = useState<number | null>(null);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/hot-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
        body: JSON.stringify({ text }),
      });
      if (r.status === 429) {
        setStatus('cap');
        const j = await r.json().catch(() => ({}));
        setThisWeek(j.thisWeek ?? 5);
      } else if (r.ok) {
        const j = await r.json();
        setStatus('ok');
        setThisWeek(j.userThisWeek ?? null);
        setText('');
        setTimeout(() => setStatus('idle'), 2500);
      } else {
        setStatus('err');
        setTimeout(() => setStatus('idle'), 2500);
      }
    } catch {
      setStatus('err');
    } finally { setBusy(false); }
  }

  const disabled = busy || !text.trim() || text.length > 80 || status === 'cap';

  return (
    <div style={{
      marginTop: 12, padding: 10, borderRadius: 10,
      background: 'rgba(255,79,163,0.06)',
      border: '1px solid rgba(255,79,163,0.35)',
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em',
        color: '#FF4FA3', textTransform: 'uppercase', marginBottom: 6,
      }}>🔥 投本周班味金句 (≤80 字)</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 80))}
        rows={2}
        placeholder='例: "拥抱变化" 拥抱了不到 40 分钟, 我先撤了'
        style={{
          width: '100%', boxSizing: 'border-box', padding: 6,
          fontSize: 11.5, fontFamily: 'inherit',
          background: 'rgba(15,14,46,0.6)',
          color: '#f4f4ff',
          border: '1px solid rgba(255,79,163,0.3)', borderRadius: 6,
          resize: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
          {text.length}/80 · 入池后下一局 AI 鼠人可能引用
          {thisWeek !== null && <span> · 本周已投 {thisWeek}/5</span>}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          style={{
            padding: '4px 12px', borderRadius: 6,
            background: status === 'ok' ? 'rgba(34,197,94,0.85)' :
              status === 'cap' ? 'rgba(239,68,68,0.6)' :
              disabled ? 'rgba(255,79,163,0.2)' : 'linear-gradient(135deg, #FF4FA3 0%, #7c3aed 100%)',
            color: status === 'ok' || (!disabled) ? '#fff' : 'rgba(255,255,255,0.45)',
            border: 'none', fontWeight: 800, fontSize: 11,
            cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {status === 'ok' ? '✓ 已投' :
           status === 'cap' ? '本周已满' :
           status === 'err' ? '失败 重试' :
           busy ? '投递中...' : '投递 →'}
        </button>
      </div>
    </div>
  );
}

function scoreTier(score: number): { label: string; accent: string; accent2: string } {
  if (score >= 80) return { label: '班味永动机 🔥', accent: '#FFD700', accent2: '#FFA947' };
  if (score >= 60) return { label: '资深打工人 💼', accent: '#FF4FA3', accent2: '#7c3aed' };
  if (score >= 40) return { label: '稳定输出中 ⚙️', accent: '#4ECDC4', accent2: '#2fb8ff' };
  if (score >= 20) return { label: '边缘观察员 👀', accent: '#B086FF', accent2: '#7c3aed' };
  return { label: '试用期 🌱', accent: 'rgba(255,255,255,0.55)', accent2: 'rgba(255,255,255,0.3)' };
}
