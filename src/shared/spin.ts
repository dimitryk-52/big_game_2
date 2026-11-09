// Вращения барабана (ленты) и колеса — чистые функции без интерфейса: хост решает результат заранее
// и рассылает спин, а каждый экран сам считает положение по времени хоста (ui/Reel.tsx, ui/Wheel.tsx).

export interface ReelSpin {
  /** время хоста начала вращения, мс */
  startAt: number;
  dur: number;
  /** индекс выпавшей ячейки */
  result: number;
  /** полных оборотов ленты до остановки */
  turns: number;
  /** положение ленты до вращения (конец прошлого вращения), в ячейках */
  from: number;
}

export interface WheelSpin {
  /** время хоста начала вращения, мс */
  startAt: number;
  dur: number;
  /** индекс выпавшего сектора */
  result: number;
  /** полных оборотов до остановки */
  turns: number;
  /** где внутри сектора остановится стрелка: 0..1 */
  offset: number;
  /** угол покоя до вращения, рад (конец прошлого вращения) */
  from: number;
}

/** длительность вращения барабана, мс */
export const REEL_MS = 3200;

/** индекс по весам */
export function pickWeighted(weights: number[], rnd: () => number = Math.random): number {
  const total = weights.reduce((a, w) => a + Math.max(0, w), 0) || 1;
  const x = rnd() * total;
  for (let i = 0, acc = 0; i < weights.length; i++) { acc += Math.max(0, weights[i]); if (x < acc) return i; }
  return weights.length - 1;
}

/** барабан: выбрать ячейку по весам (или взять result) и собрать вращение */
export function makeReelSpin(weights: number[], startAt: number, from = 0, rnd: () => number = Math.random, dur = REEL_MS, result?: number): ReelSpin {
  const n = Math.max(1, weights.length);
  const res = result ?? pickWeighted(weights, rnd);
  // мимо окошка должно пролететь ~20 ячеек, сколько бы их ни было на ленте
  const turns = Math.max(1, Math.ceil(20 / n)) + Math.floor(rnd() * 2);
  return { startAt, dur, result: res, turns, from };
}

/** колесо: выбрать сектор по весам (или взять result) и собрать вращение */
export function makeWheelSpin(weights: number[], startAt: number, from = 0, rnd: () => number = Math.random, dur = 5200, result?: number): WheelSpin {
  const res = result ?? pickWeighted(weights, rnd);
  return { startAt, dur, result: res, turns: 4 + Math.floor(rnd() * 2), offset: 0.15 + rnd() * 0.7, from };
}

const TAU = Math.PI * 2;

/** границы секторов колеса по часовой от верха, в долях оборота */
export function wheelBounds(weights: number[]) {
  const total = weights.reduce((a, w) => a + w, 0) || 1;
  const b = [0];
  for (const w of weights) b.push(b[b.length - 1] + w / total);
  return b;
}

/** итоговый угол поворота колеса после вращения */
export function wheelFinalRot(weights: number[], sp: WheelSpin) {
  const b = wheelBounds(weights);
  const at = (b[sp.result] + (b[sp.result + 1] - b[sp.result]) * sp.offset) * TAU; // точка под стрелкой
  const target = (((TAU - at) % TAU) + TAU) % TAU;
  const delta = (((target - sp.from) % TAU) + TAU) % TAU;
  return sp.from + sp.turns * TAU + delta;
}
