/**
 * videoExport — render the post-game viral share video, fully client-side.
 *
 * Architecture:
 *   1. Create a hidden 1080×1920 (vertical 9:16) <canvas>
 *   2. Pre-load avatar images for each highlight player
 *   3. Wire `canvas.captureStream(30)` → `MediaRecorder`
 *   4. Drive a frame loop that paints scenes by elapsed time:
 *        0.0 –  3.0 s   intro (logo + winner banner)
 *        3.0 – 11.0 s   highlight #1
 *       11.0 – 19.0 s   highlight #2
 *       19.0 – 27.0 s   highlight #3 / finale
 *       27.0 – 30.0 s   outro (GitHub QR + watermark)
 *   5. Stop recorder, return a Blob the caller can `URL.createObjectURL`.
 *
 * Why purely client-side:
 *   - No server round-trip → instant download
 *   - No FFmpeg dep → smaller install, simpler ops
 *   - Trade-off: webm output (Chrome/Firefox) or mp4 (Safari) depending on
 *     `MediaRecorder.isTypeSupported`. Most user-facing platforms re-encode
 *     anyway, so format mismatch is fine.
 *
 * No audio in v0.3.0 — captions carry meaning. Audio overlay is v0.3.2.
 */

import type { Highlight } from '../services/highlightPicker';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Vertical 9:16 — natural for TikTok / Douyin / Reels / 小红书 / B 站 vertical. */
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;
/** Total duration in seconds. Picked to fit the standard 抖音/小红书 first-pass
 *  attention budget (≤30 s caps the auto-loop, longer tends to drop off). */
export const VIDEO_DURATION_SEC = 30;

const SCENE_INTRO_SEC = 3;
const SCENE_OUTRO_SEC = 3;
const SCENES_BODY_SEC = VIDEO_DURATION_SEC - SCENE_INTRO_SEC - SCENE_OUTRO_SEC;

/** Background gradient stops — match the OFFICE ZOO brand palette. */
const BG_TOP = '#0a0a1e';
const BG_MID = '#1a0d2e';
const BG_BOT = '#0d0a25';

/** Team color map. */
function teamColor(team?: string): string {
  if (team === 'cat') return '#2fb8ff';
  if (team === 'dog') return '#ff4757';
  if (team === 'neutral') return '#a855f7';
  return '#7c3aed';
}

function teamLabel(team?: string): string {
  if (team === 'cat') return '打工人';
  if (team === 'dog') return '资本家';
  if (team === 'neutral') return '摸鱼党';
  return '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExportOptions {
  highlights: Highlight[];
  /** Map of role → already-loaded avatar URL (server-side cached). */
  avatarUrls: Record<string, string>;
  /** Final winner team — drives the intro banner colour + label. */
  winner?: string;
  /** Called with progress 0..1 every second — wire to a UI spinner. */
  onProgress?: (p: number) => void;
}

export interface ExportResult {
  blob: Blob;
  /** "video/webm" or "video/mp4" depending on what the browser supports. */
  mimeType: string;
  /** Suggested filename. */
  fileName: string;
  /** Duration in ms (for telemetry / sanity check). */
  durationMs: number;
}

/**
 * Render the share video and return its Blob. Throws if MediaRecorder is
 * unavailable or the browser refused a supported output codec.
 */
export async function exportShareVideo(opts: ExportOptions): Promise<ExportResult> {
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) {
    throw new Error('MediaRecorder API is not available in this browser.');
  }

  // Pick a codec the browser actually supports. Order matters — mp4 first
  // gives Safari a better default (smaller files, native player support).
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) {
    throw new Error('No supported MediaRecorder output codec.');
  }

  // 1. Hidden canvas at video resolution.
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // 2. Pre-load avatar images so frame draws are sync.
  const avatarImgs = await preloadAvatars(opts.highlights, opts.avatarUrls);

  // 3. captureStream → MediaRecorder.
  const stream = canvas.captureStream(VIDEO_FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  // 4. Frame loop. Drive on `requestAnimationFrame` for smooth pacing rather
  // than setInterval — RAF tracks display refresh and the recorder samples
  // captureStream at exactly VIDEO_FPS regardless.
  const startTime = performance.now();
  let lastProgress = -1;

  const frame = () => {
    const elapsedMs = performance.now() - startTime;
    const elapsedSec = elapsedMs / 1000;
    if (elapsedSec >= VIDEO_DURATION_SEC) return;

    drawScene(ctx, elapsedSec, opts, avatarImgs);

    // Fire progress at 1-second granularity to avoid spamming React renders.
    const wholeSec = Math.floor(elapsedSec);
    if (wholeSec !== lastProgress) {
      lastProgress = wholeSec;
      opts.onProgress?.(elapsedSec / VIDEO_DURATION_SEC);
    }
    requestAnimationFrame(frame);
  };

  recorder.start();
  requestAnimationFrame(frame);

  // 5. Wait the full duration, then stop + assemble.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, VIDEO_DURATION_SEC * 1000 + 100);
  });
  recorder.stop();

  // Drain the final ondataavailable + onstop.
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const blob = new Blob(chunks, { type: mimeType });
  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  const datestr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `office-zoo-${opts.winner ?? 'share'}-${datestr}.${ext}`;
  const durationMs = performance.now() - startTime;

  opts.onProgress?.(1);
  return { blob, mimeType, fileName, durationMs };
}

