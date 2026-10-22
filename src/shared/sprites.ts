// Модульные пиксельные персонажи: части в src/img/char/*.png (исходник art/chars/chars.px.js, холст 16×24,
// смотрят вправо). Цвета-маркеры перекрашиваются под внешность игрока, контур добавляется здесь.
import { BOTS, CLOTH_COLORS, DEFAULT_LOOK, HAIRS, HAIR_BACK, HAIR_COLORS, HATS, SKINS, TOPS, type Look } from './look';

const charFiles = import.meta.glob<string>('../img/char/*.png', { eager: true, import: 'default', query: '?url' });
/** пиксели части: '#rrggbb' или null */
type HexGrid = (string | null)[][];
const parts = new Map<string, HexGrid>();

function loadParts() {
  return Promise.all(Object.entries(charFiles).map(([path, url]) => new Promise<void>((ok) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const hex = (i: number) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      const g: HexGrid = [];
      for (let y = 0; y < c.height; y++) {
        const row: (string | null)[] = [];
        for (let x = 0; x < c.width; x++) row.push(d[(y * c.width + x) * 4 + 3] < 128 ? null : hex((y * c.width + x) * 4));
        g.push(row);
      }
      parts.set(path.replace(/^.*\/|\.png$/g, ''), g);
      ok();
    };
    img.onerror = () => ok();
    img.src = url;
  })));
}

// маркеры из chars.px.js → слот внешности
const MARK: Record<string, string> = {
  '#f2c49b': 's', '#c98b6b': 'S', '#7a4630': 'h', '#4e2a1e': 'H', '#e04858': 't', '#a02c40': 'T',
  '#3858c0': 'b', '#24387c': 'B', '#1a1a30': 'o', '#f0a830': 'c', '#b87018': 'C',
};

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}

/** что нужно для рисования персонажа */
export type LookSrc = { color: string; hat: number; look?: Look };
/** размер кадра с контуром, пиксели */
export const CHAR_W = 18;
export const CHAR_H = 26;

/** кадры: 0 — стоит, 1 — вдох (голова и туловище на 1px ниже), 2 — шаг */
export type CharFrame = 0 | 1 | 2;

function lookOf(p: LookSrc): Look { return p.look ?? DEFAULT_LOOK; }

function charKey(p: LookSrc) {
  const l = lookOf(p);
  return [p.color, p.hat, l.skin, l.hair, l.hairC, l.hatC, l.top, l.bot, l.botC].join('|');
}

/** собрать кадр в сетку 16×24 из цветов */
function composeChar(p: LookSrc, frame: CharFrame): HexGrid {
  const l = lookOf(p);
  const hair = HAIRS[l.hair % HAIRS.length].id;
  const hat = HATS[((p.hat % HATS.length) + HATS.length) % HATS.length];
  const bot = BOTS[l.bot % BOTS.length].id;
  const skin = SKINS[l.skin % SKINS.length], hc = HAIR_COLORS[l.hairC % HAIR_COLORS.length];
  const bc = CLOTH_COLORS[l.botC % CLOTH_COLORS.length], cc = CLOTH_COLORS[l.hatC % CLOTH_COLORS.length];
  const pal: Record<string, string> = {
    s: skin[0], S: skin[1], h: hc[0], H: hc[1], t: p.color, T: shade(p.color, 0.68),
    b: bc[0], B: bc[1], o: shade(bc[1], 0.6), c: cc[0], C: cc[1],
  };
  const out: HexGrid = Array.from({ length: 24 }, () => Array<string | null>(16).fill(null));
  const dy = frame === 1 ? 1 : 0;
  const hatGrid = parts.get('hat_' + hat.id);
  // по cover: top прячем волосы выше нижнего края убора
  let hairCut = -1;
  if (hat.cover === 'all') hairCut = 99;
  else if (hat.cover === 'top' && hatGrid) hatGrid.forEach((r, y) => { if (r.some(Boolean)) hairCut = y; });
  const put = (name: string, oy: number, isHair = false) => {
    const g = parts.get(name);
    if (!g) return;
    g.forEach((r, y) => r.forEach((c, x) => {
      if (!c || y + oy < 0 || y + oy >= 24) return;
      if (isHair && y < hairCut) return;
      out[y + oy][x] = pal[MARK[c]] ?? c;
    }));
  };
  if (HAIR_BACK.has(hair)) put('hairb_' + hair, dy, true);
  put('bot_' + bot + (frame === 2 ? '_w' : ''), 0);
  put('top_' + TOPS[l.top % TOPS.length].id, dy);
  put('head', dy);
  put('hair_' + hair, dy, true);
  put('hat_' + hat.id, dy);
  return out;
}

