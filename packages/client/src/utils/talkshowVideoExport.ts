/**
 * talkshowVideoExport — v6.169 — 班味单口导出短视频(纯前端,不经服务器、不调模型)。
 *
 * 与经典局的 videoExport(30 秒高光集锦、无声)不同,单口的核心是那段配音,所以这里:
 *   - 画面:人设立绘 + 标题 + 话题 + 跟着配音逐句出现的字幕(1080×1920 竖版 / 1920×1080 横版)
 *   - 声音:把已经拿到的 TTS 音频(mp3 Blob)经 WebAudio 混进录制流,导出带声音的视频
 *   - 时长:片头 1.2 秒 + 配音时长(上限 120 秒)+ 片尾 3 秒
 *   - 标识:每一帧右上角「AI 生成」水印,片尾整屏「本视频由 AI 生成」——文件被转发出去后
 *     标识还在(《人工智能生成合成内容标识办法》对导出文件的要求)
 *
 * 浏览器朗读兜底(服务器没给音频)时浏览器语音录不进来,导出无声字幕版,按段子预估时长走字幕。
 * 不支持 MediaRecorder / captureStream 的浏览器(部分 Safari 与内置浏览器)走 exportTalkshowPoster:
 * 一张带全文字幕与标识的竖版海报 PNG,配音另存为 mp3。
 */
import { AI_CONTENT_NOTICE, AI_LABEL, AI_VIDEO_END_LABEL, drawAiWatermark } from './aiLabel';
import { ASPECT_DIMS, VIDEO_FPS, stopRecorder, type ExportResult, type VideoAspect } from './videoExport';
import { startFrameTicker } from './frameTicker';

export const TALKSHOW_INTRO_SEC = 1.2;
export const TALKSHOW_END_SEC = 3;
export const TALKSHOW_MAX_BODY_SEC = 120;

export interface TalkshowVideoInput {
  title: string;
  text: string;
  tagLabel: string;
  tagColor: string;
  personaLabel: string;
  personaEmoji: string;
  personaImageUrl?: string;
  /** 服务器 TTS 的 mp3;null = 浏览器朗读兜底,导出无声字幕版。 */
  audioBlob?: Blob | null;
  /** 没有音频时字幕按这个时长走(段子元数据里的 durationSec)。 */
  fallbackDurationSec: number;
  aspect?: VideoAspect;
  onProgress?: (p: number) => void;
}

export interface TalkshowTimeline {
  introSec: number;
  bodySec: number;
  endSec: number;
  totalSec: number;
}

export function talkshowTimeline(bodySec: number): TalkshowTimeline {
  const body = Math.min(TALKSHOW_MAX_BODY_SEC, Math.max(3, Number.isFinite(bodySec) ? bodySec : 3));
  return {
    introSec: TALKSHOW_INTRO_SEC,
    bodySec: body,
    endSec: TALKSHOW_END_SEC,
    totalSec: TALKSHOW_INTRO_SEC + body + TALKSHOW_END_SEC,
  };
}

/** 第 t 秒时字幕已经念到全文的几成(0..1)。片头为 0,配音结束及之后为 1。 */
export function captionProgress(t: number, tl: TalkshowTimeline): number {
  if (t <= tl.introSec) return 0;
  return Math.min(1, (t - tl.introSec) / tl.bodySec);
}

/** 按中英文句末标点切句,标点留在句尾;空白段丢弃。 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of text) {
    cur += ch;
    if (/[。！？!?；;…\n]/.test(ch)) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export interface CaptionState {
  /** 已念完的上一句(淡显),没有则为空串。 */
  previous: string;
  /** 正在念的这一句里已经出现的部分。 */
  current: string;
}

