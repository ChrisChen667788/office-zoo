/**
 * trendShareCard — v6.6.2 "我的偏好曲线" PNG 分享卡。
 *
 * 1080×1350 IG-portrait, sibling of weeklyShareCard / fortuneShareCard
 * / dailyShareCard。把 /weekly/me 的趋势图 + key stats 拼成一张可
 * 一键发圈的图。
 *
 * 数据形状: 跟 /api/weekly/preferences 响应 1:1, 含 events / counts /
 * dominantStyle / recent 30d。
 */

export type Style = 'alibaba' | 'pua' | 'posh' | 'direct';

export interface LikeEvent { style: Style; ts: number }

export interface TrendShareCardData {
  total: number;
  counts: Record<Style, number>;
  dominantStyle: Style | null;
  dominantLabel: string | null;
  events: LikeEvent[];
  recent?: {
    counts: Record<Style, number>;
    dominantStyle: Style | null;
    dominantLabel: string | null;
    total: number;
    windowDays: number;
    differsFromAllTime: boolean;
  } | null;
}

const W = 1080;
const H = 1350;
const PAD = 56;
const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

const STYLE_META: Record<Style, { label: string; emoji: string; color: string }> = {
  alibaba: { label: '阿里黑话版', emoji: '🧩', color: '#4ECDC4' },
  pua:     { label: 'PUA 版',     emoji: '🎭', color: '#FF4FA3' },
  posh:    { label: '装腔版',     emoji: '🎩', color: '#FFD700' },
  direct:  { label: '直球版',     emoji: '💢', color: '#FF6B35' },
};

/* ─── shared canvas helpers ─────────────────────────────────────── */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  roundRect(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
}
function strokeRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, stroke: string, width = 1) {
  roundRect(ctx, x, y, w, h, r); ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function shortDate(k: string): string {
  const [, m, d] = k.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

/* ─── Section drawing ──────────────────────────────────────────── */
function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.5, 80, W * 0.5, H * 0.5, H);
  bg.addColorStop(0, '#2D1B69');
  bg.addColorStop(0.6, '#1a0d35');
  bg.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow1 = ctx.createRadialGradient(W * 0.22, H * 0.18, 60, W * 0.22, H * 0.18, 600);
  glow1.addColorStop(0, 'rgba(176,134,255,0.32)');
  glow1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow1; ctx.fillRect(0, 0, W, H);
  const glow2 = ctx.createRadialGradient(W * 0.78, H * 0.82, 60, W * 0.78, H * 0.82, 600);
  glow2.addColorStop(0, 'rgba(255,215,0,0.18)');
  glow2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow2; ctx.fillRect(0, 0, W, H);
}

function drawHeader(ctx: CanvasRenderingContext2D) {
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 22px ${SANS}`;
  const g = ctx.createLinearGradient(PAD, 0, PAD + 320, 0);
  g.addColorStop(0, '#B086FF');
  g.addColorStop(1, '#FF5588');
  ctx.fillStyle = g;
  ctx.fillText('📊 我的偏好曲线 · OFFICE ZOO', PAD, 60);
  ctx.textAlign = 'right';
  ctx.font = `600 16px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('v6.6 · 周报生成器', W - PAD, 60);
}

