/**
 * fortuneShareCard — v5.5.0 "班味占卜" shareable PNG generator.
 *
 * Sibling of dailyShareCard.ts (v1.5.0) and shareCard.ts. Renders the
 * current daily fortune card as a 1080×1350 IG-portrait PNG so users
 * can one-tap share to 朋友圈 / 小红书 / Twitter instead of having to
 * screenshot the page (which leaves browser chrome + cuts off content
 * and reads as "look at this random app" rather than as a designed
 * artefact).
 *
 * ## Why a third share-card util?
 *
 *  - Different data shape — FortuneCard has its own gradient + vibe
 *    gauge + advice + microAction. Squeezing it into DailyShareCardData
 *    would force generic placeholders that ruin the tarot aesthetic.
 *  - Different visual language — this card IS the artefact (a tarot
 *    card), not a poster ABOUT something. The whole layout centres on
 *    presenting the tarot card prominently with brand chrome around it,
 *    rather than the kind-chip / hero / teaser stack of dailyShareCard.
 *  - The v1.5.0 file's own comment ("two flat files is fine") applies
 *    cleanly to a third: a "generic share card framework" would leak
 *    abstractions for zero reuse.
 *
 * ## Output
 *
 * 1080×1350 PNG (4:5 IG-portrait — same as dailyShareCard so feeds
 * frame both consistently). 2× DPI for messaging-app recompression
 * resilience.
 *
 * ## Usage
 *
 *   const blob = await generateFortuneShareCard(data);
 *   await copyFortuneShareCardToClipboard(data);
 *   await downloadFortuneShareCard(data, 'fortune.png');
 */

export interface FortuneShareCardData {
  /** YYYY-MM-DD — rendered top-right + bottom footer. */
  date: string;
  /** Hero emoji (🪃 / ⭐ / 💀 / ⚡ / 🔮 etc — all FORTUNE_DECK entries). */
  emoji: string;
  /** Card title — "甩锅之道", "KPI 神助攻", etc. */
  title: string;
  /** Card subtitle — 1-line poetic line under the title. */
  subtitle: string;
  /** 0-100. Drives the vibe label + color tier (5 tiers, see VIBE_COLOR). */
  vibeScore: number;
  /** [from, to] hex — the card body gradient (per-card aesthetic). */
  gradient: [string, string];
  /** "今日忠告" — multi-line allowed, wrapped at maxWidth. */
  advice: string;
  /** "5 分钟微行动" — short imperative line. */
  microAction: string;
}

const W = 1080;
const H = 1350;
const PAD = 56;

const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

/* ---------- Vibe tier helpers (mirror Fortune.tsx) ------------------ */
// Kept duplicated rather than imported because the route file is a
// component module and importing from a .tsx into a non-component .ts
// pulls React into this file's dep graph unnecessarily. Five lines.

function vibeColor(score: number): string {
  return score >= 80 ? '#22c55e'
       : score >= 60 ? '#a3e635'
       : score >= 40 ? '#fbbf24'
       : score >= 20 ? '#fb923c'
       : '#ef4444';
}

function vibeLabel(score: number): string {
  return score >= 80 ? '大吉'
       : score >= 60 ? '小吉'
       : score >= 40 ? '中平'
       : score >= 20 ? '小凶'
       : '大凶';
}

