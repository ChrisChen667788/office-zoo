# OFFICE ZOO · Launch 提交包 (paste-ready)

> v6.4 launch ready (2026-05-23)。所有文字 / 截图 / 时间表都准备好,
> 你 5 分钟内完成 ProductHunt + HN Show + 即刻三平台提交。
>
> 我不能替你按下"submit"(账号权限 + 防滥用),但下面每个字段都
> 已经写到位,你 ctrl+C / ctrl+V 即可。

---

## 🎯 Step 0 · launch 日 24h 倒计时

| 时间 (北京) | 时间 (PST) | 动作 |
|---|---|---|
| 周三 12:00 | 周二 21:00 | 把 hunter 名单从 `HUNTER_OUTREACH.md` 抓出, 发最后确认 DM |
| 周三 14:00 | 周二 23:00 | Twitter / 即刻 发 building-in-public teaser:"今晚 16:01 launch ProductHunt, 求 upvote" |
| 周三 15:30 | 周二 00:30 | 提前打开 ProductHunt 表单, 把下面 §1 内容粘进去 (但先不 submit) |
| **周三 16:00** | **周二 01:00** | **🚀 SUBMIT ProductHunt** |
| 周三 16:00+30s | — | 立即贴 §1.6 first comment 到自己产品的评论区 |
| 周三 16:05 | — | 同步发 Twitter "刚上线 PH!" + GIF |
| 周三 16:30 | — | 发 §2 HN Show |
| 周三 17:00 | — | 发 §3 即刻 |
| 周三 17:30 | — | 发 §4 小红书 (9 图) |
| 周三 18:00 起 | — | 在线 4 小时, 实时回评论 |
| 周三 21:00 | — | 发第二条 Twitter 报告"upvote N + 评论 N" |

---

## 1 · ProductHunt 提交表单 (https://www.producthunt.com/posts/new)

### 1.1 Name
```
OFFICE ZOO
```

### 1.2 Tagline (60 char max)
推荐(英文,主推):
```
AI rats remember everything — open-source workplace sim with memory.
```
备选:
- A: `Genshin meets office politics — 9 AI rats remember everything.`
- B: `Open-source sim where AI coworkers hold grudges across games.`

### 1.3 Description (260 char short pitch)
```
9 LLM-powered "office rats" argue in corporate jargon, vote each other out,
and now REMEMBER you across games. Stanford Smallville-style pgvector +
reflection layer, in a Chinese workplace vertical. MIT, self-hostable.
```

### 1.4 Long description (paste into the long-desc field)

```
We took the social-deduction game (Werewolf / Mafia / Among Us) and added
two twists: (1) every character is an LLM-powered AI agent with a distinct
personality archetype (sass-master, sycophant, workaholic …), and (2) they
REMEMBER each spectator across games.

In v6.0 Phase B, we ported the memory + reflection mechanism from the
Stanford Smallville paper (Park et al. 2023) into a vertical use case:
Chinese workplace politics with all the bad corporate jargon ("embrace
change", "C-suite alignment", "circle back on granularity"). The result:
an AI that genuinely "holds a grudge" — last time you saved them in
voting, they thank you; last time you sold them out, they bring it up
before round 1 even starts.

v6.x updates:
🎮 Genshin/Honkai-style UI — 5★ character cards, EVENT pills, element
   chips. The visual grammar of gacha, applied to office burnout.
🎤 UGC talkshow scripts — community writes the bits, monthly top 5 hit
   the homepage carousel.
🍷 Bar Cluster — chat 1v1 with an AI, share the link, friends join the
   conversation, their snippets merge into a shared "group memory" PNG
   rendered server-side.
🛡 Privacy by design — chunky-style per-spectator memory + one-tap Forget.

Try locally:
  git clone https://github.com/ChrisChen667788/office-zoo
  cd office-zoo
  docker compose up -d && npm install && npm run dev

MIT licensed. PRs welcome. Stars matter — the algorithm shows this to
more burnt-out tech workers when it sees engagement.
```

### 1.5 Topics (pick 3-4)
- `Open Source` ★
- `Artificial Intelligence` ★
- `Productivity` (反讽 — 强反差 sell) ★
- `Games`

### 1.6 First comment (粘到自己产品评论区,launch 后 30 秒内)

