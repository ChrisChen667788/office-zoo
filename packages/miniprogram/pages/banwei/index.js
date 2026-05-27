// pages/banwei — 班味指数 原生小程序页面 (不依赖 webview).
// 直接调用 server API: POST /api/banwei + 拉本周 score + breakdown.
const app = getApp();

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

  // v6.33 P3 mirror: 1080×1350 share card via wx.canvasToTempFilePath.
  // For now: just save the current snapshot to clipboard as text — a real
  // Canvas implementation would mirror utils/banweiShareCard.ts.
  onShareCard() {
    const { score, tierLabel, tierEmoji } = this.data;
    wx.setClipboardData({
      data: `我的本周班味指数: ${score}/100 (${tierEmoji} ${tierLabel}). OFFICE ZOO 班味剧场.`,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
  },
});
