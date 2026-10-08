/**
 * talkshowVideoGen — v6.94 — 把 6 个 talkshow persona 的「静态立绘」升级成
 * 「活立绘」循环动态视频(微表情 / 小情绪),提升段子播放的沉浸感。
 *
 * 走 MiniMax 海螺「图生视频 (image-to-video)」:把 talkshowAvatarGen 产出的
 * /public/talkshow-personas/<id>.png 当首帧,喂一段「符合人设的轻微待机动效」
 * prompt,异步出 6s 循环短片,落到 /public/talkshow-personas-video/<id>.mp4。
 * 客户端播放器把 <img> 换成循环静音 <video>(poster=png,缺失即回退静态图)。
 *
 * ## 为什么单独一个文件 + 单独的 key
 *  - 与 talkshowAvatarGen(图片)/ tts(语音)同源但产物 / 模型 / 时序都不同
 *    (视频是异步任务:提交 → 轮询 → 取文件 → 下载),塞进哪个都别扭。
 *  - 视频用 **MINIMAX_VIDEO_API_KEY**(用户的官方 sk-api key),与 TTS 跑的
 *    代理 key(可能没视频权限)分开,互不影响;缺省回退到 MINIMAX_API_KEY。
 *
 * ## 时序(异步任务)
 *  1. POST {base}/video_generation { model, prompt, first_frame_image(dataURL), ... } → task_id
 *  2. 轮询 GET {base}/query/video_generation?task_id=… 直到 status=Success / Fail
 *  3. Success 后拿 file_id → GET {base}/files/retrieve?file_id=…(带 GroupId 如有)→ download_url
 *  4. 下载 mp4 落盘
 *
 * 全程 graceful:任何一步失败都返回 { ok:false, reason },绝不抛到调用方;
 * 没视频时客户端自动回退静态立绘,所以「没生成 / 配额用完」也不影响段子能玩。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename2 = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const PNG_DIR = path.resolve(__dirname2, '../../public/talkshow-personas');
const VIDEO_DIR = path.resolve(__dirname2, '../../public/talkshow-personas-video');

if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

// ── env ────────────────────────────────────────────────────────────────
function key(): string {
  return process.env.MINIMAX_VIDEO_API_KEY || process.env.MINIMAX_API_KEY || '';
}
function base(): string {
  return (
    process.env.MINIMAX_VIDEO_BASE_URL ||
    process.env.MINIMAX_BASE_URL ||
    'https://api.minimaxi.com/v1'
  ).replace(/\/$/, '');
}
function groupId(): string {
  return process.env.MINIMAX_GROUP_ID || '';
}
function model(): string {
  return process.env.MINIMAX_VIDEO_MODEL || 'MiniMax-Hailuo-2.3-Fast';
}
function resolution(): string {
  // MiniMax-Hailuo-2.3-Fast 仅支持 768P / 1080P(不支持 512P)。768P 对小圆形立绘足够且更省。
  return process.env.MINIMAX_VIDEO_RESOLUTION || '768P';
}
function duration(): number {
  const d = parseInt(process.env.MINIMAX_VIDEO_DURATION || '6', 10);
  return Number.isFinite(d) && d > 0 ? d : 6;
}

// ── persona idle-loop prompts ────────────────────────────────────────────
// 每个 persona 一段「待机微动效」prompt:符合人设的微表情 / 小情绪 +
// 共用收尾约束(锁定机位、人物居中满框、轻微动作、可无缝循环、无字幕/水印)。
const PERSONA_EMOTION: Record<string, string> = {
  shaonv:
    '年轻女生,可爱里带点打工的无奈,偶尔轻轻眨眼、微微嘟嘴小叹气,发丝随呼吸轻动,眼神灵动',
  yujie:
    '三十多岁职场御姐,冷静中带一丝看穿一切的讽刺,缓慢眨眼、嘴角似笑非笑、偶尔轻挑眉,气场沉稳',
  qingse:
    '刚毕业的青涩男生,真诚带点迷茫,偶尔眨眼、轻轻挠头、眼神略飘忽,腼腆',
  jingying:
    '三十多岁精英男,精明克制自信,沉稳眨眼、偶尔微微点头或推一下眼镜,从容',
  badao:
    '四十多岁霸气老板,抱臂气场全开,挑眉、偶尔得意一笑又迅速收住,带点反差萌',
  qingnian:
    '中性气质的旁观叙述者,神情平和但观察犀利,自然眨眼、轻微呼吸起伏',
  // v6.123 — 整顿王(00后整顿职场):余额到位后一并生成第 7 段
  lingling:
    '21 岁零零后,挑染 mullet 发型,挑眉不屑的"就这?"表情,偶尔轻嗤一笑、下巴微抬,单边耳机,气场拉满不惯着任何人',
};

const PROMPT_SUFFIX =
  '。镜头机位完全锁定不动,人物头肩居中、始终完整在画面内;只做轻微的待机动作与面部微表情,' +
  '自然眨眼、轻柔呼吸,不要大幅度移动或转身、不要切镜、不要镜头推拉;动作幅度小、首尾可无缝循环;' +
  '画面干净,无任何文字、字幕、水印、logo。';

/** 纯函数:给某 persona 拼出图生视频 prompt(可单测)。 */
export function buildVideoPrompt(personaId: string): string {
  const emotion = PERSONA_EMOTION[personaId] ?? '人物自然待机,轻微表情';
  return `保持这张立绘的画风、配色与五官不变,让人物活起来:${emotion}${PROMPT_SUFFIX}`;
}

