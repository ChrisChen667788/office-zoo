/**
 * SquadHistory — v1.4.3 "我的攒局" page + same-group leaderboard.
 *
 * Lists every squad the user has been in (newest first), plus a
 * derived "this same group has played N times" stat by hashing
 * sorted member-id sets across the history. Cards link back to the
 * live room while it's in the 30-min post-ended TTL window.
 *
 * No new server endpoints needed beyond /api/squad/history/me — group
 * stats are derived client-side because the leaderboard is the same
 * shape no matter how you slice it.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getUserId } from '../utils/userId';
import type { SquadMember, SquadRecap } from '@furball/shared';
import EventPill from '../components/EventPill';
import SquadMemberCard from '../components/character/SquadMemberCard';

interface HistoryEntry {
  roomId: string;
  endedAt: number;
  members: Array<Pick<SquadMember, 'userId' | 'displayName' | 'archetypeId' | 'archetypeName' | 'archetypeEmoji'>>;
  recap?: SquadRecap;
  actCount: number;
  scenarioBrief?: string;
}

export default function SquadHistory() {
  const navigate = useNavigate();
  const myId = useMemo(() => getUserId(), []);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/squad/history/me', { headers: { 'X-User-Id': myId } })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: { history: HistoryEntry[] }) => setHistory(d.history))
      .catch(() => setErr('加载失败'));
  }, [myId]);

  /** Derived: group-stats keyed by a hash of sorted-member-ids.
   *  Same friend group across multiple sessions = same hash =
   *  aggregated stats. */
  const groups = useMemo(() => {
    if (!history) return [];
    const acc = new Map<string, {
      key: string;
      members: HistoryEntry['members'];
      plays: number;
      lastEndedAt: number;
      archetypeCount: Record<string, number>;
    }>();
    for (const e of history) {
      const memberIds = e.members.map((m) => m.userId).sort();
      const key = memberIds.join('|');
      const existing = acc.get(key);
      if (existing) {
        existing.plays += 1;
        existing.lastEndedAt = Math.max(existing.lastEndedAt, e.endedAt);
        for (const m of e.members) {
          const k = m.archetypeId ?? 'anon';
          existing.archetypeCount[k] = (existing.archetypeCount[k] ?? 0) + 1;
        }
      } else {
        const archetypeCount: Record<string, number> = {};
        for (const m of e.members) {
          const k = m.archetypeId ?? 'anon';
          archetypeCount[k] = (archetypeCount[k] ?? 0) + 1;
        }
        acc.set(key, {
          key,
          members: e.members,
          plays: 1,
          lastEndedAt: e.endedAt,
          archetypeCount,
        });
      }
    }
    return [...acc.values()].sort((a, b) => b.lastEndedAt - a.lastEndedAt);
  }, [history]);

  return (
    <div className="relative min-h-screen overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0a0a1e 0%, #1a0d35 50%, #0a0a1e 100%)' }}>
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <button onClick={() => navigate('/')}
          className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 首页
        </button>
        <EventPill stars={4} subtle>🎭 我的攒局</EventPill>
        <button onClick={() => navigate('/squad/new')}
          className="text-xs px-3 py-1.5 rounded-full font-bold tracking-wide text-white"
          style={{ background: 'linear-gradient(135deg,#ff5588,#7c3aed)' }}>
          ✨ 攒新一局
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 pb-16">
        {err && (
          <div className="text-center py-16 text-rose-300/85">⚠️ {err}</div>
        )}

        {!history && !err && (
          <div className="text-center py-16 text-white/55 text-sm">⏳ 加载中…</div>
        )}

        {history && history.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="text-5xl mb-3">📭</div>
            <h2 className="text-lg font-bold text-white mb-2">还没有攒过局</h2>
            <p className="text-[13px] text-white/60 mb-5 max-w-md mx-auto">
              叫 2-4 个朋友各自做完班味测试 — AI 编剧给你们写 5 幕剧。
              玩完之后这里会记录每一桌的统计。
            </p>
            <button onClick={() => navigate('/squad/new')} className="y2k-cta"
              style={{ fontSize: 14 }}>
              ✨ 攒第一局 →
            </button>
          </motion.div>
        )}

        {history && history.length > 0 && (
          <>
            {/* Group leaderboard — only shown when ≥1 group played 2+ times */}
            {groups.some((g) => g.plays >= 2) && (
              <section className="mb-8">
                <h3 className="text-[11px] tracking-[0.22em] uppercase text-white/45 mb-3">
                  ✦ 同一组玩了多次的统计
                </h3>
                <div className="space-y-2">
                  {groups.filter((g) => g.plays >= 2).map((g) => (
                    <GroupCard key={g.key} group={g} myId={myId} />
                  ))}
                </div>
              </section>
            )}

            {/* Full history list */}
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-[11px] tracking-[0.22em] uppercase text-white/45">
                  ✦ 全部攒局历史
                </h3>
                <span className="text-[10px] text-white/35 tabular-nums">{history.length} 局</span>
              </div>
              <div className="space-y-2">
                {history.map((e) => (
                  <HistoryCard key={e.roomId} entry={e} myId={myId} onJump={() => navigate(`/squad/${e.roomId}`)} />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// ===========================================================================

function HistoryCard({ entry, myId, onJump }: {
  entry: HistoryEntry; myId: string; onJump: () => void;
}) {
  return (
    <motion.button
      onClick={onJump}
      whileHover={{ y: -2 }}
      className="frost-card hover-sheen w-full text-left rounded-2xl p-4 flex items-start gap-3 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(255,85,136,0.06), rgba(124,58,237,0.04))',
        border: '1px solid rgba(255,85,136,0.20)',
      }}
    >
      <div className="flex flex-col gap-1 flex-shrink-0">
        <div className="text-2xl">🎭</div>
        <div className="text-[10px] text-white/45 tabular-nums">
          {entry.actCount}幕
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white/95 leading-snug mb-1 truncate">
          {entry.recap?.headline ?? '(无回顾)'}
        </div>
        <div className="text-[11px] text-white/55 mb-2 flex flex-wrap gap-x-2 gap-y-0.5">
          {/* v6.16 P3 — wrap each member in SquadMemberCard so the user
               can hover/click to see archetype + 攒局战绩 + cross-link to
               12-rat IP. */}
          {entry.members.map((m) => (
            <SquadMemberCard key={m.userId} member={m}>
              <span
                style={{
                  color: m.userId === myId ? '#ffb84c' : undefined,
                  borderBottom: '1px dashed rgba(176,134,255,0.32)',
                  cursor: 'help',
                }}
                className={m.userId === myId ? 'font-bold' : ''}>
                {m.archetypeEmoji ?? '🐀'} {m.displayName}{m.userId === myId ? '(你)' : ''}
              </span>
            </SquadMemberCard>
          ))}
        </div>
        {/* My award if present in recap */}
        {entry.recap?.awards?.find((a) => a.userId === myId) && (
          <div className="text-[11px]" style={{ color: '#ffb84c' }}>
            {entry.recap.awards.find((a) => a.userId === myId)!.label} · 你拿了
          </div>
        )}
      </div>
      <div className="text-[10px] text-white/35 tabular-nums flex-shrink-0 text-right">
        {new Date(entry.endedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
      </div>
    </motion.button>
  );
}

function GroupCard({ group, myId }: {
  group: {
    key: string;
    members: Array<Pick<SquadMember, 'userId' | 'displayName' | 'archetypeId' | 'archetypeName' | 'archetypeEmoji'>>;
    plays: number;
    lastEndedAt: number;
    archetypeCount: Record<string, number>;
  };
  myId: string;
}) {
  // Top-3 most-common archetypes in this group across all their plays.
  const topArchetypes = useMemo(() =>
    Object.entries(group.archetypeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3),
    [group],
  );

  return (
    <div
      className="frost-card rounded-2xl p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(255,184,76,0.10), rgba(255,85,136,0.04))',
        border: '1px solid rgba(255,184,76,0.30)',
      }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-bold text-white/95 flex items-center gap-1.5">
          🏆 {group.members.length} 人小组
          <span className="text-[10px] font-normal text-white/45">
            (共 {group.plays} 局 · 最近 {new Date(group.lastEndedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })})
          </span>
        </div>
      </div>
      <div className="text-[11px] text-white/65 mb-2 flex flex-wrap gap-x-2">
        {/* v6.16 P3 — same hover/click affordance as entry view. */}
        {group.members.map((m) => (
          <SquadMemberCard key={m.userId} member={m}>
            <span
              style={{
                color: m.userId === myId ? '#ffb84c' : undefined,
                borderBottom: '1px dashed rgba(176,134,255,0.32)',
                cursor: 'help',
              }}
              className={m.userId === myId ? 'font-bold' : ''}>
              {m.archetypeEmoji ?? '🐀'} {m.displayName}{m.userId === myId ? '(你)' : ''}
            </span>
          </SquadMemberCard>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-white/45">最常出场的人设:</span>
        {topArchetypes.map(([id, n]) => {
          const m = group.members.find((mm) => mm.archetypeId === id);
          const label = m ? `${m.archetypeEmoji}${m.archetypeName}` : id;
          return (
            <span key={id}
              className="px-1.5 py-0.5 rounded-full font-bold"
              style={{
                color: '#fff',
                background: 'rgba(255,184,76,0.20)',
                border: '1px solid rgba(255,184,76,0.40)',
              }}>
              {label} × {n}
            </span>
          );
        })}
      </div>
    </div>
  );
}
