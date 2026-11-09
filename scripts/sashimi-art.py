# Сашими: готовит картинки рыб и доски для игры и считает по ним профили веса.
#
#   python scripts/sashimi-art.py
#
# Берёт src/img/sashimi/{tuna,squid}.png (большие, от нейросети) и art/sashimi/out/sprites/crab.png
# (pxl, уже в родной сетке), приводит их к сетке холста рыбы (ширина 144 = X1 − X0 в
# src/games/sashimi.ts) → src/img/sashimi/{fish}_px.png, доску → board_px.png (160×60).
# По силуэту каждой картинки пишет src/games/sashimiProfiles.ts: для столбца — толщина вверх/вниз
# от оси и «плотность» (доля закрашенных пикселей: у щупалец с просветами она меньше).
# Профиль лежит в коде числами, поэтому вес одинаков у хоста и телефонов, даже если картинка не загрузилась.
import sys
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from pixelart import pixelize  # noqa: E402

DIR = ROOT / 'src/img/sashimi'
FW = 144   # ширина рыбы на холсте
SW, SH = 160, 60
# лёгкие части (хвостовой плавник, плавники мантии, щупальца): множитель плотности по доле длины
LIGHT = {
    'tuna': [(0.0, 1), (0.87, 1), (0.89, 0.1), (0.94, 0.05), (1.0, 0.03)],
    'squid': [(0.0, 0.12), (0.04, 0.12), (0.14, 0.25), (0.16, 1), (0.66, 1), (0.7, 0.5), (1.0, 0.3)],
    'crab': [(0.0, 1), (1.0, 1)],
}


def interp(pts, t):
    for (a, ka), (b, kb) in zip(pts, pts[1:]):
        if t <= b:
            return ka + (kb - ka) * (t - a) / (b - a or 1)
    return pts[-1][1]


def fit(img: Image.Image) -> Image.Image:
    a = np.asarray(img.convert('RGBA'))
    ys, xs = np.where(a[..., 3] > 128)
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    if img.width == FW:
        return img
    px = pixelize(img, img.width / FW, 48)
    # пикселизация может дать 143/145 — подгоняем ближайшим соседом
    return px if px.width == FW else px.resize((FW, round(px.height * FW / px.width)), Image.NEAREST)


def profile(img: Image.Image, fish: str):
    a = np.asarray(img.convert('RGBA'))[..., 3] > 128
    h = a.shape[0]
    cy = h // 2   # ось рыбы: строка картинки, которая ложится на CY холста
    pts = []
    for x in range(0, FW, 2):
        col = a[:, x:x + 2].any(axis=1)
        ys = np.where(col)[0]
        t = (x + 1) / FW
        if not len(ys):
            pts.append((t, 0.5, 0.5, 0.01))
            continue
        up, down = cy - ys.min(), ys.max() + 1 - cy
        fill = col[ys.min():ys.max() + 1].mean()
        pts.append((round(t, 4), float(up), float(down), round(fill * interp(LIGHT[fish], t), 3)))
    return cy, pts


def main():
    out = ['// Сгенерировано scripts/sashimi-art.py по картинкам src/img/sashimi/*_px.png — не править руками.',
           '// Профиль: [доля длины, толщина вверх, вниз, плотность]; cy — строка картинки на оси рыбы.',
           "import type { FishId } from '../shared/types';", '',
           'export const ART_FISH: Partial<Record<FishId, { cy: number; profile: [number, number, number, number][] }>> = {']
    for fish, src in [('tuna', DIR / 'tuna.png'), ('squid', DIR / 'squid.png'), ('crab', ROOT / 'art/sashimi/out/sprites/crab.png')]:
        if not src.exists():
            print('нет', src)
            continue
        px = fit(Image.open(src))
        px.save(DIR / f'{fish}_px.png')
        cy, pts = profile(px, fish)
        print(fish, px.size, 'ось', cy)
        body = ', '.join(f'[{t}, {u:g}, {d:g}, {k:g}]' for t, u, d, k in pts)
        out.append(f'  {fish}: {{ cy: {cy}, profile: [{body}] }},')
    out.append('};')
    (ROOT / 'src/games/sashimiProfiles.ts').write_text('\n'.join(out) + '\n', encoding='utf-8')
    # доска: родная сетка ~2 px, середина по высоте
    b = pixelize(Image.open(DIR / 'board.png'), 2, 32)
    top = (b.height - SH) // 2
    b.crop((0, top, SW, top + SH)).save(DIR / 'board_px.png')
    print('board', b.size, '→', (SW, SH))


main()
