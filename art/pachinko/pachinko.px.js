// Пачинко: доска целиком (фон) и шарик. Код (src/games/pachinko.ts) поверх рисует хромовую дугу
// (центр 150,160, радиус 147), огоньки, окно барабанов (103…197 × 155…215), латунные штырьки и карманы.
// Поэтому поле внутри дуги — тёмное и спокойное, иначе штырьки и шарики потеряются.
// Сборка: node ~/.claude/skills/pxl-pixel-art/bin/pxl.js build art/pachinko/pachinko.px.js
// → out/scenes/pachinko_bg.png и out/sprites/ball.png в src/img/pachinko/.

pal({
  k: "#0a0714",
  a: "#110c2a", b: "#191240", c: "#24165a", d: "#33196a", e: "#481e72", f: "#622872",  // небо
  g: "#7a3070", h: "#a04070",                                                          // заря у горизонта
  s: "#9a3466", S: "#c24a62", T: "#e0705c",                                            // солнце (тусклое: на нём латунные штырьки)
  m: "#1c1438", M: "#2a1f50", n: "#3c2c66", N: "#e8e0ff",                              // Фудзи, снег
  w: "#0e2c44", W: "#164060", v: "#2a6888", V: "#7ab8c8",                              // волны
  r: "#5a0c1c", R: "#8e1424", q: "#c42634", Q: "#e85048",                              // лак рамы
  y: "#8a5a10", Y: "#c8901c", l: "#ffd040", L: "#fff0a0",                              // золото
  p: "#ff9ab8", P: "#ffd0e0",                                                          // сакура
  x: "#4a4f63", X: "#aab1c4", z: "#dfe3ee", Z: "#ffffff",                              // сталь шарика
})
ramps("kabcdefgh", "sST", "mMnN", "wWvV", "rRqQ", "yYlL", "pP", "xXzZ")

const CX = 150, CY = 160, RAIL = 147
const inside = (x, y) => (y >= CY ? x > CX - RAIL && x < CX + RAIL : Math.hypot(x - CX, y - CY) < RAIL)

// цветок сакуры 5×5
sprite("_sakura", "  .P.\n  PpP\n  .P.")

scene("pachinko_bg", { w: 300, h: 480, bg: "a" },
  // небо: полосы сверху вниз, к низу — заря
  grad(0, 0, 300, 420, "abcdefgh", "v", 0.6),
  // солнце за барабанами и лучи
  layer("rays", { light: true, density: 0.5 }, (c) => {
    for (let k = 0; k < 16; k += 2) {
      const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2
      c.poly([CX, 185, CX + Math.cos(a0) * 280, 185 + Math.sin(a0) * 280, CX + Math.cos(a1) * 280, 185 + Math.sin(a1) * 280], "k")
    }
  }),
  circ(CX, 185, 62, "s"), circ(CX, 185, 56, "S"), circ(CX, 185, 50, "T"),
  // звёзды только наверху
  (c) => { const r = c.rng(3); for (let i = 0; i < 46; i++) { const x = Math.floor(r() * 300), y = 20 + Math.floor(r() * 110); if (c.is(x, y, "abcd")) c.px(x, y, r() < 0.25 ? "l" : "n") } },
  // облака: золотые полосы-завитки, как на ширмах
  (c) => {
    for (const [x, y, w] of [[40, 120, 46], [214, 104, 50], [26, 232, 36], [236, 238, 40]]) {
      c.rect(x, y, w, 4, "e"); c.rect(x + 6, y - 3, w - 14, 3, "e"); c.hline(x, y, w, "Y"); c.hline(x + 6, y - 3, w - 14, "Y")
      c.px(x - 1, y + 1, "Y"); c.px(x + w, y + 1, "Y")
    }
  },
  // Фудзи: тёмный силуэт, снежная шапка
  poly([0, 360, 96, 300, 130, 268, 170, 268, 204, 300, 300, 360, 300, 420, 0, 420], "m"),
  poly([60, 336, 110, 296, 130, 280, 150, 286, 170, 280, 190, 296, 240, 336, 300, 380, 300, 420, 0, 420, 0, 380], "M"),
  poly([130, 268, 170, 268, 184, 282, 174, 280, 164, 288, 152, 280, 140, 290, 130, 280, 116, 282], "N"),
  // волны внизу: гребни дугами
  rect(0, 404, 300, 76, "w"),
  (c) => {
    for (let row = 0; row < 5; row++) {
      const y = 410 + row * 14, off = row % 2 ? 12 : 0
      for (let x = -24 + off; x < 300; x += 24) {
        c.ring(x + 12, y + 10, 10, "W"); c.ring(x + 12, y + 10, 7, "v")
        c.px(x + 4, y + 4, "V"); c.px(x + 5, y + 3, "V"); c.px(x + 7, y + 2, "V")
      }
      c.rect(0, y + 10, 300, 14, "w")
    }
    c.rect(0, 410, 300, 1, "v")
  },
  // рама кабинета: всё, что снаружи дуги — красный лак с золотой кромкой и сакурой
  (c) => {
    for (let y = 0; y < 480; y++) for (let x = 0; x < 300; x++) {
      if (inside(x, y)) continue
      const d = y >= CY ? Math.min(Math.abs(x - (CX - RAIL)), Math.abs(x - (CX + RAIL))) : Math.hypot(x - CX, y - CY) - RAIL
      c.px(x, y, d < 2 ? "Y" : d < 3 ? "y" : (x + y) % 9 === 0 ? "R" : "q")
    }
  },
  rect(0, 0, 300, 2, "l"), rect(0, 0, 2, 480, "l"), rect(298, 0, 2, 480, "y"),
  // золотые уголки-веера вверху
  (c) => {
    for (const [cx, fl] of [[0, 1], [300, -1]]) for (let r = 6; r < 40; r += 6) for (let a = 0; a <= Math.PI / 2; a += 0.02) {
      const x = Math.round(cx + fl * Math.cos(a) * r), y = Math.round(Math.sin(a) * r)
      if (!inside(x, y)) c.px(x, y, r % 12 ? "Y" : "l")
    }
  },
  scatter("_sakura", 0, 0, 300, 160, 40, { clip: true, on: "qR" }),
)

// шарик 9×9: серебро, блик слева сверху, тёмный обод
sprite("ball", `
  ..xxxxx..
  .xzZzXXx.
  xzZZzXXXx
  xzZzXXXXx
  xXzXXXXXx
  xXXXXXXxx
  xXXXzzXxx
  .xxXXXxx.
  ..xxxxx..`)
