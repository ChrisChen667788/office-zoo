// pages/weekly — 周报生成器 原生小程序页面 (v6.80, 不依赖 webview).
// 写 1 句关键事件 → POST /api/weekly/generate 一次出 4 种风格(阿里黑话/PUA/装腔/直球,
// 服务端并行 4 路 LLM, ~10s)→ 逐卡复制 / ❤️ 偏爱(喂 self-tuning)→ 2×2 海报分享。
// 海报套 banwei/fortune 的 off-screen Canvas 模板;绘制纯函数在 utils/weeklyPaint.js。
const app = getApp();
const { paintWeekly } = require('../../utils/weeklyPaint');

const MIN_LEN = 8;
const MAX_LEN = 300;

Page({
  data: {
    event: '',
    len: 0,
    canGen: false,
    busy: false,
    err: null,
    results: [],          // [{style,label,emoji,description,text,error,boosted}]
    dominantLabel: null,  // 「你最爱: X」chip(self-tuning 偏好)
    likedStyle: null,     // 本次会话里点过 ❤️ 的风格
    minLen: MIN_LEN,
    maxLen: MAX_LEN,
  },

  onReady() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  },

  onShow() {
    // 偏好 chip(userId 无效时服务端返回全零,不报错)
    app.api('/api/weekly/preferences')
      .then((d) => this.setData({ dominantLabel: (d && d.dominantLabel) || null }))
      .catch(() => { /* chip 锦上添花 */ });
  },

  onInput(e) {
    const v = (e.detail.value || '').slice(0, MAX_LEN);
    this.setData({ event: v, len: v.length, canGen: v.length >= MIN_LEN });
  },

  onGenerate() {
    if (!this.data.canGen || this.data.busy) return;
    this.setData({ busy: true, err: null, results: [], likedStyle: null });
    app.api('/api/weekly/generate', { method: 'POST', data: { event: this.data.event } })
      .then((d) => {
        if (!d || !d.results) throw new Error((d && d.error) || '生成失败 — 请稍后再试');
        this.setData({ busy: false, results: d.results });
        this._prepareShareImage();
      })
      .catch((e) => {
        // 429 = 限流(/generate 每小时 5 次/IP, 与 A/B 对比共享配额)
        const limited = e && e.statusCode === 429;
        this.setData({
          busy: false,
          err: limited ? '这小时的生成次数用完了(每小时 5 次)· 歇会儿再来' : String((e && e.errMsg) || e.message || e),
        });
      });
  },

  onCopy(e) {
    const idx = e.currentTarget.dataset.idx;
    const r = this.data.results[idx];
    if (!r || r.error) return;
    wx.setClipboardData({
      data: r.text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
  },

  onLike(e) {
    const idx = e.currentTarget.dataset.idx;
    const r = this.data.results[idx];
    if (!r || r.error) return;
    this.setData({ likedStyle: r.style });
    // mp userId 是 'mp_'+16 位 = 19 字符, 满足服务端 ≥8 校验
    app.api('/api/weekly/like', { method: 'POST', data: { style: r.style } })
      .then((d) => {
        this.setData({ dominantLabel: (d && d.dominantLabel) || this.data.dominantLabel });
        wx.showToast({ title: '❤️ 已偏爱, AI 会记住', icon: 'none' });
      })
      .catch(() => { /* 点赞失败静默, UI 已乐观高亮 */ });
  },

  // —— 海报:banwei/fortune 同模板 ——
  onShareCard() {
    if (!this.data.results.length) return;
    wx.showLoading({ title: '生成海报...' });
    this._renderPoster()
      .then((tempFilePath) => {
        wx.hideLoading();
        this.shareImagePath = tempFilePath;
        wx.previewImage({ urls: [tempFilePath], current: tempFilePath });
      })
      .catch((e) => {
        wx.hideLoading();
        wx.showToast({ title: '导出失败', icon: 'error' });
        console.error('[weekly] poster render fail', e);
      });
  },

  _renderPoster() {
    return new Promise((resolve, reject) => {
      if (!this.data.results.length) { reject(new Error('no results')); return; }
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
          paintWeekly(ctx, W, H, { event: this.data.event, results: this.data.results });
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
    return {
      title: this.data.results.length
        ? '同一件事 · 4 种周报说法,你猜哪版是给老板看的?'
        : '周报生成器 · 一句话出 4 种风格',
      path: '/pages/weekly/index',
      imageUrl: this.shareImagePath,
    };
  },

  onShareTimeline() {
    return {
      title: '周报生成器 · 同一件事 4 种说法',
      query: '',
      imageUrl: this.shareImagePath,
    };
  },
});
