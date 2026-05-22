/**
 * Bar — v6.2.0 🍺 深夜酒馆 1v1 chat surface.
 *
 * Route: /bar/:archetype  (e.g., /bar/passive_aggressive)
 *
 * 设计 intent (米哈游风 - bar 夜景):
 *  - 整体 bg 用 mihoyo.mesh.barNight (amber → wine → black)
 *  - 顶部 archetype 立绘 + "STIGMA · NIGHT 4★" 风格 caption
 *  - 中间聊天流 — 用户右气泡, AI 左气泡, 间距大, 单条<= 40 字看起来才像聊天
 *  - 底部 input 简洁, "约一杯" 分享按钮
 *
 * 行为:
 *  1. 进入页面 -> GET /api/bar/profile/:archetype 拿 opener + vibe
 *  2. 渲染 AI opener 作为第一条消息
 *  3. 用户输入 -> POST /api/bar/reply -> 追加 AI reply
 *  4. 服务端自动 writeMemory, 这些对话会进 memory_entries, 下次玩
 *     classic mode 时同 archetype AI 会"记得你跟他聊过"
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getUserId } from '../utils/userId';
import { mihoyo, stigmaChipStyle } from '../constants/design';

interface Profile {
  archetype: string;
  opener: string;
  vibe: string;
}
interface BarMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

const ARCHETYPE_EMOJI: Record<string, string> = {
  passive_aggressive: '🐍',
  sass_master: '🗡️',
  sycophant: '🐶',
  hot_tempered: '🔥',
  introvert: '🐢',
  workaholic: '🥇',
  smooth_operator: '🦊',
  social_butterfly: '🦋',
  contrarian: '⚔️',
};

const ARCHETYPE_DISPLAY: Record<string, string> = {
  passive_aggressive: '阴阳人',
  sass_master: '毒舌怪',
  sycophant: '舔狗派',
  hot_tempered: '暴躁老哥',
  introvert: '社恐怪',
  workaholic: '卷王',
  smooth_operator: '老狐狸',
  social_butterfly: '社牛蝶',
  contrarian: '杠精',
};

// Map archetype to a mihoyo element-tier accent.
const ELEMENT_FOR: Record<string, keyof typeof mihoyo.element> = {
  passive_aggressive: 'stigma',
  sass_master: 'void',
  sycophant: 'aurora',
  hot_tempered: 'inferno',
  introvert: 'frost',
  workaholic: 'solar',
  smooth_operator: 'solar',
  social_butterfly: 'aurora',
  contrarian: 'stigma',
};

export default function Bar() {
  const navigate = useNavigate();
  const params = useParams<{ archetype: string }>();
  const archetype = (params.archetype ?? 'passive_aggressive');
  const myId = useMemo(() => getUserId(), []);
  const elem = ELEMENT_FOR[archetype] ?? 'void';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<BarMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/bar/profile/${archetype}`)
      .then((r) => r.json() as Promise<Profile>)
      .then((p) => {
        setProfile(p);
        setMessages([{ role: 'assistant', content: p.opener, id: 'opener' }]);
      })
      .catch(() => {});
  }, [archetype]);

  useEffect(() => {
    // Auto-scroll on new message
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const userMsg: BarMessage = { role: 'user', content: text, id: 'u-' + Date.now() };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setSending(true);
    try {
      const r = await fetch('/api/bar/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': myId },
        body: JSON.stringify({
          archetype,
          history: nextHistory.map((m) => ({ role: m.role, content: m.content })),
          userMessage: text,
        }),
      });
      const json = await r.json() as { reply?: string; error?: string };
      if (json.reply) {
        setMessages((m) => [...m, { role: 'assistant', content: json.reply!, id: 'a-' + Date.now() }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: '(...沉默地举起酒杯)', id: 'err-' + Date.now() }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: '(酒保打了个手势, 网络断了)', id: 'err-' + Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/bar/${archetype}`;
    const text = `Chris 邀请你到「${ARCHETYPE_DISPLAY[archetype]}」的酒馆喝一杯 🍺  #班味剧场`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: '约一杯?', text, url });
        return;
      }
    } catch { /* user cancelled */ }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareMsg('✓ 邀请文案已复制, 发给朋友吧');
      setTimeout(() => setShareMsg(null), 2400);
    } catch {
      setShareMsg('复制失败, 长按地址栏发吧');
      setTimeout(() => setShareMsg(null), 2400);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col"
      style={{ background: mihoyo.mesh.barNight }}>
      {/* subtle film grain / lo-fi texture overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 4px)`,
        }} />

      <header className="relative z-10 px-6 md:px-10 py-5 flex items-center justify-between">
        <button onClick={() => navigate('/')}
          className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 出店
        </button>
        <div className="text-center">
          <div style={stigmaChipStyle(elem)}>🍺 NIGHT BAR · 4★</div>
          <div className="mt-1.5 text-sm font-black tracking-wide text-white/95"
            style={{ textShadow: mihoyo.glow.heroText }}>
            {ARCHETYPE_EMOJI[archetype] ?? '🐀'} {ARCHETYPE_DISPLAY[archetype] ?? archetype} 的酒馆
          </div>
        </div>
        <button onClick={share}
          className="text-xs font-bold text-white px-3 py-1.5 rounded transition active:scale-95"
          style={{
            background: `linear-gradient(135deg, ${mihoyo.element[elem].core}, #ff5588)`,
            boxShadow: `0 4px 14px ${mihoyo.element[elem].glow}`,
          }}>
          🍷 约一杯
        </button>
      </header>

      <main className="relative z-10 flex-1 max-w-2xl w-full mx-auto px-4 md:px-6 pb-2 flex flex-col">
        {/* Tagline */}
        <div className="text-center text-[11px] text-white/55 leading-relaxed mb-4 mt-1"
          style={mihoyo.type.caption}>
          凌晨 2 点 · lo-fi · 没人催 KPI
        </div>

        {/* Messages stream */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto pr-1 space-y-3 pb-4">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[78%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed"
                  style={m.role === 'user' ? {
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.95)',
                    borderTopRightRadius: 4,
                  } : {
                    background: mihoyo.element[elem].halo,
                    border: `1px solid ${mihoyo.element[elem].core}55`,
                    color: 'rgba(255,255,255,0.92)',
                    borderTopLeftRadius: 4,
                    textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                  }}>
                  {m.content}
                </div>
              </motion.div>
            ))}
            {sending && (
              <motion.div key="typing"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex justify-start">
                <div className="px-4 py-2.5 rounded-2xl text-[14px] text-white/55 italic"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  (...在举杯)
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Composer */}
        <div className="sticky bottom-0 pt-2 pb-5 backdrop-blur-md"
          style={{
            background: 'linear-gradient(180deg, rgba(5,3,8,0) 0%, rgba(5,3,8,0.65) 30%)',
          }}>
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={profile ? `跟「${ARCHETYPE_DISPLAY[archetype]}」说点啥…` : '加载中…'}
              rows={1}
              maxLength={500}
              disabled={!profile || sending}
              className="flex-1 resize-none rounded-2xl px-4 py-3 text-[14px] text-white outline-none focus:ring-1 disabled:opacity-50"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="px-5 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-30 active:scale-95 transition"
              style={{
                background: `linear-gradient(135deg, ${mihoyo.element[elem].core}, ${mihoyo.element.void.core})`,
                boxShadow: `0 6px 18px ${mihoyo.element[elem].glow}`,
              }}>
              干杯
            </button>
          </div>
          {shareMsg && (
            <div className="text-center text-[11px] text-white/70 mt-2">{shareMsg}</div>
          )}
          <div className="text-center text-[10px] text-white/35 mt-3">
            你说的话会进 {ARCHETYPE_DISPLAY[archetype]} 的记忆 ·
            下次他在职场撕逼里见到你, 会想起这一晚
          </div>
        </div>
      </main>
    </div>
  );
}
