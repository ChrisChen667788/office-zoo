import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename2 = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const AVATAR_DIR = path.resolve(__dirname2, '../../public/avatars');

if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

/**
 * Role-specific character designs per the user's exact requirements:
 * - Perfectly round plump furball body
 * - Big sparkling eyes with light reflections
 * - Tiny stub limbs, rosy pink blush cheeks
 * - Thick black outlines, kawaii mascot style
 * - Each role has a specific animal breed, outfit, and prop
 */
const ROLE_ART_DETAILS: Record<string, { animal: string; outfit: string; prop: string; bgColor: string }> = {
  // Cat team (warm-toned backgrounds)
  villager_cat:   { animal: 'orange tabby kitten', outfit: 'wearing a tiny blue scarf', prop: 'carrying a task clipboard', bgColor: '#FFE4B5' },
  detective_cat:  { animal: 'grey British Shorthair kitten', outfit: 'wearing a tiny detective hat and coat', prop: 'holding a magnifying glass', bgColor: '#B0C4DE' },
  medic_cat:      { animal: 'white Persian kitten', outfit: 'wearing a tiny nurse cap with red cross', prop: 'holding a first aid kit', bgColor: '#FFB6C1' },
  engineer_cat:   { animal: 'calico kitten', outfit: 'wearing a tiny yellow hard hat and tool belt', prop: 'holding a wrench', bgColor: '#FFA500' },
  bodyguard_cat:  { animal: 'Maine Coon kitten', outfit: 'wearing tiny sunglasses and a black suit', prop: 'holding a shield badge', bgColor: '#4682B4' },
  medium_cat:     { animal: 'Siamese kitten with mystical glowing eyes', outfit: 'wearing a purple crystal pendant', prop: 'floating crystal ball nearby', bgColor: '#9370DB' },
  vigilante_cat:  { animal: 'Bengal kitten', outfit: 'wearing tiny binoculars around neck', prop: 'holding a notebook and pencil', bgColor: '#90EE90' },
  adventurer_cat: { animal: 'Ragdoll kitten', outfit: 'wearing a tiny explorer hat and vest', prop: 'holding a compass', bgColor: '#DEB887' },
  mimic_cat:      { animal: 'Russian Blue kitten', outfit: 'wearing a theatrical half-mask on face', prop: 'holding a mirror', bgColor: '#DDA0DD' },
  politician_cat: { animal: 'Birman kitten', outfit: 'wearing a tiny top hat and monocle', prop: 'holding a scroll', bgColor: '#CD853F' },
  // Dog team (cool-toned backgrounds)
  killer_dog:     { animal: 'fierce Husky puppy', outfit: 'wearing a tiny dark hoodie', prop: 'with glowing red eyes and shadowy claws', bgColor: '#4A4A5A' },
  spy_dog:        { animal: 'sneaky Shiba Inu puppy', outfit: 'wearing a spy trench coat and dark sunglasses', prop: 'holding a hidden camera', bgColor: '#2F4F4F' },
  morphing_dog:   { animal: 'fox-like puppy with color-shifting fur', outfit: 'with a shape-shifting aura effect', prop: 'holding a glowing transformation gem', bgColor: '#8B5E3C' },
  ninja_dog:      { animal: 'black Shiba puppy', outfit: 'wearing a ninja headband and mask', prop: 'holding a shuriken star', bgColor: '#1C1C3A' },
  hypnotist_dog:  { animal: 'Corgi puppy with spiral hypnotic eyes', outfit: 'wearing a mystical cloak', prop: 'swinging a pendulum', bgColor: '#4B0082' },
  bomber_dog:     { animal: 'Bulldog puppy', outfit: 'wearing a tiny dynamite vest', prop: 'holding a cartoon bomb with lit fuse', bgColor: '#8B2222' },
  assassin_dog:   { animal: 'sleek Greyhound puppy', outfit: 'wearing a black assassin cloak', prop: 'holding a gleaming dagger', bgColor: '#2C2C3C' },
  silencer_dog:   { animal: 'fluffy Samoyed puppy', outfit: 'wearing a muzzle', prop: 'making a shushing gesture with paw', bgColor: '#483D8B' },
  // Neutral (unique backgrounds)
  jester:         { animal: 'chaotic fluffy Pomeranian puppy', outfit: 'wearing a colorful jester hat with bells', prop: 'juggling colorful balls', bgColor: '#FF69B4' },
  phantom:        { animal: 'ghostly translucent hamster', outfit: 'wearing a phantom cape', prop: 'with floating lantern', bgColor: '#E0E0FF' },
  pigeon:         { animal: 'round chubby pigeon bird', outfit: 'wearing a tiny messenger bag', prop: 'holding a letter in beak', bgColor: '#87CEEB' },
  lone_wolf:      { animal: 'lone wolf cub with a scar across eye', outfit: 'wearing a tattered wanderer scarf', prop: 'howling at moonlight', bgColor: '#4A4A6A' },
  lover:          { animal: 'adorable chinchilla', outfit: 'wearing a heart locket necklace', prop: 'holding a heart-shaped balloon', bgColor: '#FFB6C1' },
};

