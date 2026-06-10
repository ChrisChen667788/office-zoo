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
import TrendShareCardModal from '../components/TrendShareCardModal';
import { navIcons, Icon } from '../constants/icons';

type Style = 'alibaba' | 'pua' | 'posh' | 'direct';

interface LikeEvent {
  style: Style;
  ts: number;
}

interface Prefs {
  counts: { alibaba: number; pua: number; posh: number; direct: number };
  dominantStyle: Style | null;
  dominantLabel: string | null;
  total: number;
  events: LikeEvent[]; // v6.6.1 新加
  recent?: {
    counts: { alibaba: number; pua: number; posh: number; direct: number };
    dominantStyle: Style | null;
    dominantLabel: string | null;
    total: number;
    windowDays: number;
    differsFromAllTime: boolean;
  } | null;
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
  const [shareTrendOpen, setShareTrendOpen] = useState(false);

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
        <EventPill stars={4} subtle><Icon src={navIcons.weekly} emoji="📊" size={15} alt="" /> 我的偏好</EventPill>
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
            {/* Summary strip — all-time + (v6.6.2) recent 30d */}
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
              {/* v6.6.2 — 近 30 天最爱榜. 当跟 all-time dominant 不同时
                  特别高亮 "你最近变了" 信号. */}
              {prefs.recent && prefs.recent.total > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="text-[10px] tracking-[0.22em] uppercase" style={{ color: '#9be6ff' }}>
                      ✦ 近 30 天
                    </div>
                    {prefs.recent.differsFromAllTime && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                        style={{
                          background: 'linear-gradient(90deg, #FF4FA3, #7C3AED)',
                          color: '#fff', letterSpacing: '0.12em',
                        }}>
                        🔄 你最近变了
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black text-white tabular-nums">
                      {prefs.recent.total}
                    </span>
                    <span className="text-xs text-white/65">
                      次 ·
                      {prefs.recent.dominantLabel
                        ? <> 最近最爱: <span className="font-bold text-white/95">{prefs.recent.dominantLabel}</span></>
                        : <> 平局, 没有近期主导</>}
                    </span>
                  </div>
                </div>
              )}
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

            {/* v6.6.1 — 时间趋势 (按 calendar day 聚合累计折线) */}
            <TrendChart events={prefs.events} />

            {/* v6.6.2 — 导出 PNG 分享卡 */}
            {prefs.total > 0 && (
              <button
                onClick={() => setShareTrendOpen(true)}
                className="w-full mt-4 py-3 rounded-xl text-sm font-black tracking-wide"
                style={{
                  background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                  color: '#1a0d35',
                  boxShadow: '0 6px 22px rgba(255,215,0,0.32)',
                }}>
                📤 把我的偏好曲线导出 PNG · 一键发圈
              </button>
            )}

            <div className="text-center text-[10px] text-white/40 mt-6 leading-relaxed">
              共 {prefs.total} 次点赞 · 主导风格阈值 ≥ 3<br/>
              清空偏好? <button onClick={() => navigate('/settings')} className="text-white/70 hover:text-white/95 underline decoration-dotted underline-offset-2">去 ⚙️ Settings</button>
            </div>
          </>
        )}
      </main>

      {/* v6.6.2 — 偏好曲线 PNG 分享 modal */}
      <TrendShareCardModal
        open={shareTrendOpen}
        data={prefs && prefs.total > 0 ? {
          total: prefs.total,
          counts: prefs.counts,
          dominantStyle: prefs.dominantStyle,
          dominantLabel: prefs.dominantLabel,
          events: prefs.events,
          recent: prefs.recent,
        } : null}
        onClose={() => setShareTrendOpen(false)}
      />
    </div>
  );
}

/* ─── v6.6.1 趋势图组件 (SVG cumulative line chart) ─────────────
 * 设计:
 *   - 按 calendar day (UTC) 把事件 bucket 一下
 *   - 算每天每个 style 的累计 likes (running total over time)
 *   - SVG 4 条彩色折线 overlay, 共享 x/y 轴
 *   - 自动填充: 没事件的日期保持前一日累计值
 *   - 单点情况退化成一个 dot, 视觉上仍可读
 *   - 空 events (migrated 用户) → 友好提示文案
 * 不引第三方图表库 — 50 行 SVG + Map 就够。 */

