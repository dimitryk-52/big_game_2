// «Сашими»: отрезать кусок нужного веса. Рыба описана профилем толщины вдоль длины;
// вес куска — интеграл (толщина² × плотность) от разреза до правого края, поэтому
// сантиметр у толстой спины весит намного больше сантиметра у хвоста.
// Рисунок пиксельный: рыба рисуется в маленький холст и растягивается без сглаживания.
import type { FishId } from '../shared/types';

/** холст рыбы на разделочной доске, px */
export const SW = 160;
export const SH = 60;
const X0 = 8, X1 = 152, CY = 30;

/** точка профиля: доля длины, толщина вверх и вниз от оси (px), плотность (плавники и щупальца — лёгкие) */
type Pt = [t: number, up: number, down: number, k?: number];

interface FishDef {
  name: string;
  ja: string;
  /** вес целиком, г, и шаг округления цели */
  total: number;
  step: number;
  /** родные префектуры: задания с этой рыбой выбираются там */
  prefs: number[];
  profile: Pt[];
  /** цвета: спина, бок, брюхо, плавники, крапинки */
  colors: [string, string, string, string, string];
  eye?: number;
  spots?: number;
}

export const FISH: Record<FishId, FishDef> = {
  tuna: {
    name: 'Тунец', ja: 'マグロ', total: 4000, step: 10, prefs: [30], eye: 0.07,
    colors: ['#1d2a5c', '#4b6a9a', '#d8dde6', '#2c3d73', '#9fb4d4'],
    profile: [[0, 2, 2], [0.06, 8, 7], [0.15, 13, 12], [0.3, 16, 15], [0.45, 16, 15], [0.6, 13, 12], [0.72, 9, 8], [0.8, 5, 4], [0.86, 3, 2.5],
      [0.88, 3, 3, 0.1], [0.94, 12, 12, 0.05], [1, 16, 16, 0.03]],
  },
  salmon: {
    name: 'Лосось', ja: 'サケ', total: 3000, step: 10, prefs: [1], eye: 0.06, spots: 0.08,
    colors: ['#4a5d6e', '#8fa3ad', '#ecd9d2', '#6d7f88', '#1a1f24'],
    profile: [[0, 2, 1.5], [0.05, 6, 5], [0.14, 9, 9], [0.3, 11, 11], [0.48, 11, 10], [0.65, 8, 7.5], [0.78, 5, 4.5], [0.86, 3, 3],
      [0.88, 3, 3, 0.1], [0.95, 9, 9, 0.05], [1, 11, 11, 0.03]],
  },
  crab: {
    name: 'Краб', ja: 'カニ', total: 800, step: 5, prefs: [1],
    colors: ['#a8281c', '#d2452b', '#f2a07a', '#f6e2c8', '#fff3e0'],
    // нога камчатского краба: три членика, суставы тонкие, кончик острый
    profile: [[0, 7, 7], [0.02, 8, 8], [0.3, 7.5, 7], [0.33, 4, 4], [0.36, 6.5, 6.5], [0.62, 6, 5.5], [0.65, 3.5, 3.5], [0.68, 5.5, 5], [0.9, 3.5, 3], [1, 0.5, 0.5]],
  },
  squid: {
    name: 'Кальмар', ja: 'イカ', total: 450, step: 5, prefs: [41], eye: 0.6, spots: 0.12,
    colors: ['#d9c3b0', '#efe3d3', '#f8f1e7', '#e8d6c6', '#a8584c'],
    // слева мантия с плавниками, в середине голова с глазами, справа длинные лёгкие щупальца
    profile: [[0, 1, 1], [0.04, 12, 12, 0.12], [0.14, 10, 10, 0.25], [0.16, 7, 7], [0.5, 9, 9], [0.55, 9, 9], [0.57, 6, 6], [0.62, 7, 7], [0.66, 5, 5],
      [0.7, 7, 7, 0.22], [1, 4, 4, 0.12]],
  },
};

function at(f: FishDef, t: number): [number, number, number] {
  const p = f.profile;
  if (t <= p[0][0]) return [p[0][1], p[0][2], p[0][3] ?? 1];
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i][0]) {
      const a = p[i - 1], b = p[i];
      const k = (t - a[0]) / (b[0] - a[0] || 1);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, (a[3] ?? 1) + ((b[3] ?? 1) - (a[3] ?? 1)) * k];
    }
  }
  const l = p[p.length - 1];
  return [l[1], l[2], l[3] ?? 1];
}

