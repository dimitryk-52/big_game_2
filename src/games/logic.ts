// Детерминированная логика мини-игр, общая для хоста, ТВ и телефона.
import { rng } from '../shared/util';
import type { DragonPublic } from '../shared/types';

// ───── Призовое кольцо ─────
export const RING_CELLS = 24;
export interface RingLayout {
  green: number[];
  gold: number | null;
}
export function ringLayout(seed: number, physical: boolean): RingLayout {
  const r = rng(seed);
  const g1 = Math.floor(r() * RING_CELLS);
  const g2 = (g1 + 8 + Math.floor(r() * 8)) % RING_CELLS;
  let gold: number | null = null;
  if (physical) {
    do gold = Math.floor(r() * RING_CELLS);
    while (gold === g1 || gold === g2);
  }
  return { green: [g1, g2], gold };
}
/** указатель разгоняется первые 2 секунды, потом крутится с постоянной скоростью */
export function ringCellAt(t0: number, t: number, cellMs: number) {
  const dt = Math.max(0, t - t0);
  const ramp = 2000;
  // путь в «клетках»: интеграл скорости, которая линейно растёт до 1/cellMs за ramp мс
  const dist = dt < ramp ? (dt * dt) / (2 * ramp * cellMs) : ramp / (2 * cellMs) + (dt - ramp) / cellMs;
  return { cell: Math.floor(dist) % RING_CELLS, frac: dist % 1, dist };
}
export function ringResult(layout: RingLayout, cell: number): 'gold' | 'green' | 'miss' {
  if (layout.gold === cell) return 'gold';
  if (layout.green.includes(cell)) return 'green';
  return 'miss';
}

// ───── Ритм-игра ─────
export interface RhythmNote {
  beat: number; // в долях от начала
  lane: number; // 0..3
}
export const RHYTHM_LEAD_BEATS = 4; // отсчёт до первой ноты
export function rhythmChart(seed: number, beats: number): RhythmNote[] {
  const r = rng(seed);
  const notes: RhythmNote[] = [];
  let lane = Math.floor(r() * 4);
  for (let b = RHYTHM_LEAD_BEATS; b < beats; b += 0.5) {
    const onBeat = b % 1 === 0;
    const p = onBeat ? 0.72 : 0.22;
    if (r() < p) {
      lane = (lane + 1 + Math.floor(r() * 3)) % 4;
      notes.push({ beat: b, lane });
    }
  }
  return notes;
}
export const RHYTHM_WINDOW = { perfect: 70, good: 150 };

// ───── Джа-одори (дракон) ─────
// Шаг i — левая нога при чётном i, правая при нечётном. Перед первым шагом — отсчёт DRAGON_COUNT долей.
// Первые warm шагов — разминка, дальше зачёт; каждые 8 шагов зачёта темп растёт на accel %, до maxBpm.
export const DRAGON_COUNT = 4;
export const DRAGON_BAR = 8;
export type DragonTiming = Pick<DragonPublic, 'startAt' | 'bpm' | 'accel' | 'maxBpm' | 'warm' | 'steps'>;

export function dragonBpm(d: DragonTiming, i: number) {
  const bar = Math.max(0, Math.floor((i - d.warm) / DRAGON_BAR));
  return Math.min(d.maxBpm, d.bpm * Math.pow(1 + d.accel / 100, bar));
}

const timesCache = new Map<string, number[]>();
/** время хоста каждого шага (разминка + зачёт) */
export function dragonTimes(d: DragonTiming): number[] {
  const key = `${d.startAt}|${d.bpm}|${d.accel}|${d.maxBpm}|${d.warm}|${d.steps}`;
  let out = timesCache.get(key);
  if (out) return out;
  out = [];
  let t = d.startAt + (DRAGON_COUNT * 60000) / d.bpm;
  for (let i = 0; i < d.warm + d.steps; i++) {
    if (i > 0) t += 60000 / dragonBpm(d, i);
    out.push(t);
  }
  if (timesCache.size > 8) timesCache.clear();
  timesCache.set(key, out);
  return out;
}

/** окно попадания шага i, мс (на быстром темпе уже, чтобы окна соседних шагов не слипались) */
export function dragonWindow(d: DragonTiming, i: number) {
  return Math.min(150, (60000 / dragonBpm(d, i)) * 0.42);
}

export const dragonFoot = (i: number): 'L' | 'R' => (i % 2 ? 'R' : 'L');

/** индекс шага, ближайшего ко времени t */
export function dragonNearest(times: number[], t: number) {
  let lo = 0, hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && t - times[lo - 1] < times[lo] - t ? lo - 1 : lo;
}