/** 纯函数:把 MiniMax 任务 status 归一成三态(可单测)。 */
export function classifyTaskStatus(status: string | undefined): 'success' | 'fail' | 'pending' {
  const s = (status ?? '').toLowerCase();
  if (s === 'success') return 'success';
  if (s === 'fail' || s === 'failed') return 'fail';
  return 'pending'; // Queueing / Preparing / Processing / 未知 → 继续等
}

/** 纯函数:从 query / retrieve 响应里尽量挖出可下载的视频 URL(字段位置各版本不一,容错)。 */
export function extractDownloadUrl(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, any>;
  return (
    o.download_url ||
    o.video_url ||
    o?.file?.download_url ||
    o?.file?.backup_download_url ||
    o?.data?.download_url ||
    null
  );
}

export const TALKSHOW_PERSONA_VIDEO_IDS = Object.keys(PERSONA_EMOTION);

// ── i2v task pipeline ────────────────────────────────────────────────────
function imageToDataUrl(pngPath: string): string {
  const buf = fs.readFileSync(pngPath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function submitTask(dataUrl: string, prompt: string): Promise<{ taskId?: string; error?: string }> {
  const res = await fetch(`${base()}/video_generation`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model(),
      prompt,
      first_frame_image: dataUrl,
      duration: duration(),
      resolution: resolution(),
    }),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { return { error: `非 JSON 响应 ${res.status}: ${text.slice(0, 200)}` }; }
  const taskId = data?.task_id;
  if (!taskId) {
    const msg = data?.base_resp?.status_msg ?? text.slice(0, 200);
    return { error: `提交失败 ${res.status} (${data?.base_resp?.status_code ?? '?'}): ${msg}` };
  }
  return { taskId };
}

async function queryTask(taskId: string): Promise<{ status: 'success' | 'fail' | 'pending'; fileId?: string; url?: string; raw?: any }> {
  const res = await fetch(`${base()}/query/video_generation?task_id=${encodeURIComponent(taskId)}`, {
    headers: { 'Authorization': `Bearer ${key()}` },
  });
  const data = await res.json().catch(() => ({}));
  return {
    status: classifyTaskStatus(data?.status),
    fileId: data?.file_id || undefined,
    url: extractDownloadUrl(data) || undefined,
    raw: data,
  };
}

async function retrieveFileUrl(fileId: string): Promise<string | null> {
  const gid = groupId();
  const q = gid ? `?GroupId=${encodeURIComponent(gid)}&file_id=${encodeURIComponent(fileId)}` : `?file_id=${encodeURIComponent(fileId)}`;
  const res = await fetch(`${base()}/files/retrieve${q}`, {
    headers: { 'Authorization': `Bearer ${key()}` },
  });
  const data = await res.json().catch(() => ({}));
  return extractDownloadUrl(data);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface VideoGenResult {
  ok: boolean;
  persona: string;
  path?: string;
  reason?: string;
}

/**
 * 生成单个 persona 的活立绘视频。落盘到 /public/talkshow-personas-video/<id>.mp4。
 * graceful:任何失败返回 { ok:false, reason },不抛。
 */
export async function generatePersonaVideo(
  personaId: string,
  opts: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<VideoGenResult> {
  const pollIntervalMs = opts.pollIntervalMs ?? 8000;
  const timeoutMs = opts.timeoutMs ?? 360_000; // 6 分钟/段
  if (!key()) return { ok: false, persona: personaId, reason: 'MINIMAX_VIDEO_API_KEY / MINIMAX_API_KEY 未配置' };

  const pngPath = path.join(PNG_DIR, `${personaId}.png`);
  if (!fs.existsSync(pngPath)) return { ok: false, persona: personaId, reason: `首帧立绘不存在: ${pngPath}(先跑 talkshow persona 图片生成)` };

  try {
    const dataUrl = imageToDataUrl(pngPath);
    const prompt = buildVideoPrompt(personaId);
    const submit = await submitTask(dataUrl, prompt);
    if (!submit.taskId) return { ok: false, persona: personaId, reason: submit.error ?? '提交未返回 task_id' };

    const deadline = Date.now() + timeoutMs;
    let url: string | null = null;
    // Date.now() 仅在运行期轮询用,纯逻辑(prompt/status)已抽到上面的纯函数。
    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);
      const q = await queryTask(submit.taskId);
      if (q.status === 'fail') return { ok: false, persona: personaId, reason: `任务失败: ${JSON.stringify(q.raw?.base_resp ?? q.raw ?? {}).slice(0, 200)}` };
      if (q.status === 'success') {
        url = q.url ?? (q.fileId ? await retrieveFileUrl(q.fileId) : null);
        break;
      }
    }
    if (!url) return { ok: false, persona: personaId, reason: '超时或未取到下载地址' };

    const mp4 = await fetch(url);
    if (!mp4.ok) return { ok: false, persona: personaId, reason: `下载 mp4 失败 ${mp4.status}` };
    const buf = Buffer.from(await mp4.arrayBuffer());
    const outPath = path.join(VIDEO_DIR, `${personaId}.mp4`);
    fs.writeFileSync(outPath, buf);
    return { ok: true, persona: personaId, path: outPath };
  } catch (err) {
    return { ok: false, persona: personaId, reason: `异常: ${(err as Error).message}` };
  }
}

/** 生成全部 6 个 persona(并发提交+各自轮询,墙钟≈最慢一段)。 */
export async function generateAllPersonaVideos(): Promise<VideoGenResult[]> {
  return Promise.all(TALKSHOW_PERSONA_VIDEO_IDS.map((id) => generatePersonaVideo(id)));
}
