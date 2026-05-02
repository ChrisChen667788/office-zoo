/**
 * Seed scripts for the 班味单口 (Workplace Standup) mode — v0.7.0.
 *
 * 30 hand-curated bits covering common 打工人 pain points: 加班 / 周报 / KPI /
 * PUA / 35 岁危机 / 摸鱼 / 阿里黑话 / 老板 / HR. The roster is intentionally
 * topical so a returning user sees something fresh every visit, but small
 * enough that a single LLM regeneration round can't blow them all up.
 *
 * Each script carries:
 *   - id            stable key for the seed (also used as script SHA in URL)
 *   - title         shown in the /talkshow grid as the card headline
 *   - tag           single-word category for the filter chips
 *   - persona       which Minimax voice the comedian should use
 *   - durationSec   target spoken duration (drives the suggested rate hint)
 *   - text          the actual bit (Setup → Punchline → Tag, ~120-260 字)
 *
 * Adding a new script: append to SEED_SCRIPTS, mint a new id with a
 * monotonic suffix (`bit-031`, `bit-032`, ...). The talkshow route page
 * pulls the list as-is, no migrations needed.
 */

export type TalkshowTag =
  | 'overtime'    // 加班 / 周报 / 早会
  | 'kpi'         // KPI / OKR / 绩效
  | 'pua'         // PUA / 画饼 / 老板话术
  | 'age'         // 35 岁 / 中年 / 转型
  | 'slacking'   // 摸鱼 / 划水
  | 'jargon'      // 阿里黑话 / 互联网词汇
  | 'hr'          // HR / 裁员 / 入职
  | 'boss'        // 老板 / 高管
  | 'meta';       // 自嘲 / 行业观察

/**
 * Voice persona — maps to a Minimax `voice_id`. We keep a small curated
 * pool so each comedian has a distinct identity. See tts.ts MINIMAX_VOICE_MAP
 * for the full catalogue.
 */
export type TalkshowPersona =
  | 'shaonv'      // 少女 — bright, chipper
  | 'yujie'       // 御姐 — sultry, sarcastic
  | 'qingse'      // 青涩 — earnest, junior
  | 'jingying'    // 精英 — sharp, manager
  | 'badao'       // 霸道 — boss, authoritative
  | 'qingnian';   // 青年 — neutral, narrator

export interface TalkshowScript {
  id: string;
  title: string;
  tag: TalkshowTag;
  persona: TalkshowPersona;
  /** Target spoken duration in seconds — informs Minimax `speed` hint. */
  durationSec: number;
  text: string;
}

