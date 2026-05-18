#!/usr/bin/env node
/**
 * capture_screenshots.mjs — v3.0.0 README screenshot harvester.
 *
 * Walks the app's core surfaces in a headless Chromium and writes
 * PNGs to assets/screenshots/. Designed to be run AFTER you've taken
 * the quiz at least once with the demo user so the Profile + Squad
 * cards have non-empty state.
 *
 * Prereqs (one-time):
 *   pnpm add -wD playwright @playwright/test
 *   npx playwright install chromium
 *
 * Usage:
 *   node scripts/capture_screenshots.mjs
 *
 * The script assumes both `pnpm dev` servers are already running
 * (client on :5173, server on :3100). Exits early with a helpful
 * message if they aren't.
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const CLIENT = process.env.CLIENT_URL ?? 'http://localhost:5173';
const SERVER = process.env.SERVER_URL ?? 'http://localhost:3100';
const OUT    = path.resolve('assets/screenshots');

const DEMO_USER_ID = 'screenshot-bot';

/** The capture manifest. Each entry produces one PNG; route + setup
 *  isolate the page state so screenshots are deterministic. */
const SHOTS = [
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
