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

interface StyleSpec {
  id: 'alibaba' | 'pua' | 'posh' | 'direct';
  label: string;
  emoji: string;
  description: string;
}

interface StyleResult extends StyleSpec {
  text: string;
  error: boolean;
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
  const [event, setEvent] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<StyleResult[] | null>(null);
  const [copiedStyle, setCopiedStyle] = useState<string | null>(null);

  // Load style metadata once for the empty-state preview cards
  const [styleSpecs, setStyleSpecs] = useState<StyleSpec[] | null>(null);
  useEffect(() => {
    fetch('/api/weekly/styles')
      .then((r) => r.json() as Promise<{ styles: StyleSpec[] }>)
      .then((d) => setStyleSpecs(d.styles))
      .catch(() => setStyleSpecs([]));
  }, []);

  const canSubmit = event.trim().length >= 8 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    setResults(null);
    try {
      const resp = await fetch('/api/weekly/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: event.trim() }),
      });
      const json = await resp.json() as { results?: StyleResult[]; error?: string };
      if (!resp.ok || !json.results) {
        setErr(json.error ?? '生成失败 — 请稍后再试');
      } else {
        setResults(json.results);
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
        <span className="w-12" />
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
            <h3 className="text-[11px] uppercase tracking-[0.22em] text-white/55 mb-2 font-bold">
              4 种风格预览
            </h3>
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
            <h3 className="text-[11px] uppercase tracking-[0.22em] text-white/55 mb-3 font-bold">
              ✨ 同一件事的 4 种说法
            </h3>
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
                        <div className="text-sm font-black text-white/95">{r.label}</div>
                        <div className="text-[10px] text-white/45">{r.description}</div>
                      </div>
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
                  </motion.div>
                );
              })}
            </div>

            <div className="text-center text-[10px] text-white/35 mt-6 leading-relaxed">
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
    </div>
  );
}
