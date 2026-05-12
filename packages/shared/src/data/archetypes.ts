/**
 * archetypes — v1.3.0 "你是哪种打工人?" identity layer.
 *
 * 12 workplace archetypes that resonate with Chinese / Asian office
 * culture (most translate cleanly to English/JP/KR for the i18n launch).
 * Each archetype is a vector in 6-dimensional "trait space":
 *
 *   grind       — willingness to overwork (内卷度)
 *   snark       — passive-aggressive humor (阴阳怪气度)
 *   ambition    — career-climbing energy (上进心)
 *   empathy     — caring about coworkers (人情味)
 *   cynicism    — disillusionment with corporate (摆烂度)
 *   visibility  — desire to be seen (显眼度)
 *
 * The personality quiz (QUIZ_QUESTIONS) presents 8 questions, each with
 * 4 options that contribute weighted points to one or more traits. After
 * scoring, we cosine-match the user's vector against each archetype's
 * vector — best fit wins.
 *
 * The ARCHETYPE_PAIRS map encodes "天敌 / 搭子" relationships for the
 * profile card's social-graph callout: which archetype clashes most with
 * yours, which complements you best.
 */

export type TraitId =
  | 'grind' | 'snark' | 'ambition' | 'empathy' | 'cynicism' | 'visibility';

export type TraitVector = Record<TraitId, number>;

export interface Archetype {
  id: string;
  /** Hero glyph used on cards. Two emoji = primary + alt. */
  emoji: string;
  /** Display name in zh-CN. UI looks up i18n key for other locales. */
  name: string;
  /** Tight (≤ 4 char) version for compact UI. */
  shortName: string;
  /** Witty 1-line tagline. */
  tagline: string;
  /** Normalized trait vector (each dim 0-1). Used for cosine match. */
  traits: TraitVector;
  /** 3-color brand pair: gradient start / mid / end. Drives the
   *  shareable card's accent so each archetype reads instantly. */
  colors: { start: string; mid: string; end: string };
  /** 3-5 bullet character traits — fed into the LLM prompt that
   *  generates the user's personalized catchphrases + tagline. */
  characterNotes: string[];
  /** Which seed scenario / talkshow tag this archetype "shines in" — used
   *  for the card's "命中场景" recommendation row. */
  shineScenarioId: string;
  shineTalkshowTag: string;
}

const A = (n: TraitVector) => n; // type alias to keep declarations terse

