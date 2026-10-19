// Картинки джа-одори: src/img/dragon/*.png (рисуются в Nano Banana, см. README в той же папке).
// Нет файла — рисуем запасной пиксельный спрайт из кода, игра работает и без картинок.
//   street.png — улица (ближний план, тайлится по горизонтали; низ — мостовая, по ней идут игроки)
//   sky.png    — небо и дальний план (необязательно; если есть — едет медленнее улицы, параллакс)
//   head.png, body.png, tail.png — голова, кусок туловища, хвост: вид сбоку, смотрит вправо
//   pearl.png  — жемчужина, за которой гонится дракон
const files = import.meta.glob<string>('../img/dragon/*.png', { eager: true, import: 'default', query: '?url' });

export type DragonPart = 'street' | 'sky' | 'head' | 'body' | 'tail' | 'pearl';

/** где на street.png проходит мостовая (доля высоты от верха): здесь стоят ноги игроков */
export const STREET_GROUND = 0.9;

const imgs = new Map<DragonPart, HTMLImageElement>();
for (const [path, url] of Object.entries(files)) {
  const name = path.replace(/^.*\/|\.png$/g, '') as DragonPart;
  const img = new Image();
  img.src = url;
  imgs.set(name, img);
}

/** картинка из папки (если файл есть и уже загрузился) или запасной спрайт; null — рисовать нечего */
export function dragonImg(part: DragonPart): CanvasImageSource & { width: number; height: number } | null {
  const img = imgs.get(part);
  if (img?.complete && img.naturalWidth) return img;
  if (part === 'street' || part === 'sky') return null;
  return fallback(part);
}

// ───── запасные спрайты (пока нет картинок) ─────
// k контур, g/G зелёная чешуя, y/Y золотое брюхо, r красные плавники и грива, w белый, e глаз, o рог
const PAL: Record<string, string> = {
  k: '#1a1a2e', g: '#3fbf6f', G: '#2a8a4f', y: '#ffd23f', Y: '#d9a21b', r: '#e8433a', R: '#a82424', w: '#ffffff', e: '#111111', o: '#f3e3b0',
};
const ART: Record<'head' | 'body' | 'tail' | 'pearl', string[]> = {
  head: [
    '...........oo....oo.....',
    '............oo..oo......',
    '..rr.........oooo.......',
    '.rrRr...kkkkkkkkkk......',
    'rrRrrrkkgggggggggGk.....',
    '.rrrrkggggggggwwgggk....',
    'rrRrkgggGgggggwekgggk...',
    '.rrkggggggGggggkggggkkk.',
    'rrkgggGggggggggggggggggk',
    '.rkggggggggggggkkkkkkkkk',
    'rrkgggGgggggggkrrrrrrr..',
    '.rkggggggggggk.wwwwww...',
    'rrkggggggggggggkkkkkkk..',
    '.rkyyyyyyyyyyyyyyyyyyk..',
    'rrkyyYyyyYyyyYyyyyyk....',
    '.rrkkkkkkkkkkkkkkkkk....',
    '..rr...........w........',
    '................ww......',
  ],
  body: [
    '...r....r...',
    '..rrr..rRr..',
    'kkkkkkkkkkkk',
    'gGggGggGggGg',
    'ggGggGggGggG',
    'gggggggggggg',
    'GgggGgggGggg',
    'yyyyyyyyyyyy',
    'yYyyyYyyyYyy',
    'kkkkkkkkkkkk',
  ],
  tail: [
    'rr..............',
    'rRr.........kkkk',
    '.rRr.....kkkgggg',
    '..rrr..kkggGgggg',
    '...rrkkgggggGggg',
    '..rRkgggGggggggg',
    '.rrr.kkyyyyyyyyy',
    'rRr....kkyYyyyyy',
    'rr.......kkkkkkk',
  ],
  pearl: [
    '..rrrr..',
    '.ryyyyr.',
    'ryywyyyr',
    'rywwyyYr',
    'ryyyyyYr',
    'ryyyyYYr',
    '.rYYYYr.',
    '..rrrr..',
  ],
};
const fb = new Map<string, HTMLCanvasElement>();
function fallback(part: 'head' | 'body' | 'tail' | 'pearl') {
  let c = fb.get(part);
  if (c) return c;
  const rows = ART[part];
  c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const ctx = c.getContext('2d')!;
  rows.forEach((r, y) => r.split('').forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = PAL[ch] ?? '#f0f';
    ctx.fillRect(x, y, 1, 1);
  }));
  fb.set(part, c);
  return c;
}

