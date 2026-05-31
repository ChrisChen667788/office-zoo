/**
 * banweiWrappedCard — v6.40 P3 班味年终 wrapped PNG 分享卡.
 *
 * 1080×1350 IG-portrait, pure canvas → blob → download (no deps,
 * sibling of banweiShareCard / packLeaderboardCard). Renders the
 * Spotify-Wrapped-style year recap: 年度人格 hero + 5 stat cells +
 * achievement bar.
 */

export interface WrappedCardData {
  personaLabel: string;
  personaEmoji: string;
  personaAccent: string;
  weeks: number;
  peakScore: number;
  peakWeek: string;
  avgScore: number;
  trend: number | null;
  hitRate: number | null;
  leaksSubmitted: number;
  leaksQuoted: number;
  achUnlocked: number;
  achTotal: number;
}

const W = 1080;
const H = 1350;
const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Hex (#rrggbb) → "r,g,b". Falls back to a neutral gray for rgba()
 *  inputs (personaAccent can be an rgba string for the lowest tier). */
function rgbTriplet(color: string): string {
  if (color.startsWith('#') && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  return '180,180,180';
}

export function downloadBanweiWrappedCard(data: WrappedCardData): void {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const accent = data.personaAccent.startsWith('#') ? data.personaAccent : '#B0B0B0';
  const accentRGB = rgbTriplet(accent);

  // ── Background ──────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2D1B69');
  bg.addColorStop(0.55, '#1a0d35');
  bg.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 360, 60, W / 2, 360, 560);
  glow.addColorStop(0, `rgba(${accentRGB},0.22)`);
  glow.addColorStop(1, `rgba(${accentRGB},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 760);

  // ── Header ──────────────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(${accentRGB},0.9)`;
  ctx.font = `900 38px ${SANS}`;
  ctx.fillText('🎁 班味年终回顾', W / 2, 120);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `500 26px ${SANS}`;
  ctx.fillText('BANWEI WRAPPED · 你这一年有多班味', W / 2, 166);

  // ── Persona hero ────────────────────────────────────────────────
  ctx.font = `900 150px ${SANS}`;
  ctx.fillText(data.personaEmoji, W / 2, 360);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText('你的年度班味人格', W / 2, 430);
  ctx.fillStyle = accent;
  ctx.font = `900 64px ${SANS}`;
  ctx.fillText(data.personaLabel, W / 2, 502);

  // ── Stat cells (2×2) ────────────────────────────────────────────
  const cellW = 440;
  const cellH = 150;
  const gap = 32;
  const gridX = (W - cellW * 2 - gap) / 2;
  let gridY = 580;
  const trendStr =
    data.trend === null ? '—'
      : data.trend > 0 ? `↗ +${data.trend}`
      : data.trend < 0 ? `↘ ${data.trend}` : '= 持平';
  const cells: Array<{ label: string; value: string; sub: string }> = [
    { label: '班味峰值', value: String(data.peakScore), sub: data.peakWeek },
    { label: '打卡周数', value: `${data.weeks} 周`, sub: `平均 ${data.avgScore}` },
    { label: '班味趋势', value: trendStr, sub: '首周 → 最近' },
    { label: '爆料命中率', value: data.hitRate === null ? '—' : `${data.hitRate}%`, sub: `投 ${data.leaksSubmitted} · 中 ${data.leaksQuoted}` },
  ];
  cells.forEach((c, i) => {
    const cx = gridX + (i % 2) * (cellW + gap);
    const cy = gridY + Math.floor(i / 2) * (cellH + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, cx, cy, cellW, cellH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `600 24px ${SANS}`;
    ctx.fillText(c.label, cx + 28, cy + 46);
    ctx.fillStyle = accent;
    ctx.font = `900 56px ${SANS}`;
    ctx.fillText(c.value, cx + 28, cy + 104);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `500 22px ${SANS}`;
    ctx.fillText(c.sub, cx + 28, cy + 134);
  });

  // ── Achievement bar ─────────────────────────────────────────────
  gridY += cellH * 2 + gap * 2;
  const barX = gridX;
  const barW = cellW * 2 + gap;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, barX, gridY, barW, 120, 20);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText('🏅 成就解锁', barX + 28, gridY + 50);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFD700';
  ctx.font = `900 32px ${SANS}`;
  ctx.fillText(`${data.achUnlocked}/${data.achTotal}`, barX + barW - 28, gridY + 50);
  // progress track
  const trackX = barX + 28;
  const trackW = barW - 56;
  const trackY = gridY + 78;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, trackX, trackY, trackW, 16, 8);
  ctx.fill();
  const pct = data.achTotal ? data.achUnlocked / data.achTotal : 0;
  if (pct > 0) {
    const fillGrad = ctx.createLinearGradient(trackX, 0, trackX + trackW, 0);
    fillGrad.addColorStop(0, '#FFD700');
    fillGrad.addColorStop(1, '#FFA947');
    ctx.fillStyle = fillGrad;
    roundRect(ctx, trackX, trackY, Math.max(16, trackW * pct), 16, 8);
    ctx.fill();
  }

  // ── Footer ──────────────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `600 28px ${SANS}`;
  ctx.fillText('OFFICE ZOO · 职场动物园', W / 2, H - 110);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font = `400 24px ${SANS}`;
  ctx.fillText('github.com/ChrisChen667788/office-zoo', W / 2, H - 70);

  // ── Export ──────────────────────────────────────────────────────
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'office-zoo-banwei-wrapped.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
