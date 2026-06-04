// pages/company-pack — web-view 包装完整 H5 公司主题包编辑器.
// v6.44 P3 — 小程序触达 pack 的唯一入口. pack 的 emoji 头像选择 + 展示
// 都在 React /company-pack/edit 渲染 (小程序原生 <image> 不便做 emoji
// 头像网格), 所以用 web-view 直接复用 H5 完整体验.
const app = getApp();

Page({
  data: { src: '' },
  onLoad() {
    this.setData({ src: app.globalData.webBase + '/company-pack/edit' });
  },
  onShareAppMessage() {
    return {
      title: 'OFFICE ZOO · 自定义我们公司的 12 个鼠人',
      path: '/pages/company-pack/index',
    };
  },
});
