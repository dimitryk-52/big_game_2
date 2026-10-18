// Карта — готовый рисунок (src/img/map.png → assets/map.webp, собирается scripts/build-map.py).
// Границы префектур — карта меток assets/regions.png (R = код*5); из неё строятся маски
// для тумана, подсветки и контура выбранной префектуры.
import { MAP_H, MAP_W, PREF } from './mapData';
import mapUrl from './assets/map.webp';
import regionsUrl from './assets/regions.png';

/** мировых единиц на пиксель рисунка: мир ≈ 1376×768, как у прежней сетки — зум и размеры фишек не меняются */
export const SCALE = 0.5;
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
    const n = hash(x >> 4, y >> 4) * 0.6 + hash(x >> 3, y >> 3) * 0.4;
    const v = n > 0.66 ? 12 : n < 0.3 ? -10 : 0;
    // у границы префектуры — тёмная кромка, чтобы соседние туманные области не сливались
    const edge = codeAt(regions, x - 2, y) !== code || codeAt(regions, x + 2, y) !== code
      || codeAt(regions, x, y - 2) !== code || codeAt(regions, x, y + 2) !== code;
    if (edge) return [70, 80, 115, 235];
    return [196 + v, 205 + v, 226 + v, 228];
  });
}

/** контур префектуры толщиной ~3px рисунка (для выбранной) */
export function renderPrefOutline(regions: Uint8Array, code: number) {
  const T = 3;
  return prefLayer(regions, code, T + 1, (x, y, inside) => {
    // пиксель контура: снаружи префектуры, но в пределах T от неё
    if (inside) return null;
    for (let dy = -T; dy <= T; dy++) for (let dx = -T; dx <= T; dx++) {
      if (dx * dx + dy * dy > T * T) continue;
      if (codeAt(regions, x + dx, y + dy) === code) return [255, 255, 255, 255];
    }
    return null;
  });
}
