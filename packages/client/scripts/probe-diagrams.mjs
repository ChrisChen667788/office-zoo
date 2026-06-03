/**
 * v6.42 P1 — render each animated SVG diagram to a PNG for visual
 * verification. Loads the SVG as a real <img> in chromium (so SMIL
 * animations run + the same render path GitHub uses), waits a beat for
 * the first animation frame, screenshots. Catches broken layout / missing
 * text / overflow before we embed in README + ModelScope.
 *
 * Run: node packages/client/scripts/probe-diagrams.mjs
 * Output: /tmp/diagram-<name>.png (one per SVG)
 */
import { chromium } from 'playwright';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const DIR = resolve(ROOT, 'assets/diagrams');

const svgs = readdirSync(DIR).filter((f) => f.endsWith('.svg'));
if (!svgs.length) { console.error('no SVGs found'); process.exit(1); }

const browser = await chromium.launch();
for (const svg of svgs) {
  const name = basename(svg, '.svg');
  const page = await browser.newPage({ viewport: { width: 980, height: 660 } });
  // Navigate directly to the SVG file — chromium renders it natively
  // with SMIL animations running, same as a GitHub <img src> reference.
  await page.goto(`file://${resolve(DIR, svg)}`);
  await page.waitForTimeout(600); // let the first SMIL frame paint
  const out = `/tmp/diagram-${name}.png`;
  await page.screenshot({ path: out });
  console.log(`OK ${svg} → ${out}`);
  await page.close();
}
await browser.close();
console.log('ALL DIAGRAMS RENDERED');
