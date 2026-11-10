# Чистка готового пиксель-арта карты (src/map/assets/map.png) — без перерисовки:
#
#   python scripts/clean-map.py [--out папка] [--src файл]
#
#  1. палитра: почти одинаковые цвета сливаются в один (море — 12 «шумных» синих → один ровный,
#     облака, тени облаков); почти чёрные — в чистый чёрный контур;
#  2. сглаживание от нейросети: пиксель «между» двумя контрастными соседями (серо-бурая кайма у чёрных
#     линий, полутон между пеной и морем) примыкает к ближайшему из них;
#  3. пылинки: одиночные пиксели и пары, почти не отличающиеся от окружения, красятся в цвет окружения
#     (контрастные детали — окна, блики, снег — не трогаются);
#  4. в regions.png, канал G — «кому принадлежит кромка берега» (пена и обводка снаружи префектуры):
#     туман войны накрывает и её, поэтому вокруг закрытой префектуры не остаётся белого контура.
# Оригинал хранится в scripts/map-src/map_before_clean.png (создаётся при первом запуске): повторный
# запуск всегда чистит оригинал, а не уже почищенную картинку.
# Нужны: pillow, numpy, scipy.
import sys, shutil
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / 'src/map/assets/map.png'
REG = ROOT / 'src/map/assets/regions.png'
KEEP = ROOT / 'scripts/map-src/map_before_clean.png'
arg = lambda n: Path(sys.argv[sys.argv.index(n) + 1]) if n in sys.argv else None
out = arg('--out')
if not KEEP.exists():
    KEEP.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(MAP, KEEP)
src = arg('--src') or KEEP

rgb = np.asarray(Image.open(src).convert('RGB'))
H, W, _ = rgb.shape
flat = rgb.reshape(-1, 3)
pal, idx = np.unique(flat, axis=0, return_inverse=True)
idx = idx.reshape(H, W)
cnt = np.bincount(idx.ravel(), minlength=len(pal)).astype(float)
pal = pal.astype(float)
print(f'цветов было: {len(pal)}')

# ---------- 1. палитра ----------
MERGE = 13.0  # расстояние в RGB, ближе которого цвета считаются одним
alive = np.ones(len(pal), bool)
remap = np.arange(len(pal))
while True:
    ids = np.nonzero(alive)[0]
    d = np.linalg.norm(pal[ids][:, None] - pal[ids][None], axis=2)
    d[np.arange(len(ids)), np.arange(len(ids))] = 1e9
    i, j = np.unravel_index(d.argmin(), d.shape)
    if d[i, j] > MERGE:
        break
    a, b = ids[i], ids[j]
    if cnt[a] < cnt[b]:
        a, b = b, a
    # цвет остаётся от более частого (а не среднее) — палитра не «плывёт»
    cnt[a] += cnt[b]
    alive[b] = False
    remap[remap == b] = a
# почти чёрные → чёрный контур
black = int(np.argmin(pal.sum(1) + np.where(alive, 0, 1e9)))
pal[black] = (5, 4, 5)
for c in np.nonzero(alive)[0]:
    if c != black and pal[c].max() < 40:
        alive[c] = False
        remap[remap == c] = black
idx = remap[idx]
ids = np.nonzero(alive)[0]
new = np.full(len(pal), -1)
new[ids] = np.arange(len(ids))
idx = new[idx]
pal = pal[ids]
K = len(pal)
print(f'цветов стало: {K}')
dist = np.linalg.norm(pal[:, None] - pal[None], axis=2)
sea = int(np.bincount(idx.ravel()).argmax())
black_i = int(pal.sum(1).argmin())


def comp_size(ix):
    """размер одноцветного связного куска (4-связность), в котором лежит каждый пиксель"""
    size = np.zeros(ix.shape, np.int32)
    for c in range(K):
        m = ix == c
        if not m.any():
            continue
        lab, n = nd.label(m)
        s = np.bincount(lab.ravel())
        size[m] = s[lab[m]]
    return size


def shifted(ix, dy, dx):
    p = np.pad(ix, 1, mode='edge')
    return p[1 + dy:1 + dy + H, 1 + dx:1 + dx + W]


