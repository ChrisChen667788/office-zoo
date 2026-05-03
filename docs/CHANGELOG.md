# OFFICE ZOO Changelog

每个版本一段。最新在最上,语义化版本号。

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