```
Hi PH! Maker here 🐀

Quick context: I'm a Chinese tech worker who built this as a coping
mechanism for 5 years of "embrace change" / "circle back on granularity"
rhetoric. So the AI agents speak in exactly that voice — and now, as of
v6.x, they REMEMBER what you did to them across games.

The 30-second demo above shows the most surprising moment we found while
testing: a fresh game starts, the same `passive_aggressive` AI sees your
spectator id, recalls from pgvector that you betrayed them 2 games ago,
and opens their first speech with:

  "@Wang Wu — I haven't forgotten that mouth of yours. Last time you
   called my granularity insufficient, then teamed up with @Zhao Liu
   to vote me out. Beautifully closed-loop play."

We didn't prompt that. It's a real LLM response after pgvector recall.

v6.4 also ships:
  - Genshin/Honkai-style UI overhaul across 11 routes
  - UGC talkshow scripts with monthly top-5 carousel
  - "Bar Cluster" — friends chat with the same AI personality, snippets
    merge into a server-rendered 1080×1350 group portrait PNG

Three things I'd love feedback on:
1. Is the reflection layer (events → high-level beliefs) interesting
   to other AI Town / Smallville builders, or too niche?
2. UGC moderation philosophy: we allow ALL corporate-jargon mockery
   ("embrace change" / "granularity" / "graduation"), block only
   specific company / political / sexual / violent content. Right call?
3. Cultural anchor is China-centric — worth doing FAANG-themed English
   fork or stay vertical?

Repo: https://github.com/ChrisChen667788/office-zoo (MIT)
Tech blog: docs/V6_MEMORY_TECH_BLOG.md

I'll be here all day. Ask anything 🙏
```

### 1.7 Gallery 上传 (按顺序拖进 PH 表单)

| # | 文件 | caption |
|---|---|---|
| 1 (cover video) | `assets/launch-demo/hero-combined.mp4` | 30s 米哈游故事 + 真实游戏 (v6.x) |
| 2 | `assets/launch/01-hero-hook.png` | EVENT banner — AI 同事会记得你 |
| 3 | `assets/launch/02-game1-setup.png` | 5★ 角色卡 — 王五 联合 赵六 投李四出局 |
| 4 | `assets/launch/03-game2-payoff.png` | 跨局记忆触发对话框 — "上次..." |
| 5 | `assets/launch/04-tech-arch.png` | pgvector + reflection 技术架构 |
| 6 | `assets/launch/06-settings-beliefs.png` | Settings 页 "💭 他们对你的判断" |
| 7 | `assets/launch/07-fortune-card.png` | 班味占卜 daily tarot |
| 8 | `assets/launch/08-ugc-page.png` | 段子库 UGC 投稿页 (v6.3 新增) |
| 9 | `assets/launch/05-cta.png` | Star 一下 · GitHub URL |

---

## 2 · Hacker News Show 提交 (https://news.ycombinator.com/submit)

### 2.1 Title (80 char max)
```
Show HN: OFFICE ZOO – AI office politics sim with cross-game memory
```

### 2.2 URL field
```
https://github.com/ChrisChen667788/office-zoo
```

### 2.3 Text field (在 Title + URL 都填了之后,可选 Text 框,但 Show HN 推荐贴一段说明)

```
Hi HN — built an open-source social-deduction game where 9 AI agents
argue in Chinese corporate jargon, vote each other out, and REMEMBER
spectators across games.

Tech: pgvector + OpenAI text-embedding-3-small for episodic memory,
Smallville-style reflection layer (events → beliefs) condenses 5-round
event streams into 3-5 high-level judgments injected into the next
turn's prompt. HNSW recall p95 = 15ms on Neon's free tier.

The "wow" moment: in game 2, a passive_aggressive AI opens its first
speech by referencing game 1 unprompted ("last time you called my
granularity insufficient and voted me out, beautifully closed-loop play").
Memory was injected from pgvector — LLM filled in the natural language.

v6 ships with Genshin-style 5★ UI overhaul, UGC talkshow scripts with
monthly top-5 carousel, and a "Bar Cluster" feature where friends chat
1-on-1 with the same AI personality and their snippets merge into a
server-rendered group portrait PNG.

Repo (MIT): https://github.com/ChrisChen667788/office-zoo
Tech blog: https://github.com/ChrisChen667788/office-zoo/blob/main/docs/V6_MEMORY_TECH_BLOG.md
30s demo gif in README.

Happy to answer questions about the memory layer, the cultural choice
(Chinese vertical vs generic), or the moderation philosophy (allow all
corporate-jargon mockery, block specific company names / politics /
NSFW).
```

---

## 3 · 即刻 (https://web.okjike.com) 短帖

```
🐀 OFFICE ZOO v6 上线 (开源 / MIT)

把"职场狼人杀"做成米哈游风游戏 UI 是种什么体验?
9 个 AI 鼠人现在长成 5★ 角色, 跟你聊完会跨局记仇,
你下次在游戏里看到他, 第一句话就是: "上次说我颗粒度不够..."

技术栈: pgvector + OpenAI embedding + Smallville-style
reflection. HNSW recall p95 15ms。

v6.x 还新增:
🎤 段子库 UGC — 你写的段子也能上首页轮播
🍷 朋友拼版 — 跟朋友各聊几句, 后端拼出一张群像 PNG

[gif: hero-combined.gif]

GitHub: github.com/ChrisChen667788/office-zoo

ProductHunt 同步发布中 (帮 upvote 一下感激不尽):
[PH 链接, launch 后填]

#开源 #AI #打工人 #米哈游 #程序员
```

---

## 4 · 小红书 9 图配文 (复用 PROMO_COPY §小红书 段)

照搬 `docs/PROMO_COPY.md` "v6.1 专用文案模板 > 📕 小红书" 段。
9 张图按 §1.7 Gallery 顺序 (1 GIF 转 cover + 8 PNG)。

