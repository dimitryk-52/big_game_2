# Ручные правки границ префектур поверх готовой карты меток.
#
#   python scripts/fix-regions.py [--out папка]
#
# build-map.py строит границы автоматически по линиям рисунка и кое-где ошибается; а сам пиксель-арт
# (src/map/assets/map.png) после сборки правился руками (стёрты острова), поэтому пересобирать его нельзя.
# Этот скрипт берёт src/map/assets/regions.png и:
#  1. убирает из префектур воду, соединённую с открытым морем (стёртые с рисунка острова, заливы);
#     озёра внутри суши остаются;
#  2. применяет правки из scripts/region-fixes.json:
#     paint — пиксели префектур "from" внутри многоугольника "poly" отдаются префектуре "to"
#             (0 — море, "near" — ближайшей соседней префектуре); "water": true — только водяные пиксели,
#             "land": true — только не водяные;
#     fill_holes — дырки внутри префектуры (озёра) становятся её частью;
#  3. пересчитывает bb/size в src/map/japan.json, якорь — только если он оказался вне префектуры.
# Повторный запуск ничего не портит. --out пишет результат в другую папку (для проверки).
import json, sys
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / 'src/map/assets/map.png'
REG = ROOT / 'src/map/assets/regions.png'
DATA = ROOT / 'src/map/japan.json'
FIX = ROOT / 'scripts/region-fixes.json'
out = Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else None

a = np.asarray(Image.open(MAP).convert('RGB')).astype(int)
reg = (np.asarray(Image.open(REG))[..., 0] // 5).astype(np.uint8)
before = reg.copy()
H, W = reg.shape
fix = json.loads(FIX.read_text(encoding='utf-8'))

# 1. вода, связанная с краем картинки
r, g, b = a[..., 0], a[..., 1], a[..., 2]
water = (b > r + 60) & (b > g + 30) & (b > 140)
wl, _ = nd.label(water)
edge = np.unique(np.concatenate([wl[0], wl[-1], wl[:, 0], wl[:, -1]]))
reg[np.isin(wl, edge[edge > 0])] = 0

# 2. правки
def poly_mask(pts):
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in pts], fill=255, outline=255)
    return np.asarray(im) > 0

for f in fix.get('paint', []):
    m = poly_mask(f['poly']) & np.isin(reg, f['from'])
    if f.get('water'):
        m &= water
    if f.get('land'):
        m &= ~water
    if f['to'] == 'near':
        other = (reg > 0) & ~np.isin(reg, f['from'])
        iy, ix = nd.distance_transform_edt(~other, return_distances=False, return_indices=True)
        reg[m] = reg[iy[m], ix[m]]
    else:
        reg[m] = f['to']
for c in fix.get('fill_holes', []):
    m = nd.binary_fill_holes(reg == c)
    reg[m & (reg == 0)] = c

# 3. данные префектур
data = json.loads(DATA.read_text(encoding='utf-8'))
objs = nd.find_objects(reg)
for p in data['prefs']:
    c = p['code']
    s = objs[c - 1] if c - 1 < len(objs) else None
    if s is None:
        raise SystemExit(f'префектура {c} {p["en"]} пропала')
    p['bb'] = [s[1].start, s[0].start, s[1].stop - 1, s[0].stop - 1]
    p['size'] = int((reg[s] == c).sum())
    x, y = p['anchor']
    if reg[y, x] != c:
        m = reg[s] == c
        lab, n = nd.label(m)
        if n > 1:
            cs = np.bincount(lab.ravel()); cs[0] = 0
            m = lab == cs.argmax()
        dt = nd.distance_transform_edt(m)
        yy, xx = np.unravel_index(dt.argmax(), dt.shape)
        p['anchor'] = [int(xx + s[1].start), int(yy + s[0].start)]
        print(f'{p["en"]}: новый якорь {p["anchor"]}')
    moved = int(((before == c) != (reg == c)).sum())
    if moved:
        print(f'{c:2} {p["en"]:10} изменено пикселей: {moved}')

dst = out or REG.parent
dst.mkdir(parents=True, exist_ok=True)
rgba = np.zeros((H, W, 4), np.uint8)
rgba[..., 0] = reg * 5
rgba[..., 3] = 255
Image.fromarray(rgba, 'RGBA').save(dst / 'regions.png', optimize=True)
(dst / 'japan.json' if out else DATA).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('готово:', dst / 'regions.png')
