// pages/landing — web-view 包装完整 H5 Landing
const app = getApp();

Page({
  data: { src: '' },
  onLoad() {
    this.setData({ src: app.globalData.webBase + '/' });
  },
});
