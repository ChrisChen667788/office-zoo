/**
 * dailyShareCard — v1.5.0 "今日剧情" shareable PNG generator.
 *
 * Sibling of shareCard.ts (which is specific to social-deduction game
 * recaps). This one renders a 4:5 IG-portrait card summarising the
 * user's *daily drama* — either as a teaser (before they've played) or
 * as a result card (after a matching fired/talkshow/pack play).
 *
 * ## Why a second util?
 *
 *  - Different aspect ratio (1080×1350 vs shareCard's 1080×1440). The
 *    daily card lives in social feeds where 4:5 is the algorithm-safe
 *    default; the recap card was tuned for Xiaohongshu's 3:4.
 *  - Completely different data shape — no players, no timeline. Just
 *    archetype + drama kind + one big teaser line + optional result.
 *  - Sharing this across modules via a generic "card framework" would
 *    leak abstractions for zero shared code. Two flat files is fine.
 *
 * ## Output
 *
 * 1080×1350 PNG (Instagram-portrait safe; Weibo/Twitter render without
 * crop; Xiaohongshu crops top + bottom 8% but key content survives).
 * Drawn at 2× DPI so it stays sharp when re-shared through messaging
 * apps that recompress.
 *
 * ## Usage
 *
 *   const blob = await generateDailyShareCard(data);
 *   await copyDailyShareCardToClipboard(data);
 *   await downloadDailyShareCard(data, 'today.png');
 */

export type DramaKind = 'fired' | 'talkshow' | 'pack' | 'pvp';

export interface DailyShareCardData {
  /** YYYY-MM-DD — rendered top-right of the card. */
  date: string;
  /** Drama kind — drives the gradient + label chip. */
  kind: DramaKind;
  /** Scenario / talkshow / pack title (used as the sub-line). */
  targetTitle: string;
  /** Emoji that headlines the hero column. */
  targetEmoji: string;
  /** LLM-generated teaser line (the 18-30-char hook from dailyDrama). */
  teaser: string;
  /** Archetype chip. Optional — anonymous users get no chip. */
  archetype?: {
    emoji: string;
    name: string;
    /** Short personality tagline shown under the name on the chip. */
    tagline?: string;
  };
  /** Result of playing today's drama. When present, the card shifts
   *  from "preview" → "战绩" mode and a result block replaces the
   *  generic CTA stripe. */
  result?: {
    /** Single-letter grade (S/A/B/C/D) — drives the badge color. */
    grade?: 'S' | 'A' | 'B' | 'C' | 'D';
    /** Headline result, e.g. "你拿了 N+5 个月赔偿". */
    headline: string;
    /** Optional sub-line, e.g. "法定应得 8 个月 · 谈判技巧 87". */
    sub?: string;
  };
  /** v3.3.1 — "next milestone" hook printed as a small footer strip
   *  above the brand footer. Tied to the user's archetype evolution
   *  trajectory (server computed in /api/quiz/evolution/me). Drives
   *  the "challenge me to evolve" share angle that turns the card
   *  from a recap into a recurring engagement hook. */
  milestone?: {
    /** Closest competing archetype name + emoji ("反卷青年 🚪"). */
    archetypeLabel: string;
    /** Rough plays-to-flip with the suggested activity, capped 1-10. */
    estimatedPlays: number;
    /** Activity name in Chinese ("攒局", "裁员谈判", etc.). */
    suggestedActivity: string;
  };
}

const W = 1080;
const H = 1350;
const PAD = 56;

const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

// Per-kind gradient palette — matches the colors used on the Landing
// daily card so the share image is recognisable as the same artefact.
const KIND_PALETTE: Record<DramaKind, { from: string; to: string; label: string }> = {
  fired:    { from: '#ff3355', to: '#ff8a4c', label: '裁员谈判' },
  talkshow: { from: '#ff5588', to: '#7c3aed', label: '今日段子' },
  pack:     { from: '#ffb84c', to: '#ff5588', label: '今日挑战' },
  pvp:      { from: '#7c3aed', to: '#00ddff', label: 'PvP 邀请' },
};

const GRADE_COLOR: Record<NonNullable<NonNullable<DailyShareCardData['result']>['grade']>, string> = {
  S: '#ffb84c',
  A: '#4c9eff',
  B: '#9cff57',
  C: '#ffd166',
  D: '#ff3355',
};

