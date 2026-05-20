/**
 * talkshowAvatarGen — v5.1.0 stylized human-character portraits for the
 * 6 talkshow personas.
 *
 * Sibling of imageGen.ts (which serves the furball mascot avatars for
 * the social-deduction game). DIFFERENT art direction: instead of
 * "kawaii furball mascot" we go for "潮流插画师 / designer poster"
 * aesthetic — modern Asian editorial illustration, flat color blocks
 * with subtle gradient lighting, bold character silhouette, magazine-
 * cover energy. Each persona is a recognizable human archetype that
 * matches the voice the user hears in the talkshow.
 *
 * ## Why a separate file (not extend imageGen.ts)?
 *
 *  - Art direction is fundamentally different (human vs furball)
 *  - Output dir is separate (/talkshow-personas vs /avatars)
 *  - Persona catalog is small (6 entries) and stable; doesn't share
 *    update cadence with the 23-entry ROLE_ART_DETAILS
 *  - Easier code review: someone tweaking imageGen.ts's mascot recipe
 *    shouldn't accidentally affect talkshow personas
 *
 * The HTTP plumbing (model chain, endpoint resolver, error
 * handling) IS duplicated. ~80 lines of repeated code judged
 * acceptable vs. the refactor cost of extracting a shared
 * "generateImageToFile(prompt, outPath)" base function. If a third
 * image-gen surface lands, do the refactor at that point.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename2 = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const PERSONA_DIR = path.resolve(__dirname2, '../../public/talkshow-personas');

if (!fs.existsSync(PERSONA_DIR)) {
  fs.mkdirSync(PERSONA_DIR, { recursive: true });
}

/** Per-persona art direction. The 6 keys correspond to the 6
 *  Persona enum values in shared/data/talkshow.ts + the client's
 *  PERSONA_LABELS. */
const PERSONA_ART: Record<string, {
  character: string;   // who they ARE — age, vibe, style cues
  expression: string;  // facial expression / energy
  palette: string;     // dominant color signal
  bgColor: string;     // solid bg for the portrait
}> = {
  // ── Female personas ──────────────────────────────────────────────
  shaonv: {
    character:
      'a 23-year-old fresh-faced East Asian young woman, bright eyes, shoulder-length straight hair with subtle Y2K-era hair clips, light pastel pink eye makeup, oversized sweater with a tiny graphic, pearl studs',
    expression: 'sweet open-mouth half-smile, head slightly tilted, looking right at camera',
    palette: 'pastel pink + cream + soft lavender accents',
    bgColor: '#ffd9e6',
  },
  yujie: {
    character:
      'a 32-year-old sultry East Asian mature woman with sharp jawline, sleek dark bob haircut, smoky-eye makeup, bold deep red lipstick, structured black blazer with thin gold chain, single statement earring',
    expression: 'side-glance with raised eyebrow, knowing half-smirk, supremely confident',
    palette: 'deep burgundy + black + gold accents',
    bgColor: '#3a1820',
  },

  // ── Male personas ────────────────────────────────────────────────
  qingse: {
    character:
      'a 24-year-old gentle East Asian young man, soft fluffy black hair (slightly messy), round wireframe glasses, oversized cream knit cardigan over a light shirt, minimal earring stud',
    expression: 'shy genuine smile, slightly downcast eyes, vulnerable hopeful energy',
    palette: 'warm cream + dusty blue + caramel accents',
    bgColor: '#ffe9d4',
  },
  jingying: {
    character:
      'a 30-year-old sharp-featured East Asian professional man, slicked-back hair with a tight side part, clean-shaven, minimal black wireframe glasses, perfectly tailored navy suit with crisp white shirt, no tie (top button open)',
    expression: 'composed neutral gaze direct to camera, single eyebrow slightly raised, executive presence',
    palette: 'navy blue + slate gray + chrome highlights',
    bgColor: '#1e2a44',
  },
  badao: {
    character:
      'a 35-year-old commanding East Asian alpha CEO type, thick well-groomed dark hair swept back, strong jawline with a hint of stubble, all-black turtleneck under a charcoal overcoat draped on shoulders, heavy black watch',
    expression: 'cold dominant stare with slight smirk, chin tilted up, looking down at viewer',
    palette: 'charcoal black + deep crimson + brushed steel',
    bgColor: '#1a1a1f',
  },
  qingnian: {
    character:
      'a 27-year-old anonymous everyday East Asian young man, normal short hair, plain black crewneck t-shirt, no obvious accessories, "could be anyone in any open-plan office" energy',
    expression: 'flat neutral expression, slight thousand-yard stare, narrator-of-his-own-life vibe',
    palette: 'muted gray + dusty teal + pale tan',
    bgColor: '#3a3f47',
  },
};

const IMAGE_API_KEY = process.env.QINGYUN_API_KEY || '';
const IMAGE_BASE_URL = process.env.QINGYUN_BASE_URL || 'https://api.qingyuntop.top/v1';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_IMAGE_URL = process.env.MINIMAX_IMAGE_URL || 'https://api.minimaxi.com/v1/image_generation';

const DEFAULT_MODEL_CHAIN = [
  'flux-schnell',
  'doubao-seedream-3-0-t2i-250415',
  'qwen-image-max-2025-12-30',
  'gpt-image-1.5',
  'gpt-image-1',
  'minimax:image-01',
];
const MODEL_CHAIN: string[] = process.env.TALKSHOW_AVATAR_MODEL
  ? [process.env.TALKSHOW_AVATAR_MODEL, ...DEFAULT_MODEL_CHAIN.filter((m) => m !== process.env.TALKSHOW_AVATAR_MODEL)]
  : DEFAULT_MODEL_CHAIN;

