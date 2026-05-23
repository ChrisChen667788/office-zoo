# OFFICE ZOO · ProductHunt Launch Kit

> 准备发布到 https://www.producthunt.com/posts/new
>
> v6.0.0 (2026-05-22) — Phase B 记忆层完整落地后第一次正式 launch。
> Asset 在 `assets/launch/`,demo GIF / MP4 在 `assets/launch-demo/`。

---

## 📅 发布前 24h checklist

| | 项 | 状态 |
|---|---|---|
| ☐ | 选定 launch 日(周三 / 周四最佳, 避开 PH 自带活动日)| — |
| ☐ | 太平洋时间 00:01 PST 发布 (北京时间 16:01) | — |
| ☐ | maker account 完整: 头像 + bio + Twitter linked | — |
| ☐ | hunter(可选)— 找一个 1k+ followers 的活跃 hunter 帮 launch | — |
| ☐ | 提前 7 天发"我即将 launch"预告到 Twitter / 即刻 / 小红书 | — |
| ☐ | GIF / MP4 用 launch-demo/ 下的 demo-memory.* 上传到 PH | ✅ 已备 |
| ☐ | 7 张 gallery 图按下文顺序上传 | ✅ 已备 |
| ☐ | first-comment 写好放剪贴板, 发布后 30 秒内回贴 | ✅ 见下 |
| ☐ | 给 20 个朋友提前打招呼: "周四请帮 upvote" | — |
| ☐ | 准备一份 Q&A 模板回评论, 起码 4 小时挂机回 | ✅ 见下 |

---

## 🎯 Tagline / Name / Topic

### Name (40 char max)
**OFFICE ZOO** — 一律大写,4 + 3 字符,占位干净。

### Tagline (60 char max)

**🇨🇳 中文(发到中文区如 Linux China / 即刻同步)**
> AI 鼠人替你拥抱变化,你回家躺平。

**🇬🇧 English (PH 主版)**
> AI rats remember everything — open-source workplace sim with memory.

候选 EN tagline(根据节日 / 受众微调):
- A: `AI rats remember everything — open-source workplace sim with memory.` (default)
- B: `Smallville for office politics — 9 AI rats with cross-game memory.`(技术受众)
- C: `Your AI coworkers hold grudges. Open-source. MIT.` (punchy + 神秘)

### Topics (选最相关的 3-4 个)
- `Open Source`
- `Artificial Intelligence`
- `Productivity`(讽刺的副标签 — 强反差 sell)
- `Games`

---

## 🖼️ Gallery — 8 张图顺序 + 单图标题(v6.3 升级)

ProductHunt gallery 默认横屏 cover (`1270×760`) + 后续可竖可横。我们的全部
都是 720×720 方形(自带 demo 视觉一致性),稳定。

| # | 文件 | 用途 / 标题(图片下方 caption)|
|---|---|---|
| 1 | `assets/launch-demo/hero-combined.gif` 或 `.mp4` | **HERO** — 30s 米哈游故事 (15s) + 真实游戏 (15s) 合成,**新版本主推** |
| 2 | `assets/launch/01-hero-hook.png` | 一句话开场 — "AI 同事会记得你" + 产品身份 (米哈游风) |
| 3 | `assets/launch/02-game1-setup.png` | 场景一:第 1 局,@Chad 联合 @Tyler 把李四投出局(memory 写入 pgvector)|
| 4 | `assets/launch/03-game2-payoff.png` | 场景二:第 2 局,李四第一句话:"@Chad,你这张嘴我记忆犹新,上次..." |
| 5 | `assets/launch/04-tech-arch.png` | 幕后架构 — pgvector / OpenAI embedding / Reflection / Privacy / 15ms p95 |
| 6 | `assets/launch/06-settings-beliefs.png` | 真产品截图 — Settings 页 "💭 他们对你的判断" + 一键 Forget |
| 7 | `assets/launch/07-fortune-card.png` | 副玩法 — 班味占卜 daily tarot(viral 引流 surface) |
| 8 | `assets/launch/08-ugc-page.png` | **v6.3 新** — 段子库 UGC 投稿页,⭐ 本月精选 + 真实表单状态 |
| 9 | `assets/launch/05-cta.png` | 收尾 — "Star 一下, 精神工位 +1, 班味 -1" + GitHub URL |

