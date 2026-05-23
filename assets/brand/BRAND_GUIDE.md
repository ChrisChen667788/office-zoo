# OFFICE ZOO — Brand Guide v1.0

> 2026-05-23 · v6.7 品牌系统化首版
> 所有素材 MIT 协议跟代码一致, fork / 二创随意, 请保留链接归属。

---

## 0. 品牌核心

**一句话:** AI 鼠人替你拥抱变化, 你回家躺平。

**视觉调性:** 米哈游游戏 UI (5★ 角色卡 + EVENT pill 风) × 中文职场吐槽 × Z 世代赛博朋克。

**情感:** 毒舌但温暖 / 自嘲但不绝望 / 看穿一切但还在赌一把。

---

## 1. Logo 系统

| 文件 | 尺寸 | 用途 | 描述 |
|---|---|---|---|
| `assets/brand/logo.png` | 1024×1024 | **主 logo** · README hero / Landing wordmark | 黑西装毒舌鼠 + 咖啡续命 + 粉黄霓虹背景 |
| `assets/brand/logo-card.png` | 768×768 | favicon 源 · 5★ stigma card | hex 框 + 工牌 + 红眼 + 米哈游 stigma 风 |
| `assets/brand/logo-v1-mihoyo-portrait.png` | 1024×1024 | 备选 · 柔光肖像 | 大眼可爱型 |
| `assets/brand/logo-v3-sticker-flat.png` | 1024×1024 | 备选 · sticker 风 | 矢量平面贴纸风 |
| `assets/brand/square-avatar-group.png` | 1024×1024 | **群头像 / 头像** | 单眼眨眼 chibi 西装鼠 + 浅紫底 |
| `assets/brand/horizontal-banner-twitter.png` | 16:9 | **Twitter / X cover** | 咖啡杯吐舌 + bokeh 渐变 |

### 1.1 Logo 用法 do / don't

✅ **可以做的:**
- 主 logo 在深色背景上(深紫宇宙 / 深夜酒馆调色板)直接用
- 周边色卡(见 §2)做发光描边 / glow ring shadow
- 缩放保持 1:1, 最小不低于 96px (低于这个细节糊)
- 群头像优先用 square-avatar-group.png(为小尺寸优化过)
- Twitter banner 在左下/右下叠加 wordmark + tagline(留白预留好)

❌ **不要做的:**
- 不要拉伸变形 (rat 立绘 比例敏感)
- 不要直接放在浅色 / 全白背景 — 现有 glow 边设计在深底才有发光感
- 不要在 logo 上叠加大量文字 (mark-only 设计为主, 文字归 wordmark)
- 不要换色 (黄眼睛 + 黑西装 + 粉霓虹 是识别核心)

---

## 2. 色卡 (Color Tokens)

```css
/* === Cosmic background trio (深色底) === */
--bg-night:    #0a0a1e;   /* 极深 · 卡片 / panel 后景 */
--bg-violet:   #1a0d35;   /* 中间过渡 · 主屏幕 fallback */
--bg-cosmic:   #2D1B69;   /* 米哈游 cosmic 紫 · radial center */

/* === Gold accents (主品牌色) === */
--gold-1:      #FFD700;   /* 主金 · EVENT pill / button gradient start */
--gold-2:      #FFA947;   /* 暖金 · button gradient end */
--gold-soft:   #FFD58A;   /* 弱金 · subtitle text 透出 */

/* === Element 配色 (4 个调性) === */
--cyan-elem:   #4ECDC4;   /* anemo / 阿里黑话版 周报 / frost 元素 */
--cyan-glow:  #00D9FF;   /* 高亮辅助 */
--rose-fate:   #FF4FA3;   /* stigma / PUA 版 / 玫红强调 */
--violet-myst: #B086FF;   /* mystic / 紫色辅助 */
--moon-white:  #F8F4E3;   /* 主文字色, 替代纯白(更柔) */

/* === Star tier === */
--star-1:      #FFEF6B;   /* 5★ inner glow */
--star-2:      #FF9C42;   /* 5★ outer glow */
```

### 2.1 配色对应关系

