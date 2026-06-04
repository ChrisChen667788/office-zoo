// v6.44 P3 — 技术架构页 + 公司主题包 emoji 头像展示/入口.
Page({
  data: {
    // 跟 React CompanyPackEdit 的 AVATAR_CHOICES 对齐 (去掉空选项).
    avatars: [
      '🐀', '🐱', '🐶', '🦊', '🐼', '🐯', '🦁', '🐸', '🐵',
      '🐰', '🐻', '🐷', '🦝', '🐹', '🐮', '🐲', '🦄',
    ],
  },
  goPack() {
    wx.navigateTo({ url: '/pages/company-pack/index' });
  },
  onShareAppMessage() {
    return {
      title: 'OFFICE ZOO · AI 多智能体职场推理 — 技术架构',
      path: '/pages/about/index',
    };
  },
});
