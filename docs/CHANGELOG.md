# OFFICE ZOO Changelog

每个版本一段。最新在最上,语义化版本号。

> v3.1 – v5.4 的条目此处暂缺(代码侧 tag 已落地, 详见各文件版本注释)。
> v5.5 起恢复完整记录。

---

## v6.5.1 — 2026-05-23 · 周报 PNG 分享卡 + Landing 入口 + PROMO 补段

### Added — Phase A: 周报 PNG 分享卡
- `client/src/utils/weeklyShareCard.ts` (300 行) — 纯 Canvas 2D 渲染
  1080×1350 IG-portrait PNG:
  - 米哈游 cosmic 渐变底 + 顶部金色 EVENT pill + 关键事件大字 box
  - 4 卡 2×2 grid, 每张独立 element color (青/玫红/金/橙) + 5★ shimmer 边框
  - 自动 wrap + 长文 ellipsis 截断
  - public API: `generate / copy / download / preview-url / system-share`
- `client/src/components/WeeklyShareCardModal.tsx` (170 行):
  - sibling of FortuneShareCardModal / BarClusterShareModal
  - 4:5 PNG 预览 + 系统分享 / 复制 / 下载 三按钮 + capability detect
- `Weekly.tsx` 结果区下方加 "📤 4 卡拼成分享图 PNG · 一键发圈" 主按钮
  (粉紫 gradient, 跟"重新生成" 链接区分主次)

### Added — Phase B: Landing 加 v6.5 入口
- Landing.tsx 副玩法 chip 行新增:
  - "📊 周报生成器 · v6.5 NEW ✨" 金色 gradient 按钮
  - 跟 EventPill 同色系 (金 + 紫), 视觉上"主推新版本"等级感强
  - title hint: "1 句关键事件 → 4 风格周报"
- README "副玩法" 行同步:
  ` 📊 **周报生成器 4 风格** (v6.5 新)`

### Added — Phase C: PROMO 文案补 v6.5 段
- `docs/PROMO_COPY.md` 顶部新增 "🔥 v6.5 周报生成器专用文案" 段
  (排在 v6.1 之前, 优先级最高):
  - Twitter / X 中英双版 hook (1 条爆款)
  - 小红书 9 图正文 (含 4 风格实际 LLM 输出对比 + 老板反应注解)
  - 即刻短帖 (含实测输出)
  - V2EX 标题 2 候选
- `docs/PROMO_MODELSCOPE.md` 顶部新增 "🔥 v6.5 周报生成器主推 Hook":
  - Hook 3 行 + 三句话讲清楚
- `docs/LAUNCH_SUBMISSION_PACK.md` §1.2 tagline:
  - 新增首选: "AI weekly-report generator — one sentence, four corporate voices."
  - 老 v6.4 tagline 降级为备选 ABC

### Bug fix
- Weekly.tsx StyleResult interface 字段名跟 server response 对齐
  (server 返回 `style` 而不是 `id`)

### Verified
- ✓ typecheck 0 新 regression
- ✓ Landing visual probe: 金色周报 chip 在副玩法行突出, 跟 EventPill 同源
- ✓ Weekly empty state visual: 顶部 5★ EventPill + 4 风格预览 grid
  渲染对齐

### v6.5.1 体验意义
周报生成器从 v6.5.0 的"4 卡平铺需要截图"升级到 v6.5.1 的"4 卡一键
PNG 分享, 用户无需自己截图"。这是 viral coefficient 翻一倍的关键 —
平台对图片转发的算法权重远高于纯文字 + 链接。

---

## v6.5.0 — 2026-05-23 · 周报生成器 + Profile mihoyo + 对比 teaser

### Added — 🎯 Phase C: v6.5.0 周报生成器 (新玩法)
- `server/src/routes/weekly.ts` (170 行) — `POST /api/weekly/generate`:
  - 输入 1 句关键事件 (8-300 字)
  - 4 种风格并行 LLM 生成 (Promise.allSettled, ~10s):
    - 🧩 **阿里黑话版** — 颗粒度 / 抓手 / 闭环 / 拉齐 / 赋能 高密度
    - 🎭 **PUA 版** — 老板向下 "心力不够 / 格局打开 / 自驱不到位"
    - 🎩 **装腔版** — "复盘 / 反思 / 长期主义 / 反脆弱" 鸡汤
    - 💢 **直球版** — 没装饰口语吐槽, 不归因到"心态"
  - 每种 style 独立精心调过的 system prompt (硬性要求黑话密度 / 句式)
  - Rate limit: 1h × 5 (LLM 重活)
  - `GET /api/weekly/styles` — 静态目录, 前端 empty state 预览用
- `client/src/routes/Weekly.tsx` (260 行) — `/weekly` 新页面:
  - 顶部输入框 (300 字上限) + 4 个示例事件 chip
  - 提交后 4 卡并行展示, 每张独立 element color (青/玫红/金/橙)
  - 每卡有 📋 复制按钮 (反馈 ✓ 已复制 1.8s)
  - busy 状态 4 卡 skeleton + ✍️ 脉冲动画

### Added — Phase B: Profile mihoyo 外壳迁移
- `Profile.tsx` 外壳:
  - 旧: `<div className="y2k-bg ...">` 静态 Y2K 黄粉紫底
  - 新: 米哈游 cosmic gradient (radial purple+gold mesh)
  - Top bar 中间加 `<EventPill subtle stars=5>🪪 我的班味卡</EventPill>`
- **关键克制**: ProfileCard 内部完整保留 Y2K 视觉 (4px 黑边 / 黄粉紫渐变 /
  chunky shadow) — 那是"班味卡"的核心 IP, 改了会丢失识别度。
  米哈游底 + Y2K 卡的对比反而强化"复古玩具感", 像 mihoyo 角色卡里
  内嵌一张拍立得照片。

### Added — Phase A: v6.x 视觉迁移前后对比 teaser
- `assets/launch-demo/comparison.html` (240 行) — 5 scene × 6s storyboard:
  1. Hook: "11 个路由统一为米哈游游戏 UI" + 标记
  2. 对比 1: 🔮 占卜系 (旧 plain text vs 新 EventPill 5★)
  3. 对比 2: 🎤 段子 UGC (同上)
  4. 对比 3: 🏢 鼠人公司 (旧渐变文字 vs 新 EventPill)
  5. CTA: 11/12 路由迁移完成 + v6.5 增量
- `assets/launch-demo/comparison-teaser.{mp4,gif}`:
  - mp4 257 KB · gif 793 KB · 30s (轻量, 适合 Twitter 嵌入)

