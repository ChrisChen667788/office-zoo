/**
 * FortuneHistory — v5.6.0 "我的占卜历史" — last 7 days.
 *
 * Why a separate page (vs surfacing inline on /fortune):
 *  - /fortune is a focused one-card surface (today's draw). Adding a
 *    horizontal scroll of past days would dilute the "tap → reveal →
 *    share" intent.
 *  - History is a return hook: "what did the deck give me this week?"
 *    is a stronger reason to reopen the app than seeing the same daily
 *    card twice in one day.
 *  - Server-side history is keyed by userId only (no auth) so the page
 *    is anonymous-friendly — it just shows whatever the browser's
 *    localStorage id has accumulated since 5.6.0 went live.
 *
 * Layout:
 *  - Summary strip at top: avg vibeScore + dominant tier label + day count
 *  - Compact horizontal-scrollable timeline of recent draws (chrono,
 *    newest first) where each entry is a thumbnail with the card emoji,
 *    title, date, and vibe-tier color border
 *  - Empty state for first-time users (no history yet)
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserId } from '../utils/userId';
import EventPill from '../components/EventPill';

interface HistoryEntry {
  date: string;
  cardId: string;
  emoji: string;
  title: string;
  vibeScore: number;
  tag: string;
}

function vibeColor(score: number): string {
  return score >= 80 ? '#22c55e'
       : score >= 60 ? '#a3e635'
       : score >= 40 ? '#fbbf24'
       : score >= 20 ? '#fb923c'
       : '#ef4444';
}
function vibeLabel(score: number): string {
  return score >= 80 ? '大吉'
       : score >= 60 ? '小吉'
       : score >= 40 ? '中平'
       : score >= 20 ? '小凶'
       : '大凶';
}

/** Two-letter weekday tag for the timeline ribbon. UTC date so it
 *  matches the server's deterministic per-date pick — using local time
 *  would risk showing "yesterday" labels on entries the server still
 *  considers today. */
function utcWeekdayShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return ['周日','周一','周二','周三','周四','周五','周六'][d.getUTCDay()];
}

/** Chinese display label for affinity tags. Server returns the raw enum
 *  ('grind' | 'slack' | …); displaying English in a Chinese summary
 *  reads awkward. Kept local since this is the only consumer surface
 *  that humanises the tag — other code paths use the enum directly. */
const TAG_LABEL: Record<string, string> = {
  grind:   '加班赶工',
  slack:   '摸鱼存活',
  snark:   '阴阳话术',
  social:  '社交内卷',
  survive: '苟住为先',
  escape:  '撤退避险',
};

