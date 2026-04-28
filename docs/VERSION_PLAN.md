# OFFICE ZOO 版本迭代计划

> 基于 [`ITERATION_PLAN.md`](./ITERATION_PLAN.md) 的 7 Phase 路线图,落实到具体 semver 版本.
> 每个版本一周内可发布,严格"可上线 + 可衡量"原则,避免长 PR 烂尾.

---

## 版本号约定

- `0.x.y` — 0.x 大版本对应 Phase 字母, x = 该 Phase 内子版本
- `1.0.0` — 全量"打工人垂直 AI 模拟器"功能完整 + 多语言 + 商业化基础
- `2.0.0` — UGC 平台成熟 + 海外用户突破

---

## v0.2.0 ✅ (current main, Apr 2026)

**已发布:**
- PR1 服务端 Activity 模型 + tick 循环
- PR2 客户端 RAF lerp + Catmull-Rom + activity 图标 + speaker pulse
- 23 个 anime 角色立绘 + 35 个 UI 图标 (Minimax 生成)
- 5 关闯关 + 知识卡片
- 三层 LLM/TTS/Image fallback chain

---

## 🎬 Phase A · Viral 短视频引擎

### v0.3.0 (Week 1) — 短视频导出 MVP **← 接下来动手**

**目标:** 一局结束后,用户能下载一个 30s 竖版 mp4/webm,打开就能转发.

**功能切片:**
- [ ] `utils/videoExport.ts` — 客户端 canvas + MediaRecorder 录制 1080×1920 竖版
- [ ] `services/highlightPicker.ts` — 从 eliminationLog + speechHistory 自动挑 3 个高光时刻
- [ ] `components/game/ShareVideoButton.tsx` — HighlightReel 末尾的"下载竖版视频"按钮
- [ ] 视频模板:
  - 0-3s: LOGO + 本局阵营 (打工人胜 / 资本家胜 / 摸鱼党胜)
  - 3-25s: 3 个高光时刻 (角色头像 + 大字幕发言)
  - 25-30s: GitHub QR + "更多剧情自己生成"

**技术要点:**
- 用 `HTMLCanvasElement.captureStream()` + `MediaRecorder` (Safari 17+/Chrome 都支持)
- 字幕用 canvas 直接画(避免 Web Speech 时序问题)
- 文件名: `office-zoo-{winner}-{date}.webm`
- 不需要服务端,纯客户端就够 MVP

**成功指标:**
- 至少 1 条用户产出的视频在 B 站 ≥ 5k 播放
- 一周 ≥ 100 个 GitHub star

### v0.3.1 (Week 2) — 高光时刻智能挑选

**目标:** 视频自动生成 3 个真正"有梗"的瞬间,而不是随机.

- [ ] 高光评分算法:
  - 发言长度 + 关键词命中(@同学 / 阿里黑话 / 反转词)
  - kill / vote_result 事件 +5 分
  - 阵营反转 +10 分
- [ ] LLM 短摘要: 用 Minimax-M2 给每个高光生成"一句话标题"叠在视频上

### v0.3.2 (Week 3) — 一键发布到平台

- [ ] 复制粘贴文案模板 (5 平台预填)
- [ ] Web Share API 一键调起 iOS/Android 系统分享
- [ ] 二维码 deeplink — 扫码进入"再生成同款"

### v0.4.0 (Week 4) — 视频引擎升级

- [ ] 服务端 ffmpeg 转码 mp4 (统一格式,跨平台播放更稳)
- [ ] 横版 16:9 版本(B 站 PC / Twitter)
- [ ] 用户可选模板:暴躁版 / 文艺版 / 鬼畜版

---

## 🧠 Phase B · 记忆 + 反思层

### v0.5.0 (Week 5) — sqlite-vec memory store

- [ ] `services/memoryStore.ts` — sqlite-vec 嵌入式向量数据库
- [ ] `MemoryEntry { agentId, type: 'event'|'belief'|'relationship', content, embedding, timestamp, importance }`
- [ ] BaseAgent.recall(query, k=5) — relevance × recency × importance 排序

### v0.5.1 (Week 6) — Reflection 层

- [ ] 每 5 轮触发: LLM 把 agent 的 memory stream 总结成 3-5 条 high-level beliefs
- [ ] beliefs 注入下一轮 speech prompt

### v0.5.2 (Week 7) — 跨局持久化 + UI 展示

- [ ] memory 跨 game 持久化(`game_id` 字段)
- [ ] HighlightReel 新增"AI 心理活动"面板 — 展示某 AI 当前的 beliefs

---

## 👥 Phase C · 真人玩家加入

### v0.6.0 (Week 8) — 房间机制

- [ ] socket 房间扩展: `playerSlot: 'ai' | 'human-{role}'`
- [ ] 4 个特殊真人角色: HR / 工会代表 / 律师 / 媒体记者
- [ ] 真人专属 UI: 文字输入框 + 语音输入按钮 (浏览器 STT)