/** Helper: trigger a save-as dialog for the rendered video. */
export function triggerDownload(result: ExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Free the object URL after a short delay so the browser has time to
  // initiate the download — too eager and Safari aborts.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------------------
// Avatar pre-loading
// ---------------------------------------------------------------------------

async function preloadAvatars(
  highlights: Highlight[],
  avatarUrls: Record<string, string>,
): Promise<Map<string, HTMLImageElement>> {
  const out = new Map<string, HTMLImageElement>();
  const tasks: Promise<void>[] = [];
  const seen = new Set<string>();
  for (const h of highlights) {
    const key = h.role;
    if (!key || seen.has(key)) continue;
    const url = avatarUrls[key];
    if (!url) continue;
    seen.add(key);
    tasks.push(new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { out.set(key, img); resolve(); };
      img.onerror = () => resolve();   // soft-fail → emoji-style fallback in draw
      img.src = url;
    }));
  }
  await Promise.all(tasks);
  return out;
}

// ---------------------------------------------------------------------------
// Scene renderer
// ---------------------------------------------------------------------------

function drawScene(
  ctx: CanvasRenderingContext2D,
  t: number,
  opts: ExportOptions,
  avatars: Map<string, HTMLImageElement>,
) {
  drawBackground(ctx);

  if (t < SCENE_INTRO_SEC) {
    drawIntro(ctx, t / SCENE_INTRO_SEC, opts.winner);
    return;
  }

  const tBody = t - SCENE_INTRO_SEC;
  if (tBody < SCENES_BODY_SEC) {
    // Body: split evenly across the highlights we actually have.
    const slots = Math.max(1, opts.highlights.length);
    const slotSec = SCENES_BODY_SEC / slots;
    const idx = Math.min(slots - 1, Math.floor(tBody / slotSec));
    const slotProgress = (tBody - idx * slotSec) / slotSec; // 0..1 inside this slot
    const h = opts.highlights[idx];
    if (h) drawHighlight(ctx, h, slotProgress, idx + 1, slots, avatars);
    return;
  }

  drawOutro(ctx, (t - SCENE_INTRO_SEC - SCENES_BODY_SEC) / SCENE_OUTRO_SEC);
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIDEO_HEIGHT);
  grad.addColorStop(0, BG_TOP);
  grad.addColorStop(0.5, BG_MID);
  grad.addColorStop(1, BG_BOT);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  // Subtle grid dots
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 60; y < VIDEO_HEIGHT; y += 60) {
    for (let x = 60; x < VIDEO_WIDTH; x += 60) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawIntro(ctx: CanvasRenderingContext2D, p: number, winner?: string) {
  const ease = easeOutCubic(Math.min(1, p));
  const opacity = ease;
  const yOffset = (1 - ease) * 80;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(0, yOffset);

  // Wordmark
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 140px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OFFICE ZOO', VIDEO_WIDTH / 2, VIDEO_HEIGHT * 0.32);

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '54px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('0 点的写字楼 · AI 鼠人剧场', VIDEO_WIDTH / 2, VIDEO_HEIGHT * 0.40);

  // Winner banner
  if (winner) {
    const color = teamColor(winner);
    const label =
      winner === 'cat'     ? '打工人胜利'
    : winner === 'dog'     ? '资本家胜利'
    : winner === 'neutral' ? '摸鱼党胜利'
    : '本局结束';

    // pill background
    const pillW = 700;
    const pillH = 130;
    const pillX = (VIDEO_WIDTH - pillW) / 2;
    const pillY = VIDEO_HEIGHT * 0.55;
    ctx.fillStyle = `${color}33`;
    roundRect(ctx, pillX, pillY, pillW, pillH, 28);
    ctx.fill();
    ctx.strokeStyle = `${color}cc`;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 78px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(label, VIDEO_WIDTH / 2, pillY + pillH / 2);
  }

  ctx.restore();
}

function drawHighlight(
  ctx: CanvasRenderingContext2D,
  h: Highlight,
  p: number,
  idx: number,
  total: number,
  avatars: Map<string, HTMLImageElement>,
) {
  // Slide in from the right for the first 0.3 of the slot, hold, slide out
  // last 0.15. Avoid abrupt cuts which read as "buggy" on social.
  const enter = clamp01(p / 0.3);
  const exit = 1 - clamp01((p - 0.85) / 0.15);
  const visibility = Math.min(enter, exit);
  const slideX = (1 - enter) * 200;
  const opacity = easeOutCubic(visibility);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(slideX, 0);

  // Top ribbon: index + round + kind tag
  drawRibbon(ctx, idx, total, h);

  // Avatar circle (centre-ish)
  const cx = VIDEO_WIDTH / 2;
  const cy = VIDEO_HEIGHT * 0.42;
  const r = 240;
  const color = teamColor(h.team);

  // outer glow ring
  ctx.beginPath();
  ctx.arc(cx, cy, r + 18, 0, Math.PI * 2);
  ctx.strokeStyle = `${color}88`;
  ctx.lineWidth = 8;
  ctx.shadowColor = color;
  ctx.shadowBlur = 40;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const img = h.role ? avatars.get(h.role) : undefined;
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  } else {
    // Fallback: solid color disc with player initial
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 220px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((h.playerName ?? '?').slice(0, 1), cx, cy);
  }

  // Player name + role line
  const labelY = cy + r + 80;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 86px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(h.playerName ?? '???', cx, labelY);

  if (h.team) {
    const teamTxt = teamLabel(h.team);
    ctx.fillStyle = color;
    ctx.font = '46px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(teamTxt, cx, labelY + 100);
  }

  // Headline
  drawWrappedText(ctx, h.headline, {
    x: 80,
    y: VIDEO_HEIGHT * 0.74,
    maxW: VIDEO_WIDTH - 160,
    lineH: 76,
    font: 'bold 64px -apple-system, "PingFang SC", sans-serif',
    color: '#fff',
    align: 'center',
  });

  // Body text (speech / role reveal)
  if (h.body) {
    drawWrappedText(ctx, h.body, {
      x: 80,
      y: VIDEO_HEIGHT * 0.83,
      maxW: VIDEO_WIDTH - 160,
      lineH: 60,
      font: '48px -apple-system, "PingFang SC", sans-serif',
      color: 'rgba(255,255,255,0.78)',
      align: 'center',
    });
  }

  ctx.restore();
}

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  idx: number,
  total: number,
  h: Highlight,
) {
  const y = 100;
  const tag =
    h.kind === 'kill'       ? '🔪 优化时刻'
  : h.kind === 'vote_eject' ? '🗳️ 全员开除'
  : h.kind === 'roast'      ? '🔥 暴论现场'
  : h.kind === 'reversal'   ? '🎯 走眼了'
                            : '🏆 终局';

  // index pill
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundRect(ctx, 60, y, 220, 80, 16);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${idx} / ${total}`, 60 + 110, y + 40);

  // round pill
  if (h.round) {
    const rx = 320;
    ctx.fillStyle = 'rgba(76,158,255,0.18)';
    roundRect(ctx, rx, y, 200, 80, 16);
    ctx.fill();
    ctx.fillStyle = '#7ec8ff';
    ctx.fillText(`R${h.round}`, rx + 100, y + 40);
  }

  // kind tag (right side)
  ctx.font = '40px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.textAlign = 'right';
  ctx.fillText(tag, VIDEO_WIDTH - 80, y + 40);
}

function drawOutro(ctx: CanvasRenderingContext2D, p: number) {
  const ease = easeOutCubic(clamp01(p));
  ctx.save();
  ctx.globalAlpha = ease;

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold 80px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('想自己生成一局?', VIDEO_WIDTH / 2, VIDEO_HEIGHT * 0.32);

  ctx.font = '54px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('GitHub 搜', VIDEO_WIDTH / 2, VIDEO_HEIGHT * 0.42);

  ctx.font = 'bold 90px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = '#7ec8ff';
  ctx.fillText('ChrisChen667788/office-zoo', VIDEO_WIDTH / 2, VIDEO_HEIGHT * 0.50);

  // wordmark watermark bottom
  ctx.font = 'bold 64px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('OFFICE ZOO', VIDEO_WIDTH / 2, VIDEO_HEIGHT * 0.78);
  ctx.font = '40px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('班味剧场 · MIT 开源', VIDEO_WIDTH / 2, VIDEO_HEIGHT * 0.84);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Tiny canvas helpers
// ---------------------------------------------------------------------------

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

interface WrapOpts {
  x: number;
  y: number;
  maxW: number;
  lineH: number;
  font: string;
  color: string;
  align?: 'left' | 'center' | 'right';
  /** Hard line cap so a runaway wall of text doesn't push past the watermark. */
  maxLines?: number;
}

/** Naïve CJK-aware wrapper — measures per character (no whitespace assumption,
 *  which is correct for Chinese). Good enough for the v0.3.0 captions. */
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  o: WrapOpts,
) {
  ctx.save();
  ctx.font = o.font;
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'top';
  const cx =
    o.align === 'center' ? o.x + o.maxW / 2
  : o.align === 'right'  ? o.x + o.maxW
                         : o.x;
  const lines: string[] = [];
  let current = '';
  for (const ch of text) {
    const probe = current + ch;
    if (ctx.measureText(probe).width > o.maxW && current) {
      lines.push(current);
      current = ch;
    } else {
      current = probe;
    }
  }
  if (current) lines.push(current);
  const cap = o.maxLines ?? 4;
  for (let i = 0; i < Math.min(lines.length, cap); i++) {
    ctx.fillText(lines[i], cx, o.y + i * o.lineH);
  }
  ctx.restore();
}
