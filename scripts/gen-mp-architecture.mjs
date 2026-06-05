/**
 * gen-mp-architecture.mjs — v6.47 P3
 *
 * Regenerate packages/miniprogram/assets/architecture.png from the
 * animated architecture.svg. WeChat's native <image> can't run SVG SMIL
 * animations, so the mp about page (pages/about) embeds a STATIC PNG
 * rendered from the same source SVG the README uses. This script makes
 * that render reproducible instead of a manual inline Playwright snippet
 * (v6.43 P3 generated it by hand).
 *
 * Run: node scripts/gen-mp-architecture.mjs
 * Source: assets/diagrams/architecture.svg
 * Output: packages/miniprogram/assets/architecture.png  (960×620 @2×)
 */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'assets/diagrams/architecture.svg');
const OUT_DIR = resolve(ROOT, 'packages/miniprogram/assets');
const OUT = resolve(OUT_DIR, 'architecture.png');

// Match the SVG's native viewBox so the PNG keeps the same aspect ratio
// the on-page <image mode="widthFix"> expects. (architecture.svg is
// viewBox 0 0 960 620.)
const W = 960;
const H = 620;

if (!existsSync(SRC)) {
  console.error(`✕ source SVG not found: ${SRC}`);
  process.exit(1);
}
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
// Navigate directly to the file — chromium renders SVG natively; we
// snapshot the first painted frame (SMIL mid-animation is irrelevant for
// a static export, the node/label layout is what we want).
await page.goto(`file://${SRC}`);
await page.waitForTimeout(500);
await page.screenshot({ path: OUT });
await browser.close();
console.log(`✓ ${OUT} (${W}×${H} @2×) regenerated from architecture.svg`);