const N = 2000;
const cumCache = new Map<FishId, Float64Array>();
/** накопленная масса от правого края: cum[i] — вес куска при разрезе в i/N */
function cum(fish: FishId) {
  let c = cumCache.get(fish);
  if (c) return c;
  const f = FISH[fish];
  c = new Float64Array(N + 1);
  for (let i = N - 1; i >= 0; i--) {
    const [u, d, k] = at(f, (i + 0.5) / N);
    c[i] = c[i + 1] + (u + d) * (u + d) * k;
  }
  const total = c[0];
  for (let i = 0; i <= N; i++) c[i] = (c[i] / total) * f.total;
  cumCache.set(fish, c);
  return c;
}

/** вес куска справа от разреза t (0..1), г */
export function pieceGrams(fish: FishId, t: number) {
  const c = cum(fish);
  const x = Math.max(0, Math.min(1, t)) * N;
  const i = Math.min(N - 1, Math.floor(x));
  return Math.round(c[i] + (c[i + 1] - c[i]) * (x - i));
}

/** где резать, чтобы получить grams (для ботов) */
export function cutForGrams(fish: FishId, grams: number) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (pieceGrams(fish, m) > grams) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/** цель: от 15 до 55% веса, кратно шагу */
export function randomTarget(fish: FishId, rnd: () => number = Math.random) {
  const f = FISH[fish];
  return Math.round((f.total * (0.15 + rnd() * 0.4)) / f.step) * f.step;
}

export const CUT_MIN = 0.02;
export const CUT_MAX = 0.98;
/** доля длины рыбы ↔ x на холсте рыбы */
export const tToX = (t: number) => X0 + t * (X1 - X0);
export const xToT = (x: number) => Math.max(CUT_MIN, Math.min(CUT_MAX, (x - X0) / (X1 - X0)));

const hash = (x: number, y: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

const boardCache = new Map<string, HTMLCanvasElement>();
/** доска с рыбой (без ножа), SW×SH */
export function fishCanvas(fish: FishId): HTMLCanvasElement {
  const key = fish;
  let c = boardCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = SW;
  c.height = SH;
  const ctx = c.getContext('2d')!;
  const f = FISH[fish];
  const [back, side, belly, fin, spot] = f.colors;
  for (let x = X0; x < X1; x++) {
    const t = (x + 0.5 - X0) / (X1 - X0);
    const [u, d, k] = at(f, t);
    const top = Math.round(CY - u), bot = Math.round(CY + d);
    for (let y = top; y < bot; y++) {
      const v = (y - top) / Math.max(1, bot - top);
      let col = k < 0.3 ? fin : v < 0.32 ? back : v < 0.55 ? side : belly;
      if (fish === 'crab') col = v < 0.45 ? back : v < 0.7 ? side : belly;
      if (fish === 'squid' && k < 0.3 && t > 0.6) {
        // щупальца: отдельные волнистые нити
        const wave = Math.round(Math.sin(x * 0.35 + y) * 0.8);
        if ((y + wave - top) % 3 !== 0) continue;
        col = hash(x, y) < 0.3 ? spot : '#d9a99a';
      }
      if (f.spots && k >= 0.3 && v < 0.6 && hash(x, y) < f.spots) col = spot;
      if (fish === 'tuna' && k >= 0.3 && t > 0.62 && t < 0.86 && (y === top + 1 || y === bot - 2) && x % 3 === 0) col = '#f2c230'; // жёлтые плавнички
      if (fish === 'crab' && y === top + 1 && hash(x, 3) < 0.35) col = spot; // шипы
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
    // контур (у щупалец — нет)
    if (fish === 'squid' && k < 0.3 && t > 0.6) continue;
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(x, top - 1, 1, 1);
    ctx.fillRect(x, bot, 1, 1);
  }
  // хвост ласточкой: вырез посередине
  if (fish === 'tuna' || fish === 'salmon') {
    for (let x = Math.round(tToX(0.95)); x < X1; x++) {
      const w = Math.round((x - tToX(0.95)) * 0.9);
      ctx.clearRect(x, CY - w, 1, w * 2);
      ctx.fillStyle = '#0d0d1a';
      if (w > 0) { ctx.fillRect(x, CY - w - 1, 1, 1); ctx.fillRect(x, CY + w, 1, 1); }
    }
  }
  if (f.eye != null) {
    const ex = Math.round(tToX(f.eye));
    const [u] = at(f, f.eye);
    const ey = Math.round(CY - u * 0.35);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ex - 1, ey - 1, 3, 3);
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(ex, ey, 2, 1);
    if (fish === 'squid') { ctx.fillRect(ex, ey + 6, 2, 2); }
  }
  boardCache.set(key, c);
  return c;
}

const darkCache = new Map<FishId, HTMLCanvasElement>();
/** затемнённая рыба — обрезки, которые уйдут в отходы */
function darkFish(fish: FishId): HTMLCanvasElement {
  let c = darkCache.get(fish);
  if (c) return c;
  const src = fishCanvas(fish);
  c = document.createElement('canvas');
  c.width = SW;
  c.height = SH;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const d = ctx.getImageData(0, 0, SW, SH);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
    for (let j = 0; j < 3; j++) d.data[i + j] = Math.round((d.data[i + j] * 0.6 + g * 0.4) * 0.5);
  }
  ctx.putImageData(d, 0, 0);
  darkCache.set(fish, c);
  return c;
}

