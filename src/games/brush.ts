// Кисть для каллиграфии (сёдо). Модель — круглая кисть из десятков волосков:
//  - ширина зависит от скорости: медленно — кисть прижата, штрих толстый; быстро — тонкий;
//  - в начале штриха кисть «садится» (ширина растёт), если держать палец на месте — тушь расплывается;
//  - у каждого волоска свой запас туши; по ходу штриха тушь кончается неравномерно, и на быстрых
//    длинных штрихах появляются сухие белые прожилки (касурэ / хихаку);
//  - при быстром отрыве кисть уходит тонким хвостом по направлению движения (харай);
//  - по краям мокрого медленного штриха тушь чуть растекается по волокнам бумаги (нидзими).
// Рисуем на прозрачном слое туши; бумага — отдельный слой (washiCanvas), ТВ кладёт тушь на неё «умножением».

export const INK = '14,12,18';

/** цвет волоска: мокрый — чёрный, подсыхающий — серее */
function inkTone(level: number) {
  const k = Math.max(0, Math.min(1, (level - 0.15) / 0.6));
  const g = (a: number, b: number) => Math.round(a + (b - a) * k);
  return `rgb(${g(34, 14)},${g(31, 12)},${g(36, 18)})`;
}

interface Bristle {
  ox: number;
  oy: number;
  /** толщина волоска относительно радиуса кисти */
  w: number;
  cap: number;
  ink: number;
  /** склонность волоска сохнуть быстрее */
  thirst: number;
  px: number;
  py: number;
  on: boolean;
}

