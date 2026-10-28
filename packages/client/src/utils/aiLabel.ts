/**
 * aiLabel — v6.169 / v6.164 — AI 生成内容显式标识的文案与画布水印,全站统一从这里取。
 *
 * 依据《人工智能生成合成内容标识办法》(2025-09-01 施行):生成合成的音频、图像、视频要有
 * 显式标识,**下载 / 导出的文件本身也要带**——页面上的角标随文件一分享就没了,所以导出的
 * 视频每一帧都画水印,片尾再给一张完整声明。
 */

export const AI_LABEL = 'AI 生成';
export const AI_VIDEO_END_LABEL = '本视频由 AI 生成';
export const AI_CONTENT_NOTICE = '内容由 AI 创作,仅供娱乐,不代表真实人物与事件';

/**
 * 在画布右上角画「AI 生成」水印。每一帧都要调用(放在场景绘制之后,保证不被盖住)。
 * 字号按画布短边缩放,横竖版都清晰可读。
 */
export function drawAiWatermark(ctx: CanvasRenderingContext2D, dims: { w: number; h: number }): void {
  const short = Math.min(dims.w, dims.h);
  const fontPx = Math.round(short * 0.034);
  const padX = Math.round(fontPx * 0.6);
  const padY = Math.round(fontPx * 0.35);
  const margin = Math.round(short * 0.035);

  ctx.save();
  ctx.font = `bold ${fontPx}px -apple-system, "PingFang SC", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  const textW = ctx.measureText(AI_LABEL).width;
  const boxW = textW + padX * 2;
  const boxH = fontPx + padY * 2;
  const x = dims.w - margin - boxW;
  const y = margin;
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.08));
  ctx.strokeRect(x, y, boxW, boxH);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(AI_LABEL, dims.w - margin - padX, y + padY);
  ctx.restore();
}
