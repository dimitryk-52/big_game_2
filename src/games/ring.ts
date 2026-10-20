// Отрисовка призового кольца: колесо из 24 секторов с призами, бегущая подсветка сектора.
// Рисуется в низком разрешении (пиксель-арт) и увеличивается без сглаживания; подпись в центре — поверх, чётко.
// Есть картинка src/img/ring/ring_bg.png (Nano Banana) — она идёт фоном вместо нарисованного кодом.
import { RING_CELLS, RING_PRIZE_INFO, type RingLayout, type RingPrize } from './logic';
import { pixelIcon } from '../shared/sprites';
import { uiFont } from '../shared/util';

/** размер колеса в пикселях арта */
const N = 200;
const R_OUT = 92, R_IN = 58, R_HUB = 40;

const art = import.meta.glob<string>('../img/ring/*.png', { eager: true, import: 'default', query: '?url' });
const bgUrl = Object.entries(art).find(([p]) => p.endsWith('/ring_bg.png'))?.[1];
let bgImg: HTMLImageElement | null = null;
if (bgUrl && typeof Image !== 'undefined') { bgImg = new Image(); bgImg.src = bgUrl; }

const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const shade = (c: number[], k: number) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));

/** номер сектора под пикселем (или -1 — не на кольце); сектор 0 сверху, по часовой */
function sectorAt(x: number, y: number) {
  const dx = x + 0.5 - N / 2, dy = y + 0.5 - N / 2;
  const r = Math.hypot(dx, dy);
  if (r < R_IN || r >= R_OUT) return { s: -1, r };
  let a = Math.atan2(dx, -dy) / (Math.PI * 2);
  if (a < 0) a += 1;
  return { s: Math.floor(a * RING_CELLS) % RING_CELLS, r, edge: (a * RING_CELLS) % 1 };
}

const staticCache = new Map<string, HTMLCanvasElement>();
const hiCache = new Map<number, HTMLCanvasElement>();

/** неподвижная часть: фон, сектора, иконки призов, обод */
function staticArt(layout: RingLayout) {
  const key = layout.cells.join(',') + (bgImg?.complete ? '|bg' : '');
  let c = staticCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const ray = [hex('#2b1240'), hex('#3a1858')];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const { s, r, edge } = sectorAt(x, y);
    let col: number[];
    if (s >= 0) {
      const base = hex(RING_PRIZE_INFO[layout.cells[s]].color);
      // кромка сектора — тёмная линия, внутренний и внешний край — светлее/темнее (объём)
      col = edge! < 0.06 ? [16, 12, 32] : shade(base, r > R_OUT - 4 ? 0.75 : r < R_IN + 3 ? 1.2 : s % 2 ? 0.92 : 1);
    } else if (r >= R_OUT && r < R_OUT + 5) col = r < R_OUT + 1 ? [16, 12, 32] : hex(r < R_OUT + 3 ? '#ffd23f' : '#c98a12');
    else if (r >= R_IN - 2 && r < R_IN) col = [16, 12, 32];
    else if (r < R_IN - 2 && r >= R_HUB) col = hex(r < R_HUB + 2 ? '#ffd23f' : '#ff4d6d');
    else if (r < R_HUB) col = hex(r < R_HUB - 2 ? '#1b1f3a' : '#101020');
    else {
      // фон: лучи-«солнце» от центра в два тона
      const a = Math.atan2(y - N / 2, x - N / 2);
      col = ray[Math.floor(((a / Math.PI + 1) * 16)) % 2];
    }
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (bgImg?.complete && bgImg.naturalWidth) {
    // своя картинка фона — под кольцом (кольцо рисуем заново поверх)
    const ring = document.createElement('canvas');
    ring.width = ring.height = N;
    ring.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bgImg, 0, 0, N, N);
    ctx.save();
    ctx.beginPath();
    ctx.arc(N / 2, N / 2, R_OUT + 5, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(ring, 0, 0);
    ctx.restore();
  }
  // иконки призов посередине сектора
  const mid = (R_IN + R_OUT) / 2;
  for (let s = 0; s < RING_CELLS; s++) {
    const p = layout.cells[s];
    const a = ((s + 0.5) / RING_CELLS) * Math.PI * 2;
    const x = N / 2 + Math.sin(a) * mid, y = N / 2 - Math.cos(a) * mid;
    if (p === 'miss') {
      ctx.fillStyle = '#5a5f8c';
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 2);
      continue;
    }
    const ic = pixelIcon(RING_PRIZE_INFO[p].icon, 1);
    const k = Math.min(1, 15 / Math.max(ic.width, ic.height));
    const w = Math.round(ic.width * k), h = Math.round(ic.height * k);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ic, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
    if (p === 'yen1500' || p === 'star3') {
      // крупный приз — две звёздочки-искры рядом
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(x + w / 2), Math.round(y - h / 2) - 1, 1, 1);
    }
  }
  staticCache.set(key, c);
  return c;
}

