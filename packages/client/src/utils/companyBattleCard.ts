/**
 * companyBattleCard — v6.87 — 双公司对局「公司战报」→ 1080×1350 PNG。
 *
 * share-card 家族的双公司成员。终局一键出图:赢家横幅 + 市占率拔河条 + 两司
 * 并排战报(存活/MVP/花名册)+ 一句嘴替。内容来自 shared 纯函数 buildBattleCard
 * (可单测),这里只管 canvas 绘制(jsdom 没 canvas,不在此单测)。
 *
 *   const blob = await generateCompanyBattleCard(input);
 *   await copyCompanyBattleCard(input);
 *   await downloadCompanyBattleCard(input);
 *   const url = await previewCompanyBattleCard(input);
 */
import { buildBattleCard, type BattleCardInput, type BattleCardSide } from '@furball/shared';

const W = 1080;
const H = 1350;
const PAD = 56;
const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

/* ---------- Canvas primitives (inline, see sibling cards) ---------- */
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
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d1b3a');   // A 司蓝调
  bg.addColorStop(0.5, '#0a0a1e');
  bg.addColorStop(1, '#3a1f0d');   // B 司橙调
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
}

function drawHeader(ctx: CanvasRenderingContext2D, date: string) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 18px ${SANS}`;
  const grad = ctx.createLinearGradient(PAD, 0, PAD + 360, 0);
  grad.addColorStop(0, '#4c9eff');
  grad.addColorStop(1, '#ff8a3d');
  ctx.fillStyle = grad;
  ctx.fillText('班味剧场 · 双公司对抗战报', PAD, 60);
  ctx.textAlign = 'right';
  ctx.font = `700 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(`🏢⚔️🏢 ${date}`, W - PAD, 60);
}

