/**
 * characters.ts — v6.8 character IP layer for the 12-name AI rat pool.
 *
 * GameEngine picks names from a fixed pool of 12 English first names
 * (Tony, Lisa, Kevin, Amy, David, Frank, Grace, Helen, Jack, Mike, Ruby,
 * Oscar). Until v6.8 those were just labels — every Tony felt the same
 * as every Lisa, and users had no reason to "follow" a character across
 * games.
 *
 * This module pins a fixed **epithet + 3 catchphrases + 1-line backstory**
 * per name, so that:
 *   1. "Excel 永动机 Tony" reads as a recurring IP (the user remembers him)
 *   2. The per-game randomly-assigned `personality` (workaholic / introvert
 *      / etc. — see types/personality.ts) creates a **反差萌** layer when
 *      Tony's epithet ("Excel 永动机") meets a personality that contradicts
 *      it ("这局是 🐢 社恐") — that mismatch is the joke
 *   3. PersonaCard popover (client) reads from this module + the per-game
 *      personality from PlayerState to render the IP + 本局 combo
 *
 * Stats (累计上桌 / 胜率 / 被裁次数) are NOT in this static module —
 * they live in characterStatsStore (server, JSON-file persistence, keyed
 * by character name). PersonaCard renders "战绩同步中..." until that
 * store is wired in v6.8.1+.
 *
 * Add a new name? Add it here AND to the engine's NAMES pool in
 * GameEngine.ts. Removing a name is fine — PersonaCard falls back to
 * showing "本鼠人暂未入档" if the engine ships a name we don't know.
 */

export interface CharacterCard {
  /** Canonical first name used by the engine (lookup key). */
  name: string;
  /** Title that goes in front of / after the name. Length kept short
   *  enough to fit on a 2-line popover header at 14px. */
  epithet: string;
  /** 1 emoji tied to the epithet (NOT the personality emoji — that comes
   *  from PERSONALITY_REGISTRY). Used in the PersonaCard header. */
  emoji: string;
  /** 3 short catchphrases (≤ 18 chars each) the character is known for.
   *  Surfaced as chips on the card; future v6.9 may also feed these into
   *  the LLM system prompt to flavour speech generation. */
  catchphrases: [string, string, string];
  /** 1-line backstory in plain Chinese, ≤ 30 chars. Shown small under
   *  the catchphrases. */
  backstory: string;
}

/**
 * The roster. Order doesn't matter for runtime (the engine picks by
 * shuffling the NAMES pool), but kept rough archetype-grouped here for
 * readability: 卷王组 / 油条组 / 表演组 / 摸鱼组.
 */
export const CHARACTERS: Record<string, CharacterCard> = {
  // ── 卷王组 ────────────────────────────────────────────
  Tony: {
    name: 'Tony',
    epithet: 'Excel 永动机',
    emoji: '⚙️',
    catchphrases: ['我刚改了第 18 版', '今晚通宵不?', '先把这个 task 闭环'],
    backstory: '工龄 7 年, 凌晨 3 点的灯永远是他工位的',
  },
  Frank: {
    name: 'Frank',
    epithet: '周末加班训练营营长',
    emoji: '🏋️',
    catchphrases: ['周末加个班吧', '年轻人不该早睡', '我 996 我光荣'],
    backstory: '38 岁中年男, 信奉"奋斗者协议"',
  },
  Grace: {
    name: 'Grace',
    epithet: '对齐颗粒度魔人',
    emoji: '📐',
    catchphrases: ['这两个像素没对齐', '颗粒度再细一点', '间距给我看下'],
    backstory: 'PPT 设计 6 年, 改对齐能改一整晚',
  },

  // ── 油条组 ────────────────────────────────────────────
  Kevin: {
    name: 'Kevin',
    epithet: '复制粘贴狙击手',
    emoji: '📋',
    catchphrases: ['去年这个时候我们...', '老模板拿来', '改个标题就能用'],
    backstory: '产品经理 5 年, 周报永远是去年的',
  },
  Helen: {
    name: 'Helen',
    epithet: '灰度发布之神',
    emoji: '🌫️',
    catchphrases: ['先灰度 1% 试试', '小范围验证一下', '不然不可控'],
    backstory: '技术 PM, 万事先灰度, 永远没全量',
  },
  Mike: {
    name: 'Mike',
    epithet: 'OKR 折叠刀',
    emoji: '🗂️',
    catchphrases: ['这个能 carry 哪个 O', '拆得太细了', '今年只看 P0'],
    backstory: 'OKR 撰写大师, 0 也能折成 0.7',
  },

  // ── 表演组 ────────────────────────────────────────────
  Jack: {
    name: 'Jack',
    epithet: '汇报话术工程师',
    emoji: '🎤',
    catchphrases: ['这是为了质量', '我们交付了认知', '本质上是双赢'],
    backstory: '能把"延期 2 周"讲成"主动优化"',
  },
  Oscar: {
    name: 'Oscar',
    epithet: '向上管理课代表',
    emoji: '👔',
    catchphrases: ['老板昨天单独跟我说', '我去同步老板', '老板的意思是...'],
    backstory: '跟老板单聊次数比跟同事多',
  },
  David: {
    name: 'David',
    epithet: '云会议背景大师',
    emoji: '📹',
    catchphrases: ['信号不太好', '镜头打不开', '我先听着'],
    backstory: '入职 3 年, 没人见过他真脸',
  },

  // ── 摸鱼 / 情报组 ────────────────────────────────────
  Amy: {
    name: 'Amy',
    epithet: '茶水间情报站长',
    emoji: '☕',
    catchphrases: ['你听说了吗', '我跟你讲一个事', '别说是我说的啊'],
    backstory: '全公司动向都在她脑里, HR 不如她',
  },
  Lisa: {
    name: 'Lisa',
    epithet: 'Outlook 杀手',
    emoji: '✉️',
    catchphrases: ['麻烦 reply-all', '抄送你领导', '邮件留痕'],
    backstory: '一封邮件 cc 12 个人, 把锅甩出去',
  },
  Ruby: {
    name: 'Ruby',
    epithet: '钉钉小红点终结者',
    emoji: '🔴',
    catchphrases: ['收到', '收到收到', '+1'],
    backstory: '永远 inbox 0, 永远不进群讨论',
  },
};

/**
 * Lookup helper — returns null if the name isn't in the roster (engine
 * shipped a name we don't know about). Callers should render a fallback
 * card ("本鼠人暂未入档") rather than crashing.
 */
export function findCharacter(name: string): CharacterCard | null {
  return CHARACTERS[name] ?? null;
}

/** All names in the roster, in display-friendly order (matches CHARACTERS
 *  object insertion order — 卷王 → 油条 → 表演 → 摸鱼). */
export const ALL_CHARACTER_NAMES: string[] = Object.keys(CHARACTERS);
