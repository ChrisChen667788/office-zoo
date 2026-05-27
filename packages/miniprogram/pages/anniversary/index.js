const app = getApp();
Page({
  data: { src: '' },
  onLoad() { this.setData({ src: app.globalData.webBase + '/anniversary' }); },
});