/** 按念到的进度,给出「上一句 + 当前句已出现部分」。按字符数线性推进(TTS 语速近似匀速)。 */
export function captionAt(sentences: string[], progress: number): CaptionState {
  const total = sentences.reduce((n, s) => n + [...s].length, 0);
  if (total === 0) return { previous: '', current: '' };
  // +1e-9:进度来自浮点除法,(k/total)*total 可能落在 k-ε,不加就会少显示一个字。
  let cursor = Math.floor(Math.min(1, Math.max(0, progress)) * total + 1e-9);
  for (let i = 0; i < sentences.length; i++) {
    const chars = [...sentences[i]];
    if (cursor <= chars.length || i === sentences.length - 1) {
      return {
        previous: i > 0 ? sentences[i - 1] : '',
        current: chars.slice(0, Math.min(cursor, chars.length)).join(''),
      };
    }
    cursor -= chars.length;
  }
  return { previous: '', current: '' };
}

const FONT = '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif';

interface FrameAssets {
  portrait: CanvasImageSource | null;
  sentences: string[];
  /** 字幕最多显示几行(视频 4 行,只看正在念的;海报放全文)。 */
  captionMaxLines?: number;
  /** 字幕字号缩放(海报全文时调小)。 */
  captionScale?: number;
}

/**
 * 画第 t 秒的一帧。纯绘制,不碰 DOM 与计时,测试可以用假 ctx 逐帧断言。
 * 片尾整屏声明;其余帧画主体;**所有帧最后都画 AI 水印**。
 */
export function drawTalkshowFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  input: Pick<TalkshowVideoInput, 'title' | 'tagLabel' | 'tagColor' | 'personaLabel' | 'personaEmoji'>,
  assets: FrameAssets,
  tl: TalkshowTimeline,
  dims: { w: number; h: number },
): void {
  drawBg(ctx, dims);
  if (t >= tl.introSec + tl.bodySec) {
    drawEndCard(ctx, Math.min(1, (t - tl.introSec - tl.bodySec) / 0.6), dims);
  } else {
    const fadeIn = Math.min(1, t / tl.introSec);
    const cap = captionAt(assets.sentences, captionProgress(t, tl));
    if (dims.w >= dims.h) drawBodyWide(ctx, input, assets, cap, fadeIn, dims);
    else drawBodyTall(ctx, input, assets, cap, fadeIn, dims);
  }
  drawAiWatermark(ctx, dims);
}

function drawBg(ctx: CanvasRenderingContext2D, dims: { w: number; h: number }) {
  const g = ctx.createLinearGradient(0, 0, 0, dims.h);
  g.addColorStop(0, '#0a0a1e');
  g.addColorStop(0.5, '#1a0d2e');
  g.addColorStop(1, '#0d0a25');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, dims.w, dims.h);
}

