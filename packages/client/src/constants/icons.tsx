/**
 * icons — URLs for every AI-generated UI glyph.
 *
 * Mirror of `packages/server/src/services/iconGen.ts`'s `ICON_DETAILS`.
 * Keys must stay in sync with the server registry. See that file for the
 * authoritative list + prompts.
 *
 * All icons live at `/icons/<key>.png` on the server. We resolve the
 * absolute base URL from the runtime server URL (3100) so the client
 * works across dev-server / prod-deploy without a separate CDN step.
 */

// Use relative URLs — Vite proxies /icons → :3100 in dev (see vite.config.ts),
// and prod can serve icons from the same origin. Absolute cross-port URLs
// trip up Safari's ITP image rendering on some macOS versions even with
// wide-open CORS, so keeping everything same-origin is the safe play.
function url(key: string): string {
  return `/icons/${key}.png`;
}

// --- Mode card icons (Landing) ------------------------------------------
export const modeIcons = {
  classic:   url('mode_classic'),
  immersive: url('mode_immersive'),
  fired:     url('mode_fired'),
} as const;

// --- v6.60 deep-screen nav / section icons (二/三/四级界面入口) -----------
// Replaces the raw emoji on the home secondary-nav buttons + each deep
// screen's header. 裁了么 reuses mode_fired. Keys mirror iconGen.ts.
export const navIcons = {
  fired:       url('mode_fired'),
  talkshow:    url('nav_talkshow'),
  fortune:     url('nav_fortune'),
  weekly:      url('nav_weekly'),
  quiz:        url('nav_quiz'),
  squad:       url('nav_squad'),
  premium:     url('nav_premium'),
  bar:         url('nav_bar'),
  anniversary: url('nav_anniversary'),
  profile:     url('nav_profile'),
} as const;
export type NavIconKey = keyof typeof navIcons;

// --- v6.62 闯关牌局 UI 小图标(双血条状态 + 话术卡)----------------------
export const battleStatIcons = {
  budget:   url('negstat_budget'),
  patience: url('negstat_patience'),
  morale:   url('negstat_morale'),
  chips:    url('negstat_chips'),
} as const;

