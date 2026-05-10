/**
 * drawFurniture — pure canvas-2D primitives for isometric office furniture.
 *
 * v0.6.3 — replaces the AI-generated Minimax PNG stickers, which had two
 * fatal visual problems:
 *   1. Minimax `image-01` returns JPEG even when we ask for PNG, so the
 *      "transparent" backgrounds were actually solid white. Stickers ended
 *      up as white trading-card rectangles all over a dark map.
 *   2. Sprite sizes were tuned to the iso footprint of the underlying
 *      furniture rect, which made desks 56×40 logical units → ~110px on
 *      screen. The whole map looked like a sticker collage.
 *
 * The new approach: small, geometric, glass/neon style that matches the
 * surrounding rooms (iso trapezoid floors with team-accent borders).
 * Each kind is hand-drawn from primitives — circles, gradients, soft
 * shadows — so it composites naturally over the floor without any
 * white-on-dark seam.
 *
 * All draw functions receive (ctx, sx, sy, scale) and paint relative
 * to the ground anchor `(sx, sy)`. Scale 1.0 ≈ 30px footprint; the
 * GameMap caller passes ~0.9-1.2 for natural visual weight.
 */

export type FurnitureKind =
  | 'desk' | 'chair' | 'meeting_table' | 'whiteboard'
  | 'coffee_machine' | 'water_dispenser' | 'printer'
  | 'server_rack' | 'cctv' | 'sofa' | 'plant' | 'elevator_door';

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  /** Iso-projected anchor (bottom centre of the furniture footprint). */
  sx: number;
  sy: number;
  /** Visual scale multiplier. 1.0 = standard 30px-class furniture. */
  scale?: number;
}

/** Tiny soft drop-shadow under the sprite to give it floor-anchoring weight. */
function shadow({ ctx, sx, sy, scale = 1 }: DrawCtx, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 1, w * scale, h * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Per-kind drawers — kept small + readable. Each tells a "this is a desk /
// this is a chair" story in 5-15 path operations.
// ---------------------------------------------------------------------------

function drawDesk(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 18, 4);
  const { ctx, sx, sy } = d;
  // wood-tone tabletop, iso parallelogram
  const w = 30 * s;
  const dh = 6 * s;       // depth of iso slant
  const top = sy - 8 * s;
  const grad = ctx.createLinearGradient(sx - w, top - dh, sx + w, top + dh);
  grad.addColorStop(0, '#6b4a2a');
  grad.addColorStop(1, '#4a3320');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(sx - w, top);
  ctx.lineTo(sx,      top - dh);
  ctx.lineTo(sx + w,  top);
  ctx.lineTo(sx,      top + dh);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // monitor — small dark slab with cyan glow line
  const mw = 14 * s, mh = 9 * s;
  const my = top - dh - mh - 1;
  ctx.fillStyle = '#0f1730';
  ctx.fillRect(sx - mw / 2, my, mw, mh);
  ctx.strokeStyle = '#2fb8ff';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(sx - mw / 2 + 0.5, my + 0.5, mw - 1, mh - 1);
  // monitor glow line — fakes "screen on"
  ctx.fillStyle = 'rgba(47,184,255,0.45)';
  ctx.fillRect(sx - mw / 2 + 2, my + 2, mw - 4, 2);
}

function drawChair(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 8, 3);
  const { ctx, sx, sy } = d;
  // seat (small dark ellipse)
  const sw = 10 * s, sh = 4 * s;
  const seatY = sy - 5 * s;
  ctx.fillStyle = '#1c1c2e';
  ctx.beginPath();
  ctx.ellipse(sx, seatY, sw, sh, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // back rest (curved bar)
  ctx.strokeStyle = '#2c2c44';
  ctx.lineWidth = 2.5 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx - sw * 0.7, seatY - 2);
  ctx.quadraticCurveTo(sx, seatY - 9 * s, sx + sw * 0.7, seatY - 2);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawMeetingTable(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 28, 6);
  const { ctx, sx, sy } = d;
  const w = 38 * s, dh = 10 * s;
  const top = sy - 8 * s;
  // wood-tone iso oval table
  const grad = ctx.createLinearGradient(sx - w, top - dh, sx + w, top + dh);
  grad.addColorStop(0, '#9a7148');
  grad.addColorStop(1, '#6f4e2c');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(sx, top, w, dh, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // small reflection highlight
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.ellipse(sx - w * 0.3, top - dh * 0.4, w * 0.4, dh * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawWhiteboard(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 14, 3);
  const { ctx, sx, sy } = d;
  const w = 24 * s, h = 16 * s;
  const top = sy - 18 * s;
  // frame
  ctx.fillStyle = '#aab0bd';
  ctx.fillRect(sx - w / 2 - 1, top - 1, w + 2, h + 2);
  // white face
  ctx.fillStyle = '#f4f6fa';
  ctx.fillRect(sx - w / 2, top, w, h);
  // marker scribbles
  ctx.strokeStyle = '#ff4757';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx - w / 2 + 3, top + 4);
  ctx.lineTo(sx - w / 2 + 9, top + 4);
  ctx.moveTo(sx - w / 2 + 3, top + 8);
  ctx.lineTo(sx - w / 2 + 12, top + 8);
  ctx.stroke();
  ctx.strokeStyle = '#2fb8ff';
  ctx.beginPath();
  ctx.moveTo(sx - w / 2 + 3, top + 12);
  ctx.lineTo(sx - w / 2 + 7, top + 12);
  ctx.stroke();
}

