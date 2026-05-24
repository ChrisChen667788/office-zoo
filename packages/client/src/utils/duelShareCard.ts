/**
 * duelShareCard — v6.20 P2 1v1 vote-duel result → 1080×1350 PNG.
 *
 * 6th sibling of the share-card family (fortune / weekly / trend /
 * abCompare / character / now duel). Renders a 4:5 IG-portrait so the
 * duel result is shareable to 朋友圈 / 小红书 / Twitter in one click.
 *
 * Card layout (top→bottom):
 *   1. Brand strip — OFFICE ZOO · 鼠人选秀斗投 + weekKey
 *   2. Verdict hero — large gradient text + big score
 *   3. Two columns side-by-side — Host / Guest, each with 3 picks
 *      colored by match (✓ green / ✗ grey)
 *   4. Footer — short share URL + tagline
 *
 *   const blob = await generateDuelShareCard(data);
 *   await copyDuelShareCard(data);
 *   await downloadDuelShareCard(data, 'duel-mmi2rjdects3.png');
 */
import { PERSONALITY_LABELS_LITE } from '../constants/personalityLabels';
import { CHARACTERS } from '@furball/shared';

export interface DuelShareCardData {
  duelId: string;
  weekKey: string;
  hostScore: number;
  guestScore: number;
  perPickHost: Array<{ rat: string; personality: string; matched: boolean; currentDominant: string | null }>;
  perPickGuest: Array<{ rat: string; personality: string; matched: boolean; currentDominant: string | null }>;
  /** Host display label, e.g., 'u-host123…' or '我' if viewed by host. */
  hostLabel: string;
  guestLabel: string;
}

const W = 1080;
const H = 1350;
const PAD = 56;

const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

/* ---------- Canvas primitives (kept inline, see sibling cards) ----- */
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
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}
function strokeRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, stroke: string, width = 1) {
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

/* ---------- Section draws ------------------------------------------ */
function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createRadialGradient(W * 0.5, 400, 100, W * 0.5, H / 2, H);
  bg.addColorStop(0, '#2D1B69');
  bg.addColorStop(0.5, '#1a0d35');
  bg.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 79, 163, 0.18)' : 'rgba(176, 134, 255, 0.16)';
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeader(ctx: CanvasRenderingContext2D, data: DuelShareCardData) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 18px ${SANS}`;
  const grad = ctx.createLinearGradient(PAD, 0, PAD + 320, 0);
  grad.addColorStop(0, '#FFD700');
  grad.addColorStop(1, '#FFA947');
  ctx.fillStyle = grad;
  ctx.fillText('班味剧场 · 鼠人选秀斗投', PAD, 60);
  ctx.textAlign = 'right';
  ctx.font = `700 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255,215,0,0.55)';
  ctx.fillText(`⚔️ ${data.weekKey}`, W - PAD, 60);
}

function drawHero(ctx: CanvasRenderingContext2D, data: DuelShareCardData): number {
  const cx = W / 2;
  let y = 130;
  // Verdict text
  const winner: 'host' | 'guest' | 'tie' =
    data.hostScore > data.guestScore ? 'host' : data.hostScore < data.guestScore ? 'guest' : 'tie';
  const verdict = winner === 'tie' ? '⚖️ 双方打平'
    : winner === 'host' ? '👑 Host 领先' : '👑 Guest 领先';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 64px ${SANS}`;
  const g = ctx.createLinearGradient(0, y, 0, y + 80);
  if (winner === 'tie') {
    g.addColorStop(0, '#FFD700'); g.addColorStop(1, '#B086FF');
  } else if (winner === 'host') {
    g.addColorStop(0, '#FFD700'); g.addColorStop(1, '#FFA947');
  } else {
    g.addColorStop(0, '#FF4FA3'); g.addColorStop(1, '#B086FF');
  }
  ctx.fillStyle = g;
  ctx.fillText(verdict, cx, y + 30);
  y += 90;

  // Big score
  ctx.font = `900 96px ${SANS}`;
  // Render two-tone score: "1 : 0"
  const hostText = `${data.hostScore}`;
  const sep = '  :  ';
  const guestText = `${data.guestScore}`;
  ctx.font = `900 96px ${SANS}`;
  const hostW = ctx.measureText(hostText).width;
  const sepW = ctx.measureText(sep).width;
  const guestW = ctx.measureText(guestText).width;
  const total = hostW + sepW + guestW;
  let curX = cx - total / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFD700';
  ctx.fillText(hostText, curX, y + 50);
  curX += hostW;
  ctx.fillStyle = 'rgba(248,244,227,0.4)';
  ctx.fillText(sep, curX, y + 50);
  curX += sepW;
  ctx.fillStyle = '#FF4FA3';
  ctx.fillText(guestText, curX, y + 50);
  y += 110;

  // Score labels (Host / Guest under the digits)
  ctx.font = `700 18px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(248,244,227,0.55)';
  ctx.fillText('HOST', cx - 70, y);
  ctx.fillText('GUEST', cx + 70, y);
  y += 30;
  return y;
}

