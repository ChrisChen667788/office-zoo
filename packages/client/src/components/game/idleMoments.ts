/**
 * idleMoments — v6.21 "摸鱼 micro-moment" emote bubble engine.
 *
 * Pure client-side mood layer. Server has no idea. Each living rat gets
 * a soft emoji bubble above their head that rotates every ~10 seconds,
 * chosen from a pool weighted by:
 *
 *   1. server activity.kind (idle / work / chat / sneak / meeting / commute)
 *   2. room they're currently in (老板办公室 → 😨, 茶水间 → ☕ etc.)
 *   3. nearest furniture within 80px (coffee_machine → ☕, cctv → 👁️)
 *
 * The whole thing is deterministic (`hash(playerId, slotIdx)` → pool idx)
 * so the bubble doesn't shimmer between frames, just rotates slowly. No
 * RNG, no per-frame allocations.
 *
 * Output: { emoji, alpha, yOffset } so the caller can draw a bubble that
 * fades in, holds, fades out, and floats up slightly during the hold.
 *
 * Design intent: watch-mode is fundamentally passive — you stare at 9
 * rats walking around for 10 minutes. Without micro-moments the eye
 * glazes over. A 16-px emoji above a sprite that says "📱" (摸手机) or
 * "💤" (打瞌睡) gives the same delight as a Habbo crowd of "..." bubbles
 * — it's the texture that turns a diagram into a place where people
 * (rats) are bored at work like everyone else.
 */

import type { FurnitureKind } from '@furball/shared';

/* ── Tunables ─────────────────────────────────────────────────────────── */

/** Seconds per emote slot. New emote chosen every SLOT_SEC seconds. */
const SLOT_SEC = 10;
/** Seconds the emote stays visible inside the slot (0..HOLD_SEC). The
 *  remaining (SLOT_SEC - HOLD_SEC) is breathing room — bubble hidden, so
 *  the canvas isn't permanently cluttered. */
const HOLD_SEC = 4;
/** Fade in/out window at start and end of HOLD_SEC. */
const FADE_SEC = 0.5;
/** Float-up offset during hold (px). Subtle upward drift sells "thought
 *  rises out of head" instead of "sticker pinned to scalp". */
const FLOAT_PX = 4;

/* ── Emote pools ──────────────────────────────────────────────────────── */

/** Base pool by server activity.kind. Pools intentionally small (4-6
 *  each) so the rotation is recognizable — too many and it reads as noise.
 *  Picked for 班味 共鸣: 摸鱼 / 加班 / 八卦 / 心机 / 走神 / 通勤. */
const ACTIVITY_POOLS: Record<string, string[]> = {
  idle:    ['🥱', '💤', '📱', '☕', '🐟', '🌚'],          // 摸鱼系 — phone, tea, salted fish
  work:    ['💢', '😵‍💫', '📊', '⌨️', '📞', '🆘'],         // 压力系 — overload, deadline
  chat:    ['💬', '👀', '🙄', '😏', '🤐', '🍵'],          // 八卦系 — gossip, side-eye, tea
  sneak:   ['🤫', '😏', '🐍', '🕵️', '👀', '🚪'],          // 心机系 — sneaky, sly
  meeting: ['😴', '🥱', '📝', '🤔', '⌛', '💭'],          // 无聊系 — bored, taking notes
  commute: ['🚶', '☕', '📱', '🎧', '🌀'],                // 通勤系 — walking, music
};

/** Fallback pool when activity.kind is missing or unrecognized. */
const FALLBACK_POOL = ['💭', '...', '☕', '👀'];

/** Room-vibe modifier. When the player is in this room, these emojis
 *  get spliced into the pool (replacing one slot) so the room atmosphere
 *  bleeds into mood. Empty → no modification. */
const ROOM_VIBE: Record<string, string[]> = {
  '老板办公室': ['😨', '🫣', '🙊'],   // 紧张
  'HR办公室':   ['🫥', '😶', '📋'],   // 屏息
  '茶水间':     ['☕', '🍵', '🥤'],   // 续命
  '会议室':     ['😴', '🥱', '⌛'],   // 无聊
  '监控室':     ['👁️', '🎥', '🤨'],   // 警惕
  '文印室':     ['📠', '🖨️', '📄'],   // 卡纸
  '服务器机房': ['💻', '🔥', '🌡️'],   // 烫手
  '产品部':     ['📊', '💡', '🚀'],   // PRD
  '开放工区':   ['💻', '⌨️', '☕'],   // 工位
  '电梯间':     ['🛗', '⬆️', '⬇️'],    // 等电梯
};

/** Furniture-proximity boost. When a player's sprite center is within
 *  PROX_PX screen px of a furniture sprite, splice these emojis in (they
 *  outrank the room-vibe pool — closer-source wins). */