export const ARCHETYPES: Archetype[] = [
  {
    id: 'grinder',
    emoji: '🔥',
    name: '卷王',
    shortName: '卷王',
    tagline: '别人在睡,我在卷;别人在卷,我也在卷',
    traits: A({ grind: 1.0, snark: 0.2, ambition: 0.95, empathy: 0.3, cynicism: 0.1, visibility: 0.7 }),
    colors: { start: '#ff3355', mid: '#ff8a4c', end: '#ffb84c' },
    characterNotes: [
      '日均工时 12+,周末半天回邮件',
      '主动揽下"老板都没让你做"的活',
      '看不起准点下班的同事但嘴上不说',
      'KPI 达成率永远 130%+',
    ],
    shineScenarioId: 'last-place-elimination',
    shineTalkshowTag: 'overtime',
  },
  {
    id: 'slacker',
    emoji: '🛋️',
    name: '摸鱼大师',
    shortName: '摸鱼',
    tagline: '工作三件事:看群、刷淘宝、装在认真',
    traits: A({ grind: 0.1, snark: 0.4, ambition: 0.15, empathy: 0.5, cynicism: 0.7, visibility: 0.2 }),
    colors: { start: '#6ee7b7', mid: '#4c9eff', end: '#7c3aed' },
    characterNotes: [
      'Slack 状态永远 active,实际在淘宝',
      '会用大屏摆 IDE,小屏看综艺',
      '从不主动接活,但被分配也不拒',
      '准点下班,5:30 已经在地铁上',
    ],
    shineScenarioId: 'fake-performance',
    shineTalkshowTag: 'slacking',
  },
  {
    id: 'sass-master',
    emoji: '🌀',
    name: '阴阳怪气王',
    shortName: '阴阳',
    tagline: '"哦,这样啊。挺好的。"(背后白眼翻到天灵盖)',
    traits: A({ grind: 0.4, snark: 1.0, ambition: 0.4, empathy: 0.3, cynicism: 0.85, visibility: 0.6 }),
    colors: { start: '#a855f7', mid: '#ec4899', end: '#f97316' },
    characterNotes: [
      '"收到"是最长的回复',
      '群里发"挺好的"+ 微笑表情 = 想骂街',
      '会议从不开 mic 但弹幕笑话最毒',
      '能用一句话噎死整桌人',
    ],
    shineScenarioId: 'verbal-fire-no-paper',
    shineTalkshowTag: 'meta',
  },
  {
    id: 'pleaser',
    emoji: '🥺',
    name: '老好人',
    shortName: '好人',
    tagline: '帮你帮你帮你,然后凌晨 2 点哭',
    traits: A({ grind: 0.7, snark: 0.05, ambition: 0.3, empathy: 1.0, cynicism: 0.2, visibility: 0.3 }),
    colors: { start: '#fbbf24', mid: '#f87171', end: '#ec4899' },
    characterNotes: [
      '从不说"不",哪怕已经爆肝',
      '同事生日蛋糕都是你买',
      '被甩锅也只会自己扛',
      '心累程度 SS,但表面笑得灿烂',
    ],
    shineScenarioId: 'forced-transfer-resign',
    shineTalkshowTag: 'meta',
  },
  {
    id: 'nihilist',
    emoji: '😶',
    name: '厌世派',
    shortName: '厌世',
    tagline: '"行,你说咋办就咋办",反正都一样',
    traits: A({ grind: 0.3, snark: 0.5, ambition: 0.05, empathy: 0.4, cynicism: 1.0, visibility: 0.1 }),
    colors: { start: '#475569', mid: '#7c3aed', end: '#1e293b' },
    characterNotes: [
      '会议从不发言,问到就"都行"',
      '看穿一切但懒得拆穿',
      '工作中等,薪水中等,情绪也中等',
      '"反正最后都是一样"是口头禅',
    ],
    shineScenarioId: 'org-optimization',
    shineTalkshowTag: 'meta',
  },
  {
    id: 'show-pony',
    emoji: '✨',
    name: '显眼包',
    shortName: '显眼',
    tagline: '团建第一个开麦,周报第一个发,生日第一个庆',
    traits: A({ grind: 0.6, snark: 0.5, ambition: 0.7, empathy: 0.6, cynicism: 0.2, visibility: 1.0 }),
    colors: { start: '#ec4899', mid: '#fbbf24', end: '#4c9eff' },
    characterNotes: [
      '群消息 90% 是表情包',
      '每次开会都要"加个 emoji",每次发周报都要带 GIF',
      '团建是 KOL,讲段子能带动全场',
      '工作能力其实不差,只是包装感太强',
    ],
    shineScenarioId: 'fake-performance',
    shineTalkshowTag: 'meta',
  },
  {
    id: 'anti-grinder',
    emoji: '🚪',
    name: '反卷青年',
    shortName: '反卷',
    tagline: '"我下班了哈" + 头也不回',
    traits: A({ grind: 0.1, snark: 0.7, ambition: 0.3, empathy: 0.5, cynicism: 0.7, visibility: 0.6 }),
    colors: { start: '#06b6d4', mid: '#7c3aed', end: '#ec4899' },
    characterNotes: [
      '准点 6 点关电脑,头也不回走人',
      '群里@也不接,周末手机调勿扰',
      '会主动跟同事普及《劳动法》',
      '把"卷"和"努力"说得是两件事',
    ],
    shineScenarioId: 'amazon-rto',
    shineTalkshowTag: 'overtime',
  },
  {
    id: 'drama-queen',
    emoji: '🎭',
    name: '戏精',
    shortName: '戏精',
    tagline: '每次开会都演一集《甄嬛传》',
    traits: A({ grind: 0.5, snark: 0.85, ambition: 0.55, empathy: 0.4, cynicism: 0.5, visibility: 0.9 }),
    colors: { start: '#f97316', mid: '#a855f7', end: '#06b6d4' },
    characterNotes: [
      '会议 5 分钟讲事,55 分钟演戏',
      '同事吵架第一时间冲到现场吃瓜',
      '能把"我要喝水"说出三层戏剧张力',
      '真本事其实可以,但戏太足 distract 大家',
    ],
    shineScenarioId: 'pregnancy-exit-strategy',
    shineTalkshowTag: 'pua',
  },
  {
    id: 'iron-maiden',
    emoji: '⚔️',
    name: '拼命三娘',
    shortName: '拼命',
    tagline: '我能行,你也能行,我们一起拼',
    traits: A({ grind: 0.95, snark: 0.1, ambition: 0.85, empathy: 0.55, cynicism: 0.05, visibility: 0.7 }),
    colors: { start: '#dc2626', mid: '#fbbf24', end: '#22c55e' },
    characterNotes: [
      '相信努力一定有回报',
      '会主动 mentor 新人到天黑',
      '过年都在改 deck',
      '"拼一下"是真的拼,不是话术',
    ],
    shineScenarioId: 'org-optimization',
    shineTalkshowTag: 'kpi',
  },
  {
    id: 'veteran',
    emoji: '🦊',
    name: '老油条',
    shortName: '油条',
    tagline: '"这事 5 年前就这么干过了"',
    traits: A({ grind: 0.4, snark: 0.6, ambition: 0.3, empathy: 0.6, cynicism: 0.7, visibility: 0.4 }),
    colors: { start: '#854d0e', mid: '#dc2626', end: '#7c3aed' },
    characterNotes: [
      '在公司 5 年+,知道每个人的底',
      '不卷但 KPI 永远过',
      '会抢先把简单的活干完',
      '关键时刻"我帮你说几句"很管用',
    ],
    shineScenarioId: 'verbal-fire-no-paper',
    shineTalkshowTag: 'jargon',
  },
  {
    id: 'deck-wizard',
    emoji: '📊',
    name: 'PPT 王者',
    shortName: 'PPT',
    tagline: '工作不在乎做了什么,在乎 PPT 怎么写',
    traits: A({ grind: 0.65, snark: 0.45, ambition: 0.85, empathy: 0.3, cynicism: 0.55, visibility: 0.85 }),
    colors: { start: '#0ea5e9', mid: '#7c3aed', end: '#fbbf24' },
    characterNotes: [
      '能把 3 页内容做成 30 页 PPT',
      '"沉淀方法论"是日常',
      '会用"颗粒度""底层逻辑""抓手"等黑话',
      '述职报告 PPT 比代码多',
    ],
    shineScenarioId: 'fake-performance',
    shineTalkshowTag: 'jargon',
  },
  {
    id: 'ghost',
    emoji: '👻',
    name: '隐形人',
    shortName: '隐形',
    tagline: '一个季度发言一次,通常是说"在的"',
    traits: A({ grind: 0.5, snark: 0.2, ambition: 0.15, empathy: 0.4, cynicism: 0.55, visibility: 0.05 }),
    colors: { start: '#64748b', mid: '#1e293b', end: '#0f172a' },
    characterNotes: [
      '群消息从不主动发,@到才回"在"',
      '工位永远没人,但工作其实做完了',
      '团建大概率请假',
      '存在感低到 boss 偶尔忘了你的名字',
    ],
    shineScenarioId: 'org-optimization',
    shineTalkshowTag: 'slacking',
  },
];

