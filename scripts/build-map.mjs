// Растеризует GeoJSON префектур Японии в пиксельную сетку и считает соседство.
// Использование: node scripts/build-map.mjs path/to/japan.geojson
// Источник данных: https://github.com/dataofjapan/land (japan.geojson)
import fs from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-map.mjs japan.geojson');
  process.exit(1);
}
const geo = JSON.parse(fs.readFileSync(src, 'utf8'));

// Окинаву (47) пока не включаем.
const EXCLUDE = new Set([47]);
// Границы: отрезаем дальние острова (Огасавара, Амами и т. п.).
const LON0 = 128.55, LON1 = 146.0, LAT0 = 31.0, LAT1 = 45.6;
const CELL = 0.09; // градусов широты на клетку
const KX = Math.cos((38 * Math.PI) / 180); // сжатие по долготе
const W = Math.ceil(((LON1 - LON0) * KX) / CELL);
const H = Math.ceil((LAT1 - LAT0) / CELL);

const RU = {
  1: 'Хоккайдо', 2: 'Аомори', 3: 'Иватэ', 4: 'Мияги', 5: 'Акита', 6: 'Ямагата', 7: 'Фукусима',
  8: 'Ибараки', 9: 'Тотиги', 10: 'Гумма', 11: 'Сайтама', 12: 'Тиба', 13: 'Токио', 14: 'Канагава',
  15: 'Ниигата', 16: 'Тояма', 17: 'Исикава', 18: 'Фукуи', 19: 'Яманаси', 20: 'Нагано', 21: 'Гифу',
  22: 'Сидзуока', 23: 'Айти', 24: 'Миэ', 25: 'Сига', 26: 'Киото', 27: 'Осака', 28: 'Хёго', 29: 'Нара',
  30: 'Вакаяма', 31: 'Тоттори', 32: 'Симанэ', 33: 'Окаяма', 34: 'Хиросима', 35: 'Ямагути',
  36: 'Токусима', 37: 'Кагава', 38: 'Эхимэ', 39: 'Коти', 40: 'Фукуока', 41: 'Сага', 42: 'Нагасаки',
  43: 'Кумамото', 44: 'Оита', 45: 'Миядзаки', 46: 'Кагосима',
};
const REGION = (c) =>
  c === 1 ? 'hokkaido' : c <= 7 ? 'tohoku' : c <= 14 ? 'kanto' : c <= 23 ? 'chubu' : c <= 30 ? 'kansai'
  : c <= 35 ? 'chugoku' : c <= 39 ? 'shikoku' : 'kyushu';

// Морские связи (проливы, мосты, тоннели).
const EXTRA_LINKS = [[1, 2], [33, 37], [28, 36], [34, 38], [35, 40], [37, 38]];

const feats = geo.features
  .map((f) => ({ id: f.properties.id, ja: f.properties.nam_ja, en: f.properties.nam, geom: f.geometry }))
  .filter((f) => !EXCLUDE.has(f.id));

function polys(geom) {
  return geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
}
for (const f of feats) {
  f.rings = [];
  for (const p of polys(f.geom)) {
    for (const ring of p) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      f.rings.push({ ring, bb: [x0, y0, x1, y1] });
    }
  }
}
function inRing(x, y, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function prefAt(lon, lat) {
  for (const f of feats) {
    let c = 0;
    for (const { ring, bb } of f.rings) {
      if (lon < bb[0] || lon > bb[2] || lat < bb[1] || lat > bb[3]) continue;
      if (inRing(lon, lat, ring)) c++;
    }
    if (c % 2 === 1) return f.id;
  }
  return 0;
}

const grid = new Uint8Array(W * H);
for (let gy = 0; gy < H; gy++) {
  const lat = LAT1 - (gy + 0.5) * CELL;
  for (let gx = 0; gx < W; gx++) {
    const lon = LON0 + ((gx + 0.5) * CELL) / KX;
    grid[gy * W + gx] = prefAt(lon, lat);
  }
}

// Удаляем одиночные островки, оторванные от основного массива своей префектуры
// (оставляем компоненты размером >= 3 клеток или самую большую компоненту).
const seen = new Uint8Array(W * H);
const comps = {};
for (let i = 0; i < W * H; i++) {
  if (!grid[i] || seen[i]) continue;
  const id = grid[i], stack = [i], cells = [];
  seen[i] = 1;
  while (stack.length) {
    const k = stack.pop(); cells.push(k);
    const x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (!seen[n] && grid[n] === id) { seen[n] = 1; stack.push(n); }
    }
  }
  (comps[id] ??= []).push(cells);
}
for (const [id, list] of Object.entries(comps)) {
  list.sort((a, b) => b.length - a.length);
  list.slice(1).forEach((c) => { if (c.length < 3) c.forEach((k) => (grid[k] = 0)); });
}

const prefs = {};
for (const f of feats) prefs[f.id] = { code: f.id, ja: f.ja, ru: RU[f.id], en: f.en.replace(/ (Ken|To|Fu|Do)$/, ''), region: REGION(f.id), n: 0, sx: 0, sy: 0, bb: [1e9, 1e9, -1e9, -1e9], adj: new Set() };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const id = grid[y * W + x];
  if (!id) continue;
  const p = prefs[id];
  p.n++; p.sx += x; p.sy += y;
  p.bb = [Math.min(p.bb[0], x), Math.min(p.bb[1], y), Math.max(p.bb[2], x), Math.max(p.bb[3], y)];
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= W || ny >= H) continue;
    const o = grid[ny * W + nx];
    if (o && o !== id) { p.adj.add(o); prefs[o].adj.add(id); }
  }
}
for (const [a, b] of EXTRA_LINKS) { prefs[a].adj.add(b); prefs[b].adj.add(a); }

// «Якорь» префектуры — клетка префектуры, ближайшая к центру масс.
for (const p of Object.values(prefs)) {
  const cx = p.sx / p.n, cy = p.sy / p.n;
  let best = null, bd = 1e9;
  for (let y = p.bb[1]; y <= p.bb[3]; y++) for (let x = p.bb[0]; x <= p.bb[2]; x++) {
    if (grid[y * W + x] !== p.code) continue;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bd) { bd = d; best = [x, y]; }
  }
  p.anchor = best;
}

let cells = '';
for (let i = 0; i < W * H; i++) cells += String.fromCharCode(48 + grid[i]);

const out = {
  w: W, h: H, cells,
  prefs: Object.values(prefs).map((p) => ({
    code: p.code, ja: p.ja, ru: p.ru, en: p.en, region: p.region, size: p.n,
    anchor: p.anchor, bb: p.bb, adj: [...p.adj].sort((a, b) => a - b),
  })),
};
fs.mkdirSync('src/map', { recursive: true });
fs.writeFileSync('src/map/japan.json', JSON.stringify(out));
console.log(`grid ${W}x${H}`);
for (const p of out.prefs) console.log(p.code, p.ru, 'cells', p.size, 'adj', p.adj.map((a) => RU[a]).join(','));
