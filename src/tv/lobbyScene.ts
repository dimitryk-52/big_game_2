// Лобби-тропа: японский пейзаж в несколько планов едет справа налево, игроки идут по тропе.
// Всё рисуется кодом в маленьком холсте (W×H «пикселей рисунка») и растягивается без сглаживания.
// Слои, которые повторяются, собраны так, что их края стыкуются: предметы у края рисуются дважды
// (x и x ± ширина куска), а линии гор — суммы синусов с целым числом периодов на кусок.
import { CHAR_H, CHAR_W, characterCanvas, type LookSrc } from '../shared/sprites';

/** ширина рисунка; высота — по пропорциям экрана (16:9 → 216) */
export const SCENE_W = 320;
/** ширина повторяющегося куска у ближних слоёв */
const TW = 768;
/** скорость тропы, пикселей рисунка в секунду; остальные слои — доля от неё */
const ROAD_SPEED = 34;
/** где стоят ноги: задний и передний ряд (от низа холста) */
export const FOOT_BACK = 31;
export const FOOT_FRONT = 19;

/** bottom — на сколько пикселей низ слоя выше низа холста */
type Layer = { c: HTMLCanvasElement; speed: number; bottom?: number };

// ───── мелочи для рисования ─────

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** рисовальщик с повтором по ширине куска: всё, что у края, появляется и с другой стороны */
function wrapPainter(ctx: CanvasRenderingContext2D, tw: number) {
  const rect = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    x = Math.round(x); y = Math.round(y);
    for (const o of [-tw, 0, tw]) if (x + o < tw && x + o + w > 0) ctx.fillRect(x + o, y, w, h);
  };
  const disc = (cx: number, cy: number, r: number, col: string) => {
    for (let dy = -r; dy <= r; dy++) {
      const hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
      rect(cx - hw, cy + dy, hw * 2 + 1, 1, col);
    }
  };
  return { rect, disc };
}

/** линия гребня: сумма синусов с целым числом периодов на кусок — стыкуется сама */
function ridge(tw: number, seed: number, waves: [number, number][]) {
  const r = rng(seed);
  const ph = waves.map(() => r() * Math.PI * 2);
  return (x: number) => waves.reduce((s, [k, a], i) => s + a * Math.sin((2 * Math.PI * k * x) / tw + ph[i]), 0);
}

// ───── слои ─────

