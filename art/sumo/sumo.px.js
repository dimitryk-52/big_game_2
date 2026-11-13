// Финальное сумо: зал с дохё, тела сумоистов (сбоку — смотрит вправо, и анфас) и фронтальные головы/причёски/шапки.
// Тела и головы — на холстах под сборку в src/shared/sprites.ts: тело 24×30 (строки 15+), голова 16×24 как у обычных частей.
// Цвета-маркеры те же, что в art/chars/chars.px.js: s/S кожа, h/H волосы, t/T — цвет игрока (маваси), c/C шапка.
pal({
  s: "#f2c49b", S: "#c98b6b", h: "#7a4630", H: "#4e2a1e", t: "#e04858", T: "#a02c40", c: "#f0a830", C: "#b87018",
  k: "#1a1020", m: "#e8807a", w: "#ffffff", W: "#c8c8d8", y: "#ffd23f", Y: "#c89020", a: "#e8c878", A: "#b8964c", r: "#d83030",
});
const NL = String.fromCharCode(10);
const W16 = { w: 16, h: 24 };
const G = (y, ...rows) => grid(0, y, rows.join(NL));
// зеркалим левую половину (8 → 16)
const M = (rows) => rows.map((r) => r + [...r].reverse().join(""));
const GM = (y, ...rows) => G(y, ...M(rows));

// ── тела ──
sprite("sumo_side", { w: 24, h: 30 }, grid(0, 15, [
  "........sssssssss.......",
  "......sssssssssssss.....",
  ".....ssssssssssssssss...",
  "....ssSsssssssssssSssss.",
  "....ssSssssssssssssS.sss",
  "....ssSsssssssssssS.....",
  "....sssSssssssssssS.....",
  "....sssstttttttsssS.....",
  "....ttttttttttttttT.....",
  "....tttttttTTtttttT.....",
  ".....ssssttTTttSSSS.....",
  "....sssss..TT..SSSSS....",
  "...ssss.........SSSS....",
  "...sss...........SSS....",
  "..sssss.........SSSSS...",
].join(NL)));
sprite("sumo_front", { w: 24, h: 30 }, grid(0, 15, M([
  "......ssssss",
  "...sssssssss",
  "..ssssssssss",
  ".ssssSssssss",
  ".sss.Sssssss",
  ".sss.Sssssss",
  ".ss..sSsssss",
  ".....sssssss",
  ".....ttttttt",
  ".....ttttttt",
  "....ssssTTTT",
  "...sssss.TTT",
  "...ssss..TTT",
  "...sss......",
  "..sssss.....",
]).join(NL)));

// ── голова анфас ──
sprite("headf", W16, GM(5,
  ".....sss",
  "....ssss",
  "...sssss",
  "...sssss",
  "...sssss",
  "...sskss",
  "...sskss",
  "...smsss",
  "....ssss",
  ".....sss",
));

// ── причёски анфас ──
const SHORT = [
  ".....hhh",
  "....hhhh",
  "...hhhhh",
  "..hhhhhh",
  "..hhhhhh",
  "..Hhh.hh",
  "..Hh....",
  "..H.....",
];
const BOB = [
  ".....hhh",
  "....hhhh",
  "...hhhhh",
  "..hhhhhh",
  "..hhhhhh",
  "..hhhhhh",
  "..hh....",
  "..hh....",
  "..Hh....",
  "..Hh....",
  "..HH....",
];
sprite("hairf_short", W16, GM(3, ...SHORT));
sprite("hairf_spiky", W16, GM(1,
  "...h..h.",
  "..hh.hhh",
  "..hhhhhh",
  ".hhhhhhh",
  ".hhhhhhh",
  "..hhhhhh",
  "..Hhhhhh",
  "..Hh.h.h",
  "..H.....",
));
sprite("hairf_bob", W16, GM(3, ...BOB));
sprite("hairf_long", W16, GM(3, ...BOB, "..HH....", "..HH...."));
sprite("hairbf_long", W16, GM(13,
  ".HHH....",
  ".HHH....",
  ".HHHH...",
  ".HHHH...",
  ".HHHH...",
  "..HHH...",
  "..HH....",
));
sprite("hairf_pony", W16, GM(3, ...SHORT), px(13, 6, "r"));
sprite("hairbf_pony", W16, G(4,
  ".............hh.",
  ".............Hhh",
  "..............hh",
  "..............Hh",
  "..............Hh",
  "..............H.",
));
sprite("hairf_topknot", W16, GM(0,
  "......hh",
  ".....hhh",
  "......Hh",
), GM(3, ...SHORT));
sprite("hairf_buns", W16, GM(0,
  "..hhh...",
  ".hhhhh..",
  ".hhHhh..",
), GM(3, ...BOB));
sprite("hairf_afro", W16, GM(0,
  ".....hhh",
  "...hhhhh",
  "..hhhhhh",
  ".hhhhhhh",
  ".hhhhhhh",
  ".hhhhhhh",
  ".hhhhhhh",
  ".hhhhhhh",
  ".Hhh..hh",
  ".Hh.....",
  ".Hh.....",
  ".HH.....",
  "..H.....",
));
sprite("hairf_none", W16);

