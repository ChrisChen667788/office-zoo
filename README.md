<div align="center">

<!-- v6.24 P4 — logo-readme-banner.png is the v2 lockup: bigger wordmark
     (Arial Black gold→amber gradient + drop shadow) + clean bilingual
     tagline stack (CN top / EN bottom). Prior -lockup-final.png stays
     in assets/brand/ as archive — see BRAND_GUIDE.md history. -->
<img src="assets/brand/logo-readme-banner.png" alt="OFFICE ZOO · 班味剧场 · 0 点的写字楼 · Midnight Workplace Soap Opera" width="100%" />

### 0 点的写字楼,AI 鼠人替你拥抱变化,你回家躺平。

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React 18 + Vite 6](https://img.shields.io/badge/stack-React%2018%20%2B%20Vite%206-61dafb.svg)](https://vitejs.dev/)
[![Hono + Socket.IO](https://img.shields.io/badge/backend-Hono%20%2B%20Socket.IO-orange.svg)](https://hono.dev/)
[![Minimax speech-2.8-hd](https://img.shields.io/badge/voice-Minimax%202.8--hd-ff5588.svg)](https://www.minimaxi.com/)

**一家公司被裁了,9 名 AI 员工还在加班。**
**你是那只盯着 KPI 屏的 HR — 选个模式,把这一天笑着过完。**

**简体中文** · [English](README.en.md)

</div>

<p align="center">
  <img src="assets/launch-demo/hero-combined.gif" alt="30s hero · 米哈游风故事 (0-15s) + 真实游戏 (15-30s)" width="720" />
  <br/>
  <em>v6.2 · 米哈游风故事板 + 真实游戏画面合成 30s · <a href="assets/launch-demo/demo-memory.gif">纯故事板版</a> · <a href="assets/launch-demo/game-highlight.gif">纯真实游戏版</a> · <a href="docs/V6_MEMORY_TECH_BLOG.md">技术博客</a></em>
</p>

---

> "卷不动也别躺平 — 让 AI 替你卷,你回家躺平,顺便把段子发朋友圈。"

## 四种打开方式 — 总有一种解你今天的压

| | 模式 | 一句话 | 何时玩 |
|---|---|---|---|
| 🏢 | **鼠人公司** (classic) | 2.5D 写字楼, 9 名 AI 鼠人自由开撕 | 想看戏 · 通勤路上 |
| 🎬 | **全程开麦** (immersive) | 全屏沉浸 · 真人 TTS · 8 个声音轮番拷打 | 想下饭 · 午休前 |
| ⚖️ | **裁了么** (fired) | 1v1 怼 HR · 5 关速通《劳动合同法》 | 想长本事 · 真要离职时学防身 |
| 🍺 | **深夜酒馆** (bar, v6.2 新) | 凌晨 2 点 · lo-fi · 跟某个 AI 1v1 喝酒吐槽 | 卷不动了 · 没人能讲时 |

**还有副玩法:** 🔮 班味占卜 daily · 🎤 班味单口 · 🤝 攒局攒朋友 · 📜 7 天历史 · 🃏 牌库 24 卡 · ⭐ **段子 UGC 投稿** (v6.1 新) · 🍷 **朋友拼版彩蛋** (v6.1 新) · 📊 **周报生成器 4 风格** (v6.5 新)

## 🌟 v6.1 升级 (2026-05-22)

> 米哈游风画面 + Z 世代趣味玩法 + 朋友共创闭环

- 🎮 **米哈游风视觉系统** — 深紫宇宙底 + 5★ 金边角色卡 + 元素 chip + EVENT pill, 整个 hero 区做成"新版本上线公告"页, 视觉接近《原神》/《崩坏》活动 banner
- 🎤 **段子库 UGC 共创** (`/talkshow/ugc`) — 任何人都能投稿自己的职场段子, auto-moderation 后等审核, 通过的进入 ★ 本月精选池, 朋友帮你点赞, 月底 Top 5 上首页轮播
- 🍷 **朋友拼版彩蛋** — 在 🍺 深夜酒馆跟某 AI 聊完, 一键创建"拼版", 把链接发给朋友 → 朋友也跟同一个 AI 聊几句 → 后端把你们的金句合并 → 生成"群像截图"(v6.2 出渲染器), 形成多人共享 AI 视角的群体记忆
- 🛡️ **审稿守则极克制** — 黑名单只覆盖直接公司点名 / 政治 / 色情 / 暴力; 调侃 HR 婉辞 ("拥抱变化" / "毕业" / "颗粒度") 全部允许 — 那本来就是产品调性

## ✨ v2.x → v3.0 新功能(2026 年 5 月)

> 让"班味"成为一个可演化、可分享、可二刷的身份系统。

- 🪪 **24 种打工人 archetype** (v2.0.0) — 国企铁饭碗 / 大厂螺丝钉 / 创业老炮 / 金融体面人 / 教培劫余 / 网红打工人 / 北漂 / 沪漂 / 深漂搞钱党 / 杭州互联网青年 / 成都摆烂派 / 海外润人 + 原 v1.3 的 12 种行为型
- 🌀 **班味会演化** (v1.5.1 + v2.0.1 + v2.0.2) — 玩裁员 / 攒局 / 写段子 / 闯关包,每次都给 trait 向量加 delta;漂得够多 archetype 会"转世"(原 sass-master 卷成 grinder),触发"🌀 你已演化为新人格"大字幕
- 🎬 **今日剧情结果分享卡** (v1.5.0) — 1080×1350 IG 竖图 PNG,一键复制或下载;teaser 模式 + 战绩模式两种排版,把每天的剧情塞进朋友圈
- 🏢 **Tribe-aware 推荐** (v2.1.0 + v2.3.0) — 你是大厂?今日剧情自动推 FAANG 剧本 + 大厂段子;你是沪漂?给你推《陆家嘴的早 7 点》;你是杭州的?给你推《我的花名叫"无忌"》
- 🎭 **化学反应导演** (v3.0.0) — 攒局时 AI 编剧会看全队 archetype 混合,自动写出"国企 + 大厂 = 文化冲突剧"、"全员北漂 = 群像剧"、"卷王 vs 摆烂 = 天敌同台" — 不再是模板剧本,每桌都是独家剧情
- 🎙️ **Per-beat 多声音** (v1.4.2) — squad 剧本每个角色用自己的 archetype 专属音色播报,御姐 / 霸道总裁 / 青涩男切换无缝
- 🌐 **i18n 覆盖新 12 archetype** (v2.2.0) — 简中 / English / 日本語 / 한국어 四语,Profile 卡完整本地化

## 它会做什么

- 🗣️ **真职场暴论** — "@同学 你这个事情 owner 是谁?颗粒度不够,先对齐一下底层逻辑"
- 🔪 **暗中优化同事** — 资本家每轮挑一名打工人"毕业",走 N+1 流程
- 🗳️ **对线+投票** — 8 名鼠人围圈开会,真人语音互怼
- 👻 **鬼斗到底** — 被裁的人靠"劳动仲裁票"扳回一城

## 凭什么 Star?

- 🎨 **35+ AI 立绘 + 23 角色头像** — 全是程序生成的二次元,0 张 emoji 凑数
- 🎙️ **23 个角色专属音色** — 青涩男 / 御姐 / 霸道总裁 / PUA 大师,听完一回合像追了一集职场短剧
- 📚 **真法条教学** — 每关一条《劳动合同法》,通关解锁知识卡片(21/35/41/42/50 条)
- ⚡ **多层降级** — 三层 LLM、四层 TTS、五层图像生成,断哪一层都不哑火
- 🏗️ **代码全开源** — MIT 协议,fork 改装搞自家版本(996 IT 公司版 / 银行金融版 / 国企版)

## 📸 截图

> 每次发版会同步真机截图到 `assets/screenshots/`,见 [`docs/RELEASE_PROCESS.md`](./docs/RELEASE_PROCESS.md) 流程。

![首页 4 模式](./assets/screenshots/01-landing.png)

| 模式 | 截图 |
|:---:|:---:|
| 🎤 班味单口段子库 | `assets/screenshots/02-talkshow-list.png` _(待截)_ |
| 🏢 经典模式 2.5D 写字楼 | `assets/screenshots/04-classic-game.png` _(待截)_ |
| 🎤 沉浸模式圆桌 | `assets/screenshots/05-immersive-game.png` _(待截)_ |
| ⚖️ 裁了么闯关进度 | `assets/screenshots/06-fired-landing.png` _(待截)_ |
| 🎬 一键下载竖版战报视频 | `assets/screenshots/08-share-video.png` _(待截)_ |

> 占位图标位的会在每个版本发布时按 [`RELEASE_PROCESS.md`](./docs/RELEASE_PROCESS.md) 的"截图三连" 补齐。

## 30 秒跑起来

```bash
git clone https://github.com/ChrisChen667788/office-zoo.git
cd office-zoo

npm install                  # 装依赖

cp .env.example .env         # 改成你自己的 key
# 必填:
#   QINGYUN_API_KEY=<你的青云聚合 key>      # OpenAI 兼容,推荐
#   MINIMAX_API_KEY=<你的 Minimax key>      # 真人 TTS + LLM + 图像

npm run dev                  # 起 Vite + Hono + WS
open http://localhost:5173
```

> 首次启动会跑 5-10 分钟生成 23 个角色立绘 + 35 个图标(后续秒开)。
> 没有 key 也能跑 — 浏览器 Web Speech 兜底,emoji 占位,核心玩法不残缺。

## 资产管理

```bash
# 全量重生角色立绘
npx tsx packages/server/src/scripts/regen-avatars.ts

# 全量重生 UI 图标
npx tsx packages/server/src/scripts/regen-icons.ts

# 只重生指定 key
npx tsx packages/server/src/scripts/regen-icons.ts mode_classic team_cat
```

## 架构一图流

```
┌─── client (Vite + React 18 + Zustand + Framer Motion + Tailwind 4) ───┐
│                                                                        │
│  /                  Landing  — 3 大模式并列卡                           │
│  /classic/:gameId   Classic  — 2.5D 写字楼 + RAF lerp + Catmull-Rom    │
│  /immersive/:gameId Immersive — 圆桌 + 真人语音 + 弹幕                  │
│  /fired             FiredLanding — 5 关闯关 + 知识卡片                  │
│  /fired/chat        FiredChat — 1v1 怼 HR + 四维评分                   │
│                                                                        │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ socket.io (3101) + REST /api (3100)
┌──────────────────────────────▼─────────────────────────────────────────┐
│   server (Hono + Socket.IO + tsx --watch)                              │
│                                                                        │
│   GameEngine        runFreeRoam (6 ticks × 1.5s,emit 'tick')           │
│       │             runDiscussion + sanitizeSpeech                     │
│       │             runVoting + resolveVotes                           │
│       ▼                                                                │
│   BaseAgent → callLLMWithTimeout                                       │
│       ├── QingYun gpt-4o-mini (主)                                     │
│       └── Minimax M2 (备)                                              │
│                                                                        │
│   tts.ts           Minimax t2a_v2 speech-2.8-hd                        │
│                  → t2a_pro                                             │
│                  → QingYun /audio/speech                               │
│                  → Web Speech API (浏览器兜底)                          │
│                                                                        │
│   imageGen        flux-schnell → doubao-seedream → qwen-image          │
│                  → gpt-image-1 → minimax:image-01                      │
└────────────────────────────────────────────────────────────────────────┘
```

## 核心特性深挖

### 1. AI 发言不像 ChatGPT

`BaseAgent.ts` 的 system prompt 不是简单"发表你的看法",而是 9 条硬规则:

```
1. 必须满满阿里味儿 — 叫人必须用"同学"或"@同学"
2. 必须使用 3 个以上职场黑话 — 赋能/拉通/对齐/打透/沉淀/闭环 ...
3. 立场鲜明 — 必须明确说出你怀疑谁/想投谁
4. 8 种人格切换 — 社牛/社恐/杠精/暴躁/老狐狸/卷王/舔狗/阴阳人
5. 开口即炸 — 第一个字就要是攻击或阴阳,别铺垫
... + 后处理 sanitizeSpeech() 自动剥离 LLM 偶尔加的元注释
```

### 2. 自由活动 Tick 系统

服务端 `runFreeRoam()` 是 6 tick × 1.5s 的循环:
- 30%/tick 概率:settled 玩家挑新房间发起 commute
- `pathProgress` 0→1 在 ~3 ticks 内走完一条走廊
- 每 tick 推送 `'tick'` 事件,客户端 60 fps lerp

客户端 `GameMap.tsx`:
- 房间间移动用 **Catmull-Rom 样条**走出弧形,不直线瞬移
- 当前发言者头像 1.18× 放大 + 房间脉冲光晕
- 8 种 activity 图标(打字/咖啡/偷瞄/印纸 ...)在玩家右下徽章

### 3. 裁了么 — 5 关 × 真法条

| LV | 场景 | HR | 法条 |
|---|---|---|---|
| 🌱 1 | 试用期突然裁员 | 菜鸟 | 第 21 条 |
| 🎯 2 | 口头辞退不给书面 | 菜鸟 | 第 50 条 |
| ⚖️ 3 | 调岗降薪逼自离 | 老油条 | 第 35 条 |
| 👶 4 | 孕期被裁 | 老油条 | 第 42 条 |
| 👹 5 | 经济性裁员违法 | 魔鬼 | 第 41 条 |

每关结算根据 `compensationMonths / maxPossible` 算 1-3 ⭐,通关解锁下一关 + 弹"知识卡片"。
进度持久化到 `localStorage`(`office-zoo.fired-progress`)。

## Roadmap

> 完整版见 [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — 含所有版本的"why / what / verified"原文。

**已上线(2025-12 → 2026-05):**
- ✅ **v0.6-v0.9** 2.5D 写字楼 + tick 循环 + 8 种 activity / talkshow + Web Speech 兜底 / UGC + HR 记忆 + 闯关包 + PvP 房间
- ✅ **v1.0** Premium 6 个 FAANG 场景 + 付费墙 demo
- ✅ **v1.1** B 端白标 + HR 培训沙盒 + 高管金属主题
- ✅ **v1.2** i18n 中/英/日/韩
- ✅ **v1.3** "你是哪种打工人"identity quiz + 12 archetype + Y2K 班味卡 + archetype-personalized 推荐
- ✅ **v1.4** 攒局模式 + 多声音 + 历史/排行
- ✅ **v1.5** 今日剧情结果分享卡 + archetype 演化(单 surface)
- ✅ **v2.0.0** 12→24 archetype + region/industry 维度
- ✅ **v2.0.1 + v2.0.2** 演化扩到 squad / talkshow / pack 三个 surface
- ✅ **v2.1** Tribe-aware fired 推荐 + FiredLanding tribe 过滤
- ✅ **v2.2** 新 12 archetype 的 en/ja/ko 翻译
- ✅ **v2.3** Talkshow 加 region tag + daily 推 城市段子
- ✅ **v3.0** 化学反应导演 — squad 编剧看全队 archetype mix 写专属剧

**下一步(开放讨论):**
- [ ] 真 Stripe checkout 替换 v1.0 demo
- [ ] Squad LLM 用 Claude 4.5 Sonnet 替换 gpt-4o-mini 看演出效果
- [ ] FiredLanding tribe 过滤扩到 region 维度
- [ ] 演化事件的"周报"邮件订阅(可选)

## 安全须知

- `.env` 已 gitignore,**永远不要 commit 真实 key**
- 自己 fork 后请用自己的 API key
- 如果发现历史 commit 误传过 key,立即在对应平台 rotate

## 贡献

纯娱乐项目,核心价值是当代打工人苦中作乐的精神状态。

- 🐛 Bug → issue
- 🎨 想加新模式 / 新角色 / 新场景 → PR
- 💡 想加新人格(eg "00 后整顿职场") → `personality.ts` 加一行
- 🎙️ 想替换音色 → fork 一份用自家 voice clone

**起 star ≠ 帮我,起 star = 让算法把这个项目推给更多打工人。**

## 致谢

- [MiniMax](https://www.minimaxi.com/) — `speech-2.8-hd` 真人 TTS / `MiniMax-M2` 文本 / `image-01` 立绘
- [青云聚合 (QingYunTop)](https://api.qingyuntop.top/) — OpenAI 兼容代理,多模型路由
- 所有为打工人发声的人

## License

MIT — 拿去随便玩。fork 出商业版,请别忘了打工人。

---

<div align="center">

**🌟 Star 一下,精神工位 +1,班味 -1。**

[⬆ 回到顶部](#-office-zoo)

</div>
