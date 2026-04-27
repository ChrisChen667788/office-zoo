# OFFICE ZOO 全球爆火迭代规划

> 基于头部同类产品的竞品分析 + 我们的差异化护城河 + 7 个 Phase 路线图。

---

## 1. 竞品全景(实时数据,Apr 2026)

| 项目 | ⭐ Stars | 类别 | 强在哪里 | 我们的差距 / 机会 |
|---|---:|---|---|---|
| **MetaGPT** | 67,441 | 多智能体软件公司 | 模拟整个软件公司流程 | 不同品类 (productivity), 但说明"模拟"故事性卖得动 |
| **Microsoft AutoGen** | 57,461 | Agent 框架 | 微软背书 + 开发者生态 | 框架≠产品, 我们做的是 end-user playable |
| **OpenBMB ChatDev** | 32,893 | 多智能体软件协作 | OpenBMB 学术品牌 + 中文 | 同上 |
| **Stanford Smallville (Generative Agents)** | 21,189 | 学术研究代码 | **Memory + Reflection 算法 OG** | 我们目前 stateless prompt — **最大的技术 gap** |
| **a16z AI Town** | 9,771 | Playable virtual town | Convex 实时后端 / 真人可加入 / 像素艺术 | 通用小镇 = 没有文化锚, 我们有 |
| **OpenBMB AgentVerse** | 5,022 | 框架 (task + sim) | 学术 | 同 ChatDev |
| **lmgame-org GamingAgent** | 921 | LLM 玩游戏的 evaluation | ICLR 2026 论文 | 是 benchmark, 不是 game |
| **MiniMax Werewolf (官方)** | **10 (!)** | 官方狼人杀 | 几乎没运营 | **整个赛道的 lane 是空的** |

### 核心洞察

1. **狼人杀垂直赛道的 lane 几乎空着** — Minimax 官方自己的项目只有 10 ⭐, 没人占位
2. **AI Town 在 9.7k 是真正的对手** — playable + open source + a16z 背书. 但是它"通用小镇"没有文化锚, 这是我们的空隙
3. **Smallville 21k ⭐ 但不是产品** — 只是研究代码. 谁把它"playable + viral 化"谁就赢
4. **20k+ 是 playable AI 项目可达天花板** — Smallville/ChatDev/MetaGPT 都跨过了, 不是奇迹

---

## 2. OFFICE ZOO 的护城河 (vs Top 3)

| 维度 | AI Town | Smallville | OFFICE ZOO |
|---|---|---|---|
| **文化锚** | 通用小镇 | 通用小镇 | **中国大厂职场 / 班味 / 鼠人 / 阿里黑话** ✅ |
| **教育价值** | 0 | 0 | **裁了么 5 关 = 速通《劳动合同法》** ✅ |
| **TTS 角色化** | 无 | 无 | **Minimax speech-2.8-hd × 23 角色专属音** ✅ |
| **Memory + Reflection** | ✅ | ✅ (OG) | ❌ — **Phase B 必补** |
| **真人可加入** | ✅ | ❌ | ❌ — **Phase C 必补** |
| **viral 短视频导出** | ❌ | ❌ | ❌ — **Phase A 我们独有, 抖音/B 站爆款引擎** |
| **UGC 剧本** | ❌ | ❌ | ❌ — **Phase D 我们独有, community 护城河** |
| **多语言** | EN | EN | ZH-CN — Phase G 加 EN/JA/KO |

**结论:** 我们有 2 个**独家护城河**(文化锚 + 教育价值), 1 个**潜在独家**(viral 视频引擎), 2 个**必须补齐才能打**(memory + 真人协作).

---

## 3. 7 Phase 路线图

按"投入产出比 × 差异化强度"排序. 每个 Phase 给出**为什么做 / 做什么 / 工作量 / 成功指标**.

---

### 🎬 Phase A · Viral 短视频引擎 (PR 3-4 · 4 周)

> **为什么先做:** 这是我们对 AI Town 的不对称优势. 抖音/B 站/小红书一条爆款视频 = 1k+ stars. 投入低, 回报最高.

**做什么:**
- 服务端 `videoExport.ts`: 一局结束自动选取 3 个"高光时刻"(最长发言 / 关键投票 / kill 爆点)
- 用 ffmpeg 把音频片段 + 字幕 + 头像头像绘制到 1080×1920 竖版视频
- 模板化片头(LOGO + 角色出场)+ 片尾(GitHub 二维码 + "更多剧情自己生成")
- 客户端 `HighlightReel.tsx` 加"一键下载竖版视频"按钮
- (可选) 集成 Veo 3.1 / Sora API 做"AI 生成的 office 场景 B-roll"

**工作量:** 60-80 工时(ffmpeg 集成 + 模板设计 + UI 接入)

**成功指标:**
- 单条视频在 B 站/抖音播放量 > 10w
- 转化率: 视频观看 → GitHub star ≥ 0.5%
- 一周内 3 条视频带来 ≥ 500 star

