/**
 * packLeaderboardCard — v6.39 P5 1080×1350 PNG 分享卡 for the
 * pack-scoped 班味 leaderboard ("我们公司班味 Top 10").
 *
 * Pure canvas → blob → download, no deps. Mirrors banweiShareCard.ts.
 * Caller passes the already-fetched top rows + the user's own prefix so
 * we can highlight their row.
 */

export interface PackLeaderboardRow {
  userIdPrefix: string;
  score: number;
}

export interface PackLeaderboardCardData {
  /** Pack display name, e.g. "字节跳动 PM 组". */
  packName: string;
  weekKey: string;
  rows: PackLeaderboardRow[];
  /** The current user's truncated id, to highlight their row. */
  myPrefix: string;
}

const W = 1080;
const H = 1350;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function downloadPackLeaderboardCard(data: PackLeaderboardCardData): void {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // ── Background — deep cosmic gradient (brand) ───────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2D1B69');
  bg.addColorStop(0.55, '#1a0d35');
  bg.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft gold glow top-center
  const glow = ctx.createRadialGradient(W / 2, 140, 40, W / 2, 140, 520);
  glow.addColorStop(0, 'rgba(255,215,0,0.22)');
  glow.addColorStop(1, 'rgba(255,215,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 520);

  // ── Header ──────────────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD700';
  ctx.font = '900 40px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.fillText('🏢 公司班味排行榜', W / 2, 130);

  ctx.fillStyle = '#f4f4ff';
  ctx.font = '800 60px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  // Truncate very long pack names so they fit.
  const name = data.packName.length > 14 ? data.packName.slice(0, 13) + '…' : data.packName;
  ctx.fillText(name, W / 2, 210);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '500 30px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  ctx.fillText(`本周 ${data.weekKey} · 谁最班味`, W / 2, 262);

  // ── Rows ────────────────────────────────────────────────────────
  const rows = data.rows.slice(0, 10);
  const startY = 330;
  const rowH = 90;
  const padX = 90;
  const medal = ['🥇', '🥈', '🥉'];
  const rankColor = ['#FFD700', '#C0C0C0', '#CD7F32'];

  ctx.textAlign = 'left';
  rows.forEach((row, i) => {
    const y = startY + i * rowH;
    const isMe = row.userIdPrefix === data.myPrefix;
    // Row card
    ctx.fillStyle = isMe ? 'rgba(255,215,0,0.16)' : 'rgba(255,255,255,0.05)';
    roundRect(ctx, padX, y, W - padX * 2, rowH - 14, 16);
    ctx.fill();
    if (isMe) {
      ctx.strokeStyle = 'rgba(255,215,0,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const cy = y + (rowH - 14) / 2;
    // Rank badge
    ctx.textAlign = 'center';
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.fillStyle = i < 3 ? rankColor[i] : 'rgba(255,255,255,0.4)';
    if (i < 3) ctx.fillText(medal[i], padX + 56, cy + 14);
    else ctx.fillText(`${i + 1}`, padX + 56, cy + 16);

    // userId prefix (mono)
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = '600 38px "SF Mono", Menlo, monospace';
    ctx.fillText(row.userIdPrefix, padX + 130, cy + 14);

    if (isMe) {
      ctx.fillStyle = '#FFD700';
      ctx.font = '800 26px "PingFang SC", system-ui, sans-serif';
      ctx.fillText('← 你', padX + 130 + ctx.measureText(row.userIdPrefix).width + 24, cy + 12);
    }

    // Score
    ctx.textAlign = 'right';
    ctx.fillStyle = i < 3 ? rankColor[i] : 'rgba(255,255,255,0.7)';
    ctx.font = '900 48px system-ui, sans-serif';
    ctx.fillText(String(row.score), W - padX - 30, cy + 16);
  });

  if (rows.length === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '500 34px "PingFang SC", system-ui, sans-serif';
    ctx.fillText('🐀 本公司还没人打卡', W / 2, startY + 120);
  }

  // ── Footer ──────────────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '500 28px "PingFang SC", system-ui, sans-serif';
  ctx.fillText('OFFICE ZOO · 职场动物园', W / 2, H - 120);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font = '400 24px "PingFang SC", system-ui, sans-serif';
  ctx.fillText('github.com/ChrisChen667788/office-zoo', W / 2, H - 78);

  // ── Export ──────────────────────────────────────────────────────
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `office-zoo-pack-leaderboard-${data.weekKey}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
