// Симуляция и отрисовка пачинко. Шарики не сталкиваются друг с другом,
// поэтому траектория определяется только (seed, power) — ТВ повторяет её точно.
import { uiFont } from '../shared/util';
import { type Ball, PACHI, PINS, POCKETS, launchBall, slotSpin, stepBall, type Pocket } from './logic';

export interface SpinState {
  reels: [number, number, number];
  jackpot: boolean;
  start: number;
}

export class PachinkoSim {
  balls: Ball[] = [];
  spinQueue: { reels: [number, number, number]; jackpot: boolean }[] = [];
  spin: SpinState | null = null;
  lastPocket: { p: Pocket; t: number } | null = null;
  clock = 0;
  private acc = 0;
  onPocket: ((p: Pocket, seed: number) => void) | null = null;
  onSpinEnd: ((s: SpinState) => void) | null = null;

  launch(seed: number, power: number) {
    const b = launchBall(seed, power);
    (b as any).seed = seed;
    this.balls.push(b);
  }

  /** продвинуть симуляцию на dt мс (фиксированный шаг 60 Гц) */
  advance(dt: number) {
    this.acc += Math.min(dt, 250);
    const step = 1000 / PACHI.STEPS_PER_SEC;
    while (this.acc >= step) {
      this.acc -= step;
      this.clock += step;
      for (const b of this.balls) {
        const ev = stepBall(b);
        if (ev && ev !== 'lost') {
          this.lastPocket = { p: ev, t: this.clock };
          if (ev.kind === 'start') this.spinQueue.push(slotSpin((b as any).seed));
          this.onPocket?.(ev, (b as any).seed);
        }
      }
      this.balls = this.balls.filter((b) => !b.done);
      if (this.spin && this.clock - this.spin.start > 2400) {
        const s = this.spin;
        this.spin = null;
        this.onSpinEnd?.(s);
      }
      if (!this.spin && this.spinQueue.length) {
        const n = this.spinQueue.shift()!;
        this.spin = { ...n, start: this.clock };
      }
    }
  }
}

// Картинки из src/img/pachinko/ (Nano Banana): pachinko_bg.png — доска целиком (5:8), ball.png — шарик.
// Пока их нет — всё рисует код ниже.
const art = import.meta.glob<string>('../img/pachinko/*.png', { eager: true, import: 'default', query: '?url' });
const artImg = (name: string) => {
  const u = Object.entries(art).find(([p]) => p.endsWith('/' + name))?.[1];
  if (!u || typeof Image === 'undefined') return null;
  const im = new Image();
  im.src = u;
  return im;
};
const BG_ART = artImg('pachinko_bg.png');
const BALL_ART = artImg('ball.png');

let boardCache: HTMLCanvasElement | null = null;
/** неподвижная доска: ночное небо ступеньками, звёзды, лучи за барабанами, хромовая дуга */
function board() {
  if (boardCache) return boardCache;
  const { W, H } = PACHI;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const art = !!(BG_ART?.complete && BG_ART.naturalWidth);
  if (art) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(BG_ART!, 0, 0, W, H);
  } else {
    // небо: полосы от тёмно-синего к пурпурному, на стыках — шахматный дизеринг
    const bands = ['#120d2e', '#1a1240', '#241650', '#311a5e', '#40206a', '#53266f', '#6a2c70'];
    const bh = Math.ceil(H / bands.length);
    bands.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(0, i * bh, W, bh);
      if (i) {
        ctx.fillStyle = bands[i - 1];
        for (let x = 0; x < W; x += 4) for (let y = 0; y < 4; y += 2) ctx.fillRect(x + (y % 4 ? 2 : 0), i * bh + y, 2, 2);
      }
    });
    // звёзды
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = r() < 0.2 ? '#ffe9a8' : '#8f86d6';
      const big = r() < 0.15 ? 2 : 1;
      ctx.fillRect(Math.floor(r() * W), Math.floor(r() * H * 0.8), big, big);
    }
    // лучи «солнца» за окном барабанов
    const cx = 150, cy = 185;
    ctx.fillStyle = 'rgba(255, 120, 160, 0.14)';
    for (let k = 0; k < 16; k += 2) {
      const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * 260, cy + Math.sin(a0) * 260);
      ctx.lineTo(cx + Math.cos(a1) * 260, cy + Math.sin(a1) * 260);
      ctx.fill();
    }
  }
  // хромовая дуга-рельс: три тона металла (шарики катятся по ней — рисуем и поверх картинки)
  const rail = (col: string, w: number, rr: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(150, 160, rr, Math.PI, 2 * Math.PI);
    ctx.moveTo(150 - rr, 160);
    ctx.lineTo(150 - rr, H);
    ctx.moveTo(150 + rr, 160);
    ctx.lineTo(150 + rr, H);
    ctx.stroke();
  };
  rail('#5d6378', 6, 147);
  rail('#c9cfdd', 3, 147);
  rail('#ffffff', 1, 146);
  // окно барабанов: рамка с золотой кромкой
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(103, 155, 94, 60);
  ctx.fillStyle = '#b8314e';
  ctx.fillRect(105, 157, 90, 56);
  ctx.fillStyle = '#0c0b16';
  ctx.fillRect(108, 160, 84, 50);
  // картинка ещё грузится — не кешируем, перерисуем, когда придёт
  if (art || !BG_ART) boardCache = c;
  return c;
}

