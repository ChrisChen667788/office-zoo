/**
 * characterShareCard — v6.8 P-share PersonaCard → 1080×1350 PNG.
 *
 * Sibling of fortuneShareCard / weeklyShareCard / trendShareCard /
 * abCompareShareCard. Renders the PersonaCard popover content (epithet +
 * IP + lifetime stats + catchphrases + backstory) as a shareable card
 * for 朋友圈 / 小红书 / Twitter.
 *
 * Why a 5th share card?
 *   - The character popover is its own data shape (CharacterCard + stats);
 *     wedging it into one of the other 4 cards' layouts would waste their
 *     dominant focal points (vibe gauge / trend line / weekly recap).
 *   - The character card needs a portrait-mascot hero, not a tarot card
 *     or trend chart. Different visual language = own file.
 *
 * Output: 1080×1350 4:5 IG-portrait PNG. Same shape as the rest so feeds
 * frame consistently. 2× DPI internally (canvas backbuffer; downscale on
 * blob encode) for messaging-app recompression resilience.
 *
 *   const blob = await generateCharacterShareCard(data);
 *   await copyCharacterShareCard(data);
 *   await downloadCharacterShareCard(data, 'office-zoo-Tony.png');
 */

export interface CharacterShareCardData {
  /** Lookup key — display name (Tony / Lisa / ...). */
  name: string;
  /** Display epithet — "Excel 永动机". */
  epithet: string;
  /** Single emoji tied to the epithet — "⚙️". */
  emoji: string;
  /** 3 catchphrases. */
  catchphrases: [string, string, string];
  /** 1-line backstory. */
  backstory: string;
  /** Optional lifetime stats. null = 首次出战 placeholder. */
  stats: {
    totalGames: number;
    wins: number;
    votedOut: number;
    suspicionsReceived: number;
    favoritePersonality?: { label: string; emoji: string; color: string };
  } | null;
  /** Optional this-game personality + 反差 flag for the IP-vs-current
   *  joke layer. Omit on cards generated outside an active game. */
  thisGame?: {
    personality: { label: string; emoji: string; color: string };
    isReversal: boolean;
  };
}

const W = 1080;
const H = 1350;
const PAD = 56;

const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

/* ---------- Canvas primitives (duplicated from sibling cards) ---------- */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}
function strokeRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, stroke: string, width = 1) {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}
function rgba(hex: string, a: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------- Section draws -------------------------------------------- */

function drawBackground(ctx: CanvasRenderingContext2D) {
  // Cosmic violet radial — matches OFFICE ZOO brand palette (BRAND_GUIDE §2).
  const bg = ctx.createRadialGradient(W * 0.5, 400, 100, W * 0.5, H / 2, H);
  bg.addColorStop(0, '#2D1B69');
  bg.addColorStop(0.5, '#1a0d35');
  bg.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle pink/violet bokeh dots — particles
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 1 + Math.random() * 3;
    ctx.fillStyle = i % 2 === 0
      ? 'rgba(255, 79, 163, 0.18)'
      : 'rgba(176, 134, 255, 0.16)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeader(ctx: CanvasRenderingContext2D) {
  // OFFICE ZOO chip top-left
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 18px ${SANS}`;
  const grad = ctx.createLinearGradient(PAD, 0, PAD + 280, 0);
  grad.addColorStop(0, '#FFD700');
  grad.addColorStop(1, '#FFA947');
  ctx.fillStyle = grad;
  ctx.fillText('班味剧场 · OFFICE ZOO', PAD, 60);

  // Right chip: "鼠人档案"
  ctx.textAlign = 'right';
  ctx.font = `700 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255,215,0,0.55)';
  ctx.fillText('鼠人档案', W - PAD, 60);
}

