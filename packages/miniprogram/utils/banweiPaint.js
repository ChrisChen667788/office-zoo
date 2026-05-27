/**
 * banweiPaint — v6.36 P2. Extracted pure fn from
 * pages/banwei/index.js so it can be unit-tested headless with
 * a mock CanvasRenderingContext2D.
 *
 * The wx-Canvas-2D ctx is API-compatible with browser Canvas 2D for
 * everything we use (fillRect / fillText / arc / createLinearGradient /
 * createRadialGradient / beginPath / lineTo / moveTo / closePath /
 * fill / stroke / textAlign / textBaseline / font / fillStyle /
 * strokeStyle / lineWidth). So this fn is platform-agnostic.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {{score: number, tierLabel: string, tierEmoji: string,
 *          tierAccent: string, breakdown: Array<{name, count, cap}>,
 *          priorScore: number | null, delta: number | null}} data
 */
function paintBanwei(ctx, W, H, data) {
  const { score, tierLabel, tierEmoji, tierAccent, breakdown, priorScore, delta } = data;

  // BG — radial cosmic
  const bg = ctx.createRadialGradient(W / 2, H * 0.4, W * 0.1, W / 2, H / 2, W * 0.9);
  bg.addColorStop(0, '#2D1B69');
  bg.addColorStop(0.5, '#1a0d35');
  bg.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = '#FFD58A';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('OFFICE ZOO · 班味指数 · 微信小程序', 56, 56);

  // Score badge
  const bx = W / 2, by = 340, br = 180;
  const grad = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br);
  grad.addColorStop(0, tierAccent);
  grad.addColorStop(1, tierAccent + 'aa');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0a0a1e';
  ctx.font = 'bold 160px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(score), bx, by - 10);
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = 'rgba(10,10,30,0.7)';
  ctx.fillText('SCORE / 100', bx, by + 90);

  // Tier
  ctx.fillStyle = tierAccent;
  ctx.font = 'bold 60px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${tierEmoji} ${tierLabel}`, bx, 570);

  // 5-axis radar
  const cx = bx, cy = 880, rr = 200;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  for (let ring = 1; ring <= 4; ring++) {
    const rad = (rr * ring) / 4;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  // Data polygon
  ctx.fillStyle = tierAccent + '50';
  ctx.strokeStyle = tierAccent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  breakdown.forEach((b, i) => {
    const ratio = b.cap > 0 ? Math.min(1, b.count / b.cap) : 0;
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const px = cx + Math.cos(a) * rr * ratio;
    const py = cy + Math.sin(a) * rr * ratio;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '600 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  breakdown.forEach((b, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const lx = cx + Math.cos(a) * (rr + 40);
    const ly = cy + Math.sin(a) * (rr + 40);
    ctx.fillText(b.name, lx, ly);
  });

  // WoW row
  ctx.font = '600 28px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  if (priorScore !== null) {
    const arrow = delta > 0 ? '↗' : delta < 0 ? '↘' : '=';
    const dColor = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText(`上周 ${priorScore}`, W / 2 - 80, 1170);
    ctx.fillStyle = dColor;
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(arrow, W / 2, 1170);
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(delta > 0 ? `+${delta}` : delta === 0 ? '持平' : String(delta), W / 2 + 90, 1170);
  } else {
    ctx.textAlign = 'center';
    ctx.fillText('第一次班味打卡 · 下周来看变化', W / 2, 1170);
  }

  // Footer
  ctx.fillStyle = 'rgba(255,215,0,0.55)';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🐀 github.com/ChrisChen667788/office-zoo', W / 2, H - 60);
}

module.exports = { paintBanwei };
