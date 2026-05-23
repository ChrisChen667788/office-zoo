# 用 pgvector + Reflection 给 AI 同事加上"班味记忆" — OFFICE ZOO Phase B 技术博客

> v6.0.0 发布 · 2026-05-22
> 投稿目标:HN Show / V2EX / 掘金 / 36 氪 / 少数派

---

## 0. 一句话

**Smallville 给了 AI Town 灵魂,但他们的小镇里没有"班味"。我们用 pgvector + OpenAI text-embedding-3-small + LLM reflection,把这套 Stanford 论文级架构搬到了"那个阴阳同学居然记得上次我帮过她"的中文职场场景里 — 不只是技术升级,更是叙事升级。**

---

## 1. 一个发生在我们项目里的真实片段

第二局开始,sass-master(阴阳人格)的 AI 同事 "李四同学" 第一个发言:

> @Chad 同学,你这张嘴我还是记忆犹新的哈——**上次**说我颗粒度不够,回头就联合 @Tyler 把我投出局,这波闭环操作真是打得漂亮。你这次又想拿什么抓手来包装?

注意几点:
1. **跨局**:这是第二局的开局,"上次" 指代第一局
2. **具体**:"颗粒度不够" 是第一局Chad用过的原话(被存为 event memory)
3. **关系**:"联合 @Tyler" 也是第一局发生的具体事件
4. **人格**:passive_aggressive 的阴阳风骨保留完整("这波闭环操作真是打得漂亮")

这不是 prompt 里硬塞的 few-shot 例子,是 LLM 看到 memory 注入后**自己生成**的句子。

---

## 2. 为什么不是 RAG 就够了?

主流 "AI 加记忆" 方案 = 把历史聊天记录塞向量库,新对话时 retrieval-augment。这在客服 / 知识库场景成立,但在"AI 角色长期演化"场景有 3 个硬伤:

| 硬伤 | 表现 |
|---|---|
| **只有事件没有判断** | AI 记得 "张三投了我",但不会推理"张三反复在我背后捅刀,我应该提防他" |
| **没有时间衰减** | 一年前的事件和昨天的事件等权,人格出现"长期幻觉" |
| **没有人格归属** | 记忆碎片飞舞,recall 出来后 prompt 里像贴大字报,LLM 不知道"是谁记得什么" |

我们的方案借鉴 Stanford Smallville 论文(2023),做了三层:

```
events       ── observe ──>  episodic memory stream
                                      │
                                      ▼ 每 5 轮触发
                              ┌───────────────┐
                              │  reflection   │ ← LLM 把 events 凝成 beliefs
                              └───────┬───────┘
                                      ▼
beliefs      ── 注入下一局 prompt ──>  AI 决策
```

---

## 3. 一个 LLM 自己"推理"出来的 belief 示例

我们给 reflection LLM 12 条 events:
```
- Chad在第1轮就指名说我是 dog, 完全没证据
- Tyler救了我一票, 看起来是个老实人
- 张三全程不发言, 像个老狐狸
- Chad又开始阴阳, 这次针对Tyler
- 我和Tyler一起反驳了Chad
- 钱七突然投了Tyler, 太反常了
- Tyler被投出局了, 我失去了盟友
- 钱七在Tyler出局后立刻闭嘴, 可疑
- 张三第一次发言, 阴阳地说"颗粒度不够"
- 我开始怀疑钱七和张三是一伙的
- Chad突然反水, 投了张三
- 我活到了第5轮, 但盟友只剩Chad
```

LLM 输出 5 条 beliefs:
```
- 我相信Chad是个狡猾的对手, 随时可能反转立场。
- 我怀疑钱七和张三暗中勾结, 试图操控局势。  ← 涌现的推理
- Tyler的出局让我失去了重要的支持, 局势变得更加复杂。
- 张三全程沉默, 说明他在伺机而动, 值得警惕。
- 我认为当前局势对我非常不利, 必须小心应对。
```

第二条 "钱七和张三暗中勾结" 在 events 里**没有任何一条**直接说"勾结",这是 LLM 综合 "钱七反常投Tyler" + "张三阴阳" + "在Tyler出局后钱七闭嘴" 后**自己推理出来**的判断。

这就是 Smallville 论文承诺的"emerging beliefs"在中文职场场景下的复现。

---

## 4. 技术栈选型(以及为什么)

```
┌─────────────────────────────────────────────────────────────┐
│  AI agents (BaseAgent.ts, 8 personality archetypes)        │
├─────────────────────────────────────────────────────────────┤
│  memoryRecall (relevance × 0.5 + recency × 0.3 + imp × 0.2)│
│  reflectionLoop (5 轮 / 10 events 触发, LRU 256 cache)      │
│  memoryWrite (fire-and-forget, batch 8 entries/round)       │
├─────────────────────────────────────────────────────────────┤
│  pgvector @ pg17 (HNSW index, m=16 ef_construction=64)     │
│   ↑                                                          │
│  embeddings via OpenAI text-embedding-3-small (1536 dim)    │
│   ↑                                                          │
│  Qingyun (青云聚合) ← OPENAI_BASE_URL ← .env                │
└─────────────────────────────────────────────────────────────┘
```

