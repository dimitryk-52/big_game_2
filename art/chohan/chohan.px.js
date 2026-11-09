// Чо-хан: плетёный стакан (壺) и кости под фон src/img/chohan/table.png.
// Сборка: node ~/.claude/skills/pxl-pixel-art/bin/pxl.js build art/chohan/chohan.px.js
// Готовые PNG копируются в src/img/chohan/ (cup_closed, cup_open, die_1…die_6, die_alt_1…).
//
// Перспектива: ортографическая камера сверху под углом ELEV (стол виден «от сидящего игрока»).
// Стакан и кубы рисует крошечный 3D-растеризатор с z-буфером: точки поверхности
// проецируются в пиксели, у каждого пикселя остаётся ближайшая. Свет — слева от фонаря.

pal({
  k: "#2a1518",                                  // контур, как у стола
  1: "#4a2a18", 2: "#6e4524", 3: "#96663a", 4: "#bf9258", 5: "#ddbb80", 6: "#f0dcaa", // бамбук
  a: "#1a0c0e", s: "#3a1716", d: "#62231c", e: "#8c3524", f: "#b04e30",               // лак
  g: "#e0b060",                                  // золотой блик ободка
  i: "#9c9080", j: "#c4b9a6", m: "#e2d9c7", n: "#f8f3e8",                           // слоновая кость
  p: "#1e1410", r: "#c8202a", R: "#8a1420",      // точки
})

const ELEV = (44 * Math.PI) / 180
const SA = Math.sin(ELEV), CA = Math.cos(ELEV)
const LIGHT = norm([-0.5, 0.75, 0.45])

function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l) }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const pick = (ramp, v) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(v * (ramp.length - 1))))]

/** z-буфер поверх холста: plot(точка мира, ключ цвета) */
function zbuf(c, ox, oy) {
  const z = new Map()
  return (P, key) => {
    const x = Math.floor(ox + P[0]), y = Math.floor(oy - P[1] * CA + P[2] * SA)
    if (x < 0 || y < 0 || x >= c.w || y >= c.h) return
    const d = P[2] * CA + P[1] * SA, id = y * 4096 + x
    if (z.has(id) && z.get(id) >= d) return
    z.set(id, d)
    c.px(x, y, key)
  }
}

// ---------- стакан ----------
const RM = 19, RB = 14, H = 30, WALL = 1.4   // радиус у устья, у донца, высота, толщина стенки

/** tilt — наклон верха от зрителя (рад), lift — подъём, back — сдвиг к дилеру */
function cup(c, ox, oy, tilt, lift, back, dim = 0) {
  const plot = zbuf(c, ox, oy)
  const cb = Math.cos(tilt), sb = Math.sin(tilt)
  const xf = (p) => [p[0], p[1] * cb + p[2] * sb + lift, -p[1] * sb + p[2] * cb - back]
  const xn = (n) => [n[0], n[1] * cb + n[2] * sb, -n[1] * sb + n[2] * cb]
  const rAt = (y) => RM + ((RB - RM) * y) / H
  const slope = (RM - RB) / H
  const STEP = 0.2

  for (let y = 0; y <= H; y += STEP) {
    const r = rAt(y)
    const dphi = STEP / r
    for (let phi = 0; phi < Math.PI * 2; phi += dphi) {
      const cx = Math.cos(phi), sz = Math.sin(phi)
      // наружная стенка: плетение из горизонтальных лент и вертикальных прутьев
      const n = xn(norm([cx, slope, sz]))
      let v = 0.2 + (0.8 - dim) * Math.max(0, dot(n, LIGHT))
      let key
      if (y < 3 || y > H - 2.2) {
        // лакированные ободки у устья и у донца
        const lip = y < 1.1 || y > H - 0.9
        key = pick(lip ? "sdefg" : "asdef", v + (lip ? 0.1 : 0))
      } else {
        const band = Math.floor((y - 3) / 3.3)
        const strand = Math.floor((phi * 28) / (Math.PI * 2))
        const over = (band + strand) % 2 === 0               // лента поверх прута
        const fy = ((y - 3) / 3.3) % 1, fp = ((phi * 28) / (Math.PI * 2)) % 1
        if (over) v += 0.08 - (fy < 0.18 ? 0.22 : 0)            // щель между лентами
        else v -= 0.05 + (fp < 0.2 ? 0.2 : 0)                  // край прута
        key = pick("123456", v)
      }
      plot(xf([r * cx, y, r * sz]), key)
      // внутренняя стенка: тёмная, только чтобы было видно в поднятом стакане
      const ri = r - WALL
      const ni = xn([-cx, -slope, -sz])
      const vi = 0.55 - (0.5 * y) / H + 0.25 * Math.max(0, dot(ni, LIGHT))
      const ib = Math.floor(y / 3.3), is = Math.floor((phi * 28) / (Math.PI * 2))
      plot(xf([ri * cx, y, ri * sz]), pick("aas12", vi + ((ib + is) % 2 ? 0.1 : 0)))
    }
  }
  // губа устья (кольцо между стенками) и донца
  for (let r = RM - WALL; r <= RM; r += 0.2)
    for (let phi = 0; phi < Math.PI * 2; phi += 0.2 / RM) {
      const nl = xn([0, -1, 0])
      plot(xf([r * Math.cos(phi), 0, r * Math.sin(phi)]), pick("sdefg", 0.35 + 0.6 * Math.max(0, dot(nl, LIGHT)) + 0.25))
    }
  for (let r = 0; r <= RB; r += 0.2)
    for (let phi = 0; phi < Math.PI * 2; phi += 0.2 / Math.max(r, 1)) {
      const X = r * Math.cos(phi), Z = r * Math.sin(phi)
      // донце снаружи: спираль плетения, тёмный лаковый ободок по краю
      const nu = xn([0, 1, 0])
      const v = 0.25 + 0.75 * Math.max(0, dot(nu, LIGHT))
      const key = r > RB - 1.6 ? pick("sdefg", v + 0.1)
        : r < 2.2 ? pick("123456", v - 0.15)
        : pick("123456", v + (Math.floor(r / 2.2 + phi / (Math.PI * 2)) % 2 ? 0.08 : -0.1))
      plot(xf([X, H, Z]), key)
      // донце изнутри
      plot(xf([X * 0.92, H - WALL, Z * 0.92]), "a")
    }
}

