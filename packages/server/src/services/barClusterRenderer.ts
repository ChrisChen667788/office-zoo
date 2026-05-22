/**
 * barClusterRenderer — v6.2 server-side 朋友拼版 PNG 渲染。
 *
 * 给定 cluster id, 拉数据 → 注入 HTML 模板 → Playwright 截图 → 返回 PNG。
 *
 * 为什么用 Playwright 而不是 node-canvas:
 *   - node-canvas 装在不同 OS 上踩坑多 (cairo/pango/libpng deps)
 *   - 我们 dev 工具链里 Playwright 已经在 (probe 脚本一直在用)
 *   - HTML/CSS 改样式比 canvas API 写图形快 10×
 *   - 服务端启动时 Playwright 不会 init, 仅首次渲染请求时动态 import
 *
 * 输出: 1080×1350 PNG, IG-portrait 比例, 跟 dailyShareCard / fortuneShareCard
 * 一致。
 *
 * 缓存: cluster 数据在 30 天 TTL 内基本不变, 所以渲染结果可以 process-level
 * memoize。max 200 个 (LRU drop oldest), 每个 ~150 KB = 总占用 30 MB 上限。
 */

import type { BarCluster, ClusterSnippet } from './barClusterStore';
import { getCluster } from './barClusterStore';

const RENDER_CACHE_MAX = 200;
const renderCache = new Map<string, Buffer>();

