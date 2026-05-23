/**
 * Weekly — v6.5.0 周报生成器
 *
 * 用户写 1 句关键事件 → 同时生成 4 种风格周报段落:
 *   🧩 阿里黑话版 — 颗粒度 / 抓手 / 闭环 / 拉齐
 *   🎭 PUA 版     — 老板向下"心力不够 / 格局打开"
 *   🎩 装腔版     — "复盘 / 反思 / 长期主义" 鸡汤
 *   💢 直球版     — 没装饰, "这周没干完, 因为甲方又改需求"
 *
 * 设计意图: 让用户看见"同一件事在 4 种公司话术下的扭曲", 极强对照
 * 共鸣 + 转发欲。复制 / 截图 PNG 任选, 朋友圈 / Slack / 钉钉一发就炸。
 *
 * 路由: /weekly
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import EventPill from '../components/EventPill';
import WeeklyShareCardModal from '../components/WeeklyShareCardModal';
import { getUserId } from '../utils/userId';
import {
  copyABCompareShareCardToClipboard,
  downloadABCompareShareCard,
  type ABCompareShareCardData,
} from '../utils/abCompareShareCard';

// Server /styles returns {id} (a catalog); /generate returns {style} (a per-result).
// 拆成两个接口对齐 actual server field names.
interface StyleSpec {
  id: 'alibaba' | 'pua' | 'posh' | 'direct';
  label: string;
  emoji: string;
  description: string;
}

interface StyleResult {
  style: 'alibaba' | 'pua' | 'posh' | 'direct';
  label: string;
  emoji: string;
  description: string;
  text: string;
  error: boolean;
  /** v6.5.2 — true when server boosted this style because user had liked it most. */
  boosted?: boolean;
}

interface TuningInfo {
  dominantStyle: 'alibaba' | 'pua' | 'posh' | 'direct';
  dominantLabel: string;
  totalLikes: number;
}

interface Preferences {
  counts: Record<'alibaba' | 'pua' | 'posh' | 'direct', number>;
  dominantStyle: 'alibaba' | 'pua' | 'posh' | 'direct' | null;
  dominantLabel: string | null;
  total: number;
}

const STYLE_COLOR: Record<string, { from: string; to: string; accent: string }> = {
  alibaba: { from: '#4ECDC4', to: '#4A90E2', accent: '#4ECDC4' }, // cyan/aqua — 黑话满天飞
  pua:     { from: '#FF4FA3', to: '#7C3AED', accent: '#FF4FA3' }, // 玫红 — PUA 的攻击性
  posh:    { from: '#FFD700', to: '#FFA947', accent: '#FFD700' }, // 金 — 装腔的"高级感"
  direct:  { from: '#FF6B35', to: '#FF3355', accent: '#FF6B35' }, // 橙红 — 直球的不爽
};

const SAMPLE_EVENTS = [
  '本周 OKR 没达成, 因为甲方需求改了 3 次',
  '我承诺的功能拖延了一周, 主要是设计稿没出来',
  '本周加班 4 天, 但产出还是被老板说不够 push',
  '团队搞了次复盘, 结果开成了 3 小时的吐槽大会',
];

