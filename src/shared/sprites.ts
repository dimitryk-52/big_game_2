// Процедурные пиксельные персонажи (временные — потом заменим на нарисованные).
const SKIN = '#f6c9a0';
const HAIR = '#2b1d1a';

// 12×16, символы: . пусто, s кожа, h волосы, e глаз, b тело (цвет игрока), d тёмное тело, l ноги, w белый, m рот
const BASE = [
  '............',
  '............',
  '....hhhh....',
  '...hhhhhh...',
  '...hssssh...',
  '...sesses...',
  '...ssssss...',
  '....smms....',
  '...bbbbbb...',
  '..sbbwwbbs..',
  '..sbbbbbbs..',
  '...bbbbbb...',
  '...dddddd...',
  '...ll..ll...',
  '...ll..ll...',
  '...kk..kk...',
];
// шляпы рисуются поверх первых строк
const HATS: string[][] = [
  // кепка
  ['............', '....cccc....', '...cccccc...', '...cccccccc.'],
  // хатимаки (повязка)
  ['............', '............', '....hhhh....', '...whrwwhw..'],
  // корона
  ['....y.y.y...', '....yyyyy...', '...yyyyyy...', '............'],
  // ушки
  ['...c....c...', '...cc..cc...', '...hhhhhh...', '............'],
  // без шляпы
  [],
];

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const cache = new Map<string, HTMLCanvasElement>();

export function characterCanvas(color: string, hat: number, scale = 1, frame = 0): HTMLCanvasElement {
  const key = `${color}|${hat}|${scale}|${frame}`;
  const c0 = cache.get(key);
  if (c0) return c0;
  const rows = BASE.map((r) => r.split(''));
  const hatRows = HATS[hat % HATS.length] ?? [];
  hatRows.forEach((r, i) => r.split('').forEach((ch, j) => { if (ch !== '.') rows[i][j] = ch; }));
  if (frame === 1) {
    // шаг: ноги в другой позиции
    rows[13] = '...ll...ll..'.split('');
    rows[14] = '..ll....ll..'.split('');
    rows[15] = '..kk.....kk.'.split('');
  }
  const pal: Record<string, string> = {
    s: SKIN, h: HAIR, e: '#111', m: '#c0504d', b: color, d: shade(color, 0.6), l: '#33335a', k: '#111122', w: '#ffffff',
    c: color, r: '#e02828', y: '#ffd23f',
  };
  const c = document.createElement('canvas');
  c.width = 12 * scale;
  c.height = 16 * scale;
  const ctx = c.getContext('2d')!;
  // контур
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  rows.forEach((r, y) => r.forEach((ch, x) => {
    if (ch === '.') return;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = rows[y + dy]?.[x + dx];
      if (n === undefined || n === '.') ctx.fillRect((x + dx) * scale, (y + dy) * scale, scale, scale);
    }
  }));
  rows.forEach((r, y) => r.forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = pal[ch] ?? '#f0f';
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }));
  cache.set(key, c);
  return c;
}

const urlCache = new Map<string, string>();
export function characterUrl(color: string, hat: number, scale = 4) {
  const key = `${color}|${hat}|${scale}`;
  let u = urlCache.get(key);
  if (!u) {
    u = characterCanvas(color, hat, scale).toDataURL();
    urlCache.set(key, u);
  }
  return u;
}

// ───── иконки: рисунки в src/img/icons/*.png ─────
// Любой PNG с прозрачным фоном, один пиксель файла = один пиксель иконки (обычно 9–12 px).
// Имя файла — id иконки: money, stars, bonus, special, prize, pachinko, ring (карта, награды)
// и topic_<id темы> (скиллы: topic_music, topic_culture, topic_geo). Чёрный контур и тень
// добавляются автоматически — рисовать их не нужно. Новый файл подхватывается сам.
const iconFiles = import.meta.glob<string>('../img/icons/*.png', { eager: true, import: 'default', query: '?url' });

/** пиксели иконки: цвет (css) или null — пусто */
type Grid = (string | null)[][];
const grids = new Map<string, Grid>();

/** загрузить PNG иконок; вызывается один раз до первого рендера (main.tsx) */
export async function loadIcons() {
  await Promise.all(Object.entries(iconFiles).map(([path, url]) => new Promise<void>((ok) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const g: Grid = [];
      for (let y = 0; y < c.height; y++) {
        const row: (string | null)[] = [];
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          row.push(d[i + 3] < 128 ? null : `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`);
        }
        g.push(row);
      }
      grids.set(path.replace(/^.*\/|\.png$/g, ''), g);
      ok();
    };
    img.onerror = () => ok();
    img.src = url;
  })));
}

// запасная иконка темы без своего PNG: ромб цвета темы
const DIAMOND = [
  '....XX....',
  '...XXXX...',
  '..XXXXXX..',
  '.XXXWXXXX.',
  'XXXWWXXXXX',
  'XXXXXXXXXX',
  '.XXXXXXXX.',
  '..XXXXXX..',
  '...XXXX...',
  '....XX....',
];
const diamond = (color: string): Grid => DIAMOND.map((r) => r.split('').map((ch) => (ch === '.' ? null : ch === 'W' ? '#ffffff' : color)));
const MISSING: Grid = diamond('#ff00ff');

