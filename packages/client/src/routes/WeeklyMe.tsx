/**
 * WeeklyMe — v6.6 周报风格偏好可视化页 (route /weekly/me).
 *
 * 给用户一个"我的偏好仪表盘", 4 个风格 like 计数 + dominant 状态 + 总计。
 * 让 self-tuning 透明 — 用户能看到"AI 为什么这样对我"。
 *
 * 不是个 PR Hunt 必备页, 是给已经入坑的用户做沉浸感 + 数据自恋的。
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getUserId } from '../utils/userId';
import EventPill from '../components/EventPill';

interface Prefs {
  counts: { alibaba: number; pua: number; posh: number; direct: number };
  dominantStyle: 'alibaba' | 'pua' | 'posh' | 'direct' | null;
  dominantLabel: string | null;
  total: number;
}

const STYLE_META = {
  alibaba: { label: '阿里黑话版', emoji: '🧩', color: '#4ECDC4', byline: '颗粒度 / 拉齐 / 闭环' },
  pua:     { label: 'PUA 版',     emoji: '🎭', color: '#FF4FA3', byline: '心力 / 格局 / Owner' },
  posh:    { label: '装腔版',     emoji: '🎩', color: '#FFD700', byline: '复盘 / 长期主义 / 反脆弱' },
  direct:  { label: '直球版',     emoji: '💢', color: '#FF6B35', byline: '没装饰 / 真情绪 / 真吐槽' },
} as const;

export default function WeeklyMe() {
  const navigate = useNavigate();
  const myId = useMemo(() => getUserId(), []);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/weekly/preferences', { headers: { 'X-User-Id': myId } })
      .then((r) => r.json() as Promise<Prefs>)
      .then(setPrefs)
      .catch(() => setErr('加载偏好失败'));
  }, [myId]);

  const max = prefs ? Math.max(prefs.counts.alibaba, prefs.counts.pua, prefs.counts.posh, prefs.counts.direct, 1) : 1;

  return (
    <div className="relative min-h-screen overflow-x-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 25% 18%, rgba(176,134,255,0.30) 0%, transparent 45%),' +
          'radial-gradient(ellipse at 78% 82%, rgba(255,215,0,0.20) 0%, transparent 50%),' +
          'radial-gradient(ellipse at 50% 50%, #2D1B69 0%, #1a0d35 60%, #0a0a1e 100%)',
      }}>
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <button onClick={() => navigate('/weekly')}
          className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 生成周报
        </button>
        <EventPill stars={4} subtle>📊 我的偏好</EventPill>
        <span className="w-12" />
      </header>

      <main className="max-w-md mx-auto px-4 md:px-6 pb-16">
        {err && (
          <div className="text-center py-16 text-rose-300/85">⚠️ {err}</div>
        )}
        {!prefs && !err && (
          <div className="text-center py-16 text-white/55 text-sm">⏳ 加载中…</div>
        )}
        {prefs && prefs.total === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4 opacity-60">📊</div>
            <h2 className="text-base font-black text-white/90 mb-2">还没给任何风格点赞</h2>
            <p className="text-xs text-white/55 leading-relaxed max-w-xs mx-auto">
              先去生成几份周报, 给最爱的风格点个 ❤,
              我们就会记住你的偏好, 后续 AI 会更突出那种风格。
            </p>
            <button onClick={() => navigate('/weekly')}
              className="mt-6 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide"
              style={{
                background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                color: '#1a0d35',
                boxShadow: '0 6px 18px rgba(255,215,0,0.32)',
              }}>
              📊 生成今天的周报
            </button>
          </div>
        )}
        {prefs && prefs.total > 0 && (
          <>
            {/* Summary strip */}
            <div className="rounded-2xl p-4 mb-5 mt-3"
              style={{
                background: 'linear-gradient(135deg, rgba(255,215,0,0.10), rgba(176,134,255,0.04))',
                border: '1px solid rgba(255,215,0,0.42)',
              }}>
              <div className="text-[10px] tracking-[0.22em] uppercase mb-1.5" style={{ color: '#FFD58A' }}>
                ✦ 总累积点赞
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-3xl font-black text-white tabular-nums"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                  {prefs.total}
                </div>
                <div className="text-xs text-white/65">
                  {prefs.dominantLabel
                    ? <>主导风格 · <span className="font-bold text-white/95">{prefs.dominantLabel}</span> 已 armed ⚡</>
                    : <>还需 {Math.max(0, 3 - prefs.total)} 次点赞触发 boost</>}
                </div>
              </div>
            </div>

            {/* 4 个 style 横向 bar */}
            <h3 className="text-[11px] uppercase tracking-[0.22em] text-white/55 mb-3 font-bold">
              4 风格点赞分布
            </h3>
            <div className="space-y-3">
              {(['alibaba','pua','posh','direct'] as const).map((s) => {
                const meta = STYLE_META[s];
                const n = prefs.counts[s];
                const pct = (n / max) * 100;
                const isDom = prefs.dominantStyle === s;
                return (
                  <div key={s} className="rounded-xl p-3"
                    style={{
                      background: isDom
                        ? `linear-gradient(135deg, ${meta.color}1f, transparent)`
                        : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isDom ? `${meta.color}88` : 'rgba(255,255,255,0.10)'}`,
                    }}>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-lg">{meta.emoji}</span>
                      <span className="text-sm font-bold text-white/95">{meta.label}</span>
                      {isDom && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                          style={{
                            background: 'linear-gradient(90deg, #FFD700, #FFA947)',
                            color: '#1a0d35', letterSpacing: '0.12em',
                          }}>
                          ⚡ DOMINANT
                        </span>
                      )}
                      <span className="ml-auto text-sm font-black tabular-nums" style={{ color: isDom ? meta.color : 'rgba(255,255,255,0.65)' }}>
                        {n}
                      </span>
                    </div>
                    <div className="text-[10px] text-white/45 mb-2">{meta.byline}</div>
                    <div className="h-2 rounded-full overflow-hidden"
                      style={{ background: 'rgba(0,0,0,0.28)' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 0.15, duration: 0.7, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{ background: meta.color }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-center text-[10px] text-white/40 mt-6 leading-relaxed">
              共 {prefs.total} 次点赞 · 主导风格阈值 ≥ 3<br/>
              清空偏好? <button onClick={() => navigate('/settings')} className="text-white/70 hover:text-white/95 underline decoration-dotted underline-offset-2">去 ⚙️ Settings</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
