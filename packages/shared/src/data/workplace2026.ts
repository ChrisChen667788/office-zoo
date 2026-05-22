/**
 * 2026 职场新痛点段子库 — v6.3.0.
 *
 * Why a new file (vs amending jargon.ts):
 *  - jargon.ts 是经典阿里黑话词库, 2-4 字短语
 *  - 这里是 2024-2026 涌现的"新型坑" + 完整段子, 25-60 字, 有起承转
 *  - 分类按"用户痛点"而不是"词性", LLM prompt 可以按情境召回
 *  - 单独文件方便后续按"季度更新" — 每季度新热点单 PR 添加
 *
 * 使用方式:
 *  - server agents 在 generateSpeech 之前 30% 概率注入 1-2 条 (按
 *    archetype tag 匹配) → 让 AI 发言不只重复阿里黑话, 还会引用
 *    "调休骗局" / "AI 替代焦虑" 这类时代新痛点
 *  - dailyDrama 选 teaser line 时优先从这里挑, 比通用 jargon 共鸣高
 *
 * 收录原则:
 *  - 必须是 2023+ 普遍出现的现象 (避免上一代痛点重复)
 *  - 段子化收敛 — 不是吐槽贴, 是包袱
 *  - 不指名公司 / 个人 (法务安全)
 *  - 中等长度, 25-60 字最易 LLM 自然引用 + 用户截图分享
 */

export type Pain2026Tag =
  | 'kpi-theatre'     // KPI / OKR 戏剧 — 数字游戏
  | 'ai-anxiety'      // AI 替代焦虑
  | 'rest-trap'       // 调休 / 加班 / 强制陪伴
  | 'fake-care'       // HRBP "关心" / 强制谈话
  | 'gradient'        // 35 岁 / 优化 / 毕业话术
  | 'side-hustle'     // 副业 / 灵活就业 / 网约车
  | 'fake-team'       // 团建 / 强制摄像头 / 仪式感
  | 'ritual'          // 月饼 / 工牌 / 工龄 P 图
  | 'gen-z-rebel';    // 00 后整顿 / 反向背调

export interface PainSnippet {
  /** Stable id for memory dedup if we ever cite a specific one. */
  id: string;
  tag: Pain2026Tag;
  /** The bit itself — 25-60 字, 第一人称 OR 第三人称都 OK. */
  text: string;
  /** Optional archetype affinity — when set, LLM prompt is more likely
   *  to inject for this personality. Empty = universal. */
  archetypeAffinity?: string[];
}