/** холст иконки с контуром (и тенью); scale — размер пикселя иконки */
function drawIcon(g: Grid, scale: number, shadow: boolean): HTMLCanvasElement {
  const h = g.length, w = g[0]?.length ?? 0;
  const filled = (x: number, y: number) => !!g[y]?.[x];
  const c = document.createElement('canvas');
  c.width = (w + 2) * scale;
  c.height = (h + (shadow ? 3 : 2)) * scale;
  const ctx = c.getContext('2d')!;
  const px = (x: number, y: number) => ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (filled(x + dx, y + dy)) return true;
    return false;
  };
  // тень: контур, сдвинутый на клетку вниз
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let y = 0; y <= h + 1; y++) for (let x = -1; x <= w; x++) if (near(x, y - 1)) px(x, y);
  }
  ctx.fillStyle = '#0d0d1a';
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) if (!filled(x, y) && near(x, y)) {
    ctx.clearRect((x + 1) * scale, (y + 1) * scale, scale, scale);
    px(x, y);
  }
  g.forEach((r, y) => r.forEach((col, x) => {
    if (!col) return;
    ctx.fillStyle = col;
    ctx.clearRect((x + 1) * scale, (y + 1) * scale, scale, scale);
    px(x, y);
  }));
  return c;
}

const iconCache = new Map<string, string>();
export function topicIconUrl(id: string, color: string, scale = 3): string {
  const k = `${id}|${color}|${scale}`;
  let u = iconCache.get(k);
  if (u) return u;
  u = drawIcon(grids.get('topic_' + id) ?? diamond(color), scale, false).toDataURL();
  iconCache.set(k, u);
  return u;
}

const pixCache = new Map<string, HTMLCanvasElement>();
/** иконка с контуром и тенью; размер холста (w+2)×(h+3) клеток по scale пикселей */
export function pixelIcon(id: string, scale = 1): HTMLCanvasElement {
  const key = id + '|' + scale;
  let c = pixCache.get(key);
  if (!c) {
    c = drawIcon(grids.get(id) ?? MISSING, scale, true);
    pixCache.set(key, c);
  }
  return c;
}

const pixUrlCache = new Map<string, string>();
export function pixelIconUrl(id: string, scale = 3) {
  const key = id + '|' + scale;
  let u = pixUrlCache.get(key);
  if (!u) {
    u = pixelIcon(id, scale).toDataURL();
    pixUrlCache.set(key, u);
  }
  return u;
}

const badgeCache = new Map<string, HTMLCanvasElement>();
/**
 * Иконка награды на плашке-выноске: светлый фон, тёмный контур со срезанными углами
 * и треугольник-указатель вниз (кончик — нижний центр холста). scale — размер пикселя.
 */
export function pixelBadge(id: string, scale = 1): HTMLCanvasElement {
  const key = id + '|' + scale;
  const c0 = badgeCache.get(key);
  if (c0) return c0;
  const g = grids.get(id) ?? MISSING;
  const h = g.length, w = g[0]?.length ?? 0;
  const PAD = 2;
  const bw = w + PAD * 2 + 2, bh = h + PAD * 2 + 2; // плашка с контуром
  // середина плашки: один пиксель при нечётной ширине, два — при чётной (кончик тоже в два пикселя)
  const cl = Math.floor((bw - 1) / 2), cr = Math.ceil((bw - 1) / 2);
  const W = bw, H = bh + 4; // + указатель и тень
  // карта клеток: 0 пусто, 1 контур, 2 фон, 3 тень фона снизу
  const cell = Array.from({ length: H }, () => new Uint8Array(W));
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const cornerOut = (x === 0 || x === bw - 1) && (y === 0 || y === bh - 1);
    if (cornerOut) continue;
    const edge = x === 0 || y === 0 || x === bw - 1 || y === bh - 1;
    const cornerIn = (x === 1 || x === bw - 2) && (y === 1 || y === bh - 2);
    cell[y][x] = edge || cornerIn ? 1 : y === bh - 2 ? 3 : 2;
  }
  // указатель: треугольник, сливается с плашкой
  for (let k = 0; k < 4; k++) {
    const y = bh - 1 + k, half = 3 - k;
    for (let x = cl - half - 1; x <= cr + half + 1; x++) {
      if (x < 0 || x >= W) continue;
      const border = x === cl - half - 1 || x === cr + half + 1 || k === 3;
      cell[y][x] = border ? 1 : 3;
    }
  }
  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = (H + 1) * scale;
  const ctx = c.getContext('2d')!;
  const px = (x: number, y: number) => ctx.fillRect(x * scale, y * scale, scale, scale);
  // тень всей выноски на пиксель ниже
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cell[y][x]) px(x, y + 1);
  const colors = ['', '#0d0b1e', '#fff3d6', '#e2c48f'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = cell[y][x];
    if (!v) continue;
    ctx.clearRect(x * scale, y * scale, scale, scale);
    ctx.fillStyle = colors[v];
    px(x, y);
  }
  // иконка с тонким контуром внутри плашки
  const ox = 1 + PAD, oy = 1 + PAD;
  const filled = (x: number, y: number) => !!g[y]?.[x];
  ctx.fillStyle = '#0d0b1e';
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (filled(x, y)) continue;
    if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) px(ox + x, oy + y);
  }
  g.forEach((r, y) => r.forEach((col, x) => {
    if (!col) return;
    ctx.fillStyle = col;
    px(ox + x, oy + y);
  }));
  badgeCache.set(key, c);
  return c;
}

const badgeUrlCache = new Map<string, string>();
export function pixelBadgeUrl(id: string, scale = 3) {
  const key = id + '|' + scale;
  let u = badgeUrlCache.get(key);
  if (!u) {
    u = pixelBadge(id, scale).toDataURL();
    badgeUrlCache.set(key, u);
  }
  return u;
}
