/**
 * FiredDailyChallenge — v5.0.0 "全网今日挑战" page.
 *
 * Sibling of v4.3.0's FiredLeaderboard but different in two key ways:
 *  - SAME scenario for everyone (server picks one per UTC date via
 *    deterministic hash of the date string).
 *  - Many-to-many leaderboard (top-20 by compensation ratio), not
 *    pairwise 2-side challenges.
 *
 * Read-only. Tap "🎯 接受今日挑战" to deeplink into /fired with
 * the daily challenge scenario pre-focused.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getUserId } from '../utils/userId';
import type { CharacterCard } from '@furball/shared';

type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

interface Participant {
  userId: string;
  displayName: string;
  archetypeId?: string;
  archetypeName?: string;
  archetypeEmoji?: string;
  compensationMonths: number;
  maxPossible: number;
  grade: Grade;
  tactic?: string;
  ts: number;
}

interface Summary {
  date: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioEmoji: string;
  participantCount: number;
  topResults: Participant[];
  myResult?: Participant;
}

const GRADE_COLOR: Record<Grade, string> = {
  S: '#ffb84c', A: '#4c9eff', B: '#9cff57', C: '#ffd166', D: '#ff3355',
};

export default function FiredDailyChallenge() {
  const navigate = useNavigate();
  const myId = getUserId();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** v6.15 P4 — today's featured rat, joined with the daily challenge.
   *  Same character that the Landing DailyRatSpotlight shows. Gives
   *  the daily challenge a guest "narrator" identity. */
  const [dailyRat, setDailyRat] = useState<{ date: string; character: CharacterCard } | null>(null);

  useEffect(() => {
    fetch('/api/daily-challenge/today', { headers: { 'X-User-Id': myId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { summary: Summary }) => setSummary(d.summary))
      .catch(() => setErr('加载失败 — 待会再来'));
    // v6.15 P4 — same deterministic-by-date pick that drives the
    // Landing DailyRatSpotlight. Silent fail (badge just hides).
    fetch('/api/characters/daily')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { date: string; character: CharacterCard }) => setDailyRat(d))
      .catch(() => { /* hide badge */ });
  }, [myId]);

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
          🌐 全网今日挑战
        </span>
        <button onClick={() => navigate('/fired/challenge/leaderboard')}
          className="text-xs px-3 py-1.5 rounded-full font-bold tracking-wide text-white"
          style={{ background: 'linear-gradient(135deg,#ff5588,#7c3aed)' }}>
          🥊 1v1 榜
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 pb-16">
        {err && <div className="text-center py-16 text-rose-300/85">⚠️ {err}</div>}
        {!summary && !err && <div className="text-center py-16 text-white/55 text-sm">⏳ 加载中…</div>}
        {summary && (
          <>
            {/* Hero — today's scenario + accept CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-3xl p-5 md:p-6 mb-6 text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(0,221,255,0.18), rgba(124,58,237,0.10))',
                border: '1px solid rgba(0,221,255,0.45)',
                boxShadow: '0 10px 28px rgba(0,221,255,0.18)',
              }}>
              {/* v6.15 P4 — 今日鼠人主角联动 badge. Click 跳 Landing
                   ?character=Name 让 CharacterFocusModal 接管弹 PersonaCard. */}
              {dailyRat && (
                <button
                  type="button"
                  onClick={() => navigate(`/?character=${encodeURIComponent(dailyRat.character.name)}`)}
                  className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full transition hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,215,0,0.18) 0%, rgba(255,79,163,0.14) 100%)',
                    border: '1px solid rgba(255,215,0,0.55)',
                    color: '#FFD700',
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.05em',
                    cursor: 'pointer',
                  }}
                  title="今日主角 — 跟 Landing DailyRatSpotlight 同步"
                >
                  <span style={{ fontSize: 16 }}>{dailyRat.character.emoji}</span>
                  <span>🌟 今日主角:{dailyRat.character.epithet}</span>
                  <span style={{ fontSize: 9, color: 'rgba(248,244,227,0.5)' }}>→ 档案</span>
                </button>
              )}
              <div className="text-[10px] tracking-[0.22em] uppercase mb-2"
                style={{ color: '#9be6ff' }}>
                ✦ 今日剧本 · {summary.date}
              </div>
              <div className="text-5xl mb-2">{summary.scenarioEmoji}</div>
              <div className="text-lg font-black text-white/95 mb-3">
                {summary.scenarioTitle}
              </div>
              <div className="text-[12px] text-white/65 mb-4">
                今天有 <span className="font-bold text-white tabular-nums">{summary.participantCount}</span> 人接了这局
                {summary.myResult && (
                  <>
                    {' · '}你拿了 <span className="font-bold" style={{ color: GRADE_COLOR[summary.myResult.grade] }}>
                      {summary.myResult.grade}
                    </span> 级
                  </>
                )}
              </div>
              <motion.button
                onClick={() => navigate(`/fired?focus=${summary.scenarioId}`)}
                whileHover={{ y: -1, scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
                className="px-6 py-3 rounded-full text-sm font-black text-white"
                style={{
                  background: 'linear-gradient(135deg, #ff3355, #ff8a4c)',
                  boxShadow: '0 8px 24px rgba(255,51,85,0.40)',
                  textShadow: '1px 1px 0 rgba(0,0,0,0.35)',
                }}>
                {summary.myResult ? '🔄 再玩一次,冲榜!' : '🎯 接受今日挑战 →'}
              </motion.button>
            </motion.div>

            {/* Leaderboard */}
            <section>
              <div className="flex items-baseline justify-between mb-3 px-1">
                <h2 className="text-[11px] tracking-[0.22em] uppercase text-white/45">
                  ✦ 今日排行榜
                </h2>
                <span className="text-[10px] text-white/35 tabular-nums">
                  Top {Math.min(20, summary.topResults.length)} / {summary.participantCount}
                </span>
              </div>
              {summary.topResults.length === 0 ? (
                <div className="text-center py-12 text-white/45 text-sm">
                  📭 还没人接今天的挑战 — 你就是开榜第一人。
                </div>
              ) : (
                <div className="space-y-2">
                  {summary.topResults.map((p, i) => (
                    <LeaderboardRow key={p.userId} p={p} rank={i + 1} isMe={p.userId === myId} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function LeaderboardRow({ p, rank, isMe }: {
  p: Participant; rank: number; isMe: boolean;
}) {
  const ratio = p.maxPossible > 0 ? p.compensationMonths / p.maxPossible : 0;
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  return (
    <div className="rounded-xl p-3 flex items-center gap-3"
      style={{
        background: isMe
          ? 'linear-gradient(135deg, rgba(255,184,76,0.15), rgba(255,85,136,0.06))'
          : 'rgba(255,255,255,0.04)',
        border: isMe
          ? '1px solid rgba(255,184,76,0.45)'
          : '1px solid rgba(255,255,255,0.06)',
      }}>
      <div className="text-center flex-shrink-0 w-10">
        {medal ? (
          <div className="text-2xl">{medal}</div>
        ) : (
          <div className="text-[11px] text-white/55 tabular-nums">#{rank}</div>
        )}
      </div>
      <div className="text-2xl flex-shrink-0">{p.archetypeEmoji ?? '🐀'}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white/95 truncate">
          {p.displayName}{isMe && ' · 你'}
        </div>
        <div className="text-[10px] text-white/55 truncate">
          {p.archetypeName ?? '—'}
          {p.tactic && ` · "${p.tactic.slice(0, 32)}${p.tactic.length > 32 ? '…' : ''}"`}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-xl font-black tabular-nums"
          style={{ color: GRADE_COLOR[p.grade] }}>
          {p.grade}
        </div>
        <div className="text-[10px] text-white/55 tabular-nums">
          {p.compensationMonths}/{p.maxPossible}月 · {Math.round(ratio * 100)}%
        </div>
      </div>
    </div>
  );
}