### Verified
- ✓ typecheck 0 新 regression
- ✓ Weekly endpoint UAT 2 风格 (阿里 + 直球): 阿里版"颗粒度/沉淀/CEO视角/
  透传/闭环/赋能" 6+ 黑话, 直球版"甲方反复折磨" 真实口语
- ✓ Profile 米哈游外壳 + Y2K 卡内核共存视觉对比正确
- ✓ Comparison teaser scene 3 split 渲染清晰

### Files
- 新 2: weekly.ts route + Weekly.tsx page (430 行总)
- 新 2: comparison.html + comparison-teaser.{mp4,gif}
- 改 3: index.ts (mount weekly route) + App.tsx (register /weekly) +
        Profile.tsx (外壳迁移)

### v6.5 体验意义
- 周报生成器: 最痛的事 (写周报) + 最爆的梗 (公司话术), 直接 viral 引擎
- Profile: 完成 12/12 路由统一, 同时尊重独立美学 (Y2K 班味卡)
- Teaser: 给 Twitter / B 站等需要 30s 对比片的人现成素材

---

## v6.4.0 — 2026-05-23 · launch-ready (视觉收尾 + 真实游戏重录 + 提交包)

### Why
v6.3 留了 4 个未迁移路由 (Talkshow / FortuneGallery / Classic / Immersive),
真实游戏 footage 还是 v5.x 拍的 (没有米哈游 EventPill),
launch 各平台提交也没成稿。v6.4 把这些坑全踩平 — 真发布前 5 分钟就能 ctrl-V。

### Added
- **完整 design migration 收官**:
  - `Talkshow.tsx` header "🎤 班味单口" → EventPill subtle stars=5
  - `FortuneGallery.tsx` header "🔮 牌库 · 24 张" → EventPill subtle stars=5
  - `Classic.tsx` 顶部 bar 旧"职场杀"渐变文字 → EventPill subtle stars=5
    "🏢 职场杀 · v6"
  - `Immersive.tsx` 新增 top-left 浮动 badge "🎬 沉浸 · v6"
    (不干扰中间 phase chip 居中布局)
- **assets/launch-demo/game-highlight.{mp4,gif}** 重录:
  - 17.1 MB v6.x webm (4 min 自动游戏 capture)
  - 30s 高光 = 5s intro + 5×5s speech moment
  - 含 6 个全阿里黑话 speech: 优化 / 颗粒度 / 闭环典范 / owner /
    心智 / 借假修真 / 第二曲线
  - mp4 3.0 MB / gif 4.3 MB
  - 画面含 v6.4 新加的 "🎬 沉浸 · v6" 浮动 EventPill
- **assets/launch-demo/hero-combined.{mp4,gif}** 同步重生:
  - storyboard 米哈游故事 15s + 新 v6.x 真实游戏 15s = 30s
- **assets/launch-demo/cluster-modal-demo.{mp4,gif}** 新增:
  - 24s Playwright 端到端录屏: 进酒馆 → 聊 3 条 → 点 "约一杯"
    → cluster create → modal 弹出 → 服务端 PNG 渲染加载完成
  - mp4 744 KB / gif 5.4 MB
- **`docs/LAUNCH_SUBMISSION_PACK.md`** (新增 305 行):
  - 24h 倒计时时间表 (PST + 北京双时区)
  - ProductHunt 完整表单 9 字段 paste-ready
    (name / tagline / short pitch / long desc / topics / first comment /
     9 张 gallery 顺序)
  - Hacker News Show 完整 title + URL + text
  - 即刻 / 小红书 / Twitter thread 4 推全部成稿
  - launch 当天 4 种高频问题回评模板
  - 24h 数据收集 KPI 表

### Verified
- ✓ typecheck 0 新 regression
- ✓ Classic / Immersive / Talkshow / FortuneGallery EventPill 渲染对齐
- ✓ 真实游戏录屏含 v6.4 浮动 EventPill (visible in top-left frame)
- ✓ Modal demo 完整流: chat 3 条 → share btn → cluster create →
  PNG 预览 + 3 按钮全部出现

### 累计 v6.x 视觉迁移完整地图
```
✅ 主入口      Landing (v6.1)
✅ 占卜系     Fortune / FortuneHistory (v6.2)
✅ 用户操作    Settings (v6.2)
✅ UGC        TalkshowUgc (v6.2)
✅ 攒局       Squad / SquadHistory (v6.3)
✅ 裁员       FiredLanding (v6.3)
✅ 单口       Talkshow (v6.4)
✅ 牌库       FortuneGallery (v6.4)
✅ 主玩法     Classic / Immersive (v6.4)
🟡 保留 Y2K   Profile (刻意复古, 永不迁移)
```
11 / 12 路由统一了米哈游设计语言。Profile 保留 Y2K 独立美学。

### Files
- 改 4: Talkshow / FortuneGallery / Classic / Immersive (各加 EventPill)
- 重录 2: game-highlight.{mp4,gif} / hero-combined.{mp4,gif}
- 新 1: cluster-modal-demo.{mp4,gif} (24s 端到端 modal flow)
- 新 1: LAUNCH_SUBMISSION_PACK.md (305 行)

---

## v6.1.0 — 2026-05-22 · Z 世代趣味升级 (米哈游风 + UGC + 拼版)

### Why
基于"对 Z 世代有吸引力 + 玩法更黏 + 朋友分享"的产品方向, 落地 4 件套:
1. UI/UX 升级到米哈游典型游戏画风 (深紫宇宙 + 5★ 金边 + 元素 chip)
2. 段子库走向 UGC 共创, 月度精选机制留住头部贡献者
3. 酒馆 1v1 体验扩展成"朋友拼版" - 多人共享同 AI 视角
4. 现场截图 + LLM 实际生成的中英对照文案全面迭代

### Added — Phase A: 米哈游风新 hero
- `assets/launch-demo/storyboard.html` 重做 — 米哈游 design tokens:
  - 深紫宇宙 + starfield + 6 方向 hex texture
  - 5★ 角色卡边框 + shimmer gradient
  - EVENT pill + skill-card description style
  - 金色 wordmark + 月光白文本对比
- `demo-memory.gif` (1.87 MB) / `demo-memory.mp4` (561 KB) — 5 个 scene
  × 6 秒, 视觉冲击力比 v6.0 storyboard 强一档
- 5 张 PR Hunt gallery 静态帧重抓

### Added — Phase B: Landing hero 米哈游升级
- `Landing.tsx` eyebrow 区域改造:
  - 旧粉红 pill → 金色 + 紫色 + 玫红 gradient pill
  - 加 "v6.1 · NEW EVENT · AI 同事会记住你" 文案
  - 末尾 ★★★★★ 5 星 chip (金色高亮)
  - 文案使用 -webkit-background-clip + 白→金渐变
