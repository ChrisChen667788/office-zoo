import { useRef, useEffect, useCallback } from 'react';
import { activityIcons, itemIcons } from '../../constants/icons';
import { ROOM_FURNITURE, FURNITURE_TYPES, type FurnitureKind } from '@furball/shared';
import { drawFurnitureSprite } from './drawFurniture';
import { pickEmoteForPlayer, PROX_PX } from './idleMoments';

/* ---------- Types ---------- */

interface PlayerInfo {
  id: string;
  name: string;
  isAlive: boolean;
  /** Position. v0.5+ servers fill (x, y) with logical world coords + (vx, vy)
   *  velocity, which the client uses for dead-reckoning between 250ms ticks.
   *  Pre-v0.5 servers leave vx/vy undefined and the renderer falls back to
   *  Catmull-Rom corridor curves on `pathProgress`. */
  position: {
    x: number;
    y: number;
    room: string;
    vx?: number;
    vy?: number;
    pathProgress?: number;
    destination?: string;
  };
  /** Free-roam activity, drives the per-player badge overlay. */
  activity?: { kind: 'idle' | 'work' | 'chat' | 'sneak' | 'meeting' | 'commute' };
  /** Pre-formatted Chinese caption for the tooltip / hover. */
  activityText?: string;
  role?: string;
  team?: string;
}

/** Logical world dims — must match `MAP_W` / `MAP_H` in @furball/shared. We
 *  duplicate locally so this file has no monorepo deps (rootDir hassle). */
const LOGICAL_W = 1000;
const LOGICAL_H = 700;

interface GameMapProps {
  players: PlayerInfo[];
  avatarUrls?: Record<string, string>;
  /** Highlight + pulse the currently-speaking player. */
  currentSpeakerId?: string | null;
}

/* ---------- Room definitions ---------- */

interface RoomDef {
  id: string;
  gridX: number;
  gridY: number;
  width: number;
  height: number;
  color: string;
  label: string;
}

const ROOMS: RoomDef[] = [
  { id: '开放工区', gridX: 2, gridY: 2, width: 3, height: 3, color: '#3a7bd5', label: '开放工区' },
  { id: '茶水间',   gridX: 0, gridY: 0, width: 2, height: 2, color: '#e67e22', label: '茶水间' },
  { id: '会议室',   gridX: 4, gridY: 0, width: 2, height: 2, color: '#5e17ff', label: '会议室' },
  { id: 'HR办公室', gridX: 6, gridY: 1, width: 2, height: 2, color: '#e74c8a', label: 'HR办公室' },
  { id: '服务器机房', gridX: 0, gridY: 3, width: 2, height: 2, color: '#f39c12', label: '服务器机房' },
  { id: '监控室',   gridX: 6, gridY: 3, width: 2, height: 2, color: '#546e7a', label: '监控室' },
  { id: '产品部',   gridX: 0, gridY: 5, width: 2, height: 2, color: '#2fb8ff', label: '产品部' },
  { id: '老板办公室', gridX: 4, gridY: 5, width: 3, height: 2, color: '#8d6e63', label: '老板办公室' },
  { id: '文印室',   gridX: 7, gridY: 5, width: 2, height: 2, color: '#78909c', label: '文印室' },
  { id: '电梯间',   gridX: 2, gridY: 0, width: 2, height: 1, color: '#7c3aed', label: '电梯间' },
];

/* Corridor connections between room centres */
const CORRIDORS: [string, string][] = [
  ['茶水间', '电梯间'],
  ['电梯间', '会议室'],
  ['电梯间', '开放工区'],
  ['开放工区', '服务器机房'],
  ['开放工区', '监控室'],
  ['开放工区', 'HR办公室'],
  ['服务器机房', '产品部'],
  ['开放工区', '老板办公室'],
  ['老板办公室', '文印室'],
  ['监控室', '文印室'],
  ['会议室', 'HR办公室'],
];

/* ---------- Isometric helpers ---------- */

const TILE = 52;         // base tile size in pixels
const WALL_H = 28;       // wall height in iso space
const ORIGIN_X = 450;    // canvas centre offset X
const ORIGIN_Y = 60;     // canvas centre offset Y

function toIso(x: number, y: number): { sx: number; sy: number } {
  const angle = Math.PI / 6; // 30-degree
  return {
    sx: (x - y) * Math.cos(angle) * TILE + ORIGIN_X,
    sy: (x + y) * Math.sin(angle) * TILE + ORIGIN_Y,
  };
}

// darken/lighten no longer needed — using rgba with hexToRgb instead

/* Room centre in iso space */
function roomCenter(room: RoomDef): { sx: number; sy: number } {
  return toIso(room.gridX + room.width / 2, room.gridY + room.height / 2);
}

/* ---------- Drawing ---------- */

function drawIsoGrid(_ctx: CanvasRenderingContext2D, _cols: number, _rows: number) {
  // v0.6.4 — grid intentionally disabled. The 0.03-α cyan lines added
  // graph-paper noise behind every room and made the map look like a
  // designer mockup. Rooms now provide their own floor texture, so the
  // global grid is no longer needed for spatial reference.
}

function hexToRgb(hex: string): [number, number, number] {
  const c = parseInt(hex.replace('#', ''), 16);
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}