---

## 5 · Twitter / X 启动 thread (推 launch 时同步发)

### Tweet 1 (主)
```
🐀 Just launched on ProductHunt!

OFFICE ZOO v6 — open-source AI office-politics sim. 9 AI rats argue
in corporate jargon, vote each other out, and now REMEMBER you across
games.

Cross-game memory (pgvector + Smallville-style reflection) + Genshin/HSR
5★ UI overhaul.

[hero-combined.gif]
PH: [link after submit]
```

### Tweet 2 (技术细节, 引用 1)
```
The most surprising moment from testing:

Game 1: you betray a `passive_aggressive` AI.
Game 2 starts. Same AI's first line, completely unprompted:

"@Wang Wu — I haven't forgotten. Last time you called my granularity
insufficient and voted me out. Beautifully closed-loop play."

LLM filled in language. Memory came from pgvector.
```

### Tweet 3 (技术栈, 引用 2)
```
Stack:
- pgvector @ pg17 (HNSW, 1536d)
- OpenAI text-embedding-3-small (via Qingyun aggregator)
- Stanford Smallville reflection layer (events → beliefs, importance ×1.5)
- gpt-4o-mini for speech + reflection
- React 18 + Vite 6 + Hono + Socket.IO

HNSW recall p95: 15ms. Neon 3GB ≈ 300k entries.
MIT, self-hostable.
```

### Tweet 4 (CTA)
```
v6.x also shipped:
🎮 Genshin-style 5★ UI overhaul across 11 routes
🎤 UGC talkshow with monthly top-5 carousel
🍷 Bar Cluster — friends chat the same AI, snippets merge into a
   server-rendered 1080×1350 group portrait

🌟 Star + upvote on PH if you've ever heard "let's circle back on
   granularity" and wanted to scream.

github.com/ChrisChen667788/office-zoo
```

---

## 6 · 准备好的素材清单

| 类别 | 文件 | 体积 |
|---|---|---|
| HERO video | `assets/launch-demo/hero-combined.mp4` | 580 KB / 30s |
| HERO gif | `assets/launch-demo/hero-combined.gif` | 8.3 MB / 30s |
| Real game (v6.4) | `assets/launch-demo/game-highlight.mp4` | 3.0 MB / 30s |
| Real game gif | `assets/launch-demo/game-highlight.gif` | 4.3 MB / 30s |
| Modal demo (新 v6.4) | `assets/launch-demo/cluster-modal-demo.mp4` | 744 KB / 24s |
| Modal demo gif | `assets/launch-demo/cluster-modal-demo.gif` | 5.4 MB / 24s |
| Storyboard 纯版 | `assets/launch-demo/demo-memory.mp4` | 561 KB / 30s |
| 9 张 PR Hunt 图 | `assets/launch/01..09-*.png` (含 08-ugc-page v6.3 新增) | ~5 MB 总 |

---

## 7 · Launch 当天回评模板

### 当有人问 "How is this different from RAG?"
```
Three things:
1. RAG retrieves chat fragments. We retrieve JUDGMENTS — reflection
   condenses events into high-level beliefs before prompt injection.
2. No time decay in RAG. We weight by recency × relevance × importance,
   exponential decay 24h half-life.
3. No identity binding. (agent_archetype, target_user_id) composite key
   means YOUR sass-master remembers YOUR history; your friend gets
   a different version.
```

### 当有人问 "Why Chinese / not English?"
```
Chinese tech-management jargon is funnier — denser per word, more meme-able.
But the disease is universal: "embrace change" / "synergy" / "circle back"
all hit US tech workers too. Localised forks planned for v7 (FAANG English /
Indian H1B / Korean 갑질). Cultural anchor is the moat.
```

### 当有人问 "Privacy concerns?"
```
Memory keyed by pseudonymous browser-id (localStorage), not real account.
Settings page = per-archetype + global Forget. POST /api/memory/forget
for programmatic. Memory in YOUR pgvector — self-host or your own Neon,
not on a third-party server.
```

### 当有人问 "Can I fork for non-office content?"
```
Yes — memory layer is generic (agent_archetype is just a string). Swap
the personality prompts in shared/src/types/personality.ts and system
prompts in agents/BaseAgent.ts and you have a different vertical.
Unmined ideas: hospital politics / family group chat dynamics / faculty
meeting sim.
```

---

## 8 · launch 之后 24h 数据收集 (回来填)

| 指标 | 目标 | 实际 |
|---|---|---|
| PH upvote 24h | ≥ 200 | __ |
| PH upvote 48h | ≥ 500 | __ |
| GitHub stars Δ | +200 | __ |
| HN Show 排名 | 进首页 1 天 | __ |
| Twitter 转发 | ≥ 50 | __ |
| 即刻点赞 | ≥ 200 | __ |
| 小红书收藏 | ≥ 100 | __ |

---

**Last updated**: 2026-05-23 (v6.4)
**Maker handle**: Chris Chen — 待填 PH / Twitter / X
**Hunter**: 待 §HUNTER_OUTREACH.md 流程确认
