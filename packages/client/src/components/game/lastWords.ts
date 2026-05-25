/**
 * lastWords — v6.23 P4. Personality-driven 离别赠言 pool.
 *
 * Played at the bottom of the EliminationReveal card right after the
 * role tag, framed as "[姓名]:" in italic quote-style. Each personality
 * gets 3-4 lines that nail the 班味 archetype, so spectators recognize
 * "yeah that's exactly what a 社牛 / 卷王 / PUA-suffering / 暴躁哥 would
 * blurt right before HR walks them out".
 *
 * Pure client-side — no LLM cost, deterministic on (playerId, round) so
 * the same elimination shows the same line if re-rendered.
 *
 * Last words feel different from danmaku ghost comments:
 *   - Danmaku  = "已离职" tone, after the dust settles.
 *   - Last words = "AT the moment of firing", more raw, more 戏剧.
 *
 * Pool is intentionally short (3 lines/personality) — too many becomes
 * noise and we lose the "yep that's so X" recognition.
 */

/** Pool of farewell lines keyed by personality id. Falls back to
 *  GENERIC_POOL when the personality is missing/unknown. */
export const LAST_WORDS_POOL: Record<string, string[]> = {
  social_butterfly: [
    '没事! 群里聊! 我建了个 "前同事互助会"!',
    '加我微信! 以后约饭! 真的!',
    '!! 一定要保持联系啊各位 !!',
  ],
  introvert: [
    '...嗯 那我先走了',
    '工位上还有一盆多肉, 麻烦帮我浇水',
    '...谢谢...没事',
  ],
  contrarian: [
    '我早不想干了 谁稀罕这破公司',
    'KPI 算法有 bug! 这投票根本不科学!!',
    '懂个屁 老子下家比这强 10 倍',
  ],
  sycophant: [
    '感谢公司给我成长机会! 感谢老板!',
    '是我没做好 老板别为难 真不怪您',
    '老板英明! 拥抱变化! 期待回来!',
  ],
  passive_aggressive: [
    '哦, 还好吧, 我也没想留',
    '嗯嗯, 你们继续, 加油哦, 别像我',
    '我? 开心啊, 挺好的, 反正没什么',
  ],
  hot_tempered: [
    '日 你 家 老 板!!',
    '欠的加班费明天就劳动仲裁!!',
    '老子早不想干了 这破班 谁爱上谁上',
  ],
  smooth_operator: [
    '行, 我配合, 各位都保重',
    '我也猜到是我, 桌上文件都整理好了',
    '老板的小心思我门清, 不多说',
  ],
  workaholic: [
    '我的 OKR 还差 12 个没填完, 谁接手?',
    '飞书云文档权限在 admin 那, 别忘了交接',
    '别忘了今天周报! 我离职前也会发完!',
  ],
};

const GENERIC_POOL = [
  '...拜了, 各位',
  '回家也挺好的 反正没什么',
  '行吧 我走 你们继续卷',
];

/* ── 新员工入职反衬池 ──────────────────────────────────────────────
 *
 * v6.23 P4. 紧接 elimination reveal 后, 短闪 2s "Welcome aboard, [名字]" —
 * 反衬讽刺: 公司前脚刚开了一个人, 后脚已经准备好下一个工具人. 名字
 * 池有意挑"新人感"重的搭配 — 实习生 / 校招生 / 外包名, 把"螺丝钉
 * 可替换性"的笑点拉满.
 */
export const NEW_HIRE_NAMES = [
  '实习生小郁',
  '应届生 Kevin',
  '外包同学张',
  '校招生 Sherry',
  '应届生 Tony',
  '实习生小慧',
  '外包同学陈',
  'OD 同学 Bob',
  '试用期 Linda',
  '校招生 Eric',
];

export const NEW_HIRE_TAGLINES = [
  '工位 0731 已就绪',
  '工号 #2025 已发放',
  '今天起就是这只鼠了',
  '继续 996, 文化不变',
  'KPI 已转移, 请准时打卡',
  '入职流程 5 分钟 - HR 飞快',
];

/* ── djb2 (deterministic hash) ─────────────────────────────────────── */
function djb2(s: string): number {
  let h = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); h >>>= 0; }
  return h;
}

/* ── Public API ───────────────────────────────────────────────────────── */

/** Pick a farewell line for the given personality + a seed (use the
 *  EliminationEvent id so re-renders give the same line). */
export function pickLastWords(personality: string | undefined, seed: number): string {
  const pool = (personality && LAST_WORDS_POOL[personality]) || GENERIC_POOL;
  const idx = djb2(`${personality || ''}|${seed}`) % pool.length;
  return pool[idx];
}

/** Pick a new-hire name + tagline pair for the comedic 反衬 frame. */
export function pickNewHire(seed: number): { name: string; tagline: string } {
  const nIdx = djb2(`name|${seed}`) % NEW_HIRE_NAMES.length;
  const tIdx = djb2(`tag|${seed}`) % NEW_HIRE_TAGLINES.length;
  return { name: NEW_HIRE_NAMES[nIdx], tagline: NEW_HIRE_TAGLINES[tIdx] };
}
