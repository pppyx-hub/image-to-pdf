#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把图片合成为 PDF（本地命令行工具，适合整文件夹批量处理）

示例：
    python batch_img2pdf.py ./照片 -o 相册.pdf
    python batch_img2pdf.py ./照片 -o 相册.pdf --size A4 --margin 12 --dpi 200 --per-sheet 2
    python batch_img2pdf.py a.jpg b.png c.webp -o 合集.pdf --fit cover --quality 92
    python batch_img2pdf.py ./照片 -o 长图.pdf --size auto

依赖：Pillow（pip install Pillow）
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    sys.exit("缺少 Pillow，请先执行：pip install Pillow")

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"}
PAGE_SIZES_MM = {"A4": (210.0, 297.0), "A3": (297.0, 420.0), "Letter": (215.9, 279.4)}
RESAMPLE = getattr(Image, "Resampling", Image).LANCZOS


def natural_key(path: Path):
    """让 1.jpg、2.jpg、10.jpg 按人的直觉排序。"""
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


def collect_images(inputs, recursive: bool):
    files = []
    for raw in inputs:
        path = Path(raw).expanduser()
        if path.is_dir():
            pattern = "**/*" if recursive else "*"
            for item in path.glob(pattern):
                if item.is_file() and item.suffix.lower() in IMAGE_EXTS:
                    files.append(item)
        elif path.is_file() and path.suffix.lower() in IMAGE_EXTS:
            files.append(path)
        else:
            print("[跳过] 不是图片或不存在：{}".format(path))

    seen = set()
    unique = []
    for item in files:
        key = item.resolve()
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def load_image(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        opened.load()
        image = ImageOps.exif_transpose(opened)
        if image.mode in ("RGBA", "LA", "P"):
            rgba = image.convert("RGBA")
            background = Image.new("RGB", rgba.size, "white")
            background.paste(rgba, mask=rgba.split()[-1])
            return background
        if image.mode != "RGB":
            return image.convert("RGB")
        return image.copy()


def split_cells(box, rows: int, cols: int, gap: int):
    x0, y0, x1, y1 = box
    cell_w = (x1 - x0 - gap * (cols - 1)) / cols
    cell_h = (y1 - y0 - gap * (rows - 1)) / rows
    cells = []
    for row in range(rows):
        for col in range(cols):
            cells.append((
                int(round(x0 + col * (cell_w + gap))),
                int(round(y0 + row * (cell_h + gap))),
                max(1, int(round(cell_w))),
                max(1, int(round(cell_h))),
            ))
    return cells


def place_in_box(page: Image.Image, image: Image.Image, box, fit: str):
    x, y, width, height = box
    if fit == "cover":
        cropped = ImageOps.fit(image, (width, height), method=RESAMPLE, centering=(0.5, 0.5))
        page.paste(cropped, (x, y))
        return

    scale = min(width / image.width, height / image.height)
    draw_w = max(1, round(image.width * scale))
    draw_h = max(1, round(image.height * scale))
    resized = image.resize((draw_w, draw_h), RESAMPLE)
    page.paste(resized, (x + (width - draw_w) // 2, y + (height - draw_h) // 2))


def compose_sheet(images, page_w: int, page_h: int, margin: int, per_sheet: int, gap: int, fit: str):
    page = Image.new("RGB", (page_w, page_h), "white")
    box = (margin, margin, page_w - margin, page_h - margin)

    if per_sheet == 1:
        cells = [box]
    elif per_sheet == 2:
        cells = split_cells(box, 2, 1, gap)
    else:
        cells = split_cells(box, 2, 2, gap)

    for image, cell in zip(images, cells):
        place_in_box(page, image, cell, fit)
    return page


def build_pages(files, args):
    dpi = args.dpi
    pages = []

    if args.size == "auto":
        for path in files:
            pages.append(load_image(path))
        return pages

    width_mm, height_mm = PAGE_SIZES_MM[args.size]
    page_w = max(1, round(width_mm / 25.4 * dpi))
    page_h = max(1, round(height_mm / 25.4 * dpi))
    margin = max(0, round(args.margin / 25.4 * dpi))
    gap = max(6, round(dpi * 0.05)) if margin == 0 else max(6, round(margin * 0.4))

    for start in range(0, len(files), args.per_sheet):
        group = [load_image(path) for path in files[start:start + args.per_sheet]]
        pages.append(compose_sheet(group, page_w, page_h, margin, args.per_sheet, gap, args.fit))
    return pages


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="把图片合成为 PDF（本地处理，不依赖任何在线服务）",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("inputs", nargs="+", help="图片文件或文件夹，可传多个")
    parser.add_argument("-o", "--output", default="", help="输出 PDF 路径，默认按日期命名")
    parser.add_argument("--size", default="A4", choices=["A4", "A3", "Letter", "auto"], help="纸张大小")
    parser.add_argument("--margin", type=float, default=12, help="页边距（毫米），auto 时忽略")
    parser.add_argument("--dpi", type=int, default=200, help="输出分辨率（72-400）")
    parser.add_argument("--quality", type=int, default=88, help="JPEG 质量（1-100）")
    parser.add_argument("--fit", default="contain", choices=["contain", "cover"], help="适应页面或铺满裁切")
    parser.add_argument("--per-sheet", type=int, default=1, choices=[1, 2, 4], help="每页图片数量")
    parser.add_argument("--sort", default="name", choices=["name", "mtime"], help="排序方式")
    parser.add_argument("--no-recursive", action="store_true", help="只处理文件夹第一层")
    args = parser.parse_args(argv)

    args.dpi = max(72, min(400, args.dpi))
    args.quality = max(40, min(95, args.quality))

    if args.size == "auto" and args.per_sheet != 1:
        parser.error("--size auto 时 --per-sheet 只能是 1")
    return args


def main(argv=None):
    args = parse_args(argv)
    files = collect_images(args.inputs, recursive=not args.no_recursive)

    if not files:
        sys.exit("没有找到可用的图片")

    files.sort(key=(lambda p: (p.stat().st_mtime, p.name)) if args.sort == "mtime" else natural_key)
    print("共 {} 张图片，开始合成…".format(len(files)))

    pages = build_pages(files, args)
    if not pages:
        sys.exit("没有可输出的页面")

    if args.output:
        output = Path(args.output).expanduser()
    else:
        output = Path.cwd() / "图片合集_{}.pdf".format(datetime.now().strftime("%Y%m%d_%H%M"))
    output.parent.mkdir(parents=True, exist_ok=True)

    first, *rest = pages
    first.save(
        output,
        "PDF",
        resolution=args.dpi,
        save_all=True,
        append_images=rest,
        quality=args.quality,
    )

    size_mb = output.stat().st_size / 1024 / 1024
    print("已生成：{}（{} 页，{:.2f} MB）".format(output.resolve(), len(pages), size_mb))


if __name__ == "__main__":
    main()
