/**
 * data/reactions.ts — v6.67 — 「群众吐槽」表情包弹幕池(纯数据 + 纯取词)。
 *
 * 经典局事件流(EVENT LOG)里,除了「谁说了啥 / 谁被优化」这种播报,再插一条**吃瓜群众**
 * 的表情包吐槽 —— 有人被裁、被投票出局、被爆料时,弹一句带 emoji 的阴阳怪气,放大节目效果。
 * 纯函数按 seed 取词(用事件 id 当种子,保证同一事件不抖动)。
 */
export type ReactionKind = 'kill' | 'vote' | 'leak' | 'survive';

export interface Reaction {
  emoji: string;
  text: string;
}

export const REACTIONS: Record<ReactionKind, readonly Reaction[]> = {
  // 被资本"优化"(夜间下岗)
  kill: [
    { emoji: '🤡', text: '又一个 KPI 战士光荣下岗' },
    { emoji: '🪦', text: '工位还热乎着,人已经凉了' },
    { emoji: '📉', text: '昨天还在画饼,今天自己成了饼' },
    { emoji: '😶‍🌫️', text: 'HR 的刀,比食堂的汤还快' },
    { emoji: '🫡', text: '前浪死在沙滩上,后浪还在试用期' },
    { emoji: '☕', text: '咖啡续上了,合同没续上' },
    { emoji: '🧹', text: '优化优化,优着优着就没了' },
    { emoji: '💼', text: '纸箱已备好,祝您前程似锦(指找下家)' },
  ],
  // 被全员投票开除
  vote: [
    { emoji: '🗳️', text: '全票通过,毫无悬念,大快人心(并不)' },
    { emoji: '🔪', text: '同事的刀,捅得永远最准' },
    { emoji: '🤝', text: '握手言和?不,是握手送别' },
    { emoji: '🎭', text: '台上握手,台下投票,职场の温柔' },
    { emoji: '📊', text: '民意所向 = 老板想裁谁大家就投谁' },
    { emoji: '🫠', text: '昨天还一起摸鱼,今天就联手把我投了' },
    { emoji: '🐀', text: '老鼠开会,投出一只替罪鼠' },
  ],
  // 前同事爆料 / 引用被命中
  leak: [
    { emoji: '🍿', text: '这瓜保熟,前同事亲自递的' },
    { emoji: '👂', text: '隔墙有耳,隔工位也有' },
    { emoji: '📸', text: '聊天记录已截图,呈堂证供' },
    { emoji: '🔥', text: '爆料含金量拉满,建议加鸡腿' },
    { emoji: '🤐', text: '果然办公室没有秘密,只有还没传开的秘密' },
  ],
  // 侥幸活过一轮
  survive: [
    { emoji: '😮‍💨', text: '又苟过一轮,工位保卫战 +1' },
    { emoji: '🛡️', text: '不是我能打,是这轮没轮到我' },
    { emoji: '🙏', text: '感谢老板今天没看我的 OKR' },
  ],
};

/** 按 seed 从对应池里挑一条(纯;同 seed 同结果,避免重渲染抖动)。 */
export function pickReaction(kind: ReactionKind, seed: number): Reaction {
  const pool = REACTIONS[kind];
  if (!pool || pool.length === 0) return { emoji: '🐀', text: '……' };
  const idx = Math.abs(Math.floor(seed)) % pool.length;
  return pool[idx];
}

/** 组装成弹幕一行:`🤡 群众:又一个 KPI 战士光荣下岗`。 */
export function reactionLine(kind: ReactionKind, seed: number): string {
  const r = pickReaction(kind, seed);
  return `${r.emoji} 群众:${r.text}`;
}
