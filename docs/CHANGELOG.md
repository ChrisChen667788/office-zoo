# OFFICE ZOO Changelog

每个版本一段。最新在最上,语义化版本号。

> v3.1 – v5.4 的条目此处暂缺(代码侧 tag 已落地, 详见各文件版本注释)。
> v5.5 起恢复完整记录。

---

## v6.57 — 2026-06-06 · 「裁了么」闯关牌局 方案 A · 数值核心

把 `docs/FIRED_GAMEPLAY_PROPOSAL.md` 的方案 A(裁员谈判 = 回合制话术牌局)落地第
一步 —— 纯数值核心 + vitest 锁死,先把玩法骨架立住,LLM 台词 + UI 后续接。+21 → 304。

- **新模块 `shared/negotiation/`**(纯函数,无 LLM/引擎依赖,client+server 可共用):
  - `battle.ts`:8 张话术卡(工龄/劳动法/竞业/情绪/爆料/装可怜/offer/录音,各带
    `筹码消耗 + 力度 + 耐心消耗 + 卡类`)× 4 个 HR 姿态(画饼/拖延/甩锅KPI/威胁背调)
    的**克制矩阵**(被克 ×0.5,命中弱点 ×1.5;五种卡类各被恰好一个姿态克制 + 怕)。
    双血条:玩家**底气/筹码** vs HR **预算/耐心**。**赔偿阶梯** `compTierFromBudget`
    (预算 >66=未谈成 / ≤66=N+1 / ≤33=2N / ≤0=3N)。四个不可变 reducer(`playCard` /
    `hrTakeStance` / `endRound` / `settle`)+ 统一终局判定(预算 0→松口 3N / 耐心 0→
    掀桌仲裁归零 / 底气 0→认怂接受当前档)。
  - `sim.ts`:启发式双 AI(`chooseHRStance` 越被逼越下脏招、`chooseEmployeePlan`
    避开被克的卡类、专打 HR 弱点、够本就见好就收防掀桌)+ `simulateBattle` 整局驱动
    (`MAX_ROUNDS` 封顶,可注入 rng → 完全确定可测)。
- **测试**:`negotiationBattle.test.ts` 21 例 —— 克制系数 / 赔偿阶梯阈值 / 四 reducer
  数值与终局 / 整局可终止 + 同种子确定性 + 数值不变量(预算永远 0..100)。
- 现有「纯 chat 自由谈判」不动,后续作为「简单模式」与牌局「闯关模式」并存。

## v6.56 — 2026-06-06 · 内审专员 / 销售冠军 上场(接技能 + preset 轮换)

收掉 roadmap 上"定义了但不上场"的最后两个打工人角色。+4 测试 → 283。

- **内审专员(MEDIUM_CAT)技能**:夜间审一名**已离职(死亡)**员工的档案 → 得知其
  真实阵营。区别于 HR总监(查在世):内审查死人,可回溯确认"那个被裁的到底是不是
  资本家"。首轮无人离职 → 跳过。私密情报进 agent.roleIntel,观众只见一行模糊日志。
- **销售冠军(ADVENTURER_CAT)技能**:人脉广,夜间追踪一名**在世**玩家的行踪 → 得知
  TA 今晚在哪个房间、身边还有谁(同房共处)。谁跟谁扎堆的软线索(如资本家蹲在受害者
  附近)。每轮换一个新目标。
- **preset 轮换**:新增 11 / 12 人 preset —— 内审专员在 11+ 上场,销售冠军在 12 上场;
  客户端开局人数选择器同步扩到 6/8/9/10/11/12。
- **测试**:gameLoop.test 补 4 例(11/12 preset 人数与角色构成 + 内审审死者得阵营 +
  销售追在世逐轮累积)。GameEngine 能力覆盖表同步更新。

用户实测反馈的 4 件事 + 二次代码/图标收尾。+14 测试 → 279。

### #1 — 经典局推进后"报错卡死"修复
- 根因:startGame 主循环无容错。任一阶段(setPhase/runFreeRoam/runDiscussion/
  runVoting/resolveVotes,都碰 LLM/TTS/网络)抛错 → 循环 reject 退出但 `running`
  仍 true、不发 game_over,socketHandler 的 .catch 只 log 不清理 → 全体客户端永久
  卡死。修:循环 + GAME_OVER 包 try/catch/finally(抛错→优雅 game_over+`running=false`
  恒清);.catch 兜底 destroyGame;新增 `crashLog.ts` 把崩溃栈落盘
  `data/engine-crashes.log`(pino 只进 stdout、detached 跑时无留痕 —— 正是当初查不到
  日志的原因),复现可 grep 定位。

### #2 — 沉浸/经典局 AI 头像重复(0 生成)
- 根因:头像按 ROLE 缓存/解析,roster 里普通员工 ×2 → 同脸。修:`assignAvatarKeys`
  纯函数给每人从 23 张池里分唯一 key(优先本角色,重复的取未用 key),
  SerializedPlayer 带 `avatarKey`,GameMap+沉浸圆桌按 avatarKey 解析。不烧 image API。

### #3 — 「裁了么」玩法调研 + 升级方案
- 调研当下爆火机制(roguelike 牌组/meta 进度/遗物/extraction),产出
  `docs/FIRED_GAMEPLAY_PROPOSAL.md`:把纯 chat 谈判升级为回合制话术牌局(方案 A MVP)
  + 局间成长(B)+ 职场遗物(C)。

### #4 — 班味单口「专属吐槽」(个性化生成 + TTS)
- `roastGenerator.ts`(纯 prompt+解析,+7 测试)+ `POST /api/talkshow/roast`
  (限流+安全复用)+ `RoastBooth.tsx`(输入今天的不爽 → AI 嘴替几句阴阳/自嘲金句 →
  逐句 ▶️ TTS 念出来)。挂在 /talkshow 顶部,纯情绪价值。

### #5 — 收尾:头像去重端到端回归 + 图标二次元化 + 图像模型链实测
- **头像重复复发**:用户第二次反馈"还是随机到重复头像"。排查发现 #2 的代码是对的,
  真因是 5 个残留 `tsx --watch` 旧进程绑着旧代码 —— 全部 kill 重启后正常。为防回归,
  补 `gameLoop.test.ts` 端到端 3 测试(createPlayers 全唯一 / 两个普通员工不同脸 /
  getSerializedState 带 avatarKey),+3 → 279。
- **图标"太 low"**:`iconGen.ts` art-direction 升级为二次元 cel-shaded(跟头像同风格)。
- **图像模型链实测重排**:实测代理 `/models` + `/images/generations` —— `flux-schnell`
  已下线(503)、`qwen-image-max` 不在列表、`gemini-2.5-flash-image` 是聊天多模态非 t2i
  (500),`doubao-seedream-4-5-251128` 真出图(~21s)。链改为 seedream-4-5 领衔,
  后续 regen 不再空耗已下线模型的 timeout。
- **图标背景统一抠透明**:seedream 出图背景不统一(彩色渐变 / 暗底 / 纯白底混杂),
  新增 `scripts/cutout_icon_bg.py`(`npm run icons:cutout`)把 61 张统一抠成透明背景:
  按四角颜色自动判别屏障(白色模切边 / 主体),边缘灌水定位背景;无白边、主体直贴
  背景的图用色彩相似度魔棒兜底(容差从小到大扫,取最不糊主体的);连通块面积过滤
  清碎星(环形主体不再被误删);安全闸防止误抠成全透明。另把 `furniture_cctv` 的
  subject 从"一墙监控画面(易被画成满屏带人物)"改成"单体球形监控摄像头",重生后可抠。
  **61/61 全部干净统一为透明背景。**

---

## v6.54 — 2026-06-05 · 🎬 对局回放(服务端持久化 + 时间线回放页)

roadmap 收官:🎬 回放落地(它本身也是 Premium 的"历史回放"权益)。voice/lawyer
经评估**不做**:voice 需 voice-clone 基建、lawyer 是"真人咨询"线下服务非纯代码,
都偏商业化,与"回到核心玩法"取向不符 —— 如实标注不充数。+5 测试 → 265。

### P1 — 服务端持久化 + 读取 API
- 引擎是内存态、game_over 后 ~60s 销毁,/result/:gameId 一直是死占位。新增:
  `shared/replay.ts`(ReplayRecord 类型 + 纯函数 digestReplay / groupTimelineByRound,
  server+client 共用,+5 vitest);`replayStore.ts`(文件存储 capped ring 最近 50 局);
  `routes/replay.ts`(GET /api/replay 列表 digest + GET /api/replay/:gameId 全量);
  socketHandler game_over 钩子存盘(终局 roster + getTimeline),fire-and-forget。

### P2 — 客户端回放页 + 赛后入口
- Result.tsx 改为拉 /api/replay/:gameId,渲染终局信息 + 按轮分组的事件时间线
  (类型图标 🔪🗳️🛡️⚖️🔍🏆)+ "复制回放链接"深链分享;live store 作即时兜底。
  HighlightReel 赛后加"🎬 看完整回放"入口。

### P3 — Premium 回放权益上线 + 诚实收尾
- Premium 🎬 perk 'soon'→'live'。README zh+en roadmap 更新(voice/lawyer 标注暂缓
  原因),vitest 计数 260 → 265。