// ── шапки анфас ──
sprite("hatf_none", W16);
sprite("hatf_cap", W16, GM(2,
  ".....ccc",
  "....cccc",
  "...ccccw",
  "..CCCCCC",
));
sprite("hatf_band", W16, GM(7, "..cccccr"));
sprite("hatf_kasa", W16, GM(0,
  ".......a",
  "......aa",
  ".....aaa",
  "...aaaaa",
  ".aaaaaaa",
  "AAAAAAAA",
));
sprite("hatf_cat", W16, GM(1,
  "...c....",
  "...cc...",
  "...cmc..",
));
sprite("hatf_fox", W16, G(2,
  ".r...r..........",
  ".ww.ww..........",
  ".wwwww..........",
  ".wrwrw..........",
  ".wwwww..........",
  "..wkw...........",
));
sprite("hatf_beanie", W16, GM(1,
  ".......c",
  ".....ccc",
  "....cccc",
  "...ccccc",
  "..cccccc",
  "..CCCCCC",
));
sprite("hatf_oni", W16, GM(1,
  "....w...",
  "....wW..",
  "....WW..",
));
sprite("hatf_crown", W16, GM(1,
  ".....y.y",
  ".....yyy",
  ".....yry",
  ".....YYY",
));
sprite("hatf_ninja", W16, GM(3,
  ".....ccc",
  "....cccc",
  "...ccccc",
  "..cccccc",
  "..cccccc",
  "..cccccc",
  "..cccccc",
  "..Cc....",
  "..Cc....",
  "..Cccccc",
  "...Ccccc",
  "....Cccc",
));

// ── зал: 320×180, дохё в центре внизу ──
pal({
  1: "#1a1226", 2: "#2a1c34", 3: "#3c2840", 4: "#5a3a44", 5: "#7a4e3c", 6: "#a06c44", 7: "#c89058", 8: "#e0b47c",
  9: "#f0d8a8", p: "#6a2c4c", P: "#8c3c58", v: "#4a2a6a", V: "#6c3c94", g: "#d8b040", q: "#f4ecd8", Q: "#c8bc9c", z: "#0e0a16",
});
scene("sumo_hall", { w: 320, h: 180, bg: "1" },
  // дальняя стена и ряды зрителей
  rect(0, 0, 320, 70, "2"),
  (c) => {
    for (let row = 0; row < 4; row++) {
      const y = 44 + row * 9;
      c.rect(0, y + 5, 320, 4, row % 2 ? "3" : "2");
      for (let x = (row % 2) * 5; x < 320; x += 10) {
        const col = ["p", "P", "v", "V", "4", "5"][(x * 7 + row * 13) % 6];
        c.rect(x + 1, y + 2, 7, 5, col);   // плечи
        c.rect(x + 3, y - 1, 3, 3, "8");   // голова
      }
    }
  },
  // подвесная крыша цурияне с кистями
  poly([80, 22, 160, 4, 240, 22], "5"), poly([86, 22, 160, 8, 234, 22], "6"),
  rect(76, 22, 168, 5, "4"), rect(76, 27, 168, 3, "v"), rect(76, 30, 168, 1, "g"),
  rect(84, 31, 3, 9, "r"), rect(233, 31, 3, 9, "q"), rect(118, 31, 3, 7, "V"), rect(199, 31, 3, 7, "3"),
  vline(100, 0, 22, "3"), vline(220, 0, 22, "3"),
  // знамёна нобори по бокам
  rect(8, 6, 12, 40, "q"), rect(8, 6, 12, 3, "r"), rect(13, 12, 2, 28, "1"),
  rect(300, 6, 12, 40, "q"), rect(300, 6, 12, 3, "V"), rect(305, 12, 2, 28, "1"),
  rect(28, 10, 10, 34, "P"), rect(32, 15, 2, 24, "q"), rect(282, 10, 10, 34, "v"), rect(286, 15, 2, 24, "q"),
  // пол зала
  rect(0, 80, 320, 100, "3"),
  (c) => { for (let x = 0; x < 320; x += 32) c.vline(x, 80, 100, "2"); },
  // помост дохё: глиняная трапеция и круг
  poly([24, 176, 44, 92, 276, 92, 296, 176], "6"),
  poly([24, 176, 296, 176, 300, 180, 20, 180], "5"),
  ellipse(160, 132, 118, 40, "7"),
  ellipse(160, 132, 106, 35, "9", true), ellipse(160, 132, 105, 34, "Q", true), ellipse(160, 132, 104, 34, "q", true),
  ellipse(160, 132, 102, 33, "8"),
  // стартовые линии сикири-сэн
  rect(146, 128, 3, 9, "q"), rect(171, 128, 3, 9, "q"),
);
