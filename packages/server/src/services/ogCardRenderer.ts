/**
 * ogCardRenderer — v6.12 P2 server-side OG share-card PNG generator.
 *
 * Renders a 1200×630 OG-card per character via Playwright + an inline
 * HTML template. Caches PNGs to disk keyed by (character name + stats
 * lastGameId), so a re-fetch after stats change auto-invalidates while
 * un-changed characters serve from disk on subsequent hits.
 *
 * Why server-side: og:image must be a public URL that crawlers (Twitter
 * card, Slack Unfurl, WeChat) can fetch *without* executing JS. Client-
 * side PNG generation isn't reachable by those crawlers. v6.11 P4 used
 * one shared horizontal-lockup-final as og:image — this skill upgrades
 * to per-character custom cards.
 *
 * Browser lifecycle: a singleton Chromium instance is launched lazily
 * on first request and reused across requests. Each render spins up
 * a fresh context (page) for isolation, kills it after screenshot.
 * The browser stays warm; restarts only on Node process restart.
 *
 * Layout: 1200×630 is the most-supported OG dimension (Facebook /
 * Twitter / LinkedIn all crop to this). Different from the 1080×1350
 * IG-portrait client share card — those are user-share artefacts;
 * this is unfurl preview.
 */
import { chromium, Browser } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCharacter, type CharacterCard } from '@furball/shared';
import { getCharacterStats } from './characterStatsStore';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const CACHE_DIR  = path.resolve(__dirname, '..', '..', 'data', 'og-cards');

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) browserPromise = chromium.launch({ headless: true });
  return browserPromise;
}

/** Build a stable cache-key string from character + stats so a stats
 *  change naturally invalidates. Empty / no stats → use 'rookie'. */
function cacheKey(name: string, lastGameId?: string): string {
  const tag = lastGameId && lastGameId.length > 0 ? lastGameId : 'rookie';
  // Keep filenames simple: alphanumerics + dashes only.
  const safe = tag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return `${name}-${safe}.png`;
}

/**
 * Returns a PNG buffer for the character's OG card. Reads from cache
 * if present; renders + caches otherwise.
 *
 * Returns null when the character isn't in the roster (caller should
 * 404).
 */
export async function getCharacterOgCard(name: string): Promise<Buffer | null> {
  const character = findCharacter(name);
  if (!character) return null;
  const stats = await getCharacterStats(name).catch(() => null);
  const key = cacheKey(name, stats?.lastGameId);
  const cachePath = path.join(CACHE_DIR, key);

  // Cache hit?
  try {
    const buf = await fs.readFile(cachePath);
    return buf;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Real I/O error — fall through to re-render but log it.
      console.error('[ogCardRenderer] cache read failed:', err);
    }
  }

  // Render fresh.
  const buf = await renderOgPng(character, stats);
  // Save to disk (best-effort; don't block on it).
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(cachePath, buf);
  } catch (err) {
    console.error('[ogCardRenderer] cache write failed:', err);
  }
  return buf;
}

async function renderOgPng(character: CharacterCard, stats: Awaited<ReturnType<typeof getCharacterStats>>): Promise<Buffer> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    viewport: { width: OG_WIDTH, height: OG_HEIGHT },
    deviceScaleFactor: 1,  // OG card resolution is fine at 1×; 2× would bloat unfurl payload
  });
  const page = await ctx.newPage();
  await page.setContent(buildHtml(character, stats), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(80); // font + gradient settle
  const png = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT },
    omitBackground: false,
  });
  await ctx.close();
  return png;
}

function buildHtml(character: CharacterCard, stats: Awaited<ReturnType<typeof getCharacterStats>>): string {
  const winRate = stats && stats.totalGames > 0
    ? Math.round((stats.wins / stats.totalGames) * 100)
    : null;
  const statsHtml = stats && stats.totalGames > 0
    ? `<div class="stats">
         <div class="stat"><div class="val">${stats.totalGames}</div><div class="lab">局</div></div>
         <div class="stat"><div class="val">${winRate}%</div><div class="lab">胜率</div></div>
         <div class="stat"><div class="val">${stats.suspicionsReceived}</div><div class="lab">疑票</div></div>
       </div>`
    : `<div class="rookie">🆕 首次出战 · 等你看戏</div>`;

  const safeEpithet = esc(character.epithet);
  const safeBackstory = esc(character.backstory);
  const safeQuote = esc(character.catchphrases[0]);

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; width: ${OG_WIDTH}px; height: ${OG_HEIGHT}px; overflow: hidden;
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC",
      -apple-system, system-ui, sans-serif; }
  .stage { position: relative; width: 100%; height: 100%;
    background:
      radial-gradient(ellipse at 25% 30%, rgba(255,79,163,0.32) 0%, transparent 50%),
      radial-gradient(ellipse at 75% 70%, rgba(176,134,255,0.28) 0%, transparent 50%),
      linear-gradient(135deg, #2D1B69 0%, #1a0d35 60%, #0a0a1e 100%);
    color: #F8F4E3; padding: 40px 60px; box-sizing: border-box;
    display: flex; align-items: center; gap: 48px;
  }
  .left { display: flex; flex-direction: column; align-items: center; flex: 0 0 280px; }
  .halo { width: 240px; height: 240px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,79,163,0.45) 0%, rgba(124,58,237,0.22) 50%, transparent 80%);
    display: flex; align-items: center; justify-content: center; font-size: 140px; }
  .nameUp { margin-top: 18px; font-size: 22px; font-weight: 800; opacity: 0.65;
    letter-spacing: 0.18em; }
  .right { flex: 1; display: flex; flex-direction: column; gap: 18px; }
  .epithet { font-size: 80px; font-weight: 900; line-height: 1;
    letter-spacing: -0.03em;
    background: linear-gradient(135deg, #FFD700 0%, #FF4FA3 50%, #B086FF 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    text-shadow: 0 0 40px rgba(255, 79, 163, 0.45); }
  .quote { font-size: 22px; line-height: 1.4; color: rgba(248,244,227,0.85);
    font-style: italic; opacity: 0.92; }
  .backstory { font-size: 16px; color: rgba(248,244,227,0.55); }
  .stats { display: flex; gap: 32px; margin-top: 8px; }
  .stat { display: flex; flex-direction: column; align-items: flex-start; }
  .stat .val { font-size: 48px; font-weight: 900; color: #FFD700; line-height: 1; }
  .stat .lab { font-size: 12px; color: rgba(248,244,227,0.55);
    letter-spacing: 0.1em; margin-top: 4px; }
  .rookie { display: inline-block; padding: 12px 28px; border-radius: 999px;
    background: rgba(255,215,0,0.18); color: #FFD700; font-weight: 800;
    border: 1px solid rgba(255,215,0,0.55); font-size: 18px; align-self: flex-start; }
  .brand { position: absolute; bottom: 28px; left: 60px; right: 60px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 14px; color: rgba(248,244,227,0.5); }
  .brand .wm { font-weight: 900; font-size: 18px;
    background: linear-gradient(135deg, #FFD700 0%, #FFA947 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
</style></head>
<body><div class="stage">
  <div class="left">
    <div class="halo">${character.emoji}</div>
    <div class="nameUp">${character.name.toUpperCase()}</div>
  </div>
  <div class="right">
    <div class="epithet">${safeEpithet}</div>
    <div class="quote">"${safeQuote}"</div>
    <div class="backstory">${safeBackstory}</div>
    ${statsHtml}
  </div>
  <div class="brand">
    <span class="wm">OFFICE ZOO · 班味剧场</span>
    <span>github.com/ChrisChen667788/office-zoo</span>
  </div>
</div></body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