export default function Weekly() {
  const navigate = useNavigate();
  const myId = useMemo(() => getUserId(), []);
  const [event, setEvent] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<StyleResult[] | null>(null);
  const [tuning, setTuning] = useState<TuningInfo | null>(null);
  const [copiedStyle, setCopiedStyle] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // v6.5.2 — self-tuning preferences. 自启动时从 server 拉, 点赞后实时更新
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [likedJustNow, setLikedJustNow] = useState<string | null>(null);
  // v6.6 — A/B 对比 modal state
  const [compareStyle, setCompareStyle] = useState<StyleResult | null>(null);
  const [compareData, setCompareData] = useState<{ boosted: string; plain: string; likes: number } | null>(null);
  const [comparing, setComparing] = useState(false);
  // v6.6.2 — A/B export msg + action
  const [abExportMsg, setAbExportMsg] = useState<string | null>(null);

  // Load style metadata once for the empty-state preview cards
  const [styleSpecs, setStyleSpecs] = useState<StyleSpec[] | null>(null);
  useEffect(() => {
    fetch('/api/weekly/styles')
      .then((r) => r.json() as Promise<{ styles: StyleSpec[] }>)
      .then((d) => setStyleSpecs(d.styles))
      .catch(() => setStyleSpecs([]));
    // v6.5.2 — fetch user prefs on mount, so the "你最爱的: X" chip shows
    // immediately on page load (before any generate).
    fetch('/api/weekly/preferences', { headers: { 'X-User-Id': myId } })
      .then((r) => r.json() as Promise<Preferences>)
      .then(setPrefs)
      .catch(() => setPrefs(null));
  }, [myId]);

  const canSubmit = event.trim().length >= 8 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    setResults(null);
    setTuning(null);
    try {
      const resp = await fetch('/api/weekly/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': myId },
        body: JSON.stringify({ event: event.trim() }),
      });
      const json = await resp.json() as {
        results?: StyleResult[]; error?: string; tuning?: TuningInfo | null;
      };
      if (!resp.ok || !json.results) {
        setErr(json.error ?? '生成失败 — 请稍后再试');
      } else {
        setResults(json.results);
        setTuning(json.tuning ?? null);
      }
    } catch {
      setErr('网络错误, 请重试');
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (style: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStyle(style);
      setTimeout(() => setCopiedStyle(null), 1800);
    } catch { /* silent */ }
  };

  /** v6.6 — open A/B compare: fetch boosted + plain versions of same
   *  style for current event, show side-by-side modal. */
  const openCompare = async (card: StyleResult) => {
    setCompareStyle(card);
    setCompareData(null);
    setComparing(true);
    try {
      const resp = await fetch('/api/weekly/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': myId },
        body: JSON.stringify({ event: event.trim(), style: card.style }),
      });
      const json = await resp.json() as {
        boosted?: { text: string };
        plain?: { text: string };
        likesForThisStyle?: number;
        error?: string;
      };
      if (json.boosted && json.plain) {
        setCompareData({
          boosted: json.boosted.text,
          plain: json.plain.text,
          likes: json.likesForThisStyle ?? 0,
        });
      } else {
        setCompareData({ boosted: '[对比生成失败]', plain: json.error ?? '[失败]', likes: 0 });
      }
    } catch {
      setCompareData({ boosted: '[网络错误]', plain: '[网络错误]', likes: 0 });
    } finally {
      setComparing(false);
    }
  };

  /** v6.5.2 — give one upvote to a style. Server bumps user counts;
   *  next generate will boost dominant style's temperature + prompt. */
  const likeStyle = async (style: 'alibaba' | 'pua' | 'posh' | 'direct') => {
    try {
      const resp = await fetch('/api/weekly/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': myId },
        body: JSON.stringify({ style }),
      });
      const json = await resp.json() as Preferences;
      setPrefs(json);
      setLikedJustNow(style);
      setTimeout(() => setLikedJustNow(null), 1800);
    } catch { /* silent */ }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 25% 18%, rgba(176,134,255,0.30) 0%, transparent 45%),' +
          'radial-gradient(ellipse at 78% 82%, rgba(255,215,0,0.20) 0%, transparent 50%),' +
          'radial-gradient(ellipse at 50% 50%, #2D1B69 0%, #1a0d35 60%, #0a0a1e 100%)',
      }}>
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <button onClick={() => navigate('/')}
          className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 首页
        </button>
        <EventPill stars={5}>📊 周报生成器 · v6.5</EventPill>
        {/* v6.6 — 我的偏好仪表盘入口 */}
        <button onClick={() => navigate('/weekly/me')}
          className="text-[11px] text-white/55 hover:text-white/95 transition px-2 py-1 rounded"
          style={{ background: 'rgba(255,215,0,0.10)', border: '1px solid rgba(255,215,0,0.30)' }}
          title="看我点过的赞 + 当前主导风格">
          📊 我的
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 md:px-6 pb-16">
        {/* ─── Input ─────────────────────────────────────────────────── */}
        <section className="mt-4">
          <h2 className="text-base font-black text-white/95 mb-1">
            写 1 句这周关键事件
          </h2>
          <p className="text-[11px] text-white/55 leading-relaxed mb-4">
            我们用 4 种公司话术帮你扭曲一下, 看哪个版本你老板最爱听。
            <br/>
            <span className="text-white/40">
              输入 8-300 字, 一句话就行 — LLM 会脑补具体细节。
            </span>
          </p>

          <div className="rounded-2xl p-4 mb-4"
            style={{
              background: 'rgba(176,134,255,0.06)',
              border: '1px solid rgba(176,134,255,0.30)',
            }}>
            <textarea
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder="例: 本周 OKR 没达成, 因为甲方需求改了 3 次"
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none resize-none leading-relaxed"
              style={{
                background: 'rgba(0,0,0,0.30)',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            />
            <div className="flex items-center justify-between mt-1">
              <div className="text-[10px] text-white/35">{event.length}/300</div>
              <div className="text-[10px] text-white/45">
                {SAMPLE_EVENTS.map((s, i) => (
                  <button key={i}
                    onClick={() => setEvent(s)}
                    className="hover:text-white/85 transition mr-2 underline decoration-dotted underline-offset-2">
                    例 {i + 1}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={submit}
              disabled={!canSubmit}
              className="w-full mt-3 py-3 rounded-xl text-sm font-black tracking-wide disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                color: '#1a0d35',
                boxShadow: '0 6px 22px rgba(255,215,0,0.32)',
              }}>
              {busy ? '✍️ 4 个风格同步生成中…' : '🚀 一键生成 4 种风格周报'}
            </button>
            {err && (
              <div className="text-center text-[11px] text-rose-300/85 mt-2">{err}</div>
            )}
            <div className="text-[10px] text-white/35 mt-2 text-center">
              每小时上限 5 份周报 · 单次 4 个并行 LLM 调用 · ~10 秒等待
            </div>
          </div>
        </section>

        {/* ─── Style preview (empty state) ──────────────────────────── */}
        {!results && styleSpecs && styleSpecs.length > 0 && (
          <section className="mt-2">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-[11px] uppercase tracking-[0.22em] text-white/55 font-bold">
                4 种风格预览
              </h3>
              {/* v6.5.2 — pre-result hint: 你最爱 X, 下次生成会更突出 */}
              {prefs && prefs.dominantStyle && (
                <span className="text-[10px] text-white/55">
                  你最爱: <span className="text-white/90 font-bold">{prefs.dominantLabel}</span>
                  <span className="text-white/35"> · 下次自动强化</span>
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {styleSpecs.map((s) => {
                const c = STYLE_COLOR[s.id];
                return (
                  <div key={s.id} className="rounded-xl p-3"
                    style={{
                      background: `linear-gradient(135deg, ${c.from}11, transparent)`,
                      border: `1px solid ${c.accent}44`,
                    }}>
                    <div className="text-lg mb-1">{s.emoji}</div>
                    <div className="text-sm font-bold text-white/95">{s.label}</div>
                    <div className="text-[10px] text-white/55 mt-1 leading-relaxed">{s.description}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Results ───────────────────────────────────────────────── */}
        {results && (
          <section className="mt-4">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-[11px] uppercase tracking-[0.22em] text-white/55 font-bold">
                ✨ 同一件事的 4 种说法
              </h3>
              {/* v6.5.2 — self-tuning status chip (only when boost happened) */}
              {tuning && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, rgba(255,215,0,0.18), rgba(255,79,163,0.16))',
                    border: '1px solid rgba(255,215,0,0.55)',
                    color: '#FFD58A',
                    letterSpacing: '0.16em',
                  }}>
                  ⚡ AI 在听你的 · {tuning.dominantLabel} 已强化
                </motion.span>
              )}
            </div>
            <div className="space-y-3">
              {results.map((r) => {
                const c = STYLE_COLOR[r.style];
                return (
                  <motion.div
                    key={r.style}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="rounded-2xl p-4 relative"
                    style={{
                      background: `linear-gradient(135deg, ${c.from}14, ${c.to}06)`,
                      border: `1px solid ${c.accent}55`,
                      boxShadow: `0 6px 22px ${c.accent}1c`,
                    }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{r.emoji}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black text-white/95">{r.label}</span>
                          {/* v6.5.2 — boosted badge if server tuned this style */}
                          {r.boosted && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                              style={{
                                background: 'linear-gradient(90deg, #FFD700, #FFA947)',
                                color: '#1a0d35',
                                letterSpacing: '0.12em',
                              }}>
                              ⚡ TUNED
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-white/45">{r.description}</div>
                      </div>
                      {/* v6.5.2 — like button (left) + copy (right) */}
                      <button
                        onClick={() => likeStyle(r.style)}
                        className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition active:scale-95"
                        style={{
                          background: likedJustNow === r.style
                            ? 'rgba(255,79,163,0.20)'
                            : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${likedJustNow === r.style ? '#FF4FA3' : 'rgba(255,255,255,0.15)'}`,
                          color: likedJustNow === r.style ? '#FF4FA3' : 'rgba(255,255,255,0.65)',
                        }}
                        title="给这种风格点个赞 — 后续生成会更偏向这风格"
                      >
                        {likedJustNow === r.style ? '❤ +1' : `❤ ${prefs?.counts[r.style] ?? 0}`}
                      </button>
                      <button
                        onClick={() => copyText(r.style, r.text)}
                        className="text-[11px] font-bold px-3 py-1.5 rounded-lg transition"
                        style={{
                          background: copiedStyle === r.style
                            ? 'rgba(74,222,128,0.16)'
                            : `${c.accent}22`,
                          border: `1px solid ${copiedStyle === r.style ? '#4ade80' : c.accent}55`,
                          color: copiedStyle === r.style ? '#4ade80' : c.accent,
                        }}>
                        {copiedStyle === r.style ? '✓ 已复制' : '📋 复制'}
                      </button>
                    </div>
                    <p className={`text-[13px] leading-relaxed whitespace-pre-wrap ${r.error ? 'text-rose-300/70 italic' : 'text-white/90'}`}>
                      {r.text}
                    </p>
                    {/* v6.6 — A/B 对比按钮 (仅 boosted 卡才有意义) */}
                    {r.boosted && !r.error && (
                      <button
                        onClick={() => openCompare(r)}
                        className="mt-3 w-full py-2 rounded-lg text-[11px] font-bold transition"
                        style={{
                          background: 'rgba(255,215,0,0.10)',
                          border: '1px dashed rgba(255,215,0,0.45)',
                          color: '#FFD58A',
                        }}>
                        🔍 看"你的偏好让 AI 变了多少" · A/B 对比
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* v6.5.1 — 4 卡拼成 PNG 分享卡 (一键发圈) */}
            <button
              onClick={() => setShareOpen(true)}
              className="w-full mt-5 py-3 rounded-xl text-sm font-black tracking-wide text-white"
              style={{
                background: 'linear-gradient(135deg, #FF5588, #7C3AED)',
                boxShadow: '0 6px 22px rgba(124,58,237,0.36)',
              }}>
              📤 4 卡拼成分享图 PNG · 一键发圈
            </button>

            <div className="text-center text-[10px] text-white/35 mt-4 leading-relaxed">
              喜欢哪个? 直接发给老板 · 也可以截图发朋友圈 ·
              <button onClick={() => { setResults(null); setEvent(''); }}
                className="text-white/70 hover:text-white/95 ml-1 underline decoration-dotted underline-offset-2">
                ↻ 换个事件重写
              </button>
            </div>
          </section>
        )}

        {/* ─── Loading state ────────────────────────────────────────── */}
        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mt-6 grid grid-cols-2 gap-3">
              {(['alibaba','pua','posh','direct'] as const).map((s) => (
                <div key={s} className="rounded-xl p-3 h-32 flex flex-col justify-center items-center"
                  style={{
                    background: `linear-gradient(135deg, ${STYLE_COLOR[s].from}11, transparent)`,
                    border: `1px solid ${STYLE_COLOR[s].accent}33`,
                  }}>
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="text-2xl">
                    ✍️
                  </motion.div>
                  <div className="text-[10px] text-white/55 mt-2 tracking-widest">
                    GENERATING
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* v6.5.1 — 4 卡 PNG 分享卡 modal. 复用 fortuneShareCard 模式. */}
      <WeeklyShareCardModal
        open={shareOpen}
        data={results ? { event, results: results.map((r) => ({
          style: r.style, label: r.label, emoji: r.emoji, text: r.text,
        })) } : null}
        onClose={() => setShareOpen(false)}
      />

      {/* v6.6 — A/B 对比 modal */}
      <AnimatePresence>
        {compareStyle && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4"
            style={{ background: 'rgba(2,2,12,0.78)', backdropFilter: 'blur(8px)' }}
            onClick={() => setCompareStyle(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-lg rounded-3xl p-5 md:p-6 max-h-[92vh] overflow-y-auto"
              style={{
                background: 'linear-gradient(180deg, #15122e, #0d0b25)',
                border: '1px solid rgba(255,215,0,0.42)',
                boxShadow: '0 24px 72px rgba(0,0,0,0.6)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-base font-black tracking-tight text-white/95">
                  🔍 A/B 对比 · {compareStyle.emoji} {compareStyle.label}
                </h3>
                <button onClick={() => setCompareStyle(null)}
                  className="text-xs text-white/55 hover:text-white/95 transition px-2 py-1 rounded">
                  ✕
                </button>
              </div>
              <p className="text-[11px] text-white/55 leading-relaxed mb-4">
                左: 中性(没有 boost) · 右: 用你的 {compareData?.likes ?? prefs?.counts[compareStyle.style] ?? 0} 次点赞 boost 后的 AI 输出。<br/>
                <span className="text-white/40">同一事件 · 同一 prompt 骨架 · 只差温度 + 一句"极致化"指令 = 你的影响。</span>
              </p>
              {comparing ? (
                <div className="text-center py-12 text-white/55">
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity }}
                    className="text-3xl mb-2">🔄</motion.div>
                  <div className="text-xs">并行生成 boosted + plain 两版…</div>
                </div>
              ) : compareData ? (
                <div className="space-y-3">
                  <div className="rounded-xl p-3"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-white/45 mb-2 font-bold">
                      🌚 PLAIN (temp 0.85, 无强化)
                    </div>
                    <p className="text-[13px] leading-relaxed text-white/85 whitespace-pre-wrap">{compareData.plain}</p>
                  </div>
                  <div className="rounded-xl p-3"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,215,0,0.10), rgba(255,79,163,0.06))',
                      border: '1px solid rgba(255,215,0,0.55)',
                    }}>
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-2 font-bold" style={{ color: '#FFD58A' }}>
                      ⚡ BOOSTED (temp 1.0 + 极致化 prompt)
                    </div>
                    <p className="text-[13px] leading-relaxed text-white/95 whitespace-pre-wrap">{compareData.boosted}</p>
                  </div>
                  {/* v6.6.2 — 导出对比 PNG 按钮 */}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={async () => {
                        if (!compareStyle || !compareData) return;
                        const data: ABCompareShareCardData = {
                          event: event.trim(),
                          style: compareStyle.style,
                          label: compareStyle.label,
                          emoji: compareStyle.emoji,
                          likes: compareData.likes,
                          plainText: compareData.plain,
                          boostedText: compareData.boosted,
                        };
                        const ok = await copyABCompareShareCardToClipboard(data);
                        setAbExportMsg(ok ? '✓ 对比图已复制到剪贴板' : '复制失败 — 试试下载');
                        setTimeout(() => setAbExportMsg(null), 2400);
                      }}
                      className="flex-1 py-2 rounded-lg text-[11px] font-bold transition"
                      style={{
                        background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                        color: '#1a0d35',
                      }}>
                      📋 复制对比图
                    </button>
                    <button
                      onClick={async () => {
                        if (!compareStyle || !compareData) return;
                        const data: ABCompareShareCardData = {
                          event: event.trim(),
                          style: compareStyle.style,
                          label: compareStyle.label,
                          emoji: compareStyle.emoji,
                          likes: compareData.likes,
                          plainText: compareData.plain,
                          boostedText: compareData.boosted,
                        };
                        try {
                          await downloadABCompareShareCard(data);
                          setAbExportMsg('✓ 已下载');
                        } catch {
                          setAbExportMsg('下载失败');
                        }
                        setTimeout(() => setAbExportMsg(null), 2400);
                      }}
                      className="flex-1 py-2 rounded-lg text-[11px] font-bold transition"
                      style={{
                        background: 'rgba(176,134,255,0.16)',
                        border: '1px solid rgba(176,134,255,0.45)',
                        color: '#b086ff',
                      }}>
                      📥 下载对比图 PNG
                    </button>
                  </div>
                  {abExportMsg && (
                    <div className="text-center text-[11px] text-white/65 mt-2">{abExportMsg}</div>
                  )}
                  <div className="text-center text-[10px] text-white/45 mt-2">
                    这就是 self-tuning · 截图发圈 #AI在听我的
                  </div>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
