// Барабан: крутится и выбирает сектор (бонус, тему вопроса…).
// Результат решает хост заранее (makeSpin) и рассылает WheelSpin — дальше каждый экран сам
// считает угол по времени хоста, поэтому ТВ и телефоны останавливаются одновременно на одном секторе.
// Диск рисуется попиксельно на маленьком холсте и растягивается (image-rendering: pixelated);
// обод с лампочками и стрелка неподвижны, иконки секторов ездят по кругу, но не переворачиваются.
import { useEffect, useRef } from 'preact/hooks';
import { useDpr, useFrame } from './common';
import { sfx } from '../shared/sound';

export interface WheelSeg {
  id: string;
  label: string;
  color: string;
  /** картинка (data url иконки); без неё в секторе пишется short */
  icon?: string;
  short?: string;
  /** размер сектора и вероятность выпадения (по умолчанию 1) */
  weight?: number;
  /** радужный сектор (спецтема) */
  rainbow?: boolean;
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

const TAU = Math.PI * 2;
const R = 56; // радиус в пикселях холста
const RIM = 6; // ширина обода
const RD = R - RIM; // радиус диска
const HUB = 8;
const BULBS = 16;
const N = R * 2 + 2;

/** границы секторов по часовой от верха, в долях оборота */
function bounds(segs: WheelSeg[]) {
  const total = segs.reduce((a, s) => a + (s.weight ?? 1), 0) || 1;
  const b = [0];
  for (const s of segs) b.push(b[b.length - 1] + (s.weight ?? 1) / total);
  return b;
}

/** хост: выбрать сектор по весам и собрать вращение (rnd — Math.random или свой генератор) */
export function makeSpin(segs: WheelSeg[], startAt: number, from = 0, rnd: () => number = Math.random, dur = 5200): WheelSpin {
  const b = bounds(segs);
  const x = rnd();
  let result = segs.length - 1;
  for (let i = 0; i < segs.length; i++) if (x < b[i + 1]) { result = i; break; }
  return { startAt, dur, result, turns: 4 + Math.floor(rnd() * 2), offset: 0.15 + rnd() * 0.7, from };
}

/** итоговый угол поворота */
function finalRot(segs: WheelSeg[], sp: WheelSpin) {
  const b = bounds(segs);
  const at = (b[sp.result] + (b[sp.result + 1] - b[sp.result]) * sp.offset) * TAU; // точка под стрелкой
  const target = (((TAU - at) % TAU) + TAU) % TAU;
  const delta = (((target - sp.from) % TAU) + TAU) % TAU;
  return sp.from + sp.turns * TAU + delta;
}

/** угол поворота диска в момент t; done — уже остановился */
export function wheelRot(segs: WheelSeg[], sp: WheelSpin | null, t: number): { rot: number; done: boolean; spinning: boolean } {
  if (!sp) return { rot: 0, done: false, spinning: false };
  if (t <= sp.startAt) return { rot: sp.from, done: false, spinning: false };
  const end = finalRot(segs, sp);
  const p = Math.min(1, (t - sp.startAt) / sp.dur);
  // короткий замах назад, потом разгон и долгое торможение
  const W = 0.07;
  if (p < W) return { rot: sp.from - 0.18 * Math.sin((Math.PI * p) / W), done: false, spinning: true };
  const q = (p - W) / (1 - W);
  const e = 1 - Math.pow(1 - q, 4);
  return { rot: sp.from + (end - sp.from) * e, done: p >= 1, spinning: p < 1 };
}

// ───── цвета ─────
const hex = (c: string) => {
  const m = c.replace('#', '');
  const v = parseInt(m.length === 3 ? m.split('').map((x) => x + x).join('') : m, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const mix = (c: number[], k: number, to = 0) => c.map((v) => Math.round(v + (to - v) * k));
function hsl(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255].map(Math.round);
}
const OUT = hex('#0d0b1e');
const GOLD = hex('#f2b51f'), GOLD_D = hex('#b07a0c'), GOLD_L = hex('#ffe08a');
const BULB_ON = hex('#fff6c2'), BULB_OFF = hex('#7a5410');

// стрелка сверху: X — контур, Y — тело, W — блик
const POINTER = [
  'XXXXXXXXX',
  'XWYYYYYYX',
  'XWYYYYYYX',
  '.XYYYYYX.',
  '.XYYYYYX.',
  '..XYYYX..',
  '..XYYYX..',
  '...XYX...',
  '....X....',
];

export function Wheel({ segs, spin, now, size: want = 420, sound = false }: { segs: WheelSeg[]; spin: WheelSpin | null; now: () => number; size?: number; sound?: boolean }) {
  useFrame(true);
  // целое число точек экрана на пиксель барабана, иначе пиксели выходят разной ширины
  const dpr = useDpr();
  const size = (N * Math.max(1, Math.round((want * dpr) / N))) / dpr;
  const cv = useRef<HTMLCanvasElement>(null);
  const lastSeg = useRef(-1);
  const t = now();
  const { rot, done, spinning } = wheelRot(segs, spin, t);
  const b = bounds(segs);
  const local = (((-rot) % TAU) + TAU) % TAU / TAU; // какая доля диска под стрелкой
  let under = 0;
  while (under < segs.length - 1 && local >= b[under + 1]) under++;
  const win = done && spin ? spin.result : -1;
  // «щелчок» стрелки, когда под ней проходит граница сектора
  const segFrac = (local - b[under]) / Math.max(1e-6, b[under + 1] - b[under]);
  const kick = spinning && segFrac < 0.2 ? 1 : 0;

  useEffect(() => {
    if (lastSeg.current !== under && lastSeg.current !== -1 && spinning && sound) sfx.tick();
    lastSeg.current = under;
  });
  useEffect(() => { if (done && sound) sfx.fanfare(); }, [done, spin?.startAt]);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(N, N);
    const d = img.data;
    const cols = segs.map((s) => hex(s.color));
    const blink = Math.floor(t / 250) % 2 === 0;
    const put = (x: number, y: number, c: number[]) => { const i = (y * N + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
    // лампочки на ободе
    const lit = (k: number) => {
      if (done) return blink;
      if (spinning) { const h = Math.floor(t / 55) % BULBS; return (k - h + BULBS) % BULBS < 3; }
      return (k + Math.floor(t / 500)) % 2 === 0;
    };
    const bulbAt: [number, number][] = [];
    for (let k = 0; k < BULBS; k++) {
      const a = (k / BULBS) * TAU;
      bulbAt.push([R + 1 + Math.sin(a) * (R - RIM / 2), R + 1 - Math.cos(a) * (R - RIM / 2)]);
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - (R + 1), dy = y + 0.5 - (R + 1);
      const r = Math.hypot(dx, dy);
      if (r > R + 0.5) continue;
      if (r > R - 0.5) { put(x, y, OUT); continue; }
      if (r > RD + 0.5) {
        // обод: золото с бликом сверху-слева, лампочки
        let c = r > R - 1.5 ? GOLD_D : r < RD + 1.5 ? GOLD_D : dy < -dx * 0.3 ? GOLD_L : GOLD;
        for (let k = 0; k < BULBS; k++) {
          const [bx, by] = bulbAt[k];
          const br = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
          if (br < 1.9) { c = lit(k) ? (br < 0.8 ? [255, 255, 255] : BULB_ON) : BULB_OFF; break; }
          if (br < 2.6) { c = OUT; break; }
        }
        put(x, y, c);
        continue;
      }
      if (r > RD - 0.5) { put(x, y, OUT); continue; }
      if (r < HUB + 0.5) {
        // ступица
        const c = r > HUB - 0.5 ? OUT : r > HUB - 1.5 ? GOLD_D : dx + dy < -3 ? GOLD_L : r < 2 && dx < 0 && dy < 0 ? [255, 255, 255] : GOLD;
        put(x, y, c);
        continue;
      }
      // диск: угол по часовой от верха в системе диска
      let a = Math.atan2(dx, -dy) - rot;
      a = (((a % TAU) + TAU) % TAU) / TAU;
      let i = 0;
      while (i < segs.length - 1 && a >= b[i + 1]) i++;
      // разделители: на расстоянии меньше пикселя от границы
      const da = Math.min(a - b[i], b[i + 1] - a) * TAU * r;
      if (da < 0.7 && segs.length > 1) { put(x, y, OUT); continue; }
      const s = segs[i];
      let c: number[];
      if (s.rainbow) {
        // радуга кольцами от центра наружу, переливается
        const step = Math.floor(((r - HUB) / (RD - HUB)) * 7 + t / 160) % 7;
        c = hsl((step * 360) / 7, 0.85, 0.6);
      } else c = cols[i];
      if (r > RD - 2.5) c = mix(c, 0.3); // тень от обода
      else if (r < HUB + 2.5) c = mix(c, 0.25);
      else if (da < 1.7) c = mix(c, 0.25, 255); // светлый кант у разделителя
      if (win >= 0) c = i === win ? (blink ? mix(c, 0.35, 255) : c) : mix(c, 0.55);
      put(x, y, c);
    }
    // стрелка
    const ox = R + 1 - 4 + (kick ? -1 : 0), oy = 0;
    POINTER.forEach((row, py) => row.split('').forEach((ch, px) => {
      if (ch === '.') return;
      const x = ox + px, y = oy + py;
      if (x < 0 || x >= N) return;
      put(x, y, ch === 'X' ? OUT : ch === 'W' ? hex('#ffd1d8') : hex('#e8364e'));
    }));
    ctx.putImageData(img, 0, 0);
  });

  const k = size / N;
  return (
    <div class={'wheel' + (done ? ' done' : '')} style={{ width: size, height: size }}>
      <canvas ref={cv} width={N} height={N} class="wheel-cv" style={{ width: size, height: size }} />
      {segs.map((s, i) => {
        const mid = (b[i] + b[i + 1]) / 2 * TAU + rot;
        const rr = (HUB + (RD - HUB) * 0.6) * k;
        const x = size / 2 + Math.sin(mid) * rr, y = size / 2 - Math.cos(mid) * rr;
        const dim = win >= 0 && i !== win;
        return (
          <div class={'wheel-item' + (dim ? ' dim' : '') + (i === win ? ' win' : '')} style={{ left: x, top: y, fontSize: size / 18 }}>
            {s.icon ? <img src={s.icon} alt="" style={{ height: size / 9 }} draggable={false} /> : <b>{s.short ?? s.label}</b>}
          </div>
        );
      })}
    </div>
  );
}

/** подпись под барабаном: что выпало (или что под стрелкой во время вращения) */
export function wheelLabel(segs: WheelSeg[], spin: WheelSpin | null, t: number) {
  const { done, spinning } = wheelRot(segs, spin, t);
  if (done && spin) return { text: segs[spin.result].label, done: true };
  return { text: spinning ? 'Крутим…' : '', done: false };
}
