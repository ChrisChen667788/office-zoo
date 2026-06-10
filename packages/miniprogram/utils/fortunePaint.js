/**
 * fortunePaint — v6.79. 班味占卜 1080×1350 分享海报的纯绘制函数。
 *
 * 跟 banweiPaint 同一套路:从 pages/fortune/index.js 抽出来,用 mock
 * CanvasRenderingContext2D 即可 headless 单测;wx Canvas 2D 与浏览器
 * Canvas 2D 在我们用到的 API 上完全兼容,所以函数本身平台无关。
 *
 * 额外导出:
 *   - vibeTier(score)  运势分 → {label, color}(与 H5 端 Fortune.tsx 的
 *     VIBE_LABEL / VIBE_COLOR 同一分段,两端文案保持一致)
 *   - wrapCn(text, n)  中文按字数硬换行(canvas 没有自动换行,忠告/微行动
 *     是 40-60 字长句,必须手动切行)
 */

/** 运势分 → 档位。分段与 H5 端 1:1(大吉80/小吉60/中平40/小凶20/大凶)。 */
function vibeTier(score) {
  if (score >= 80) return { label: '大吉', color: '#22c55e' };
  if (score >= 60) return { label: '小吉', color: '#a3e635' };
  if (score >= 40) return { label: '中平', color: '#fbbf24' };
  if (score >= 20) return { label: '小凶', color: '#fb923c' };
  return { label: '大凶', color: '#ef4444' };
}

/** 中文硬换行:每 n 个字符切一行(CJK 等宽,不需要测量);最多 maxLines 行,超出加 …。 */
function wrapCn(text, n, maxLines) {
  const t = String(text || '');
  const lines = [];
  for (let i = 0; i < t.length; i += n) lines.push(t.slice(i, i + n));
  if (maxLines && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, Math.max(0, n - 1)) + '…';
    return kept;
  }
  return lines;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W  1080
 * @param {number} H  1350
 * @param {{date: string, emoji: string, title: string, subtitle: string,
 *          vibeScore: number, gradient: [string, string],
 *          advice: string, microAction: string}} data
 */
function paintFortune(ctx, W, H, data) {
  const { date, emoji, title, subtitle, vibeScore, gradient, advice, microAction } = data;
  const tier = vibeTier(vibeScore);

  // BG — 牌面渐变(跟 H5 卡面同源的两段色)
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, gradient[0]);
  bg.addColorStop(1, gradient[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // 顶部压暗一层,保 header 可读
  const dim = ctx.createLinearGradient(0, 0, 0, H * 0.3);
  dim.addColorStop(0, 'rgba(0,0,0,0.35)');
  dim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = dim;
  ctx.fillRect(0, 0, W, H * 0.3);

  // Header
  ctx.fillStyle = '#FFD58A';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('OFFICE ZOO · 班味占卜 · 微信小程序', 56, 56);

  // 档位 + 运势分(右上)
  ctx.textAlign = 'right';
  ctx.fillStyle = tier.color;
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(`${tier.label} · 运势 ${vibeScore}`, W - 56, 120);

  // 运势条
  const barX = 56, barY = 180, barW = W - 112, barH = 14;
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = tier.color;
  ctx.fillRect(barX, barY, barW * Math.max(0, Math.min(100, vibeScore)) / 100, barH);

  // Hero — 大 emoji + 标题 + 副标题
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '300px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(emoji, W / 2, 480);
  ctx.font = 'bold 88px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, W / 2, 700);
  ctx.font = '36px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillText(subtitle, W / 2, 775);

  // 今日忠告块
  const blockX = 72, blockW = W - 144;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(blockX, 850, blockW, 180);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffd58a';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('✦ 今日忠告', blockX + 32, 874);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '30px sans-serif';
  wrapCn(advice, 28, 3).forEach((line, i) => {
    ctx.fillText(line, blockX + 32, 922 + i * 42);
  });

  // 5 分钟微行动块
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(blockX, 1060, blockW, 150);
  ctx.fillStyle = '#9be6ff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('✦ 5 分钟微行动', blockX + 32, 1084);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  wrapCn(microAction, 28, 2).forEach((line, i) => {
    ctx.fillText(line, blockX + 32, 1132 + i * 42);
  });

  // Footer — 日期戳 + 仓库
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`OFFICE ZOO TAROT · ${date}`, W / 2, H - 100);
  ctx.fillStyle = 'rgba(255,215,0,0.55)';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('🐀 github.com/ChrisChen667788/office-zoo', W / 2, H - 60);
}

module.exports = { paintFortune, vibeTier, wrapCn };
