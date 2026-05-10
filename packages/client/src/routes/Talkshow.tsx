/**
 * Talkshow — v0.7.0 班味单口 (Workplace Standup) MVP.
 *
 * Three states the page can be in:
 *   1. List view (default) — grid of 30 seed scripts with tag chips +
 *      persona swatch. Tapping a card transitions to player view.
 *   2. Loading — script body + audio fetch in flight, showing a spinner
 *      over the about-to-play card.
 *   3. Player view — big avatar, speech bubble caption that streams in
 *      with the audio (cheap "lip sync" — text reveals at ~6 chars/sec
 *      to roughly track Minimax 2.8-hd's output rate), big play/pause +
 *      back button.
 *
 * No login, no persistence yet — every visit pulls /list fresh. v0.7.1
 * adds the character editor; v0.7.2 swaps the static avatar for Veo 3.1
 * generated B-roll.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  primeAudio,
  playTtsFromUrl,
  speakViaBrowserTTS,
  hasBrowserTTS,
  stopTts,
} from '../utils/audioUnlock';

interface ScriptSummary {
  id: string;
  title: string;
  tag: string;
  persona: string;
  durationSec: number;
  /** v0.7.4 — 'seed' = hand-curated by us, 'user' = LLM-written from a
   *  user prompt. Drives the ✨ badge on the card so users can tell the
   *  fresh community bits from the curated catalogue. */
  source?: 'seed' | 'user';
}

interface ScriptFull extends ScriptSummary {
  text: string;
}

type Persona = 'shaonv' | 'yujie' | 'qingse' | 'jingying' | 'badao' | 'qingnian';
type Tag =
  | 'overtime' | 'kpi' | 'pua' | 'age' | 'slacking'
  | 'jargon' | 'hr' | 'boss' | 'meta';

const TAG_LABELS: Record<string, { label: string; color: string }> = {
  overtime: { label: '🌙 加班', color: '#ff5588' },
  kpi:      { label: '📊 KPI', color: '#4c9eff' },
  pua:      { label: '🌀 PUA', color: '#a855f7' },
  age:      { label: '🪪 35岁', color: '#ffb84c' },
  slacking: { label: '🛋️ 摸鱼', color: '#6ee7b7' },
  jargon:   { label: '🗣️ 黑话', color: '#7c3aed' },
  hr:       { label: '🧑‍💼 HR', color: '#42a5f5' },
  boss:     { label: '👔 老板', color: '#ff4757' },
  meta:     { label: '🪞 自嘲', color: '#90caf9' },
};

const PERSONA_LABELS: Record<string, { emoji: string; label: string; gender: 'female' | 'male' }> = {
  shaonv:   { emoji: '👧', label: '少女音',   gender: 'female' },
  yujie:    { emoji: '💃', label: '御姐音',   gender: 'female' },
  qingse:   { emoji: '🧑', label: '青涩男',   gender: 'male'   },
  jingying: { emoji: '🧔', label: '精英男',   gender: 'male'   },
  badao:    { emoji: '👨‍💼', label: '霸道男', gender: 'male'   },
  qingnian: { emoji: '👤', label: '青年音',   gender: 'male'   },
};

