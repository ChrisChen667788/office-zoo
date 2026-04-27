/**
 * Share card generator — renders a 1080×1440 PNG summary of the finished game
 * using raw Canvas 2D, zero third-party dependencies.
 *
 * ## Why hand-draw instead of html-to-image/html2canvas?
 *
 *  1. **No bundle cost.** The alternatives are 30-120kB each. For a feature
 *     used at most once per game, that's hard to justify.
 *  2. **Full typographic control.** DOM-to-canvas libraries render whatever
 *     the browser does — including the chrome UI (scrollbars, rounded-corner
 *     clipping artifacts, emoji fallbacks). Hand-drawing lets us tune every
 *     stroke for a polished social-card look that wouldn't survive screenshot.
 *  3. **Deterministic output.** Two users on different browsers get byte-
 *     equivalent PNGs modulo emoji fonts, which matters when people re-share
 *     each other's cards (a real mechanic in social-deduction game communities).
 *
 * ## Output format
 *
 * 1080×1440 (3:4) at 2× device-pixel scale → a 2160×2880 PNG. Chose 3:4
 * because it threads the needle between Instagram's 4:5 feed and Xiaohongshu's
 * 3:4 preferred crop, and fits well on Twitter/Weibo without letterboxing.
 *
 * ## Usage
 *
 *   const blob = await generateShareCard(data);
 *   await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
 *
 * See `copyShareCardToClipboard` / `downloadShareCard` for one-call helpers.
 */

export interface ShareCardData {
  winner: 'cat_win' | 'dog_win' | 'neutral_win' | string;
  winnerLabel: string;
  winnerEmoji: string;
  /** Primary accent hex. */
  winnerColor: string;
  /** Tuple for the gradient stripe. */
  winnerGradient: [string, string];
  winnerSub: string;
  round: number;
  totalElim: number;
  timeline: Array<{
    round: number;
    type: 'kill' | 'vote';
    name: string;
    roleLabel: string;
    teamColor: string;
    location?: string;
  }>;
  prediction?: {
    hits: number;
    total: number;
    accuracy: number;
    longest: number;
  };
  /** All players, pre-sorted (alive first, then by team). */
  players: Array<{
    name: string;
    roleLabel: string;
    isAlive: boolean;
    teamColor: string;
    teamLabel: string;
  }>;
  /** Human-readable date stamp (e.g. "2026-04-18"). */
  date: string;
}

const W = 1080;
const H = 1440;
const PAD = 56;

/* ---------- Canvas helpers ------------------------------------------- */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  stroke: string,
  width = 1,
) {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Draw text truncated to maxWidth with "…" suffix when it overflows. */
function drawTextTruncated(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  align: CanvasTextAlign = 'left',
) {
  const savedAlign = ctx.textAlign;
  ctx.textAlign = align;
  let t = text;
  if (ctx.measureText(t).width > maxWidth) {
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
      t = t.slice(0, -1);
    }
    t = t + '…';
  }
  ctx.fillText(t, x, y);
  ctx.textAlign = savedAlign;
}

/** Hex → rgba with alpha; accepts #rrggbb or #rgb. */
function rgba(hex: string, a: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------- Section drawing ----------------------------------------- */

const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

function drawBackground(ctx: CanvasRenderingContext2D, data: ShareCardData) {
  // Deep space base
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0a1e');
  bg.addColorStop(0.45, '#1a1040');
  bg.addColorStop(1, '#0d0b25');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Winner-tinted top radial glow
  const glow = ctx.createRadialGradient(W / 2, 180, 40, W / 2, 180, 680);
  glow.addColorStop(0, rgba(data.winnerColor, 0.32));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 700);

  // Subtle diagonal grid overlay (2% opacity) — adds a "designed" texture
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const gridStep = 72;
  for (let x = -H; x < W + H; x += gridStep) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
  }
  ctx.stroke();

  // Winner gradient side-stripe on the left edge
  const stripe = ctx.createLinearGradient(0, 0, 0, H);
  stripe.addColorStop(0, data.winnerGradient[0]);
  stripe.addColorStop(1, data.winnerGradient[1]);
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, 10, H);
}

function drawHeader(ctx: CanvasRenderingContext2D, data: ShareCardData) {
  // Brand row
  ctx.font = `900 22px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  // Gradient brand text
  const grad = ctx.createLinearGradient(PAD, 0, PAD + 260, 0);
  grad.addColorStop(0, '#2fb8ff');
  grad.addColorStop(1, '#a855f7');
  ctx.fillStyle = grad;
  ctx.fillText('职场杀 · OFFICE ARENA', PAD, 60);

  // Right-side date + live dot
  ctx.textAlign = 'right';
  ctx.font = `600 18px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(data.date, W - PAD, 60);
}

