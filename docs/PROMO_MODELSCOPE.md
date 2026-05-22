# OFFICE ZOO · 班味剧场 — 魔搭社区主页发文模板

> 这份文档是给 https://www.modelscope.cn/profile/haozi667788 用的"爆款风格"营销文案。
> 包含 **中文版**(主推)+ **English 版**(供国际化 / 双语用户)+ 配套图片清单。
> 直接复制到魔搭主页 / 创空间 / 模型卡 Description 都能用。

> **2026-05-22 更新 v6.1**: 米哈游风 hero + 段子 UGC + 朋友拼版。
> 下文 Hook + 三句话已迭代为 v6.1 版本; 老 Hook 保留作历史备份。

---

## 🆕 v6.1 新 Hook (优先用)

> **9 个 AI 鼠人长成 5★ 角色卡, 替你在 0 点写字楼"拥抱变化"。**
>
> 米哈游 UI 风 + AI 跨局记仇 + 段子 UGC + 朋友拼版彩蛋。
> 全开源 MIT, docker compose 一键起 — 你的"班味元宇宙"就开张了。

### v6.1 三句话讲清楚

1. **米哈游 design 同款 UI** — 深紫宇宙底 + 5★ shimmer 角色卡 + EVENT pill +
   元素 chip (frost / inferno / stigma)。你看着像在抽卡, 实际上每张牌都是
   会跟你说阿里黑话的 AI 同事。
2. **它会跨局记你的仇** — pgvector + Stanford Smallville 风 reflection 层,
   你坑过哪个 AI, 下一局他第一句话就提你: "上次说我颗粒度不够, 还联合赵六
   投我出局, 这波闭环操作真是打得漂亮。"
3. **段子是大家共写的** — 任何人都能投稿自己的职场段子 (auto-moderation 过
   政治 / 公司点名 / 色情 / 暴力, 调侃 HR 婉辞全允许), 通过的进入月度精选,
   朋友帮你点赞, 月底 Top 5 上首页轮播。

---

## 🐀 中文版 · 一段 60 秒短视频脚本的写法

### 标题候选(挑 1 个,按平台调)

- **魔搭首页主推**:`AI 编了 24 种打工人,看看你是哪一种(然后你的"班味"还会变)`
- **抖音/小红书**:`「你属于 24 种打工人的哪一种?」AI 班味卡刷屏了`
- **B 站**:`我做了一个 AI 班味演化系统 · 24 种打工人会随你的玩法转世`
- **Twitter/X(英文区)**:`I built an AI office sim where your archetype evolves — and a chemistry-aware director writes a 5-act sitcom from your squad's mix`

---

### Hook 段(第一屏要的就是这 3 行)

> **0 点的写字楼,AI 鼠人替你拥抱变化,你回家躺平。**
>
> 24 种打工人 archetype + 演化机制 + 5 幕剧 AI 导演 + 真人音色 TTS。
> 全开源 MIT。装一下,你就有自己的"班味元宇宙"了。

---

### 三句话讲清楚是什么

1. **它不是 ChatGPT**。它是一个 React + Hono + Socket.IO 的"AI 职场情景剧"引擎,9 个 AI 鼠人在 2.5D 写字楼里互卷,真人音色 TTS,5 关速通《劳动合同法》。
2. **它会"知道你是谁"**。一份 10 题 quiz 测出你的 archetype(国企铁饭碗 / 大厂螺丝钉 / 北漂 / 沪漂 / 海外润人 ... 共 24 种),之后给你的剧情会按你的"行业 + 地区 + 6 维 trait"个性化。
3. **它会"看你变"**。每次玩裁员、攒局、写段子、闯关包,你的 trait 向量会漂移。漂得够多,archetype 会"转世" — 从"阴阳怪气王"变成"卷王",触发"🌀 你已演化为新人格"弹幕。

---

### 6 大卖点(配截图,每个一段)

#### 1. 你是哪种打工人?24 种 archetype,带"行业+地区"维度

> 不只是"卷王/摆烂",而是"杭州互联网青年(花名"小六",996 是天经地义)"或者"成都摆烂派(巴适得板,上班为了下班吃火锅)"。
>
> 测完之后给你的剧本、推送的段子、HR 的 PUA 话术,全都按你的 tribe 个性化。**国企用户和 FAANG 用户玩到的是两个不同的产品。**

📸 `assets/screenshots/03-profile.png`(你的班味卡 + region/industry chip)

