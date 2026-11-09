// «Лапша» (ванко-соба / рамен / удон): правила и картинки. Картинки — src/img/noodles/*.png (pxl-арт).
import type { NoodleId } from '../shared/types';

let files: Record<string, string> = {};
// вне Vite (headless-симуляция, npm run sim) картинки не нужны
try { files = import.meta.glob<string>('../img/noodles/*.png', { eager: true, import: 'default', query: '?url' }); } catch { /* нет import.meta.glob */ }
export const noodleImg = (name: string) => files[`../img/noodles/${name}.png`] ?? '';

export interface NoodleDef {
  name: string;
  /** тапов, чтобы съесть одну миску */
  taps: number;
  /** пауза, пока подкладывают следующую порцию, мс */
  tossMs: number;
  /** скрытый предел живота — случайный в этих границах (мисок); съел больше — лопнул */
  min: number;
  max: number;
  /** картинки: полная, пустая, «хватит» (крышка или палочки), порция в полёте */
  full: string;
  empty: string;
  done: string;
  fly: string;
  /** кнопка «хватит» и что про неё сказать */
  stop: string;
  stopped: string;
  /** миска — в родительном падеже мн. ч. для «12 …» */
  unit: [string, string, string];
}

export const NOODLES: Record<NoodleId, NoodleDef> = {
  soba: {
    name: 'Ванко-соба', taps: 4, tossMs: 350, min: 16, max: 36,
    full: 'bowl', empty: 'bowl_empty', done: 'bowl_closed', fly: 'soba',
    stop: 'Накрыть крышкой', stopped: 'Миска накрыта', unit: ['мисочка', 'мисочки', 'мисочек'],
  },
  ramen: {
    name: 'Рамен', taps: 7, tossMs: 650, min: 8, max: 18,
    full: 'ramen', empty: 'ramen_empty', done: 'ramen_done', fly: 'ramen_noodles',
    stop: 'Палочки на миску', stopped: 'Палочки на миске', unit: ['порция', 'порции', 'порций'],
  },
  udon: {
    name: 'Удон', taps: 6, tossMs: 600, min: 9, max: 20,
    full: 'udon', empty: 'udon_empty', done: 'udon_done', fly: 'udon_noodles',
    stop: 'Палочки на миску', stopped: 'Палочки на миске', unit: ['порция', 'порции', 'порций'],
  },
};

export const noodleOf = (id?: string | null): NoodleDef => NOODLES[(id as NoodleId) ?? 'soba'] ?? NOODLES.soba;

/** «12 мисочек» */
export function plural(n: number, [one, few, many]: [string, string, string]) {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
}

/** очки: остановился — сколько съел; лопнул — половина того, что влезло */
export const noodleScore = (bowls: number, burst: boolean) => (burst ? Math.floor(bowls / 2) : bowls);

/** итог с телефона: «nood:<съедено>:<lid|burst|time>» */
export function parseNoodle(v: string | null | undefined): { n: number; how: 'lid' | 'burst' | 'time' } | null {
  const m = /^nood:(\d{1,3}):(lid|burst|time)$/.exec(v ?? '');
  return m ? { n: +m[1], how: m[2] as any } : null;
}
