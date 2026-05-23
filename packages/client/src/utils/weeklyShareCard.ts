/**
 * weeklyShareCard — v6.5 周报生成器 PNG 分享卡。
 *
 * 同 family: shareCard / dailyShareCard / fortuneShareCard / barClusterRenderer.
 * 1080×1350 IG-portrait, pure Canvas 2D。这次 server-side 不渲染 (4 风格
 * 数据已经在前端拿到了, 不用额外 endpoint), 直接客户端 canvas 拼图。
 *
 * 布局: 顶部 EVENT pill + 关键事件 + 4 卡 2×2 grid + 底部 footer。
 * 每个 style 用自己的 element color (青/玫红/金/橙)。
 */

export type WeeklyStyle = 'alibaba' | 'pua' | 'posh' | 'direct';

export interface WeeklyShareCardData {
  event: string;
  results: Array<{
    style: WeeklyStyle;
    label: string;
    emoji: string;
    text: string;
  }>;
}

const W = 1080;
const H = 1350;
const PAD = 56;

const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

const STYLE_PALETTE: Record<WeeklyStyle, { from: string; to: string; accent: string }> = {
  alibaba: { from: '#4ECDC4', to: '#4A90E2', accent: '#4ECDC4' },
  pua:     { from: '#FF4FA3', to: '#7C3AED', accent: '#FF4FA3' },
  posh:    { from: '#FFD700', to: '#FFA947', accent: '#FFD700' },
  direct:  { from: '#FF6B35', to: '#FF3355', accent: '#FF6B35' },
};

/* ---------- Canvas helpers ----------------------------------------- */

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
function rgba(hex: string, a: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;
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

/* ---------- Sections ------------------------------------------------ */

function drawBackground(ctx: CanvasRenderingContext2D) {
  // 米哈游 cosmic mesh — radial purple+gold, same vocab as v6.x.
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.5, 80, W * 0.5, H * 0.5, H);
  bg.addColorStop(0, '#2D1B69');
  bg.addColorStop(0.6, '#1a0d35');
  bg.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // tinted glow
  const glow1 = ctx.createRadialGradient(W * 0.22, H * 0.18, 60, W * 0.22, H * 0.18, 600);
  glow1.addColorStop(0, 'rgba(176,134,255,0.32)');
  glow1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow1; ctx.fillRect(0, 0, W, H);
  const glow2 = ctx.createRadialGradient(W * 0.78, H * 0.82, 60, W * 0.78, H * 0.82, 600);
  glow2.addColorStop(0, 'rgba(255,215,0,0.18)');
  glow2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow2; ctx.fillRect(0, 0, W, H);
  // diagonal hex texture
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -H; x < W + H; x += 36) {
    ctx.moveTo(x, 0); ctx.lineTo(x + H, H);
  }
  ctx.stroke();
}

function drawHeader(ctx: CanvasRenderingContext2D) {
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 22px ${SANS}`;
  const grad = ctx.createLinearGradient(PAD, 0, PAD + 320, 0);
  grad.addColorStop(0, '#B086FF');
  grad.addColorStop(1, '#FF5588');
  ctx.fillStyle = grad;
  ctx.fillText('📊 周报生成器 · OFFICE ZOO', PAD, 60);

  ctx.textAlign = 'right';
  ctx.font = `600 16px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('v6.5 · 班味剧场', W - PAD, 60);
}

function drawEventPill(ctx: CanvasRenderingContext2D, event: string, y: number): number {
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Top label
  ctx.font = `800 13px ${SANS}`;
  ctx.fillStyle = '#FFD58A';
  ctx.fillText('✦ 同一件事 · 4 种说法', W / 2, y);

  // Event text — boxed, multi-line
  ctx.font = `900 32px ${SANS}`;
  ctx.fillStyle = '#fff';
  const boxX = PAD;
  const boxW = W - PAD * 2;
  const lines = wrapLines(ctx, event, boxW - 56);
  const lineH = 44;
  const boxH = lines.length * lineH + 36;
  const boxY = y + 24;

  fillRoundRect(ctx, boxX, boxY, boxW, boxH, 20, 'rgba(255,215,0,0.10)');
  strokeRoundRect(ctx, boxX, boxY, boxW, boxH, 20, 'rgba(255,215,0,0.42)', 1.5);

  lines.forEach((ln, i) => {
    ctx.fillText(ln, W / 2, boxY + 18 + (i + 0.5) * lineH);
  });
  return boxY + boxH + 28;
}

