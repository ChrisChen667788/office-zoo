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

[简体中文](README.md) · **English** · [📱 WeChat Mini-Program](packages/miniprogram/)

</div>

---

> "Can't grind harder, can't lie flat — let the AIs grind for you."

<p align="center">
  <img src="assets/launch-demo/hero-combined.gif" alt="30s hero — miHoYo-style story (0-15s) + real gameplay (15-30s)" width="720" />
  <br/>
  <em>v6.2 · miHoYo-style storyboard + real gameplay, 30s composite · <a href="assets/launch-demo/demo-memory.gif">story-only</a> · <a href="assets/launch-demo/game-highlight.gif">gameplay-only</a></em>
</p>

## Four ways to play

| | Mode | One-liner |
|---|---|---|
| 🏢 | **Office Zoo Classic** | 2.5D floor plan, 9 rat-people slack + scheme + backstab |
| 🎤 | **Hot Mic** | Real-voice TTS reads every "we need more granularity" out loud |
| ⚖️ | **You're Fired** | 1v1 vs HR, 5 chapters of PRC Labor Contract Law speed-run |
| 🍺 | **Late-Night Bar** (v6.2) | 2 a.m. lo-fi, 1v1 drinks + workplace venting with an AI rat |

**Plus side modes:** 🔮 daily fortune · 🎤 stand-up · 🤝 squad · 📜 7-day history · ⭐ UGC bits · 🏢 **Company Packs** (v6.37) · 🎁 **Banwei Wrapped** (v6.39)

---

## 🏗️ System Architecture

> Data flows along the dashed lines — the three diagrams below are **animated SVG** (gold dots = data packets in motion; GitHub auto-plays them, no JS).

**System architecture** · spectator → server → engine → agent → LLM, broadcast back over Socket.IO

<p align="center">
  <img src="assets/diagrams/architecture.svg" alt="OFFICE ZOO architecture — spectator / Hono server / GameEngine / BaseAgent / LLM / local JSON, data flows along dashed lines" width="100%" />
</p>

**PSYWAR loop** · spectator tactical @ → AI hears → AI quotes → Banwei score +6 (sequence)

<p align="center">
  <img src="assets/diagrams/sequence-psywar.svg" alt="PSYWAR sequence — game:psy_war_leak → pushLeakedHint → generateSpeech → detectLeakQuote → leak_quoted" width="100%" />
</p>

**Company Pack data loop** · create → persist → share → coworker joins → roster override → Banwei check-in → leaderboard → your-company Top

<p align="center">
  <img src="assets/diagrams/dataflow-companypack.svg" alt="Company Pack data flow — closed loop: spectator → game world → spectator" width="100%" />
</p>

---

## 🌟 v6.37 → v6.42 · Bring your coworkers into the game

> Company Packs + cross-spectator leaderboard + year-end Wrapped — "work-fatigue" grows from a personal experience into a social loop.

- 🏢 **Company Packs** (v6.37→v6.41) — define "our company's 6-12 NPCs" (name + role + personality + emoji avatar), save as a private pack. Share a link → coworkers open the same `?pack=` game → AI rats use *your* names, with the custom avatars rendered across GameMap, the elimination reveal, and the recap.
- 🏆 **Cross-spectator leaderboard** (v6.36→v6.38) — public global Top-10 Banwei board + region/industry filters + "🏢 your-company Top", one-tap 1080×1350 leaderboard share card.
- 🎁 **Banwei Wrapped** (v6.39→v6.40) — Spotify-Wrapped-style year recap: peak week / average / trend / leak hit-rate / achievements / year persona, export to poster.
- 🔥 **Hot-quote → game-world loop** (v6.33→v6.36) — spectators submit workplace one-liners → nomination-weighted bias → AI rats are more likely to "cast" a nominated name next game, with a 🔥 badge on GameMap.
- 🧪 **Quality** — 171 vitest green · clean typecheck · Playwright visual probes for the Wrapped card + animated diagrams.

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

## Architecture deep-dive

The fallback chains that keep the show running even when a provider dies:

```
LLM:   QingYun gpt-4o-mini  →  Minimax-M2  →  canned responses
TTS:   Minimax speech-2.8-hd → Qingyun /audio/speech → browser Web Speech
Image: flux-schnell → doubao-seedream → qwen-image → gpt-image-1 → minimax:image-01
```

(For the full data flow, see the animated diagrams at the top.)

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
✅ v6.25-6.36 PSYWAR mind-games + Banwei index / hot-quotes / weekly report / leaderboard + mini-program
✅ v6.37-6.42 Company Packs (private NPC deploy) + cross-spectator leaderboard + Banwei Wrapped + animated diagrams
🔜 next       Real Stripe checkout · Claude 4.5 director · pack avatars on mini-program
```

## 🙏 Acknowledgements

OFFICE ZOO stands on a stack of open-source AI + Web projects:

**LLM & inference**
- [MiniMax](https://www.minimaxi.com/) — `speech-2.8-hd` TTS / `MiniMax-M2` text / `image-01` portraits
- [Qwen](https://github.com/QwenLM/Qwen) / [QingYunTop](https://api.qingyuntop.top/) — domestic LLM backends + OpenAI-compatible multi-model routing
- [OpenAI API spec](https://platform.openai.com/docs/api-reference) — the whole project speaks OpenAI-compatible protocol, swap backends freely
- Multi-agent social-deduction architecture (per-rat persona + memory + prompt patch), inspired by the LLM-as-Agent / Generative Agents line of work

**Backend · Frontend · Tooling**
- [Hono](https://hono.dev/) + [Socket.IO](https://socket.io/) · [React](https://react.dev/) + [Vite](https://vitejs.dev/) + [Zustand](https://github.com/pmndrs/zustand) + [Framer Motion](https://www.framer.com/motion/)
- [glass-easel](https://github.com/wechat-miniprogram/glass-easel) · [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/) + [git-cliff](https://github.com/orhun/git-cliff)

**Inspiration** — *Among Us* / Werewolf / Spyfall, and every "let's embrace change" moment in a real office.

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ChrisChen667788/office-zoo&type=Date)](https://www.star-history.com/#ChrisChen667788/office-zoo&Date)

## License

[MIT](LICENSE) — fork it, ship it, sell it. Just keep the LICENSE file.

## Contributing

PRs welcome. Open issues for ideas. Read [docs/DESIGN.md](docs/DESIGN.md) before submitting visual changes to keep the design system coherent across consumer + B2B surfaces.

### git hooks (optional)

The repo ships a **non-blocking** pre-push hook: before each push it runs
`git-cliff` to list commits not yet written into
[`docs/CHANGELOG.md`](docs/CHANGELOG.md) and prints a reminder — it only nags,
the push still goes through. Install it once:

```bash
npm run hooks:install        # copies scripts/git-hooks/* into .git/hooks/
```

Silence it for a single push (e.g. a docs-only commit):

```bash
OFFICE_ZOO_SKIP_CHANGELOG_NUDGE=1 git push
```

---

<div align="center">

*Built with Claude Code · No webfonts, no analytics, no dark patterns.*

</div>
