// Гонка на перевале (тогэ) — дуэль «машина против машины».
// Трасса строится из общего зерна, поэтому у обоих гонщиков она одна; каждый едет у себя на телефоне
// (время считает телефон по одинаковой физике с фиксированным шагом), на хост уходят только отсечки
// (контрольные точки) и финиш. ТВ по отсечкам показывает «призраков» на схеме трассы.
//
// Управление: ГАЗ (держать) и ЗАНОС (зажать у входа в поворот, отпустить на выходе).
//  • в повороте без заноса машина держит дорогу только на малой скорости — иначе отбойник;
//  • в заносе скорость поворота выше, но на вход нельзя влетать быстрее предела (перед шпилькой — сбрось газ);
//  • отпустил занос точно на выходе — ускорение; занос на прямой тормозит.

export type TrackKind = 'touge' | 'wangan' | 'snow' | 'coast';

export const TRACKS: Record<TrackKind, { name: string; ja: string; sub: string; sky: [string, string]; ground: string; road: string; line: string; grip: number }> = {
  touge: { name: 'Ночной перевал', ja: '峠', sub: 'серпантин в горах', sky: ['#0b1030', '#27306a'], ground: '#14321f', road: '#3a3d4c', line: '#f2e9c9', grip: 1 },
  wangan: { name: 'Ночная столичная магистраль', ja: '首都高', sub: 'огни Канто', sky: ['#0a0a1e', '#3a1f5c'], ground: '#1b1e33', road: '#30323f', line: '#ffd23f', grip: 1 },
  snow: { name: 'Снежный перевал', ja: '雪峠', sub: 'скользко!', sky: ['#1b2748', '#6b84b8'], ground: '#dfe9f5', road: '#8f9bb0', line: '#ffffff', grip: 0.88 },
  coast: { name: 'Прибрежная на закате', ja: '海岸線', sub: 'океан слева, скалы справа', sky: ['#ff9a5a', '#7a3b7a'], ground: '#c9a36a', road: '#4a4350', line: '#fff3d6', grip: 1 },
};

/** трасса по региону префектуры, где идёт дуэль */
export function trackFor(region: string | undefined): TrackKind {
  if (region === 'kanto') return 'wangan';
  if (region === 'hokkaido' || region === 'tohoku') return 'snow';
  if (region === 'kyushu' || region === 'shikoku') return 'coast';
  return 'touge';
}

/** поворот: [a, b) в метрах от старта, dir −1 влево / +1 вправо, tight 1 шпилька … 3 быстрая дуга */
export interface Corner { a: number; b: number; dir: -1 | 1; tight: 1 | 2 | 3 }
export interface Track {
  kind: TrackKind;
  total: number;
  corners: Corner[];
  /** контрольные точки (метры); последняя — финиш */
  cps: number[];
  /** ось трассы для рисования: точки каждые STEP метров */
  pts: { x: number; y: number; h: number }[];
}