// Read at module load. Both must come from .env — the previous hardcoded
// fallback key was leaked publicly and has been rotated; never inline a key
// here again. Loud-fail at first call when the env is missing instead.
const IMAGE_API_KEY = process.env.QINGYUN_API_KEY || '';
const IMAGE_BASE_URL = process.env.QINGYUN_BASE_URL || 'https://api.qingyuntop.top/v1';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
// Direct Minimax image-generation endpoint. Kept as a last-resort fallback
// for when the QingYun proxy chain is rate-limited or quota-exhausted.
const MINIMAX_IMAGE_URL = process.env.MINIMAX_IMAGE_URL || 'https://api.minimaxi.com/v1/image_generation';

/**
 * Image-generation model selection.
 *
 * After probing QingYunTop's catalog, these are the models that
 *  (a) respond on /v1/images/generations and
 *  (b) produce usable 1024² output without tripping content filters.
 *
 * We walk the list top-to-bottom at generation time — if the primary
 * model returns a non-200 (e.g. briefly disabled, rate-limited, filter),
 * we retry with the next one. `gpt-image-1` is kept last as the most
 * conservative fallback because the original 22 cached avatars were
 * generated with it, so the visual baseline is known.
 *
 * To pin a specific model, set IMAGE_MODEL in .env.
 */
const DEFAULT_MODEL_CHAIN = [
  'flux-schnell',                    // Fast Flux — strong at anime / cel-shaded portraits, b64 response
  'doubao-seedream-3-0-t2i-250415',  // ByteDance Seedream — excellent Chinese/anime aesthetic
  'qwen-image-max-2025-12-30',       // Alibaba Qwen — strong Asian/anime bias
  'gpt-image-1.5',                   // OpenAI gpt-image-1.5 — newer baseline
  'gpt-image-1',                     // Original fallback — matches cached avatars
  // Sentinel — when QingYun chain is fully exhausted, route to Minimax direct
  // so avatar regen still completes even if the proxy is down.
  'minimax:image-01',
];
const MODEL_CHAIN: string[] = process.env.IMAGE_MODEL
  ? [process.env.IMAGE_MODEL, ...DEFAULT_MODEL_CHAIN.filter((m) => m !== process.env.IMAGE_MODEL)]
  : DEFAULT_MODEL_CHAIN;

/** Endpoint resolver — see iconGen.ts for the design rationale. */
function endpointFor(model: string): { url: string; key: string; bodyShape: 'openai' | 'minimax'; realModel: string } {
  if (model.startsWith('minimax:')) {
    return {
      url: MINIMAX_IMAGE_URL,
      key: MINIMAX_API_KEY,
      bodyShape: 'minimax',
      realModel: model.slice('minimax:'.length),
    };
  }
  return {
    url: `${IMAGE_BASE_URL}/images/generations`,
    key: IMAGE_API_KEY,
    bodyShape: 'openai',
    realModel: model,
  };
}

// Sticky flag — same trick as iconGen. Once QingYun returns 401/429 once for
// this process, skip its models on every subsequent call to save retries.
let qingyunDead = false;

/**
 * Prompt template — explicitly anime (二次元) to push the output away from
 * the generic "kawaii chibi" look the original template gave us.
 *
 * Key words that bias toward anime cel-shading: "anime illustration",
 * "Japanese anime style", "cel-shaded", "clean bold lineart", "soft color
 * blocking". Dropped "extremely cute chibi" + "fluffy fur texture" — those
 * biased toward 3D-rendered mascot rather than flat anime.
 */
