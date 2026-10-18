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

// ───── иконки тем (скиллов) 10×10 ─────
// X — цвет темы, W — белый, . — пусто. Контур рисуется автоматически.
const TOPIC_ICONS: Record<string, string[]> = {
  music: [
    '......XX..',
    '......XXX.',
    '......X.XX',
    '......X..X',
    '......X...',
    '......X...',
    '..XXXXX...',
    '.XXXXXX...',
    '.XXXXX....',
    '..XXX.....',
  ],
  culture: [
    'XXXXXXXXXX',
    '.XXXXXXXX.',
    '..X....X..',
    'XXXXXXXXXX',
    '..X....X..',
    '..X....X..',
    '..X....X..',
    '..X....X..',
    '..X....X..',
    '.XX....XX.',
  ],
  geo: [
    '..........',
    '....WW....',
    '...WWWW...',
    '..WXWWXW..',
    '..XXXXXX..',
    '.XXXXXXXX.',
    '.XXXXXXXX.',
    'XXXXXXXXXX',
    'XXXXXXXXXX',
    '..........',
  ],
};
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

const iconCache = new Map<string, string>();
export function topicIconUrl(id: string, color: string, scale = 3): string {
  const k = `${id}|${color}|${scale}`;
  let u = iconCache.get(k);
  if (u) return u;
  const rows = (TOPIC_ICONS[id] ?? DIAMOND).map((r) => r.split(''));
  const c = document.createElement('canvas');
  c.width = 12 * scale;
  c.height = 12 * scale;
  const ctx = c.getContext('2d')!;
  const filled = (x: number, y: number) => rows[y]?.[x] !== undefined && rows[y][x] !== '.';
  ctx.fillStyle = '#000';
  for (let y = -1; y <= 10; y++) for (let x = -1; x <= 10; x++) {
    if (filled(x, y)) continue;
    if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
  }
  rows.forEach((r, y) => r.forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = ch === 'W' ? '#ffffff' : color;
    ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
  }));
  u = c.toDataURL();
  iconCache.set(k, u);
  return u;
}

// ───── пиксельные иконки (награды на карте, игровые автоматы, звёзды в интерфейсе) ─────
// Буквы — цвета из ICON_PAL, . — пусто. Чёрный контур и тень снизу рисуются автоматически,
// чтобы иконка читалась поверх пёстрой карты.
const ICON_PAL: Record<string, string> = {
  Y: '#ffd23f', O: '#e0861e', W: '#ffffff', D: '#6b3d10', R: '#ec3a52', M: '#9a1f34',
  B: '#8fd8ff', G: '#5ce16b', P: '#c77dff', S: '#c9ced8', K: '#2a2a3a',
};
const PIXEL_ICONS: Record<string, string[]> = {
  stars: [
    '....Y....',
    '....Y....',
    '...YWY...',
    'YYYYWYYYY',
    '.YYYYYYO.',
    '..YYYYO..',
    '..YYOYY..',
    '.YYO.OYO.',
    '.YO...OO.',
  ],
  money: [
    '..OOOOOO..',
    '.OYYYYYYO.',
    'OYDYYYYDYO',
    'OYYDYYDYYO',
    'OYYYDDYYYO',
    'OYYDDDDYYO',
    'OYYYDDYYYO',
    'OYYDDDDYYO',
    '.OYYDDYYO.',
    '..OOOOOO..',
  ],
  bonus: [
    '.YY....YY.',
    'Y..Y..Y..Y',
    '.YYYYYYYY.',
    'RRRRYYRRRR',
    'RWRRYYRRRR',
    'MMMMYYMMMM',
    '.RRRYYRRR.',
    '.RRRYYRRR.',
    '.RRRYYRRR.',
    '.MMMYYMMM.',
  ],
  special: [
    '....R.....',
    '.R..RR..R.',
    '.RRROORRR.',
    '..ROYYOR..',
    'RROYWWYORR',
    '.ROYWWYOR.',
    '..ROYYORR.',
    '.RRROORR..',
    '.R..RR..R.',
    '.....R....',
  ],
  prize: [
    'YYYYYYYYYY',
    'Y.YWYYYO.Y',
    'Y.YWYYYO.Y',
    '.YYWYYYOY.',
    '..YYYYYO..',
    '...YYYO...',
    '....YO....',
    '....YO....',
    '...YYYO...',
    '..DDDDDD..',
  ],
  pachinko: [
    '.RRRRRRRR.',
    'RBBBBBBBBR',
    'RBWBBWBBBR',
    'RBBBWBBWBR',
    'RBWBBSBBBR',
    'RBBBBBBBBR',
    'RRRRRRRRRR',
    'RKKYYYYKKR',
    'RKKKKKKKKR',
    '.MM....MM.',
  ],
  ring: [
    '...RRYY...',
    '..R....Y..',
    '.P......G.',
    '.P..YY..G.',
    '.B..YY..R.',
    '.B......R.',
    '..G....P..',
    '...GBBP...',
    '....DD....',
    '...DDDD...',
  ],
};

const pixCache = new Map<string, HTMLCanvasElement>();
/** иконка с контуром; размер холста (w+2)×(h+3) клеток по scale пикселей */
export function pixelIcon(id: string, scale = 1): HTMLCanvasElement {
  const key = id + '|' + scale;
  const c0 = pixCache.get(key);
  if (c0) return c0;
  const rows = (PIXEL_ICONS[id] ?? PIXEL_ICONS.stars).map((r) => r.split(''));
  const h = rows.length, w = rows[0].length;
  const filled = (x: number, y: number) => (rows[y]?.[x] ?? '.') !== '.';
  const c = document.createElement('canvas');
  c.width = (w + 2) * scale;
  c.height = (h + 3) * scale;
  const ctx = c.getContext('2d')!;
  const px = (x: number, y: number) => ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (filled(x + dx, y + dy)) return true;
    return false;
  };
  // тень: контур, сдвинутый на клетку вниз
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  for (let y = 0; y <= h + 1; y++) for (let x = -1; x <= w; x++) if (near(x, y - 1)) px(x, y);
  ctx.fillStyle = '#0d0d1a';
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) if (!filled(x, y) && near(x, y)) {
    ctx.clearRect((x + 1) * scale, (y + 1) * scale, scale, scale);
    px(x, y);
  }
  rows.forEach((r, y) => r.forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = ICON_PAL[ch] ?? '#f0f';
    ctx.clearRect((x + 1) * scale, (y + 1) * scale, scale, scale);
    px(x, y);
  }));
  pixCache.set(key, c);
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