---

## v6.53 — 2026-06-05 · 补齐会上场的特殊角色技能(法务挡刀 + 数据分析查产出)

延续 v6.52,把**真会上场**的特殊角色技能补完。先做 spawn 审计:其余角色里只有
BODYGUARD(preset 9/10)、VIGILANTE(preset 10)真出现且有侦推价值,故只接这两个;
MEDIUM/ADVENTURER 不在任何 preset(接了是死代码),ENGINEER 是定位向无侦推力。+9 测试 → 260。

### P1 — 法务顾问(BODYGUARD)替身挡刀
- 纯函数 `resolveKillTarget(victim, {protectedId, bodyguardTargetId, bodyguardId,
  bodyguardAlive})` → blocked / intercepted / kill,优先级 工会代表清空 > 法务替死 >
  正常裁。+7 测试(含 法务已死 / 不能替自己 等边界)。
- `GameState.bodyguardTargetId` + resolveNightActions 选护对象 + 私密 intel;kill loop
  重构到 resolveKillTarget,被护目标遇袭 → 法务替死("替 X 挡了一刀")。

### P2 — 数据分析师(VIGILANTE)查 OKR 产出泄底
- 每轮调一人名下 OKR 待办数(tasks.length)作私密 intel。猫有真任务、资本家/摸鱼神
  没有 → 0 待办=可疑"非打工人"软线索;但(区别于侦探硬查身份)分不出资本家 vs 摸鱼神。

### P3 — 角色覆盖诚实标注 + 收尾
- resolveNightActions 头部加技能覆盖表(✅4 接入 / ▪️engineer 定位向 / ▫️medium+adventurer
  不在轮换非 bug)。README zh+en roadmap 更新,vitest 计数 251 → 260。

---

## v6.52 — 2026-06-05 · 核心角色技能落地 + 对局循环测试 + roadmap 收尾

回到核心玩法打磨。特殊角色一直只有"装饰文字"没机制 —— 这轮把社交推理深度补上。+20 测试 → 251。

### P1 — 侦探查身份 + 工会代表保护(夜间技能 + AI 会用)
- ROLE_REGISTRY 给 HR总监/工会代表等写了技能描述("每轮可查身份/保护一人"),
  但 engine 从没实现。落地两个经典角色:
  - `roleAbilities.ts`(纯,+8 测试)选目标(侦探优先没查过的、医生优先护别人)。
  - `resolveNightActions()` 在 post-roam kill 前跑:工会代表(MEDIC_CAT)护一人 →
    `state.protectedPlayerId`,本轮 DOG 暗杀该目标被挡;HR总监(DETECTIVE_CAT)每轮
    查一人 team,逐轮换新目标。
  - AI 会用:查到的身份/保护成私密情报经 `BaseAgent.addRoleIntel` 只注入该 agent
    的发言+投票 prompt(别人看不到),观众端只看到"HR总监查了个人"的模糊 log。
  - 每个 preset(6/8/9/10)都含 detective+medic,所以每局都触发。

### P2 — 核心循环 vitest(投票结算 + 胜负 + 平票)
- 之前 41 个 GameEngine 测试全是构造+leak 检测,胜负/投票机器零覆盖。补 +12:
  resolveVotes(唯一最高票淘汰 / 平票不淘汰 / 鬼票等权破平 / 全 skip)、checkWin
  (猫胜=狗清零 / 狗胜=狗≥猫 / 任务胜 / 未分胜负)、夜间技能解析。

### P3 — README roadmap 收尾
- 「下一步」4 项(Stripe/Sonnet/pack 记忆/Wrapped 邮件)v6.51 已全做,zh+en 勾掉并
  补 v6.52;「下一步」换成真实剩余项。vitest 计数 171 → 251。

---

## v6.51 — 2026-06-05 · pack 跨局记忆 + Squad model A/B + 真 Stripe + Wrapped 邮件订阅

四个路线图大项一轮落地(脚手架级,外部服务 env 驱动)。+28 测试 → 231。

### P1 — 公司主题包 pack 内剧情记忆 (NPC 跨局记仇)
- `packMemoryFormat.ts`(纯)+ `packMemoryStore.ts`(file-backed, cap 5 局,
  keyed by packId)。一局结束把 survivors/eliminated/winner 折进 pack 记忆;
  下一局同 pack 时给每个 NPC 注入"最近一局你被裁了,赢家是资本家阵营"的
  prompt 片段,NPC 跨局记仇/记恩。BaseAgent 加 packMemory 形参。+8 测试。

### P2 — Squad 导演 model A/B harness (+实跑 opus vs sonnet)
- directSquadStory 加 `opts.model` 覆盖;`scripts/squadAb.ts` 同一 roster 跑
  control vs variant,并排打印 + ⚠ 标模板兜底。实跑结论:opus-4-7 与
  sonnet-4-5-20250929 都产出真·5 幕剧,sonnet 旁白更细,质量可换。修正
  .env.example 里不存在的 'claude-sonnet-4-7'(查 GET /v1/models 得真 id)。

### P3 — 真 Stripe Checkout 替换 v1.0 demo (test-mode + 优雅降级)
- `stripeSignature.ts`(纯 webhook 验签,+9 测试)+ `routes/billing.ts`
  (fetch 建 Checkout Session / 验签 webhook / status)+ `billingStore.ts`。
  client `utils/billing.ts` + Premium 接真 checkout,无 STRIPE_SECRET_KEY 时
  回落 demo,不破坏现有默认。永不接触卡号(在 Stripe 托管页输入)。

### P4 — 班味 Wrapped 邮件订阅 (subscribe + 可插拔 sender)
- `emailValidate.ts`(纯,+6)+ `wrappedEmail.ts`(纯 HTML digest 构建,转义防
  注入,+5)+ `subscriberStore.ts` + `emailSender.ts`(console 默认 / Resend
  env-gated)+ `routes/wrapped.ts`。BanweiWrapped 加邮箱订阅输入。无 provider
  key 时只入库不发信。

---

## v6.50 — 2026-06-05 · CHANGELOG 还债 + evidenceParser fuzzy + 班味分享

### P1 — CHANGELOG 补登 v6.42–v6.49 + 修顶部排序
- docs/CHANGELOG.md 停在 v6.40 且顶部 v6.40/41/39 乱序, pre-push hook 的
  `head -1` 误取 v6.40 → 8 个版本欠账且 nag 关不掉. 补 v6.42–v6.49 (按真实
  commit log 写, 非杜撰) + 顶部重排严格降序. hook latest-doc 现正确识别为
  最新版, 检测管线返回空.

### P2 — evidenceParser fuzzy 绰号/转述桥接 (Pass 3)
- `EvidenceRef.kind` 早声明了 'fuzzy' (例子就是"某位说颗粒度的同学") 却从没
  产出. 新增纯函数 `extractEpithetKeywords` 从转述子句挖描述词 (颗粒度/对齐),
  桥接到真说过该词的前序发言者, 产出 kind:'fuzzy'. 切首个「的」防尾词泄漏,
  函数词长词先剥, stopword 去噪保精度. +15 测试 (9 miner + 6 端到端).

### P3 — 班味指数 转发+朋友圈 分享带自定义海报
- banwei page: `wx.showShareMenu` 开 shareAppMessage+shareTimeline;
  `_renderPoster()` 抽出 canvas→tempfile + 预渲染缓存; `onShareAppMessage` +
  新 `onShareTimeline` 均带 imageUrl (复用 1080×1350 海报, 未就绪回落系统
  页面截图).

---

## v6.49 — 2026-06-05 · hook 文档 + SHOTS manifest 测试 + 脚本头统一

### P1 — README 贡献 section 加 pre-push hook 安装/静默说明
- CHANGELOG-nudge 钩子原本只在本文件 v6.29 条目里有载, 新 clone 无从发现.
  README.md / README.en.md 各加 git hooks 小节: `npm run hooks:install` 装,
  `OFFICE_ZOO_SKIP_CHANGELOG_NUDGE=1 git push` 静默.

### P2 — capture_screenshots SHOTS manifest 抽纯函数 + 测试
- 截图清单原内联, 手滑写重文件名会静默覆盖截图. 抽到
  `scripts/lib/shotsManifest.mjs` (SHOTS + validateShots 纯校验), 脚本启动
  fail-fast. +9 vitest 覆盖 file↔url 映射. 179 → 188 测试.

### P3 — 3 个根 .mjs 文件头统一
- capture_screenshots / capture_game_screens / gen-mp-architecture 三种头方言
  统一成 Run/Prereq/Output 三行, 各标 npm 别名 (gen:screenshots / gen:mp-arch).

---

## v6.48 — 2026-06-05 · npm 别名 + scripts/lib 约定

### P1+P2 — gen:mp-arch + gen:screenshots npm 别名
- `gen:mp-arch` → gen-mp-architecture.mjs; `gen:screenshots` → 两个 capture
  脚本串跑. 不用再记完整 node 路径.

### P3 — scripts/lib 约定文档
- scripts/lib/README.md 说明纯函数约定 (无 playwright/fs, 每个配 vitest).
  单模块暂不加 barrel index (3+ 才加).

---

