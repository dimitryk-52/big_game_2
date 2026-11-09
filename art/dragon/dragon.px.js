// Дракон джа-одори (Нагасаки): голова, кусок туловища, хвост, жемчужина. Смотрит вправо.
// Сборка: node ~/.claude/skills/pxl-pixel-art/bin/pxl.js build art/dragon/dragon.px.js
// → скопировать out/sprites/{head,body,tail,pearl}.png в src/img/dragon/.
//
// Масштаб — как у street.png: игра рисует голову высотой 30, туловище 16, хвост 18, жемчужину 12
// «пикселей мира» (src/tv/DragonTv.tsx), поэтому спрайты ровно такой высоты — без растяжения.
// Туловище: игра кладёт куски с шагом 7 вправо, каждый следующий поверх. Видна левая семёрка
// пикселей каждого куска, поэтому рисунок туловища повторяется с периодом 7 и не имеет контура
// на левом/правом срезе (иначе дракон в полоску). Шея головы — строки 11…26, как туловище.

pal({
  k: "#140c1c",
  t: "#0c4a3e", T: "#13705a", q: "#25a07a", Q: "#5fd0a0",   // изумрудная чешуя
  Y: "#a8641c", y: "#e0a030", l: "#ffd860",                 // золото: брюхо, гребень
  R: "#8e1a26", r: "#d8343a", s: "#ff7a5a",                 // грива и плавники
  w: "#fff4dc", W: "#c8bca0",                               // зубы, усы, борода
  e: "#ffe040", m: "#4a0c18", p: "#e05870",                 // глаз, пасть
  o: "#f0dca0", O: "#b09060",                               // рога
})

/** контур: прозрачный пиксель рядом с непрозрачным → k; skip(x, y) — где не обводить (срезы) */
const ol = (skip = () => false) => (c) => {
  const add = []
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      if (!c.is(x, y, ".") || skip(x, y)) continue
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const X = x + dx, Y = y + dy
        return X >= 0 && Y >= 0 && X < c.w && Y < c.h && !c.is(X, Y, ".")
      })
      if (n) add.push([x, y])
    }
  for (const [x, y] of add) c.px(x, y, "k")
}

sprite("head", { w: 44, h: 30 },
  layer("art", { x: 1, y: 1 }, `
    ...s........O.....O.......................
    ..rs.......oO....oO.......................
    .rrs..s...oO....oO........................
    rrss.rs...oOo..oO.........................
    .rrsrrs....oOoooO.........................
    ..rrrss.r..ooOoO..........................
    srrrsrrrs..ooOo...........................
    .rrrsrrrTTqqqqqqqqqTT.....................
    srrrrrTqqQQQqqqqqqqqqT..lyl...............
    .rrrrTqqQqqqqqqqqlyyyqqTTTTTTTTTTT........
    srrrTqqqqqqqqqqqkkkkqqqqqqqqqqqqqqTTT.....
    .rrrTqqqqTqqqqqqkeekqqqqqqqqqqqqqqqqqTT...
    srrTqqqqqTqqqqqqTkkqqqqqqQQQQqqqqqqqkkqT..
    .rrTTqqqqqTqqqqqqqqqqqqqqqqqqqqqqqqqqqqqT.
    srrTTTqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqT..
    .rrTTTTqqqqqqqqqqqqTTTTTTTTTTTTTTTTTTTT...
    srrTTTTTqqqqqqqqqTyyyyyyyyyyyyyyyyyyyy....
    .rrTTTTTTqqqqqqqTwwmwwmwwmwwmwwmwwmwwk....
    srrTTTTTTTqqqqqTmmmmmmmmmmmmmmmmmmmm......
    .rrTTTTTTTTqqqTmmppppppppppppppppm........
    srrTTTTTTTTTTTTTmwwmwwmwwmwwmwwmk.........
    .rryyyyTTTTTTTTTTyyyyyyyyyyyyyyT..........
    srryylyyyyTTTTTTyyyyyyyyyyyyyTWw..........
    .rrYyyylyyyyyyyyyyyyyYYYYYTTwWw...........
    srrYYyyyylyyyyyyyyYYYY.....wWw............
    .rrYYYyyyyylyyyyYYY.......wW..............
    ..rYYYYYYYYYYYYYY.........W...............
    ...r......................................`,
    // длинный ус от ноздри назад над мордой
    line(37, 9, 34, 5, "w"), line(34, 5, 28, 2, "w"), line(28, 2, 23, 3, "W")),
  ol(),
)

