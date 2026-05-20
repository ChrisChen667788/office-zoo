/**
 * challengeShareCard — v4.1.0 PNG renderer for "you vs friend" challenge
 * comparison cards.
 *
 * Sibling to v1.5.0's dailyShareCard.ts. Different aspect (still 4:5
 * IG-portrait) but completely different layout — split-screen with a
 * giant "VS" in the middle, each side showing the participant's
 * archetype + grade + comp ratio + (optional) tactic.
 *
 * ## Why a new file (not extend dailyShareCard.ts)?
 *
 * dailyShareCard.ts is already tuned for the "one user's day" framing
 * (teaser + archetype chip + result OR call-to-share). Forcing a
 * comparison variant into it would mean a third top-level layout
 * branch in generateDailyShareCard(). Two flat files is cleaner — both
 * stay grep-able and each evolves on its own schedule.
 *
 * ## Output
 *
 * 1080×1350 PNG (4:5 IG-portrait, same dimensions as dailyShareCard so
 * users learn one shape across both share artifacts).
 *
 * ## Usage
 *
 *   const blob = await generateChallengeShareCard(data);
 *   await copyChallengeShareCardToClipboard(data);
 *   await downloadChallengeShareCard(data, 'vs.png');
 */

export interface ChallengeSide {
  /** Display name, falls back to "员工". */
  displayName: string;
  /** Archetype emoji ("🌀") + name ("阴阳怪气王") for the chip. */
  archetypeEmoji: string;
  archetypeName: string;
  /** Letter grade S/A/B/C/D — drives the big number color. */
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  /** Compensation outcome — formatted as "X / Y 月" on the card. */
  compensationMonths: number;
  maxPossible: number;
  /** Optional tactic summary from /memory/record — surfaces as a
   *  small italic caption under the name. Long strings get truncated
   *  with "…". */
  tactic?: string;
}

export interface ChallengeShareCardData {
  date: string;
  scenarioTitle: string;
  scenarioEmoji: string;
  challenger: ChallengeSide;
  challengee: ChallengeSide;
}

const W = 1080;
const H = 1350;
const PAD = 56;

const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

const GRADE_COLOR: Record<ChallengeSide['grade'], string> = {
  S: '#ffb84c', A: '#4c9eff', B: '#9cff57', C: '#ffd166', D: '#ff3355',
};

/* ---------- Canvas helpers (duplicated for the same reasons listed
   in dailyShareCard.ts — both renderers have diverged enough that
   a shared "geom" module would just add an import for tiny fns) -- */

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

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

/* ---------- Section drawing ----------------------------------------- */

function drawBackground(ctx: CanvasRenderingContext2D, data: ChallengeShareCardData) {
  // Deep navy → violet, then a tinted radial in each half based on
  // each side's grade color so the winner's half visibly glows.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0a1e');
  bg.addColorStop(0.5, '#1a0d35');
  bg.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Per-side radial glows.
  const cLeft  = GRADE_COLOR[data.challenger.grade];
  const cRight = GRADE_COLOR[data.challengee.grade];
  const winnerIsLeft  = data.challenger.compensationMonths > data.challengee.compensationMonths;
  const winnerIsRight = data.challengee.compensationMonths  > data.challenger.compensationMonths;

  const gLeft = ctx.createRadialGradient(W * 0.25, H * 0.42, 40, W * 0.25, H * 0.42, 500);
  gLeft.addColorStop(0, rgba(cLeft, winnerIsLeft ? 0.34 : 0.18));
  gLeft.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gLeft;
  ctx.fillRect(0, 0, W / 2 + 60, H);

  const gRight = ctx.createRadialGradient(W * 0.75, H * 0.42, 40, W * 0.75, H * 0.42, 500);
  gRight.addColorStop(0, rgba(cRight, winnerIsRight ? 0.34 : 0.18));
  gRight.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gRight;
  ctx.fillRect(W / 2 - 60, 0, W / 2 + 60, H);

  // Diagonal grid texture for "designed not auto-generated" feel.
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 72;
  for (let x = -H; x < W + H; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
  }
  ctx.stroke();

  // Center vertical hairline so the split-screen reads structurally.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2, 130);
  ctx.lineTo(W / 2, H - 130);
  ctx.stroke();
}