function endpointFor(model: string): { url: string; key: string; bodyShape: 'openai' | 'minimax'; realModel: string } {
  if (model.startsWith('minimax:')) {
    return { url: MINIMAX_IMAGE_URL, key: MINIMAX_API_KEY, bodyShape: 'minimax', realModel: model.slice('minimax:'.length) };
  }
  return { url: `${IMAGE_BASE_URL}/images/generations`, key: IMAGE_API_KEY, bodyShape: 'openai', realModel: model };
}

let qingyunDead = false;

/** Build the actual prompt fed to the image model. Centered head-and-
 *  shoulders portrait, designer-poster aesthetic — pushes the output
 *  toward editorial illustration rather than generic anime or photo.
 *
 *  v5.1.0+1 — removed "magazine-cover energy" / "designer poster"
 *  phrasing that doubao-seedream interpreted LITERALLY (rendered an
 *  actual VOGUE cover with "VOGUE" text + 小红书 watermark on the
 *  badao output). Replaced with shape-language descriptors that
 *  convey the same aesthetic intent without inviting magazine-layout
 *  hallucinations. The negative-prompt block at the end is now
 *  longer + more specific to crowd out title-text / brand-text /
 *  watermark patterns the underlying model picked up from training
 *  on Behance scrapes. */
function buildPrompt(p: typeof PERSONA_ART[string]): string {
  return [
    'Modern Asian editorial-illustration portrait, single subject, head-and-shoulders centered composition.',
    'Style reference: contemporary character illustrators on Behance / 小红书 — Wenjie Cheng, Wangtao,',
    'Yu-Ming Huang. Soft 2D, NOT 3D, NOT photo.',
    `Subject: ${p.character}.`,
    `Expression: ${p.expression}.`,
    'Art direction: flat color blocks with subtle soft-light gradient shading, clean confident line work',
    'with intentional weight variation, controlled palette, sophisticated single-direction lighting,',
    `cinematic intimate mood. Dominant palette: ${p.palette}.`,
    `Pure solid ${p.bgColor} background — NO magazine layout, NO photo frame, NO border, NO design elements.`,
    'Sharp focus, designed for use as a 512px circular avatar (subject fills the frame).',
    '',
    'NEGATIVE — absolutely NONE of:',
    'text, letters, words, numbers, signature, watermark, magazine cover, magazine title,',
    'VOGUE, ELLE, 时尚, 小红书 watermark, ID number, logo, brand mark, hashtag,',
    'border, frame, decorative graphic outside the subject, busy background pattern,',
    'generic chibi anime, 3D rendering, hyperrealism, stock photo, beauty-app filter,',
    'multiple people, body below chest.',
  ].join(' ');
}

export async function generateTalkshowPersona(persona: string): Promise<string | null> {
  const details = PERSONA_ART[persona];
  if (!details) {
    console.error(`[TalkshowAvatar] No art details for persona: ${persona}`);
    return null;
  }

  const filePath = path.join(PERSONA_DIR, `${persona}.png`);
  if (fs.existsSync(filePath)) {
    console.log(`[TalkshowAvatar] Using cached portrait for ${persona}`);
    return `/talkshow-personas/${persona}.png`;
  }

  const prompt = buildPrompt(details);
  console.log(`[TalkshowAvatar] Generating ${persona}…`);

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
        console.warn(`[TalkshowAvatar] ${model} → ${response.status}: ${errText.slice(0, 160)}`);
        if (ep.bodyShape === 'openai' && (
          response.status === 401 || response.status === 429 ||
          /额度已用尽|quota|insufficient|请等待/i.test(errText))) {
          if (!qingyunDead) {
            console.warn(`[TalkshowAvatar] QingYun marked dead: ${model} ${response.status}. Skipping its models for this run.`);
            qingyunDead = true;
          }
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
        else if (url) {
          const r = await fetch(url);
          if (r.ok) imageBuffer = Buffer.from(await r.arrayBuffer());
        }
      } else {
        const imageData = data.data?.[0];
        if (imageData?.b64_json) imageBuffer = Buffer.from(imageData.b64_json, 'base64');
        else if (imageData?.url) {
          const imgResp = await fetch(imageData.url);
          if (imgResp.ok) imageBuffer = Buffer.from(await imgResp.arrayBuffer());
        }
      }
      if (!imageBuffer) {
        console.warn(`[TalkshowAvatar] ${model} → unable to decode response`);
        continue;
      }

      fs.writeFileSync(filePath, imageBuffer);
      console.log(`[TalkshowAvatar] Saved ${persona}.png via ${model} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
      return `/talkshow-personas/${persona}.png`;
    } catch (err) {
      console.warn(`[TalkshowAvatar] ${model} threw`, err);
      continue;
    }
  }

  console.error(`[TalkshowAvatar] All models in chain failed for ${persona}`);
  return null;
}

/** Bulk-regenerate all 6 personas. Used by the CLI script + the
 *  /api/talkshow/personas/regen endpoint (admin-only, future). */
export async function generateAllTalkshowPersonas(): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {};
  for (const persona of Object.keys(PERSONA_ART)) {
    results[persona] = await generateTalkshowPersona(persona);
  }
  return results;
}

/** Read-only list of persona ids for the regen script + tests. */
export const TALKSHOW_PERSONA_IDS = Object.keys(PERSONA_ART);
