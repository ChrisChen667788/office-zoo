/**
 * banweiShareCard — v6.33 P3 班味指数 PNG 海报.
 *
 * 1080×1350 IG-portrait, sibling of trendShareCard / weeklyShareCard.
 * 把 banwei snapshot (本周 score + tier + 5 轴 breakdown + WoW delta)
 * 拼成可一键发圈的图.
 *
 * Composition (top-to-bottom):
 *   • 顶部 OFFICE ZOO wordmark + week key
 *   • 巨大 score badge (0-100, 色阶 by tier)
 *   • tier 中文 + emoji
 *   • 5-axis mini radar (pentagon, 半径 = count / cap)
 *   • WoW row (上周 → 本周 delta arrow)
 *   • 底部 invite tag
 */
export interface BanweiCardData {
  weekKey: string;
  score: number;
  tierLabel: string;
  tierEmoji: string;
  breakdown: {
    leaks: { count: number; cap: number };
    leakQuotes: { count: number; cap: number };
    gamesSeen: { count: number; cap: number };
    talkshowPlayed: { count: number; cap: number };
    anniversaryVisited: { count: number; cap: number };
  };
  priorScore: number | null;
}

const W = 1080;
const H = 1350;
const PAD = 56;
const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

const AXIS_LABELS: Array<keyof BanweiCardData['breakdown']> = [
  'leaks', 'leakQuotes', 'gamesSeen', 'talkshowPlayed', 'anniversaryVisited',
];
const AXIS_NAMES: Record<keyof BanweiCardData['breakdown'], string> = {
  leaks: '爆料投递',
  leakQuotes: 'AI 引用',
  gamesSeen: '经典局',
  talkshowPlayed: '段子听',
  anniversaryVisited: '周年回顾',
};

/* ── tier color map (mirrors BanweiIndexCard) ─────────────────── */
function tierColors(score: number): { accent: string; accent2: string } {
  if (score >= 80) return { accent: '#FFD700', accent2: '#FFA947' };
  if (score >= 60) return { accent: '#FF4FA3', accent2: '#7c3aed' };
  if (score >= 40) return { accent: '#4ECDC4', accent2: '#2fb8ff' };
  if (score >= 20) return { accent: '#B086FF', accent2: '#7c3aed' };
  return { accent: '#888888', accent2: '#555555' };
}

/* ── background painter (cosmic violet, sibling of other share cards) */
function paintBg(ctx: CanvasRenderingContext2D): void {
  // Radial cosmic gradient
  const grad = ctx.createRadialGradient(W / 2, H * 0.4, W * 0.1, W / 2, H / 2, W * 0.9);
  grad.addColorStop(0, '#2D1B69');
  grad.addColorStop(0.5, '#1a0d35');
  grad.addColorStop(1, '#0a0a1e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Subtle noise dots
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 80; i++) {
    const x = (i * 137.5) % W;
    const y = (i * 73.2) % H;
    ctx.beginPath();
    ctx.arc(x, y, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ── radar painter (5-axis pentagon) ──────────────────────────── */
function paintRadar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, data: BanweiCardData, accent: string): void {
  // Background pentagon (faint)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (r * ring) / 4;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  // Filled data polygon
  const pts = AXIS_LABELS.map((k, i) => {
    const v = data.breakdown[k];
    const ratio = v.cap > 0 ? Math.min(1, v.count / v.cap) : 0;
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [cx + Math.cos(a) * r * ratio, cy + Math.sin(a) * r * ratio];
  });
  ctx.fillStyle = accent + '40';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `600 22px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  AXIS_LABELS.forEach((k, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const lx = cx + Math.cos(a) * (r + 36);
    const ly = cy + Math.sin(a) * (r + 36);
    ctx.fillText(AXIS_NAMES[k], lx, ly);
  });
}

/* ── public: build the 1080×1350 PNG blob ─────────────────────── */
export async function generateBanweiShareCard(data: BanweiCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d ctx unavailable');

  paintBg(ctx);
  const { accent, accent2 } = tierColors(data.score);

  // ── Header: OFFICE ZOO wordmark + week key ──
  ctx.fillStyle = '#FFD58A';
  ctx.font = `900 32px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('OFFICE ZOO · 班味指数', PAD, PAD);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = `600 22px ${SANS}`;
  ctx.fillText(data.weekKey, PAD, PAD + 44);

  // ── Score badge (huge, centered top-third) ──
  const badgeCx = W / 2;
  const badgeCy = 340;
  const badgeR = 180;
  const badgeGrad = ctx.createLinearGradient(badgeCx - badgeR, badgeCy - badgeR, badgeCx + badgeR, badgeCy + badgeR);
  badgeGrad.addColorStop(0, accent);
  badgeGrad.addColorStop(1, accent2);
  ctx.fillStyle = badgeGrad;
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
  ctx.fill();
  // Outer glow
  ctx.shadowColor = accent + 'aa';
  ctx.shadowBlur = 60;
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR + 4, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Score number
  ctx.fillStyle = '#0a0a1e';
  ctx.font = `900 160px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(data.score), badgeCx, badgeCy - 10);
  ctx.font = `900 28px ${SANS}`;
  ctx.fillStyle = 'rgba(10,10,30,0.7)';
  ctx.fillText('SCORE / 100', badgeCx, badgeCy + 90);

  // ── Tier label (below badge) ──
  ctx.fillStyle = accent;
  ctx.font = `900 60px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${data.tierEmoji} ${data.tierLabel}`, badgeCx, 570);

  // ── 5-axis radar ──
  paintRadar(ctx, badgeCx, 880, 200, data, accent);

  // ── WoW delta row ──
  if (data.priorScore !== null) {
    const delta = data.score - data.priorScore;
    const arrow = delta > 0 ? '↗' : delta < 0 ? '↘' : '=';
    const dColor = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : 'rgba(255,255,255,0.6)';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `600 28px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(`上周 ${data.priorScore}`, W / 2 - 80, 1170);
    ctx.fillStyle = dColor;
    ctx.font = `900 44px ${SANS}`;
    ctx.fillText(arrow, W / 2, 1170);
    ctx.font = `900 32px ${SANS}`;
    ctx.fillText(delta > 0 ? `+${delta}` : delta === 0 ? '持平' : String(delta), W / 2 + 90, 1170);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `600 24px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText('第一次班味打卡 · 下周来看变化', W / 2, 1170);
  }

  // ── Footer tag ──
  ctx.fillStyle = 'rgba(255,215,0,0.55)';
  ctx.font = `800 22px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText('🐀 github.com/ChrisChen667788/office-zoo', W / 2, H - 60);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png');
  });
}

/** Trigger a browser download of the generated PNG. */
export async function downloadBanweiShareCard(data: BanweiCardData, filename = 'banwei-index.png'): Promise<void> {
  const blob = await generateBanweiShareCard(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}