function buildPrompt(details: typeof ROLE_ART_DETAILS[string]): string {
  return `High-quality Japanese anime illustration, 二次元 style portrait, single ${details.animal} character as an anime-ified office worker avatar. ${details.outfit}, ${details.prop}. Art direction: modern anime key visual, cel-shaded with soft color blocking, clean bold lineart, large expressive sparkling eyes with highlight gleams, subtle pink blush, smooth gradient hair shading, stylised proportions, anime cheek detail, no 3D rendering. Centered portrait composition, head-and-shoulders, solid ${details.bgColor} background, sharp focus, game character icon, no text, no logo, no watermark.`;
}

export async function generateAvatar(role: string): Promise<string | null> {
  const details = ROLE_ART_DETAILS[role];
  if (!details) {
    console.error(`[ImageGen] No art details for role: ${role}`);
    return null;
  }

  const filePath = path.join(AVATAR_DIR, `${role}.png`);

  // Return cached if exists
  if (fs.existsSync(filePath)) {
    console.log(`[ImageGen] Using cached avatar for ${role}`);
    return `/avatars/${role}.png`;
  }

  const prompt = buildPrompt(details);

  console.log(`[ImageGen] Generating avatar for ${role}...`);
  console.log(`[ImageGen] Prompt: ${prompt.slice(0, 100)}...`);

  // Walk the model chain — first one to return a usable image wins.
  for (const model of MODEL_CHAIN) {
    if (qingyunDead && !model.startsWith('minimax:')) continue;
    const ep = endpointFor(model);
    if (!ep.key) continue; // skip models whose key isn't set in .env

    try {
      let body: Record<string, unknown>;
      if (ep.bodyShape === 'minimax') {
        body = {
          model: ep.realModel,
          prompt,
          aspect_ratio: '1:1',
          response_format: 'base64',
          n: 1,
        };
      } else {
        body = {
          model: ep.realModel,
          prompt,
          n: 1,
          size: '1024x1024',
        };
        if (ep.realModel.startsWith('gpt-image-')) body.quality = 'high';
      }

      const response = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ep.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[ImageGen] ${model} → ${response.status}: ${errText.slice(0, 160)}`);
        // Mark QingYun dead on 401/429 so subsequent calls skip the proxy chain.
        if (ep.bodyShape === 'openai' && (
          response.status === 401 ||
          response.status === 429 ||
          /额度已用尽|quota|insufficient|请等待/i.test(errText))) {
          if (!qingyunDead) {
            console.warn(`[ImageGen] QingYun marked dead: ${model} ${response.status}. Skipping its models for the rest of this run.`);
            qingyunDead = true;
          }
        }
        continue; // try next model in chain
      }

      const data = await response.json();
      // Both OpenAI-compatible and Minimax return arrays under .data, but the
      // shape differs — handle both.
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
        console.warn(`[ImageGen] ${model} → unable to decode response`);
        continue;
      }

      fs.writeFileSync(filePath, imageBuffer);
      console.log(`[ImageGen] Saved ${role}.png via ${model} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
      return `/avatars/${role}.png`;
    } catch (err) {
      console.warn(`[ImageGen] ${model} threw`, err);
      continue;
    }
  }

  console.error(`[ImageGen] All models in chain failed for ${role}`);
  return null;
}

export function getCachedAvatar(role: string): string | null {
  const filePath = path.join(AVATAR_DIR, `${role}.png`);
  return fs.existsSync(filePath) ? `/avatars/${role}.png` : null;
}

export function getAllCachedAvatars(): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(AVATAR_DIR)) return result;

  for (const file of fs.readdirSync(AVATAR_DIR)) {
    if (file.endsWith('.png')) {
      const role = file.replace('.png', '');
      result[role] = `/avatars/${role}.png`;
    }
  }
  return result;
}

/**
 * Clear all cached avatars (for regeneration)
 */
export function clearAvatarCache(): void {
  if (!fs.existsSync(AVATAR_DIR)) return;
  for (const file of fs.readdirSync(AVATAR_DIR)) {
    if (file.endsWith('.png')) {
      fs.unlinkSync(path.join(AVATAR_DIR, file));
    }
  }
  console.log('[ImageGen] Avatar cache cleared');
}

/**
 * Generate avatars for multiple roles in batches
 */
export async function generateAllAvatars(roles: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  // Generate one at a time to avoid rate limits on image API
  for (const role of roles) {
    const url = await generateAvatar(role);
    if (url) results[role] = url;
    // Delay between requests
    await new Promise(r => setTimeout(r, 2000));
  }

  return results;
}

export { ROLE_ART_DETAILS };