export const SEED_SCRIPTS: TalkshowScript[] = [
  {
    id: 'bit-001',
    title: '我的周报跟我老板的 OKR 没对齐',
    tag: 'overtime',
    persona: 'qingse',
    durationSec: 35,
    text: '说一个我最近的悲伤故事。我每周五下班前要写周报,认真写,2000 字带数据图。结果上周一,老板把我叫进会议室,说我的周报 "跟他的 OKR 颗粒度没对齐"。我一愣,我说老板,我又不知道你的 OKR 长啥样。他说,你没看我转发的内网那篇么。我心想,你转发了 47 篇,我看哪一篇。最后他说,这就是你层级不够的证明,看不懂战略。我谢谢你啊,我层级是不够,但你层级够了不也让我加班到 11 点改周报。',
  },
  {
    id: 'bit-002',
    title: '35 岁那年我的简历被 AI 筛掉了',
    tag: 'age',
    persona: 'jingying',
    durationSec: 30,
    text: '35 岁那年我开始投简历,投了 200 份,0 个回音。我不甘心,跑去问做 HR 的朋友,她叹了口气,说兄弟,现在简历都是 AI 先筛,你 35 岁,系统直接归到 "高龄低性价比" 池。我说怎么改,她说要么改年龄要么改思路,我说我都 35 了思路怎么改。她说不是改思路,是改赛道,你去做副业,做自媒体,做 AI 数字人。我回去一查,做 AI 数字人需要会写代码、会做剪辑、会运营、还要长得好看。我心想,我要这么多技能我还来求你?',
  },
  {
    id: 'bit-003',
    title: '老板说"咱们一起拼一下"',
    tag: 'pua',
    persona: 'badao',
    durationSec: 28,
    text: '老板最爱说三个字 — 拼一下。年初拼一下,因为业务才起步;Q2 拼一下,因为竞争对手突然 all in;Q3 拼一下,因为离年终还有 90 天;Q4 拼一下,因为做业绩冲刺。我去年掐指算了一下,我一年拼了 365 天。我去年问老板,我们什么时候不拼?老板说,等我们拼到行业第一就不拼了。我说我们已经第一了。他说,我们要再拼到亚洲第一。我心想,我妈让我考个公务员我没听,我活该。',
  },
  {
    id: 'bit-004',
    title: 'HR 给我画了一个比月亮还大的饼',
    tag: 'hr',
    persona: 'shaonv',
    durationSec: 25,
    text: 'HR 给我画饼是真的有水平。她说我们公司六个月一调薪,看绩效。我说好,我去年绩效 3.75。她说哦,那个 3.75 不是普调的 3.75,那个是 "卓越组" 的 3.75,你属于 "良好组"。我说良好组多少调薪,她说良好组三年一调。我说三年一调那为什么招聘说六个月。她说那是吸引人才的话术,你都入职了你别钻字眼。我现在彻底悟了,招聘 JD 跟相亲简历一样,看看就好,千万别认真。',
  },
  {
    id: 'bit-005',
    title: '我在公司学到的最重要的事',
    tag: 'jargon',
    persona: 'qingse',
    durationSec: 22,
    text: '我在公司三年学到了三件最重要的事。第一,把 "我不会" 翻译成 "这事儿我可以拉通对齐一下"。第二,把 "我搞砸了" 翻译成 "这次我们沉淀了一些反向经验"。第三,把 "我想跑路了" 翻译成 "我在思考下一阶段的成长曲线"。学会这三句你就发现,公司也没那么糟,糟的是我们听到的所有话都需要翻译。',
  },
  {
    id: 'bit-006',
    title: '深夜茶水间发现的真相',
    tag: 'slacking',
    persona: 'yujie',
    durationSec: 26,
    text: '昨天晚上 11 点我去茶水间倒水,撞见我们 CEO 在那里站着喝咖啡,一个人,看着窗外。我心想,坏了,这是不是要裁我了。我硬着头皮上去打招呼,我说老板您还没下班。他幽幽地说,我也想下班,但我下班了你们就更敢摸鱼了。我愣了三秒,我说老板您这觉悟是真的高。他说哪是觉悟,是我老婆嫌我回家早。',
  },
  {
    id: 'bit-007',
    title: '我们部门的考核维度有 17 个',
    tag: 'kpi',
    persona: 'jingying',
    durationSec: 30,
    text: '今年我们部门绩效改革,新增了 17 个考核维度。包括但不限于:工作产出、协作效率、向上汇报、向下管理、跨部门拉通、长期主义、即时反应、战略前瞻、客户视角、CEO 视角、第二曲线贡献、内部分享次数、博客发文质量,还有一个我至今没看懂叫 "心力浓度"。我去问 HR 心力浓度怎么算,HR 说这个由你 leader 主观评分。我说那不就是看脸吗。HR 看了我一眼说,看脸不行吗你脸还行。',
  },
  {
    id: 'bit-008',
    title: '裁员名单里没有我我反而委屈',
    tag: 'hr',
    persona: 'qingnian',
    durationSec: 24,
    text: '上周我们部门裁了一批,N+1 给得很爽快。我居然没在名单里。本来该庆幸,结果一周下来我开始委屈 — 公司是不是觉得 N+1 给我都不值。同事拿了 8 个月赔偿,买了机票去大理疗伤;我留下来,接他没干完的活,薪水不变。这是哪门子幸运啊,这分明是 "你性价比太高,公司舍不得放走你"。我现在祈祷我的 HR 终于发现我也很贵。',
  },
  {
    id: 'bit-009',
    title: '互联网公司的称呼鄙视链',
    tag: 'jargon',
    persona: 'shaonv',
    durationSec: 22,
    text: '我们公司有一个隐形的称呼鄙视链。叫你 "同学" 的是平级,礼貌但有距离。叫你 "兄弟" 的是想用兄弟感情让你加班。叫你 "老 X" 的,X 是你姓,这是装熟。叫你全名的是心情不好,要骂人了。叫你工号的,赶紧准备简历吧,人家已经把你当数字了。',
  },
  {
    id: 'bit-010',
    title: '老板半夜在群里发消息',
    tag: 'overtime',
    persona: 'badao',
    durationSec: 26,
    text: '老板有个习惯,凌晨两点在工作群发消息。不 @ 任何人,但一定有人回。回的最快的那个,会被表扬 "深夜加班使命感强";回的慢一点的,被默默记下;不回的,不存在,因为他们已经睡了,睡了就是没有上进心。我现在的解法是 — 我把消息免打扰开了,但我老婆把消息免打扰关了。她负责接收,我负责回复。我俩配合无间,老板最近说我们家庭有狼性。',
  },
  {
    id: 'bit-011',
    title: '入职第一天 HR 让我签了 17 份文件',
    tag: 'hr',
    persona: 'shaonv',
    durationSec: 23,
    text: '入职第一天,HR 让我在 17 份文件上签字。我问她这都是啥,她笑着说哎呀都是常规的,你随便签。我心想随便?这可是我下半生的依据啊。我硬着头皮翻,看到第 12 页有一行小字写 "员工同意公司因业务调整变更工作地点至大兴 / 通州 / 燕郊"。我说这条能改吗,HR 脸色一凉说,你刚入职就想这么远啊。我现在懂了,职场最大的陷阱不是签合同那一刻,而是你不敢看合同那一刻。',
  },
  {
    id: 'bit-012',
    title: '我的产品经理只会说一句话',
    tag: 'jargon',
    persona: 'qingnian',
    durationSec: 20,
    text: '我们部门的产品经理是一个奇人。她每次开会只会说一句话 — "我们要不要再对齐一下"。需求没说清楚,对齐一下;需求说清楚了,对齐一下;开发都做完了,对齐一下;上线一周后用户反馈不好,对齐一下。我现在听到 "对齐" 两个字就胃痛。我建议公司把对齐这个词也对齐一下,对齐成 "我也不知道,你看着办"。',
  },
  {
    id: 'bit-013',
    title: '为什么我从不在群里说"收到"',
    tag: 'meta',
    persona: 'yujie',
    durationSec: 21,
    text: '我从不在工作群说 "收到" 两个字。原因有三:第一,我没收到我也得回收到,这话本身就空;第二,你回了收到老板就觉得你在线,半小时后他能再发一条新任务;第三,大家都回收到的时候你回收到没人记得你,你不回反而显眼,显眼就有印象,有印象就不被裁。这就是我的职场玄学。',
  },
  {
    id: 'bit-014',
    title: '老板送我的那本《原则》我没读完',
    tag: 'boss',
    persona: 'qingse',
    durationSec: 24,
    text: '我老板特别爱送书。去年送我《原则》,前年送《高效能人士的七个习惯》,大前年送《活法》。三本我都没读完。我老板今年问我读到哪了,我说读到 "拥抱透明" 那一节。他眼睛一亮,说怎么样有启发吗?我说有,我准备透明地告诉您 — 我打算辞职。他沉默了三秒,说《原则》第 134 页讲了 "拒绝离职就是不忠诚"。我心想这书我连封面都没翻开过,你倒背得挺熟。',
  },
  {
    id: 'bit-015',
    title: '远程办公居然比加班还累',
    tag: 'overtime',
    persona: 'jingying',
    durationSec: 23,
    text: '我们公司允许远程办公,我兴冲冲申请了一周。结果发现远程比通勤还累。早上 8 点 30 老板第一个钉钉 "在不",中午 12 点周会,下午 3 点老板视频抽查,晚上 9 点还有总结会。整整一天我都在 "我证明我在线" 的循环里。最后我跟老板说我下周回办公室,老板说为什么,我说因为办公室至少没人能 24 小时盯着我。',
  },
  {
    id: 'bit-016',
    title: '我妈以为我在大厂很风光',
    tag: 'meta',
    persona: 'shaonv',
    durationSec: 22,
    text: '我妈以为我在大厂上班特别风光。每次过年回家,她跟邻居炫耀,说我儿子在大厂,工资高,管理岗。其实我工资刚够还房贷,管理岗就是 "管自己的事不让老板知道"。但我从不揭穿。因为我一旦揭穿,我妈就会说,那你回老家考公务员吧。我宁可让她相信我风光,我也不愿意回老家天天被催。',
  },
  {
    id: 'bit-017',
    title: '我们部门的"狼性培训"',
    tag: 'pua',
    persona: 'badao',
    durationSec: 26,
    text: '我们部门上周搞狼性培训。HR 把我们拉到郊区,做团建。第一个项目叫 "悬崖跳水"。我说我恐高,HR 说狼性就是克服恐惧。第二个项目叫 "深夜野外生存",我说我血糖低,HR 说狼性就是克服身体。第三个项目叫 "互相喊出对方缺点",我喊我老板自私,HR 说狼性也要克服上下级。我心想,你们说狼性,但实际上你们要的是 "听话又能吃苦的牛"。',
  },
  {
    id: 'bit-018',
    title: 'Offer 谈薪水的最后一秒',
    tag: 'hr',
    persona: 'yujie',
    durationSec: 21,
    text: '我跟新公司谈薪水谈到最后一秒,HR 说我们最高只能给到 28k。我说 28k 我同意。她突然又说,但是我们 13 薪。我说 13 薪也行。她说但是绩效系数 0.8 起。我说 0.8 也行。她说但是试用期 6 个月,4.5 折。我说……行。最后我入职那天发现,她给我的 offer 是 22k 13 薪 0.8 系数 6 个月 4.5 折。我突然懂了,她不是在谈 offer,她是在表演 "如何把面包切成 7 份"。',
  },
  {
    id: 'bit-019',
    title: '为什么我们公司天天庆祝',
    tag: 'meta',
    persona: 'qingnian',
    durationSec: 22,
    text: '我们公司文化是 — 永远在庆祝。Q1 庆祝 "首战告捷",Q2 庆祝 "中场反弹",Q3 庆祝 "突破极限",Q4 庆祝 "完美收官"。一年四季都在嗨,但我的工资一年涨 3%。我现在悟了,庆祝是廉价的,涨薪才是真的。一杯气泡水 + 半小时鼓掌,比 5% 加薪便宜多了。',
  },
  {
    id: 'bit-020',
    title: '我把"福报"两个字屏蔽了',
    tag: 'jargon',
    persona: 'shaonv',
    durationSec: 20,
    text: '从去年开始,我把工作群所有 "福报"、"使命"、"改变世界" 这些词都关键词屏蔽了。屏蔽完发现,工作群一天少了 80% 的消息。剩下的 20% 都是 "明天 9 点会议室开会"。我突然意识到 — 原来公司一直在用宏大叙事掩盖琐碎的命令。',
  },
  {
    id: 'bit-021',
    title: '00 后整顿职场的小李',
    tag: 'meta',
    persona: 'qingse',
    durationSec: 24,
    text: '我们公司新来的 00 后小李,真的是来整顿职场的。第一天就跟老板说 "我合同上写下午 6 点下班,我现在 6 点了"。第二天老板让她周末加班,她说 "周末是我恢复体力的时间,加班影响周一产出"。第三天老板批评她效率不高,她说 "效率不高是因为流程冗长,我建议优化流程"。一周后老板辞退了她,赔偿 N+1。她拿着钱去了三亚,在朋友圈发文 "提前退休"。我们组现在没有人敢说自己是整顿职场的了,我们只敢偷偷羡慕。',
  },
  {
    id: 'bit-022',
    title: '我跟老板的 1 on 1',
    tag: 'boss',
    persona: 'jingying',
    durationSec: 23,
    text: '每个月跟老板 1 on 1。第一个月,老板说 "你做得很好,继续保持"。第二个月,"你需要再 stretch 一下"。第三个月,"你的产出跟同级比差了点意思"。第四个月,"我对你有点失望"。第五个月没了,因为老板被裁了。新老板第一次 1 on 1 说 "我看你 KPI 不错,继续保持"。我突然懂了 — 1 on 1 的关键不是你做了什么,是你坐在哪个老板对面。',
  },
  {
    id: 'bit-023',
    title: '关于摸鱼的最高境界',
    tag: 'slacking',
    persona: 'yujie',
    durationSec: 21,
    text: '摸鱼有 3 个境界。初级:开多个屏幕,左屏看剧右屏假装写代码;中级:在群里活跃,频繁 @ 老板,营造 "我很忙" 的氛围;高级:周报写得感人,实际啥也没干,但你的方法论值钱。我目前在中级,我同事在高级。她每周周报写 4000 字,叙事极强,老板每次看完都拍案叫绝,然后她下班准时 18:00 走。我去她工位偷瞄,她屏幕上是淘宝。',
  },
  {
    id: 'bit-024',
    title: 'HR 跟我说她也有 KPI',
    tag: 'hr',
    persona: 'shaonv',
    durationSec: 22,
    text: 'HR 找我谈话,说公司今年要"减员增效",问我能不能"主动转型"。我说什么叫主动转型,她说就是接受调岗到大兴。我说大兴我每天通勤 3 小时。她说那你看着办。我后来才知道,HR 自己也有 KPI — 她要在年底前 "处理" 5 个员工。我突然觉得我们俩立场没那么对立了,她也是受害者,只是她的工具是我。',
  },
  {
    id: 'bit-025',
    title: '我的简历隔三差五就被 BOSS 直聘 ping',
    tag: 'age',
    persona: 'qingnian',
    durationSec: 21,
    text: '我每三天被 BOSS 直聘 ping 一次。点开看,都是猎头消息:"X 总,我这边有个机会非常匹配您。" 我点开机会一看,招聘要求 985+1k 个粉丝小红书+5 年大厂+愿意 996。Salary 写着 "面议"。我心想,猎头你别叫我 X 总,X 总不会接你这种活。我才是真正在找工作的,但你把我当大佬,大佬本来不缺工作。',
  },
  {
    id: 'bit-026',
    title: '为什么我开始养绿萝',
    tag: 'meta',
    persona: 'shaonv',
    durationSec: 18,
    text: '我开始在工位养绿萝,不是为了氧气。是因为我发现 — 公司只要你在工位,就觉得你在干活。绿萝需要每天浇水,我每天浇水 5 分钟,这 5 分钟我心安理得。绿萝是我职场最忠诚的伙伴 — 它不举报我,它不内卷我,它不在背后说我坏话。它只是默默活着,跟我一样。',
  },
  {
    id: 'bit-027',
    title: '加班餐的鄙视链',
    tag: 'overtime',
    persona: 'qingse',
    durationSec: 19,
    text: '加班餐是公司的隐形社交。点黄焖鸡的人 — 标准打工人,不值得拉拢;点轻食的人 — 注重身材,可能要跳槽;点贵价日料的人 — 部门有预算,值得搭话;点泡面的人 — 加班加到没力气,但人狠活儿好;什么都不点的人 — 老板,他不饿,他在看你们点了什么。',
  },
  {
    id: 'bit-028',
    title: '裸辞那天我无比清醒',
    tag: 'meta',
    persona: 'yujie',
    durationSec: 22,
    text: '我裸辞那天异常清醒。提交离职那一刻,我手不抖,心不慌。HR 问我为什么走,我说 "想休息一下"。她说 "现在裸辞风险很大"。我笑了,我说 "在你们这上班,风险更大"。我走出公司大楼,北京的阳光打在脸上。我吃了顿火锅,看了场电影,睡了 12 小时。三个月后我又入职了一家公司,加班一样狠。但那 3 个月,我至少明白了一件事 — 没你公司也转,但你不能没你自己。',
  },
  {
    id: 'bit-029',
    title: '为什么我从不参加团建',
    tag: 'pua',
    persona: 'badao',
    durationSec: 20,
    text: '团建有三宗罪。第一,占用我的周末,工资不增加;第二,玩游戏的时候必须跟老板假装很开心;第三,合影必须站 C 位附近,不站 C 位会被认为不合群。综合下来,团建是 "免费打工 + 加重表演"。所以现在每次团建邀请,我都说 "家里事多",家里没事我也说有事。我宁可在家撸猫,也不去酒店唱 K。',
  },
  {
    id: 'bit-030',
    title: '当我跟我爸说"班味"',
    tag: 'meta',
    persona: 'qingnian',
    durationSec: 24,
    text: '前几天回家,我跟我爸说我现在 "班味" 太重了。我爸 60 岁,在国企干了一辈子,听不懂。他问什么叫班味。我说就是上班久了,身上有种 "下班也甩不掉" 的疲惫感和油腻感。我爸沉默了一会儿,说,孩子,这不叫班味,这叫成年。我突然觉得我刚才说的话,不是吐槽公司,是吐槽长大本身。',
  },
];
