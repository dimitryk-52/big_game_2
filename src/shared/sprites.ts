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
