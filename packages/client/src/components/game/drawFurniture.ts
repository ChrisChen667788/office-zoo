/**
 * drawFurniture — true isometric 3D primitives for office furniture.
 *
 * v0.6.4 — second rewrite. The v0.6.3 flat sprites (top face only) read as
 * stickers on a dark map; this version draws every piece as a real iso box
 * with three shaded faces (top/left/right) plus a soft floor drop-shadow,
 * so each item has the same volumetric language as Habbo / Two Point /
 * Townscaper webs do.
 *
 * Public API (compatible with the v0.6.3 caller):
 *   drawFurnitureSprite(ctx, kind, sx, sy, scale = 1, t = 0)
 *
 * `t` is `performance.now() / 1000` — used for LED blink, coffee steam
 * curl, and CCTV scanline animation. Caller can pass 0 for static frames.
 *
 * The anchor (sx, sy) is the BOTTOM-CENTRE of the FRONT face — i.e., the
 * point where the front edge of the footprint meets the floor in iso
 * screen space. Drawers paint upward + back from there.
 */

export type FurnitureKind =
  | 'desk' | 'chair' | 'meeting_table' | 'whiteboard'
  | 'coffee_machine' | 'water_dispenser' | 'printer'
  | 'server_rack' | 'cctv' | 'sofa' | 'plant' | 'elevator_door';

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  sx: number;
  sy: number;
  scale: number;
  /** seconds since page load — for animated LEDs / steam. */
  t: number;
}

// ── Iso math ─────────────────────────────────────────────────────────────
// 30° iso. world (x, y, z) → screen ((x - y) * COS, (x + y) * SIN - z)
// Anchor convention: world origin sits at (sx, sy). Box extends:
//   - x: -w/2 … +w/2  (width, perpendicular to camera-front)
//   - y:    0 … +d    (depth, AWAY from camera = up-left on screen)
//   - z:    0 … +h    (height, straight up on screen)

const COS = Math.cos(Math.PI / 6); // 0.8660
const SIN = Math.sin(Math.PI / 6); // 0.5000

function proj(sx: number, sy: number, x: number, y: number, z: number) {
  return {
    px: sx + (x - y) * COS,
    py: sy + (x + y) * SIN - z,
  };
}

interface BoxColors {
  top: string;
  left: string;     // front face (faces the camera-front, gets some light)
  right: string;    // right side face (faces camera-right, in shadow)
  outline?: string; // optional crisp edge stroke
}

/** Draw a volumetric iso box anchored at front-bottom-centre.
 *  The three visible faces (top + front + right) are filled in shading
 *  order — top brightest, front medium, right darkest — which gives the
 *  whole thing solid weight without needing per-pixel lighting. */
function isoBox(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  w: number, d: number, h: number,
  colors: BoxColors,
) {
  // 8 corners
  const bfl = proj(sx, sy, -w / 2, 0,  0);
  const bfr = proj(sx, sy,  w / 2, 0,  0);
  const bbl = proj(sx, sy, -w / 2, d,  0);
  const bbr = proj(sx, sy,  w / 2, d,  0);
  const tfl = proj(sx, sy, -w / 2, 0,  h);
  const tfr = proj(sx, sy,  w / 2, 0,  h);
  const tbl = proj(sx, sy, -w / 2, d,  h);
  const tbr = proj(sx, sy,  w / 2, d,  h);

  // Top face (lit)
  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.moveTo(tfl.px, tfl.py);
  ctx.lineTo(tfr.px, tfr.py);
  ctx.lineTo(tbr.px, tbr.py);
  ctx.lineTo(tbl.px, tbl.py);
  ctx.closePath();
  ctx.fill();

  // Front face (medium) — faces camera-down-left
  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(bfl.px, bfl.py);
  ctx.lineTo(bfr.px, bfr.py);
  ctx.lineTo(tfr.px, tfr.py);
  ctx.lineTo(tfl.px, tfl.py);
  ctx.closePath();
  ctx.fill();

  // Right face (darkest) — faces camera-down-right
  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(bfr.px, bfr.py);
  ctx.lineTo(bbr.px, bbr.py);
  ctx.lineTo(tbr.px, tbr.py);
  ctx.lineTo(tfr.px, tfr.py);
  ctx.closePath();
  ctx.fill();

  // Crisp outline along the silhouette so edges read at small sizes
  if (colors.outline) {
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    // top
    ctx.moveTo(tfl.px, tfl.py);
    ctx.lineTo(tfr.px, tfr.py);
    ctx.lineTo(tbr.px, tbr.py);
    ctx.lineTo(tbl.px, tbl.py);
    ctx.closePath();
    ctx.stroke();
    // front-down + right-down silhouette
    ctx.beginPath();
    ctx.moveTo(tfl.px, tfl.py);
    ctx.lineTo(bfl.px, bfl.py);
    ctx.lineTo(bfr.px, bfr.py);
    ctx.lineTo(bbr.px, bbr.py);
    ctx.stroke();
    // vertical seams
    ctx.beginPath();
    ctx.moveTo(tfr.px, tfr.py);
    ctx.lineTo(bfr.px, bfr.py);
    ctx.stroke();
  }
}

