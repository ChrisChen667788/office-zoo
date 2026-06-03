/**
 * v6.41 P1 — Playwright visual probe for the 班味年终 wrapped PNG card.
 *
 * The wrapped card (utils/banweiWrappedCard.ts) is a pure
 * canvas → blob fn. Rather than boot the whole Vite + server stack and
 * seed a quiz profile + banwei history just to expand a Profile panel,
 * we render the card's drawing logic directly in a real chromium canvas
 * and screenshot it. This verifies the actual paint output (gradient,
 * hero emoji, 2×2 stat grid, achievement bar, footer) with zero flake.
 *
 * The drawing source is single-sourced: we transpile banweiWrappedCard.ts
 * with esbuild (the same transform Vite uses) into a browser IIFE, eval
 * it in the page, and call the real `downloadBanweiWrappedCard` with its
 * toBlob/download tail neutered so it draws onto an on-page canvas we can
 * screenshot. If the file's public signature drifts, this probe throws —
 * a cheap canary.
 *
 * Run: node packages/client/scripts/probe-banwei-wrapped.mjs
 * Output: assets/screenshots/banwei-wrapped-card.png
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const SRC = resolve(ROOT, 'packages/client/src/utils/banweiWrappedCard.ts');
const OUT = resolve(ROOT, 'assets/screenshots/banwei-wrapped-card.png');
const ESBUILD = resolve(ROOT, 'node_modules/.bin/esbuild');

// Transpile TS → a global-exposing IIFE. --format=iife + --global-name
// hangs the module exports off window.__wrappedMod.
const bundleRaw = execFileSync(ESBUILD, [
  SRC,
  '--bundle',
  '--format=iife',
  '--global-name=__wrappedMod',
  '--platform=browser',
], { encoding: 'utf8' });
// esbuild emits `"use strict"; var __wrappedMod = (() => {...})();`. Under
// indirect eval the strict-mode `var` stays scoped to the eval, so append
// an explicit window assignment (runs in the same scope, var still visible).
const bundle = `${bundleRaw}\n;globalThis.__wrappedMod = __wrappedMod;`;

// Mock data — a "资深职场显眼包" tier (peak 65) with a healthy spread.
const MOCK = {
  personaLabel: '资深职场显眼包',
  personaEmoji: '💼',
  personaAccent: '#FF4FA3',
  weeks: 8,
  peakScore: 65,
  peakWeek: '2026-W18',
  avgScore: 47,
  trend: 12,
  hitRate: 38,
  leaksSubmitted: 21,
  leaksQuoted: 8,
  achUnlocked: 7,
  achTotal: 12,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

const ok = await page.evaluate(({ bundle, mock }) => {
  // Eval the esbuild IIFE → window.__wrappedMod.downloadBanweiWrappedCard.
  // eslint-disable-next-line no-eval
  (0, eval)(bundle);
  const fn = window.__wrappedMod?.downloadBanweiWrappedCard;
  if (typeof fn !== 'function') throw new Error('downloadBanweiWrappedCard export missing');

  // Patch document.createElement so the fn draws onto a real on-page
  // canvas we can screenshot, and so its toBlob/anchor tail no-ops.
  const real = document.createElement.bind(document);
  const onPage = real('canvas');
  onPage.id = 'wrapped';
  document.body.style.margin = '0';
  document.body.appendChild(onPage);
  let served = false;
  document.createElement = (tag) => {
    if (tag === 'canvas' && !served) { served = true; return onPage; }
    if (tag === 'a') return { href: '', download: '', click() {} };
    return real(tag);
  };
  // Neuter the blob/URL tail.
  HTMLCanvasElement.prototype.toBlob = function () { /* no-op */ };

  fn(mock);
  // Sanity: the canvas must be the right size + non-blank.
  const ctx = onPage.getContext('2d');
  const { data } = ctx.getImageData(0, 0, 1, 1);
  const painted = data[0] + data[1] + data[2] > 0; // bg gradient drew
  return onPage.width === 1080 && onPage.height === 1350 && painted;
}, { bundle, mock: MOCK });

if (!ok) {
  console.error('PROBE FAIL: canvas not 1080×1350 or blank');
  await browser.close();
  process.exit(1);
}

const canvas = await page.$('#wrapped');
await canvas.screenshot({ path: OUT });
await browser.close();
console.log(`PROBE OK → ${OUT}`);