function drawHero(ctx: CanvasRenderingContext2D, card: ReturnType<typeof buildBattleCard>): number {
  const cx = W / 2;
  let y = 120;
  const winColor = card.sides[card.winner].color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 58px ${SANS}`;
  const g = ctx.createLinearGradient(0, y, 0, y + 72);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, winColor);
  ctx.fillStyle = g;
  ctx.fillText(card.winnerLabel, cx, y + 30);
  y += 78;
  // reason chip
  ctx.font = `700 20px ${SANS}`;
  ctx.fillStyle = rgba(winColor, 0.9);
  ctx.fillText(`🏆 ${card.reasonText}`, cx, y + 14);
  y += 44;
  return y;
}

function drawMarketBar(ctx: CanvasRenderingContext2D, card: ReturnType<typeof buildBattleCard>, startY: number): number {
  const x = PAD;
  const w = W - PAD * 2;
  const barH = 34;
  const y = startY;
  const aW = Math.round(w * card.marketBar.a);
  // A segment (left, blue) + B segment (fills rest, orange)
  fillRoundRect(ctx, x, y, w, barH, barH / 2, 'rgba(255,255,255,0.06)');
  ctx.save();
  roundRect(ctx, x, y, w, barH, barH / 2);
  ctx.clip();
  ctx.fillStyle = card.sides.a.color;
  ctx.fillRect(x, y, aW, barH);
  ctx.fillStyle = card.sides.b.color;
  ctx.fillRect(x + aW, y, w - aW, barH);
  ctx.restore();
  // labels on the bar
  ctx.textBaseline = 'middle';
  ctx.font = `900 18px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`🅰 ${card.market.a}%`, x + 16, y + barH / 2);
  ctx.textAlign = 'right';
  ctx.fillText(`🅱 ${card.market.b}%`, x + w - 16, y + barH / 2);
  // caption
  ctx.textAlign = 'center';
  ctx.font = `600 13px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('市占率', W / 2, y + barH + 18);
  return y + barH + 38;
}

function drawSideColumn(ctx: CanvasRenderingContext2D, x: number, w: number, startY: number, side: BattleCardSide) {
  const boxH = 470;
  const y = startY;
  fillRoundRect(ctx, x, y, w, boxH, 16, rgba(side.color, side.isWinner ? 0.12 : 0.05));
  strokeRoundRect(ctx, x, y, w, boxH, 16, rgba(side.color, side.isWinner ? 0.7 : 0.3), side.isWinner ? 2 : 1.2);

  // title row: tag + label (+ 👑 winner)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 22px ${SANS}`;
  ctx.fillStyle = side.color;
  ctx.fillText(`${side.tag} ${side.label}${side.isWinner ? ' 👑' : ''}`, x + 18, y + 18);

  // survivors line
  ctx.font = `700 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(`存活 ${side.survivors}/${side.total} · 市占 ${side.market}%`, x + 18, y + 50);

  // MVP chip
  if (side.mvp) {
    ctx.font = `800 15px ${SANS}`;
    ctx.fillStyle = side.color;
    ctx.fillText(`⭐ MVP ${side.mvp}`, x + 18, y + 76);
  }

  // roster rows
  let py = y + 110;
  for (const r of side.roster) {
    const rowBg = r.alive ? rgba(side.color, 0.08) : 'rgba(255,255,255,0.025)';
    const rowStroke = r.alive ? rgba(side.color, 0.4) : 'rgba(255,255,255,0.06)';
    fillRoundRect(ctx, x + 12, py, w - 24, 56, 10, rowBg);
    strokeRoundRect(ctx, x + 12, py, w - 24, 56, 10, rowStroke);
    // status dot
    ctx.font = `20px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.alive ? '🟢' : '⚫', x + 24, py + 28);
    // name
    ctx.font = `800 17px ${SANS}`;
    ctx.fillStyle = r.alive ? '#F8F4E3' : 'rgba(248,244,227,0.4)';
    ctx.fillText(r.name, x + 56, py + 22);
    // role / status
    ctx.font = `600 12px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(r.alive ? (r.roleLabel ?? '在职') : '已出局', x + 56, py + 40);
    py += 64;
  }
}

function drawColumns(ctx: CanvasRenderingContext2D, card: ReturnType<typeof buildBattleCard>, startY: number): number {
  const gap = 16;
  const colW = (W - PAD * 2 - gap) / 2;
  drawSideColumn(ctx, PAD, colW, startY, card.sides.a);
  drawSideColumn(ctx, PAD + colW + gap, colW, startY, card.sides.b);
  return startY + 470;
}

function drawFooter(ctx: CanvasRenderingContext2D, card: ReturnType<typeof buildBattleCard>) {
  // tagline (above the brand strip), wrapped to width
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 17px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const maxW = W - PAD * 2;
  const words = card.tagline.split('');
  let line = '';
  let ty = H - 132;
  for (const ch of words) {
    if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, W / 2, ty); line = ch; ty += 26; }
    else line += ch;
  }
  if (line) ctx.fillText(line, W / 2, ty);

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 78);
  ctx.lineTo(W - PAD, H - 78);
  ctx.stroke();
  ctx.font = `900 20px ${SANS}`;
  const grad = ctx.createLinearGradient(PAD, 0, PAD + 260, 0);
  grad.addColorStop(0, '#4c9eff');
  grad.addColorStop(1, '#ff8a3d');
  ctx.fillStyle = grad;
  ctx.textAlign = 'left';
  ctx.fillText('OFFICE ZOO', PAD, H - 48);
  ctx.font = `600 13px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'right';
  ctx.fillText('双公司对抗 · 你押哪家?', W - PAD, H - 48);
}

/* ---------- Public API --------------------------------------------- */
export async function generateCompanyBattleCard(input: BattleCardInput): Promise<Blob> {
  const card = buildBattleCard(input);
  const DPR = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.scale(DPR, DPR);
  drawBackground(ctx);
  drawHeader(ctx, card.date);
  const afterHero = drawHero(ctx, card);
  const afterBar = drawMarketBar(ctx, card, afterHero + 8);
  drawColumns(ctx, card, afterBar + 4);
  drawFooter(ctx, card);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), 'image/png', 0.95);
  });
}

export async function downloadCompanyBattleCard(input: BattleCardInput, filename = `office-zoo-battle-${input.date}.png`): Promise<void> {
  const blob = await generateCompanyBattleCard(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

export async function copyCompanyBattleCard(input: BattleCardInput): Promise<boolean> {
  if (!navigator.clipboard?.write) return false;
  const blob = await generateCompanyBattleCard(input);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  return true;
}

export async function previewCompanyBattleCard(input: BattleCardInput): Promise<string> {
  const blob = await generateCompanyBattleCard(input);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