/** Soft drop-shadow under the sprite. Uses `filter: blur` for a real
 *  Gaussian (not a stack of ellipses) so it composites cleanly over the
 *  room floor texture. */
function dropShadow(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  rx: number, ry: number,
) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.filter = 'blur(2.5px)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 1, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Per-kind drawers ─────────────────────────────────────────────────────

function drawDesk(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy, t } = d;
  dropShadow(ctx, sx, sy, 18 * s, 5 * s);
  // Wood-tone tabletop volume
  isoBox(ctx, sx, sy, 26 * s, 16 * s, 8 * s, {
    top:     '#7a5430',
    left:    '#5c3f23',
    right:   '#42301c',
    outline: 'rgba(0,0,0,0.35)',
  });
  // Monitor — small dark slab on top, slightly back from front edge
  const monAnchor = proj(sx, sy, 0, 8 * s, 8 * s);
  isoBox(ctx, monAnchor.px, monAnchor.py, 12 * s, 2 * s, 8 * s, {
    top:     '#1a1f33',
    left:    '#0f1730',
    right:   '#070a1c',
    outline: 'rgba(0,0,0,0.5)',
  });
  // Screen glow — faint cyan rectangle on the front face of the monitor
  const screenA = proj(sx, sy, -5 * s, 8 * s, 7 * s);
  const screenB = proj(sx, sy,  5 * s, 8 * s, 7 * s);
  const screenC = proj(sx, sy,  5 * s, 8 * s, 14 * s);
  const screenD = proj(sx, sy, -5 * s, 8 * s, 14 * s);
  // Animated screen tint — slow blue → teal hue shift
  const hueT = (Math.sin(t * 0.8) + 1) * 0.5;       // 0..1
  const r = Math.round(40 + hueT * 30);
  const g = Math.round(140 + hueT * 60);
  const b = Math.round(220 - hueT * 20);
  ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
  ctx.beginPath();
  ctx.moveTo(screenA.px, screenA.py);
  ctx.lineTo(screenB.px, screenB.py);
  ctx.lineTo(screenC.px, screenC.py);
  ctx.lineTo(screenD.px, screenD.py);
  ctx.closePath();
  ctx.fill();
  // Tiny scanline highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.7;
  const lineY = screenA.py + (screenD.py - screenA.py) * (0.2 + 0.6 * hueT);
  ctx.beginPath();
  ctx.moveTo(screenA.px, lineY);
  ctx.lineTo(screenB.px, lineY);
  ctx.stroke();
}

function drawChair(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy } = d;
  dropShadow(ctx, sx, sy, 7 * s, 3 * s);
  // Seat cushion
  isoBox(ctx, sx, sy, 11 * s, 11 * s, 4 * s, {
    top:     '#3a3f55',
    left:    '#262a3a',
    right:   '#1a1d2a',
    outline: 'rgba(0,0,0,0.4)',
  });
  // Back rest — thin tall slab at the back
  const backA = proj(sx, sy, 0, 9 * s, 4 * s);
  isoBox(ctx, backA.px, backA.py, 11 * s, 2 * s, 10 * s, {
    top:     '#2c3142',
    left:    '#1c2030',
    right:   '#10141f',
    outline: 'rgba(0,0,0,0.45)',
  });
}

