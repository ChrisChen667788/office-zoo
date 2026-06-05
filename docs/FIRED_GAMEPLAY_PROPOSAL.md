# 「裁了么」玩法升级提案 — 从纯 chat 到可重复爽局

> v6.55 #3 · 调研当下爆火的网游/Steam 玩法机制,提出把「裁了么」(裁员谈判)从单一
> chat 模式升级的可落地方案。调研日期 2026-06。

## 1. 现状诊断

「裁了么」现在是:你(被裁员工)和 AI HR 纯文字拉扯,争取赔偿 / 保住工作。问题:
- **单循环**:就是聊天,没有"再来一局会不一样"的结构,通关一次没动力再玩。
- **无成长**:玩完不解锁任何东西,下一局体验一样。
- **无张力曲线**:赢/输全靠你嘴能不能说,缺少筹码、风险、节奏的博弈感。
- **缺爽点兑现**:情绪价值止于"我把 HR 说服了",没有数值/收集/进度的满足。

## 2. 当下爆火的机制(调研)

| 机制 | 代表作(2025-26) | 为什么上瘾 |
|---|---|---|
| **Roguelike 牌组构筑** | Balatro / Slay the Spire 2 / Monster Train | 每局抽不同的牌/小丑,搭配 synergy,build 千变万化 |
| **Meta 进度(局间成长)** | 几乎所有 roguelite | "死 → 投资 → 变强再来",几百小时留存的核心 |
| **遗物/修正符(改写规则)** | Balatro 小丑 / Wildfrost 天气 | 一个道具就能 break 掉基础规则,创造"这局好爽"的瞬间 |
| **Action-Reward-Investment 循环** | idle / roguelite 通用 | 做核心动作→拿资源→变强,短期留存引擎 |
| **抽取式风险回报(extraction)** | 各类 extraction 玩法 | 见好就收 vs 贪更多血本无归的紧张感 |
| **Boss 升级 / 多层战场** | Monster Train 三层 / boss rush | 阶梯式难度 + 空间策略,赢的满足逐级放大 |

## 3. 把它们嫁接到「裁了么」—— 3 个方案(按"改动量 vs 爽度"排)

### 方案 A(推荐 MVP)·「赔偿谈判 = 一局 roguelike 牌局」
把一次裁员谈判变成**回合制话术牌局**,复用现有 LLM HR 当"对手 AI":
- **你的牌 = 谈判话术卡**:`工龄施压` `竞业反将` `劳动法引用` `情绪施压` `装可怜` `内部爆料`… 每张卡有「筹码消耗 + 效果」。
- **两条血条**:你的`底气/筹码`(打卡消耗)vs HR 的`预算/耐心`(被你打掉就松口加赔偿)。
- **HR 出招**:LLM 不再自由发挥,而是从 HR 招式池里选(`画饼` `拖延` `甩锅 KPI` `威胁背调`),每招克制/被克制某些话术卡 → 形成 build 博弈。
- **赔偿阶梯 = 抽取风险**:把 HR 预算打到 N+1 可"见好就收";继续打到 2N / 3N 但风险升高(HR 可能掀桌"那就走劳动仲裁",一拍两散赔率归零)。贪 vs 稳的紧张感。
- **AI 仍负责"演"**:每张卡 play 出去,LLM 实时生成 HR 那句**有戏的台词**(保留现在的嘴炮爽感),只是结果由数值决定 → 兼顾"可玩"与"AI 演出"。

> 复用度高:HR 人格/台词生成 = 现有 `FIRED_HR_MODEL` 链路;只新增「话术卡 + 双血条 + 招式克制表」一套纯数值系统(可测)。

### 方案 B·「Meta 进度:打工人生涯」
在 A 之上叠局间成长(留存引擎):
- 每局结束按表现给`经验/遣散费`,解锁**新话术卡 / 新人格档案 / 新公司场景(更难的 boss HR)**。
- "职业生涯"线:实习生 → 老油条 → 维权斗士,逐级解锁更狠的卡和更高赔偿上限。
- Boss 阶梯:HR专员 → HRD → CEO亲自下场,每级招式更脏、预算更厚。

### 方案 C·「遗物系统:职场道具」
把"改写规则"的遗物搬进来当**一次性/被动道具**:
- `录音笔`(本局 HR 不敢威胁)、`工会卡`(每回合回筹码)、`大厂 offer`(底气上限翻倍但 HR 预算也翻倍)、`PUA 免疫`…
- 每张遗物 break 一条基础规则,制造"这局开局就赢麻了"的 Balatro 式爽点。

## 4. 建议落地顺序

1. **先做方案 A 的最小闭环**(话术卡 + 双血条 + 克制表 + 赔偿阶梯 + LLM 演出),纯数值部分先用 vitest 锁死,再接 LLM 台词。一局从"聊到通"变成"搭话术 build 把 HR 打到松口",立刻有 roguelike 爽感 + 保留 AI 演出。
2. A 验证好玩后,叠 **B(局间解锁)** 给留存,再叠 **C(遗物)** 给 build 深度。
3. 现有"纯 chat 自由谈判"作为「剧情模式 / 简单模式」保留,新牌局作「闯关模式」,两套并存,老玩家不流失。

## 5. 风险 & 取舍
- LLM 现在是"自由发挥"裁判,改成"数值结果 + LLM 配台词"会牺牲一点随机惊喜,换来可玩性/平衡性/可测性 —— 对留存是净赚。
- 话术卡 + 克制表是新的内容生产负担(要写一批卡 + 平衡数值),但纯数值层可单测、可迭代。

---

**Sources(调研):**
- [Why Roguelike Deck-Builders Are Taking Over Steam in 2025 — Valid Steam Keys](https://www.validsteamkeys.com/blog/why-roguelike-deck-builders-are-taking-over-steam-in-2025/)
- [Best Roguelike Games 2026 — Gamedō](https://gamedo.live/news/best-roguelike-games-2026/)
- [Deconstructing Indie Success: Idle and Roguelike Games — Medium](https://medium.com/@hrldthomas/deconstructing-indie-success-a-growth-pms-guide-to-idle-and-roguelike-games-6a2f982aacaf)
- [Best Roguelite Games 2025 — Eneba](https://www.eneba.com/hub/games/best-roguelite-games/)
- [Roguelikes With the Best Progression Systems 2026 — Bullet Haven](https://bullethaven.com/blog/BlogPost12_RoguelikesWiththeBestProgressionSystems2026)