## v6.47 — 2026-06-05 · assertMode vitest + architecture 重生脚本

### P1 — assertMode 逻辑固化成 vitest
- capture 的 mock case 从一次性脚本固化成真 vitest (`scripts/lib/modeMatch.mjs`
  + modeMatch.test.ts, 8 测试覆盖 classic/immersive 双向误标).

### P2 — mp README 路线图更新到 v6.44

### P3 — gen-mp-architecture.mjs 自动重生 about 页架构图
- 从 architecture.svg 渲染 PNG (替手动 Playwright snippet). 960×620 @2×.

---

## v6.46 — 2026-06-05 · assertMode 抽取 + 验证图清理 + mp README

### P1 — 真机 devtools 导入验证 about 页
- 受限于 project.config.json appid 占位 + 本地窗口焦点, 自动化导入做不到;
  如实记录限制 (未伪造通过), 用 WXSS-fidelity HTML 渲染兜底.

### P2 — capture 抽公共 assertMode() helper
- classic + immersive 共用一个 assertMode(page, mode), 观察页面后委托 matchesMode.

### P3 — un-track 一次性验证 preview render
- mp-about-preview 这类一次性验证图 gitignore (assets/screenshots/*-preview.png).

---

## v6.45 — 2026-06-05 · 对称防御 + SVG 留白 + emoji 验证

### P1 — capture 脚本 immersive 加 badge 断言 (对称防御)
- 上一轮只给 classic 加了断言; immersive 也加, 防 classic/immersive 误标.

### P2 — dataflow SVG 底部节点加留白
- viewBox 600→628 + bg rect, 修底部节点贴边. architecture 94px 余量无需改.

### P3 — about 页 emoji 头像渲染验证
- 原生 <text> 渲纯 Unicode emoji, WXSS-fidelity HTML 验证布局正常 (附说明).

---

## v6.44 — 2026-06-05 · 截图修正 + SVG 留白 + 小程序 emoji 头像

### P1 — 经典截图修正 (之前误把 immersive 当 classic)
- 两张截图都带 🎬 沉浸 badge (都是 immersive, classic 从没截到). 根因: classic
  进入键 socket 未连时 disabled + RulesModal 遮罩拦点. 修: socket-wait +
  modal-dismiss + badge 断言. 用户直觉正确, 此前为本人疏漏.

### P2 — sequence SVG 底部文字加留白
- viewBox 560→588 + bg rect, 修底部文字贴边.

### P3 — 公司主题包 emoji 头像展示 + 入口
- about 页加 17 emoji 头像条 + CTA 到 company-pack 编辑页 (web-view).

---

## v6.43 — 2026-06-03 · 真机游戏截图 + README.en 还原 + 小程序架构页

### P1 — Playwright 真机补齐游戏内截图
- 补 classic 2.5D + immersive 截图; README 截图表换成真机 2×3 网格.
  (此轮 classic/immersive 标注有误, v6.44 P1 修正.)

### P2 — README.en.md 同步还原丰富版
- banner / hero GIF / 截图网格 / 营销表 / 动画 SVG, 跟中文版对齐.

### P3 — 小程序技术架构页
- pages/about 原生页引用 architecture.png (widthFix).

### fix — kill flaky packOverride fallback test
- GameEngine.test 用 包-甲/乙/丙 collision-proof 前缀 (原 老王/小张/阿强 与
  AI_NAMES 撞名). gitignore harvester 副产物截图.

---

## v6.42 — 2026-06-03 · 动画 SVG 架构图接入 README + ModelScope

### P1 — 3 张动画 SVG 逐张渲染验证
- architecture / sequence-psywar / dataflow-companypack 用 Playwright 逐张渲染验证.

### P2 — SVG 接入 README + ModelScope
- 替换原静态 mermaid; SMIL 动画 (流动虚线 + animateMotion 数据包) 在 GitHub
  `<img>` 里可播.

---

## v6.41 — 2026-05-30 · HighlightReel avatar + pack 删除 + CHANGELOG 补

### P2 — pack avatar 上 HighlightReel 复盘
- `EliminationLogEntry.avatar`; Classic + Immersive 四处 pushElimination 传
  avatar (并补 Immersive setLastElim 的 v6.40 P2 遗漏). HighlightReel 时间线
  行渲染 emoji 圆徽.

### P4 — 公司主题包 删除功能
- `DELETE /api/company-pack/:packId` owner-only (验 ownerUserId, 区别于 GET
  的 share-token 开放读). CompanyPackEdit "🗑️ 删除" 两段确认按钮. 解决满 5
  上限无法清理. +5 route tests (owner / 403 / 400 / 404 / 删除腾位).

### P3 — CHANGELOG 补 v6.30-v6.40 (本段)
- pre-push hook 长期 nag 关闭.

---

## v6.40 — 2026-05-30 · 收尾 + 公司包/排行榜补强

### P1 — squash red commit 6b20315
- v6.39 P6 那对 commit (red import 错 + hotfix) `git reset --soft` squash
  成单个 green commit, `--force-with-lease` 推送. 远程历史不再含损坏 commit.

### P2 — pack avatar 同步 EliminationReveal
- `EliminationEvent.avatar`; 裁员剧场名字上方加 emoji 圆徽 (队伍色环 + 辉光),
  存活/淘汰两态. Classic 两处 setLastElim 传 `victim?.avatar`.

### P3 — 班味年终 wrapped PNG 导出
- `banweiWrappedCard.ts` 画 1080×1350 (年度人格 hero + 2×2 stat 格 + 成就条),
  BanweiWrapped 加下载按钮. `rgbTriplet()` 处理最低 tier 的 rgba accent.

### P4 — pack leaderboard packId×tribe 交叉测试
- leaderboard.test.ts +5: packId+region (AND) / packId+industry / 空 pack /
  pack 内 score 排序 / 全网 pack+非pack 混算. 12 → 17 leaderboard.

---

## v6.39 — 2026-05-30 · 致谢 + pack avatar + 直接开局 tag + wrapped

### P1+P2 — README/ModelScope AI 开源生态致谢 + Star History
- 致谢从 MiniMax+Qingyun 扩成完整分层 (大模型推理 / 多智能体架构 / 后端实时 /
  前端交互 / 小程序工具链 / 灵感来源) + Star History SVG 嵌入. 新建
  PROMO_MODELSCOPE.md. 清掉 README 尾部 ~240 行重复 garbage.

### P3 — 公司主题包 per-NPC emoji avatar (端到端)
- schema (16 字符 cap) → engine packAvatars 对齐 shuffle → PlayerState/
  SerializedPlayer → GameMap canvas 画 emoji (存活/淘汰两态) → 编辑器 emoji
  `<select>` (18 预设) → 分享页展示. +2 路由测试.

### P4 — 直接开局也带 region/industry 自动 tag
- Landing 开局时缓存 archetype tribe 到 localStorage (lastRegion/lastIndustry),
  `?pack=` 直接开局 session 也能正确 tag 排行榜. BanweiIndexCard 先读缓存,
  profile fetch 覆盖.

### P5 — pack leaderboard 加入榜分享卡 (PNG)
- `packLeaderboardCard.ts` 画 1080×1350 (公司名 + Top10 + 我的行高亮),
  pack-scope 时显示下载按钮.

### P6 — 班味年终 wrapped 回顾
- `BanweiWrapped` 折叠卡, 聚合峰值周/平均/趋势/命中率/成就进度 + 年度班味人格
  标签, Spotify-Wrapped 风. (注: 首版 import 错 getUnlockedCount, v6.40 P1
  squash 修正.)

---

## v6.38 — 2026-05-30 · 公司包深化 + 测试补强

### P1 — packOverride engine 专项单测
- GameEngine.test.ts +6: 名字覆盖 / 太小回落 / 唯一性 / 平衡不变 / personality
  hint 生效 / 无效 hint 忽略. 26 → 32 GameEngine.

### P2 — pack role hint 软偏好 + personality desync 修复
- DESYNC FIX: createPlayers 改为整 NPC 元组一起 shuffle (修 name↔personality
  错位 bug, v6.37 P4 留下的). ROLE_HINT_TEAM_LEAN: 管理层→dog / 打工人岗→cat,
  `assignRolesWithTeamLean()` 两段贪心重分配, 不破坏阵营平衡. +3 tests.

### P3 — pack 分享链接 + 一键导入
- CompanyPackView 只读页 (packId 是 share token, GET 开放). 🔗 分享 copy
  link / 🎮 直接开局 (`?pack=`) / 📥 存成副本. 修正 personality 下拉 (v6.37
  用了臆造 id, 校正成真 8 枚举值).

### P4 — pack-scoped 排行榜
- banwei snapshot 记 lastPackId (clampPackId 12-hex), leaderboard `?packId=`
  过滤, LeaderboardPanel "🏢 只看本公司同事 Top" 切换. +3 tests.

---

## v6.37 — 2026-05-29 · 排行榜深化 + 公司主题包新支线

### P1 — leaderboard region/industry filter
- Snapshot 加 tribe tags (clampTribe 校验 KNOWN_REGIONS/INDUSTRIES),
  `?region=&industry=` AND 过滤. BanweiIndexCard 从 archetype 自动带 tribe,
  LeaderboardPanel 12 chips 筛选. +7 leaderboard tests.

### P2 — 班味周存档 sparkline + 年最佳周
- `BanweiHistoryPanel` 读 12 周 history, 纯 SVG sparkline (无 recharts), 金色
  光晕标最高周, `<title>` tooltip.

### P3 — 公司主题包 schema + server 持久化
- `routes/companyPack.ts` POST/GET/mine, atomic rename, 6-12 NPC, 每用户 5 包
  上限, owner 校验, 名字唯一. `getCompanyPackById` 引擎 accessor (深拷贝).
  +14 tests.

### P4 — 公司主题包 edit 表单 + Landing 入口 + engine 集成
- `/company-pack/edit` 6-12 行表单, Landing chip picker, `game:create` 带
  companyPackId, `createPlayers` packOverride 覆盖名单 (fail-open).

---

## v6.36 — 2026-05-29 · 数学验证 + Canvas 可测 + 🔥 badge + 排行榜

### P1 — weightedSample 数学 sanity test
- 导出 engine 加权采样 helper, +6 统计护栏 (uniform / biased 3.5x / 无重复 /
  clamp / 零权重). 26 → 32 GameEngine.

### P2 — 小程序 paintBanwei 抽纯函数 + 9 tests
- utils/banweiPaint.js (CommonJS) + MockCtx recording 测试, createRequire
  shim 桥接 ESM/CJS. +9 miniprogram.

### P3 — GameMap 🔥 热门 badge
- roster_created 加 hotNames → `game:hot_names` → useHotNames → 头像左上 amber
  脉冲徽, 跟 v6.22 👻 dot 镜像. 闭合 hot-quote 提名回路.

### P4 — 7-day spectator leaderboard
- `GET /api/leaderboard/banwei` 跨用户 Top-10, userId 8-char 截断 (隐私),
  `LeaderboardPanel` 挂 Profile, 🥇🥈🥉 + 我的行高亮. +6 tests.

---

## v6.35 — 2026-05-28 · 小程序海报 + 表单 + 飞书化 + 鼠人 bias

### P1 — 小程序 Banwei Canvas 海报
- banwei page Canvas 2D 画班味海报 (score badge + 5 轴雷达 + WoW row).

### P2 — 小程序 HotQuoteSubmit 原生表单页
- hot-quotes page 原生 textarea + 提交, 接 `/api/hot-quotes`.

### P3 — PROMO_MODELSCOPE.md 飞书化
- docs/PROMO_MODELSCOPE.md 表格化重写 ("这是什么" + 5 痛点 vs 5 解法).

### P4 — README mermaid render probe
- 验证 flowchart + sequenceDiagram GitHub 原生渲染.

### P5 — 鼠人 weekly bias (hot quotes 提名)
- getRecentNominationCounts 子串提名计数 → weightedSample 权重 (1 + 0.5×min
  (mentions,5), cap 3.5x). 跨观众金句 → 游戏世界回路.

---

## v6.34 — 2026-05-28 · 去攻击性 + 飞书化 + 架构图 + 小程序脚手架

### P1 — 文案去"骂老板" → 职场牛马自嘲
- 红框 "AI 替你狠狠骂老板" → 自嘲向 "AI 鼠人替你拥抱变化".

### P2 — 架构图 mermaid 专业化
- README flowchart (Client/Server/LLM/Storage 分层) + sequenceDiagram
  (PSYWAR 心理战闭环).

### P3 — 产品介绍飞书化重写
- "这是什么" 表格 + "凭什么花你 3 分钟" 痛点对照.

### P4 — 微信小程序端脚手架
- packages/miniprogram glass-easel runtime, landing/banwei/hot-quotes/
  profile/anniversary 5 page + web-view 包装.

---

## v6.33 — 2026-05-28 · Stats/Banwei probe + cooldown bug + 持久化 + 海报 + 金句池

### P1 — Stats + Banwei panel probe
- Playwright 截 StatsOverviewPanel + BanweiIndexCard.

### P2 — cooldown ring 文档审视 + 时序 bug 修
- PSYWAR cooldown ring SVG 倒计时时序修正.

### P3 — 班味指数 share card PNG
- `banweiShareCard.ts` 1080×1350 (score badge + 5 轴雷达 + WoW).

### P4 — 班味金句池 spectator-curated (新)
- `routes/hotQuotes.ts` 观众投稿金句池, FIFO 200, 每用户 5/周, 注入下一局
  leakedHints.

### P5 — server stats 持久化
- stats.json atomic flush (60s timer + boot load).

---

## v6.32 — 2026-05-27 · stats dashboard + cooldown/achievements probe + 隔离 + 跨周

### P1 — stats dashboard 客户端渲染
- StatsOverviewPanel: 全局 trio + Top5 鼠人 podium + per-user 命中率 gauge.

### P2+P3 — cooldown ring + achievements panel probe
- Playwright 真触发截图.

### P4 — stats.test.ts X-User-Id 隔离
- per-user 计数隔离测试.

### P5 — weekly 班味指数跨周报告
- banwei history WoW delta + 12 周滚动.

---

## v6.31 — 2026-05-27 · achievements probe/触发 + cooldown ring + leakQuote tune + stats 后端

### P1+P2 — achievements probe + 触发点接入
- 12 成就 grid, classic/talkshow/anniversary/duel/profile 触发 hook.

### P3 — PSYWAR cooldown visual ring
- GhostChatPanel SVG ring 倒计时覆盖.

### P4 — leakQuote 进一步 tune audit
- detectLeakQuote 阈值微调 audit.

### P5 — spectator stats 后端聚合
- `routes/stats.ts` 全局 + per-user 聚合.

---

## v6.30 — 2026-05-26 · CHANGELOG backfill + Anniversary probe + rate-limit feedback + achievements + stopword

### P1 — CHANGELOG v6.25-v6.29 backfill
- 补齐 5 版条目.

### P2 — Anniversary probe
- Playwright 截 6-milestone deck.

### P3 — GhostChatPanel rate-limit feedback
- v6.29 P5 rate limit 的 client 可视: lockedUntilMs cooldown + sessionLocked
  禁用态.

### P4 — spectator achievements 系统
- localStorage 累积成就 ratchet, 12 成就 + 解锁 toast.

### P5 — detectLeakQuote topic-stopword 去噪
- 高频职场词 stopword 表, 降假阳性.

---

## v6.29 — 2026-05-26 · 周年 mode + rate limit + CHANGELOG hook + onboarding probe

### P1 — RulesModal 3-step deck Playwright probe
- 6 帧 (mobile/desktop × step1/2/3): 进度 dot 跟读, gold "下一页" → "开始"
  CTA, step3 surface PSYWAR ritual (👻/💢/✨), max-w-md modal 居中.
- Visual pass, 无 layout 改动需要.

### P3 + P6 — English leak coverage + typecheck audit
- `GameEngine.test.ts` +3 tests: pure English substring / paraphrase
  / unrelated. Coverage gap (prior fixtures 全 CJK or 混合) 关闭.
- `npm run typecheck` confirmed 零 baseline error (v6.25 P4 后保持).
- 58 → 61 tests.

### P2 — CHANGELOG pre-push git hook (informational)
- `scripts/git-hooks/pre-push` — 解析 `^## v\d+\.\d+` heading, 对比
  git log subjects, 黄色 nudge 未记录版本. 非阻塞.
- `scripts/install-hooks.sh` — idempotent copy 到 `.git/hooks/`.
- `npm run hooks:install` — 一键 setup.
- `OFFICE_ZOO_SKIP_CHANGELOG_NUDGE=1` 静默.
- 首次跑就 surface 真 gap: docs/CHANGELOG.md @ v6.24 vs git @ v6.28-29.

### P5 — PSYWAR server rate limit (5/min, 20/session)
- `socketHandler` `game:psy_war_leak` 加 per-socket 滑动窗口: ≤ 5 /
  60s + ≤ 20 / session. Closure-scoped state, 自动随 disconnect cleanup.
- Reject emit `game:psy_war_rate_limited` { reason: 'window_cap' |
  'session_cap', retryAfterMs }.
- Classic event log surface: ⏳ 等 N s / ⛔ 本场配额用完.

### P4 — 周年纪念 anniversary mode (`/anniversary`)
- 新 route, 6-milestone time capsule deck (v6.8 IP 反差萌 / v6.16 选秀
  / v6.21 摸鱼 / v6.22 吐槽群 / v6.25-27 PSYWAR / v6.28 基础设施).
- Per-card accent color seep: aurora bg + border + CTA gradient 同色.
- 进度 dot 可点跳, ← → 键盘 nav. EventPill 顶 "v6 周年回顾 · 28 轮".
- Landing 加 gold "🎉 v6 周年回顾 · 28 轮 →" chip 邻 rose 投票 chip.
- 用作社交分享 landing (bit-058 talkshow 已引用 OFFICE ZOO IP, 闭环).

---

## v6.28 — 2026-05-26 · 9-player picker + CHANGELOG 自动化 + FP audit + mobile probe + onboarding deck

### P4 — Landing PLAYER_COUNTS 加 9
- v6.27 P1 已备 ROLE_PRESETS[9] 但 picker 还是 [6, 8, 10]. 现 [6, 8, 9, 10].

### P3 — git-cliff CHANGELOG 自动化骨架
- `cliff.toml` parser `^v(\d+\.\d+) P\d+:` 按 minor 自动 group.
- `npm run changelog` → `/tmp/cliff-unreleased.md` (审后人工 splice).
- `npm run changelog:full` → `docs/CHANGELOG.auto.md` (regen, NOT 主源).

### P2 — detectLeakQuote 假阳性 audit (baseline 1.60%)
- `leakQuoteAudit.test.ts`: 50 fixture speeches × 10 unrelated hints
  = 500 pair, 期望 fp < 5%. **实测 baseline 1.60% (8/500)**, 其中 2/8
  是 borderline-legit. 30% Jaccard threshold 经验证良好.
- 56 → 58 tests.

### P1 — mobile 响应式 Playwright 系统截图
- 6 routes (Landing / Talkshow / Profile / WeeklyMe / Fired /
  CharacterVotes) × 390×844, **零 horizontal overflow** ✓.
- v6.25 P2 mobile CSS pass 真生效.

### P5 — RulesModal → 3-step swipe deck
- 250-LOC 长 scroll → 3 step deck (模式 / 阵营+循环 / 新功能 v6.x).
- 进度 dot click-to-jump, ← → 键盘 nav, Skip 单独.
- Step 3 surface PSYWAR ritual (战术 @ + ✨) 给新手知情.

---

## v6.27 — 2026-05-26 · ROLE_PRESETS[9] + ✨ jump + 命中率 + token Jaccard + talkshow 内容

### P1 — ROLE_PRESETS[9] 补完
- 9-player preset: 6 cat + 2 dog + 1 neutral. v6.26 P2 抓的 latent
  crash bug 闭环. +1 test.

### P3 — ✨ chip jump-to-speech
- GhostChatPanel ✨ "AI 引用了" 变 button. Click 滚 SpeechHistory 对应
  bubble + 1.5s 金光闪. djb2 text-hash 锚 (player-id 不够唯一).

### P4 — Profile MyLeaksPanel 引用统计
- `utils/leakStats.ts` localStorage `office-zoo.leaks.stats` (anonymous-
  friendly, 50-entry FIFO, schema versioned).
- 3 stat boxes (已提交 / AI 引用 / 命中率 % 色阶分级) + 最近 N 条 ✨ 标.
- +10 tests (in-memory Storage shim 绕 jsdom).

### P2 — leak quote 高级检测 (token Jaccard)
- 混合 tier-1 4-char substring + tier-2 token Jaccard ≥30%. CJK bigram +
  ASCII alnum runs, stop tokens drop.
- 抓 paraphrase 不再漏. +5 tests.

### P5 — talkshow +8 AI 主题 bits (bit-051 ~ bit-058)
- LLM-时代办公室困扰: AI 替我写周报 / Cursor 提 PR 我背锅 / AI 帮我
  裁同事. bit-058 meta self-ref 把 OFFICE ZOO IP 织进 talkshow narrative.
- SEED_SCRIPTS 50 → 58.

---

## v6.26 — 2026-05-25 · 真 crash 抓 + CHANGELOG backfill + archetype hook 验证 + GameEngine test + AI 引用闭环

### P5 — EliminationReveal Playwright probe
- **抓真 React-tree crash**: v6.23 P4 `<>...</>` Fragment 包 sibling
  AnimatePresence 触发时整树 unmount (rootChildren 1 → 0). 改
  `<div className="contents">` 解决.
- DEV-only `window.__triggerMockElim` 给 probe 用 (tree-shaken in prod).

### P4 — CHANGELOG v6.7-v6.20 backfill (14 versions)
- 填 "v6.7 brand systematization" 到 "v6.20 Duel 完善" 14 个版本 entries.
- 倒序排好 (latest on top), 每版本 P-iterations bullet 列.

### P3 — archetypeEvolution 3 hook 验证
- TODO comments stale — squad-end / talkshow-create / pack-complete
  全 v2.0.1+ 已 wire (`squadHandler.ts:292` / `talkshow.ts:319` /
  `fired.ts:1050`). 文档化具体 file:line.

### P2 — +16 tests (34 total)
- `GameEngine.test.ts` +11: ctor / players / pushLeakedHint / ghostVotes.
- `idleMoments.furniture.test.ts` +5: coffee_machine ☕ 偏置 / printer /
  sofa / 老板办公室 furniture wins room / 茶水间 vibe.
- **顺手抓 ROLE_PRESETS[9] 不存在的 latent bug** (v6.27 P1 修).

### P1 — AI 引用 leak 检测 + 高亮链路
- `GameEngine.detectLeakQuote` 4-char sliding 子串检测.
- 新 event `game:leak_quoted` { hintText, byPlayerId, byPlayerName,
  speechText }.
- GhostChatPanel badge 升级 👂 → ✨, SpeechHistory bubble 加 ✨ chip.
- 闭 PSYWAR 反馈环: 提交 → 听到 → 引用.

---

## v6.25 — 2026-05-25 · PSYWAR + onboarding + mobile + i18n key + dev hook + 测试骨架 + CHANGELOG initial + typecheck cleanup

### P1 — PSYWAR 升级真影响 AI
- `BaseAgent.generateSpeech` prompt 注入"[匿名前同事爆料]" — 最多
  3 条最近 leakedHints. 真改变 AI 行为, 不再纯 ritual.
- 新 `socket.on('game:psy_war_leak')` → `engine.pushLeakedHint(text)`.
- `pushLeakedHint` FIFO cap 5 + 80-char clamp + emit `leak_acked`.
- GhostChatPanel 加 👂 "AI 听到了" badge (ackedTexts set).

### P2 — 系统性 mobile 响应式
- GameMap canvas + GhostChatPanel + Classic 主布局加 sm: 断点.
- 触摸目标 ≥ 44×44 px, 文字 ≥ 12 px, viewport 注 viewport meta tag.

### P3 — CHANGELOG 补 v6.21-v6.24 (initial)
- 4 个版本 entries 加在 v6.6.2 上方. 维持 latest-on-top.

### P4 — typecheck 干净
- 修 pre-existing baseline: pino overload + requestId @ts-expect-error
  unused + b2b/fired/characters routes union mismatch. **0 error** 跨
  server / client / shared.

### P5 — EliminationReveal 新员工加 avatar
- pickNewHire 返 name + realName. CHARACTERS shared lookup → avatar
  URL fallback emoji '🎉'. 圆形 42×42 avatar 绿环 + 名字 + tagline.

### P6 — GhostChatPanel 加自定义 @ textarea
- 8 preset 之外加 textarea (≤60 字 optional). 自定义存在用自定义,
  没就用 preset. 完全 user agency.

### P7 — 测试基础设施骨架 (vitest)
- vitest.config.ts + 18 initial tests (pickLastWords 8 personalities /
  pickNewHire / pickEmoteForPlayer 基础). `npm test` / `test:watch`.

### P8 — localStorage 旧 office-arena.* → office-zoo.* 一次性迁移
- `utils/lsMigrate.ts` startup hook, 6 known keys (sfx.muted /
  prediction-stats / pick.* / seen-rules / 其他). 标记 'office-zoo.
  lsmigrated.v1' = '1' 防重跑.

---

## v6.24 — 2026-05-25 · personality 数据流硬化 + 鬼魂 vote 实时流 + README banner v2

### P1 — server attaches personality to kill / vote_result events
- `GameEngine.emit('kill', { ..., victimPersonality })` +
  `emit('vote_result', { ..., eliminatedPersonality })` — server 直传
  personality, client 不再依赖 `players.find` (race-prone).
- `socketHandler` 透传 + `shared/types/events.ts` 加可选字段.
- 实测 dev hook 验证: 9/9 鼠人 personality 全有, lastWords 现在 100%
  走 personality pool, GENERIC fallback 只剩"agent 无人格"罕见情形.
- Classic + Immersive `vote_result` / `game:kill` handler 改成 event-first
  读 `data.{eliminatedPersonality,victimPersonality}`, fallback `players.find`.

### P2 — 鬼魂联盟 vote 实时累加
- 新 socket event `game:ghost_vote_cast` (per-ghost real-time emit).
- `GameEngine` voting phase 每个鬼魂投完票即 emit, 不再 batch 到
  vote_result.
- `gameStore.mergeGhostVote(ghostId, target)` action 增量 merge.
- Classic + Immersive 新 handler `'game:ghost_vote_cast'` 调用 merge.
- 投票 phase 进入时 `setGhostVotes({})` 清上轮 tally.
- GameMap 紫色 👻N dots 现在投票时一只一只亮, 不再 batch 跳出.

### P3 — 入职反衬用真 squad 池
- `lastWords.ts`: SQUAD_NAMES (20 名镜像 server AI_NAMES pool) +
  HIRE_PREFIXES ['实习生','应届生','外包同学','校招生','试用期','替补'].
- `pickNewHire(seed, activeNames?)` — 优先抽 SQUAD_NAMES 里 active
  没占用的, 加前缀 → "实习生 Tony"; 90%+ pool 占用时 fallback 原 10
  名 NEW_HIRE_NAMES.
- EliminationReveal 加 `activeNames` prop, Classic + Immersive 喂
  `players.map(p => p.name)`.

### P4 — README banner v2 (字更大 + 干净双 tagline)
- 新 `assets/brand/logo-readme-banner.png` (1280×720):
  - Arial Black 108pt OFFICE ZOO gold→amber gradient + drop shadow
  - CN tagline "班味剧场 · 0 点的写字楼" (gold-soft)
  - EN tagline "Midnight Workplace Soap Opera" (muted pink)
- README.md + README.en.md 顶 img src 切换.
- BRAND_GUIDE.md §1 标注 v1 archived / v2 currently shipping.

---

## v6.23 — 2026-05-24 · brand + duel + 鬼魂战术 + 裁员剧场化

### P1 — alpha-keyed logo-mark-transparent.png
- PIL 抠掉 mark-only-art 的 solid violet bg → 透明 PNG.
- 用作 die-cut sticker / monogram / 单色印刷的源.

### P2 — 1v1 duel rematch (/duel/new?rematch=<duelId>)
- VoteDuel 加 `useSearchParams` 读 ?rematch=, fetch 旧 duel.
- CreateView 加 rematchId / myId props, 拉旧 ballot (host or guest
  side, 看当前 user 是哪边) 作 initialPicks prefill.
- 紫色 banner "↻ 已复用你上次对 [opponent] 的 ballot" — user 可继续微调.
- MyDuelsPanel 的 "↻ 再约" 孤儿 button 现在可工作 (route 一直能 match
  `:id` = 'new', 缺的只是 query param 处理).

### P3 — 鬼魂 @活人 战术按钮
- GhostChatPanel footer 加 "战术 @" 按钮 → popover 选活人 + 选 8 个
  preset 心理战话术 (`{target}` token 替换).
- 最近一个鬼魂 "说出" 这句话; 注入为 violet rim + dashed border +
  "💢 战术" tag 的特殊 bubble.
- alivePlayers prop 从 Classic 传 (server 不改).
- 纯 UI ritual — AI 不读 (v6.25 P1 升级为 AI 真读).

### P4 — 裁员瞬间剧场化
- 新 `lastWords.ts` (200 LOC):
  - LAST_WORDS_POOL — 8 personality × 3 句 personality-driven 离别赠言.
  - NEW_HIRE_NAMES + NEW_HIRE_TAGLINES — comedic 入职反衬 pool.
  - pickLastWords(personality, seed) + pickNewHire(seed) — 确定性.
- EliminationReveal 加:
  - 离别赠言 quote block — center card 内 italic gold-soft "「XXX」".
  - 班味物件 drop particles — 🪪/📦/📄/☕/🧷/📎 从顶部落下 (gravity
    curve + horizontal drift + rotation).
  - 新员工入职反衬 phase 2 — main reveal dismiss 后 200ms 触发 bottom
    toast "🎉 HR 系统 · 新员工入职 · Welcome aboard, [name]!" 持 2.2s.
- EliminationEvent 加 personality 字段; Classic + Immersive 喂
  `victim?.personality` (v6.24 P1 升级为 server event payload 直传).

---

## v6.22 — 2026-05-24 · 前同事吐槽群 (GhostChatPanel + GameMap 鬼魂 vote dot)

### 新组件 GhostChatPanel (260 LOC)
- 右下角浮动 pill `👻 前同事吐槽群 · N` (带未读 badge + pulse).
- 展开为 320×380 IM 风 chat: 头像 + 名字 (team 色) + bubble + HH:MM.
- 自动滚到底; 用户上滑读 history 时停止 hijack.
- Welcome reaction 模板 — 新鬼魂入群时, 前一鬼魂自动 +1 句"欢迎进群"
  / "终于不孤单了" (10 句池, 确定性 hash); 纯 client side, 0 LLM cost.

### GameMap 鬼魂 vote dot
- ghostVoteTallyRef 重算 (Object.values(ghostVotes) → target 计数).
- 紫色 "👻N" badge 在被指认活人 sprite 右上方 (sx+16, sy-16) 带 pulse
  halo (sin(tSec*3.9)*0.09).
- 单票画 "👻", 多票画 "👻N" (N 金色).

### gameStore
- 新 selector `useGhostVotes` + action `setGhostVotes`.
- Classic vote_result handler 加 `setGhostVotes(data.ghostVotes)` 即时
  灌进 store (不等下一 state snapshot).
- Dev hook `window.__officeZooStore` (DEV-only, Vite 生产 tree-shake)
  给 Playwright probe 注入 mock 数据用.

### Classic.tsx 挂载
- 新组件挂在 GameMap container 内, 右下角. ghostComments + avatarUrls
  + alivePlayers (v6.23 P3 加) 全部 prop.

Server: 零改动 — 复用已有 `generateGhostComment` + `generateGhostVote`.

---

## v6.21 — 2026-05-24 · GameMap 摸鱼 micro-moment (emoji bubble engine)

### 新文件 idleMoments.ts (170 LOC, 纯逻辑)
- 每只活鼠头顶每 ~10s 飘 ~4s 一个 20×20 gold-rim 紫底气泡, 一个 emoji.
- emoji 池按 activity × room × nearest furniture 加权:
  - **activity** (server-driven `activity.kind`): idle → 🥱💤📱☕🐟,
    work → 💢⌨️📞🆘, chat → 💬👀🙄, sneak → 🤫🐍🕵️,
    meeting → 😴🥱📝, commute → 🚶☕📱.
  - **room vibe modifier**: 老板办公室 → 😨🫣, 茶水间 → ☕🍵,
    监控室 → 👁️, 文印室 → 📠.
  - **furniture proximity boost** (≤70px 屏幕距): coffee_machine → ☕,
    printer → 📠, cctv → 👁️, sofa → 💤.
- furniture > room (近源胜) — 路过咖啡机就 ☕ 而不是房间的 😨.

### Stagger
- 9 鼠 hash(playerId) % SLOT_SEC 错峰, 任何时刻只 ~3 bubble 同时可见,
  不再 all-or-none strobe.

### GameMap.tsx 集成
- Sprite 绘制循环加 nearest furniture 检测 + pickEmoteForPlayer 调用 +
  rounded-rect bubble + speech tail + emoji glyph.
- 系统 emoji font cascade (Apple/Segoe/Noto) 不打包字体.
- Position sy-50 在 name pill (sy-37..sy-22) 上方, tail 下扎"speech from".

Server: 零改动.

---

## v6.20 — 2026-05-23 · Duel 完善 — spectator + share PNG

- **P1** spectator 视角修 — guest view 看 host ballot 时不再误显 "你的"
  picks. **P3** MyDuels Profile panel — `/profile/me` 加最近 duel 列表
  (host/guest 角色 + 比分 + "↻ 再约" — 实际 rematch 在 v6.23 P2 补).
- **P2** Duel 加 1080×1350 share PNG (第 6 个 share card) — `duelShareCard.ts`,
  完整 ballot 对比 + 比分 + EventPill 顶, 一键复制 / 下载.

---

## v6.19 — 2026-05-23 · Duel polish + 斗投 MVP

- **P1** WaitingHost 加 5s polling for guest join, OS 原生 share + 大成功
  动画 (拷贝 link 时绿色 flash + sfx).
- **P2** 斗投 MVP leaderboard — `/character-votes` 顶部 endpoint, "本周
  押中之王" 榜.

---

## v6.18 — 2026-05-23 · 双人 1v1 投票 duel

- **P3** 主体 — `/duel/new` 创建 + `/duel/:id` 加入. ballot size 3 (rat
  + personality 各 3), 实时对比谁押中 weekly leader 多. `BallotPicker` +
  `WaitingHost` + 完整 join 流.
- **P1** `/character-votes` 加 "过去 4 周霸榜" timeline matrix (12 rat ×
  4 周热力图).
- **P2** PersonaCard 头像旁 "本周 dominant" 小标 (sync-cached, 不打开
  popover 就能看).

---

## v6.17 — 2026-05-23 · 角色投票全局化

- **P1** `/character-votes` 全网投票排行榜页 — 鼠人 personality 选秀的
  外面板. Landing 加 "discover" chip 引流.
- **P2+P3** Vote modal 加 4 周 winner 历史回看 + Profile MyBallotsPanel.

---

## v6.16 — 2026-05-23 · 鼠人选秀 P-iterations

- **P1** 鼠人选秀 — 用户每周投票决定 next-week personality bias (game
  engine `assignPersonalities` 加 weekly winner override 50% 偏置).
- **P2** PERSONALITY_LABELS 提取到 `client/constants/personalityLabels.ts`
  (8 personality × label/emoji/color/icon).
- **P3** SquadHistory 挂 SquadMemberCard — 2 处 member 列表都可 hover
  popover.

---

## v6.15 — 2026-05-23 · TopRats + Squad + Talkshow + Daily

- **P1** TopRatsPanel SVG 30 天趋势图 (stacked area).
- **P2** SquadBuddiesPanel — Profile 加 "你常和谁组队" 可视化.
- **P3** Talkshow grid 加 inline UGC 卡 (每 5 AI 段插 1 用户投稿, 真假
  混排).
- **P4** Daily challenge 加 "今日鼠人主角" 联动 badge.

---

## v6.14 — 2026-05-22 · Landing daily featured rat + UGC carousel

- Landing 加 "今日鼠人聚光灯" — DailyRatSpotlight 选 1 鼠 + 3 段语录.
- approved UGC carousel — 通过 maker 审核的段子轮播在 Landing hero 下方.

---

## v6.13 — 2026-05-22 · Result polish + Landing prefetch

- **P3** Result 页加 PersonaCard popover (复用 v6.8 P1 系统).
- **P4** Landing prefetch + OG cache cleanup — 减首屏延迟.

---

## v6.12 — 2026-05-22 · OG 卡 + UGC 闭环

- **P1** UGC 闭环显示 — Profile 加投稿统计 + PersonaCard 引流 ✍️ 编段子.
- **P2** OG per-character PNG — server Playwright pre-render + 磁盘缓存
  (社交链接 unfurl 时拿到角色卡).

---

## v6.11 — 2026-05-22 · spectator + UGC + Maker

- **P1** spectator 趋势 — 30 天 personality 演化 + trend chip.
- **P2** Maker UGC 审核工具 — `/maker` 管理页 + token gate.
- **P3** Squad stats endpoint — SquadMemberCard 填真数据.
- **P4** 角色卡 OG image — 社交 unfurl + deep-link bounce.

---

## v6.10 — 2026-05-22 · spectator tracking + i18n + UGC 桥接

- **P1** spectator tracking — "你看过的鼠人 Top 3" (client-only, localStorage).
- **P2** i18n — 12 角色英文 fallback (CharacterCard.i18n.en) + PersonaCard
  UI 双语.
- **P3** PersonaCard 加 ✍️ 编段子 → Talkshow UGC 同步.
- **P4** PersonaCard 挂 squad mode — 新 SquadMemberCard 桥接.

---

## v6.9 — 2026-05-21 · 单卡分享 + profile 榜 + B2B 预览

- **P-share** 角色单卡 1080×1350 分享 PNG (`utils/characterShareCard.ts`).
- **P-profile** `/profile` 加 "全员鼠人 Top 3" 榜单.
- **P-b2b** B2bEmbed 加 NPC IP 预览带 — 企业 demo 卖点 (展示几个签约
  鼠人头像 + 战绩).

---

## v6.8 — 2026-05-21 · 鼠人 IP 反差萌系统

- **P1** 鼠人花名 + 性格卡 — IP 反差萌 (固定 epithet × 随机 personality
  → 反差笑点). 12 名英文 CharacterCard 池 (Tony "Excel 永动机" 等).
  PersonaCard popover 渲染 IP + 本局 personality 组合.
- **P2** Phase transition 过场 + SFX — 米哈游式仪式感
  (PhaseTransitionOverlay + sfx).
- **P3** AI typing idle 微动作 — 8 性格 × 8 动作差异化 (IdleBeat).
- **P4.1** 证据系统 — 讨论引用 chip + jump-to-cited.
- **P4.2** 回合压力 — 真 wave 进度 + 最后窗口红色脉动 + tick SFX.
- **P5** 角色战绩 — characterStatsStore + PersonaCard 填真数据.

---

## v6.7 — 2026-05-23 · brand systematization

- favicon suite — `client/public/favicon.ico` (multi-resolution
  16+32+48) + favicon-16/32/48x.png + apple-touch-icon.png (180) +
  icon-192/512.png + manifest.webmanifest (theme #FFD700, name
  "OFFICE ZOO · 班味剧场"). PIL 生成自 logo-card.png 5★ stigma 源.
- Landing IP — hero wordmark 左加 `<motion.img>` brand-logo.png
  (120-140px clamp + glow ring shadow).
- 3 brand 衍生 — horizontal-banner-twitter.png (16:9 cover) +
  square-avatar-group.png (1024 chibi 头像) + BRAND_GUIDE.md (6 章
  brand 圣经: 核心 / logo 系统 / 色卡 / 字体 / 应用样板 / 衍生).
- 5 处 OFFICE ARENA 旧名洗白 (shareCard / HighlightReel / RulesModal)
  — localStorage key 保留以免丢用户数据 (v6.25 P8 才一次性迁移).
- 间插 brand commits: `fe95a8a` 3 个 logo 变体 (vertical / horizontal /
  mark-only base art) + `b99e5cf` 真字体 wordmark overlay → README ship.

---

## v6.6.2 — 2026-05-23 · 趋势 polish + 双 PNG 分享 + 30 天榜

### Added — Phase A: TrendChart hover tooltip
- `WeeklyMe.tsx` 的 `<TrendChart>` 加 hover overlay:
  - 鼠标 snap to nearest day (invisible rect hit zones, edge zones
    min 8px hit width)
  - 金色虚线 vertical guide + 4 hover dot (带描边对比)
  - tooltip 框: 日期 + "第 N 天 / 起点" + 4 风格累计 + 该日增量 +N
- 实战 verified: 单天数据 hover 显示 "2026-05-23 · 起点 · 🧩3 🎭2 🎩0 💢1"

### Added — Phase D: /preferences 加 recent 30d dominant
- `server/src/routes/weekly.ts`:
  GET /api/weekly/preferences 响应加 `recent` 字段
  - 从 events 过滤最近 30d, 重新 bucket 算 counts → dominantStyle
  - 透传 `differsFromAllTime` 信号 (recentDom != allTimeDom)
- `WeeklyMe.tsx` summary 区加 recent section:
  - "近 30 天 · N 次 · 最近最爱: X" subtitle
  - differsFromAllTime=true 时高亮 "🔄 你最近变了" 玫红 chip
  - 隐藏: recent.total === 0 时不渲染整段

### Added — Phase B: 趋势图 PNG 分享卡
- 新 `client/src/utils/trendShareCard.ts` (~310 行):
  - 1080×1350 IG-portrait 纯 Canvas 2D
  - 米哈游 cosmic 渐变底 + summary box (all-time 大数字 + 近 30d 副 box)
  - 主图 480px 高 chart box: y 轴 3 ticks dashed grid + x 轴日期 +
    4 条 polyline + end-of-line dot + 底部 4 风格 legend with 当前值
  - public API: generate / copy / download / preview-url
- 新 `components/TrendShareCardModal.tsx` (~170 行) — sibling of
  WeeklyShareCardModal 风格
- `WeeklyMe.tsx` 趋势图下方加 "📤 把我的偏好曲线导出 PNG" 主按钮

### Added — Phase C: A/B 对比 PNG 分享卡
- 新 `client/src/utils/abCompareShareCard.ts` (~220 行):
  - 1080×1350 双栏 (PLAIN 左 / BOOSTED 右)
  - BOOSTED 右栏带金色 shimmer 边框 (5★ 角色卡风格)
  - 顶部 EVENT pill: 同事件+同风格+你点赞 N 次
  - 自动 wrap + 长文 ellipsis
- `Weekly.tsx` A/B 对比 modal 内嵌"📋 复制对比图 / 📥 下载对比图"
  按钮 (不另开 modal, 复用现有 compare modal)

### Verified UAT
- ✓ typecheck server / client 0 新 regression
- ✓ /preferences UAT: 6 events 全在 30 天内, recent = all-time,
    differsFromAllTime = false (正确)
- ✓ Visual probe WeeklyMe: 近 30 天 chip + 趋势导出按钮 + SVG chart
    全部渲染对齐
- ✓ Visual hover probe: 金色虚线 + 4 hover dot + tooltip 内容正确

### v6.6.2 体验闭环延伸
```
v6.6.1   累计 bar + SVG trend (静态)
   ↓
v6.6.2   + hover tooltip (交互)
        + 近 30 天 dominant (时间敏感)
        + 趋势 PNG 分享 (viral 出口 1)
        + A/B PNG 分享 (viral 出口 2)
       = 偏好闭环 from "数据可视化" → "数据可分享"
```

---

## v6.6.1 — 2026-05-23 · 趋势图 (events 时间戳记录 + SVG 折线)

### Why
v6.6.0 的 `/weekly/me` 只有"累计 + 当前 dominant"两个数据维度,
缺最初任务里点名要求的**时间趋势**子项 — 原因是 store 只存 running
counts, 没有 event-level timestamps 可绘制 over time。本版本把
schema 升级为 counts + events log, 并加 SVG cumulative line chart。

### Changed — store schema (back-compat)
- `weeklyPreferenceStore.ts`:
  - 旧 shape: `Record<userId, LikeCounts>`
  - 新 shape: `Record<userId, { counts: LikeCounts; events: LikeEvent[] }>`
  - `recordLike` 现在同时 bump counts + push `{style, ts}` 到 events
  - events 上限 500 条/user (≈1.5 年日点击量), 超出 LRU drop oldest
  - **loader 含 back-compat**: 旧 user 自动 wrap 成 new shape, events=[]
    (历史无时间戳粒度, UI 显示"v6.6.1 起开始记录"友好提示)
- 新增 `getEvents(userId)` API — 返回完整 events 数组
- `/api/weekly/preferences` 响应现在含 `events` 字段 (全量传, 单用户
  ≤8 KB)

### Added — Trend chart in /weekly/me
- `WeeklyMe.tsx` 加 `<TrendChart events={prefs.events} />` 子组件 (130 行):
  - 按 UTC calendar day bucket aggregation
  - 算每天每风格 cumulative running total (4 条折线 over time)
  - 50 行纯 SVG (无第三方图表库)
  - y 轴 3-tick + dashed grid · x 轴首/中/尾 3 个 day label
  - end-of-line dot anchor 4 条线终点
  - Legend chips 含当前累计值 (e.g. "🧩 阿里黑话版 · 3")
  - 边界:
    - 单天 → 退化为 4 dot 垂直堆叠 (单 x 位置)
    - 空 events (migrated user) → "📭 还没有时间戳记录" 友好提示

### Verified
- ✓ typecheck server / client 0 新 regression
- ✓ Schema migration: 老用户 wrap 成 new shape, events=[]
- ✓ UAT 6 likes (3 alibaba + 2 pua + 1 direct over 3 秒):
  - counts {alibaba:3, pua:2, posh:0, direct:1} ✓
  - dominantStyle = alibaba ✓
  - 6 events 带 ts 排序正确 ✓
- ✓ Visual probe: trend chart 单天数据正常退化 + legend 显示

### 闭环完成度
```
v6.6.0 + v6.6.1 = self-tuning 完整闭环
  ✅ 点赞反馈 (Weekly ❤ + ⚡ TUNED + tuning chip)
  ✅ 具象证据 (A/B compare modal)
  ✅ 累计可视化 (4 风格 bar chart)
  ✅ 时间趋势 (cumulative SVG line chart, v6.6.1 新加)
  ✅ Forget (Settings 清空按钮)
  ✅ 跨用户聚合 (bar cluster team chemistry)
```

### 用户答复说明 (Honest)
用户在 v6.6.0 后又列了 3 项,实际 2 项已在 v6.6.0 交付 (Forget 全量 +
team chemistry 全量), 1 项部分完成 (历史可视化的累计 + dominant ✓, 时间
趋势 ✗) — v6.6.1 补上 trend chart 缺口。完整 4 task 闭环至此完毕。

---

## v6.6.0 — 2026-05-23 · self-tuning 完整闭环 (forget + A/B + 历史 + 团队)

### Why
v6.5.2 加了 self-tuning, 但缺反向通道 (用户怎么"撤回"偏好), 也没有
"AI 在听你的"具象证据。v6.6 把闭环 5 个 surface 补齐: forget /
A/B 对比 / 历史可视化 / 团队画像 + 跨路由 link。

### Added — Phase A: Forget UI (Settings 加按钮)
- `Settings.tsx` 新增 `<WeeklyPrefsForget />` section:
  - 自动渲染 4 风格 like counts 矩阵 + dominant 高亮
  - 2-step confirm "清空我的周报风格偏好" 按钮
  - 仅当用户已有 ≥ 1 次点赞才渲染整段
  - 后端复用 v6.5.2 已就绪的 `DELETE /api/weekly/preferences`

### Added — Phase C: A/B 对比 endpoint + modal
- `server/src/routes/weekly.ts` 新 `POST /api/weekly/compare`:
  - 输入 {event, style}, 并行生成 boosted (temp 1.0 + 极致化 prompt)
    和 plain (temp 0.85, 中性) 两版
  - 返回 { boosted: { text }, plain: { text }, likesForThisStyle }
- `Weekly.tsx` boosted 卡新增 "🔍 看'你的偏好让 AI 变了多少' · A/B 对比"
  按钮:
  - 点击 → 拉 compare endpoint → 弹 modal 左右双栏对比
  - 左: 🌚 PLAIN (无 boost) / 右: ⚡ BOOSTED (带 boost)
  - 底部 hint "这就是 self-tuning · 截图发圈 #AI在听我的"

### Added — Phase B: /weekly/me 偏好可视化
- 新 `client/src/routes/WeeklyMe.tsx` (165 行) — 路由 `/weekly/me`:
  - 顶部 summary: 总点赞数 + dominant 状态 + 阈值提示
  - 4 风格 bar chart (横向 progress bar + 配色 + dominant 高光)
  - 每行配 byline (颗粒度/拉齐/闭环 等关键词提示)
  - 空状态优雅引导新用户先去 /weekly 点赞
- `App.tsx` 路由 `/weekly/me` 注册 (ABOVE `/weekly` 防 segment 冲突)
- `Weekly.tsx` header EventPill 右侧加 "📊 我的" link 入口

### Added — Phase D: 团队风格画像
- `server/src/routes/bar.ts` 新 `GET /api/bar/cluster/:id/team-style-profile`:
  - 遍历 cluster 所有 participants → 拉 weeklyPreferences counts
  - 聚合: 4 风格累计 + teamDominant + perFriend × dominant
  - 简易 chemistry 一行话生成 (基于风格 set:
    全员同风格 = "信仰一致同事局" / 全员不同 = "互补型团队" /
    主导 + 反骨 = "正在分化")
- `BarClusterShareModal.tsx` 新增 "🎭 团队风格画像" section:
  - PNG 预览上方显示 chemistry 描述句 + 每朋友 dominant chip
  - 仅当 teamTotal > 0 时渲染 (新 cluster 无人点赞自然隐藏)

### Verified UAT
- ✓ typecheck server / client 0 新 regression
- ✓ A/B compare endpoint: 同 event 同 style 返回 boosted + plain 两版
- ✓ team-style-profile endpoint: 3 友 cluster (alibaba+pua+empty)
  返回正确 aggregate + perFriend + chemistry "互补型团队"

### v6.6 闭环总结
```
v6.5.0  生成 4 风格
v6.5.1  PNG 一键拼图分享
v6.5.2  like → boost (server → client 反馈)
v6.6    forget (Settings) + A/B 对比 (具象证据) +
        历史可视化 (/weekly/me) + 团队画像 (bar cluster)
       = 完整 self-tuning 闭环
```

### Files
- 新 3: WeeklyMe.tsx / weeklyPreferenceStore (v6.5.2 已有, 这次复用)
- 改 6: Settings / Weekly / BarClusterShareModal / weekly.ts /
  bar.ts / App.tsx

---

## v6.5.2 — 2026-05-23 · 周报 LLM 风格 self-tuning ("AI 在听你的")

### Why
v6.5.x 周报生成器原本 4 风格固定 temperature 0.85, 用户没有 "下次更
偏向某种风格" 的影响力。v6.5.2 加入 like → preference → 下次 generate
自动 boost 主导风格 的反馈闭环, 让用户有"AI 在听我的"体验。

### Added
- `server/src/services/weeklyPreferenceStore.ts` (95 行):
  - 持久化 per-user × per-style 点赞计数 (4 个 style 各一个 int)
  - `recordLike` 累加, `getCounts` 读, `dominantStyle` 阈值判定
  - 阈值: 总点赞 ≥ 3 才判定 dominance, 避免单次点赞触发
  - 平局时 dominant = null (不偏袒)
  - JSON file 持久化, sibling of squadHistoryStore pattern
- `server/src/routes/weekly.ts`:
  - 新 `POST /api/weekly/like` — 累加点赞 + 返回新 counts + dominant
    (rate-limit 30/min/IP-user)
  - 新 `GET /api/weekly/preferences` — 读用户偏好状态
  - 新 `DELETE /api/weekly/preferences` — 清空 (Forget pattern)
  - **`POST /generate` 改造**:
    - 读用户 X-User-Id → 拉 counts → dominant
    - dominant style 的 LLM call: temperature 0.85 → 1.0,
      system prompt 末尾追加 "用户最爱你这种, 极致化, 不超 250 字"
    - 返回 results 每条带 `boosted: bool` 字段
    - 顶级响应新加 `tuning: { dominantStyle, dominantLabel, totalLikes }`
      或 null
- `client/src/routes/Weekly.tsx`:
  - 每张 result card header 加 ❤ 按钮 (显示当前 like 计数, 点击 +1)
  - boosted style 加金色 "⚡ TUNED" badge
  - 结果区顶部加 "⚡ AI 在听你的 · {label} 已强化" chip (仅 dominant 存在时)
  - empty state "4 种风格预览" 旁加 "你最爱: X · 下次自动强化" hint
  - 启动时从 `/preferences` 拉用户当前偏好

### Verified UAT
```
like × 4 alibaba (uid=u-tuning-uat-001):
  count 1, 2  → dominantStyle: null    (below MIN_TOTAL=3)
  count 3, 4  → dominantStyle: alibaba (boost armed)

generate {event, styles: [alibaba, direct]}:
  tuning: { dominantStyle: 'alibaba', dominantLabel: '阿里黑话版', totalLikes: 4 }
  result[0] alibaba.boosted = true
            text 明显加密:
            "深度打磨...全力以赴...拉齐了各项资源...闭环体验...
             战斗力调动至极致...梳一梳体感与颗粒度..."
  result[1] direct.boosted = false (没被 boost, 跟之前一样)
```

### typecheck
- ✓ server / client 0 新 regression

### v6.5.2 体验意义
原来 generate 是 4 个独立 black box; 现在变成"我反馈 → AI 学习 → 下次
更对路"的闭环。这是把"工具"升级到"个性化助手"的关键体验点, 对 Z 世代
留存影响很大 (类似 TikTok 的 for-you 推荐感)。

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
