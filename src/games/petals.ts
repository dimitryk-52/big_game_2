// Летящие лепестки сакуры: холст в разрешении пиксель-арта, растягивается без сглаживания.
// Лепесток кружится (переворот по одной оси) и качается на ветру; speed — замедление времени
// (в момент удара в иайдо время почти останавливается).
import petalUrl from '../img/iaido/petal.png';

interface Petal { x: number; y: number; vx: number; vy: number; a: number; va: number; f: number; vf: number; s: number }

let sprite: HTMLImageElement | null = null;
const petalImg = () => {
  if (!sprite) { sprite = new Image(); sprite.src = petalUrl; }
  return sprite;
};

export class Petals {
  private ps: Petal[] = [];
  private t = 0;
  speed = 1;
  constructor(private w: number, private h: number, n: number) {
    petalImg();
    for (let i = 0; i < n; i++) this.ps.push(this.spawn(true));
  }

  private spawn(anywhere: boolean): Petal {
    const { w, h } = this;
    return {
      x: anywhere ? Math.random() * w : w + 10 + Math.random() * w * 0.3,
      y: anywhere ? Math.random() * h : -10 + Math.random() * h * 0.6,
      vx: -(12 + Math.random() * 22),
      vy: 8 + Math.random() * 14,
      a: Math.random() * Math.PI * 2,
      va: (Math.random() - 0.5) * 3,
      f: Math.random() * Math.PI * 2,
      vf: 2 + Math.random() * 4,
      s: 0.7 + Math.random() * 0.6,
    };
  }

  /** dt — секунды реального времени */
  step(dt: number) {
    dt = Math.min(dt, 0.1) * this.speed;
    this.t += dt;
    // порывы ветра
    const gust = 1 + 0.8 * Math.max(0, Math.sin(this.t * 0.5)) ** 3;
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      p.x += p.vx * gust * dt;
      p.y += (p.vy + Math.sin(this.t * 1.3 + p.f) * 6) * dt;
      p.a += p.va * dt;
      p.f += p.vf * dt;
      if (p.x < -12 || p.y > this.h + 12) this.ps[i] = this.spawn(false);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const img = petalImg();
    ctx.clearRect(0, 0, this.w, this.h);
    if (!img.complete || !img.naturalWidth) return;
    ctx.imageSmoothingEnabled = false;
    for (const p of this.ps) {
      const sx = p.s * Math.cos(p.f);
      ctx.setTransform(Math.cos(p.a) * sx, Math.sin(p.a) * sx, -Math.sin(p.a) * p.s, Math.cos(p.a) * p.s, Math.round(p.x), Math.round(p.y));
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/** запускает лепестки на холсте; getSpeed вызывается каждый кадр. Возвращает остановку */
export function runPetals(c: HTMLCanvasElement, n: number, getSpeed: () => number = () => 1) {
  const ps = new Petals(c.width, c.height, n);
  const ctx = c.getContext('2d')!;
  let last = performance.now();
  let raf = 0;
  const loop = (t: number) => {
    ps.speed = getSpeed();
    ps.step((t - last) / 1000);
    last = t;
    ps.draw(ctx);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