/** сетка цветов → холст с чёрным контуром (+1px со всех сторон) */
function gridCanvas(g: HexGrid, scale: number, flip: boolean) {
  const h = g.length, w = g[0]?.length ?? 0;
  const c = document.createElement('canvas');
  c.width = (w + 2) * scale;
  c.height = (h + 2) * scale;
  const ctx = c.getContext('2d')!;
  const X = (x: number) => (flip ? w - 1 - x : x) + 1;
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  g.forEach((r, y) => r.forEach((ch, x) => {
    if (!ch) return;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!g[y + dy]?.[x + dx]) ctx.fillRect(X(x + dx) * scale, (y + dy + 1) * scale, scale, scale);
    }
  }));
  g.forEach((r, y) => r.forEach((ch, x) => {
    if (!ch) return;
    ctx.fillStyle = ch;
    ctx.fillRect(X(x) * scale, (y + 1) * scale, scale, scale);
  }));
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();

/** персонаж CHAR_W×CHAR_H (×scale); flip — смотрит влево */
export function characterCanvas(p: LookSrc, scale = 1, frame: CharFrame = 0, flip = false): HTMLCanvasElement {
  const key = `${charKey(p)}|${scale}|${frame}|${flip ? 1 : 0}`;
  let c = cache.get(key);
  if (!c) cache.set(key, (c = gridCanvas(composeChar(p, frame), scale, flip)));
  return c;
}

const urlCache = new Map<string, string>();
export function characterUrl(p: LookSrc, scale = 4, frame: CharFrame = 0, flip = false) {
  const key = `${charKey(p)}|${scale}|${frame}|${flip ? 1 : 0}`;
  let u = urlCache.get(key);
  if (!u) urlCache.set(key, (u = characterCanvas(p, scale, frame, flip).toDataURL()));
  return u;
}

/** акита-ину: 18×12 с контуром; frame 1 — шаг */
export const AKITA_W = 20;
export const AKITA_H = 15;
export function akitaCanvas(scale = 1, frame: 0 | 1 = 0, flip = false): HTMLCanvasElement {
  const key = `akita|${scale}|${frame}|${flip ? 1 : 0}`;
  let c = cache.get(key);
  if (!c) cache.set(key, (c = gridCanvas(parts.get(frame ? 'akita_w' : 'akita') ?? [[null]], scale, flip)));
  return c;
}
export function akitaUrl(scale = 4, frame: 0 | 1 = 0, flip = false) {
  const key = `akita|${scale}|${frame}|${flip ? 1 : 0}`;
  let u = urlCache.get(key);
  if (!u) urlCache.set(key, (u = akitaCanvas(scale, frame, flip).toDataURL()));
  return u;
}

// ───── иконки: рисунки в src/img/icons/*.png ─────
// Любой PNG с прозрачным фоном, один пиксель файла = один пиксель иконки (обычно 9–12 px).
// Имя файла — id иконки: money, stars, bonus, prize, pachinko, ring (карта, награды); special — радужный шар спецтемы
// и topic_<id темы> (скиллы: topic_music, topic_culture, topic_geo). Чёрный контур и тень
// добавляются автоматически — рисовать их не нужно. Новый файл подхватывается сам.
const iconFiles = import.meta.glob<string>('../img/icons/*.png', { eager: true, import: 'default', query: '?url' });

/** пиксели иконки: цвет (css) или null — пусто */
type Grid = (string | null)[][];
const grids = new Map<string, Grid>();