/** Mix two RGB triplets — `t` 0..1, 0 = a, 1 = b. */
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function drawIsoRoom(ctx: CanvasRenderingContext2D, room: RoomDef) {
  const { gridX: gx, gridY: gy, width: w, height: h, color, label } = room;
  const [r, g, b] = hexToRgb(color);

  // Floor corners in iso screen space
  const tl = toIso(gx,         gy);
  const tr = toIso(gx + w,     gy);
  const br = toIso(gx + w, gy + h);
  const bl = toIso(gx,     gy + h);

  // ── Floor base — desaturated wash of the team colour, much darker than
  //    the v0.6.3 0.2-α flat fill. Wood/stone floors live on top.
  const baseRgb = mix([r, g, b], [12, 14, 32], 0.55); // pulled toward bg
  ctx.fillStyle = `rgba(${baseRgb[0]},${baseRgb[1]},${baseRgb[2]},0.95)`;
  ctx.beginPath();
  ctx.moveTo(tl.sx, tl.sy);
  ctx.lineTo(tr.sx, tr.sy);
  ctx.lineTo(br.sx, br.sy);
  ctx.lineTo(bl.sx, bl.sy);
  ctx.closePath();
  ctx.fill();

  // ── Iso tile pattern — diamond plates (one per grid cell), each shaded
  //    with a tiny gradient so the floor reads as polished stone instead
  //    of a flat painted block. Costs ~w*h fills/room — cheap.
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const a = toIso(gx + i,     gy + j);
      const b2 = toIso(gx + i + 1, gy + j);
      const c = toIso(gx + i + 1, gy + j + 1);
      const d = toIso(gx + i,     gy + j + 1);
      // Checker brightness — every other tile a touch brighter
      const checker = (i + j) % 2 === 0 ? 1.05 : 0.92;
      const tileRgb = mix(baseRgb, [255, 255, 255], 0.04);
      ctx.fillStyle = `rgba(${Math.min(255, tileRgb[0] * checker)},${Math.min(255, tileRgb[1] * checker)},${Math.min(255, tileRgb[2] * checker)},0.55)`;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b2.sx, b2.sy);
      ctx.lineTo(c.sx, c.sy);
      ctx.lineTo(d.sx, d.sy);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ── Soft inset vignette — radial dark gradient toward the room centre
  //    edges. Gives the floor depth without per-pixel SSAO.
  const cx = (tl.sx + tr.sx + br.sx + bl.sx) / 4;
  const cy = (tl.sy + tr.sy + br.sy + bl.sy) / 4;
  const radius = Math.max(Math.abs(tr.sx - tl.sx), Math.abs(bl.sy - tl.sy)) * 0.7;
  const vign = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = vign;
  ctx.beginPath();
  ctx.moveTo(tl.sx, tl.sy);
  ctx.lineTo(tr.sx, tr.sy);
  ctx.lineTo(br.sx, br.sy);
  ctx.lineTo(bl.sx, bl.sy);
  ctx.closePath();
  ctx.fill();

  // ── Glow border — team-coloured, slightly brighter than v0.6.3
  ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(tl.sx, tl.sy);
  ctx.lineTo(tr.sx, tr.sy);
  ctx.lineTo(br.sx, br.sy);
  ctx.lineTo(bl.sx, bl.sy);
  ctx.closePath();
  ctx.stroke();

  // ── Glass back walls — taller (WALL_H × 1.3) with a vertical gradient
  //    from team-tinted base to near-transparent top, so they don't block
  //    the view of furniture inside but still give "a room exists here".
  const wallH = WALL_H * 1.3;
  // Left back wall (along the y-axis edge of the floor at gx)
  const lwGrad = ctx.createLinearGradient(0, tl.sy - wallH, 0, tl.sy);
  lwGrad.addColorStop(0, `rgba(${r},${g},${b},0.05)`);
  lwGrad.addColorStop(1, `rgba(${r},${g},${b},0.32)`);
  ctx.fillStyle = lwGrad;
  ctx.beginPath();
  ctx.moveTo(tl.sx, tl.sy);
  ctx.lineTo(tr.sx, tr.sy);
  ctx.lineTo(tr.sx, tr.sy - wallH);
  ctx.lineTo(tl.sx, tl.sy - wallH);
  ctx.closePath();
  ctx.fill();
  // Right back wall (along the x-axis edge at gy)
  const rwGrad = ctx.createLinearGradient(0, tl.sy - wallH, 0, bl.sy);
  rwGrad.addColorStop(0, `rgba(${r},${g},${b},0.05)`);
  rwGrad.addColorStop(1, `rgba(${r},${g},${b},0.42)`);
  ctx.fillStyle = rwGrad;
  ctx.beginPath();
  ctx.moveTo(tl.sx, tl.sy);
  ctx.lineTo(bl.sx, bl.sy);
  ctx.lineTo(bl.sx, bl.sy - wallH);
  ctx.lineTo(tl.sx, tl.sy - wallH);
  ctx.closePath();
  ctx.fill();

  // Wall edge highlights — single hairline along the top of each wall
  ctx.strokeStyle = `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},0.55)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tl.sx, tl.sy - wallH);
  ctx.lineTo(tr.sx, tr.sy - wallH);
  ctx.moveTo(tl.sx, tl.sy - wallH);
  ctx.lineTo(bl.sx, bl.sy - wallH);
  ctx.stroke();

  // ── Room label — small glass tag pinned to the back-LEFT corner of the
  //    room (top-left in iso) so it never overlaps avatars or furniture.
  //    Old version painted it on the floor centre, which got covered by
  //    settled players.
  const labelText = label;
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const labelW = ctx.measureText(labelText).width + 14;
  const labelH = 16;
  const labelX = tl.sx + 4;
  const labelY = tl.sy - wallH + 4;
  ctx.fillStyle = `rgba(${baseRgb[0]},${baseRgb[1]},${baseRgb[2]},0.9)`;
  ctx.beginPath();
  ctx.roundRect(labelX, labelY, labelW, labelH, 4);
  ctx.fill();
  ctx.strokeStyle = `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},0.65)`;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = '#f4f4ff';
  ctx.fillText(labelText, labelX + 7, labelY + labelH / 2 + 0.5);
}

function drawCorridors(ctx: CanvasRenderingContext2D, t: number) {
  // v0.6.4 — corridors are now flowing dashed cyan paths with the dash
  // offset animated by `t`. Reads as "data flow" rather than static lines.
  const roomMap = new Map(ROOMS.map((r) => [r.id, r]));
  const dashOffset = -(t * 24) % 24;        // 24px loop, ~1.5s per cycle

  for (const [fromId, toId] of CORRIDORS) {
    const from = roomMap.get(fromId);
    const to = roomMap.get(toId);
    if (!from || !to) continue;

    const a = roomCenter(from);
    const b = roomCenter(to);

    // Soft outer glow
    ctx.strokeStyle = 'rgba(47,184,255,0.06)';
    ctx.lineWidth = 7;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();

    // Main animated dash
    ctx.strokeStyle = 'rgba(120,200,255,0.42)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = dashOffset;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerInfo,
  cx: number,
  cy: number,
  avatarImg?: HTMLImageElement | null,
) {
  // v0.6.3 — radius bumped 16 → 18 so faces are readable next to furniture,
  // and the team ring is now a hairline + soft outer glow rather than a
  // flat 2 px stroke (the old version looked like a sticker outline).
  const radius = 18;

  // Soft floor shadow — wide ellipse, low alpha so multiple players in the
  // same room don't form a black smudge.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.filter = 'blur(1.5px)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius - 2, radius + 2, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (!player.isAlive) {
    // Dead: ghostly semi-transparent avatar with red X.
    ctx.globalAlpha = 0.32;
    if (avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatarImg, cx - radius, cy - radius, radius * 2, radius * 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#3a3a4a';
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 9);
    ctx.lineTo(cx + 9, cy + 9);
    ctx.moveTo(cx + 9, cy - 9);
    ctx.lineTo(cx - 9, cy + 9);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Muted name tag for dead players.
    ctx.fillStyle = 'rgba(180,180,200,0.75)';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(player.name, cx, cy - radius - 6);
    return;
  }

  // Team palette — fill, ring, glow.
  let color = '#fdd835';
  let glow = 'rgba(253,216,53,0.45)';
  if (player.team === 'cat') { color = '#2fb8ff'; glow = 'rgba(47,184,255,0.5)'; }
  if (player.team === 'dog') { color = '#ff4757'; glow = 'rgba(255,71,87,0.5)'; }

  // Outer halo — wide blurred glow that gives the avatar visual weight on
  // dark rooms without competing with the speaker pulse (which is amber).
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
  ctx.strokeStyle = glow;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();

    // Crisp 1.5 px team ring, plus an inner highlight arc for that
    // glossy "polished glass" feel.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, Math.PI * 1.15, Math.PI * 1.85);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    // Fallback: gradient-filled circle with subtle highlight.
    const fill = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, radius);
    fill.addColorStop(0, 'rgba(255,255,255,0.55)');
    fill.addColorStop(0.4, color);
    fill.addColorStop(1, color);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Name label — glass pill above the avatar. Keeps a tight 9 px font so it
  // doesn't compete with the avatar at typical zoom; team colour bleeds
  // into the bottom border for at-a-glance team ID.
  ctx.font = '600 9.5px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const nameWidth = ctx.measureText(player.name).width;
  const badgeW = nameWidth + 12;
  const badgeH = 15;
  const badgeX = cx - badgeW / 2;
  const badgeY = cy - radius - 19;

  // Glass background (slightly translucent, soft border).
  ctx.fillStyle = 'rgba(15,14,46,0.78)';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 7);
  ctx.fill();
  ctx.strokeStyle = `${color}70`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#f4f4ff';
  ctx.fillText(player.name, cx, badgeY + badgeH / 2 + 0.5);
}

/* ---------- Component ---------- */

const CANVAS_W = 900;
const CANVAS_H = 550;

/* ---------- Animation state ----------------------------------------- */

interface AnimSnapshot {
  /** Last-rendered screen-space x/y for this player. Lerp source. */
  curX: number;
  curY: number;
  /** Latest target screen-space x/y. Lerp destination. */
  toX: number;
  toY: number;
  /** When the latest target was set (`Date.now()`). Drives the lerp progress. */
  tStart: number;
  /** Server-side commute progress, mirrored here so the renderer can decide
   *  whether to draw the player along a Catmull-Rom corridor curve. */
  pathProgress?: number;
  /** Source room id when commuting (so we know where the curve starts). */
  fromRoom?: string;
  /** Destination room id when commuting. */
  destination?: string;
}

/**
 * v0.5+ — dead-reckoning state per player. We only build/use this when the
 * server payload includes velocity (vx/vy), which signals the engine is
 * running the 250 ms tick loop. Pre-v0.5 servers leave it empty and the
 * renderer falls back to AnimSnapshot lerp + Catmull-Rom corridor curves.
 */
interface ReckonState {
  /** Logical-space position predicted forward from the last server tick.
   *  Updated every animation frame: `pos += vel * dt`. */
  predX: number;
  predY: number;
  /** Velocity from the last server tick (logical units / second). */
  velX: number;
  velY: number;
  /** Authoritative position from the last server tick — we error-correct
   *  toward this when it disagrees with our prediction. */
  serverX: number;
  serverY: number;
  /** Timestamp (`performance.now()`) of the last frame we integrated. */
  lastFrameMs: number;
  /** Pixel distance accumulated since the last footprint spawn — when this
   *  crosses FOOTPRINT_INTERVAL_PX we drop a particle. */
  distSinceFootprint: number;
}

/** Short-lived ground particles dropped behind moving players. Pure visual
 *  candy — they fade out over FOOTPRINT_LIFETIME_MS, no game logic. */
interface Footprint {
  /** Logical world coordinates (NOT screen) — translated at render time so
   *  resize / aspect changes don't desync them from the rooms. */
  worldX: number;
  worldY: number;
  /** Spawn time in `performance.now()`. We render age = (now - spawnedAt). */
  spawnedAt: number;
  /** Team color for tinting. */
  team?: string;
}

const FOOTPRINT_INTERVAL_PX = 32;   // logical units between drops
const FOOTPRINT_LIFETIME_MS = 700;  // fade-out window
const FOOTPRINT_MAX = 120;          // ring-buffer cap (prevents unbounded growth)
/** When dead-reckoning prediction differs from authoritative server position
 *  by more than this many logical units, smooth-correct over ~250 ms instead
 *  of snapping. Keeps motion fluid even with packet loss / reordering. */
const RECONCILE_SOFT_PX = 80;

/** Lerp ease — quintic out for snappy-but-smooth feel. */
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

/** Catmull-Rom interpolation between four points at parameter t in [0..1].
 *  When p0/p3 aren't real waypoints we duplicate the endpoints — that
 *  collapses the spline to a quadratic-feeling curve, fine for two-room
 *  corridors. */
function catmullRom(
  p0: { sx: number; sy: number },
  p1: { sx: number; sy: number },
  p2: { sx: number; sy: number },
  p3: { sx: number; sy: number },
  t: number,
): { sx: number; sy: number } {
  const t2 = t * t;
  const t3 = t2 * t;
  const sx = 0.5 * (
    (2 * p1.sx) +
    (-p0.sx + p2.sx) * t +
    (2 * p0.sx - 5 * p1.sx + 4 * p2.sx - p3.sx) * t2 +
    (-p0.sx + 3 * p1.sx - 3 * p2.sx + p3.sx) * t3
  );
  const sy = 0.5 * (
    (2 * p1.sy) +
    (-p0.sy + p2.sy) * t +
    (2 * p0.sy - 5 * p1.sy + 4 * p2.sy - p3.sy) * t2 +
    (-p0.sy + 3 * p1.sy - 3 * p2.sy + p3.sy) * t3
  );
  return { sx, sy };
}

const ACTIVITY_ICON_KEYS: Record<string, keyof typeof activityIcons> = {
  idle: 'idle',
  work: 'work',
  chat: 'chat',
  sneak: 'sneak',
  meeting: 'meeting',
  commute: 'commute',
};

/* ---------- Component ----------------------------------------------- */

export default function GameMap({ players, avatarUrls = {}, currentSpeakerId = null }: GameMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadedImages = useRef<Record<string, HTMLImageElement>>({});
  // Pre-loaded activity icon images, keyed by activityIcons key (work/chat/...).
  const activityImages = useRef<Record<string, HTMLImageElement>>({});
  // v0.6.2 — pre-loaded carried-item stickers, keyed by ItemKind. Same
  // sticker style as activity badges, drawn on the LEFT of the avatar so
  // they don't fight for the same space as the activity icon.
  const itemImages = useRef<Record<string, HTMLImageElement>>({});
  // Per-player animation state — lerp from prev to current screen position.
  const animState = useRef<Map<string, AnimSnapshot>>(new Map());
  // v0.5+ dead-reckoning state, keyed by player id. Lazily populated when
  // the first tick with vx/vy arrives — pre-v0.5 servers never set this and
  // the renderer falls back to AnimSnapshot lerp.
  const reckonState = useRef<Map<string, ReckonState>>(new Map());
  // Footprint particle pool — ring-buffered, oldest entries dropped when full.
  const footprints = useRef<Footprint[]>([]);
  // Sticky flag — once we see vx/vy from any player we switch to the v0.5+
  // dead-reckoning code path for ALL players (even ones whose tick hasn't
  // arrived yet). Mixing both paths in the same frame causes jitter.
  const realtimeMode = useRef(false);
  // Latest snapshot of the players prop, kept in a ref so the RAF loop can
  // re-read it without being a dep (which would tear down the loop on every
  // tick). React still re-renders the component when `players` changes, but
  // the loop just keeps running.
  const playersRef = useRef<PlayerInfo[]>(players);
  playersRef.current = players;
  const speakerRef = useRef<string | null>(currentSpeakerId);
  speakerRef.current = currentSpeakerId;
  const avatarUrlsRef = useRef(avatarUrls);
  avatarUrlsRef.current = avatarUrls;

  // Pre-load avatar images when URLs change
  useEffect(() => {
    for (const [role, url] of Object.entries(avatarUrls)) {
      if (loadedImages.current[role]) continue; // already loaded
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        loadedImages.current[role] = img;
        // Drawing happens in the RAF loop, no need to trigger here.
      };
      img.onerror = () => { /* fallback to colored circle */ };
      img.src = url;
    }
  }, [avatarUrls]);

  // Pre-load activity icons once (8 PNGs).
  useEffect(() => {
    for (const [key, url] of Object.entries(activityIcons)) {
      if (activityImages.current[key]) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { activityImages.current[key] = img; };
      img.onerror = () => { /* leave undefined → emoji fallback in draw */ };
      img.src = url;
    }
  }, []);

  // v0.6.3 — furniture is now drawn from canvas primitives in drawFurniture.ts
  // instead of preloaded PNG sprites. The Minimax-generated stickers were
  // JPEG-with-white-background and looked like trading cards stuck on the
  // dark map; primitives composite cleanly. See drawFurniture.ts.

  // v0.6.2 — pre-load carried-item stickers (6 PNGs). Soft-fail on 404 →
  // the carried-item badge just doesn't render that frame, no warnings.
  useEffect(() => {
    for (const [key, url] of Object.entries(itemIcons)) {
      if (itemImages.current[key]) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { itemImages.current[key] = img; };
      img.onerror = () => { /* skip badge */ };
      img.src = url;
    }
  }, []);

  /**
   * v0.5+ tick ingester. Fires whenever the `players` prop changes (i.e.,
   * every game:tick → applyTick in the store). For each player, refresh
   * their authoritative server position + velocity. Predicted position
   * stays whatever it was — the RAF loop will smooth-correct toward
   * `serverX/serverY` over a few frames so the avatar doesn't jerk.
   */
  useEffect(() => {
    const now = performance.now();
    let sawVelocity = false;
    for (const p of players) {
      const vx = p.position?.vx ?? 0;
      const vy = p.position?.vy ?? 0;
      if (typeof p.position?.vx === 'number' || typeof p.position?.vy === 'number') {
        sawVelocity = true;
      }
      const sx = p.position?.x ?? 0;
      const sy = p.position?.y ?? 0;
      const cur = reckonState.current.get(p.id);
      if (!cur) {
        // First sighting — snap predicted = server.
        reckonState.current.set(p.id, {
          predX: sx, predY: sy,
          velX: vx,  velY: vy,
          serverX: sx, serverY: sy,
          lastFrameMs: now,
          distSinceFootprint: 0,
        });
      } else {
        cur.serverX = sx;
        cur.serverY = sy;
        cur.velX = vx;
        cur.velY = vy;
        // If server is wildly out of sync (new round teleport, kill snap)
        // hard-reset the prediction so we don't slow-drift over a long
        // distance. The RECONCILE_SOFT_PX threshold lets normal jitter
        // smooth-correct without a visible snap.
        const dx = sx - cur.predX;
        const dy = sy - cur.predY;
        if (dx * dx + dy * dy > (RECONCILE_SOFT_PX * 4) ** 2) {
          cur.predX = sx;
          cur.predY = sy;
          cur.distSinceFootprint = 0;
        }
      }
    }
    if (sawVelocity) realtimeMode.current = true;
  }, [players]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // ── v0.6.4 background — radial light from upper-centre simulating a
    //    skylight, plus a deep purple vignette in the corners. Gives the
    //    map theatrical depth without baked lightmaps.
    const bgRad = ctx.createRadialGradient(CANVAS_W / 2, 0, 60, CANVAS_W / 2, CANVAS_H, CANVAS_W * 0.85);
    bgRad.addColorStop(0,    '#1a1d3a');
    bgRad.addColorStop(0.45, '#10112a');
    bgRad.addColorStop(1,    '#06061a');
    ctx.fillStyle = bgRad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Time in seconds — used by corridors / dust / furniture animations.
    // performance.now() is monotonic (immune to system clock jumps).
    const tSec = performance.now() / 1000;

    // Subtle grid (v0.6.4: no-op — kept for API stability)
    drawIsoGrid(ctx, 10, 8);

    // Corridors behind rooms — animated dashed cyan paths
    drawCorridors(ctx, tSec);

    // Sort rooms back-to-front (ascending gridX + gridY for painter's algorithm)
    const sortedRooms = [...ROOMS].sort(
      (a, b) => (a.gridX + a.gridY) - (b.gridX + b.gridY),
    );

    // Draw rooms
    for (const room of sortedRooms) {
      drawIsoRoom(ctx, room);
    }

    // ── v0.6.3 furniture layer (canvas-drawn) ─────────────────────────
    //   Replaces the v0.6.0 PNG sticker approach which had two problems:
    //   (1) Minimax JPEG-with-white-bg looked like trading cards on the
    //   dark map; (2) sprites were ~110px each → cluttered. Now each kind
    //   is hand-drawn from primitives in drawFurniture.ts at ~30px scale,
    //   matching the iso/glass aesthetic of the rooms.
    //   Painted AFTER rooms (sits on the floor, not behind walls) but
    //   BEFORE players (doesn't occlude character heads). Sort by Y so
    //   back rows of desks render behind front rows.
    const furniturePlaced = ROOM_FURNITURE.map((f) => {
      const def = FURNITURE_TYPES[f.kind as FurnitureKind];
      // Anchor on the FRONT-CENTRE of the furniture footprint (highest Y
      // edge) so canvas drawers can paint upward from the ground. Visually
      // reads as "object sitting on the floor" instead of "floating above".
      const groundCx = f.x + def.w / 2;
      const groundCy = f.y + def.h;            // bottom edge in logical coords
      const c = worldToIso(groundCx, groundCy);
      // Visual scale derives from logical footprint width — chairs end up
      // smaller than sofas naturally without per-kind manual tuning.
      const scale = Math.max(0.65, Math.min(1.4, def.w / 36));
      return { f, sx: c.sx, sy: c.sy, scale };
    }).sort((a, b) => a.sy - b.sy);

    // tSec already defined at top of drawFrame — used here for LED blink,
    // coffee steam, CCTV scan-line, elevator arrow pulse.
    for (const { f, sx, sy, scale } of furniturePlaced) {
      drawFurnitureSprite(ctx, f.kind, sx, sy, scale, tSec);
    }

    // ── Player layout pass ────────────────────────────────────────────
    //
    // Compute the desired screen-space (toX, toY) for every player, then
    // lerp from the previously-rendered (curX, curY) over LERP_DURATION.
    // Commute-mode players use a Catmull-Rom curve between source and
    // destination room centres so their movement reads as "walking down
    // the corridor", not teleporting.
    const roomMap = new Map(ROOMS.map((r) => [r.id, r]));
    const LERP_DURATION = 1500; // matches server tick interval
    const now = Date.now();

    // Group SETTLED players (no commute) by room so they fan out neatly,
    // not stack on top of each other.
    const settledByRoom = new Map<string, PlayerInfo[]>();
    for (const p of players) {
      if (typeof p.position?.pathProgress === 'number') continue;
      const roomId = p.position?.room || '开放工区';
      if (!settledByRoom.has(roomId)) settledByRoom.set(roomId, []);
      settledByRoom.get(roomId)!.push(p);
    }

    // ── v0.6.4 anti-stacking — when the server emits the same (or very
    //    close) position for multiple players (lobby state, shared anchor,
    //    pre-game spawn), they collapse into a single dot in dead-reckon
    //    mode. We cluster by 22-px iso cells and assign each player in a
    //    cluster a deterministic radial offset around the cluster centre.
    //    Stable hash by id keeps each player in the same slot frame-to-frame
    //    so they don't shimmer.
    const ANTI_STACK_CELL = 22;
    const ANTI_STACK_RADIUS = 18;
    /** clusterMap: cell key → [players, ...]  (only populated for cells
     *  with > 1 player). Computed once per frame from the v0.5 dead-
     *  reckoning predictions, and used inside targetXY to displace
     *  collisions. */
    const stackClusters = new Map<string, string[]>();
    if (realtimeMode.current) {
      for (const p of players) {
        const rs = reckonState.current.get(p.id);
        if (!rs) continue;
        const iso = (() => {
          const gx = (rs.predX / LOGICAL_W) * 8;
          const gy = (rs.predY / LOGICAL_H) * 7;
          return toIso(gx, gy);
        })();
        const cell = `${Math.round(iso.sx / ANTI_STACK_CELL)},${Math.round(iso.sy / ANTI_STACK_CELL)}`;
        if (!stackClusters.has(cell)) stackClusters.set(cell, []);
        stackClusters.get(cell)!.push(p.id);
      }
    }
    /** Returns a small (dx, dy) offset for `playerId` if it shares an
     *  iso cell with other players. Distributes them on a circle whose
     *  radius scales with the cluster size; the angle is deterministic
     *  by the player's index in the (sorted) cluster array. */
    function antiStackOffset(playerId: string, cellKey: string): { dx: number; dy: number } {
      const peers = stackClusters.get(cellKey);
      if (!peers || peers.length < 2) return { dx: 0, dy: 0 };
      const sorted = [...peers].sort();             // stable order across frames
      const idx = sorted.indexOf(playerId);
      if (idx < 0) return { dx: 0, dy: 0 };
      const angle = (idx / peers.length) * Math.PI * 2 - Math.PI / 2;
      // Radius grows with cluster count up to ~26px, then plateaus
      const r = Math.min(ANTI_STACK_RADIUS + peers.length * 1.5, 26);
      return {
        dx: Math.cos(angle) * r,
        dy: Math.sin(angle) * r * 0.55,             // squish vertically for iso
      };
    }

    /** v0.5+ — project a logical-world (x, y) into the existing isometric
     *  screen-space the rest of the renderer uses. We piggyback on `toIso`
     *  by mapping logical coords (0..LOGICAL_W × 0..LOGICAL_H) onto the
     *  same grid space (0..GRID_COLS × 0..GRID_ROWS) the room defs live in.
     *  Rough scale only — visual placement, not physics. */
    function worldToIso(wx: number, wy: number) {
      const gx = (wx / LOGICAL_W) * 8;   // 8 grid cols ≈ map width
      const gy = (wy / LOGICAL_H) * 7;   // 7 grid rows ≈ map height
      return toIso(gx, gy);
    }

    /** Resolve (toX, toY) for one player based on commute / room.
     *  v0.5+ takes the dead-reckoned position from `reckonState` when the
     *  server emits velocities. Pre-v0.5 (no vx/vy) keeps using the
     *  Catmull-Rom corridor curve from earlier versions for compat. */
    function targetXY(p: PlayerInfo): { sx: number; sy: number; speakerHere: boolean } {
      const speakerHere = !!speakerRef.current && p.id === speakerRef.current;

      // v0.5+ dead-reckoning path. The reckonState predX/predY is updated
      // each frame in the RAF loop; here we just project to screen space.
      if (realtimeMode.current) {
        const rs = reckonState.current.get(p.id);
        if (rs) {
          const iso = worldToIso(rs.predX, rs.predY);
          // v0.6.4 — apply anti-stacking offset if this player shares an
          // iso cell with peers. Avoids the 5-avatars-stacked-into-one-dot
          // failure mode visible in the lobby and shared-anchor cases.
          const cell = `${Math.round(iso.sx / ANTI_STACK_CELL)},${Math.round(iso.sy / ANTI_STACK_CELL)}`;
          const off = antiStackOffset(p.id, cell);
          return { sx: iso.sx + off.dx, sy: iso.sy - 8 + off.dy, speakerHere };
        }
      }

      // Pre-v0.5 commute path → Catmull-Rom along corridor
      if (
        typeof p.position?.pathProgress === 'number' &&
        p.position?.destination
      ) {
        const fromRoom = roomMap.get(p.position.room);
        const toRoom = roomMap.get(p.position.destination);
        if (fromRoom && toRoom) {
          const from = roomCenter(fromRoom);
          const to = roomCenter(toRoom);
          // Phantom control points: bias slightly outwards so the curve has
          // a gentle arc rather than a straight line.
          const arc = 18;
          const midX = (from.sx + to.sx) / 2;
          const midY = (from.sy + to.sy) / 2 - arc;
          const ctrlBefore = { sx: from.sx, sy: from.sy + arc };
          const ctrlAfter  = { sx: to.sx,   sy: to.sy   + arc };
          const t = Math.max(0, Math.min(1, p.position.pathProgress));
          // 4 control points for Catmull-Rom — bend the path through the
          // raised midpoint so the player visibly "lifts up off the floor".
          // We re-use ctrlBefore/ctrlAfter as the boundary tangents.
          const mid = catmullRom(ctrlBefore, from, { sx: midX, sy: midY }, to, t * 0.5 + 0.25);
          // Also mix linear toward the actual end so we always reach the
          // destination cleanly when t=1 (Catmull-Rom alone overshoots a bit).
          const lerp = {
            sx: from.sx + (to.sx - from.sx) * t,
            sy: from.sy + (to.sy - from.sy) * t,
          };
          const blend = 1 - Math.abs(t - 0.5) * 2; // 0 at endpoints, 1 in middle
          return {
            sx: lerp.sx + (mid.sx - lerp.sx) * blend * 0.6,
            sy: lerp.sy + (mid.sy - lerp.sy) * blend * 0.6 - 4,
            speakerHere,
          };
        }
      }
      // Settled in a room — fan out within the room footprint
      const roomId = p.position?.room || '开放工区';
      const room = roomMap.get(roomId);
      const centre = room ? roomCenter(room) : { sx: CANVAS_W / 2, sy: CANVAS_H / 2 };
      const group = settledByRoom.get(roomId) || [];
      const idx = group.findIndex((q) => q.id === p.id);
      const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, group.length))));
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const spacingX = 28;
      const spacingY = 18;
      const offsetX = (col - (cols - 1) / 2) * spacingX;
      const offsetY = (row - (Math.ceil(group.length / cols) - 1) / 2) * spacingY;
      return { sx: centre.sx + offsetX, sy: centre.sy + offsetY - 8, speakerHere };
    }

    // ── Footprint particles — drawn first so they sit on the floor under
    //    everything else. Pure visual candy, no game logic. Older v0.4
    //    clients without `realtimeMode.current` skip this entirely.
    //    Footprints are timestamped with `performance.now()` (monotonic) so
    //    we re-fetch it here rather than re-using `now` (Date.now()).
    if (realtimeMode.current && footprints.current.length > 0) {
      // v0.6.3 — toned down: smaller radius (was 6→10, now 3→5) and lower
      // peak alpha (was 0.55, now 0.22). The old version drew big disco
      // dots that competed with the furniture sprites for visual weight.
      const nowPerf = performance.now();
      for (const fp of footprints.current) {
        const age = nowPerf - fp.spawnedAt;
        if (age >= FOOTPRINT_LIFETIME_MS) continue;
        const lifeT = age / FOOTPRINT_LIFETIME_MS;        // 0..1
        const alpha = (1 - lifeT) * 0.22;
        const r = 3 + lifeT * 2;
        const iso = worldToIso(fp.worldX, fp.worldY);
        let rgb = '180,180,180';
        if (fp.team === 'cat') rgb = '47,184,255';
        else if (fp.team === 'dog') rgb = '255,71,87';
        else if (fp.team === 'neutral') rgb = '168,85,247';
        ctx.beginPath();
        ctx.arc(iso.sx, iso.sy + 6, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
        ctx.fill();
      }
    }

    // ── Speaker pulse — drawn FIRST so it sits behind the player avatar.
    //    Uses a sine wave keyed on `now` so the ring breathes at ~1.4 Hz.
    if (speakerRef.current) {
      const speaker = players.find((p) => p.id === speakerRef.current);
      if (speaker && speaker.isAlive) {
        const { sx, sy } = targetXY(speaker);
        const phase = (now % 1400) / 1400;          // 0..1
        const ringR = 24 + Math.sin(phase * Math.PI * 2) * 6;
        const alpha = 0.35 + Math.sin(phase * Math.PI * 2) * 0.18;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,184,76,${alpha.toFixed(3)})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(255,184,76,0.75)';
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Draw players. Sort by their interpolated Y so back rows appear
    //    behind front rows (painter's algorithm at the player level too).
    const drawList = players.map((p) => {
      const target = targetXY(p);
      const prev = animState.current.get(p.id);
      // First-time arrival: snap, no lerp
      if (!prev) {
        animState.current.set(p.id, {
          curX: target.sx, curY: target.sy,
          toX: target.sx, toY: target.sy,
          tStart: now,
          pathProgress: p.position?.pathProgress,
          fromRoom: p.position?.room,
          destination: p.position?.destination,
        });
        return { p, sx: target.sx, sy: target.sy, speakerHere: target.speakerHere };
      }
      // Target changed → start a new lerp (capture current as new from)
      if (Math.abs(prev.toX - target.sx) > 0.5 || Math.abs(prev.toY - target.sy) > 0.5) {
        prev.curX = prev.curX; // keep — render position so far becomes new origin
        prev.curY = prev.curY;
        prev.toX = target.sx;
        prev.toY = target.sy;
        prev.tStart = now;
        prev.pathProgress = p.position?.pathProgress;
        prev.destination = p.position?.destination;
        prev.fromRoom = p.position?.room;
      }
      const elapsed = now - prev.tStart;
      const t = Math.max(0, Math.min(1, elapsed / LERP_DURATION));
      const eased = easeOutQuint(t);
      const sx = prev.curX + (prev.toX - prev.curX) * eased;
      const sy = prev.curY + (prev.toY - prev.curY) * eased;
      // When fully arrived, snap so the next lerp starts from the exact target.
      if (t >= 1) {
        prev.curX = prev.toX;
        prev.curY = prev.toY;
      } else {
        // Overwrite cur to the freshly interpolated value so re-renders
        // mid-lerp don't reset progress.
        prev.curX = sx;
        prev.curY = sy;
      }
      return { p, sx, sy, speakerHere: target.speakerHere };
    });

    drawList.sort((a, b) => a.sy - b.sy);

    for (const { p, sx, sy, speakerHere } of drawList) {
      const avatarImg = p.role ? loadedImages.current[p.role] : undefined;
      // Speaker bumped 15% larger via a quick canvas scale around their centre
      if (speakerHere) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1.18, 1.18);
        ctx.translate(-sx, -sy);
      }
      drawPlayer(ctx, p, sx, sy, avatarImg);
      if (speakerHere) ctx.restore();

      // Activity badge — small icon next to bottom-right of the avatar
      if (p.isAlive && p.activity?.kind) {
        const iconKey = ACTIVITY_ICON_KEYS[p.activity.kind];
        const img = iconKey ? activityImages.current[iconKey] : undefined;
        const bx = sx + 14;
        const by = sy + 12;
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(bx, by, 9, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15,14,46,0.9)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(bx, by, 9, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, bx - 9, by - 9, 18, 18);
          ctx.restore();
          ctx.beginPath();
          ctx.arc(bx, by, 9, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // v0.6.2/v0.6.3 — carried-item badge, mirror of the activity badge.
      // Only drawn when:
      //   • player is alive AND holding something (carrying.kind set), AND
      //   • player is SETTLED (not in commute) — moving avatars are too
      //     small/jittery for a side sticker to read cleanly, and the
      //     carrying field is null during commute on the server anyway,
      //     but we double-gate on activity here so dead-reckoned in-room
      //     micro-walks (work/coffee) still show the item.
      const carrying = (p as { carrying?: { kind: string } | null }).carrying;
      const isCommuting = p.activity?.kind === 'commute';
      if (p.isAlive && carrying?.kind && !isCommuting) {
        const itemImg = itemImages.current[carrying.kind];
        if (itemImg) {
          const ix = sx - 16;
          const iy = sy + 10;
          const r = 8;
          ctx.save();
          ctx.beginPath();
          ctx.arc(ix, iy, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15,14,46,0.88)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ix, iy, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(itemImg, ix - r + 1, iy - r + 1, (r - 1) * 2, (r - 1) * 2);
          ctx.restore();
          ctx.beginPath();
          ctx.arc(ix, iy, r, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.22)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // ── v6.21 idle-moment emote bubble ─────────────────────────────
      //
      // Above the avatar, a tiny rounded bubble drifts up with one
      // mood-emoji. Pool is activity × room × nearest-furniture so the
      // moment feels "of this room" — coffee machine → ☕, 老板办公室 → 😨,
      // free_roam idle → 📱/🥱. Bubble shows 4s every 10s per player.
      // Deterministic per (id, slot) so frames don't shimmer.
      if (p.isAlive) {
        let nearestKind: FurnitureKind | null = null;
        let nearestDistSq = PROX_PX * PROX_PX;
        for (const fp of furniturePlaced) {
          const dx = fp.sx - sx;
          const dy = fp.sy - sy;
          const dSq = dx * dx + dy * dy;
          if (dSq < nearestDistSq) {
            nearestDistSq = dSq;
            nearestKind = fp.f.kind as FurnitureKind;
          }
        }
        const frame = pickEmoteForPlayer({
          playerId: p.id,
          isAlive: p.isAlive,
          activityKind: p.activity?.kind,
          roomId: p.position?.room,
          nearestFurnitureKind: nearestKind,
          tSec,
        });
        if (frame) {
          const bx = sx;
          // sy - 50 puts bubble center well above the name pill (which
          // lives at sy - 37 to sy - 22). 10-px tail still touches the
          // name from above so the bubble reads as "speaks for this rat"
          // not "floats randomly".
          const by = sy - 50 - frame.yOffset;
          ctx.save();
          ctx.globalAlpha = frame.alpha;
          // Bubble — deep cosmic violet fill, gold rim. Brand-matched
          // with EventPill so the eye reads bubbles as "OFFICE ZOO UI"
          // not "random toast". roundRect supported in all evergreen.
          ctx.fillStyle = 'rgba(15,14,46,0.92)';
          ctx.strokeStyle = 'rgba(255,215,0,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(bx - 10, by - 10, 20, 20, 6);
          ctx.fill();
          ctx.stroke();
          // Speech-bubble tail — tiny triangle pointing down at head
          ctx.beginPath();
          ctx.moveTo(bx - 3, by + 10);
          ctx.lineTo(bx + 3, by + 10);
          ctx.lineTo(bx, by + 14);
          ctx.closePath();
          ctx.fillStyle = 'rgba(15,14,46,0.92)';
          ctx.fill();
          // Emoji glyph — system emoji font cascade so it renders on
          // mac/win/linux without bundling a font.
          ctx.font = '12px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(frame.emoji, bx, by + 1);
          ctx.restore();
        }
      }
    }

    // ── v0.6.4 ambient atmosphere — drawn LAST, on top of everything,
    //    very low alpha so it's pure mood. Two layers:
    //    1) Floating dust motes (40 deterministic specks) — tiny stars
    //       that drift up-and-right with a slow sine wobble, recycled
    //       when they exit the canvas. Reads as "this is a real space
    //       with air in it" instead of "this is a flat diagram".
    //    2) Edge vignette — soft black gradient on the canvas border
    //       that pulls focus to the centre. Helps small avatars read.
    {
      // dust motes — generated from a deterministic seed, no per-frame
      // RNG so they don't shimmer between frames.
      const N = 40;
      ctx.save();
      for (let i = 0; i < N; i++) {
        const seedX = (i * 73.2) % CANVAS_W;
        const seedY = (i * 41.7) % CANVAS_H;
        // drift up-right at ~6 px/sec, wrap around canvas
        const driftX = (seedX + tSec * 6 + Math.sin(tSec * 0.5 + i) * 8) % (CANVAS_W + 40) - 20;
        const driftY = (seedY - tSec * 4 + Math.cos(tSec * 0.4 + i * 1.2) * 6) % (CANVAS_H + 40);
        const wrappedY = driftY < 0 ? driftY + CANVAS_H + 40 : driftY;
        const tw = (Math.sin(tSec * 1.4 + i * 2.1) + 1) * 0.5;   // 0..1
        const radius = 0.6 + (i % 3) * 0.4;                       // 0.6..1.4
        ctx.fillStyle = `rgba(180,200,255,${(0.15 + tw * 0.20).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(driftX, wrappedY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // edge vignette — radial gradient from transparent centre to dark edge
      const vGrad = ctx.createRadialGradient(
        CANVAS_W / 2, CANVAS_H / 2, Math.min(CANVAS_W, CANVAS_H) * 0.35,
        CANVAS_W / 2, CANVAS_H / 2, Math.max(CANVAS_W, CANVAS_H) * 0.7,
      );
      vGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }, [players, avatarUrls, currentSpeakerId]);

  // RAF loop — drives the lerp + pulse animations. Re-uses `drawFrame` which
  // re-reads playersRef.current internally, so we don't need to add it as a
  // RAF dep. A 60 fps loop on this canvas costs ~1.5 ms/frame on M1.
  //
  // v0.5+ also integrates the dead-reckoning predictions here: every frame
  // we advance each player's predicted position by `velocity * dt`, smooth-
  // correct toward the latest server snapshot, and drop a footprint
  // particle every FOOTPRINT_INTERVAL_PX of travel.
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const now = performance.now();
      // 1) Per-player dead-reckoning step (skip when no v0.5 ticks yet)
      if (realtimeMode.current) {
        for (const [id, rs] of reckonState.current) {
          const dt = Math.min(0.1, (now - rs.lastFrameMs) / 1000);
          rs.lastFrameMs = now;
          // Predict-forward by velocity
          let nx = rs.predX + rs.velX * dt;
          let ny = rs.predY + rs.velY * dt;
          // Smooth-correct toward server position. Use a 250 ms time-constant
          // so small jitters disappear gracefully and big jumps still arrive
          // within ~1 second.
          const ex = rs.serverX - nx;
          const ey = rs.serverY - ny;
          const errSq = ex * ex + ey * ey;
          if (errSq > 0.5) {
            const correctionT = Math.min(1, dt / 0.25);
            nx += ex * correctionT;
            ny += ey * correctionT;
          }
          // Footprint accumulation
          const dx = nx - rs.predX;
          const dy = ny - rs.predY;
          const moved = Math.sqrt(dx * dx + dy * dy);
          rs.distSinceFootprint += moved;
          if (rs.distSinceFootprint >= FOOTPRINT_INTERVAL_PX) {
            rs.distSinceFootprint = 0;
            const owner = playersRef.current.find((p) => p.id === id);
            if (owner?.isAlive) {
              footprints.current.push({
                worldX: nx,
                worldY: ny,
                spawnedAt: now,
                team: owner.team,
              });
              if (footprints.current.length > FOOTPRINT_MAX) {
                footprints.current.shift();
              }
            }
          }
          rs.predX = nx;
          rs.predY = ny;
        }
        // 2) Reap expired footprints (cheap linear sweep, MAX cap = 120)
        const cutoff = now - FOOTPRINT_LIFETIME_MS;
        while (footprints.current.length && footprints.current[0].spawnedAt < cutoff) {
          footprints.current.shift();
        }
      }
      drawFrame();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [drawFrame]);

  // Re-draw on window resize (RAF loop will continue but we want immediate)
  useEffect(() => {
    const handleResize = () => drawFrame();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawFrame]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        borderRadius: 16,
        border: '1px solid rgba(47,184,255,0.12)',
        maxWidth: '100%',
        background: '#0a0a1e',
        boxShadow: '0 0 40px rgba(47,184,255,0.05)',
      }}
    />
  );
}
