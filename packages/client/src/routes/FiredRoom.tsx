/**
 * FiredRoom — v0.9.3 PvP Worker vs Human-HR.
 *
 * Single route serving two distinct UIs based on `?role=worker|hr`:
 *   - Worker view: chat surface + a "邀请 HR 进来" share card while
 *     the HR seat is empty.
 *   - HR view: full scenario brief + chat + 6 PUA tactic chips that
 *     pre-fill the input with template HR moves (画饼, 施压, 扣帽子,
 *     变脸, 接受赔偿, 拒绝赔偿).
 *
 * Both share the same socket connection + the same room state stream.
 * No LLM, no scoring — this is human roleplay, evaluated by the players.
 *
 * State flows:
 *   create:  Worker hits FiredLanding → "邀请好友" → /fired/room/new?scenarioId=...
 *            We emit room:create, server returns room:state with id, we
 *            replace URL to /fired/room/<id>?role=worker
 *   join:    HR opens shared link with ?role=hr → emit room:join
 *   message: either side types → room:say → both receive room:message
 *   end:     either side hits "结束本轮" → room:end → both see outcome screen
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket, useSocketEvents } from '../hooks/useSocket';
import type { FiredScenario } from '@furball/shared';
import { uid as genId } from '../utils/uid';

type Role = 'worker' | 'hr';

interface RoomMessage {
  id: string;
  role: Role;
  content: string;
  ts: number;
}

interface RoomState {
  id: string;
  scenarioId: string;
  scenario: FiredScenario;
  messages: RoomMessage[];
  workerJoined: boolean;
  hrJoined: boolean;
  endedOutcome: 'worker_win' | 'hr_win' | 'draw' | null;
  createdAt: number;
  /** Server adds this on the snapshot it sends to a specific seat. */
  me?: Role;
}

// ----- HR tactic templates: pre-fill the input with classic PUA moves -----
const HR_TACTICS: Array<{ key: string; label: string; emoji: string; text: string }> = [
  { key: 'pua',    emoji: '🌀', label: '画饼',  text: '我们公司未来 3 年要 IPO,你这个时候走太可惜了。再扛半年,下一轮股权肯定有你的份。' },
  { key: 'press',  emoji: '⏰', label: '施压',  text: '今天不签的话,明天 OA 账号就关了。流程一旦走完,公司也没办法帮你了。' },
  { key: 'shame',  emoji: '😒', label: '扣帽子', text: '说实话,你的绩效本来就不达标。这次给你 N+1 已经是看在你苦劳的份上,别让我们都难做。' },
  { key: 'flip',   emoji: '🤝', label: '变脸',  text: '我是站在你这边的,但 HR 体系不是我一个人说了算。这样吧,我去帮你跟 BU 老板再争取争取。' },
  { key: 'accept', emoji: '✅', label: '接受 2N', text: '行,2N 就 2N。你今天签字,明天工资就能打过来。' },
  { key: 'reject', emoji: '🚫', label: '拒绝',   text: '抱歉,我们能给的就是 N+1,这是公司红线。你要走仲裁也是你的权利。' },
];