/** загрузить PNG иконок; вызывается один раз до первого рендера (main.tsx) */
export async function loadIcons() {
  await Promise.all([loadParts(), ...Object.entries(iconFiles).map(([path, url]) => new Promise<void>((ok) => {
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
  }))]);
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

// групповые игры (выноски только в админке): кисть, лицо окамэ, полоска танзаку, катана, нож и кусок рыбы, дракон
const GROUP_PAL: Record<string, string> = { b: '#b5793a', g: '#c9ccd6', k: '#222233', s: '#ffe2c4', p: '#ff8fb0', r: '#d0304a', t: '#9fd3ff', y: '#e8b84a', w: '#ffffff' };
const GROUP_ART: Record<string, string[]> = {
  group_calligraphy: ['........bb', '.......bbb', '......bbb.', '.....bbb..', '....ggg...', '...ggg....', '..kkk.....', '.kkk......', 'kkk.......', 'kk........'],
  group_fukuwarai: ['..ssssss..', '.ssssssss.', 'ssssssssss', 'skksssskks', 'ssssssssss', 'spssssssps', 'sssrrrrsss', '.ssssssss.', '..ssssss..'],
  group_senryu: ['.kk.', 'tttt', 'tktt', 'tktt', 'tttt', 'tktt', 'tktt', 'tktt', 'tttt'],
  group_iaido: ['.........w', '........wg', '.......wg.', '......wg..', '.....wg...', '...ywg....', '...yy.....', '..rk.y....', '.rk.......', 'kr........'],
  group_sashimi: ['..........', '.ggggggggk', '.gggggggkk', '..gggggk..', '..........', '..pppppp..', '.pwpwpwpp.', '.pppppppp.', '..pppppp..'],
  group_dragon: ['......rr..', '.....rggr.', '....rgwkg.', '...ggggggy', '..gg..yyy.', '.gg.......', 'gg....gg..', 'g....gggg.', '....gg..gg', '...gg.....'],
};
for (const [id, rows] of Object.entries(GROUP_ART)) grids.set(id, rows.map((r) => r.split('').map((ch) => GROUP_PAL[ch] ?? null)));

// значки интерфейса вместо эмодзи и символов шрифта (✔ ✘ ⏱ ▶ ❤ …): <PixIcon id="ui_check" />, в тексте — см. PxText
const UI_PAL: Record<string, string> = {
  w: '#ffffff', g: '#c9ccd6', d: '#7a7f99', k: '#222233', r: '#e8364e', R: '#a51d33', G: '#5ce16b', y: '#ffd23f', o: '#ff9f43',
  b: '#4dabff', B: '#9a6232', s: '#ffe2c4', p: '#ff8fb0',
};
const UI_ART: Record<string, string[]> = {
  ui_check: ['.........GG', '........GGG', '.......GGG.', 'GG....GGG..', 'GGG..GGG...', '.GGGGGG....', '..GGGG.....', '...GG......'],
  ui_cross: ['rr....rr', 'rrr..rrr', '.rrrrrr.', '..rrrr..', '..rrrr..', '.rrrrrr.', 'rrr..rrr', 'rr....rr'],
  ui_timer: ['...ggg...', '....g....', '..wwwww..', '.wwwkwww.', 'wwwwkwwww', 'wwwwkkkww', 'wwwwwwwww', '.wwwwwww.', '..wwwww..'],
  ui_right: ['....w...', '....ww..', 'wwwwwww.', 'wwwwwwww', 'wwwwwww.', '....ww..', '....w...'],
  ui_left: ['...w....', '..ww....', '.wwwwwww', 'wwwwwwww', '.wwwwwww', '..ww....', '...w....'],
  ui_play: ['w.....', 'www...', 'wwwww.', 'wwwwww', 'wwwww.', 'www...', 'w.....'],
  ui_pause: ['ww.ww', 'ww.ww', 'ww.ww', 'ww.ww', 'ww.ww', 'ww.ww', 'ww.ww'],
  ui_heart: ['.rr...rr.', 'rrrr.rrrr', 'rwrrrrrrr', 'rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....'],
  ui_up: ['....G....', '...GGG...', '..GGGGG..', '.GGGGGGG.', 'GGGGGGGGG', '...GGG...', '...GGG...', '...GGG...'],
  ui_undo: ['..w......', '.wwwwww..', 'wwwwwwww.', '.ww...ww.', '..w....ww', '.......ww', '......ww.', '...wwww..'],
  ui_trash: ['...ggg...', 'ggggggggg', '.ggggggg.', '.gdgdgdg.', '.gdgdgdg.', '.gdgdgdg.', '.gdgdgdg.', '..ggggg..'],
  ui_backspace: ['...wwwwwww', '..wwkwwwkw', '.wwwwkwkww', 'wwwwwwkwww', '.wwwwkwkww', '..wwkwwwkw', '...wwwwwww'],
  ui_dizzy: ['..yyyyy..', '.yyyyyyy.', 'ykykykyky', 'yykyyykyy', 'ykykykyky', 'yyyyyyyyy', 'yykkkkkyy', '.yyyyyyy.', '..yyyyy..'],
  ui_warn: ['....y....', '...yyy...', '...yky...', '..yykyy..', '..yykyy..', '.yyyyyyy.', '.yyykyyy.', 'yyyyyyyyy'],
  ui_note: ['...wwwww', '...wwwww', '...w...w', '...w...w', '...w...w', '.www.www', 'wwwwwwww', '.ww..ww.'],
  ui_film: ['wkwkwkwkw', 'kwkwkwkwk', 'ggggggggg', 'gbbbbbbbg', 'gbbbbbbbg', 'gbbbbbbbg', 'ggggggggg'],
  ui_phone: ['ggggggg', 'gbbbbbg', 'gbbbbbg', 'gbbbbbg', 'gbbbbbg', 'gbbbbbg', 'gggwggg', 'ggggggg'],
  ui_hand: ['..s......', '.sss.....', '.sss.....', '.sssss...', '.sssssss.', 'sssssssss', 'sssssssss', '.sssssss.', '..sssss..'],
  ui_home: ['....r....', '...rrr...', '..rrrrr..', '.rrrrrrr.', 'rrrrrrrrr', '.wwwwwww.', '.wwBBwww.', '.wwBBwww.', '.wwBBwww.'],
  ui_map: ['GGG.yyy.G', 'GGGyyyyGG', 'GGyyyyGGG', 'GyyyGGGGG', 'yyyGGGbbb', 'yyGGGbbbb', 'GGGbbbbbb'],
  ui_drum: ['..wwwww..', '.wwwwwww.', 'rrrrrrrrr', 'ryrrrrryr', 'rrrrrrrrr', 'ryrrrrryr', 'rrrrrrrrr', '.rrrrrrr.'],
  ui_fullscreen: ['www..www', 'w......w', 'w......w', '........', '........', 'w......w', 'w......w', 'www..www'],
  ui_sound: ['...w.....', '..ww..w..', 'wwww...w.', 'wwww.w.w.', 'wwww.w.w.', 'wwww...w.', '..ww..w..', '...w.....'],
  ui_mute: ['...w.....', '..ww.....', 'wwww.r.r.', 'wwww..r..', 'wwww.r.r.', 'wwww.....', '..ww.....', '...w.....'],
  ui_flag: ['gwkwkwk', 'gkwkwkw', 'gwkwkwk', 'gkwkwkw', 'g......', 'g......', 'g......'],
  ui_plus: ['..GGG..', '..GGG..', 'GGGGGGG', 'GGGGGGG', 'GGGGGGG', '..GGG..', '..GGG..'],
  ui_bug: ['..k.k..', '...k...', '.rrkrr.', 'rkrkrkr', 'rrrkrrr', 'rkrkrkr', '.rrkrr.'],
};
for (const [id, rows] of Object.entries(UI_ART)) grids.set(id, rows.map((r) => r.split('').map((ch) => UI_PAL[ch] ?? null)));
// медали 1–3 места: лента и диск с цифрой
const MEDAL_DIGIT = [['.d.', 'dd.', '.d.', '.d.', 'ddd'], ['dd.', '..d', '.d.', 'd..', 'ddd'], ['dd.', '..d', '.d.', '..d', 'dd.']];
const MEDAL_COL = [['#ffd23f', '#a8761a'], ['#d9dce6', '#6b7088'], ['#e09a5a', '#7d4520']];
MEDAL_DIGIT.forEach((dg, i) => {
  const rows = ['.bb...rr.', '..bb.rr..', '...b.r...', '..ccccc..', '.ccccccc.', 'cc.....cc', 'cc.....cc', 'cc.....cc', 'cc.....cc', 'cc.....cc', '.ccccccc.', '..ccccc..']
    .map((r) => r.split(''));
  dg.forEach((r, y) => r.split('').forEach((ch, x) => { rows[5 + y][3 + x] = ch === 'd' ? 'd' : 'c'; }));
  for (let y = 5; y < 10; y++) { rows[y][2] = 'c'; rows[y][6] = 'c'; }
  const pal: Record<string, string> = { b: '#4dabff', r: '#e8364e', c: MEDAL_COL[i][0], d: MEDAL_COL[i][1] };
  grids.set('ui_medal' + (i + 1), rows.map((r) => r.map((ch) => pal[ch] ?? null)));
});

/** спецтема: круг с радужным круговым градиентом (если нет своего topic_special.png) */
export function rainbowGrid(n = 11): Grid {
  const c = (n - 1) / 2;
  const STEPS = 12;
  const g: Grid = [];
  for (let y = 0; y < n; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < n; x++) {
      const dx = x - c, dy = y - c;
      if (Math.hypot(dx, dy) > c + 0.35) { row.push(null); continue; }
      const a = ((Math.atan2(dx, -dy) / (Math.PI * 2)) + 1) % 1; // по часовой от верха
      const hue = (Math.floor(a * STEPS) * 360) / STEPS;
      row.push(`hsl(${hue} 90% 60%)`);
    }
    g.push(row);
  }
  // центр и блик белые
  g[c][c] = '#ffffff';
  g[2][3] = g[3][2] = '#ffffff';
  return g;
}
export const SPECIAL_TOPIC = { id: 'special', name: 'Спецтема', color: '#ffffff' };

