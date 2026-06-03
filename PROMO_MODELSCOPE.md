# 🐀 OFFICE ZOO · 职场动物园（ModelScope 创空间）

> AI 鼠人替你在职场里斗智斗勇 —— 一个用大模型驱动的中文职场 social deduction 游戏。

OFFICE ZOO 是一个 **AI 多智能体驱动**的中文职场推理游戏：你创建一个"公司"，一群 AI 鼠人员工在工位、茶水间、会议室里摸鱼、甩锅、站队、表演忠诚，而你要从它们的发言里找出"卧底"。每个鼠人的发言、投票、撕逼都由大模型实时生成 —— 没有剧本，每一局都不一样。

---

## 🎬 一句话体验

> "拥抱变化" 拥抱了不到 40 分钟，AI 鼠人替你把这场职场大戏演完。

- 🎭 **AI 自主对话** — 8 个鼠人各有独立人格 / 记忆 / 说话风格，全程大模型生成
- 🗺️ **职场地图** — 鼠人实时走动、摸鱼、倒咖啡、偷偷开会
- 🔥 **班味系统** — 班味指数 / 金句池 / 跨观众排行榜，把"打工人共鸣"量化成分数
- 🏢 **公司主题包** — 自定义"我们公司的 12 个 NPC"，把你和同事搬进游戏

---

## 🧠 它怎么跑起来的

> 下面三张是会动的 SVG —— 金色光点表示数据包实时走向（GitHub `<img>` 引用自动播放）。

**系统架构** · 观众端 → 服务器 → 引擎 → 智能体 → 大模型，Socket.IO 实时广播

<p align="center">
  <img src="assets/diagrams/architecture.svg" alt="OFFICE ZOO 系统架构" width="100%" />
</p>

**PSYWAR 心理战闭环** · 观众战术 @ → AI 听到 → AI 引用 → 班味指数 +6

<p align="center">
  <img src="assets/diagrams/sequence-psywar.svg" alt="PSYWAR 心理战时序" width="100%" />
</p>

**公司主题包数据闭环** · 建包 → 同事开局 → 名单覆盖 → 本公司 Top 排行榜

<p align="center">
  <img src="assets/diagrams/dataflow-companypack.svg" alt="公司主题包数据流闭环" width="100%" />
</p>

- **大模型**：OpenAI 兼容协议接入，可切 MiniMax / 通义千问 Qwen / Qingyun 等
- **语音**：MiniMax speech-2.x TTS，给每个鼠人配音
- **架构**：多智能体 social-deduction，独立记忆链 + 人格 prompt patch

---

## 🙏 致谢

OFFICE ZOO 站在一整套开源 AI 与 Web 生态的肩膀上：

| 方向 | 依赖 |
|------|------|
| 大模型推理 | OpenAI API 规范 · MiniMax · 通义千问 Qwen · Qingyun |
| 多智能体架构 | LLM-as-Agent / Generative Agents 思路（独立人格 + 记忆 + prompt） |
| 后端 / 实时 | Hono · Socket.IO · Node.js |
| 前端 / 交互 | React · Vite · Zustand · Framer Motion |
| 小程序 | glass-easel（微信小程序运行时） |
| 工具链 | Vitest · Playwright · git-cliff · star-history |
| 玩法母体 | Among Us / 狼人杀 / 谁是卧底 |

也感谢真实职场里每一个"拥抱变化"的瞬间 —— 那是班味之源。

> OFFICE ZOO 的目标不是做一个玩具 Demo，而是持续探索"大模型多智能体 + 实时叙事"在中文语境下能有多好玩。

---

## ⭐ Star History

如果这个项目让你会心一笑，欢迎到 GitHub 点一个 Star。

[![Star History Chart](https://api.star-history.com/svg?repos=ChrisChen667788/office-zoo&type=Date)](https://www.star-history.com/#ChrisChen667788/office-zoo&Date)

---

## 🔗 链接

- GitHub 主页：https://github.com/ChrisChen667788/office-zoo
- 反馈：GitHub Issues

（注：本页为 ModelScope 创空间宣传文案，与仓库 [README](README.md) 同步维护。）