// закрыт: стоит устьем вниз. Нижний край спрайта — передний край устья на сукне
sprite("cup_closed", { w: 46, h: 54, outline: "k", crop: true }, (c) => cup(c, 23, 36, 0, 0, 0))
// открыт: поднят и запрокинут к дилеру, устье смотрит на игроков
sprite("cup_open", { w: 48, h: 64, outline: "k", crop: true }, (c) => cup(c, 24, 50, (62 * Math.PI) / 180, 12, 4, 0.22))

// ---------- кости ----------
const S = 15                        // ребро кубика
const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
}
// соседние грани для верхней (противоположные дают 7)
const SIDES = { 1: [2, 3], 2: [1, 3], 3: [1, 5], 4: [5, 1], 5: [4, 6], 6: [5, 4] }

const DLIGHT = norm([-0.55, 0.8, 0.22])
const VIEW = [0, SA, CA]

function die(c, ox, oy, top, yaw) {
  const plot = zbuf(c, ox, oy)
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const rot = (p) => [p[0] * cy - p[2] * sy, p[1], p[0] * sy + p[2] * cy]
  const scr = (P) => [Math.floor(ox + P[0]), Math.floor(oy - P[1] * CA + P[2] * SA)]
  const h = S / 2, off = S * 0.29
  const [front, right] = SIDES[top]
  const faces = [
    { n: [0, 1, 0], v: top, at: (u, w) => [u, S, w], top: true },
    { n: [0, 0, 1], v: front, at: (u, w) => [u, S / 2 - w, h] },
    { n: [1, 0, 0], v: right, at: (u, w) => [h, S / 2 - w, -u] },
    { n: [-1, 0, 0], v: 7 - right, at: (u, w) => [-h, S / 2 - w, u] },
    { n: [0, 0, -1], v: 7 - front, at: (u, w) => [-u, S / 2 - w, -h] },
  ]
  for (const f of faces) {
    const n = rot(f.n)
    const lit = f.top ? 1 : 0.15 + 0.7 * Math.max(0, dot(n, DLIGHT))
    for (let u = -h; u <= h; u += 0.15)
      for (let w = -h; w <= h; w += 0.15) {
        const edge = Math.max(Math.abs(u), Math.abs(w)) > h - 0.7
        plot(rot(f.at(u, w)), pick("ijmn", lit - (edge ? (f.top ? 0.34 : 0.2) : 0)))
      }
  }
  // точки: фиксированные пиксельные формы в проекциях центров (чисто читается)
  for (const f of faces) {
    const n = rot(f.n), face = dot(n, VIEW)
    if (face < 0.3) continue
    for (const [px, py] of PIPS[f.v]) {
      const [x, y] = scr(rot(f.at(px * off, py * off)))
      if (f.v === 1 && f.top) {           // крупная красная единица
        c.rect(x - 1, y - 1, 3, 3, "r"); c.hline(x - 1, y + 2, 3, "R"); c.vline(x - 2, y, 2, "R"); c.vline(x + 2, y, 2, "R"); c.px(x - 2, y - 1, "r"); c.px(x + 2, y - 1, "r")
      } else if (f.v === 1) c.rect(x - 1, y, 2, 2, "r")
      else if (f.top) c.rect(x - 1, y - 1, 2, 2, "p")
      else if (face > 0.55) c.rect(x - 1, y, 2, 1, "p")
      else c.px(x, y, "p")
    }
  }
}

for (let v = 1; v <= 6; v++) {
  sprite("die_" + v, { w: 22, h: 22, outline: "k", crop: true }, (c) => die(c, 11, 17, v, 0))
  sprite("die_alt_" + v, { w: 26, h: 24, outline: "k", crop: true }, (c) => die(c, 13, 18, v, (25 * Math.PI) / 180))
}