// кусок туловища 21×16, период рисунка 7: красный плавник, золотой шип, чешуя дугами, брюхо
sprite("body", { w: 21, h: 16 },
  rect(0, 0, 21, 16, "_"),
  rect(0, 3, 21, 1, "k"), rect(0, 15, 21, 1, "k"),
  rect(0, 4, 21, 8, "q"),
  rect(0, 11, 21, 1, "T"),
  rect(0, 12, 21, 3, "y"),
  (c) => {
    for (let x0 = 0; x0 < 21; x0 += 7) {
      // гребень: шип золотой, между шипами красная перепонка
      c.px(x0 + 1, 0, "k"); c.px(x0 + 1, 1, "l"); c.px(x0, 1, "k"); c.px(x0 + 2, 1, "k")
      c.hline(x0, 2, 7, "r"); c.px(x0 + 1, 2, "y"); c.px(x0 + 4, 2, "s"); c.px(x0 + 6, 1, "k"); c.px(x0 + 5, 1, "k")
      c.px(x0 + 3, 1, "k"); c.px(x0 + 4, 1, "r")
      // чешуя: два ряда дуг со сдвигом в полпериода
      c.hline(x0, 7, 5, "T"); c.px(x0 + 5, 6, "T"); c.px(x0 + 1, 5, "Q"); c.px(x0 + 2, 5, "Q")
      c.hline(x0 + 3, 10, 5, "T"); c.px(x0 + 2, 9, "T"); c.px(x0 + 4, 8, "Q"); c.px(x0 + 5, 8, "Q")
      c.px(x0 + 6, 4, "T")
      // пластины брюха
      c.vline(x0 + 6, 12, 3, "Y"); c.px(x0 + 1, 12, "l"); c.px(x0 + 2, 12, "l")
    }
  },
)

// хвост 30×18: справа ровный срез (без контура), плавник-кисть уходит влево
sprite("tail", { w: 30, h: 18 },
  layer("art", { x: 1, y: 1 }, `
    rr..........................
    rsrr....................TTTT
    .rssrr...............TTTqqqq
    ..rsssrr..........TTTqqqQqqq
    ...rrssrr......TTTqqqqqqqqqq
    rr..rrsssrr.TTTqqqTqqqqqTqqq
    rsrrrssssrTTqqqqTqqqqqTqqqqq
    .rsssssrrTTqqqqqqqqqqqqqqqqq
    rsrrrssrr.TTTTyyyyyyyyyyyyyy
    rr..rrsrr....YYyylyyyyyylyyy
    ...rrssr.......YYYyyyyyyyyyy
    ..rssrr...........YYYYYYYYYY
    .rsrr.......................
    rr..........................
    ............................`,
  ),
  (c) => { for (let y = 0; y < c.h; y++) if (!c.is(28, y, ".")) c.px(29, y, c.key(28, y)) },
  ol((x) => x === 29),
)

sprite("pearl", { w: 12, h: 12 },
  layer("art", { x: 1, y: 1 }, `
    ...yyyy...
    ..yllllyy.
    .ylwwllyyY
    .ylwllllyY
    yllwlllyyY
    ylllllyyyY
    .yylllyyY.
    .yyyyyyyY.
    ..YYYYYY..
    ...YYYY...`),
  ol(),
)
