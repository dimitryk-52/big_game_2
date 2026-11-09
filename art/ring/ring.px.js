// Фон призового кольца (src/games/ring.ts): квадрат 200×200 под колесом. Колесо с ободом
// (радиус 97 от центра) код рисует поверх, так что от картинки видны только углы.
// Сборка: node ~/.claude/skills/pxl-pixel-art/bin/pxl.js build art/ring/ring.px.js
// → out/scenes/ring_bg.png в src/img/ring/.

pal({
  k: "#0c0a1c", a: "#161236", b: "#20184a", c: "#2c1f5e",     // индиго
  y: "#8a5a10", Y: "#c98a12", l: "#ffd23f", L: "#fff0a0",     // золото
  r: "#8c1f3a", R: "#d83a4a", o: "#ff8a6a", w: "#fff4dc",     // фонарики
})
ramps("kabc", "yYlL", "rRo")

sprite("_lantern", { w: 9, h: 13 },
  vline(4, 0, 2, "Y"), rect(2, 2, 5, 1, "k"), rect(2, 11, 5, 1, "k"),
  ellipse(4, 6.5, 4, 4, "R"), clip([0, 3, 3, 8], ellipse(4, 6.5, 4, 4, "o")), clip([6, 3, 3, 8], ellipse(4, 6.5, 4, 4, "r")),
  hline(1, 5, 7, "r"), hline(1, 8, 7, "r"), px(4, 6, "l"), px(4, 7, "l"),
  vline(4, 12, 1, "l"),
)

scene("ring_bg", { w: 200, h: 200, bg: "b" },
  // волны сэйгайха: полукольца рядами со сдвигом
  (c) => {
    for (let row = 0; row < 18; row++) {
      const y = row * 12, off = row % 2 ? 8 : 0
      for (let x = -16 + off; x < 216; x += 16) {
        c.circ(x, y + 8, 8, "a"); c.ring(x, y + 8, 8, "c"); c.ring(x, y + 8, 5, "c"); c.ring(x, y + 8, 2, "a")
      }
    }
  },
  // тёмная виньетка к центру — колесо читается чище
  layer("dim", { shade: true }, circ(100, 100, 104, "k")),
  // золотая рамка с уголками-скобами
  rect(0, 0, 200, 3, "Y"), rect(0, 197, 200, 3, "y"), rect(0, 0, 3, 200, "Y"), rect(197, 0, 3, 200, "y"),
  rect(0, 0, 200, 1, "l"), rect(0, 0, 1, 200, "l"),
  (c) => {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const ox = sx > 0 ? 6 : 193, oy = sy > 0 ? 6 : 193
      for (let k = 0; k < 18; k++) { c.px(ox + sx * k, oy, "l"); c.px(ox, oy + sy * k, "l") }
      for (let k = 0; k < 10; k++) { c.px(ox + sx * (3 + k), oy + sy * 3, "Y"); c.px(ox + sx * 3, oy + sy * (3 + k), "Y") }
      c.rect(ox + sx * 5 - (sx < 0 ? 2 : 0), oy + sy * 5 - (sy < 0 ? 2 : 0), 3, 3, "R")
    }
  },
  stamp("_lantern", 22, 8), stamp("_lantern", 169, 8),
  stamp("_lantern", 8, 176, { flip: "y" }), stamp("_lantern", 183, 176, { flip: "y" }),
)