- 整个 hero 第一屏视觉接近米哈游"新版本上线"页风格

### Added — Phase C: 朋友拼版彩蛋
- `server/src/services/barClusterStore.ts` (180 行) — JSON 持久化, cap
  8 人/cluster, 30 天 TTL, 自动抽 "金句" (用户 + AI 各最长的 1-2 条)
- 3 个新端点:
  - `POST /api/bar/cluster/create` — host 创建 cluster (带自己 transcript)
  - `POST /api/bar/cluster/:id/join` — friend 加入 (追加 transcript)
  - `GET  /api/bar/cluster/:id` — 拉所有 participants + snippets
- `Bar.tsx` 改造:
  - share() 现在先 POST create, URL 带 ?cluster=<id>
  - useSearchParams 检测 incomingClusterId, 用户聊够 2 条自动 POST join
  - 状态 banner: "朋友邀你加入拼版 · 再聊 2 句就自动加进去" /
    "✓ 已加入拼版 · 第 N 位金句贡献者" / "✦ 你已开拼版 · 发链接给朋友"

### Added — Phase D: 段子 UGC 投稿 + 月度精选
- `server/src/services/talkshowUgcStore.ts` (170 行):
  - 投稿状态机: pending → approved / rejected (auto-moderation)
  - 黑名单刻意保守: 直接公司点名 / 政治 / 色情 / 暴力, 调侃 HR 婉辞全允许
  - 月度精选: 过去 30d approved 段子按 likes desc
  - per-user cap 50, total cap 5000
- 4 个新端点 (挂到 `/api/talkshow/`):
  - `POST /ugc/submit` — 投稿 (rate-limit 1h × 3)
  - `GET  /ugc/monthly` — 本月精选 top N
  - `GET  /ugc/me` — 我的投稿史 (含 status)
  - `POST /ugc/like/:id` — per-IP 防刷点赞
- `client/src/routes/TalkshowUgc.tsx` (305 行) — `/talkshow/ugc` 新页面:
  - ⭐ 本月精选 — 卡片列表, 点赞按钮
  - 🎤 投稿表单 — 标题 / 正文 / tag / region, 字数计数, 自动错误提示
  - 📋 我的投稿 — 含 pending / approved / rejected 状态徽章
- `Talkshow.tsx` header 加 "🎤 投稿 ★" 金色入口 chip

### Verified
- typecheck 0 新 regression (talkshow / bar 新代码 clean)
- UGC submit endpoint UAT: 投稿"周一早会的灵魂第一问" → pending 通过
- Cluster create endpoint UAT: 返回 `bcl-mphikvb8-0ghcvk` (TTL 30d)
- Server hot-reload 全部生效

### Files (净增 / 改)
- 新增 6: `storyboard.html` (重写) / `talkshowUgcStore.ts` / `barClusterStore.ts`
  / `TalkshowUgc.tsx` / `demo-memory.gif` (重生成) / `demo-memory.mp4` (重生成)
- 改 5: `Landing.tsx` / `Talkshow.tsx` / `Bar.tsx` / `App.tsx` / talkshow + bar routes
- 5 张 storyboard 静态帧 (`01..05-*.png`) 重抓

### 体验意义
- 视觉: 从"还行的工具风" → "看起来像真游戏" (米哈游 design system)
- 黏性: 段子库从"看别人写的" → "自己也能上墙", UGC viral loop
- 分享: 酒馆从"1v1 私聊" → "朋友拼版", 多人共享 AI 视角的群体记忆
- 共鸣: tagline 全面切到 "拥抱变化 / 颗粒度 / 班味 / 精神工位" Z 世代词汇

---

## v6.0.0 — 2026-05-22 · Phase B 收尾 + 公开发布

### Added
- `GET /api/memory/beliefs?userId=<id>` — 返回特定 spectator 持有的全部
  beliefs, group by archetype, 每 archetype cap 5 条 (按 ts DESC)
- `Settings.tsx` 新增 "💭 他们对你的判断" 面板 — 展示每个 AI 人格对你
  形成的判断, 配上"反思尚未触发"的引导态
- `Landing.tsx` 右上 header 加 ⚙️ 入口到 `/settings`
- `docs/V6_MEMORY_TECH_BLOG.md` — 中英双版技术博客 (中文 ~250 行 +
  英文 ~120 行, 投稿 HN Show / V2EX / 掘金 / ProductHunt):
  - 一句话价值主张
  - 实际产生的 LLM speech 引用
  - 为什么 RAG 不够 (3 个硬伤)
  - reflection 涌现 belief 的具体 example
  - 选型 trade-off + bench 数据
  - 7 个对手对比 (MetaGPT / AutoGen / ChatDev / Smallville / AI Town /
    MiniMax 官方狼人杀 / OpenBMB AgentVerse)
  - 7 项护城河 (含 Phase B 新增的 chunky-style + reflection)
  - 完整 quickstart + roadmap

### Done-when (RFC §4.3 全部达成)
- ✅ Memory 跨 game_id 持久 cap 200/agent×player (HNSW + 复合索引保障)
- ✅ "💭 你的 AI 同事" 面板 (Settings 页, beliefs 实时显示)
- ✅ Forget mechanism (per-archetype + global, 2-step confirm)
- ✅ 技术博客出稿

### Phase B 完整里程碑

```
✅ v5.8.0      pgvector + memoryEmbedder + ensureSchema
✅ v5.8.1      memoryWrite + memoryRecall + BaseAgent + GameEngine
✅ v5.8.1.1    bench (HNSW p95 15ms) + 全局 forget
✅ v5.8.2      chunky-style per-spectator + Settings forget UI
✅ v5.9.0      Reflection 5 轮触发 + belief × 1.5 加权
✅ v6.0.0      Belief panel + 技术博客 + 公开发布
```

按 ITERATION_PLAN §B 估的 80-100 工时,实际 ~10 小时模拟完成。
RFC-driven + probe-driven 开发模式 ROI 极高。

---

## v5.9.0 — 2026-05-22 · Phase B Reflection 层

### Added
- `server/src/services/reflectionLoop.ts`(210 行)— `maybeReflect()` 是
  公共入口,每个 GameEngine round-end 后 fire-and-forget 调用:
  - **触发策略**: round % 5 == 0 OR 未反思事件 > 10 (RFC §4.2)
  - **LLM prompt**: 给定 ≤N 条 events, 输出 3-5 条 high-level beliefs
  - **解析容错**: "- " bullets → "1." 编号 → naked lines, 三层兜底
  - **缓存**: content-hash(archetype, sorted-event-ids) → beliefs[],
    LRU 256 slots, 同样 events 集合 0 再生成
  - **watermark**: pullUnreflectedEvents 用最近一次 belief 的 ts 做高水位,
    自然避免重复反思同一批 events