/* ---------- Canvas helpers (duplicated from dailyShareCard) --------- */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
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
  x: number, y: number, w: number, h: number, r: number,
  fill: string | CanvasGradient,
) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
  stroke: string, width = 1,
) {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

function rgba(hex: string, a: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Wrap CJK + Latin into multiple lines at maxWidth. Naive char-by-char
 *  is fine for CJK; advice/microAction text is short so Latin mid-word
 *  breaks are negligible. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur.length > 0) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ---------- Section drawing ----------------------------------------- */

function drawBackground(ctx: CanvasRenderingContext2D, data: FortuneShareCardData) {
  // Deep navy → purple base — matches the Fortune.tsx page background.
  const bg = ctx.createRadialGradient(W * 0.3, 220, 60, W * 0.5, H / 2, H);
  bg.addColorStop(0, '#1a0d35');
  bg.addColorStop(0.6, '#0a0a1e');
  bg.addColorStop(1, '#050510');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Wide glow tinted by the CARD's own gradient — links the chrome to
  // whichever card landed today so the brand frame inherits its mood.
  const glow = ctx.createRadialGradient(W / 2, 700, 80, W / 2, 700, 900);
  glow.addColorStop(0, rgba(data.gradient[1], 0.22));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Subtle diagonal grid — same "designed not auto-generated" texture
  // dailyShareCard uses. Keeps the otherwise-flat background from
  // looking like a screenshot.
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 72;
  for (let x = -H; x < W + H; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
  }
  ctx.stroke();
}

function drawHeader(ctx: CanvasRenderingContext2D, data: FortuneShareCardData) {
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 22px ${SANS}`;
  const grad = ctx.createLinearGradient(PAD, 0, PAD + 320, 0);
  grad.addColorStop(0, '#b086ff');
  grad.addColorStop(1, '#ff5588');
  ctx.fillStyle = grad;
  ctx.fillText('🔮 班味占卜 · OFFICE ZOO TAROT', PAD, 60);

  ctx.textAlign = 'right';
  ctx.font = `600 18px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(data.date, W - PAD, 60);
}

/** The hero — a full tarot card rendered as if it were standing on the
 *  share canvas. Mirrors Fortune.tsx's "front face" layout (vibe gauge
 *  → big emoji → title → subtitle → date footer) but rebalanced for the
 *  taller IG-portrait frame. Returns the y-cursor below the card. */
function drawTarotCard(ctx: CanvasRenderingContext2D, data: FortuneShareCardData, topY: number): number {
  const cardX = PAD + 24;
  const cardY = topY;
  const cardW = W - (PAD + 24) * 2;
  const cardH = 740;

  // Card body — linear gradient using the card's own palette.
  const grad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  grad.addColorStop(0, data.gradient[0]);
  grad.addColorStop(1, data.gradient[1]);
  fillRoundRect(ctx, cardX, cardY, cardW, cardH, 36, grad);

  // Card border tinted by vibe — same trick as the on-page front face.
  const border = vibeColor(data.vibeScore);
  strokeRoundRect(ctx, cardX, cardY, cardW, cardH, 36, rgba(border, 0.55), 4);

  // Soft outer halo — gives the card "lift" against the dark background.
  ctx.save();
  ctx.shadowColor = rgba(data.gradient[1], 0.45);
  ctx.shadowBlur = 60;
  strokeRoundRect(ctx, cardX, cardY, cardW, cardH, 36, 'rgba(0,0,0,0.001)', 1);
  ctx.restore();

  /* --- Top — vibe label + score on the same line ------------------ */
  const innerPad = 36;
  const labelY = cardY + innerPad + 14;
  ctx.font = `900 22px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#fff';
  ctx.fillText(vibeLabel(data.vibeScore), cardX + innerPad, labelY);
  ctx.textAlign = 'right';
  ctx.fillText(`运势 · ${data.vibeScore}`, cardX + cardW - innerPad, labelY);
  ctx.shadowBlur = 0;

  /* --- Vibe bar --------------------------------------------------- */
  const barX = cardX + innerPad;
  const barY = labelY + 22;
  const barW = cardW - innerPad * 2;
  const barH = 10;
  fillRoundRect(ctx, barX, barY, barW, barH, barH / 2, 'rgba(0,0,0,0.28)');
  fillRoundRect(
    ctx, barX, barY, (barW * data.vibeScore) / 100, barH, barH / 2,
    vibeColor(data.vibeScore),
  );

  /* --- Big hero emoji centred ------------------------------------- */
  const emojiCx = cardX + cardW / 2;
  const emojiCy = cardY + cardH * 0.45;
  ctx.font = `260px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 22;
  ctx.fillText(data.emoji, emojiCx, emojiCy);
  ctx.shadowBlur = 0;

  /* --- Title — large, white, with subtle shadow ------------------ */
  ctx.font = `900 64px ${SANS}`;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  const titleY = cardY + cardH * 0.72;
  ctx.fillText(data.title, emojiCx, titleY);
  ctx.shadowBlur = 0;

  /* --- Subtitle — medium, slightly dimmed ------------------------ */
  ctx.font = `500 26px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  // Wrap subtitle if it exceeds the card inner width.
  const subLines = wrapLines(ctx, data.subtitle, cardW - innerPad * 2);
  const subLh = 34;
  subLines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, emojiCx, titleY + 52 + i * subLh));

  /* --- Bottom date stamp ----------------------------------------- */
  ctx.font = `700 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 4;
  ctx.fillText(`OFFICE ZOO  ·  ${data.date}`, emojiCx, cardY + cardH - innerPad);
  ctx.shadowBlur = 0;

  return cardY + cardH;
}

/** Bottom block — 今日忠告 + 微行动 stacked, narrow, single-line each
 *  (truncated with ellipsis if too long). Same visual treatment as the
 *  on-page panels: amber for advice, gold for microAction. */
function drawAdviceBlocks(ctx: CanvasRenderingContext2D, data: FortuneShareCardData, topY: number): number {
  const blockX = PAD;
  const blockW = W - PAD * 2;
  let y = topY + 28;

  const renderBlock = (header: string, body: string, accent: string, bgRgba: string): void => {
    // Box
    const innerPad = 22;
    ctx.font = `500 22px ${SANS}`;
    const bodyLines = wrapLines(ctx, body, blockW - innerPad * 2);
    const lineCount = Math.min(bodyLines.length, 2);
    const boxH = 28 + 16 + lineCount * 32 + 18;
    fillRoundRect(ctx, blockX, y, blockW, boxH, 22, bgRgba);
    strokeRoundRect(ctx, blockX, y, blockW, boxH, 22, rgba(accent, 0.36), 1.2);
    // Header
    ctx.font = `800 14px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.fillText(header, blockX + innerPad, y + 26);
    // Body
    ctx.font = `600 22px ${SANS}`;
    ctx.fillStyle = '#fff';
    bodyLines.slice(0, 2).forEach((ln, i) => {
      // Add ellipsis if we're truncating
      const isLast = i === 1 && bodyLines.length > 2;
      const text = isLast ? ln.slice(0, Math.max(0, ln.length - 1)) + '…' : ln;
      ctx.fillText(text, blockX + innerPad, y + 56 + i * 32);
    });
    y += boxH + 14;
  };

  renderBlock('✦ 今日忠告', data.advice, '#ffd58a', 'rgba(255,255,255,0.06)');
  renderBlock('✦ 5 分钟微行动', data.microAction, '#9be6ff', 'rgba(155,230,255,0.06)');
  return y;
}

function drawFooter(ctx: CanvasRenderingContext2D, data: FortuneShareCardData) {
  // Hairline divider above the footer.
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 70);
  ctx.lineTo(W - PAD, H - 70);
  ctx.stroke();

  // Brand / hashtag on the left.
  ctx.font = `700 14px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd58a';
  ctx.fillText('#班味占卜', PAD, H - 40);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  // Measure the hashtag width to lay the dot after it precisely.
  const hashW = ctx.measureText('#班味占卜').width;
  ctx.fillText('  ·  officezoo.app', PAD + hashW, H - 40);

  // Reopen tease on the right.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`${data.date} · 明日子时(UTC 00:00) 重洗`, W - PAD, H - 40);
}

/* ---------- Public API ---------------------------------------------- */

export async function generateFortuneShareCard(data: FortuneShareCardData): Promise<Blob> {
  const scale = Math.min(2, window.devicePixelRatio || 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');
  ctx.scale(scale, scale);
  (ctx as unknown as { textRendering?: string }).textRendering = 'geometricPrecision';

  drawBackground(ctx, data);
  drawHeader(ctx, data);
  // Tarot card starts ~115px from top (below header + breathing room).
  const cardBottomY = drawTarotCard(ctx, data, 115);
  drawAdviceBlocks(ctx, data, cardBottomY);
  drawFooter(ctx, data);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/png', 1.0,
    );
  });
}

