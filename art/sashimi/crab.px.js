// Нога камчатского краба для «Сашими»: лежит горизонтально, основание слева, острый кончик справа.
// Три членика с тонкими суставами, шипы по спинке. Ширина 144 — как рыба на холсте (без перспективы).
// Сборка: node ~/.claude/skills/pxl-pixel-art/bin/pxl.js build art/sashimi/crab.px.js
// потом python scripts/sashimi-art.py (положит crab_px.png и посчитает профиль веса).

pal({
  k: "#1a0c10",
  R: "#7a1a18", r: "#b02a20", q: "#d84a30", Q: "#f07a50",   // панцирь
  b: "#f2b090", w: "#fff0e0",                               // светлое брюшко, шипы
})

// членики: [начало, конец, толщина у начала, у конца]; между ними суставы
const SEG = [[1, 50, 17, 15], [55, 100, 13, 11], [105, 142, 10, 1]]
const CY = 11

const segAt = (x) => SEG.find(([a, b]) => x >= a && x <= b)
const half = (x) => {
  const s = segAt(x)
  if (!s) return 3
  const [a, b, h0, h1] = s, u = (x - a) / (b - a)
  const bulge = s === SEG[2] ? Math.sin(Math.min(1, u * 3) * Math.PI / 2) * 2 * (1 - u) : Math.sin(u * Math.PI) * 2.5
  return (h0 + (h1 - h0) * u) / 2 + bulge - (u < 0.04 ? 1.5 : 0)
}

sprite("crab", { w: 144, h: 24 },
  (c) => {
    for (let x = 1; x < 143; x++) {
      const h = half(x), top = Math.round(CY - h), bot = Math.round(CY + h * 0.95)
      const joint = !segAt(x)
      for (let y = top; y <= bot; y++) {
        const v = (y - top) / Math.max(1, bot - top)
        let col = v < 0.18 ? "Q" : v < 0.5 ? "q" : v < 0.75 ? "r" : v < 0.88 ? "b" : "w"
        if (joint) col = v < 0.5 ? "R" : "b"
        c.px(x, y, col)
      }
    }
    // шипы по спинке: светлый кончик, тёмное основание
    for (let x = 5; x < 136; x += 6) {
      const s = segAt(x)
      if (!s || x < s[0] + 3 || x > s[1] - 3) continue
      const top = Math.round(CY - half(x))
      c.px(x, top - 1, "w"); c.px(x, top, "R"); c.px(x + 1, top, "R")
      c.px(x + 2, top + 4, "r")
    }
    // красные пятнышки вдоль бока
    for (let x = 8; x < 128; x += 9) if (segAt(x)) c.px(x, CY + 1, "R")
  },
  (c) => {
    const add = []
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
      if (!c.is(x, y, ".")) continue
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !c.is(x + dx, y + dy, ".") && x + dx >= 0 && y + dy >= 0 && x + dx < c.w && y + dy < c.h)) add.push([x, y])
    }
    for (const [x, y] of add) c.px(x, y, "k")
  },
)
