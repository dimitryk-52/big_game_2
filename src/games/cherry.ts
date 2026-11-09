// «Косточки» (Ямагата, Хигасинэ): плевок вишнёвой косточкой на дальность. Три попытки, ветер у попытки один на всех.
// Телефон ловит угол и силу, дальность считает хост по этой же формуле.
let files: Record<string, string> = {};
// вне Vite (headless-симуляция, npm run sim) картинки не нужны
try { files = import.meta.glob<string>('../img/cherry/*.png', { eager: true, import: 'default', query: '?url' }); } catch { /* нет import.meta.glob */ }
export const cherryImg = (name: string) => files[`../img/cherry/${name}.png`] ?? '';

export const PIT_TRIES = 3;
/** угол прицела, градусы */
export const ANGLE_MIN = 10;
export const ANGLE_MAX = 75;
/** сила выше этого — поперхнулся: косточка падает под ноги */
export const CHOKE = 0.92;
/** поле на картинке bg.png: старт по x, пикселей на метр, ширина картинки */
export const FIELD = { x0: 20, pxPerM: 14, w: 320, h: 180, ground: 141 };

const G = 9.8, H0 = 1.5, VMAX = 12.5, WIND_K = 0.55;

/** ветер попытки, м/с: «+» — в спину (дальше), «−» — в лицо */
export const randomWind = () => Math.round((Math.random() * 6 - 3) * 10) / 10;

/** дальность, м (2 знака). Поперхнулся — 0,3–0,8 м */
export function pitDistance(angle: number, power: number, wind: number): number {
  const a = Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, angle)) * Math.PI / 180;
  const p = Math.max(0, Math.min(1, power));
  if (p > CHOKE) return Math.round((0.3 + (1 - p) * 6) * 100) / 100;
  const v = VMAX * (0.25 + 0.75 * p);
  const vx = v * Math.cos(a), vy = v * Math.sin(a);
  const t = (vy + Math.sqrt(vy * vy + 2 * G * H0)) / G; // время до земли
  const x = vx * t + 0.5 * wind * WIND_K * t * t;
  return Math.max(0, Math.round(x * 100) / 100);
}

/** итог с телефона: «pit:угол,сила;угол,сила;-» (пропущенная попытка — «-») */
export function parsePits(v: string | null | undefined): ({ a: number; p: number } | null)[] | null {
  if (!v?.startsWith('pit:')) return null;
  return v.slice(4).split(';').slice(0, PIT_TRIES).map((x) => {
    const [a, p] = x.split(',').map(Number);
    return Number.isFinite(a) && Number.isFinite(p) ? { a, p } : null;
  });
}

/** «8,42 м» */
export const meters = (d: number | null | undefined) => (d == null ? '—' : d.toFixed(2).replace('.', ',') + ' м');
export const windText = (w: number) => (w === 0 ? 'штиль' : `${w > 0 ? 'в спину' : 'в лицо'} ${Math.abs(w).toFixed(1).replace('.', ',')} м/с`);