const FURNITURE_VIBE: Partial<Record<FurnitureKind, string[]>> = {
  coffee_machine:  ['☕', '☕', '🥱'],     // doubled — coffee really wants ☕
  water_dispenser: ['💧', '🥤'],
  printer:         ['📠', '🖨️', '📄'],
  cctv:            ['👁️', '🎥', '😬'],
  server_rack:     ['🔥', '💻', '🌡️'],
  sofa:            ['💤', '🛋️', '😴'],
  plant:           ['🌿', '🍃'],
  whiteboard:      ['📈', '🧮', '🗯️'],
  meeting_table:   ['🥱', '⌛', '💭'],
  desk:            ['⌨️', '🖱️', '☕'],
  chair:           ['🪑', '🥱'],
  elevator_door:   ['🛗', '⬆️'],
};

/** Distance threshold (in screen-space px) below which a furniture's
 *  vibe pool overrides the room pool. 70 px ≈ adjacent tile in iso. */
export const PROX_PX = 70;

/* ── Hash (djb2, deterministic, zero deps) ──────────────────────────── */

function hash(s: string): number {
  let h = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h >>>= 0;
  }
  return h;
}

/* ── Public API ───────────────────────────────────────────────────────── */

export interface EmoteFrame {
  /** Single emoji glyph (or fallback ASCII like "...") */
  emoji: string;
  /** 0..1 — caller applies as globalAlpha when drawing bubble + emoji. */
  alpha: number;
  /** Px to subtract from drawing Y — positive = bubble drifts up. */
  yOffset: number;
}

/** Resolve which emote to draw above a given player this frame. Returns
 *  null if the bubble should be hidden (the breathing-room gap between
 *  slots, or unalive players).
 *
 *  Deterministic on (playerId, floor(tSec / SLOT_SEC)) — no per-frame
 *  RNG. Two calls in the same frame for the same player return the same
 *  emoji, so React StrictMode double-renders are also stable.
 */
export function pickEmoteForPlayer(args: {
  playerId: string;
  isAlive: boolean;
  activityKind?: string;
  roomId?: string;
  nearestFurnitureKind?: FurnitureKind | null;
  tSec: number;
}): EmoteFrame | null {
  if (!args.isAlive) return null;

  // Per-player phase offset so bubbles don't all flash on at the same
  // instant. Spreads 9 rats evenly across the SLOT_SEC cycle.
  //
  // v6.25 P7 fix — original `hash(id) % 10000 / 1000` returned ~6.78
  // for ALL of player_0..player_8 because djb2's low bits stay nearly
  // identical for short prefix-similar inputs. Multiplying by Knuth's
  // 2654435761 (golden-ratio constant) before mod-10000 redistributes
  // high-bit entropy into the low bits → proper spread. (Verified via
  // P7 stagger test.)
  const h = (hash(args.playerId) * 2654435761) >>> 0;
  const phase = (h % (SLOT_SEC * 1000)) / 1000;
  const t = args.tSec + phase;
  const slotIdx = Math.floor(t / SLOT_SEC);
  const inSlot = t - slotIdx * SLOT_SEC;
  // Hidden window — bubble off-screen, breathing room.
  if (inSlot >= HOLD_SEC) return null;

  // Pool composition — start from activity, then splice in nearest-
  // source vibe (furniture > room). Splicing replaces last slot, not
  // appending, so pool size stays bounded.
  const baseKind = args.activityKind ?? 'idle';
  const basePool = ACTIVITY_POOLS[baseKind] ?? FALLBACK_POOL;
  const pool = basePool.slice();

  const furnPool = args.nearestFurnitureKind
    ? FURNITURE_VIBE[args.nearestFurnitureKind]
    : undefined;
  const roomPool = args.roomId ? ROOM_VIBE[args.roomId] : undefined;
  const vibePool = furnPool ?? roomPool;
  if (vibePool && vibePool.length) {
    // Splice in 2 vibe emojis at the end (replace tail), keeping pool
    // size near base. This gives ≈ 2/n probability of room-themed pick.
    pool.splice(-2, 2, ...vibePool.slice(0, 2));
  }

  const idx = hash(`${args.playerId}|${slotIdx}`) % pool.length;
  const emoji = pool[idx];

  // Fade envelope: fade in over FADE_SEC, hold flat, fade out over FADE_SEC.
  let alpha = 1;
  if (inSlot < FADE_SEC) alpha = inSlot / FADE_SEC;
  else if (inSlot > HOLD_SEC - FADE_SEC) alpha = (HOLD_SEC - inSlot) / FADE_SEC;

  // Float-up: 0 at start, FLOAT_PX at end of hold. Linear is fine —
  // we're already getting motion-curve feel from the fade envelope.
  const yOffset = (inSlot / HOLD_SEC) * FLOAT_PX;

  return { emoji, alpha, yOffset };
}