export const STEP = 4;
export const N_CPS = 8;
const CORNER = {
  1: { len: 64, angle: 150, cap: 22, entry: 31, name: 'шпилька' },
  2: { len: 72, angle: 90, cap: 31, entry: 42, name: 'поворот' },
  3: { len: 84, angle: 45, cap: 41, entry: 54, name: 'дуга' },
} as const;
export const cornerName = (c: Corner) => CORNER[c.tight].name;

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeTrack(seed: number, kind: TrackKind): Track {
  const r = rng(seed);
  const corners: Corner[] = [];
  const n = kind === 'wangan' ? 6 : 7;
  let s = 150; // стартовая прямая
  let lean = 0; // суммарный поворот — чтобы трасса не закручивалась в клубок
  for (let i = 0; i < n; i++) {
    const roll = r();
    const tight = (kind === 'wangan' ? (roll < 0.15 ? 1 : roll < 0.55 ? 2 : 3) : roll < 0.4 ? 1 : roll < 0.8 ? 2 : 3) as 1 | 2 | 3;
    let dir: -1 | 1 = r() < 0.5 ? -1 : 1;
    if (Math.abs(lean + dir * CORNER[tight].angle) > 170) dir = (-dir) as -1 | 1;
    lean += dir * CORNER[tight].angle;
    corners.push({ a: s, b: s + CORNER[tight].len, dir, tight });
    s += CORNER[tight].len + (kind === 'wangan' ? 150 : 90) + Math.floor(r() * 12) * 10;
  }
  const total = Math.round(s + 40);
  const cps = Array.from({ length: N_CPS }, (_, i) => Math.round((total * (i + 1)) / N_CPS));
  // ось трассы
  const pts: Track['pts'] = [];
  let x = 0, y = 0, h = -Math.PI / 2;
  for (let d = 0; d <= total; d += STEP) {
    pts.push({ x, y, h });
    const c = corners.find((q) => d >= q.a && d < q.b);
    if (c) h += (c.dir * CORNER[c.tight].angle * Math.PI) / 180 / (CORNER[c.tight].len / STEP);
    x += Math.cos(h) * STEP;
    y += Math.sin(h) * STEP;
  }
  return { kind, total, corners, cps, pts };
}

/** точка оси трассы на расстоянии d */
export function trackAt(t: Track, d: number) {
  const f = Math.max(0, Math.min(t.pts.length - 1.001, d / STEP));
  const i = Math.floor(f), k = f - i;
  const a = t.pts[i], b = t.pts[i + 1] ?? a;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, h: a.h + (b.h - a.h) * k };
}

// ───── физика ─────

export const DT = 1 / 60;
export const VMAX = 58;
const ACCEL = 15, COAST = 13, SCRUB = 34, DRIFT_DRAG = 11;
/** занос можно начать чуть раньше поворота и отпустить в окне у выхода */
const EARLY = 16, EXIT_BEFORE = 12, EXIT_AFTER = 16;
const BOOST = 9;

export interface Car {
  /** путь, м; скорость, м/с; время, с */
  s: number;
  v: number;
  t: number;
  steps: number;
  drift: boolean;
  /** оглушён после удара, с */
  stun: number;
  /** в этом повороте уже был удар — дальше едем осторожно */
  hitIn: number;
  /** поворот, из которого ещё не вышли в заносе: ждём отпускания */
  exitOf: number;
  hits: number;
  perfect: number;
  /** последнее событие — для подписи и звука */
  ev: null | { k: 'hit' | 'perfect' | 'late' | 'early'; at: number };
  /** отсечки, мс */
  splits: number[];
  done: boolean;
}

export const newCar = (): Car => ({ s: 0, v: 0, t: 0, steps: 0, drift: false, stun: 0, hitIn: -1, exitOf: -1, hits: 0, perfect: 0, ev: null, splits: [], done: false });

