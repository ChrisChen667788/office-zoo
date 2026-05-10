/**
 * activity.ts — assigns plausible per-room activities to players during the
 * free-roam tick loop, and synthesises a human-readable caption for each.
 *
 * Kept as a pure helper module (no engine state, no I/O) so it can be unit-
 * tested in isolation and reused by future modes (eg. spectator replay).
 *
 * Design rules:
 *  - Activity is room-driven: 茶水间 → chat, 服务器机房 → debug, etc. Some
 *    rooms have multiple plausible activities and we pick one randomly so
 *    the same player doesn't always look like they're doing the same thing.
 *  - Sneak / chat overlap when a Dog player ends up in the same room as a
 *    plausible target — the engine resolves the social wiring; this module
 *    just turns the (room, role, team) tuple into an Activity.
 *  - Captions are short — one short Chinese verb phrase that fits in a
 *    tooltip. The full snark belongs in speeches, not here.
 */
import type { Activity, FurnitureItem, FurnitureKind, PlayerState } from '@furball/shared';
import { Team, FURNITURE_TYPES, ROOM_FURNITURE, nearestFurniture, labelFor } from '@furball/shared';

// ---------------------------------------------------------------------------
// Per-room activity menus. Each entry is a `(work-subject)` candidate that
// gets picked at random. Rooms not in the map fall through to a generic
// "在...瞎晃" idle.
// ---------------------------------------------------------------------------
const ROOM_WORK_SUBJECTS: Record<string, string[]> = {
  开放工区:   ['改 PPT', '回 Slack', '对齐 OKR', 'debug 一个莫名 bug', '假装看代码', '刷工作群'],
  茶水间:     ['倒第三杯咖啡', '吃饼干', '看八卦', '蹭 wifi 摸鱼'],
  会议室:     ['排会议室', '占工位充电', '看着白板发呆'],
  HR办公室:   ['翻员工档案', '给候选人打电话', '改岗位 JD'],
  服务器机房: ['看监控大盘', 'kubectl get pods', 'tail -f 报错日志', '机柜散热摸一下'],
  监控室:     ['倒带 CCTV', '看谁打卡迟到', '截屏存证'],
  产品部:     ['画原型', '改 PRD', '催设计稿', '@设计 加班'],
  老板办公室: ['翻老板桌上的文件', '偷拍白板', '听老板打电话'],
  文印室:     ['打印离职证明', '复印身份证', '装订合同'],
  电梯间:     ['等电梯', '刷手机', '抽烟'],
};