export const PAIN_2026: PainSnippet[] = [
  // ─────────────────── KPI 戏剧 ───────────────────
  {
    id: 'k01', tag: 'kpi-theatre',
    text: 'KPI 完成 120%, 老板说"基线设低了, 明年翻倍"。我说翻倍可以, 工资也翻倍吗。会议室突然全员失声。',
    archetypeAffinity: ['hot_tempered', 'contrarian'],
  },
  {
    id: 'k02', tag: 'kpi-theatre',
    text: 'OKR 评审, 我说"O 完成了 KR 没完成", HR 笑着说"那就是 O 也没完成"。这道数学题我至今没解开。',
  },
  {
    id: 'k03', tag: 'kpi-theatre',
    text: '周报系统接入 AI 总结后, 我的周报被打回了, 评语是"AI 味儿太重"。',
    archetypeAffinity: ['sass_master', 'passive_aggressive'],
  },
  {
    id: 'k04', tag: 'kpi-theatre',
    text: '"用 OKR 不用 KPI 我们是结果导向公司" — 翻译: 同时考核过程 + 结果, 双倍内卷。',
  },

  // ─────────────────── AI 替代焦虑 ───────────────────
  {
    id: 'a01', tag: 'ai-anxiety',
    text: '老板说"用 AI 提效", 然后给我加了 3 倍工作量。我用 AI 是为了少加班, 不是为了让你看见更多空闲时间。',
    archetypeAffinity: ['hot_tempered', 'sass_master'],
  },
  {
    id: 'a02', tag: 'ai-anxiety',
    text: '我把 ChatGPT 答案复制到群里, 老板说"你这思路不错", 我说"那是 GPT 的"。老板说"那你也学会借势了"。',
  },
  {
    id: 'a03', tag: 'ai-anxiety',
    text: '"AI 不会取代你, 但会用 AI 的人会取代你" — 后半句来自一个三天没用 AI 写过周报的人。',
    archetypeAffinity: ['contrarian'],
  },
  {
    id: 'a04', tag: 'ai-anxiety',
    text: '面试官问"你 AI 用得怎么样", 我演示了一下 Cursor, 他说"那我们要你做啥"。我也想问。',
  },

  // ─────────────────── 调休 / 加班 / 强制陪伴 ───────────────────
  {
    id: 'r01', tag: 'rest-trap',
    text: '"五一调休" = 借两天给你, 让你欠四天。这是高利贷数学。',
    archetypeAffinity: ['sass_master', 'contrarian'],
  },
  {
    id: 'r02', tag: 'rest-trap',
    text: '老板凌晨 1 点发消息说"不用马上回, 明天上午看到就行", 11 小时后说"怎么这么晚才回"。',
    archetypeAffinity: ['passive_aggressive'],
  },
  {
    id: 'r03', tag: 'rest-trap',
    text: '"弹性工作制" 三个版本: 弹来不弹去, 弹晚不弹早, 弹周末不弹工作日。',
  },
  {
    id: 'r04', tag: 'rest-trap',
    text: '请年假, 上司问"你不在这几天的工作怎么 cover?" — 我心想这就是你存在的意义吧?',
    archetypeAffinity: ['hot_tempered'],
  },

  // ─────────────────── HRBP 关心 / 强制谈话 ───────────────────
  {
    id: 'c01', tag: 'fake-care',
    text: 'HRBP 约我"喝个咖啡聊聊近况", 进会议室才发现还有我老板的老板。这咖啡得喝多甜才能盖过去。',
    archetypeAffinity: ['smooth_operator', 'passive_aggressive'],
  },
  {
    id: 'c02', tag: 'fake-care',
    text: 'HR 说"我们公司是不打卡文化", 翻译: 你不知道什么时候算迟到, 但每次都算。',
  },
  {
    id: 'c03', tag: 'fake-care',
    text: '心理咨询 EAP, 第一次咨询我提到压力来源是组织架构调整, 第二周架构又调整了, 把咨询师裁了。',
  },

  // ─────────────────── 35 岁 / 优化 / 毕业话术 ───────────────────
  {
    id: 'g01', tag: 'gradient',
    text: '"我们不是裁员, 是组织升级。" — 升级后老员工被退役, 一周后岗位重新挂出来, 用着同一个 JD。',
    archetypeAffinity: ['sass_master', 'contrarian'],
  },
  {
    id: 'g02', tag: 'gradient',
    text: '"毕业" — 这个词被发明出来时, 用的人没意识到大学毕业的人是去找工作, 不是去找下家。',
  },
  {
    id: 'g03', tag: 'gradient',
    text: '被"邀请离职", 我说我可以再考虑, HR 说"邀请只接受一次, 不像快递重发"。礼貌得令人发凉。',
    archetypeAffinity: ['passive_aggressive'],
  },
  {
    id: 'g04', tag: 'gradient',
    text: '35 岁危机不是"35 岁后突然没机会", 而是"35 岁前所有公司都告诉你抓紧 35 岁前往上爬", 然后 36 岁那天起没人接你电话。',
  },

  // ─────────────────── 副业 / 灵活就业 ───────────────────
  {
    id: 's01', tag: 'side-hustle',
    text: '同事说"我下班开网约车", 我以为他在搞副业, 后来才知道他在体验下一份正职。',
  },
  {
    id: 's02', tag: 'side-hustle',
    text: '"灵活就业" — 灵活的是你被剥削的方式, 不是你的时间。',
    archetypeAffinity: ['contrarian'],
  },
  {
    id: 's03', tag: 'side-hustle',
    text: '副业做小红书博主, 接到推广才发现品牌方就是我前老板, 让我推广的是我前同事开发的产品, 我现在不知道是该接还是该拒。',
  },

  // ─────────────────── 团建 / 强制摄像头 / 仪式感 ───────────────────
  {
    id: 'f01', tag: 'fake-team',
    text: '"团建是为了拉近距离", 但坐我旁边的人从入职到现在都没记得我名字。',
    archetypeAffinity: ['introvert'],
  },
  {
    id: 'f02', tag: 'fake-team',
    text: '远程会议强制开摄像头, 老板说"这样有仪式感"。我说"那您也开一下", 他说"我这边光线不好"。',
    archetypeAffinity: ['sass_master', 'passive_aggressive'],
  },
  {
    id: 'f03', tag: 'fake-team',
    text: '团建出去玩, 老板买单 800 元 / 人, 折算每个人加班时长后, 团建是亏的。',
  },

  // ─────────────────── 月饼 / 工牌 / 工龄 P 图 ───────────────────
  {
    id: 't01', tag: 'ritual',
    text: '中秋月饼, 管理层一盒八块, 员工一块。员工说"这饼够分", 管理层说"这饼不够吃"。',
    archetypeAffinity: ['sass_master'],
  },
  {
    id: 't02', tag: 'ritual',
    text: '入职给的工牌挂绳已经用了 5 年, 中间换了 3 个老板, 但挂绳没换。这绳比我合同稳定。',
  },
  {
    id: 't03', tag: 'ritual',
    text: '"我们公司有 100% 的工龄福利, 满 10 年送一个金牌", 翻译: 没人在我们公司待过 10 年。',
  },

  // ─────────────────── 00 后整顿 / 反向背调 ───────────────────
  {
    id: 'z01', tag: 'gen-z-rebel',
    text: '"00 后整顿职场" — 实际上他们只是在做你 90 后入职时想做没敢做的事。',
    archetypeAffinity: ['hot_tempered', 'contrarian'],
  },
  {
    id: 'z02', tag: 'gen-z-rebel',
    text: '00 后实习生 email 写"老板您好", 老板说"叫我哥", 第二天 email "哥您好"。哥的工资还没他可怜。',
  },
  {
    id: 'z03', tag: 'gen-z-rebel',
    text: '面试结束我反问 HR 加班情况, 她说"我们这边以结果为导向", 我说"那就是 996 吧", 她说"年轻人不要把时长当工作"。',
    archetypeAffinity: ['contrarian'],
  },
  {
    id: 'z04', tag: 'gen-z-rebel',
    text: '反向背调老板已经成实习生标配, 实习生看完老板朋友圈说"风险太大, 不接 offer 了"。',
  },
];

/** Per-archetype affinity helper — for `BaseAgent` to bias snippet
 *  selection to ones the personality would actually quote. */
export function snippetsForArchetype(archetype: string, k = 2): PainSnippet[] {
  const tagged = PAIN_2026.filter((s) => s.archetypeAffinity?.includes(archetype));
  const untagged = PAIN_2026.filter((s) => !s.archetypeAffinity);
  // 70% from archetype-affined pool, 30% universal
  const pool = Math.random() < 0.7 && tagged.length > 0 ? tagged : untagged;
  // Shuffle-pick k
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, k);
}

/** Total count — for telemetry / version sanity. */
export function paintLibSize(): number {
  return PAIN_2026.length;
}