---

### 🧠 Phase B · 记忆 + 反思层 (PR 5 · 3 周)

> **为什么做:** 缩小与 Smallville/AI Town 的技术 gap. 让 AI 真正"记仇 + 结盟", 故事性指数级上升.

**做什么:**
- 集成 SQLite + `sqlite-vec` (轻量, 无外部依赖, 单文件 DB)
- `MemoryStore` 模块: 每个 agent 一个 episodic memory stream
- 三类 memory: `event` (我看到 X 做了 Y) / `belief` (我相信 X 是 dog) / `relationship` (X 救过我)
- 每 5 轮触发 reflection: LLM 把 memory stream 总结成 3-5 条 "我的高层判断"
- speech prompt 中注入相关 memory 片段(retrieval by recency × relevance × importance)
- 跨局持久化: agent 在 game 1 救过你, game 2 你会偏向不投他

**工作量:** 80-100 工时

**成功指标:**
- 同一 AI 在多局游戏中表现出 **角色一致性**(人格漂移 < 10%)
- 用户感知: 调研 "AI 像有记忆吗" → 满意度 ≥ 70%
- 技术博客发出去:"用 SQLite + sqlite-vec 给 AI 加记忆 — Smallville 简化版" 二次发酵

---

### 👥 Phase C · 真人玩家加入 (PR 6 · 4 周)

> **为什么做:** AI Town 有这个功能, 我们没有. 留存最 sticky 的功能 — 朋友间多人模式 = 病毒式传播.

**做什么:**
- 真人玩家可以扮演 4 个特殊角色:
  - **HR** — 主持会议 / 调解纠纷
  - **工会代表** — 帮员工说话
  - **吃瓜律师** — 提供法律建议
  - **媒体记者** — 把事件发到"朋友圈"
- 真人输入文字 / 语音(浏览器 STT)发言
- AI 自动响应 + 调整态度(如果你帮某 AI 说话, 它会记住)
- 多人房间: 1 个真人 HR + 1 个真人记者 + 7 个 AI 员工
- Socket.IO 房间机制扩展, 复用现有 `game:create/join`

**工作量:** 120-150 工时

**成功指标:**
- 多人模式 DAU/MAU ≥ 30%
- 平均房间人数 ≥ 1.5(说明朋友间分享)
- 留存: 7 日留存率 ≥ 25%

---

### 🛠️ Phase D · UGC 剧本平台 (PR 7 · 6 周)

> **为什么做:** Community 护城河. 用户上传自己公司的真实事件 = 内容指数级增长 = 我们不需要自己写场景.

**做什么:**
- 用户提交"事件描述"(eg "我们部门突然被组织调整...")
- LLM 自动生成: 角色配置 / 场景剧本 / 胜利条件
- **法律合规层**: 自动匿名化(姓名 / 公司名替换), 关键词审查
- 平台展示: `/explore` 页面 thumbnail + 描述 + 玩过人数 + 点赞
- 排行榜: 本周热门 / 全部 / 我创建的
- 复用 fired 模式的 5 关结构, 用户也能创建闯关包

**工作量:** 150-200 工时

**成功指标:**
- 30 天内 ≥ 100 个 UGC 剧本提交
- Top 10 剧本平均播放数 ≥ 1k
- 每月活跃创作者 ≥ 50

---

### 🌏 Phase E · 文化扩展包 (PR 8 · 持续)

> **为什么做:** 把"中国大厂职场"做深, 而不是做宽. 垂直 > 通用.

**做什么:**
- **新场景包(每季度 1-2 个):**
  - 大厂面试模拟器(用户当候选人, AI 当面试官)
  - 35 岁危机求职(年龄歧视谈判)
  - PUA 话术拆解(老板的常见套路 → 反击话术)
  - 加班费追讨 1v1
  - 竞业协议谈判
- **新角色:**
  - 海归 / 工贼 / 二代 / 外包 / 中层 / 媒体公关
  - 00 后整顿职场 / 卷不动了 / 摆烂躺平
- **真实公司"影射"(匿名化):**
  - 大厂 A/B/C, 独角兽, 外包, 国企
  - 不点名, 但用户一看就懂
- **节日限定剧本:**
  - 春节裁员潮 / 年终奖博弈 / 双 11 加班 / 35 岁退休

**工作量:** 每个剧本 ~20 工时, 持续投入

**成功指标:**
- 每季度新场景包发布, 带来 ≥ 200 star
- 用户调研中"内容丰富度"打分 ≥ 4.5/5

---

### 💰 Phase F · 商业化路径 (Phase 2, M6+)

> **为什么做:** 让项目可持续(支付 API 调用费), 不靠爱发电.

**模式:**
1. **免费基础版**: 当前所有功能, MIT 永久开源
2. **Premium Pack** (个人 ¥39/月):
   - 海外大厂场景包(FAANG / Twitter purge / GitHub layoff)
   - 律师真人咨询入口(签约 1-2 家律所)
   - 高级 voice clone(传你老板的录音, AI 用他的声音演)
   - 历史回放无限制存储
