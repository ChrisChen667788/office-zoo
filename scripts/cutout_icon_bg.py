#!/usr/bin/env python3.12
"""
v6.55 — cutout_icon_bg.py · 把二次元贴纸图标的背景统一抠成透明。

doubao-seedream-4-5 生成的图标主体都带一圈白色模切边(die-cut sticker
border),但每张外圈背景各异(浅蓝 / 暗黑光晕 / 粉紫渐变…)。本脚本把
"白边以外、与画布边缘连通的区域"判为背景并抠透明,从而把全部图标的背景
统一掉(统一为"无背景")。白边 + 主体保留,放到任何 UI 底色上都干净。

原理(纯 Pillow,不需要 scipy):
  1. 二值化:RGB 三通道都 >= WHITE_T 记为"白"(模切边 + 主体内的白),
     否则记为"非白"。
  2. PIL.ImageDraw.floodfill 从四角/四边中点在二值图上灌水(thresh=0):
     只在"非白"连通域蔓延,遇白边即停 —— 灌到的即背景。灌的是二值图,
     所以背景里的渐变 / 光晕不影响连通判定(这正是不用色彩相似度的原因)。
  3. 背景像素 alpha = 0。
  4. 清孤儿:背景里可能有白色碎星(在白边之外、二值里仍是"白"未被灌到)。
     从画布中心在"不透明掩膜"上再灌一次,只保留与中心连通的那团(= 主体
     贴纸),其余孤立不透明碎块一律透明。
  5. 可选 1px 羽化(默认开),软化模切边硬锯齿 —— 羽化的是纯白边,不会带
     出彩色 halo。

Run:    npm run icons:cutout              # = python3.12 scripts/cutout_icon_bg.py
        python3.12 scripts/cutout_icon_bg.py --dir <icons-dir> --no-backup
Chain:  IMAGE_MODEL=doubao-seedream-4-5-251128 \
          npx tsx packages/server/src/scripts/regen-icons.ts --force \
          && npm run icons:cutout
Input:  packages/server/public/icons/*.png  (RGB · 带白色模切边的贴纸)
Output: 原地覆盖为 RGBA 透明背景;默认先备份到 <dir>/.bak-bg/
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

DEFAULT_DIR = Path("packages/server/public/icons")
WHITE_T = 238           # RGB 三通道都 >= 此值算"白"(模切边 ~255)
WHITE_BG_T = 222        # 白底模式下"亮区(背景)"阈值,放低些把抗锯齿浅灰也吃掉
BG_MARK = 128           # 二值图里灌水标记背景用的中间值
KEEP_MARK = 200         # 不透明掩膜里灌水标记"主体连通团"用的值
MIN_BG_FRAC = 0.02      # 背景占比低于此 → 判定抠图失败(可能背景接近纯白)
WAND_TOLS = (40, 56, 72)  # 兜底魔棒容差候选:从小到大试,取第一个合格的(越小越不糊主体)
MIN_COMP_FRAC = 0.004   # 清孤儿:保留面积 >= 全图此比例的不透明连通块,其余当碎星丢弃
MAX_BG_FRAC = 0.85      # 背景占比高于此 → 多半灌水糊穿了主体,判主法不合格
MIN_KEEP = 0.12         # 主法合格需保留的主体下限
MIN_KEEP_WAND = 0.30    # 魔棒合格需保留的主体下限(更严,魔棒更易误食)


def _edge_seeds(w: int, h: int, step: int = 256):
    """四角 + 沿四边每 step 取点,确保灌满整个边缘背景(即便被主体分割)。"""
    pts = [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)]
    for x in range(0, w, step):
        pts += [(min(x, w - 1), 1), (min(x, w - 1), h - 2)]
    for y in range(0, h, step):
        pts += [(1, min(y, h - 1)), (w - 2, min(y, h - 1))]
    return pts


def _center_seeds(w: int, h: int, d: int = 120):
    cx, cy = w // 2, h // 2
    return [(cx, cy), (cx - d, cy), (cx + d, cy), (cx, cy - d), (cx, cy + d),
            (cx - d, cy - d), (cx + d, cy - d), (cx - d, cy + d), (cx + d, cy + d)]


def _flood_from_edges(fillable: np.ndarray, w: int, h: int) -> np.ndarray:
    """fillable(布尔 HxW)→ 从四边灌水,返回"与边缘连通的可灌区"(= 背景)掩膜。

    .copy():Image.fromarray 可能用只读 numpy buffer 衬底,floodfill 的原地写入
    会静默失效(填 0%)。.copy() 让 PIL 持有可写缓冲。
    """
    binimg = Image.fromarray(np.where(fillable, 0, 255).astype(np.uint8), "L").copy()
    for sx, sy in _edge_seeds(w, h):
        if binimg.getpixel((sx, sy)) == 0:  # 只从可灌种子起,已灌过的(128)跳过
            ImageDraw.floodfill(binimg, (sx, sy), BG_MARK, thresh=0)
    return np.array(binimg) == BG_MARK


def _finish(arr: np.ndarray, bg: np.ndarray, w: int, h: int, feather: float):
    """背景透明 + 清孤儿 + 羽化 → (alpha, kept_frac)。

    清孤儿:保留所有"足够大"的不透明连通块(逐块灌水量面积,>= MIN_COMP_FRAC
    的留下),背景里的碎星/小斑点丢弃。不再只留中心一团 —— 否则环形/碎裂的
    主体(如奖牌花环、中间镂空)会被误删大半。
    """
    alpha = arr[:, :, 3].copy()
    alpha[bg] = 0

    work = Image.fromarray(np.where(alpha > 0, 255, 0).astype(np.uint8), "L").copy()
    keep = np.zeros((h, w), dtype=bool)
    min_comp = MIN_COMP_FRAC * w * h
    for _ in range(4000):  # guard:碎块再多也封顶,防跑飞
        a = np.array(work)
        pos = np.argwhere(a == 255)
        if len(pos) == 0:
            break
        sy, sx = int(pos[0][0]), int(pos[0][1])
        ImageDraw.floodfill(work, (sx, sy), 1, thresh=0)   # 标出该连通块
        a = np.array(work)
        comp = a == 1
        if comp.sum() >= min_comp:
            keep |= comp
        a[comp] = 0                                          # 从 work 抹掉,继续下一块
        work = Image.fromarray(a, "L").copy()
    alpha = np.where(keep, alpha, 0).astype(np.uint8)

    if feather > 0:
        alpha = np.array(Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(feather)))
    return alpha, float((alpha > 0).mean())


def cutout(path: Path, white_t: int, feather: float) -> tuple[bool, float]:
    im = Image.open(path).convert("RGBA")
    arr = np.array(im)
    w, h = im.size
    rgb = arr[:, :, :3].astype(np.int16)

    # 主法:按四角颜色判别背景类型,二值灌水(对带白色模切边的渐变/白底最稳):
    #  - 彩色/暗底:屏障 = 白色模切边;背景(非白,含彩色光晕)从边缘灌掉。
    #  - 纯白底  :屏障 = 主体(非白线稿/填色);背景(亮区)从边缘灌掉。
    corners = [rgb[1, 1], rgb[1, w - 2], rgb[h - 2, 1], rgb[h - 2, w - 2]]
    white_bg = sum(int((c >= white_t).all()) for c in corners) >= 3
    if white_bg:
        fillable = ((rgb[:, :, 0] >= WHITE_BG_T) & (rgb[:, :, 1] >= WHITE_BG_T)
                    & (rgb[:, :, 2] >= WHITE_BG_T))
    else:
        is_white = ((rgb[:, :, 0] >= white_t) & (rgb[:, :, 1] >= white_t)
                    & (rgb[:, :, 2] >= white_t))
        fillable = ~is_white

    def valid(bf, kf, min_keep):
        # 合格 = 去掉了有意义的背景(bf 不太小)且主体没被糊穿(bf 不畸高、kf 够大)
        return MIN_BG_FRAC <= bf <= MAX_BG_FRAC and kf >= min_keep

    bg = _flood_from_edges(fillable, w, h)
    bg_frac = float(bg.mean())
    alpha, kept_frac = _finish(arr, bg, w, h, feather)
    method = "binary" if valid(bg_frac, kept_frac, MIN_KEEP) else None

    # 主法不合格(多半是无白边、主体直贴背景 → 二值灌水糊穿主体使 bg 畸高)→
    # 兜底魔棒:以四角中位色为背景种子,逐通道差 <= WAND_TOL 的算背景,在主体
    # 高对比边缘自然收住,保留更多主体。
    if method is None:
        seed = np.median(np.stack(corners).astype(np.int16), axis=0)
        dist = np.abs(rgb - seed).max(axis=2)
        for tol in WAND_TOLS:  # 容差从小到大,取第一个合格的 —— 越小越不糊穿主体
            bg2 = _flood_from_edges(dist <= tol, w, h)
            bf2 = float(bg2.mean())
            a2, kf2 = _finish(arr, bg2, w, h, feather)
            if valid(bf2, kf2, MIN_KEEP_WAND):
                bg_frac, alpha, kept_frac, method = bf2, a2, kf2, "wand"
                break

    # 安全闸:没有任何方法合格就保留原文件不动 —— 杜绝误判把图标抠坏。
    if method is not None:
        out = np.dstack([arr[:, :, :3], alpha]).astype(np.uint8)
        Image.fromarray(out, "RGBA").save(path)
    return method is not None, bg_frac


def main() -> int:
    ap = argparse.ArgumentParser(description="把贴纸图标背景统一抠透明")
    ap.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    ap.add_argument("--white-t", type=int, default=WHITE_T)
    ap.add_argument("--feather", type=float, default=0.8)
    ap.add_argument("--no-backup", action="store_true", help="不备份原图(默认会备份)")
    args = ap.parse_args()

    d: Path = args.dir
    pngs = sorted(d.glob("*.png"))
    if not pngs:
        print(f"✗ 没找到 PNG:{d}", file=sys.stderr)
        return 1

    if not args.no_backup:
        bak = d / ".bak-bg"
        bak.mkdir(exist_ok=True)
        for p in pngs:
            dst = bak / p.name
            if not dst.exists():
                dst.write_bytes(p.read_bytes())
        print(f"↳ 已备份 {len(pngs)} 张原图到 {bak}")

    ok, suspect = 0, []
    for p in pngs:
        good, frac = cutout(p, args.white_t, args.feather)
        ok += 1
        if not good:
            suspect.append((p.name, frac))
        print(f"  ✓ {p.name:40s} bg={frac*100:4.1f}%{'  ⚠ 背景占比异常(可能近白底,需人工看)' if not good else ''}")

    print(f"\n→ 完成 {ok}/{len(pngs)} 张,统一为透明背景。")
    if suspect:
        print(f"⚠ {len(suspect)} 张背景占比 < {MIN_BG_FRAC*100:.0f}%,可能没抠干净:" +
              ", ".join(n for n, _ in suspect))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
