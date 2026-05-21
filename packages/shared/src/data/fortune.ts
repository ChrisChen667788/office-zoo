/**
 * 班味占卜 fortune deck — v5.4.0.
 *
 * 24 卡牌, 塔罗式的"今日工作运势". 每张牌有:
 *  - 视觉标识(emoji + gradient color pair)
 *  - 标题 + 副标题(诗意点的, 不要太说教)
 *  - vibeScore (1-100, 决定卡片 outline 颜色: 红/黄/绿)
 *  - 一句忠告 (advice) — 直接告诉用户"今天该想清楚啥"
 *  - 一个微行动 (microAction) — 5 分钟可执行的小动作, 用户做完
 *    可以拍照/截图分享
 *  - tag — 用于跟 archetype 做亲和度匹配
 *
 * 设计意图:
 *  - 不是塔罗的玄学预言(那个走 GPT 自动生成更贴用户), 而是
 *    高浓度的职场段子卡 — 每张牌本身就是一个小段子
 *  - 用户每天抽一张, 截图分享朋友圈 / 小红书 = viral 入口
 *  - 卡牌池按 vibeScore 分布:
 *      ~6 张 大吉 (80-99)
 *      ~12 张 中平 (40-79)
 *      ~6 张 凶险 (1-39)
 *    保证每天有惊有喜, 不全是甜点也不全是地狱
 *
 * Selection: deterministic hash(userId + UTC date) → card index.
 * 同一天同一用户永远抽到同一张; 第二天换一张. 隔天连续抽到同一张
 * 的概率 = 1/24, 大概每月会有一两次, 适当的"重复感"反而强化"它
 * 像真的塔罗" 的玄学体验.
 */

export type FortuneVibe = 'great' | 'neutral' | 'rough';

export interface FortuneCard {
  /** Stable id — used as the deterministic selection target +
   *  the URL slug if we ever do /fortune/:cardId deep-links. */
  id: string;
  emoji: string;
  /** Hero title — 4-8 字, 像 tarot card name. */
  title: string;
  /** Subtitle — 一句话的卡牌氛围, 跟 title 互补 ≤ 18 字. */
  subtitle: string;
  /** 0-100. Drives the outline color + the "今日运势" gauge.
   *  Convention: ≥80 = great (green/gold tint),
   *  40-79 = neutral (cyan/violet), <40 = rough (rose/red). */
  vibeScore: number;
  /** Two colors that form the card's signature gradient. */
  gradient: [string, string];
  /** 今日忠告 — 一句话, 30 字以内, 直接到位. */
  advice: string;
  /** 微行动 — 一个可以 5 分钟内做完的具体小动作, 用户做完截图
   *  分享卡可以多一个"我今天做了" affordance.  */
  microAction: string;
  /** affinity tag — 用于 archetype 亲和度. e.g. 卷王 抽到 "今日
   *  KPI 神助攻" 的概率更高. */
  tag: 'grind' | 'slack' | 'snark' | 'social' | 'survive' | 'escape';
}