/* ---------- Canvas helpers (duplicated from shareCard.ts) ----------- */
// Kept local rather than promoted to a shared module — both files have
// drifted to suit their own card design (corner radii, padding, etc.)
// and a "geom" helper module would just add an import for tiny fns.

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

/**
 * Wrap a single line of CJK + Latin into multiple lines at maxWidth.
 * Naive char-by-char wrap is fine for CJK; Latin words at line-end may
 * mid-word break but the card uses short teasers so the impact is small.
 */
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

function drawBackground(ctx: CanvasRenderingContext2D, palette: { from: string; to: string }) {
  // Deep navy → violet base with a top-edge glow tinted by the drama kind.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0a1e');
  bg.addColorStop(0.5, '#1a0d35');
  bg.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Big radial glow from top so the eye lands on the hero emoji.
  const glow = ctx.createRadialGradient(W / 2, 280, 60, W / 2, 280, 720);
  glow.addColorStop(0, rgba(palette.from, 0.32));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 760);

  // Subtle diagonal grid texture — same trick as the recap card for
  // that "designed not auto-generated" feel.
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 72;
  for (let x = -H; x < W + H; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
  }
  ctx.stroke();

  // Two-color side stripe — accent + identity.
  const stripe = ctx.createLinearGradient(0, 0, 0, H);
  stripe.addColorStop(0, palette.from);
  stripe.addColorStop(1, palette.to);
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, 10, H);
}

function drawHeader(ctx: CanvasRenderingContext2D, data: DailyShareCardData) {
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 22px ${SANS}`;
  // Gradient wordmark — same hues as the on-page header.
  const grad = ctx.createLinearGradient(PAD, 0, PAD + 280, 0);
  grad.addColorStop(0, '#ff5588');
  grad.addColorStop(1, '#7c3aed');
  ctx.fillStyle = grad;
  ctx.fillText('班味剧场 · OFFICE ZOO', PAD, 60);

  ctx.textAlign = 'right';
  ctx.font = `600 18px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(data.date, W - PAD, 60);
}