> ProductHunt 允许 1 视频 + 多图,把 GIF 当 cover video 最有效。

---

## 📝 Description (240 char max for tag-line + 400 word for description)

### Short pitch (≤ 240 char)

```
OFFICE ZOO is an open-source AI office politics sim.
9 LLM-powered "office rats" hold meetings, argue, and vote each other out.
NEW in v6.0: cross-game memory — the AI remembers what you did last game.
MIT. pgvector + Smallville-style reflection.
```

### Long description

```
We took the social-deduction game (Werewolf / Mafia / Among Us) and added
two twists: (1) every character is an LLM-powered AI agent with a distinct
personality archetype (sass-master, sycophant, workaholic …), and (2)
they REMEMBER each spectator across games.

In v6.0 Phase B, we ported the memory + reflection mechanism from the
Stanford Smallville paper (Park et al. 2023) into a vertical use case:
Chinese workplace politics with all the bad corporate jargon ("embrace
change", "C-suite alignment", "let's circle back on granularity"). The
result: an AI that genuinely "holds a grudge" — last time you saved them
in voting, they thank you; last time you sold them out, they bring it up
before round 1 even starts.

### What's in it
- 9 AI personality archetypes, each with distinct prompt + LLM TTS voice
- 5-chapter labor-law speed run ("You're Fired" mode) — actually teaches
  PRC Labor Contract Law via game scenarios
- Daily tarot fortune card ("班味占卜") — Z-gen viral surface, share to
  WeChat / Xiaohongshu as 1080×1350 PNG one-tap
- pgvector + OpenAI text-embedding-3-small for memory recall
- Per-spectator memory scoping + one-tap Forget (privacy by design)
- Bench: HNSW recall p95 = 15ms · Neon free tier handles 300k entries

### Why ProductHunt
Building public, MIT-licensed. If you're a tech worker who's tired of
"embrace change" rhetoric, you'll feel seen. If you're an indie hacker,
the reflection-layer code is genuinely portable. If you're a researcher,
this is the first Smallville-style memory implementation in a Chinese
cultural niche.

Try it locally:
  git clone https://github.com/ChrisChen667788/office-zoo
  cd office-zoo
  docker compose up -d && npm install && npm run dev

Tech blog with the LLM-generated "AI grudge" example:
  docs/V6_MEMORY_TECH_BLOG.md
```

---

## 💬 First Comment (maker reply, 发布后 30 秒内贴)

```
Hi PH! Maker here 🐀

Quick context: I'm a Chinese tech worker who built this as a coping
mechanism for years of "embrace change" / "C-suite alignment" /
"granularity not deep enough" rhetoric. So the AI agents speak in
exactly that voice — and now, as of v6.0, they REMEMBER what you did
to them across games.

The 30s demo above shows the most surprising moment we found while
testing: a fresh game starts, the same `passive_aggressive` AI sees
your username, recalls from pgvector that you betrayed them 2 games
ago, and opens their first speech with:

  "@Chad — I haven't forgotten that mouth of yours. Last time you
   called my granularity insufficient, then teamed up with @Tyler
   to vote me out. Beautifully closed-loop play."

We didn't prompt that. It's a real LLM response after recall.

Three things I'd love feedback on:
1. Is the reflection layer (events → high-level beliefs) interesting
   to other AI Town / Smallville builders, or too niche?
2. Privacy: we built one-tap "AI Forget" early. Is the UX clear?
3. The cultural anchor is China-centric. Worth doing FAANG-themed
   English fork or stay vertical?

Repo: https://github.com/ChrisChen667788/office-zoo (MIT)
Tech blog: docs/V6_MEMORY_TECH_BLOG.md

I'll be here all day. Ask anything 🙏
```

### 中文同步评论(给即刻 / 小红书引流过来的人)