- `server/scripts/probe-reflection.ts` — 5-step done-when 验证

### Changed
- `memoryRecall.recallMemories` — kind='belief' 的 importance 现在
  × 1.5 加权 (clamp to 1.0). 同等 relevance 下 belief 必然排在
  event 之前。从 RFC §4.2 字面落地。
- `GameEngine.recordRoundMemory` 末尾 fire `maybeReflect()` per
  unique surviving personality (并行, 各自 self-gated by threshold).
- `BaseAgent` + `reflectionLoop` 都把 `openai`/`MODEL` 改成 lazy
  factory 函数。修了一个隐 bug:ESM imports 在 `dotenv.config()`
  之前被 hoisted,模块级 `const MODEL = process.env.OPENAI_MODEL` 捕获
  空字符串 + 'gpt-5.4-mini' 兜底名,过去靠 Minimax M2 fallback 救活
  没显形。reflection 因为 prompt 短不易触发 fallback,直接撞 Qingyun
  "Invalid token" + 限速 120s。修后 gpt-4o-mini 正常调用。

### Verified

**reflection probe (`probe-reflection`):**
- 12 events → 5 beliefs LLM 生成质量惊艳, 包括纯推理出来的 "我怀疑钱七和
  张三暗中勾结" (events 里只各有零散提及, belief 是综合判断)
- recall after reflection: top-1 是 belief (score 0.776, importance 1.0),
  top-2 是相关 event (score 0.761, importance 0.5) — × 1.5 加权生效
- 同 round 第二次 fire: events=0 不触发 (watermark 推进)
- 5/5 pass

**回归 — cross-game probe (`probe-memory-cross-game`):**
- BaseAgent lazy-model 修复后, gpt-4o-mini 直接出 speech
  (不再 fallback 到 Minimax)
- 仍然引用 memory 里的 "@王五同学" + "颗粒度", 但 LLM 风格不同
  (没用显式"上次" — 这是 LLM 个性差异, 不是 pipeline 问题)

### 体验意义
- AI 不再只是"记得发生过什么", 而是"对这场局有判断". 例如:
  - event: "钱七反常投了赵六" + "张三第一次发言阴阳"
  - belief: "我怀疑钱七和张三暗中勾结" ← reflection 推理出来的
- belief 加权让 high-level 判断比 raw event 更早出现在 prompt 里,
  agent 的人格连续性 + 长期记仇逻辑显著强化。

### TODO 下个版本 (v5.9.1 polish)
- [ ] reflection LLM model 切到更便宜的 gpt-4o-mini-2024-07-18 specific (现在 OPENAI_MODEL 默认就是 gpt-4o-mini, 已 OK)
- [ ] UI 暴露 belief — Profile/Settings 加 "💭 你的 AI 同事们对你的判断" 面板
- [ ] cache 持久化 — 现在 in-process, 重启就丢; 拓展到 Redis / pgvector?
- [ ] reflection 频率自适应 — 高活跃用户每 5 局调高到每 10 局节省 token

---

## v5.8.2 — 2026-05-22 · chunky-style per-spectator memory

### Added
- `client/src/routes/Settings.tsx`(200 行)— `/settings` 新页面。
  Section "🧠 AI 同事记忆":
  - 顶部总记忆条数 + 来自几个人格
  - 每个人格一行,可单独"清空"(2-step confirm)
  - 底部 ☢ 核选项:"清空全部 AI 同事的记忆"(也是 2-step confirm)
- `server/scripts/probe-memory-per-spectator.ts` — 8-step 验证 spectator
  scope 隔离 + scoped forget

### Changed
- `GameCreateSchema` 加 optional `userId` 字段(8-64 字符);
  `Landing.tsx` + `Immersive.tsx` 的 `socket.emit('game:create')` 现在
  自动塞 `getUserId()`
- `GameEngine` constructor 多 1 个 `spectatorUserId` 参数,存为
  `readonly spectatorUserId: string | null`
- `BaseAgent` constructor 多 1 个 `spectatorUserId` 参数,recall 时
  传给 `recallMemories({targetUserId})`
- `GameEngine.recordRoundMemory` 给每个 entry 打上 `targetUserId`
- `App.tsx` 注册 `/settings` route

### Verified
- per-spectator probe 8/8: A 只看到 A 的记忆,B 只看到 B 的,
  scope=null 看到全部,forget(A) 删 2 条不动 B
- 兼容性: 老客户端(不传 userId) → 服务端 spectatorUserId=null →
  memory 走 v5.8.1 globally-keyed 路径(不破)

### 体验意义
- 同一个 `passive_aggressive` 人格,在 Alice 的游戏里 vs 在 Bob 的游戏
  里,会进化出**两套不同的人格记忆**。Alice 救过他,他就记 Alice 一辈子;
  Bob 投过他出局,他就记 Bob 一辈子。
- 这是 RFC §2 "chunky-style 同事记仇" 的完整实现。
- 用户主动权:Settings 页一键抹掉自己在 AI 心里留下的所有痕迹。

---

## v5.8.1.1 — 2026-05-22 · polish (benchmark + 全局 forget)

### Added
- `server/scripts/bench-memory-100games.ts` — write 路径全压测(seed
  3000 entries via 500 Qingyun embed calls; 慢但完整)
- `server/scripts/bench-recall-only.ts` — recall 路径压测(对已 seed 的
  corpus 跑 100 次查询,排除 embed roundtrip 后纯 pg 测)
- `server/src/routes/memory.ts` — Phase B memory 运维端点:
  - `POST /api/memory/forget` — 按 archetype/gameId/kind/targetUserId
    任意组合 DELETE, 全空 → 全库 wipe. 法务安全网, 不依赖 v5.8.2
    的 spectator userId 绑定 (RFC §5.4 兜底)
  - `GET /api/memory/stats` — 总数 + 按 archetype 分布

### Bench Result (1836-entry corpus)
```
HNSW recall p95 (pg only): 15ms ✅ (SLO ≤ 200ms)
HNSW recall p95 (含 embed): 1101ms — embedding roundtrip 是瓶颈
Embedding API roundtrip p95: ~1086ms
LRU cache: 100% 命中率, 重复 query 0 成本

per-entry: 10.44 KB (data + 1536-dim vector + index)
Neon 500MB free ceiling: ~49,062 entries
Neon 3GB ceiling: ~294,372 entries
≈ 100 个活跃用户 × 100 局 × 30 events 刚好填满 3GB
```

