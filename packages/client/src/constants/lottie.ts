/**
 * Lottie animation registry.
 *
 * All .json files live under /public/lottie/ and are fetched on-demand,
 * so adding an asset here does NOT inflate the main JS bundle — only
 * the specific animation used on screen is downloaded.
 *
 * Source: https://lottiefiles.com (free-to-use assets, lf20_* package ids).
 * If you want a different look, just drop a new .json into /public/lottie/
 * and add an entry below.
 */
export const lottie = {
  /** Trophy cup — use when a team achieves a decisive win */
  trophy: '/lottie/trophy.json',
  /** Multi-color confetti burst — background overlay for victories */
  confetti: '/lottie/confetti.json',
  /** Check mark + stars — achievement / success toast */
  success: '/lottie/success.json',
  /** Magnifying glass hunting — "investigating" / loading in deduction contexts */
  search: '/lottie/search.json',
  /** Character running — generic loading / transition */
  loadingRun: '/lottie/loading-run.json',
  /** Cannon blast — aggressive / elimination moments */
  cannon: '/lottie/cannon.json',
  /** Friendly bot waving — landing hero greeting */
  helloBot: '/lottie/hello-bot.json',
} as const;

export type LottieKey = keyof typeof lottie;