function drawHeader(ctx: CanvasRenderingContext2D, data: ChallengeShareCardData) {
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 22px ${SANS}`;
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

function drawCenterPiece(ctx: CanvasRenderingContext2D, data: ChallengeShareCardData) {
  // "🥊 朋友挑战" chip + scenario title — center column at top.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // "VS" chip header
  ctx.font = `800 22px ${SANS}`;
  const chipText = '🥊 朋友挑战';
  const tw = ctx.measureText(chipText).width;
  const chipW = tw + 60;
  const chipH = 48;
  const chipX = (W - chipW) / 2;
  const chipY = 150 - chipH / 2;
  const grad = ctx.createLinearGradient(chipX, chipY, chipX + chipW, chipY);
  grad.addColorStop(0, 'rgba(255,184,76,0.20)');
  grad.addColorStop(1, 'rgba(255,45,146,0.18)');
  fillRoundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2, grad);
  strokeRoundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2, 'rgba(255,184,76,0.60)', 1.5);
  ctx.fillStyle = '#fff';
  ctx.fillText(chipText, W / 2, 150);

  // Scenario emoji
  ctx.font = `90px ${SANS}`;
  ctx.shadowColor = 'rgba(255,255,255,0.25)';
  ctx.shadowBlur = 18;
  ctx.fillText(data.scenarioEmoji, W / 2, 260);
  ctx.shadowBlur = 0;

  // Scenario title (centered, possibly truncated)
  ctx.font = `800 26px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const titleText = truncateToWidth(ctx, data.scenarioTitle, W - PAD * 2 - 40);
  ctx.fillText(titleText, W / 2, 330);
}

function drawSide(
  ctx: CanvasRenderingContext2D,
  side: ChallengeSide,
  centerX: number,
  baseY: number,
  isWinner: boolean,
  label: '挑战者' | '应战者',
) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Role chip ("挑战者" / "应战者") with winner crown overlay
  ctx.font = `700 14px ${SANS}`;
  ctx.fillStyle = isWinner ? '#ffd58a' : 'rgba(255,255,255,0.45)';
  ctx.fillText(isWinner ? `👑 ${label}` : label, centerX, baseY);

  // Archetype emoji (big)
  ctx.font = `78px ${SANS}`;
  ctx.shadowColor = isWinner ? 'rgba(255,184,76,0.5)' : 'rgba(255,255,255,0.18)';
  ctx.shadowBlur = isWinner ? 24 : 12;
  ctx.fillStyle = '#fff';
  ctx.fillText(side.archetypeEmoji, centerX, baseY + 80);
  ctx.shadowBlur = 0;

  // Display name + archetype name
  ctx.font = `800 22px ${SANS}`;
  ctx.fillStyle = isWinner ? '#fff' : 'rgba(255,255,255,0.85)';
  const nameMax = W / 2 - PAD - 20;
  ctx.fillText(truncateToWidth(ctx, side.displayName, nameMax), centerX, baseY + 160);

  ctx.font = `500 16px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(truncateToWidth(ctx, side.archetypeName, nameMax), centerX, baseY + 190);

  // Grade letter — the hero number
  const gradeColor = GRADE_COLOR[side.grade];
  ctx.font = `900 120px ${SANS}`;
  ctx.shadowColor = rgba(gradeColor, 0.7);
  ctx.shadowBlur = isWinner ? 36 : 22;
  ctx.fillStyle = gradeColor;
  ctx.fillText(side.grade, centerX, baseY + 290);
  ctx.shadowBlur = 0;

  // Months tabular
  ctx.font = `800 28px ${SANS}`;
  ctx.fillStyle = '#fff';
  ctx.fillText(`${side.compensationMonths} / ${side.maxPossible} 月`, centerX, baseY + 370);

  // Tactic caption (italic, dimmed)
  if (side.tactic) {
    ctx.font = `italic 500 14px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const tacticMax = W / 2 - PAD - 20;
    ctx.fillText(`"${truncateToWidth(ctx, side.tactic, tacticMax)}"`, centerX, baseY + 410);
  }
}