function drawCoffeeMachine(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 8, 3);
  const { ctx, sx, sy } = d;
  const w = 13 * s, h = 16 * s;
  const top = sy - h;
  // chrome body
  const grad = ctx.createLinearGradient(sx - w / 2, top, sx + w / 2, top + h);
  grad.addColorStop(0, '#c0c4ce');
  grad.addColorStop(0.5, '#8b8f99');
  grad.addColorStop(1, '#5a5e69');
  ctx.fillStyle = grad;
  ctx.fillRect(sx - w / 2, top, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - w / 2, top, w, h);
  // little screen on top
  ctx.fillStyle = '#2fb8ff';
  ctx.fillRect(sx - w / 2 + 2, top + 2, w - 4, 3);
  // spout + cup
  ctx.fillStyle = '#3a3d47';
  ctx.fillRect(sx - 2, top + 9, 4, 4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(sx - 3, top + 11, 6, 4);
  // steam wisp
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, top - 2);
  ctx.quadraticCurveTo(sx + 3, top - 6, sx, top - 9);
  ctx.stroke();
}

function drawWaterDispenser(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 8, 3);
  const { ctx, sx, sy } = d;
  const w = 11 * s, h = 16 * s;
  const top = sy - h;
  // base
  ctx.fillStyle = '#e8eaef';
  ctx.fillRect(sx - w / 2, top + 8, w, h - 8);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - w / 2, top + 8, w, h - 8);
  // blue water bottle on top
  ctx.fillStyle = '#5cc1ff';
  ctx.beginPath();
  ctx.moveTo(sx - 5, top + 9);
  ctx.lineTo(sx - 4, top);
  ctx.lineTo(sx + 4, top);
  ctx.lineTo(sx + 5, top + 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.stroke();
  // tap
  ctx.fillStyle = '#3a3d47';
  ctx.fillRect(sx - 1, top + 11, 2, 3);
}

function drawPrinter(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 12, 4);
  const { ctx, sx, sy } = d;
  const w = 19 * s, h = 13 * s;
  const top = sy - h;
  // body
  const grad = ctx.createLinearGradient(sx - w / 2, top, sx - w / 2, top + h);
  grad.addColorStop(0, '#d8dde7');
  grad.addColorStop(1, '#9aa0ae');
  ctx.fillStyle = grad;
  ctx.fillRect(sx - w / 2, top, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - w / 2, top, w, h);
  // paper sheet sticking out
  ctx.fillStyle = '#fff';
  ctx.fillRect(sx - 6, top - 4, 12, 5);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.strokeRect(sx - 6, top - 4, 12, 5);
  // tiny status LED
  ctx.fillStyle = '#6ee7b7';
  ctx.fillRect(sx + w / 2 - 3, top + 2, 2, 2);
}

function drawServerRack(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 9, 3);
  const { ctx, sx, sy } = d;
  const w = 14 * s, h = 28 * s;
  const top = sy - h;
  // tall dark rack
  ctx.fillStyle = '#1a1d2a';
  ctx.fillRect(sx - w / 2, top, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - w / 2, top, w, h);
  // rack unit dividers
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let i = 1; i < 6; i++) {
    const y = top + (h / 6) * i;
    ctx.beginPath();
    ctx.moveTo(sx - w / 2, y);
    ctx.lineTo(sx + w / 2, y);
    ctx.stroke();
  }
  // blinking LEDs (right column)
  const colors = ['#6ee7b7', '#2fb8ff', '#ffb84c', '#6ee7b7', '#ff6347', '#2fb8ff'];
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = colors[i];
    ctx.fillRect(sx + w / 2 - 3, top + 2 + (h / 6) * i, 2, 2);
  }
}

