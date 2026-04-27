<div align="center">

# 🐀 OFFICE ZOO

### 0 点的写字楼,AI 鼠人替你撕老板。

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React 18 + Vite 6](https://img.shields.io/badge/stack-React%2018%20%2B%20Vite%206-61dafb.svg)](https://vitejs.dev/)
[![Hono + Socket.IO](https://img.shields.io/badge/backend-Hono%20%2B%20Socket.IO-orange.svg)](https://hono.dev/)
[![Minimax speech-2.8-hd](https://img.shields.io/badge/voice-Minimax%202.8--hd-ff5588.svg)](https://www.minimaxi.com/)

**一家公司被裁了,9 名 AI 员工还在加班。**
**你是那只盯着 KPI 屏的 HR — 选个模式,看戏。**

</div>

---

> "卷不动也别躺平,看 AI 替你卷。"

## 三种打开方式

| | 模式 | 一句话 |
|---|---|---|
| 🏢 | **鼠人公司** | 2.5D 写字楼,9 名鼠人自由摸鱼互撕 |
| 🎤 | **全程开麦** | 真人音色把每句"颗粒度不够"读给你听 |
| ⚖️ | **裁了么** | 1v1 怼 HR,5 关速通《劳动合同法》 |

## 它会做什么

- 🗣️ **真职场暴论** — "@同学 你这个事情 owner 是谁?颗粒度不够,先对齐一下底层逻辑"
- 🔪 **暗中优化同事** — 资本家每轮挑一个房间里的打工人下手
- 🗳️ **撕逼+投票** — 8 名鼠人围圈开会,真人语音吵架
- 👻 **离职继续搅局** — 被裁的人靠"劳动仲裁票"反杀

## 凭什么 Star?

- 🎨 **35+ AI 立绘 + 23 角色头像** — 全是程序生成的二次元,0 张 emoji 凑数
- 🎙️ **23 个角色专属音色** — 青涩男 / 御姐 / 霸道总裁 / PUA 大师,听完一回合像追了一集职场短剧
- 📚 **真法条教学** — 每关一条《劳动合同法》,通关解锁知识卡片(21/35/41/42/50 条)
- ⚡ **多层降级** — 三层 LLM、四层 TTS、五层图像生成,断哪一层都不哑火
- 🏗️ **代码全开源** — MIT 协议,fork 改装搞自家版本(996 IT 公司版 / 银行金融版 / 国企版)

## 截图

```
              ┌──────────┐  ┌──────────┐  ┌──────────┐
              │ 🏢 鼠人公司│ │ 🎤 全程开麦│  │ ⚖️ 裁了么 │
              │ 自由摸鱼  │  │ 戏精剧场  │  │ 闯关斗 HR│
              │ [进入 →] │  │ [进入 →] │  │ [进入 →] │
              └──────────┘  └──────────┘  └──────────┘
```

> 真截图录屏 GIF 即将上传,先用占位图演示三大卡片布局。

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

## Roadmap (12 个月)

> 完整版见 [`docs/ITERATION_PLAN.md`](docs/ITERATION_PLAN.md) — 含同类竞品分析(AI Town 9.7k / Smallville 21k 实时对比)+ 7 Phase 详细规划。

**已完成:**
- [x] **PR1** 服务端 Activity 模型 + 1.5s tick 循环
- [x] **PR2** 客户端 RAF lerp + Catmull-Rom 走廊 + 8 种 activity 图标 + 发言者脉冲

**未来 12 个月(按 ROI 排序):**
- [ ] 🎬 **Phase A · Viral 短视频引擎** — 一局结束自动剪 30s 竖版 mp4,一键发抖音/B 站
- [ ] 🧠 **Phase B · 记忆 + 反思层** — sqlite-vec episodic memory + 跨局结盟/记仇
- [ ] 👥 **Phase C · 真人玩家加入** — 真人扮 HR / 工会代表 / 律师 / 媒体记者,多人房间
- [ ] 🛠️ **Phase D · UGC 剧本平台** — 用户上传真实事件 → 自动生成剧本,`/explore` 排行榜
- [ ] 🌏 **Phase E · 文化扩展包** — 35 岁危机 / PUA 拆解 / 大厂面试 / 海外大厂场景
- [ ] 💰 **Phase F · 商业化** — Premium Pack + 律所 / HR 培训 B 端
- [ ] 🌍 **Phase G · 国际化** — EN/JA/KO 版本

**12 个月里程碑:** 15k+ stars / 5w MAU / ¥10w/月 营收。

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

**🌟 Star 一下,等于在心里给老板一句脏话。**

[⬆ 回到顶部](#-office-zoo)

</div>
