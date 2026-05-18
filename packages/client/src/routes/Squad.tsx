/**
 * Squad — v1.4.1 "你们这一桌的故事" route.
 *
 * Single page handling 4 lifecycle states:
 *   - lobby     — waiting for members; host sees "开演" + share link
 *   - directing — LLM director cooking; soothing spinner + "10s 内编完"
 *   - playing   — display current act; host can "下一幕"
 *   - ended     — recap card; host can "重新开演" or share
 *
 * URL: /squad/new (auto-creates) or /squad/<roomId> (join). Anyone with
 * the link joins as a regular member; host is whoever called create.
 *
 * UI lean: builds on existing utilities (frost-card, sticker shadows
 * from index.css). Acts use a TikTok-style chat bubble cascade so the
 * read feels like watching a story unfold.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket, useSocketEvents } from '../hooks/useSocket';
import { getUserId } from '../utils/userId';
import type {
  SquadRoom,
  SquadMember,
  SquadAct,
  SquadActBeat,
  SquadRecap,
} from '@furball/shared';

export default function Squad() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const { socket, connected } = useSocket();
  const myId = useMemo(() => getUserId(), []);

  const [room, setRoom] = useState<SquadRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peerToast, setPeerToast] = useState<string | null>(null);
  const peerToastTimer = useRef<number | null>(null);
  const sentJoinRef = useRef(false);

  // On mount: create a new room if URL says /squad/new, otherwise join.
  useEffect(() => {
    if (!connected || !socket || sentJoinRef.current) return;
    sentJoinRef.current = true;
    if (roomId === 'new') {
      socket.emit('squad:create', {});
    } else if (roomId) {
      socket.emit('squad:join', { roomId });
    }
  }, [connected, socket, roomId]);

  useSocketEvents({
    'squad:state': (next: SquadRoom) => {
      setRoom(next);
      setError(null);
      // Mint URL on create (room was 'new' before, now real id).
      if (roomId === 'new' && next.id) {
        navigate(`/squad/${next.id}`, { replace: true });
      }
    },
    'squad:peer': (ev: { event: 'joined' | 'left' | 'replaced'; userId: string }) => {
      const verb = ev.event === 'joined' ? '加入' : ev.event === 'left' ? '离开' : '被替换';
      setPeerToast(`👤 有人${verb}了`);
      if (peerToastTimer.current) window.clearTimeout(peerToastTimer.current);
      peerToastTimer.current = window.setTimeout(() => setPeerToast(null), 2200);
    },
    'squad:error': (e: { message: string }) => setError(e.message),
  });

  useEffect(() => () => {
    if (peerToastTimer.current) window.clearTimeout(peerToastTimer.current);
  }, []);

  const me = room?.members.find((m) => m.userId === myId);
  const amHost = me?.isHost ?? false;

  const shareLink = async () => {
    if (!room) return;
    const url = `${window.location.origin}/squad/${room.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: '攒局 · 班味剧场',
          text: '一起演一出 5 幕职场连续剧,AI 当编剧',
          url,
        });
        return;
      }
    } catch { /* cancelled */ }
    try {
      await navigator.clipboard.writeText(url);
      flashToast('✓ 链接已复制,发到群里凑人');
    } catch { /* clipboard blocked */ }
  };

  const flashToast = (msg: string) => {
    setPeerToast(msg);
    if (peerToastTimer.current) window.clearTimeout(peerToastTimer.current);
    peerToastTimer.current = window.setTimeout(() => setPeerToast(null), 2400);
  };

  if (error && !room) {
    return (
      <Shell>
        <div className="text-center py-16">
          <div className="text-4xl mb-3">⚠️</div>
          <div className="text-white font-bold mb-2">{error}</div>
          <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide text-white/80"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
            ← 返回首页
          </button>
        </div>
      </Shell>
    );
  }

  if (!room) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20 text-white/55 text-sm">
          {connected ? '⏳ 加入房间中…' : '⏳ 连接中…'}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {peerToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-bold"
          style={{
            background: 'rgba(15,14,46,0.95)', color: '#fff',
            border: '1px solid rgba(255,184,76,0.5)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
          }}>
          {peerToast}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 md:px-8 pb-32">
        {/* Header strip */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate('/')}
            className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            ← 退出
          </button>
          <div className="flex items-center gap-2">
            <StatusPill status={room.status} />
            <button onClick={shareLink}
              className="text-xs px-3 py-1.5 rounded-full font-bold tracking-wide"
              style={{
                color: '#fff',
                background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
                boxShadow: '0 4px 12px rgba(255,85,136,0.4)',
              }}>
              🔗 邀请朋友
            </button>
          </div>
        </div>

        {/* Members strip — always visible */}
        <MembersStrip members={room.members} maxMembers={room.maxMembers} />

        {/* Phase content */}
        <AnimatePresence mode="wait">
          {room.status === 'lobby' && (
            <Lobby key="lobby"
              room={room}
              amHost={amHost}
              onStart={() => socket?.emit('squad:start', { roomId: room.id })}
              onShare={shareLink}
            />
          )}
          {room.status === 'directing' && (
            <Directing key="dir" />
          )}
          {room.status === 'playing' && (
            <Playing key="play"
              room={room}
              myId={myId}
              amHost={amHost}
              onAdvance={() => socket?.emit('squad:advance', { roomId: room.id })}
            />
          )}
          {room.status === 'ended' && room.recap && (
            <EndedView key="end"
              room={room}
              recap={room.recap}
              myId={myId}
              amHost={amHost}
              onRerun={() => socket?.emit('squad:rerun', { roomId: room.id })}
              onShare={shareLink}
            />
          )}
        </AnimatePresence>

        {error && (
          <div className="mt-4 text-[12px] text-rose-300/90 text-center">⚠️ {error}</div>
        )}
      </div>
    </Shell>
  );
}