function drawSummary(ctx: CanvasRenderingContext2D, data: TrendShareCardData, y: number): number {
  const boxX = PAD, boxW = W - PAD * 2, boxH = 200;
  fillRoundRect(ctx, boxX, y, boxW, boxH, 22, 'rgba(255,215,0,0.10)');
  strokeRoundRect(ctx, boxX, y, boxW, boxH, 22, 'rgba(255,215,0,0.42)', 1.5);

  // 大数字
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `800 13px ${SANS}`;
  ctx.fillStyle = '#FFD58A';
  ctx.fillText('✦ 总累积点赞 · ALL TIME', boxX + 28, y + 22);
  ctx.font = `900 72px ${SANS}`;
  ctx.fillStyle = '#fff';
  ctx.fillText(`${data.total}`, boxX + 28, y + 50);

  // dominant label
  if (data.dominantLabel) {
    ctx.font = `700 18px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('主导风格 ⚡ armed', boxX + 28, y + 138);
    ctx.font = `900 22px ${SANS}`;
    const meta = data.dominantStyle ? STYLE_META[data.dominantStyle] : null;
    if (meta) {
      ctx.fillStyle = meta.color;
      ctx.fillText(`${meta.emoji} ${data.dominantLabel}`, boxX + 28, y + 162);
    }
  }

  // 右上角 recent 30d badge
  if (data.recent && data.recent.total > 0 && data.recent.dominantLabel) {
    const rx = boxX + boxW - 280, ry = y + 22, rw = 252, rh = 156;
    const bg = data.recent.differsFromAllTime ? 'rgba(255,79,163,0.16)' : 'rgba(155,230,255,0.10)';
    const stroke = data.recent.differsFromAllTime ? 'rgba(255,79,163,0.55)' : 'rgba(155,230,255,0.45)';
    fillRoundRect(ctx, rx, ry, rw, rh, 14, bg);
    strokeRoundRect(ctx, rx, ry, rw, rh, 14, stroke, 1.2);

    ctx.textAlign = 'left';
    ctx.font = `800 11px ${SANS}`;
    ctx.fillStyle = data.recent.differsFromAllTime ? '#FF4FA3' : '#9be6ff';
    ctx.fillText('近 30 天', rx + 18, ry + 16);

    ctx.font = `900 28px ${SANS}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`${data.recent.total} 次`, rx + 18, ry + 36);

    const recentMeta = data.recent.dominantStyle ? STYLE_META[data.recent.dominantStyle] : null;
    if (recentMeta) {
      ctx.font = `800 16px ${SANS}`;
      ctx.fillStyle = recentMeta.color;
      ctx.fillText(`${recentMeta.emoji} ${data.recent.dominantLabel}`, rx + 18, ry + 78);
    }

    if (data.recent.differsFromAllTime) {
      ctx.font = `800 12px ${SANS}`;
      ctx.fillStyle = '#FF4FA3';
      ctx.fillText('🔄 你最近变了', rx + 18, ry + 116);
    }
  }

  return y + boxH + 28;
}