function drawPortrait(
  ctx: CanvasRenderingContext2D,
  portrait: CanvasImageSource | null,
  emoji: string,
  x: number, y: number, size: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  if (portrait) {
    const iw = (portrait as HTMLImageElement).naturalWidth || (portrait as HTMLImageElement).width || size;
    const ih = (portrait as HTMLImageElement).naturalHeight || (portrait as HTMLImageElement).height || size;
    // cover 裁切:短边铺满。
    const scale = Math.max(size / iw, size / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(portrait, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, size, size);
    ctx.font = `${Math.round(size * 0.45)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(emoji, x + size / 2, y + size / 2);
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, size, size);
  ctx.restore();
}

/** 行首禁则:这些标点不能出现在行首,放不下也挂在上一行末尾。 */
const NO_LINE_START = new Set([...'，。、！？；：,.!?;:）)」』”’》〉…%']);

/** 切成换行单位:英文/数字连写成一个词不拆,其余(中文、标点、空白)逐字。 */
export function wrapTokens(text: string): string[] {
  return text.match(/[A-Za-z0-9][A-Za-z0-9.'%_-]*|\n|\s+|./gsu) ?? [];
}

/** CJK 换行:逐单位测量;英文词整体换行,超长的词才逐字拆;标点不落行首。 */
export function wrapLines(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  const fits = (s: string) => ctx.measureText(s).width <= maxW;
  for (const tok of wrapTokens(text)) {
    if (tok === '\n') { lines.push(cur); cur = ''; continue; }
    if (fits(cur + tok)) { cur += tok; continue; }
    if (cur && NO_LINE_START.has(tok)) { cur += tok; continue; } // 挂在行尾,允许略超
    if (/^\s+$/.test(tok)) { if (cur) { lines.push(cur); cur = ''; } continue; }
    if (cur) { lines.push(cur); cur = ''; }
    if (fits(tok)) { cur = tok; continue; }
    for (const ch of tok) { // 单个词就比一行还长:只能逐字拆
      if (fits(cur + ch) || !cur) cur += ch;
      else { lines.push(cur); cur = ch; }
    }
  }
  if (cur) lines.push(cur);
  return lines.filter((l, i) => l !== '' || i < lines.length - 1);
}

function drawLines(
  ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineH: number, align: CanvasTextAlign,
) {
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  input: Pick<TalkshowVideoInput, 'title' | 'tagLabel' | 'tagColor'>,
  x: number, y: number, maxW: number, titlePx: number, align: CanvasTextAlign,
): number {
  ctx.save();
  ctx.font = `bold ${Math.round(titlePx * 0.5)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText('班味单口 · OFFICE ZOO', x, y);
  ctx.font = `bold ${titlePx}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  const titleLines = wrapLines(ctx, input.title, maxW).slice(0, 2);
  drawLines(ctx, titleLines, x, y + titlePx * 0.9, titlePx * 1.2, align);
  const tagY = y + titlePx * 0.9 + titleLines.length * titlePx * 1.2 + titlePx * 0.3;
  ctx.font = `bold ${Math.round(titlePx * 0.55)}px ${FONT}`;
  ctx.fillStyle = input.tagColor;
  ctx.fillText(input.tagLabel, x, tagY);
  ctx.restore();
  return tagY + titlePx * 0.9;
}

function drawCaptions(
  ctx: CanvasRenderingContext2D, cap: CaptionState, x: number, y: number, maxW: number, px: number, align: CanvasTextAlign,
  maxLines = 4,
) {
  ctx.save();
  let cursorY = y;
  if (cap.previous) {
    ctx.font = `${Math.round(px * 0.72)}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const prev = wrapLines(ctx, cap.previous, maxW).slice(-2);
    drawLines(ctx, prev, x, cursorY, px * 0.95, align);
    cursorY += prev.length * px * 0.95 + px * 0.4;
  }
  ctx.font = `bold ${px}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  // 当前句太长时只保留最后几行,保证正在念的字一直在画面里。
  const cur = wrapLines(ctx, cap.current, maxW).slice(-maxLines);
  drawLines(ctx, cur, x, cursorY, px * 1.3, align);
  ctx.restore();
}

function drawFooter(ctx: CanvasRenderingContext2D, dims: { w: number; h: number }) {
  ctx.save();
  ctx.font = `${Math.round(Math.min(dims.w, dims.h) * 0.028)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`OFFICE ZOO 班味剧场 · ${AI_CONTENT_NOTICE}`, dims.w / 2, dims.h - Math.round(dims.h * 0.025));
  ctx.restore();
}

function drawBodyTall(
  ctx: CanvasRenderingContext2D,
  input: Pick<TalkshowVideoInput, 'title' | 'tagLabel' | 'tagColor' | 'personaLabel' | 'personaEmoji'>,
  assets: FrameAssets,
  cap: CaptionState,
  alpha: number,
  dims: { w: number; h: number },
) {
  const portrait = assets.portrait;
  const pad = 90;
  ctx.save();
  ctx.globalAlpha = alpha;
  const afterHeader = drawHeader(ctx, input, pad, 150, dims.w - pad * 2 - 220, 64, 'left');
  const size = 620;
  const px = (dims.w - size) / 2;
  const py = Math.max(afterHeader + 30, 420);
  drawPortrait(ctx, portrait, input.personaEmoji, px, py, size);
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`🎤 ${input.personaLabel}`, dims.w / 2, py + size + 24);
  ctx.restore();
  drawCaptions(ctx, cap, dims.w / 2, py + size + 110, dims.w - pad * 2, 58 * (assets.captionScale ?? 1), 'center', assets.captionMaxLines);
  drawFooter(ctx, dims);
}

function drawBodyWide(
  ctx: CanvasRenderingContext2D,
  input: Pick<TalkshowVideoInput, 'title' | 'tagLabel' | 'tagColor' | 'personaLabel' | 'personaEmoji'>,
  assets: FrameAssets,
  cap: CaptionState,
  alpha: number,
  dims: { w: number; h: number },
) {
  const portrait = assets.portrait;
  const size = 640;
  const px = 140;
  const py = (dims.h - size) / 2 - 30;
  const rightX = px + size + 100;
  const rightW = dims.w - rightX - 120;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawPortrait(ctx, portrait, input.personaEmoji, px, py, size);
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`🎤 ${input.personaLabel}`, px + size / 2, py + size + 18);
  const afterHeader = drawHeader(ctx, input, rightX, 130, rightW - 200, 56, 'left');
  ctx.restore();
  drawCaptions(ctx, cap, rightX, afterHeader + 40, rightW, 50 * (assets.captionScale ?? 1), 'left', assets.captionMaxLines);
  drawFooter(ctx, dims);
}