function drawCctv(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 14, 3);
  const { ctx, sx, sy } = d;
  const w = 24 * s, h = 16 * s;
  const top = sy - 18 * s;
  // dark monitor wall
  ctx.fillStyle = '#1a1d2a';
  ctx.fillRect(sx - w / 2, top, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - w / 2, top, w, h);
  // 2x2 camera feed grid
  const cellW = (w - 3) / 2;
  const cellH = (h - 3) / 2;
  const colors2 = ['rgba(47,184,255,0.35)', 'rgba(110,231,183,0.35)', 'rgba(255,71,87,0.35)', 'rgba(255,184,76,0.35)'];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const x = sx - w / 2 + 1 + c * (cellW + 1);
      const y = top + 1 + r * (cellH + 1);
      ctx.fillStyle = colors2[r * 2 + c];
      ctx.fillRect(x, y, cellW, cellH);
    }
  }
}

function drawSofa(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 22, 5);
  const { ctx, sx, sy } = d;
  const w = 28 * s, h = 8 * s;
  const top = sy - 12 * s;
  // base seat — long pill
  ctx.fillStyle = '#5a606e';
  ctx.beginPath();
  ctx.roundRect(sx - w / 2, top, w, h, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.stroke();
  // back rest
  ctx.fillStyle = '#42485a';
  ctx.beginPath();
  ctx.roundRect(sx - w / 2, top - 6, w, 6, 3);
  ctx.fill();
  ctx.stroke();
  // 2 cushion lines
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const x = sx - w / 2 + (w / 3) * i;
    ctx.beginPath();
    ctx.moveTo(x, top + 1);
    ctx.lineTo(x, top + h - 1);
    ctx.stroke();
  }
}

function drawPlant(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 7, 3);
  const { ctx, sx, sy } = d;
  // pot
  ctx.fillStyle = '#e8eaef';
  ctx.beginPath();
  ctx.moveTo(sx - 6 * s, sy - 5 * s);
  ctx.lineTo(sx - 5 * s, sy - 1);
  ctx.lineTo(sx + 5 * s, sy - 1);
  ctx.lineTo(sx + 6 * s, sy - 5 * s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // leaves — three strokes fanning up
  ctx.strokeStyle = '#3da55a';
  ctx.lineWidth = 2 * s;
  ctx.lineCap = 'round';
  const baseY = sy - 5 * s;
  ctx.beginPath();
  ctx.moveTo(sx, baseY);
  ctx.quadraticCurveTo(sx - 5, baseY - 8, sx - 6, baseY - 12);
  ctx.moveTo(sx, baseY);
  ctx.quadraticCurveTo(sx + 5, baseY - 8, sx + 6, baseY - 12);
  ctx.moveTo(sx, baseY);
  ctx.lineTo(sx, baseY - 14);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawElevator(d: DrawCtx) {
  const s = d.scale ?? 1;
  shadow(d, 12, 3);
  const { ctx, sx, sy } = d;
  const w = 20 * s, h = 24 * s;
  const top = sy - h;
  // metal frame
  const grad = ctx.createLinearGradient(sx - w / 2, top, sx + w / 2, top);
  grad.addColorStop(0, '#5a5e69');
  grad.addColorStop(0.5, '#9aa0ae');
  grad.addColorStop(1, '#5a5e69');
  ctx.fillStyle = grad;
  ctx.fillRect(sx - w / 2, top, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - w / 2, top, w, h);
  // door split line down the centre
  ctx.beginPath();
  ctx.moveTo(sx, top);
  ctx.lineTo(sx, top + h);
  ctx.stroke();
  // up/down arrow panel
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(sx + w / 2 + 2, top + 4, 4, 8);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 6px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('▲', sx + w / 2 + 4, top + 8);
}

const DRAWERS: Record<FurnitureKind, (d: DrawCtx) => void> = {
  desk:            drawDesk,
  chair:           drawChair,
  meeting_table:   drawMeetingTable,
  whiteboard:      drawWhiteboard,
  coffee_machine:  drawCoffeeMachine,
  water_dispenser: drawWaterDispenser,
  printer:         drawPrinter,
  server_rack:     drawServerRack,
  cctv:            drawCctv,
  sofa:            drawSofa,
  plant:           drawPlant,
  elevator_door:   drawElevator,
};

/** Public API — draw a single furniture item. Unknown kinds are no-ops. */
export function drawFurnitureSprite(
  ctx: CanvasRenderingContext2D,
  kind: string,
  sx: number,
  sy: number,
  scale = 1,
) {
  const fn = DRAWERS[kind as FurnitureKind];
  if (fn) fn({ ctx, sx, sy, scale });
}
