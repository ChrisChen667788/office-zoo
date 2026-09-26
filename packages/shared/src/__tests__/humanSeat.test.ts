/**
 * v6.152 — 真人席位共享纯引擎回归:
 * maxHumanSeats / claimSeat / releaseSeatsOfUser / seatOfUser /
 * holderOfSeat / seatTakenMap / sanitizeSeatSpeech / validateSeatVote
 */
import { describe, it, expect } from 'vitest';
import {
  maxHumanSeats,
  claimSeat,
  releaseSeatsOfUser,
  seatOfUser,
  holderOfSeat,
  seatTakenMap,
  sanitizeSeatSpeech,
  validateSeatVote,
  HUMAN_SEAT_SPEECH_TIMEOUT_MS,
  HUMAN_SEAT_VOTE_TIMEOUT_MS,
  SEAT_SPEECH_MAX_LEN,
  type SeatClaims,
  type SeatClaimCtx,
} from '../human/seat';

// ── 辅助 ─────────────────────────────────────────────────────────────────────

const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const ALIVE   = [...PLAYERS];

function ctx(overrides?: Partial<SeatClaimCtx>): SeatClaimCtx {
  return {
    playerIds:      PLAYERS,
    alivePlayerIds: ALIVE,
    playerCount:    PLAYERS.length, // 8 → maxHumanSeats=2
    ...overrides,
  };
}

// ── maxHumanSeats ─────────────────────────────────────────────────────────────

describe('maxHumanSeats', () => {
  it('4 人 → 1', () => expect(maxHumanSeats(4)).toBe(1));
  it('6 人 → 2', () => expect(maxHumanSeats(6)).toBe(2));
  it('8 人 → 2', () => expect(maxHumanSeats(8)).toBe(2));
  it('9 人 → 3', () => expect(maxHumanSeats(9)).toBe(3));
  it('12 人 → 3', () => expect(maxHumanSeats(12)).toBe(3));
  it('100 人仍不超过 3', () => expect(maxHumanSeats(100)).toBe(3));
});

// ── claimSeat ─────────────────────────────────────────────────────────────────

