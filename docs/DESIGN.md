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

## Iteration log

- **v1.0.0** Premium paywall: gold→pink→violet gradient on the upgrade CTA. Demo-mode tag clearly visible to avoid trust damage. "重置为免费用户" debug button bottom-of-page so QA can flip states.
- **v1.1.0** Executive theme + B2B embed layer + 4 HR training scenarios + 2 new personalities (soe / union).
- **v1.2.0** *(planned)* i18n with zh-CN / en-US dictionaries. Translate Landing + Premium first; UGC content (user-generated bits/scenarios) remains in original language.