/** небо с Фудзи и солнцем: едет очень медленно, кусок шириной в три экрана */
function skyLayer(H: number): Layer {
  const w = SCENE_W * 3;
  const { c, ctx } = canvas(w, H);
  // рассветный градиент, переходы между полосами — точечным растром
  const bands = ['#262a6b', '#3a3487', '#5b3f99', '#8a4f9f', '#c2649f', '#ec8a8e', '#f8b07c', '#ffd28c'].map(hex);
  const img = ctx.createImageData(w, H);
  const span = Math.max(1, H - 46);
  for (let y = 0; y < H; y++) {
    const f = Math.min(bands.length - 1, (y / span) * (bands.length - 1));
    const b = Math.floor(f), fr = f - b;
    for (let x = 0; x < w; x++) {
      const col = bands[Math.min(bands.length - 1, b + (BAYER[(y & 3) * 4 + (x & 3)] / 16 < fr ? 1 : 0))];
      const i = (y * w + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const P = wrapPainter(ctx, w);
  const r = rng(7);
  // звёзды в самом верху
  for (let i = 0; i < 70; i++) {
    const y = Math.floor(r() * r() * H * 0.35);
    P.rect(r() * w, y, 1, 1, r() < 0.3 ? '#ffffff' : '#b9b4ff');
  }
  // солнце
  const cx = Math.round(SCENE_W * 0.52), base = H - 52;
  const sx = cx + 120, sy = H - 112;
  P.disc(sx, sy, 24, '#ffc98a');
  P.disc(sx, sy, 21, '#ffe2a6');
  P.disc(sx, sy, 17, '#fff3cf');
  // перистые облака
  for (let i = 0; i < 14; i++) {
    const x = r() * w, y = 18 + Math.floor(r() * (H - 130)), len = 24 + Math.floor(r() * 56);
    const warm = y > H * 0.35;
    P.rect(x, y, len, 2, warm ? '#ffd2bf' : '#a98ad0');
    P.rect(x + 6, y - 1, len - 16, 1, warm ? '#ffe6d6' : '#c3a6e2');
    P.rect(x + 3, y + 2, len - 4, 1, warm ? '#e99fb2' : '#7f68b8');
  }
  // Фудзи: вогнутые склоны, снежная шапка с зубцами, тень справа
  const peak = Math.max(28, H - 158), hh = base - peak;
  const tooth = ridge(64, 3, [[3, 2], [7, 1.2], [13, 0.8]]);
  for (let y = peak; y < H; y++) {
    const d = y - peak;
    const hw = Math.round(7 + 200 * Math.pow(Math.min(d, hh) / hh, 1.55) + Math.max(0, d - hh) * 4);
    for (let x = -hw; x <= hw; x++) {
      const snowLine = hh * 0.3 + tooth(x + 64) * 1.6 + (x > 0 ? 3 : 0);
      let col: string;
      if (d < snowLine) col = x > 1 ? '#c7c3ee' : x > -hw + 2 ? '#f6f4ff' : '#ffffff';
      else col = x > 1 ? '#423d8a' : x > -hw + 2 ? '#5751a6' : '#6d68bd';
      // кратер: на самой вершине неровный срез
      if (d < 2 && (x + 64) % 3 === 0) continue;
      ctx.fillStyle = col;
      ctx.fillRect(cx + x, y, 1, 1);
    }
  }
  return { c, speed: 0.008 };
}

/** дальние горы в дымке */
function farLayer(): Layer {
  const h = 96;
  const { c, ctx } = canvas(TW, h);
  const f = ridge(TW, 11, [[1, 12], [2, 8], [5, 5], [11, 2.5], [23, 1]]);
  for (let x = 0; x < TW; x++) {
    const top = Math.round(40 + f(x));
    ctx.fillStyle = '#8b7fc6'; ctx.fillRect(x, top, 1, 1);
    ctx.fillStyle = '#7468b4'; ctx.fillRect(x, top + 1, 1, h);
  }
  // туманная полоса у подножия
  for (let x = 0; x < TW; x++) for (let y = h - 24; y < h; y++) {
    if (BAYER[(y & 3) * 4 + (x & 3)] / 16 < (y - (h - 24)) / 24) { ctx.fillStyle = '#9a86c4'; ctx.fillRect(x, y, 1, 1); }
  }
  return { c, speed: 0.1, bottom: 52 };
}

/** лесистые холмы */
function hillLayer(): Layer {
  const h = 74;
  const { c, ctx } = canvas(TW, h);
  const f = ridge(TW, 23, [[2, 9], [3, 6], [7, 3], [16, 1.5]]);
  for (let x = 0; x < TW; x++) {
    // кроны деревьев — полукруглые бугорки по 6 пикселей
    const k = x % 6, bump = Math.round(Math.sqrt(Math.max(0, 9 - (k - 2.5) ** 2)));
    const top = Math.round(30 + f(x)) - bump;
    ctx.fillStyle = '#4d8a8a'; ctx.fillRect(x, top, 1, 1);
    ctx.fillStyle = '#356f78'; ctx.fillRect(x, top + 1, 1, 2);
    ctx.fillStyle = '#2b5a68'; ctx.fillRect(x, top + 3, 1, h);
  }
  return { c, speed: 0.2, bottom: 48 };
}

/** средний план: сакура, пагода, тории, домики */
function midLayer(): Layer {
  const h = 92, g = h - 12; // g — линия земли
  const { c, ctx } = canvas(TW, h);
  const P = wrapPainter(ctx, TW);
  const r = rng(41);
  // земля
  P.rect(0, g, TW, h - g, '#3e7b4b');
  P.rect(0, g, TW, 1, '#58a05a');
  for (let i = 0; i < 90; i++) P.rect(r() * TW, g + 2 + Math.floor(r() * (h - g - 2)), 2, 1, '#356c42');

  const pine = (x: number) => {
    P.rect(x - 1, g - 10, 2, 10, '#3b2a2a');
    for (let i = 0; i < 4; i++) P.rect(x - 7 + i, g - 12 - i * 5, 14 - i * 2, 4, i % 2 ? '#2a5d40' : '#22503a');
  };
  const sakura = (x: number, s: number) => {
    const th = 8 + s;
    P.rect(x - 1, g - th, 3, th, '#4a2c32');
    P.rect(x - 4, g - th - 1, 3, 1, '#4a2c32');
    P.rect(x + 2, g - th - 2, 3, 1, '#4a2c32');
    const cy = g - th - 6 - s;
    const blobs: [number, number, number][] = [[0, 0, 8 + s], [-8 - s, 3, 6 + s / 2], [8 + s, 2, 6 + s / 2], [-3, -6, 6], [5, -5, 6]];
    for (const [dx, dy, rr] of blobs) P.disc(x + dx, cy + dy + 1, rr, '#c8628f');
    for (const [dx, dy, rr] of blobs) P.disc(x + dx, cy + dy, rr, '#f09cbf');
    for (const [dx, dy, rr] of blobs) P.disc(x + dx - 2, cy + dy - 2, Math.max(1, rr - 4), '#ffc6dc');
  };
  const torii = (x: number) => {
    const red = '#e0383e', dark = '#9e2230';
    P.rect(x - 9, g - 26, 3, 26, red); P.rect(x + 7, g - 26, 3, 26, red);
    P.rect(x - 7, g - 26, 1, 26, dark); P.rect(x + 9, g - 26, 1, 26, dark);
    P.rect(x - 14, g - 30, 29, 3, '#2a2236');
    P.rect(x - 15, g - 31, 3, 1, '#2a2236'); P.rect(x + 13, g - 31, 3, 1, '#2a2236');
    P.rect(x - 12, g - 27, 25, 2, red);
    P.rect(x - 11, g - 21, 23, 2, red);
    P.rect(x - 1, g - 25, 3, 4, dark);
  };
  const pagoda = (x: number) => {
    const wall = '#d8c9a8', wood = '#7a3b30', roof = '#3a3152', roofHi = '#5a4f78';
    for (let i = 0; i < 5; i++) {
      const y = g - 10 - i * 11, ww = 18 - i * 2;
      P.rect(x - ww / 2 + 3, y, ww - 6, 9, wall);
      P.rect(x - ww / 2 + 3, y, 1, 9, wood); P.rect(x + ww / 2 - 4, y, 1, 9, wood);
      P.rect(x - 1, y + 3, 2, 4, wood);
      P.rect(x - ww / 2 - 3, y - 2, ww + 6, 2, roof);
      P.rect(x - ww / 2 - 4, y - 3, 2, 1, roof); P.rect(x + ww / 2 + 2, y - 3, 2, 1, roof);
      P.rect(x - ww / 2 - 1, y - 3, ww + 2, 1, roofHi);
    }
    P.rect(x - 1, g - 72, 2, 9, '#c9a24a');
    P.rect(x - 2, g - 66, 4, 1, '#c9a24a'); P.rect(x - 2, g - 69, 4, 1, '#c9a24a');
    P.rect(x - 11, g - 10, 22, 10, wall);
    P.rect(x - 3, g - 7, 6, 7, wood);
  };
  const house = (x: number, w: number) => {
    const wall = '#efe3c8', wood = '#6b3e2e', roof = '#45405e', roofHi = '#615b80';
    P.rect(x, g - 12, w, 12, wall);
    for (let i = 0; i <= w; i += 6) P.rect(x + i, g - 12, 1, 12, wood);
    P.rect(x + 2, g - 9, w - 4, 1, wood);
    P.rect(x + Math.floor(w / 2) - 2, g - 7, 4, 7, '#3a2a2a');
    P.rect(x - 3, g - 16, w + 6, 4, roof);
    P.rect(x - 4, g - 17, 2, 1, roof); P.rect(x + w + 2, g - 17, 2, 1, roof);
    P.rect(x - 1, g - 17, w + 2, 1, roofHi);
    P.rect(x + 2, g - 19, w - 4, 2, roof);
  };
  // раскладка куска: два «квартала» с пагодой и тории, между ними сакура и сосны
  pagoda(120);
  house(150, 22); house(186, 16);
  torii(470);
  house(520, 24); house(600, 18);
  for (const x of [30, 70, 230, 300, 360, 420, 560, 660, 720]) sakura(x, Math.floor(r() * 4));
  for (const x of [95, 255, 335, 400, 640, 700]) pine(x);
  return { c, speed: 0.38, bottom: 42 };
}

/** ближний план: каменные фонари, кусты, бамбуковая изгородь */
function nearLayer(): Layer {
  const h = 44, g = h - 1;
  const { c, ctx } = canvas(TW, h);
  const P = wrapPainter(ctx, TW);
  const r = rng(77);
  const bush = (x: number, w: number) => {
    const n = Math.max(2, Math.round(w / 7));
    for (let i = 0; i < n; i++) P.disc(x + i * 7, g - 5 - (i % 2) * 2, 6, '#2b6337');
    for (let i = 0; i < n; i++) P.disc(x + i * 7 - 1, g - 7 - (i % 2) * 2, 4, '#3f8a45');
    for (let i = 0; i < n; i++) P.rect(x + i * 7 - 3, g - 10 - (i % 2) * 2, 2, 1, '#6cbc5e');
  };
  const lantern = (x: number) => {
    const s = '#9a9cb0', d = '#6b6d84', l = '#c4c6d6';
    P.rect(x - 2, g - 9, 5, 9, s); P.rect(x + 2, g - 9, 1, 9, d);
    P.rect(x - 4, g - 12, 9, 3, s); P.rect(x - 4, g - 12, 9, 1, l);
    P.rect(x - 3, g - 19, 7, 7, s); P.rect(x - 1, g - 17, 3, 3, '#ffd77a');
    P.rect(x + 3, g - 19, 1, 7, d);
    P.rect(x - 5, g - 22, 11, 3, d); P.rect(x - 6, g - 21, 1, 1, d); P.rect(x + 6, g - 21, 1, 1, d);
    P.rect(x - 4, g - 22, 9, 1, l);
    P.rect(x, g - 24, 1, 2, d);
    P.rect(x - 4, g, 9, 1, '#4a4c60');
  };
  const fence = (x: number, w: number) => {
    for (let i = 0; i < w; i += 4) { P.rect(x + i, g - 13, 2, 13, '#c9b46a'); P.rect(x + i + 1, g - 13, 1, 13, '#9c8848'); }
    P.rect(x - 1, g - 10, w + 2, 1, '#6b5a30'); P.rect(x - 1, g - 5, w + 2, 1, '#6b5a30');
  };
  for (const x of [60, 250, 440, 650]) lantern(x);
  for (const [x, w] of [[90, 30], [300, 20], [500, 40], [700, 22]] as const) bush(x, w);
  for (const [x, w] of [[150, 60], [560, 50]] as const) fence(x, w);
  for (let i = 0; i < 40; i++) P.rect(r() * TW, g - 1 - Math.floor(r() * 2), 1, 2, '#4f9a48');
  return { c, speed: 0.62, bottom: 39 };
}

/** сама тропа с травой по краям */
function roadLayer(): Layer {
  const h = 44;
  const { c, ctx } = canvas(TW, h);
  const P = wrapPainter(ctx, TW);
  const r = rng(99);
  P.rect(0, 0, TW, h, '#5aa848');
  P.rect(0, 0, TW, 2, '#4a9440');
  // дорожка
  const top = 6, bot = 35;
  P.rect(0, top, TW, bot - top, '#d2aa6a');
  P.rect(0, top, TW, 1, '#b58e55');
  P.rect(0, bot - 1, TW, 1, '#b58e55');
  for (let i = 0; i < 260; i++) P.rect(r() * TW, top + 1 + Math.floor(r() * (bot - top - 2)), r() < 0.5 ? 2 : 1, 1, r() < 0.6 ? '#bf9658' : '#e4c690');
  // колея
  for (const y of [top + 9, top + 20]) for (let x = 0; x < TW; x += 1) if (((x * 7) % 11) < 8) P.rect(x, y, 1, 1, '#c29c5f');
  // камешки
  for (let i = 0; i < 30; i++) {
    const x = r() * TW, y = top + 2 + Math.floor(r() * (bot - top - 5));
    P.rect(x, y, 3, 2, '#9b9488'); P.rect(x, y, 2, 1, '#c8c1b2');
  }
  // трава, наползающая на края дорожки
  for (let x = 0; x < TW; x += 2) {
    const a = Math.floor(r() * 3), b = Math.floor(r() * 3);
    P.rect(x, top - 1, 1, a + 1, '#4a9440');
    P.rect(x, bot - b, 1, b + 1, '#5aa848');
  }
  for (let i = 0; i < 120; i++) P.rect(r() * TW, bot + 1 + Math.floor(r() * (h - bot - 2)), 1, 2, r() < 0.5 ? '#4a9440' : '#74c25c');
  return { c, speed: 1 };
}

/** передний план: пучки травы и цветы поверх ног */
function frontLayer(): Layer {
  const h = 16;
  const { c, ctx } = canvas(TW, h);
  const P = wrapPainter(ctx, TW);
  const r = rng(123);
  for (let i = 0; i < 46; i++) {
    const x = r() * TW, tall = 4 + Math.floor(r() * 8);
    for (let k = 0; k < 5; k++) {
      const bh = tall - Math.abs(k - 2) * 2;
      P.rect(x + k, h - bh, 1, bh, k % 2 ? '#2f7a36' : '#3f9a44');
    }
    if (r() < 0.35) { P.rect(x + 2, h - tall - 2, 2, 2, r() < 0.5 ? '#ffe36b' : '#ff8fb4'); }
  }
  return { c, speed: 1.45 };
}

// ───── сцена ─────

export interface Walker { id: string; name: string; look: LookSrc }

interface WState { x: number; seen: number; phase: number }

/** лепесток сакуры */
interface Petal { x: number; y: number; vx: number; vy: number; ph: number; c: string }

export class LobbyScene {
  private ctx: CanvasRenderingContext2D;
  private layers: { sky: Layer; rest: Layer[]; front: Layer } | null = null;
  private H = 216;
  private raf = 0;
  private t0 = performance.now();
  private last = performance.now();
  private walkers: Walker[] = [];
  private ws = new Map<string, WState>();
  private petals: Petal[] = [];
  /** где сейчас подпись над головой: x, y в долях холста */
  onLabels?: (pos: Record<string, { x: number; y: number }>) => void;

  constructor(private cv: HTMLCanvasElement) {
    this.ctx = cv.getContext('2d')!;
    this.resize();
    const r = rng(5);
    for (let i = 0; i < 34; i++) this.petals.push({ x: r() * SCENE_W, y: r() * this.H, vx: -(8 + r() * 14), vy: 5 + r() * 7, ph: r() * 6, c: r() < 0.5 ? '#ffc6dc' : '#f59cc0' });
    this.raf = requestAnimationFrame(this.frame);
  }

  /** высота рисунка — по пропорциям элемента */
  resize() {
    const box = this.cv.getBoundingClientRect();
    const H = Math.max(160, Math.round((SCENE_W * (box.height || 9)) / (box.width || 16)));
    if (H === this.H && this.layers) return;
    this.H = H;
    this.cv.width = SCENE_W;
    this.cv.height = H;
    this.ctx.imageSmoothingEnabled = false;
    this.layers = { sky: skyLayer(H), rest: [farLayer(), hillLayer(), midLayer(), roadLayer(), nearLayer()], front: frontLayer() };
  }

  setWalkers(list: Walker[]) {
    this.walkers = list;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  /** место в колонне: первый вошедший — впереди (справа), новые пристраиваются сзади */
  private slot(i: number, n: number) {
    const gap = 28;
    const right = Math.round(SCENE_W / 2 + ((n - 1) * gap) / 2) - CHAR_W / 2;
    return { x: right - i * gap, foot: this.H - (i % 2 ? FOOT_FRONT : FOOT_BACK) };
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const L = this.layers;
    if (!L) return;
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    const ctx = this.ctx, H = this.H;
    const draw = (l: Layer) => {
      const w = l.c.width;
      const off = Math.floor(t * ROAD_SPEED * l.speed) % w;
      const y = H - l.c.height - (l.bottom ?? 0);
      for (let x = -off; x < SCENE_W; x += w) ctx.drawImage(l.c, x, y);
    };
    draw(L.sky);
    for (const l of L.rest) draw(l);

    // игроки: идут на месте (мир едет), новые входят слева и догоняют своё место
    const n = this.walkers.length;
    const live = new Set<string>();
    const order = this.walkers.map((w, i) => ({ w, i, s: this.slot(i, n) })).sort((a, b) => a.s.foot - b.s.foot);
    const labels: Record<string, { x: number; y: number }> = {};
    for (const { w, s } of order) {
      live.add(w.id);
      let st = this.ws.get(w.id);
      if (!st) this.ws.set(w.id, (st = { x: -CHAR_W - 6, seen: now, phase: Math.random() }));
      const d = s.x - st.x;
      const moving = Math.abs(d) > 0.5;
      st.x += Math.sign(d) * Math.min(Math.abs(d), (d > 0 ? 42 : 20) * dt);
      const stepMs = moving && d > 0 ? 110 : 170;
      const f = Math.floor(now / stepMs + st.phase * 2) % 2;
      const x = Math.round(st.x), top = s.foot - CHAR_H + (f ? 0 : -1);
      ctx.fillStyle = 'rgba(30,20,10,0.28)';
      ctx.fillRect(x + 3, s.foot - 1, CHAR_W - 6, 2);
      ctx.fillRect(x + 5, s.foot, CHAR_W - 10, 1);
      ctx.drawImage(characterCanvas(w.look, 1, f ? 2 : 0), x, top);
      labels[w.id] = { x: (x + CHAR_W / 2) / SCENE_W, y: (top - 1) / H };
    }
    for (const id of [...this.ws.keys()]) if (!live.has(id)) this.ws.delete(id);
    draw(L.front);

    // лепестки
    for (const p of this.petals) {
      p.x += (p.vx - ROAD_SPEED * 0.3) * dt;
      p.y += p.vy * dt;
      p.ph += dt * 3;
      if (p.x < -4) p.x += SCENE_W + 8;
      if (p.y > H) { p.y = -2; p.x = Math.random() * (SCENE_W + 40); }
      ctx.fillStyle = p.c;
      const px = Math.round(p.x + Math.sin(p.ph) * 3), py = Math.round(p.y);
      ctx.fillRect(px, py, Math.sin(p.ph * 0.7) > 0 ? 2 : 1, 1);
    }
    this.onLabels?.(labels);
  };
}
