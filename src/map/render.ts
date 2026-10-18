// Карта — пиксель-арт из рисунка src/img/map.png (→ assets/map.png, собирается scripts/build-map.py):
// один пиксель картинки = один «пиксель» рисунка, на экране растягивается без сглаживания.
// Границы префектур — карта меток assets/regions.png (R = код*5); из неё строятся маски
// для тумана, подсветки и контура выбранной префектуры.
import { MAP_H, MAP_W, PREF } from './mapData';
import mapUrl from './assets/map.png';
import regionsUrl from './assets/regions.png';

/** мировых единиц на пиксель карты: мир всегда 1376 в ширину — зум и размеры фишек не зависят от разрешения карты */
export const SCALE = 1376 / MAP_W;
export const CANVAS_W = MAP_W * SCALE;
export const CANVAS_H = MAP_H * SCALE;

export interface MapAssets {
  image: HTMLImageElement;
  /** код префектуры для каждого пикселя рисунка (0 — море) */
  regions: Uint8Array;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((ok, fail) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('не загрузилась картинка ' + url));
    img.src = url;
  });
}

let assets: Promise<MapAssets> | null = null;
export function loadMapAssets() {
  assets ??= Promise.all([loadImage(mapUrl), loadImage(regionsUrl)]).then(([image, reg]) => {
    const c = document.createElement('canvas');
    c.width = MAP_W;
    c.height = MAP_H;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(reg, 0, 0);
    const px = ctx.getImageData(0, 0, MAP_W, MAP_H).data;
    const regions = new Uint8Array(MAP_W * MAP_H);
    for (let i = 0; i < regions.length; i++) regions[i] = Math.round(px[i * 4] / 5);
    return { image, regions };
  });
  return assets;
}

export function codeAt(regions: Uint8Array, x: number, y: number) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 0;
  return regions[y * MAP_W + x];
}

export function worldToImage(wx: number, wy: number) {
  return { x: wx / SCALE, y: wy / SCALE };
}
export function prefAnchorWorld(code: number) {
  const a = PREF[code].anchor;
  return { x: a[0] * SCALE, y: a[1] * SCALE };
}
export function prefBoundsWorld(codes: number[]) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of codes) {
    const bb = PREF[c]?.bb;
    if (!bb) continue;
    x0 = Math.min(x0, bb[0]); y0 = Math.min(y0, bb[1]); x1 = Math.max(x1, bb[2]); y1 = Math.max(y1, bb[3]);
  }
  return { x: x0 * SCALE, y: y0 * SCALE, w: (x1 - x0 + 1) * SCALE, h: (y1 - y0 + 1) * SCALE };
}

function hash(x: number, y: number) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

/** холст размером с bbox префектуры (в пикселях рисунка) + его позиция в мире */
export interface PrefLayer {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

/**
 * Слой одной префектуры: paint(x, y) возвращает [r,g,b,a] для пикселя префектуры или null.
 * pad — запас по краям bbox (для контура).
 */
function prefLayer(regions: Uint8Array, code: number, pad: number, paint: (x: number, y: number, inside: boolean) => number[] | null): PrefLayer {
  const bb = PREF[code].bb;
  const bx = bb[0] - pad, by = bb[1] - pad;
  const w = bb[2] - bb[0] + 1 + pad * 2, h = bb[3] - bb[1] + 1 + pad * 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = codeAt(regions, bx + x, by + y) === code;
    const v = paint(bx + x, by + y, inside);
    if (!v) continue;
    const i = (y * w + x) * 4;
    d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = v[3];
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, x: bx * SCALE, y: by * SCALE };
}

/** белая маска префектуры (подсветка — через tint) */
export function renderPrefMask(regions: Uint8Array, code: number) {
  return prefLayer(regions, code, 0, (_x, _y, inside) => (inside ? [255, 255, 255, 255] : null));
}

/** туман: светлые «облачные» пятна по форме префектуры, рисунок под ним едва виден */
export function renderPrefFog(regions: Uint8Array, code: number) {
  return prefLayer(regions, code, 0, (x, y, inside) => {
    if (!inside) return null;
    const n = hash(x >> 2, y >> 2) * 0.6 + hash(x >> 1, y >> 1) * 0.4;
    const v = n > 0.66 ? 12 : n < 0.3 ? -10 : 0;
    // у границы префектуры — тёмная кромка, чтобы соседние туманные области не сливались
    const edge = codeAt(regions, x - 1, y) !== code || codeAt(regions, x + 1, y) !== code
      || codeAt(regions, x, y - 1) !== code || codeAt(regions, x, y + 1) !== code;
    if (edge) return [70, 80, 115, 235];
    return [196 + v, 205 + v, 226 + v, 228];
  });
}

