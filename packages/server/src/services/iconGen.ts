/**
 * iconGen — AI-generated UI icon pipeline.
 *
 * Sister to `imageGen.ts` but specialised for small flat UI glyphs (mode
 * cards, personality badges, game-phase indicators, team banners, etc.)
 * rather than character avatars. Icons share a single consistent art
 * direction so they read as a cohesive set instead of 30 one-off
 * illustrations.
 *
 * Output: PNGs at `packages/server/public/icons/<key>.png`, served to the
 * client as `/icons/<key>.png`. Cached on disk; regeneration is opt-in via
 * `npx tsx packages/server/src/scripts/regen-icons.ts` (see that file).
 *
 * Walks the same model fallback chain as avatars — flux-schnell is the
 * primary because it renders clean vector-ish sticker art with consistent
 * palette, which is exactly what we want for UI glyphs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename2 = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const ICON_DIR = path.resolve(__dirname2, '../../public/icons');

if (!fs.existsSync(ICON_DIR)) {
  fs.mkdirSync(ICON_DIR, { recursive: true });
}

export interface IconSpec {
  /** Short natural-language subject for the icon. */
  subject: string;
  /** Optional extra visual detail appended verbatim into the prompt. */
  detail?: string;
  /** Accent color — fed to the prompt as a palette hint so the icon reads
   *  well when placed on the matching UI surface. */
  accent: string;
  /** Background style — 'transparent' | 'solid' | 'gradient'. We default to
   *  a soft solid to guarantee consistent rendering across pages. */
  bgStyle?: 'transparent' | 'solid' | 'gradient';
}

/**
 * The full icon registry. Grouped by semantic domain in comments.
 *
 * Adding a new icon: put the key here + a line in `constants/icons.ts` on
 * the client, then run `regen-icons`. Existing icons are cached; only new
 * keys get generated.
 */