// ===========================================================================

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0a0a1e 0%, #1a0d35 50%, #0a0a1e 100%)' }}>
      <header className="px-6 md:px-10 py-5">
        <span className="text-[11px] uppercase tracking-[0.28em] text-white/55">
          🎭 攒局 · 你们这一桌的故事
        </span>
      </header>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: SquadRoom['status'] }) {
  const cfg =
    status === 'lobby'     ? { label: '🪑 等人',     color: '#9cff57' }
  : status === 'directing' ? { label: '🧠 编剧中',   color: '#ffb84c' }
  : status === 'playing'   ? { label: '🎬 开演',     color: '#ff5588' }
  :                          { label: '🏁 已收场',   color: '#a855f7' };
  return (
    <span className="text-[10px] px-2 py-1 rounded-full font-bold tracking-wide"
      style={{
        color: cfg.color,
        background: `${cfg.color}1a`,
        border: `1px solid ${cfg.color}55`,
      }}>
      {cfg.label}
    </span>
  );
}

function MembersStrip({ members, maxMembers }: { members: SquadMember[]; maxMembers: number }) {
  const slots = Array.from({ length: maxMembers }, (_, i) => members[i] ?? null);
  return (
    <div className="frost-card rounded-2xl p-3 mb-4 flex gap-2 overflow-x-auto"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {slots.map((m, i) => (
        <div key={i}
          className="flex-1 min-w-[72px] rounded-xl p-2 text-center"
          style={{
            background: m
              ? `linear-gradient(135deg, rgba(255,85,136,0.10), rgba(124,58,237,0.06))`
              : 'rgba(0,0,0,0.20)',
            border: `1px solid ${m ? 'rgba(255,85,136,0.32)' : 'rgba(255,255,255,0.06)'}`,
          }}>
          {m ? (
            <>
              <div className="text-xl mb-0.5">{m.archetypeEmoji ?? '🐀'}</div>
              <div className="text-[11px] font-bold text-white/90 truncate">{m.displayName}</div>
              <div className="text-[9px] text-white/55 truncate">
                {m.archetypeName ?? '未测试'}
              </div>
              {m.isHost && (
                <div className="mt-0.5 text-[8px] font-black px-1 rounded inline-block"
                  style={{ color: '#ffb84c', background: 'rgba(255,184,76,0.15)' }}>
                  HOST
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-xl mb-0.5 opacity-30">+</div>
              <div className="text-[10px] text-white/30">空位</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ===========================================================================

function Lobby({ room, amHost, onStart, onShare }: {
  room: SquadRoom; amHost: boolean; onStart: () => void; onShare: () => void;
}) {
  const filled = room.members.length;
  const canStart = amHost && filled >= 2;
  return (
    <motion.div
      key="lobby"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="frost-card rounded-2xl p-6 text-center"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="text-4xl mb-3 floaty">📨</div>
      <h2 className="text-lg font-black text-white mb-1">
        {filled}/{room.maxMembers} 人在线
      </h2>
      <p className="text-[13px] text-white/65 mb-5 leading-relaxed">
        {amHost
          ? (canStart
            ? '人够了,开演吗?(2-4 人都行,等齐再开也成)'
            : '把链接发到群里,等朋友进来。至少 2 个人才能开演。')
          : '等 host 开演中…'}
      </p>
      <div className="flex justify-center gap-2 flex-wrap">
        <button onClick={onShare}
          className="px-4 py-2 rounded-full text-xs font-bold tracking-wide"
          style={{
            color: '#fff',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}>
          🔗 复制邀请链接
        </button>
        {amHost && (
          <button onClick={onStart} disabled={!canStart}
            className="px-5 py-2 rounded-full text-xs font-black tracking-wide text-white transition disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg,#ffb84c,#ff5588 50%,#7c3aed)',
              boxShadow: '0 6px 18px rgba(255,184,76,0.4)',
            }}>
            🎬 开演 ({filled}/{room.maxMembers})
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Directing() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="frost-card rounded-2xl p-8 text-center"
      style={{ background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.32)' }}
    >
      <motion.div
        animate={{ rotate: [0, 10, -10, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        className="text-6xl mb-4 inline-block"
      >
        🧠
      </motion.div>
      <h2 className="text-xl font-black text-white mb-2">AI 编剧中…</h2>
      <p className="text-[13px] text-white/65 leading-relaxed">
        正在按你们每个人的 archetype 写 5 幕连续剧<br/>
        <span className="text-[11px] text-white/45">大概 5-10 秒,值得等</span>
      </p>
    </motion.div>
  );
}

function Playing({ room, myId, amHost, onAdvance }: {
  room: SquadRoom; myId: string; amHost: boolean; onAdvance: () => void;
}) {
  const act = room.acts[room.currentActIndex];
  if (!act) return null;
  const progress = `${room.currentActIndex + 1} / ${room.acts.length}`;

  return (
    <motion.div
      key={act.index}
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -32 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between text-[10px] tracking-[0.2em] uppercase text-white/45">
        <span>进度 {progress}</span>
        <span>共 {room.acts.length} 幕</span>
      </div>

      <h2 className="y2k-display text-2xl md:text-3xl font-black text-white">
        {act.title}
      </h2>

      <div className="space-y-2 mt-4">
        {act.beats.map((beat, i) => (
          <BeatBubble key={i}
            beat={beat}
            mine={beat.speakerUserId === myId}
            members={room.members}
          />
        ))}
      </div>

      {act.realLifePrompt && (
        <div
          className="rounded-2xl p-4 mt-4"
          style={{
            background: 'linear-gradient(135deg, rgba(255,184,76,0.15), rgba(255,85,136,0.06))',
            border: '1px solid rgba(255,184,76,0.45)',
          }}
        >
          <div className="text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: '#ffb84c' }}>
            🎤 现场互动
          </div>
          <div className="text-sm text-white/95 font-bold">
            @{labelOf(act.realLifePrompt.targetUserId, room.members)} {act.realLifePrompt.prompt}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 mt-6">
        {amHost ? (
          <button onClick={onAdvance}
            className="px-6 py-3 rounded-full text-sm font-black tracking-wide text-white"
            style={{
              background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
              boxShadow: '0 8px 24px rgba(255,85,136,0.45)',
            }}>
            {room.currentActIndex + 1 < room.acts.length ? '下一幕 →' : '🎬 看结局'}
          </button>
        ) : (
          <div className="text-[11px] text-white/55">⏳ 等 host 翻幕</div>
        )}
      </div>
    </motion.div>
  );
}

function BeatBubble({ beat, mine, members }: {
  beat: SquadActBeat; mine: boolean; members: SquadMember[];
}) {
  const isNarrator = beat.speakerUserId === 'narrator';
  if (isNarrator) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
        className="text-center text-[12px] italic px-4 py-2"
        style={{ color: 'rgba(255,255,255,0.55)' }}
      >
        — {beat.line} —
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className="max-w-[85%] rounded-2xl px-3.5 py-2"
        style={{
          background: mine
            ? 'linear-gradient(135deg, rgba(255,85,136,0.20), rgba(124,58,237,0.12))'
            : 'rgba(255,255,255,0.06)',
          border: `1px solid ${mine ? 'rgba(255,85,136,0.45)' : 'rgba(255,255,255,0.10)'}`,
        }}
      >
        <div className="text-[10px] mb-0.5 opacity-75 font-bold">
          {beat.speakerLabel}
        </div>
        <div className="text-sm text-white/95 leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
          {beat.line}
        </div>
      </div>
      {/* Reference `members` to avoid lint-unused (used by the parent for
          @mention lookup; included here for prop symmetry / future avatar). */}
      <span className="hidden">{members.length}</span>
    </motion.div>
  );
}

function labelOf(userId: string, members: SquadMember[]): string {
  const m = members.find((x) => x.userId === userId);
  if (!m) return '某位';
  return `${m.archetypeEmoji ?? '🐀'} ${m.displayName}`;
}

// ===========================================================================

function EndedView({ room, recap, myId, amHost, onRerun, onShare }: {
  room: SquadRoom;
  recap: SquadRecap;
  myId: string;
  amHost: boolean;
  onRerun: () => void;
  onShare: () => void;
}) {
  const myAward = recap.awards.find((a) => a.userId === myId);
  return (
    <motion.div
      key="ended"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      {/* Recap headline card — designed to look great as a screenshot */}
      <div
        className="rounded-3xl p-6 text-center y2k-sparkle"
        style={{
          background: 'linear-gradient(135deg, #ff2d92 0%, #6e00ff 60%, #00ddff 100%)',
          border: '4px solid #0a0a0a',
          boxShadow: '8px 8px 0 0 #0a0a0a',
        }}
      >
        <div className="text-5xl mb-2">🏁</div>
        <div className="y2k-display text-2xl mb-2"
          style={{ color: '#fff', textShadow: '2px 2px 0 #0a0a0a' }}>
          完结撒花
        </div>
        <div className="text-sm font-bold mb-1"
          style={{ color: '#0a0a0a', background: '#fff', borderRadius: 999, display: 'inline-block', padding: '0.25rem 0.75rem', border: '2px solid #0a0a0a' }}>
          《{recap.headline}》
        </div>
      </div>

      {/* Awards row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {recap.awards.map((a, i) => {
          const m = room.members.find((mm) => mm.userId === a.userId);
          const isMe = a.userId === myId;
          return (
            <div key={i}
              className="rounded-xl p-3 flex items-center gap-3"
              style={{
                background: isMe
                  ? 'linear-gradient(135deg, rgba(255,184,76,0.15), rgba(255,85,136,0.06))'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isMe ? 'rgba(255,184,76,0.45)' : 'rgba(255,255,255,0.08)'}`,
              }}>
              <div className="text-2xl flex-shrink-0">{m?.archetypeEmoji ?? '🐀'}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-[0.18em] uppercase font-bold"
                  style={{ color: isMe ? '#ffb84c' : 'rgba(255,255,255,0.55)' }}>
                  {a.label}{isMe && ' · 你'}
                </div>
                <div className="text-sm font-bold text-white truncate">
                  {m?.displayName ?? '某位'}
                </div>
                <div className="text-[11px] text-white/65 leading-snug mt-0.5 line-clamp-2">
                  {a.line}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Closer */}
      <div className="text-center text-[13px] text-white/75 italic px-4">
        — {recap.closer} —
      </div>
      {myAward && (
        <div className="text-center text-[11px] text-white/55">
          你拿了 <span className="font-bold text-white">{myAward.label}</span>,
          截图朋友圈说"这就是我"
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-2 mt-4 flex-wrap">
        <button onClick={onShare}
          className="px-5 py-2.5 rounded-full text-xs font-bold tracking-wide"
          style={{
            color: '#fff',
            background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
            boxShadow: '0 6px 18px rgba(255,85,136,0.45)',
          }}>
          🔗 分享这一桌的故事
        </button>
        {amHost && (
          <button onClick={onRerun}
            className="px-5 py-2.5 rounded-full text-xs font-bold tracking-wide text-white/85"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}>
            ↻ 重开一局
          </button>
        )}
      </div>
    </motion.div>
  );
}
