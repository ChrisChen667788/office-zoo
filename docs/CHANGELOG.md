# OFFICE ZOO Changelog

每个版本一段。最新在最上,语义化版本号。

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
