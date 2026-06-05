/**
 * modeMatch — pure mode-verification logic shared by the game-screenshot
 * capture script's assertMode() and its vitest coverage.
 *
 * The capture script (capture_game_screens.mjs) must refuse to overwrite
 * a screenshot unless the page is genuinely on the expected game mode —
 * the guard that stops a classic/immersive mislabel (v6.43 shipped one
 * before the guard existed; v6.44/v6.45 added it per-mode; v6.46 factored
 * it into assertMode; v6.47 extracts the PURE part here so it can be unit
 * tested without a browser).
 *
 * @param {object} page  observed page state
 * @param {string} page.bodyText      document.body.innerText
 * @param {boolean} page.hasCanvas    is the GameMap canvas present
 * @param {object} mode  the expected-mode spec
 * @param {RegExp} mode.wantBadge     badge text that MUST be present
 * @param {boolean} mode.wantCanvas   whether the GameMap canvas must exist
 * @param {RegExp} mode.forbidBadge   badge text that must be ABSENT
 * @returns {boolean} true iff the page matches the expected mode
 */
export function matchesMode({ bodyText, hasCanvas }, { wantBadge, wantCanvas, forbidBadge }) {
  return wantBadge.test(bodyText)
    && hasCanvas === wantCanvas
    && !forbidBadge.test(bodyText);
}

/** Canonical per-mode specs (badges from Classic.tsx / Immersive.tsx). */
export const CLASSIC_MODE = {
  wantBadge: /职场杀/, wantCanvas: true, forbidBadge: /沉浸 · v6/,
};
export const IMMERSIVE_MODE = {
  wantBadge: /沉浸 · v6/, wantCanvas: false, forbidBadge: /职场杀/,
};