// --- v6.69 被优化角色「表情立绘」AI 图(kill→惊恐 / vote→委屈,各 3 版按名字稳定选)---
const EXPR_PANIC = ['expr_panic_1', 'expr_panic_2', 'expr_panic_3'];
const EXPR_AGGRIEVED = ['expr_aggrieved_1', 'expr_aggrieved_2', 'expr_aggrieved_3'];
/** 按事件 + 鼠名稳定选一张表情立绘 src。图没生成时 <Icon> 会自动回退到 emoji 兜底。 */
export function expressionIcon(kind: 'kill' | 'vote', name: string): string {
  const pool = kind === 'kill' ? EXPR_PANIC : EXPR_AGGRIEVED;
  const h = [...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return url(pool[h % pool.length]);
}
/** 话术卡图标,key = 卡 id(对应 shared CARD_POOL / UNLOCKABLE_CARDS)。 */
export const negotiationCardIcons: Record<string, string> = {
  tenure_push:   url('negcard_tenure_push'),
  labor_law:     url('negcard_labor_law'),
  noncompete:    url('negcard_noncompete'),
  sob_story:     url('negcard_sob_story'),
  insider_dirt:  url('negcard_insider_dirt'),
  beg:           url('negcard_beg'),
  outside_offer: url('negcard_outside_offer'),
  recording:     url('negcard_recording'),
  arbitration:   url('negcard_arbitration'),
  media_expose:  url('negcard_media_expose'),
};

// --- Personality badges (Immersive + Classic) ---------------------------
export const personalityIcons = {
  social_butterfly:   url('personality_social_butterfly'),
  introvert:          url('personality_introvert'),
  contrarian:         url('personality_contrarian'),
  sycophant:          url('personality_sycophant'),
  passive_aggressive: url('personality_passive_aggressive'),
  hot_tempered:       url('personality_hot_tempered'),
  smooth_operator:    url('personality_smooth_operator'),
  workaholic:         url('personality_workaholic'),
} as const;

// --- Game-phase indicator chips -----------------------------------------
export const phaseIcons = {
  lobby:       url('phase_lobby'),
  role_reveal: url('phase_role_reveal'),
  free_roam:   url('phase_free_roam'),
  meeting:     url('phase_meeting'),
  discussion:  url('phase_discussion'),
  voting:      url('phase_voting'),
  vote_result: url('phase_vote_result'),
  game_over:   url('phase_game_over'),
} as const;

// --- Team banners -------------------------------------------------------
export const teamIcons = {
  cat:     url('team_cat'),
  dog:     url('team_dog'),
  neutral: url('team_neutral'),
} as const;

// --- Prediction-bar achievement medals ----------------------------------
export const achievementIcons = {
  bronze: url('achievement_bronze'),
  silver: url('achievement_silver'),
  gold:   url('achievement_gold'),
  crown:  url('achievement_crown'),
} as const;

// --- Prediction / timeline / recap glyphs -------------------------------
export const glyphIcons = {
  predictionTarget:  url('prediction_target'),
  predictionCorrect: url('prediction_correct'),
  predictionWrong:   url('prediction_wrong'),
  streakFire:        url('streak_fire'),
  timelineRecap:     url('timeline_recap'),
  timelineKill:      url('timeline_kill'),
  timelineVote:      url('timeline_vote'),
  dossierMask:       url('dossier_mask'),
  ghostSpeech:       url('ghost_speech'),
} as const;

// --- Activity badges (free-roam tick layer, shown on the GameMap) -------
// Mirrors `Activity` union in @furball/shared. Each badge is a tiny sticker
// that appears next to the player's avatar on the map so the user can see
// what they're doing at a glance without reading the tooltip caption.
export const activityIcons = {
  work:    url('activity_work'),
  chat:    url('activity_chat'),
  sneak:   url('activity_sneak'),
  idle:    url('activity_idle'),
  commute: url('activity_commute'),
  meeting: url('activity_meeting'),
  coffee:  url('activity_coffee'),
  print:   url('activity_print'),
} as const;
export type ActivityIconKey = keyof typeof activityIcons;

// --- v0.6.0 Room furniture stickers -------------------------------------
// Keys must match `FURNITURE_TYPES[*].iconKey` in shared/data/furniture.ts.
// 12 isometric mini-stickers placed inside each room — see GameMap render.
// Soft-fail on 404: if a sticker is mid-regen the renderer falls back to a
// solid colored rectangle of the same footprint so the layout doesn't pop.
export const furnitureIcons = {
  desk:            url('furniture_desk'),
  chair:           url('furniture_chair'),
  meeting_table:   url('furniture_meeting_table'),
  whiteboard:      url('furniture_whiteboard'),
  coffee_machine:  url('furniture_coffee_machine'),
  water_dispenser: url('furniture_water_dispenser'),
  printer:         url('furniture_printer'),
  server_rack:     url('furniture_server_rack'),
  cctv:            url('furniture_cctv'),
  sofa:            url('furniture_sofa'),
  plant:           url('furniture_plant'),
  elevator_door:   url('furniture_elevator'),
} as const;
export type FurnitureIconKey = keyof typeof furnitureIcons;

// --- v0.6.2 carried items — small stickers shown next to the player avatar
// when they're holding something (cup at coffee machine, folder at desk,
// recorder while sneaking, etc). Keys mirror shared.ItemKind.
export const itemIcons = {
  cup:      url('item_cup'),
  folder:   url('item_folder'),
  recorder: url('item_recorder'),
  badge:    url('item_badge'),
  paper:    url('item_paper'),
  mug:      url('item_mug'),
} as const;
export type ItemIconKey = keyof typeof itemIcons;

export type ModeIconKey = keyof typeof modeIcons;
export type PersonalityIconKey = keyof typeof personalityIcons;
export type PhaseIconKey = keyof typeof phaseIcons;
export type TeamIconKey = keyof typeof teamIcons;

// --- Tiny shared <Icon> component ---------------------------------------
// Inline here to avoid pulling in another React component for a 10-line use.
// Gracefully falls back to an emoji if the image 404s (icon hasn't been
// regenerated yet) — a soft degradation during the generation window.
import { useState, type CSSProperties } from 'react';

export interface IconProps {
  src: string;
  emoji?: string;           // fallback while image pending / on error
  size?: number | string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  /** v6.72 — fires once the image resolves: true = loaded, false = errored
   *  (fell back to emoji). Lets callers de-dupe overlays (e.g. hide a
   *  redundant expression sticker when the real AI portrait loaded). */
  onResolved?: (loaded: boolean) => void;
}

export function Icon({ src, emoji, size = 24, alt = '', className, style, onResolved }: IconProps) {
  const [failed, setFailed] = useState(false);
  const s: CSSProperties = { width: size, height: size, display: 'inline-block', objectFit: 'contain', ...style };
  if (failed) {
    return (
      <span className={className} style={{ ...s, display: 'inline-grid', placeItems: 'center', fontSize: typeof size === 'number' ? size * 0.8 : undefined }}>
        {emoji ?? ''}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={s}
      loading="lazy"
      decoding="async"
      onLoad={() => onResolved?.(true)}
      onError={() => { setFailed(true); onResolved?.(false); }}
    />
  );
}
