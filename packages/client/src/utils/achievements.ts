/**
 * achievements — v6.30 P4. Lightweight spectator achievement system.
 *
 * 12 hand-curated achievements covering the main PSYWAR / spectator /
 * anniversary surfaces. Pure client-side (anonymous-friendly), reads
 * leakStats + its own progress counters from localStorage.
 *
 * Public API:
 *   ACHIEVEMENTS       — readonly registry
 *   getUnlocked()      — Set<id> already unlocked this device
 *   isUnlocked(id)
 *   tryUnlock(id)      — idempotent; returns true if NEWLY unlocked +
 *                        dispatches CustomEvent('achievement:unlocked')
 *   bumpProgress(key, by=1) — for counter-driven achievements
 *   getProgress(key)
 *   onAchievementUnlocked(cb) — subscribe; returns unsub
 *
 * Storage:
 *   office-zoo.achievements.v1 = { unlocked: string[], progress: {key:number} }
 */
import { getLeakStats } from './leakStats';

const KEY = 'office-zoo.achievements.v1';

export interface Achievement {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  /** Auto-check predicate. If provided, achievements.refreshAuto() will
   *  evaluate it against current localStorage state and unlock if true.
   *  For threshold achievements: returns true when the relevant counter
   *  (leakStats.submitted, progress[key], etc.) crosses the bar. */
  check?: () => boolean;
}

interface Stored {
  unlocked: string[];
  progress: Record<string, number>;
}

/** ── Registry — order matters: rendered top-to-bottom in panel ─── */
export const ACHIEVEMENTS: Achievement[] = [
  // PSYWAR (4)
  {
    id: 'leak_first', emoji: '👻', label: '第一次匿名爆料',
    desc: '在 Classic 鬼魂群里成功投递第 1 条战术 @ 消息.',
    check: () => getLeakStats().submitted >= 1,
  },
  {
    id: 'leak_5', emoji: '💢', label: '心理战熟手 · 5 条',
    desc: '提交 5 条战术 @ 爆料. 你开始相信 AI 在听你的.',
    check: () => getLeakStats().submitted >= 5,
  },
  {
    id: 'quote_first', emoji: '✨', label: 'AI 真的引用了你',
    desc: 'AI 在 speech 里第一次引用你的爆料 (金色 ✨ chip 解锁).',
    check: () => getLeakStats().quoted >= 1,
  },
  {
    id: 'quote_3', emoji: '🎯', label: '操盘手 · 3 条命中',
    desc: 'AI 引用你 3 条爆料. 你已经在指挥这局了.',
    check: () => getLeakStats().quoted >= 3,
  },

  // Spectator (3)
  {
    id: 'classic_first', emoji: '🏢', label: '看完第一局 Classic',
    desc: '观战 Classic 模式从 lobby 到 game_over 完整一局.',
    check: () => getProgress('classic_finished') >= 1,
  },
  {
    id: 'talkshow_5', emoji: '🎤', label: '听完 5 段班味单口',
    desc: '在 /talkshow 页面播放完 5 段 AI 段子 (累计).',
    check: () => getProgress('talkshow_played') >= 5,
  },
  {
    id: 'rules_seen', emoji: '📖', label: '入门完成',
    desc: '看完 RulesModal 三步引导 (或主动跳过).',
    check: () => {
      try { return localStorage.getItem('office-zoo.seen-rules') === '1'; }
      catch { return false; }
    },
  },

  // Brand / IP (3)
  {
    id: 'anniversary_visited', emoji: '🎉', label: '走完周年回顾',
    desc: '在 /anniversary 翻完 6 个里程碑 deck.',
    check: () => getProgress('anniversary_finished') >= 1,
  },
  {
    id: 'duel_first', emoji: '⚔️', label: '第一次斗投',
    desc: '在 /duel/new 创建或加入一场 1v1 投票 duel.',
    check: () => getProgress('duel_participated') >= 1,
  },
  {
    id: 'profile_visit', emoji: '👤', label: '看过自己的 Profile',
    desc: '打开 /profile/me 看看自己的"班味卡".',
    check: () => getProgress('profile_visited') >= 1,
  },

  // Meta (2)
  {
    id: 'three_day_streak', emoji: '🔥', label: '连续 3 天回归',
    desc: '3 个不同日期打开过任何路由.',
    check: () => getProgress('distinct_days') >= 3,
  },
  {
    id: 'completionist', emoji: '🏆', label: '集邮党',
    desc: '解锁其他 11 个 achievements.',
    // Self-referential — checked after every refreshAuto pass.
    check: () => getUnlocked().size >= 11,
  },
];

/* ── Storage helpers ─────────────────────────────────────────────── */

function read(): Stored {
  if (typeof localStorage === 'undefined') return { unlocked: [], progress: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { unlocked: [], progress: {} };
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
      progress: parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
    };
  } catch { return { unlocked: [], progress: {} }; }
}

function write(s: Stored): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ }
}

/* ── Public API ─────────────────────────────────────────────────── */

export function getUnlocked(): Set<string> {
  return new Set(read().unlocked);
}

export function isUnlocked(id: string): boolean {
  return read().unlocked.includes(id);
}

export function getProgress(key: string): number {
  return read().progress[key] ?? 0;
}

export function bumpProgress(key: string, by = 1): void {
  const s = read();
  s.progress[key] = (s.progress[key] ?? 0) + by;
  write(s);
  refreshAuto();
}

/** Set progress to an absolute value (idempotent, useful for "saw the
 *  page today" gates where we don't want repeat-bumps). */
export function setProgress(key: string, value: number): void {
  const s = read();
  if ((s.progress[key] ?? 0) >= value) return;
  s.progress[key] = value;
  write(s);
  refreshAuto();
}

/** Mark today as visited (for `distinct_days` streak). Idempotent
 *  per UTC date. */
export function markDayVisited(): void {
  const today = new Date().toISOString().slice(0, 10);
  const s = read();
  const seen: string[] = s.progress.__visit_days_arr
    ? (JSON.parse(localStorage.getItem('office-zoo.achievements.dates') || '[]') as string[])
    : [];
  if (!seen.includes(today)) {
    seen.push(today);
    if (seen.length > 30) seen.shift();
    try { localStorage.setItem('office-zoo.achievements.dates', JSON.stringify(seen)); }
    catch { /* quota */ }
    s.progress.distinct_days = seen.length;
    write(s);
    refreshAuto();
  }
}

/** Try to unlock a single id. Returns true if newly unlocked. */
export function tryUnlock(id: string): boolean {
  const s = read();
  if (s.unlocked.includes(id)) return false;
  s.unlocked.push(id);
  write(s);
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('achievement:unlocked', { detail: a }));
  }
  return true;
}

/** Evaluate every registered `check` predicate, unlock any that pass.
 *  Idempotent — already-unlocked entries are skipped. Returns newly
 *  unlocked ids in this pass (usually 0 or 1). */
export function refreshAuto(): string[] {
  const fresh: string[] = [];
  const unlocked = getUnlocked();
  for (const a of ACHIEVEMENTS) {
    if (unlocked.has(a.id)) continue;
    if (a.check && a.check()) {
      if (tryUnlock(a.id)) fresh.push(a.id);
    }
  }
  return fresh;
}

/** Subscribe to unlock events (CustomEvent on window). Returns unsub. */
export function onAchievementUnlocked(cb: (a: Achievement) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<Achievement>).detail);
  window.addEventListener('achievement:unlocked', handler);
  return () => window.removeEventListener('achievement:unlocked', handler);
}
