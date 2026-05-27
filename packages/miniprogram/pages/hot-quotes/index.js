// pages/hot-quotes — 班味金句池 原生提交页 + recent 列表.
// 复用 server /api/hot-quotes. v6.33 P4 H5 已有 web 端表单, 小程序
// 单独 page 让微信用户不必走 web-view.
const app = getApp();

Page({
  data: {
    text: '',
    submitting: false,
    status: 'idle', // idle | ok | cap | err
    thisWeek: null,
    recentList: [],
    loadingList: true,
    listErr: null,
  },

  onShow() { this.fetchRecent(); },

  onInput(e) { this.setData({ text: (e.detail.value || '').slice(0, 80) }); },

  fetchRecent() {
    this.setData({ loadingList: true, listErr: null });
    app.api('/api/hot-quotes')
      .then((d) => this.setData({ recentList: d.entries || [], loadingList: false }))
      .catch((e) => this.setData({ loadingList: false, listErr: String(e?.errMsg || e) }));
  },

  submit() {
    const text = (this.data.text || '').trim();
    if (!text || this.data.submitting) return;
    this.setData({ submitting: true });
    app.api('/api/hot-quotes', { method: 'POST', data: { text } })
      .then((d) => {
        this.setData({
          submitting: false,
          status: 'ok',
          thisWeek: d.userThisWeek,
          text: '',
        });
        wx.showToast({ title: '已投递', icon: 'success' });
        this.fetchRecent();
        setTimeout(() => this.setData({ status: 'idle' }), 2500);
      })
      .catch((e) => {
        const isCap = e?.statusCode === 429;
        this.setData({
          submitting: false,
          status: isCap ? 'cap' : 'err',
          thisWeek: e?.data?.thisWeek ?? this.data.thisWeek,
        });
        wx.showToast({
          title: isCap ? '本周已满' : '失败',
          icon: 'error',
        });
        setTimeout(() => this.setData({ status: 'idle' }), 3000);
      });
  },

  formatTs(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },
});
