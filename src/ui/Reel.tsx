// Барабан как в «одноруком бандите»: в окошке видно три ячейки, лента крутится сверху вниз
// и останавливается — выпавшая ячейка встаёт в центральную рамку, верхняя и нижняя притемнены.
// Результат решает хост заранее (makeSpin) и рассылает ReelSpin — дальше каждый экран сам
// считает положение ленты по времени хоста, поэтому ТВ и телефоны останавливаются одновременно на одной ячейке.
// Лента — кусок цилиндра: ячейки у краёв окошка ниже и темнее центральной.
import { useEffect, useRef } from 'preact/hooks';
import { useFrame } from './common';
import { sfx } from '../shared/sound';

export interface ReelSeg {
  id: string;
  label: string;
  color: string;
  /** картинка (data url иконки); без неё в ячейке крупно пишется short */
  icon?: string;
  short?: string;
  /** вероятность выпадения (по умолчанию 1); ячейки на ленте одного размера */
  weight?: number;
  /** радужная ячейка (спецтема) */
  rainbow?: boolean;
}

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

/** хост: выбрать ячейку по весам и собрать вращение (rnd — Math.random или свой генератор) */
export function makeSpin(segs: ReelSeg[], startAt: number, from = 0, rnd: () => number = Math.random, dur = 4600): ReelSpin {
  const total = segs.reduce((a, s) => a + (s.weight ?? 1), 0) || 1;
  const x = rnd() * total;
  let result = segs.length - 1;
  for (let i = 0, acc = 0; i < segs.length; i++) { acc += segs[i].weight ?? 1; if (x < acc) { result = i; break; } }
  // мимо окошка должно пролететь ~30 ячеек, сколько бы их ни было на ленте
  const turns = Math.max(1, Math.ceil(28 / Math.max(1, segs.length))) + Math.floor(rnd() * 2);
  return { startAt, dur, result, turns, from };
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** где остановится лента: ровно на выпавшей ячейке, не меньше turns оборотов */
function finalPos(segs: ReelSeg[], sp: ReelSpin) {
  const n = Math.max(1, segs.length);
  const k = Math.ceil(sp.from + sp.turns * n);
  return k + mod(sp.result - k, n);
}

/** положение ленты в момент t (в ячейках; целое — ячейка ровно в рамке); done — уже остановилась */
export function reelPos(segs: ReelSeg[], sp: ReelSpin | null, t: number): { pos: number; done: boolean; spinning: boolean } {
  if (!sp) return { pos: 0, done: false, spinning: false };
  if (t <= sp.startAt) return { pos: sp.from, done: false, spinning: false };
  const end = finalPos(segs, sp);
  const p = Math.min(1, (t - sp.startAt) / sp.dur);
  // короткий рывок назад (как рычаг дёрнули), разгон, торможение с перелётом и откат в рамку
  const W = 0.06, S = 0.88, OVER = 0.28;
  if (p < W) return { pos: sp.from - 0.3 * Math.sin((Math.PI * p) / W), done: false, spinning: true };
  if (p < S) {
    const q = (p - W) / (S - W);
    const e = 1 - Math.pow(1 - q, 3);
    return { pos: sp.from + (end + OVER - sp.from) * e, done: false, spinning: true };
  }
  const q = (p - S) / (1 - S);
  return { pos: end + OVER * (1 - Math.sin((Math.PI / 2) * q)), done: p >= 1, spinning: p < 1 };
}

/** какая ячейка сейчас в рамке */
const underFrame = (segs: ReelSeg[], pos: number) => mod(Math.round(pos), Math.max(1, segs.length));

// стрелки по бокам рамки: X — контур, Y — тело, W — блик (нарисована правая, смотрит влево)
const ARROW = [
  '....XX',
  '..XXWX',
  'XXWYYX',
  'XYYYYX',
  '..XXYX',
  '....XX',
];
const OUT = '#0d0b1e';
function Arrow({ px, flip }: { px: number; flip?: boolean }) {
  const rects: any[] = [];
  ARROW.forEach((row, y) => row.split('').forEach((ch, x) => {
    if (ch === '.') return;
    rects.push(<rect x={x} y={y} width={1} height={1} fill={ch === 'X' ? OUT : ch === 'W' ? '#ffd1d8' : '#e8364e'} />);
  }));
  return (
    <svg class={'reel-arrow' + (flip ? ' flip' : '')} width={6 * px} height={6 * px} viewBox="0 0 6 6" shape-rendering="crispEdges">{rects}</svg>
  );
}

const RAINBOW = ['#ff4d4d', '#ff9f43', '#ffd23f', '#5ce16b', '#2ee6d6', '#4dabff', '#c77dff'];

export function Reel({ segs, spin, now, size = 380, sound = false }: { segs: ReelSeg[]; spin: ReelSpin | null; now: () => number; size?: number; sound?: boolean }) {
  useFrame(true);
  const last = useRef(-1);
  const t = now();
  const { pos, done, spinning } = reelPos(segs, spin, t);
  const n = Math.max(1, segs.length);
  const under = underFrame(segs, pos);
  const win = done && spin ? spin.result : -1;
  const blink = Math.floor(t / 250) % 2 === 0;
  // скорость ленты (ячеек за кадр) — для смаза при быстром вращении
  const speed = Math.abs(pos - reelPos(segs, spin, t - 16).pos);

  useEffect(() => {
    if (last.current !== under && last.current !== -1 && spinning && sound) sfx.tick();
    last.current = under;
  });
  useEffect(() => { if (done && sound) sfx.fanfare(); }, [done, spin?.startAt]);

  // окошко: три ячейки на цилиндре радиуса R, одна ячейка — угол A
  const px = Math.max(2, Math.round(size / 120));
  const winW = size - px * 8;
  const winH = Math.round(winW * 0.78);
  const A = 0.5;
  const R = winH / 2 / Math.sin(1.5 * A);
  const mid = winH / 2;
  const yAt = (th: number) => mid + R * Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, th)));
  const cellH = R * 2 * Math.sin(A / 2); // высота центральной ячейки
  const selTop = Math.round(mid - cellH / 2), selH = Math.round(cellH);

  const cells: any[] = [];
  const base = Math.floor(pos);
  for (let j = base - 2; j <= base + 2; j++) {
    // ячейка j в рамке, когда pos = j; лента едет вниз — следующие ячейки приходят сверху
    const th0 = (j - pos - 0.5) * A, th1 = (j - pos + 0.5) * A;
    const top = Math.round(yAt(-th1)), bot = Math.round(yAt(-th0));
    if (bot <= 0 || top >= winH || bot - top < 1) continue;
    const i = mod(j, n);
    const s = segs[i];
    const d = Math.min(1, Math.abs(j - pos)); // 0 — в рамке, 1 — соседняя
    let bright = 1 - 0.5 * d;
    if (win >= 0 && i !== win) bright *= 0.7;
    const bg = s.rainbow
      ? `linear-gradient(90deg, ${RAINBOW.map((c, k) => `${c} ${(k / 7) * 100}% ${((k + 1) / 7) * 100}%`).join(', ')})`
      : s.color;
    const blur = Math.min(3, speed * cellH * 0.12);
    cells.push(
      <div
        class={'reel-cell' + (win >= 0 && i === win && j === Math.round(pos) ? ' win' + (blink ? ' lit' : '') : '')}
        style={{
          top, height: bot - top, '--c': s.rainbow ? '#fff' : s.color, background: bg,
          backgroundSize: s.rainbow ? `${winW * 2}px 100%` : undefined,
          backgroundPosition: s.rainbow ? `${Math.round((t / 12) % (winW * 2))}px 0` : undefined,
          filter: `brightness(${bright.toFixed(3)})${d > 0.5 ? ` saturate(${(1.5 - d).toFixed(2)})` : ''}`,
        } as any}
      >
        <div class="reel-in" style={{ height: cellH, transform: `scaleY(${((bot - top) / cellH).toFixed(4)})`, filter: blur > 0.4 ? `blur(${blur.toFixed(1)}px)` : undefined, fontSize: Math.round(size / 16) }}>
          {s.icon && <img src={s.icon} alt="" style={{ height: Math.round(cellH * 0.62) }} draggable={false} />}
          <b>{s.icon ? s.label : s.short ?? s.label}</b>
        </div>
      </div>,
    );
  }

  return (
    <div class={'reel' + (done ? ' done' : '') + (spinning ? ' spinning' : '')} style={{ width: size, '--rp': `${px}px` } as any}>
      <div class="reel-win" style={{ width: winW, height: winH }}>
        {cells}
        <div class="reel-shade" />
        <div class={'reel-sel' + (done && blink ? ' lit' : '')} style={{ top: selTop, height: selH }} />
      </div>
      <div class="reel-arrows" style={{ top: px * 4 + selTop + selH / 2 }}>
        <Arrow px={Math.round(px * 1.5)} flip />
        <Arrow px={Math.round(px * 1.5)} />
      </div>
    </div>
  );
}

/** подпись под барабаном: что выпало */
export function reelLabel(segs: ReelSeg[], spin: ReelSpin | null, t: number) {
  const { done, spinning } = reelPos(segs, spin, t);
  if (done && spin) return { text: segs[spin.result].label, done: true };
  return { text: spinning ? 'Крутим…' : '', done: false };
}
