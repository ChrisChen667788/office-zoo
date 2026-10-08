/**
 * human/seat.ts — v6.152 — 真人占鼠人席位 · 共享纯引擎。
 *
 * 不同于场边嘉宾(旁观发言影响 AI),占座的真人**直接参与游戏**:
 * 讨论时被提示发言,投票时直接投,超时则由 AI 代打。
 *
 * 这里只管纯逻辑:台账(playerId→userId)/ 认领校验 / 广播 payload 构建。
 * engine 接入在 GameEngine.ts,socket 协议在 socketHandler.ts。
 */

/** 台账类型:playerId → userId(认领者)。 */
export type SeatClaims = Partial<Record<string, string>>;

/**
 * 最大真人席位数(AI 必须保持多数):
 *   min(3, floor(playerCount / 3))
 *
 * 示例:
 *   4 人 → 1  (1 真人 + 3 AI)
 *   6 人 → 2
 *   8 人 → 2
 *   9 人 → 3
 *  12 人 → 3
 */
export function maxHumanSeats(playerCount: number): number {
  return Math.min(3, Math.floor(playerCount / 3));
}

/** 认领结果的 reason 类型。 */
export type SeatClaimReason =
  | 'unknown_player'
  | 'dead_player'
  | 'seat_taken'
  | 'already_has_seat'
  | 'seats_full';

/** claimSeat 的上下文参数。 */
export interface SeatClaimCtx {
  playerIds: string[];      // 游戏里所有玩家 id
  alivePlayerIds: string[]; // 存活玩家 id
  playerCount: number;      // 总玩家数(用于 maxHumanSeats)
}

/**
 * 认领席位(不可变)。
 * 规则:
 *   1. playerId 必须在 playerIds 里
 *   2. playerId 必须在 alivePlayerIds 里(死人不能占)
 *   3. 席位未被他人占(seat_taken)
 *   4. userId 尚未占任何席位(already_has_seat)
 *   5. 当前台账席位数 < maxHumanSeats(seats_full)
 *
 * 幂等:同一人重复认领自己的座位返回 ok 且台账不变。
 */
export function claimSeat(
  claims: SeatClaims,
  playerId: string,
  userId: string,
  ctx: SeatClaimCtx,
): { ok: boolean; reason?: SeatClaimReason; claims: SeatClaims } {
  if (!ctx.playerIds.includes(playerId)) {
    return { ok: false, reason: 'unknown_player', claims };
  }
  if (!ctx.alivePlayerIds.includes(playerId)) {
    return { ok: false, reason: 'dead_player', claims };
  }

  const holder = claims[playerId];
  if (holder === userId) {
    // 幂等重认领:不变
    return { ok: true, claims };
  }
  if (holder !== undefined) {
    return { ok: false, reason: 'seat_taken', claims };
  }

  // 用户是否已占其他席位
  const existingSeat = seatOfUser(claims, userId);
  if (existingSeat !== null) {
    return { ok: false, reason: 'already_has_seat', claims };
  }

  // 席位数量上限
  const currentCount = Object.keys(claims).length;
  if (currentCount >= maxHumanSeats(ctx.playerCount)) {
    return { ok: false, reason: 'seats_full', claims };
  }

  return { ok: true, claims: { ...claims, [playerId]: userId } };
}

/** 释放某用户占的所有席位(断线/主动退下用)。不可变。 */
export function releaseSeatsOfUser(claims: SeatClaims, userId: string): SeatClaims {
  const next: SeatClaims = {};
  for (const [pid, uid] of Object.entries(claims)) {
    if (uid !== userId) next[pid] = uid;
  }
  return next;
}

/** 查某用户当前占的席位 playerId(没有则 null)。 */
export function seatOfUser(claims: SeatClaims, userId: string): string | null {
  for (const [pid, uid] of Object.entries(claims)) {
    if (uid === userId) return pid;
  }
  return null;
}

/** 查某席位(playerId)的持有者 userId(没有则 null)。 */
export function holderOfSeat(claims: SeatClaims, playerId: string): string | null {
  return claims[playerId] ?? null;
}

/**
 * 生成广播用的「席位占用位图」(Record<playerId, true>)。
 * 绝不包含 userId — 客户端只需知道哪个 playerId 有真人，不需知道是谁。
 */
export function seatTakenMap(claims: SeatClaims): Record<string, true> {
  const map: Record<string, true> = {};
  for (const pid of Object.keys(claims)) {
    map[pid] = true;
  }
  return map;
}

// ── 超时常量 ────────────────────────────────────────────────────────────────

/** 讨论阶段等待真人发言的超时毫秒数。 */
export const HUMAN_SEAT_SPEECH_TIMEOUT_MS = 45_000;

/** 投票阶段等待真人投票的超时毫秒数。 */
export const HUMAN_SEAT_VOTE_TIMEOUT_MS = 30_000;

/** 席位发言的单条字符上限。 */
export const SEAT_SPEECH_MAX_LEN = 150;

/**
 * 清洗真人席位发言:trim + 连续空白压缩 + 截断 + 空串返回 null。
 * 复用 clean 逻辑,上限取 SEAT_SPEECH_MAX_LEN(比场边嘉宾稍长,鼠人要说话)。
 */
export function sanitizeSeatSpeech(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, SEAT_SPEECH_MAX_LEN);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * 校验真人席位投票目标。
 *
 * 引擎 generateVote 返回玩家 id 或 'skip';席位真人投票同样支持弃票('skip')。
 * 先校验:
 *   1. targetId 在 candidateIds 里 → ok + target
 *   2. targetId === 'skip' 且 allowSkip=true → ok + target='skip'
 *   3. 其他 → ok:false + reason
 */
export function validateSeatVote(
  targetId: string,
  candidateIds: string[],
  allowSkip: boolean,
): { ok: boolean; target?: string; reason?: 'invalid_target' | 'skip_not_allowed' } {
  if (candidateIds.includes(targetId)) {
    return { ok: true, target: targetId };
  }
  if (targetId === 'skip') {
    if (allowSkip) return { ok: true, target: 'skip' };
    return { ok: false, reason: 'skip_not_allowed' };
  }
  return { ok: false, reason: 'invalid_target' };
}