export const ICON_DETAILS: Record<string, IconSpec> = {
  // --- Game modes (Landing page mode cards) -----------------------------
  mode_classic:    { subject: 'a cute chibi office building at night with glowing neon windows', detail: 'one tiny silhouette of a worker at a window', accent: '#4c9eff', bgStyle: 'solid' },
  mode_immersive:  { subject: 'a glowing pink retro microphone on a spotlit stage', detail: 'soft vapor from a single spotlight', accent: '#a855f7', bgStyle: 'solid' },
  mode_fired:      { subject: 'a glowing golden scales of justice with a tiny red tie draped over one pan', detail: 'dramatic courtroom lighting', accent: '#ff3355', bgStyle: 'solid' },

  // --- Personality traits (Immersive + Classic PERSONALITY_LABELS) ------
  personality_social_butterfly:   { subject: 'a sparkly pink butterfly with little heart antennae', accent: '#FF6B9D', bgStyle: 'solid' },
  personality_introvert:          { subject: 'a shy blue turtle peeking out of its pastel-blue shell', accent: '#7EC8E3', bgStyle: 'solid' },
  personality_contrarian:         { subject: 'a small cartoon red hammer with an angry eyebrow', accent: '#FF4444', bgStyle: 'solid' },
  personality_sycophant:          { subject: 'a golden retriever puppy sticker with hearts in its eyes', accent: '#FFB347', bgStyle: 'solid' },
  personality_passive_aggressive: { subject: 'a half-black half-white moon sticker with a sly smirk', accent: '#B19CD9', bgStyle: 'solid' },
  personality_hot_tempered:       { subject: 'a tiny cartoon volcano sticker with a flame puff', accent: '#FF6347', bgStyle: 'solid' },
  personality_smooth_operator:    { subject: 'a slick orange fox wearing tiny sunglasses', accent: '#DAA520', bgStyle: 'solid' },
  personality_workaholic:         { subject: 'a bold rising-arrow chart with a coffee cup', accent: '#00CED1', bgStyle: 'solid' },

  // --- Game phases (PHASE_LABELS in Immersive + PHASE_NAMES in Classic) -
  phase_lobby:       { subject: 'a pastel hourglass sticker with glowing sand', accent: '#4c9eff', bgStyle: 'solid' },
  phase_role_reveal: { subject: 'a scroll with a glowing briefcase icon on it', accent: '#7c3aed', bgStyle: 'solid' },
  phase_free_roam:   { subject: 'a leather briefcase with a tiny laptop sticker', accent: '#4FC3F7', bgStyle: 'solid' },
  phase_meeting:     { subject: 'a red spinning siren light sticker', accent: '#ff3355', bgStyle: 'solid' },
  phase_discussion:  { subject: 'two speech bubbles colliding with a tiny spark', accent: '#FF6347', bgStyle: 'solid' },
  phase_voting:      { subject: 'a ballot box with a ballot half inside', accent: '#7c3aed', bgStyle: 'solid' },
  phase_vote_result: { subject: 'a golden judges gavel sticker on a wooden block', accent: '#DAA520', bgStyle: 'solid' },
  phase_game_over:   { subject: 'a tipped-over office chair sticker and a gold trophy', accent: '#FFD700', bgStyle: 'solid' },

  // --- Team banners (team chips used throughout game UI) ----------------
  team_cat:     { subject: 'a blue chibi cat face with a tiny worker helmet sticker', accent: '#2fb8ff', bgStyle: 'solid' },
  team_dog:     { subject: 'a red chibi dog face wearing a tiny business tie', accent: '#ff4757', bgStyle: 'solid' },
  team_neutral: { subject: 'a purple grinning face with sunglasses sticker', accent: '#a855f7', bgStyle: 'solid' },

  // --- Achievement tier medals (PredictionBar streak tiers) -------------
  achievement_bronze: { subject: 'a bronze medal with a tiny 5 engraved', accent: '#CD7F32', bgStyle: 'solid' },
  achievement_silver: { subject: 'a silver medal with a tiny 7 engraved', accent: '#C0C0C0', bgStyle: 'solid' },
  achievement_gold:   { subject: 'a gold medal with a laurel wreath', accent: '#FFD700', bgStyle: 'solid' },
  achievement_crown:  { subject: 'a sparkling purple crown sticker with gems', accent: '#a855f7', bgStyle: 'solid' },

  // --- Per-player activity badges (free-roam tick layer) ----------------
  // Shown next to each player on the map to telegraph what they're doing
  // without needing to read the activity-text tooltip. 8 distinct visual
  // cues map to the Activity union in shared/types/game.ts.
  activity_work:    { subject: 'a tiny laptop sticker with code on screen', accent: '#4c9eff', bgStyle: 'solid' },
  activity_chat:    { subject: 'two overlapping chat speech bubbles sticker', accent: '#6ee7b7', bgStyle: 'solid' },
  activity_sneak:   { subject: 'a single eye peeking from behind a corner sticker', accent: '#ff3355', bgStyle: 'solid' },
  activity_idle:    { subject: 'a tiny sleepy z floating sticker', accent: '#a855f7', bgStyle: 'solid' },
  activity_commute: { subject: 'a small running shoe with a dust trail sticker', accent: '#ffb84c', bgStyle: 'solid' },
  activity_meeting: { subject: 'a tiny round table with three chairs sticker', accent: '#7c3aed', bgStyle: 'solid' },
  activity_coffee:  { subject: 'a steaming coffee mug sticker with a tiny heart', accent: '#8d6e63', bgStyle: 'solid' },
  activity_print:   { subject: 'a tiny printer with a sheet of paper coming out sticker', accent: '#90caf9', bgStyle: 'solid' },

  // --- Prediction / timeline / recap glyphs -----------------------------
  prediction_target: { subject: 'a red-and-white bullseye target sticker', accent: '#FF3355', bgStyle: 'solid' },
  prediction_correct: { subject: 'a bold green checkmark sticker with a sparkle', accent: '#00D26A', bgStyle: 'solid' },
  prediction_wrong:   { subject: 'a blue speech bubble with an X sticker', accent: '#4c9eff', bgStyle: 'solid' },
  streak_fire:        { subject: 'a stylized orange flame sticker with a glow', accent: '#FF6347', bgStyle: 'solid' },
  timeline_recap:     { subject: 'an unrolled parchment scroll sticker', accent: '#DEB887', bgStyle: 'solid' },
  timeline_kill:      { subject: 'a cartoon red kitchen knife with a tiny heart drip', accent: '#FF3355', bgStyle: 'solid' },
  timeline_vote:      { subject: 'a paper ballot being slotted into a box', accent: '#7c3aed', bgStyle: 'solid' },
  dossier_mask:       { subject: 'a theatrical comedy/tragedy mask pair', accent: '#DAA520', bgStyle: 'solid' },
  ghost_speech:       { subject: 'a cute little cartoon ghost with a speech bubble', accent: '#6ee7b7', bgStyle: 'solid' },
};