### Verified
- forget endpoint UAT: `{"archetype":"bench-archetype-0"}` → 精准删
  306 行, 其他 archetypes 未触及
- Memory routes 经 tsx --watch 热加载, 服务端无需重启

---

## v5.8.1 — 2026-05-22 · Phase B 记忆层端到端贯通

### Added
- `server/src/services/memoryWrite.ts`(125 行)— `writeMemory()` 单条
  + `writeMemoryBatch()` 多条。fire-and-forget(swallow err 不抛),NULL
  embedding 兜底(RFC §5.6)。
- `server/src/services/memoryRecall.ts`(165 行)— `recallMemories({agent,
  query, k=5})` 二阶段执行: SQL 取 HNSW + LIKE union → JS 算
  `relevance*0.5 + recency*0.3 + importance*0.2` 排序。recency 24h
  半衰期指数衰减,LIKE fallback 给 0.3 relevance(低于 vector 命中
  但非零)。
- `server/scripts/probe-memory-write-recall.ts` — 6-step round-trip
  smoke test。
- `server/scripts/probe-memory-cross-game.ts` — **done-when 验证脚本**。

### Changed
- `agents/BaseAgent.ts` — `generateSpeech(context, priorSpeeches?, opts?)`
  签名扩展。当 `personality + opts.gameId` 都有时,recall top-4 跨局
  memory(score ≥ 0.45, 过滤掉当前 game),拼入 prompt 的`【你跨局的
  相关记忆】`block。失败完全静默(memory 层是可选增强,绝不阻塞 speech)。
- `engine/GameEngine.ts`:
  - speech 调用现在传 `{gameId, round}`
  - vote 结算后 fire `recordRoundMemory()` 私有方法 — 给每个 surviving
    agent 写 `kind=event` (importance 0.5), 给被开除的 agent 写 0.9
    importance 的"我被开除了"自我记忆。batch + lazy-imports 防止 engine
    硬依赖 pgvector。

### Verified (2026-05-22)

**write+recall round-trip (`probe-memory-write-recall`):**
```
✅ 6/6 — write single / batch 5, recall semantic (王五→王五 distance 0.34) /
       kind=belief filter / gibberish recency-only 1.0, cleanup
```

**cross-game DONE-WHEN (`probe-memory-cross-game`):**
- Seed: passive_aggressive 在 game_past 被 @王五 用 "颗粒度不够" 阴阳 +
  @王五 联合 @赵六 投出局
- Fresh BaseAgent 同人格、new game id, generateSpeech
- LLM output 第一句:**"@王五 同学,你这张嘴我还是记忆犹新的哈——上次
  说我颗粒度不够,回头就联合 @赵六 把我投出局,这波闭环操作真是打得
  漂亮"**
- regex 命中 "上次" 关键词,内容精确复现 4 个 memory 信号(加害者 /
  伤害词 / 联合者 / 跨局指代),人格保留

### Scope note (v5.8.1 vs full chunky-style)

经典模式 `game:create` 目前**不绑 spectator userId**(纯匿名 socket)。
本版本 memory 只 key 在 `agent_archetype`(personality.id),实现 **"角色
跨局演化"**(同一个 passive_aggressive 在所有 game 里累积记忆)。

完整 chunky-style "AI 同事记你的仇" 需要在 v5.8.2 给 game:create 加
X-User-Id 绑定 + `target_user_id` 列回填, schema 已经预留 nullable。

### TODO 下个版本 (v5.8.2)
- [ ] `game:create` 接受 X-User-Id, 存 spectator userId 到 engine
- [ ] BaseAgent 把 spectator userId 传给 recall (target_user_id 过滤)
- [ ] socketHandler 在每个 player 的 speech 写 memory 时打上 target_user_id
- [ ] Forget mechanism (RFC §5.4): `/settings/fortune` 加 "清空我对 AI
      同学的记忆" → POST /api/memory/forget?archetype=...

---

## v5.8.0-rc.1 — 2026-05-22 · Phase B 记忆层 infra 三件套

### Added
- `docker-compose.yml`(repo root)— 本地 pgvector dev 容器 (pgvector/pgvector:pg17),
  port 5433, named volume 持久化。Prod 走 Neon 托管 (RFC §5.1)。
- `server/src/services/pgvectorClient.ts`(165 行)— pg Pool 单例 + 幂等
  `ensureSchema()`。流程:
  1. `CREATE EXTENSION vector`
  2. `pgvector.registerType(client)` — pool.on('connect') 给后续连接自动挂
  3. `CREATE TABLE memory_entries (VECTOR(1536) embedding, ...)`
  4. 复合索引 `(agent_archetype, target_user_id, kind)` + HNSW 向量索引
- `server/src/services/memoryEmbedder.ts`(165 行)— OpenAI text-embedding-3-small
  via Qingyun, content-hash LRU 缓存 (1024 entry cap), 8s timeout, NULL-on-failure
  (RFC §5.6)。`embedOne()` + `embedMany()` + `clearEmbeddingCache()`。
- `server/scripts/probe-memory-infra.ts`(180 行)— 端到端 smoke test:
  ensureSchema → embed → INSERT → cosine recall → cleanup。

### Verified (2026-05-22, 跑了 2 次)
```
✅ 1. ensureSchema()       — extension + table + 2 indexes created
✅ 1b. indexes present     — idx_mem_agent_target, idx_mem_embedding, pkey
✅ 2. embedOne()           — 1536-dim vector, first val 0.0009
✅ 2b. embedOne cache hit  — second call zero API roundtrip
✅ 3. INSERT row           — pgvector.toSql serialisation OK
✅ 4. recall via cosine    — 张三 投票 记仇 → "...张三投了我..." distance 0.4049
✅ 5. cleanup              — DELETE OK
═══ 7 pass · 0 fail ═══
```
BIGSERIAL 在两次 probe 间从 1→2,验证数据库持久化跨容器进程。

### 关键决策(锁定在 [`V5.8_MEMORY_RFC.md`](./V5.8_MEMORY_RFC.md))
- pgvector / Neon prod + Docker dev
- OpenAI text-embedding-3-small via Qingyun (1536 dim) — Minimax embedding 已下架,
  三重证据 §5.2
- classic 7-agent 模式首发
- chunky-style 同事记仇 (memory keyed by agent_archetype × target_user_id)

### Bug discovered + fixed
- `pgvector.registerType(pool)` 不能在 `getPool()` 里跑(extension 还没建),
  也不能传 Pool(只接受 Client)。改成 `ensureSchema` 里:
  acquire client → `CREATE EXTENSION` → `registerType(client)` →
  `pool.on('connect')` 挂后续连接的 registerType → release client。