# ---------- 2. сглаживание ----------
def unblur(ix):
    size = comp_size(ix)
    res = ix.copy()
    best = np.full(ix.shape, 1e9)
    for (ay, ax), (by, bx) in [((0, -1), (0, 1)), ((-1, 0), (1, 0)), ((-1, -1), (1, 1)), ((-1, 1), (1, -1)),
                               ((0, -1), (-1, 0)), ((0, 1), (-1, 0)), ((0, -1), (1, 0)), ((0, 1), (1, 0))]:
        a, b = shifted(ix, ay, ax), shifted(ix, by, bx)
        ca, cb, cp = pal[a], pal[b], pal[ix]
        ab = cb - ca
        l2 = (ab ** 2).sum(-1)
        t = ((cp - ca) * ab).sum(-1) / np.maximum(l2, 1)
        off = np.linalg.norm(cp - (ca + ab * t[..., None]), axis=-1)
        L = np.sqrt(l2)
        ok = (a != b) & (a != ix) & (b != ix) & (L > 70) & (t > 0.18) & (t < 0.82) & (off < 0.22 * L) & (size <= 2)
        # к чёрному контуру примыкают только действительно тёмные пиксели: полутона (хвоя под снегом,
        # тени) остаются как есть, иначе рисунок грубеет
        tgt = np.where(t < 0.5, a, b)
        ok &= (tgt != black_i) | (np.minimum(t, 1 - t) < 0.34)
        score = np.where(ok, off / np.maximum(L, 1), 1e9)
        take = score < best
        best = np.where(take, score, best)
        res = np.where(take, np.where(t < 0.5, a, b), res)
    return res, int((res != ix).sum())


# ---------- 3. пылинки ----------
def despeckle(ix, max_size, thr):
    size = comp_size(ix)
    votes = np.zeros((K,) + ix.shape, np.int16)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy or dx:
                n = shifted(ix, dy, dx)
                w = 2 if dy == 0 or dx == 0 else 1
                np.add.at(votes, (n, *np.indices(ix.shape)), w)
    votes[ix, *np.indices(ix.shape)] = 0  # свой цвет не голосует
    maj = votes.argmax(0)
    strong = votes.max(0) >= 5
    ok = (size <= max_size) & strong & (dist[ix, maj] < thr)
    return np.where(ok, maj, ix), int(ok.sum())


total = 0
for _ in range(3):
    idx, n1 = unblur(idx)
    idx, n2 = despeckle(idx, 1, 60)
    idx, n3 = despeckle(idx, 2, 38)
    total += n1 + n2 + n3
    print(f'  проход: сглаживание {n1}, одиночные {n2}, пары {n3}')
print(f'изменено пикселей: {total} ({total / idx.size:.1%})')

res = Image.fromarray(pal[idx].astype(np.uint8), 'RGB')
res = res.quantize(colors=K, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE)

# ---------- 4. кромка берега для тумана ----------
regs = np.asarray(Image.open(REG)).copy()
reg = regs[..., 0] // 5
dt, (iy, ix_) = nd.distance_transform_edt(reg == 0, return_indices=True)
# не море и не тень облака на море: пена, обводка, утёсы — в пределах 4 пикселей от префектуры
seaish = (pal[:, 2] > pal[:, 0] + 45) & (pal[:, 2] > pal[:, 1] + 20) & (pal[:, 2] < 200)
fringe = (reg == 0) & (dt <= 4.3) & ~seaish[idx]
# только то, что касается префектуры (цепочкой таких же пикселей), — без отдельных облачков
lab, _ = nd.label(fringe | (reg > 0))
touch = np.unique(lab[reg > 0])
fringe &= np.isin(lab, touch)
regs[..., 1] = 0
regs[..., 1][fringe] = reg[iy[fringe], ix_[fringe]] * 5
print(f'кромка берега: {int(fringe.sum())} пикселей')

dst_map, dst_reg = (out / 'map.png', out / 'regions.png') if out else (MAP, REG)
if out:
    out.mkdir(parents=True, exist_ok=True)
res.save(dst_map, optimize=True)
Image.fromarray(regs, 'RGBA').save(dst_reg, optimize=True)
print('готово:', dst_map, dst_reg)
