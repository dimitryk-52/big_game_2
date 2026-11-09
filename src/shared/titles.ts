// Титулы в финале: каждое игровое достижение — печать (ханко с одним кандзи) и цветная плашка под именем.
// Счётчики копит хост по ходу игры (Tally), в конце computeTitles раздаёт титулы:
// ничья — титул всем лучшим; титул есть, только если событие хоть раз случилось;
// не больше MAX_TITLES печатей на игрока (оставляем самые редкие); без титулов никто не уходит — «Турист».
import type { Player } from './types';

/** счётчик → игрок → значение */
export type Tally = Record<string, Record<string, number>>;

export interface TitleDef {
  id: string;
  name: string;
  /** кандзи на печати */
  kanji: string;
  /** цвет печати и плашки */
  color: string;
  /** форма печати (рамка — пиксельная маска src/img/hanko/hanko_<shape>.png) */
  shape: HankoShape;
  /** счётчик в Tally; у Магната и Императора считается по итогам игры */
  metric?: string;
  /** меньше — лучше (Скряга) */
  min?: boolean;
}

export type HankoShape = 'square' | 'circle' | 'diamond' | 'hexagon' | 'octagon' | 'triangle';

export const MAX_TITLES = 3;

const RED = '#c0392b';
const INDIGO = '#2c4a8a';
const GREEN = '#3b7a3a';
const GOLD = '#b07d12';
const PURPLE = '#6d3d9e';
const BROWN = '#7b4a26';
const RAINBOW = 'rainbow';

export const TITLES: TitleDef[] = [
  { id: 'emperor', name: 'Император', kanji: '帝', color: RAINBOW, shape: 'octagon' },
  { id: 'weapon', name: 'Оружейник', kanji: '器', color: RAINBOW, shape: 'hexagon', metric: 'specials' },
  // дуэли
  { id: 'shogun', name: 'Сёгун', kanji: '将', color: RED, shape: 'square', metric: 'duelWin' },
  { id: 'ronin', name: 'Ронин', kanji: '浪', color: RED, shape: 'triangle', metric: 'duelAttack' },
  { id: 'phoenix', name: 'Феникс', kanji: '鳳', color: RED, shape: 'circle', metric: 'revive' },
  { id: 'yakuza', name: 'Якудза', kanji: '盗', color: RED, shape: 'diamond', metric: 'stolen' },
  { id: 'bookie', name: 'Букмекер', kanji: '賭', color: RED, shape: 'hexagon', metric: 'betNet' },
  // вопросы
  { id: 'sage', name: 'Мудрец', kanji: '賢', color: INDIGO, shape: 'circle', metric: 'correct' },
  { id: 'banner', name: 'Знаменосец', kanji: '旗', color: INDIGO, shape: 'square', metric: 'flags' },
  // карта
  { id: 'pioneer', name: 'Первопроходец', kanji: '拓', color: GREEN, shape: 'diamond', metric: 'opened' },
  { id: 'wanderer', name: 'Странник', kanji: '旅', color: GREEN, shape: 'triangle', metric: 'distance' },
  { id: 'master', name: 'Хозяин', kanji: '犬', color: GREEN, shape: 'circle', metric: 'akitaTurns' },
  // деньги
  { id: 'magnate', name: 'Магнат', kanji: '富', color: GOLD, shape: 'octagon' },
  { id: 'spender', name: 'Транжира', kanji: '散', color: GOLD, shape: 'diamond', metric: 'shopSpent' },
  { id: 'miser', name: 'Скряга', kanji: '吝', color: GOLD, shape: 'square', metric: 'shopSpent', min: true },
  { id: 'fox', name: 'Лис', kanji: '狐', color: GOLD, shape: 'triangle', metric: 'finds' },
  // групповые игры (очки за места во всех играх этого вида) и ритм-батлы
  { id: 'calligrapher', name: 'Каллиграф', kanji: '書', color: PURPLE, shape: 'square', metric: 'group:calligraphy' },
  { id: 'poet', name: 'Поэт', kanji: '詩', color: PURPLE, shape: 'circle', metric: 'group:senryu' },
  { id: 'visagist', name: 'Визажист', kanji: '顔', color: PURPLE, shape: 'hexagon', metric: 'group:fukuwarai' },
  { id: 'lightning', name: 'Молния', kanji: '閃', color: PURPLE, shape: 'triangle', metric: 'group:iaido' },
  { id: 'chef', name: 'Шеф', kanji: '包', color: PURPLE, shape: 'diamond', metric: 'group:sashimi' },
  { id: 'dragon', name: 'Дракон', kanji: '龍', color: PURPLE, shape: 'octagon', metric: 'group:dragon' },
  { id: 'glutton', name: 'Обжора', kanji: '麺', color: PURPLE, shape: 'circle', metric: 'group:noodles' },
  { id: 'sniper', name: 'Снайпер', kanji: '種', color: PURPLE, shape: 'triangle', metric: 'group:cherry' },
  { id: 'drummer', name: 'Барабанщик', kanji: '鼓', color: PURPLE, shape: 'hexagon', metric: 'rhythmWin' },
  // соло-игры
  { id: 'gambler', name: 'Лудоман', kanji: '玉', color: BROWN, shape: 'circle', metric: 'pachiNet' },
  { id: 'fortune', name: 'Фортуна', kanji: '輪', color: BROWN, shape: 'octagon', metric: 'ringPrizes' },
  { id: 'cheater', name: 'Шулер', kanji: '骰', color: BROWN, shape: 'diamond', metric: 'chohanNet' },
  { id: 'counter', name: 'Счетовод', kanji: '数', color: BROWN, shape: 'square', metric: 'sudoku' },
  { id: 'seal', name: 'Тюлень', kanji: '湯', color: BROWN, shape: 'hexagon', metric: 'onsen' },
];