export async function copyFortuneShareCardToClipboard(data: FortuneShareCardData): Promise<boolean> {
  try {
    const blob = await generateFortuneShareCard(data);
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export async function downloadFortuneShareCard(
  data: FortuneShareCardData, filename = 'office-zoo-fortune.png',
): Promise<void> {
  const blob = await generateFortuneShareCard(data);
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

/** Helper: spawn an object URL for previewing inside the modal. Caller
 *  revokes via URL.revokeObjectURL when unmounting. */
export async function generateFortuneShareCardPreviewUrl(data: FortuneShareCardData): Promise<string> {
  const blob = await generateFortuneShareCard(data);
  return URL.createObjectURL(blob);
}

/** v5.5.1 — feature-detect: can the browser share a File via the OS
 *  share sheet? Two-stage check: navigator.share exists AND
 *  navigator.canShare accepts a 1-byte probe File. iOS Safari 15+,
 *  Chrome Android 89+, Edge Android. Desktop Chrome/Safari may have
 *  navigator.share but reject file payloads — `canShare` weeds those out. */
export function canSystemShareImage(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File([new Uint8Array(1)], 'p.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** v5.5.1 — invoke the OS share sheet with the rendered PNG + an
 *  optional caption + URL. Returns true on success, false if the user
 *  cancelled or the browser rejected the share (caller should fall back
 *  to copy/download).
 *
 *  Capability detection happens here, not at call site, so the modal
 *  can keep its render logic simple ("try share; if false, show toast
 *  asking user to use 复制/下载 buttons"). */
export async function systemShareFortuneCard(
  data: FortuneShareCardData,
  opts: { title?: string; text?: string; url?: string } = {},
): Promise<boolean> {
  if (!canSystemShareImage()) return false;
  try {
    const blob = await generateFortuneShareCard(data);
    const file = new File(
      [blob],
      `office-zoo-fortune-${data.date.replace(/-/g, '')}.png`,
      { type: 'image/png' },
    );
    if (!navigator.canShare({ files: [file] })) return false;
    await navigator.share({
      files: [file],
      title: opts.title ?? `班味占卜 · ${data.title}`,
      text: opts.text ?? `今日 ${data.title} — ${data.subtitle}  #班味占卜`,
      url: opts.url,
    });
    return true;
  } catch (err) {
    // AbortError = user dismissed the share sheet (not a failure).
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    return false;
  }
}