| 用途 | 主色 | 辅助 |
|---|---|---|
| EVENT pill | gold-1 gradient → gold-2 | + violet-myst 边框 |
| 主 CTA 按钮 | gold-1 → gold-2 渐变 + dark text | shadow rgba(255,215,0,0.32) |
| 4 风格周报 alibaba | cyan-elem | gradient → frost #4A90E2 |
| 4 风格周报 pua | rose-fate | gradient → violet #7C3AED |
| 4 风格周报 posh | gold-1 | gradient → gold-2 |
| 4 风格周报 direct | #FF6B35 | gradient → #FF3355 |
| Vibe tier 大吉 | #22c55e (green) | armed for boost |
| Vibe tier 大凶 | #ef4444 (red) | dangerous |

---

## 3. 字体 (Typography)

完全使用系统字体(不引 webfont, 性能 + 加载稳定):

```css
font-family: "PingFang SC", "Hiragino Sans GB", "Source Han Sans CN",
             "Microsoft YaHei", -apple-system, "Helvetica Neue", sans-serif;
```

### 3.1 排版规范

| 角色 | 字号 | 字重 | tracking |
|---|---|---|---|
| Hero wordmark | clamp(3rem, 8vw, 7rem) | 900 | -0.04em |
| Big title (event banner) | 38-42px | 900 | 0 |
| Subtitle | 17-22px | 700-800 | 0.04em |
| Body text | 13-15px | 500-600 | 0 |
| EVENT pill caption | 11px | 800-900 | 0.22em uppercase |
| Numeric (vibe / counts) | 22-72px | 900 | tabular-nums |
| Footer / meta | 10-11px | 600-700 | 0.28-0.45em uppercase |

---

## 4. 应用样板

### 4.1 README hero (GitHub)
```html
<div align="center">
  <img src="assets/brand/logo.png" width="220" alt="OFFICE ZOO" />

  # OFFICE ZOO

  ### 0 点的写字楼, AI 鼠人替你拥抱变化, 你回家躺平。
</div>
```

### 4.2 Landing 首页 (已上 v6.7)
```jsx
<div className="flex flex-col md:flex-row items-center gap-6">
  <img src="/brand-logo.png" width={120} height={120}
    style={{ boxShadow: '0 0 32px rgba(255,79,163,0.45)' }} />
  <h1 className="text-gradient-brand">OFFICE ZOO</h1>
</div>
```

### 4.3 Twitter / X cover (1500×500)
直接用 `horizontal-banner-twitter.png` 上传, 左侧留白叠加:
- 主标: `OFFICE ZOO · 班味剧场`
- 副标: `9 AI rats clock in, so you can clock out`
- 底部: `github.com/ChrisChen667788/office-zoo`

### 4.4 微信群 / Discord / 即刻 头像
直接用 `square-avatar-group.png` (1024×1024 chibi 鼠) — 小尺寸读得最清晰。

### 4.5 T-shirt 印花
两种推荐:
1. **正面胸口**: 用 `square-avatar-group.png` (chibi 干净) 缩到 8×8 cm
2. **背后大图**: 用 `logo.png` (cyberpunk 全身) 缩到 25×25 cm 配 `OFFICE ZOO` wordmark 在下

打印颜色: 深色 T 恤(黑/深紫/深蓝)效果最好,浅色 T 恤会让 glow ring 失效。

### 4.6 favicon / 浏览器标签 (已上 v6.7)
6 个尺寸都在 `packages/client/public/`:
- `favicon.ico` (16+32+48 multi-resolution)
- `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`
- `apple-touch-icon.png` (180×180)
- `icon-192.png`, `icon-512.png` (PWA manifest)
- `manifest.webmanifest` (theme color = gold-1)

---

## 5. 衍生延展(rotate at will, MIT)

任何人 fork 都可以基于这套 brand 做:
- **本地化版** — 改 region prompt (Bay Area Burnout / 韩国 갑질 / 印度 H1B)
  时, 把鼠人换成对应地域 mascot (松鼠 / 海狸 / 鸽子)
- **行业版** — 律所 / HR 培训 / 高校就业, 改 fired scenarios 但保留鼠人
- **节日特别版** — 春节 / 国庆 / 圣诞, 给 logo 加节日皮肤(围巾 / 帽子)
- **二创周边** — 鼠人手办 / 贴纸 / 表情包, 请注明来自 OFFICE ZOO

---

## 6. 历史

| 版本 | 日期 | 变化 |
|---|---|---|
| v1.0 | 2026-05-23 (v6.7) | 首版 brand guide 落地。AI 生成 4 logo 候选, 选 cyberpunk 主, stigma 5★ 副, 加 horizontal banner + square avatar 衍生。favicon 系统化(7 个尺寸)。 |
| pre-v1.0 | — | 只用 🐀 emoji, 没正式 brand。 |
