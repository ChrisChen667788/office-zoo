// pages/landing — 首页。v6.82 起带「原生壳」兜底:
//   · webBase 配了真域名 → web-view 包完整 H5 Landing(原行为)
//   · webBase 还是 example.com 占位符 / web-view 加载失败 → 品牌化原生壳
//     (模式介绍 + 原生玩法宫格),不再白屏。
const app = getApp();
const { shouldUseWebview } = require('../../utils/mpShell');

Page({
  data: {
    src: '',
    useWeb: false,
    // 原生玩法宫格:url + 跳转方式(tab 页必须 switchTab)
    natives: [
      { emoji: '🔮', title: '班味占卜', sub: '一天一张日卡', url: '/pages/fortune/index', kind: 'nav' },
      { emoji: '📊', title: '周报生成器', sub: '1 句话 4 种说法', url: '/pages/weekly/index', kind: 'nav' },
      { emoji: '🎤', title: '班味单口', sub: 'AI 嘴替开麦', url: '/pages/talkshow/index', kind: 'nav' },
      { emoji: '📈', title: '班味指数', sub: '本周打卡', url: '/pages/banwei/index', kind: 'tab' },
      { emoji: '🔥', title: '金句池', sub: '你的话进 AI 嘴里', url: '/pages/hot-quotes/index', kind: 'tab' },
      { emoji: '🛠', title: '技术架构', sub: '怎么搭的', url: '/pages/about/index', kind: 'nav' },
    ],
  },

  onLoad() {
    const base = app.globalData.webBase;
    const useWeb = shouldUseWebview(base);
    this.setData({ useWeb, src: useWeb ? base + '/' : '' });
  },

  // web-view 加载失败(域名没白名单 / 服务挂了)→ 落原生壳,别白屏。
  onWebError() {
    this.setData({ useWeb: false });
  },

  goNative(e) {
    const { url, kind } = e.currentTarget.dataset;
    if (kind === 'tab') wx.switchTab({ url });
    else wx.navigateTo({ url });
  },

  onShareAppMessage() {
    return { title: 'OFFICE ZOO · 班味剧场 — AI 鼠人替你拥抱变化', path: '/pages/landing/index' };
  },
});
