# OFFICE ZOO 产品复审与升级开发计划（2026-10）

> **本文取代 2026-10-06 盘点的后续版本计划**，作为 v6.161 起的开发依据。
>
> **怎么得出的（2026-10-09）：** 6 路取证（产品功能盘点 / 大模型调用链 / 工程架构 / 设计交互与截图 / 外部市场与 2026 年模型能力 / 商业与增长数据）→
> 6 个视角独立评审（产品战略 / 设计交互 / 工程 / 大模型与 Agent / 商业 / 反方）→ 每份评审由怀疑者回到代码原文和外部链接逐条核验 →
> 合成 → 完整性批评 → 定稿；最后人工复核关键外部事实，并核对文中引用的全部文件路径与承重代码断言。
> 被核验推翻、无法核实的说法列在第 11 节附录，不作为依据。
>
> 代码引用基于 v6.160（main `f13bab8`）；行号会随后续版本漂移，执行时以函数名为准。

---

## 0. owner 拍板（2026-10-10）与对本文的修订

第 10.2 节的 5 项决策已拍板，**与下文冲突时以本节为准**（第 6、9、10 节已按此改写）：

| # | 决策 | 结论 | 对计划的影响 |
|---|------|------|------------|
| 1 | 路线并行还是串行 | **并行**：上线基建（线 A）与班味单口短视频（线 B）同时推进 | v6.169 的视频导出不等托管上线，与阶段 0 交错提交 |
| 2 | 免费试玩的模型成本 | **产品本身不提供模型 API**；托管版一律由用户在浏览器里配置自己的模型 key（BYOK） | 原 v6.167「Demo 共享 key 限流 + 日成本上限」作废，改为 **BYOK**；服务器不持有、不落盘、不记录任何模型 key；没配 key 的访客看示例对局和不调模型的玩法 |
| 3 | 收款 | **暂不开发** | 原 v6.177（Stripe live + 裁了么付费墙）冻结；托管版隐藏 Premium 假结账入口；账号体系（v6.176）失去收款这一刚需，暂缓 |
| 4 | 企业主体 | **暂不注册** | 微信支付、小程序维持冻结；托管优先选境外平台（无需 ICP 备案），国内访问速度是已知代价 |
| 5 | B2B 白标 | 按推荐**冻结** | 托管版隐藏 B2B 入口（无鉴权的公开写接口不上公网） |

**「下个大版本」的边界：** v6.161–v6.169（阶段 0 + 阶段 1 + 线 B），完成后打 tag `v6.169`，再统一同步 GitHub 门面（README / 截图 / CHANGELOG）与 ModelScope，然后推送并开 PR 合进 main。

> **📌 进度（2026-10-12）：** v6.161–v6.169 代码全部完成（详见 [`CHANGELOG.md`](./CHANGELOG.md)）。与本文原计划的出入：
> v6.162 顺带修了取 IP 可伪造、23 个 JSON 存储并发写与测试读写本机数据目录；`replayStore` 写队列已随 v6.162 的 `atomicJson` 一并解决；
> v6.167 的凭据头改为单个 `X-Byok`（base64url JSON），Socket 凭据走握手 `auth.byok` 而非建局消息；
> v6.168 的示例对局只做了基础设施——现有回放没有发言记录，示例对局要 owner 在本机玩一局后用 `npm run sample:promote` 生成（不用 owner 的 key 现跑、不手写假台词）。
> 仍需 owner 本人：用自己的平台账号部署、备案问题咨询法律顾问、生成示例对局、用真实 key 在托管地址复验 v6.167 验收⑤与 v6.169 验收⑤。

**BYOK 带来的新风险（必须正视）：** 绝大多数国内 C 端用户没有模型 API key——BYOK 把「自备 key」这道门槛从「克隆仓库」平移到了「打开网页」。缓解手段写进 v6.167/v6.168：①不配 key 也能看完整的示例对局，也能玩不调模型的玩法；②内置国内主流模型商预设与申请指引，并标注每局成本估算；③「测试连接」一步验证 key。
**停止条件：** 托管上线 30 天内，点击模式入口的访客中完成 key 配置的比例 < 10%，说明 BYOK 门槛压垮了漏斗，需要 owner 重新评估决策 2（例如改为限额共享 key），而不是继续堆功能。

---

## 1. 结论：一句话结论 + 三条最关键判断

**一句话结论：** OFFICE ZOO 是一辆精密但停在车库里的赛车——v6.160 有 858 个测试、35 条路由、5 种玩法、TTS 完整调用链，近 14 天却只有 13 个独立访客，零真实付费，没有一个外部用户能在 5 分钟内体验任何功能；在这个问题解决之前，任何新功能的 ROI 都趋近于零。

**三条最关键判断：**

**判断一：获客漏斗在第一步 100% 断裂，这不是优化问题，是存在性问题。** README 明写首次启动等 5–10 分钟生成素材；docker-compose.yml 无应用服务，无 Dockerfile；所有发布稿（PH/HN/即刻/小红书）执行动作类 checklist 全部未完成（docs/PRODUCTHUNT_LAUNCH_KIT.md maker handle 填「待填」）。产品做到 v6.160，但「打开浏览器体验」这一步从未对真实用户成立过。

**判断二：三个安全漏洞是公网部署的硬性阻断，修复成本极低，不修代价极高。** CORS 全开（index.ts:58）、memory/forget 无鉴权（memory.ts:17–20 注释「Auth: NONE in v5.8.1」）、TTS 无限流（tts.ts 全文无 createRateLimiter 调用）——这三条在本地开发无害，上线后一次恶意请求即可清空所有角色跨局记忆、榨干 MiniMax TTS 额度、允许任意网页跨域调用所有 API。三处合计修复工时约 2–4 小时，但它们是托管上线的必修前置项。

**判断三：交互架构落后一个代际，且有低成本修复路径。** packages/server/src/utils/llm.ts:25 全文只 import generateText，无 streamText；GameEngine.ts 的 wave 批量等待设计让用户每轮面对 8–10 秒沉默（GameEngine.ts:1201–1204 设计注释已自认「8×~4s serial is unacceptable」）。切到 streamText 逐字推送不需要实时语音 API，是在现有 Vercel AI SDK 内可以完成的最小改动，能将「等待感」变成「临场感」。

---

## 2. 现状体检：用数据说话