function drawEndCard(ctx: CanvasRenderingContext2D, p: number, dims: { w: number; h: number }) {
  const short = Math.min(dims.w, dims.h);
  ctx.save();
  ctx.globalAlpha = Math.max(0.15, p);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(short * 0.085)}px ${FONT}`;
  ctx.fillText(AI_VIDEO_END_LABEL, dims.w / 2, dims.h * 0.36);
  ctx.font = `${Math.round(short * 0.036)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(AI_CONTENT_NOTICE, dims.w / 2, dims.h * 0.46);
  ctx.font = `bold ${Math.round(short * 0.06)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('OFFICE ZOO 班味剧场', dims.w / 2, dims.h * 0.6);
  ctx.font = `${Math.round(short * 0.034)}px ${FONT}`;
  ctx.fillStyle = '#7ec8ff';
  ctx.fillText('GitHub · ChrisChen667788/office-zoo', dims.w / 2, dims.h * 0.67);
  ctx.restore();
}

/** 选浏览器支持的录制格式。有声音时要求带音频编码,优先 mp4(Safari / 新版 Chrome)。 */
export function pickRecorderMime(hasAudio: boolean, isTypeSupported: (m: string) => boolean): string | null {
  const withAudio = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
  ];
  const videoOnly = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
  const list = hasAudio ? [...withAudio, 'video/mp4', 'video/webm'] : [...videoOnly, 'video/mp4', 'video/webm'];
  return list.find((m) => { try { return isTypeSupported(m); } catch { return false; } }) ?? null;
}

/** 系统分享时附带的文案:标题后注明 AI 生成,话题标签便于聚合。 */
export function talkshowShareText(title: string): string {
  return `班味单口 · ${title}(${AI_LABEL})\n#班味单口 #打工人 #OFFICEZOO #AI生成`;
}

/** 当前浏览器能不能录视频(否则走海报兜底)。 */
export function canRecordVideo(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (!('MediaRecorder' in window)) return false;
  const c = document.createElement('canvas') as HTMLCanvasElement & { captureStream?: unknown };
  return typeof c.captureStream === 'function';
}

function loadImage(url: string | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function fileStem(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 20) || 'talkshow';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `office-zoo-单口-${safe}-${date}`;
}

type AudioCtor = typeof AudioContext;

/**
 * 录制带配音的单口视频。必须在点击事件里**同步**调用(内部第一步就创建并恢复 AudioContext,
 * Safari 只在用户手势里允许出声)。录制按实时进行,耗时约等于视频时长;期间别切走标签页
 * (浏览器会暂停后台页的动画帧)。
 */