export default function FiredRoom() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { socket, connected } = useSocket();

  const queryRole = (searchParams.get('role') as Role | null) ?? null;
  const queryScenarioId = searchParams.get('scenarioId') ?? null;

  const [room, setRoom] = useState<RoomState | null>(null);
  const [me, setMe] = useState<Role | null>(queryRole);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerEvent, setPeerEvent] = useState<string | null>(null);
  const sentJoinRef = useRef(false);
  const peerEventTimeout = useRef<number | null>(null);
  const typingDebounceRef = useRef<number | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  // ── Socket lifecycle ─────────────────────────────────────────────────
  // On mount: if URL is /fired/room/new?scenarioId=… → emit room:create.
  // Otherwise → emit room:join with the role from query.
  useEffect(() => {
    if (!connected || !socket) return;
    if (sentJoinRef.current) return;
    sentJoinRef.current = true;

    if (roomId === 'new' && queryScenarioId) {
      socket.emit('room:create', { scenarioId: queryScenarioId });
      return;
    }
    if (roomId && roomId !== 'new' && queryRole) {
      socket.emit('room:join', { roomId, role: queryRole });
      return;
    }
    // Bad URL — bounce to landing.
    setErrorMsg('PvP 链接不完整');
  }, [connected, socket, roomId, queryRole, queryScenarioId]);

  // Subscribe to all room events in one batch.
  useSocketEvents({
    'room:state': (data: RoomState) => {
      setRoom(data);
      setErrorMsg(null);
      if (data.me) setMe(data.me);
      // If we just created a room, mirror the new id into the URL so
      // the worker can refresh / share / be the link source-of-truth.
      if (data.id && roomId === 'new') {
        navigate(
          `/fired/room/${data.id}?role=worker`,
          { replace: true },
        );
      }
    },
    'room:message': (msg: RoomMessage) => {
      setRoom((prev) => prev ? { ...prev, messages: [...prev.messages, msg] } : prev);
      // Receiving a message = peer stopped typing.
      setPeerTyping(false);
    },
    'room:typing': ({ isTyping }: { isTyping: boolean }) => {
      setPeerTyping(isTyping);
    },
    'room:peer': (e: { event: 'joined' | 'left' | 'replaced'; role?: Role }) => {
      setPeerEvent(
        e.event === 'joined' ? `✅ ${e.role === 'worker' ? '员工' : 'HR'} 进入房间`
      : e.event === 'left'   ? `⚠️ ${e.role === 'worker' ? '员工' : 'HR'} 离开了`
      : '⚠️ 你的连接被另一处替换了',
      );
      // Auto-clear notice after 3.5s.
      if (peerEventTimeout.current) window.clearTimeout(peerEventTimeout.current);
      peerEventTimeout.current = window.setTimeout(() => setPeerEvent(null), 3500);
      // If we joined, the server should've already pushed updated room state;
      // refetch authoritative state by re-emitting join (idempotent).
      if (e.event === 'joined' && socket && roomId && roomId !== 'new' && me) {
        socket.emit('room:join', { roomId, role: me });
      }
    },
    'room:ended': ({ outcome }: { outcome: 'worker_win' | 'hr_win' | 'draw' }) => {
      setRoom((prev) => prev ? { ...prev, endedOutcome: outcome } : prev);
    },
    'room:error': ({ message }: { message: string }) => {
      setErrorMsg(message);
    },
  });

  // Auto-scroll on new messages.
  useEffect(() => {
    if (!room) return;
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.messages.length]);

  // Cleanup typing debounce on unmount.
  useEffect(() => () => {
    if (typingDebounceRef.current) window.clearTimeout(typingDebounceRef.current);
    if (peerEventTimeout.current)   window.clearTimeout(peerEventTimeout.current);
  }, []);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || !room || !socket) return;
    socket.emit('room:say', { roomId: room.id, content: t });
    setDraft('');
    socket.emit('room:typing', { roomId: room.id, isTyping: false });
  };

  const onDraftChange = (next: string) => {
    setDraft(next);
    if (!room || !socket) return;
    // Debounce typing pings — emit true on first keystroke, false 1.5s
    // after last keystroke, both via the same timer.
    socket.emit('room:typing', { roomId: room.id, isTyping: true });
    if (typingDebounceRef.current) window.clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = window.setTimeout(() => {
      socket.emit('room:typing', { roomId: room.id, isTyping: false });
    }, 1500);
  };

  const endRound = (outcome: 'worker_win' | 'hr_win' | 'draw') => {
    if (!room || !socket) return;
    socket.emit('room:end', { roomId: room.id, outcome });
  };

  const copyShareLink = async () => {
    if (!room) return;
    const url = `${window.location.origin}/fired/room/${room.id}?role=hr`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: '裁了么 · PvP 房间邀请',
          text: `来扮我的 HR — ${room.scenario.title}`,
          url,
        });
        return;
      }
    } catch { /* user cancelled */ }
    try {
      await navigator.clipboard.writeText(url);
      const toast = document.createElement('div');
      toast.textContent = '✓ 链接已复制,发给朋友扮 HR';
      toast.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:rgba(15,14,46,0.95);color:#fff;padding:10px 18px;border-radius:9999px;font-size:13px;z-index:9999;border:1px solid rgba(255,255,255,0.15);box-shadow:0 8px 24px rgba(0,0,0,0.5)';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 1800);
    } catch { /* clipboard blocked */ }
  };

  const isHR     = me === 'hr';
  const isWorker = me === 'worker';

  // ── Render branches ──────────────────────────────────────────────────

  if (errorMsg && !room) {
    return (
      <Shell>
        <div className="text-center py-16">
          <div className="text-5xl mb-4">⚠️</div>
          <div className="text-white font-bold mb-2">{errorMsg}</div>
          <button
            onClick={() => navigate('/fired')}
            className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide text-white/80"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            ← 返回剧本库
          </button>
        </div>
      </Shell>
    );
  }
  if (!room) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20">
          <div className="text-white/55 text-sm">{connected ? '⏳ 加入房间中…' : '⏳ 连接中…'}</div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="max-w-3xl mx-auto px-4 md:px-8 pb-32">
        {/* Header strip — back + role badge + connection state + share */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <button
            onClick={() => navigate('/fired')}
            className="text-xs tracking-wider text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            ← 退出
          </button>
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 rounded-full font-bold tracking-wide text-[10px]"
              style={{
                color: isHR ? '#ff8aa6' : '#6ee7b7',
                background: isHR ? 'rgba(255,85,136,0.12)' : 'rgba(110,231,183,0.12)',
                border: `1px solid ${isHR ? 'rgba(255,85,136,0.4)' : 'rgba(110,231,183,0.35)'}`,
              }}
            >
              你扮演 {isHR ? '👿 HR' : '👤 员工'}
            </span>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                color: connected ? '#6ee7b7' : '#ff8aa6',
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {connected ? '● 已连接' : '○ 重连中'}
            </span>
            {isWorker && (
              <button
                onClick={copyShareLink}
                className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
                style={{ background: 'rgba(255,255,255,0.05)' }}
                title="复制邀请链接"
              >
                🔗 邀请 HR
              </button>
            )}
          </div>
        </div>

        {/* Peer event toast (joined / left / replaced) */}
        <AnimatePresence>
          {peerEvent && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-center text-[12px] text-white/75 mb-2 py-1.5 rounded-lg"
              style={{ background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.28)' }}
            >
              {peerEvent}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scenario context — collapsed by default for worker, expanded for HR */}
        <ScenarioBrief scenario={room.scenario} expandedDefault={isHR} />

        {/* Empty-seat hint for worker waiting on HR. */}
        {isWorker && !room.hrJoined && room.messages.length === 0 && !room.endedOutcome && (
          <WaitingForHRCard onShare={copyShareLink} />
        )}

        {/* Messages */}
        <div className="mt-4 space-y-2.5">
          {room.messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} mine={msg.role === me} />
          ))}
          {peerTyping && room.endedOutcome === null && (
            <div className="text-[11px] text-white/45 pl-2">
              {isHR ? '员工' : 'HR'} 正在打字…
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Outcome ribbon */}
        {room.endedOutcome && (
          <OutcomeRibbon outcome={room.endedOutcome} />
        )}
      </div>

      {/* Composer at the bottom, fixed */}
      {!room.endedOutcome && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-4 md:px-8 pb-4 pt-3"
          style={{
            background:
              'linear-gradient(180deg, rgba(8,6,24,0) 0%, rgba(8,6,24,0.85) 35%, rgba(8,6,24,0.95) 100%)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="max-w-3xl mx-auto">
            {/* HR tactic chips — only HR sees these */}
            {isHR && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {HR_TACTICS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setDraft(t.text)}
                    className="text-[11px] px-2.5 py-1 rounded-full font-semibold transition"
                    style={{
                      color: 'rgba(255,255,255,0.78)',
                      background: 'rgba(255,85,136,0.10)',
                      border: '1px solid rgba(255,85,136,0.28)',
                    }}
                    title={t.text.slice(0, 50)}
                  >
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                rows={1}
                placeholder={isHR ? '回员工的话…(Enter 发送, Shift+Enter 换行)' : '说点什么…(Enter 发送)'}
                className="flex-1 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-rose-400/40 transition resize-none"
                style={{
                  background: 'rgba(15,14,46,0.65)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  maxHeight: 140,
                }}
              />
              <button
                onClick={() => send(draft)}
                disabled={!draft.trim()}
                className="rounded-2xl px-4 py-2.5 text-xs font-bold tracking-wide text-white shadow-lg transition disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
                  boxShadow: '0 6px 18px rgba(255,85,136,0.4)',
                }}
              >
                发送
              </button>
              <EndRoundMenu onEnd={endRound} isHR={isHR} />
            </div>
          </div>
        </div>
      )}

      {/* Outcome page button when ended */}
      {room.endedOutcome && (
        <div className="fixed bottom-6 left-0 right-0 z-30 flex justify-center">
          <button
            onClick={() => navigate('/fired')}
            className="px-6 py-3 rounded-2xl text-sm font-bold text-white"
            style={{
              background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
              boxShadow: '0 8px 24px rgba(255,85,136,0.4)',
            }}
          >
            返回剧本库 →
          </button>
        </div>
      )}
    </Shell>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0a0a1e 0%, #1a0820 50%, #0a0a1e 100%)' }}
    >
      <header className="px-6 md:px-10 py-5">
        <span className="text-[11px] uppercase tracking-[0.28em] text-white/55">
          🤝 PvP · 真人 vs HR
        </span>
      </header>
      {children}
    </div>
  );
}

