// pages/fortune — 班味占卜 原生小程序页面 (v6.79, 不依赖 webview).
// GET /api/fortune/me: (X-User-Id, UTC date) 确定性抽一张日卡 —— 同一天
// 重进同一张,跨 0 点(UTC)换新。海报/分享套 banwei 那套 off-screen
// Canvas 2D 模板;绘制纯函数在 utils/fortunePaint.js(headless 可测)。
const app = getApp();
const { paintFortune, vibeTier } = require('../../utils/fortunePaint');

Page({
  data: {
    loading: true,
    err: null,
    date: '',
    card: null,        // {emoji,title,subtitle,vibeScore,gradient,advice,microAction}
    tierLabel: '',
    tierColor: '#fbbf24',
    revealed: false,   // 翻牌动画:600ms 后从牌背翻到牌面
  },

  onReady() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  },

  onShow() {
    this.fetchFortune();
  },

  fetchFortune() {
    this.setData({ loading: true, err: null, revealed: false });
    app.api('/api/fortune/me')
      .then((d) => {
        const tier = vibeTier(d.card.vibeScore);
        this.setData({
          loading: false,
          date: d.date,
          card: d.card,
          tierLabel: tier.label,
          tierColor: tier.color,
        });
        // 翻牌 reveal —— 跟 H5 端同节奏(数据到了缓 600ms 再翻,显得是"抽"出来的)
        setTimeout(() => this.setData({ revealed: true }), 600);
        this._prepareShareImage();
      })
      .catch((e) => this.setData({ loading: false, err: String((e && e.errMsg) || e) }));
  },

  // —— 海报:同 banwei 的 off-screen canvas 模板 ——
  onShareCard() {
    wx.showLoading({ title: '生成分享卡...' });
    this._renderPoster()
      .then((tempFilePath) => {
        wx.hideLoading();
        this.shareImagePath = tempFilePath;
        wx.previewImage({ urls: [tempFilePath], current: tempFilePath });
      })
      .catch((e) => {
        wx.hideLoading();
        wx.showToast({ title: '导出失败', icon: 'error' });
        console.error('[fortune] poster render fail', e);
      });
  },

  _renderPoster() {
    return new Promise((resolve, reject) => {
      if (!this.data.card) { reject(new Error('card not loaded')); return; }
      const query = wx.createSelectorQuery();
      query.select('#share-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) { reject(new Error('share-canvas node not ready')); return; }
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const W = 1080, H = 1350;
          const dpr = wx.getSystemInfoSync().pixelRatio || 2;
          canvas.width = W * dpr; canvas.height = H * dpr;
          ctx.scale(dpr, dpr);
          paintFortune(ctx, W, H, { date: this.data.date, ...this.data.card });
          wx.canvasToTempFilePath({
            canvas, width: W, height: H, destWidth: W, destHeight: H,
            fileType: 'png',
            success: (r) => resolve(r.tempFilePath),
            fail: reject,
          });
        });
    });
  },

  _prepareShareImage() {
    this._renderPoster()
      .then((tempFilePath) => { this.shareImagePath = tempFilePath; })
      .catch(() => { /* 未就绪 → 分享退回页面截图 */ });
  },

  onShareAppMessage() {
    const { card, tierLabel } = this.data;
    return {
      title: card ? `我今天抽到「${card.title}」(${tierLabel}) — 你也来抽一张?` : '班味占卜 · 今日运势',
      path: '/pages/fortune/index',
      imageUrl: this.shareImagePath,
    };
  },

  onShareTimeline() {
    const { card, tierLabel } = this.data;
    return {
      title: card ? `今日班味占卜:${card.title}(${tierLabel})` : '班味占卜',
      query: '',
      imageUrl: this.shareImagePath,
    };
  },
});