let ballCache: HTMLCanvasElement | null = null;
/** серебряный шарик: тёмный обод, блик слева сверху, отражение снизу */
function ballSprite() {
  if (ballCache) return ballCache;
  const n = 9;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  if (BALL_ART?.complete && BALL_ART.naturalWidth) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(BALL_ART, 0, 0, n, n);
    return (ballCache = c);
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - n / 2, dy = y + 0.5 - n / 2;
    const d = Math.hypot(dx, dy) / (n / 2);
    if (d > 1) continue;
    const light = -(dx + dy) / n; // свет слева сверху
    let col = d > 0.82 ? '#4a4f63' : light > 0.18 ? '#ffffff' : light > 0 ? '#dfe3ee' : light > -0.2 ? '#aab1c4' : '#7d8399';
    if (dy > 1.5 && Math.abs(dx) < 2 && d <= 0.82) col = '#c4cad8'; // отражение доски снизу
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  }
  if (!BALL_ART) ballCache = c;
  return c;
}

export function drawPachinko(ctx: CanvasRenderingContext2D, sim: PachinkoSim, scale: number) {
  const { R, PIN_R } = PACHI;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(board(), 0, 0);
  // огоньки по дуге: бегут по кругу, при джекпоте мигают все
  const jackOn = !!sim.spin?.jackpot && sim.clock - sim.spin.start > 1900;
  for (let i = 0; i < 18; i++) {
    const a = Math.PI + (i / 17) * Math.PI;
    const x = Math.round(150 + Math.cos(a) * 141) - 1, y = Math.round(160 + Math.sin(a) * 141) - 1;
    const on = jackOn ? Math.floor(sim.clock / 120) % 2 === 0 : (i + Math.floor(sim.clock / 110)) % 3 === 0;
    ctx.fillStyle = on ? (i % 2 ? '#ff4d6d' : '#ffd23f') : '#4a2a55';
    ctx.fillRect(x, y, 3, 3);
  }
  const sp = sim.spin;
  ctx.font = '28px ' + uiFont();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    let d: number | string = '7';
    if (sp) {
      const el = sim.clock - sp.start;
      const stopAt = 900 + i * 500;
      d = el < stopAt ? 1 + (Math.floor(el / 60 + i * 3) % 9) : sp.reels[i];
    }
    // барабан — светлая лента с тенью сверху и снизу
    ctx.fillStyle = '#f1ead2';
    ctx.fillRect(110 + i * 28, 162, 24, 46);
    ctx.fillStyle = '#c9bf9f';
    ctx.fillRect(110 + i * 28, 162, 24, 6);
    ctx.fillRect(110 + i * 28, 202, 24, 6);
    ctx.fillStyle = jackOn ? (Math.floor(sim.clock / 120) % 2 ? '#ffb000' : '#ff4d6d') : '#b8142e';
    ctx.fillText(String(d), 122 + i * 28, 186);
  }
  // штырьки: латунь с бликом
  for (const [x, y] of PINS) {
    ctx.fillStyle = '#7a5a1e';
    ctx.fillRect(x - PIN_R, y - PIN_R + 1, PIN_R * 2, PIN_R * 2);
    ctx.fillStyle = '#e8c56a';
    ctx.fillRect(x - PIN_R, y - PIN_R, PIN_R * 2, PIN_R * 2 - 1);
    ctx.fillStyle = '#fff6cf';
    ctx.fillRect(x - PIN_R, y - PIN_R, 1.5, 1.5);
  }
  // карманы: тюльпаны (красные лепестки) и START (золотой)
  for (const p of POCKETS) {
    const hot = sim.lastPocket && sim.lastPocket.p === p && sim.clock - sim.lastPocket.t < 400;
    const main = hot ? '#ffffff' : p.kind === 'start' ? '#ffd23f' : '#ff4d6d';
    ctx.fillStyle = p.kind === 'start' ? '#b07a10' : '#8c1f3a';
    ctx.fillRect(p.x - p.w / 2 - 3, p.y - 1, 3, 11);
    ctx.fillRect(p.x + p.w / 2, p.y - 1, 3, 11);
    ctx.fillRect(p.x - p.w / 2, p.y + 7, p.w, 3);
    ctx.fillStyle = main;
    ctx.fillRect(p.x - p.w / 2 - 3, p.y - 2, 3, 10);
    ctx.fillRect(p.x + p.w / 2, p.y - 2, 3, 10);
    ctx.fillRect(p.x - p.w / 2, p.y + 6, p.w, 3);
    if (p.kind === 'tulip') {
      // лепестки над карманом и стебелёк
      ctx.fillRect(p.x - p.w / 2 - 5, p.y - 5, 3, 4);
      ctx.fillRect(p.x + p.w / 2 + 2, p.y - 5, 3, 4);
      ctx.fillStyle = '#3cc94a';
      ctx.fillRect(p.x - 1, p.y + 9, 2, 5);
    } else {
      ctx.font = '10px ' + uiFont();
      ctx.fillStyle = '#000';
      ctx.fillText('START', p.x + 1, p.y + 19);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('START', p.x, p.y + 18);
    }
  }
  // шарики: спрайт с бликом и маленькой тенью
  const bs = ballSprite();
  for (const b of sim.balls) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(b.x - R + 1, b.y + R - 1, R * 2 - 1, 2);
    ctx.drawImage(bs, Math.round(b.x - R), Math.round(b.y - R), R * 2 + 0.6, R * 2 + 0.6);
  }
  ctx.restore();
}
