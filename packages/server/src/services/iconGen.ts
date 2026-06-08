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

  // --- v0.6.0 Room furniture stickers -----------------------------------
  // Top-down isometric mini stickers, drawn at 1024x1024 then downscaled
  // to ~50x50 in-room. Match the iso angle of the GameMap rooms so they
  // sit naturally on the floor instead of looking pasted-on.
  furniture_desk:            { subject: 'an isometric tiny office desk with a glowing monitor and keyboard, top-down view', detail: 'modern minimalist, dark wood top, pixel-art-friendly', accent: '#7c3aed', bgStyle: 'transparent' },
  furniture_chair:           { subject: 'an isometric tiny black office swivel chair, top-down 3/4 view', detail: 'minimalist, no person on it', accent: '#666666', bgStyle: 'transparent' },
  furniture_meeting_table:   { subject: 'an isometric long oval meeting table with subtle wood grain, top-down view', detail: 'no chairs around it', accent: '#a07555', bgStyle: 'transparent' },
  furniture_whiteboard:      { subject: 'an isometric whiteboard on a wall mount with messy red and blue marker writing, 3/4 view', accent: '#4c9eff', bgStyle: 'transparent' },
  furniture_coffee_machine:  { subject: 'an isometric espresso coffee machine with a tiny cup, glossy chrome and black, 3/4 view', accent: '#8d6e63', bgStyle: 'transparent' },
  furniture_water_dispenser: { subject: 'an isometric office water dispenser with a big blue water bottle on top, 3/4 view', accent: '#4cb5ff', bgStyle: 'transparent' },
  furniture_printer:         { subject: 'an isometric office laser printer with a sheet of paper sticking out the top, 3/4 view', accent: '#90caf9', bgStyle: 'transparent' },
  furniture_server_rack:     { subject: 'an isometric tall server rack with blinking blue and green LEDs, 3/4 view', accent: '#00ced1', bgStyle: 'transparent' },
  furniture_cctv:            { subject: 'an isometric single black dome CCTV security camera with a glowing red recording light, 3/4 view', detail: 'one single device only, no monitors, no camera feeds, no people, centred with clear margin', accent: '#546e7a', bgStyle: 'transparent' },
  furniture_sofa:            { subject: 'an isometric tiny grey three-seat office sofa with two cushions, 3/4 view', accent: '#9e9e9e', bgStyle: 'transparent' },
  furniture_plant:           { subject: 'an isometric small office monstera plant in a white round pot, 3/4 view', accent: '#66bb6a', bgStyle: 'transparent' },
  furniture_elevator:        { subject: 'an isometric pair of closed metallic elevator doors with a glowing up/down arrow panel beside them, 3/4 view', accent: '#7c3aed', bgStyle: 'transparent' },

  // --- v0.6.2 carried items -- tiny stickers floated next to the player
  // Drawn at ~20px alongside the avatar to telegraph what they're holding.
  item_cup:      { subject: 'a tiny disposable paper coffee cup with a heat sleeve and steam wisp, sticker style', accent: '#8d6e63', bgStyle: 'transparent' },
  item_folder:   { subject: 'a tiny manila folder with papers sticking out, sticker style', accent: '#fbbf24', bgStyle: 'transparent' },
  item_recorder: { subject: 'a tiny black voice recorder with a glowing red record dot, sticker style', accent: '#ef4444', bgStyle: 'transparent' },
  item_badge:    { subject: 'a tiny employee ID badge on a blue lanyard with a small headshot square, sticker style', accent: '#4c9eff', bgStyle: 'transparent' },
  item_paper:    { subject: 'a tiny stack of printed A4 paper sheets slightly fanned, sticker style', accent: '#e0e0e0', bgStyle: 'transparent' },
  item_mug:      { subject: 'a tiny ceramic coffee mug with a curly steam wisp, sticker style', accent: '#a07555', bgStyle: 'transparent' },

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

  // --- v6.60 deep-screen nav / section icons ----------------------------
  // Replace the raw emoji that the 二/三/四级界面 (talkshow / fortune / weekly /
  // quiz / squad / premium / bar / anniversary / profile entries) still use.
  // 裁了么 reuses mode_fired. Drawn in the same 二次元 sticker style as the rest.
  nav_talkshow:    { subject: 'a glossy retro standup-comedy microphone with little musical-note sparkles', accent: '#FF6B9D', bgStyle: 'solid' },
  nav_fortune:     { subject: 'a mystical purple crystal ball glowing on a tiny stand with sparkles', accent: '#a855f7', bgStyle: 'solid' },
  nav_weekly:      { subject: 'a clipboard with a rising bar chart and a tiny green check, sticker', accent: '#4cb5ff', bgStyle: 'solid' },
  nav_quiz:        { subject: 'a glowing cartoon brain with a question-mark spark, sticker', accent: '#22d3ee', bgStyle: 'solid' },
  nav_squad:       { subject: 'three little office-animal heads grouped together as a team, sticker', accent: '#fbbf24', bgStyle: 'solid' },
  nav_premium:     { subject: 'a sparkling cyan diamond gem with a tiny gold crown, premium sticker', accent: '#38bdf8', bgStyle: 'solid' },
  nav_bar:         { subject: 'a frothy beer mug with neon late-night glow, sticker', accent: '#f59e0b', bgStyle: 'solid' },
  nav_anniversary: { subject: 'a party popper bursting with colorful confetti, celebration sticker', accent: '#f472b6', bgStyle: 'solid' },
  nav_profile:     { subject: 'a friendly office-worker avatar bust inside a round frame, sticker', accent: '#818cf8', bgStyle: 'solid' },

  // --- v6.62 闯关牌局 UI 小图标 -------------------------------------------
  // 双血条状态 + 10 张话术卡的内联小图(替换 NegotiationBattle 里的 emoji)。
  // 渲染在 14-24px,所以主体要单一、对比强、读得清。
  negstat_budget:   { subject: 'a plump gold money bag with a red Chinese yuan ¥ sign, bold simple sticker', accent: '#ff6b6b', bgStyle: 'solid' },
  negstat_patience: { subject: 'an irritated cartoon face huffing two puffs of steam, patience-running-out sticker', accent: '#ffa94d', bgStyle: 'solid' },
  negstat_morale:   { subject: 'a clenched fist with a small blue flame aura, determination/guts sticker', accent: '#4dabf7', bgStyle: 'solid' },
  negstat_chips:    { subject: 'a small neat stack of colorful poker chips, leverage sticker', accent: '#a78bfa', bgStyle: 'solid' },

  negcard_tenure_push:  { subject: 'a gold long-service star medal with a tiny "8" for eight years, sticker', accent: '#fbbf24', bgStyle: 'solid' },
  negcard_labor_law:    { subject: 'a red labor-law code book with a ribbon bookmark, sticker', accent: '#ef4444', bgStyle: 'solid' },
  negcard_noncompete:   { subject: 'a contract scroll with a curved counter-attack arrow, sticker', accent: '#22d3ee', bgStyle: 'solid' },
  negcard_sob_story:    { subject: 'a teary pleading cartoon face with one big tear drop, sticker', accent: '#60a5fa', bgStyle: 'solid' },
  negcard_insider_dirt: { subject: 'a manila folder stamped 机密 with a peeking eye, sticker', accent: '#f59e0b', bgStyle: 'solid' },
  negcard_beg:          { subject: 'two hands clasped together pleading, sticker', accent: '#f472b6', bgStyle: 'solid' },
  negcard_outside_offer:{ subject: 'an open envelope with a glowing star offer letter popping out, sticker', accent: '#34d399', bgStyle: 'solid' },
  negcard_recording:    { subject: 'a smartphone screen showing a red recording dot and a waveform, sticker', accent: '#ef4444', bgStyle: 'solid' },
  negcard_arbitration:  { subject: 'a wooden judge gavel striking with a small spark, sticker', accent: '#DAA520', bgStyle: 'solid' },
  negcard_media_expose: { subject: 'a glowing megaphone with sound waves and a tiny news flash, sticker', accent: '#fb7185', bgStyle: 'solid' },

  // v6.69 — 被优化角色「表情立绘」:惊恐(被裁瞬间)/ 委屈(被投票出局)各 3 版。
  // 二次元贴纸头像风,上半身,表情夸张,放进 EliminationReveal 的立绘底盘(圆角裁切)。
  expr_panic_1:     { subject: 'a cute anime office-worker mouse in a white shirt with a horrified panicked face, eyes wide open, both paws on cheeks, big sweat drops, mouth open in a silent scream', detail: 'upper-body portrait, exaggerated shocked expression, clean solid background', accent: '#ef4444', bgStyle: 'solid' },
  expr_panic_2:     { subject: 'a terrified cartoon office mouse with jaw dropped and bulging eyes, trembling, cold sweat beads, hands raised in shock', detail: 'upper-body anime sticker portrait, dramatic fear, clean solid background', accent: '#f97316', bgStyle: 'solid' },
  expr_panic_3:     { subject: 'a panicked cartoon mouse clutching a cardboard box of desk stuff, eyes popping in fear, blue shock lines on forehead', detail: 'upper-body anime sticker portrait, comedic horror, clean solid background', accent: '#fb7185', bgStyle: 'solid' },
  expr_aggrieved_1: { subject: 'a cute anime office-worker mouse with a wronged teary face, big watery glossy eyes, trembling lip, holding a resignation letter', detail: 'upper-body sticker portrait, pitiful aggrieved expression, clean solid background', accent: '#60a5fa', bgStyle: 'solid' },
  expr_aggrieved_2: { subject: 'a sad cartoon office mouse about to cry, glassy teary eyes welling up, droopy ears, quivering mouth', detail: 'upper-body anime sticker portrait, wronged look, clean solid background', accent: '#a78bfa', bgStyle: 'solid' },
  expr_aggrieved_3: { subject: 'a teary cartoon mouse hugging a cardboard box of belongings, a single big tear rolling down, pitiful wronged pout', detail: 'upper-body anime sticker portrait, melancholy, clean solid background', accent: '#38bdf8', bgStyle: 'solid' },
};