const IMAGE_API_KEY = process.env.QINGYUN_API_KEY || '';
const IMAGE_BASE_URL = process.env.QINGYUN_BASE_URL || 'https://api.qingyuntop.top/v1';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
// Direct Minimax image-generation endpoint. Used as a last-resort fallback
// when the QingYun proxy chain gets rate-limited or starts returning 5xx for
// every model. The user explicitly asked us to wire Minimax in: Apr 2026.
const MINIMAX_IMAGE_URL = process.env.MINIMAX_IMAGE_URL || 'https://api.minimaxi.com/v1/image_generation';

const DEFAULT_MODEL_CHAIN = [
  'flux-schnell',
  'doubao-seedream-3-0-t2i-250415',
  'qwen-image-max-2025-12-30',
  'gpt-image-1.5',
  'gpt-image-1',
  // QingYun also proxies these — kept after the OpenAI family because they
  // tend to be slower / more rate-limited but rarely hit the same quotas.
  'dall-e-3',
  'midjourney',
  // Sentinel — the helper picks up direct-Minimax when it sees this string
  // and switches base URL + auth key. Always last so we only burn the direct
  // Minimax quota if the QingYun proxy is fully exhausted.
  'minimax:image-01',
];
const MODEL_CHAIN: string[] = process.env.IMAGE_MODEL
  ? [process.env.IMAGE_MODEL, ...DEFAULT_MODEL_CHAIN.filter((m) => m !== process.env.IMAGE_MODEL)]
  : DEFAULT_MODEL_CHAIN;

/** Decide endpoint + auth for a given model identifier. The Minimax sentinel
 *  ("minimax:<model>") routes to Minimax's own API; everything else uses the
 *  QingYun OpenAI-compatible proxy. */
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

/** Sticky flag — once QingYun starts returning "quota exhausted", we stop
 *  retrying its models for the rest of this process. Saves ~10 wasted requests
 *  per icon when the proxy is dead. Cleared between processes. */
let qingyunDead = false;
function isQingyunDead(model: string): boolean {
  return qingyunDead && !model.startsWith('minimax:');
}
function markQingyunDead(reason: string): void {
  if (!qingyunDead) {
    console.warn(`[IconGen] QingYun marked dead: ${reason}. Skipping its models for the rest of this run.`);
    qingyunDead = true;
  }
}

/**
 * Build an icon prompt. Emphasises "sticker" / "icon" / "flat" to push the
 * model away from full illustrative portraits, which we already have for
 * character avatars. Shared stylistic vocabulary across icons so a trophy
 * icon and a briefcase icon don't end up in wildly different art styles.
 */
function buildIconPrompt(spec: IconSpec): string {
  const base =
    `A single clean modern flat sticker-style icon of ${spec.subject}${spec.detail ? `, ${spec.detail}` : ''}. ` +
    `Art direction: bold 2D vector look, thick confident outlines, smooth cel-shaded fills, ` +
    `subtle highlight gleams, one consistent depth so it reads at 64×64 thumbnail size. ` +
    `Palette anchored around ${spec.accent} with tasteful complementary accents. ` +
    `Soft pastel background with a subtle radial glow behind the subject, no scenery, no text, ` +
    `no logo, no watermark, no people visible unless explicitly requested, centred composition, ` +
    `generous margins so the glyph remains readable when masked into a circle.`;
  return base;
}

/**
 * Generate one icon. Cached on disk — a second call for the same key is a
 * no-op. Walk the fallback chain for resilience; return the served URL
 * (`/icons/<key>.png`) or null on total failure.
 */