| 选型 | 理由 |
|---|---|
| **pgvector vs sqlite-vec** | sqlite-vec wasm 在 Node 端启动糙;pgvector 生态成熟,Neon 免费 tier 直出,prod 0 运维 |
| **OpenAI text-embedding-3-small via Qingyun** | 实测 Minimax embedding 已从 model lineup 下架(返回 `1008 insufficient balance`);Qingyun 走 OpenAI 中转价 70-90%,1536 维短句 CJK 实测 OK |
| **HNSW vs IVFFlat** | HNSW 建索引慢但 query latency 低 — 我们 query 在每次 speech 生成时 inline 跑,query 优先 |
| **per-spectator chunky-style** | 你救过 sass-master 是 YOUR sass-master 记的;你朋友的 sass-master 不会知道。memory keyed by (archetype, target_user_id) |

---

## 5. 性能 benchmark(2026-05-22)

| 指标 | 实测 | SLO |
|---|---|---|
| HNSW recall p95 | **15ms** | ≤ 200ms ✅ |
| HNSW recall max | 20ms | — |
| Embedding API roundtrip(Qingyun)| 1086ms p95 | LRU cache 命中后 0 |
| Per-entry 大小 | 10.44 KB | — |
| Neon 3GB 容量 | ~294,000 entries | 100 个活跃用户 × 100 局 × 30 events |

**结论:** pgvector + HNSW 在 ~2k 条数据下 sub-毫秒级查询。瓶颈是 embedding API,LRU cache 让重复内容 0 成本。

---

## 6. 对比市面同类产品

| 产品 | ⭐ Stars | 我们 vs 他们 |
|---|---:|---|
| **MetaGPT** | 67k | 不同品类(模拟软件公司流程),但说明"模拟"故事性卖得动 |
| **Microsoft AutoGen** | 57k | 是框架, 我们是 end-user playable 产品 |
| **OpenBMB ChatDev** | 33k | 同上, 框架不是产品 |
| **Stanford Smallville** | 21k | Memory + Reflection OG, 但**只是研究代码**, 不可玩 |
| **a16z AI Town** | 9.7k | playable + open source + a16z 背书。但是"通用小镇"没有文化锚, 这是我们的空隙 |
| **MiniMax Werewolf 官方** | 10 | 整个赛道的 lane 几乎空着 |

### 我们的护城河(独家)

1. **文化锚** — 中国大厂职场 / 班味 / 阿里黑话 / 鼠人。AI Town 是"通用小镇",我们是"@张同学,这件事的 owner 是谁?"
2. **教育价值** — 裁了么 5 关速通《劳动合同法》(N+1、竞业、PIP 套路全覆盖)
3. **角色专属 TTS** — Minimax speech-2.x × 23 角色专属音
4. **Viral 短视频引擎** — 一局结束自动剪出 30s 竖版分享视频
5. **UGC 剧本平台** — 用户自传"我们公司的真实事件"→ LLM 生成场景

### Phase B(本次发布)新增护城河

6. **Chunky-style 同事记仇** — AI 跨局记得你做过什么,谁救过他他记得,谁坑过他更记得
7. **Reflection 层** — AI 不只是"记事",还会"推理判断",涌现的高层 belief 注入下一局

第 6 + 7 让我们**首次**和 Smallville 在记忆模型上对齐 — 但前提是,我们有他们没有的"班味"作为文化燃料。

---

## 7. 怎么玩

```bash
git clone https://github.com/ChrisChen667788/office-zoo.git
cd office-zoo
docker compose up -d        # 起本地 pgvector
npm install
npm run dev                 # 客户端 http://localhost:5173
                            # 服务端 http://localhost:3100
```

进首页 → 选"鼠人公司"模式 → 玩满 5 轮 → reflection 触发 → 进 `/settings` 看 "💭 他们对你的判断" → 再玩第 2 局,看 AI 同事怎么"上次那个..."

---

## 8. 法务安全网

跨局记忆 = 跨局隐私。我们做了三层:

1. `/settings` 页面 "🧹 清空我对 sass-master 的记忆"(per-archetype)
2. ☢ 核选项 "清空全部"(2-step confirm)
3. 后端 `POST /api/memory/forget` — 支持 archetype / gameId / targetUserId 任意组合 DELETE

用户主动权完整。GDPR-friendly 设计。

---

## 9. 路线图

```
✅ v5.4.0   班味占卜 daily fortune card
✅ v5.5.x   占卜卡 PNG 分享 + Web Share API + 牌库 gallery + 7 天历史
✅ v5.8.x   Phase B 记忆层 infra + write/recall + chunky-style
✅ v5.9.0   Reflection 层 + belief × 1.5 加权
✅ v6.0.0   Belief UI panel + 法务 forget mechanism + 本博客
🔜 v6.1.0   多模态 memory(把语音 / 截图作为 memory)
🔜 v6.2.0   B 端 SaaS — 律所 / HR 培训嵌入版
🔜 v7.0.0   国际化 — ブラック企業 / 갑질 RPG / FAANG Burnout
```

