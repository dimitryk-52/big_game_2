# Сборка карты из рисунка src/img/map.png.
#
#   python scripts/build-map.py [--debug папка]
#
# Что делает:
#  1. суша = всё, что не достижимо от края картинки через море/облака (берега обведены чёрным);
#     замкнутые кусочки моря внутри суши (цвет моря) тоже вырезаются;
#  2. границы префектур — толстые (≥3px) почти чёрные линии рисунка;
#  3. заливка водоразделом от «зёрен» из scripts/map-seeds.json (код префектуры → точки на картинке):
#     регионы растут по светлому и встречаются на чёрных линиях; острова без зерна — ближайшей префектуре;
#  4. пишет src/map/assets/regions.png (R = код*5, 0 — море), src/map/assets/map.webp и
#     обновляет anchor/bb/size в src/map/japan.json (координаты — пиксели картинки).
# Если префектура легла не туда — поправьте/добавьте точки в map-seeds.json и перезапустите.
# --debug сохраняет картинку с границами и номерами для проверки.
# Нужны: pillow, numpy, scipy, scikit-image.
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as nd
from skimage.segmentation import watershed

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src/img/map.png'
SEEDS = ROOT / 'scripts/map-seeds.json'
DATA = ROOT / 'src/map/japan.json'
OUT = ROOT / 'src/map/assets'
SEA = np.array([73, 132, 188])

debug = None
if '--debug' in sys.argv:
    debug = Path(sys.argv[sys.argv.index('--debug') + 1])
    debug.mkdir(parents=True, exist_ok=True)

img = Image.open(SRC).convert('RGB')
a = np.asarray(img).astype(int)
H, W, _ = a.shape
r, g, b = a[..., 0], a[..., 1], a[..., 2]
lum = a.max(2)

# 1. суша
dark = lum < 70
seaish = (b > r + 40) & (b >= g)  # море, облака и их тени
barrier = (nd.binary_dilation(dark, iterations=3) & ~seaish) | dark
lab, _ = nd.label(~barrier)
edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
outside = np.isin(lab, edge[edge > 0])
# замкнутое море внутри суши (заливы, Внутреннее море) — точно цвет моря, крупными кусками
sea_px = (np.abs(a - SEA).max(2) <= 10) & ~outside
sl, sn = nd.label(sea_px)
ss = np.bincount(sl.ravel(), minlength=sn + 1)
ss[0] = 0
outside |= ss[sl] >= 150
# возвращаем тонкий чёрный контур берега суше, удаляем пылинки
land = ~outside
land = nd.binary_opening(land, iterations=1)
ll, ln = nd.label(land)
ls = np.bincount(ll.ravel(), minlength=ln + 1)
ls[0] = 0
land &= ls[ll] >= 40

# 2. линии границ
ink = lum < 32
thick = nd.binary_opening(ink, np.ones((3, 3), bool))
elev = nd.gaussian_filter(thick.astype(float), 2.0) * 1000 + (255 - lum) * 0.05

# 3. водораздел от зёрен
seeds = {int(k): v for k, v in json.loads(SEEDS.read_text(encoding='utf-8')).items()}
mk = np.zeros((H, W), np.int32)
R = 12  # зерно сдвигается в самую «светлую» точку рядом, чтобы не попасть на линию или иконку
for code, pts in seeds.items():
    for x, y in pts:
        y0, x0 = max(0, y - R), max(0, x - R)
        e = elev[y0:y + R + 1, x0:x + R + 1] + np.where(land[y0:y + R + 1, x0:x + R + 1], 0, 1e9)
        dy, dx = np.unravel_index(e.argmin(), e.shape)
        mk[y0 + dy, x0 + dx] = code
reg = watershed(elev, mk, mask=land).astype(np.uint8)
miss = land & (reg == 0)
iy, ix = nd.distance_transform_edt(reg == 0, return_distances=False, return_indices=True)
reg[miss] = reg[iy[miss], ix[miss]]

# 4. данные префектур
data = json.loads(DATA.read_text(encoding='utf-8'))
for k in ('w', 'h', 'cells'):
    data.pop(k, None)
data['w'], data['h'] = W, H
codes = [p['code'] for p in data['prefs']]
objs = nd.find_objects(reg)
for p in data['prefs']:
    c = p['code']
    s = objs[c - 1] if c - 1 < len(objs) else None
    if s is None:
        raise SystemExit(f'префектура {c} {p["en"]} пустая — нет зерна в map-seeds.json?')
    m = reg[s] == c
    # якорь (где стоит фишка): самая «глубокая» точка основного куска, без учёта обрывов
    top = m & ~thick[s]
    cl, cn = nd.label(top)
    if cn > 1:
        cs = np.bincount(cl.ravel())
        cs[0] = 0
        top = cl == cs.argmax()
    dt = nd.distance_transform_edt(top)
    y, x = np.unravel_index(dt.argmax(), dt.shape)
    p['anchor'] = [int(x + s[1].start), int(y + s[0].start)]
    p['bb'] = [s[1].start, s[0].start, s[1].stop - 1, s[0].stop - 1]
    p['size'] = int(m.sum())

# соседство по рисунку — для сверки с игровым (реальным) adj
touch = set()
grown = {}
for c in codes:
    grown[c] = nd.binary_dilation(reg == c, iterations=8)
for c in codes:
    near = np.unique(reg[grown[c]])
    for n in near:
        if n and n != c:
            touch.add((min(c, n), max(c, n)))
game = {(min(p['code'], n), max(p['code'], n)) for p in data['prefs'] for n in p['adj']}
name = {p['code']: p['en'] for p in data['prefs']}
only_map = sorted(touch - game)
only_game = sorted(game - touch)
print('соседи на рисунке, но не в игре:', ', '.join(f'{name[x]}-{name[y]}' for x, y in only_map) or '—')
print('соседи в игре, но не касаются на рисунке (морские связи?):', ', '.join(f'{name[x]}-{name[y]}' for x, y in only_game) or '—')

OUT.mkdir(parents=True, exist_ok=True)
rgba = np.zeros((H, W, 4), np.uint8)
rgba[..., 0] = reg * 5
rgba[..., 3] = 255
Image.fromarray(rgba, 'RGBA').save(OUT / 'regions.png', optimize=True)
img.save(OUT / 'map.webp', lossless=True, quality=100, method=6)
DATA.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('готово:', OUT / 'regions.png', OUT / 'map.webp', DATA)

if debug:
    v = (a * 0.6 + 255 * 0.25).astype(np.uint8)
    v[~land] = (a[~land] * 0.35).astype(np.uint8)
    v[thick & land] = 0
    bd = np.zeros_like(land)
    bd[:, 1:] |= reg[:, 1:] != reg[:, :-1]
    bd[1:, :] |= reg[1:, :] != reg[:-1, :]
    v[nd.binary_dilation(bd & land)] = [255, 0, 255]
    im = Image.fromarray(v)
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype('arial.ttf', 18)
    for p in data['prefs']:
        x, y = p['anchor']
        d.text((x - 10, y - 10), str(p['code']), fill=(255, 255, 0), font=f, stroke_width=3, stroke_fill=(0, 0, 0))
    for code, pts in seeds.items():
        for x, y in pts:
            d.rectangle((x - 2, y - 2, x + 2, y + 2), fill=(0, 255, 255))
    im.save(debug / 'regions-debug.png')
