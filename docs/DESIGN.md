# Office Zoo — Design System Notes

A running log of design decisions with rationale, so the visual language
of the product is auditable and reproducible. The user explicitly asked
for design intent to be visible (not buried in code commits), so every
v1.x design decision gets a short entry here.

## Two themes, one product

| | **Consumer** (default) | **Executive** (v1.1.0 B2B embed) |
|---|---|---|
| Audience | individual user, anonymously vents | enterprise procurement, must look defensible |
| Vibe | "discord at midnight, gallows humor" | "Bloomberg at dusk, gavel in the corner" |
| Background | `#050510` → violet aurora | `#0c1024` → deep navy + soft gold glow |
| Primary | `#4c9eff` (neon cyan) + `#7c3aed` (violet) | `#c89a4e` (muted gold) |
| Accent | `#ff5588` (pink kiss) | `#5b6585` (steel-blue) |
| Hover effect | `hover-sheen` diagonal sweep + 4px lift | plain 2px lift + 1px gold ring |
| Loading | shimmer + EQ bars | concentric ring spinner |
| Failure | red `#ff3355`, pink edge | brick `#c0524b`, no edge |
| Success | lime `#9cff57` | forest `#5fa57a` |

**Why ban "neon sheen" from B2B**: the same micro-interaction that signals
"playful product" in the consumer surface signals "casual, untrustworthy"
when read by an enterprise procurement team. Removing it is intentional
craft, not an oversight.

## Motion vocabulary (v0.9.2.1)

Both themes share these durations + easings to keep micro-interactions
predictable across the app:

| Token | Duration | Easing | Use case |
|---|---|---|---|
| `motion.snap` | 160 ms | `[0.32, 0.72, 0, 1]` | hover lift, button press |
| `motion.smooth` | 300 ms | same | state change (tab switch) |
| `motion.cinema` | 500 ms | `[0.16, 1, 0.3, 1]` | hero entrance, page transition |
| `motion.breathe` | 1200 ms | `easeInOut` | medal pulse, status breath |

## Card archetypes (v0.9.2.1)

| Archetype | Background | Border | When to use |
|---|---|---|---|
| `frost` | rgba(white, 0.025) | subtle | resting grid card |
| `mine` | amber gradient | gold tint | content the visitor created |
| `medal` | gold→pink wash | strong gold | top-3 monthly leaderboard |
| `talkshow` | pink→violet→cyan | pink tint | bit content |
| `fired` | red→amber | red tint | fired-mode content |

All archetypes pair with `.frost-card` (backdrop blur 8px) for the glass
chrome and `.hover-sheen` for the diagonal light-sweep on hover (consumer
theme only — Executive theme strips this).

## Premium gating (v1.0.0)

A premium scenario carries `premium: true` and renders with:

1. **Crown badge** top-right corner — gold gradient pill, "👑 Premium · 升级解锁" copy when locked, just "👑 Premium" when unlocked
2. **Locked overlay** when `!isPremium` — radial vignette `(8,6,24,0.10)` at center → `(8,6,24,0.62)` at corners with a 🔒 glyph centered with `drop-shadow(0 4px 12px rgba(0,0,0,0.55))`
3. **Tap routes to /premium** — bypasses the normal select-then-start flow

The crown badge sits above the medal badge in z-order so a Premium card on the monthly leaderboard shows both 🥇/🥈/🥉 (top-left) and 👑 (top-right) without overlap.

## B2B embed customization (v1.1.0)

The B2B vendor configures:
- `brandName` (2-48 chars) — appears in embed header
- `primaryColor` (hex) — overrides Executive's gold for header/CTA tint
- `logoUrl` (optional) — replaces text wordmark if present
- `flavor` — `consultation` (employee perspective, sells the firm) OR `training` (HR student perspective, gets graded)
- `footerTagline` — default "Powered by Office Zoo" but a customer can negotiate co-branding off (Premium tier feature, future)

The embed renders inside a frame that is **chrome-free** — no header navigation, no "返回首页" — so the iframe sits cleanly inside the customer's own site. The only Office Zoo branding is the tiny footer attribution.

## What's banned in B2B

