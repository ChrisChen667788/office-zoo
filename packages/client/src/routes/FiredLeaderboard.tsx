/**
 * FiredLeaderboard — v4.3.0 "最近的对决" + "最大悬殊" challenge leaderboard.
 *
 * Read-only surface, anonymous-friendly. Lists completed v4.0.0
 * challenges (both sides finished) so users can:
 *  - See what scenarios are hot right now (people-played count)
 *  - Compare their own grade against the leaderboard
 *  - Tap any entry → opens the challenge's permalink so they can
 *    accept their own re-run of the same scenario
 *
 * Two tabs (driven by ?sort=latest|spread query param so URLs are
 * deep-linkable + screenshot-friendly):
 *   📜 最近的对决    — newest 20 completions
 *   ⚡ 最大悬殊      — top 10 score-gap upsets
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';

type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

interface ParticipantInfo {
  userId: string;
  displayName: string;
  archetypeId?: string;
  archetypeName?: string;
  archetypeEmoji?: string;
}
interface Result {
  compensationMonths: number;
  maxPossible: number;
  grade: Grade;
  tactic?: string;
  ts: number;
}
interface Challenge {
  code: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioEmoji: string;
  createdAt: number;
  challenger: ParticipantInfo;
  challengerResult: Result;
  challengee?: ParticipantInfo;
  challengeeResult?: Result;
}

const GRADE_COLOR: Record<Grade, string> = {
  S: '#ffb84c', A: '#4c9eff', B: '#9cff57', C: '#ffd166', D: '#ff3355',
};

type Sort = 'latest' | 'spread';

export default function FiredLeaderboard() {
  const [params, setParams] = useSearchParams();
  const sort: Sort = (params.get('sort') as Sort) === 'spread' ? 'spread' : 'latest';
  const navigate = useNavigate();
  const [data, setData] = useState<Challenge[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    fetch(`/api/fired/challenge/leaderboard?sort=${sort}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { challenges: Challenge[] }) => setData(d.challenges))
      .catch(() => setErr('加载失败 — 待会再来'));
  }, [sort]);

  const setSort = (s: Sort) => {
    const next = new URLSearchParams(params);
    next.set('sort', s);
    setParams(next, { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0a0a1e 0%, #1a0d35 50%, #0a0a1e 100%)' }}>
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <button onClick={() => navigate('/')}
          className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 首页
        </button>
        <span className="text-[11px] uppercase tracking-[0.28em] text-white/55">
          🥊 挑战榜
        </span>
        <button onClick={() => navigate('/fired')}
          className="text-xs px-3 py-1.5 rounded-full font-bold tracking-wide text-white"
          style={{ background: 'linear-gradient(135deg,#ff3355,#ff8a4c)' }}>
          ⚖️ 去裁了么 →
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 pb-16">
        {/* Tab switcher */}
        <div className="flex gap-2 mb-5 flex-wrap">
          <TabChip active={sort === 'latest'} onClick={() => setSort('latest')}
            label="📜 最近的对决" color="#ff5588" />
          <TabChip active={sort === 'spread'} onClick={() => setSort('spread')}
            label="⚡ 最大悬殊" color="#ffb84c" />
        </div>

        {err && <div className="text-center py-16 text-rose-300/85">⚠️ {err}</div>}
        {!data && !err && <div className="text-center py-16 text-white/55 text-sm">⏳ 加载中…</div>}
        {data && data.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="text-center py-16">
            <div className="text-5xl mb-3">📭</div>
            <h2 className="text-lg font-bold text-white mb-2">还没人发起挑战</h2>
            <p className="text-[13px] text-white/60 mb-5 max-w-md mx-auto">
              玩一关裁员谈判, 拿到 result 之后会有"🥊 挑战朋友"按钮 —
              发链接给朋友, 你们俩就是这个榜的第一对儿。
            </p>
            <button onClick={() => navigate('/fired')} className="y2k-cta"
              style={{ fontSize: 14 }}>
              ⚖️ 去发起挑战 →
            </button>
          </motion.div>
        )}

        {data && data.length > 0 && (
          <div className="space-y-2">
            {data.map((ch, i) => (
              <ChallengeRow key={ch.code} ch={ch} rank={i + 1} sort={sort}
                onJump={() => navigate(`/fired/challenge/${ch.code}`)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ===========================================================================

function TabChip({ active, onClick, label, color }: {
  active: boolean; onClick: () => void; label: string; color: string;
}) {
  return (
    <button onClick={onClick}
      className="px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide transition"
      style={{
        background: active ? `${color}24` : 'rgba(255,255,255,0.05)',
        color: active ? color : 'rgba(255,255,255,0.55)',
        border: active ? `1px solid ${color}66` : '1px solid rgba(255,255,255,0.08)',
      }}>
      {label}
    </button>
  );
}

function ChallengeRow({ ch, rank, sort, onJump }: {
  ch: Challenge; rank: number; sort: Sort; onJump: () => void;
}) {
  const c = ch.challenger;
  const cR = ch.challengerResult;
  const e = ch.challengee!;
  const eR = ch.challengeeResult!;
  const winnerSide: 'c' | 'e' | 'tie' =
    cR.compensationMonths === eR.compensationMonths ? 'tie'
  : cR.compensationMonths > eR.compensationMonths   ? 'c'
  :                                                   'e';

  // Spread display for the "spread" tab — surfaces the ratio gap
  // so it's obvious why this row ranked.
  const cRatio = cR.maxPossible > 0 ? cR.compensationMonths / cR.maxPossible : 0;
  const eRatio = eR.maxPossible > 0 ? eR.compensationMonths / eR.maxPossible : 0;
  const spreadPct = Math.round(Math.abs(cRatio - eRatio) * 100);

  return (
    <motion.button
      onClick={onJump}
      whileHover={{ y: -2 }}
      className="frost-card hover-sheen w-full text-left rounded-2xl p-4 flex items-center gap-3 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(255,85,136,0.06), rgba(124,58,237,0.04))',
        border: '1px solid rgba(255,85,136,0.20)',
      }}>
      {/* Rank + scenario emoji */}
      <div className="flex flex-col items-center justify-center flex-shrink-0 w-12">
        <div className="text-[10px] text-white/45 tabular-nums">#{rank}</div>
        <div className="text-2xl mt-0.5">{ch.scenarioEmoji}</div>
      </div>

      {/* Two-side mini compare */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-white/55 truncate mb-1.5">{ch.scenarioTitle}</div>
        <div className="grid grid-cols-2 gap-2 items-center text-[11px]">
          <Side info={c} result={cR} highlight={winnerSide === 'c'} align="left" />
          <Side info={e} result={eR} highlight={winnerSide === 'e'} align="right" />
        </div>
      </div>

      {/* Right rail — winner-or-spread badge */}
      <div className="text-right flex-shrink-0">
        {sort === 'spread' ? (
          <div className="flex flex-col items-end">
            <span className="text-[9px] tracking-wider uppercase text-white/45">悬殊</span>
            <span className="text-base font-black tabular-nums" style={{ color: '#ffb84c' }}>
              {spreadPct}%
            </span>
          </div>
        ) : winnerSide === 'tie' ? (
          <div className="text-[10px] text-white/60">🤝 平手</div>
        ) : (
          <div className="flex flex-col items-end">
            <span className="text-[9px] tracking-wider uppercase text-white/45">👑 胜</span>
            <span className="text-[10px] text-white/85 truncate max-w-[6rem]">
              {(winnerSide === 'c' ? c : e).displayName}
            </span>
          </div>
        )}
      </div>
    </motion.button>
  );
}

function Side({ info, result, highlight, align }: {
  info: ParticipantInfo; result: Result; highlight: boolean; align: 'left' | 'right';
}) {
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <div className="flex items-center gap-1.5"
        style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
        <span className="text-base">{info.archetypeEmoji ?? '🐀'}</span>
        <span className={`text-[11px] truncate ${highlight ? 'text-white font-bold' : 'text-white/65'}`}>
          {info.displayName}
        </span>
      </div>
      <div className="flex items-center gap-1 mt-0.5"
        style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
        <span className="text-base font-black tabular-nums"
          style={{ color: GRADE_COLOR[result.grade] }}>
          {result.grade}
        </span>
        <span className="text-[10px] text-white/55 tabular-nums">
          {result.compensationMonths}/{result.maxPossible}月
        </span>
      </div>
    </div>
  );
}