function drawMeetingTable(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy } = d;
  dropShadow(ctx, sx, sy, 30 * s, 9 * s);
  // Wide oval table — drawn as an ellipse top + a thin extruded "lip"
  const top = proj(sx, sy, 0, 12 * s, 6 * s);
  const lipBottom = proj(sx, sy, 0, 12 * s, 4 * s);
  // Lip (thin band visible on the front)
  ctx.fillStyle = '#5c3f23';
  ctx.beginPath();
  ctx.ellipse(lipBottom.px, lipBottom.py, 32 * s * COS, 12 * s * SIN, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#42301c';
  ctx.fillRect(lipBottom.px - 32 * s * COS, lipBottom.py - 1, 64 * s * COS, 2);
  // Top surface — wood-tone gradient ellipse
  const grad = ctx.createLinearGradient(top.px - 32 * s * COS, top.py, top.px + 32 * s * COS, top.py);
  grad.addColorStop(0, '#9a7148');
  grad.addColorStop(0.5, '#a87b50');
  grad.addColorStop(1, '#7d5b39');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(top.px, top.py, 32 * s * COS, 12 * s * SIN, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Glossy reflection arc
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.ellipse(top.px - 8 * s, top.py - 2 * s, 16 * s * COS, 4 * s * SIN, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawWhiteboard(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy } = d;
  dropShadow(ctx, sx, sy, 14 * s, 3 * s);
  // Thin frame — a slim iso box standing tall
  isoBox(ctx, sx, sy, 26 * s, 2 * s, 18 * s, {
    top:     '#aab0bd',
    left:    '#f4f6fa',                // the white face
    right:   '#787e8c',
    outline: 'rgba(0,0,0,0.3)',
  });
  // Marker scribbles on the white front face
  const a = proj(sx, sy, -10 * s, 0,  3 * s);
  const a2 = proj(sx, sy, -2 * s, 0,  3 * s);
  const b = proj(sx, sy, -10 * s, 0,  7 * s);
  const b2 = proj(sx, sy,  6 * s, 0,  7 * s);
  const c = proj(sx, sy, -10 * s, 0, 11 * s);
  const c2 = proj(sx, sy, -4 * s, 0, 11 * s);
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ff4757';
  ctx.beginPath();
  ctx.moveTo(a.px,  a.py);  ctx.lineTo(a2.px, a2.py);
  ctx.stroke();
  ctx.strokeStyle = '#2fb8ff';
  ctx.beginPath();
  ctx.moveTo(b.px,  b.py);  ctx.lineTo(b2.px, b2.py);
  ctx.stroke();
  ctx.strokeStyle = '#6ee7b7';
  ctx.beginPath();
  ctx.moveTo(c.px,  c.py);  ctx.lineTo(c2.px, c2.py);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawCoffeeMachine(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy, t } = d;
  dropShadow(ctx, sx, sy, 8 * s, 3 * s);
  // Stainless body
  isoBox(ctx, sx, sy, 12 * s, 9 * s, 16 * s, {
    top:     '#cdd1da',
    left:    '#9095a1',
    right:   '#5e636e',
    outline: 'rgba(0,0,0,0.45)',
  });
  // Display screen on the front face — small cyan rectangle
  const sA = proj(sx, sy, -4 * s, 0, 12 * s);
  const sB = proj(sx, sy,  4 * s, 0, 12 * s);
  const sC = proj(sx, sy,  4 * s, 0, 14 * s);
  const sD = proj(sx, sy, -4 * s, 0, 14 * s);
  ctx.fillStyle = '#2fb8ff';
  ctx.beginPath();
  ctx.moveTo(sA.px, sA.py); ctx.lineTo(sB.px, sB.py);
  ctx.lineTo(sC.px, sC.py); ctx.lineTo(sD.px, sD.py); ctx.closePath();
  ctx.fill();
  // Spout & cup on the front
  const cupA = proj(sx, sy, 0, 0, 5 * s);
  ctx.fillStyle = '#f4f4ff';
  ctx.beginPath();
  ctx.ellipse(cupA.px, cupA.py, 4 * s * COS, 1.6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();
  // Animated steam wisps — two curls offset in time
  const top = proj(sx, sy, 0, 4 * s, 16 * s);
  ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.15 * Math.sin(t * 2)})`;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const phase = t * 1.4 + k * Math.PI;
    const sway = Math.sin(phase) * 3;
    ctx.beginPath();
    ctx.moveTo(top.px - 2 + k * 4, top.py);
    ctx.quadraticCurveTo(top.px + sway, top.py - 6, top.px - 1 + k * 2, top.py - 12);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function drawWaterDispenser(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy } = d;
  dropShadow(ctx, sx, sy, 8 * s, 3 * s);
  // Base unit
  isoBox(ctx, sx, sy, 11 * s, 9 * s, 11 * s, {
    top:     '#e8eaef',
    left:    '#bfc3cc',
    right:   '#888d96',
    outline: 'rgba(0,0,0,0.35)',
  });
  // Blue water bottle on top — cone-ish shape painted as ellipse + tapered band
  const bottomA = proj(sx, sy, -3 * s, 4 * s, 11 * s);
  const bottomB = proj(sx, sy,  3 * s, 4 * s, 11 * s);
  const topA = proj(sx, sy, -2.5 * s, 4 * s, 18 * s);
  const topB = proj(sx, sy,  2.5 * s, 4 * s, 18 * s);
  const grad = ctx.createLinearGradient(bottomA.px, bottomA.py, topA.px, topA.py);
  grad.addColorStop(0, '#5cc1ff');
  grad.addColorStop(1, '#9ed8ff');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(bottomA.px, bottomA.py);
  ctx.lineTo(bottomB.px, bottomB.py);
  ctx.lineTo(topB.px,    topB.py);
  ctx.lineTo(topA.px,    topA.py);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Bottle highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(topA.px + 1, topA.py + 1, 1.5, (bottomA.py - topA.py) - 2);
  // Tap on front
  const tap = proj(sx, sy, 0, 0, 6 * s);
  ctx.fillStyle = '#3a3d47';
  ctx.fillRect(tap.px - 1.2, tap.py - 1.5, 2.5, 3);
}

function drawPrinter(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy, t } = d;
  dropShadow(ctx, sx, sy, 12 * s, 4 * s);
  // Body
  isoBox(ctx, sx, sy, 18 * s, 11 * s, 11 * s, {
    top:     '#dde2ec',
    left:    '#aab0bd',
    right:   '#787e8c',
    outline: 'rgba(0,0,0,0.4)',
  });
  // Paper sheet sticking out the back top
  const pA = proj(sx, sy, -4 * s, 9 * s, 11 * s);
  const pB = proj(sx, sy,  4 * s, 9 * s, 11 * s);
  const pC = proj(sx, sy,  4 * s, 9 * s, 16 * s);
  const pD = proj(sx, sy, -4 * s, 9 * s, 16 * s);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(pA.px, pA.py);
  ctx.lineTo(pB.px, pB.py);
  ctx.lineTo(pC.px, pC.py);
  ctx.lineTo(pD.px, pD.py);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Faint print lines
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.5;
  for (let k = 0; k < 3; k++) {
    const lA = proj(sx, sy, -3 * s, 9 * s, 12 * s + k * 1.4);
    const lB = proj(sx, sy,  3 * s, 9 * s, 12 * s + k * 1.4);
    ctx.beginPath();
    ctx.moveTo(lA.px, lA.py);
    ctx.lineTo(lB.px, lB.py);
    ctx.stroke();
  }
  // Status LED — green, blinks every ~3s with a tiny "warming up" amber
  const blink = (Math.sin(t * 2.2) + 1) * 0.5;
  const led = proj(sx, sy, 6 * s, 0, 9 * s);
  ctx.fillStyle = blink > 0.85 ? '#ffd54f' : '#6ee7b7';
  ctx.beginPath();
  ctx.arc(led.px, led.py, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = blink > 0.85 ? '#ffd54f' : '#6ee7b7';
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawServerRack(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy, t } = d;
  dropShadow(ctx, sx, sy, 9 * s, 3 * s);
  // Tall rack
  isoBox(ctx, sx, sy, 14 * s, 11 * s, 32 * s, {
    top:     '#2a2f3e',
    left:    '#1a1d2a',
    right:   '#10131c',
    outline: 'rgba(0,0,0,0.55)',
  });
  // Rack unit dividers on the front face
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 0.6;
  for (let i = 1; i < 8; i++) {
    const z = 32 * s * (i / 8);
    const a = proj(sx, sy, -7 * s, 0, z);
    const b = proj(sx, sy,  7 * s, 0, z);
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
  }
  // Animated LED column on the right edge of the front face
  // Each row blinks with a deterministic phase based on its index, so
  // multiple racks side-by-side don't all blink in unison.
  const ledX = 6 * s;
  for (let i = 0; i < 8; i++) {
    const phase = t * 1.4 + i * 1.7;
    const on = Math.sin(phase) > 0.2;
    if (!on) continue;
    const z = 32 * s * (i / 8) + 1.5 * s;
    const ledP = proj(sx, sy, ledX, 0, z);
    const palette = ['#6ee7b7', '#2fb8ff', '#ffb84c', '#a78bfa', '#f87171'];
    const color = palette[i % palette.length];
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(ledP.px, ledP.py, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawCctv(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy, t } = d;
  dropShadow(ctx, sx, sy, 14 * s, 3 * s);
  // Wall-mounted monitor bank — thin slab
  isoBox(ctx, sx, sy, 26 * s, 3 * s, 18 * s, {
    top:     '#2a2f3e',
    left:    '#1a1d2a',
    right:   '#10131c',
    outline: 'rgba(0,0,0,0.55)',
  });
  // 2x2 camera feed grid on the front face
  const palette = ['#2fb8ff', '#6ee7b7', '#ff6347', '#ffb84c'];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const x0 = -10 * s + c * 10 * s;
      const z0 =  3 * s + r * 7 * s;
      const a = proj(sx, sy, x0,         0, z0);
      const b = proj(sx, sy, x0 + 9 * s, 0, z0);
      const cP = proj(sx, sy, x0 + 9 * s, 0, z0 + 6 * s);
      const dP = proj(sx, sy, x0,         0, z0 + 6 * s);
      const color = palette[r * 2 + c];
      ctx.fillStyle = color + '55';
      ctx.beginPath();
      ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py);
      ctx.lineTo(cP.px, cP.py); ctx.lineTo(dP.px, dP.py); ctx.closePath();
      ctx.fill();
      // Animated horizontal scan line on this feed
      const scanT = ((t * 0.6 + (r * 2 + c) * 0.25) % 1);
      const scanZ = z0 + 6 * s * scanT;
      const sa = proj(sx, sy, x0,         0, scanZ);
      const sb = proj(sx, sy, x0 + 9 * s, 0, scanZ);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(sa.px, sa.py);
      ctx.lineTo(sb.px, sb.py);
      ctx.stroke();
    }
  }
}

function drawSofa(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy } = d;
  dropShadow(ctx, sx, sy, 24 * s, 6 * s);
  // Seat block — wide low rectangle
  isoBox(ctx, sx, sy, 32 * s, 13 * s, 6 * s, {
    top:     '#6e7689',
    left:    '#4a5063',
    right:   '#2f3445',
    outline: 'rgba(0,0,0,0.4)',
  });
  // Back rest — taller block at the back
  const backA = proj(sx, sy, 0, 11 * s, 6 * s);
  isoBox(ctx, backA.px, backA.py, 32 * s, 2 * s, 8 * s, {
    top:     '#4a5063',
    left:    '#3a4053',
    right:   '#262a3a',
    outline: 'rgba(0,0,0,0.45)',
  });
  // Cushion seams on top — divides into 3 cushions
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.7;
  for (let k = 1; k < 3; k++) {
    const x = -16 * s + k * (32 * s / 3);
    const a = proj(sx, sy, x, 0,        6 * s);
    const b = proj(sx, sy, x, 13 * s,   6 * s);
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
  }
  // Arm rests at left + right ends
  for (const ax of [-16 * s, 16 * s]) {
    const armA = proj(sx, sy, ax, 0, 0);
    isoBox(ctx, armA.px, armA.py, 3 * s, 13 * s, 9 * s, {
      top:     '#4a5063',
      left:    '#3a4053',
      right:   '#262a3a',
      outline: 'rgba(0,0,0,0.45)',
    });
  }
}

function drawPlant(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy, t } = d;
  dropShadow(ctx, sx, sy, 7 * s, 3 * s);
  // Terracotta pot — small iso box
  isoBox(ctx, sx, sy, 9 * s, 9 * s, 6 * s, {
    top:     '#3a2818',
    left:    '#a8623d',
    right:   '#7a4528',
    outline: 'rgba(0,0,0,0.4)',
  });
  // Foliage — three layered leaf clumps with subtle sway
  const sway = Math.sin(t * 0.7) * 1.2;
  const baseTop = proj(sx, sy, 0, 4 * s, 6 * s);
  // Back darkest leaf clump
  ctx.fillStyle = '#2d6e3a';
  ctx.beginPath();
  ctx.ellipse(baseTop.px - 4 + sway, baseTop.py - 6, 6 * s, 8 * s, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Right clump
  ctx.fillStyle = '#3da55a';
  ctx.beginPath();
  ctx.ellipse(baseTop.px + 4 - sway, baseTop.py - 7, 5 * s, 7 * s, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // Front lit clump
  ctx.fillStyle = '#56c479';
  ctx.beginPath();
  ctx.ellipse(baseTop.px + sway * 0.5, baseTop.py - 10, 5 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tiny leaf vein highlights
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(baseTop.px, baseTop.py - 4);
  ctx.lineTo(baseTop.px, baseTop.py - 14);
  ctx.stroke();
}

function drawElevator(d: DrawCtx) {
  const s = d.scale;
  const { ctx, sx, sy, t } = d;
  dropShadow(ctx, sx, sy, 14 * s, 3 * s);
  // Doorway frame — tall thin box
  isoBox(ctx, sx, sy, 22 * s, 4 * s, 26 * s, {
    top:     '#3a3f55',
    left:    '#5a606e',
    right:   '#36394a',
    outline: 'rgba(0,0,0,0.5)',
  });
  // Door split — vertical line down the front center
  const dTop = proj(sx, sy, 0, 0, 24 * s);
  const dBot = proj(sx, sy, 0, 0, 1 * s);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(dTop.px, dTop.py);
  ctx.lineTo(dBot.px, dBot.py);
  ctx.stroke();
  // Door panels — subtle vertical reflection bands
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  const pL_t = proj(sx, sy, -8 * s, 0, 24 * s);
  ctx.fillRect(pL_t.px, pL_t.py, 1.5, 22 * s);
  const pR_t = proj(sx, sy,  6 * s, 0, 24 * s);
  ctx.fillRect(pR_t.px, pR_t.py, 1.5, 22 * s);
  // Up arrow indicator above the door — pulses purple
  const arrow = proj(sx, sy, 11 * s, 0, 22 * s);
  const pulse = (Math.sin(t * 2) + 1) * 0.5;
  ctx.fillStyle = `rgba(124,58,237,${0.5 + pulse * 0.5})`;
  ctx.beginPath();
  ctx.moveTo(arrow.px, arrow.py - 4);
  ctx.lineTo(arrow.px - 3, arrow.py + 1);
  ctx.lineTo(arrow.px + 3, arrow.py + 1);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = '#7c3aed';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;
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

/** Public API — draw a single furniture item. Unknown kinds are no-ops.
 *  `t` is `performance.now() / 1000` for animations; pass 0 for static. */
export function drawFurnitureSprite(
  ctx: CanvasRenderingContext2D,
  kind: string,
  sx: number,
  sy: number,
  scale = 1,
  t = 0,
) {
  const fn = DRAWERS[kind as FurnitureKind];
  if (fn) fn({ ctx, sx, sy, scale, t });
}