/** утешительный — тем, кому ничего не досталось */
export const TOURIST: TitleDef = { id: 'tourist', name: 'Турист', kanji: '観', color: '#3e8a8a', shape: 'circle' };

export const TITLE_BY_ID: Record<string, TitleDef> = Object.fromEntries([...TITLES, TOURIST].map((t) => [t.id, t]));

/** очки за место в групповой игре: 1 место — 7, 7 место — 1 */
export const placePoints = (place: number) => Math.max(0, 8 - place);

/** порядок итоговой таблицы: призы, звёзды, йены */
export function finalRank(ps: Player[]): Player[] {
  return [...ps].sort((a, b) => b.prizes.length - a.prizes.length || b.stars - a.stars || b.yen - a.yen);
}

/** кто лучший по значениям (все с равным лучшим); пусто — события не было */
function best(ids: string[], val: (id: string) => number, min = false): string[] {
  if (!ids.length) return [];
  const vals = ids.map(val);
  const top = min ? Math.min(...vals) : Math.max(...vals);
  // «больше — лучше»: нужен хотя бы один положительный результат
  if (!min && !(top > 0)) return [];
  return ids.filter((id) => val(id) === top);
}

/** раздача титулов: игрок → id титулов (самые редкие первыми) */
export function computeTitles(players: Player[], tally: Tally): Record<string, string[]> {
  const ids = players.map((p) => p.id);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const holders: Record<string, string[]> = {};
  for (const t of TITLES) {
    let win: string[] = [];
    if (t.id === 'emperor') {
      const r = finalRank(players);
      if (r.length) {
        const k = (p: Player) => `${p.prizes.length}|${p.stars}|${p.yen}`;
        win = r.filter((p) => k(p) === k(r[0])).map((p) => p.id);
      }
    } else if (t.id === 'magnate') win = best(ids, (id) => byId[id].yen);
    else if (t.metric) {
      const m = tally[t.metric] ?? {};
      if (t.min) {
        // Скряга — только если в магазине вообще кто-то тратился
        if (Object.values(m).some((v) => v > 0)) win = best(ids, (id) => m[id] ?? 0, true);
      } else win = best(ids, (id) => m[id] ?? 0);
    }
    if (win.length) holders[t.id] = win;
  }
  const order = TITLES.map((t) => t.id);
  const out: Record<string, string[]> = {};
  for (const id of ids) {
    const mine = Object.keys(holders).filter((t) => holders[t].includes(id));
    // Император всегда остаётся; дальше — те, что достались меньшему числу игроков
    mine.sort((a, b) => (a === 'emperor' ? -1 : b === 'emperor' ? 1 : 0) || holders[a].length - holders[b].length || order.indexOf(a) - order.indexOf(b));
    out[id] = mine.length ? mine.slice(0, MAX_TITLES) : [TOURIST.id];
  }
  return out;
}