let woodUrl: HTMLCanvasElement | null = null;
/** разделочная доска из хиноки */
function wood(): HTMLCanvasElement {
  if (woodUrl) return woodUrl;
  const c = document.createElement('canvas');
  c.width = SW;
  c.height = SH;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e9cf9f';
  ctx.fillRect(0, 0, SW, SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const g = Math.sin(y * 0.9 + Math.sin(x * 0.05) * 2);
    if (g > 0.85 || hash(x, y) < 0.03) { ctx.fillStyle = '#d6b984'; ctx.fillRect(x, y, 1, 1); }
  }
  ctx.fillStyle = '#b8955e';
  ctx.fillRect(0, SH - 3, SW, 3);
  woodUrl = c;
  return c;
}

export interface SashimiView {
  /** нож (доля длины) — пока не отрезано */
  knife?: number | null;
  /** разрез сделан здесь; split 0..1 — насколько улетели обрезки (1 — их уже нет) */
  cut?: number | null;
  split?: number;
  /** отметки разрезов других игроков */
  marks?: { t: number; color: string }[];
}

/** рисует доску, рыбу, нож и отметки в ctx размером w×h (кратно SW×SH — пиксели будут ровными) */
export function drawSashimi(ctx: CanvasRenderingContext2D, w: number, h: number, fish: FishId, v: SashimiView) {
  const k = Math.min(w / SW, h / SH);
  const ox = (w - SW * k) / 2, oy = (h - SH * k) / 2;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(wood(), ox, oy, SW * k, SH * k);
  const img = fishCanvas(fish);
  const cut = v.cut ?? null;
  if (cut == null) {
    if (v.knife != null) {
      // слева от ножа — обрезки (затемнены), справа — кусок игрока, чистый
      const sx = tToX(v.knife);
      ctx.drawImage(darkFish(fish), 0, 0, sx, SH, ox, oy, sx * k, SH * k);
      ctx.drawImage(img, sx, 0, SW - sx, SH, ox + sx * k, oy, (SW - sx) * k, SH * k);
    } else ctx.drawImage(img, ox, oy, SW * k, SH * k);
  } else {
    // разрез: обрезки улетают с доски и тают, кусок игрока остаётся на месте
    const sx = tToX(cut);
    const a = v.split ?? 1;
    if (a < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - a;
      ctx.drawImage(darkFish(fish), 0, 0, sx, SH, ox - a * 30 * k, oy + a * a * 14 * k, sx * k, SH * k);
      ctx.restore();
    }
    ctx.drawImage(img, sx, 0, SW - sx, SH, ox + sx * k, oy, (SW - sx) * k, SH * k);
  }
  for (const m of v.marks ?? []) {
    const x = Math.round(ox + tToX(m.t) * k);
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(x - 2, oy + 2 * k, 5, (SH - 6) * k);
    ctx.fillStyle = m.color;
    ctx.fillRect(x - 1, oy + 2 * k, 3, (SH - 6) * k);
  }
  const knife = cut == null ? v.knife : null;
  if (knife != null) {
    const x = ox + tToX(knife) * k;
    // нож янагиба в руке игрока: рукоять снизу (у игрока), острие уходит вверх
    const bw = Math.max(3, Math.round(k * 1.5));
    const px = (y0: number, y1: number, w: number, col: string) => {
      ctx.fillStyle = '#0d0d1a';
      ctx.fillRect(x - w / 2 - 1, oy + y0 * k - 1, w + 2, (y1 - y0) * k + 2);
      ctx.fillStyle = col;
      ctx.fillRect(x - w / 2, oy + y0 * k, w, (y1 - y0) * k);
    };
    // лезвие с заострённым кончиком
    px(2, 4, Math.max(1, bw - 2), '#dfe6ee');
    px(4, 48, bw, '#dfe6ee');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - bw / 2, oy + 4 * k, 1, 44 * k);
    // латунное кольцо и деревянная рукоять
    const hw = bw + 3 * k;
    px(47, 50, hw + 2, '#c9a24a');
    px(50, SH - 1, hw, '#6b4423');
    ctx.fillStyle = '#8a5a2e';
    ctx.fillRect(x - hw / 2 + k, oy + 50 * k, k, (SH - 51) * k);
    ctx.fillStyle = '#3e2512';
    for (let y = 52; y < SH - 2; y += 3) ctx.fillRect(x - hw / 2, oy + y * k, hw, Math.max(1, k / 2));
  }
}