function drawPicksColumn(ctx: CanvasRenderingContext2D, x: number, w: number, startY: number, title: string, accent: string, label: string, picks: DuelShareCardData['perPickHost']) {
  let y = startY;
  // Box bg
  const boxH = 380;
  fillRoundRect(ctx, x, y, w, boxH, 16, rgba(accent, 0.06));
  strokeRoundRect(ctx, x, y, w, boxH, 16, rgba(accent, 0.45), 1.5);

  // Title chip
  ctx.font = `900 13px ${SANS}`;
  ctx.fillStyle = accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(title, x + 18, y + 16);

  // Sub-label (host/guest user id snippet)
  ctx.font = `700 10px ${SANS}`;
  ctx.fillStyle = 'rgba(248,244,227,0.5)';
  ctx.fillText(label, x + 18, y + 36);

  // 3 pick rows
  let py = y + 64;
  for (const p of picks) {
    const char = CHARACTERS[p.rat];
    const persona = PERSONALITY_LABELS_LITE[p.personality];
    if (!char || !persona) continue;
    const rowBg = p.matched ? 'rgba(91,226,74,0.10)' : 'rgba(255,255,255,0.03)';
    const rowStroke = p.matched ? 'rgba(91,226,74,0.55)' : 'rgba(255,255,255,0.08)';
    fillRoundRect(ctx, x + 12, py, w - 24, 90, 10, rowBg);
    strokeRoundRect(ctx, x + 12, py, w - 24, 90, 10, rowStroke);
    // Emoji
    ctx.font = `34px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(char.emoji, x + 38, py + 24);
    // Epithet
    ctx.font = `800 16px ${SANS}`;
    ctx.fillStyle = '#F8F4E3';
    ctx.textAlign = 'left';
    ctx.fillText(char.epithet, x + 64, py + 18);
    // My pick
    ctx.font = `700 13px ${SANS}`;
    ctx.fillStyle = persona.color;
    ctx.fillText(`押 ${persona.emoji} ${persona.label}`, x + 64, py + 42);
    // ✓ +1 if matched
    if (p.matched) {
      ctx.font = `900 14px ${SANS}`;
      ctx.fillStyle = '#5be24a';
      ctx.textAlign = 'right';
      ctx.fillText('✓ +1', x + w - 24, py + 30);
    } else {
      ctx.font = `700 12px ${SANS}`;
      ctx.fillStyle = 'rgba(248,244,227,0.4)';
      ctx.textAlign = 'right';
      const domTxt = p.currentDominant
        ? `当前: ${PERSONALITY_LABELS_LITE[p.currentDominant]?.label ?? p.currentDominant}`
        : '无人投';
      ctx.fillText(domTxt, x + w - 24, py + 30);
    }
    // Current dominant note (if pick missed but had a dominant)
    if (!p.matched && p.currentDominant) {
      const dp = PERSONALITY_LABELS_LITE[p.currentDominant];
      if (dp) {
        ctx.font = `600 11px ${SANS}`;
        ctx.fillStyle = 'rgba(248,244,227,0.55)';
        ctx.textAlign = 'left';
        ctx.fillText(`实际: ${dp.emoji} ${dp.label}`, x + 64, py + 66);
      }
    }
    py += 100;
  }
}

function drawTwoColumns(ctx: CanvasRenderingContext2D, data: DuelShareCardData, startY: number): number {
  const gap = 16;
  const colW = (W - PAD * 2 - gap) / 2;
  drawPicksColumn(ctx, PAD, colW, startY, '🟡 HOST', '#FFD700', data.hostLabel, data.perPickHost);
  drawPicksColumn(ctx, PAD + colW + gap, colW, startY, '🔴 GUEST', '#FF4FA3', data.guestLabel, data.perPickGuest);
  return startY + 380;
}

function drawFooter(ctx: CanvasRenderingContext2D, data: DuelShareCardData) {
  ctx.strokeStyle = 'rgba(255,215,0,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 110);
  ctx.lineTo(W - PAD, H - 110);
  ctx.stroke();
  ctx.font = `900 20px ${SANS}`;
  const grad = ctx.createLinearGradient(PAD, 0, PAD + 240, 0);
  grad.addColorStop(0, '#FFD700');
  grad.addColorStop(1, '#FFA947');
  ctx.fillStyle = grad;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('OFFICE ZOO', PAD, H - 70);
  ctx.font = `600 13px ${SANS}`;
  ctx.fillStyle = 'rgba(248,244,227,0.55)';
  ctx.fillText('鼠人选秀 · 你押谁?', PAD, H - 44);
  ctx.font = `700 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255,215,0,0.65)';
  ctx.textAlign = 'right';
  ctx.fillText(`/duel/${data.duelId.slice(0, 6)}…`, W - PAD, H - 56);
}

/* ---------- Public API --------------------------------------------- */

export async function generateDuelShareCard(data: DuelShareCardData): Promise<Blob> {
  const DPR = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.scale(DPR, DPR);
  drawBackground(ctx);
  drawHeader(ctx, data);
  const afterHero = drawHero(ctx, data);
  drawTwoColumns(ctx, data, afterHero + 8);
  drawFooter(ctx, data);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), 'image/png', 0.95);
  });
}

export async function downloadDuelShareCard(data: DuelShareCardData, filename = `office-zoo-duel-${data.duelId}.png`): Promise<void> {
  const blob = await generateDuelShareCard(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

export async function copyDuelShareCard(data: DuelShareCardData): Promise<void> {
  if (!navigator.clipboard?.write) throw new Error('clipboard write not supported');
  const blob = await generateDuelShareCard(data);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export async function previewDuelShareCard(data: DuelShareCardData): Promise<string> {
  const blob = await generateDuelShareCard(data);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
