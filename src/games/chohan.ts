// Чо-хан: пиксельная отрисовка — белое сукно на татами, плетёный стакан (壺) и две кости.
// Рисуем в маленький холст (CH_W×CH_H), на экране он растягивается без сглаживания.

export const CH_W = 120;
export const CH_H = 90;

export interface ChohanView {
  /** смещение стакана при тряске, px */
  shake: number;
  /** 0 — стакан стоит, 1 — поднят */
  lift: number;
  /** стакан в воздухе (тряска) — костей под ним не видно */
  air: boolean;
  dice: [number, number] | null;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

export function drawDie(ctx: CanvasRenderingContext2D, x: number, y: number, v: number, s = 13) {
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(x - 1, y, s + 2, s);
  ctx.fillRect(x, y - 1, s, s + 2);
  ctx.fillStyle = '#c9c2b4';
  ctx.fillRect(x, y + 1, s, s - 1);
  ctx.fillStyle = '#fbf8f0';
  ctx.fillRect(x, y, s, s - 2);
  // японская кость: единица — большая красная точка
  if (v === 1) {
    ctx.fillStyle = '#d0202a';
    const c = Math.floor(s / 2) - 2;
    ctx.fillRect(x + c, y + c - 1, 4, 4);
    ctx.fillRect(x + c - 1, y + c, 6, 2);
    ctx.fillRect(x + c + 1, y + c - 2, 2, 6);
    return;
  }
  ctx.fillStyle = '#1a1410';
  const step = (s - 6) / 2;
  for (const [px, py] of PIPS[v] ?? []) ctx.fillRect(Math.round(x + 2 + px * step), Math.round(y + 1 + py * step), 2, 2);
}

function drawCup(ctx: CanvasRenderingContext2D, cx: number, by: number) {
  // плетёный стакан: трапеция, светлый ободок, полосы плетения
  const h = 30, top = 22, bot = 30;
  for (let y = 0; y < h; y++) {
    const w = Math.round(top + ((bot - top) * y) / h);
    const x = Math.round(cx - w / 2);
    const yy = by - h + y;
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(x - 1, yy, w + 2, 1);
    ctx.fillStyle = y % 4 < 2 ? '#8a5a2b' : '#a8733a';
    ctx.fillRect(x, yy, w, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = (y >> 1) % 2; k < w; k += 4) ctx.fillRect(x + k, yy, 1, 1);
    ctx.fillStyle = 'rgba(255,230,180,0.35)';
    ctx.fillRect(x + 3, yy, 2, 1);
  }
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(Math.round(cx - top / 2) - 1, by - h - 1, top + 2, 1);
  ctx.fillRect(Math.round(cx - bot / 2) - 1, by, bot + 2, 1);
  ctx.fillStyle = '#d9a35c';
  ctx.fillRect(Math.round(cx - bot / 2), by - 3, bot, 2);
}

export function drawChohan(ctx: CanvasRenderingContext2D, v: ChohanView) {
  ctx.imageSmoothingEnabled = false;
  // татами
  ctx.fillStyle = '#b8b26a';
  ctx.fillRect(0, 0, CH_W, CH_H);
  ctx.fillStyle = '#a69f58';
  for (let y = 1; y < CH_H; y += 3) ctx.fillRect(0, y, CH_W, 1);
  ctx.fillStyle = '#2a3a2a';
  ctx.fillRect(0, 0, CH_W, 4);
  ctx.fillRect(0, CH_H - 4, CH_W, 4);
  // белое сукно
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(13, 21, 94, 56);
  ctx.fillStyle = '#d8d2c4';
  ctx.fillRect(14, 22, 92, 54);
  ctx.fillStyle = '#f2eee4';
  ctx.fillRect(14, 22, 92, 51);
  const cx = 60, base = 62;
  // тень стакана
  const shadowW = 30 - Math.round(v.lift * 8);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(cx - shadowW / 2 + 2, base, shadowW, 3);
  if (v.dice && !v.air) {
    drawDie(ctx, cx - 15, base - 15, v.dice[0]);
    drawDie(ctx, cx + 3, base - 13, v.dice[1]);
  }
  const lift = Math.round(v.lift * 30) + (v.air ? 16 : 0);
  drawCup(ctx, cx + Math.round(v.shake), base + 1 - lift);
}
