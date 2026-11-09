// Чо-хан: стол бакуто в перспективе (src/img/chohan/table.png), плетёный стакан (壺) и две кости.
// Спрайты стакана и костей — pxl-арт из art/chohan/chohan.px.js, в той же перспективе, что стол.
// Рисуем в холст родного размера фона (CH_W×CH_H); на экране он растягивается без сглаживания.

export const CH_W = 320;
export const CH_H = 240;

export interface ChohanView {
  /** смещение стакана при тряске, px */
  shake: number;
  /** 0 — стакан стоит, 1 — поднят */
  lift: number;
  /** стакан в воздухе (тряска) — костей под ним не видно */
  air: boolean;
  dice: [number, number] | null;
}

const files = import.meta.glob<string>(['../img/chohan/table.png', '../img/chohan/cup_*.png', '../img/chohan/die_*.png'], { eager: true, import: 'default', query: '?url' });
const imgs = new Map<string, HTMLImageElement>();
function img(name: string): HTMLImageElement | null {
  let im = imgs.get(name);
  if (!im) {
    const url = files[`../img/chohan/${name}.png`];
    if (!url || typeof Image === 'undefined') return null;
    im = new Image();
    im.src = url;
    imgs.set(name, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
/** загрузить картинки заранее, чтобы первый кадр не мигал */
export function preloadChohan() {
  for (const n of ['table', 'cup_closed', 'cup_open', ...[1, 2, 3, 4, 5, 6].flatMap((v) => [`die_${v}`, `die_alt_${v}`])]) img(n);
}

/** точка на сукне, где стоит стакан (середина устья) */
const CX = 160, CY = 104;
export interface ChohanFrame { x: number; y: number; w: number; h: number }
/** кадр телефона: середина стола с дилером, без краёв татами — кости крупнее */
export const CH_PHONE: ChohanFrame = { x: 40, y: 22, w: 240, h: 180 };
/** кадр вокруг стакана и костей — для маленького окна на ТВ (там 1 пиксель арта = 2 пикселя экрана) */
export const CH_FOCUS: ChohanFrame = { x: 110, y: 44, w: 100, h: 75 };

/** спрайт по нижней середине */
function put(ctx: CanvasRenderingContext2D, name: string, cx: number, by: number) {
  const im = img(name);
  if (im) ctx.drawImage(im, Math.round(cx - im.width / 2), Math.round(by - im.height));
}

/** тень на сукне: полупрозрачный эллипс шахматкой, чтобы осталась пиксельной */
function shadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a: number) {
  ctx.fillStyle = `rgba(60, 30, 25, ${a})`;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.floor(rx * Math.sqrt(1 - (y / ry) ** 2));
    for (let x = -w; x <= w; x++) if ((x + y) % 2 === 0) ctx.fillRect(cx + x, cy + y, 1, 1);
  }
}

/** frame — какой кусок стола рисовать (холст должен быть его размера); без него — весь стол */
export function drawChohan(ctx: CanvasRenderingContext2D, v: ChohanView, frame?: ChohanFrame) {
  ctx.setTransform(1, 0, 0, 1, -(frame?.x ?? 0), -(frame?.y ?? 0));
  ctx.imageSmoothingEnabled = false;
  const table = img('table');
  ctx.fillStyle = '#2a1518';
  ctx.fillRect(0, 0, CH_W, CH_H);
  if (table) ctx.drawImage(table, 0, 0); // фон 320×239: последняя строка — тёмная подложка

  // подъём: сначала стакан отрывается вверх, на второй половине дилер запрокидывает его к себе
  const raise = v.air ? 0 : Math.min(1, v.lift * 2);
  const open = !v.air && v.lift >= 0.5;
  const up = v.air ? 18 : Math.round(raise * 14);
  const sx = Math.round(v.shake);

  // тень стакана: на месте, когда стоит; бледнее и меньше, когда поднят
  if (!open) shadow(ctx, CX + 2 + sx, CY + 1, 21 - Math.round(up / 3), 7 - Math.round(up / 6), up ? 0.22 : 0.32);

  if (open) put(ctx, 'cup_open', CX + 1, CY - 15);
  // кости рисуем, только когда стакан оторвался от сукна: под стоящим их не видно (и края не торчат)
  if (v.dice && !v.air && (open || up > 0)) {
    shadow(ctx, CX, CY + 3, 16, 4, 0.18);
    put(ctx, `die_alt_${v.dice[0]}`, CX - 10, CY + 8);
    put(ctx, `die_${v.dice[1]}`, CX + 11, CY + 6);
  }
  if (!open) put(ctx, 'cup_closed', CX + sx, CY + 15 - up);
}
