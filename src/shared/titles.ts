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
  /** счётчик в Tally; у Магната и Императора считается по итогам игры */
  metric?: string;
  /** меньше — лучше (Скряга) */
  min?: boolean;
}

export const MAX_TITLES = 3;

const RED = '#c0392b';
const INDIGO = '#2c4a8a';
const GREEN = '#3b7a3a';
const GOLD = '#b07d12';
const PURPLE = '#6d3d9e';
const BROWN = '#7b4a26';
const RAINBOW = 'rainbow';

export const TITLES: TitleDef[] = [
  { id: 'emperor', name: 'Император', kanji: '帝', color: RAINBOW },
  { id: 'weapon', name: 'Оружейник', kanji: '器', color: RAINBOW, metric: 'specials' },
  // дуэли
  { id: 'shogun', name: 'Сёгун', kanji: '将', color: RED, metric: 'duelWin' },
  { id: 'ronin', name: 'Ронин', kanji: '浪', color: RED, metric: 'duelAttack' },
  { id: 'phoenix', name: 'Феникс', kanji: '鳳', color: RED, metric: 'revive' },
  { id: 'yakuza', name: 'Якудза', kanji: '盗', color: RED, metric: 'stolen' },
  { id: 'bookie', name: 'Букмекер', kanji: '賭', color: RED, metric: 'betNet' },
  // вопросы
  { id: 'sage', name: 'Мудрец', kanji: '賢', color: INDIGO, metric: 'correct' },
  { id: 'banner', name: 'Знаменосец', kanji: '旗', color: INDIGO, metric: 'flags' },
  // карта
  { id: 'pioneer', name: 'Первопроходец', kanji: '拓', color: GREEN, metric: 'opened' },
  { id: 'wanderer', name: 'Странник', kanji: '旅', color: GREEN, metric: 'distance' },
  { id: 'master', name: 'Хозяин', kanji: '犬', color: GREEN, metric: 'akitaTurns' },
  // деньги
  { id: 'magnate', name: 'Магнат', kanji: '富', color: GOLD },
  { id: 'spender', name: 'Транжира', kanji: '散', color: GOLD, metric: 'shopSpent' },
  { id: 'miser', name: 'Скряга', kanji: '吝', color: GOLD, metric: 'shopSpent', min: true },
  { id: 'fox', name: 'Лис', kanji: '狐', color: GOLD, metric: 'finds' },
  // групповые игры (очки за места во всех играх этого вида) и ритм-батлы
  { id: 'calligrapher', name: 'Каллиграф', kanji: '書', color: PURPLE, metric: 'group:calligraphy' },
  { id: 'poet', name: 'Поэт', kanji: '詩', color: PURPLE, metric: 'group:senryu' },
  { id: 'visagist', name: 'Визажист', kanji: '顔', color: PURPLE, metric: 'group:fukuwarai' },
  { id: 'lightning', name: 'Молния', kanji: '閃', color: PURPLE, metric: 'group:iaido' },
  { id: 'chef', name: 'Шеф', kanji: '包', color: PURPLE, metric: 'group:sashimi' },
  { id: 'dragon', name: 'Дракон', kanji: '龍', color: PURPLE, metric: 'group:dragon' },
  { id: 'glutton', name: 'Обжора', kanji: '麺', color: PURPLE, metric: 'group:noodles' },
  { id: 'sniper', name: 'Снайпер', kanji: '種', color: PURPLE, metric: 'group:cherry' },
  { id: 'drummer', name: 'Барабанщик', kanji: '鼓', color: PURPLE, metric: 'rhythmWin' },
  // соло-игры
  { id: 'gambler', name: 'Лудоман', kanji: '玉', color: BROWN, metric: 'pachiNet' },
  { id: 'fortune', name: 'Фортуна', kanji: '輪', color: BROWN, metric: 'ringPrizes' },
  { id: 'cheater', name: 'Шулер', kanji: '骰', color: BROWN, metric: 'chohanNet' },
  { id: 'counter', name: 'Счетовод', kanji: '数', color: BROWN, metric: 'sudoku' },
  { id: 'seal', name: 'Тюлень', kanji: '湯', color: BROWN, metric: 'onsen' },
];

/** утешительный — тем, кому ничего не досталось */
export const TOURIST: TitleDef = { id: 'tourist', name: 'Турист', kanji: '観', color: '#3e8a8a' };

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
