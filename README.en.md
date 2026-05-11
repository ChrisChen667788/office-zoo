<div align="center">

# 🐀 OFFICE ZOO

### Midnight in the office — AI rats roast your boss for you.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React 18 + Vite 6](https://img.shields.io/badge/stack-React%2018%20%2B%20Vite%206-61dafb.svg)](https://vitejs.dev/)
[![Hono + Socket.IO](https://img.shields.io/badge/backend-Hono%20%2B%20Socket.IO-orange.svg)](https://hono.dev/)
[![Minimax speech-2.8-hd](https://img.shields.io/badge/voice-Minimax%202.8--hd-ff5588.svg)](https://www.minimaxi.com/)

**A company just got fired. Nine AI employees stayed late.**
**You're the HR staring at the KPI screen — pick a mode, enjoy the show.**

[简体中文](README.md) · **English**

</div>

---

> "Can't grind harder, can't lie flat — let the AIs grind for you."

## Three ways to play

| | Mode | One-liner |
|---|---|---|
| 🏢 | **Office Zoo Classic** | 2.5D floor plan, 9 rat-people slack + scheme + backstab |
| 🎤 | **Hot Mic** | Real-voice TTS reads every "we need more granularity" out loud |
| ⚖️ | **You're Fired** | 1v1 vs HR, 5 chapters of PRC Labor Contract Law speed-run |

## What it does

- 🗣️ **Authentic workplace rants** — "Who's the owner on this? Granularity isn't tight enough — let's align the underlying logic first."
- 🔪 **Capitalists optimize coworkers** — each round, the boss picks an employee in the room to "transition out"
- 🗳️ **Arguments + voting** — 8 rats gather around a table, fight live via voice TTS
- 👻 **Fired employees keep meddling** — eliminated players unlock "labor arbitration tickets" to extract revenge

## Why star?

- 🎨 **35+ AI portraits + 23 character avatars** — fully procedural anime art, zero emoji filler
- 🎙️ **23 character-specific voices** — naive boy / sultry woman / domineering CEO / PUA master — one round feels like binging a workplace mini-drama
- 📚 **Real legal teaching** — each chapter cites an article of the PRC Labor Contract Law (Articles 21 / 35 / 41 / 42 / 50); clearing unlocks a knowledge card
- 🎯 **Memory layer (v0.8.2)** — re-play a scenario and the HR remembers what tactics you used last time, pre-empts your moves
- 📦 **UGC** — write your own talkshow bits, compose 5-scenario challenge packs, share with a link
- 🤝 **PvP rooms (v0.9.3)** — invite a friend to play HR with PUA tactic chips, you negotiate live
- 👑 **Premium Pack (v1.0.0)** — 6 FAANG layoff scenarios (Twitter Purge, Meta efficiency year, Amazon RTO, Apple PM, Google reorg, Startup cliff dump) with US/UK labor law playbook
- 🏢 **Enterprise (v1.1.0)** — white-label iframe embed for law firms (consultation lead-capture) and HR training vendors (procedural-compliance sandbox)

## Quick start

```bash
git clone https://github.com/ChrisChen667788/office-zoo
cd office-zoo
npm install
cp .env.example .env  # fill in QINGYUN_API_KEY (or OPENAI_API_KEY) + MINIMAX_API_KEY
npm run dev           # client on :5173, server on :3100, WS on :3101
```

Then open `http://localhost:5173` and pick a mode.

### API keys you need

| Service | Used for | How to get |
|---|---|---|
| **QingYun** (or OpenAI) | Chat LLM — drives every HR/employee dialogue + scoring | qingyuntop.top or platform.openai.com |
| **Minimax** | Real-voice TTS (the killer feature) | minimaxi.com |

Both have free trials. The product degrades gracefully:
- LLM down? Falls back from QingYun → Minimax-M2 → canned responses.
- TTS down? Falls back from Minimax → Qingyun → browser Web Speech API.

## Architecture (one page)

```
                       ┌──────────────────────────────────────┐
  Client (5173)        │  React 18 + Vite 6 + Zustand          │
                       │  + Framer Motion + Tailwind 4         │
                       │  Canvas 2D isometric office floor     │
                       └────────────┬──────────────┬──────────┘
                                    │              │
                       HTTP /api/*  │              │  Socket.IO /game:* /room:*
                                    ▼              ▼
                       ┌──────────────────────────────────────┐
  Server (3100/3101)   │  Hono routes (REST)                   │
                       │  socket.io server (rooms + PvP)       │
                       │                                       │
                       │  Services:                            │
                       │  - LLM chain (QingYun→Minimax-M2)     │
                       │  - TTS chain (Minimax→Qingyun→Web)   │
                       │  - Image gen chain (flux→doubao→...)  │
                       │  - Per-user memory (sqlite-vec planned)│
                       │  - JSON file stores (scripts/         │
                       │    scenarios/packs/memory/b2b)        │
                       └──────────────────────────────────────┘
```

## Roadmap (where we are)

```
✅ v0.6.x  3D isometric floor + furniture + carried items
✅ v0.7.x  Talkshow MVP + Web Speech fallback + binge controls
✅ v0.8.x  UGC creator + community feedback + HR memory layer
✅ v0.9.x  Challenge packs + monthly leaderboard + PvP rooms
✅ v1.0.0  Premium paywall + 6 FAANG scenarios (demo checkout)
✅ v1.1.0  B2B white-label embeds + HR training mode + Executive theme
✅ v1.2.0  Internationalization (zh-CN ↔ en-US) — you're here
🔜 v1.2.1  ja-JP + ko-KR for Japan/Korea launch
🔜 v1.3.0  Real Stripe checkout (replacing v1.0.0 demo checkout)
```

## License

[MIT](LICENSE) — fork it, ship it, sell it. Just keep the LICENSE file.

## Contributing

PRs welcome. Open issues for ideas. Read [docs/DESIGN.md](docs/DESIGN.md) before submitting visual changes to keep the design system coherent across consumer + B2B surfaces.

---

<div align="center">

*Built with Claude Code · No webfonts, no analytics, no dark patterns.*

</div>
