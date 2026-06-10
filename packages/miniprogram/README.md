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
│                       重生: `npm run gen:mp-arch` (改了源 SVG 后跑)
├─ project.config.json  小程序项目配置 (appid 占位待填)
├─ sitemap.json
└─ pages/
   ├─ landing/        web-view → H5 Landing; 占位符/失败时原生壳 (v6.82)
   ├─ banwei/         原生 — 班味指数 score badge + 5 axis breakdown
   ├─ hot-quotes/     原生 — 班味金句投稿表单
   ├─ anniversary/    web-view → /anniversary 6 milestone deck
   ├─ profile/        web-view → /profile/me; 原生壳: 工牌+我的公司包 (v6.82)
   ├─ about/          原生 — 技术架构图 + 公司主题包 emoji 头像展示 (v6.43/v6.44)
   ├─ company-pack/   web-view → /company-pack/edit 公司主题包编辑器 (v6.44)
   ├─ fortune/        原生 — 班味占卜日卡 (翻牌 + 忠告/微行动 + 1080×1350 海报, v6.79)
   ├─ weekly/         原生 — 周报生成器 (1 句事件 → 4 风格 + 四宫格海报, v6.80)
   └─ talkshow/       原生 — 班味单口 (热度榜 + InnerAudioContext 直链 TTS, v6.81)
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

## 路线 (v6.35 → v6.50)

**已完成:**
- [x] **v6.35 P1** — Banwei page Canvas 班味海报 (score badge + 5 轴雷达)
- [x] **v6.35 P2** — HotQuoteSubmit 原生表单页 (`pages/hot-quotes`)
- [x] **v6.36 P2** — paintBanwei 抽纯函数 + 9 个 vitest (MockCtx recording)
- [x] **v6.43 P3** — 技术架构页 (`pages/about`, 静态架构图 PNG)
- [x] **v6.44 P3** — 公司主题包: `pages/company-pack` web-view 入口 +
      about 页原生 emoji 头像展示条
- [x] **v6.50 P3** — 班味指数分享: `wx.showShareMenu` 开 转发+朋友圈,
      `onShareAppMessage`/`onShareTimeline` 均带自定义 imageUrl (复用
      1080×1350 海报, 预渲染缓存; 未就绪则回落系统页面截图)
- [x] **v6.79** — 班味占卜原生页 (`pages/fortune`): GET /api/fortune/me 日卡
      (同一天确定性同一张) + CSS rotateY 翻牌 + 忠告/微行动块 + 1080×1350
      分享海报 (paintFortune 纯函数 + 9 vitest; 浏览器 Canvas probe 视觉验证,
      绘制代码平台无关) + banwei 页入口卡. 三大 H5 二级页第一个搬进小程序的.
- [x] **v6.80** — 周报生成器原生页 (`pages/weekly`): POST /api/weekly/generate 4 风格
      并行 + 复制/❤️偏爱 (self-tuning) + weeklyPaint 四宫格海报 (+7 vitest) + 金句池入口卡
- [x] **v6.81** — 班味单口原生页 (`pages/talkshow`): 热度榜 → 全文 → InnerAudioContext
      直链 server GET /api/talkshow/tts (v6.81 新增 GET 变体, src 只吃 URL 所以 query 传参,
      +6 路由测试 + smoke 真出 MP3); TTS 失败自动降级纯文字. 注意: InnerAudioContext 与
      wx.request 共用 request 合法域名白名单, 上线前 apiBase 必须备案+加白

- [x] **v6.82** — landing/profile 原生壳 (webBase 占位/binderror → 品牌兜底, 不再白屏)
      + pack avatar 上原生面 (profile 壳 live /api/company-pack/mine NPC emoji 条,
      mpShell 纯函数 +6 vitest)

**待办:**
- [ ] 真机 devtools 验证 about/fortune/weekly/talkshow/landing/profile 壳 (需先填真实 appid)

## 调试

微信开发者工具 (Stable 1.06.x+) → 导入项目 → 项目目录指
`packages/miniprogram/`. 开发期可临时关掉「URL 合法域名校验」加快
调试. 上线前必须开回去 + 域名走真备案.
