/**
 * v6.43 P1 — capture the two live-game README screenshots that the
 * static harvester can't: classic 2.5D office + immersive round-table.
 *
 * Unlike capture_screenshots.mjs (static routes), these need a RUNNING
 * game: we drive the real Landing → classic/immersive flow over the
 * socket, then wait for the GameMap canvas / round-table to populate
 * before screenshotting. Requires client:5173 + server:3100 live + a
 * working LLM key (the game loop calls the model).
 *
 * Run (after pnpm dev): node scripts/capture_game_screens.mjs
 * Output: assets/screenshots/04-classic-game.png + 05-immersive-game.png
 */
import { chromium } from 'playwright';
import path from 'node:path';

const CLIENT = process.env.CLIENT_URL ?? 'http://localhost:5173';
const OUT = path.resolve('assets/screenshots');

async function preflight() {
  try {
    const r = await fetch(CLIENT, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    console.error(`✕ ${CLIENT} 不可达 (${e.message}). 先 pnpm dev 再跑.`);
    process.exit(1);
  }
}

async function captureClassic(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  await page.goto(`${CLIENT}/`, { waitUntil: 'networkidle' });

  // Click the classic mode card's "进入" — it emits game:create and
  // navigates to /classic/:gameId. The card text is 鼠人公司 / classic.
  // Try the most robust selector first, fall back to any 进入 button.
  const entered = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a')];
    // Prefer a button inside the classic card.
    const enter = btns.find((b) => /进入|开始|看戏/.test(b.textContent || ''));
    if (enter) { enter.click(); return true; }
    return false;
  });
  if (!entered) { console.warn('  classic: 没找到进入按钮,尝试直接 /classic/new'); }

  // Wait for navigation to /classic/<id> then for the GameMap canvas.
  await page.waitForURL(/\/classic\//, { timeout: 15_000 }).catch(() => {});
  // The map canvas has class gamemap-canvas-responsive. Wait for it +
  // give the engine a beat to assign roles + run a free-roam tick so
  // avatars populate (role_reveal → free_roam ≈ 3-6s).
  await page.waitForSelector('canvas.gamemap-canvas-responsive', { timeout: 20_000 }).catch(() => {});
  // Poll until the round is in discussion (a speech bubble shows) so the
  // shot captures real AI dialogue, not an empty pre-game map.
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(2000);
    const inRound = await page.evaluate(() =>
      /职场撕逼|日常搬砖|紧急全员会|投票/.test(document.body.innerText || ''));
    if (inRound) { ready = true; break; }
  }
  await page.waitForTimeout(2000); // let a speech bubble paint
  await page.screenshot({ path: path.join(OUT, '04-classic-game.png'), fullPage: false });
  console.log(`  → 04-classic-game.png ${ready ? 'ok (in round)' : 'captured (best-effort)'}`);
  await ctx.close();
}

async function captureImmersive(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN',
  });
  const page = await ctx.newPage();
  // Immersive has a /immersive/new entry that auto-creates a game and
  // redirects to /immersive/<id>. It uses a full-screen round-table
  // (aurora + radial seats + TTS), NOT the Classic GameMap. We poll
  // until a speech bubble appears (discussion phase) so the shot shows
  // real content, not the "正在组建公司…" lobby. Immersive is slower
  // than Classic (role_reveal → free_roam → discussion + TTS), so we
  // give it up to ~40s, checking every 2s.
  await page.goto(`${CLIENT}/immersive/new`, { waitUntil: 'networkidle' });
  await page.waitForURL(/\/immersive\/(?!new)/, { timeout: 15_000 }).catch(() => {});

  let ready = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(2000);
    const state = await page.evaluate(() => {
      const txt = document.body.innerText || '';
      const inLobby = /正在组建公司|待入职/.test(txt);
      // A populated round shows the phase pill (职场撕逼/日常搬砖) +
      // at least one speech / name bubble.
      const inRound = /职场撕逼|日常搬砖|紧急全员会|投票/.test(txt);
      return { inLobby, inRound };
    });
    if (state.inRound && !state.inLobby) { ready = true; break; }
  }
  if (!ready) console.warn('  immersive: 未进入 discussion,截当前态');
  await page.screenshot({ path: path.join(OUT, '05-immersive-game.png'), fullPage: false });
  console.log(`  → 05-immersive-game.png ${ready ? 'ok (in round)' : 'captured (best-effort)'}`);
  await ctx.close();
}

async function main() {
  await preflight();
  const browser = await chromium.launch();
  await captureClassic(browser);
  await captureImmersive(browser);
  await browser.close();
  console.log('✓ game screenshots done');
}

main().catch((e) => { console.error(e); process.exit(1); });
