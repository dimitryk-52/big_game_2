// Модульные персонажи BIG GAME 2: все части на одном холсте 16×24, смотрят вправо (влево — зеркалим в игре).
// Цвета-маркеры перекрашиваются в игре (src/shared/sprites.ts), остальные — фиксированные.
// Контур и тень рисует игра, здесь их нет.
pal({
  s: "#f2c49b", S: "#c98b6b",            // кожа (маркер)
  h: "#7a4630", H: "#4e2a1e",            // волосы (маркер)
  t: "#e04858", T: "#a02c40",            // верх (маркер) = цвет игрока
  b: "#3858c0", B: "#24387c",            // низ (маркер)
  o: "#1a1a30",                          // обувь (маркер → тёмный тон низа)
  c: "#f0a830", C: "#b87018",            // шапка (маркер)
  k: "#1a1020", m: "#e8807a", w: "#ffffff", W: "#c8c8d8",
  y: "#ffd23f", Y: "#c89020", a: "#e8c878", A: "#b8964c",
  r: "#d83030", R: "#8c1c1c", n: "#2a2a3a", N: "#14141e",
});
const W16 = { w: 16, h: 24 };
const G = (y, ...rows) => grid(0, y, rows.join("\n"));

// ── голова (кожа, глаза) ──
sprite("head", W16, G(5,
  ".....sssssss....",
  "....sssssssss...",
  "...sssssssssss..",
  "...sssssssssss..",
  "...sssssssssss..",
  "...ssSssksskss..",
  "...ssSssksskss..",
  "...ssssmssssms..",
  "....sssssssss...",
  ".....sssssss....",
));

// ── причёски: hair_* поверх головы, hairb_* — за телом (если есть) ──
const SHORT = [
  ".....hhhhhh.....",
  "....hhhhhhhhh...",
  "...hhhhhhhhhhh..",
  "..hhhhhhhhhhhhh.",
  "..Hhhhhhhhhhhhh.",
  "..Hhhhhhhhh.hh..",
  "..HHhhh.........",
  "..HHh...........",
  "..HH............",
  "...H............",
];
const BOB = [
  ".....hhhhhh.....",
  "....hhhhhhhhh...",
  "...hhhhhhhhhhh..",
  "..hhhhhhhhhhhhh.",
  "..hhhhhhhhhhhhh.",
  "..Hhhhhhhhhhhhh.",
  "..HHhhhh.....hh.",
  "..HHhh.......hh.",
  "..HHhh.......hh.",
  "..HHHh.......Hh.",
  "..HHH.........H.",
];
sprite("hair_short", W16, G(3, ...SHORT));
sprite("hair_spiky", W16, G(1,
  "......h..h......",
  ".....hh.hh..h...",
  "...hhhhhhhhhh...",
  "..hhhhhhhhhhhhh.",
  ".hhhhhhhhhhhhhh.",
  "..hhhhhhhhhhhhhh",
  ".Hhhhhhhhhhhhh..",
  "..Hhhhhhh.h.hh..",
  "..HHhhh.........",
  "..HHh...........",
  ".HH.............",
  "..H.............",
));
sprite("hair_bob", W16, G(3, ...BOB));
sprite("hair_long", W16, G(3, ...BOB, "..HH.........Hh.", "..HH..........H."));
sprite("hairb_long", W16, G(9,
  "..HH............",
  ".HHH............",
  ".HHH............",
  ".HHH............",
  ".HHHH...........",
  ".HHHH...........",
  ".HHHH...........",
  "..HHH...........",
  "..HHH...........",
  "...H............",
));
sprite("hair_pony", W16, G(3, ...SHORT), px(2, 8, "r"), px(2, 9, "r"));
sprite("hairb_pony", W16, G(5,
  "..H.............",
  ".hH.............",
  "hhH.............",
  "hHH.............",
  "hH..............",
  "hH..............",
  "H...............",
));
sprite("hair_topknot", W16, G(0,
  "......hhhh......",
  ".....hhhhhH.....",
  ".......Hh.......",
), G(3, ...SHORT));
sprite("hair_buns", W16, G(0,
  "...hh.....hhh...",
  "..hhhh...hhhhh..",
  "..hHhh...hhHhh..",
), G(3, ...BOB));
sprite("hair_afro", W16, G(0,
  ".....hhhhhh.....",
  "...hhhhhhhhhh...",
  "..hhhhhhhhhhhh..",
  ".hhhhhhhhhhhhhh.",
  ".hhhhhhhhhhhhhh.",
  ".hhhhhhhhhhhhhh.",
  ".Hhhhhhhhhhhhhh.",
  ".Hhhhhhhhhhhhhhh",
  ".HHhhhhhh..hhhh.",
  ".HHHhhh......hh.",
  ".HHHh.......hhh.",
  "..HHH........hh.",
  "..HH..........h.",
));
sprite("hair_none", W16);

