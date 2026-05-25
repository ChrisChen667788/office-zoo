<div align="center">

<!-- v6.24 P4 — logo-readme-banner.png is the v2 banner: bigger wordmark
     (Arial Black gold gradient + drop shadow), clean bilingual tagline
     stack. Prior -lockup-final.png archived in assets/brand/. -->
<img src="assets/brand/logo-readme-banner.png" alt="OFFICE ZOO · midnight workplace soap opera · 班味剧场" width="100%" />

### Midnight at the office — AI rats clock in, so you can clock out.

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

## Four ways to play

| | Mode | One-liner |
|---|---|---|
| 🏢 | **Office Zoo Classic** | 2.5D floor plan, 9 rat-people slack + scheme + backstab |
| 🎤 | **Hot Mic** | Real-voice TTS reads every "we need more granularity" out loud |
| ⚖️ | **You're Fired** | 1v1 vs HR, 5 chapters of PRC Labor Contract Law speed-run |
| 🎭 | **Squad** (v1.4) | 2-4 friends + AI director, each carrying an archetype, in a 5-act office sitcom |

## ✨ What's new in v2.x → v3.0 (May 2026)

> Turning "your work-fatigue persona" into an evolving, shareable, replayable identity system.

- 🪪 **24-archetype catalogue** (v2.0.0) — SOE Lifer / FAANG Cog / Startup Veteran / Finance Suit / EdTech Survivor / MCN Hustler / Beijing Drifter / Shanghai Yuppie / Shenzhen Money-chaser / Hangzhou Tech Youth / Chengdu Zen-Slacker / Overseas Escapee — plus the original 12 behavioral archetypes from v1.3
- 🌀 **Archetypes evolve** (v1.5.1 + v2.0.1 + v2.0.2) — every fired chat / squad / talkshow segment / pack completion drifts your 6-trait vector; drift enough and your top archetype flips ("🌀 You evolved into a new persona")
- 🎬 **Daily-drama share card** (v1.5.0) — 1080×1350 IG-portrait PNG, one-tap copy or download; renders in teaser mode or result mode (with grade + comp ratio baked in)
- 🏢 **Tribe-aware recommendations** (v2.1.0 + v2.3.0) — FAANG users get FAANG scenarios; Shanghai users get Lujiazui talkshow bits; Hangzhou users get the "my code-name is 'Wu-Ji'" segment
- 🎭 **Chemistry-aware director** (v3.0.0) — squad director now reads the full archetype mix and writes culture-clash arcs (SOE + FAANG = "iron rice bowl meets OKR speak"), group-portrait arcs (all Beijing drifters), or rival-pair arcs (Grinder + Anti-grinder eye-acting from act 1)
- 🎙️ **Per-beat multi-voice** (v1.4.2) — every squad-act beat plays with the speaker's own archetype voice (sultry sister / dominator / earnest junior) — no voice repetition across a 5-act drama
- 🌐 **i18n for new 12** (v2.2.0) — Profile cards localized in zh/en/ja/ko including translations of region-specific jokes

## What it does

- 🗣️ **Authentic workplace rants** — "Who's the owner on this? Granularity isn't tight enough — let's align the underlying logic first."
- 🔪 **Capitalists optimize coworkers** — each round, the C-suite quietly schedules someone for a "graduation"
- 🗳️ **Town hall + voting** — 8 rats around a table, going at it live via voice TTS
- 👻 **Ghosts keep meddling** — eliminated players unlock "labor arbitration tickets" to fight back through channels

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

> Full per-version "why / what / verified" notes in [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

```
✅ v0.6-v0.9  Isometric floor + activity tick / talkshow / UGC + HR memory / packs + PvP
✅ v1.0       Premium paywall + 6 FAANG layoff scenarios
✅ v1.1       B2B white-label embeds + HR training mode
✅ v1.2       Internationalization (zh-CN / en-US / ja-JP / ko-KR)
✅ v1.3       Identity quiz + 12 archetypes + Y2K personality card
✅ v1.4       Squad mode + multi-voice + room history & leaderboard
✅ v1.5       Daily-drama share card + archetype evolution (single surface)
✅ v2.0.0     12 → 24 archetypes with region/industry tribes
✅ v2.0.1–.2  Evolution extended to squad / talkshow / pack completions
✅ v2.1       Tribe-aware fired-scenario recommendations
✅ v2.2       en/ja/ko translations for the new 12 archetypes
✅ v2.3       Region-tagged talkshow bits → daily drama picks city-flavored jokes
✅ v3.0       Chemistry-aware squad director — culture-clash + group-portrait + rival arcs
🔜 next       Real Stripe checkout · Claude 4.5 director · region-tier FiredLanding filter
```

## License

[MIT](LICENSE) — fork it, ship it, sell it. Just keep the LICENSE file.

## Contributing

PRs welcome. Open issues for ideas. Read [docs/DESIGN.md](docs/DESIGN.md) before submitting visual changes to keep the design system coherent across consumer + B2B surfaces.

---

<div align="center">

*Built with Claude Code · No webfonts, no analytics, no dark patterns.*

</div>