function cacheGet(id: string): Buffer | undefined {
  const v = renderCache.get(id);
  if (v) {
    // LRU touch
    renderCache.delete(id);
    renderCache.set(id, v);
  }
  return v;
}
function cacheSet(id: string, buf: Buffer): void {
  renderCache.set(id, buf);
  while (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
}

/** Wipe the cache when a cluster is updated (more participants joined). */
export function invalidateClusterRender(id: string): void {
  renderCache.delete(id);
}

const ARCHETYPE_LABEL: Record<string, { label: string; emoji: string; element: string }> = {
  passive_aggressive: { label: '阴阳人',   emoji: '🐍', element: 'stigma' },
  sass_master:        { label: '毒舌怪',   emoji: '🗡️', element: 'void' },
  sycophant:          { label: '舔狗派',   emoji: '🐶', element: 'aurora' },
  hot_tempered:       { label: '暴躁老哥', emoji: '🔥', element: 'inferno' },
  introvert:          { label: '社恐怪',   emoji: '🐢', element: 'frost' },
  workaholic:         { label: '卷王',     emoji: '🥇', element: 'solar' },
  smooth_operator:    { label: '老狐狸',   emoji: '🦊', element: 'solar' },
  social_butterfly:   { label: '社牛蝶',   emoji: '🦋', element: 'aurora' },
  contrarian:         { label: '杠精',     emoji: '⚔️', element: 'stigma' },
};

const ELEMENT_GRADIENTS: Record<string, { from: string; to: string; glow: string }> = {
  stigma:  { from: '#FF4FA3', to: '#B086FF', glow: 'rgba(255,79,163,0.45)' },
  void:    { from: '#7c3aed', to: '#1a0d35', glow: 'rgba(124,58,237,0.45)' },
  aurora:  { from: '#4ECDC4', to: '#B086FF', glow: 'rgba(78,205,196,0.45)' },
  inferno: { from: '#FF6B35', to: '#FF4FA3', glow: 'rgba(255,107,53,0.45)' },
  frost:   { from: '#00D9FF', to: '#4A90E2', glow: 'rgba(0,217,255,0.45)' },
  solar:   { from: '#FFD700', to: '#FFA947', glow: 'rgba(255,215,0,0.45)' },
};

/** Build the full HTML for one cluster. Inline everything — no external
 *  assets so Playwright doesn't wait on font loads / image fetches that
 *  could time out. */
function buildHtml(cluster: BarCluster): string {
  const archeMeta = ARCHETYPE_LABEL[cluster.archetype] ?? {
    label: cluster.archetype, emoji: '🐀', element: 'void',
  };
  const grad = ELEMENT_GRADIENTS[archeMeta.element] ?? ELEMENT_GRADIENTS.void;
  const total = cluster.participants.length;

  // Map snippets to compact lines. Show user lines (their take) more
  // prominently; AI lines (the archetype's response) get a quote-mark frame.
  const participantBlocks = cluster.participants.map((p, idx) => {
    const userSnips = (p.snippets ?? []).filter((s: ClusterSnippet) => s.who === 'user').slice(0, 2);
    const aiSnips   = (p.snippets ?? []).filter((s: ClusterSnippet) => s.who === 'ai').slice(0, 1);
    const name = (p.displayName ?? `朋友 ${idx + 1}`).replace(/[<>&"]/g, '');
    const snipsHtml = [
      ...userSnips.map((s) => `<div class="snip user">${escapeHtml(s.text)}</div>`),
      ...aiSnips.map((s)   => `<div class="snip ai">"${escapeHtml(s.text)}"</div>`),
    ].join('');
    // 5★ rarity badge for visual flavor — all participants get 5★ since
    // contributing a memorable snippet counts as legendary effort.
    return `
      <div class="participant">
        <div class="part-head">
          <div class="num">#${idx + 1}</div>
          <div class="name-wrap">
            <div class="name">${name}</div>
            <div class="stars">★★★★★</div>
          </div>
        </div>
        <div class="snippets">${snipsHtml || '<div class="snip empty">(尚无金句)</div>'}</div>
      </div>
    `;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8" /><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1080px; height: 1350px; overflow: hidden; }
    body {
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
                   -apple-system, "Helvetica Neue", sans-serif;
      color: #F8F4E3;
      background:
        radial-gradient(ellipse at 25% 18%, rgba(176,134,255,0.32) 0%, transparent 45%),
        radial-gradient(ellipse at 78% 82%, ${grad.glow} 0%, transparent 50%),
        radial-gradient(ellipse at 50% 50%, #2D1B69 0%, #1a0d35 60%, #0a0a1e 100%);
      position: relative;
    }
    body::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        radial-gradient(2px 2px at 20% 30%, rgba(255,255,255,0.4) 30%, transparent 70%),
        radial-gradient(1.5px 1.5px at 60% 10%, rgba(255,239,107,0.5) 30%, transparent 70%),
        radial-gradient(1px 1px at 80% 50%, rgba(176,134,255,0.5) 30%, transparent 70%),
        radial-gradient(2px 2px at 30% 75%, rgba(78,205,196,0.4) 30%, transparent 70%),
        radial-gradient(1px 1px at 90% 25%, rgba(255,255,255,0.45) 30%, transparent 70%),
        radial-gradient(1.5px 1.5px at 45% 85%, rgba(255,215,0,0.35) 30%, transparent 70%);
      background-size: 1080px 1350px;
      pointer-events: none;
    }
    body::after {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(60deg, transparent 49%, rgba(255,255,255,0.02) 49% 51%, transparent 51%),
        linear-gradient(-60deg, transparent 49%, rgba(255,255,255,0.02) 49% 51%, transparent 51%);
      background-size: 36px 36px;
      pointer-events: none;
    }
    .container {
      position: relative;
      width: 100%;
      height: 100%;
      padding: 60px 56px 80px;
      display: flex;
      flex-direction: column;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
    }
    .brand {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 0.06em;
      background: linear-gradient(90deg, #B086FF, #FF5588);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .date {
      font-size: 16px;
      color: rgba(248,244,227,0.45);
      letter-spacing: 0.06em;
    }
    .event-pill {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 20px;
      border-radius: 999px;
      background: linear-gradient(90deg, rgba(255,215,0,0.18), rgba(176,134,255,0.18), rgba(255,79,163,0.16));
      border: 1px solid rgba(255,215,0,0.55);
      box-shadow: 0 8px 28px rgba(255,215,0,0.18);
      margin-bottom: 18px;
    }
    .event-pill .dot {
      width: 8px; height: 8px;
      background: #FFD700;
      border-radius: 50%;
      box-shadow: 0 0 10px #FFD700;
    }
    .event-pill .label {
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      background: linear-gradient(180deg, #fff 0%, #FFD58A 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .title-block {
      margin-bottom: 24px;
    }
    .title {
      font-size: 56px;
      font-weight: 900;
      line-height: 1.15;
      background: linear-gradient(180deg, #fff 0%, #FFD58A 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow: 0 0 24px rgba(255,215,0,0.25);
      margin-bottom: 14px;
    }
    .subtitle {
      font-size: 19px;
      line-height: 1.6;
      color: rgba(248,244,227,0.75);
      max-width: 720px;
    }
    .subtitle .archetype-chip {
      display: inline-block;
      padding: 2px 10px;
      margin: 0 4px;
      border-radius: 6px;
      background: linear-gradient(135deg, ${grad.from}, ${grad.to});
      color: #fff;
      font-weight: 800;
    }
    .grid {
      flex: 1;
      display: grid;
      grid-template-columns: ${
        total === 1 ? '1fr' :
        total <= 4 ? 'repeat(2, 1fr)' :
                     'repeat(3, 1fr)'
      };
      gap: 18px;
      margin-bottom: 24px;
    }
    .participant {
      position: relative;
      padding: 3px;
      border-radius: 18px;
      background: linear-gradient(135deg, #FFD700, ${grad.from}, ${grad.to});
      box-shadow: 0 8px 24px ${grad.glow};
    }
    .participant > .inner {
      background: linear-gradient(180deg, rgba(20,15,52,0.92), rgba(10,10,30,0.96));
      border-radius: 15px;
      padding: 18px 20px;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .part-head {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255,215,0,0.18);
    }
    .num {
      font-size: 24px;
      font-weight: 900;
      color: #FFD700;
      letter-spacing: 0.04em;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }
    .name-wrap { flex: 1; }
    .name {
      font-size: 18px;
      font-weight: 800;
      color: #fff;
      letter-spacing: 0.04em;
      line-height: 1.2;
    }
    .stars {
      font-size: 10px;
      color: #FFEF6B;
      letter-spacing: 0.1em;
      margin-top: 2px;
    }
    .snippets {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .snip {
      font-size: 13px;
      line-height: 1.55;
      padding: 8px 10px;
      border-radius: 8px;
    }
    .snip.user {
      background: rgba(255,255,255,0.10);
      border: 1px solid rgba(255,255,255,0.20);
      color: rgba(255,255,255,0.98);
      font-weight: 600;
    }
    .snip.ai {
      background: linear-gradient(135deg, rgba(255,215,0,0.16), rgba(255,215,0,0.04));
      border: 1px solid ${grad.from}88;
      color: #FFEFCB;
      font-style: italic;
      font-weight: 500;
    }
    .snip.empty {
      color: rgba(255,255,255,0.30);
      font-style: italic;
      text-align: center;
      padding: 12px;
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 18px;
      border-top: 1px solid rgba(255,255,255,0.10);
    }
    .footer-left {
      font-size: 13px;
      color: rgba(248,244,227,0.55);
      letter-spacing: 0.12em;
    }
    .footer-left strong {
      color: #FFD58A;
      font-weight: 800;
    }
    .footer-right {
      font-size: 12px;
      color: rgba(248,244,227,0.45);
      letter-spacing: 0.18em;
      text-transform: uppercase;
      font-weight: 700;
    }
    .stat {
      display: inline-block;
      margin-right: 18px;
    }
    .stat .num-big {
      font-size: 22px;
      font-weight: 900;
      color: #fff;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }
    .stat .lbl {
      font-size: 10px;
      color: rgba(255,255,255,0.55);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      margin-left: 4px;
    }
  </style></head><body>
    <div class="container">
      <div class="header">
        <div class="brand">🐀 OFFICE ZOO · 班味剧场</div>
        <div class="date">${formatDate(cluster.createdAt)}</div>
      </div>
      <div class="event-pill">
        <span class="dot"></span>
        <span class="label">🍷 朋友拼版 · CLUSTER OF ${total}</span>
      </div>
      <div class="title-block">
        <div class="title">${total} 个朋友<br/>陪同一个 ${archeMeta.label} 喝了一杯</div>
        <div class="subtitle">
          在 ${archeMeta.emoji}<span class="archetype-chip">${archeMeta.label}</span>的酒馆,
          ${total} 个朋友各自留下了金句, 拼成这张"群像截图"。
          每个人的视角都不同, AI 的回应也跟着每个人在变 —
          这就是跨局记忆 + per-spectator 的化学反应。
        </div>
      </div>
      <div class="grid">
        ${participantBlocks}
      </div>
      <div class="footer">
        <div class="footer-left">
          <span class="stat">
            <span class="num-big">${total}</span><span class="lbl">朋友</span>
          </span>
          <span class="stat">
            <span class="num-big">${cluster.participants.reduce((s, p) => s + (p.snippets?.length ?? 0), 0)}</span><span class="lbl">金句</span>
          </span>
          · <strong>#班味拼版</strong>
        </div>
        <div class="footer-right">github.com/ChrisChen667788/office-zoo</div>
      </div>
    </div>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]);
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Render a cluster's group portrait PNG. Returns null if cluster doesn't
 *  exist OR if Playwright fails (caller decides whether to 404 / 500). */
export async function renderClusterPng(clusterId: string): Promise<Buffer | null> {
  const cached = cacheGet(clusterId);
  if (cached) return cached;

  const cluster = await getCluster(clusterId);
  if (!cluster) return null;

  // Lazy import — Playwright is heavy, don't load on server boot.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chromium: any;
  try {
    chromium = (await import('playwright')).chromium;
  } catch (err) {
    console.error('[barClusterRenderer] playwright import failed:', (err as Error).message);
    return null;
  }

  let browser;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const html = buildHtml(cluster);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    // Tiny settle wait for emoji webfont fallback to paint
    await page.waitForTimeout(400);
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    await browser.close();
    cacheSet(clusterId, buf);
    return buf;
  } catch (err) {
    console.error('[barClusterRenderer] render failed:', (err as Error).message);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}