/** пиксели иконки по id; спецвопрос везде — радужный шар, как на колесе */
const iconGrid = (id: string): Grid => (id === 'special' ? grids.get('topic_special') ?? rainbowGrid() : grids.get(id) ?? grids.get('bonus_' + id) ?? MISSING);

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
/**
 * Иконка темы. Порядок: своя иконка из админки (opts.icon) → src/img/icons/topic_<id>.png →
 * радужный круг для спецтемы → ромб цвета темы.
 */
export function topicIconUrl(id: string, color: string, scale = 3, opts: { icon?: Grid; special?: boolean } = {}): string {
  const k = `${id}|${color}|${scale}|${opts.special ? 1 : 0}|${opts.icon ? JSON.stringify(opts.icon) : ''}`;
  let u = iconCache.get(k);
  if (u) return u;
  const g = opts.icon?.length ? opts.icon : grids.get('topic_' + id) ?? (id === 'special' || opts.special ? rainbowGrid() : diamond(color));
  u = drawIcon(g, scale, false).toDataURL();
  iconCache.set(k, u);
  return u;
}

/** готовые иконки для редактора в админке: имя → копия сетки пикселей */
export function iconPresets(): Record<string, Grid> {
  const out: Record<string, Grid> = {};
  for (const [k, g] of grids) out[k] = g.map((r) => [...r]);
  out['радуга'] = rainbowGrid();
  out['ромб'] = diamond('#ffffff');
  return out;
}

