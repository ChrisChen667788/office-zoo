# scripts/lib — pure helpers for build/capture scripts

Pure, side-effect-free, **dependency-light** modules shared by the `.mjs`
scripts in `scripts/` (and unit-tested from `scripts/__tests__/`). Keeping
the logic here — rather than inline in a script — is what lets it get real
vitest coverage without spinning up Playwright / a browser.

## Convention

- One concern per file (`modeMatch.mjs` = game-mode disambiguation).
- No `playwright` / `fs` / network imports — those belong in the scripts
  that *call* these helpers. Pure in, pure out.
- Each helper gets a sibling test in `scripts/__tests__/<name>.test.ts`
  (picked up by the workspace vitest `include`).

## Current modules

| file | exports | used by |
|------|---------|---------|
| `modeMatch.mjs` | `matchesMode`, `CLASSIC_MODE`, `IMMERSIVE_MODE` | `capture_game_screens.mjs` |

## On a barrel `index.mjs`

Deliberately **not** added yet — with a single module, a barrel is
premature abstraction (and it'd obscure per-file imports for no gain).
Add `index.mjs` re-exporting the public surface once there are 3+ helpers
that callers routinely import together.
