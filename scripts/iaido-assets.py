# Заглушки ассетов иайдо (src/img/iaido/): ночное небо, луна, сакура, самурай, лепесток, катана и ножны.
# Нарисованы кодом, чтобы было с чего начать; настоящие — перерисовать в Nano Banana
# (промпты и размеры — в src/img/iaido/README.md) и положить поверх с теми же именами.
#
#   python scripts/iaido-assets.py [--force]     (без --force готовые файлы не трогает)
#
# Нужен pillow.
import math
import random
import sys
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'src/img/iaido'
FORCE = '--force' in sys.argv
rnd = random.Random(7)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def save(img: Image.Image, name: str):
    p = OUT / name
    if p.exists() and not FORCE:
        print('есть, пропускаю:', p.name)
        return
    img.save(p)
    print('готово:', p.name, img.size)


def blossom(d: ImageDraw.ImageDraw, x, y, r):
    """облачко цветов сакуры из кружков трёх оттенков"""
    for _ in range(int(r * 2.2)):
        a = rnd.random() * math.tau
        k = rnd.random() ** 0.6 * r
        cx, cy = x + math.cos(a) * k, y + math.sin(a) * k * 0.7
        rr = rnd.randint(3, 6)
        col = rnd.choice([(255, 183, 213), (247, 150, 190), (255, 214, 231), (226, 120, 168)])
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)


def background():
    W, H = 480, 270
    img = Image.new('RGB', (W, H))
    px = img.load()
    top, mid, low = (14, 10, 38), (52, 30, 84), (150, 70, 110)
    for y in range(H):
        t = y / H
        c = lerp(top, mid, t / 0.55) if t < 0.55 else lerp(mid, low, (t - 0.55) / 0.45)
        for x in range(W):
            px[x, y] = c
    d = ImageDraw.Draw(img)
    # звёзды
    for _ in range(90):
        x, y = rnd.randrange(W), rnd.randrange(int(H * 0.5))
        d.point((x, y), fill=rnd.choice([(255, 255, 255), (200, 200, 255), (255, 230, 200)]))
    # луна с ореолом
    mx, my = 300, 92
    for r, c in [(62, (70, 46, 100)), (54, (92, 60, 118)), (47, (120, 80, 132))]:
        d.ellipse([mx - r, my - r, mx + r, my + r], fill=c)
    d.ellipse([mx - 40, my - 40, mx + 40, my + 40], fill=(255, 238, 205))
    for cx, cy, r in [(285, 80, 7), (312, 104, 5), (296, 110, 3), (318, 76, 4)]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(236, 214, 180))
    # Фудзи вдали
    d.polygon([(110, 200), (215, 128), (232, 126), (250, 132), (380, 200)], fill=(48, 34, 82))
    d.polygon([(196, 141), (215, 128), (232, 126), (250, 132), (262, 141), (244, 137), (232, 145), (220, 137)], fill=(220, 214, 240))
    # холмы
    d.polygon([(0, 205), (90, 182), (200, 196), (320, 184), (480, 200), (480, 270), (0, 270)], fill=(30, 22, 54))
    # поле
    d.polygon([(0, 228), (480, 222), (480, 270), (0, 270)], fill=(20, 14, 34))
    for _ in range(140):
        x = rnd.randrange(W)
        y = rnd.randrange(224, H)
        d.line([(x, y), (x + rnd.choice([-1, 1]), y - rnd.randint(2, 5))], fill=(42, 30, 64))
    # сакура слева: ствол, ветви, облака цветов
    d.polygon([(26, 270), (40, 170), (52, 120), (62, 122), (56, 175), (50, 270)], fill=(26, 14, 22))
    for (x0, y0, x1, y1, w) in [(54, 140, 120, 92, 5), (50, 160, 0, 120, 5), (58, 126, 150, 60, 4), (56, 124, 30, 40, 4), (110, 98, 170, 108, 3)]:
        d.line([(x0, y0), (x1, y1)], fill=(26, 14, 22), width=w)
    for x, y, r in [(20, 40, 30), (70, 30, 34), (130, 54, 30), (160, 98, 22), (110, 92, 26), (0, 110, 26), (40, 80, 26)]:
        blossom(d, x, y, r)
    # ветка сакуры сверху справа
    d.line([(480, 18), (420, 30), (380, 22)], fill=(26, 14, 22), width=3)
    for x, y, r in [(440, 20, 16), (395, 26, 12), (472, 34, 14)]:
        blossom(d, x, y, r)
    # опавшие лепестки на земле
    for _ in range(60):
        x, y = rnd.randrange(W), rnd.randrange(232, H)
        d.point((x, y), fill=rnd.choice([(247, 150, 190), (255, 183, 213)]))
    return img