function drawTrendChart(ctx: CanvasRenderingContext2D, data: TrendShareCardData, topY: number): number {
  const boxX = PAD, boxW = W - PAD * 2, boxH = 480;
  fillRoundRect(ctx, boxX, topY, boxW, boxH, 22, 'rgba(255,255,255,0.04)');
  strokeRoundRect(ctx, boxX, topY, boxW, boxH, 22, 'rgba(255,255,255,0.10)', 1);

  // 标题
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `800 13px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('📈 时间趋势 · 累计', boxX + 28, topY + 20);

  // Bucket events by day
  const dayBuckets = new Map<string, Record<Style, number>>();
  for (const ev of data.events) {
    const k = dayKey(ev.ts);
    if (!dayBuckets.has(k)) dayBuckets.set(k, { alibaba: 0, pua: 0, posh: 0, direct: 0 });
    dayBuckets.get(k)![ev.style] += 1;
  }
  const days = [...dayBuckets.keys()].sort();
  const running: Record<Style, number> = { alibaba: 0, pua: 0, posh: 0, direct: 0 };
  const series: Array<{ day: string; counts: Record<Style, number> }> = [];
  for (const d of days) {
    const inc = dayBuckets.get(d)!;
    (Object.keys(inc) as Style[]).forEach((s) => { running[s] += inc[s]; });
    series.push({ day: d, counts: { ...running } });
  }

  const n = series.length;
  if (n === 0) {
    ctx.font = `500 16px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'center';
    ctx.fillText('📭 还没有时间戳记录的点赞', boxX + boxW / 2, topY + boxH / 2);
    return topY + boxH + 28;
  }

  // SVG-like chart geometry inside the box
  const chartPadL = 56, chartPadR = 36, chartPadT = 64, chartPadB = 56;
  const innerW = boxW - chartPadL - chartPadR;
  const innerH = boxH - chartPadT - chartPadB;
  const cx0 = boxX + chartPadL;
  const cy0 = topY + chartPadT;
  const maxY = Math.max(1, ...series.map((s) => Math.max(s.counts.alibaba, s.counts.pua, s.counts.posh, s.counts.direct)));

  const xAt = (i: number) => n === 1 ? cx0 + innerW / 2 : cx0 + (i * innerW) / (n - 1);
  const yAt = (v: number) => cy0 + innerH - (v / maxY) * innerH;

  // y grid + ticks (0 / mid / max)
  const yTicks = [0, Math.ceil(maxY / 2), maxY];
  ctx.font = `500 11px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of yTicks) {
    const y = yAt(v);
    // dashed grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(cx0, y);
    ctx.lineTo(cx0 + innerW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(`${v}`, cx0 - 8, y);
  }

  // x labels (first / middle / last)
  ctx.font = `500 11px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xLabelY = cy0 + innerH + 8;
  if (n === 1) {
    ctx.fillText(shortDate(series[0].day), xAt(0), xLabelY);
  } else {
    ctx.fillText(shortDate(series[0].day), xAt(0), xLabelY);
    if (n >= 3) ctx.fillText(shortDate(series[Math.floor(n / 2)].day), xAt(Math.floor(n / 2)), xLabelY);
    ctx.fillText(shortDate(series[n - 1].day), xAt(n - 1), xLabelY);
  }

  // 4 lines + end dots
  (['alibaba', 'pua', 'posh', 'direct'] as Style[]).forEach((s) => {
    ctx.strokeStyle = STYLE_META[s].color;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    series.forEach((d, i) => {
      const x = xAt(i), y = yAt(d.counts[s]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // end dot
    if (n >= 1) {
      ctx.fillStyle = STYLE_META[s].color;
      ctx.beginPath();
      ctx.arc(xAt(n - 1), yAt(series[n - 1].counts[s]), 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Legend at bottom of box
  const legendY = topY + boxH - 36;
  const totalLegendW = innerW;
  const itemW = totalLegendW / 4;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  (['alibaba', 'pua', 'posh', 'direct'] as Style[]).forEach((s, i) => {
    const meta = STYLE_META[s];
    const x = cx0 + itemW * i + 6;
    ctx.fillStyle = meta.color;
    ctx.beginPath();
    ctx.arc(x + 6, legendY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 12px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`${meta.emoji} ${meta.label}`, x + 16, legendY);
    ctx.font = `800 14px ${SANS}`;
    ctx.fillStyle = meta.color;
    ctx.fillText(`${series[n - 1].counts[s]}`, x + 130, legendY);
  });

  return topY + boxH + 28;
}

function drawFooter(ctx: CanvasRenderingContext2D, data: TrendShareCardData) {
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 70);
  ctx.lineTo(W - PAD, H - 70);
  ctx.stroke();
  ctx.font = `700 14px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFD58A';
  ctx.fillText('#我的偏好曲线', PAD, H - 40);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  const hashW = ctx.measureText('#我的偏好曲线').width;
  ctx.fillText('  ·  officezoo.app/weekly', PAD + hashW, H - 40);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`共 ${data.events.length} 次点赞 · ${new Date().toISOString().slice(0,10)}`, W - PAD, H - 40);
}

/* ─── Public API ──────────────────────────────────────────────── */
export async function generateTrendShareCard(data: TrendShareCardData): Promise<Blob> {
  const scale = Math.min(2, window.devicePixelRatio || 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');
  ctx.scale(scale, scale);

  drawBackground(ctx);
  drawHeader(ctx);
  const afterSummary = drawSummary(ctx, data, 110);
  drawTrendChart(ctx, data, afterSummary);
  drawFooter(ctx, data);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png', 1.0);
  });
}
export async function copyTrendShareCardToClipboard(data: TrendShareCardData): Promise<boolean> {
  try {
    const blob = await generateTrendShareCard(data);
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch { return false; }
}
export async function downloadTrendShareCard(data: TrendShareCardData, filename = 'office-zoo-trend.png'): Promise<void> {
  const blob = await generateTrendShareCard(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}
export async function generateTrendShareCardPreviewUrl(data: TrendShareCardData): Promise<string> {
  const blob = await generateTrendShareCard(data);
  return URL.createObjectURL(blob);
}
