/**
 * firedProgress — persistent "闯关" progression for 裁了么 mode.
 *
 * Separate from `firedStore` (which is per-session conversation state) because
 * progression must survive page refreshes and tab closes. Backed by
 * localStorage instead of sessionStorage for that reason.
 *
 * Data model:
 *   - `unlockedLevels`: which level numbers the player has access to. Always
 *     contains `1` (new players start at level 1). Subsequent levels get
 *     pushed in by `awardLevel` after the player wins the prior level.
 *   - `stars`: 0-3 stars per level. 0 = locked / unbeaten, 1-3 = beaten with
 *     that many stars (best ever). Re-playing keeps the highest score.
 *   - `lastClearedLevel`: convenience pointer for the resume-from button.
 *
 * Star rules (computed in awardLevel from outcome.compensationMonths):
 *   - 1 ⭐  any compensation > 0
 *   - 2 ⭐  compensation >= 1 month   (matches N legal floor)
 *   - 3 ⭐  compensation >= maxPossible × 0.8  (perfect / near-perfect)
 *
 * Why a separate file: keeps the per-session `firedStore` small and lets
 * us iterate progression rules independently without invalidating in-flight
 * conversation state.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Level definitions — 5 progressive chapters that map to existing scenarios +
// HR personalities. Edit this list to retune difficulty curve; level numbers
// are used as the persistence key so reordering breaks save data.
// ---------------------------------------------------------------------------
export interface FiredLevel {
  level: number;
  title: string;
  subtitle: string;
  /** Scenario id from `@furball/shared` SCENARIOS */
  scenarioId: string;
  /** HR personality difficulty */
  personalityId: 'rookie' | 'veteran' | 'demon';
  /** One-line legal article cited as the "lesson" of this level */
  legalLesson: string;
  /** Unicode badge shown on the level card. Replaceable by AI icon later. */
  badge: string;
  /** Tailwind/CSS color stop for active card accent */
  accent: string;
}

export const FIRED_LEVELS: FiredLevel[] = [
  {
    level: 1,
    title: '新手村 · 试用期暗坑',
    subtitle: '入职第 7 天突然说不合格 —— 试用期就能随便裁?',
    scenarioId: 'probation-fire',
    personalityId: 'rookie',
    legalLesson: '《劳动合同法》第 21 条:试用期辞退必须证明"不符合录用条件",否则视为违法解除。',
    badge: '🌱',
    accent: '#6ee7b7',
  },
  {
    level: 2,
    title: '常见套路 · 口头辞退',
    subtitle: 'HR 找你聊天暗示"可以走人了",不给书面通知 —— 别上当。',
    scenarioId: 'verbal-fire-no-paper',
    personalityId: 'rookie',
    legalLesson: '《劳动合同法》第 50 条:解除劳动合同必须出具书面通知,否则视为违法。',
    badge: '🎯',
    accent: '#4c9eff',
  },
  {
    level: 3,
    title: '中级博弈 · 调岗逼离',
    subtitle: '从 P7 调到前台,薪资砍半 —— 老 HR 想逼你主动写辞职信。',
    scenarioId: 'forced-transfer-resign',
    personalityId: 'veteran',
    legalLesson: '《劳动合同法》第 35 条:变更劳动合同必须经双方协商一致,单方面调岗降薪是违法的。',
    badge: '⚖️',
    accent: '#a855f7',
  },
  {
    level: 4,
    title: '高难陷阱 · 孕期被裁',
    subtitle: '怀孕第 4 个月被通知"岗位取消" —— HR 拿"组织优化"挡你。',
    scenarioId: 'pregnancy-fire',
    personalityId: 'veteran',
    legalLesson: '《劳动合同法》第 42 条:孕期、产期、哺乳期女职工受法律特别保护,不得解除。',
    badge: '👶',
    accent: '#ff6b9d',
  },
  {
    level: 5,
    title: 'BOSS 战 · 经济性裁员',
    subtitle: '公司业务调整一刀切,30% 裁员 —— 必须走法定程序,缺一不可。',
    scenarioId: 'mass-layoff-illegal',
    personalityId: 'demon',
    legalLesson: '《劳动合同法》第 41 条:经济性裁员必须提前 30 天向工会说明情况、报劳动行政部门、且优先留用 4 类人员。',
    badge: '👹',
    accent: '#ff3355',
  },
];

// ---------------------------------------------------------------------------
// v0.9.0 — UGC pack progress. Independent of the chapter `stars` map.
// Tracks per-(packId, slotIndex) clear state so the FiredPack view can
// render a sequential unlock cascade.
// ---------------------------------------------------------------------------

/** Per-slot completion record. `ratio` is compensationMonths / maxPossible
 *  so the UI can render a 1-3 star bar without consulting the level def. */