SIL = (8, 6, 14)


def samurai(cut: bool):
    """силуэт ронина вполоборота: стойка с рукой на рукояти или удар с выхваченным мечом"""
    W, H = 96, 96
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # ноги в хакама (широкие штаны), низкая стойка
    d.polygon([(30, 94), (36, 62), (58, 62), (70, 94), (58, 94), (48, 72), (42, 94)], fill=SIL)
    # корпус и плечи
    body = [(36, 64), (34, 40), (40, 30), (56, 30), (60, 40), (58, 64)]
    d.polygon(body, fill=SIL)
    # голова, пучок
    d.ellipse([41, 16, 55, 31], fill=SIL)
    d.rectangle([46, 11, 50, 17], fill=SIL)
    if not cut:
        # меч в ножнах за поясом, рука на рукояти
        d.line([(20, 66), (62, 50)], fill=SIL, width=4)
        d.line([(62, 50), (74, 45)], fill=(40, 30, 50), width=4)
        d.line([(56, 36), (66, 46), (72, 46)], fill=SIL, width=5)
        d.line([(38, 36), (34, 50), (44, 54)], fill=SIL, width=5)
    else:
        # клинок выхвачен: рука вытянута вперёд-вверх, по клинку блик
        d.line([(20, 66), (60, 52)], fill=SIL, width=4)
        d.line([(56, 36), (74, 30)], fill=SIL, width=5)
        d.line([(74, 30), (95, 4)], fill=(230, 236, 255), width=2)
        d.line([(72, 32), (76, 28)], fill=(40, 30, 50), width=4)
        d.line([(38, 36), (30, 52)], fill=SIL, width=5)
    return img


def petal():
    img = Image.new('RGBA', (7, 5), (0, 0, 0, 0))
    rows = ['..aab..', '.aaaab.', 'aaaacb.', '.aacc..', '..c....']
    cols = {'a': (255, 190, 216, 255), 'b': (255, 232, 242, 255), 'c': (232, 128, 172, 255)}
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in cols:
                img.putpixel((x, y), cols[ch])
    return img


# катана вертикально, рукоять вверху. Пропорции завязаны на константы в src/play/IaidoPad.tsx:
# KATANA_TSUBA = 0.25 (низ цубы — 25% высоты), ножны — 75% высоты меча
KW, KH = 16, 160


def katana():
    img = Image.new('RGBA', (KW, KH), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # рукоять: тёмная оплётка ромбиками по светлой основе
    d.rectangle([5, 2, 10, 33], fill=(232, 222, 200))
    for y in range(3, 33, 4):
        d.line([(5, y), (10, y + 3)], fill=(28, 20, 40))
        d.line([(10, y), (5, y + 3)], fill=(28, 20, 40))
    d.rectangle([5, 0, 10, 2], fill=(190, 150, 70))  # касира
    d.rectangle([5, 33, 10, 35], fill=(190, 150, 70))  # фути
    # цуба (гарда)
    d.rectangle([1, 36, 14, 39], fill=(214, 170, 64))
    d.rectangle([2, 37, 13, 38], fill=(150, 110, 40))
    # хабаки и клинок с хамоном
    d.rectangle([6, 40, 10, 44], fill=(240, 200, 90))
    d.polygon([(6, 44), (10, 44), (10, 150), (8, 159), (6, 152)], fill=(196, 206, 226))
    d.line([(9, 44), (9, 150)], fill=(250, 252, 255))
    for y in range(48, 148, 6):
        d.point((7, y), fill=(240, 244, 255))
    d.line([(6, 44), (6, 152)], fill=(120, 132, 160))
    return img


def saya():
    H = int(KH * 0.75)
    img = Image.new('RGBA', (KW, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([4, 0, 11, H - 4], fill=(150, 24, 40))
    d.rectangle([4, H - 4, 11, H - 1], fill=(190, 150, 70))  # кодзири
    d.line([(10, 2), (10, H - 6)], fill=(214, 70, 84))  # лак-блик
    d.line([(4, 0), (4, H - 4)], fill=(80, 10, 24))
    d.rectangle([4, 0, 11, 3], fill=(40, 20, 30))  # койгути
    d.rectangle([4, 14, 11, 18], fill=(40, 20, 30))  # курикката
    d.rectangle([3, 15, 12, 17], fill=(220, 200, 150))  # сагэо
    return img


OUT.mkdir(parents=True, exist_ok=True)
save(background(), 'bg.png')
save(samurai(False), 'samurai.png')
save(samurai(True), 'samurai_cut.png')
save(petal(), 'petal.png')
save(katana(), 'katana.png')
save(saya(), 'saya.png')