// ── головные уборы (c/C — цвет шапки) ──
sprite("hat_none", W16);
sprite("hat_cap", W16, G(2,
  ".....cccccc.....",
  "....cccccccc....",
  "...ccccccwcccc..",
  "...CCCCCCCCCCCcc",
));
sprite("hat_band", W16, G(7,
  ".Ccccccccccccc..",
  "CC.....r........",
  "C...............",
));
sprite("hat_kasa", W16, G(0,
  ".......aa.......",
  "......aaAa......",
  ".....aaaAaa.....",
  "...aaaaaAaaaa...",
  ".aaaaaaaAaaaaaa.",
  "AAAAAAAAAAAAAAA.",
));
sprite("hat_cat", W16, G(1,
  "...c......c.....",
  "...cc....cmc....",
  "...cmc..cmmc....",
));
sprite("hat_fox", W16, G(2,
  ".r...r..........",
  ".ww.ww..........",
  ".wwwww..........",
  ".wrwrw..........",
  ".wwwww..........",
  "..wkw...........",
));
sprite("hat_beanie", W16, G(1,
  ".......cc.......",
  ".....cccccc.....",
  "....cccccccc....",
  "...ccccccccccc..",
  "..cccccccccccc..",
  "..CCCCCCCCCCCCC.",
));
sprite("hat_oni", W16, G(1,
  "....w.....w.....",
  "....wW...wW.....",
  "....WW...WW.....",
));
sprite("hat_crown", W16, G(1,
  ".....y..y..y....",
  ".....yyyyyyy....",
  ".....yryyyry....",
  ".....YYYYYYY....",
));
sprite("hat_ninja", W16, G(3,
  ".....cccccc.....",
  "....ccccccccc...",
  "...ccccccccccc..",
  "C.ccccccccccccc.",
  "CCCcccccccccccc.",
  "C.CCccc.........",
  "..CCcc..........",
  "..CCc...........",
  "..CCc...........",
  "..CCcccccccccc..",
  "...CCcccccccc...",
  "....CCcccccc....",
));

// ── верх (t/T — цвет игрока) ──
// Персонаж смотрит вправо: ближняя рука (правая у персонажа) — у нас слева, поверх туловища (x4–5,
// край x6); дальняя — за туловищем, видна тёмной кромкой справа (x11). Ось груди в 3/4 — x≈8.
const TOPS_ART = {
  tee: [
    ".....tttttT.....",
    "....ttTtttTT....",
    "....ttTtttTT....",
    "....ssTtttTS....",
    ".....TTTTTT.....",
  ],
  kimono: [
    ".....ttwswT.....",
    "...tttTtwwTT....",
    "...tttTtwtTT....",
    "...TTTyyyyTT....",
    "....sTttttTS....",
  ],
  happi: [
    ".....ttwttT.....",
    "....ttTwttTT....",
    "....ttTwttTT....",
    "....ssTwttTS....",
    ".....wwwwww.....",
  ],
  uniform: [
    ".....TTTTTT.....",
    "....ttTtytTT....",
    "....ttTtttTT....",
    "....ssTtytTS....",
    ".....TTTTTT.....",
  ],
  sailor: [
    ".....tttttT.....",
    "....wwWtrtWW....",
    "....wwWwrwWW....",
    "....ssWwrwWS....",
    ".....TTTTTT.....",
  ],
  hoodie: [
    ".....tttttT.....",
    "....ttTwtwTT....",
    "....ttTwtwTT....",
    "....ssTTTTTS....",
    ".....tttttt.....",
  ],
  armor: [
    "....tttttTT.....",
    "...tttTtttTTT...",
    "....TTTTTTTT....",
    "....ssTtttTS....",
    ".....TTTTTT.....",
  ],
};
for (const [id, rows] of Object.entries(TOPS_ART))
  // капюшон худи лежит за шеей (затылок у нас слева)
  sprite("top_" + id, W16, G(15, ...rows), ...(id === "hoodie" ? [G(14, "....TT..........")] : []));