describe('claimSeat', () => {
  it('空台账可认领', () => {
    const r = claimSeat({}, 'p1', 'u1', ctx());
    expect(r.ok).toBe(true);
    expect(r.claims['p1']).toBe('u1');
  });

  it('unknown_player:playerId 不在 playerIds 里', () => {
    const r = claimSeat({}, 'p99', 'u1', ctx());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unknown_player');
  });

  it('dead_player:playerId 不在 alivePlayerIds 里', () => {
    const r = claimSeat({}, 'p3', 'u1', ctx({ alivePlayerIds: ['p1', 'p2'] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('dead_player');
  });

  it('seat_taken:席位已被他人占', () => {
    const claims: SeatClaims = { p1: 'u1' };
    const r = claimSeat(claims, 'p1', 'u2', ctx());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('seat_taken');
  });

  it('already_has_seat:同一用户已占其他席位', () => {
    const claims: SeatClaims = { p1: 'u1' };
    const r = claimSeat(claims, 'p2', 'u1', ctx());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('already_has_seat');
  });

  it('seats_full:已达上限(8 人游戏上限 2)', () => {
    const claims: SeatClaims = { p1: 'u1', p2: 'u2' };
    const r = claimSeat(claims, 'p3', 'u3', ctx());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('seats_full');
  });

  it('幂等:同一用户重复认领自己的座位 ok 且台账不变', () => {
    const claims: SeatClaims = { p1: 'u1' };
    const r = claimSeat(claims, 'p1', 'u1', ctx());
    expect(r.ok).toBe(true);
    expect(r.claims).toEqual(claims);
  });

  it('不可变:返回新对象', () => {
    const claims: SeatClaims = {};
    const r = claimSeat(claims, 'p1', 'u1', ctx());
    expect(r.claims).not.toBe(claims);
  });
});

// ── releaseSeatsOfUser ────────────────────────────────────────────────────────

describe('releaseSeatsOfUser', () => {
  it('只释放该用户的席位', () => {
    const claims: SeatClaims = { p1: 'u1', p2: 'u2', p3: 'u1' };
    const result = releaseSeatsOfUser(claims, 'u1');
    expect(result).toEqual({ p2: 'u2' });
  });

  it('用户没有席位时台账不变', () => {
    const claims: SeatClaims = { p1: 'u1' };
    const result = releaseSeatsOfUser(claims, 'u99');
    expect(result).toEqual(claims);
  });
});

// ── seatOfUser / holderOfSeat ─────────────────────────────────────────────────

describe('seatOfUser', () => {
  it('返回 playerId;不存在返回 null', () => {
    const claims: SeatClaims = { p1: 'u1', p2: 'u2' };
    expect(seatOfUser(claims, 'u1')).toBe('p1');
    expect(seatOfUser(claims, 'u99')).toBeNull();
  });
});

describe('holderOfSeat', () => {
  it('返回 userId;不存在返回 null', () => {
    const claims: SeatClaims = { p1: 'u1' };
    expect(holderOfSeat(claims, 'p1')).toBe('u1');
    expect(holderOfSeat(claims, 'p99')).toBeNull();
  });
});

// ── seatTakenMap ─────────────────────────────────────────────────────────────

describe('seatTakenMap', () => {
  it('返回 Record<playerId, true>', () => {
    const claims: SeatClaims = { p1: 'u1', p2: 'u2' };
    const map = seatTakenMap(claims);
    expect(map).toEqual({ p1: true, p2: true });
  });

  it('广播 payload 里不包含 userId', () => {
    const claims: SeatClaims = { p1: 'u1', p3: 'u9999' };
    const map = seatTakenMap(claims);
    const values = Object.values(map);
    expect(values.every((v) => v === true)).toBe(true);
    // 确保没有 userId 字符串泄漏到 value 里
    expect(values).not.toContain('u1');
    expect(values).not.toContain('u9999');
  });

  it('空台账返回空对象', () => {
    expect(seatTakenMap({})).toEqual({});
  });
});

// ── sanitizeSeatSpeech ────────────────────────────────────────────────────────

describe('sanitizeSeatSpeech', () => {
  it('正常文本原样返回', () => {
    expect(sanitizeSeatSpeech('我要投 Tony')).toBe('我要投 Tony');
  });

  it('trim + 空白压缩', () => {
    expect(sanitizeSeatSpeech('  hello   world  ')).toBe('hello world');
  });

  it('截断到 SEAT_SPEECH_MAX_LEN', () => {
    const long = '啊'.repeat(200);
    const result = sanitizeSeatSpeech(long);
    expect(result).toHaveLength(SEAT_SPEECH_MAX_LEN);
  });

  it('空串返回 null', () => {
    expect(sanitizeSeatSpeech('')).toBeNull();
    expect(sanitizeSeatSpeech('   ')).toBeNull();
  });
});

// ── validateSeatVote ──────────────────────────────────────────────────────────

describe('validateSeatVote', () => {
  const candidates = ['p1', 'p2', 'p3'];

  it('合法目标返回 ok + target', () => {
    const r = validateSeatVote('p1', candidates, false);
    expect(r.ok).toBe(true);
    expect(r.target).toBe('p1');
  });

  it('弃票 allowSkip=true 返回 ok', () => {
    const r = validateSeatVote('skip', candidates, true);
    expect(r.ok).toBe(true);
    expect(r.target).toBe('skip');
  });

  it('弃票 allowSkip=false 拒绝', () => {
    const r = validateSeatVote('skip', candidates, false);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('skip_not_allowed');
  });

  it('非法目标拒绝', () => {
    const r = validateSeatVote('p99', candidates, true);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_target');
  });
});

// ── 常量 sanity ───────────────────────────────────────────────────────────────

describe('常量', () => {
  it('超时常量合理', () => {
    expect(HUMAN_SEAT_SPEECH_TIMEOUT_MS).toBe(45_000);
    expect(HUMAN_SEAT_VOTE_TIMEOUT_MS).toBe(30_000);
  });

  it('SEAT_SPEECH_MAX_LEN 合理(比场边嘉宾 120 稍大)', () => {
    expect(SEAT_SPEECH_MAX_LEN).toBe(150);
  });
});