// ────────────────────────────────────────────────────────────────────
// Pair relationships — drives the "天敌 / 搭子" callout on the card.
// Hand-picked because cosine-distance gives counter-intuitive matches
// (e.g. "kindred spirit by trait" ≠ "actually a good office friend").
// ────────────────────────────────────────────────────────────────────
export const ARCHETYPE_PAIRS: Record<string, { rival: string; bestie: string }> = {
  grinder:      { rival: 'anti-grinder', bestie: 'iron-maiden' },
  slacker:      { rival: 'iron-maiden',  bestie: 'nihilist' },
  'sass-master':{ rival: 'pleaser',      bestie: 'drama-queen' },
  pleaser:      { rival: 'sass-master',  bestie: 'iron-maiden' },
  nihilist:     { rival: 'iron-maiden',  bestie: 'veteran' },
  'show-pony':  { rival: 'ghost',        bestie: 'drama-queen' },
  'anti-grinder':{rival: 'grinder',      bestie: 'sass-master' },
  'drama-queen':{ rival: 'ghost',        bestie: 'show-pony' },
  'iron-maiden':{ rival: 'slacker',      bestie: 'grinder' },
  veteran:      { rival: 'deck-wizard',  bestie: 'sass-master' },
  'deck-wizard':{ rival: 'veteran',      bestie: 'show-pony' },
  ghost:        { rival: 'show-pony',    bestie: 'slacker' },
};

