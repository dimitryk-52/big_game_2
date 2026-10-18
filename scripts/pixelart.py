# Превращает «почти пиксель-арт» от нейросети (мыльные пиксели разного размера) в настоящий:
# картинка уменьшается до своей родной сетки — каждый пиксель результата = одна клетка cell×cell
# исходника, цвет клетки — самый частый цвет палитры в ней (а не среднее, поэтому края не мылятся).
# Потом в игре картинка растягивается с image-rendering: pixelated / nearest и остаётся чёткой
# на любом экране.
#
#   python scripts/pixelart.py вход.png выход.png [--cell 3] [--colors 64]
#   python scripts/pixelart.py --bgs [--cell 3] [--colors 64] [--force]
#       все src/img/bgs/bg_*_orig.png → src/img/bgs/bg_*.png (пропускает уже готовые, если не --force)
#
# Нужны: pillow, numpy.
import sys
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BGS = ROOT / 'src/img/bgs'


def palette(img: Image.Image, colors: int) -> np.ndarray:
    """палитра на colors цветов (k-means от Pillow, без дизеринга)"""
    q = img.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, kmeans=3, dither=Image.Dither.NONE)
    return np.array(q.getpalette()[:colors * 3], np.uint8).reshape(-1, 3), np.asarray(q)


def pixelize(img: Image.Image, cell: float, colors: int = 64) -> Image.Image:
    """cell — размер «пикселя» исходника в его пикселях (может быть дробным)"""
    img = img.convert('RGB')
    W, H = img.size
    w, h = max(1, round(W / cell)), max(1, round(H / cell))
    pal, idx = palette(img, colors)
    k = len(pal)
    # клетка каждого пикселя исходника; центр клетки весит больше краёв (края часто размыты)
    xs = (np.arange(W) + 0.5) * w / W
    ys = (np.arange(H) + 0.5) * h / H
    cx, cy = np.minimum(xs.astype(int), w - 1), np.minimum(ys.astype(int), h - 1)
    wx = 1.5 - np.abs(xs - cx - 0.5) * 2  # 1.5 в центре, 0.5 на краю
    wy = 1.5 - np.abs(ys - cy - 0.5) * 2
    cid = (cy[:, None] * w + cx[None, :]).ravel()
    wt = (wy[:, None] * wx[None, :]).ravel()
    votes = np.zeros(w * h * k, np.float32)
    np.add.at(votes, cid * k + idx.ravel().astype(np.int64), wt)
    best = despeckle(votes.reshape(w * h, k).argmax(1).reshape(h, w))
    return Image.fromarray(pal[best], 'RGB')


def despeckle(ix: np.ndarray) -> np.ndarray:
    """одиночный пиксель, у которого все 4 соседа одного (другого) цвета, — шум; красим в цвет соседей"""
    p = np.pad(ix, 1, mode='edge')
    l, r, u, d = p[1:-1, :-2], p[1:-1, 2:], p[:-2, 1:-1], p[2:, 1:-1]
    lone = (l == r) & (l == u) & (l == d) & (l != ix)
    return np.where(lone, l, ix)


def labels_down(lab: np.ndarray, w: int, h: int) -> np.ndarray:
    """карта меток (0 — фон) → сетка w×h, в каждой клетке самая частая метка"""
    H, W = lab.shape
    cx = np.minimum(((np.arange(W) + 0.5) * w / W).astype(int), w - 1)
    cy = np.minimum(((np.arange(H) + 0.5) * h / H).astype(int), h - 1)
    k = int(lab.max()) + 1
    cid = (cy[:, None] * w + cx[None, :]).ravel()
    votes = np.zeros(w * h * k, np.int32)
    np.add.at(votes, cid * k + lab.ravel().astype(np.int64), 1)
    return votes.reshape(h, w, k).argmax(2).astype(lab.dtype)


def arg(name, default, cast=float):
    return cast(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


if __name__ == '__main__':
    cell = arg('--cell', 3.0)
    colors = arg('--colors', 64, int)
    if '--bgs' in sys.argv:
        for src in sorted(BGS.glob('bg_*_orig.png')):
            dst = src.with_name(src.name.replace('_orig', ''))
            if dst.exists() and '--force' not in sys.argv and dst.stat().st_mtime >= src.stat().st_mtime:
                continue
            out = pixelize(Image.open(src), cell, colors)
            out.save(dst, optimize=True)
            print(f'{src.name} → {dst.name} {out.size[0]}×{out.size[1]}')
    else:
        files = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith('--') and not sys.argv[i - 1].startswith('--')]
        if len(files) != 2:
            raise SystemExit('pixelart.py вход.png выход.png [--cell 3] [--colors 64]  |  pixelart.py --bgs')
        out = pixelize(Image.open(files[0]), cell, colors)
        out.save(files[1], optimize=True)
        print(files[1], out.size)
