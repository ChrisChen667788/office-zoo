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
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  primeAudio,
  playTtsFromUrl,
  stopTts,
} from '../utils/audioUnlock';

interface ScriptSummary {
  id: string;
  title: string;
  tag: string;
  persona: string;
  durationSec: number;
}

interface ScriptFull extends ScriptSummary {
  text: string;
}

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

const PERSONA_LABELS: Record<string, { emoji: string; label: string }> = {
  shaonv:   { emoji: '👧', label: '少女音' },
  yujie:    { emoji: '💃', label: '御姐音' },
  qingse:   { emoji: '🧑', label: '青涩男' },
  jingying: { emoji: '🧔', label: '精英男' },
  badao:    { emoji: '👨‍💼', label: '霸道男' },
  qingnian: { emoji: '👤', label: '青年音' },
};

export default function Talkshow() {
  const navigate = useNavigate();
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  /** When non-null, we're in player view for this script. */
  const [active, setActive] = useState<ScriptFull | null>(null);

  // Fetch list once on mount.
  useEffect(() => {
    fetch('/api/talkshow/list')
      .then((r) => r.json())
      .then((d) => setScripts(d.scripts ?? []))
      .catch((e) => setLoadErr(e.message ?? '加载失败'));
    return () => stopTts();
  }, []);

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
          <PlayerView key="player" script={active} onBack={() => setActive(null)} />
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
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="text-left rounded-2xl p-4 transition flex flex-col gap-3 min-h-[140px]"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
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
        <span className="text-white/35 tabular-nums">{script.durationSec}s</span>
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

function PlayerView({
  script,
  onBack,
}: {
  script: ScriptFull;
  onBack: () => void;
}) {
  const [revealedChars, setRevealedChars] = useState(0);
  const [audioState, setAudioState] = useState<'loading' | 'playing' | 'done' | 'failed'>('loading');
  const startedRef = useRef(false);
  const personaCfg = PERSONA_LABELS[script.persona] ?? { emoji: '🎤', label: script.persona };
  const tagCfg = TAG_LABELS[script.tag] ?? { label: script.tag, color: '#888' };

  // Kick off TTS fetch + playback once on mount. Built into the gesture
  // chain via primeAudio() in the parent so Safari lets it play.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    let audioUrl: string | null = null;
    (async () => {
      try {
        const resp = await fetch('/api/talkshow/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptId: script.id }),
        });
        if (!resp.ok) throw new Error(`tts ${resp.status}`);
        const blob = await resp.blob();
        if (cancelled) return;
        audioUrl = URL.createObjectURL(blob);
        const ok = await playTtsFromUrl(audioUrl);
        if (!cancelled) setAudioState(ok ? 'playing' : 'failed');
      } catch {
        if (!cancelled) setAudioState('failed');
      }
    })();
    return () => {
      cancelled = true;
      stopTts();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [script.id]);

  // Cheap subtitle reveal: ~7 chars/sec while the audio is playing. Not
  // word-accurate, but good enough that captions feel synced on first watch.
  // v0.7.1 will swap this for a real audio analyser.
  useEffect(() => {
    if (audioState !== 'playing') return;
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

  return (
    <motion.main
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      className="relative z-10 px-4 md:px-10 pb-12 max-w-3xl mx-auto"
    >
      <button
        onClick={onBack}
        className="text-xs tracking-wider text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded mb-6"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        ← 返回段子库
      </button>

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

      {/* Avatar — placeholder static emoji disc. v0.7.1 → AI image, v0.7.2 → Veo. */}
      <div className="flex justify-center mb-6">
        <motion.div
          animate={
            audioState === 'playing'
              ? { scale: [1, 1.04, 1] }
              : { scale: 1 }
          }
          transition={{ duration: 0.8, repeat: audioState === 'playing' ? Infinity : 0 }}
          className="w-40 h-40 rounded-full flex items-center justify-center text-7xl"
          style={{
            background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
            boxShadow: '0 0 40px rgba(255,85,136,0.45)',
          }}
        >
          {personaCfg.emoji}
        </motion.div>
      </div>

      {audioState === 'loading' && (
        <div className="text-center text-white/55 mb-4">⏳ 正在生成真人音色…</div>
      )}
      {audioState === 'failed' && (
        <div className="text-center text-amber-400 mb-4">
          ⚠️ TTS 暂时不可用,纯文字模式
        </div>
      )}

      {/* Subtitle bubble */}
      <div
        className="rounded-2xl p-5 md:p-6 text-base md:text-lg leading-relaxed text-white/90 min-h-[140px]"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {visibleText}
        {audioState === 'playing' && revealedChars < script.text.length && (
          <span className="inline-block w-0.5 h-5 bg-white/70 ml-0.5 animate-pulse align-middle" />
        )}
        {audioState === 'failed' && script.text}
      </div>
    </motion.main>
  );
}
