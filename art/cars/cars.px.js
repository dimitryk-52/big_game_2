// Машины (вид сбоку, смотрят вправо; холст 32×13, без контура — его и тень добавляет игра, как всем иконкам).
// Сборка: node ~/.claude/skills/pxl-pixel-art/bin/pxl.js build art/cars/cars.px.js, затем
// out/sprites/{car,emb}_*.png → src/img/icons/. Колёса и нижняя кромка кузова общие, кузов — сеткой.
// Цвета — близкие к фирменным: Impreza — WR Blue с золотыми дисками, Note — голубой, Alphard — чёрный,
// Lancer — Rally Red, CX-5 — белый перламутр, Civic — Phoenix Yellow.
pal({ k: "#14121f", w: "#bfe3f5", W: "#6fa4c8", h: "#fff2a8", r: "#e2343c", s: "#dfe4ec", d: "#7d8494", t: "#3a3d4a" })

const CARS = {
  subaru: {
    col: ["#1f4fb4", "#143580", "#4d7fe0"], rim: ["#e8b830", "#a87a14"], x0: 0, x1: 31, wheels: [3, 22],
    body: `
      ................................
      BBBBB......lllllllll............
      .B.B......bwwwwbwwwwWb..........
      .B.B.....bwwwwwbwwwwwWb..BBB....
      lllllllllbbbbbbbbbbbbbbllllllll.
      rbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbh
      bbbbbbbbbbbbbBbbbbbBbbbbbbbbbbbb
      bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
  },
  nissan: {
    col: ["#3fb4e8", "#2580b8", "#8adcff"], x0: 2, x1: 29, wheels: [4, 21],
    body: `
      ................................
      ......lllllllllllll.............
      .....bwwwwbwwwwbwwwWb...........
      ....bwwwwwbwwwwbwwwwWb..........
      ...bbbbbbbbbbbbbbbbbbbbbllll....
      ..rbbbbbbbbbbbbbbbbbbbbbbbbbbh..
      ..bbbbbbbbbbBbbbbbBbbbbbbbbbbb..
      ..bbbbbbbbbbbbbbbbbbbbbbbbbbbb..`,
  },
  toyota: {
    col: ["#2c2e3c", "#191a24", "#565b70"], x0: 0, x1: 31, wheels: [3, 22],
    body: `
      ...lllllllllllllllllllll........
      ..bwwwwbwwwwwwbwwwwwbwwWb.......
      .bbwwwwbwwwwwwbwwwwwbwwwWb......
      .bbwwwwbwwwwwwbwwwwwbwwwwWb.....
      .sssssssssssssssssssssssssslll.
      rbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbh
      rbbbbbbbbbBbbbbbbBbbbbbbbbbbbbss
      bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbss`,
  },
  mitsubishi: {
    col: ["#d8242c", "#96141e", "#ff6058"], rim: ["#f4f6fa", "#aab0bc"], x0: 0, x1: 31, wheels: [3, 22],
    body: `
      BBBBBB..........................
      .B..B.......llllllll............
      .B..B......bwwwwbwwwWb..........
      .B..B.....bwwwwwbwwwwWb.........
      llllllllllbbbbbbbbbbbbbllllllll.
      rbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbh
      rbbbbbbbbbbbbbBbbbbBbbbbbbbbbbkk
      bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
  },
  mazda: {
    col: ["#eef1f5", "#b4bccb", "#ffffff"], clad: true, x0: 1, x1: 30, wheels: [4, 21],
    body: `
      ................................
      .....lllllllllllllll............
      ....bwwwwbwwwwwbwwwwWb..........
      ...bbwwwwbwwwwwbwwwwwWb.........
      ..bbbbbbbbbbbbbbbbbbbbbbllllll..
      .rbbbbbbbbbbbbbbbbbbbbbbbbbbbbh.
      .bbbbbbbbbbBbbbbbBbbbbbbbbbbbbb.
      .bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.`,
  },
  honda: {
    col: ["#f6c820", "#c48a10", "#ffe872"], x0: 2, x1: 29, wheels: [4, 21],
    body: `
      ................................
      ................................
      .......lllllllllll..............
      .....bbwwwwwbwwwwwWb............
      ...bbbwwwwwwbwwwwwwWb...........
      ..rbbbbbbbbbbbbbbbbbbblllllll...
      ..rbbbbbbbbbbbbbBbbbbbbbbbbbbh..
      ..bbbbbbbbbbbbbbbbbbbbbbbbbbbb..`,
  },
}

