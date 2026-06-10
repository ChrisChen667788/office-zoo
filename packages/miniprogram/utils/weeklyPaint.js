/**
 * weeklyPaint — v6.80. 周报生成器 1080×1350 分享海报的纯绘制函数。
 *
 * 照 H5 端 utils/weeklyShareCard.ts 的构图重画:顶部 header + 「同一件事 · 4 种说法」+
 * 关键事件框 + 4 风格卡 2×2 宫格 + footer。banwei/fortune 同一套路:纯函数、平台无关、
 * mock ctx 即可 headless 单测。中文换行复用 fortunePaint 的 wrapCn。
 */
const { wrapCn } = require('./fortunePaint');

/** 风格 → 配色,与 H5 端 weeklyShareCard 的 STYLE_PALETTE 同源。 */
const STYLE_PALETTE = {
  alibaba: { from: '#4ECDC4', to: '#4A90E2', accent: '#4ECDC4' },
  pua:     { from: '#FF4FA3', to: '#7C3AED', accent: '#FF4FA3' },
  posh:    { from: '#FFD700', to: '#FFA947', accent: '#FFD700' },
  direct:  { from: '#FF6B35', to: '#FF3355', accent: '#FF6B35' },
};
const FALLBACK_PALETTE = { from: '#888888', to: '#555555', accent: '#aaaaaa' };

function paletteOf(style) {
  return STYLE_PALETTE[style] || FALLBACK_PALETTE;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W 1080
 * @param {number} H 1350
 * @param {{event: string, results: Array<{style: string, label: string,
 *          emoji: string, text: string}>}} data  results 取前 4 条画 2×2
 */
function paintWeekly(ctx, W, H, data) {
  const PAD = 56;

  // BG — 深紫宇宙(banwei 同款)
  const bg = ctx.createRadialGradient(W / 2, H * 0.35, W * 0.1, W / 2, H / 2, W * 0.95);
  bg.addColorStop(0, '#2D1B69');
  bg.addColorStop(0.5, '#1a0d35');
  bg.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#FFD58A';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('📊 周报生成器 · OFFICE ZOO 小程序', PAD, 56);

  // 标语
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('✦ 同一件事 · 4 种说法', W / 2, 130);

  // 关键事件框
  const evLines = wrapCn(data.event, 26, 2);
  const evBoxY = 210, evBoxH = 36 + evLines.length * 40 + 20;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(PAD, evBoxY, W - PAD * 2, evBoxH);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('— 本周关键事件 —', W / 2, evBoxY + 14);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '30px sans-serif';
  evLines.forEach((ln, i) => {
    ctx.fillText(ln, W / 2, evBoxY + 52 + i * 40);
  });

  // 2×2 风格卡宫格
  const gap = 18;
  const topY = evBoxY + evBoxH + 28;
  const gridW = W - PAD * 2;
  const cardW = (gridW - gap) / 2;
  const cardH = Math.floor((H - 90 - topY - gap) / 2); // 给 footer 留 90
  const cards = (data.results || []).slice(0, 4);
  cards.forEach((card, i) => {
    const c = i % 2, r = Math.floor(i / 2);
    const x = PAD + c * (cardW + gap);
    const y = topY + r * (cardH + gap);
    const p = paletteOf(card.style);
    // 卡底
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, cardW, cardH);
    // 顶部色条
    const strip = ctx.createLinearGradient(x, y, x + cardW, y);
    strip.addColorStop(0, p.from);
    strip.addColorStop(1, p.to);
    ctx.fillStyle = strip;
    ctx.fillRect(x, y, cardW, 8);
    // 标签行
    ctx.textAlign = 'left';
    ctx.font = '34px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(card.emoji, x + 22, y + 28);
    ctx.fillStyle = p.accent;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(card.label, x + 70, y + 30);
    // 正文(按卡高动态决定行数)
    const lineH = 36;
    const maxLines = Math.max(3, Math.floor((cardH - 100) / lineH));
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = '24px sans-serif';
    wrapCn(card.text, 18, maxLines).forEach((ln, li) => {
      ctx.fillText(ln, x + 22, y + 86 + li * lineH);
    });
  });

  // Footer
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFD58A';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('#周报生成器', PAD, H - 64);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,215,0,0.55)';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('🐀 github.com/ChrisChen667788/office-zoo', W - PAD, H - 60);
}

module.exports = { paintWeekly, paletteOf, STYLE_PALETTE };
