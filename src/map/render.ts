// Рисование пиксельной «наклонённой» карты на Canvas 2D.
// Каждая клетка — верхняя грань CW×CH и, если южнее море, боковая грань глубиной D.
import { GRID, MAP_H, MAP_W, PREF, cellAt } from './mapData';
import type { PrefState } from '../shared/types';

export const CW = 8;
export const CH = 6;
export const D = 8;
export const PAD = 16;
export const CANVAS_W = MAP_W * CW + PAD * 2;
export const CANVAS_H = MAP_H * CH + D + PAD * 2;

const REGION_COLORS: Record<string, string> = {
  hokkaido: '#6fcf6a',
  tohoku: '#58c062',
  kanto: '#8fd468',
  chubu: '#5fc47e',
  kansai: '#a2d865',
  chugoku: '#73c95b',
  shikoku: '#b3dc6d',
  kyushu: '#5dbb6c',
};

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb(c: [number, number, number], k = 1, add = 0) {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k + add)));
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
}
function hash(x: number, y: number) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export function cellToWorld(x: number, y: number) {
  return { x: PAD + x * CW + CW / 2, y: PAD + y * CH + CH / 2 };
}
export function worldToCell(wx: number, wy: number) {
  return { x: Math.floor((wx - PAD) / CW), y: Math.floor((wy - PAD) / CH) };
}
export function prefAnchorWorld(code: number) {
  const a = PREF[code].anchor;
  return cellToWorld(a[0], a[1]);
}
export function prefBoundsWorld(codes: number[]) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of codes) {
    const bb = PREF[c]?.bb;
    if (!bb) continue;
    x0 = Math.min(x0, bb[0]); y0 = Math.min(y0, bb[1]); x1 = Math.max(x1, bb[2]); y1 = Math.max(y1, bb[3]);
  }
  return { x: PAD + x0 * CW, y: PAD + y0 * CH, w: (x1 - x0 + 1) * CW, h: (y1 - y0 + 1) * CH + D };
}

export interface MapLook {
  prefs: Record<number, PrefState>;
  blocked?: number[];
  dim?: boolean; // затемнить всё, кроме highlight (для выбора)
  focus?: number[];
}

export function renderMap(ctx: CanvasRenderingContext2D, look: MapLook) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const blocked = new Set(look.blocked ?? []);
  const focus = look.focus ? new Set(look.focus) : null;
  const cache = new Map<number, { top: [number, number, number]; fog: boolean }>();
  const info = (code: number) => {
    let c = cache.get(code);
    if (!c) {
      const fog = !look.prefs[code]?.rev;
      const base = hexToRgb(REGION_COLORS[PREF[code].region] ?? '#6c6');
      const j = ((code * 37) % 5) - 2;
      const top: [number, number, number] = fog ? [196, 205, 226] : [base[0] + j * 6, base[1] + j * 5, base[2] + j * 4];
      c = { top, fog };
      cache.set(code, c);
    }
    return c;
  };

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const code = GRID[y * MAP_W + x];
      if (!code) continue;
      const { top, fog } = info(code);
      const px = PAD + x * CW, py = PAD + y * CH;
      let k = 1, add = 0;
      if (blocked.has(code)) { k = 0.55; add = -10; }
      if (focus && !focus.has(code)) { k *= 0.6; }
      // боковая грань
      if (!cellAt(x, y + 1)) {
        ctx.fillStyle = rgb(top, 0.58 * k, add);
        ctx.fillRect(px, py + CH, CW, D);
        ctx.fillStyle = rgb(top, 0.45 * k, add);
        ctx.fillRect(px, py + CH + D - 2, CW, 2);
      }
      // верхняя грань
      let t = top;
      if (fog) {
        // «облачная» текстура тумана крупными пятнами
        const n = hash(x >> 2, y >> 2) * 0.6 + hash(x >> 1, y >> 1) * 0.4;
        const v = n > 0.66 ? 14 : n < 0.3 ? -10 : 0;
        t = [top[0] + v, top[1] + v, top[2] + v];
      }
      ctx.fillStyle = rgb(t, k, add);
      ctx.fillRect(px, py, CW, CH);
      // мелкая пиксельная фактура
      if (!fog && hash(x, y) > 0.86) {
        ctx.fillStyle = rgb(t, 0.88 * k, add);
        ctx.fillRect(px + 2, py + 2, 2, 2);
      }
      // освещение: светлая кромка у берега сверху
      if (!cellAt(x, y - 1)) {
        ctx.fillStyle = rgb(t, 1.12 * k, add + 10);
        ctx.fillRect(px, py, CW, 1);
      }
      // границы префектур
      const e = cellAt(x + 1, y), s = cellAt(x, y + 1);
      ctx.fillStyle = fog ? 'rgba(90,100,140,0.55)' : 'rgba(20,60,30,0.55)';
      if (e && e !== code) ctx.fillRect(px + CW - 1, py, 1, CH);
      if (s && s !== code) ctx.fillRect(px, py + CH - 1, CW, 1);
      // правая боковая подсветка обрыва
      if (!e) {
        ctx.fillStyle = rgb(t, 0.8 * k, add);
        ctx.fillRect(px + CW - 1, py, 1, CH);
      }
    }
  }
}

/** маска верхних граней одной префектуры (для подсветки), обрезанная по bbox */
export function renderPrefMask(code: number): { canvas: HTMLCanvasElement; x: number; y: number } {
  const bb = PREF[code].bb;
  const w = (bb[2] - bb[0] + 1) * CW, h = (bb[3] - bb[1] + 1) * CH + D;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  for (let y = bb[1]; y <= bb[3]; y++) for (let x = bb[0]; x <= bb[2]; x++) {
    if (cellAt(x, y) !== code) continue;
    ctx.fillRect((x - bb[0]) * CW, (y - bb[1]) * CH, CW, CH);
    if (!cellAt(x, y + 1)) ctx.fillRect((x - bb[0]) * CW, (y - bb[1]) * CH + CH, CW, D);
  }
  return { canvas: c, x: PAD + bb[0] * CW, y: PAD + bb[1] * CH };
}

/** контур префектуры (для выделения выбранной) */
export function renderPrefOutline(code: number, color: string): { canvas: HTMLCanvasElement; x: number; y: number } {
  const bb = PREF[code].bb;
  const w = (bb[2] - bb[0] + 3) * CW, h = (bb[3] - bb[1] + 3) * CH + D;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  for (let y = bb[1]; y <= bb[3]; y++) for (let x = bb[0]; x <= bb[2]; x++) {
    if (cellAt(x, y) !== code) continue;
    const px = (x - bb[0] + 1) * CW, py = (y - bb[1] + 1) * CH;
    if (cellAt(x - 1, y) !== code) ctx.fillRect(px - 1, py, 2, CH);
    if (cellAt(x + 1, y) !== code) ctx.fillRect(px + CW - 1, py, 2, CH);
    if (cellAt(x, y - 1) !== code) ctx.fillRect(px, py - 1, CW, 2);
    if (cellAt(x, y + 1) !== code) ctx.fillRect(px, py + CH - 1, CW, 2);
  }
  return { canvas: c, x: PAD + (bb[0] - 1) * CW, y: PAD + (bb[1] - 1) * CH };
}

/** тайл моря с пиксельными волнами */
export function renderSeaTile(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1d2b5a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#24366e';
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(hash(i, 3) * 60), y = Math.floor(hash(i, 7) * 60);
    ctx.fillRect(x, y, 4, 1);
    ctx.fillRect(x + 4, y - 1, 3, 1);
  }
  return c;
}