/** белая маска одного сектора (подсветка бегущего указателя) */
function hiArt(s: number) {
  let c = hiCache.get(s);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = sectorAt(x, y);
    if (v.s !== s) continue;
    const i = (y * N + x) * 4;
    const rim = v.r < R_IN + 2 || v.r >= R_OUT - 2 || v.edge! < 0.1 || v.edge! > 0.9;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = rim ? 255 : 110;
  }
  ctx.putImageData(img, 0, 0);
  hiCache.set(s, c);
  return c;
}

const work = typeof document !== 'undefined' ? document.createElement('canvas') : null;

export function drawRing(ctx: CanvasRenderingContext2D, size: number, layout: RingLayout, cell: number | null, result: RingPrize | null, t: number) {
  const w = work!;
  w.width = w.height = N;
  const g = w.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(staticArt(layout), 0, 0);
  // лампочки по ободу: бегут огоньки, после результата — мигают все разом
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const x = Math.round(N / 2 + Math.sin(a) * (R_OUT + 2.5)) - 1, y = Math.round(N / 2 - Math.cos(a) * (R_OUT + 2.5)) - 1;
    const on = result ? Math.floor(t / 160) % 2 === 0 : (i + Math.floor(t / 90)) % 4 === 0;
    g.fillStyle = on ? '#fffbe0' : '#8a5a10';
    g.fillRect(x, y, 2, 2);
  }
  if (cell != null) {
    const blink = result ? Math.floor(t / 120) % 2 : 1;
    if (blink) g.drawImage(hiArt(cell), 0, 0);
    // указатель над сектором — пиксельный треугольник снаружи кольца
    const a = ((cell + 0.5) / RING_CELLS) * Math.PI * 2;
    const px = N / 2 + Math.sin(a) * (R_OUT + 3), py = N / 2 - Math.cos(a) * (R_OUT + 3);
    g.fillStyle = '#fff';
    for (let k = 0; k < 4; k++) {
      const rx = px + Math.sin(a) * k, ry = py - Math.cos(a) * k;
      const half = k;
      for (let j = -half; j <= half; j++) g.fillRect(Math.round(rx + Math.cos(a) * j), Math.round(ry + Math.sin(a) * j), 1, 1);
    }
  }
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(w, 0, 0, size, size);
  // подпись в центре — чётким шрифтом
  const c = size / 2;
  const label = result ? (result === 'miss' ? 'мимо…' : RING_PRIZE_INFO[result].name) : 'ПРИЗ';
  ctx.font = `${Math.floor(size * (label.length > 8 ? 0.045 : 0.07))}px ${uiFont()}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(label, c + 2, c + 2);
  ctx.fillStyle = result && result !== 'miss' ? (Math.floor(t / 150) % 2 ? '#ffd23f' : '#fff') : '#ffd23f';
  ctx.fillText(label, c, c);
}