```
作者本人在此 🐀

简单背景: 我是一个被"拥抱变化 / 颗粒度不够 / 拉齐认知"折磨了 5 年的
中文打工人,这个项目某种程度上是我的发泄出口。AI 角色说的话就是那
套黑话,而且 v6.0 之后,他们会跨局记住你。

上面 30s 演示的精彩点: 第 2 局开局,passive_aggressive 这个 AI 看
到你的 userId,从 pgvector 里捞出"2 局前你坑过我"的记忆,第一句话
直接:

  "@Chad 同学,你这张嘴我还是记忆犹新的哈——上次说我颗粒度不够,
   回头就联合 @Tyler 把我投出局,这波闭环操作真是打得漂亮。"

这是 LLM 自己生成的,我们只是把 memory 注入了 prompt。

3 个想听反馈的:
1. Reflection 层(events → high-level beliefs)的设计有没有可借鉴
   的地方?
2. Privacy: Settings 页一键清空 AI 对你的记忆, UX 够不够直白?
3. 文化锚定在中国职场,要不要做 FAANG / 印度 IT / 韩国甲方 这种英
   文 fork?

仓库: https://github.com/ChrisChen667788/office-zoo (MIT)
技术博客: docs/V6_MEMORY_TECH_BLOG.md

挂在这里等评论 🙏
```

---

## 🤔 Q&A 模板 — 4h 内必回的高频问题

### Q1: "Isn't this just RAG over chat history?"

> Three reasons no:
> 1. RAG retrieves chat fragments. We retrieve **judgments** —
>    reflection condenses events into "X has betrayed me 3 times,
>    pre-empt" before injection.
> 2. RAG has no time decay. Our `recencyScore = exp(-age/24h)`
>    weights the formula by `relevance×0.5 + recency×0.3 + importance×0.2`.
> 3. RAG has no identity binding. Our `(agent_archetype, target_user_id)`
>    composite key means YOUR sass-master remembers YOUR history;
>    your friend's sass-master starts fresh.

### Q2: "Why pgvector vs sqlite-vec / pinecone / etc?"

> sqlite-vec wasm is rough on Node + needs node-gyp.
> Pinecone is paid + vendor lock-in.
> pgvector is a Postgres extension — Neon free tier hosts it,
> 0 ops for prod, 1-line `CREATE EXTENSION vector` for dev.
> Plus the recall formula being in JS (not SQL) lets us tune the
> weights without DB migrations.

### Q3: "How much does the embedding API cost?"

> We use OpenAI `text-embedding-3-small` via Qingyun (Chinese OpenAI
> aggregator) at ~70-90% of direct price. A typical game session
> writes ~30 events; cost is ~$0.00006 per game. LRU cache hits
> bring repeat-content cost to 0.

### Q4: "Can I use this for non-office content?"

> Yes — fork it. The memory layer is generic (`agent_archetype` is
> just a string). Swap the personality prompts in
> `shared/src/types/personality.ts` and the system prompts in
> `agents/BaseAgent.ts` and you have a different vertical.
> Suggested: "Hospital politics sim" / "Family group chat
> dynamics" / "Faculty meeting sim" — all unmined.

### Q5: "What about privacy / GDPR?"

> Memory is keyed by a pseudonymous browser-id (localStorage), not
> a real account. Settings page has per-archetype + global Forget.
> Server endpoint `POST /api/memory/forget` for programmatic.
> The memory is in YOUR pgvector (you self-host or use your own
> Neon instance), not on any third-party server.

### Q6: "Why Chinese vibes specifically? I'm in the US."

> Three reasons:
> 1. Burned-out tech worker is universal — the JARGON is just
>    cultural skin (Chinese: 拥抱变化; US: synergy / circle back;
>    JP: ブラック企業; KR: 갑질). Same disease.
> 2. The Chinese tech-management jargon is funnier — denser per
>    word and more meme-able. (Try saying "embrace change" without
>    a slight wince.)
> 3. We plan localised forks (FAANG English / Indian H1B / Korean
>    갑질) once we get community signal.

### Q7: "What's the LLM model?"

> Currently `gpt-4o-mini` via Qingyun for speech + reflection.
> The voice TTS is Minimax `speech-2.8-hd` (23 distinct character
> voices). Both swappable via .env.