export async function generateIcon(key: string, force = false): Promise<string | null> {
  const spec = ICON_DETAILS[key];
  if (!spec) {
    console.error(`[IconGen] No spec for icon key: ${key}`);
    return null;
  }

  const filePath = path.join(ICON_DIR, `${key}.png`);
  if (!force && fs.existsSync(filePath)) {
    return `/icons/${key}.png`;
  }

  const prompt = buildIconPrompt(spec);
  console.log(`[IconGen] Generating ${key}...`);

  for (const model of MODEL_CHAIN) {
    if (isQingyunDead(model)) continue;
    const ep = endpointFor(model);
    if (!ep.key) {
      // Skip models whose required key isn't configured in .env — typically
      // happens for the minimax: sentinel when MINIMAX_API_KEY is blank.
      continue;
    }
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
        console.warn(`[IconGen] ${model} → ${response.status}: ${errText.slice(0, 160)}`);
        // Mark QingYun dead on 401 (token exhausted) OR 429 (rate-limited),
        // since either way the entire proxy chain will keep failing for this
        // run. Skipping ahead to Minimax saves ~10 wasted requests per icon.
        if (ep.bodyShape === 'openai' && (
          response.status === 401 ||
          response.status === 429 ||
          /额度已用尽|quota|insufficient|请等待/i.test(errText))) {
          markQingyunDead(`${model} ${response.status}`);
        }
        continue;
      }
      const data = await response.json();
      // Both OpenAI-compatible and Minimax return arrays, but the keys differ.
      // OpenAI: { data: [{ url | b64_json }] }
      // Minimax: { data: { image_base64?: [...], image_urls?: [...] } } OR
      //          { data: [{ url | image_base64 }] } depending on proxy.
      let buf: Buffer | null = null;
      if (ep.bodyShape === 'minimax') {
        const md = data.data;
        const b64 = md?.image_base64?.[0] ?? md?.[0]?.image_base64 ?? md?.[0]?.b64_json;
        const url = md?.image_urls?.[0] ?? md?.[0]?.url;
        if (b64) buf = Buffer.from(b64, 'base64');
        else if (url) {
          const r = await fetch(url);
          if (r.ok) buf = Buffer.from(await r.arrayBuffer());
        }
      } else {
        const d = data.data?.[0];
        if (d?.b64_json) buf = Buffer.from(d.b64_json, 'base64');
        else if (d?.url) {
          const r = await fetch(d.url);
          if (r.ok) buf = Buffer.from(await r.arrayBuffer());
        }
      }
      if (!buf) continue;

      fs.writeFileSync(filePath, buf);
      console.log(`[IconGen] Saved ${key}.png via ${model} (${(buf.length / 1024).toFixed(1)} KB)`);
      return `/icons/${key}.png`;
    } catch (err) {
      console.warn(`[IconGen] ${model} threw`, err);
      continue;
    }
  }

  console.error(`[IconGen] All models in chain failed for ${key}`);
  return null;
}

/**
 * Generate every icon in the registry. Used by the regen-icons CLI.
 * Runs two at a time to be kind to QingYunTop's rate limit without being
 * agonisingly slow — matches the `generateAllAvatarsInBackground` cadence.
 */
export async function generateAllIcons(keys?: string[]): Promise<Record<string, string>> {
  const targets = keys ?? Object.keys(ICON_DETAILS);
  const results: Record<string, string> = {};

  for (let i = 0; i < targets.length; i += 2) {
    const batch = targets.slice(i, i + 2);
    await Promise.all(batch.map(async (key) => {
      const url = await generateIcon(key);
      if (url) results[key] = url;
    }));
    if (i + 2 < targets.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return results;
}

export function clearIconCache(): void {
  if (!fs.existsSync(ICON_DIR)) return;
  for (const f of fs.readdirSync(ICON_DIR)) {
    if (f.endsWith('.png')) fs.unlinkSync(path.join(ICON_DIR, f));
  }
  console.log('[IconGen] Icon cache cleared');
}

export function getAllCachedIcons(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(ICON_DIR)) return out;
  for (const f of fs.readdirSync(ICON_DIR)) {
    if (f.endsWith('.png')) {
      out[f.replace('.png', '')] = `/icons/${f}`;
    }
  }
  return out;
}
