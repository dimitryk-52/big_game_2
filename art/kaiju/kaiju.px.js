// «Годзилла» (Токио): кайдзю, дома, руины, снаряд. Клетка города 24×18, дома выше клетки и перекрывают ряд позади.
pal({
  k: "#14121c", g: "#4a6a58", G: "#2c4238", l: "#a8c090", L: "#7c9668", p: "#c8f0e0", P: "#7cc8b8",
  w: "#ffffff", r: "#d83a3a", t: "#fff6e0",
  a: "#8a94b0", A: "#5c6688", b: "#d8c8a0", B: "#a89468", c: "#c85a50", C: "#8c3a38", d: "#6a7a8c", D: "#465468",
  y: "#ffe07a", n: "#2a3350", o: "#f0a030", s: "#9a9aa4", S: "#6c6c78", e: "#4a4a54",
})

// кайдзю: графитовое тело, прямая стойка, светящиеся бирюзовые шипы от затылка до хвоста; смотрит вправо
pal({ g: "#4a5a60", G: "#2e3a40", l: "#78b8b4", p: "#48f4f4", P: "#2a8c90", E: "#48f4f4" })
const ZILLA = [
  ".........................gggggg....",
  "..................p.....gggggggg...",
  "..................pp...ggggggEgggg.",
  "...............p..pPp..gggggggggggg",
  "...............pp.pPp.gggggglllllll",
  "...............pPp.pP.gggggGtttttt.",
  "............p..pPPp.pggggggllll....",
  "............pp.pPPp.gggggggg.......",
  "............pPp.pPpggggggg.........",
  ".........p..pPPp.pggggggggg........",
  ".........pp.pPPp.ggggggggggggg.....",
  ".........pPp.pPpgggggglllGggggt....",
  ".........pPPp.pgggggglllllgt.......",
  "......p..pPPp.Ggggggglllllg........",
  "......pp..pPpGGggggggllllllg.......",
  "......pPp.pPGGgggggggllllllg.......",
  ".......pPp.GGggggggggglllllg.......",
  ".......pPpGGgggggggggggllgggg......",
]
sprite("zilla", { w: 35, h: 25, outline: "k" }, grid(0, 0, [...ZILLA,
  "......gg.pGGGgggggggggggggggg......",
  ".....gGGg.GGgggggggGgggggGggggg....",
  "..g..gGGGgGGggggggGG.gggggGgggg....",
  ".gg...gGGGGGgggGGG...GgggggGggg....",
  "gGg....gGGGGGGG......GgggggGgggg...",
  "gGGggggggGGG........ttGgggttggggtt.",
  ".gGGGGGGgg.........................",
].join(String.fromCharCode(10))))
sprite("zilla_w", { w: 35, h: 25, outline: "k" }, grid(0, 0, [...ZILLA,
  "......gg.pGGGgggggggggggggggg......",
  ".....gGGg.GGggggggggGgggggGgggg....",
  "..g..gGGGgGGgggggggGGGgggggGggg....",
  ".gg...gGGGGGgggGGGggggGGgggttGgtt..",
  "gGg....gGGGGGGG...GggggGgtt........",
  "gGGggggggGGG.....ttGgggtt..........",
  ".gGGGGGGgg.........................",
].join(String.fromCharCode(10))))

// дома: ширина 22, низ — на линии клетки
function tower(name, h, wall, dark, extra = []) {
  sprite(name, { w: 22, h, outline: "k" },
    rect(1, 2, 20, h - 2, wall), rect(17, 2, 4, h - 2, dark), rect(0, 0, 22, 3, dark),
    (c) => { for (let y = 6; y < h - 6; y += 5) for (let x = 3; x < 16; x += 4) c.rect(x, y, 2, 3, (x + y) % 3 === 0 ? "y" : "n") },
    rect(8, h - 6, 5, 6, "n"), ...extra)
}
tower("house_a", 34, "a", "A", [rect(9, -0, 1, 1, "r")])
tower("house_b", 26, "b", "B")
tower("house_c", 30, "d", "D", [rect(3, 3, 12, 1, "y")])
sprite("house_d", { w: 22, h: 22, outline: "k" },
  rect(1, 8, 20, 14, "c"), rect(17, 8, 4, 14, "C"), poly([0, 8, 11, 0, 22, 8], "e"), rect(3, 10, 12, 4, "t"), rect(4, 11, 2, 2, "r"), rect(8, 11, 2, 2, "r"), rect(12, 11, 2, 2, "r"),
  rect(8, 16, 5, 6, "n"), rect(3, 16, 3, 3, "y"), rect(14, 16, 2, 3, "y"))

// руины
sprite("rubble", { outline: "k" }, `
  ......s...........S...
  ..S..sss....s....SSs..
  .SSssssSs..sSs..sSSSs.
  sSSSsssSSssSSSssSSeSSs
  eSSeSSsSSeSSSeSSSeeSSe`)

// снаряд падает носом вниз
sprite("shell", { outline: "k" }, `
  .rr.
  .ss.
  ssss
  sSSs
  sSSs
  .SS.
  .oo.`)
