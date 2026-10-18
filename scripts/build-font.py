"""
Собирает статичные woff2 из переменного шрифта Handjet.

Зачем: в переменном Handjet контуры элементов букв перекрываются, и Chrome на Windows
рисует на стыках светлую полосу посередине букв. Статичные файлы со склеенными
контурами (removeOverlaps) рисуются чисто.

Источник: https://github.com/google/fonts/tree/main/ofl/handjet (OFL)
Запуск:   python scripts/build-font.py "путь/к/Handjet[ELGR,ELSH,wght].ttf"
Нужно:    pip install fonttools brotli skia-pathops
Результат: src/fonts/handjet-<вес>.woff2
"""
import os
import sys

from fontTools import subset
from fontTools.varLib import instancer
from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen


def decompose_all(font):
    """буквы Handjet собраны из ссылок на «элементы» — превращаем их в обычные контуры"""
    glyf = font['glyf']
    gs = font.getGlyphSet()
    for name in font.getGlyphOrder():
        if not glyf[name].isComposite():
            continue
        rec = DecomposingRecordingPen(gs)
        gs[name].draw(rec)
        pen = TTGlyphPen(None)
        rec.replay(pen)
        glyf[name] = pen.glyph()

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'fonts')
WEIGHTS = [300, 400, 500, 600, 700, 800]
# латиница, Latin-1 (¥ « » и т. п.), кириллица, типографика, стрелки и геометрия
UNICODES = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + list(range(0x400, 0x460)) +
    list(range(0x2010, 0x2070)) + [0x20BD, 0x2116] + list(range(0x2190, 0x21FF)) + list(range(0x25A0, 0x2600))
)

os.makedirs(OUT, exist_ok=True)
for w in WEIGHTS:
    vf = TTFont(SRC)
    inst = instancer.instantiateVariableFont(vf, {'wght': w, 'ELGR': 1, 'ELSH': 2})
    # сначала обрезаем до нужных символов — так склейка контуров идёт быстро
    opts = subset.Options()
    opts.name_IDs = ['*']
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(inst)
    decompose_all(inst)
    removeOverlaps(inst)
    path = os.path.join(OUT, f'handjet-{w}.woff2')
    inst.flavor = 'woff2'
    inst.save(path)
    print(path, os.path.getsize(path), 'bytes', flush=True)