/** контур префектуры: по пикселю карты внутри и снаружи границы (для подсветки и выбранной) */
export function renderPrefOutline(regions: Uint8Array, code: number) {
  return prefLayer(regions, code, 2, (x, y, inside) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((codeAt(regions, x + dx, y + dy) === code) !== inside) return [255, 255, 255, 255];
    }
    return null;
  });
}

/**
 * Пиксельная стрелка-дуга от a к b (в пикселях карты): светлое тело, тёмный контур, тень снизу.
 * Рисуется попиксельно в сетке карты, поэтому на любом зуме остаётся пиксель-артом.
 * Возвращает холст, его позицию в мире и направление наконечника (для покачивания).
 */
export function renderMoveArrow(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // концы чуть отступают от фишки и от цели; дуга выгибается вверх
  const p0 = { x: a.x + ux * 4, y: a.y + uy * 4 - 5 };
  const p2 = { x: b.x - ux * 2, y: b.y - uy * 2 - 5 };
  let nx = -uy, ny = ux;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const bend = Math.min(18, len * 0.3);
  const p1 = { x: (p0.x + p2.x) / 2 + nx * bend, y: (p0.y + p2.y) / 2 + ny * bend };
  const at = (t: number) => ({
    x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
  });
  // наконечник: треугольник по касательной в конце
  const tx0 = p2.x - p1.x, ty0 = p2.y - p1.y;
  const tl = Math.hypot(tx0, ty0) || 1;
  const tx = tx0 / tl, ty = ty0 / tl;
  const HEAD = 8, HALF = 6, R = 2.2;
  const base = { x: p2.x - tx * HEAD, y: p2.y - ty * HEAD };
  const tri = [p2, { x: base.x - ty * HALF, y: base.y + tx * HALF }, { x: base.x + ty * HALF, y: base.y - tx * HALF }];
  // тело дуги заканчивается у основания наконечника
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= 120; i++) {
    const q = at(i / 120);
    if (Math.hypot(q.x - p2.x, q.y - p2.y) < HEAD - 0.5) break;
    pts.push(q);
  }
  const xs = [...pts.map((q) => q.x), ...tri.map((q) => q.x)], ys = [...pts.map((q) => q.y), ...tri.map((q) => q.y)];
  const ox = Math.floor(Math.min(...xs)) - 4, oy = Math.floor(Math.min(...ys)) - 4;
  const w = Math.ceil(Math.max(...xs)) - ox + 5, h = Math.ceil(Math.max(...ys)) - oy + 6;
  const side = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) => (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  const inTri = (x: number, y: number) => {
    const pt = { x, y };
    const d1 = side(pt, tri[0], tri[1]), d2 = side(pt, tri[1], tri[2]), d3 = side(pt, tri[2], tri[0]);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const body = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = ox + x + 0.5, cy = oy + y + 0.5;
    let hit = inTri(cx, cy);
    for (let i = 0; !hit && i < pts.length; i++) hit = (pts[i].x - cx) ** 2 + (pts[i].y - cy) ** 2 <= R * R;
    body[y * w + x] = hit ? 1 : 0;
  }
  const B = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && body[y * w + x] === 1;
  const near = (x: number, y: number) => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (B(x + i, y + j)) return true;
    return false;
  };
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const put = (x: number, y: number, r: number, g: number, b: number, al = 255) => {
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = al;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (B(x, y)) {
      // верхняя кромка тела светлее, нижняя темнее — объём как у пиксельных иконок
      if (!B(x, y - 1)) put(x, y, 0xc8, 0xff, 0xf0);
      else if (!B(x, y + 1)) put(x, y, 0x2f, 0xa8, 0x9a);
      else put(x, y, 0x5f, 0xe0, 0xc4);
    } else if (near(x, y)) put(x, y, 0x0d, 0x1a, 0x2a);
    else if (near(x, y - 1) || near(x - 1, y - 1)) put(x, y, 0, 0, 0, 90);
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, x: ox * SCALE, y: oy * SCALE, dir: { x: tx, y: ty } };
}