/** один шаг физики (DT): gas и drift — зажаты ли кнопки */
export function stepCar(c: Car, tr: Track, gas: boolean, drift: boolean) {
  if (c.done) return;
  const grip = TRACKS[tr.kind].grip;
  const ci = tr.corners.findIndex((q) => c.s >= q.a && c.s < q.b);
  const corner = ci >= 0 ? tr.corners[ci] : null;
  const next = tr.corners.find((q) => q.a > c.s);
  const hit = () => { c.v = Math.min(c.v, 7); c.stun = 0.75; c.hits++; c.hitIn = ci; c.ev = { k: 'hit', at: c.t }; };

  // отпустили занос
  if (c.drift && !drift) {
    const of = c.exitOf >= 0 ? tr.corners[c.exitOf] : corner;
    if (of) {
      const d = c.s - of.b;
      if (d >= -EXIT_BEFORE && d <= EXIT_AFTER) { c.v = Math.min(VMAX + 6, c.v + BOOST * (1 - Math.abs(d - 2) / 26)); c.perfect++; c.ev = { k: 'perfect', at: c.t }; }
      else if (d > EXIT_AFTER) c.ev = { k: 'late', at: c.t };
      else c.ev = { k: 'early', at: c.t };
    }
    c.exitOf = -1;
  }
  // зажали занос слишком рано — тормозим впустую; у входа — нормально
  c.drift = drift;
  if (corner && drift) c.exitOf = ci;

  if (c.stun > 0) c.stun -= DT;
  if (corner) {
    const k = CORNER[corner.tight];
    const cap = k.cap * grip, safe = cap * 0.68;
    if (c.hitIn === ci) c.v = Math.min(c.v, safe); // после удара доезжаем поворот тихо
    else if (drift) {
      // влетел быстрее предела — занос не спасает
      if (c.s - corner.a < 10 && c.v > k.entry * grip + 0.5) hit();
      else if (c.v > cap) c.v = Math.max(cap, c.v - SCRUB * DT);
    } else if (c.v > safe && c.s - corner.a > 8) hit();
  }
  const onStraightDrift = drift && !corner && !(next && next.a - c.s <= EARLY) && c.exitOf < 0;
  const lateExit = drift && !corner && c.exitOf >= 0 && c.s - tr.corners[c.exitOf].b > EXIT_AFTER;
  if (onStraightDrift || lateExit) c.v = Math.max(0, c.v - DRIFT_DRAG * DT);
  else if (gas && c.stun <= 0) {
    const lim = corner && drift ? CORNER[corner.tight].cap * grip : VMAX;
    if (c.v < lim) c.v = Math.min(lim, c.v + ACCEL * (1 - (c.v / (VMAX + 14)) ** 2) * DT);
    else if (c.v > VMAX) c.v = Math.max(VMAX, c.v - 4 * DT);
  } else c.v = Math.max(0, c.v - COAST * DT);

  c.s += c.v * DT;
  c.steps++;
  c.t = c.steps * DT;
  while (c.splits.length < tr.cps.length && c.s >= tr.cps[c.splits.length]) c.splits.push(Math.round(c.t * 1000));
  if (c.s >= tr.total) { c.done = true; c.s = tr.total; }
}

/** предел скорости на входе в поворот (для подсказки штурмана), км/ч */
export const entryKmh = (c: Corner, kind: TrackKind) => Math.round(CORNER[c.tight].entry * TRACKS[kind].grip * 3.6);
export const kmh = (v: number) => Math.round(v * 3.6);
export const fmtRace = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(Math.floor(ms / 10) % 100).padStart(2, '0')}`;

/** бот-гонщик: простой автопилот (и проверка, что трасса проходима); skill 0..1 — как точно жмёт */
export const botRun = (tr: Track, skill = 0.7, seed = 1): number[] => botSim(tr, skill, seed).splits;
export function botSim(tr: Track, skill = 0.7, seed = 1): Car {
  const r = rng(seed);
  const c = newCar();
  let sloppy = 0;
  while (!c.done && c.steps < 60 * 240) {
    const corner = tr.corners.find((q) => c.s >= q.a - EARLY + 6 && c.s < q.b + sloppy);
    // сбрасываем газ перед поворотом, если летим быстрее входа
    let gas = true;
    const ahead = tr.corners.find((q) => q.a > c.s - 10 && c.s < q.a + 10);
    if (ahead) {
      const lim = CORNER[ahead.tight].entry * TRACKS[tr.kind].grip - 2;
      const need = (c.v * c.v - lim * lim) / (2 * COAST);
      if (c.v > lim && ahead.a - c.s <= need + 6) gas = false;
    }
    const was = c.drift;
    stepCar(c, tr, gas, !!corner);
    if (was && !c.drift) sloppy = r() > skill ? 10 + r() * 30 : r() * 6;
  }
  return c;
}