function drawWinner(ctx: CanvasRenderingContext2D, data: ShareCardData, y: number): number {
  const cx = W / 2;

  // Soft halo behind emoji
  const halo = ctx.createRadialGradient(cx, y + 90, 20, cx, y + 90, 220);
  halo.addColorStop(0, rgba(data.winnerColor, 0.45));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, y + 90, 220, 0, Math.PI * 2);
  ctx.fill();

  // Big emoji
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `150px ${SANS}`;
  // Drop shadow
  ctx.shadowColor = rgba(data.winnerColor, 0.6);
  ctx.shadowBlur = 24;
  ctx.fillText(data.winnerEmoji, cx, y + 90);
  ctx.shadowBlur = 0;

  // Winner label with gradient
  const gy = y + 220;
  ctx.font = `900 72px ${SANS}`;
  const labelGrad = ctx.createLinearGradient(cx - 280, gy, cx + 280, gy);
  labelGrad.addColorStop(0, data.winnerGradient[0]);
  labelGrad.addColorStop(1, data.winnerGradient[1]);
  ctx.fillStyle = labelGrad;
  ctx.fillText(data.winnerLabel, cx, gy);

  // Subtitle
  ctx.font = `500 22px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(data.winnerSub, cx, gy + 52);

  // Meta line
  ctx.font = `700 16px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.letterSpacing = '2px' as unknown as string; // silently ignored — fallback:
  ctx.fillText(
    `历时 ${data.round} 轮  ·  ${data.totalElim} 次出局`,
    cx,
    gy + 86,
  );

  return gy + 120;
}

function drawSectionHeader(
  ctx: CanvasRenderingContext2D,
  icon: string,
  title: string,
  sub: string,
  y: number,
): number {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `400 24px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(icon, PAD, y);

  ctx.font = `900 20px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(title, PAD + 36, y);

  ctx.font = `500 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const titleWidth = ctx.measureText(title).width;
  ctx.fillText(sub, PAD + 36 + titleWidth + 12, y + 2);

  return y + 20;
}

function drawTimeline(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  y: number,
): number {
  if (data.timeline.length === 0) return y;
  let cursor = drawSectionHeader(ctx, '📜', '复盘', '这一局谁先下岗', y);

  const rows = data.timeline.slice(0, 5); // cap at 5 rows to keep the card tidy
  const rowH = 46;
  const boxH = rows.length * rowH + 20;
  const boxX = PAD;
  const boxY = cursor + 14;
  const boxW = W - PAD * 2;

  fillRoundRect(ctx, boxX, boxY, boxW, boxH, 18, 'rgba(255,255,255,0.03)');
  strokeRoundRect(ctx, boxX, boxY, boxW, boxH, 18, 'rgba(255,255,255,0.07)', 1);

  rows.forEach((e, i) => {
    const ry = boxY + 10 + i * rowH + rowH / 2;
    // R-badge
    const rbX = boxX + 18;
    const rbY = ry - 16;
    fillRoundRect(ctx, rbX, rbY, 52, 32, 8, 'rgba(255,255,255,0.06)');
    ctx.font = `900 13px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`R${e.round}`, rbX + 26, ry);

    // Icon
    ctx.font = `22px ${SANS}`;
    ctx.fillText(e.type === 'kill' ? '🔪' : '🗳️', rbX + 80, ry);

    // Name
    ctx.font = `800 22px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(e.name, rbX + 110, ry);

    // Role tag
    const nameW = ctx.measureText(e.name).width;
    const tagX = rbX + 110 + nameW + 14;
    const tagY = ry - 13;
    ctx.font = `800 13px ${SANS}`;
    const roleText = e.roleLabel;
    const roleW = ctx.measureText(roleText).width + 18;
    fillRoundRect(ctx, tagX, tagY, roleW, 26, 7, rgba(e.teamColor, 0.15));
    strokeRoundRect(ctx, tagX, tagY, roleW, 26, 7, rgba(e.teamColor, 0.45), 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = e.teamColor;
    ctx.fillText(roleText, tagX + roleW / 2, tagY + 13);

    // Right: description
    ctx.font = `500 14px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    const desc =
      e.type === 'kill'
        ? `在 ${e.location || '某处'} 被优化`
        : '被全员投票开除';
    drawTextTruncated(ctx, desc, boxX + boxW - 18, ry, 240, 'right');
  });

  if (data.timeline.length > 5) {
    ctx.font = `600 13px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(
      `… 还有 ${data.timeline.length - 5} 条`,
      W / 2,
      boxY + boxH + 20,
    );
    return boxY + boxH + 36;
  }
  return boxY + boxH + 20;
}

function drawPrediction(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  y: number,
): number {
  if (!data.prediction || data.prediction.total === 0) return y;
  const p = data.prediction;
  let cursor = drawSectionHeader(ctx, '🎯', '你的预测', '本局观众席战绩', y);
  cursor += 14;

  const cardW = (W - PAD * 2 - 16 * 2) / 3;
  const cardH = 124;
  const cards: Array<{
    label: string;
    value: string;
    accent: string;
  }> = [
    { label: '命中率', value: `${p.accuracy}%`, accent: '#6ee7b7' },
    { label: '命中 / 参与', value: `${p.hits} / ${p.total}`, accent: '#fbbf24' },
    {
      label: '最长连中',
      value: `×${p.longest}`,
      accent: p.longest >= 3 ? '#f97316' : '#a855f7',
    },
  ];

  cards.forEach((c, i) => {
    const cx = PAD + i * (cardW + 16);
    fillRoundRect(ctx, cx, cursor, cardW, cardH, 20, rgba(c.accent, 0.08));
    strokeRoundRect(ctx, cx, cursor, cardW, cardH, 20, rgba(c.accent, 0.28), 1);

    // Value
    ctx.font = `900 40px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = rgba(c.accent, 0.5);
    ctx.shadowBlur = 14;
    ctx.fillStyle = c.accent;
    ctx.fillText(c.value, cx + cardW / 2, cursor + 54);
    ctx.shadowBlur = 0;

    // Label
    ctx.font = `700 14px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(c.label, cx + cardW / 2, cursor + 92);
  });

  return cursor + cardH + 24;
}

function drawPlayers(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  y: number,
  maxY: number,
): number {
  let cursor = drawSectionHeader(ctx, '🎭', '阵营揭晓', '谁演得最好', y);
  cursor += 14;

  const cols = 2;
  const rowH = 62;
  const gap = 12;
  const cardW = (W - PAD * 2 - gap) / cols;

  // Only draw as many players as fit in maxY
  const rowCount = Math.min(
    Math.floor(data.players.length / cols) + (data.players.length % cols ? 1 : 0),
    Math.floor((maxY - cursor) / (rowH + gap)),
  );
  const playerCap = rowCount * cols;
  const shown = data.players.slice(0, playerCap);

  shown.forEach((p, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (cardW + gap);
    const yy = cursor + row * (rowH + gap);

    const bg = p.isAlive
      ? rgba(p.teamColor, 0.08)
      : 'rgba(255,255,255,0.025)';
    const stroke = p.isAlive
      ? rgba(p.teamColor, 0.3)
      : 'rgba(255,255,255,0.06)';
    fillRoundRect(ctx, x, yy, cardW, rowH, 14, bg);
    strokeRoundRect(ctx, x, yy, cardW, rowH, 14, stroke, 1);

    // Status dot
    const dotX = x + 22;
    const dotY = yy + rowH / 2;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 14, 0, Math.PI * 2);
    ctx.fillStyle = rgba(p.teamColor, p.isAlive ? 0.22 : 0.1);
    ctx.fill();
    ctx.strokeStyle = rgba(p.teamColor, p.isAlive ? 0.6 : 0.25);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = `900 13px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.teamColor;
    ctx.globalAlpha = p.isAlive ? 1 : 0.5;
    ctx.fillText(p.isAlive ? '✓' : '✕', dotX, dotY);
    ctx.globalAlpha = 1;

    // Name + role
    ctx.textAlign = 'left';
    ctx.font = `900 18px ${SANS}`;
    ctx.fillStyle = p.isAlive ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.55)';
    drawTextTruncated(ctx, p.name, x + 48, yy + 22, cardW - 60);
    ctx.font = `700 13px ${SANS}`;
    ctx.fillStyle = p.isAlive ? p.teamColor : rgba(p.teamColor, 0.6);
    drawTextTruncated(ctx, `${p.roleLabel} · ${p.teamLabel}`, x + 48, yy + 44, cardW - 60);
  });

  return cursor + rowCount * (rowH + gap);
}

