#!/usr/bin/env node
/**
 * capture_screenshots.mjs — v3.0.0 README screenshot harvester.
 *
 * Walks the app's core static routes in a headless Chromium and writes
 * PNGs to assets/screenshots/. The route↔file manifest lives in
 * scripts/lib/shotsManifest.mjs (unit-tested); a malformed manifest
 * fails fast here before any browser launches.
 *
 * Run:    npm run gen:screenshots   # runs both capture scripts; or: node scripts/capture_screenshots.mjs
 * Prereq: npm run dev live (client :5173 + server :3100) — exits early
 *         with a helpful message if not. One-time: npx playwright install
 *         chromium. Take the quiz once first so Profile/Squad cards aren't empty.
 * Output: assets/screenshots/01-landing.png … 08-premium.png (see shotsManifest.mjs)
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
// v6.49 P2 — manifest + validator extracted to scripts/lib for unit
// coverage (a duplicate filename would silently overwrite a shot).
import { SHOTS, validateShots } from './lib/shotsManifest.mjs';

const CLIENT = process.env.CLIENT_URL ?? 'http://localhost:5173';
const SERVER = process.env.SERVER_URL ?? 'http://localhost:3100';
const OUT    = path.resolve('assets/screenshots');

const DEMO_USER_ID = 'screenshot-bot';

// SHOTS manifest now lives in scripts/lib/shotsManifest.mjs (imported
// above) so its file↔URL invariants can be unit-tested.

async function preflightCheck() {
  for (const url of [CLIENT, SERVER + '/api/health']) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      console.error(`✕ ${url} 不可达 (${e.message}). 先启动 pnpm dev 再跑.`);
      process.exit(1);
    }
  }
}

async function seedProfile() {
  // Quiz answers tuned to produce a v2.0.0 region-tribe archetype so
  // the Profile screenshot shows the new region/industry chips +
  // evolution panel (after a couple of plays).
  await fetch(SERVER + '/api/quiz/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': DEMO_USER_ID },
    body: JSON.stringify({ answers: [0, 3, 0, 3, 0, 3, 0, 0, 2, 2] }),
  }).catch(() => { /* may rate-limit on re-run — that's fine */ });
}

async function main() {
  // Fail fast if the manifest got a duplicate filename/url etc — better a
  // clear error than a silently-overwritten screenshot.
  const problems = validateShots(SHOTS);
  if (problems.length) {
    console.error('✕ SHOTS manifest 校验失败:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  await preflightCheck();
  await seedProfile();
  await fs.mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  // 4:5 portrait-ish viewport so README thumbnails read well.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1600 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
  });
  // Pre-seed the localStorage userId so /profile/me + /squad-history
  // / daily-drama all key off our deterministic demo user.
  await context.addInitScript((uid) => {
    try { localStorage.setItem('office-zoo.user-id', uid); } catch { /* noop */ }
  }, DEMO_USER_ID);

  const page = await context.newPage();
  for (const shot of SHOTS) {
    process.stdout.write(`  → ${shot.file}  (${shot.url})  `);
    await page.goto(CLIENT + shot.url, { waitUntil: 'networkidle', timeout: 15_000 })
      .catch(() => { /* networkidle may never settle on socket-heavy pages */ });
    await page.waitForTimeout(shot.wait);
    await page.screenshot({ path: path.join(OUT, shot.file), fullPage: false });
    console.log('ok');
  }
  await browser.close();
  console.log(`\n✓ ${SHOTS.length} screenshots → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