// ───── запасная улица: ночной Нагасаки, фонари, мостовая ─────
// Рисуется в «пикселях» мира (высота 180), CSS/canvas растягивает без сглаживания.
const STREET_H = 180;
let streetFb: HTMLCanvasElement | null = null;
export function fallbackStreet(): HTMLCanvasElement {
  if (streetFb) return streetFb;
  const W = 320, H = STREET_H;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  // небо
  const bands = ['#0d0f2b', '#121640', '#181d52', '#1f2463', '#272b70'];
  bands.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, (i * H * 0.55) / bands.length, W, (H * 0.55) / bands.length + 1); });
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = '#e8e6ff';
  for (let i = 0; i < 40; i++) ctx.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H * 0.4), 1, 1);
  // холмы
  ctx.fillStyle = '#1a2a3a';
  for (let x = 0; x < W; x++) {
    const h = 70 + Math.sin((x / W) * Math.PI * 4) * 8 + Math.sin((x / W) * Math.PI * 10) * 3;
    ctx.fillRect(x, h, 1, H);
  }
  // дома с черепичными крышами
  const ground = Math.round(H * STREET_GROUND);
  let x = 0;
  while (x < W) {
    const w = 34 + Math.floor(rnd() * 26);
    const h = 46 + Math.floor(rnd() * 34);
    const top = ground - 14 - h;
    ctx.fillStyle = rnd() < 0.5 ? '#5b2a2a' : '#3b2f4a';
    ctx.fillRect(x, top, w, h);
    ctx.fillStyle = '#20182e';
    ctx.fillRect(x - 3, top - 6, w + 6, 6);
    ctx.fillRect(x - 1, top - 9, w + 2, 3);
    ctx.fillStyle = '#ffcf6b';
    for (let wy = top + 8; wy < top + h - 14; wy += 14) for (let wx = x + 5; wx < x + w - 8; wx += 12) if (rnd() < 0.7) ctx.fillRect(wx, wy, 6, 7);
    ctx.fillStyle = '#2a1a14';
    ctx.fillRect(x + Math.floor(w / 2) - 5, top + h - 16, 10, 16);
    x += w + 2 + Math.floor(rnd() * 6);
  }
  // гирлянда фонарей
  for (let lx = 6; lx < W; lx += 16) {
    const ly = 60 + Math.round(Math.sin((lx / W) * Math.PI * 2) * 3);
    ctx.fillStyle = '#3a2a2a';
    ctx.fillRect(lx - 8, ly - 3, 16, 1);
    ctx.fillStyle = '#e8433a';
    ctx.fillRect(lx - 3, ly, 6, 7);
    ctx.fillStyle = '#ff9a6b';
    ctx.fillRect(lx - 2, ly + 1, 2, 5);
    ctx.fillStyle = '#20182e';
    ctx.fillRect(lx - 2, ly - 1, 4, 1);
    ctx.fillRect(lx - 2, ly + 7, 4, 1);
  }
  // тротуар и мостовая
  ctx.fillStyle = '#4a4a5e';
  ctx.fillRect(0, ground - 14, W, 14);
  ctx.fillStyle = '#3a3a4c';
  ctx.fillRect(0, ground, W, H - ground);
  ctx.fillStyle = '#2e2e3e';
  for (let gx = 0; gx < W; gx += 8) ctx.fillRect(gx, ground + ((gx / 8) % 2 ? 4 : 10), 6, 1);
  ctx.fillStyle = '#58587a';
  ctx.fillRect(0, ground - 14, W, 1);
  streetFb = c;
  return c;
}