export async function exportTalkshowVideo(input: TalkshowVideoInput): Promise<ExportResult & { hasAudio: boolean }> {
  const AC: AudioCtor | undefined = typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext)
    : undefined;
  const audioCtx = input.audioBlob && AC ? new AC() : null;
  void audioCtx?.resume().catch(() => {});

  if (!canRecordVideo()) {
    // AudioContext 必须在点击手势里同步创建(Safari),所以早于能力检查;录不了就关掉,别泄漏
    void audioCtx?.close().catch(() => {});
    throw new Error('MediaRecorder / captureStream unavailable');
  }

  let audioBuf: AudioBuffer | null = null;
  if (audioCtx && input.audioBlob) {
    try {
      audioBuf = await audioCtx.decodeAudioData(await input.audioBlob.arrayBuffer());
    } catch {
      audioBuf = null; // 解码失败就导出无声字幕版
    }
  }
  const hasAudio = !!audioBuf;
  const mimeType = pickRecorderMime(hasAudio, (m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) {
    void audioCtx?.close().catch(() => {});
    throw new Error('No supported MediaRecorder output codec.');
  }

  const dims = ASPECT_DIMS[input.aspect ?? 'vertical'];
  const canvas = document.createElement('canvas');
  canvas.width = dims.w;
  canvas.height = dims.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const tl = talkshowTimeline(audioBuf ? audioBuf.duration : input.fallbackDurationSec);
  const assets: FrameAssets = {
    portrait: await loadImage(input.personaImageUrl),
    sentences: splitSentences(input.text),
  };

  const videoStream = canvas.captureStream(VIDEO_FPS);
  const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
  let source: AudioBufferSourceNode | null = null;
  if (audioCtx && audioBuf) {
    const dest = audioCtx.createMediaStreamDestination();
    source = audioCtx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(dest); // 只进录制流,不外放:导出时不会突然出声
    tracks.push(...dest.stream.getAudioTracks());
  }
  const recorder = new MediaRecorder(new MediaStream(tracks), {
    mimeType,
    videoBitsPerSecond: 4_000_000,
    ...(hasAudio ? { audioBitsPerSecond: 128_000 } : {}),
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  drawTalkshowFrame(ctx, 0, input, assets, tl, dims);
  const start = performance.now();
  recorder.start(1000);
  if (source && audioCtx) source.start(audioCtx.currentTime + tl.introSec);

  let lastWhole = -1;
  await new Promise<void>((resolve) => {
    // Worker 驱动而不是 rAF:切到后台标签页也继续出帧(见 frameTicker)。
    let finished = false;
    const finish = () => { if (finished) return; finished = true; stop(); resolve(); };
    const stop = startFrameTicker(VIDEO_FPS, () => {
      const t = (performance.now() - start) / 1000;
      if (t >= tl.totalSec) { finish(); return; }
      drawTalkshowFrame(ctx, t, input, assets, tl, dims);
      const whole = Math.floor(t);
      if (whole !== lastWhole) { lastWhole = whole; input.onProgress?.(t / tl.totalSec); }
    });
    // 兜底:万一 ticker 一直不来(Worker 被拦又退不到 setInterval 之类),到点也要收尾,不能永远挂着。
    setTimeout(finish, (tl.totalSec + 3) * 1000);
  });
  drawTalkshowFrame(ctx, tl.totalSec, input, assets, tl, dims);
  await stopRecorder(recorder);
  try { source?.stop(); } catch { /* 已经播完 */ }
  void audioCtx?.close().catch(() => {});

  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  input.onProgress?.(1);
  return {
    blob: new Blob(chunks, { type: mimeType.split(';')[0] }),
    mimeType,
    fileName: `${fileStem(input.title)}.${ext}`,
    durationMs: performance.now() - start,
    hasAudio,
  };
}

/** 录不了视频的浏览器:导出一张带全文字幕与 AI 标识的竖版海报。 */
export async function exportTalkshowPoster(input: TalkshowVideoInput): Promise<ExportResult> {
  const dims = ASPECT_DIMS.vertical;
  const canvas = document.createElement('canvas');
  canvas.width = dims.w;
  canvas.height = dims.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  const tl = talkshowTimeline(input.fallbackDurationSec);
  // 全文作为一句整段显示,字号调小、行数放开,海报上能读完整个段子。
  const assets: FrameAssets = {
    portrait: await loadImage(input.personaImageUrl),
    sentences: [input.text],
    captionMaxLines: 9,
    captionScale: 0.72,
  };
  // 取字幕全部出现的那一刻(配音末尾),全文作为「当前句」整段显示。
  drawTalkshowFrame(ctx, tl.introSec + tl.bodySec - 0.001, input, assets, tl, dims);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
  return { blob, mimeType: 'image/png', fileName: `${fileStem(input.title)}.png`, durationMs: 0 };
}
