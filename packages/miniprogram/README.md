# OFFICE ZOO · 班味剧场 · 微信小程序端

v6.34 P4 脚手架. 大部分页面是 web-view 包装完整 H5 体验, 班味指数页 +
技术架构页是真原生小程序渲染.

## 结构

```
packages/miniprogram/
├─ app.json           6 page 注册 (5 在 tabBar)
├─ app.js             全局 userId + api(path, opts) wrapper
├─ app.wxss           深紫宇宙调色板
├─ assets/
│  └─ architecture.png  从 architecture.svg 渲染的静态架构图 (about 页用)
├─ project.config.json  小程序项目配置 (appid 占位待填)
├─ sitemap.json
└─ pages/
   ├─ landing/        web-view → 完整 H5 Landing (4 模式选择)
   ├─ banwei/         原生 — 班味指数 score badge + 5 axis breakdown
   ├─ hot-quotes/     原生 — 班味金句投稿表单
   ├─ anniversary/    web-view → /anniversary 6 milestone deck
   ├─ profile/        web-view → /profile/me 班味卡 + stats + achievements
   ├─ about/          原生 — 技术架构图 + 公司主题包 emoji 头像展示 (v6.43/v6.44)
   └─ company-pack/   web-view → /company-pack/edit 公司主题包编辑器 (v6.44)
```

> **about 页验证状态** (v6.45/v6.46): emoji 头像条用原生 `<text>` 渲染纯
> Unicode emoji (走系统 emoji 字体, 无微信特有路径). 已用 1:1 WXSS-fidelity
> HTML 渲染验证布局正常. **真机 devtools 验证待办** — 需先填真实 appid 再
> 导入 `packages/miniprogram/`; 自动化导入受限于本地环境的窗口焦点问题,
> 留给手动一次性确认.

## 部署前要做的 3 件事

1. **填 appid** — 微信公众平台申请小程序, 拿到 appid 后替换
   `project.config.json` 的 `"appid": "REPLACE_WITH_YOUR_APPID"`.

2. **加白名单域名** — 微信后台「开发管理」→「开发设置」→「服务器域名」:
   - request 合法域名: 填 `globalData.apiBase` 指向的域名 (如
     `https://office-zoo-server.your-domain.com`)
   - business 域名 (用于 web-view): 填 `globalData.webBase` 指向的域名
     (如 `https://office-zoo.your-domain.com`)
   两者都需要 ICP 备案 + 部署 HTTPS.

3. **改 app.js → globalData** — apiBase / webBase 改成你部署后的真实
   域名. 当前是 placeholder.

## 设计取舍

- **为什么不全原生?** Classic / Immersive / Fired 这三大模式是 Canvas
  2D + Framer Motion + Socket.IO 高频实时, 小程序原生组件做不到等效
  体验. web-view 包装让小程序成为"入口分发器", 体验细节归 H5.

- **为什么 Banwei 是真原生?** 班味指数是"看一眼的数字 + 上周对比",
  适合做静态 page. 真原生避免 web-view 加载延迟, 给用户"打开就看到
  分数"的瞬间反馈. 走 `app.api('/api/banwei', { method: 'POST' })`
  跟 H5 共享后端数据.

- **跨端 userId 怎么处理?** wx.getStorageSync('office-zoo.user-id')
  跟 web 的 localStorage 同 key 名, 但两端 storage 互相隔离. 不同
  设备/端是两个独立的"我". 真要同步需要登录 (out of scope).

## v6.35+ 路线

- [ ] Banwei page 加 wx.canvasToTempFilePath 生成班味海报 (类似
      utils/banweiShareCard.ts)
- [ ] HotQuoteSubmit 原生表单页 (省得用 webview 打字体验差)
- [ ] 班味指数 share to WeChat (wx.showShareMenu + 自定义 imageUrl)

## 调试

微信开发者工具 (Stable 1.06.x+) → 导入项目 → 项目目录指
`packages/miniprogram/`. 开发期可临时关掉「URL 合法域名校验」加快
调试. 上线前必须开回去 + 域名走真备案.