function drawVsBadge(ctx: CanvasRenderingContext2D, baseY: number) {
  // Diamond-shaped VS badge between the two sides. Drawn rotated 45°
  // so the rounded-square reads as a diamond.
  const cx = W / 2;
  const cy = baseY;
  const size = 56;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  const g = ctx.createLinearGradient(-size, -size, size, size);
  g.addColorStop(0, '#ff5588');
  g.addColorStop(1, '#7c3aed');
  fillRoundRect(ctx, -size / 2, -size / 2, size, size, 10, g);
  strokeRoundRect(ctx, -size / 2, -size / 2, size, size, 10, 'rgba(255,255,255,0.45)', 2);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 22px ${SANS}`;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;
  ctx.fillText('VS', cx, cy);
  ctx.shadowBlur = 0;
}

function drawResultStripe(ctx: CanvasRenderingContext2D, data: ChallengeShareCardData) {
  // Bottom strip — "👑 X 赢了 N 个月赔偿" or "平手"
  const cMonths = data.challenger.compensationMonths;
  const eMonths = data.challengee.compensationMonths;
  let line: string;
  if (cMonths === eMonths) {
    line = `🤝 平手 — 两边都拿了 ${cMonths} 个月`;
  } else if (cMonths > eMonths) {
    line = `👑 ${data.challenger.displayName} 胜出 — ${cMonths} vs ${eMonths} 个月`;
  } else {
    line = `👑 ${data.challengee.displayName} 胜出 — ${eMonths} vs ${cMonths} 个月`;
  }

  const boxX = PAD;
  const boxW = W - PAD * 2;
  const boxH = 70;
  const y = H - 70 - 16 - boxH;
  const grad = ctx.createLinearGradient(boxX, y, boxX + boxW, y);
  grad.addColorStop(0, 'rgba(255,184,76,0.22)');
  grad.addColorStop(1, 'rgba(255,45,146,0.16)');
  fillRoundRect(ctx, boxX, y, boxW, boxH, 22, grad);
  strokeRoundRect(ctx, boxX, y, boxW, boxH, 22, 'rgba(255,184,76,0.55)', 1.5);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 22px ${SANS}`;
  ctx.fillStyle = '#fff';
  ctx.fillText(truncateToWidth(ctx, line, boxW - 32), W / 2, y + boxH / 2);
}

function drawFooter(ctx: CanvasRenderingContext2D, data: ChallengeShareCardData) {
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
  ctx.fillText('officezoo.app · #挑战朋友', PAD, H - 40);

  ctx.textAlign = 'right';
  ctx.fillText(`${data.date} · 对比战绩`, W - PAD, H - 40);
}

/* ---------- Public API ---------------------------------------------- */

export async function generateChallengeShareCard(data: ChallengeShareCardData): Promise<Blob> {
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
  drawCenterPiece(ctx, data);

  // Two sides side-by-side, vertically aligned
  const sideY = 410;
  const winnerIsLeft  = data.challenger.compensationMonths > data.challengee.compensationMonths;
  const winnerIsRight = data.challengee.compensationMonths  > data.challenger.compensationMonths;
  drawSide(ctx, data.challenger, W * 0.25, sideY, winnerIsLeft,  '挑战者');
  drawSide(ctx, data.challengee, W * 0.75, sideY, winnerIsRight, '应战者');

  // VS badge between them (vertical center of side blocks)
  drawVsBadge(ctx, sideY + 260);

  drawResultStripe(ctx, data);
  drawFooter(ctx, data);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/png', 1.0,
    );
  });
}

export async function copyChallengeShareCardToClipboard(data: ChallengeShareCardData): Promise<boolean> {
  try {
    const blob = await generateChallengeShareCard(data);
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export async function downloadChallengeShareCard(
  data: ChallengeShareCardData, filename = 'office-zoo-challenge.png',
): Promise<void> {
  const blob = await generateChallengeShareCard(data);
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
export async function generateChallengeShareCardPreviewUrl(data: ChallengeShareCardData): Promise<string> {
  const blob = await generateChallengeShareCard(data);
  return URL.createObjectURL(blob);
}
