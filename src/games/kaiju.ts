// «Годзилла» (怪獣, Токио): лидер — Годзилла, остальные — охотники.
// Годзилла шагает по клеткам и топчет дома (по руинам — быстро, на целый дом — smashMs: пока ломает, стоит на месте); охотник тапает клетку — снаряд падает туда через fuseMs
// (тень видна заранее), потом перезарядка. Попадание — минус жизнь. Здесь — правила и боты, без движка и экрана.
import type { KaijuPublic, KaijuSettings } from '../shared/types';

export const KAIJU_DEFAULT: KaijuSettings = {
  time: 60,
  hp: 3,
  cols: 8,
  rows: 5,
  stepMs: 380,
  smashMs: 1000,
  fuseMs: 1250,
  reloadMs: 3000,
  stunMs: 1200,
  zillaWinYen: 400,
  houseYen: 25,
  zillaLoseYen: 200,
  hunterYen: 200,
  hitYen: 100,
  hunterWinYen: 300,
  hitWinYen: 250,
};

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const; // вверх, вправо, вниз, влево

export const cellXY = (k: { cols: number }, cell: number) => [cell % k.cols, Math.floor(cell / k.cols)] as const;
export const cellAt = (k: { cols: number; rows: number }, x: number, y: number) => (x < 0 || y < 0 || x >= k.cols || y >= k.rows ? -1 : y * k.cols + x);
/** клетка после шага в направлении dir (0..3) или -1 — край города */
export function stepCell(k: { cols: number; rows: number }, cell: number, dir: number) {
  const [x, y] = cellXY(k, cell);
  const d = DIRS[dir];
  return d ? cellAt(k, x + d[0], y + d[1]) : -1;
}
/** стартовая клетка Годзиллы: выходит из залива — середина нижнего ряда */
export const startCell = (k: { cols: number; rows: number }) => (k.rows - 1) * k.cols + Math.floor(k.cols / 2);

/** бот-Годзилла: уходит из-под теней, иначе идёт к ближайшему целому дому. Возвращает направление или -1 */
export function botZilla(k: KaijuPublic, now: number, rnd = Math.random): number {
  const danger = (cell: number, at: number) => k.shells.some((s) => s.cell === cell && Math.abs(s.at - at) < k.cfg.stepMs * 1.2);
  const here = danger(k.pos, now + k.cfg.stepMs) || k.shells.some((s) => s.cell === k.pos && s.at - now < k.cfg.stepMs * 2.4);
  const opts = [0, 1, 2, 3].map((d) => ({ d, c: stepCell(k, k.pos, d) })).filter((o) => o.c >= 0);
  // клетка безопасна, если в момент прихода и чуть позже туда ничего не падает
  // клетка безопасна, если туда ничего не упадёт, пока он там занят (на целом доме — дольше)
  const lock = (c: number) => (k.down.includes(c) ? k.cfg.stepMs : k.cfg.smashMs) + 350;
  const safe = opts.filter((o) => !k.shells.some((s) => s.cell === o.c && s.at > now && s.at - now < lock(o.c)));
  const pool = safe.length ? safe : here ? opts : [];
  if (!pool.length) return -1;
  const dist = (c: number) => {
    const [x, y] = cellXY(k, c);
    let best = 99;
    for (let i = 0; i < k.cols * k.rows; i++) {
      if (k.down.includes(i)) continue;
      const [hx, hy] = cellXY(k, i);
      best = Math.min(best, Math.abs(hx - x) + Math.abs(hy - y));
    }
    return best;
  };
  pool.sort((a, b) => dist(a.c) - dist(b.c) + (rnd() - 0.5) * 0.6);
  return pool[0].d;
}

/** бот-охотник: бьёт по Годзилле или рядом (куда тот, скорее всего, шагнёт) */
export function botHunter(k: KaijuPublic, rnd = Math.random): number {
  const [x, y] = cellXY(k, k.pos);
  const r = rnd();
  const cand = r < 0.25 ? [[0, 0]] : r < 0.9 ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  let cells = cand.map(([dx, dy]) => cellAt(k, x + dx, y + dy)).filter((c) => c >= 0);
  // целый дом рядом — туда Годзилла и пойдёт
  const intact = cells.filter((c) => !k.down.includes(c));
  if (intact.length && rnd() < 0.75) cells = intact;
  return cells.length ? cells[Math.floor(rnd() * cells.length)] : k.pos;
}

/** награды: [йены, звезда] каждому. Годзилла выжил — много и звезда; свалили — звезда самому меткому (ничья — всем метким) */
export function kaijuAwards(k: KaijuPublic, cfg: KaijuSettings): Record<string, { yen: number; star: boolean }> {
  const out: Record<string, { yen: number; star: boolean }> = {};
  const downed = k.hp <= 0;
  out[k.zilla] = downed ? { yen: cfg.zillaLoseYen, star: false } : { yen: cfg.zillaWinYen + cfg.houseYen * k.stomped, star: true };
  const top = Math.max(0, ...k.hunters.map((id) => k.hits[id] ?? 0));
  for (const id of k.hunters) {
    const h = k.hits[id] ?? 0;
    out[id] = downed ? { yen: cfg.hunterWinYen + cfg.hitWinYen * h, star: top > 0 && h === top } : { yen: cfg.hunterYen + cfg.hitYen * h, star: false };
  }
  return out;
}
