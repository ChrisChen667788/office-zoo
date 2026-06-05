/**
 * RoastBooth — v6.55 #4 — 班味单口「专属吐槽」.
 *
 * Self-contained vent box: the user types what's eating them today, the AI
 * 嘴替 fires back a few 阴阳/自嘲 one-liners, and each can be TTS-played out loud
 * for pure emotional payoff. Deliberately isolated from the big Talkshow audio
 * pipeline — owns its own <Audio>, calls /api/talkshow/roast + /api/talkshow/tts.
 */
import { useRef, useState } from 'react';

const QUICK_TOPICS = ['老板天天画饼', '又通知周末加班', '背锅侠的一天', 'PUA 式管理', '调休陷阱'];

export default function RoastBooth() {
  const [topic, setTopic] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const generate = async (t?: string) => {
    const q = (t ?? topic).trim();
    if (q.length < 2) return;
    if (t) setTopic(t);
    setStatus('loading');
    setLines([]);
    setErrMsg('');
    try {
      const r = await fetch('/api/talkshow/roast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: q }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus('error');
        setErrMsg(d.message || d.error || '生成失败,换个说法再试');
        return;
      }
      setLines(Array.isArray(d.lines) ? d.lines : []);
      setStatus('idle');
    } catch {
      setStatus('error');
      setErrMsg('网络开小差了,再试一下');
    }
  };

  const play = async (text: string, idx: number) => {
    try {
      audioRef.current?.pause();
      setPlayingIdx(idx);
      const r = await fetch('/api/talkshow/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) { setPlayingIdx(null); return; }
      const url = URL.createObjectURL(await r.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      const cleanup = () => { setPlayingIdx(null); URL.revokeObjectURL(url); };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
    } catch {
      setPlayingIdx(null);
    }
  };

  return (
    <div
      className="rounded-2xl p-5 mb-6"
      style={{
        background: 'linear-gradient(135deg, rgba(255,79,163,0.10), rgba(124,58,237,0.08))',
        border: '1px solid rgba(255,79,163,0.28)',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🎤</span>
        <span className="text-sm font-black text-white/95 tracking-tight">专属吐槽 · AI 嘴替替你出气</span>
      </div>
      <div className="text-[11px] text-white/50 mb-3">说说今天哪儿不爽了,AI 当场给你来几句解气金句(还能念出来)</div>

      <div className="flex gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') generate(); }}
          maxLength={200}
          placeholder="例:老板让我用爱发电还嫌我不够狼性"
          className="flex-1 min-w-0 px-3 py-2.5 rounded-xl text-[13px] text-white outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}
        />
        <button
          type="button"
          onClick={() => generate()}
          disabled={status === 'loading' || topic.trim().length < 2}
          className="px-4 py-2.5 rounded-xl text-[13px] font-black whitespace-nowrap"
          style={{
            background: 'linear-gradient(135deg, #FF4FA3 0%, #7c3aed 100%)',
            color: '#fff',
            opacity: status === 'loading' || topic.trim().length < 2 ? 0.5 : 1,
            cursor: status === 'loading' || topic.trim().length < 2 ? 'default' : 'pointer',
          }}
        >
          {status === 'loading' ? '憋大招…' : '来段吐槽'}
        </button>
      </div>

      {/* Quick-pick chips */}
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {QUICK_TOPICS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => generate(q)}
            disabled={status === 'loading'}
            className="text-[11px] px-2.5 py-1 rounded-full text-white/70 transition hover:text-white"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            {q}
          </button>
        ))}
      </div>

      {status === 'error' && (
        <div className="mt-3 text-[12px] text-rose-300">⚠ {errMsg}</div>
      )}

      {lines.length > 0 && (
        <div className="mt-4 space-y-2">
          {lines.map((line, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <span className="flex-1 text-[13.5px] text-white/90 leading-snug">{line}</span>
              <button
                type="button"
                onClick={() => play(line, i)}
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90"
                style={{
                  background: playingIdx === i ? 'rgba(255,79,163,0.25)' : 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,79,163,0.4)',
                }}
                title="念出来"
              >
                {playingIdx === i ? '🔊' : '▶️'}
              </button>
            </div>
          ))}
          <div className="text-[10px] text-white/35 text-center pt-1">🎧 点 ▶️ 让 AI 念给你听 · 解气就完事了</div>
        </div>
      )}
    </div>
  );
}