export default function Talkshow() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  /** When non-null, we're in player view for this script. */
  const [active, setActive] = useState<ScriptFull | null>(null);
  /** v0.7.4 — when true, the create-bit modal is open. */
  const [creatorOpen, setCreatorOpen] = useState(false);

  // Fetch list — extracted so we can call it again after a create completes.
  const reloadList = useRef<() => Promise<void>>();
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/talkshow/list');
        const d = await r.json();
        if (!cancelled) setScripts(d.scripts ?? []);
      } catch (e) {
        if (!cancelled) setLoadErr((e as Error).message ?? '加载失败');
      }
    };
    reloadList.current = load;
    load();
    return () => { cancelled = true; stopTts(); };
  }, []);

  // Deeplink — `?id=bit-001` auto-opens the player. Also keeps the URL in
  // sync as the user navigates between bits, so refresh / share preserves
  // the current bit.
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) return;
    if (active && active.id === id) return;
    let cancelled = false;
    fetch(`/api/talkshow/script/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((full: ScriptFull) => {
        if (!cancelled) {
          // Prime audio in case the deeplink open is the user's first
          // gesture this session — Safari only unlocks audio inside one.
          primeAudio();
          setActive(full);
        }
      })
      .catch(() => { /* invalid id — silently ignore, keep grid view */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Mirror player navigation back to the URL so the back/forward button
  // and a fresh refresh both land on the same bit.
  useEffect(() => {
    if (active) {
      if (searchParams.get('id') !== active.id) {
        setSearchParams({ id: active.id }, { replace: true });
      }
    } else {
      if (searchParams.get('id')) {
        setSearchParams({}, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const visible = useMemo(
    () => (tagFilter ? scripts.filter((s) => s.tag === tagFilter) : scripts),
    [scripts, tagFilter],
  );

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const s of scripts) set.add(s.tag);
    return [...set];
  }, [scripts]);

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: 'linear-gradient(180deg,#0a0a1e,#1a0d2e 50%,#0d0a25)' }}
    >
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <button
          onClick={() => navigate('/')}
          className="text-xs tracking-wider text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          ← 返回首页
        </button>
        <div className="flex items-baseline gap-3">
          <span className="text-[11px] uppercase tracking-[0.28em] text-white/55">
            🎤 班味单口
          </span>
          <span className="text-[10px] text-white/35">
            {scripts.length > 0 && `${scripts.length} 段`}
          </span>
        </div>
        <div className="w-20" />
      </header>

      {/* Player view — slides in over the list */}
      <AnimatePresence mode="wait">
        {active ? (
          <PlayerView
            key="player"
            script={active}
            onBack={() => setActive(null)}
            onNavigate={async (direction) => {
              // Find the active script in the visible list and jump to the
              // next/previous one. Loops at the boundaries so users can keep
              // tapping ▶ without hitting a dead-end.
              const idx = visible.findIndex((s) => s.id === active.id);
              if (idx < 0 || visible.length <= 1) return;
              const next = direction === 'next'
                ? visible[(idx + 1) % visible.length]
                : visible[(idx - 1 + visible.length) % visible.length];
              try {
                const resp = await fetch(`/api/talkshow/script/${next.id}`);
                const full = (await resp.json()) as ScriptFull;
                setActive(full);
              } catch {
                setActive({ ...next, text: '(脚本加载失败)' });
              }
            }}
          />
        ) : (
          <motion.main
            key="list"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 px-4 md:px-10 pb-20"
          >
            {/* Hero */}
            <div className="text-center mb-8 mt-4">
              <h1
                className="font-black mb-3"
                style={{
                  fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                  background: 'linear-gradient(135deg,#ff5588,#7c3aed,#4c9eff)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '0.02em',
                }}
              >
                班味单口
              </h1>
              <p className="text-white/60 text-sm md:text-base">
                AI 鼠人替你讲段子 · {scripts.length} 段职场暴论 · 真人音色播报
              </p>
            </div>

            {/* Tag filter */}
            {tags.length > 0 && (
              <div className="max-w-4xl mx-auto mb-6 flex flex-wrap gap-2 justify-center">
                <Chip
                  active={tagFilter === null}
                  onClick={() => setTagFilter(null)}
                  color="#ffffff"
                >
                  全部
                </Chip>
                {tags.map((t) => (
                  <Chip
                    key={t}
                    active={tagFilter === t}
                    onClick={() => setTagFilter(t)}
                    color={TAG_LABELS[t]?.color ?? '#ffffff'}
                  >
                    {TAG_LABELS[t]?.label ?? t}
                  </Chip>
                ))}
              </div>
            )}

            {/* Grid */}
            {loadErr ? (
              <div className="text-center text-red-400 py-12">{loadErr}</div>
            ) : (
              <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* v0.7.4 creator card — sticky first slot. Tapping opens
                    the modal editor; on success the new bit shows up at
                    the top of the grid AND auto-opens in PlayerView. */}
                <CreateBitCard
                  onOpen={() => {
                    primeAudio();           // gesture-window unlock for later TTS
                    setCreatorOpen(true);
                  }}
                />
                {visible.map((s) => (
                  <ScriptCard
                    key={s.id}
                    script={s}
                    onSelect={async () => {
                      // Prime audio inside the click gesture so Safari
                      // autoplay policy lets us play TTS later.
                      primeAudio();
                      try {
                        const resp = await fetch(`/api/talkshow/script/${s.id}`);
                        const full = (await resp.json()) as ScriptFull;
                        setActive(full);
                      } catch {
                        // Soft-fail to a stub so the player still renders
                        // and the user can read the title at least.
                        setActive({ ...s, text: '(脚本加载失败)' });
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </motion.main>
        )}
      </AnimatePresence>

      {/* Creator modal — mounted at the route root so it overlays both
          the grid AND the player view (in case someone hits "create" from
          deeper in the flow later). Closed by default; opens via the
          ✨-card and via the future header CTA. */}
      <AnimatePresence>
        {creatorOpen && (
          <CreateBitModal
            onCancel={() => setCreatorOpen(false)}
            onCreated={async (full) => {
              setCreatorOpen(false);
              // Pull fresh list so the new bit shows up + auto-open it
              // in the player. Both branches survive a list refetch fail.
              if (reloadList.current) await reloadList.current();
              setActive(full);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Chip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-bold tracking-wide transition"
      style={{
        color: active ? '#fff' : 'rgba(255,255,255,0.55)',
        background: active ? `${color}30` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? color + '88' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {children}
    </button>
  );
}

function ScriptCard({ script, onSelect }: { script: ScriptSummary; onSelect: () => void }) {
  const tagCfg = TAG_LABELS[script.tag] ?? { label: script.tag, color: '#888' };
  const personaCfg = PERSONA_LABELS[script.persona] ?? { emoji: '🎤', label: script.persona };
  const isUser = script.source === 'user';
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="text-left rounded-2xl p-4 transition flex flex-col gap-3 min-h-[140px]"
      style={{
        // User-generated bits get a faint amber rim so they're visually
        // distinguishable from seed bits without an in-your-face badge.
        background: isUser
          ? 'linear-gradient(135deg, rgba(255,184,76,0.08), rgba(255,255,255,0.02))'
          : 'rgba(255,255,255,0.025)',
        border: `1px solid ${isUser ? 'rgba(255,184,76,0.28)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <div className="flex items-center justify-between text-[10px]">
        <span
          className="px-2 py-0.5 rounded-full font-bold tracking-wide"
          style={{
            color: tagCfg.color,
            background: `${tagCfg.color}18`,
            border: `1px solid ${tagCfg.color}40`,
          }}
        >
          {tagCfg.label}
        </span>
        <div className="flex items-center gap-2">
          {isUser && (
            <span
              className="px-1.5 py-0.5 rounded-full font-bold tracking-wide text-[9px]"
              style={{
                color: '#ffb84c',
                background: 'rgba(255,184,76,0.15)',
                border: '1px solid rgba(255,184,76,0.4)',
              }}
              title="社区创作"
            >
              ✨ 用户
            </span>
          )}
          <span className="text-white/35 tabular-nums">{script.durationSec}s</span>
        </div>
      </div>
      <div className="text-sm font-bold text-white/90 line-clamp-3 leading-snug">
        {script.title}
      </div>
      <div className="text-[11px] text-white/55 mt-auto flex items-center gap-1.5">
        <span>{personaCfg.emoji}</span>
        <span>{personaCfg.label}</span>
        <span className="text-white/30 ml-auto">▶ 播放</span>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// v0.7.4 — Creator card + modal
// ---------------------------------------------------------------------------

function CreateBitCard({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.button
      onClick={onOpen}
      whileHover={{ y: -2, scale: 1.005 }}
      whileTap={{ scale: 0.98 }}
      className="text-left rounded-2xl p-4 transition flex flex-col items-center justify-center gap-2 min-h-[140px] cursor-pointer"
      style={{
        background:
          'radial-gradient(circle at 20% 0%, rgba(255,85,136,0.18), rgba(124,58,237,0.10) 60%, transparent), rgba(255,255,255,0.03)',
        border: '1px dashed rgba(255,85,136,0.45)',
        boxShadow: '0 8px 24px -12px rgba(255,85,136,0.4)',
      }}
    >
      <div className="text-3xl mb-1">✍️</div>
      <div className="text-sm font-bold text-white/90">自己写一段</div>
      <div className="text-[11px] text-white/55 text-center">
        给个话题 · 选个口音 · AI 替你编出爆款
      </div>
    </motion.button>
  );
}

const CREATE_TAGS: Array<{ key: Tag; label: string; color: string }> = [
  { key: 'overtime', label: '🌙 加班',  color: '#ff5588' },
  { key: 'kpi',      label: '📊 KPI',    color: '#4c9eff' },
  { key: 'pua',      label: '🌀 PUA',    color: '#a855f7' },
  { key: 'age',      label: '🪪 35岁',   color: '#ffb84c' },
  { key: 'slacking', label: '🛋️ 摸鱼',  color: '#6ee7b7' },
  { key: 'jargon',   label: '🗣️ 黑话',  color: '#7c3aed' },
  { key: 'hr',       label: '🧑‍💼 HR',  color: '#42a5f5' },
  { key: 'boss',     label: '👔 老板',   color: '#ff4757' },
  { key: 'meta',     label: '🪞 自嘲',   color: '#90caf9' },
];

const CREATE_PERSONAS: Array<{ key: Persona; emoji: string; label: string }> = [
  { key: 'shaonv',   emoji: '👧', label: '少女音' },
  { key: 'yujie',    emoji: '💃', label: '御姐音' },
  { key: 'qingse',   emoji: '🧑', label: '青涩男' },
  { key: 'jingying', emoji: '🧔', label: '精英男' },
  { key: 'badao',    emoji: '👨‍💼', label: '霸道男' },
  { key: 'qingnian', emoji: '👤', label: '青年音' },
];

const CREATE_SAMPLES = [
  '我老板让我把"死线"翻译成"目标节点"',
  '入职第一天 HR 让我签了个"自愿加班同意书"',
  '35 岁那年我开始研究公积金提取',
  '我妈不懂为什么我每天 11 点才下班',
  '同事在群里 @ 全员说"求大佬看一眼"已经第三次了',
];

function CreateBitModal({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (full: ScriptFull) => void;
}) {
  const [topic, setTopic] = useState('');
  const [persona, setPersona] = useState<Persona>('qingse');
  const [tag, setTag] = useState<Tag>('overtime');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sample = useMemo(
    () => CREATE_SAMPLES[Math.floor(Math.random() * CREATE_SAMPLES.length)],
    [],
  );

  // Autofocus + Esc to close.
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  const canSubmit = topic.trim().length >= 4 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      const resp = await fetch('/api/talkshow/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), persona, tag }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? `生成失败 (${resp.status})`);
      }
      const full = (await resp.json()) as ScriptFull;
      onCreated(full);
    } catch (e) {
      setErrMsg((e as Error).message ?? '生成失败,稍后再试');
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(8,6,24,0.78)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.96, opacity: 0 }}
        animate={{ y: 0,  scale: 1,    opacity: 1 }}
        exit={{    y: 20, scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          background: 'linear-gradient(180deg,#15122e,#0d0b25)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white">✍️ 写一段班味单口</h3>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-white/45 hover:text-white/85 transition text-xl leading-none disabled:opacity-30"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* Topic */}
        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5">
          话题（一句话越具体越好,4-200 字）
        </label>
        <textarea
          ref={inputRef}
          value={topic}
          onChange={(e) => setTopic(e.target.value.slice(0, 200))}
          disabled={submitting}
          rows={3}
          placeholder={`比如:${sample}`}
          className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-pink-400/40 transition resize-none"
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        />
        <div className="text-right text-[10px] text-white/35 mt-1 tabular-nums">
          {topic.length}/200
        </div>

        {/* Persona */}
        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5 mt-3">叙述者口音</label>
        <div className="grid grid-cols-3 gap-1.5">
          {CREATE_PERSONAS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPersona(p.key)}
              disabled={submitting}
              className="rounded-lg py-2 text-xs font-semibold transition flex flex-col items-center gap-0.5"
              style={{
                background: persona === p.key
                  ? 'linear-gradient(135deg,rgba(255,85,136,0.25),rgba(124,58,237,0.18))'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${persona === p.key ? 'rgba(255,85,136,0.55)' : 'rgba(255,255,255,0.08)'}`,
                color: persona === p.key ? '#fff' : 'rgba(255,255,255,0.6)',
              }}
            >
              <span className="text-base leading-none">{p.emoji}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Tag */}
        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5 mt-3">话题分类</label>
        <div className="flex flex-wrap gap-1.5">
          {CREATE_TAGS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTag(t.key)}
              disabled={submitting}
              className="px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide transition"
              style={{
                color: tag === t.key ? '#fff' : 'rgba(255,255,255,0.55)',
                background: tag === t.key ? `${t.color}30` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tag === t.key ? `${t.color}88` : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {errMsg && (
          <div className="mt-3 text-[12px] text-amber-300/90">⚠️ {errMsg}</div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold tracking-wide text-white/65 transition disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-5 py-2 rounded-xl text-xs font-bold tracking-wide text-white transition disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
              boxShadow: '0 6px 18px rgba(255,85,136,0.45)',
            }}
          >
            {submitting ? '✍️ AI 编写中…' : '✨ 生成段子'}
          </button>
        </div>

        <div className="mt-3 text-[10px] text-white/35 leading-relaxed">
          生成的段子会进入"全部"列表的最前面,带 ✨ 标。所有人都能看到+收听+分享。请勿输入真人姓名 / 真公司名。
        </div>
      </motion.div>
    </motion.div>
  );
}

function PlayerView({
  script,
  onBack,
  onNavigate,
}: {
  script: ScriptFull;
  onBack: () => void;
  /** Jump to the previous / next script in the currently-visible (filtered)
   *  list. Loops at the boundaries. Lets users binge through the bits
   *  without going back to the grid every time. */
  onNavigate: (direction: 'prev' | 'next') => void;
}) {
  const [revealedChars, setRevealedChars] = useState(0);
  // 'fetching' = TTS request in flight; 'ready' = blob fetched but waiting
  // for a user click (Safari autoplay denial); 'playing' = audio rolling
  // (server MP3); 'browser' = playing via Web Speech API fallback (server
  // chain exhausted or 502); 'done' = audio finished; 'failed' = even the
  // browser fallback is unavailable (no SpeechSynthesis support).
  const [audioState, setAudioState] = useState<
    'fetching' | 'ready' | 'playing' | 'browser' | 'done' | 'failed'
  >('fetching');
  const fetchedRef = useRef(false);
  const blobUrlRef = useRef<string | null>(null);
  /** End-of-audio timer for the server MP3 path — we don't have a direct
   *  'ended' hook on the shared element so we approximate using durationSec.
   *  Cleared on unmount / replay so we don't fire stale flips. */
  const endTimerRef = useRef<number | null>(null);
  const personaCfg = PERSONA_LABELS[script.persona]
    ?? { emoji: '🎤', label: script.persona, gender: 'male' as const };
  const tagCfg = TAG_LABELS[script.tag] ?? { label: script.tag, color: '#888' };

  const armEndTimer = (seconds: number) => {
    if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
    endTimerRef.current = window.setTimeout(() => {
      setAudioState((s) => (s === 'playing' ? 'done' : s));
    }, Math.max(2000, seconds * 1000 + 800));
  };

  /** Fall back to the browser's Web Speech API. Returns the audioState we
   *  should land in: 'browser' on success, 'failed' if even SpeechSynthesis
   *  isn't supported (older browsers, certain in-app webviews). The voice
   *  picker uses the persona's gender hint so 御姐音 doesn't come out as a
   *  male system voice. */
  const speakBrowser = async () => {
    if (!hasBrowserTTS()) {
      setAudioState('failed');
      return;
    }
    setAudioState('browser');
    try {
      await speakViaBrowserTTS(script.text, {
        genderHint: personaCfg.gender,
        // Slightly faster than default — talkshow bits read better quickly,
        // and the browser voice tends to sound robotic when slow.
        rate: 1.15,
      });
      setAudioState('done');
    } catch {
      setAudioState('failed');
    }
  };

  // Step 1: fetch TTS once on mount. Doesn't try to play yet — Safari kills
  // play() called in an async-resolved promise that started inside a gesture.
  // We stash the blob URL and ALWAYS attempt autoplay first; if autoplay is
  // rejected we surface a "点击播放" button that retries inside a fresh click.
  // If the SERVER chain is exhausted (502 / network error), we silently fall
  // back to Web Speech so users still get a voice instead of a silent screen.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/talkshow/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptId: script.id }),
        });
        if (!resp.ok) {
          // Server-side TTS chain exhausted (502) or some other error.
          // Don't throw — degrade to browser TTS so the UX still has audio.
          console.warn(`[talkshow] server tts ${resp.status} — falling back to Web Speech`);
          if (!cancelled) await speakBrowser();
          return;
        }
        const blob = await resp.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        // Try autoplay first (works when the shared audio element was
        // unlocked by primeAudio() during the earlier click).
        const ok = await playTtsFromUrl(url);
        if (cancelled) return;
        if (ok) {
          setAudioState('playing');
          armEndTimer(script.durationSec);
        } else {
          // Autoplay denied. Surface an explicit play button.
          setAudioState('ready');
        }
      } catch (err) {
        console.warn('[talkshow] tts fetch errored — falling back to Web Speech', err);
        if (!cancelled) await speakBrowser();
      }
    })();
    return () => {
      cancelled = true;
      stopTts();
      if (endTimerRef.current) {
        window.clearTimeout(endTimerRef.current);
        endTimerRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
    // speakBrowser captures personaCfg/script.text but is stable per render
    // and we WANT this effect to fire only on script.id change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script.id]);

  // Step 2: explicit click-to-play retry. Runs inside a guaranteed user
  // gesture so Safari can't refuse this time around. If even THIS retry
  // fails we drop into Web Speech.
  const handleManualPlay = async () => {
    primeAudio();
    if (blobUrlRef.current) {
      const ok = await playTtsFromUrl(blobUrlRef.current);
      if (ok) {
        setAudioState('playing');
        armEndTimer(script.durationSec);
        return;
      }
    }
    // No blob (server failed) or playback still blocked → browser fallback.
    await speakBrowser();
  };

  // Cheap subtitle reveal: ~7 chars/sec while ANY audio is playing (server
  // MP3 or browser fallback). Not word-accurate, but good enough that
  // captions feel synced on first watch. v0.7.x will swap this for a real
  // audio analyser. Reset when state flips to a new playback start so a
  // replay re-runs the reveal cleanly.
  useEffect(() => {
    if (audioState !== 'playing' && audioState !== 'browser') return;
    setRevealedChars(0);
    const total = script.text.length;
    const charPerSec = total / Math.max(8, script.durationSec);
    const tickMs = 60;
    const charsPerTick = Math.max(1, charPerSec * (tickMs / 1000));
    let raw = 0;
    const id = setInterval(() => {
      raw += charsPerTick;
      const next = Math.min(total, Math.floor(raw));
      setRevealedChars(next);
      if (next >= total) clearInterval(id);
    }, tickMs);
    return () => clearInterval(id);
  }, [audioState, script.text, script.durationSec]);

  const visibleText = script.text.slice(0, revealedChars);

  /** Web Share API where supported (mobile + Safari macOS); falls back to
   *  copying a deeplink to clipboard with a one-shot toast. */
  const handleShare = async () => {
    const url = `${window.location.origin}/talkshow?id=${script.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `班味单口 · ${script.title}`,
          text: script.text.slice(0, 80) + '…',
          url,
        });
        return;
      }
    } catch {
      /* user cancelled — fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
      // Lightweight toast — no need to wire a global system for one button.
      const toast = document.createElement('div');
      toast.textContent = '✓ 链接已复制';
      toast.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:rgba(15,14,46,0.95);color:#fff;padding:10px 18px;border-radius:9999px;font-size:13px;z-index:9999;border:1px solid rgba(255,255,255,0.15);box-shadow:0 8px 24px rgba(0,0,0,0.5)';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 1800);
    } catch {
      /* clipboard blocked too — silent fail, share is optional */
    }
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  // ← prev bit · → next bit · Esc back to grid · Space replay (when done)
  // Only bind when the player view is mounted; auto-cleanup on unmount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when an input/textarea has focus (user is typing)
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); onNavigate('prev'); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNavigate('next'); }
      if (e.key === 'Escape')     { e.preventDefault(); onBack(); }
      if (e.key === ' ' && audioState === 'done') {
        e.preventDefault();
        handleManualPlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioState, script.id]);

  return (
    <motion.main
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      className="relative z-10 px-4 md:px-10 pb-12 max-w-3xl mx-auto"
    >
      {/* Transport bar: back · share · prev/next. Single row on desktop,
          wraps tight on mobile. Keyboard shortcuts mirror these (←/→/Esc). */}
      <div className="flex items-center justify-between mb-6 gap-2">
        <button
          onClick={onBack}
          className="text-xs tracking-wider text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}
          title="Esc"
        >
          ← 返回段子库
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onNavigate('prev')}
            className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            title="← 上一段"
            aria-label="上一段"
          >
            ← 上一段
          </button>
          <button
            onClick={handleShare}
            className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            title="分享"
          >
            🔗 分享
          </button>
          <button
            onClick={() => onNavigate('next')}
            className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            title="→ 下一段"
            aria-label="下一段"
          >
            下一段 →
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 text-[10px]">
        <span
          className="px-2 py-0.5 rounded-full font-bold tracking-wide"
          style={{
            color: tagCfg.color,
            background: `${tagCfg.color}18`,
            border: `1px solid ${tagCfg.color}40`,
          }}
        >
          {tagCfg.label}
        </span>
        <span className="text-white/45">{personaCfg.emoji} {personaCfg.label}</span>
        <span className="text-white/35 ml-auto">{script.durationSec}s</span>
      </div>

      <h2 className="text-2xl md:text-3xl font-black text-white mb-6 leading-tight">
        {script.title}
      </h2>

      {/* Avatar — placeholder static emoji disc. v0.7.x → AI image / Veo.
          Pulses on either real-audio or browser-TTS playback so the visual
          beat matches whichever channel is actually speaking. */}
      <div className="flex justify-center mb-6">
        <motion.div
          animate={
            (audioState === 'playing' || audioState === 'browser')
              ? { scale: [1, 1.04, 1] }
              : { scale: 1 }
          }
          transition={{
            duration: 0.8,
            repeat: (audioState === 'playing' || audioState === 'browser') ? Infinity : 0,
          }}
          className="w-40 h-40 rounded-full flex items-center justify-center text-7xl"
          style={{
            background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
            boxShadow: '0 0 40px rgba(255,85,136,0.45)',
          }}
        >
          {personaCfg.emoji}
        </motion.div>
      </div>

      {audioState === 'fetching' && (
        <div className="text-center text-white/55 mb-4">⏳ 正在生成真人音色…</div>
      )}
      {audioState === 'ready' && (
        <div className="text-center mb-4">
          <button
            onClick={handleManualPlay}
            className="px-5 py-2.5 rounded-xl text-sm font-bold tracking-wide"
            style={{
              background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
              color: '#fff',
              boxShadow: '0 6px 18px rgba(255,85,136,0.45)',
            }}
          >
            🔊 点击播放
          </button>
          <div className="text-[11px] text-white/50 mt-2">
            浏览器拦了自动播放,点一下就好
          </div>
        </div>
      )}
      {audioState === 'browser' && (
        <div className="text-center text-cyan-300/80 text-[11px] mb-4">
          🤖 真人音色配额用完了,临时用浏览器系统音替播
        </div>
      )}
      {audioState === 'done' && (
        <div className="flex justify-center gap-2 mb-4">
          <button
            onClick={handleManualPlay}
            className="px-4 py-2 rounded-xl text-xs font-semibold tracking-wide text-white/80 transition"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
            title="Space"
          >
            ↻ 再听一遍
          </button>
          <button
            onClick={() => onNavigate('next')}
            className="px-5 py-2 rounded-xl text-xs font-bold tracking-wide text-white shadow-lg"
            style={{
              background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
              boxShadow: '0 6px 18px rgba(255,85,136,0.4)',
            }}
            title="→"
          >
            下一段 →
          </button>
        </div>
      )}
      {audioState === 'failed' && (
        <div className="text-center text-amber-400 mb-4 text-sm">
          ⚠️ 音色和系统音都不可用 · 纯文字模式
        </div>
      )}

      {/* Subtitle bubble — reveal-as-you-listen during ANY active playback
          (server MP3 or browser TTS). On 'failed', 'ready', 'fetching', or
          'done' we just dump the full text so users can always read. */}
      <div
        className="rounded-2xl p-5 md:p-6 text-base md:text-lg leading-relaxed text-white/90 min-h-[140px]"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {(audioState === 'playing' || audioState === 'browser') ? (
          <>
            {visibleText}
            {revealedChars < script.text.length && (
              <span className="inline-block w-0.5 h-5 bg-white/70 ml-0.5 animate-pulse align-middle" />
            )}
          </>
        ) : (
          script.text
        )}
      </div>
    </motion.main>
  );
}