export default function FortuneHistory() {
  const navigate = useNavigate();
  const myId = useMemo(() => getUserId(), []);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/fortune/history?limit=7', { headers: { 'X-User-Id': myId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { history: HistoryEntry[] }) => setHistory(d.history ?? []))
      .catch(() => setErr('加载历史失败 — 神明今天 maintenance'));
  }, [myId]);

  /** Aggregate stats for the summary strip. Computed once history
   *  resolves, memoised so re-renders don't recompute on every paint. */
  const summary = useMemo(() => {
    if (!history || history.length === 0) return null;
    const avg = Math.round(history.reduce((s, e) => s + e.vibeScore, 0) / history.length);
    const tierCounts = history.reduce<Record<string, number>>((acc, e) => {
      const t = vibeLabel(e.vibeScore);
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
    const dominantTier = Object.entries(tierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '中平';
    const tagCounts = history.reduce<Record<string, number>>((acc, e) => {
      acc[e.tag] = (acc[e.tag] ?? 0) + 1;
      return acc;
    }, {});
    const dominantTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'survive';
    return { avg, dominantTier, dominantTag, days: history.length };
  }, [history]);

  return (
    <div className="relative min-h-screen overflow-x-hidden"
      style={{ background: 'radial-gradient(circle at 30% 20%, #1a0d35 0%, #050510 70%)' }}>
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <button onClick={() => navigate('/fortune')}
          className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 今日的牌
        </button>
        <EventPill stars={4} subtle>📜 占卜历史</EventPill>
        <button onClick={() => navigate('/fortune/gallery')}
          className="text-[11px] text-white/55 hover:text-white/95 transition px-2 py-1 rounded"
          style={{ background: 'rgba(176,134,255,0.10)', border: '1px solid rgba(176,134,255,0.25)' }}>
          牌库 →
        </button>
      </header>

      <main className="max-w-md mx-auto px-4 md:px-6 pb-16">
        {err && (
          <div className="text-center py-16 text-rose-300/85">⚠️ {err}</div>
        )}
        {!history && !err && (
          <div className="text-center py-16 text-white/55 text-sm">⏳ 翻阅卷轴中…</div>
        )}

        {history && history.length === 0 && (
          /* First-time user — no recorded draws yet. Encourage them
             to come back tomorrow rather than feeling stranded. */
          <div className="text-center py-20">
            <div className="text-6xl mb-4 opacity-60">📜</div>
            <h2 className="text-base font-black text-white/90 mb-2">还没翻过牌呢</h2>
            <p className="text-xs text-white/55 leading-relaxed max-w-xs mx-auto">
              每天来一张, 7 天后这里会有一段属于你的<br/>
              "本周班味曲线". 现在先去抽今天的吧 →
            </p>
            <button onClick={() => navigate('/fortune')}
              className="mt-6 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide text-white"
              style={{
                background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
                boxShadow: '0 6px 18px rgba(124,58,237,0.32)',
              }}>
              🔮 抽今天的牌
            </button>
          </div>
        )}

        {history && history.length > 0 && summary && (
          <>
            {/* Weekly summary strip — avg vibe + dominant tier + count.
                Sits at the top so it's the first thing the user reads:
                a TL;DR of their week. */}
            <div className="rounded-2xl p-4 mb-5 mt-3"
              style={{
                background: `linear-gradient(135deg, ${vibeColor(summary.avg)}22, rgba(255,255,255,0.04))`,
                border: `1px solid ${vibeColor(summary.avg)}55`,
              }}>
              <div className="text-[10px] tracking-[0.22em] uppercase mb-2"
                style={{ color: vibeColor(summary.avg) }}>
                ✦ 本周班味
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-3xl font-black text-white tabular-nums"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                  {summary.avg}
                </div>
                <div className="text-xs text-white/60">
                  平均运势 · 最常 <span className="font-bold text-white/90">{summary.dominantTier}</span>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-white/45 leading-relaxed">
                你这 {summary.days} 天里, 主旋律是 <span className="font-bold" style={{ color: '#ffd58a' }}>{TAG_LABEL[summary.dominantTag] ?? summary.dominantTag}</span>
              </div>
            </div>

            {/* Timeline — vertical list, newest first. Each row is a
                small clickable card. Click navigates to /fortune/gallery
                so the user can browse the deck around their pick. */}
            <div className="space-y-2.5">
              {history.map((e) => (
                <button
                  key={e.date}
                  onClick={() => navigate('/fortune/gallery')}
                  className="w-full flex items-center gap-3 rounded-xl p-3 transition active:scale-[0.98] text-left"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${vibeColor(e.vibeScore)}55`,
                  }}>
                  <div className="text-3xl w-12 text-center"
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>
                    {e.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-white truncate">{e.title}</div>
                    <div className="text-[10px] text-white/45 mt-0.5 tabular-nums">
                      {e.date} · {utcWeekdayShort(e.date)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-[10px] tracking-[0.2em] uppercase font-bold"
                      style={{ color: vibeColor(e.vibeScore) }}>
                      {vibeLabel(e.vibeScore)}
                    </div>
                    <div className="text-xs text-white/75 tabular-nums font-bold">
                      {e.vibeScore}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="text-center text-[10px] text-white/35 mt-6 leading-relaxed">
              {history.length < 7
                ? `还差 ${7 - history.length} 天补满一周 · 子时(UTC 00:00)自动追加`
                : '满满一周 · 想要月度?再坚持 3 周'}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