---

## 🚀 Cross-post sequence (PH launch + 0h, +2h, +4h)

| t | 平台 | 内容 |
|---|---|---|
| +0h | ProductHunt | launch + first-comment |
| +0h | Twitter / X | "Just launched on PH! AI rats with memory →" + GIF + PH link |
| +30m | 即刻 / Linux China | 中文版 first-comment + PH link |
| +2h | Hacker News (Show HN) | English title: "Show HN: OFFICE ZOO — AI office politics sim with cross-game memory" + tech-blog link (NOT PH link, HN prefers source) |
| +4h | 小红书 | 5 张 9:16 截图 + "我做了个 AI 同事会记你仇的开源项目" + 引导评论区 |
| +6h | V2EX `分享创造` | docs/PROMO_COPY.md L113+ 的现成文案 |
| +12h | 掘金 | 转载 V6_MEMORY_TECH_BLOG.md + 引流 PH |
| +24h | Reddit `r/cscareerquestions` / `r/antiwork` | EN 版 + 文化解释 |
| +24h | ModelScope 主页 | 已有 PROMO_MODELSCOPE.md 模板, 发主页 + 引流 PH |

---

## 📊 成功指标

| 指标 | 目标 | 备注 |
|---|---|---|
| PH upvote 24h | ≥ 200 | 进 Daily Top 10 |
| PH upvote 48h | ≥ 500 | 有机会上 Weekly |
| GitHub stars 48h | +200 | 来自 PH + HN + Twitter |
| HN Show 排名 | 进首页 1 天 | 优秀的 outlier |
| 邮件订阅 | ≥ 50 | 引流到 newsletter |
| 评论质量 | ≥ 30 条 5+ 字回复 | 真讨论而非 emoji 灌水 |

---

## ⚠️ 防雷点

1. **不要让贴文看起来像"反公司"** — 软化版文案已经做了, 但回评时注意
   不要"老板都是坏的"这种二极管发言。每个 reply 都从产品 / 技术角度,
   不要 vent。
2. **不要承诺中文 LLM 中文 prompt 可以无缝迁移到英文** — 文化包裹紧,
   prompt 需要重写。诚实说"需要 fork"。
3. **不要把 sass-master / passive_aggressive 这些技术名词当成主推词** —
   对非中文用户讲, 翻译成 "the sarcastic one" / "the passive-aggressive
   one" 更直观。
4. **不要在 PH 评论区做主页跳转链接 spam** — 一次 first-comment 给 GitHub
   + tech-blog 两条就够, 后续回评中不要重复贴。

---

## 📦 一键打包(给 hunter 用)

把下面 3 个文件 zip 起来发给 hunter:
- `assets/launch-demo/demo-memory.mp4` (PH cover)
- `assets/launch/01..08-*.png` (gallery 8 张, 含 v6.3 新增 08-ugc-page)
- `docs/PRODUCTHUNT_LAUNCH_KIT.md` (本文件, 给 hunter 看上下文)

```bash
cd assets
zip -r ../office-zoo-launch-kit.zip launch/ launch-demo/demo-memory.mp4
```

---

## 🎬 备用素材清单

- 30s GIF: `assets/launch-demo/demo-memory.gif` (723 KB)
- 30s MP4: `assets/launch-demo/demo-memory.mp4` (389 KB)
- 5 张 storyboard 静态帧: `assets/launch/01..05-*.png`
- 2 张真产品截图: `assets/launch/06-settings-beliefs.png` + `07-fortune-card.png`
- 技术博客: `docs/V6_MEMORY_TECH_BLOG.md` (中英双版)
- 文案库: `docs/PROMO_COPY.md` (小红书 / 即刻 / V2EX / B 站文案)
- 魔搭文案: `docs/PROMO_MODELSCOPE.md`
- RFC: `docs/V5.8_MEMORY_RFC.md` (技术深度受众)
- 完整 changelog: `docs/CHANGELOG.md` (v5.4.1 → v6.0.0 全记录)

---

**Last updated**: 2026-05-22 (v6.0.0)
**Repo**: https://github.com/ChrisChen667788/office-zoo
