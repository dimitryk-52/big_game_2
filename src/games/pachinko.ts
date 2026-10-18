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

export function drawPachinko(ctx: CanvasRenderingContext2D, sim: PachinkoSim, scale: number) {
  const { W, H, R, PIN_R } = PACHI;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;
  // фон
  ctx.fillStyle = '#2a1240';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3b1a5a';
  for (let y = 0; y < H; y += 16) ctx.fillRect(0, y, W, 8);
  // дуга-рельс
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(150, 160, 147, Math.PI, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3, 160);
  ctx.lineTo(3, H);
  ctx.moveTo(W - 3, 160);
  ctx.lineTo(W - 3, H);
  ctx.stroke();
  // окно барабанов
  ctx.fillStyle = '#111';
  ctx.fillRect(108, 160, 84, 50);
  ctx.strokeStyle = '#ff4d6d';
  ctx.lineWidth = 3;
  ctx.strokeRect(108, 160, 84, 50);
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
    const jack = sp && sp.jackpot && sim.clock - sp.start > 1900;
    ctx.fillStyle = jack ? (Math.floor(sim.clock / 120) % 2 ? '#ffd23f' : '#ff4d6d') : '#fff';
    ctx.fillText(String(d), 122 + i * 28, 186);
  }
  // штырьки
  ctx.fillStyle = '#e8c56a';
  for (const [x, y] of PINS) ctx.fillRect(x - PIN_R, y - PIN_R, PIN_R * 2, PIN_R * 2);
  // карманы
  for (const p of POCKETS) {
    const hot = sim.lastPocket && sim.lastPocket.p === p && sim.clock - sim.lastPocket.t < 400;
    ctx.fillStyle = p.kind === 'start' ? (hot ? '#fff' : '#ffd23f') : hot ? '#fff' : '#ff4d6d';
    ctx.fillRect(p.x - p.w / 2 - 3, p.y - 2, 3, 10);
    ctx.fillRect(p.x + p.w / 2, p.y - 2, 3, 10);
    ctx.fillRect(p.x - p.w / 2, p.y + 6, p.w, 3);
    if (p.kind === 'start') {
      ctx.font = '10px ' + uiFont();
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('START', p.x, p.y + 18);
    }
  }
  // шарики
  for (const b of sim.balls) {
    ctx.fillStyle = '#d9dde8';
    ctx.fillRect(b.x - R, b.y - R, R * 2, R * 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.x - R + 1, b.y - R + 1, 3, 3);
  }
  ctx.restore();
}
