/**
 * negotiationShareCard — v6.65 — 「裁了么」闯关牌局赔偿结算战绩卡 PNG。
 *
 * 打完一局生成一张 1080×1350 竖图(对手 / 赔偿档 / 遗物 / 回合 / 收获 / 职级 + 一句
 * 嘴替),一键下载 / 系统分享。卡面内容由 shared 的 buildSettlementCard 纯函数定,
 * 这里只负责画。绘制风格对齐 fortuneShareCard。
 */
import { type SettlementCardInput, buildSettlementCard } from '@furball/shared';

const W = 1080;
const H = 1350;
const PAD = 64;
const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

const VIBE_COLOR = { win: '#22c55e', meh: '#fbbf24', lose: '#ef4444' } as const;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export async function generateNegotiationShareCard(input: SettlementCardInput): Promise<Blob> {
  const card = buildSettlementCard(input);
  const accent = VIBE_COLOR[card.vibe];
  const scale = Math.min(2, window.devicePixelRatio || 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');
  ctx.scale(scale, scale);

  // 背景:深底 + vibe 色径向光晕
  ctx.fillStyle = '#0e1016';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 360, 60, W / 2, 360, 760);
  glow.addColorStop(0, rgba(accent, 0.26));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 顶部品牌
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `900 30px ${SANS}`;
  ctx.fillStyle = accent;
  ctx.fillText('⚔️ 赔偿谈判 · 闯关战绩', PAD, 72);
  ctx.textAlign = 'right';
  ctx.font = `600 22px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('OFFICE ZOO', W - PAD, 72);

  // 结果大标题
  ctx.textAlign = 'center';
  ctx.font = `900 58px ${SANS}`;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = rgba(accent, 0.5);
  ctx.shadowBlur = 24;
  ctx.fillText(card.headline, W / 2, 230);
  ctx.shadowBlur = 0;

  // 赔偿档巨字
  const big = input.tier >= 1 ? input.multiple : '✕';
  ctx.font = `900 200px ${SANS}`;
  const bigGrad = ctx.createLinearGradient(0, 300, 0, 560);
  bigGrad.addColorStop(0, '#fff');
  bigGrad.addColorStop(1, accent);
  ctx.fillStyle = bigGrad;
  ctx.fillText(big, W / 2, 440);

  // 数据行卡片
  const boxX = PAD;
  const boxW = W - PAD * 2;
  let y = 600;
  const rowH = 92;
  roundRect(ctx, boxX, y, boxW, rowH * card.rows.length + 32, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  roundRect(ctx, boxX, y, boxW, rowH * card.rows.length + 32, 28);
  ctx.strokeStyle = rgba(accent, 0.3);
  ctx.lineWidth = 2;
  ctx.stroke();

  let ry = y + 16 + rowH / 2;
  for (const row of card.rows) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 30px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(row.label, boxX + 36, ry);
    ctx.textAlign = 'right';
    ctx.font = `800 34px ${SANS}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(row.value, boxX + boxW - 36, ry);
    ry += rowH;
  }

  // 嘴替 tagline
  ctx.textAlign = 'center';
  ctx.font = `italic 600 30px ${SANS}`;
  ctx.fillStyle = rgba(accent, 0.95);
  ctx.fillText(`“${card.tagline}”`, W / 2, y + rowH * card.rows.length + 100);

  // 底部
  ctx.font = `700 22px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('#裁了么 · 跟 AI HR 斗智斗勇 · officezoo.app', W / 2, H - 56);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob null'))), 'image/png', 1.0);
  });
}

export async function downloadNegotiationShareCard(input: SettlementCardInput): Promise<void> {
  const blob = await generateNegotiationShareCard(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'office-zoo-赔偿战绩.png';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

function canSystemShareImage(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'p.png', { type: 'image/png' })] });
  } catch { return false; }
}

/** 系统分享(移动端);不支持/失败返回 false,调用方回退到下载。 */
export async function shareNegotiationCard(input: SettlementCardInput): Promise<boolean> {
  if (!canSystemShareImage()) return false;
  try {
    const blob = await generateNegotiationShareCard(input);
    const file = new File([blob], 'office-zoo-赔偿战绩.png', { type: 'image/png' });
    if (!navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title: '我的赔偿谈判战绩', text: '跟 AI HR 斗智斗勇 #裁了么' });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    return false;
  }
}
