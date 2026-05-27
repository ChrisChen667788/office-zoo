// OFFICE ZOO · 班味剧场 — 微信小程序入口
// v6.34 P4 scaffold. 跟 web 端共享 server API (X-User-Id pattern).
App({
  globalData: {
    // 占位 — 部署时填真实公网 API 域名 (备案 + 加白名单后).
    // 默认指向开发者本机 (微信开发者工具可关掉 urlCheck 调试).
    apiBase: 'https://office-zoo-server.example.com',
    // H5 完整版的 WebView 域名 (各 page 用 web-view 包装)
    webBase: 'https://office-zoo-web.example.com',
    userId: '',
  },

  onLaunch() {
    // 持久化的伪用户 id (跟 web 端 office-zoo.user-id 同语义)
    let uid = wx.getStorageSync('office-zoo.user-id');
    if (!uid) {
      uid = 'mp_' + Math.random().toString(36).slice(2, 18);
      wx.setStorageSync('office-zoo.user-id', uid);
    }
    this.globalData.userId = uid;
  },

  /** 包装 wx.request 加上 X-User-Id, 返回 Promise. */
  api(path, opts = {}) {
    const base = this.globalData.apiBase;
    return new Promise((resolve, reject) => {
      wx.request({
        url: base + path,
        method: opts.method || 'GET',
        data: opts.data,
        header: {
          'Content-Type': 'application/json',
          'X-User-Id': this.globalData.userId,
          ...(opts.header || {}),
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
          else reject(res);
        },
        fail: reject,
      });
    });
  },
});
