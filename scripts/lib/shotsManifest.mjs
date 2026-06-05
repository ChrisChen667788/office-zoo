/**
 * shotsManifest — the static-route screenshot manifest for
 * capture_screenshots.mjs, plus a pure validator. Extracted to scripts/lib
 * so the file↔URL mapping invariants get real vitest coverage (a typo'd
 * duplicate filename would silently overwrite a shot otherwise).
 *
 * Each entry produces one PNG; route + setup isolate the page state so
 * screenshots are deterministic.
 */

/** @typedef {{ file: string, url: string, wait: number, note?: string }} Shot */

/** @type {Shot[]} */
export const SHOTS = [
  { file: '01-landing.png',         url: '/',                 wait: 800 },
  { file: '02-quiz.png',            url: '/quiz',             wait: 600 },
  { file: '03-profile.png',         url: '/profile/me',       wait: 1200,
    note: '需要先完成一次 quiz,否则跳回 /quiz。脚本会自动 POST 一次。' },
  { file: '04-fired-landing.png',   url: '/fired',            wait: 800 },
  { file: '05-squad-lobby.png',     url: '/squad/new',        wait: 600 },
  { file: '06-squad-history.png',   url: '/squad-history',    wait: 600 },
  { file: '07-talkshow.png',        url: '/talkshow',         wait: 800 },
  { file: '08-premium.png',         url: '/premium',          wait: 600 },
];

/** Filename shape: NN-kebab-name.png (2-digit ordinal prefix). */
const FILE_RE = /^\d{2}-[a-z0-9-]+\.png$/;

/**
 * Validate a shots manifest. Pure — returns a list of human-readable
 * problems (empty = valid). Catches the failure modes that would silently
 * corrupt a capture run:
 *   - duplicate filename → second shot overwrites the first
 *   - duplicate URL → two shots of the same page (probably a copy-paste)
 *   - bad filename format → breaks the README table's NN ordering
 *   - non-absolute URL → page.goto would resolve it wrong
 *   - non-positive wait → screenshot fires before content paints
 *
 * @param {Shot[]} shots
 * @returns {string[]} problems (empty array means valid)
 */
export function validateShots(shots) {
  const problems = [];
  const seenFiles = new Set();
  const seenUrls = new Set();
  for (const s of shots) {
    if (!FILE_RE.test(s.file)) problems.push(`bad filename: "${s.file}"`);
    if (seenFiles.has(s.file)) problems.push(`duplicate filename: "${s.file}"`);
    seenFiles.add(s.file);
    if (typeof s.url !== 'string' || !s.url.startsWith('/')) {
      problems.push(`url must start with "/": "${s.url}" (${s.file})`);
    }
    if (seenUrls.has(s.url)) problems.push(`duplicate url: "${s.url}"`);
    seenUrls.add(s.url);
    if (!(typeof s.wait === 'number') || s.wait <= 0) {
      problems.push(`wait must be > 0: ${s.wait} (${s.file})`);
    }
  }
  return problems;
}
