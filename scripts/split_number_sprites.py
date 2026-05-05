#!/usr/bin/env python3
"""
Split img/number.png into 11 bulbs (0–9 + colon).

Left→right proportional model (micro-strips tiled across full sprite width):

  1.7  → 从左边缘到「数字 0 灯泡」的起点（留白 + 归入 number-0 切图左侧）
  2.5  → 灯泡 0 本体
  2.5×8 → 灯泡 1 … 8（各一段）
  2.0 → 灯泡 9
  2.2 → 冒号

共 12 个小段；导出 11 张图：`number-0` = 「左缘→0」的 1.7 + 灯泡 0 的 2.5，其余数字各占一段。
总和 S = 1.7 + 9×2.5 + 2 + 2.2 = 28.4
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "img" / "number.png"
OUT_DIR = ROOT / "img"
LABELS = [str(i) for i in range(10)] + ["colon"]

# 与 [1.7] + [2.5]*9 + [2.0, 2.2] 等价：1.7 为左缘到 0，其后九个 2.5 为灯泡 0～8
_MICRO_RATIOS_LEFT_TO_RIGHT = [1.7] + [2.5] * 9 + [2.0, 2.2]


def _integer_segment_lengths(total_px: int, ratios: list[float]) -> list[int]:
    """Largest-remainder allocation so segment widths sum exactly to total_px."""
    s = sum(ratios)
    exact = [total_px * r / s for r in ratios]
    base = [int(e) for e in exact]
    deficit = total_px - sum(base)
    order = sorted(range(len(ratios)), key=lambda i: (exact[i] - base[i]), reverse=True)
    for k in range(deficit):
        base[order[k % len(ratios)]] += 1
    assert sum(base) == total_px
    return base


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    mic = _integer_segment_lengths(w, _MICRO_RATIOS_LEFT_TO_RIGHT)
    boundaries = [0]
    for sl in mic:
        boundaries.append(boundaries[-1] + sl)
    assert boundaries[-1] == w

    # micro index spans [a,b) for each export slice
    def span_for_digit(d: int) -> tuple[int, int]:
        if d == 0:
            return 0, 2  # micro[0]=左缘→0，micro[1]=灯泡 0
        return d + 1, d + 2  # 灯泡 1→micro[2]…，灯泡 9→micro[10]

    print(f"image {w}x{h}, micro_px={mic!r}")

    for i, label in enumerate(LABELS):
        if label == "colon":
            a, b = 11, 12
        else:
            d = int(label)
            a, b = span_for_digit(d)
        x0, x1 = boundaries[a], boundaries[b]
        crop = im.crop((x0, 0, x1, h))
        dest = OUT_DIR / f"number-{label}.png"
        crop.save(dest, "PNG")
        print(f"wrote {dest.name} (micro[{a}:{b}] → x {x0}..{x1}, width {x1-x0})")


if __name__ == "__main__":
    main()