export const FORTUNE_DECK: FortuneCard[] = [
  // ── 大吉 (~6 张, vibeScore 80-99) ─────────────────────────────
  {
    id: 'kpi-blessing',
    emoji: '⭐',
    title: 'KPI 神助攻',
    subtitle: '今天的数字会站在你这边',
    vibeScore: 92,
    gradient: ['#ffb84c', '#ff5588'],
    advice: '该报的数字今天报, 该 demo 的项目今天 demo — 老板今天眼神柔和.',
    microAction: '挑一个你压了三周不敢发的更新, 现在发出去.',
    tag: 'grind',
  },
  {
    id: 'silent-hero',
    emoji: '🌒',
    title: '隐身大吉',
    subtitle: '今天不在场就是最大的胜利',
    vibeScore: 88,
    gradient: ['#475569', '#7c3aed'],
    advice: '凡是问 "谁可以负责" 的群消息, 今天一律已读不回 — 没人怪你.',
    microAction: '把今天的会议从日历里随便删一个 — 不会有人发现.',
    tag: 'slack',
  },
  {
    id: 'snark-shield',
    emoji: '🛡️',
    title: '阴阳护体',
    subtitle: '今天怎么阴怎么有理',
    vibeScore: 85,
    gradient: ['#a855f7', '#ec4899'],
    advice: '该 "挺好的" 就 "挺好的", 该 "收到" 就 "收到" — 今天没人接住你的真话.',
    microAction: '给一个你最讨厌的同事发一个 "辛苦啦~ 😊"  并截图存档.',
    tag: 'snark',
  },
  {
    id: 'lunch-godhand',
    emoji: '🍱',
    title: '茶水间神运',
    subtitle: '今天的午饭会偶遇关键人',
    vibeScore: 90,
    gradient: ['#fbbf24', '#16a34a'],
    advice: '不要叫外卖, 不要点轻食, 跟同事一起去食堂 — 今天的 8 卦含金量很高.',
    microAction: '去茶水间倒水, 跟一个平时不熟的部门同事讲一句话.',
    tag: 'social',
  },
  {
    id: 'salary-bonus',
    emoji: '💸',
    title: '薪水小红包',
    subtitle: '今天工资条会比预期多一点',
    vibeScore: 95,
    gradient: ['#22c55e', '#fbbf24'],
    advice: '查工资条 / 报销 / 公积金调整 — 今天 0% 概率被克扣.',
    microAction: '把上个月一直忘了报的发票现在贴上去, 报掉.',
    tag: 'grind',
  },
  {
    id: 'lone-wolf-day',
    emoji: '🦊',
    title: '老油条之眼',
    subtitle: '一眼看穿所有甲方话术',
    vibeScore: 82,
    gradient: ['#854d0e', '#dc2626'],
    advice: '今天甲方说 "再优化一版", 你心里直接翻译 "他自己也不知道要啥" — 不慌, 报价加 20%.',
    microAction: '把一个客户邮件读三遍, 标出所有 "可能变" 的字眼, 截图发同事吐槽.',
    tag: 'survive',
  },

  // ── 中平 (~12 张, vibeScore 40-79) ───────────────────────────
  {
    id: 'meeting-marathon',
    emoji: '🔁',
    title: '会议马拉松',
    subtitle: '今天的事都在会议室里解决',
    vibeScore: 55,
    gradient: ['#7c3aed', '#4c9eff'],
    advice: '把会议当背景音, 真正的工作放在会议中间的 5 分钟里冲完.',
    microAction: '今天某个会议开到一半时, 假装去倒水, 在工位上写 10 分钟代码.',
    tag: 'grind',
  },
  {
    id: 'dao-of-deflect',
    emoji: '🪃',
    title: '甩锅之道',
    subtitle: '今天责任会自动找到下一个人',
    vibeScore: 65,
    gradient: ['#06b6d4', '#7c3aed'],
    advice: '凡是问你 "为什么会这样", 一律 "这块需要拉齐一下" — 球永远不要落在你脚边.',
    microAction: '回一封邮件, 主旨是 "@同学 你看看这个", 把球甩出去.',
    tag: 'survive',
  },
  {
    id: 'slack-equilibrium',
    emoji: '🛋️',
    title: '摸鱼平衡术',
    subtitle: '70 分摸鱼 + 30 分输出',
    vibeScore: 60,
    gradient: ['#6ee7b7', '#4c9eff'],
    advice: '上午摸鱼, 下午冲一个 deliverable. 老板看到你下午的速度, 就忽略了上午.',
    microAction: '上午刷小红书 20 分钟, 下午 4 点交一个文档.',
    tag: 'slack',
  },
  {
    id: 'jargon-overflow',
    emoji: '🗣️',
    title: '黑话洪流',
    subtitle: '今天人人都在 "拉通对齐"',
    vibeScore: 50,
    gradient: ['#7c3aed', '#a855f7'],
    advice: '听到 "颗粒度" "底层逻辑" "抓手", 内心翻译 "他也不懂" — 不要试图回应.',
    microAction: '今天用 "战略层面" 这个词回复一封邮件 — 看看效果.',
    tag: 'snark',
  },
  {
    id: 'survive-mode',
    emoji: '🪨',
    title: '苟住就是赢',
    subtitle: '今天的目标是活下来',
    vibeScore: 45,
    gradient: ['#64748b', '#475569'],
    advice: '不要提新意见, 不要主动揽活, 不要在群里冒头 — 今天的 KPI 是 "存在".',
    microAction: '今天不要发任何主动消息. 只回复, 不发起.',
    tag: 'survive',
  },
  {
    id: 'deep-breath',
    emoji: '🌬️',
    title: '宜深呼吸忌深思考',
    subtitle: '今天的脑子不在状态',
    vibeScore: 52,
    gradient: ['#06b6d4', '#9be6ff'],
    advice: '该做的执行类工作今天做, 该想的战略类工作明天再想 — 今天硬想会把方向想歪.',
    microAction: '关掉所有提醒 5 分钟. 闭眼深呼吸 10 次. 然后再决定第一件事做啥.',
    tag: 'survive',
  },
  {
    id: 'group-chat-bait',
    emoji: '🎣',
    title: '群消息钓鱼日',
    subtitle: '今天 @你 的都是陷阱',
    vibeScore: 48,
    gradient: ['#fbbf24', '#f87171'],
    advice: '老板在群里说 "辛苦了大家", 别接话 — 接了就是新活儿.',
    microAction: '把工作群免打扰 2 小时, 看看世界还在不在转.',
    tag: 'survive',
  },
  {
    id: 'micro-win',
    emoji: '🥨',
    title: '微小胜利日',
    subtitle: '今天的快乐很 sample size',
    vibeScore: 68,
    gradient: ['#fbbf24', '#22c55e'],
    advice: '不要追求大成果, 把今天的小事一件一件解决掉 — 今天宜累加, 忌豪赌.',
    microAction: '把收件箱里 3 封 "晚点回" 的邮件今天回掉. 立刻去做.',
    tag: 'grind',
  },
  {
    id: 'awkward-elevator',
    emoji: '🛗',
    title: '尴尬电梯局',
    subtitle: '今天会遇到难以应对的人',
    vibeScore: 42,
    gradient: ['#f87171', '#a855f7'],
    advice: '遇到老板 / 前任同事 / 不熟的高管, 一律 "您先走" — 不要试图开聊.',
    microAction: '今天故意走一次楼梯, 跳过电梯 — 给自己一个 "我赢了" 的小理由.',
    tag: 'social',
  },
  {
    id: 'side-hustle-itch',
    emoji: '🪙',
    title: '副业心动日',
    subtitle: '今天会想换条路',
    vibeScore: 58,
    gradient: ['#16a34a', '#fbbf24'],
    advice: '想做副业的冲动今天最强 — 别立刻辞职, 但可以列个清单.',
    microAction: '在备忘录里写下 3 个 "如果我不上班我会做什么".',
    tag: 'escape',
  },
  {
    id: 'mom-call-day',
    emoji: '📞',
    title: '我妈来电预警',
    subtitle: '今天会被催各种事',
    vibeScore: 50,
    gradient: ['#f87171', '#fbbf24'],
    advice: '我妈会问 "对象有没有 / 工资多少 / 啥时候回来" — 提前准备好三个标准答案.',
    microAction: '主动给我妈打个电话, 报喜不报忧, 5 分钟搞定.',
    tag: 'social',
  },
  {
    id: 'feedback-loop',
    emoji: '🔄',
    title: '反馈循环日',
    subtitle: '今天 review 比工作多',
    vibeScore: 55,
    gradient: ['#0ea5e9', '#7c3aed'],
    advice: '所有 review / 反馈 / "对齐一下" 都集中今天爆发 — 不要试图当天解决, 把反馈记下就行.',
    microAction: '把今天所有"我们再看看"的事情用一张纸列出来, 拍照存档.',
    tag: 'grind',
  },

  // ── 凶险 (~6 张, vibeScore < 40) ──────────────────────────────
  {
    id: 'kpi-storm',
    emoji: '🌪️',
    title: '甲方暴风预警',
    subtitle: '今天甲方会突袭三次',
    vibeScore: 28,
    gradient: ['#dc2626', '#7c3aed'],
    advice: '提前关闭微信电脑端 / 设置邮件延迟发送 — 今天的 "紧急" 都没那么紧急.',
    microAction: '把手机调勿扰 30 分钟, 喝一杯热的, 再回甲方的消息.',
    tag: 'survive',
  },
  {
    id: 'pua-thunderclap',
    emoji: '⚡',
    title: 'PUA 雷暴日',
    subtitle: '今天老板的话不要往心里去',
    vibeScore: 22,
    gradient: ['#ec4899', '#7c3aed'],
    advice: '老板说 "我对你有点失望" — 翻译: "他自己今天被骂了". 不要内化, 不要哭, 下班去吃顿好的.',
    microAction: '今天加一笔预算给晚饭. 火锅 / 烤肉 / 寿喜烧任选, 不要点轻食.',
    tag: 'survive',
  },
  {
    id: 'do-not-reply',
    emoji: '🚫',
    title: '今日不宜回老板',
    subtitle: '今天回的消息都会变作业',
    vibeScore: 32,
    gradient: ['#475569', '#dc2626'],
    advice: '老板下午 5 点之后发的任何消息, 一律 "已读, 明天上班处理" — 今晚的火不是你的火.',
    microAction: '老板今晚消息如果来, 截图发到朋友的群里, 不要直接回.',
    tag: 'escape',
  },
  {
    id: 'sneeze-meeting',
    emoji: '🤒',
    title: '请假征兆',
    subtitle: '今天身体在抗议',
    vibeScore: 25,
    gradient: ['#9be6ff', '#a855f7'],
    advice: '咳嗽 / 头痛 / 胃口差 — 都是真的, 不是装的. 今天该早走就早走.',
    microAction: '中午午休去躺 30 分钟. 不开电脑, 不刷手机.',
    tag: 'escape',
  },
  {
    id: 'group-chat-curse',
    emoji: '💀',
    title: '千万别开群会',
    subtitle: '今天的群会必有一次社死',
    vibeScore: 18,
    gradient: ['#7c3aed', '#1a1a1f'],
    advice: '今天的腾讯会议 / 飞书会议必有一次 "您忘了取消静音". 提前检查麦克风.',
    microAction: '会议开始前 2 分钟检查一遍: 摄像头关 / 麦克风静音 / 浏览器标签整洁.',
    tag: 'survive',
  },
  {
    id: 'late-night-meta',
    emoji: '🌚',
    title: '深夜 emo 锁定',
    subtitle: '今晚 11 点会想很多',
    vibeScore: 35,
    gradient: ['#475569', '#7c3aed'],
    advice: '今晚不要打开 BOSS 直聘 / 投简历 / 算公积金. 那些事明天早上做更聪明.',
    microAction: '11 点之前关手机, 听一首老歌 (但不要听情歌).',
    tag: 'escape',
  },
];

/** Helper for the server's getDailyFortune — deterministic per
 *  (userId, date) pick. Same hash family as dailyDrama.ts so the
 *  randomness "feels" coherent across surfaces. */
export function pickFortuneIndex(userId: string, dateStr: string): number {
  let h = 2166136261 >>> 0;
  const seed = `${userId}|${dateStr}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % FORTUNE_DECK.length;
}