function drawStyleCard(
  ctx: CanvasRenderingContext2D,
  card: WeeklyShareCardData['results'][number],
  x: number, y: number, w: number, h: number,
) {
  const p = STYLE_PALETTE[card.style];
  // Outer 5★ shimmer-ish frame
  const frameGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  frameGrad.addColorStop(0, p.from);
  frameGrad.addColorStop(1, p.to);
  fillRoundRect(ctx, x, y, w, h, 22, frameGrad);
  // Inner panel
  const innerPad = 4;
  fillRoundRect(ctx, x + innerPad, y + innerPad, w - innerPad * 2, h - innerPad * 2, 18,
    'rgba(15,10,35,0.96)');

  // Header — emoji + label
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `400 28px ${SANS}`;
  ctx.fillStyle = '#fff';
  ctx.fillText(card.emoji, x + 22, y + 36);
  ctx.font = `900 17px ${SANS}`;
  ctx.fillStyle = p.accent;
  ctx.fillText(card.label, x + 58, y + 36);

  // Divider
  ctx.strokeStyle = rgba(p.accent, 0.32);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 22, y + 60);
  ctx.lineTo(x + w - 22, y + 60);
  ctx.stroke();

  // Body text — wrap and clamp to fit
  ctx.font = `500 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textBaseline = 'top';
  const textBoxW = w - 44;
  const textBoxH = h - 80;
  const lineH = 22;
  const maxLines = Math.floor(textBoxH / lineH);
  let lines = wrapLines(ctx, card.text, textBoxW);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    // Add ellipsis to the last line
    const last = lines[maxLines - 1];
    while (last.length > 0 && ctx.measureText(last + '…').width > textBoxW) {
      lines[maxLines - 1] = last.slice(0, -1);
    }
    lines[maxLines - 1] = (lines[maxLines - 1] ?? '').slice(0, -1) + '…';
  }
  lines.forEach((ln, i) => {
    ctx.fillText(ln, x + 22, y + 76 + i * lineH);
  });
}

function drawGrid(ctx: CanvasRenderingContext2D, data: WeeklyShareCardData, topY: number): number {
  const gap = 16;
  const cols = 2;
  const rows = 2;
  const gridW = W - PAD * 2;
  const cardW = (gridW - gap * (cols - 1)) / cols;
  const cardH = 320;

  const cards = data.results.slice(0, 4);
  cards.forEach((card, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = PAD + c * (cardW + gap);
    const y = topY + r * (cardH + gap);
    drawStyleCard(ctx, card, x, y, cardW, cardH);
  });
  return topY + rows * (cardH + gap);
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
  ctx.fillText('#周报生成器', PAD, H - 40);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  const hashW = ctx.measureText('#周报生成器').width;
  ctx.fillText('  ·  officezoo.app', PAD + hashW, H - 40);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('喜欢哪个? 发给老板看', W - PAD, H - 40);
}

/* ---------- Public API ---------------------------------------------- */

export async function generateWeeklyShareCard(data: WeeklyShareCardData): Promise<Blob> {
  const scale = Math.min(2, window.devicePixelRatio || 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');
  ctx.scale(scale, scale);
  (ctx as unknown as { textRendering?: string }).textRendering = 'geometricPrecision';

  drawBackground(ctx);
  drawHeader(ctx);
  const eventBottomY = drawEventPill(ctx, data.event, 110);
  drawGrid(ctx, data, eventBottomY);
  drawFooter(ctx);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png', 1.0);
  });
}

export async function copyWeeklyShareCardToClipboard(data: WeeklyShareCardData): Promise<boolean> {
  try {
    const blob = await generateWeeklyShareCard(data);
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch { return false; }
}

export async function downloadWeeklyShareCard(data: WeeklyShareCardData, filename = 'office-zoo-weekly.png'): Promise<void> {
  const blob = await generateWeeklyShareCard(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

export async function generateWeeklyShareCardPreviewUrl(data: WeeklyShareCardData): Promise<string> {
  const blob = await generateWeeklyShareCard(data);
  return URL.createObjectURL(blob);
}

/** v5.5.1 同款 capability detection. */
export function canSystemShareImage(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File([new Uint8Array(1)], 'p.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch { return false; }
}

export async function systemShareWeeklyCard(data: WeeklyShareCardData): Promise<boolean> {
  if (!canSystemShareImage()) return false;
  try {
    const blob = await generateWeeklyShareCard(data);
    const file = new File([blob], 'office-zoo-weekly.png', { type: 'image/png' });
    if (!navigator.canShare({ files: [file] })) return false;
    await navigator.share({
      files: [file],
      title: '周报 4 风格 · OFFICE ZOO',
      text: `同一件事的 4 种说法 — 看哪个版本你老板最爱听 📊  #周报生成器`,
      url: `${window.location.origin}/weekly`,
    });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    return false;
  }
}
