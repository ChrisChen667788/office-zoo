/**
 * /share/* — v6.11 P4 social meta-tag delivery for deep-links.
 *
 * Why HTTP routes for share pages (not SPA): crawlers (Twitter Cards,
 * Slack Unfurl, WeChat, Facebook) don't execute JS. They read the
 * initial HTML's <head>. The SPA's index.html is the same for every
 * URL, so links shared on social all unfurl identically (or not at all).
 *
 * This module serves a minimal pre-rendered HTML per share-deep-link
 * that contains:
 *   - dynamic og:title / og:description per character
 *   - og:image pointing to the brand horizontal-lockup-final (v6.11
 *     uses one shared image; v6.12 will switch to per-character PNGs
 *     pre-rendered server-side)
 *   - JS + meta refresh to bounce real browsers into the SPA, so a
 *     human clicking the link doesn't see this stub
 *
 * Routes (mounted under /share):
 *   GET /character/:name  — character deep-link share page
 */
import { Hono } from 'hono';
import { findCharacter } from '@furball/shared';

export const shareSocialRoutes = new Hono();

shareSocialRoutes.get('/character/:name', (c) => {
  const name = c.req.param('name');
  const character = findCharacter(name);
  if (!character) {
    return c.html(genericShareHtml(c.req.url), 404);
  }
  const origin = new URL(c.req.url).origin;
  // v6.12 P2 — per-character pre-rendered OG card. Stats change → cache
  // key rotates → crawlers get a fresh PNG. First-fetch lazy-renders
  // (~3-5s); after that disk-served (~50ms).
  const ogImage = `${origin}/api/characters/${encodeURIComponent(character.name)}/og-card.png`;
  const spaUrl = `/?character=${encodeURIComponent(character.name)}`;
  const title = `${character.epithet} · ${character.name} · OFFICE ZOO`;
  const description = `${character.backstory}。口头禅:"${character.catchphrases[0]}"`;
  return c.html(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>

  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:type" content="profile" />
  <meta property="og:url" content="${esc(c.req.url)}" />
  <meta property="og:site_name" content="OFFICE ZOO · 班味剧场" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${ogImage}" />

  <!-- Bounce real browsers to the SPA after crawlers parse <head>. -->
  <meta http-equiv="refresh" content="0; url=${esc(spaUrl)}" />
  <link rel="canonical" href="${esc(spaUrl)}" />
  <style>
    body { margin: 0; background: #0a0a1e; color: #F8F4E3;
      font-family: -apple-system, "PingFang SC", system-ui, sans-serif; }
    .wrap { max-width: 640px; margin: 80px auto; padding: 24px; text-align: center; }
    h1 { background: linear-gradient(135deg, #FFD700 0%, #FF4FA3 50%, #B086FF 100%);
      -webkit-background-clip: text; background-clip: text; color: transparent;
      font-weight: 900; letter-spacing: -0.02em; }
    a { color: #FFD700; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${esc(character.epithet)}</h1>
    <p>${esc(character.backstory)}</p>
    <p><a href="${esc(spaUrl)}">→ 进入 OFFICE ZOO 查看完整档案</a></p>
  </div>
  <script>setTimeout(function(){ location.replace(${JSON.stringify(spaUrl)}); }, 60);</script>
</body>
</html>`);
});

function genericShareHtml(currentUrl: string): string {
  const origin = new URL(currentUrl).origin;
  const ogImage = `${origin}/assets/brand/logo-horizontal-lockup-final.png`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>OFFICE ZOO · 班味剧场</title>
  <meta property="og:title" content="OFFICE ZOO · 班味剧场" />
  <meta property="og:description" content="0 点的写字楼, AI 鼠人替你拥抱变化, 你回家躺平。" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${ogImage}" />
  <meta http-equiv="refresh" content="0; url=/" />
</head>
<body><script>location.replace('/');</script></body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