/** превью сетки так, как она выглядит в игре (с контуром); shadow — как у иконок наград */
export function gridIconUrl(g: Grid, scale = 3, shadow = false): string {
  return drawIcon(g, scale, shadow).toDataURL();
}

const pixCache = new Map<string, HTMLCanvasElement>();
/** иконка с контуром и тенью; размер холста (w+2)×(h+3) клеток по scale пикселей */
export function pixelIcon(id: string, scale = 1): HTMLCanvasElement {
  const key = id + '|' + scale;
  let c = pixCache.get(key);
  if (!c) {
    c = drawIcon(iconGrid(id), scale, true);
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
/** цвета плашки: награда — кремовая, автомат (постоянное место, не награда) — голубая */
const BADGE_COLORS = { reward: ['#fff3d6', '#e2c48f'], machine: ['#d4ecff', '#8fb8e6'], group: ['#ffd9f3', '#e59ccf'] } as const;
export type BadgeKind = keyof typeof BADGE_COLORS;
export type BadgePart = { id: string; kind: BadgeKind };

/**
 * Иконка награды на плашке-выноске: светлый фон, тёмный контур со срезанными углами
 * и треугольник-указатель вниз (кончик — нижний центр холста). scale — размер пикселя.
 * Можно передать несколько иконок — одна общая плашка, у каждой иконки свой цвет фона,
 * между ними тёмная перегородка (для маленьких префектур, где две выноски не помещаются).
 */
export function pixelBadge(id: string | BadgePart[], scale = 1, kind: BadgeKind = 'reward'): HTMLCanvasElement {
  const parts = typeof id === 'string' ? [{ id, kind }] : id;
  const key = parts.map((p) => p.id + ':' + p.kind).join(',') + '|' + scale;
  const c0 = badgeCache.get(key);
  if (c0) return c0;
  const grids = parts.map((p) => iconGrid(p.id));
  const h = Math.max(...grids.map((g) => g.length));
  const PAD = 2;
  // отрезки плашки по иконкам: [начало, конец) по x внутри контура; между отрезками — перегородка в 1 пиксель
  const segs: [number, number][] = [];
  let x0 = 1;
  for (const g of grids) {
    const sw = (g[0]?.length ?? 0) + PAD * 2;
    segs.push([x0, x0 + sw]);
    x0 += sw + 1;
  }
  const bw = x0, bh = h + PAD * 2 + 2; // плашка с контуром
  // середина плашки: один пиксель при нечётной ширине, два — при чётной (кончик тоже в два пикселя)
  const cl = Math.floor((bw - 1) / 2), cr = Math.ceil((bw - 1) / 2);
  const W = bw, H = bh + 4; // + указатель и тень
  // карта клеток: 0 пусто, 1 контур, 2+2i фон i-й иконки, 3+2i тень её фона снизу
  const segAt = (x: number) => Math.max(0, segs.findIndex(([a, b]) => x >= a && x < b));
  const cell = Array.from({ length: H }, () => new Uint8Array(W));
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const cornerOut = (x === 0 || x === bw - 1) && (y === 0 || y === bh - 1);
    if (cornerOut) continue;
    const edge = x === 0 || y === 0 || x === bw - 1 || y === bh - 1;
    const cornerIn = (x === 1 || x === bw - 2) && (y === 1 || y === bh - 2);
    const wall = segs.some(([, b], i) => i < segs.length - 1 && x === b);
    const i = segAt(x);
    cell[y][x] = edge || cornerIn || wall ? 1 : y === bh - 2 ? 3 + i * 2 : 2 + i * 2;
  }
  // указатель: треугольник, сливается с плашкой (цвет — той иконки, над которой он стоит)
  const tip = 3 + segAt(segs.some(([a, b]) => cl >= a && cl < b) ? cl : cl - 1) * 2;
  for (let k = 0; k < 4; k++) {
    const y = bh - 1 + k, half = 3 - k;
    for (let x = cl - half - 1; x <= cr + half + 1; x++) {
      if (x < 0 || x >= W) continue;
      const border = x === cl - half - 1 || x === cr + half + 1 || k === 3;
      cell[y][x] = border ? 1 : tip;
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
  const colors = ['', '#0d0b1e', ...parts.flatMap((p) => BADGE_COLORS[p.kind])];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = cell[y][x];
    if (!v) continue;
    ctx.clearRect(x * scale, y * scale, scale, scale);
    ctx.fillStyle = colors[v];
    px(x, y);
  }
  // иконки с тонким контуром внутри плашки
  grids.forEach((g, i) => {
    const gh = g.length, gw = g[0]?.length ?? 0;
    const ox = segs[i][0] + PAD, oy = 1 + PAD + Math.floor((h - gh) / 2);
    const filled = (x: number, y: number) => !!g[y]?.[x];
    ctx.fillStyle = '#0d0b1e';
    for (let y = -1; y <= gh; y++) for (let x = -1; x <= gw; x++) {
      if (filled(x, y)) continue;
      if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) px(ox + x, oy + y);
    }
    g.forEach((r, y) => r.forEach((col, x) => {
      if (!col) return;
      ctx.fillStyle = col;
      px(ox + x, oy + y);
    }));
  });
  badgeCache.set(key, c);
  return c;
}

const badgeUrlCache = new Map<string, string>();
export function pixelBadgeUrl(id: string, scale = 3, kind: BadgeKind = 'reward') {
  const key = id + '|' + scale + '|' + kind;
  let u = badgeUrlCache.get(key);
  if (!u) {
    u = pixelBadge(id, scale, kind).toDataURL();
    badgeUrlCache.set(key, u);
  }
  return u;
}
