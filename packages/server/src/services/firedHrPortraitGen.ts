/**
 * firedHrPortraitGen — v6.99 — 裁了么「黑心 HR 反派」立绘。
 *
 * 三档 HR(对应 shared/data/fired.ts HR_PERSONALITIES):
 *   rookie  菜鸟HR  — 紧张、教科书味、心虚
 *   veteran 老油条HR — 圆滑、笑里藏话术、共情面具
 *   demon   魔鬼HR  — 冷面、PUA、笑里藏刀
 *
 * 是 talkshowAvatarGen 的姊妹文件:同一套「现代亚洲编辑插画」二次元风 + 同一条多供应商图链
 * (青云 flux/doubao/qwen/gpt-image → minimax 兜底,实测 doubao-seedream 出图),但 art direction
 * 是「职场反派肖像」。HTTP plumbing 沿用同一套(已是第 4 个生图面,后续若再加可考虑抽公共基座)。
 *
 * 产物:packages/server/public/fired-hr-portraits/<id>.png(gitignored,部署时再生)。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename2 = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const PORTRAIT_DIR = path.resolve(__dirname2, '../../public/fired-hr-portraits');

if (!fs.existsSync(PORTRAIT_DIR)) {
  fs.mkdirSync(PORTRAIT_DIR, { recursive: true });
}

/** 三档 HR 反派的画面设定(喂给 buildPrompt)。 */
const HR_ART: Record<string, { character: string; expression: string; palette: string; bgColor: string }> = {
  rookie: {
    character:
      'a nervous young Chinese HR woman in her mid-20s, only 1 year on the job, wearing a slightly ill-fitting ' +
      'cheap office blazer, clutching a tablet and a printed PPT to her chest, posture a little hunched, ' +
      'trying to look professional but visibly out of her depth',
    expression:
      'a tense forced corporate smile, eyes darting nervously, a faint flicker of guilt — the look of someone ' +
      'who was just pushed into delivering a layoff and does not really want to',
    palette: 'muted teal, pale cool grey, soft fluorescent office tones',
    bgColor: '#c3ccd2',
  },
  veteran: {
    character:
      'a slick Chinese male HR in his early 40s, 8 years of experience, in a well-fitted but unflashy dark suit, ' +
      'relaxed confident posture, hands loosely clasped like he is chatting with an old friend, a corporate fox',
    expression:
      'a warm, fake-friendly smile that never quite reaches the calculating eyes, faintly world-weary, ' +
      'wearing the "we are all just workers, I feel for you" empathy mask',
    palette: 'warm amber, olive, cozy-but-calculating earthy browns',
    bgColor: '#3a2c20',
  },
  demon: {
    character:
      'an elegant, cold Chinese HR in a sharp impeccably-tailored charcoal suit, sitting perfectly still, ' +
      'a master of psychological warfare, immaculate and composed, quietly predatory',
    expression:
      'a serene knife-behind-the-smile, ice-cold composed gaze with a faint trace of cruel amusement — ' +
      'never raises the voice, but every word is designed to press',
    palette: 'deep charcoal, noir shadow, a single blood-crimson accent',
    bgColor: '#160e12',
  },
};

const IMAGE_API_KEY = process.env.QINGYUN_API_KEY || '';
const IMAGE_BASE_URL = process.env.QINGYUN_BASE_URL || 'https://api.qingyuntop.top/v1';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_IMAGE_URL = process.env.MINIMAX_IMAGE_URL || 'https://api.minimaxi.com/v1/image_generation';

const DEFAULT_MODEL_CHAIN = [
  'doubao-seedream-3-0-t2i-250415',
  'flux-schnell',
  'qwen-image-max-2025-12-30',
  'gpt-image-1.5',
  'gpt-image-1',
  'minimax:image-01',
];
const MODEL_CHAIN: string[] = process.env.FIRED_HR_PORTRAIT_MODEL
  ? [process.env.FIRED_HR_PORTRAIT_MODEL, ...DEFAULT_MODEL_CHAIN.filter((m) => m !== process.env.FIRED_HR_PORTRAIT_MODEL)]
  : DEFAULT_MODEL_CHAIN;

function endpointFor(model: string): { url: string; key: string; bodyShape: 'openai' | 'minimax'; realModel: string } {
  if (model.startsWith('minimax:')) {
    return { url: MINIMAX_IMAGE_URL, key: MINIMAX_API_KEY, bodyShape: 'minimax', realModel: model.slice('minimax:'.length) };
  }
  return { url: `${IMAGE_BASE_URL}/images/generations`, key: IMAGE_API_KEY, bodyShape: 'openai', realModel: model };
}

let qingyunDead = false;