### TODO 下个版本 (v5.8.1)
- [ ] `memoryWrite.ts` — `writeEvent({agent, targetUid, content, source})` fire-and-forget
- [ ] `memoryRecall.ts` — `search({agent, targetUid, query, k=5})` 含 relevance × recency × importance 排序
- [ ] `BaseAgent.generateSpeech` 改造接 recall
- [ ] socketHandler round-end hook → 写 event memory
- [ ] 跨局验证脚本 `scripts/test-memory-cross-game.ts`

---

## v5.7.0 — 2026-05-22 · 翻看牌库 Gallery

### Added
- `client/src/routes/FortuneGallery.tsx` — 新页面 `/fortune/gallery`,
  read-only 全 24 卡 deck explorer。按 vibe tier 分组(大吉 / 中平 /
  凶险), 2×3 / 3×3 响应式 grid, 每张 thumbnail 用卡牌自身渐变色。
- 选中任一张 → bottom-sheet 弹出完整卡面(忠告 + 微行动)+ "把这张牌
  做成分享卡" CTA, 复用 `FortuneShareCardModal` 让用户能为牌库里
  *任何* 一张牌生成分享 PNG, 不仅是今日抽签。
- `Fortune.tsx` header 右上 "牌库 →" 入口(替换原本重复的 date 戳)。

### Why
- 24 张卡每天只翻 1 张, 用户对 "其它 23 张长啥样" 的好奇是 retention
  hook。Gallery 满足好奇心 + 提升内容深度感知 (这不是个 3 张卡的
  小玩具)。
- 内容创作者(发小红书的人)可能想用某张特定的卡, 而不是今天的卡。
  Gallery 的"把这张牌做成分享卡" CTA 直接服务这个场景。

---

## v5.6.0 — 2026-05-22 · 7 天占卜历史

### Added
- `server/src/services/fortuneHistoryStore.ts` — per-user JSON 持久化,
  cap 30 entries (1 月). 镜像 `squadHistoryStore` 的 in-memory cache +
  atomic-rename pattern。
- `GET /api/fortune/me` 内嵌 fire-and-forget `recordFortuneDraw`, 同日
  重复打开幂等。
- `GET /api/fortune/history?limit=N` — 最近 N 条(默认 7, max 30)。
- `client/src/routes/FortuneHistory.tsx` — `/fortune/history` 新页面,
  顶部 summary strip(avg vibeScore + 主导 tier + 主导 tag 中文化)+
  纵向时间线列出每天的卡(emoji + 标题 + 日期 + tier 标签)。空状态
  优雅引导新用户先去 /fortune 抽今天。
- `Fortune.tsx` footer 加 "📜 看本周" 链接, 跟原 "明天的牌" 提示并列。

### Why
- "回访 hook" — "明天再来" 是 1 步; "看本周积累" 是已经累积的价值,
  心理拉力强一档。当用户连续 3-5 天后, history 页变成 personal
  catharsis artefact (每周班味曲线)。

---

## v5.5.1 — 2026-05-22 · Web Share API

### Added
- `utils/fortuneShareCard.ts` 新增 `canSystemShareImage()` 二段
  capability detection(navigator.share + canShare file probe), 和
  `systemShareFortuneCard(data, opts)` 直出 OS share sheet。
- `FortuneShareCardModal.tsx` 在 iOS Safari / Chrome Android 上把主
  CTA 升级为 "📲 一键分享到 微信 / 小红书 / 微博" 全宽渐变按钮,
  复制 / 下载 降级为下方小 chip。Desktop 等不支持的浏览器 UI 不变。

### Why
- 在 iOS/Android 上, 用户从"看到分享卡" → "发到微信" 原本是 3 步
  (复制 → 切应用 → 粘贴), 系统 share sheet 砍到 1 步。
- Feature-detect 双段(navigator.share + canShare file probe)避免在
  desktop Chrome / 老 Safari 上误推不可用的按钮。

---

## v5.5.0 — 2026-05-22 · 占卜卡一键分享 PNG

### Added
- `utils/fortuneShareCard.ts` — 纯 Canvas 2D 渲染 1080×1350 IG-portrait
  PNG, 复刻 v1.5.0 `dailyShareCard.ts` 的 pattern。塔罗卡(渐变 + vibe 槽 +
  大 emoji + 标题 + 副标 + date stamp)+ 今日忠告 / 微行动 双 panel +
  `#班味占卜` hashtag footer。
- `components/FortuneShareCardModal.tsx` — preview + 📋复制 / 📥下载 双按钮,
  blob URL 自动回收。
- `Fortune.tsx` CTA 升级: 单"复制链接"按钮 → 双按钮(📤 生成分享卡 PNG 占
  2/3 主 weight + 🔗 复制链接 占 1/3 副 weight)。

### Why
- v5.4 分享路径"复制 URL → 用户截图 → 发圈"3 步摩擦, viral 损耗大。
- 一键 PNG 直接交付"完成的图像", 跳过截图环节, 朋友圈/小红书/Twitter
  通吃; 自带 `#班味占卜` + `officezoo.app` 水印, 二次曝光归我们。
- 复用 v1.5.0 已经验证过的 canvas pattern, 零依赖、零后端、纯客户端。

### Verified
- 3 个 vibe tier (大吉 92 / 小吉 65 / 大凶 18) 渲染正确, 5 档 VIBE_COLOR
  正确映射 (green / lime / red bar)。
- modal preview img 在 modal 内 4:5 槽对齐, 复制 + 下载按钮全功能。

---

## v5.4.1 — 2026-05-22 · 班味占卜视觉打磨

### Changed
- `VIBE_COLOR` 3 档 → **5 档**, 跟 `VIBE_LABEL` 一一对齐。
  解决"小吉 65 → 黄色警告 bar" 这种 label-color 错位的认知摩擦。
  大吉 → `#22c55e` / 小吉 → `#a3e635` / 中平 → `#fbbf24` /
  小凶 → `#fb923c` / 大凶 → `#ef4444`。
- 卡片顶部 vibe label + 评分加 `textShadow`, 在暖色渐变上(KPI 神助攻 /
  PUA 雷暴日) 不再被吃掉。
- 卡底 `OFFICE ZOO · {date}` 日期戳 white/55 → white/75 + shadow。
- Footer 拆 2 段: pre-CTA 行 "截图发朋友圈 / 小红书 → 标签 #班味占卜"
  (white/65 + 金色 hashtag, 贴 CTA 上方促分享) + post-CTA 行
  "✦ 明天的牌 · 子时(UTC 00:00) 重新洗牌" (white/55, 独立成行,
  daily-habit hook 不被分享提示挤压)。