function drawKindChip(
  ctx: CanvasRenderingContext2D, palette: { from: string; to: string; label: string },
  y: number,
): number {
  // Center-aligned chip — "✦ 今日剧情 · 裁员谈判"
  const text = `✦ 今日剧情 · ${palette.label}`;
  ctx.font = `800 22px ${SANS}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const tw = ctx.measureText(text).width;
  const chipW = tw + 56;
  const chipH = 48;
  const chipX = (W - chipW) / 2;
  const grad = ctx.createLinearGradient(chipX, y, chipX + chipW, y);
  grad.addColorStop(0, rgba(palette.from, 0.18));
  grad.addColorStop(1, rgba(palette.to, 0.18));
  fillRoundRect(ctx, chipX, y - chipH / 2, chipW, chipH, chipH / 2, grad);
  strokeRoundRect(ctx, chipX, y - chipH / 2, chipW, chipH, chipH / 2, rgba(palette.from, 0.55), 1.5);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, chipX + 28, y);
  return y + chipH / 2 + 30;
}

function drawHero(
  ctx: CanvasRenderingContext2D, data: DailyShareCardData,
  palette: { from: string; to: string },
  y: number,
): number {
  const cx = W / 2;

  // Big emoji with halo glow.
  const halo = ctx.createRadialGradient(cx, y + 90, 20, cx, y + 90, 220);
  halo.addColorStop(0, rgba(palette.from, 0.45));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, y + 90, 220, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `160px ${SANS}`;
  ctx.shadowColor = rgba(palette.from, 0.6);
  ctx.shadowBlur = 28;
  ctx.fillText(data.targetEmoji, cx, y + 90);
  ctx.shadowBlur = 0;

  return y + 200;
}

function drawTeaser(
  ctx: CanvasRenderingContext2D, data: DailyShareCardData, y: number,
): number {
  // Teaser is the centrepiece — large, multi-line if needed.
  const cx = W / 2;
  const maxWidth = W - PAD * 2 - 40;
  ctx.font = `900 40px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  const lines = wrapLines(ctx, data.teaser, maxWidth);
  const lh = 52;
  lines.forEach((ln, i) => ctx.fillText(ln, cx, y + i * lh));
  let cursor = y + (lines.length - 1) * lh + 50;

  // Target title — small, dimmed, under teaser.
  ctx.font = `600 20px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const titleLines = wrapLines(ctx, data.targetTitle, maxWidth);
  const titleLh = 28;
  titleLines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, cx, cursor + i * titleLh));
  cursor += titleLh * Math.min(titleLines.length, 2) + 16;
  return cursor;
}

function drawArchetypeChip(
  ctx: CanvasRenderingContext2D,
  archetype: NonNullable<DailyShareCardData['archetype']>,
  y: number,
): number {
  const cx = W / 2;
  const line = `${archetype.emoji} ${archetype.name}`;
  ctx.font = `800 22px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(line).width;
  const chipW = tw + 48;
  const chipH = 48;
  const chipX = cx - chipW / 2;
  fillRoundRect(ctx, chipX, y - chipH / 2, chipW, chipH, chipH / 2, 'rgba(176,134,255,0.14)');
  strokeRoundRect(ctx, chipX, y - chipH / 2, chipW, chipH, chipH / 2, 'rgba(176,134,255,0.55)', 1.5);
  ctx.fillStyle = '#b086ff';
  ctx.fillText(line, chipX + 24, y);
  let cursor = y + chipH / 2 + 10;
  if (archetype.tagline) {
    ctx.font = `500 16px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(archetype.tagline, cx, cursor + 14);
    cursor += 32;
  }
  return cursor + 8;
}

function drawResultBlock(
  ctx: CanvasRenderingContext2D,
  result: NonNullable<DailyShareCardData['result']>,
  y: number,
): number {
  const boxX = PAD;
  const boxW = W - PAD * 2;
  const boxH = result.sub ? 200 : 160;
  // Tinted background per grade — defaults to amber when no grade.
  const gradeColor = result.grade ? GRADE_COLOR[result.grade] : '#ffb84c';
  fillRoundRect(ctx, boxX, y, boxW, boxH, 24, rgba(gradeColor, 0.10));
  strokeRoundRect(ctx, boxX, y, boxW, boxH, 24, rgba(gradeColor, 0.42), 1.5);

  // "今日战绩" header — small uppercase tracking, gradient text.
  ctx.font = `800 14px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(gradeColor, 0.85);
  ctx.fillText('✦ 今日战绩', boxX + 28, y + 32);

  // Grade letter — chunky badge on the right when present.
  if (result.grade) {
    const badgeR = 36;
    const bx = boxX + boxW - badgeR - 28;
    const by = y + 56;
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = rgba(gradeColor, 0.18);
    ctx.fill();
    ctx.strokeStyle = rgba(gradeColor, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `900 42px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = gradeColor;
    ctx.fillText(result.grade, bx, by + 2);
  }

  // Headline — biggest line in the block.
  ctx.font = `900 30px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  const maxHeadlineW = boxW - 56 - (result.grade ? 100 : 0);
  let headline = result.headline;
  if (ctx.measureText(headline).width > maxHeadlineW) {
    while (headline.length > 1 && ctx.measureText(headline + '…').width > maxHeadlineW) {
      headline = headline.slice(0, -1);
    }
    headline = headline + '…';
  }
  ctx.fillText(headline, boxX + 28, y + 80);

  if (result.sub) {
    ctx.font = `500 18px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    let sub = result.sub;
    const maxSubW = boxW - 56;
    if (ctx.measureText(sub).width > maxSubW) {
      while (sub.length > 1 && ctx.measureText(sub + '…').width > maxSubW) {
        sub = sub.slice(0, -1);
      }
      sub = sub + '…';
    }
    ctx.fillText(sub, boxX + 28, y + 130);
  }

  return y + boxH + 24;
}

function drawCallToShareBlock(
  ctx: CanvasRenderingContext2D, palette: { from: string; to: string }, y: number,
): number {
  // No result yet — show a "go play it" prompt instead so the card
  // still reads as a complete artefact when shared "before" playing.
  const boxX = PAD;
  const boxW = W - PAD * 2;
  const boxH = 110;
  const grad = ctx.createLinearGradient(boxX, y, boxX + boxW, y);
  grad.addColorStop(0, rgba(palette.from, 0.16));
  grad.addColorStop(1, rgba(palette.to, 0.16));
  fillRoundRect(ctx, boxX, y, boxW, boxH, 24, grad);
  strokeRoundRect(ctx, boxX, y, boxW, boxH, 24, rgba(palette.from, 0.45), 1.5);

  ctx.font = `800 24px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('打开 OFFICE ZOO 看看你的今天', W / 2, y + boxH / 2 - 12);
  ctx.font = `500 16px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('officezoo.app · 每天一段你的剧情', W / 2, y + boxH / 2 + 18);
  return y + boxH + 24;
}

function drawMilestoneStrip(
  ctx: CanvasRenderingContext2D,
  milestone: NonNullable<DailyShareCardData['milestone']>,
  y: number,
): number {
  // Sits above the footer divider. Compact single-line gradient
  // chip telling whoever sees this card "this person is N plays
  // away from evolving" — a viral hook ("challenge me to evolve").
  const boxX = PAD;
  const boxW = W - PAD * 2;
  const boxH = 60;
  const grad = ctx.createLinearGradient(boxX, y, boxX + boxW, y);
  grad.addColorStop(0, 'rgba(255,184,76,0.22)');
  grad.addColorStop(1, 'rgba(255,45,146,0.18)');
  fillRoundRect(ctx, boxX, y, boxW, boxH, 18, grad);
  strokeRoundRect(ctx, boxX, y, boxW, boxH, 18, 'rgba(255,184,76,0.55)', 1.5);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 18px ${SANS}`;
  ctx.fillStyle = '#ffd58a';
  ctx.fillText('✦ 下一站', boxX + 20, y + boxH / 2);

  ctx.font = `600 16px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const detail = `${milestone.archetypeLabel} · 再玩 ${milestone.estimatedPlays} 局《${milestone.suggestedActivity}》`;
  // Truncate if it doesn't fit
  const maxDetailW = boxW - 130;
  let detailText = detail;
  if (ctx.measureText(detailText).width > maxDetailW) {
    while (detailText.length > 1 && ctx.measureText(detailText + '…').width > maxDetailW) {
      detailText = detailText.slice(0, -1);
    }
    detailText = detailText + '…';
  }
  ctx.fillText(detailText, boxX + 110, y + boxH / 2);
  return y + boxH;
}

function drawFooter(ctx: CanvasRenderingContext2D, data: DailyShareCardData) {
  // Hairline divider just above the footer text.
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 70);
  ctx.lineTo(W - PAD, H - 70);
  ctx.stroke();

  ctx.font = `700 14px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('officezoo.app · #班味剧场', PAD, H - 40);

  ctx.textAlign = 'right';
  ctx.fillText(`${data.date} · 今日剧情`, W - PAD, H - 40);
}

/* ---------- Public API ---------------------------------------------- */

export async function generateDailyShareCard(data: DailyShareCardData): Promise<Blob> {
  const scale = Math.min(2, window.devicePixelRatio || 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');
  ctx.scale(scale, scale);
  (ctx as unknown as { textRendering?: string }).textRendering = 'geometricPrecision';

  const palette = KIND_PALETTE[data.kind] ?? KIND_PALETTE.fired;

  drawBackground(ctx, palette);
  drawHeader(ctx, data);
  let y = drawKindChip(ctx, palette, 150);
  y = drawHero(ctx, data, palette, y);
  y = drawTeaser(ctx, data, y);
  if (data.archetype) y = drawArchetypeChip(ctx, data.archetype, y + 24);
  // Push the bottom block to a fixed slot so cards with / without
  // a result still have a consistent footer position. Roughly
  // 240px above the footer. v3.3.1 — reserve extra room for the
  // milestone strip (60px + 16px gap) when present.
  const milestoneReserve = data.milestone ? 60 + 16 : 0;
  const bottomBlockY = H - 70 - 24 - milestoneReserve - (data.result ? (data.result.sub ? 200 : 160) : 110) - 24;
  if (data.result) drawResultBlock(ctx, data.result, bottomBlockY);
  else            drawCallToShareBlock(ctx, palette, bottomBlockY);
  if (data.milestone) {
    // Sits just above the footer divider.
    drawMilestoneStrip(ctx, data.milestone, H - 70 - 16 - 60);
  }
  drawFooter(ctx, data);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/png', 1.0,
    );
  });
}

export async function copyDailyShareCardToClipboard(data: DailyShareCardData): Promise<boolean> {
  try {
    const blob = await generateDailyShareCard(data);
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export async function downloadDailyShareCard(
  data: DailyShareCardData, filename = 'office-zoo-daily.png',
): Promise<void> {
  const blob = await generateDailyShareCard(data);
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

/** Helper: spawn an object URL for previewing inside a modal. Caller
 *  is responsible for revoking it (URL.revokeObjectURL) when the
 *  preview unmounts. */
export async function generateDailyShareCardPreviewUrl(data: DailyShareCardData): Promise<string> {
  const blob = await generateDailyShareCard(data);
  return URL.createObjectURL(blob);
}