| 维度 | 数据 | 出处 | 可信度 |
|------|------|------|--------|
| 流量 | 近 14 天 47 次 PV / 13 个独立访客，来源几乎全为 github.com 内部跳转 | GitHub Traffic API（仅仓库 owner 可读，无法独立复现） | 背景参考 |
| 可访问性 | 无在线版本；新用户从零到第一次体验约 35–50 分钟 | README.md「首次启动 5–10 分钟」；git clone + API key 申请流程 | 代码可核实 |
| 可度量性 | 全代码库无 posthog / mixpanel / amplitude / gtag / plausible 任何分析调用 | grep 全局搜索确认 | 代码可核实 |
| LLM 等待 | 每轮 wave1+wave2 壁钟约 8–10 秒；SPEECH 超时 15s、CHAT_REPLY 30s、DIRECTOR 75s | llm.ts:27–34；GameEngine.ts:1201–1204 | 代码可核实 |
| 账号体系 | 用户 ID 是 localStorage 22 字符字符串，可伪造；注释原文「NOT a security identity: trivially spoofable」 | userId.ts:9–12 | 代码可核实 |
| 商业化 | Stripe 为 test-mode；billing.ts:2 注释「test-mode + graceful degrade」；Premium 点击 CTA 仅翻转 localStorage 标志（Premium.tsx:8–12 注释「clicking CTA flips localStorage entitlement flag」） | billing.ts:2；Premium.tsx:8–12 | 代码可核实 |
| 安全 | CORS 全开（index.ts:58）；memory/forget 无鉴权（memory.ts:17）；TTS 无限流（tts.ts） | 三处代码直接核实 | 代码可核实 |
| 工程规模 | GameEngine.ts 2912 行；Classic.tsx 26 个 useState；media.ts 是 11 行占位存根、对 /api/media/* 一律返回 HTTP 501（注释：原文件在恢复对话记录时丢失） | wc -l 核实；grep 核实；media.ts:2 注释 | 代码可核实 |
| 测试与 CI | 858 个测试，无 .github/workflows 目录（ls .github/ 确认） | 代码可核实 | 代码可核实 |
| 内容分发 | Phase A（videoExport.ts / ShareVideoButton.tsx / talkshowVideoGen.ts）已在 Classic 中实现；但 Talkshow.tsx grep ShareVideoButton 无任何输出——班味单口至今未接入视频导出 | ITERATION_PLAN.md:4「A/B/D/F ✅」；Talkshow.tsx grep 确认 | 代码可核实 |
| 竞品格局 | Simile（Generative Agents 原作者 Joon Sung Park 等创办）2026-02 获 Index Ventures 领投 1 亿美元 A 轮，2026-07 据聚合报道完成 2 亿美元 B 轮、估值 20 亿美元，方向为 B2B 人类行为模拟；AI 狼人杀消费级仍以独立游戏/社区项目为主，无大厂商业产品 | 人工复核（itiger 等多源报道）；可信度：Simile 融资已核实，B 轮领投方说法不一 | 人工复核可用 |
| 合规 | 《人工智能生成合成内容标识办法》2025-09-01 起施行（新华网），AI 生成音频/图像须添加显式标识；代码中 tts.ts / archetypeAvatarGen.ts 无任何标识调用 | 人工复核（已核实）；代码核实 | 已核实 |

---

## 3. 尖锐问题清单

### 产品

**[致命] 零在线版本——获客漏斗在第一步 100% 流失。** README 明写首次启动 5–10 分钟；docker-compose.yml 无 server/client 服务；92 颗 star 中多数集中在 2026-05/06 短期爆发后增速趋近停滞（GitHub 实时数据，背景参考）。原因致命：所有功能、留存、商业化的假设前提是「用户愿意克隆仓库并自备 API key」，这个前提在现实中已完全失效。

**[致命] 裁了么（参与感最强）排第 3 位，Classic（被动观看 15–25 分钟）排第 1 位。** Landing.tsx:75 MODES 数组：badge='01' 为 Classic，badge='03' 为 fired。裁了么是产品内唯一真正「玩」而非「看」的体验，每关 5 分钟、用户主动选牌、四维实时评分，却被当作第三个娱乐选项。这是导航层面的结构性错误。

**[高] 记忆系统工程投入大、用户实际感知接近零。** 跨局记忆检索仅在 zh locale 生效（BaseAgent.ts:836–876 zh locale gate）；pgvector 依赖 PostgreSQL，多数本地用户未配置直接跳过；无任何可见 UI（无「AI 记得你多少条」面板）。en/ja/ko 玩家跨局连续性完全无效，而 ITERATION_PLAN.md 将 HN 首发（英文开发者社区）列为 Phase G 核心目标，国际用户体验是功能残缺版。

**[高] 35 条路由、维护成本线性增长、10 个重叠分享卡 util 无统一抽象。** VoteDuel / FiredRoom 需两用户同时在线、无托管下使用量接近零；10 个独立 *ShareCard.ts 功能高度重叠（均为 canvas 生成图片），每次新功能都新建一套。

### 设计交互

**[致命] 首屏隐藏「必须克隆仓库+自备 API Key」的致命障碍。** Landing.tsx:335 activeSpec 直接进入配置流，无任何地方提示访客本产品无在线版本。陌生访客从 CTA 点击到实际体验的路径平均耗时 35–50 分钟，对非技术用户不可能独立完成。

**[致命] 全程非流式 generateText，典型等待约 13 秒+网络延迟。** llm.ts:25 import { generateText }，无 streamText；llm.ts:13–16 注释原文「HR reply legitimately needs ~13s + network」，30 秒是最坏情况兜底。在 HR 对话场景（裁了么）里这个差距最明显：问完问题等十余秒，然后文字瞬间出现，节奏完全打断。

**[高] 班味单口（最符合 Reels/Shorts 时长）没有接入已有的视频导出机制。** ShareVideoButton.tsx 和 videoExport.ts 已在 Classic 中完整实现；Talkshow.tsx 中 grep ShareVideoButton 无任何输出。已建好武器但没有瞄准正确目标。

**[高] 移动端游戏布局：game-side 压缩到 48vh，EVENT LOG + SPEECHES 双栏体验接近不可用。** index.css:513–534 @media(max-width:768px) .game-side max-height:48vh，两个独立滚动区域在 375px 手机上各约 160px 可视高度。

**[中] Premium 页面演示模式警告框是最强的转化负信号。** Premium.tsx:212 setPremium({ plan, demoMode: true })，页面明显显示「演示标签」；无 Free vs Pro 对比表；voice clone / 律师咨询标注「即将上线」。这个页面现在的作用是降低付费意愿。

### 工程

**[致命] 无 CI：858 个测试形同摆设，代码回归无预警。** 仓库无 .github/workflows 目录（ls 确认）。高频迭代 + 零 CI 意味着每次部署都是信念发布。

**[致命] CORS 全开 + memory/forget 无鉴权 + TTS 无限流：公网部署即为高危暴露面。** 三处直接来自代码，已在第 1 节列举。

**[高] 首次冷启动 5–10 分钟在线生成静态资产，阻断容器化部署。** archetypeAvatarGen.ts:333 writeFileSync 写入 23 个角色立绘；无状态容器每次重启清空本地文件系统，Railway/Fly.io 滚动部署因此失效。

**[高] replayStore / billingStore 无写队列：付款记录和对局回放存在 last-write-wins 风险。** replayStore.ts:57 persist 函数无 writeChain；billingStore.ts 同样无写队列。replays.json 已 131KB，billing.json 记录 Stripe 订阅，任何并发均可导致静默覆盖。

**[高] 零可观测性：AI 角色扮演质量退化完全不可见。** 唯一质量信号是 callLLMWithTimeout 的 ok:false warn 日志，无聚合无告警；无 Sentry 错误追踪，无行为分析。

**[高] GameEngine.ts 2912 行上帝文件；media.ts 是对 /api/media/* 一律返回 HTTP 501 的 11 行占位存根，已挂在生产路由上。** media.ts:2 注释明写「The original routes file was not captured in the recovery transcript, so this stub keeps server boot green」——对所有 /api/media/* 返回 501。这是 AI 辅助开发中代码丢失被掩盖的直接先例。

### 大模型与 Agent

**[致命] 全程非流式架构，交互形态落后一个世代。** 已在工程部分列举；代码证据在 llm.ts:25 和 GameEngine.ts:1260–1314 的 Promise.allSettled 批量等待模式。

**[高] 手写 JSON 解析：squadDirector 失败静默降级 fallbackStory，firing scoring 解析失败随机结果。** fired.ts:481–498 JSON.parse(cleaned) try/catch 静默降级；squadDirector.ts:152–183 parseDirectorJson 多层 try/catch；BaseAgent.generateVote 靠正则提取。Vercel AI SDK 已有 generateObject + zod schema，消除手写 parse 只需替换三个调用点。

**[高] 无 Prompt Caching：每次重发 600–1500 字 system prompt，成本虚高 60–80%。** callLLMWithTimeout 无 providerOptions/cache_control；Squad Director system prompt 每局一次约 1800 token 全量发送。

**[中] 非中文局跨局记忆完全禁用：国际化与核心留存机制互斥。** BaseAgent.ts:838 zh locale gate；en/ja/ko 玩家跨局连续性为零，而 Phase G 目标是 HN 首发英文开发者社区。

### 商业与合规

**[致命] 深度合成标识义务自 2025-09-01 起已生效，当前代码零合规动作。**《人工智能生成合成内容标识办法》已核实施行（新华网）。产品全站 AI 生成语音（MiniMax TTS × 23 角色）和 AI 生成头像均无任何标识调用。面向公众上线即触发法律义务，改造成本随功能规模增长，越晚做越贵。

**[致命] localStorage 伪 ID 体系支撑不起真实付费关系。** 换设备即失去全部 Premium 权益和游戏记忆；Stripe 以可伪造 userId 为键（billing.ts:75）；¥299/年的定价建立在沙子上。

**[高] Simile 已商业化，「空白赛道」假设过期。** Simile（Generative Agents 原作者团队）2026-02 获 Index Ventures 领投 1 亿美元 A 轮，方向为 B2B 人类行为模拟（CVS/Wealthfront/Telstra 已测试），与 OFFICE ZOO 路线图中 B2B 白标方向构成潜在竞争。ITERATION_PLAN.md:21 原文将 Smallville 列为「最大的技术 gap」，「占领空白赛道」的窗口正在收窄。（注：Simile 融资数字来自人工复核，B 轮领投方说法不一，可作依据引用。）

**[高] B2B 白标模块无鉴权、无计费、无任何企业客户，是死重而非护城河。** b2b.ts:9 原文「No real auth — that's a v1.2+ feature」；在账号体系和真实 Stripe live mode 完成之前，B2B 投入是在无水草地浇水。

---

## 4. 战略选择

### 路线 A：「先分发、后完善」——用内容验证市场假设（反方视角推荐）

**核心逻辑：** 不先上托管版本，而是先把班味单口视频导出打通，每周人工筛选 5–10 条最高质量 AI 段子手动投放抖音/小红书/B 站。用 bit.ly 短链追踪 GitHub 点击量，4 周内验证「班味文化是否有传播力」这个最根本的市场假设，且无需托管版本即可生产传播素材。

**优点：** 投入最小（videoExport 基础设施已在 Classic 中实现，Talkshow 接入约 6–10 小时工时）；不依赖托管基础设施，可最快执行；内容营销一旦跑通，冷启动问题自然破解。

**缺点：** 传播效果完全依赖 AI 段子质量，需人工筛选，不可全自动化；不能验证「用户是否愿意留下来玩」，只能验证「是否有人点进来」。

**停止条件：** 4 周内发布 5 条视频，单条播放量均未超过 1 万，且 GitHub referrer 无显著增长——则说明传播渠道假设不成立，转入路线 B。

---

### 路线 B：「先基础设施、后分发」——30 天内上线受限可玩托管版本（主推荐）

**核心逻辑：** 按顺序完成三件事再开任何新功能：① 安全三件套（约 2–4 小时）；② GitHub Actions CI（约 1 小时）；③ Dockerfile + 资产 CDN fallback + 内存限流，部署到 Railway/Fly.io（约 5–7 天）。配合 Umami/PostHog 埋点同步上线，不是事后补。上线后执行已备好的发布稿（即刻 + V2EX，PH/HN 内容物料已标 ✅，执行动作补完即可发布）。

**优点：** 解除所有其他迭代的前提封锁，是 Premium/B2B/社交裂变/真实留存指标的必要条件；一旦有真实用户流量，所有后续优化有数据支撑。

**缺点：** 资产预生成（消除冷启动）是技术难点，需提前把 23 个角色立绘上传 R2/CDN 并修改 archetypeAvatarGen.ts 检查逻辑（约 2–3 天工作量）；Demo 模式下 API 成本需要预算上限（按每局约 ¥0.6，每日 100 局约 ¥60，需配置 createRateLimiter 每 IP 每日 2–3 局）。

> **2026-10-10 修订（§0）：** owner 选定 BYOK，不提供模型 API——上面的「Demo 成本预算」不再适用；资产改为随仓库预置（服务器没有 key，不能在启动时生图），不需要 R2/CDN。

**放弃什么：** v6.161–194 的所有计划新功能（裁了么第四批场景、技能卡、摸鱼大作战、图灵盲盒、账号体系完整版等）在托管版本上线并有稳定日活之前全部冻结。

**停止条件：** 托管版本上线后 4 周内，独立访客未超过 50 人/天，且 Classic/裁了么任何一个模式的首局完成率低于 20%——则说明「打开就能玩」解决不了留存问题，需重新审视产品定位，优先考虑把裁了么拆出作为独立落地页。

---

### 路线 C：「聚焦裁了么」——放弃经典局，All in 劳动法知识付费（收缩转向）

**核心逻辑：** 裁了么是产品内决策密度最高、用户参与感最强、有明确社会需求支撑的模块（2025 年全国劳动人事争议 454.3 万件，据虎嗅整理人社部公报，中等可信）。放弃经典局等娱乐模式，把裁了么独立部署为「AI 黑心 HR 谈判训练」工具，走 SEO + 劳动法内容营销渠道，推月付 ¥29–39 单独定价。

**缺点：** 需要放弃 v6.160 大部分工作量；微信支付需企业主体，个人开发者须先解决支付合规问题；「游戏闯关」定位在《律师法》框架下的合规边界需法律顾问确认；定价须经过至少 5 人内测验证，不可凭假设直接定价。

**结论：** 这条路线方向正确但执行前置条件过重，适合作为「路线 B 上线后裁了么首关完成率持续领先经典局 3 倍以上」时的自然演进，而非当前直接跳入。

---

**推荐路线 B，同时并行执行路线 A 中的班味单口视频导出接入。**

理由：路线 A 和路线 B 的前 2 周工作可以并行——视频导出接入（6–10 小时）不依赖托管版本，可立即执行；同时推进 Dockerfile + 安全三件套。两条路的验证指标相互独立，4 周内可以同时得到「传播渠道是否有效」和「在线可玩是否提升留存」两个数据点。

---

## 5. 北极星指标与度量体系

### 北极星指标

**「7 天内完成过至少 2 局任意模式的真实用户数」**（Monthly Active Players，MAP）

选择理由：第 1 局可能是好奇打开，第 2 局才能证明用户有意回来。这个指标同时要求产品可访问（有在线版本）和有留存力（第一局体验足够好）。完成 2 局需要经历角色认知、模式理解、至少一次等待——是比 DAU 更严苛的留存信号。

**当前基线：** 约 0（无托管版本下无法统计真实 MAP）。

**阶段目标（假设：路线 B 在 2026-11-08 完成托管上线）：**
- 上线后 2 周：MAP ≥ 20（来自发布稿执行后的首波流量）
- 上线后 8 周：MAP ≥ 100（依赖内容营销或口碑裂变二次波）
- 2026-Q1：MAP ≥ 500，其中裁了么占比 ≥ 40%

以上目标为假设值，基准为零，实际数字需上线后 2 周重新校准。

---

### 埋点事件清单

上线埋点最小集（Umami 自部署或 PostHog，优先国内可访问方案）：

| 事件名 | 触发时机 | 关键属性 |
|--------|----------|----------|
| `page_view` | 路由切换时 | path, referrer |
| `game_start` | 选定模式点击开始 | mode（classic/immersive/fired/talkshow/squad）, locale |
| `game_first_llm_response` | 用户看到第一条 AI 发言 | mode, time_to_first_token_ms |
| `game_complete` | 一局结束 | mode, rounds, winner_type, duration_ms |
| `fired_chapter_complete` | 裁了么一关结束 | chapter_num, score, outcome（win/lose） |
| `share_card_generated` | 用户点击分享/下载 | card_type, mode |
| `video_export_clicked` | 点击视频导出按钮 | mode（talkshow/classic/squad） |
| `premium_cta_clicked` | 点击 Premium 升级按钮 | plan |
| `llm_call_failed` | ok:false 时 | route, model, duration_ms, error_type |

服务端埋点（写入 /api/health 每 10 分钟聚合）：
- LLM 调用成功率（ok:true / ok:false 比例）
- TTS 调用次数/小时（成本护栏）
- JSON Store 写入冲突计数（replayStore / billingStore）

---

### 漏斗

```
Landing 页访问
    ↓ 点击任意模式 CTA（目标转化率：≥ 40%）
选模式 / 配置页
    ↓ 点击「开始一局」（目标：≥ 70%）
游戏加载（目标：≤ 10 秒，含资产 CDN fallback）
    ↓ 看到第一条 AI 发言（目标首字延迟：< 3 秒，流式后）
游戏进行中
    ↓ 完成第一局（目标首局完成率：Classic ≥ 25%，裁了么第一关 ≥ 45%）
    ↓ 7 天内开始第二局（MAP 定义）
```

裁了么专项漏斗：
```
裁了么入口点击
    ↓ 第 1 关开始（目标：≥ 80%）
    ↓ 第 1 关完成（目标：≥ 45%）
    ↓ 第 2 关开始（留存漏斗，目标：≥ 50%）
    ↓ 第 5 关完成（通关，目标：≥ 15%）
```

---

### 关键不埋点即无法回答的问题（上线优先级依据）

1. 哪个模式在第一局被最多用户完成——无此数据则无法决定导航排序
2. 裁了么哪一关流失率最高——无此数据则场景设计无方向
3. 视频导出按钮实际被点了多少次——无此数据则视频营销价值无法验证
4. LLM 调用失败率高峰在哪个路由——无此数据则流式改造优先顺序无依据

**以上四个问题在托管版本上线后 2 周内必须能回答，否则所有后续迭代决策仍然是在蒙眼开车。**

## 6. 升级后的开发计划

### 总原则

依赖顺序不可倒置：没有 CI 不做托管部署；没有托管版本不定增长目标；没有埋点不做功能优先级判断；公网上线前先修安全与合规标识。收款与 B2B 按 owner 决策冻结（§0），解冻前不排版本。版本节奏：每周 1–2 个版本，每个版本必须对应可量化验收标准。

---

### 阶段 0：止血与可度量（v6.161–164）

**目标：** 修复三个公网部署的硬性阻断，建立最小可观测基础设施，达到合规底线。此阶段不新增用户功能。

**进入下一阶段的门槛：** CI 全绿；安全三件套测试通过；埋点事件可上报；AI 生成内容标识 checklist 全部通过。

> 推送推迟到大版本完成（§0），所以 CI 第一次在 GitHub 上真跑是在大版本的 PR 上；在那之前，每个版本都在本机用与 CI 相同的命令跑一遍。

---

#### v6.161 — GitHub Actions CI

**目标：** 每次 push / PR 自动跑类型检查、全量测试和前端构建，阻止静默回归。

**具体改动：**
- 新建 `.github/workflows/ci.yml`：`push` 到 main + `pull_request` 触发；Node 22 + npm 缓存；`npm ci` → `npm run typecheck` → `npm test` → `npm run build`（仓库用 npm workspaces + package-lock.json，不是 pnpm）
- `README.md` / `README.en.md` 顶部加 CI 徽章

**验收标准：** 在干净 checkout 里按 CI 的命令顺序本机跑通；PR 上的首个 run 绿灯。

**依赖：** 无。**工作量：** S

---

#### v6.162 — 安全三件套

**目标：** 修复 CORS 全开、记忆删除接口无鉴权、TTS 无限流，解除公网部署的硬性阻断。

**具体改动：**
- `packages/server/src/index.ts`：HTTP 与 Socket.IO 的 CORS 都改成白名单（`ALLOWED_ORIGINS`，逗号分隔；未设置时只放行本机开发端口）；同源请求不受影响
- `packages/server/src/routes/memory.ts`：用户只能删自己的记忆（以请求头 `X-User-Id` 为准，不再信任请求体里的 `targetUserId`）；全局 / 按角色 / 按局的批量删除需要 `X-Admin-Token` 等于 `MEMORY_ADMIN_TOKEN`，未配置 token 时批量删除一律 403
- `packages/server/src/routes/tts.ts`：接入已有的 `createRateLimiter`，按 IP 限流；额度按「一整局经典局的发言条数」定，保证正常玩一局不会撞墙（旧计划写的每小时 20 次会让一局都玩不完，作废），环境变量可调
- `.env.example` 补 `ALLOWED_ORIGINS`、`MEMORY_ADMIN_TOKEN`、TTS 限流参数

**验收标准：** ①无 token 批量删除返回 403，自助删除只影响自己；②同 IP 超出 TTS 额度返回 429，正常一局不触发；③非白名单 origin 的 HTTP 请求与 Socket.IO 握手都被拒绝。

**依赖：** v6.161。**工作量：** S

---

#### v6.163 — 最小埋点（Umami，可选启用）

**目标：** 上线后能回答：哪个模式最受欢迎、配 key 的转化率、首局完成率、LLM 失败率。

**具体改动：**
- 新建 `packages/client/src/utils/analytics.ts`（`trackEvent`；未启用时 no-op，不加载任何第三方脚本）
- Umami 地址与站点 id 从服务器运行时配置读取（`UMAMI_SCRIPT_URL` / `UMAMI_WEBSITE_ID`），同一个 Docker 镜像换环境变量即可开关，不用重新构建前端
- 埋第 5 节的核心事件，外加 BYOK 漏斗：`byok_open` / `byok_saved` / `byok_test`（成功或失败的原因类别，绝不带 key）/ `sample_replay_view`
- `packages/server/src/utils/llm.ts` 的 `ok:false` 路径输出结构化日志（kind、model、耗时、原因类别），不含 key 和提示词正文

**验收标准：** 未配置 Umami 时页面不发出任何第三方请求；配置后本地能看到事件上报；注入一次模型失败，日志里有结构化字段且无 key。

**依赖：** v6.162。**工作量：** S

---

#### v6.164 — AI 生成内容标识（合规必修）

**目标：** 满足《人工智能生成合成内容标识办法》（2025-09-01 施行）的显式标识义务。

**具体改动：**
- 新建共用组件 `AiGeneratedBadge`：AI 发言气泡、TTS 播放处、AI 生成的头像/立绘旁显示「AI 生成」小角标（不遮挡游戏区域）
- 全站页脚加通用声明组件（内容由 AI 生成、仅供娱乐）
- `FiredChat.tsx`：每关知识卡与 AI 消息下方加免责声明：「AI 对话仅供演练，不构成法律意见」
- `packages/server/src/routes/fired.ts`：HR 与律师顾问的系统提示词加护栏——可以引用法条，不替用户做具体行动决定（例如「立即申请仲裁」）
- 视频导出的文件本身带标识（见 v6.169）

**验收标准：** 合规 checklist（AI 音频有标识 / AI 图像有标识 / 每页有通用声明 / 裁了么有法律免责 / 导出文件带标识）全部通过；有测试锁住提示词护栏文本存在。

**依赖：** v6.161。**工作量：** S

---

### 阶段 1：托管可玩（v6.165–169）

**目标（按 owner 决策 2 改写）：** 任意访客打开网页——不配 key，30 秒内能看到一局完整的 AI 对局（示例回放），也能玩不调模型的玩法；配好自己的模型 key 后，90 秒内看到 AI 第一句发言。**服务器不持有任何模型 key。**

**进入下一阶段的门槛：** 托管版稳定运行 72 小时；独立访客 ≥ 50 人/天；点击模式入口的访客中 key 配置完成率 ≥ 10%（低于此即触发 §0 的停止条件）；配了 key 的用户首局完成率 ≥ 20%。

---

#### v6.165 — 资产随仓库预置，托管模式不在启动时生成

**目标：** 冷启动从 5–10 分钟降到 30 秒内；托管服务器没有 key，也就不能在启动时生成图。

**具体改动：**
- 一次性脚本把本机已生成的角色立绘、图标、HR 立绘压缩到展示尺寸（原图标单张 5–6MB、全量约 310MB），作为资产包提交进仓库
- 新建 `packages/server/src/utils/deployProfile.ts`：`DEPLOY_PROFILE=hosted` 时禁止一切启动期 / 懒加载生图（`archetypeAvatarGen` / `iconGen` / 各类 portrait 生成），缺图走前端已有的 emoji 兜底
- `.env.example` 加 `DEPLOY_PROFILE`

**验收标准：** 清空 data/ 后冷启动到 `/api/health` < 30 秒；Landing 与经典局的图片零 404；资产包 < 15MB；有测试锁住「hosted 下不调用生图」。

**依赖：** v6.162。**工作量：** M

---

#### v6.166 — 单端口生产模式 + Dockerfile + 部署文档

**目标：** 一条 `docker run` 就能起一个可公开访问的实例。

**具体改动：**
- 服务器在生产模式下用同一个端口同时提供前端静态文件、HTTP API 与 Socket.IO（现在 Socket.IO 单独监听 3101，前端生产构建把地址写死成 `localhost:3101`，托管后必连不上）
- `packages/client/src/hooks/useSocket.ts`：生产环境连同源，开发环境维持 vite 代理
- 新建 `Dockerfile`（多阶段构建）、`.dockerignore`、`docs/DEPLOY.md`（Railway / Fly.io / 自有 VPS + Caddy 三种写法，数据卷、健康检查、环境变量清单）
- 境外平台优先：不注册企业主体（决策 4）就做不了 ICP 备案，国内云的公网站点上不了线

**验收标准：** 本机 `docker build` + `docker run` 冷启动 < 30 秒；浏览器从容器端口打开 Landing → 配 key → 开一局经典局，全程无 CORS / WebSocket 错误。**公网部署要用 owner 自己的平台账号执行**（代码侧负责把它变成复制几条命令的事）。

**依赖：** v6.165。**工作量：** M

---

#### v6.167 — BYOK：用户自带模型 key（取代原「Demo 限流」）

**目标：** 托管版的全部模型调用都用访客自己的 key；服务器只做转发，不持有、不落盘、不记录。

**具体改动（服务端）：**
- 新建 `packages/server/src/utils/aiClient.ts`：所有模型调用（15 处 `createOpenAI`、5 处生图、TTS、记忆向量、MiniMax 兜底）统一从这里取客户端——提前做了 v6.172 的「客户端单例」部分
- 凭据按请求 / 按对局走 `AsyncLocalStorage`：HTTP 请求从 `X-LLM-*` 请求头取；Socket.IO 对局在建局时随消息带上，只存在该局的内存里，对局销毁即丢
- `LLM_KEY_MODE=server|byok`：本地自部署默认 `server`（行为不变，读 `.env`）；`DEPLOY_PROFILE=hosted` 默认 `byok`，且**即使环境变量里有 key 也不用**
- 模型商白名单预设（DeepSeek / 硅基流动 / Moonshot / 智谱 / 通义千问兼容模式 / 火山方舟 / OpenRouter / OpenAI）；自定义 baseURL 托管下默认关闭，打开时只允许 https，并拒绝内网、回环和云元数据地址（防 SSRF）
- 没配 key 时调用模型的接口返回明确的 `need_key`，不再静默走兜底台词；key 被上游拒绝时返回 `key_rejected`
- 新增 `POST /api/llm/check`（用访客的 key 发一次极小请求，只回报成功或失败的原因类别）
- 日志脱敏：请求头、错误信息里的 key 一律打码
- 全局共享的生成内容（每日剧情等）在 byok 模式下不拿某个访客的 key 给所有人生成

**具体改动（前端）：**
- 模型设置面板（`/settings` + 首次进入需要模型的模式时弹出）：选模型商 → 粘贴 key → 选模型 → 测试连接；每家附申请地址与每局成本估算
- key 默认只存在本标签页（sessionStorage），勾选「在本机记住」才写 localStorage；只随请求发给本站服务器
- `/api/*` 请求统一附带凭据头；Socket 建局消息附带凭据
- 语音：配了支持 TTS 的 key 就用它，否则用浏览器自带朗读

**验收标准：** ①hosted 下环境变量里放 key 也不会被调用（测试锁住）；②没配 key 调模型接口得到 `need_key`；③key 不出现在任何日志、错误响应、落盘文件里（测试扫描）；④自定义 baseURL 指向内网 / 元数据地址被拒；⑤用一家预设模型商的 key 完整跑完一局经典局和一关裁了么。

**依赖：** v6.162、v6.166。**工作量：** L

---

#### v6.168 — 不配 key 也有东西玩 + 托管模式功能收口

**目标：** 把 BYOK 门槛对漏斗的伤害降到最低；托管版只暴露能负责任上公网的功能。

**具体改动：**
- 示例对局：从本机真实对局里挑几局质量好的，脱敏后随仓库发布，`/result/sample-*` 直接回放，不调用模型
- Landing：未配 key 时主 CTA 给「看一局示例对局」与「配置模型开玩」两条路；盘点不调模型的玩法，托管下直接可玩
- 托管模式隐藏 Premium 假结账（决策 3）、B2B（决策 5）、Wrapped 邮箱订阅（没有隐私政策前不收集邮箱）；对应接口返回 404
- `replayStore` 加写队列（与 `relationStore` 同款 `writeChain`），修并发写互相覆盖

**验收标准：** 未配 key 的浏览器从 Landing 两次点击内进入示例对局；托管模式下 `/premium`、`/b2b` 没有任何入口，接口返回 404；并发写回放测试无丢失。

**依赖：** v6.167。**工作量：** M

---

#### v6.169 — 线 B：班味单口视频导出 + 裁了么置顶；大版本收口

**目标：** 打通最适合短视频传播的内容导出；把参与感最强的入口置顶；完成大版本的对外同步。

**具体改动：**
- `packages/client/src/routes/Talkshow.tsx`：接入已有的 `ShareVideoButton`（经典局里已完整实现），段子播放完后显示；视频画面全程带「AI 生成」水印并加片尾标识；Safari 不支持 `MediaRecorder` 时降级为静态图 + 音频
- `packages/client/src/routes/Landing.tsx`：裁了么移到第一张模式卡；Hero 区加「5 分钟速通」快捷入口（`/fired/chat?autostart=true`）
- `packages/client/src/routes/FiredChat.tsx`：支持 `autostart=true`，跳过难度选择直接进第一关
- 大版本收口：全量测试、截图重采、README / CHANGELOG、ModelScope 同步、tag `v6.169`、推送并开 PR 合进 main

**验收标准：** ①Landing 首屏第一张模式卡是裁了么；②快捷入口 1 分钟内进入第一关（手机宽度下也成立）；③班味单口播放完出现「导出视频」，30 秒内下载成功，视频带 AI 标识；④Safari 降级方案生效；⑤owner 部署后在托管地址上复验①–③。

**依赖：** v6.164（标识规范）。线 B 不等托管上线，与阶段 0 交错提交。**工作量：** M

---

#### 上线后运营动作（owner 执行，不占版本号）

原 v6.168「执行已备发布稿」改为托管上线后的运营动作：填写 `docs/PRODUCTHUNT_LAUNCH_KIT.md` / `LAUNCH_SUBMISSION_PACK.md` 里的在线地址与发布日期，在即刻、V2EX「分享创造」发帖，4 小时内回复；发布稿要写明「需要自备模型 key，不配也能看示例对局」，避免预期落差。验收：7 天内 GitHub Star 增量 ≥ 20；Umami 有非 github.com 来源的访客。

---

### 阶段 2：AI 演员升级（v6.170–175）

**目标：** 将「工具等待感」改造为「对话临场感」；消除手写 JSON 解析的隐蔽质量退化；修复非中文跨局记忆空白。

**进入下一阶段的门槛：** MAP（7 天内完成 2 局）≥ 100；班味单口视频至少 1 条抖音/小红书播放量 ≥ 5000；Classic 首局完成率 ≥ 30%。

---

#### v6.170 — Classic 流式 LLM 推送

**目标：** 用户看到第一个 AI 字符从 ≥ 5 秒降至 < 2 秒。

**具体改动：**
- `packages/server/src/utils/llm.ts`：新增 `streamLLMWithTimeout`（基于 Vercel ai SDK `streamText`）
- `packages/server/src/agents/BaseAgent.ts`：`generateSpeech` 新增 `streaming` 模式，每 5–10 token 批量 emit `speech:delta`
- `packages/server/src/engine/GameEngine.ts:1260`：wave 内 `Promise.allSettled` 改为各 agent 独立 stream，先完成的先推送
- `packages/client/src/routes/Classic.tsx`：SPEECHES 区订阅 `speech:delta`，逐字 append
- TTS 保持原逻辑（等完整文本后触发）

**验收标准：** Classic 模式从「开始一轮」到 SPEECHES 区出现第一个字符 < 2 秒；TTS 播放不受影响；858 个测试全绿。

**度量指标：** `game_first_llm_response` 事件 `time_to_first_token_ms` P50 < 2000ms。

**依赖：** v6.161（CI 保护此高风险改动）；v6.163（埋点量化改善效果）。**工作量：** M（3–5 天）

---

#### v6.171 — 裁了么 HR 对话流式化

**目标：** 裁了么 HR 回复从「等 13 秒突然出现」变为「实时打字机」。

**具体改动：**
- `packages/server/src/routes/fired.ts:396`：HR 发言改为 `streamText`，通过 Hono `c.stream()` 返回 SSE
- `packages/client/src/routes/FiredChat.tsx`：`fetch + ReadableStream` 消费 SSE，逐字 append 到消息气泡
- SCORING 调用（`fired.ts:451`）保持 `generateText`（需完整文本才能评分）；若 Qingyun 代理不支持 SSE，回退到 `generateText` 并 log warning

**验收标准：** 裁了么输入后 < 1.5 秒出现第一个字；评分在流式内容完整后正常出现。

**度量指标：** 裁了么对话轮次完成率；`time_to_first_token_ms` P50 < 1500ms。

**依赖：** v6.170（Classic 流式稳定后再扩展）。**工作量：** M（2–3 天）

---

#### v6.172 — generateObject 替换手写 JSON 解析 + LLM 客户端单例

**目标：** 消除 squadDirector fallbackStory 和 HR scoring 解析失败静默降级。（「15 处 `createOpenAI` 收拢为统一入口」已在 v6.167 BYOK 中完成，本版直接在 `aiClient.ts` 上加结构化输出。）

**具体改动：**
- ~~新建 `aiClient.ts` 统一入口~~（已在 v6.167 完成；本版在其上按模型商能力开关结构化输出）
- `packages/server/src/routes/fired.ts:451–498`：scoring 改 `generateObject` + zod schema
- `packages/server/src/services/squadDirector.ts:152–183`：`parseDirectorJson` 替换为 `generateObject` + 5 幕 zod schema
- `packages/server/src/agents/BaseAgent.ts`：`generateVote` 改 `generateObject({ schema: z.enum([...]) })`
- 删除 `cleanJSON`、`parseDirectorJson` 等 helper（约 100 行）

**验收标准：** 三处手写 parse 函数删除；vitest 新增格式错误测试验证抛出 Error 而非静默降级；858 个测试全绿；**用 owner 自己的 key、对 BYOK 预设里的模型商各跑一次三个调用点的 smoke，确认返回的是结构化对象（不是被代理降级成的 JSON 字符串）——不支持的代理路径保留手写 parse 作降级，并在 `aiClient.ts` 里按代理能力开关**。

**依赖：** v6.161（CI）。**工作量：** S（1–2 天）

---

#### v6.173 — 非中文跨局记忆修复 + 参与按钮 i18n

**目标：** en/ja/ko 玩家跨局连续性从零变为可用；消除 en locale 下参与按钮仍显示中文的硬编码问题。

**具体改动：**
- `packages/server/src/services/memoryWrite.ts`：写入记忆时附加 `locale` 字段
- `packages/server/src/services/memoryRecall.ts`：查询加 `AND locale = $locale`（NULL 旧数据降级为 zh）
- `packages/server/src/agents/BaseAgent.ts:836–876`：删除 zh locale gate，改为 locale 匹配过滤；关系网注入（`:868`）移除语言限制
- **检查 `Classic.tsx`、`FiredChat.tsx` 内硬编码中文参与按钮标签（上桌/占座/投票等），补入 i18n key 或用 `t()` 调用替换**

**验收标准：** en locale 跑 2 局后，第 3 局日志可见 `memoryBlock` 非空；zh locale 现有行为不变；新增 vitest 验证；**en locale 下参与按钮显示英文标签（上桌→Join、投票→Vote 等）**。

**依赖：** v6.161（CI）。**工作量：** S（1–2 天）

---

#### v6.174 — 分享卡统一抽象

**目标：** 新功能接入分享卡从复制 100 行文件降为注册一个 renderer 函数（约 20 行）。

**具体改动：**
- 新建 `packages/client/src/utils/shareCard/canvas.ts`（drawBackground、drawText、drawAvatar、addWatermark 公共函数）
- 新建 `packages/client/src/utils/shareCard/renderers/` 目录，11 个原始文件重构为 renderer 函数
- `shareCard/index.ts` 统一导出；原文件改为 re-export（保持调用方不变），逐步迁移
- 每个 renderer 补充 vitest 快照测试

**验收标准：** 11 个分享卡功能行为不变（快照测试全绿）；新增一个分享卡 renderer 仅需约 20 行。

**依赖：** v6.161（CI）。**工作量：** M（2–3 天）

---

#### v6.175 — Prompt Caching（降 LLM 成本）

**目标：** Squad Director 和 HR 对话 input token 成本降低 ≥ 40%。

**具体改动：**
- `packages/server/src/utils/llm.ts`：`callLLMWithTimeout` 加 `cacheSystemPrompt?: boolean` 参数，true 时给 Anthropic `providerOptions` 加 `cache_control: { type: 'ephemeral' }`
- `packages/server/src/services/squadDirector.ts:131`：system prompt 加 `cache_control`（每局一次约 1800 token，最高价值）
- `packages/server/src/routes/fired.ts`：HR 多轮对话改为 Messages array，不每轮重发完整字符串
- **模型分层路由（见 7.1）**：`getAIClient(tier)` 增加 `small / mid / high` 三档配置（环境变量可覆盖）；VOTE 与 SCORING 改走 `small` 档，SPEECH 维持当前档位，DIRECTOR / HR_REPLY 维持高档——升降档以 v6.178 eval 基准为准

**验收标准：** Anthropic dashboard 显示 squadDirector 缓存命中率 ≥ 80%（同局内）；7 天内日 input token 成本下降 ≥ 40%；**所有 `cache_control` 修改均通过 v6.172 建立的 `getAIClient` 统一入口生效，而非逐处修改**；分层路由表在 `aiClient.ts` 中有单测锁定（VOTE / SCORING → small）。

**依赖：** v6.166（需有托管版本和真实流量才有可观测的成本数据）；**v6.172（`getAIClient` 单例是集中配置 cache_control 的前提）**。**工作量：** S（4 小时）

---

### 阶段 3：质量基准与技术债（v6.176–182）

**按 owner 决策改写（§0）：** 收款暂不开发，原「账号体系 + Stripe live + 付费墙」两个版本冻结，本阶段只保留与收款无关的质量与工程工作。

**目标：** 建立 LLM 质量基准线；启动 GameEngine 技术债清偿。

**进入下一阶段的门槛：** MAP ≥ 200；7 天留存率 ≥ 20%；eval 基线已入库，后续提示词改动都能和它比。

---

#### v6.176 — 账号体系（暂缓）

原计划的 Email Magic Link 账号体系，主要驱动力是「跨设备保持 Premium 权益」。收款冻结后这个刚需消失，跨设备同步记忆与成就的价值留待数据证明。**解冻条件：** 埋点显示多设备回访用户占比 > 15%，或 owner 决定恢复收款。原版本里的 `replayStore` 写队列修复已提前到 v6.168。

#### v6.177 — 收款与付费墙（冻结）

原计划的 Stripe live、裁了么付费墙、Premium 页改造全部冻结（决策 3：暂不开发收款）。托管版隐藏 Premium 假结账入口已在 v6.168 完成。**解冻条件：** owner 重新决定开发收款；届时先补账号体系（v6.176），再接支付渠道（个人开发者可用的渠道，或注册企业主体后接微信支付）。

---

#### v6.178 — LLM Eval 框架

**目标：** 建立质量基准线，使模型选型和 prompt 改动有可测量依据。

**具体改动：**
- 新建 `packages/server/src/scripts/speechEval.ts`：读取 100 个历史发言样本，调用 judge prompt（gpt-4o-mini）按角色一致性、职场感、搞笑度、重复度打分（1–5 分）；结果写入 `packages/server/src/evals/baselines/`
- CI 新增非阻塞 `npm run eval:check`（仅打印分数，不红灯）

**验收标准：** eval 完整跑出 baseline JSON，含各维度均值；commit 到 evals/baselines/；下次 prompt 改动后跑 eval 能与 baseline 比较 delta。

**依赖：** v6.166（托管版本）。**工作量：** M（1–2 天）

---

#### v6.179–182 — GameEngine 分阶段拆解

**目标：** 将 2912 行上帝文件拆解，每步后测试全绿，降低 AI agent 辅助开发上下文截断风险。

**具体改动（每版本一步）：**
- v6.179：提取 `VotingEngine.ts`（最独立，纯函数为主）
- v6.180：提取 `SpeechOrchestrator.ts`（与流式推送 v6.170 验证整合）
- v6.181：提取 `GameEventBus.ts`（统一所有 `socket.emit` 调用）
- v6.182：`GameEngine.ts` 成为薄组合层（目标 < 600 行）

**验收标准：** 每步后 858 个测试全绿；Socket.IO 事件接口保持不变；v6.182 后 `GameEngine.ts` < 600 行。

**依赖：** v6.161（CI 必须先建，高风险重构无 CI 不做）。**工作量：** L（每版本 S，共 4 个版本，约 4–8 天合计）

---

### 阶段 4：规模化与扩展（v6.183+）

**目标：** 在阶段 3 门槛（MAP ≥ 200 + 7 天留存 ≥ 20%）达成后，基于真实数据决定下一步方向。此阶段不预设具体版本号，按数据驱动排序。

**可评估方向（需满足各自前置条件）：**
- JSON Store 全面迁移 SQLite（前提：阶段 3 完成）
- 国际化英文首发 HN（前提：v6.173 记忆修复完成 + 英文体验验证）
- 新玩法扩展（技能卡、摸鱼大作战等；前提：MAP ≥ 500 且留存 ≥ 25%）
- B2B 白标（冻结；前提：owner 解冻收款 + 真实账号 + 至少 1 个企业意向客户确认）
- 微信小程序（冻结；前提：owner 决定注册企业主体 + 微信支付合规完成）
- SEO（前提：内容和口碑基础已有，与班味短视频营销同步推进）

---

### 旧计划逐项去向表

| 旧计划条目 | 新版本号 / 去向 | 理由 |
|-----------|--------------|------|
| v6.161–165 Phase C 收尾（五感体验完善、双公司模式 UI、B 端白标 UI） | 双公司模式 UI 改动推迟阶段 4；B 端白标移至「阶段 3 门槛后评估」；五感体验待流式架构（v6.170）完成后再优化 | 无账号体系的 B2B 是死重；五感体验优先级低于止血 |
| v6.166–168 安全与工程技术债 | 吸收为阶段 0（v6.161–164） | 与安全三件套完全重合，提前执行 |
| v6.169–173 Phase G 国际化收尾（EN/JA/KO 完整 locale 体验） | 部分吸收：v6.173 修复非中文跨局记忆（必修）+ Classic/FiredChat 参与按钮硬编码中文修复；Classic 英文按钮硬编码修复并入 v6.173；全面国际化推至阶段 4 后按数据决定 | HN 首发需要英文记忆可用，但完整国际化在零托管版本阶段 ROI 不足 |
| v6.174–179 裁了么第四批场景（10 个新职场场景） | 推迟至阶段 1 门槛（托管版本 + 首局完成率 ≥ 20%）达成后 | 无托管版本则新场景对零用户无意义；需先验证现有 30 个场景通关数据，找出流失关再针对性扩充 |
| v6.180–186 裁了么深化（证据系统、反转事件、逐句复盘、案例百科） | 推迟至阶段 3 门槛（MAP ≥ 200 + 7 天留存 ≥ 20%）达成后 | 深化功能是留存配套，需先有通关数据才知道要深化哪个方向 |
| v6.187–194 新玩法（技能卡、摸鱼大作战、图灵盲盒、AI 复盘教练） | 推迟至阶段 4（MAP ≥ 500 + 留存 ≥ 25%）后按数据决定优先级 | 单人团队在零用户阶段扩充玩法是资源错配；现有 5 种玩法已无人能体验 |
| v6.195+ 账号体系与商业化 | 冻结（owner 2026-10-10：暂不开发收款）；原占位 v6.176–177 保留解冻条件 | 无收款则账号体系失去刚需；解冻时先账号、后支付 |
| 远期：微信小程序 | 冻结（owner 2026-10-10：暂不注册企业主体） | 个人开发者无法申请微信支付；企业主体是前提 |
| 远期：SEO | 推迟至阶段 2 门槛后，与班味单口视频内容营销同步推进 | 零内容基础的纯技术 SEO 无 ROI；内容先行，SEO 跟进 |
| 远期：B 端 SaaS / 白标 | 推迟至阶段 4，前提：至少 1 个企业意向客户确认 + 真实付费 + admin 后台；当前代码无鉴权（`b2b.ts:9` 注释明写）、无计费、零企业客户 | 早投入是沉没成本，等 C 端 PMF 验证后再谈 B2B |
| 远期：v2.0 Universe（多世界观、UGC 玩家创建世界） | 砍掉：暂不进路线图 | 核心产品 PMF 未验证前做 UGC 平台是战略跑偏；等 MAP ≥ 1000 后重新评估是否有此方向的用户需求信号 |

## 7. 大模型与 Agent 升级专章

### 7.1 模型分层路由

当前代码的模型选型是三个硬编码默认值：`BaseAgent.ts:32` 的 `gpt-4o-mini`、`fired.ts:141` 和 `squadDirector.ts:128` 的 `claude-opus-4-7`。没有按调用类型区分质量需求，没有成本核算依据，模型选择靠感觉而非数据。

按调用类型的实际需求差异，建议建立以下路由层（在 **v6.175** 与 Prompt Caching 同步落地，**v6.178** eval 跑出基准后校验分层是否合理）：

| 调用类型 | 代码位置 | 质量需求 | 推荐层级 | 理由 |
|---|---|---|---|---|
| VOTE（投票） | `BaseAgent.generateVote` | 低：枚举输出，几乎不需创意 | 小档（代码里已接的 gpt-5.4-mini / gpt-4o-mini 这一档） | 每局 9 次，单次延迟要求 <2s，错一票影响极小 |
| SPEECH（普通发言） | `BaseAgent.generateSpeech` | 中：角色一致性，职场幽默 | 小到中档（维持当前 gpt-4o-mini，v6.178 eval 后再定） | 每局 70+ 次，是最大成本来源；v6.178 eval 结果决定是否需要升档 |
| DIRECTOR（编剧） | `squadDirector.ts` | 高：5 幕结构化故事，创意密度高 | 中高档（代码里已接的 claude-sonnet-4-7 这一档） | 每局仅 1 次，1800 token system prompt 可缓存，成本可控 |
| HR_REPLY（裁了么对话） | `fired.ts` | 高：对抗性、法律准确、流式感 | 中高档（当前 claude-opus-4-7；eval 后评估能否降到 sonnet 档） | 每关 5–15 轮，用户主动参与，质量直接影响付费留存 |
| SCORING（裁了么评分） | `fired.ts:451` | 中：数字精度，结构化输出 | 小模型 + generateObject | 后台调用，用 zod schema 消除解析风险后质量可靠 |

**在 v6.178 eval 基准建立之前，禁止将 SPEECH 调用升级到 claude-opus-4-7 / gpt-5.5 这一档。** 每局 70+ 次 SPEECH 是绝对成本主体，无数据支持的升档是直接烧钱。

---

### 7.2 流式输出与「边生成边播」

**v6.170**（Classic）和 **v6.171**（裁了么）已规划文本流式推送，将首字延迟从 5–15s 压到 <2s。但「边生成边播」涉及比文本流更复杂的 TTS 联动，Section 6 未展开。

**当前 TTS 流程：** LLM 完整文本 → MiniMax TTS（整段） → 音频播放。问题在于班味单口：一段 200 字的段子，要等全部生成、全部合成才能开播，「喜剧演员现场演出」的临场感完全消失。

**句边界流式 TTS 方案：**
1. LLM stream 逐字推送到服务端缓冲区
2. 检测到句边界（`。！？……`）后立即截断，把这一句发给 MiniMax TTS
3. TTS 音频片段加入播放队列；下一句 TTS 请求与当前播放并发进行
4. 客户端实现 AudioWorklet 队列播放，消除句间停顿

此方案的延迟收益：用户听到第一句话从「等全段完成（约 8–12s）」降至「等第一句完成（约 2–3s）」。TTS API 并发数需控制（每局不超过 2 路并发，避免 MiniMax 限速）。

**版本映射：** 句边界流式 TTS 是班味单口临场感的核心改造，工作量约 M（3–5 天），依赖 v6.170/v6.171 流式文本架构稳定，建议在阶段 4（**v6.183+**，即阶段 3 门槛「MAP ≥ 200 + 7 天留存 ≥ 20%」达成后）排入计划，不列为当前必修项。

---

### 7.3 实时语音的引入时机与降级方案

实时语音（全双工音频对话，如 gpt-realtime-2）能使裁了么「打字 → AI 回复」变为「开口说话 → AI 立刻回应」，是体验代际升级。但当前引入时机不对。

**前置条件（全部满足才进入评估）：**
- BYOK 下实时语音的费用由用户自己的 key 承担，产品侧不再需要配额与计费；前提变为：用户填的模型商支持实时语音接口，且 v6.167 的凭据转发能覆盖 WebSocket 类连接
- v6.178 eval 基准已建立：有据可查实时语音能否改善留存
- MAP ≥ 200 且至少 5 名用户明确反馈「想用语音」

**为什么不现在做：** 人工复核确认 gpt-realtime-2 已在 Azure 目录（2026-05-07），但「~300ms」延迟数字出自第三方目录且指初代模型，音频成本数字来自第三方博客未核实——在成本未确定、用户规模为零的阶段引入实时语音是把最贵的武器对着空房间开枪。

**降级方案（三级）：**
- L0（当前）：非流式 TTS，整段合成后播放
- L1（v6.170/171 后）：文本流式 + 整段 TTS，用打字机效果填充等待感
- L2（v6.183+ 后）：句边界流式 TTS，真实临场感
- L3（阶段 4 评估）：实时语音，仅对填了支持实时语音的 key 的用户开放

L2 覆盖 80% 的体验差距，且成本可控；L3 是锦上添花，不是雪中送炭。

---

### 7.4 结构化输出替换手写 JSON 解析

对应 **v6.172**，三个改造点与风险：

1. **fired.ts:451–498 scoring**：失败时静默降级，用户拿到随机分数。改用 `generateObject` + zod schema（`score: z.number().min(0).max(100)`, `breakdown: z.object(...)`, `compensationMonths: z.number()`）；失败抛异常，通过 v6.163 的结构化 `logger.warn` 记录（计划里没有引入 Sentry）。

2. **squadDirector.ts:152–183 parseDirectorJson**：5 幕结构嵌套，当前多层 try/catch 兜底 `fallbackStory`。改用 `generateObject` + 完整 zod schema；注意 schema 层级不超过 3 层，避免部分模型在 tool_use 上的 nested object 支持问题。

3. **BaseAgent.generateVote**：靠正则从自由文本提取投票，任何新角色名含特殊字符即失效。改用 `generateObject({ schema: z.enum([...playerIds]) })`，10 行替换当前 35 行正则逻辑。

**兼容性风险**：`generateObject` 内部使用 tool_use / structured_outputs；代码中 `OPENAI_BASE_URL` 指向 Qingyun 代理（`src/utils/llm.ts` 中可见），部分代理转发不传递 `tools` 字段。**在 v6.172 上线前，必须在本地用真实 Qingyun 代理验证 `generateObject` 调用是否返回结构化数据，而非普通 JSON 字符串兜底。** 若代理不支持，对该代理路径保留手写 parse 作为降级，不强制切换。

---

### 7.5 提示缓存

对应 **v6.175**，三个缓存切入点（按收益从高到低）：

**① Squad Director system prompt**（最高价值）：`squadDirector.ts:131` 的 `SQUAD_DIRECTOR_SYSTEM_PROMPT` 约 1800 token，每局一次，内容完全固定。给该消息片段加 `cache_control: { type: 'ephemeral' }`，同局内的后续生成均命中缓存。

**② HR 多轮对话**（裁了么）：当前 `fired.ts` 每轮把历史对话拼接成完整字符串重发。改为 Anthropic Messages array + 对历史前缀加 `cache_control`，每轮只发新消息，历史消息命中缓存。

**适用范围提醒：** `cache_control` 是 Anthropic 的写法，只对走 Claude 的调用（Squad Director、裁了么 HR）有效；BaseAgent 发言默认走 gpt-4o-mini（经 Qingyun 的 OpenAI 兼容代理），OpenAI 官方对足够长的前缀做自动缓存，但经第三方代理是否生效需上线后看账单实测，不能直接套用下面的估算。

**③ BaseAgent buildSystemPrompt**：每个 agent 的 system prompt 600–1000 token，同局内固定。可在 `GameEngine` 初始化 wave 时为每个 agent 预热一次 `cache_control`，当局所有发言均命中。

**成本估算（假设，需上线后 Anthropic dashboard 核实）：** 假设 claude-sonnet 输入价格 $3/M、缓存写入 $3.75/M、缓存读取 $0.30/M（均为假设值，非已核实数字）。Classic 局 72 次 SPEECH 调用，每次 800 token system prompt：无缓存 input 成本约为有缓存时的 10 倍。**目标：v6.175 上线后 7 天，Anthropic dashboard 中 Squad Director 调用缓存命中率 ≥ 80%，当周 input token 账单较基准下降 ≥ 40%。**

**注意**：Anthropic 缓存 TTL 约 5 分钟，Squad Director system prompt 若在 5 分钟内无调用则缓存失效。在日活较低阶段（DAU < 50），冷缓存命中率会低于理论值，v6.175 的成本节省效果需基于真实流量数据重新评估，不应在上线前过度依赖此估算。

---

### 7.6 评测体系

对应 **v6.178**，核心问题：**如何判定 AI 演员更像人、更好笑？**

**评分维度（5 维，1–5 分）：**
1. **角色一致性**：发言是否符合该 archetype 的人设标签（如「HR 王芳」说话是否有 HR 腔）。这是最可靠的一维，可以用规则辅助：检测人设关键词命中率。
2. **职场感**：是否用了真实职场黑话（「对齐」「拉齐」「颗粒度」「赋能」），还是通用 AI 口吻。
3. **搞笑度**：主观，但 LLM judge 可做相对排序（A/B 比较，而非绝对打分）。
4. **重复度**：与同角色近 5 局发言的余弦相似度，高于 0.85 判为重复。这一维可用程序化计算，不依赖 LLM judge。
5. **发言长度合规**：是否在设定字数范围内。

**数据来源**（不依赖无标注数据）：
- 从 `replays.json` 中随机抽取 100 条历史发言作为种子集
- 未来有埋点后，用「分享卡生成」作为正向信号，「该轮后用户退出」作为负向信号，构建弱标注集

**LLM judge 偏差修正**：已知 LLM 偏好更长回复。校准方法：在评分数据集中强制包含 20% 的「短但高质量」样本（人工挑选），观察 judge 对这些样本的评分是否合理，若系统性偏低则在 prompt 中加「不偏好发言长度」的显式约束。

**裁了么专项评测**：除上述 5 维外，增加第 6 维：**法律论点可靠性**——HR 引用的条款是否存在于《劳动合同法》/《劳动争议调解仲裁法》，可用规则查表验证。这是可以实现 100% 自动化评测的维度，不依赖 LLM judge。

**版本门槛**：v6.178 完成后，每次 prompt 改动必须跑 eval 并提交 delta 报告（JSON 格式，commit 到 `packages/server/src/evals/baselines/`）。没有 eval 报告的 prompt 改动不进 main。

---

### 7.7 记忆层的去留与可感知化

**去留结论：保留，但当前工程投入与用户价值严重错配。**

v6.173 修复 zh locale gate 后，en/ja/ko 玩家才第一次拥有跨局记忆。但记忆系统的根本问题不是 locale bug，而是用户完全感知不到它在工作。

**两类可感知化改造（映射至 Phase 4，v6.183+）：**

**① 显式记忆面板（Settings 页）：**
在 `packages/client/src/routes/Settings.tsx` 新增「角色对你的记忆」区块：列出每个 archetype 对该用户的记忆条数（`SELECT COUNT(*) FROM memories WHERE userId = ? AND archetypeId = ?`）、关系强度分数（来自 `relationStore`）。这个面板的意义不是功能，而是「证明 AI 在乎你」——是留存机制。

**② 发言内引用提示（In-game）：**
当 agent 生成的发言中实际注入了记忆片段（`memoryBlock` 非空），在该发言气泡的角落显示「记忆中」角标，鼠标悬停显示触发了哪条记忆。这将唯一技术差异化变成用户可以看到的东西。

**pgvector 依赖问题**：多数用户未配置 PostgreSQL 导致记忆功能静默跳过。解法分两步：① v6.173 修复 locale gate 的同时，在 `docker-compose.yml` 加回 server/client 服务（已在 v6.166 Dockerfile 任务中），使 pg 随托管版本自然启用；② 为无 pg 环境提供降级路径：改用 SQLite + 本地 cosine 相似度计算（`packages/server/src/services/memoryRecall.ts` 注入可替换实现），消除 pg 依赖是 BM25 降级而非功能丢失。SQLite 降级版本的召回质量损失约 15–25%（假设，需 v6.178 eval 测量），可接受。

---

### 7.8 成本与延迟目标

以下为目标数字，所有成本估算均为**假设值**，基于公开文档区间，需 v6.175 上线后 Anthropic dashboard 核实。

**延迟目标（有时序依赖）：**

| 节点 | 当前 | 目标 | 版本 |
|---|---|---|---|
| Classic 首字可见 | 5–15s | <2s | v6.170 |
| 裁了么 HR 首字 | 8–13s | <1.5s | v6.171 |
| 班味单口第一句开播 | 8–12s | <3s | v6.183+ |
| 游戏加载到首字（托管版，已配 key）| 35–50min（新装） | <10s | v6.165–167 |

**成本目标（BYOK 后，模型费用由用户自己的 key 承担）：**

- **产品侧模型成本为零**（决策 2）；但「一局花用户多少钱」直接决定用户愿不愿意配 key，所以单局成本仍是要优化的指标，在模型设置面板里按预设模型商给出估算
- **成本主要来源**：TTS（沉浸局 23 角色全程发音）> LLM 调用（Classic SPEECH × 70+）> Squad Director（每局 1 次）
- **成本下降路径**：① v6.175 prompt caching 降 LLM input 成本 ≥ 40%（假设）；② 没配 TTS key 时用浏览器自带朗读（v6.167），语音费用为零

**单人 + AI agent 产能下的优先级约束：** 上述所有 LLM 升级中，v6.172（generateObject）和 v6.175（caching）的改动量最小（各约 S 级，1–2 天），收益最确定（消除已知 bug + 可量化成本节省）。v6.178 eval 框架是所有后续模型选型决策的基础，不建立 eval 的情况下任何「升级 AI 演员质量」的声称都没有验证手段。按此排序：先 v6.172 → v6.175 → v6.178，再讨论分层路由的细化和实时语音的引入。

## 8. 设计与交互改造专章

---

### 8.1 首屏：5 秒说清是什么

**当前问题：** Landing.tsx Hero 区有标题「OFFICE ZOO · 班味剧场」，但对陌生访客无法在 5 秒内回答「这是什么、我为什么要花时间在这里」。五张模式卡片视觉权重均等，访客必须逐张阅读才能理解产品本质。

**线框描述（托管版本上线后生效，v6.166 配套）：**

```
┌──────────────────────────────────────────┐
│  OFFICE ZOO · 班味剧场                   │
│                                          │
│  AI 自演的职场狼人杀 ·                   │
│  你的 HR 黑心到什么程度，玩一局就知道    │
│                                          │
│  [▶ 5分钟快速体验 · 裁了么第一关]  ← 主CTA │
│  [或 看一局示例对局（不用 key）] ← 副CTA │
│                                          │
│  ↓ 所有玩法                              │
└──────────────────────────────────────────┘
```

**要点：**
- 主标语两行：定性行（AI 自演职场狼人杀）+ 钩子行（你的 HR 黑心到什么程度）
- 主 CTA 绕过模式选择，直接进裁了么第一关（`autostart=true`，v6.169 加入该参数；未配 key 时先弹模型设置，v6.167）；副 CTA 进示例对局回放（v6.168，随仓库发布的真实对局，不调模型、不用 key）
- BYOK 之后副 CTA 的分量变重：它是没有 key 的访客唯一能完整看到 AI 对局的地方
- 「所有玩法」折叠在主视区以下，首屏不强迫选择
- 托管版本上线前（v6.166 之前），本地部署用户继续看到原始 README 说明，不在首屏假装有在线版本

**对应版本：** v6.168（Hero 文案 + 示例对局副 CTA）；主 CTA autostart 参数属于 v6.169 范围。

---

### 8.2 模式排序与入口收敛

**当前结构：** 5 张主模式卡片 + 「更多玩法」折叠区（Fortune/Weekly/Bar/Squad），合计 9 个独立入口，视觉权重均等，将「先玩哪个」的决策推给访客。

**收敛后三层结构（v6.169 实施，版本节点前其他 UI 维持现状）：**

```
第一层（首屏，主推）：
  [裁了么 · 5分钟闯关]      badge 01，主卡，宽版
  [班味单口 · AI 脱口秀]    badge 02，次卡，配视频导出徽标

第二层（「更多玩法 ▾」折叠展开）：
  [经典局 · 15分钟狼人杀]   badge 03
  [沉浸局 · TTS全程旁白]    badge 04
  [班委会 · 五人剧情]       badge 05

第三层（页脚文字链接，非卡片）：
  今日运势 · 职场周报 · 酒吧局 · 投票对决 → 纯文字，不占首屏
```

**设计依据：** Classic 从 badge 01 降到第二层，不是降级，是找对受众——愿意看 15 分钟 AI 自演的用户会主动翻，不需要首屏强推。Fortune/Weekly/VoteDuel 在零托管阶段实际用量接近零（VoteDuel 需两人同时在线），放到文字链接不影响真实用户，只减少决策噪音。

**对应版本：** v6.169（MODES 数组重排 + autostart 参数 + 文字链接第三层）。

---

### 8.3 对局界面信息层级

**当前问题：** Classic.tsx 渲染 10+ 个并行区域，没有「当前最重要的信息是什么」的视觉焦点，EVENT LOG 与 SPEECHES 双栏并列竞争屏幕空间。

**分层原则：常驻 / 折叠 / 按需展开**

```
常驻（永远可见）：
  ├── SPEECHES 区（AI 当前发言，v6.170 后流式逐字滚动）
  ├── Phase pill（当前阶段：讨论 / 投票 / 结算）
  └── 当前阶段对应的唯一主操作按钮

折叠后可展开（角标计数）：
  ├── EVENT LOG ▸ 右侧抽屉（小圆点 badge 显示新事件数）
  ├── 地图 ▸ 压缩为顶部头像条（9 个角色缩略图 + 存活状态）
  └── OKR / 公司指数 ▸ 底部 pill（平时压缩为一行数字）

按需弹出（不常驻主视区）：
  ├── 角色关系网 ▸ 点击任意头像触发弹层
  ├── 弹幕 / 上桌 / 占座 ▸ 右下角「参与」悬浮按钮，点击上滑面板
  └── 分享卡 ▸ 仅在结算页出现
```

**桌面端对局线框（v6.170 配套改造）：**

```
┌──────────────────────────────────────────────┐
│ [讨论 第2轮]  [OKR:87▼]  [1:24]  [地图条 ▾] │
├──────────────────────────────────────────────┤
│  SPEECHES（流式滚动，v6.170 后逐字出现）      │
│                                               │
│  [钱三金 头像]  「我觉得……」▌                │
│  [李小花 头像]  「同意，但是……」▌             │
│  [HR 胡总]      （思考中）▌                  │
│                                               │
│  EVENT LOG [3 ▸]   ← 角标折叠                │
├──────────────────────────────────────────────┤
│  [悬浮右下]  💬 参与  ← 唤起参与面板          │
└──────────────────────────────────────────────┘
```

**关键决策：** EVENT LOG 从主视区左列降为右侧抽屉，是减少认知负荷的核心。SPEECHES 区获得全宽空间，配合流式逐字出现（v6.170），内容本身就是焦点，不需要与地图、日志竞争。

**对应版本：** EVENT LOG 折叠 + SPEECHES 扩大，与 v6.170 流式改造同 feature branch 实施；地图压缩为顶部条依赖 GameEngine 拆解后实施（v6.179–182）；悬浮参与按钮整合在 v6.170 落地后独立小版本。

---

### 8.4 移动端

**现状数字：** index.css:513–534，移动端 `.game-side` 限高 `max-height:48vh`，两个独立滚动区在 375px 手机上各约 160px 可视高度（约 3–4 行文字）。2D 地图固定逻辑像素 900×550，375px 下缩放后约 230px 高，角色名牌存在叠压。

**P0——Landing 移动端（v6.168 与首屏改版同步）：**

```
375px Landing（纵向单列）：
  ────────────────────────
  [Logo + 主标语]              ← 不超过 3 行，字号 20px
  [▶ 5分钟试玩 裁了么]          ← 全宽按钮，高度 52px
  ────────────────────────
  模式卡片（纵向堆叠，每张 96px 高）
  ────────────────────────
  页脚文字链接                  ← 12px，不占卡片位
```

**P1——移动端对局（v6.170 流式改造配套）：**

```
375px 对局（替代当前双栏压缩）：
  [Phase pill + 计时]     ← 顶部固定，40px
  ─────────────────────
  SPEECHES 区              ← flex-grow:1，全宽，无高度上限
    [角色头像] 气泡文字▌   ← 宽约 88%，流式逐字
    [角色头像] 气泡文字▌
  ─────────────────────
  [主操作按钮]             ← 底部固定，52px 全宽
    讨论期: [💬 弹幕] [🎤 上桌]（并排两按钮）
    投票期: [🗳 投票]（全宽单按钮）
```

地图在移动端降为「可选」：右上角固定 9 个角色小圆点（存活 / 死亡颜色），点击弹出全屏地图层，不再压缩常驻。

**P2（阶段 3 后评估）：** 左滑查 EVENT LOG、长按角色头像查关系网等手势。在 MAP ≥ 200 且有移动端真实数据前不投入。

**对应版本：** Landing 移动端布局并入 v6.168；游戏布局改造并入 v6.170；地图弹层并入 v6.179–182。

---

### 8.5 观看 vs 参与的核心循环

**问题本质：** Classic 的「上桌/占座/下注」三个参与入口分散在界面不同位置，PhaseHint + RoleLegend（Classic.tsx:1676–1679 已有）覆盖阶段说明，但从未解释「我现在能做什么」。多数用户停在观看状态不是因为不想参与，而是因为参与路径不可见。

**循环设计：观看 → 好奇 → 参与 → 投入**

```
观看阶段（默认，0–30 秒）：
  SPEECHES 流式滚动，右下角「参与」悬浮按钮存在但不打扰

好奇阶段（第一轮结算时触发，仅首次）：
  Toast 提示，3 秒自动消失：
  「钱三金被怀疑是鼠人——你支持他吗？→ [押注]」
  localStorage 写入 firstGameHintShown，后续不再出现

参与阶段（用户点击「参与」后）：
  ┌────────────────────────┐
  │ 💬 发弹幕   滚动显示     │
  │ 🎤 上桌发言  真进AI耳朵  │  ← 上滑面板，每项配 15 字说明
  │ 🪑 占座当鼠人           │
  └────────────────────────┘

投入阶段（参与后）：
  「上桌」→ SPEECHES 区置顶出现用户输入框
  「占座」→ 用户头像进入地图，后续每轮自动参与
  BettingBar 在投注期自动上移到 SPEECHES 上方，不再折叠
```

**裁了么不需要此循环改造：** FiredChat.tsx 已是标准聊天流（输入 → AI 回复 → 评分 → 下一轮），参与感天然嵌入，唯一缺失是流式化（v6.171）和快捷入口（v6.169），无需额外引导层。

**对应版本：** 悬浮参与按钮 + 上滑面板，在 v6.170 流式改造稳定后独立小版本实施；首次 Toast 提示依赖 v6.163 埋点验证参与率后决定是否必要（若 `game_start` 后 BettingBar 交互率已 ≥ 30%，该 Toast 可不做）。

---

### 8.6 新交互形态取舍

**实时语音输入**

判断：**等——推至阶段 4 按数据评估**

理由：gpt-realtime-2 见 Azure 模型目录（版本 2026-05-07，人工复核可用），但音频 token 定价来自第三方博客，未经独立核实，不作为成本决策依据。更根本的阻断是：实时语音要求凭据转发覆盖长连接（v6.167 只覆盖 HTTP 与对局建局消息），以及语音内容合规审核（《深度合成管理规定》对语音克隆有明确规定，v6.164 合规标识仅是第一步）。

v6.171 裁了么流式化将「等 13 秒文字出现」降至「< 1.5 秒流式出现」，是零架构复杂度的体验提升；实时语音是另一个数量级的工程投入。解锁条件：MAP ≥ 200，届时通过埋点事件 `voice_input_wishlist_click`（阶段 2 时加入一个「想用语音？点这里」文字链）收集真实需求信号后决策。

**短视频化（班味单口 → Reels/Shorts）**

判断：**做——v6.169 补完，视频导出基础设施已 Ready**

ShareVideoButton.tsx + videoExport.ts 在 Classic 完整可用，Talkshow.tsx 未接入（grep 确认）。班味单口每段 20–47 秒 + TTS 音频 + 话题标签，是最匹配短视频时长的原材料。

**班味单口视频导出线框（v6.169 接入后，段子播放结束时）：**

```
┌───────────────────────────────────┐
│  [AI 头像]  「打工人到底……」       │
│  ───────────────────── [▶ 重播]   │
│                                   │
│  [↗ 分享这个段子]                 │
│    → 下载 MP4（9:16 竖版）         │
│    → 复制文案（话题 + 正文 + 链接）│
│    → 下一个段子 ▸                 │
└───────────────────────────────────┘
```

水印规范（v6.164 深度合成标识同步，下载文件须带标识）：左上角「AI 生成内容」文字标识；右下角产品 Logo + 短链；不遮挡 AI 头像主体。Safari 17+ MediaRecorder 兼容性需实机验证（videoExport.ts:109 已处理 codec 优先级，降级为静态图片 + 音频链接作为兜底）。

**对话式聊天流（替代对局结构）**

判断：**不做——Classic 不应改造为聊天流**

裁了么的 FiredChat.tsx 本身已是聊天流，参与感来自「我选哪条话术」的决策节点，结构不需要改。Classic 改造为聊天流的代价远大于收益：9 个 AI 同时发言的「剧场感」是 Classic 的核心差异化，改成聊天流会把它压成「AI 依次回复」。GameEngine.ts 2912 行、Classic.tsx 26 个 useState，改造成本极高，且 v6.179–182 已规划拆解，此前不做大结构改动。正确方向是 v6.170 流式化 + 8.3 节信息层级优化，让剧场体验更流畅——剧场感与聊天感是两条不同的产品路，不应混用。

---

### 本章改造版本对应表

| 改造项 | 对应版本 | 前置依赖 |
|--------|----------|----------|
| Landing 首屏主标语 + 主 CTA + 示例对局副 CTA | v6.168 | v6.167 BYOK |
| 模式排序：裁了么置顶 + 文字链第三层 | v6.169 | — |
| 班味单口视频导出接入 + 水印规范 | v6.169 | v6.164 合规标识 |
| EVENT LOG 折叠 + SPEECHES 扩大 | v6.170（配套） | v6.170 流式推送 |
| 悬浮参与按钮整合上滑面板 | v6.170 后独立小版本 | v6.163 埋点验证参与率 |
| Landing 移动端单列布局 | v6.168 | — |
| 移动端对局 SPEECHES flex-grow | v6.170（配套） | v6.170 流式推送 |
| 地图折叠为顶部条 / 弹层 | v6.179–182 后 | GameEngine 拆解 |
| 首次参与引导 Toast | v6.170 后按埋点数据决定 | v6.163 埋点 |
| 精选回放副 CTA（动态） | v6.174 shareCard 统一改造时评估 | shareCard 抽象完成 |
| 实时语音输入 | 阶段 4 评估 | MAP ≥ 200 + 用户需求信号 |

## 9. 商业、增长与合规专章

### 9.1 30/60/90 天计划与可验证假设

**主线：路线 B（基础设施优先）与路线 A（视频内容分发）并行推进，每阶段绑定一个可证伪假设，假设不成立即切换优先级。**

#### 第 0–30 天：大版本 v6.161–169（线 A 上线基建 ∥ 线 B 班味单口视频）

线 A：CI（v6.161）→ 安全三件套（v6.162）→ 埋点（v6.163）→ AI 内容标识（v6.164）→ 资产预置（v6.165）→ 单端口 + Docker（v6.166）→ BYOK（v6.167）→ 无 key 体验与功能收口（v6.168）。
线 B：班味单口视频导出 + 裁了么置顶（v6.169），与线 A 交错提交。大版本完成后同步 GitHub / ModelScope 并合进 main；**公网部署由 owner 用自己的平台账号执行**。

**可验证假设 A0（BYOK 门槛）：点击模式入口的访客中，≥ 10% 完成 key 配置。**
验证方式：`byok_saved` / 模式入口点击（Umami，v6.163）。
不成立条件（30 天内 < 10%）：BYOK 门槛压垮漏斗，按 §0 停止条件提请 owner 重新评估决策 2。

**可验证假设 A：有在线版本能将「访问 Landing」到「首局完成」的转化率提升至 ≥ 20%。**
验证方式：托管上线后 2 周，`game_complete` / `page_view` 比率（Umami，v6.163 埋点）。
不成立条件（< 10%）：障碍不在「可访问」而在「体验」，优先拨给 v6.169（裁了么置顶）和 v6.170（流式 LLM），而非继续推进导航或功能扩张。

**可验证假设 B：班味单口视频（v6.169 视频导出接通后手动投放）能带来有机 GitHub 流量。**
验证方式：bit.ly 短链追踪，4 周 5 条视频，至少 1 条来自视频平台的 referrer > 100 次/天。
不成立条件：班味文化传播载体不是短视频，考虑图文笔记或话题标签内容策略替代，视频导出优先级降至 P2。

#### 第 31–60 天：分发与体验升级（v6.170–172）

核心动作：owner 部署托管版后执行即刻 + V2EX 发布稿（上线后运营动作）→ Classic 流式（v6.170）→ 裁了么流式（v6.171）→ generateObject 替换手写 parse（v6.172）。

**可验证假设 C：流式化（v6.170–171）使裁了么第一关完成率提升 ≥ 10 个百分点。**
验证方式：`fired_chapter_complete` 在 v6.171 上线前后 7 天对比，`time_to_first_token_ms` P50 < 1500ms。
不成立：留存问题在关卡设计而非等待感，优先分析各关流失率，针对性迭代场景，而非继续优化流式架构。

**可验证假设 D：即刻 + V2EX 首发（上线后运营动作）7 天内 GitHub Star 增量 ≥ 50 颗。**
不成立（< 20 颗）：说明「可克隆仓库」受众对产品无共鸣，提前启动小红书视频渠道，或加速推进 PH 英文发布（待 v6.173 记忆修复后）。

#### 第 61–90 天：留存与质量（v6.173–178）

核心动作：非中文记忆修复（v6.173）→ 分享卡统一（v6.174）→ Prompt Caching（v6.175，直接降低用户自己 key 的花费）→ LLM eval（v6.178）。收款按决策 3 冻结，不在 90 天计划内。

**可验证假设 E：配了 key 的用户 7 天内回访率 ≥ 20%。**
不成立：用户愿意配一次 key 但不回来，问题在内容与玩法而不在门槛；优先分析各模式的流失点，而不是继续做基础设施。

---

### 9.2 首发路径

**先国内，后海外；不同时开多个渠道。**

**国内首发顺序（全部依赖 v6.166 完成）：**

1. **即刻**（v6.168 第一步）：班味 + 职场文化话题，目标 25–35 岁有职场经历用户。内容物料已备（GIF/截图在 PRODUCTHUNT_LAUNCH_KIT.md 已标注 ✅），补填在线 URL 即可发。发布后 4 小时内活跃回复维持热度；传播半衰期约 48 小时。

2. **V2EX「分享创造」节**（v6.168 第二步，与即刻同步）：开发者社区，主打「AI agent 辅助开发的工程实践」角度，与班味文化形成双叙事。同样依赖在线版本 URL，帖子技术细节要足够实，不是纯产品广告。

3. **小红书 + 抖音**（v6.169 视频导出打通后）：竖版短视频 + 裁了么场景截图，侧重「劳动法知识训练游戏」角度。需要 v6.169 完成后才有视频素材，否则只能发静态截图，传播效果存疑。

4. **Product Hunt / Hacker News**（v6.173 非中文记忆修复完成后，约第 60–75 天）：英文内容物料已备（LAUNCH_SUBMISSION_PACK.md 英文版），但非中文玩家跨局记忆在 v6.173 之前为零，英文体验残缺不适合发 HN。HN 对「AI 角色扮演 + 流式架构」话题敏感度高，等 v6.170 流式化上线后一并发，技术亮点更完整。

**不同时发 PH + 即刻的原因：** PH 发布时间窗口一旦错过难以复现，功能不完整时发会留下差评记录。

---

### 9.3 托管成本模型

**前提（按决策 2 改写）：** 产品不提供模型 API，模型与 TTS 费用全部由用户自己的 key 承担；产品侧只付服务器与可选的统计服务。单实例、资产随镜像发布（v6.165），不需要对象存储。

| 成本项 | 假设 | 月估算 |
|--------|------|--------|
| 容器（server + 前端静态文件，单端口） | 512MB–1GB RAM，always-on，境外平台 | $5–20/月 |
| 数据卷（对局回放、关系网等 JSON） | < 1GB | 平台通常含在套餐内 |
| Umami 自部署（v6.163，可选） | 同平台附加实例 + 数据库 | $5/月左右 |
| 模型与 TTS | 用户自己的 key | **¥0（产品侧）** |
| **合计** | | **约 $10–25/月** |

**这意味着：** 不需要日成本熔断，也不需要共享 key 池；要防的是「把服务器当免费中转」和 CPU / 带宽滥用，靠 v6.162 的按 IP 限流兜住。

**用户侧单局成本仍要管：** 它决定用户愿不愿意配 key。v6.167 的模型设置面板按预设模型商给出单局估算，数字来自一局的实测调用次数 × 各家公开价格，并注明测量日期。

---

### 9.4 收款与 B 端（冻结）

**收款（决策 3：暂不开发）：** 原计划的 Stripe live、支付宝个人版、裁了么付费墙全部冻结。托管版隐藏 Premium 假结账入口（v6.168），避免「看起来能付钱、实际只翻本地标记」的误导。解冻时的依赖顺序不变：安全修复（v6.162）→ 托管版本（v6.166）→ 账号体系（v6.176）→ 支付渠道（个人开发者可用的渠道；微信支付需企业主体）。

**B 端（决策 5：冻结）：**
- `b2b.ts:9` 注释明写「No real auth — that's a v1.2+ feature」，当前 B2B 模块无鉴权、无计费、零企业客户；托管版隐藏 B2B 入口并关闭其写接口（v6.168）。
- Simile（Generative Agents 原作者 Joon Sung Park 等，2026-02 获 Index Ventures 领投 1 亿美元 A 轮，据 itiger 等多源报道）切入 B 端企业行为研究，与 OFFICE ZOO 路线图中 B2B 白标构成潜在竞争。这不是「加快进入 B 端」的理由，而是「先验证 C 端 PMF、再决定是否跟进」的理由。
- **解冻条件：** owner 解冻收款 + 账号体系完成 + 至少 1 个企业用户主动发起询问。

---

### 9.5 国内合规前提

以下三项是面向公众上线的前提，须在 owner 公网部署前落实。

#### （一）AI 生成内容显式标识（v6.164，必修）

《人工智能生成合成内容标识办法》2025-09-01 施行（新华网，已核实），AI 生成音频/图像须添加显式标识，下载/导出文件同样须带标识。

v6.164 覆盖：AI 发言与 TTS 播放处的「AI 生成」角标、AI 头像/立绘角标、每页通用声明、裁了么法律免责。**必须在公网上线前完成，不能事后补改。**

额外要点：v6.169 视频导出的文件须在画面里带标识（全程水印 + 片尾「本视频由 AI 生成」），不可仅依赖页面 UI 标识——用户把文件分享出去后 UI 标识随即消失。

#### （二）生成式 AI 服务备案（owner 公网部署前评估）

《生成式人工智能服务管理暂行办法》要求面向境内公众提供生成式 AI 服务的主体进行备案。截至 2025-12-31 全国累计 748 款完成备案（ithome 引用网信办数据，已核实；评审原引 868 款为错误数字）。

**BYOK 后的判断：** 产品不再用自己的 key 向公众提供模型能力，模型调用发生在用户与其选择的模型商之间（模型商自身负有备案义务），这比原「Demo 共享 key」方案的风险明显更低；但托管站点仍在编排提示词并向公众展示 AI 生成内容，是否构成「提供生成式 AI 服务」仍是灰色地带。

**操作建议：**
- 托管选境外平台（不注册企业主体就做不了 ICP 备案，决策 4），面向全球访客，不做面向境内的专门推广投放之前，先咨询一次网络法律顾问（一次性咨询）。
- 模型设置面板只预设已在境内合规上线的模型商时，可在面板说明里注明「模型服务由你选择的模型商提供」。
- 如需备案，以咨询结论为准再启动；备案通常需要主体资质，与决策 4 相关，届时提请 owner 重新决定。

#### （三）劳动法内容免责边界（v6.164 覆盖部分，需补充）

**边界一（UI 层，v6.164 已计划）：** 每条法律相关输出必须有明确免责声明。v6.164 在每关知识卡片加「AI 角色对话仅供演练，不构成法律建议」，须同时在 FiredChat.tsx 的 AI 消息气泡下方加微小字标注，防止用户截图用于实际纠纷。

**边界二（Prompt 层，v6.164 附属任务，工时约半天）：** `packages/server/src/routes/fired.ts` 中 HR 的 `buildHRSystemPrompt`（:238）和律师顾问 prompt（:646） 须禁止 AI 输出直接行动建议——「您可根据《劳动合同法》第 X 条主张权益」可以，「我建议您立即向劳动仲裁委员会申请」不行。这是 prompt 层护栏，不依赖 UI 改动，须在公网上线前人工审查 30 个场景的系统 prompt，作为 v6.164 的附属任务执行。

---

**本节版本依赖速查：**

| 事项 | 实施版本 | 阻断版本 |
|------|---------|---------|
| AI 内容标识 + 劳动法免责 | v6.164 | 公网上线前必须完成 |
| 生成式 AI 备案评估 | owner 公网部署前 | 无硬性阻断，但越晚代价越高 |
| 国内首发（即刻 + V2EX） | 上线后运营动作 | 依赖 owner 部署 |
| 收款 | 冻结（决策 3） | — |
| 微信支付 / 小程序 | 冻结（决策 4） | 需企业主体资质 |
| B2B 商业化 | 冻结（决策 5） | 解冻收款 + 账号体系 + 真实企业客户意向 |

## 10. 风险与 owner 决策

### 10.1 主要风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| BYOK 门槛压垮漏斗：大多数访客没有模型 key | 高 | 高 | v6.168 示例对局 + 不调模型的玩法；v6.167 国内模型商预设、申请指引与单局成本估算；§0 停止条件（配置完成率 < 10% 提请 owner 重新评估） |
| 用户 key 泄露（日志、错误回显、落盘、跨用户串用） | 中 | 极高 | v6.167：凭据只在请求 / 对局内存里，按请求隔离（`AsyncLocalStorage`）；日志脱敏；测试扫描日志与落盘文件；全局共享生成器在 byok 下不用访客的 key |
| 自定义 baseURL 被用来打内网（SSRF） | 中 | 高 | 托管下默认关闭自定义 baseURL；打开时只允许 https，拒绝内网、回环和云元数据地址 |
| 服务器被当成免费中转或被刷 TTS / CPU | 中 | 中 | v6.162 按 IP 限流；BYOK 下费用不落在产品侧，风险从「账单」降为「可用性」 |
| 容器冷启动 5–10 分钟导致托管部署反复失败 | 中 | 高 | v6.165 资产随仓库预置、hosted 下禁止启动期生图；v6.166 本机 Docker 验证冷启动 < 30 秒 |
| replayStore 并发写互相覆盖 | 中（有真实并发即触发） | 中 | v6.168 加写队列（同 `relationStore`） |
| 《人工智能生成合成内容标识办法》已生效，公网上线即触发 | 确定 | 高 | v6.164 是公网上线的硬性前置，不可推迟 |
| AI Agent 上下文截断导致功能静默丢失（media.ts 是已发生先例） | 中 | 中 | v6.161 CI 是所有高风险重构的前置；v6.179–182 分步拆解 GameEngine |
| 发布窗口持续收窄（star 增速趋近停滞，近 14 天仅 13 个独立访客） | 高 | 中 | owner 部署后 48 小时内执行发布稿，不等下个版本 |
| Simile（1 亿美元 A 轮，融资已核实）切入 C 端娱乐 | 低（当前无 C 端产品信号） | 高 | B2B 白标冻结；持续监测 Simile 产品动向 |

### 10.2 owner 决策记录

2026-10-09 提出的 5 项决策已于 **2026-10-10 全部拍板**，结论与影响见 §0。保留原选项与理由备查：

| 决策 | 原推荐 | owner 结论 | 说明 |
|------|--------|-----------|------|
| 1. 路线并行还是串行 | 并行 | **并行** | 线 A 上线基建与线 B 班味单口视频同时推进 |
| 2. Demo 每日 API 成本上限 | ¥80/天的共享 key 池 | **不提供模型 API，用户自配 key** | 原 v6.167 改为 BYOK；新增停止条件（§0） |
| 3. 支付渠道与开启时机 | 账号体系后接支付宝个人版 | **暂不开发收款** | v6.176 暂缓、v6.177 冻结 |
| 4. 是否注册企业主体 | 阶段 3 入口再定 | **暂不** | 微信支付、小程序冻结；托管选境外平台 |
| 5. B2B 白标 | 立即冻结 | **冻结** | 托管版隐藏 B2B 入口 |

**新增待 owner 执行的事项（代码侧做不了）：** ①选平台并用自己的账号部署（v6.166 的 `docs/DEPLOY.md` 给出步骤）；②公网上线前做一次备案问题的法律咨询（§9.5）；③上线后执行发布稿。

---

## 11. 附录

### 11.1 关键数字出处表

| 数字 / 事实 | 出处 | 可信度 |
|------------|------|--------|
| 近 14 天 47 PV / 13 独立访客 | GitHub Traffic API（仅 owner 可读，无法独立复现） | 背景参考 |
| 858 个测试 | npm test（vitest）输出（多个视角均核实） | 代码可核实 |
| 首次启动 5–10 分钟 | README.md；archetypeAvatarGen.ts:333 writeFileSync | 代码可核实 |
| CORS 全开 / memory 无鉴权 / TTS 无限流 | index.ts:58；memory.ts:17；tts.ts 全文无 createRateLimiter | 代码可核实 |
| GameEngine.ts 2912 行 | wc -l 核实 | 代码可核实 |
| media.ts 为 11 行占位存根、对 /api/media/* 返回 HTTP 501 | media.ts:2 注释「not captured in the recovery transcript」 | 代码可核实 |
| userId 可伪造；Premium 为演示 checkout | userId.ts:9-12；billing.ts:2；Premium.tsx:8-12 | 代码可核实 |
| 全代码库无任何分析工具调用 | grep 全局：posthog / mixpanel / amplitude / gtag / plausible 均无输出 | 代码可核实 |
| 全国劳动人事争议 454.3 万件（2025 年） | 据虎嗅整理人社部公报（huxiu.com/article/4888141.html） | 中等可信（主持人复核，引用须注明「据虎嗅整理」） |
| Simile 1 亿美元 A 轮（Index Ventures，2026-02） | itiger 等多源报道（主持人复核） | 已核实 |
| Simile 2 亿美元 B 轮、估值 20 亿美元（2026-07） | 聚合报道（主持人复核） | B 轮领投方说法不一 |
| 《人工智能生成合成内容标识办法》2025-09-01 施行 | 新华网（主持人复核） | 已核实 |
| AI 狼人杀消费级无大厂商业产品 | 主持人复核（Steam / 社区项目 / Kaggle Arena） | 已核实 |
| 生成式 AI 备案累计 748 款（截至 2025-12-31） | ithome.com/0/911/987.htm（contrarian 视角 WebFetch 核实） | 已核实 |

### 11.2 被核验推翻的说法

| 原说法 | 核验结论 |
|--------|---------|
| 生成式 AI 备案「868 款（截至 2026-04-30）」 | **推翻**：原文为 748 款（截至 2025-12-31），数字和日期均不符（ithome.com 原文核实） |
| 「Inworld AI 收购 Ultravox」 | **推翻**：引用 URL（af.net）为 AI 峰会页面，与 Inworld / Ultravox 无关，引用无效 |
| 「Phase A 短视频引擎从未实现」 | **推翻**：videoExport.ts / ShareVideoButton 已在 Classic 中完整实现；问题是 Talkshow.tsx 未接入，非未实现（主持人复核 + 代码 grep 确认） |
| 「.tmp 文件来自 replayStore 并发竞态（≥16 个）」 | **推翻**：.tmp 来自 relationStore.ts（已有 writeChain），是进程 crash 后 rename 孤儿文件；实测 60 个；真正无写队列的是 replayStore.ts 和 billingStore.ts |
| 「Classic.tsx 含 39 处 useState」 | **推翻**：grep 实测 26 处 |
| 「PH checklist 全部未勾」 | **推翻**：4 项内容素材（GIF/MP4、gallery 图、first-comment、Q&A）已标注 ✅；未完成的是执行动作类（选定发布日、maker handle 等） |
| 「Smallville 是 OFFICE ZOO 声称超越的学术领先基准」 | **推翻**：ITERATION_PLAN.md:21 明确标注 Smallville 为「最大的技术 gap」，是需要追赶的差距，评审表述与原文含义相反 |
| 「GameEngine.ts 波间串行总等待约 24–60 秒」 | **推翻**：设计注释（:1201-1204）明确实际壁钟约 8–10 秒；for 循环波间串行（:1260），内部 Promise.allSettled 并行（:1266） |
| 「billing.ts:35-45 证明 Stripe 为代码约束的 test-mode」 | **推翻**：这两函数是 env 驱动配置，可接受 live key；test-mode 证据在 billing.ts:2 JSDoc 和 Premium.tsx:8-12 注释 |

### 11.3 无法核实的说法（不得作为承重依据，可作背景并注明）

| 说法 | 说明 |
|------|------|
| OpenAI gpt-realtime-2 往返延迟约 300ms | 主持人复核：该数字指初代 gpt-realtime，非 gpt-realtime-2；不得作为承重目标 |
| gpt-realtime-2.1（2026-07）发布 | 主持人复核：仅第三方报道，未见官方确认 |
| AI 音频 $32 / $64 每百万 token | 来自第三方博客，未核实 |
| Simile B 轮具体领投方 | 主持人复核：聚合报道，各方说法不一，可用「B 轮已完成」但不可具体归因领投方 |