const STYLE_LINE_COLOR: Record<Style, string> = {
  alibaba: '#4ECDC4',
  pua:     '#FF4FA3',
  posh:    '#FFD700',
  direct:  '#FF6B35',
};

function dayKey(ts: number): string {
  // UTC day bucket — 跟服务端时间一致, 用户横跨时区也不会出现"跳天"
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function shortDate(k: string): string {
  // "2026-05-23" → "5/23" (轴标签紧凑)
  const [, m, d] = k.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function TrendChart({ events }: { events: LikeEvent[] }) {
  // v6.6.2 — hover-tooltip state. Declared before any conditional
  // return so the hooks order is stable across renders.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // 空状态: migrated 用户 (counts > 0 但 events = []) 或新用户
  if (events.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="text-[11px] uppercase tracking-[0.22em] text-white/55 mb-2 font-bold">
          📈 时间趋势
        </h3>
        <div className="text-center py-6 text-white/45 text-xs rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)' }}>
          📭 还没有时间戳记录的点赞 — v6.6.1 起开始记录, 多点几次就会有折线
        </div>
      </div>
    );
  }

  // Bucket by day. 同一天多次点赞累加。
  // dayBuckets: Map<dayKey, {alibaba, pua, posh, direct}>
  const dayBuckets = new Map<string, Record<Style, number>>();
  for (const ev of events) {
    const k = dayKey(ev.ts);
    if (!dayBuckets.has(k)) {
      dayBuckets.set(k, { alibaba: 0, pua: 0, posh: 0, direct: 0 });
    }
    dayBuckets.get(k)![ev.style] += 1;
  }
  // Sort days chronologically, accumulate running totals
  const days = [...dayBuckets.keys()].sort();
  const running: Record<Style, number> = { alibaba: 0, pua: 0, posh: 0, direct: 0 };
  const series: Array<{ day: string; counts: Record<Style, number> }> = [];
  for (const d of days) {
    const inc = dayBuckets.get(d)!;
    running.alibaba += inc.alibaba;
    running.pua     += inc.pua;
    running.posh    += inc.posh;
    running.direct  += inc.direct;
    series.push({ day: d, counts: { ...running } });
  }

  // SVG geometry
  const W = 460, H = 180;
  const padL = 32, padR = 12, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = series.length;
  const maxY = Math.max(
    1,
    ...series.map((s) => Math.max(s.counts.alibaba, s.counts.pua, s.counts.posh, s.counts.direct)),
  );
  // y ticks (3 levels: 0 / maxY/2 / maxY)
  const yTicks = [0, Math.ceil(maxY / 2), maxY];

  // x coord per index. Single point centers; otherwise even spacing.
  const xAt = (i: number) => n === 1 ? padL + innerW / 2 : padL + (i * innerW) / (n - 1);
  const yAt = (v: number) => padT + innerH - (v / maxY) * innerH;

  // Build polyline path strings per style
  const linePath = (style: Style): string => series.map((s, i) =>
    `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(s.counts[style]).toFixed(1)}`,
  ).join(' ');

  // X-axis tick labels: first / middle / last day
  const xLabels: Array<{ x: number; text: string }> = [];
  if (n === 1) {
    xLabels.push({ x: xAt(0), text: shortDate(series[0].day) });
  } else {
    xLabels.push({ x: xAt(0), text: shortDate(series[0].day) });
    if (n >= 3) xLabels.push({ x: xAt(Math.floor(n / 2)), text: shortDate(series[Math.floor(n / 2)].day) });
    xLabels.push({ x: xAt(n - 1), text: shortDate(series[n - 1].day) });
  }

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[11px] uppercase tracking-[0.22em] text-white/55 font-bold">
          📈 时间趋势 · 累计
        </h3>
        <span className="text-[10px] text-white/40">
          {n} 天 · 共 {events.length} 次点赞
        </span>
      </div>
      <div className="rounded-xl p-3"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%" height={H}
          style={{ display: 'block' }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* y-axis ticks + grid */}
          {yTicks.map((v) => {
            const y = yAt(v);
            return (
              <g key={v}>
                <line x1={padL} y1={y} x2={W - padR} y2={y}
                  stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="2 4" />
                <text x={padL - 6} y={y + 4} textAnchor="end"
                  fontSize="10" fill="rgba(255,255,255,0.55)"
                  fontFamily="ui-monospace, monospace">
                  {v}
                </text>
              </g>
            );
          })}
          {/* x-axis labels */}
          {xLabels.map((l, i) => (
            <text key={i} x={l.x} y={H - 8} textAnchor="middle"
              fontSize="10" fill="rgba(255,255,255,0.45)"
              fontFamily="ui-monospace, monospace">
              {l.text}
            </text>
          ))}
          {/* 4 lines, alpha-low for non-dominant readability */}
          {(['alibaba', 'pua', 'posh', 'direct'] as Style[]).map((s) => (
            <g key={s}>
              <path d={linePath(s)} fill="none"
                stroke={STYLE_LINE_COLOR[s]} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" />
              {/* End-of-line dot to anchor the eye */}
              {n >= 1 && (
                <circle cx={xAt(n - 1)} cy={yAt(series[n - 1].counts[s])}
                  r="3.5" fill={STYLE_LINE_COLOR[s]} />
              )}
            </g>
          ))}

          {/* v6.6.2 — hover overlay. Invisible rects per data point capture
              pointer, set hoverIdx → snap-to-nearest-day tooltip. Vertical
              guide line + per-style dots at hovered x. */}
          {hoverIdx !== null && (
            <line x1={xAt(hoverIdx)} y1={padT} x2={xAt(hoverIdx)} y2={H - padB}
              stroke="rgba(255,215,0,0.45)" strokeWidth="1" strokeDasharray="3 3" />
          )}
          {hoverIdx !== null && (['alibaba','pua','posh','direct'] as Style[]).map((s) => (
            <circle key={s}
              cx={xAt(hoverIdx)} cy={yAt(series[hoverIdx].counts[s])}
              r="4.5" fill={STYLE_LINE_COLOR[s]}
              stroke="#1a0d35" strokeWidth="1.5" />
          ))}
          {/* Hit zones — invisible larger rects make hover ergonomic on tiny
              x spacing. Edge zones get more width to ease pointer landing. */}
          {series.map((_, i) => {
            const cx = xAt(i);
            const half = n === 1 ? innerW / 2 : innerW / (n - 1) / 2;
            const rx = Math.max(half, 8); // min 8px hit width for tiny days
            return (
              <rect key={i}
                x={cx - rx} y={padT} width={rx * 2} height={innerH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx((cur) => cur === i ? null : cur)}
                style={{ cursor: 'crosshair' }} />
            );
          })}
        </svg>

        {/* v6.6.2 — tooltip box (outside SVG for better CSS / line-height) */}
        {hoverIdx !== null && (
          <div className="mt-2 rounded-lg px-3 py-2 inline-block"
            style={{
              background: 'rgba(15,10,35,0.95)',
              border: '1px solid rgba(255,215,0,0.45)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            }}>
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-[11px] font-black text-white/95">
                {series[hoverIdx].day}
              </span>
              <span className="text-[9px] text-white/45 uppercase tracking-[0.18em]">
                {hoverIdx === 0 ? '起点' : `第 ${hoverIdx + 1} 天`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {(['alibaba','pua','posh','direct'] as Style[]).map((s) => {
                const dayInc = dayBuckets.get(series[hoverIdx].day)?.[s] ?? 0;
                const cum = series[hoverIdx].counts[s];
                return (
                  <div key={s} className="flex items-baseline gap-1.5 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: STYLE_LINE_COLOR[s] }} />
                    <span style={{ color: STYLE_LINE_COLOR[s] }}>{STYLE_META[s].emoji}</span>
                    <span className="text-white/85 tabular-nums">{cum}</span>
                    {dayInc > 0 && (
                      <span className="text-green-400 tabular-nums">+{dayInc}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Legend chips */}
        <div className="flex flex-wrap gap-2 mt-2 justify-center">
          {(['alibaba','pua','posh','direct'] as Style[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[10px] text-white/65">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: STYLE_LINE_COLOR[s] }} />
              {STYLE_META[s].emoji} {STYLE_META[s].label}
              <span className="text-white/40">· {series[n - 1].counts[s]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
