#!/usr/bin/env python3
"""
横向等分分割 img/numbers.png（从左到右依次为数字 0–9，共 10 格）。

整数像素：总宽度按比例均分余数分配给最左侧的几列。
输出：img/numbers-0.png … img/numbers-9.png
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "img" / "numbers.png"
OUT_DIR = ROOT / "img"
N = 10


def main() -> None:
    if not SRC.exists():
        raise FileNotFoundError(f"Missing source PNG: {SRC}")
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    base = w // N
    rem = w % N
    x = 0
    for i in range(N):
        cell_w = base + (1 if i < rem else 0)
        crop = im.crop((x, 0, x + cell_w, h))
        dest = OUT_DIR / f"numbers-{i}.png"
        crop.save(dest, "PNG")
        print(f"wrote {dest.name} ({cell_w}x{h})")
        x += cell_w
    print(f"source {w}x{h}, equal split ×{N}")


if __name__ == "__main__":
    main()