const ROOM_CHAT_OPENERS: Record<string, string[]> = {
  茶水间:     ['吐槽周报', '聊周末加班', '问要不要奶茶'],
  开放工区:   ['抱怨 KPI', '小声讨论裁员名单'],
  电梯间:     ['寒暄', '聊房贷'],
  会议室:     ['会前闲聊', '对眼神'],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pick an activity for a player in their current room.
 *
 * @param player    The player landing in / staying in this room
 * @param roommates Other alive players currently in the same room (for chat /
 *                  sneak target selection)
 * @returns Activity + a human-readable caption
 */
export function assignRoomActivity(
  player: PlayerState,
  roommates: PlayerState[],
): { activity: Activity; activityText: string } {
  const room = player.position.room;
  const others = roommates.filter((p) => p.id !== player.id && p.isAlive);

  // Dogs sneak when their target is in the room with them.
  if (player.team === Team.DOG) {
    const target = others.find((p) => p.team !== Team.DOG);
    if (target && Math.random() < 0.4) {
      return {
        activity: { kind: 'sneak', targetId: target.id },
        activityText: `${player.name} 在 ${room} 偷瞄 ${target.name}`,
      };
    }
  }

  // 30% chat with someone if there's a partner in the room.
  if (others.length > 0 && Math.random() < 0.3) {
    const partner = others[Math.floor(Math.random() * others.length)];
    const opener = pick(ROOM_CHAT_OPENERS[room]) ?? '闲聊';
    return {
      activity: { kind: 'chat', withId: partner.id },
      activityText: `${player.name} 在 ${room} 跟 ${partner.name} ${opener}`,
    };
  }

  // Default: a room-themed work subject. v0.6.0 — try to anchor the
  // caption on the nearest furniture item ("Frank 在 工位 3 改 PPT")
  // instead of the generic room name. Falls back to the room name when
  // there's no furniture within 60 logical px.
  const subjects = ROOM_WORK_SUBJECTS[room];
  if (subjects && subjects.length > 0) {
    const subject = subjects[Math.floor(Math.random() * subjects.length)];
    const nf = nearestFurniture(room, player.position.x, player.position.y, 80);
    const where = nf ? `${room} ${labelFor(nf)}` : room;
    return {
      activity: { kind: 'work', subject },
      activityText: `${player.name} 在 ${where} ${subject}`,
    };
  }

  return {
    activity: { kind: 'idle' },
    activityText: `${player.name} 在 ${room} 瞎晃`,
  };
}

/** Caption shown while a player is in transit between two rooms. */
export function commuteCaption(
  player: PlayerState,
  destination: string,
): string {
  return `${player.name} 正前往 ${destination}`;
}

function pick<T>(arr?: T[]): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// v0.6.1 — furniture anchoring
//
// Map an Activity to the kinds of furniture that satisfy it, with a per-kind
// "where on the sprite does the player stand" offset. Desks are the canonical
// "sit IN FRONT of"; coffee machines are "stand RIGHT NEXT to"; sofas place
// the player on top.
// ---------------------------------------------------------------------------

interface FurnitureAffinity {
  /** Furniture kinds that satisfy this activity, in preference order. */
  kinds: FurnitureKind[];
  /** Offset relative to the furniture centre, in logical units. dx=0/dy=10
   *  reads as "just below the item" → renders as the player standing/sitting
   *  in front of it on the iso floor. */
  offsetDx: number;
  offsetDy: number;
}

const ACTIVITY_TO_FURNITURE: Record<string, FurnitureAffinity> = {
  // Generic work — desks first, server racks (for engineers), printers,
  // CCTV (for monitor room "checking footage" reads as work).
  'work': { kinds: ['desk', 'server_rack', 'printer', 'cctv'], offsetDx: 0, offsetDy: 22 },
  // Chat — sofa, water dispenser, coffee machine (gather points)
  'chat': { kinds: ['sofa', 'water_dispenser', 'coffee_machine'], offsetDx: 0, offsetDy: 18 },
  // Sneak — stand near a plant or against a wall (we approximate with plant)
  'sneak': { kinds: ['plant', 'whiteboard'], offsetDx: 16, offsetDy: 12 },
  // Idle — sofas first, otherwise water dispenser ("摸鱼")
  'idle': { kinds: ['sofa', 'plant', 'water_dispenser'], offsetDx: 0, offsetDy: 18 },
  // Meeting — meeting tables / chairs around them
  'meeting': { kinds: ['meeting_table', 'chair'], offsetDx: 0, offsetDy: 24 },
};

/** Pick a target furniture inside the room that fits the activity, with
 *  a per-room hash on player.id so the same player tends to pick the
 *  same desk repeatedly (consistency reads as "Frank's desk" naturally).
 *
 *  Returns null when no eligible furniture exists in the room — callers
 *  should fall back to roomCenter() for placement.
 */
export function pickAnchor(
  player: PlayerState,
  activity: Activity,
): { x: number; y: number; furnitureId: string } | null {
  const room = player.position.room;
  const affinity = ACTIVITY_TO_FURNITURE[activity.kind];
  if (!affinity) return null;

  const candidates: FurnitureItem[] = [];
  for (const kind of affinity.kinds) {
    const matches = ROOM_FURNITURE.filter((f) => f.roomId === room && f.kind === kind);
    if (matches.length > 0) {
      candidates.push(...matches);
      break; // honour preference order — first kind with matches wins
    }
  }
  if (candidates.length === 0) return null;

  // Stable hash: same player id consistently picks the same item index so
  // re-arrivals between rounds don't re-shuffle who sits where.
  let hash = 0;
  for (let i = 0; i < player.id.length; i++) hash = (hash * 31 + player.id.charCodeAt(i)) | 0;
  const item = candidates[Math.abs(hash) % candidates.length];
  const def = FURNITURE_TYPES[item.kind];
  return {
    x: item.x + def.w / 2 + affinity.offsetDx,
    y: item.y + def.h / 2 + affinity.offsetDy,
    furnitureId: item.id,
  };
}