const IMAGE_API_KEY = process.env.QINGYUN_API_KEY || '';
const IMAGE_BASE_URL = process.env.QINGYUN_BASE_URL || 'https://api.qingyuntop.top/v1';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
// Direct Minimax image-generation endpoint. Used as a last-resort fallback
// when the QingYun proxy chain gets rate-limited or starts returning 5xx for
// every model. The user explicitly asked us to wire Minimax in: Apr 2026.
const MINIMAX_IMAGE_URL = process.env.MINIMAX_IMAGE_URL || 'https://api.minimaxi.com/v1/image_generation';

const DEFAULT_MODEL_CHAIN = [
  // v6.55 — re-ordered after a live `/models` + `/images/generations` smoke
  // test (Jun 2026): the QingYun proxy stopped serving `flux-schnell`
  // (→ 503 "no available channel") and `qwen-image-max-2025-12-30`, and
  // `gemini-2.5-flash-image` 500s ("not supported model for image generation"
  // — it's a chat-multimodal model, not a t2i endpoint). The smoke test
  // confirmed `doubao-seedream-4-5-251128` returns a real image (~21s), so it
  // leads; the slower OpenAI family stays as fallback.
  'doubao-seedream-4-5-251128',
  'doubao-seedream-3-0-t2i-250415',
  'flux-1.1-pro',
  'gpt-image-1.5',
  'gpt-image-1',
  // QingYun also proxies these — kept after the OpenAI family because they
  // tend to be slower / more rate-limited but rarely hit the same quotas.
  'dall-e-3',
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
  // v6.55 — art direction upgraded to match the 二次元 character avatars
  // (imageGen.ts) so icons + avatars read as one cohesive, polished set
  // instead of flat-vector glyphs next to lush anime portraits.
  const base =
    `A single anime-style 二次元 sticker icon of ${spec.subject}${spec.detail ? `, ${spec.detail}` : ''}. ` +
    `Art direction: high-quality Japanese anime key-visual look — clean bold lineart, smooth ` +
    `cel-shading with soft color blocking and gradient sheen, glossy sparkling highlight gleams, ` +
    `subtle rim light, polished and trendy, matching a cute anime character-avatar aesthetic. ` +
    `Crisp single glyph that still reads clearly at 64×64 thumbnail size. ` +
    `Palette anchored around ${spec.accent} with tasteful complementary accents. ` +
    `Soft glowing background with a gentle radial gradient behind the subject, no scenery, no text, ` +
    `no logo, no watermark, no people visible unless explicitly requested, centred composition, ` +
    `generous margins so the glyph stays readable when masked into a circle. No flat vector look, no 3D render.`;
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

export function clearIconCache(only?: readonly string[]): void {
  if (!fs.existsSync(ICON_DIR)) return;
  // 限定清理:只删指定 key 的 PNG(单图重生时不波及其余图标);不传则清全部。
  if (only && only.length) {
    for (const k of only) {
      const p = path.join(ICON_DIR, `${k}.png`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    console.log(`[IconGen] Icon cache cleared for ${only.length} target(s)`);
    return;
  }
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