export interface PackSlotProgress {
  ts: number;
  ratio: number;
  outcome: 'win' | 'partial' | 'lose';
}

/** Per-pack state — slotIndex (0-4) → progress record. Slot 0 is always
 *  unlocked; slot N+1 unlocks when slot N has any non-lose progress
 *  recorded, mirroring the chapter unlock rule. */
export interface PackProgress {
  /** sparse: slotIndex → progress. Missing entries = unplayed/unbeaten. */
  cleared: Record<number, PackSlotProgress>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
interface FiredProgressStore {
  unlockedLevels: number[];
  stars: Record<number, 0 | 1 | 2 | 3>;
  lastClearedLevel: number;

  /** v0.9.0 — per-pack progress, keyed by packId. */
  packProgress: Record<string, PackProgress>;

  // Actions
  /** Compute stars from an outcome, persist them, and unlock the next level. */
  awardLevel: (
    level: number,
    outcome: { compensationMonths: number; maxPossible: number } | null,
  ) => void;
  /** v0.9.0 — record a pack-slot completion. Called from FiredResult after
   *  a pack-launched round wins or partial-wins. Lose outcomes are NOT
   *  recorded so the slot stays available to retry. */
  recordPackSlot: (
    packId: string,
    slotIndex: number,
    outcome: { compensationMonths: number; maxPossible: number } | null,
  ) => void;
  /** Reset all progress — exposed for a "重新开始" debug button. */
  resetProgress: () => void;
}

const STORAGE_KEY = 'office-zoo.fired-progress';

function computeStars(
  outcome: { compensationMonths: number; maxPossible: number } | null,
): 0 | 1 | 2 | 3 {
  if (!outcome) return 0;
  const { compensationMonths, maxPossible } = outcome;
  if (compensationMonths <= 0) return 0;
  // Perfection threshold = 80% of max — leaves room for "good but not perfect".
  if (maxPossible > 0 && compensationMonths >= maxPossible * 0.8) return 3;
  if (compensationMonths >= 1) return 2;
  return 1;
}

export const useFiredProgress = create<FiredProgressStore>()(
  persist(
    (set) => ({
      unlockedLevels: [1],
      stars: {},
      lastClearedLevel: 0,
      packProgress: {},

      recordPackSlot: (packId, slotIndex, outcome) => {
        if (!outcome || outcome.maxPossible <= 0) return;
        const ratio = Math.max(0, Math.min(1, outcome.compensationMonths / outcome.maxPossible));
        const result: 'win' | 'partial' | 'lose' =
          ratio >= 0.8 ? 'win'
        : ratio >= 0.4 ? 'partial'
        :                'lose';
        // Lose → don't record; player can retry without losing the
        // unlock-chain integrity (slot stays "next to clear").
        if (result === 'lose') return;
        set((s) => {
          const prev = s.packProgress[packId] ?? { cleared: {} };
          // Best-of: keep the higher ratio if the same slot was already cleared.
          const existing = prev.cleared[slotIndex];
          if (existing && existing.ratio >= ratio) return s;
          return {
            packProgress: {
              ...s.packProgress,
              [packId]: {
                cleared: {
                  ...prev.cleared,
                  [slotIndex]: { ts: Date.now(), ratio, outcome: result },
                },
              },
            },
          };
        });
      },

      awardLevel: (level, outcome) => {
        const earned = computeStars(outcome);
        if (earned === 0) return; // didn't beat it — no progression
        set((s) => {
          const prevStars = (s.stars[level] ?? 0) as 0 | 1 | 2 | 3;
          const stars = { ...s.stars, [level]: Math.max(prevStars, earned) as 0 | 1 | 2 | 3 };
          // Unlock the next level if it exists.
          const next = level + 1;
          const unlocked = (next <= FIRED_LEVELS.length && !s.unlockedLevels.includes(next))
            ? [...s.unlockedLevels, next]
            : s.unlockedLevels;
          return {
            stars,
            unlockedLevels: unlocked,
            lastClearedLevel: Math.max(s.lastClearedLevel, level),
          };
        });
      },

      resetProgress: () => set({
        unlockedLevels: [1],
        stars: {},
        lastClearedLevel: 0,
        packProgress: {},
      }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors / helpers
// ---------------------------------------------------------------------------

/** Total stars across all levels — used for the "我的成就" header chip. */
export function totalStars(stars: Record<number, number>): number {
  return Object.values(stars).reduce((a, b) => a + b, 0);
}

/** Convenience: get the level definition by number. */
export function getLevel(n: number): FiredLevel | undefined {
  return FIRED_LEVELS.find((l) => l.level === n);
}