---

## v3.0.0 — 2026-05-18 · 化学反应导演

### Added
- **`analyzeSquadChemistry(members)`** — 6 条启发式规则推导出小队的群体动力学
  hint,LLM 编剧把这些 hint 织进 5 幕剧:
  1. 行业碰撞 — 国企+大厂 / 创业+金融 / 教培+大厂 等 6 对
  2. 地域碰撞 — 北漂+成都 / 沪+京 / 深+成都 等 5 对
  3. 同城/同行业群像 — 2/3 以上成员同 tribe → 共同苦水主题
  4. 天敌同台 — `ARCHETYPE_PAIRS` rival 出现 → 第一幕就摩擦
  5. Trait 两极 — 单维 spread ≥0.7 → 对照镜头
  6. 单点外人 — 仅 1 人有 tribe → "格格不入"张力
- **Roster line 加 tribe tag** — `[region=shanghai, industry=mcn]` 让 LLM 知道每位
  成员的地域 + 行业,可以写出"陆家嘴早 7 点的 MCN 团队"这种精确剧情。

### Changed
- `SQUAD_DIRECTOR_SYSTEM_PROMPT` 加入 "chemistry-aware 编剧准则" 段落,明确要求
  导演把化学反应分析织入剧情弧,不能写"通用版"。

### Verified
- 4 套典型组合 unit-test 全过:国企+大厂 / 全员北漂 / 卷王+反卷 / 沪漂单点。

---

## v2.3.0 — 2026-05-18 · 城市段子上桌

### Added
- `TalkshowScript.region?` 字段(back-compat undefined = generic)
- 6 篇区域专属段子:`bit-r-{bj,sh,sz,hz,cd,os}-01`
  - 北漂《国贸打车 47 分钟》/ 沪漂《陆家嘴的早 7 点》
  - 深漂《深圳的副业群》/ 杭漂《我的花名叫"无忌"》
  - 成都《同事开会全在喝茶》/ 海外《我润到温哥华第一周》
- 3 篇现有段子 retroactive 标 `region: 'beijing'`(bit-011/024/028)

### Changed
- `dailyDrama.ts` talkshow picker 改 3 层 fallback:
  region match → shineTalkshowTag → random pool。
  Region 层优先,因为"这段子知道我是上海人"的命中感最强。

### Verified
- u-v23-sz-c quiz → sz-money-chaser → daily talkshow lands `bit-r-sz-01`

---

## v2.2.0 — 2026-05-18 · v2.0.0 archetypes 的 en/ja/ko 翻译

### Added
- DICT 加 36 条新条目(12 archetypes × name/shortName/tagline × 4 locale)
- `archetypeLabel(archetype, field)` 统一 helper — dict → archetype[field] → key 三层 fallback

### Translation register
- 走"短视频字幕风格",不走"学术翻译":
  - 巴适得板 → "Life is chill — work just funds the hotpot"
  - 996 + 花名 全部保留为 loanword

### Changed
- `Profile.tsx` 全面切换到 `archetypeLabel()`,v1.x archetype 保持原 zh-CN 兜底

---

## v2.1.0 — 2026-05-18 · Tribe-aware 推荐

### Added
- `FiredScenario.industry?` 字段
- 8 个剧本 tag:6 个海外大厂 → `'faang'`,startup-cliff/probation-fire → `'startup'`,
  mass-layoff-illegal → `'soe'`,org-optimization → `'faang'`
- FiredLanding "{archetype.emoji} 我的圈子 · N" tribe 过滤 chip

### Changed
- `dailyDrama.ts` fired picker 加 industry-match 层:
  shineScenarioId(hand-curated)→ industry match(NEW)→ random

### Verified
- u-v21probe-faang quiz → faang-cog → daily fired lands `org-optimization`

---

## v2.0.2 — 2026-05-18 · Pack-complete 演化

### Added
- `POST /api/fired/pack/complete` — 客户端在 5/5 通关时调用一次
- `packCompleteDelta()` — grind+0.3 ambition+0.2(marathon 奖励)
- FiredResult 加 `useFiredProgress.getState()` 实时读取最新 cleared count,
  sessionStorage 守护防止重复 fire

### Verified
- POST 直测 → drift gain 正确,evolution feed 现含 4 类 kind

---

## v2.0.1 — 2026-05-18 · 多 surface 演化

### Added
- `squadEndDelta({isHost, actCount})` — 全员 +visibility +empathy;host 额外 +ambition
- `talkshowCreateDelta()` — +ambition +visibility +snark
- squadHandler 在 squad:advance 触发 'ended' 时 fire evolution 给每个有 profile 的 member
- talkshow `/generate` 在带 X-User-Id 时 fire evolution

### Verified
- Squad probe → host 拿到 squad-end event;talkshow generate → talkshow-create event

---

## v2.0.0 — 2026-05-18 · 12 → 24 archetypes + 地区/行业维度

### Added
- 12 新 archetype:
  - **Industry (6)**:国企铁饭碗 / 大厂螺丝钉 / 创业老炮 / 金融体面人 / 教培劫余 / 网红打工人
  - **Region (6)**:北漂 / 沪漂精致 / 深漂搞钱党 / 杭州互联网青年 / 成都摆烂派 / 海外润人
- `RegionId` + `IndustryId` 类型,Archetype 接口加 `region?` `industry?`(back-compat)
- 2 道新 quiz 题(q-tribe-industry, q-tribe-region)信号 tribe
- `TribeSignal` + `extractTribeFromAnswers()` + `scoreArchetypes()` 改签名接受 tribe
- `TRIBE_BONUS = 0.08` — tie-break 而非硬过滤
- 24 套 ARCHETYPE_PAIRS / TALKSHOW_PERSONA / WEAK_SPOTS 全部填齐

### Verified
- Quiz with SZ+FAANG signal → faang-cog 排第 1,sz-money-chaser 第 2(都顶 generic grinder)
- u-quiz-test 旧 profile 保持 sass-master 顶,back-compat 完整

---

## v1.5.1 — 2026-05-17 · Archetype 演化(单 surface)

### Added
- `archetypeEvolution.ts` 服务:drift 累积、效力计算、re-score、transition 检测
- `UserProfile.traitDrift?` + `evolutionEvents?` 字段(back-compat)
- `firedCompletionDelta({outcome, finalRatio, tookRounds})` — 6 条启发式
- `recordEvolutionEvent()` + `getEvolutionPayload()` + `GET /api/quiz/evolution/me`
- FiredResult 演化 chip + "🌀 你已演化为新人格" 横幅
- Profile 加 EvolutionPanel(漂移条 + 最近 5 事件)