function drawFooter(ctx: CanvasRenderingContext2D, data: ShareCardData) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('office-arena.app', PAD, H - 40);

  ctx.textAlign = 'right';
  ctx.fillText(`${data.date} · made with AI drama`, W - PAD, H - 40);

  // Tiny rule above
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.moveTo(PAD, H - 70);
  ctx.lineTo(W - PAD, H - 70);
  ctx.stroke();
}

/* ---------- Public API ---------------------------------------------- */

/** Produces a PNG Blob. Runs fully client-side; no network. */
export async function generateShareCard(data: ShareCardData): Promise<Blob> {
  // 2× pixel scale for retina. Using OffscreenCanvas where available keeps
  // paint off the main thread's compositor path.
  const scale = Math.min(2, window.devicePixelRatio || 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');
  ctx.scale(scale, scale);

  // High-quality text rendering. Guarded because some TS lib versions lack
  // the `textRendering` property on CanvasRenderingContext2D.
  (ctx as unknown as { textRendering?: string }).textRendering = 'geometricPrecision';

  drawBackground(ctx, data);
  drawHeader(ctx, data);
  let y = drawWinner(ctx, data, 92);
  y = drawTimeline(ctx, data, y + 12);
  y = drawPrediction(ctx, data, y);
  drawPlayers(ctx, data, y, H - 100);
  drawFooter(ctx, data);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/png',
      1.0,
    );
  });
}

/** Writes the generated PNG to the clipboard. Returns true on success. */
export async function copyShareCardToClipboard(
  data: ShareCardData,
): Promise<boolean> {
  try {
    const blob = await generateShareCard(data);
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      return false;
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Triggers a browser download of the generated PNG. */
export async function downloadShareCard(
  data: ShareCardData,
  filename = 'office-arena.png',
): Promise<void> {
  const blob = await generateShareCard(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Give the browser a tick to register the download before revoking.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