/** 编辑插画风肖像 prompt(与 talkshowAvatarGen 同口径:2D 编辑插画、非 3D 非照片、纯色底、负面去文字水印)。 */
function buildPrompt(p: typeof HR_ART[string]): string {
  return [
    'Modern Asian editorial-illustration portrait, single subject, head-and-shoulders centered composition.',
    'Style: contemporary character illustration, soft 2D, NOT 3D, NOT photo.',
    `Subject: ${p.character}.`,
    `Expression: ${p.expression}.`,
    'Art direction: flat color blocks with subtle soft-light gradient shading, clean confident line work',
    'with intentional weight variation, controlled palette, sophisticated single-direction lighting,',
    `cinematic intimate villain mood. Dominant palette: ${p.palette}.`,
    `Pure solid ${p.bgColor} background — NO magazine layout, NO photo frame, NO border, NO design elements.`,
    'Sharp focus, designed for use as a portrait avatar (subject fills the frame).',
    '',
    'NEGATIVE — absolutely NONE of:',
    'text, letters, words, numbers, signature, watermark, magazine cover, magazine title,',
    'VOGUE, ELLE, 时尚, 小红书 watermark, ID number, logo, brand mark, hashtag,',
    'border, frame, decorative graphic outside the subject, busy background pattern,',
    'generic chibi anime, 3D rendering, hyperrealism, stock photo, beauty-app filter,',
    'multiple people, body below chest.',
  ].join(' ');
}

export async function generateFiredHrPortrait(hrId: string): Promise<string | null> {
  const details = HR_ART[hrId];
  if (!details) {
    console.error(`[FiredHrPortrait] No art details for: ${hrId}`);
    return null;
  }
  const filePath = path.join(PORTRAIT_DIR, `${hrId}.png`);
  if (fs.existsSync(filePath)) {
    console.log(`[FiredHrPortrait] Using cached portrait for ${hrId}`);
    return `/fired-hr-portraits/${hrId}.png`;
  }

  const prompt = buildPrompt(details);
  console.log(`[FiredHrPortrait] Generating ${hrId}…`);

  for (const model of MODEL_CHAIN) {
    if (qingyunDead && !model.startsWith('minimax:')) continue;
    const ep = endpointFor(model);
    if (!ep.key) continue;
    try {
      const body: Record<string, unknown> = ep.bodyShape === 'minimax'
        ? { model: ep.realModel, prompt, aspect_ratio: '1:1', response_format: 'base64', n: 1 }
        : { model: ep.realModel, prompt, n: 1, size: '1024x1024' };
      if (ep.bodyShape === 'openai' && ep.realModel.startsWith('gpt-image-')) body.quality = 'high';

      const response = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ep.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[FiredHrPortrait] ${model} → ${response.status}: ${errText.slice(0, 160)}`);
        if (ep.bodyShape === 'openai' && (
          response.status === 401 || response.status === 429 ||
          /额度已用尽|quota|insufficient|请等待/i.test(errText))) {
          if (!qingyunDead) { console.warn(`[FiredHrPortrait] QingYun marked dead this run.`); qingyunDead = true; }
        }
        continue;
      }
      const data = await response.json();
      let imageBuffer: Buffer | null = null;
      if (ep.bodyShape === 'minimax') {
        const md = data.data;
        const b64 = md?.image_base64?.[0] ?? md?.[0]?.image_base64 ?? md?.[0]?.b64_json;
        const url = md?.image_urls?.[0] ?? md?.[0]?.url;
        if (b64) imageBuffer = Buffer.from(b64, 'base64');
        else if (url) { const r = await fetch(url); if (r.ok) imageBuffer = Buffer.from(await r.arrayBuffer()); }
      } else {
        const imageData = data.data?.[0];
        if (imageData?.b64_json) imageBuffer = Buffer.from(imageData.b64_json, 'base64');
        else if (imageData?.url) { const imgResp = await fetch(imageData.url); if (imgResp.ok) imageBuffer = Buffer.from(await imgResp.arrayBuffer()); }
      }
      if (!imageBuffer) { console.warn(`[FiredHrPortrait] ${model} → unable to decode`); continue; }

      fs.writeFileSync(filePath, imageBuffer);
      console.log(`[FiredHrPortrait] Saved ${hrId}.png via ${model} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
      return `/fired-hr-portraits/${hrId}.png`;
    } catch (err) {
      console.warn(`[FiredHrPortrait] ${model} threw`, err);
      continue;
    }
  }
  console.error(`[FiredHrPortrait] All models failed for ${hrId}`);
  return null;
}

export function hasCachedFiredHrPortrait(hrId: string): boolean {
  return fs.existsSync(path.join(PORTRAIT_DIR, `${hrId}.png`));
}

export const FIRED_HR_IDS = Object.keys(HR_ART);