/** детерминированный ГПСЧ (бумага одинаковая на телефоне и ТВ) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class InkBrush {
  /** базовый радиус кисти, px холста */
  size = 22;
  /** пикселей холста в одном CSS-пикселе: скорость считаем в CSS px/мс, чтобы кисть вела себя одинаково на любом экране */
  unit = 1;
  private b: Bristle[] = [];
  private x = 0;
  private y = 0;
  private r = 0;
  private v = 0;
  private vx = 0;
  private vy = 0;
  private t = 0;
  private len = 0;
  private down = false;
  private stillSince = 0;
  private rand = Math.random;

  constructor(private ctx: CanvasRenderingContext2D) {}

  get active() {
    return this.down;
  }

  /** накопленный нажим на повороте (кисть упирается и раздаётся) */
  private press = 0;
  private dir: number | null = null;
  /** фазы «дыхания» ширины — рука никогда не ведёт идеально ровно */
  private ph1 = 0;
  private ph2 = 0;

  private makeBristles() {
    const n = 60;
    this.b = [];
    for (let i = 0; i < n; i++) {
      // равномерно по кругу (спираль Ферма), с лёгким разбросом
      const a = i * 2.39996 + this.rand() * 0.3;
      const d = Math.min(1, Math.sqrt((i + 0.5) / n) * (0.9 + this.rand() * 0.12));
      const cap = (0.7 + this.rand() * 0.3) * (1 - d * 0.35);
      this.b.push({
        ox: Math.cos(a) * d, oy: Math.sin(a) * d, w: 0.15 + this.rand() * 0.1, cap, ink: cap,
        thirst: 0.5 + this.rand() * 1.1 + d * 0.9, px: 0, py: 0, on: true,
      });
    }
  }

  /** насколько «сухой» кисть в среднем: 0 — мокрая, 1 — сухая */
  dryness() {
    if (!this.b.length) return 0;
    return 1 - this.b.reduce((a, b) => a + b.ink / b.cap, 0) / this.b.length;
  }

  begin(x: number, y: number, t: number, pressure = 0.5) {
    if (!this.b.length) this.makeBristles();
    // новая порция туши: кисть снова обмакнули, но не досыта — тушь «помнит» прошлые штрихи
    for (const b of this.b) b.ink = Math.min(b.cap, b.ink + b.cap * 0.75);
    this.down = true;
    this.x = x;
    this.y = y;
    this.t = t;
    this.v = 0;
    this.vx = this.vy = 0;
    this.len = 0;
    this.press = 0;
    this.dir = null;
    this.ph1 = this.rand() * 6.3;
    this.ph2 = this.rand() * 6.3;
    this.stillSince = t;
    this.r = this.size * (0.55 + pressure * 0.3);
    for (const b of this.b) { b.px = x + b.ox * this.r; b.py = y + b.oy * this.r; b.on = true; }
    this.blot(x, y, this.r * 0.85, 0.85);
  }

  /** целевой радиус: скорость (CSS px/мс), нажим пера, начало штриха, повороты, «дыхание» руки */
  private targetR(speed: number, pressure?: number) {
    const k = Math.max(0.24, Math.min(1.1, 1.12 - speed * 0.45));
    const p = pressure != null && pressure > 0 && pressure !== 0.5 ? 0.45 + pressure * 0.9 : 1;
    // вход кисти (起筆): первые пиксели штриха шире, потом кисть приподнимается
    const entry = 1 + 0.22 * Math.exp(-this.len / (this.size * 1.6));
    const breath = 1 + 0.06 * Math.sin(this.len * 0.035 + this.ph1) + 0.035 * Math.sin(this.len * 0.11 + this.ph2);
    return this.size * k * p * entry * breath * (1 + Math.min(0.4, this.press));
  }

  move(x: number, y: number, t: number, pressure?: number) {
    if (!this.down) return;
    const dx = x - this.x, dy = y - this.y;
    const d = Math.hypot(dx, dy);
    const dt = Math.max(1, t - this.t);
    if (d < 0.6) return;
    const inst = d / dt / this.unit;
    this.v = this.v * 0.72 + inst * 0.28;
    this.vx = this.vx * 0.6 + (dx / dt / this.unit) * 0.4;
    this.vy = this.vy * 0.6 + (dy / dt / this.unit) * 0.4;
    this.stillSince = t;
    // поворот: кисть упирается — штрих в углу раздаётся (折れ)
    const ang = Math.atan2(dy, dx);
    if (this.dir != null && d > 2) {
      let turn = Math.abs(ang - this.dir);
      if (turn > Math.PI) turn = Math.PI * 2 - turn;
      if (turn > 0.25) this.press += (turn - 0.25) * 0.5;
    }
    if (d > 2) this.dir = ang;
    this.press *= Math.pow(0.97, d);
    const r1 = this.targetR(this.v, pressure);
    this.segment(this.x, this.y, x, y, this.r, r1, d);
    this.x = x;
    this.y = y;
    this.t = t;
  }

  /** палец стоит на месте: тушь растекается, кисть «проседает» */
  hold(t: number) {
    if (!this.down) return;
    const still = t - this.stillSince;
    if (still < 60) return;
    this.v *= 0.8;
    const max = this.size * (0.9 + 0.4 * (1 - this.dryness()));
    if (this.r < max) this.r += (max - this.r) * 0.03;
    const wet = 1 - this.dryness();
    if (wet < 0.45) return;
    this.blot(this.x, this.y, this.r * (0.85 + this.rand() * 0.08), 0.22 * wet);
    for (const b of this.b) { b.px = this.x + b.ox * this.r; b.py = this.y + b.oy * this.r; }
  }

  end(t: number) {
    if (!this.down) return;
    this.down = false;
    const speed = Math.hypot(this.vx, this.vy);
    // отрыв кисти на ходу (харай): хвост по направлению движения, тем длиннее, чем быстрее
    const fresh = t - this.t < 80;
    if (fresh && speed > 0.25) {
      const len = Math.min(this.size * 4, speed * 50 * this.unit);
      const ux = this.vx / speed, uy = this.vy / speed;
      const steps = Math.max(4, Math.ceil(len / 3));
      const bend = (this.rand() - 0.5) * 0.12;
      let px = this.x, py = this.y, r = this.r;
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        // хвост слегка изгибается, как настоящий
        const nx = this.x + ux * len * k - uy * len * bend * k * k;
        const ny = this.y + uy * len * k + ux * len * bend * k * k;
        const r1 = this.r * Math.pow(1 - k, 0.9);
        if (r1 < 1) break;
        this.segment(px, py, nx, ny, r, r1, len / steps, 2.2, true);
        px = nx; py = ny; r = r1;
      }
    } else {
      // остановка (томэ): кисть приподнимается на месте, край скругляется
      const wet = 1 - this.dryness();
      if (wet > 0.4) this.blot(this.x, this.y, this.r * 0.8, 0.3 * wet);
    }
  }

  /** пятно туши: мягкий круг с чуть неровным краем */
  private blot(x: number, y: number, r: number, alpha: number) {
    if (alpha <= 0.01 || r < 0.5) return;
    const c = this.ctx;
    const n = 40;
    const w1 = this.rand() * 6.3, w2 = this.rand() * 6.3;
    c.fillStyle = `rgba(${INK},${alpha})`;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 + 0.035 * Math.sin(a * 3 + w1) + 0.025 * Math.sin(a * 7 + w2) + (this.rand() - 0.5) * 0.02);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.fill();
  }

  /** отрезок штриха: каждый волосок тянет свою линию, ширина и тушь меняются плавно */
  private segment(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, d: number, dryBoost = 1, tail = false) {
    const c = this.ctx;
    const steps = Math.max(1, Math.ceil(d / Math.max(1.2, Math.min(r0, r1) * 0.3)));
    // радиус догоняет целевой плавно (кисть не может мгновенно сжаться)
    let r = r0;
    const speed = this.v;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // путь каждого волоска за весь отрезок рисуем одной линией: на стыках полупрозрачных кусочков не будет «бисера»
    const runs = this.b.map((b) => ({ pts: b.on ? [b.px, b.py] : ([] as number[]), all: [] as number[][], lv: 0, n: 0, w: 0 }));
    for (let s = 1; s <= steps; s++) {
      const k = s / steps;
      const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
      const target = r0 + (r1 - r0) * k;
      const step = d / steps;
      r += (target - r) * (tail ? 1 : Math.min(1, step * 0.08));
      this.len += step;
      for (let bi = 0; bi < this.b.length; bi++) {
        const b = this.b[bi];
        const run = runs[bi];
        // волоски чуть гуляют — край штриха неровный, «живой»
        const j = 1 + (this.rand() - 0.5) * 0.06;
        const bx = x + b.ox * r * j, by = y + b.oy * r * j;
        // расход туши: быстрее на скорости и на внешних волосках
        b.ink = Math.max(0, b.ink - step * 0.0006 * b.thirst * (0.4 + speed * 1.8) * dryBoost);
        const level = b.ink / b.cap;
        // сухой волосок рвётся: чем меньше туши и выше скорость, тем чаще пропуски (касурэ)
        const skip = level < 0.62 ? Math.min(0.95, (0.62 - level) * 1.7 + speed * 0.1) : 0;
        // состояние волоска меняется редко — получаются длинные сухие полосы вдоль штриха, а не точки
        const flip = b.on ? skip * 0.05 * step : (1 - skip) * 0.04 * step;
        const on = skip === 0 ? true : this.rand() < flip ? !b.on : b.on;
        if (on) {
          if (!run.pts.length) run.pts.push(b.px, b.py);
          run.pts.push(bx, by);
          run.lv += level;
          run.w += b.w * r * 2 * (0.3 + 0.7 * level * level);
          run.n++;
        } else if (run.pts.length) {
          run.all.push(run.pts);
          run.pts = [];
        }
        b.on = on;
        b.px = bx;
        b.py = by;
      }
      // нидзими: на медленном мокром штрихе тушь уходит в волокна бумаги по краю
      const wet = 1 - this.dryness();
      if (speed < 0.35 && wet > 0.5 && this.rand() < 0.4) {
        const a = this.rand() * Math.PI * 2;
        const rr = r * (0.95 + this.rand() * 0.15);
        const fx = x + Math.cos(a) * rr, fy = y + Math.sin(a) * rr;
        const fl = 1.5 + this.rand() * r * 0.22;
        const fa = a + (this.rand() - 0.5) * 1.6;
        c.strokeStyle = `rgba(${INK},${0.16 * wet})`;
        c.lineWidth = 0.5 + this.rand() * 0.7;
        c.beginPath();
        c.moveTo(fx, fy);
        c.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
        c.stroke();
      }
    }
    // волоски непрозрачные (иначе на стыках проступает «бисер»): сухость — это тоньше, светлее и с разрывами.
    // Рисуем от внешних к центральным, чтобы тёмная сердцевина была сверху
    for (let bi = runs.length - 1; bi >= 0; bi--) {
      const run = runs[bi];
      if (run.pts.length > 2) run.all.push(run.pts);
      if (!run.n || !run.all.length) continue;
      const level = run.lv / run.n;
      c.strokeStyle = inkTone(level);
      c.lineWidth = Math.max(0.6, run.w / run.n);
      c.beginPath();
      for (const p of run.all) {
        c.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
      }
      c.stroke();
    }
    this.r = r;
  }
}