### v0.6.1 (Week 9) — AI 适应人类

- [ ] AI 在 prompt 里被告知"在场有真人玩家",会主动响应
- [ ] 关系记忆: 真人帮过某 AI,该 AI 后续偏向不投他

### v0.7.0 (Week 10) — 多人房间

- [ ] 房间码分享(URL deeplink)
- [ ] 旁观席模式(房间满后再进的人可以围观 + 弹幕)
- [ ] 房间 chat 频道

### v0.7.1 (Week 11) — 房间持久化 + 留存

- [ ] 房间 24h 过期机制
- [ ] 用户账号系统 (轻量,WebAuthn 无密码)
- [ ] 我的对局历史

---

## 🛠️ Phase D · UGC 剧本平台

### v0.8.0 (Week 12-13) — 创作器 MVP

- [ ] `/create` 页面 — 用户描述事件 → LLM 生成场景 + 角色配置
- [ ] 法律合规: 自动匿名化(人名/公司名替换为 X 总/A 公司)
- [ ] 关键词审查(政治/暴力/色情)

### v0.8.1 (Week 14-15) — `/explore` 平台

- [ ] 剧本广场: thumbnail + 描述 + 玩过人数 + 点赞
- [ ] 排行榜: 热门 / 最新 / 我创建的 / 我点赞的
- [ ] 评论 + 评分

### v0.9.0 (Week 16-17) — UGC 闯关包

- [ ] 用户也能创建"5 关闯关包"(裁了么模式扩展)
- [ ] Top 10 闯关包置顶, 每月评选

---

## 🌏 Phase E · 文化扩展包 (持续, 季度交付)

### v0.10.0 (Q3 第 1 个季度包)

- [ ] 大厂面试模拟器(用户当候选人)
- [ ] 35 岁危机求职
- [ ] PUA 话术拆解 + 反击模板

### v0.11.0 (Q4 第 2 个季度包)

- [ ] 加班费追讨 1v1
- [ ] 竞业协议谈判
- [ ] 春节裁员潮限定剧本

---

## 💰 Phase F · 商业化

### v1.0.0 (M6) — 全量 1.0 + Premium Pack

- [ ] **免费版功能冻结** — 当前所有功能永久 MIT
- [ ] **Premium Pack** (¥39/月):
  - 海外大厂场景(FAANG / Twitter Purge)
  - 律师真人咨询入口(签 1-2 家律所)
  - 高级 voice clone(传你老板录音)
  - 历史回放无限存储
- [ ] Stripe / 支付宝 / 微信支付集成

### v1.1.0 (M7-M8) — B 端 SaaS

- [ ] 律所版: "嵌入到我们网站作为咨询 demo"
- [ ] HR 培训版: 让 HR 学员练习"温和裁员话术"(反向)
- [ ] API 接入: 按 token 计费

---

## 🌍 Phase G · 国际化

### v1.2.0 (M9) — 英文版首发

- [ ] `README.en.md` + `i18n` (`zh-CN`, `en-US`)
- [ ] 英文 prompt set: FAANG / Big Tech / Twitter Purge 词汇
- [ ] HN Show HN + ProductHunt launch

### v1.3.0 (M10-M11) — 日韩本地化

- [ ] 日本: ブラック企業 シミュレーター
- [ ] 韩国: 갑질 RPG
- [ ] 与日韩程序员社区合作翻译

### v2.0.0 (M12+) — Office Zoo Universe

- [ ] 横向衍生 IP(web 漫画 / podcast / 短视频)
- [ ] B 端 SaaS 月流水 ¥10w
- [ ] 累计 stars 15k+

---

## 优先级原则

1. **每 1-2 周一个版本**, 不允许 PR 拖超过 2 周
2. **每版本必须有 1 个用户可感知的功能**, 不做纯重构版本
3. **viral 杠杆 > 技术深度** — 短视频引擎(Phase A)优先于记忆层(Phase B)
4. **community 杠杆 > 个人产出** — UGC 平台(Phase D)优先于商业化(Phase F)
5. **断点可发布** — 每个版本号都能独立 deploy + demo

---

## 当前位置

✅ v0.2.0 完成 (清空脱敏 + 公开 baseline)
✅ v0.3.0 Viral 视频 MVP 已发布
✅ v0.3.1 LLM 爆款标题
✅ v0.3.2 Web Share API
✅ v0.4.0 横版 16:9 + 服务端 ffmpeg 转 mp4
🎯 **下一组: v0.5.0 / v0.6.0 / v0.7.0** — 实时位置 + 房间家具 + 道具系统
👉 详细规划见 [`V0.5_REALTIME_MAP_PLAN.md`](./V0.5_REALTIME_MAP_PLAN.md)