// ── низ (b/B; o — обувь), *_w — кадр шага; ближняя нога слева и светлее ──
const BOTS = {
  pants: [[".....bbbbbb.....", ".....bbb.BB.....", ".....bb..BB.....", ".....ooo.ooo...."],
          [".....bbbbbb.....", "....bb...BB.....", "...bb.....BB....", "...oo.....ooo..."]],
  shorts: [[".....bbbbbb.....", ".....bb..BB.....", ".....ss..SS.....", ".....ooo.ooo...."],
           [".....bbbbbb.....", "....bb...BB.....", "...ss.....SS....", "...oo.....ooo..."]],
  skirt: [["....bbbbbbbb....", "...bbbbbbbbBB...", ".....ss..SS.....", ".....ooo.ooo...."],
          ["....bbbbbbbb....", "...bbbbbbbbBB...", "....ss...SS.....", "...oo.....ooo..."]],
  hakama: [[".....bbbbbB.....", "....bbbBbbBB....", "....bbbBbbBB....", "....ooo..ooo...."],
           [".....bbbbbB.....", "...bbbbBbbBBB...", "...bbbbBbbbBBB..", "...oo.....ooo..."]],
};
for (const [id, [a, w]] of Object.entries(BOTS)) {
  sprite("bot_" + id, W16, G(20, ...a));
  sprite("bot_" + id + "_w", W16, G(20, ...w));
}

// ── акита-ину (фиксированные цвета), смотрит вправо; 20×13 ≈ 55% роста персонажа ──
// хвост бубликом над спиной, светлые (урадзиро) хвост изнутри, щёки, грудь, живот и лапы
pal({ l: "#f4a456", d: "#dc7a32", D: "#a24e1e", e: "#faead0", E: "#dcc29c" });
const AKITA = [
  "............d..d..",
  "..ldd......dD.dD..",
  ".le.Ed....lddddd..",
  ".dE.d.....lddkdddk",
  "..dd......ddeeeeEE",
  "..dd.....ddddeee..",
  "..dlllllldddeee...",
  "..Ddddddddddeee...",
  "..DDddddddddee....",
  "...DEeeeeeeEde....",
];
sprite("akita", { w: 18, h: 13 }, G(0, ...AKITA,
  "...Dd.Dd...de.dd..",
  "...Dd.Dd...ee.ee..",
  "...ee.ee...ee.ee..",
));
sprite("akita_w", { w: 18, h: 13 }, G(0, ...AKITA,
  "...Dd..Dd.de..dd..",
  "..Dd....Ddee...ee.",
  "..ee....ee.ee..ee.",
));

// ── превью ──
const HAIRS = ["short", "spiky", "bob", "long", "pony", "topknot", "buns", "afro", "none"];
const HATS = ["none", "cap", "band", "kasa", "cat", "fox", "beanie", "oni", "crown", "ninja"];
const TOPN = ["tee", "kimono", "happi", "uniform", "sailor", "hoodie", "armor"];
const BOTN = ["pants", "shorts", "skirt", "hakama"];
const has = (n) => ["long", "pony"].includes(n);
function combo(name, hair, hat, top, bot) {
  sprite(name, { w: 16, h: 24, outline: "N" },
    ...(has(hair) ? [stamp("hairb_" + hair, 0, 0)] : []),
    stamp("bot_" + bot, 0, 0), stamp("top_" + top, 0, 0), stamp("head", 0, 0),
    stamp("hair_" + hair, 0, 0), stamp("hat_" + hat, 0, 0));
}
const P = [];
HAIRS.forEach((h, i) => { combo("pv_hair_" + h, h, "none", TOPN[i % 7], BOTN[i % 4]); P.push("pv_hair_" + h); });
HATS.forEach((h, i) => { combo("pv_hat_" + h, HAIRS[i % 9], h, TOPN[(i + 3) % 7], BOTN[(i + 1) % 4]); P.push("pv_hat_" + h); });
TOPN.forEach((t, i) => combo("pv_top_" + t, HAIRS[i], "none", t, BOTN[i % 4]));
sprite("pv_dog", { w: 40, h: 26, outline: "N" }, stamp("hairb_long", 0, 1), stamp("bot_pants", 0, 1), stamp("top_tee", 0, 1), stamp("head", 0, 1), stamp("hair_short", 0, 1), stamp("akita", 19, 12));
sheet("pv", ["pv_*", "akita", "akita_w"], { cols: 10, pad: 2 });