#### 2. 班味会变 — Archetype Evolution

> 玩裁员谈判赢了?+ 进取心 +0.4 卷度 +0.2
> 输了还嘴硬?+ 摆烂度 +0.3 阴阳度 +0.2
> 攒局当 host?+ 存在感 +0.2 进取心 +0.2
> 写段子?+ 进取心 +0.15 存在感 +0.2 阴阳度 +0.05
>
> 漂够 1.5 个标准差,你的 top archetype 会**直接转世**,弹一个大字幕 **「🌀 你已演化为 [新人格]」**。 这是这个项目唯一能让人玩 3 次的机制。

📸 `assets/screenshots/03-profile.png`(EvolutionPanel + 漂移条)

#### 3. 化学反应导演 — 攒局看全队 archetype 写剧

> 2-4 个朋友建个房间,各自带自己测出来的 archetype。AI 导演会先做一次群体动力学分析:
>
> - **国企 + 大厂** → "国企的稳定 vs 大厂的 OKR — 文化冲突大戏"
> - **全员北漂** → "我们这一波北漂人的共同苦水"
> - **卷王 + 反卷青年** → "天敌同台,从第一幕就有摩擦"
> - **沪漂 + 2 个 generic** → "格格不入的张力 + 卷度两极对照"
>
> 然后才开始写 5 幕剧。每幕都用每个人的 archetype 声音播报(青涩男/御姐/霸道总裁/精英/旁白)。

📸 `assets/screenshots/05-squad-lobby.png`(squad 大厅,4 张 archetype 卡片并列)

#### 4. 今日剧情 + 一键分享卡

> 每天打开 app,有一段"今日剧情"等你 — 按你的 archetype 个性化推荐。
> 玩完之后一键生成 **1080×1350 IG 竖图 PNG**,可复制 / 下载,直接发朋友圈小红书。
>
> 卡上有日期、剧情类型、teaser、你的 archetype、战绩 grade(S/A/B/C/D)。这是一个**会反复刷屏**的产物。

📸 `assets/screenshots/01-landing.png`(Landing 上的"今日剧情"hero card)

#### 5. 真人音色 TTS — 23 个角色专属声音

> Minimax `speech-2.8-hd` 真人音色。每个 archetype 配独立 persona:
>
> - 卷王 → `qingse` 青涩男(永远 earnest 的拼命)
> - 阴阳怪气王 → `yujie` 御姐(干瘪的"挺好的")
> - PPT 王者 → `jingying` 精英(executive 演讲腔)
> - 国企铁饭碗 → `jingying` 精英(官方 / 资深 / 稳)
> - 海外润人 → `yujie` 御姐(知道点啥但已经半在状外)
>
> 全程 Minimax → QingYun → Web Speech 三层降级,断哪一层都不哑。

📸 `assets/screenshots/07-talkshow.png`(talkshow 段子库 + 播放控制)

#### 6. 全开源 · MIT · 可 fork

> https://github.com/ChrisChen667788/office-zoo
>
> 一行 `npm install && npm run dev` 跑起来。环境变量只要 1 个 LLM key(QingYun 兼容 OpenAI / Anthropic / Minimax-M2)+ 1 个 TTS key(Minimax,有免费试用)。
>
> 想做"自家公司版"?fork 一份改 archetypes.ts + fired scenarios + i18n 就完事。

---

### CTA(行动号召)

🌟 **Star 项目** → `github.com/ChrisChen667788/office-zoo`
💬 **加魔搭群讨论** → 这个项目接下来要做的事:Claude 4.5 替换导演 LLM + Stripe 付费 + 演化事件邮件订阅
🐦 **跟我聊** → 不论你是想 fork 改成"自家公司版"还是想合作做行业版本(法所 / HR 培训 / 高校就业指导),欢迎来我魔搭主页留言

---

### 配图清单(发文前先 commit 这些到 `assets/screenshots/`)