- All emoji on chrome (still allowed in content)
- Gradient text (the `text-gradient-brand` utility)
- Animated bloom rings / EQ bars / floaty drift
- Pink anywhere
- The word "暴论" / "班味" / "鼠人" (consumer brand voice, doesn't fit enterprise)

## Three themes (v1.3.0+)

| | **Consumer** | **Executive** (B2B) | **Y2K** (Quiz / Profile card) |
|---|---|---|---|
| Audience | individual user, anonymously vents | enterprise procurement | individual user, social-share artifact |
| Vibe | "discord at midnight" | "Bloomberg at dusk" | "MySpace × Polaroid × meme" |
| Background | `#050510` + violet aurora | `#0c1024` + soft gold | `#ff2d92`→`#6e00ff`→`#00ddff` diagonal |
| Primary | `#4c9eff` neon | `#c89a4e` muted gold | `#ff2d92` hot pink |
| Accent | `#ff5588` pink kiss | `#5b6585` steel-blue | `#ffe300` acid yellow |
| Borders | `1px` subtle | `1px` gold tint | `3px` solid black |
| Shadows | `0 8px 24px rgba(...)` | `0 6px 14px rgba(0,0,0,0.18)` | `4-8px solid offset` (sticker) |
| Hover | sheen sweep | plain lift + 1px ring | slight scale + bigger shadow |
| Type case | mixed | sentence | UPPER + chunky display |
| Type weight | 700 max | 700 max | 900 |
| Emoji | sparingly | banned in chrome | core part of the language |

## Why a 3rd theme?

The consumer chrome (neon glassmorphism) is sophisticated → reads as
"product, take seriously". That's right for the main app. WRONG for the
output users post on social — TikTok For You feeds reward visual
shock + meme-energy. Sophisticated loses to LOUD in the screenshot war.

So /quiz + /profile/me get **deliberately clashing** Y2K colors — the
transition feels like "I'm in a different app now". Increases the
"what is this???" hook when shared. Same product, different costume per
context.

## v1.3.0 — Y2K theme rationale

Inspired by:
- BeReal's chunky white-on-color cards
- BuzzFeed quiz result pages (2014-2017)
- TikTok For You text-overlay style
- Vercel's Y2K Spring Conf 2024 site
- Korean Z-gen "촌스러움" (intentionally tacky) aesthetic

Key utilities (added to index.css in v1.3.0):
- `.y2k-bg` — full-page hot-pink → purple → cyan diagonal with skylight glints
- `.y2k-sticker` — white card, 3px black border, 6px black solid offset shadow
- `.y2k-sticker-dark` — black card variant with pink offset shadow
- `.y2k-cta` — chunky pill button, gradient-filled, with translate-on-press
- `.y2k-sparkle` — pseudo-element ✦ corner stars that twinkle (1.8s loop)
- `.y2k-display` — Inter 900 weight, uppercase, tight tracking
- `.y2k-tilt-l` / `.y2k-tilt-r` — ±2° rotation for "stuck on" sticker feel

## Profile card design constraints

The 班味卡 has to:
1. **Read as a screenshot**, not a webpage. Self-contained, full info, no
   chrome dependency.
2. **Look great even when downloaded as PNG** (so v1.3.1 html2canvas
   export works without re-design).
3. **Carry the brand** without being an ad — small footer attribution
   only.
4. **Have a "where do I tap?"** — sticker shadows + small rotation tell
   the brain "interactive object".

Card composition (top-down):
- **Hero band** (archetype-colored gradient) — emoji 7xl + name display 4xl + tagline pill
- **Radar + hybrid breakdown** — 6-axis SVG + the top-3 archetypes ranked
- **3 catchphrase stickers** — yellow / cyan / pink, slight tilt, individual shadows
- **Rival + bestie** — two small dark/light cards side-by-side
- **Footer** — black bar, brand mark + host

## Iteration log

- **v1.0.0** Premium paywall: gold→pink→violet gradient on the upgrade CTA. Demo-mode tag clearly visible to avoid trust damage.
- **v1.1.0** Executive theme + B2B embed layer + 4 HR training scenarios + 2 new personalities (soe / union).
- **v1.2.0+1+2** i18n zh-CN / en-US / ja-JP / ko-KR. Locale dropdown replacing the 2-button toggle. Per-locale price strings (PPP-rough).
- **v1.3.0** Y2K theme + 12-archetype quiz + LLM-personalized profile card. Two new client routes (/quiz + /profile/me); two new server routes (POST /api/quiz/score + GET /api/quiz/me); one new shared module (archetypes.ts with quiz questions + cosine scoring math).
- **v1.3.1** Real PNG export. Lazy-loaded html2canvas (~50KB gz, only loads when user taps 📸). Card cloned into a fixed-1080px-wide off-screen wrapper with the Y2K page background, then captured at 1.5× = 1620 px output. Web Share API for files preferred on mobile (1-tap to IG/微信), `<a download>` fallback on desktop. Filename pattern `班味卡-{archetype}-{ts}.png`.
- **v1.3.2** Archetype-aware HR. Per-archetype `WEAK_SPOTS` (12 entries × intro + 3-4 PUA ammo lines). The fired /chat handler reads the user's quiz profile via X-User-Id, builds an `archetypeContext` block scaled by personality difficulty (rookie=subtle / veteran=medium / demon=full ammo), and injects into the HR system prompt. Client gets the recognized archetype back on the response and renders a small pink/purple/grey pill in the chat header so the user understands the HR is reading their档案. Personalized PUA = same scenario plays differently per identity → replay value spikes.