const washiCache = new Map<string, HTMLCanvasElement>();
/** бумага васи: тёплый фон, мягкие пятна и волокна. Одинаковая при одинаковом seed */
export function washiCanvas(w: number, h: number, seed = 7): HTMLCanvasElement {
  const key = `${w}x${h}:${seed}`;
  const hit = washiCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const R = rng(seed);
  ctx.fillStyle = '#f4eddc';
  ctx.fillRect(0, 0, w, h);
  // крупные мягкие неровности плотности
  for (let i = 0; i < 70; i++) {
    const x = R() * w, y = R() * h, r = (0.05 + R() * 0.18) * Math.max(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = R() < 0.5;
    g.addColorStop(0, dark ? 'rgba(170,140,90,0.05)' : 'rgba(255,255,248,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  // мелкое зерно
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * 10;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
  }
  ctx.putImageData(img, 0, 0);
  // волокна: тонкие изогнутые нити, светлые и тёмные
  const fibers = Math.round((w * h) / 900);
  for (let i = 0; i < fibers; i++) {
    let x = R() * w, y = R() * h;
    let a = R() * Math.PI * 2;
    const len = 6 + R() * 26;
    ctx.strokeStyle = R() < 0.55 ? `rgba(150,120,70,${0.05 + R() * 0.1})` : `rgba(255,255,250,${0.12 + R() * 0.2})`;
    ctx.lineWidth = 0.4 + R() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < len; s += 3) {
      a += (R() - 0.5) * 0.5;
      x += Math.cos(a) * 3;
      y += Math.sin(a) * 3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  washiCache.set(key, c);
  return c;
}