function ScenarioBrief({
  scenario,
  expandedDefault,
}: {
  scenario: FiredScenario;
  expandedDefault: boolean;
}) {
  const [expanded, setExpanded] = useState(expandedDefault);
  return (
    <div
      className="frost-card rounded-2xl p-4 mb-1"
      style={{
        background: 'linear-gradient(135deg, rgba(255,51,85,0.08) 0%, rgba(124,58,237,0.05) 100%)',
        border: '1px solid rgba(255,51,85,0.22)',
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 text-left"
      >
        <div className="text-2xl">{scenario.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white/95 leading-snug mb-0.5">
            {scenario.title}
          </div>
          <div className="text-[11px] text-white/55 line-clamp-1">
            {scenario.description}
          </div>
        </div>
        <span className="text-white/45 text-xs">{expanded ? '收起' : '展开'}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid gap-2 text-[12px] leading-relaxed">
              <BriefRow label="员工背景" value={scenario.playerContext} />
              <BriefRow label="法律要点" value={scenario.legalSituation} />
              <BriefRow label="HR 开场" value={scenario.hrOpeningLine} />
              <BriefRow label="赢取条件" value={scenario.winCondition} />
              <BriefRow label="最大赔偿" value={`${scenario.maxCompensation} 个月工资`} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-0.5">{label}</div>
      <div className="text-white/75">{value}</div>
    </div>
  );
}

function MessageBubble({ msg, mine }: { msg: RoomMessage; mine: boolean }) {
  const isHR = msg.role === 'hr';
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className="max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed"
        style={{
          background: mine
            ? 'linear-gradient(135deg, rgba(255,85,136,0.18), rgba(124,58,237,0.10))'
            : isHR
              ? 'rgba(255,51,85,0.10)'
              : 'rgba(110,231,183,0.10)',
          border: `1px solid ${mine
            ? 'rgba(255,85,136,0.4)'
            : isHR ? 'rgba(255,51,85,0.28)' : 'rgba(110,231,183,0.28)'}`,
          color: 'rgba(255,255,255,0.92)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <div className="text-[10px] mb-0.5 opacity-70">
          {isHR ? '👿 HR' : '👤 员工'}
        </div>
        {msg.content}
      </div>
    </motion.div>
  );
}

function WaitingForHRCard({ onShare }: { onShare: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="frost-card mt-4 rounded-2xl p-5 text-center"
      style={{
        background: 'linear-gradient(135deg, rgba(255,184,76,0.08), rgba(255,85,136,0.05))',
        border: '1px solid rgba(255,184,76,0.32)',
      }}
    >
      <div className="text-3xl mb-2 floaty">📨</div>
      <div className="text-sm font-bold text-white/90 mb-1">等待 HR 加入</div>
      <p className="text-[12px] text-white/60 mb-3 leading-relaxed">
        把链接发给朋友,让他扮演 HR 跟你谈裁员。<br/>
        他打开链接就自动入场,不用注册。
      </p>
      <button
        onClick={onShare}
        className="px-4 py-2 rounded-xl text-xs font-bold tracking-wide text-white"
        style={{
          background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
          boxShadow: '0 6px 18px rgba(255,85,136,0.4)',
        }}
      >
        🔗 复制邀请链接
      </button>
    </motion.div>
  );
}

function OutcomeRibbon({ outcome }: { outcome: 'worker_win' | 'hr_win' | 'draw' }) {
  const cfg = outcome === 'worker_win'
    ? { emoji: '🏆', title: '员工胜诉', body: '你成功逼出了合理赔偿,HR 这次输得很惨' }
    : outcome === 'hr_win'
      ? { emoji: '💼', title: 'HR 守住了', body: '员工接受了公司方案,这一轮 HR 赢了' }
      : { emoji: '🤝', title: '双方和解', body: '没赢也没输,谈了个折中方案' };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="frost-card mt-6 rounded-2xl p-6 text-center"
      style={{
        background: 'linear-gradient(135deg, rgba(255,184,76,0.15), rgba(255,85,136,0.08))',
        border: '1px solid rgba(255,184,76,0.4)',
      }}
    >
      <div className="text-5xl mb-3">{cfg.emoji}</div>
      <div className="text-lg font-black text-white mb-1">{cfg.title}</div>
      <div className="text-[12px] text-white/65">{cfg.body}</div>
    </motion.div>
  );
}

function EndRoundMenu({
  onEnd,
  isHR,
}: {
  onEnd: (o: 'worker_win' | 'hr_win' | 'draw') => void;
  isHR: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-2xl px-3 py-2.5 text-xs font-bold tracking-wide text-white/65 transition"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
        title="结束本轮"
      >
        结束 ▾
      </button>
      {open && (
        <div
          className="absolute bottom-full mb-2 right-0 rounded-xl p-2 min-w-[180px] z-40"
          style={{
            background: 'linear-gradient(180deg, #15122e, #0d0b25)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 px-2 py-1">
            {isHR ? '宣布结果' : '本轮怎么算?'}
          </div>
          {(['worker_win', 'hr_win', 'draw'] as const).map((o) => (
            <button
              key={o}
              onClick={() => { setOpen(false); onEnd(o); }}
              className="w-full text-left px-2 py-1.5 rounded text-xs text-white/85 hover:bg-white/5 transition"
            >
              {o === 'worker_win' ? '🏆 员工胜诉'
             : o === 'hr_win'     ? '💼 HR 守住了'
             : '🤝 双方和解'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Suppress unused-warning for genId — included for parity with FiredChat in
// case we need a client-side temp id later (e.g., optimistic message stub).
void genId;
