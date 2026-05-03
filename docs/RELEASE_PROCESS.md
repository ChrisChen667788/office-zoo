# OFFICE ZOO 发版流程

> 每个 user-facing 版本(v0.x.0 / v0.x.1 ...)发布之前,必须把对应的真机截图
> + 版本说明同步到 GitHub。这条流程把"代码 push" 和"宣发素材" 绑成一次操作,
> 避免 README 长期挂着占位图。

---

## 一、版本完成 → 截图清单

每个版本应该截 1-3 张关键画面。命名约定:

```
assets/screenshots/<NN>-<feature>.png
```

`NN` 是 2 位数字序号(README 引用的顺序),`feature` 是 kebab-case 功能名。

### 当前版本(v0.7.0)需要的截图清单:

| 序号 | 文件名 | 截哪一帧 | 状态 |
|---|---|---|---|
| 01 | `01-landing.png` | 首页 4 张大模式卡 | ✅ 已上传 |
| 02 | `02-talkshow-list.png` | `/talkshow` 段子瀑布流 | ⏳ 待截 |
| 03 | `03-talkshow-player.png` | 段子播放中(头像+字幕) | ⏳ 待截 |
| 04 | `04-classic-game.png` | 经典模式 9 个鼠人 + 房间 | ⏳ 待截 |
| 05 | `05-immersive-game.png` | 沉浸模式圆桌 + 发言气泡 | ⏳ 待截 |
| 06 | `06-fired-landing.png` | 裁了么 5 关闯关进度 | ⏳ 待截 |
| 07 | `07-fired-chat.png` | 裁了么 1v1 怼 HR | ⏳ 待截 |
| 08 | `08-share-video.png` | HighlightReel 战报 + 下载视频按钮 | ⏳ 待截 |

---

## 二、截图三连(macOS)

不需要任何 Screen Recording 权限。三步:

### Step 1 — 启动开发环境

```bash
npm run dev          # 起 Vite + Hono + WS
open -a Safari http://localhost:5173/
```

### Step 2 — 用系统快捷键截图

`Cmd + Shift + 4` → 拖选 Safari 浏览器视口(不要含地址栏 / 标签栏)→ 松开
保存到桌面。重命名为 `NN-feature.png` 移到 `assets/screenshots/`。

或 `Cmd + Shift + 5` → 选 "捕捉所选窗口" → 点 Safari 窗口 → 全窗截图。

### Step 3 — 压缩到 1280px 宽

```bash
SHOTDIR=assets/screenshots
sips -Z 1280 -s format png "$SHOTDIR/02-talkshow-list.png" \
  --out "$SHOTDIR/02-talkshow-list.png"
```

或者批量:

```bash
for f in assets/screenshots/*.png; do
  sips -Z 1280 -s format png "$f" --out "$f"
done
```

目标:**单图 < 1.5MB**。如果还大就降到 1024。

---

## 三、把截图嵌入 README

README 里的"截图"段落格式(已经在 `README.md` 里):

```markdown
## 📸 截图

| 模式 | 截图 |
|:---:|:---:|
| 首页 4 模式 | ![Landing](./assets/screenshots/01-landing.png) |
| 班味单口段子库 | ![Talkshow](./assets/screenshots/02-talkshow-list.png) |
| 经典模式 2.5D 写字楼 | ![Classic](./assets/screenshots/04-classic-game.png) |
| 沉浸模式圆桌 | ![Immersive](./assets/screenshots/05-immersive-game.png) |
| 裁了么闯关 | ![Fired](./assets/screenshots/06-fired-landing.png) |
```

---

## 四、版本号 → tag → push

每个版本的最后一步:

```bash
# 1. 把所有 staged 改动 commit
git add -A
git commit -m "v0.X.Y: <user-facing summary>"

# 2. 打 tag
git tag -a v0.X.Y -m "v0.X.Y release notes"

# 3. push 代码 + tag
git push
git push --tags
```

GitHub releases 页面会自动出现新 tag。如果想加正式 release notes:

```bash
gh release create v0.X.Y \
  --title "v0.X.Y · <feature name>" \
  --notes-file docs/CHANGELOG.md \
  assets/screenshots/*.png
```

(可选)`gh release create` 把截图作为 release attachments 一起上传,
GitHub 会在 release 页面自动渲染缩略图,等于二次曝光。

---

## 五、宣发联动(可选)

每次 v0.x.0 大版本可以同步发到:

| 平台 | 触发方式 | 备注 |
|---|---|---|
| Twitter/X | 自动:GitHub release → IFTTT → X | 用 `[#build-in-public]` |
| 即刻 | 手动发图文 | 引用 PROMO_COPY.md |
| 小红书 | 9 图图文 + #打工人 #开源 #AI | 截图直接复用 assets/ |
| V2EX | "分享创造" 节点 | 中午 12:00 / 晚 21:00 流量峰 |

详细文案模板见 [`PROMO_COPY.md`](./PROMO_COPY.md)。

---

## 六、CHANGELOG 维护

每次发版同时往 `docs/CHANGELOG.md` 追加一段:

```markdown
## v0.X.Y — YYYY-MM-DD

### Added
- xxx

### Fixed
- xxx

### Screenshots
- assets/screenshots/NN-feature.png
```

让 README + CHANGELOG + assets 三件套永远对齐,GitHub 用户随便点哪个
入口都能看到最新状态。