| 序号 | 文件名 | 内容 | 用在哪一段 |
|---|---|---|---|
| 1 | `01-landing.png` | Landing 首页 — 4 模式 + 今日剧情卡 | Hook + 第 4 段 |
| 2 | `02-quiz.png` | Quiz 进行中 — 10 题流式答题界面 | 第 1 段 |
| 3 | `03-profile.png` | 班味卡 + region/industry chip + EvolutionPanel | 第 1 + 2 段 |
| 4 | `04-fired-landing.png` | "裁了么"剧本网格 + 我的圈子过滤 | 第 1 段(tribe 推荐示意) |
| 5 | `05-squad-lobby.png` | 攒局大厅 — 4 张 archetype 卡片并列 | 第 3 段 |
| 6 | `06-squad-history.png` | "我的攒局" 历史 + 同组排行 | (可选) |
| 7 | `07-talkshow.png` | 段子库 + 播放控制 + persona 选择 | 第 5 段 |
| 8 | `08-premium.png` | Premium 付费墙 + 6 个 FAANG 剧本预览 | (可选) |

> 拍图脚本:`node scripts/capture_screenshots.mjs`(需要先 `npm install playwright @playwright/test`)

---

## 🇬🇧 English version · Short pitch for international ModelScope visitors

### Headlines (pick one per platform)

- **ModelScope main**: `An AI office sim where your archetype evolves — 24 personas + chemistry-aware director`
- **HackerNews / Reddit**: `Built an AI office sim where the squad director reads your team's archetype mix and writes a 5-act sitcom from it`
- **Twitter / LinkedIn**: `Open-source workplace simulator: 24 archetypes × tribe-aware recommendations × evolving identity. MIT. Built in 6 months solo with Claude Code.`

### Hook (first three lines)

> **Midnight in the office — AI rats roast your boss for you.**
>
> 24 archetypes × tribe-aware recommendations × chemistry-aware director × real-voice TTS.
> Open source MIT. `git clone && npm install && npm run dev` — that's your personal workplace metaverse.

### Three-sentence pitch

1. **It's not ChatGPT.** It's a React + Hono + Socket.IO AI workplace simulator. Nine AI rats hustle around a 2.5D office floor, voiced by real-actor TTS, with a 5-chapter speed-run of Chinese labor law.
2. **It knows who you are.** A 10-question quiz nails your archetype (SOE Lifer / FAANG Cog / Beijing Drifter / Shenzhen Money-chaser / Overseas Escapee / 19 others). Every recommendation — scenarios, talkshow bits, HR's PUA tactics — gets personalized by your tribe.
3. **It watches you change.** Every fired-chat / squad / talkshow / pack play drifts your 6-trait vector. Drift enough and your top archetype flips — triggering a big "🌀 You evolved into a new persona" banner.

### Six key features

1. **24 archetypes with region/industry tribes** — not just "grinder vs slacker", but "Hangzhou Tech Youth code-named '六' who treats 996 as gospel" or "Chengdu Zen-Slacker who works to fund the hotpot".
2. **Archetypes evolve** — win a fired chat at high ratio? +0.4 ambition +0.2 grind. Lose with attitude? +0.3 cynicism +0.2 snark. Drift ≥1.5 σ and you transition into a new top archetype.
3. **Chemistry-aware squad director** — squad room of SOE + FAANG members gets a culture-clash arc; all-Beijing room gets a group-portrait arc; rival pair gets an antagonism arc.
4. **Daily drama share card** — open the app daily for a personalized scenario; finish it and generate a 1080×1350 IG-portrait PNG to share with your grade + comp ratio.
5. **Real-voice TTS** — 23 character-specific voices via Minimax `speech-2.8-hd`. Per-beat voicing in squad mode so every act feels like a binge-able mini-drama.
6. **MIT open source** — fork it for your own company's culture (`archetypes.ts` is the entire data model). Single LLM key + single TTS key, free trials available.

### CTA

🌟 **Star** `github.com/ChrisChen667788/office-zoo`
🛠 **Fork** if you want a "your-company version" (we kept the data model fork-friendly on purpose)
💬 **Reach out** via ModelScope DM if you want to collab on a domain-specific version (law firms / HR training / campus career counseling)

---

## 副本调用说明(给运营 / 自动化 agent 看)

- 同一个 thread 不要一次发完 6 段 — 拆成 3-4 个 post,留 reply 互动空间
- 第一 post 用 Hook 段 + 单图(`01-landing.png`)
- 第二 post 详细讲 evolution(图 `03-profile.png`)
- 第三 post 详细讲 squad chemistry(图 `05-squad-lobby.png`)
- 第四 post 放 GitHub + ModelScope 链接 + 互动问题:"你猜你是 24 种里的哪一种?"

> 👆 这是魔搭社区目前最容易爆的 4-post 节奏:hook → demo → tech → CTA。
