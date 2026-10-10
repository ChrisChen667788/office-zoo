#!/usr/bin/env python3
"""
v6.165 — 把本机生成的 AI 资产压成「随仓库发布」的资产包:packages/server/assets-pack/<family>/。

为什么:托管版服务器不持有任何模型 key(owner 决策:产品不提供模型 API),不能在启动时
或请求里生图;而这些图原本是 gitignore 的(原图标单张 5–6MB、全量约 330MB)。资产包按实际
显示尺寸压缩后提交进仓库,服务器找不到本机生成的原图时从这里取(见 utils/assetDirs.ts)。

  - 图标:要透明背景 → 256px PNG,调色板量化(显示最大 88px,3 倍屏也够)
  - 立绘 / 头像:没有透明 → JPEG 质量 85(文件名保留 .png:URL 全仓写死 .png,
    服务端按文件头识别真实类型下发 Content-Type,MiniMax 出的图本来就是这样)

不会改动 packages/server/public/ 里的原图。用法:python3 scripts/build-asset-pack.py
"""
from pathlib import Path
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('需要 Pillow:python3 -m pip install Pillow')

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'packages/server/public'
DST = ROOT / 'packages/server/assets-pack'

# family -> (最大边长, 格式)
FAMILIES = {
    'icons': (256, 'png-quant'),
    'avatars': (512, 'jpeg'),
    'archetype-portraits': (768, 'jpeg'),
    'fired-hr-portraits': (768, 'jpeg'),
}


def pack_one(src: Path, dst: Path, size: int, fmt: str) -> int:
    im = Image.open(src)
    im.thumbnail((size, size), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if fmt == 'png-quant':
        im = im.convert('RGBA').quantize(colors=256, method=Image.Quantize.FASTOCTREE)
        im.save(dst, format='PNG', optimize=True)
    else:
        im.convert('RGB').save(dst, format='JPEG', quality=85, optimize=True, progressive=True)
    return dst.stat().st_size


def main() -> None:
    total = 0
    for family, (size, fmt) in FAMILIES.items():
        files = sorted((SRC / family).glob('*.png'))
        if not files:
            print(f'⚠ {family}: 本机没有生成的原图,跳过(资产包里已有的保持不变)')
            continue
        sub = 0
        for f in files:
            sub += pack_one(f, DST / family / f.name, size, fmt)
        total += sub
        print(f'✓ {family}: {len(files)} 个 → {sub / 1024 / 1024:.1f} MB')
    print(f'合计 {total / 1024 / 1024:.1f} MB → {DST.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