function drawHero(ctx: CanvasRenderingContext2D, data: CharacterShareCardData): number {
  const cx = W / 2;
  let y = 130;

  // Large emoji halo + emoji
  const haloR = 130;
  const halo = ctx.createRadialGradient(cx, y + haloR, 20, cx, y + haloR, haloR + 40);
  halo.addColorStop(0, 'rgba(255, 79, 163, 0.42)');
  halo.addColorStop(0.5, 'rgba(124, 58, 237, 0.28)');
  halo.addColorStop(1, 'rgba(124, 58, 237, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(cx - haloR - 40, y, (haloR + 40) * 2, (haloR + 40) * 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `160px ${SANS}`;
  ctx.fillText(data.emoji, cx, y + haloR);
  y += haloR * 2 + 30;

  // Epithet (gold gradient)
  ctx.font = `900 56px ${SANS}`;
  const epithetGrad = ctx.createLinearGradient(0, y, 0, y + 70);
  epithetGrad.addColorStop(0, '#FFD700');
  epithetGrad.addColorStop(1, '#FFA947');
  ctx.fillStyle = epithetGrad;
  ctx.fillText(data.epithet, cx, y);
  y += 50;

  // Name uppercase tracking-wide
  ctx.font = `800 22px ${SANS}`;
  ctx.fillStyle = 'rgba(248, 244, 227, 0.65)';
  // Manual letter-spacing — measure each char
  const upper = data.name.toUpperCase();
  const tracking = 6;
  const widths = [...upper].map((c) => ctx.measureText(c).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + tracking * (upper.length - 1);
  let charX = cx - totalWidth / 2;
  for (let i = 0; i < upper.length; i++) {
    ctx.textAlign = 'left';
    ctx.fillText(upper[i], charX, y + 30);
    charX += widths[i] + tracking;
  }
  y += 60;

  // 本局 personality chip (if provided)
  if (data.thisGame) {
    const persona = data.thisGame.personality;
    const text = `本局 · ${persona.emoji} ${persona.label}${data.thisGame.isReversal ? '  🔄 反差' : ''}`;
    ctx.font = `700 22px ${SANS}`;
    const tw = ctx.measureText(text).width + 36;
    const chipX = cx - tw / 2;
    fillRoundRect(ctx, chipX, y, tw, 44, 22, rgba(persona.color, 0.18));
    strokeRoundRect(ctx, chipX, y, tw, 44, 22, rgba(persona.color, 0.6), 2);
    ctx.fillStyle = persona.color;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, y + 22);
    y += 60;
  }
  return y;
}

function drawStatsBlock(ctx: CanvasRenderingContext2D, data: CharacterShareCardData, startY: number): number {
  const stats = data.stats;
  let y = startY + 20;

  if (!stats || stats.totalGames === 0) {
    // "首次出战" pill
    ctx.font = `800 26px ${SANS}`;
    ctx.textAlign = 'center';
    const text = '🆕 首次出战 · 等你看戏';
    const tw = ctx.measureText(text).width + 60;
    fillRoundRect(ctx, W / 2 - tw / 2, y, tw, 64, 32, 'rgba(255,215,0,0.12)');
    strokeRoundRect(ctx, W / 2 - tw / 2, y, tw, 64, 32, 'rgba(255,215,0,0.5)', 2);
    ctx.fillStyle = '#FFD700';
    ctx.fillText(text, W / 2, y + 32);
    return y + 90;
  }

  const winRate = Math.round((stats.wins / stats.totalGames) * 100);
  const survRate = Math.round(((stats.totalGames - stats.votedOut) / stats.totalGames) * 100);

  // 3 stat blocks — totalGames / winRate / survRate
  const blockW = (W - PAD * 2 - 32) / 3;
  const blockH = 130;
  const items = [
    { label: '上桌',  value: `${stats.totalGames}`,    sub: '局', color: '#FFD700' },
    { label: '胜率',  value: `${winRate}%`,             sub: `${stats.wins}/${stats.totalGames}`,
      color: winRate >= 50 ? '#5be24a' : '#FFD700' },
    { label: '存活率', value: `${survRate}%`,           sub: `被裁 ${stats.votedOut}`,
      color: survRate >= 50 ? '#B086FF' : '#ff6347' },
  ];
  for (let i = 0; i < 3; i++) {
    const it = items[i];
    const x = PAD + i * (blockW + 16);
    fillRoundRect(ctx, x, y, blockW, blockH, 18, 'rgba(255,255,255,0.04)');
    strokeRoundRect(ctx, x, y, blockW, blockH, 18, rgba(it.color, 0.35), 1.5);
    // Label
    ctx.font = `700 14px ${SANS}`;
    ctx.fillStyle = 'rgba(248,244,227,0.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(it.label, x + blockW / 2, y + 14);
    // Value (big number)
    ctx.font = `900 56px ${SANS}`;
    ctx.fillStyle = it.color;
    ctx.fillText(it.value, x + blockW / 2, y + 34);
    // Sub
    ctx.font = `600 13px ${SANS}`;
    ctx.fillStyle = 'rgba(248,244,227,0.45)';
    ctx.fillText(it.sub, x + blockW / 2, y + 100);
  }
  y += blockH + 16;

  // Bottom row: 疑票 + 常演 personality
  ctx.font = `700 18px ${SANS}`;
  ctx.fillStyle = 'rgba(248,244,227,0.7)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`累计疑票 ${stats.suspicionsReceived}`, PAD, y + 14);
  if (stats.favoritePersonality) {
    const fp = stats.favoritePersonality;
    ctx.textAlign = 'right';
    ctx.fillStyle = fp.color;
    ctx.fillText(`常演 ${fp.emoji} ${fp.label}`, W - PAD, y + 14);
  }
  y += 50;
  return y;
}

function drawCatchphrases(ctx: CanvasRenderingContext2D, data: CharacterShareCardData, startY: number): number {
  let y = startY + 30;
  // Section title
  ctx.font = `800 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255,215,0,0.55)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('经 典 语 录   /   CATCHPHRASES', PAD, y);
  y += 30;

  ctx.font = `600 22px ${SANS}`;
  ctx.fillStyle = 'rgba(248,244,227,0.85)';
  for (const q of data.catchphrases) {
    const text = `"${q}"`;
    ctx.fillText(text, PAD, y);
    y += 38;
  }
  y += 14;

  // Backstory italic
  ctx.font = `italic 600 17px ${SANS}`;
  ctx.fillStyle = 'rgba(248,244,227,0.5)';
  ctx.fillText(data.backstory, PAD, y);
  y += 32;
  return y;
}

function drawFooter(ctx: CanvasRenderingContext2D) {
  // Top divider
  ctx.strokeStyle = 'rgba(255,215,0,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 110);
  ctx.lineTo(W - PAD, H - 110);
  ctx.stroke();

  // Left: brand
  ctx.font = `900 20px ${SANS}`;
  const grad = ctx.createLinearGradient(PAD, 0, PAD + 220, 0);
  grad.addColorStop(0, '#FFD700');
  grad.addColorStop(1, '#FFA947');
  ctx.fillStyle = grad;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('OFFICE ZOO', PAD, H - 70);

  ctx.font = `600 13px ${SANS}`;
  ctx.fillStyle = 'rgba(248,244,227,0.55)';
  ctx.fillText('0 点的写字楼 · AI 鼠人替你拥抱变化', PAD, H - 44);

  // Right: github
  ctx.textAlign = 'right';
  ctx.font = `700 14px ${SANS}`;
  ctx.fillStyle = 'rgba(255,215,0,0.65)';
  ctx.fillText('github.com/ChrisChen667788/office-zoo', W - PAD, H - 56);
}

/* ---------- Public API ----------------------------------------------- */

export async function generateCharacterShareCard(data: CharacterShareCardData): Promise<Blob> {
  // 2× backbuffer for messaging-app recompression resilience.
  const DPR = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.scale(DPR, DPR);

  drawBackground(ctx);
  drawHeader(ctx);
  const afterHero = drawHero(ctx, data);
  const afterStats = drawStatsBlock(ctx, data, afterHero);
  drawCatchphrases(ctx, data, afterStats);
  drawFooter(ctx);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/png',
      0.95,
    );
  });
}

/** Downloads the card with a friendly filename. */
export async function downloadCharacterShareCard(
  data: CharacterShareCardData,
  filename = `office-zoo-${data.name}.png`,
): Promise<void> {
  const blob = await generateCharacterShareCard(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/** Copies the PNG to the system clipboard. Throws if clipboard API
 *  isn't available (HTTP / older Safari) — caller should fall back
 *  to download. */
export async function copyCharacterShareCard(data: CharacterShareCardData): Promise<void> {
  if (!navigator.clipboard?.write) {
    throw new Error('clipboard write not supported');
  }
  const blob = await generateCharacterShareCard(data);
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ]);
}

/** Returns a data URL for preview thumbs (modal preview before download). */
export async function previewCharacterShareCard(data: CharacterShareCardData): Promise<string> {
  const blob = await generateCharacterShareCard(data);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
