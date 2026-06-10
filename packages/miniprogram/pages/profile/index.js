// pages/profile — 我的。v6.82 起带「原生壳」兜底(landing 同款逻辑):
//   · webBase 真域名 → web-view 包 H5 /profile/me(完整班味卡 + 成就墙)
//   · 占位符 / 加载失败 → 原生壳:🪪 工牌(userId)+ 🏢 我的公司包(live
//     /api/company-pack/mine,pack avatar 第一次上小程序原生面)+ 原生玩法直达。
const app = getApp();
const { shouldUseWebview, avatarStrip } = require('../../utils/mpShell');

Page({
  data: {
    src: '',
    useWeb: false,
    badgeId: '',
    packs: null,    // null=加载中 [] = 没包 [{packId,name,count,emojis:[],more}]
    packErr: false,
  },

  onLoad() {
    const base = app.globalData.webBase;
    const useWeb = shouldUseWebview(base);
    this.setData({
      useWeb,
      src: useWeb ? base + '/profile/me' : '',
      badgeId: (app.globalData.userId || '').slice(0, 8),
    });
  },

  onShow() {
    if (!this.data.useWeb) this.fetchPacks();
  },

  onWebError() {
    this.setData({ useWeb: false });
    this.fetchPacks();
  },

  fetchPacks() {
    app.api('/api/company-pack/mine')
      .then((d) => {
        const packs = (d.packs || []).map((p) => {
          const strip = avatarStrip(p.npcs, 8);
          return {
            packId: p.packId, name: p.name,
            count: (p.npcs || []).length,
            emojis: strip.emojis, more: strip.more,
          };
        });
        this.setData({ packs, packErr: false });
      })
      .catch(() => this.setData({ packs: [], packErr: true }));
  },

  goPackEditor() {
    wx.navigateTo({ url: '/pages/company-pack/index' });
  },

  goNative(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },

  onShareAppMessage() {
    return { title: 'OFFICE ZOO · 班味剧场 — 我的工牌', path: '/pages/profile/index' };
  },
});