// ────────────────────────────────────────────────────────────────────
// Quiz questions — 8 questions, 4 answers each, each answer adds
// weighted trait points. Tone is intentionally absurdist + Z-gen.
// ────────────────────────────────────────────────────────────────────

export interface QuizAnswer {
  /** Single-line answer text. */
  text: string;
  /** Per-trait point delta. Negative = you're definitely NOT this. */
  delta: Partial<TraitVector>;
}
export interface QuizQuestion {
  id: string;
  /** Setup line — what just happened. */
  prompt: string;
  /** 4 options. Order matters for stable UI position; map to traits. */
  answers: [QuizAnswer, QuizAnswer, QuizAnswer, QuizAnswer];
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q-friday-meeting',
    prompt: '周五下午 5 点,boss 群里 @ 全员说临时开 1 小时会。你的反应?',
    answers: [
      { text: '"收到!" + 立刻进会议室占第一排',
        delta: { grind: 2, ambition: 2, visibility: 1 } },
      { text: '"哦,挺好的"(再看一眼下班地铁班次)',
        delta: { snark: 2, cynicism: 2, grind: -1 } },
      { text: '安静地把会议加进日历,准时进,不发言',
        delta: { empathy: 1, visibility: -2, grind: 1 } },
      { text: '回了个"在的"然后接着刷淘宝',
        delta: { cynicism: 2, grind: -2, snark: 1 } },
    ],
  },
  {
    id: 'q-cake-day',
    prompt: '同事生日,组里没人组织。你?',
    answers: [
      { text: '马上跳出来主动张罗 + 自己掏钱买蛋糕',
        delta: { empathy: 3, visibility: 2 } },
      { text: '在群里发"@xxx 生日快乐"+ 表情包,完事',
        delta: { snark: 1, visibility: 1, empathy: 1 } },
      { text: '装看不见,反正每年都有人',
        delta: { cynicism: 2, empathy: -2, visibility: -1 } },
      { text: '建议大家 AA 制并主动算账',
        delta: { ambition: 1, empathy: 1, grind: 1 } },
    ],
  },
  {
    id: 'q-deadline',
    prompt: '本周五交稿。周四下午 4 点你的状态?',
    answers: [
      { text: '已经交了第三版,在等 review',
        delta: { grind: 3, ambition: 2, empathy: -1 } },
      { text: '下班前再说,改是改不完的',
        delta: { cynicism: 2, snark: 1, grind: -1 } },
      { text: '正在 ChatGPT + Claude + Cursor 三开',
        delta: { ambition: 2, visibility: 1, snark: 1 } },
      { text: '在帮组里另外两个同事也写他们的稿',
        delta: { empathy: 3, grind: 2 } },
    ],
  },
  {
    id: 'q-team-building',
    prompt: '团建定在周六晚 8 点剧本杀。你?',
    answers: [
      { text: '主动报名 + 给老板买饮料',
        delta: { ambition: 2, visibility: 2, empathy: 1 } },
      { text: '嘴上说去,临时编个理由请假',
        delta: { snark: 2, cynicism: 2, empathy: -1 } },
      { text: '直接群里回"周末有事不去"',
        delta: { cynicism: 2, snark: 1, visibility: 1, grind: -1 } },
      { text: '去 + 全程演技在线 + 当晚发朋友圈',
        delta: { visibility: 3, empathy: 1 } },
    ],
  },
  {
    id: 'q-pua',
    prompt: 'boss 周一晨会:"咱们一起拼一下,这季度 IPO!" 你的内心?',
    answers: [
      { text: '"好!冲!"(开始排晚饭外卖单)',
        delta: { grind: 3, ambition: 2 } },
      { text: '"这是第 8 次拼了吧"',
        delta: { cynicism: 2, snark: 2, grind: -1 } },
      { text: '"老板加油,我家娃要接"',
        delta: { snark: 2, visibility: 1, grind: -2 } },
      { text: '"拼吧,反正我也没生活了"',
        delta: { cynicism: 3, snark: 1, grind: 2 } },
    ],
  },
  {
    id: 'q-pip',
    prompt: '你的同事被通知 PIP(绩效改进)了,跟你倾诉。你?',
    answers: [
      { text: '帮她查《劳动法》+ 推荐律师朋友',
        delta: { empathy: 3, ambition: 1, snark: 1 } },
      { text: '"啊,挺难的,我请你吃饭吧"',
        delta: { empathy: 2, visibility: 1 } },
      { text: '"早跟你说不要太显眼了"',
        delta: { snark: 2, cynicism: 2, empathy: -1 } },
      { text: '默默把简历更新一下',
        delta: { cynicism: 2, ambition: 1, empathy: 1 } },
    ],
  },
  {
    id: 'q-jargon',
    prompt: '产品经理:"我们要拉通对齐底层逻辑,把抓手颗粒度降下来"。你?',
    answers: [
      { text: '"OK 我整理个 onepager,会前同步给大家"',
        delta: { ambition: 2, grind: 2, visibility: 1 } },
      { text: '"什么意思?能讲人话吗?"',
        delta: { snark: 2, visibility: 1, empathy: 1 } },
      { text: '默默打开 ChatGPT 翻译这句话',
        delta: { cynicism: 2, snark: 1 } },
      { text: '"对对对,我也是这么想的"(完全没听懂)',
        delta: { empathy: 1, visibility: 1, cynicism: 1 } },
    ],
  },
  {
    id: 'q-quit',
    prompt: '你最想跟 boss 说的一句话是?',
    answers: [
      { text: '"我能再多干点吗?"',
        delta: { grind: 3, ambition: 3 } },
      { text: '"咱们好聚好散吧"',
        delta: { cynicism: 2, snark: 2 } },
      { text: '"你说的我都懂,但我已经尽力了"',
        delta: { empathy: 2, snark: 1 } },
      { text: '"我之后是甲方了,记得多关照"',
        delta: { snark: 3, visibility: 2, ambition: 1 } },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────
// Scoring — sum quiz answer deltas into a TraitVector, then cosine-
// match against each archetype. Top 3 returned with similarity scores.
// ────────────────────────────────────────────────────────────────────

const ZERO: TraitVector = { grind: 0, snark: 0, ambition: 0, empathy: 0, cynicism: 0, visibility: 0 };

export function emptyTraitVector(): TraitVector {
  return { ...ZERO };
}

export function addTraitDelta(v: TraitVector, d: Partial<TraitVector>): TraitVector {
  return {
    grind:      v.grind      + (d.grind      ?? 0),
    snark:      v.snark      + (d.snark      ?? 0),
    ambition:   v.ambition   + (d.ambition   ?? 0),
    empathy:    v.empathy    + (d.empathy    ?? 0),
    cynicism:   v.cynicism   + (d.cynicism   ?? 0),
    visibility: v.visibility + (d.visibility ?? 0),
  };
}

function cosine(a: TraitVector, b: TraitVector): number {
  const keys: TraitId[] = ['grind', 'snark', 'ambition', 'empathy', 'cynicism', 'visibility'];
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    dot += a[k] * b[k];
    na  += a[k] * a[k];
    nb  += b[k] * b[k];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Score the user's TraitVector against all 12 archetypes. Returns
 *  archetypes sorted by similarity descending. The top result is the
 *  "you are this" pick; second + third are surfaced on the card as
 *  "你也有点像 X / Y" so users with hybrid identities don't feel
 *  reduced to a single tag. */
export function scoreArchetypes(v: TraitVector): Array<{ archetype: Archetype; score: number }> {
  // Normalize the user vector by clamping negatives to 0 — quiz can
  // give -1/-2 for "definitely not this trait" but cosine wants
  // positive vectors for sensible angle.
  const clamped: TraitVector = {
    grind:      Math.max(0, v.grind),
    snark:      Math.max(0, v.snark),
    ambition:   Math.max(0, v.ambition),
    empathy:    Math.max(0, v.empathy),
    cynicism:   Math.max(0, v.cynicism),
    visibility: Math.max(0, v.visibility),
  };
  return ARCHETYPES
    .map((archetype) => ({ archetype, score: cosine(clamped, archetype.traits) }))
    .sort((a, b) => b.score - a.score);
}

/** Lookup helper used by the profile route + card renderer. */
export function findArchetype(id: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.id === id);
}