let n = 0
const KEYS = "0123456789acefgijmnopquvxyzACDEFGHIJ"
for (const [id, c] of Object.entries(CARS)) {
  const [kb, kB, kl, ks, kd] = [0, 1, 2, 3, 4].map(() => KEYS[n++])
  const rim = c.rim ?? ["#dfe4ec", "#7d8494"]
  pal({ [kb]: c.col[0], [kB]: c.col[1], [kl]: c.col[2], [ks]: rim[0], [kd]: rim[1] })
  const wheel = (x) => [
    rect(x, 8, 7, 1, "t"), rect(x + 1, 8, 5, 1, "k"), rect(x, 9, 7, 3, "k"), rect(x + 1, 12, 5, 1, "k"),
    rect(x + 2, 9, 3, 3, ks), px(x + 3, 10, kd),
  ]
  sprite("car_" + id, { w: 32, h: 13 },
    c.body.replaceAll("b", kb).replaceAll("B", kB).replaceAll("l", kl),
    rect(c.x0, 8, c.x1 - c.x0 + 1, 2, c.clad ? "t" : kB),
    ...c.wheels.flatMap(wheel))
}

// эмблемы автосалонов 11×11 (условные значки марок): на полке автосалона и на значке магазина на карте
pal({ N: "#0f2f7a", S: "#e9edf3", M: "#9aa3b5", R: "#d8242c", K: "#14121f" })
sprite("emb_subaru", `
  ..NNNNNNN..
  .NNNNNNNNN.
  NNNNNNSNNNN
  NNSNNNNNSNN
  NNNNNNNNNNN
  NSSNNNSNNNN
  NSSNNNNNSNN
  NNNNNNSNNNN
  .NNNNNNNNN.
  ..NNNNNNN..`)
sprite("emb_nissan", `
  ...SSSSS...
  .SSMMMMMSS.
  .SM.....MS.
  SM.......MS
  SSSSSSSSSSS
  SKSKSKSKSKS
  SSSSSSSSSSS
  SM.......MS
  .SM.....MS.
  .SSMMMMMSS.
  ...SSSSS...`)
sprite("emb_toyota", `
  ..SSSSSSS..
  .SMMMMMMMS.
  SMSSSSSSSMS
  SM.SMMMS.MS
  SM..SMS..MS
  SM..SMS..MS
  SM..SMS..MS
  .SM.SMS.MS.
  ..SSSSSSS..`)
sprite("emb_mitsubishi", `
  .....R.....
  ....RRR....
  ...RRRRR...
  ....RRR....
  .....R.....
  ..R.....R..
  .RRR...RRR.
  RRRRR.RRRRR
  .RRR...RRR.
  ..R.....R..`)
sprite("emb_mazda", `
  ..SSSSSSS..
  .SMMMMMMMS.
  SM.......MS
  SMS.....SMS
  SMSS...SSMS
  SM.SS.SS.MS
  SM..SSS..MS
  SM...S...MS
  .SMMMMMMMS.
  ..SSSSSSS..`)
sprite("emb_honda", `
  .SSSSSSSSS.
  SMMMMMMMMMS
  SM.S...S.MS
  SM.S...S.MS
  SM.SSSSS.MS
  SM.SSSSS.MS
  SM.S...S.MS
  SM.S...S.MS
  .SM.....MS.
  ..SSSSSSS..`)

// мини-эмблемы 7×6 — в уголке значка магазина на карте (магазин с автосалоном этой марки)
sprite("embs_subaru", `
  .NNNNN.
  NNNNSNN
  NSNNNNN
  NNNSNSN
  NSSNNNN
  .NNNNN.`)
sprite("embs_nissan", `
  .SSSSS.
  SM...MS
  SSSSSSS
  SKKKKKS
  SSSSSSS
  .SSSSS.`)
sprite("embs_toyota", `
  .SSSSS.
  SMSSSMS
  SM.S.MS
  SM.S.MS
  .SMSMS.
  ..SSS..`)
sprite("embs_mitsubishi", `
  ...R...
  ..RRR..
  ...R...
  .R...R.
  RRR.RRR
  .R...R.`)
sprite("embs_mazda", `
  .SSSSS.
  SM...MS
  SSS.SSS
  SM.S.MS
  SM...MS
  .SSSSS.`)
sprite("embs_honda", `
  SS...SS
  SS...SS
  SSSSSSS
  SS...SS
  SS...SS
  .S...S.`)
