/**
 * archetypeAvatarGen — v5.2.0 stylized portraits for the 24 打工人
 * archetypes.
 *
 * Third image-gen surface after imageGen.ts (furball mascots) and
 * talkshowAvatarGen.ts (talkshow voice personas). Now that we have
 * three, the HTTP plumbing duplication has officially gotten silly —
 * but a refactor into a shared base lands cleanest as v5.2.x once
 * all three call-sites stabilize. For v5.2.0 ship, duplicate again.
 *
 * ## Lazy gen + endpoint flow (different from talkshowAvatarGen!)
 *
 * talkshow has only 6 personas — small enough to pre-generate via
 * CLI script + commit the PNGs (~5MB total).
 *
 * Archetypes have 24 entries × ~700KB = ~17MB. Too big to commit.
 * So:
 *   1. Server exposes GET /api/quiz/archetype-portrait/:id
 *   2. On first request: generate via model chain, cache to
 *      packages/server/public/archetype-portraits/<id>.png
 *   3. Subsequent requests: served from disk (Cache-Control 24h)
 *   4. Client uses <img onError> emoji fallback so the
 *      first-paint isn't blocked on a 20-30s generation; the
 *      portrait swaps in when ready.
 *
 * The /archetype-portraits dir is gitignored — fresh forks regen as
 * users land on each archetype's Profile / Squad card. Cost is
 * amortized across actual usage rather than pre-paid for 24 portraits
 * a single user may never see.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename2 = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const PORTRAIT_DIR = path.resolve(__dirname2, '../../public/archetype-portraits');

if (!fs.existsSync(PORTRAIT_DIR)) {
  fs.mkdirSync(PORTRAIT_DIR, { recursive: true });
}

/**
 * Per-archetype art direction. Same shape as talkshowAvatarGen's
 * PERSONA_ART (character / expression / palette / bgColor). Keys map
 * 1:1 to shared/data/archetypes.ts ARCHETYPES[].id.
 *
 * Style ground rules (apply to ALL 24):
 *  - 25-35 year old East Asian office worker, anime-influenced
 *    editorial illustration (NOT realistic photo, NOT chibi)
 *  - Y2K-tinged Behance/小红书 designer style
 *  - Head + shoulders, subject fills circular avatar frame
 *  - Solid color background (matches archetype.colors.start in flavor)
 *  - Single character only, no text/watermark/brand
 */