3. **B 端 SaaS** (¥999/月):
   - 律所: 集成到他们的"劳动法咨询"页面作为 demo
   - HR 培训公司: 做反向 — 让 HR 学员练习"温和裁员话术"
   - 员工心理健康 SaaS(Boss 直聘 / 简单心理): 嵌入"职场情景模拟"
4. **API**:
   - 开放给第三方接入"职场 AI 角色生成 API"
   - 按 token 计费

**预期:** Phase 2 启动后 6 个月内,月流水 ¥10w

---

### 🌍 Phase G · 国际化 (Phase 2, M9+)

> **为什么做:** 中国职场文化是 source , 但"打工人苦企业文化久矣"是全球共鸣.

**做什么:**
- **英文版 README + 英文 prompt set:**
  - "Big Tech burnout simulator"
  - 用 FAANG / Twitter Purge / Indian IT culture / Korean 갑질 词汇
- **多语言:**
  - **日本: ブラック企業 シミュレーター** (黑心企业模拟器)
  - **韩国: 갑질 RPG** (霸凌 RPG)
  - **印度: H1B Survival** (签证 + 加班双重压力)
  - **美国: Open Office Royale** (开放工区生存)
- **首发渠道:**
  - **Hacker News** Show HN (英文 README 写好后)
  - **ProductHunt** (做一个 launch kit)
  - **r/cscareerquestions / r/antiwork** Reddit
  - **TechCrunch / The Verge** 媒体投稿("AI version of The Office for the burnout era")
- **本地化伙伴:**
  - 找日本/韩国程序员社区合作做翻译
  - 让 awesome-llm-apps / awesome-chinese-llm 等热门 list 收录

**工作量:** 翻译 + 文化适配 ~200 工时

**成功指标:**
- 英文用户占比 ≥ 30%
- 日韩用户占比合计 ≥ 10%
- HN 首页登顶 1 天

---

## 4. 12 个月里程碑表

| 月 | Phase | 关键交付 | 累计 ⭐ 目标 |
|---|---|---|---:|
| M0-M1 | A 短视频引擎 | 自动剪辑 30s 竖版视频, 一键发布 | 500 |
| M2 | B 记忆层 | sqlite-vec memory stream + reflection | 1.5k |
| M2-M3 | C 真人玩家 | 4 个真人角色, 多人房间 | 3k |
| M4-M5 | D UGC 剧本 | `/explore` 页面 + 投稿/审核流程 | 6k |
| M6+ | E 文化包 | 每季度 2 个新场景包 | 8k |
| M6+ | F 商业化 | Premium Pack + B 端 PoC | 8k + ¥10w/月 |
| M9+ | G 国际化 | EN/JA/KO 版本 + HN 首发 | 15k+ |

---

## 5. 风险 + 对冲

| 风险 | 概率 | 对冲 |
|---|---|---|
| 法律风险(职场 / 公司影射) | 中 | 自动匿名化 + 显著免责声明 + 不接受具体公司名提交 |
| API 成本失控(Minimax 充值) | 高 | 每个 IP 限速; cache 复用; 引入 OSS 模型 (qwen-2.5 / llama-3) 作为 free tier |
| LLM 审查(政治敏感词) | 中 | 内置 prompt 过滤; 用户协议禁止涉政 |
| AI Town 抢做中文版 | 低 | 我们 head start 6 个月 + 文化锚深 |
| MiniMax 自己做 office werewolf | 低 | 他们的官方 repo 才 10 star, 不重视; 我们 community 跑出来后他们想抄也抢不过 |

---

## 6. 行动 优先级 (一周内动手)

1. **Phase A 启动 — 短视频引擎 RFC**
   - 先做最 MVP 版: 一局结束 → 客户端 canvas screen-record API + Web Audio + 60s 简单字幕 → mp4 下载
   - 不上传服务器,纯客户端就够首版
2. **Phase B 启动 — sqlite-vec PoC**
   - 单 agent memory store + 1 轮 reflection demo 跑通
3. **录第一条 demo 视频** (Phase A 第一个产出)
   - 1080×1920 竖版, 0-3s hook, 3-30s 剪辑, 30-60s GitHub 二维码
   - 发到自己的小红书 / B 站 / 抖音, 看数据反馈

---

## 7. 长期愿景

**12 个月目标:** 成为"打工人垂直 AI 模拟器"的全球第一品牌, 15k+ stars, 月活 5w, 月流水 ¥10w.

**24 个月目标:** "Office Zoo Universe" — 类比 Black Mirror 的"职场版", 衍生 web 漫画 / podcast / 短视频 IP.

**核心信念:** 班味无国界. 美国硅谷的 H1B、日本的 ブラック企業、印度的 IT 内卷、韩国的 갑질 — 所有现代上班族都有共同的精神状态. **我们不是做一款游戏, 我们做的是当代上班族的 catharsis (情绪宣泄) infrastructure.**
