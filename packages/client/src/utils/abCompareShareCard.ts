/**
 * abCompareShareCard — v6.6.2 "你的偏好让 AI 变了" PNG 分享卡。
 *
 * 1080×1350 IG-portrait, 双栏 layout (PLAIN vs BOOSTED) 拼成对比图。
 * Sibling of weeklyShareCard / trendShareCard。
 */

export type Style = 'alibaba' | 'pua' | 'posh' | 'direct';

export interface ABCompareShareCardData {
  event: string;
  style: Style;
  label: string;
  emoji: string;
  likes: number;
  plainText: string;
  boostedText: string;
}

const W = 1080;
const H = 1350;
const PAD = 56;
const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

const STYLE_COLOR: Record<Style, { from: string; to: string; accent: string }> = {
  alibaba: { from: '#4ECDC4', to: '#4A90E2', accent: '#4ECDC4' },
  pua:     { from: '#FF4FA3', to: '#7C3AED', accent: '#FF4FA3' },
  posh:    { from: '#FFD700', to: '#FFA947', accent: '#FFD700' },
  direct:  { from: '#FF6B35', to: '#FF3355', accent: '#FF6B35' },
};

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
function fillRR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  roundRect(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
}
function strokeRR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, stroke: string, width = 1) {
  roundRect(ctx, x, y, w, h, r); ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
}
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur.length > 0) {
      lines.push(cur);
      cur = ch;
    } else { cur = test; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawBackground(ctx: CanvasRenderingContext2D, accent: string) {
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.5, 80, W * 0.5, H * 0.5, H);
  bg.addColorStop(0, '#2D1B69'); bg.addColorStop(0.6, '#1a0d35'); bg.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W * 0.22, H * 0.18, 60, W * 0.22, H * 0.18, 600);
  g1.addColorStop(0, 'rgba(176,134,255,0.32)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(W * 0.78, H * 0.82, 60, W * 0.78, H * 0.82, 600);
  g2.addColorStop(0, `${accent}33`); g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
}

function drawHeader(ctx: CanvasRenderingContext2D) {
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 22px ${SANS}`;
  const g = ctx.createLinearGradient(PAD, 0, PAD + 320, 0);
  g.addColorStop(0, '#B086FF'); g.addColorStop(1, '#FF5588');
  ctx.fillStyle = g;
  ctx.fillText('🔍 A/B 对比 · OFFICE ZOO', PAD, 60);
  ctx.textAlign = 'right';
  ctx.font = `600 16px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('v6.6 · 你的偏好让 AI 变了', W - PAD, 60);
}

function drawEventPill(ctx: CanvasRenderingContext2D, event: string, style: Style, label: string, emoji: string, likes: number, y: number): number {
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `800 12px ${SANS}`;
  ctx.fillStyle = '#FFD58A';
  ctx.fillText(`✦ 同一事件 · 同一风格 · ${emoji} ${label} · 你点赞 ${likes} 次`, W / 2, y);

  ctx.font = `900 28px ${SANS}`;
  ctx.fillStyle = '#fff';
  const boxX = PAD, boxW = W - PAD * 2;
  const lines = wrapLines(ctx, event, boxW - 56);
  const lineH = 40;
  const boxH = lines.length * lineH + 32;
  const boxY = y + 22;
  const c = STYLE_COLOR[style];
  fillRR(ctx, boxX, boxY, boxW, boxH, 18, `${c.accent}18`);
  strokeRR(ctx, boxX, boxY, boxW, boxH, 18, `${c.accent}55`, 1.5);
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, boxY + 18 + (i + 0.5) * lineH));
  return boxY + boxH + 26;
}

function drawCompareCard(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  body: string,
  x: number, y: number, w: number, h: number,
  accent: string,
  isBoosted: boolean,
) {
  if (isBoosted) {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, accent);
    grad.addColorStop(1, '#FFD700');
    fillRR(ctx, x, y, w, h, 22, grad);
    fillRR(ctx, x + 4, y + 4, w - 8, h - 8, 18, 'rgba(15,10,35,0.96)');
  } else {
    fillRR(ctx, x, y, w, h, 22, 'rgba(255,255,255,0.04)');
    strokeRR(ctx, x, y, w, h, 22, 'rgba(255,255,255,0.10)', 1);
  }

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `800 12px ${SANS}`;
  ctx.fillStyle = isBoosted ? '#FFD58A' : 'rgba(255,255,255,0.55)';
  ctx.fillText(title, x + 24, y + 22);

  ctx.font = `500 11px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(subtitle, x + 24, y + 42);

  // body wrapped
  ctx.font = `500 14px ${SANS}`;
  ctx.fillStyle = isBoosted ? '#fff' : 'rgba(255,255,255,0.88)';
  const bodyW = w - 48;
  const bodyH = h - 80;
  const lineH = 22;
  const maxLines = Math.floor(bodyH / lineH);
  let lines = wrapLines(ctx, body, bodyW);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = lines[maxLines - 1];
    while (last.length > 0 && ctx.measureText(last + '…').width > bodyW) {
      lines[maxLines - 1] = last.slice(0, -1);
    }
    lines[maxLines - 1] = (lines[maxLines - 1] ?? '').slice(0, -1) + '…';
  }
  lines.forEach((ln, i) => ctx.fillText(ln, x + 24, y + 70 + i * lineH));
}

function drawSplit(ctx: CanvasRenderingContext2D, data: ABCompareShareCardData, topY: number): number {
  const gap = 18;
  const colW = (W - PAD * 2 - gap) / 2;
  const colH = 760;
  const accent = STYLE_COLOR[data.style].accent;
  drawCompareCard(ctx, '🌚 PLAIN (无 boost)', 'temp 0.85 · 中性 prompt',
    data.plainText, PAD, topY, colW, colH, accent, false);
  drawCompareCard(ctx, '⚡ BOOSTED (你的偏好强化)', 'temp 1.0 · 极致化 prompt',
    data.boostedText, PAD + colW + gap, topY, colW, colH, accent, true);
  return topY + colH;
}

function drawFooter(ctx: CanvasRenderingContext2D) {
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
  ctx.fillText('#AI在听我的', PAD, H - 40);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  const hashW = ctx.measureText('#AI在听我的').width;
  ctx.fillText('  ·  officezoo.app/weekly', PAD + hashW, H - 40);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('你点的赞 · 让 AI 真的变了', W - PAD, H - 40);
}

export async function generateABCompareShareCard(data: ABCompareShareCardData): Promise<Blob> {
  const scale = Math.min(2, window.devicePixelRatio || 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');
  ctx.scale(scale, scale);
  drawBackground(ctx, STYLE_COLOR[data.style].accent);
  drawHeader(ctx);
  const afterPill = drawEventPill(ctx, data.event, data.style, data.label, data.emoji, data.likes, 110);
  drawSplit(ctx, data, afterPill);
  drawFooter(ctx);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png', 1.0);
  });
}
export async function copyABCompareShareCardToClipboard(data: ABCompareShareCardData): Promise<boolean> {
  try {
    const blob = await generateABCompareShareCard(data);
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch { return false; }
}
export async function downloadABCompareShareCard(data: ABCompareShareCardData, filename = 'office-zoo-ab.png'): Promise<void> {
  const blob = await generateABCompareShareCard(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}
export async function generateABCompareShareCardPreviewUrl(data: ABCompareShareCardData): Promise<string> {
  const blob = await generateABCompareShareCard(data);
  return URL.createObjectURL(blob);
}