### Design
- Drift 与原 traits 分开存(保留"你最初是 X"叙事弧)
- DRIFT_CLAMP = ±1.5 防止单 archetype 单方向永久 warp
- MAX_EVENTS = 20 capped feed

---

## v1.5.0 — 2026-05-17 · 今日剧情结果分享卡

### Added
- `dailyShareCard.ts` — 1080×1350 IG 竖图 PNG,纯 Canvas 2D 零依赖
- `DailyShareCardModal` 组件 — 预览 + 复制 + 下载,自动管 blob URL 生命周期
- Landing daily card 加 📤 按钮 → teaser 模式分享卡
- FiredResult 检测到 scenario === 今日 daily → 显示"✦ 分享今日战绩"按钮 → 战绩模式

### Design
- 4:5 比 v1.0 的 shareCard.ts(3:4)更 IG-feed 友好
- 两个入口(Landing teaser + FiredResult 战绩)共用一个 canvas-drawing 函数

---

## v1.4.3 — 2026-05-13 · "我的攒局" 历史 + 同组排行

### Added
- `squadHistoryStore.ts` — JSON 文件,per-user 50 entry cap
- `GET /api/squad/history/me`
- `/squad-history` 页面 — 全部历史 + 同组(sorted-member-ids hash)聚合统计

---

## v1.4.2 — 2026-05-12 · 攒局 per-beat 音色

### Added
- Squad.tsx 加 sequential per-beat TTS 播放
- 每条 beat 用 speaker 的 archetype 专属音色(narrator 用 qingnian)
- 播放中 BeatBubble 加黄色 ring + 脉冲 🔊

---

## v0.7.1 — 2026-05-03

### Fixed
- **班味单口 TTS 不播放** — Safari 在 async fetch 解析后拒绝 `play()`。
  `Talkshow.tsx` 改成"先 fetch 后等待用户点 `🔊 点击播放`"两段式,
  新点击是 fresh gesture,Safari 必放行。autoplay 通过的路径不变。
- **AI 发言截断** — `BaseAgent.sanitizeSpeech` 的"如需/想要/可改为" cut
  pattern 之前匹配任意位置,误吃了正常句尾(eg "资本家派来" 后面的内容)。
  改成必须前置句末标点 `。!?！？\n` + 后置 meta 尾(版本/说法/改/换)
  才切。
- **动画特效缺音效** — `EmergencyMeetingTransition` 接入新 `sfx.playAlert`
  (klaxon klakson + bass rumble)。`VoteEjectAnimation` 不再二次触发
  `sfx.playVote`(EliminationReveal 已经放过,避免回声)。

### Added
- **`sfx.unlock()`** — `audioUnlock.primeAudio()` 现在同时唤醒
  `AudioContext`,一次"进入"点击同时解锁 HTMLAudioElement(TTS)+
  AudioContext(SFX)。后续所有 `sfx.play*` 都不会再因为 context
  suspended 而无声。
- **`sfx.playAlert()`** — 紧急全员会专用警报音(0.6s klaxon + bass
  rumble + 静电 hiss)。
- **`docs/RELEASE_PROCESS.md`** — 完整的截图三连 + 版本 tag + GitHub
  release 工作流文档。
- **`docs/CHANGELOG.md`** — 本文件,从 v0.7.1 开始按 semver 维护。

### Screenshots
- `assets/screenshots/01-landing.png` (首页 4 模式)

---

## v0.7.0 — 2026-04-29

### Added
- **🎤 班味单口** Workplace Standup 新模式
  - `shared/data/talkshow.ts` — 30 段精筛职场段子,9 个 tag,6 种音色
  - `server/routes/talkshow.ts` — `/list` `/script/:id` `/tts` 三个端点
  - `client/routes/Talkshow.tsx` — 段子瀑布流 + 播放器视图
  - Landing 加第 4 张大卡 `🎤 班味单口`
- **v0.5.1 动画特效包**(8 选 3 首批)
  - `KillFlashOverlay.tsx` — 全屏径向红光 + 横向 shake (450ms)
  - `VoteEjectAnimation.tsx` — 8 个 ✕ 螺旋收缩 + 底部 banner (2.4s)
  - `EmergencyMeetingTransition.tsx` — 红色 sweep + 大字弹出 (1.4s)
  - 同时接入 Classic + Immersive 两个模式

---

## v0.5.0 — 2026-04-27

### Added
- **实时位置移动**
  - tick 间隔 1500ms → **250ms**(4 Hz),tick 数 6 → 36
  - `PlayerPosition` 新增 `vx / vy` 速度场
  - `ROOM_RECTS` 共用世界地图(1000×700 逻辑平面,10 房间固定坐标)
  - 服务端真实物理积分 `pos += vel * dt`,抵达半径 `ARRIVE_RADIUS=24`
- **客户端 dead-reckoning**
  - `ReckonState` per-player struct(predX/Y, velX/Y, serverX/Y)
  - 每 RAF frame 预测推进 + 与服务端权威差偏差 > 0.5 时按 250ms 时间
    常数 smooth-correct
  - 重大偏差 (> 320px) 直接 hard-reset 防止 round 切换慢飘
- **足迹粒子** — 玩家每走 32 逻辑 px 丢一个,700ms 渐隐,team 色染色

---

## v0.4.0 — 2026-04-26

### Added
- 横版 16:9 视频导出(B 站 PC / Twitter)
- 服务端 `/api/share/transcode` ffmpeg 转 mp4 端点 + 50 MB 上限
- `/api/share/capabilities` 探测 ffmpeg 是否可用

---

## v0.3.x — 2026-04-25

### v0.3.2
- Web Share API 一键调起 iOS / Android 系统分享
- 渲染完后 cache result,允许"再分享一次" 不重渲

### v0.3.1
- LLM 给每个 highlight 自动生成"一句话爆款标题"叠在视频上
- 服务端 `/api/share/captions` 端点 + Minimax-M2 fallback

### v0.3.0
- Phase A MVP:viral 短视频引擎
- 客户端 canvas + MediaRecorder 录制 1080×1920 竖版 30s mp4/webm
- `services/highlightPicker.ts` 自动评分 3 个高光时刻
- `components/game/ShareVideoButton.tsx` 一键下载

---

## v0.2.0 — 2026-04-25

公开 baseline。安全清理后第一个干净 commit。

### Includes
- 三种模式:鼠人公司 / 全程开麦 / 裁了么
- 23 个 anime 角色立绘 + 35 个 UI 图标(全 Minimax 生成)
- 5 关闯关 + 真法条知识卡片
- 三层 LLM fallback / 四层 TTS fallback / 五层 image fallback
