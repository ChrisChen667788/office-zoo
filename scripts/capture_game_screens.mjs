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
  // Pre-seed localStorage so the onboarding RulesModal (a z-[1000]
  // fixed overlay that intercepts pointer events) doesn't auto-show and
  // block the 进入 button. The modal sets a "seen" flag; we set it ahead.
  await page.addInitScript(() => {
    // Exact key from RulesModal.tsx FIRST_VISIT_KEY.
    try { localStorage.setItem('office-zoo.seen-rules', '1'); } catch { /* ignore */ }
  });
  await page.goto(`${CLIENT}/`, { waitUntil: 'networkidle' });
  // Belt-and-suspenders: if a modal still showed, press Escape + click
  // any close/got-it button.
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (/知道了|开始|关闭|跳过|✕|×/.test(b.textContent || '')) {
        const modal = b.closest('.fixed');
        if (modal && getComputedStyle(modal).zIndex >= '900') { b.click(); break; }
      }
    }
  }).catch(() => {});
  await page.waitForTimeout(500);

  // The CLASSIC card's 进入 button is `disabled` until the socket
  // connects (`disabled={m.key==='classic' && !connected}`). The earlier
  // probe clicked too early → disabled no-op → stayed on Landing, then a
  // fallback grabbed the immersive card. So: the 4 进入→ buttons are in
  // MODES order (classic, immersive, fired, talkshow) → the FIRST one is
  // classic. Use a Playwright locator (auto-waits for it to become
  // enabled + actionable) instead of a raw DOM .click().
  const classicEnter = page.locator('button', { hasText: '进入' }).first();
  await classicEnter.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  // Poll until it's enabled (socket connected), up to ~10s.
  for (let i = 0; i < 20; i++) {
    if (await classicEnter.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  await classicEnter.click({ timeout: 8_000 }).catch((e) => console.warn('  classic 进入 click:', e.message));

  // Wait for /classic/<id> + the GameMap canvas (immersive has NO such
  // canvas — a good cross-check we landed on the right route).
  await page.waitForURL(/\/classic\//, { timeout: 15_000 }).catch(() => {});
  await page.waitForSelector('canvas.gamemap-canvas-responsive', { timeout: 20_000 }).catch(() => {});
  // Poll until discussion phase so the shot shows real AI dialogue.
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(2000);
    const inRound = await page.evaluate(() =>
      /职场撕逼|日常搬砖|紧急全员会|投票/.test(document.body.innerText || ''));
    if (inRound) { ready = true; break; }
  }
  await page.waitForTimeout(2000);
  // ASSERT we're actually on Classic (🏢 职场杀 badge), not immersive.
  const onClassic = await page.evaluate(() => {
    const t = document.body.innerText || '';
    const hasCanvas = !!document.querySelector('canvas.gamemap-canvas-responsive');
    return /职场杀/.test(t) && hasCanvas && !/沉浸 · v6/.test(t);
  });
  if (!onClassic) {
    console.error('  ✕ classic: 没落在经典局 (无 职场杀 badge / GameMap canvas). 不截图,避免误标.');
    await ctx.close();
    return false;
  }
  await page.screenshot({ path: path.join(OUT, '04-classic-game.png'), fullPage: false });
  console.log(`  → 04-classic-game.png ok (classic verified, ${ready ? 'in round' : 'pre-round'})`);
  await ctx.close();
  return true;
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
  const classicOk = await captureClassic(browser);
  await captureImmersive(browser);
  await browser.close();
  if (!classicOk) {
    console.error('✕ classic 截图未通过校验 — 04-classic-game.png 未更新');
    process.exitCode = 2;
  }
  console.log('✓ game screenshots done');
}

main().catch((e) => { console.error(e); process.exit(1); });
