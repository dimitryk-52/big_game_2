// Машины: постоянный «сапог». Обычный ход — ровно на 1 префектуру; с машиной — на 1 или 2 (на выбор).
// Покупаются в автосалонах марок (settings.dealers), теряются при ЛЮБОМ поражении в дуэли
// (остов уходит на металлолом за монетку). Машина против машины — дуэль всегда гонка (shared/race.ts).
// Спрайты: src/img/icons/car_<id>.png и emb_<id>.png (исходник art/cars/cars.px.js); картинки — ui/carArt.ts
// (здесь их нет: этот файл читает и движок без браузера).
import type { Settings } from './types';

export type CarId = 'subaru' | 'nissan' | 'toyota' | 'mitsubishi' | 'mazda' | 'honda';

export const CARS: Record<CarId, {
  /** цвет кузова — для вида сверху в гонке */ hex: string; brand: string; model: string; color: string; pref: number; note: string;
  /** на карте: столбец спрайта (32×13), над которым голова водителя (переднее боковое окно) и акиты (заднее),
   *  и строка нижней кромки окон — там подбородок */
  seat: { front: number; rear: number; belt: number };
}> = {
  subaru: { hex: '#1f4fb4', brand: 'Subaru', model: 'Impreza', color: 'синяя', pref: 10, note: 'Раллийная легенда из Гуммы: синий кузов, золотые диски.', seat: { front: 19, rear: 9, belt: 4 } },
  nissan: { hex: '#3fb4e8', brand: 'Nissan', model: 'Note', color: 'голубая', pref: 14, note: 'Городской хэтчбек из Канагавы — шустрый и неприхотливый.', seat: { front: 18, rear: 8, belt: 4 } },
  toyota: { hex: '#2c2e3c', brand: 'Toyota', model: 'Alphard', color: 'чёрный', pref: 21, note: 'Чёрный дворец на колёсах — из Гифу, соседки Айти. Собаке сзади просторно.', seat: { front: 18, rear: 7, belt: 4 } },
  mitsubishi: { hex: '#d8242c', brand: 'Mitsubishi', model: 'Lancer', color: 'красный', pref: 28, note: 'Красный седан с антикрылом из Хёго — гроза перевалов.', seat: { front: 19, rear: 9, belt: 4 } },
  mazda: { hex: '#eef1f5', brand: 'Mazda', model: 'CX-5', color: 'белая', pref: 35, note: 'Белый кроссовер с завода в Хофу (Ямагути): высоко сижу, далеко гляжу.', seat: { front: 19, rear: 9, belt: 4 } },
  honda: { hex: '#f6c820', brand: 'Honda', model: 'Civic', color: 'жёлтый', pref: 43, note: 'Жёлтый хэтчбек из Кумамото: лёгкий, злой, звонкий.', seat: { front: 16, rear: 6, belt: 5 } },
};
export const CAR_IDS = Object.keys(CARS) as CarId[];

/** прежние автосалоны (до LAYOUT_V 3) — чтобы обновить несохранённые ведущим настройки */
export const OLD_DEALERS: Record<number, CarId> = { 10: 'subaru', 14: 'nissan', 23: 'toyota', 28: 'mitsubishi', 34: 'mazda', 43: 'honda' };
/** автосалоны по умолчанию: префектура → марка (Гумма, Канагава, Гифу, Хёго, Ямагути, Кумамото).
 *  Каждый стоит в обычном магазине (settings.shopPrefs): Айти занят пачинко, а у Хиросимы магазин не встаёт в сеть */
export const DEFAULT_DEALERS: Record<number, CarId> = Object.fromEntries(CAR_IDS.map((id) => [CARS[id].pref, id]));
/** цена машины в йенах (эпоха Эдо): ~2,5 бывшего сапога; растёт с эпохой, как все цены */
export const DEFAULT_CAR = { yen: 2000 };

export const carName = (id: CarId) => `${CARS[id].brand} ${CARS[id].model}`;

export function dealersOf(st: Pick<Settings, 'dealers'>): Record<number, CarId> {
  return st.dealers ?? DEFAULT_DEALERS;
}
export function dealerAt(st: Pick<Settings, 'dealers'>, code: number | null | undefined): CarId | null {
  return code == null ? null : dealersOf(st)[code] ?? null;
}

/** как именно пропала машина после проигранной дуэли */
export const CAR_LOST = [
  { id: 'crash', text: 'Авария!', sub: 'не вписался в поворот — машина всмятку' },
  { id: 'stall', text: 'Заглохла…', sub: 'и больше не завелась' },
  { id: 'tow', text: 'Эвакуатор!', sub: 'машину увезли на штрафстоянку — насовсем' },
  { id: 'fine', text: 'Штраф!', sub: 'машину забрали за долги' },
  { id: 'tanuki', text: 'Тануки угнали!', sub: 'последний раз её видели где-то в лесу' },
] as const;
export type CarLostId = typeof CAR_LOST[number]['id'];