// ───── Пачинко ─────
export const PACHI = {
  W: 300,
  H: 480,
  R: 4.2, // радиус шарика
  PIN_R: 2.4,
  G: 0.15, // гравитация на шаг
  STEPS_PER_SEC: 60,
  jackpotBalls: 100,
  tulipBalls: 2,
  startBalls: 1,
  jackpotChance: 1 / 12,
};
export interface Pocket {
  kind: 'start' | 'tulip';
  x: number;
  y: number;
  w: number;
}
export const POCKETS: Pocket[] = [
  { kind: 'start', x: 150, y: 400, w: 16 },
  { kind: 'tulip', x: 72, y: 330, w: 14 },
  { kind: 'tulip', x: 228, y: 330, w: 14 },
  { kind: 'tulip', x: 150, y: 250, w: 12 },
];
export const PINS: [number, number][] = (() => {
  const pins: [number, number][] = [];
  for (let row = 0; row < 15; row++) {
    const y = 110 + row * 22;
    const offs = row % 2 ? 11 : 0;
    for (let x = 30 + offs; x <= 270; x += 22) {
      // оставляем проходы над карманами
      if (POCKETS.some((p) => Math.abs(p.x - x) < p.w && y > p.y - 26 && y < p.y + 6)) continue;
      if (Math.abs(x - 150) < 40 && y > 155 && y < 215) continue; // окно барабанов
      pins.push([x, y]);
    }
  }
  // «воронка» к стартовому карману
  pins.push([132, 384], [168, 384], [138, 372], [162, 372]);
  return pins;
})();

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: () => number;
  done: boolean;
}

/** шарик влетает сверху слева по дуге; сила определяет, куда он упадёт */
export function launchBall(seed: number, power: number): Ball {
  const r = rng(seed);
  const p = Math.max(0, Math.min(1, power));
  return { x: 12, y: 470, vx: 0.15, vy: -(10.9 + p * 2.6 + r() * 0.08), r, done: false };
}

/** один шаг физики. Только +,-,*,/,sqrt — детерминизм на всех устройствах. Возвращает событие. */
export function stepBall(b: Ball): null | 'lost' | Pocket {
  if (b.done) return null;
  const { W, H, R, PIN_R, G } = PACHI;
  b.vy += G;
  // сопротивление воздуха
  b.vx *= 0.995;
  b.x += b.vx;
  b.y += b.vy;
  // внешний рельс: верхняя дуга (круг радиуса 150 с центром (150,160))
  if (b.y < 160) {
    const dx = b.x - 150, dy = b.y - 160;
    const d = Math.sqrt(dx * dx + dy * dy);
    const lim = 146 - R;
    if (d > lim) {
      const nx = dx / d, ny = dy / d;
      b.x = 150 + nx * lim;
      b.y = 160 + ny * lim;
      const dot = b.vx * nx + b.vy * ny;
      if (dot > 0) { b.vx -= 1.02 * dot * nx; b.vy -= 1.02 * dot * ny; }
    }
  }
  if (b.x < 6 + R) { b.x = 6 + R; b.vx = Math.abs(b.vx) * 0.5; }
  if (b.x > W - 6 - R) { b.x = W - 6 - R; b.vx = -Math.abs(b.vx) * 0.5; }
  for (const [px, py] of PINS) {
    const dx = b.x - px, dy = b.y - py;
    const min = R + PIN_R;
    if (dx * dx + dy * dy < min * min) {
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const nx = dx / d, ny = dy / d;
      b.x = px + nx * min;
      b.y = py + ny * min;
      const dot = b.vx * nx + b.vy * ny;
      if (dot < 0) {
        b.vx -= 1.45 * dot * nx;
        b.vy -= 1.45 * dot * ny;
        b.vx += (b.r() - 0.5) * 0.5;
      }
    }
  }
  if (b.vy > 0) {
    for (const p of POCKETS) {
      if (Math.abs(b.y - p.y) < 4 && Math.abs(b.x - p.x) < p.w / 2) {
        b.done = true;
        return p;
      }
    }
  }
  if (b.y > H + 10 && b.vy > 0) {
    b.done = true;
    return 'lost';
  }
  return null;
}

/** результат розыгрыша барабанов для стартового кармана */
export function slotSpin(seed: number): { reels: [number, number, number]; jackpot: boolean } {
  const r = rng(seed ^ 0x5f3759df);
  if (r() < PACHI.jackpotChance) {
    const d = 1 + Math.floor(r() * 9);
    return { reels: [d, d, d], jackpot: true };
  }
  const a = 1 + Math.floor(r() * 9);
  let b = 1 + Math.floor(r() * 9);
  let c = 1 + Math.floor(r() * 9);
  if (a === b && b === c) c = (c % 9) + 1;
  // «рич»: два одинаковых для интриги
  if (r() < 0.25) b = a;
  if (a === b && b === c) c = (c % 9) + 1;
  return { reels: [a, b, c], jackpot: false };
}
