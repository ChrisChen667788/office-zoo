// pages/banwei — 班味指数 原生小程序页面 (不依赖 webview).
// 直接调用 server API: POST /api/banwei + 拉本周 score + breakdown.
const app = getApp();
const { paintBanwei } = require('../../utils/banweiPaint');

Page({
  data: {
    loading: true,
    score: 0,
    tierLabel: '试用期',
    tierEmoji: '🌱',
    tierAccent: '#888',
    breakdown: [],
    priorScore: null,
    delta: null,
    err: null,
  },

  onReady() {
    // v6.50 P3 — enable BOTH 转发给好友 + 分享到朋友圈 from the system「···」
    // menu (without this, shareTimeline is greyed out even though the
    // handler exists).
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  },

  onShow() {
    this.fetchBanwei();
  },

  fetchBanwei() {
    this.setData({ loading: true, err: null });
    // 没有客户端 achievement 计数, 这里都填 0 (mini-program 没接 H5 localStorage).
    // 真服务器只会读 leaks / leakQuotes per-user, 其他 axis 客户端给 0.
    app.api('/api/banwei', {
      method: 'POST',
      data: { gamesSeen: 0, talkshowPlayed: 0, anniversaryVisited: 0 },
    })
      .then((d) => {
        const { thisWeek, prior, delta } = d;
        const tier = this.scoreTier(thisWeek.score);
        this.setData({
          loading: false,
          score: thisWeek.score,
          tierLabel: tier.label,
          tierEmoji: tier.emoji,
          tierAccent: tier.accent,
          breakdown: [
            { name: '爆料投递', count: thisWeek.leaks, cap: 10 },
            { name: 'AI 引用', count: thisWeek.leakQuotes, cap: 5 },
            { name: '经典局',  count: thisWeek.gamesSeen, cap: 5 },
            { name: '段子听',  count: thisWeek.talkshowPlayed, cap: 5 },
            { name: '周年回顾', count: thisWeek.anniversaryVisited, cap: 1 },
          ].map((b) => ({ ...b, pct: b.cap > 0 ? Math.min(100, (b.count / b.cap) * 100) : 0 })),
          priorScore: prior ? prior.score : null,
          delta,
        });
        // v6.50 P3 — pre-render the poster so 转发/朋友圈 use a custom card
        // image instead of WeChat's default page screenshot. Best-effort.
        this._prepareShareImage();
      })
      .catch((e) => this.setData({ loading: false, err: String(e?.errMsg || e) }));
  },

  scoreTier(score) {
    if (score >= 80) return { label: '班味永动机', emoji: '🔥', accent: '#FFD700' };
    if (score >= 60) return { label: '资深打工人', emoji: '💼', accent: '#FF4FA3' };
    if (score >= 40) return { label: '稳定输出中', emoji: '⚙️', accent: '#4ECDC4' };
    if (score >= 20) return { label: '边缘观察员', emoji: '👀', accent: '#B086FF' };
    return { label: '试用期', emoji: '🌱', accent: 'rgba(255,255,255,0.55)' };
  },

  // v6.35 P1 — 真 Canvas 海报. 借 H5 端 utils/banweiShareCard.ts 设计,
  // wx 原生 Canvas 2D 重画 1080×1350 IG-portrait, 保存到临时文件,
  // wx.previewImage 预览, 用户长按可以保存到相册或分享。
  onShareCard() {
    wx.showLoading({ title: '生成海报...' });
    this._renderPoster()
      .then((tempFilePath) => {
        wx.hideLoading();
        this.shareImagePath = tempFilePath; // reuse as custom share imageUrl
        wx.previewImage({ urls: [tempFilePath], current: tempFilePath });
      })
      .catch((e) => {
        wx.hideLoading();
        wx.showToast({ title: '导出失败', icon: 'error' });
        console.error('[banwei] poster render fail', e);
      });
  },

  /** Render the 1080×1350 班味 poster to a temp PNG; resolves to its path.
   *  Shared by onShareCard (preview) and the custom share imageUrl
   *  (v6.50 P3). The off-screen #share-canvas is always in the WXML, so
   *  this is safe to call any time after the page data is set. */
  _renderPoster() {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery();
      query.select('#share-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            reject(new Error('share-canvas node not ready'));
            return;
          }
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const W = 1080, H = 1350;
          const dpr = wx.getSystemInfoSync().pixelRatio || 2;
          canvas.width = W * dpr; canvas.height = H * dpr;
          ctx.scale(dpr, dpr);
          this.paintCanvas(ctx, W, H);
          wx.canvasToTempFilePath({
            canvas, width: W, height: H, destWidth: W, destHeight: H,
            fileType: 'png',
            success: (r) => resolve(r.tempFilePath),
            fail: reject,
          });
        });
    });
  },

  /** v6.50 P3 — best-effort pre-render so 转发/朋友圈 have a custom card
   *  ready. Silent on failure — share then falls back to a page screenshot. */
  _prepareShareImage() {
    this._renderPoster()
      .then((tempFilePath) => { this.shareImagePath = tempFilePath; })
      .catch(() => { /* keep shareImagePath unset → default screenshot */ });
  },

  /** Delegates to extracted pure fn (v6.36 P2). Real paint logic lives
   *  in utils/banweiPaint.js so it's unit-testable. */
  paintCanvas(ctx, W, H) {
    paintBanwei(ctx, W, H, this.data);
  },

  // Stub kept so any external caller still works during migration.
  _paintCanvasInline(ctx, W, H) {
    const { score, tierLabel, tierEmoji, tierAccent, breakdown, priorScore, delta } = this.data;
    // BG — radial-ish via stacked fills (wx Canvas 2D supports createRadialGradient).
    const bg = ctx.createRadialGradient(W / 2, H * 0.4, W * 0.1, W / 2, H / 2, W * 0.9);
    bg.addColorStop(0, '#2D1B69');
    bg.addColorStop(0.5, '#1a0d35');
    bg.addColorStop(1, '#0a0a1e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.fillStyle = '#FFD58A';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('OFFICE ZOO · 班味指数 · 微信小程序', 56, 56);

    // Score badge
    const bx = W / 2, by = 340, br = 180;
    const grad = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br);
    grad.addColorStop(0, tierAccent);
    grad.addColorStop(1, tierAccent + 'aa');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0a1e';
    ctx.font = 'bold 160px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(score), bx, by - 10);
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = 'rgba(10,10,30,0.7)';
    ctx.fillText('SCORE / 100', bx, by + 90);

    // Tier
    ctx.fillStyle = tierAccent;
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${tierEmoji} ${tierLabel}`, bx, 570);

    // 5-axis radar (mini, simplified)
    const cx = bx, cy = 880, rr = 200;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    for (let ring = 1; ring <= 4; ring++) {
      const rad = (rr * ring) / 4;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const px = cx + Math.cos(a) * rad;
        const py = cy + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // Data polygon
    ctx.fillStyle = tierAccent + '50';
    ctx.strokeStyle = tierAccent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    breakdown.forEach((b, i) => {
      const ratio = b.cap > 0 ? Math.min(1, b.count / b.cap) : 0;
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const px = cx + Math.cos(a) * rr * ratio;
      const py = cy + Math.sin(a) * rr * ratio;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '600 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    breakdown.forEach((b, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const lx = cx + Math.cos(a) * (rr + 40);
      const ly = cy + Math.sin(a) * (rr + 40);
      ctx.fillText(b.name, lx, ly);
    });

    // WoW row
    ctx.font = '600 28px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    if (priorScore !== null) {
      const arrow = delta > 0 ? '↗' : delta < 0 ? '↘' : '=';
      const dColor = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'center';
      ctx.fillText(`上周 ${priorScore}`, W / 2 - 80, 1170);
      ctx.fillStyle = dColor;
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(arrow, W / 2, 1170);
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(delta > 0 ? `+${delta}` : delta === 0 ? '持平' : String(delta), W / 2 + 90, 1170);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText('第一次班味打卡 · 下周来看变化', W / 2, 1170);
    }

    // Footer
    ctx.fillStyle = 'rgba(255,215,0,0.55)';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐀 github.com/ChrisChen667788/office-zoo', W / 2, H - 60);
  },

  // 系统分享 — 转发给好友. imageUrl 用预渲染的海报 (未就绪则 WeChat 自动截图页面).
  onShareAppMessage() {
    const { score, tierLabel } = this.data;
    return {
      title: `我的本周班味指数: ${score}/100 (${tierLabel})`,
      path: '/pages/banwei/index',
      imageUrl: this.shareImagePath, // undefined ⇒ 默认页面截图
    };
  },

  // v6.50 P3 — 分享到朋友圈. onShareTimeline 用 query (非 path) + 同一张海报.
  onShareTimeline() {
    const { score, tierLabel } = this.data;
    return {
      title: `我的本周班味指数: ${score}/100 (${tierLabel})`,
      query: '',
      imageUrl: this.shareImagePath,
    };
  },
});
