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

/** v2.0.0 — region axis. The 12 v1.x archetypes are region-neutral
 *  ('generic'); v2.0.0 adds 6 region-flavored archetypes that bias
 *  toward a specific city's office culture stereotype.
 *
 *  Used as a tie-breaking bonus in archetype scoring AND as a chip on
 *  the profile card. Daily-drama / talkshow / pack recommendations
 *  can branch on this axis in future versions. */
export type RegionId =
  | 'beijing' | 'shanghai' | 'shenzhen' | 'hangzhou' | 'chengdu' | 'overseas'
  | 'generic';

/** v2.0.0 — industry axis. Same role as RegionId but slices by sector
 *  instead of geography. 'generic' = the original 12 archetypes which
 *  weren't industry-locked. */
export type IndustryId =
  | 'soe' | 'faang' | 'startup' | 'finance' | 'edu' | 'mcn'
  | 'generic';

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
  /** v2.0.0 — which region this archetype belongs to. Quiz answers can
   *  bump a region count; the matching archetype gets a bonus during
   *  scoring. Defaults to 'generic' on the original 12. */
  region?: RegionId;
  /** v2.0.0 — same as region but sliced by industry. */
  industry?: IndustryId;
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

  // ──────────────────────────────────────────────────────────────────
  // v2.0.0 — 12 new region/industry-flavored archetypes (#13-24).
  // Same trait-vector + cosine-matching logic as the original 12;
  // additionally tagged with `region` or `industry` so the quiz can
  // bias toward them when the user signals a tribe.
  // ──────────────────────────────────────────────────────────────────

  // ── Industry archetypes (6) ──────────────────────────────────────
  {
    id: 'soe-lifer',
    emoji: '🏛️',
    name: '国企铁饭碗',
    shortName: '国企',
    tagline: '下午 3 点喝茶,5 点准时下班,工资按月到账',
    traits: A({ grind: 0.3, snark: 0.4, ambition: 0.2, empathy: 0.9, cynicism: 0.45, visibility: 0.4 }),
    colors: { start: '#dc2626', mid: '#fbbf24', end: '#16a34a' },
    characterNotes: [
      '工龄一栏写"自毕业以来一直在",看了让人心安',
      '说"领导"不说 "boss",说"科室"不说"team"',
      '下午茶有水果有糖,饭堂还便宜',
      '不卷不躺,稳稳的幸福',
    ],
    shineScenarioId: 'org-optimization',
    shineTalkshowTag: 'meta',
    industry: 'soe',
  },
  {
    id: 'faang-cog',
    emoji: '⚙️',
    name: '大厂螺丝钉',
    shortName: '螺丝钉',
    tagline: '我是 OKR 里的一行字, 周报里的一个 bullet',
    traits: A({ grind: 0.95, snark: 0.35, ambition: 0.85, empathy: 0.4, cynicism: 0.55, visibility: 0.2 }),
    colors: { start: '#0ea5e9', mid: '#1e293b', end: '#7c3aed' },
    characterNotes: [
      '工位贴 OKR,日历每 30 分钟一格',
      '懂分布式 + 微服务 + 监控告警那一套',
      '熬过 3 次重组,部门换过 2 个名字',
      '加班到 11 点也只算正常水平',
    ],
    shineScenarioId: 'amazon-rto',
    shineTalkshowTag: 'kpi',
    industry: 'faang',
  },
  {
    id: 'startup-cowboy',
    emoji: '🤠',
    name: '创业老炮',
    shortName: '创业',
    tagline: '见过三轮裁员还活着 — 工资条比 commit log 还密',
    traits: A({ grind: 0.85, snark: 0.55, ambition: 0.95, empathy: 0.5, cynicism: 0.6, visibility: 0.75 }),
    colors: { start: '#f97316', mid: '#dc2626', end: '#facc15' },
    characterNotes: [
      'PRD / 代码 / BD / 客服都干过',
      '"all in" 这个词听吐了',
      '能用一句"先 MVP 上线再说"打发任何争论',
      '工资被欠过半年,期权擦过桌子',
    ],
    shineScenarioId: 'startup-cliff',
    shineTalkshowTag: 'jargon',
    industry: 'startup',
  },
  {
    id: 'finance-suit',
    emoji: '💼',
    name: '金融体面人',
    shortName: '金融',
    tagline: '讲话夹英文,西装革履,通勤陆家嘴',
    traits: A({ grind: 0.7, snark: 0.5, ambition: 0.95, empathy: 0.25, cynicism: 0.45, visibility: 0.85 }),
    colors: { start: '#0f172a', mid: '#fbbf24', end: '#dc2626' },
    characterNotes: [
      '说话从不超过 3 句不夹英文',
      'PPT 模板永远是黑底金字',
      'Bonus 占年收入 60%+,加班是隐含的',
      '"风控"两个字能压死任何提议',
    ],
    shineScenarioId: 'fake-performance',
    shineTalkshowTag: 'jargon',
    industry: 'finance',
  },
  {
    id: 'edu-survivor',
    emoji: '📚',
    name: '教培劫余',
    shortName: '教培',
    tagline: '双减后转 K9, 双语转一对一, 一对一转海外',
    traits: A({ grind: 0.6, snark: 0.65, ambition: 0.45, empathy: 0.85, cynicism: 0.85, visibility: 0.45 }),
    colors: { start: '#2563eb', mid: '#a855f7', end: '#ec4899' },
    characterNotes: [
      '简历 3 年换 4 家公司,每家都是教育',
      '熟悉"私域"、"裂变"、"复购"、"留存"',
      '深夜还在群里推体验课',
      '心里其实只想去考公',
    ],
    shineScenarioId: 'mass-layoff-illegal',
    shineTalkshowTag: 'pua',
    industry: 'edu',
  },
  {
    id: 'mcn-grinder',
    emoji: '📱',
    name: '网红打工人',
    shortName: '网红',
    tagline: '今天涨了 200 粉, 这个月 GMV 还差 5 万',
    traits: A({ grind: 0.85, snark: 0.6, ambition: 0.7, empathy: 0.35, cynicism: 0.45, visibility: 0.95 }),
    colors: { start: '#ec4899', mid: '#fbbf24', end: '#06b6d4' },
    characterNotes: [
      '手机里 12 个剪辑 app',
      '说"算法""完播率""涨粉率"像呼吸',
      '直播间一开 6 小时,嗓子哑也得讲',
      '梦想是做爆款 MCN 老板,现实是给老板打工',
    ],
    shineScenarioId: 'fake-performance',
    shineTalkshowTag: 'meta',
    industry: 'mcn',
  },

  // ── Region archetypes (6) ────────────────────────────────────────
  {
    id: 'bj-drift',
    emoji: '🌆',
    name: '北漂',
    shortName: '北漂',
    tagline: '出租屋 + 沙县小吃 + 五号线早 7 点',
    traits: A({ grind: 0.7, snark: 0.5, ambition: 0.8, empathy: 0.5, cynicism: 0.7, visibility: 0.45 }),
    colors: { start: '#dc2626', mid: '#fbbf24', end: '#0a0a0a' },
    characterNotes: [
      '租房从五环外搬到六环外,工资涨了 10%',
      '过年才回老家,每次都被催婚',
      '"等我赚够 X 万就回去"说了 5 年了',
      '老乡群里啥也不说,但群消息一定看完',
    ],
    shineScenarioId: 'forced-transfer-resign',
    shineTalkshowTag: 'meta',
    region: 'beijing',
  },
  {
    id: 'sh-yuppie',
    emoji: '☕',
    name: '沪漂精致',
    shortName: '沪漂',
    tagline: '周末必喝咖啡, 工作日早餐 manner',
    traits: A({ grind: 0.65, snark: 0.55, ambition: 0.75, empathy: 0.35, cynicism: 0.4, visibility: 0.85 }),
    colors: { start: '#a855f7', mid: '#ec4899', end: '#fbbf24' },
    characterNotes: [
      '能说"切糕""阿拉""侬好"',
      '周末小红书 + Manner + brunch 三件套',
      '社交网络里看不到加班,只看到陆家嘴夜景',
      '隐藏属性: 月底刷信用卡',
    ],
    shineScenarioId: 'fake-performance',
    shineTalkshowTag: 'jargon',
    region: 'shanghai',
  },
  {
    id: 'sz-money-chaser',
    emoji: '💰',
    name: '深漂搞钱党',
    shortName: '深漂',
    tagline: '搞钱搞钱搞钱, 别跟我谈情怀',
    traits: A({ grind: 0.85, snark: 0.45, ambition: 0.95, empathy: 0.2, cynicism: 0.5, visibility: 0.65 }),
    colors: { start: '#16a34a', mid: '#0a0a0a', end: '#fbbf24' },
    characterNotes: [
      '同时跑 3 个副业,主业反而是稳定的那个',
      '说"性价比" "ROI" "回本"像家常便饭',
      '租房住南山,每天通勤 1.5h 不觉得累',
      '"格局打开"是口头禅,但格局其实就是钱',
    ],
    shineScenarioId: 'startup-cliff',
    shineTalkshowTag: 'kpi',
    region: 'shenzhen',
  },
  {
    id: 'hz-internet-kid',
    emoji: '🌊',
    name: '杭州互联网青年',
    shortName: '杭漂',
    tagline: '花名"小六", 居住未来科技城, 996 是天经地义',
    traits: A({ grind: 0.95, snark: 0.4, ambition: 0.85, empathy: 0.5, cynicism: 0.35, visibility: 0.55 }),
    colors: { start: '#06b6d4', mid: '#7c3aed', end: '#16a34a' },
    characterNotes: [
      '工牌上没真名只有花名("小六""逍遥""无忌")',
      '"中台""赋能""抓手"是日常黑话',
      '住在未来科技城,通勤 2km',
      '加班滴滴有报销,夜宵有补贴,卷到飞起',
    ],
    shineScenarioId: 'amazon-rto',
    shineTalkshowTag: 'jargon',
    region: 'hangzhou',
  },
  {
    id: 'cd-zen',
    emoji: '🐼',
    name: '成都摆烂派',
    shortName: '成都',
    tagline: '巴适得板, 上班是为了下班吃火锅',
    traits: A({ grind: 0.2, snark: 0.55, ambition: 0.2, empathy: 0.7, cynicism: 0.7, visibility: 0.35 }),
    colors: { start: '#84cc16', mid: '#f97316', end: '#fbbf24' },
    characterNotes: [
      '下班直接奔火锅店,不带任何工作群消息',
      '工资不高但生活幸福指数爆表',
      '"安逸""巴适""莫得办法"是口头禅',
      '加班?那玩意儿是北上广深的事',
    ],
    shineScenarioId: 'org-optimization',
    shineTalkshowTag: 'slacking',
    region: 'chengdu',
  },
  {
    id: 'escape-overseas',
    emoji: '✈️',
    name: '海外润人',
    shortName: '润人',
    tagline: '走为上策, 简历 + 英语 + 签证一起搞',
    traits: A({ grind: 0.55, snark: 0.7, ambition: 0.7, empathy: 0.4, cynicism: 0.65, visibility: 0.5 }),
    colors: { start: '#0ea5e9', mid: '#22c55e', end: '#fbbf24' },
    characterNotes: [
      'LinkedIn 改成英文版,头像换了三次',
      '雅思 / 托福刷题群里很活跃',
      '"美东""南美""新马"3 个时区都看过',
      '朋友圈一半内容是签证 / 房价 / 学校',
    ],
    shineScenarioId: 'twitter-purge',
    shineTalkshowTag: 'meta',
    region: 'overseas',
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
  // v2.0.0 — pairs for the 12 new archetypes. Pivoted around the
  // "stable vs hustler" axis since industry/region tribes often
  // contrast along productivity lines (国企 vs 大厂, 成都 vs 深漂).
  'soe-lifer':       { rival: 'faang-cog',      bestie: 'veteran' },
  'faang-cog':       { rival: 'soe-lifer',      bestie: 'hz-internet-kid' },
  'startup-cowboy':  { rival: 'soe-lifer',      bestie: 'sz-money-chaser' },
  'finance-suit':    { rival: 'cd-zen',         bestie: 'sh-yuppie' },
  'edu-survivor':    { rival: 'finance-suit',   bestie: 'pleaser' },
  'mcn-grinder':     { rival: 'ghost',          bestie: 'show-pony' },
  'bj-drift':        { rival: 'cd-zen',         bestie: 'sz-money-chaser' },
  'sh-yuppie':       { rival: 'escape-overseas',bestie: 'finance-suit' },
  'sz-money-chaser': { rival: 'cd-zen',         bestie: 'startup-cowboy' },
  'hz-internet-kid': { rival: 'soe-lifer',      bestie: 'faang-cog' },
  'cd-zen':          { rival: 'sz-money-chaser',bestie: 'slacker' },
  'escape-overseas': { rival: 'soe-lifer',      bestie: 'sh-yuppie' },
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
  /** v2.0.0 — when set, this answer signals the user belongs to the
   *  named region tribe. Scoring later bumps matching archetypes by
   *  REGION_BONUS so the region-tagged archetypes can outrank
   *  generic ones with similar trait vectors. */
  region?: RegionId;
  /** v2.0.0 — same as region but sliced by industry. */
  industry?: IndustryId;
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
  // ──────────────────────────────────────────────────────────────────
  // v2.0.0 — two new questions that surface region/industry signal.
  // Each answer also carries some trait delta so trait-cosine still
  // works; the region/industry tag is the tie-breaker bonus that lets
  // the 12 new archetypes outrank similarly-shaped generic ones.
  // ──────────────────────────────────────────────────────────────────
  {
    id: 'q-tribe-industry',
    prompt: '说说你工作的"味道" — 下班最常去的地方?',
    answers: [
      { text: '机关食堂 / 单位茶水间',
        delta: { empathy: 2, grind: -1, cynicism: 1 },
        industry: 'soe' },
      { text: '园区健身房 / 公司班车 / 写字楼下星巴克',
        delta: { grind: 2, ambition: 2, visibility: 1 },
        industry: 'faang' },
      { text: '联合办公 + 楼下烤串 + 凌晨打车',
        delta: { grind: 2, ambition: 2, cynicism: 1, snark: 1 },
        industry: 'startup' },
      { text: '陆家嘴/国贸高层酒廊 + 各种 networking',
        delta: { visibility: 3, ambition: 2, grind: 1 },
        industry: 'finance' },
    ],
  },
  {
    id: 'q-tribe-region',
    prompt: '哪个城市最像你现在的生活状态?',
    answers: [
      { text: '北京 — 五环边的合租 + 国贸通勤 + 沙县小吃',
        delta: { grind: 2, cynicism: 2, ambition: 1, visibility: -1 },
        region: 'beijing' },
      { text: '上海 — 周末 brunch + 露台咖啡 + 高架晚高峰',
        delta: { visibility: 3, ambition: 1, empathy: -1 },
        region: 'shanghai' },
      { text: '深圳 — 写字楼通宵 + 副业群 + 滴滴秒接单',
        delta: { grind: 2, ambition: 3, empathy: -1 },
        region: 'shenzhen' },
      { text: '成都/二线 — 火锅 + 茶馆 + 不加班',
        delta: { cynicism: 2, empathy: 2, grind: -2, snark: 1 },
        region: 'chengdu' },
    ],
  },
  // ──────────────────────────────────────────────────────────────────
  // v3.1.2 — second-axis region question. v2.0.0 q-tribe-region only
  // had 4 options (北/上/深/成都) because we wanted to keep the quiz
  // short. But that left hangzhou + overseas archetypes unreachable
  // via tribe signal — they could only surface via trait coincidence,
  // which is too random for users who explicitly identify with those
  // tribes. This question lets them opt in directly.
  //
  // The two "non-tribe" options carry deltas without setting `region`
  // so users who picked a city above don't get double-counted on a
  // region they don't actually belong to.
  // ──────────────────────────────────────────────────────────────────
  {
    id: 'q-tribe-region-2',
    prompt: '上一题没你的城市?这题再补一个 — 或者跳过(选最后一项)。',
    answers: [
      { text: '杭州 — 花名"小六" + 居住未来科技城 + 996 是天经地义',
        delta: { grind: 3, ambition: 2, cynicism: -1, visibility: 1 },
        region: 'hangzhou' },
      { text: '海外 — LinkedIn 改英文头像换三次 + 雅思托福群很活跃',
        delta: { ambition: 2, snark: 2, cynicism: 1, grind: 1 },
        region: 'overseas' },
      { text: '我已经在上一题选过了 — 不补充',
        delta: {} },
      { text: '都不像 — 我活在自己的小世界',
        delta: { cynicism: 1, visibility: -1, empathy: 1 } },
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

/** v2.0.0 — bonus added to the cosine score when an archetype's
 *  region or industry matches the user's quiz-signaled tribe.
 *  Tuned so a strong tribal signal can overcome a ~0.05 cosine gap
 *  (the typical spread between the top 3 archetypes) but won't flip
 *  drastically different trait shapes. */
const TRIBE_BONUS = 0.08;

/** v2.0.0 — optional tribal signal collected from the quiz. Both
 *  fields are independent; users with no clear signal pass undefined
 *  and scoring degrades cleanly to v1.x cosine-only behaviour. */
export interface TribeSignal {
  region?: RegionId;
  industry?: IndustryId;
}

/** Score the user's TraitVector against all 24 archetypes. Returns
 *  archetypes sorted by similarity descending. The top result is the
 *  "you are this" pick; second + third are surfaced on the card as
 *  "你也有点像 X / Y" so users with hybrid identities don't feel
 *  reduced to a single tag.
 *
 *  v2.0.0 — optionally accepts a TribeSignal. When the user's region
 *  or industry quiz answers point to a tribe, matching archetypes
 *  get a TRIBE_BONUS additive boost. This breaks ties cleanly without
 *  letting tribe override fundamentally mismatched trait shapes. */
export function scoreArchetypes(
  v: TraitVector,
  tribe?: TribeSignal,
): Array<{ archetype: Archetype; score: number }> {
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
    .map((archetype) => {
      let score = cosine(clamped, archetype.traits);
      if (tribe?.region   && archetype.region   === tribe.region)   score += TRIBE_BONUS;
      if (tribe?.industry && archetype.industry === tribe.industry) score += TRIBE_BONUS;
      return { archetype, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** v2.0.0 — extract a tribal signal from the user's quiz answers by
 *  counting region/industry tags. Quiz route uses this to feed into
 *  scoreArchetypes. Returns undefined fields when no signal is
 *  present (users with all-trait answers fall back to v1.x behaviour). */
export function extractTribeFromAnswers(
  answers: number[],
  questions: QuizQuestion[] = QUIZ_QUESTIONS,
): TribeSignal {
  // v3.1.2 — weight scheme: later region/industry questions are
  // explicit "if you didn't see your tribe above" overrides, so we
  // weight them progressively higher (i+1 per question). This makes
  // q11 (the hangzhou/overseas widening question) outrank q10 when
  // both signal a region — matching the prompt's promise "上一题没
  // 你的城市? 这题再补一个".
  const regionCount: Partial<Record<RegionId, number>> = {};
  const industryCount: Partial<Record<IndustryId, number>> = {};
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const idx = answers[i];
    if (typeof idx !== 'number') continue;
    const ans = q.answers[idx];
    if (!ans) continue;
    const weight = i + 1; // 1-indexed so q1 still counts
    if (ans.region)   regionCount[ans.region]     = (regionCount[ans.region]     ?? 0) + weight;
    if (ans.industry) industryCount[ans.industry] = (industryCount[ans.industry] ?? 0) + weight;
  }
  const pickMax = <K extends string>(m: Partial<Record<K, number>>): K | undefined => {
    let best: K | undefined; let bestN = 0;
    for (const k of Object.keys(m) as K[]) {
      const n = m[k] ?? 0;
      if (n > bestN) { best = k; bestN = n; }
    }
    return best;
  };
  return {
    region:   pickMax<RegionId>(regionCount),
    industry: pickMax<IndustryId>(industryCount),
  };
}

/** Lookup helper used by the profile route + card renderer. */
export function findArchetype(id: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.id === id);
}

// ────────────────────────────────────────────────────────────────────
// v1.3.3 — Archetype → Talkshow voice persona mapping.
//
// When an identified user opens the talkshow create modal, the default
// `persona` selection should match their archetype's "natural voice"
// so the segments they create sound like THEIR own delivery. Mapping
// is hand-curated rather than derived from traits because voice fit is
// a tone-judgment, not a math match.
// ────────────────────────────────────────────────────────────────────
import type { TalkshowPersona } from './talkshow';

export const ARCHETYPE_TO_TALKSHOW_PERSONA: Record<string, TalkshowPersona> = {
  grinder:       'qingse',     // 卷王 — earnest hustle voice, never breaks
  slacker:       'qingse',     // 摸鱼大师 — laid-back young guy
  'sass-master': 'yujie',      // 阴阳怪气王 — sultry sarcasm fits
  pleaser:       'shaonv',     // 老好人 — gentle, self-effacing
  nihilist:      'qingnian',   // 厌世派 — flat neutral narrator
  'show-pony':   'shaonv',     // 显眼包 — bright, chipper, look-at-me
  'anti-grinder':'yujie',      // 反卷青年 — knowing, world-weary
  'drama-queen': 'badao',      // 戏精 — dramatic, theatrical authority
  'iron-maiden': 'jingying',   // 拼命三娘 — sharp manager voice
  veteran:       'jingying',   // 老油条 — corporate veteran
  'deck-wizard': 'jingying',   // PPT 王者 — executive presentation voice
  ghost:         'qingnian',   // 隐形人 — neutral, low-affect
  // v2.0.0 — voice picks for the 12 new archetypes. Industry tribes
  // bias toward authority voices (国企/金融/finance read "older");
  // region tribes bias toward youth voices unless the city is
  // famously "elder" (e.g. 国企 lifer).
  'soe-lifer':       'jingying', // 国企老人 — senior, steady, official
  'faang-cog':       'qingnian', // 大厂螺丝钉 — flat, deliverable-focused
  'startup-cowboy':  'badao',    // 创业老炮 — punchy, dramatic survivor
  'finance-suit':    'jingying', // 金融体面人 — executive sheen
  'edu-survivor':    'shaonv',   // 教培劫余 — gentle, tired, hopeful
  'mcn-grinder':     'shaonv',   // 网红打工人 — bright, performative
  'bj-drift':        'qingnian', // 北漂 — neutral, weary narrator
  'sh-yuppie':       'yujie',    // 沪漂精致 — sultry, performative class
  'sz-money-chaser': 'badao',    // 深漂搞钱党 — sharp hustle voice
  'hz-internet-kid': 'qingse',   // 杭漂 — earnest 杭州 young-tech voice
  'cd-zen':          'qingse',   // 成都摆烂派 — easygoing, content
  'escape-overseas': 'yujie',    // 海外润人 — knowing, half-checked-out
};

// ────────────────────────────────────────────────────────────────────
// v1.3.2 — Archetype-aware HR PUA hooks.
//
// When the user enters fired chat, the server reads their stored
// profile (via X-User-Id), looks up the archetype, and injects the
// matching weak-spot block into the HR system prompt. The demon
// personality uses these hooks to PUA the user's specific psychology
// — same scenario, vastly different play depending on who you are.
//
// Each entry has:
//   intro — one-line context the LLM gets ("this employee is X type")
//   ammo  — 3-4 specific PUA tactics tuned to that archetype's
//           psychological soft spots
// ────────────────────────────────────────────────────────────────────

export interface ArchetypeWeakSpots {
  intro: string;
  ammo: string[];
}

export const ARCHETYPE_WEAK_SPOTS: Record<string, ArchetypeWeakSpots> = {
  grinder: {
    intro: '员工是典型卷王 — 工作狂,自我价值绑定在产出量上,但对"努力 vs 回报"很敏感。',
    ammo: [
      '"你这么拼,公司都看在眼里"(画饼让他继续拼)',
      '"你的产出量不达标"(直击他的自我价值核心)',
      '"再卷一个 quarter,下一轮股权肯定有你的份"(无中生有的承诺)',
      '反复说"你不是说要冲第一吗",激发胜负心',
    ],
  },
  slacker: {
    intro: '员工是摸鱼大师 — 表面 active 实际放空,被裁不冤但内心其实有羞耻感。',
    ammo: [
      '"你过去 3 个月的 Slack active 时间显示..."(假装有数据)',
      '"组里其他人都在加班帮你 cover"(用同事愧疚感施压)',
      '"你这种工作态度,下家也很难找"(行业 blacklist 暗示)',
      '"早签早走,免得记录上留下绩效差的痕迹"',
    ],
  },
  'sass-master': {
    intro: '员工是阴阳怪气王 — 嘴上不饶人,但其实需要 validation,被人无视会破防。',
    ammo: [
      '用最干瘪的官腔回应他的尖刻("我注意到你的反馈,记录在案")',
      '说"你的态度问题已经反馈给业务线"(让他觉得言论被监视)',
      '"你这种风格不适合我们的企业文化"(本质上不能反驳)',
      '完全无视他的段子,继续走流程,让他自讨没趣',
    ],
  },
  pleaser: {
    intro: '员工是老好人 — 极度怕拒绝别人,被裁会怀疑自己不够好,容易被情绪绑架。',
    ammo: [
      '"如果你今天闹大了,你的同事可能也保不住"(用集体绑架)',
      '"我们也很为难,你能不能体谅一下我们 HR 的难处?"',
      '"你走得越平和,reference 就越好"(用未来威胁现在)',
      '"你比谁都明白事理,签了大家都好"',
    ],
  },
  nihilist: {
    intro: '员工是厌世派 — 已经躺平,要的是"快点结束这一切",拒绝深谈。',
    ammo: [
      '"你也不想纠缠下去吧,签了就解脱了"',
      '"按你的态度,仲裁也赢不了,何必呢"',
      '加快流程,降低预期,快速 close out',
      '"反正你也没什么野心,这点钱也够生活了"',
    ],
  },
  'show-pony': {
    intro: '员工是显眼包 — 极度依赖被关注,被边缘化是最大恐惧。',
    ammo: [
      '"公司决定让你低调离开,不要发任何朋友圈"(剥夺他展示的舞台)',
      '"你的 LinkedIn 更新可能会影响 reference"(威胁他的形象资产)',
      '"我们建议你不要告诉团队你被裁了"(隔离他)',
      '"你过去一年的高 visibility 可能是 over-engineering"',
    ],
  },
  'anti-grinder': {
    intro: '员工是反卷青年 — 知法懂法,但也容易被陌生流程吓到。',
    ammo: [
      '"按公司新政策,你这种情况属于 R2 级,赔偿封顶 N+0.5"(假规则)',
      '"我们已经走完内部审批流程了"(快速既成事实)',
      '"你想走仲裁可以,但流程要 6-12 个月"(用时间消耗他)',
      '用大量 HR 黑话淹没他,让他无法对焦核心争议',
    ],
  },
  'drama-queen': {
    intro: '员工是戏精 — 情绪化,容易激动后失态,谈判时容易乱了节奏。',
    ammo: [
      '保持冷漠,用"事实"对冲他的情绪("数据显示...")',
      '"你这样情绪化,我们没办法继续谈"(让他自我审查)',
      '"你的言论会被记录到 separation file"(冷处理威胁)',
      '主动暂停谈判,让他冷静再约第二次,消耗他能量',
    ],
  },
  'iron-maiden': {
    intro: '员工是拼命三娘 — 把自我价值绑在"我值得",最怕被否定能力。',
    ammo: [
      '"你的产出确实多,但 quality 评估下来 below bar"(承认数量否定质量)',
      '"团队反馈你的 mentor 风格让新人有压力"(用她最爱的"带新人"反咬)',
      '"你这种 110% 投入的工作方式,我们其实更担心你的健康"(假关心,实贬低)',
      '"按你的能力本可以更高 level,但你似乎不擅长向上管理"',
    ],
  },
  veteran: {
    intro: '员工是老油条 — 知道公司套路,但也有"这次也能混过去"的侥幸。',
    ammo: [
      '"这次跟以前不一样,集团新 CEO 要求严格走流程"',
      '"你过去那些 workarounds 都被审计标记了"(假危言)',
      '搬出他不认识的高层名字让他判断不出虚实',
      '"我们今天的对话有 legal 在远程旁听"(压人)',
    ],
  },
  'deck-wizard': {
    intro: '员工是 PPT 王者 — 重形式甚于实质,被攻击"PPT 之外什么都没做"会破防。',
    ammo: [
      '"过去两年的 deck 我都看过,实际落地的不到 30%"',
      '"你做 PPT 的时间应该花在 execution 上"',
      '"业务线反馈你的 deliverable 都是包装"',
      '"你的方法论很好听,但 ROI 接近零"',
    ],
  },
  ghost: {
    intro: '员工是隐形人 — 长期低存在感,被裁通常没人帮他说话,也最不会反抗。',
    ammo: [
      '"很多同事其实没注意到你的工作"(挖空他的存在感)',
      '"这次裁员就是常规减员,不要有心理负担"(降低他维权动力)',
      '快速走流程,趁他没反应过来就签字',
      '"按你的低 visibility,跳槽 reference 也不会很有力"',
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  // v2.0.0 — weak-spot tables for the 12 new region/industry archetypes.
  // ammo tuned to each tribe's specific anxieties (国企 lifer fears
  // losing stability; 大厂螺丝钉 fears age 35; 海外润人 fears visa-by-job).
  // ──────────────────────────────────────────────────────────────────
  'soe-lifer': {
    intro: '员工是国企铁饭碗 — 求的就是稳定,出体制外的世界对他/她是地狱。被踢出"系统内"的恐惧最大。',
    ammo: [
      '"出了这个门口,你的工龄/职级在外面一文不值"',
      '"现在转人才市场,你这个年纪很难再回事业单位"',
      '"档案放在我们这儿,出去找工作还是要回来调"',
      '"五险一金 + 公积金的差距,3 年就拉开 20 万"',
    ],
  },
  'faang-cog': {
    intro: '员工是大厂螺丝钉 — 习惯了高薪 + 流程化工作,跳出体系等于面对"35 岁危机"。',
    ammo: [
      '"你的技能栈就是 X 公司内部的 framework,外面用不到"',
      '"34 这个年纪,猎头打电话的频次已经在下降了"',
      '"先签 N+1,免得 background check 时被标记 PIP"',
      '"小厂哪有这么完整的福利,试试就回来"',
    ],
  },
  'startup-cowboy': {
    intro: '员工是创业老炮 — 见过太多裁员了,反而最难 PUA。攻击点是"你都几岁了还在创业?"',
    ammo: [
      '"你简历上 3 年换 3 家初创,大公司会觉得你不稳定"',
      '"期权这东西就是纸,你不是不知道"',
      '"再开下一家?38 岁拉投资人 deck 太难了"',
      '"我们清算下,期权按 0.1 倍发放"',
    ],
  },
  'finance-suit': {
    intro: '员工是金融体面人 — 自我形象绑定在"年薪""bonus""title"上,被剥离体面感即崩。',
    ammo: [
      '"裁员名单里你 title 最高,这个走出去不好看"',
      '"年终 bonus 按 pro-rata 算,不到正常的 30%"',
      '"行业现在是甲方市场,投行 / PE 都在收缩"',
      '"建议你接 outplacement,简历放包装公司"',
    ],
  },
  'edu-survivor': {
    intro: '员工是教培劫余 — 经历过双减大屠杀,对"行业政策"和"再就业"都极度敏感。',
    ammo: [
      '"教培行业已经收缩到 30%,你下一份不一定好找"',
      '"考公考编年纪卡 35 岁,你现在 32 了"',
      '"我们给的赔偿其实已经超过《劳动合同法》最低标准"',
      '"组里全裁,你不签别人也走不了"(用集体压力)',
    ],
  },
  'mcn-grinder': {
    intro: '员工是网红打工人 — 数据驱动型选手,KPI 没达成就承担"个人能力问题"的标签。',
    ammo: [
      '"上个季度你的账号涨粉只完成 60%,这是硬数据"',
      '"GMV 没到,bonus 自然没有,赔偿按基础工资算"',
      '"账号的人设是公司 IP,你走了不能带走粉丝"',
      '"行业里离开 MCN 的 KOL 90% 起不来"',
    ],
  },
  'bj-drift': {
    intro: '员工是北漂 — 户口 / 房子 / 婚恋 / 父母都还没解决,失业 = 失去全部支撑。',
    ammo: [
      '"你这个工资没了,房租下个月怎么交?"',
      '"集体户口转出去,你这个年纪很难再回北京"',
      '"找工作至少 3 个月,3 个月没社保你户口怎么办?"',
      '"父母都指望你寄钱回去,这事告诉他们就难过了"',
    ],
  },
  'sh-yuppie': {
    intro: '员工是沪漂精致 — 在意"面子"+ 朋友圈格调,被裁等于"失去精致生活的资本"。',
    ammo: [
      '"你那间陆家嘴附近的公寓房租很高吧,失业还能撑几个月?"',
      '"猎头打电话第一句就问上家原因,你怎么回?"',
      '"周末 brunch 和 manner 都是要钱的,你这个状态…"',
      '"圈子里大家都知道公司在裁员,你的下家不会更好"',
    ],
  },
  'sz-money-chaser': {
    intro: '员工是深漂搞钱党 — 务实派,直接谈钱反而最有效。少废话多 offer。',
    ammo: [
      '"赔偿按 N,签了下午就能到账"',
      '"再谈到 N+1 我们这边走流程要 3 个月,你撑得起 3 个月空窗吗?"',
      '"行业现在 1 个 HC 对 100 份简历,你的 ROI 自己算"',
      '"副业再多也补不上主业断掉这块"',
    ],
  },
  'hz-internet-kid': {
    intro: '员工是杭州互联网青年 — 阿里系/字节系花名思维深入骨髓,对"价值观"反应强烈。',
    ammo: [
      '"你的 365 评估,价值观维度 3.25,这不是个高分"',
      '"业务线对你的反馈是『努力但不够 owner sense』"',
      '"我们这边其实给你留过名额,但最近一次 review 没过"',
      '"出了杭州互联网圈,你的花名思维其他公司不接受"',
    ],
  },
  'cd-zen': {
    intro: '员工是成都摆烂派 — 本来就不爱卷,但被攻击"你不努力是事实"会有失业的耻感。',
    ammo: [
      '"你这两年 KPI 一直在末尾,这是事实"',
      '"成都的工作机会其实不多,薪资也低"',
      '"我们 N 已经给了,你再争 N+1 就是不识抬举"',
      '"火锅店和茶馆是开心,但每月 8000 块的支出哪来?"',
    ],
  },
  'escape-overseas': {
    intro: '员工是海外润人 — 计划润出去但还没走成,工作签证 / 收入证明都是抓手。',
    ammo: [
      '"签证申请要 6 个月在职证明,你现在断了,材料就废了"',
      '"裁员记录会留在 background check 里,海外公司能查到"',
      '"你雅思托福考完了吗?没考完先别冲动"',
      '"先签 N,拿着钱再润,不要冲突影响推荐信"',
    ],
  },
};