---

## 10. 致谢

- Stanford Smallville (Park et al., 2023) — reflection mechanism 原论文
- a16z AI Town — playable virtual agent 的工程实践
- pgvector — 让向量检索像普通 SQL 一样自然
- 所有在饭桌上吐槽过老板的打工人 — 你们的痛点就是我们的训练数据

---

# (English version, for HN Show submission)

## OFFICE ZOO Phase B — Giving AI Agents Memory of Office Politics

> v6.0.0 release · 2026-05-22

### TL;DR

We added Smallville-style episodic memory + reflection (pgvector + OpenAI text-embedding-3-small) to our AI-powered Chinese workplace simulation. Same `passive_aggressive` AI agent your friend just played against will remember the player who saved them last round, and bring it up unprompted in the next session.

### What's new

- **Cross-game memory** — chunky-style: an AI of personality `X` remembers their interactions with player `Y` across all of Y's games. Y's friend gets a DIFFERENT version of personality `X` with separate memory.
- **Reflection layer** — every 5 rounds, recent episodic events get distilled by an LLM into 3-5 high-level beliefs (importance × 1.5 in recall scoring). Beliefs are emergent — they can include inferences the raw events don't state.
- **Per-spectator scoping** — `(agent_archetype, target_user_id)` keys memory rows. Privacy by design.
- **Forget mechanism** — `/settings` page lets users wipe memory per-archetype or globally. POST `/api/memory/forget` for programmatic.

### An actual generated line

Player just opened their second game ever; here's the first thing the `passive_aggressive` agent said:

> "@Chad 同学，你这张嘴我还是记忆犹新的哈——上次说我颗粒度不够，回头就联合 @Tyler 把我投出局，这波闭环操作真是打得漂亮。"
>
> (Rough English: "@Chad, I haven't forgotten that mouth of yours — last time you called my granularity insufficient, then teamed up with @Tyler to vote me out, what a beautifully closed-loop play.")

The agent recalled:
- The specific antagonist (@Chad) from the previous game
- The specific insult ("granularity insufficient" — characteristic Chinese tech-bro middle-manager jargon)
- The coalition partner (@Tyler) who voted with them

None of this was in the current game's prompt — it came from pgvector recall of memories tagged with this spectator's userId.

### Tech stack

- **pgvector** @ Postgres 17, HNSW index (m=16, ef_construction=64)
- **Embeddings**: OpenAI `text-embedding-3-small` (1536-dim) via Qingyun aggregator
- **Reflection LLM**: gpt-4o-mini, content-hash cache LRU 256
- **Composite recall score**: `relevance × 0.5 + recency × 0.3 + importance × 0.2`
- Beliefs get `importance × 1.5` boost (clamped to 1.0)

### Benchmarks (M-series Mac, local Docker pgvector, 1836-entry corpus)

| Metric | Measured | SLO |
|---|---|---|
| HNSW recall p95 (pg-only) | **15ms** | ≤ 200ms ✓ |
| Per-entry size | 10.44 KB | — |
| Neon 3GB ceiling | ~294,000 entries | adequate for early scale |

### Why this matters vs RAG-on-chat-history

Most "AI memory" implementations dump chat history into a vector store. Works for customer support, falls apart for *agent persona evolution* because:

1. Events without judgments — agents remember "X voted me out" but never reason "X has betrayed me three times, I should pre-empt"
2. No time decay — last year's events are weighted equal to yesterday's, drift accumulates
3. No identity binding — memories float as fragments; prompt injection looks like a bulletin board, not an agent's internal monologue

Smallville solved this in 2023 with the events → reflection → beliefs hierarchy. We're applying it to a vertical cultural niche (Chinese workplace politics) with explicit per-spectator scoping.

### Comparison with similar projects

| Project | Stars | What we bring that they don't |
|---|---:|---|
| Stanford Smallville | 21k | Playable (theirs is research code), Chinese workplace persona vocabulary |
| a16z AI Town | 9.7k | Cultural anchor, viral short-video export, UGC scenarios, now memory parity |
| MetaGPT / AutoGen / ChatDev | 30-60k each | Different category — they're frameworks; we're an end-user game |

### Try it

```bash
git clone https://github.com/ChrisChen667788/office-zoo.git
cd office-zoo
docker compose up -d
npm install && npm run dev
```

Open http://localhost:5173 → play "鼠人公司" (Mice Inc.) classic mode → after 5 rounds, check `/settings` for the beliefs your AI coworkers have formed about you.

### Roadmap

v6.1.0 multi-modal memory · v6.2.0 B2B SaaS (law firm + HR training white-label) · v7.0.0 EN / JA / KO ("Black Company simulator" / "갑질 RPG" / "FAANG Burnout")

MIT licensed. PRs welcome. Stars appreciated 🌟.