const ARCHETYPE_ART: Record<string, {
  character: string;
  expression: string;
  palette: string;
  bgColor: string;
}> = {
  // ── v1.3.0 behavioral archetypes (12) ──────────────────────────
  grinder: {
    character: '28-year-old East Asian young man, slightly messy hair from late-night work, dark eye circles, oversized black hoodie with company logo embroidery, laptop tucked under arm, energy drink in hand',
    expression: 'tired but determined, eyes burning with hustle energy, faint smile of "I got this"',
    palette: 'fiery red + amber + dark slate',
    bgColor: '#ff3355',
  },
  slacker: {
    character: '26-year-old East Asian young person, soft pajama-like oversized cardigan over a t-shirt, AirPods in ears, slight bedhead, sipping bubble tea, slippers visible at the bottom of the frame',
    expression: 'completely chill, half-lidded eyes, the slight smirk of someone who knows they\'re getting away with it',
    palette: 'mint green + soft cyan + lavender',
    bgColor: '#6ee7b7',
  },
  'sass-master': {
    character: '27-year-old East Asian person with sharp asymmetric haircut, single dangling chain earring, smoky eye makeup, black silk shirt, glossy nails, looking sideways at the viewer',
    expression: 'one eyebrow raised, knowing condescending smile, "哦, 这样啊" energy made visual',
    palette: 'electric purple + magenta + black',
    bgColor: '#a855f7',
  },
  pleaser: {
    character: '26-year-old East Asian young person, warm soft features, gentle waves of hair, mustard yellow oversized cardigan, holding a clipboard with notes, small handmade-looking earrings',
    expression: 'caring open smile that doesn\'t quite reach the eyes (you can sense the exhaustion underneath), head tilted in attentive listening',
    palette: 'warm yellow + dusty pink + cream',
    bgColor: '#fbbf24',
  },
  nihilist: {
    character: '29-year-old East Asian person, completely plain dark gray hoodie zipped to chin, no jewelry, slightly disheveled, hands jammed in pockets, distant moody lighting',
    expression: 'flat dead-eyed thousand-yard stare, mouth a neutral line, "都行" expression incarnate',
    palette: 'cold slate + muted purple + deep midnight',
    bgColor: '#475569',
  },
  'show-pony': {
    character: '25-year-old East Asian young person, vibrant outfit with mixed bold patterns (oversized colorful blazer over a printed tee), big statement glasses, multiple stacked earrings, holding their phone for a selfie pose',
    expression: 'BIG bright camera-ready smile, eyes sparkling, totally aware of being looked at and loving it',
    palette: 'hot pink + electric yellow + cyan accents',
    bgColor: '#ec4899',
  },
  'anti-grinder': {
    character: '27-year-old East Asian person mid-stride leaving the office, holding their bag and a takeout coffee, casual jeans + oversized white tee, AirPods in, sunlight on face',
    expression: 'relaxed liberated smile, eyes already on the door, "我下班了哈" energy',
    palette: 'sky cyan + violet + warm coral',
    bgColor: '#06b6d4',
  },
  'drama-queen': {
    character: '28-year-old East Asian person in a theatrical pose, oversized scarf draped dramatically, bold lip color, one hand to forehead like a vintage actress, sparkle effect',
    expression: 'theatrically exaggerated emotion (could be shock, could be despair, deliberately ambiguous), single tear effect optional',
    palette: 'tangerine orange + royal purple + cyan',
    bgColor: '#f97316',
  },
  'iron-maiden': {
    character: '30-year-old East Asian woman, power suit blazer, neat ponytail, minimal makeup but sharp eyeliner, motivational pose pointing forward, gold lapel pin',
    expression: 'fierce confident smile, eyes locked forward, "we can do this!" warrior energy',
    palette: 'crimson red + gold + clean white',
    bgColor: '#dc2626',
  },
  veteran: {
    character: '35-year-old East Asian person, slightly weathered handsome face with early laugh lines, classic earth-tone sweater, simple watch, neat short hair with a few silvers, mug of tea in hand',
    expression: 'wise knowing smile, slightly crinkled eyes, "我都见过" calm authority',
    palette: 'warm tobacco + burnt sienna + slate purple',
    bgColor: '#854d0e',
  },
  'deck-wizard': {
    character: '28-year-old East Asian young man, trendy round glasses, light blue dress shirt with rolled sleeves, MacBook open in foreground showing colorful slide layout, presenter clicker in hand',
    expression: 'practiced confident presenter smile, gesturing as if mid-explanation, "let me walk you through the deck" energy',
    palette: 'powder blue + lavender + accent gold',
    bgColor: '#0ea5e9',
  },
  ghost: {
    character: '27-year-old East Asian person in plain unbranded gray hoodie, slight slouch, headphones over hood, low-key invisibility energy, half-fading into background',
    expression: 'quiet neutral, eyes looking down or slightly off-camera, "在的" minimal presence',
    palette: 'cool gray + slate + faint navy',
    bgColor: '#64748b',
  },

  // ── v2.0.0 region / industry archetypes (12) ──────────────────────
  'soe-lifer': {
    character: '38-year-old East Asian person in classic state-enterprise blue button-up shirt with a tea thermos (国企标配), wired-frame glasses, slightly outdated but well-maintained hair, ID badge on a red lanyard',
    expression: 'serene contented expression, the calm of decades of job security, mild approving nod',
    palette: 'deep state-enterprise red + bureaucratic blue + tea brown',
    bgColor: '#dc2626',
  },
  'faang-cog': {
    character: '29-year-old East Asian person, branded big-tech-company-style hoodie (no actual logo), employee badge on lanyard, holding a laptop covered in stickers, glassy office building reflected in glasses',
    expression: 'neutral focused look, slightly burned-out eyes behind glasses, "OKR-driven" composure',
    palette: 'corporate slate + electric blue + violet accent',
    bgColor: '#0ea5e9',
  },
  'startup-cowboy': {
    character: '32-year-old East Asian person in a bomber jacket over a startup t-shirt (no real brand), unkempt hair, slight stubble, wearing a smartwatch and a beaded bracelet, energy-drink can visible',
    expression: 'wild manic enthusiasm, eyes wide with "all in" energy, gesturing with both hands',
    palette: 'startup orange + electric red + amber',
    bgColor: '#f97316',
  },
  'finance-suit': {
    character: '32-year-old East Asian person in a tailored navy pinstripe suit with silver tie clip, slicked sharp side-part, premium watch glinting on wrist, expensive-looking pen in pocket',
    expression: 'cold polished composure, slight executive smile, eyes that have seen many quarters',
    palette: 'midnight navy + gold + steel gray',
    bgColor: '#0f172a',
  },
  'edu-survivor': {
    character: '30-year-old East Asian person in casual blazer over knit shirt, holding a worn tablet showing a course-platform UI, neat hair, slightly worried but resilient look, small backpack strap visible',
    expression: 'gentle persistent smile masking exhaustion, eyes carrying recent industry trauma but determined',
    palette: 'mellow blue + violet + dusty pink',
    bgColor: '#2563eb',
  },
  'mcn-grinder': {
    character: '26-year-old East Asian young person in ring-light glow, oversized streetwear hoodie with subtle metallic prints, holding their phone gimbal up to camera, bold colorful makeup, multiple ear cuffs',
    expression: 'energetic camera-on grin with eyes-wide enthusiasm, micro-influencer "OK guys this is so important" face',
    palette: 'hot pink + electric yellow + neon cyan',
    bgColor: '#ec4899',
  },
  'bj-drift': {
    character: '28-year-old East Asian person, thick winter parka with hood (Beijing cold), beanie hat, breath visible in cold air, exhausted but resolute, simple no-brand backpack strap visible',
    expression: 'tired but stubborn, slight smile of "我就是不回家", eyes deep with subway-commute hours',
    palette: 'deep crimson + amber streetlight + cold midnight',
    bgColor: '#dc2626',
  },
  'sh-yuppie': {
    character: '27-year-old East Asian person in oversized Manner-coffee-style cream cardigan over linen shirt, gold-rim mini sunglasses pushed up into hair, Manner-style takeaway coffee cup just visible, gold layered necklaces',
    expression: 'effortless practiced smile, brunch-ready energy, eyes that are also checking their phone reflection',
    palette: 'mauve purple + champagne gold + soft cream',
    bgColor: '#a855f7',
  },
  'sz-money-chaser': {
    character: '29-year-old East Asian person in slick black tech-fabric jacket, multiple smartwatches/fitness bands stacked on wrists, AirPods Max around neck, holding two phones (work + side hustle), money-counter energy',
    expression: 'sharp focused stare, slight side-hustle smirk, "搞钱搞钱搞钱" determination',
    palette: 'gold + black + accent green',
    bgColor: '#16a34a',
  },
  'hz-internet-kid': {
    character: '27-year-old East Asian person in big-tech hoodie with embroidered花名 patch (illegible), holding a 阿里 / 字节-style coffee mug, slight messy hair, sitting in front of multiple monitor reflections',
    expression: 'focused alert face, eyes locked on screens off-camera, the slight smile of someone debugging at 11pm',
    palette: 'cyan + electric purple + lab green',
    bgColor: '#06b6d4',
  },
  'cd-zen': {
    character: '28-year-old East Asian person in cozy oversized linen shirt, mahjong tiles or bamboo chopsticks in the frame, holding a 茶馆-style covered tea cup (盖碗), unhurried slouch in a bamboo chair',
    expression: 'completely relaxed wide grin, eyes crinkled in laughter, 巴适得板 energy made visual',
    palette: 'warm bamboo green + spicy hotpot orange + amber',
    bgColor: '#84cc16',
  },
  'escape-overseas': {
    character: '29-year-old East Asian person in airport-ready denim jacket over white tee, neck pillow around shoulders, passport visible in jacket pocket, boarding pass in hand, suitcase handle just visible',
    expression: 'mixed expression: hopeful eyes + slight backward glance, "走为上策" tinged with reluctance',
    palette: 'sky cyan + golden sunset + sage green',
    bgColor: '#0ea5e9',
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
const MODEL_CHAIN: string[] = process.env.ARCHETYPE_AVATAR_MODEL
  ? [process.env.ARCHETYPE_AVATAR_MODEL, ...DEFAULT_MODEL_CHAIN.filter((m) => m !== process.env.ARCHETYPE_AVATAR_MODEL)]
  : DEFAULT_MODEL_CHAIN;

function endpointFor(model: string): { url: string; key: string; bodyShape: 'openai' | 'minimax'; realModel: string } {
  if (model.startsWith('minimax:')) {
    return { url: MINIMAX_IMAGE_URL, key: MINIMAX_API_KEY, bodyShape: 'minimax', realModel: model.slice('minimax:'.length) };
  }
  return { url: `${IMAGE_BASE_URL}/images/generations`, key: IMAGE_API_KEY, bodyShape: 'openai', realModel: model };
}

let qingyunDead = false;

/** Prompt — same lessons from v5.1.0+1: avoid "magazine" wording,
 *  long negative-prompt block listing brand-text / watermark / layout
 *  hallucinations to crowd out. */
function buildPrompt(p: typeof ARCHETYPE_ART[string]): string {
  return [
    'Modern Asian editorial-illustration portrait, single subject, head-and-shoulders centered composition.',
    'Style reference: contemporary character illustrators on Behance / 小红书 — Wenjie Cheng, Wangtao,',
    'Yu-Ming Huang. Soft 2D, NOT 3D, NOT photo, NOT chibi anime.',
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
    'VOGUE, ELLE, 时尚, 小红书 watermark, ID number, logo, brand mark, hashtag, real-company branding,',
    'border, frame, decorative graphic outside the subject, busy background pattern,',
    'generic chibi anime, 3D rendering, hyperrealism, stock photo, beauty-app filter,',
    'multiple people, body below chest.',
  ].join(' ');
}

/** Generate-or-retrieve the portrait for one archetype.
 *  Returns the public URL on success, null on full chain failure. */
export async function generateArchetypePortrait(archetypeId: string): Promise<string | null> {
  const details = ARCHETYPE_ART[archetypeId];
  if (!details) {
    console.error(`[ArchetypeAvatar] No art details for archetype: ${archetypeId}`);
    return null;
  }

  const filePath = path.join(PORTRAIT_DIR, `${archetypeId}.png`);
  if (fs.existsSync(filePath)) return `/archetype-portraits/${archetypeId}.png`;

  const prompt = buildPrompt(details);
  console.log(`[ArchetypeAvatar] Generating ${archetypeId}…`);

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
        console.warn(`[ArchetypeAvatar] ${model} → ${response.status}: ${errText.slice(0, 160)}`);
        if (ep.bodyShape === 'openai' && (
          response.status === 401 || response.status === 429 ||
          /额度已用尽|quota|insufficient|请等待/i.test(errText))) {
          if (!qingyunDead) {
            console.warn(`[ArchetypeAvatar] QingYun marked dead: ${model} ${response.status}.`);
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
        console.warn(`[ArchetypeAvatar] ${model} → unable to decode response`);
        continue;
      }

      fs.writeFileSync(filePath, imageBuffer);
      console.log(`[ArchetypeAvatar] Saved ${archetypeId}.png via ${model} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
      return `/archetype-portraits/${archetypeId}.png`;
    } catch (err) {
      console.warn(`[ArchetypeAvatar] ${model} threw`, err);
      continue;
    }
  }

  console.error(`[ArchetypeAvatar] All models in chain failed for ${archetypeId}`);
  return null;
}

/** Check if a portrait is already on disk (cheap; called from
 *  GET /api/quiz/archetype-portrait/:id to decide between "served
 *  inline" and "kicked-off-generation"). */
export function hasCachedArchetypePortrait(archetypeId: string): boolean {
  return fs.existsSync(path.join(PORTRAIT_DIR, `${archetypeId}.png`));
}

export const ARCHETYPE_IDS_WITH_ART = Object.keys(ARCHETYPE_ART);
