// Фукуварай (福笑い): пустое лицо и отдельные детали. Всё рисуется кодом на холсте 450×600,
// детали — вокруг своей точки (0, 0); x, y — где деталь стоит на «правильном» лице.
import type { FaceId } from '../shared/types';
import { washiCanvas } from './brush';

export const FACE_W = 450;
export const FACE_H = 600;

type Ctx = CanvasRenderingContext2D;

export interface FacePart {
  id: string;
  x: number;
  y: number;
  draw(c: Ctx): void;
}

export interface FaceDef {
  name: string;
  base(c: Ctx): void;
  parts: FacePart[];
}

export interface Placement {
  id: string;
  x: number;
  y: number;
}

const OUT = '#3a2418';

function ell(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, lw = 4, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}

function line(c: Ctx, pts: number[], color: string, w: number) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  if (pts.length === 6) c.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
  else if (pts.length === 8) c.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
  else for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}

/** зеркальная копия детали (правая бровь/глаз из левой) */
const mirror = (draw: (c: Ctx) => void) => (c: Ctx) => { c.save(); c.scale(-1, 1); draw(c); c.restore(); };

// ───── Окамэ: круглолицая весёлая богиня ─────
const okameBrow = (c: Ctx) => ell(c, 0, 0, 20, 10, '#1a1414', undefined, 0, -0.15);
const okameEye = (c: Ctx) => line(c, [-24, 4, 0, -14, 24, 4], '#1a1414', 7);
const okameCheek = (c: Ctx) => {
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 36);
  g.addColorStop(0, 'rgba(240,110,120,0.75)');
  g.addColorStop(1, 'rgba(240,110,120,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 36, 0, Math.PI * 2);
  c.fill();
};

const OKAME: FaceDef = {
  name: 'Окамэ',
  base(c) {
    ell(c, 225, 300, 192, 235, '#17121a');
    ell(c, 225, 345, 162, 178, '#fdf0e2', OUT, 4);
    // чёлка с пробором
    c.fillStyle = '#17121a';
    c.beginPath();
    c.moveTo(85, 280);
    c.quadraticCurveTo(110, 170, 225, 168);
    c.quadraticCurveTo(340, 170, 365, 280);
    c.quadraticCurveTo(300, 205, 228, 214);
    c.lineTo(222, 214);
    c.quadraticCurveTo(150, 205, 85, 280);
    c.fill();
    // пухлый подбородок
    line(c, [180, 500, 225, 515, 270, 500], 'rgba(160,110,90,0.5)', 3);
  },
  parts: [
    { id: 'browL', x: 172, y: 262, draw: okameBrow },
    { id: 'browR', x: 278, y: 262, draw: mirror(okameBrow) },
    { id: 'eyeL', x: 172, y: 330, draw: okameEye },
    { id: 'eyeR', x: 278, y: 330, draw: okameEye },
    { id: 'nose', x: 225, y: 380, draw: (c) => line(c, [-6, -18, 6, 6, -8, 12], OUT, 5) },
    {
      id: 'mouth', x: 225, y: 432, draw: (c) => {
        ell(c, 0, 0, 20, 11, '#d8283a', '#8e1420', 3);
        line(c, [-14, 0, 0, 3, 14, 0], '#8e1420', 2);
      },
    },
    { id: 'cheekL', x: 140, y: 410, draw: okameCheek },
    { id: 'cheekR', x: 310, y: 410, draw: okameCheek },
  ],
};

// ───── Дарума ─────
const darumaBrow = (c: Ctx) => {
  line(c, [34, 10, 10, -22, -36, -6], '#141012', 14);
  line(c, [-36, -6, -44, 0, -40, 10], '#141012', 9);
};
const darumaEye = (c: Ctx) => {
  ell(c, 0, 0, 27, 27, '#ffffff', '#141012', 5);
  ell(c, 0, 0, 11, 11, '#141012');
};

const DARUMA: FaceDef = {
  name: 'Дарума',
  base(c) {
    ell(c, 225, 340, 205, 235, '#d4262f', '#5a0d12', 5);
    // золотой узор по краю
    c.strokeStyle = '#f2c14e';
    c.lineWidth = 8;
    c.beginPath();
    c.ellipse(225, 340, 182, 212, 0, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
    c.fillStyle = '#f2c14e';
    c.font = 'bold 84px serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('福', 225, 470);
    // белое «лицо»
    ell(c, 225, 270, 125, 110, '#fff6e8', '#5a0d12', 4);
  },
  parts: [
    { id: 'browL', x: 170, y: 205, draw: darumaBrow },
    { id: 'browR', x: 280, y: 205, draw: mirror(darumaBrow) },
    { id: 'eyeL', x: 178, y: 262, draw: darumaEye },
    { id: 'eyeR', x: 272, y: 262, draw: darumaEye },
    { id: 'nose', x: 225, y: 295, draw: (c) => line(c, [-10, -12, 10, 0, -8, 10], '#141012', 6) },
    {
      id: 'beard', x: 225, y: 335, draw: (c) => {
        line(c, [0, -6, -30, -18, -55, 0, -70, -14], '#141012', 11);
        line(c, [0, -6, 30, -18, 55, 0, 70, -14], '#141012', 11);
        line(c, [-18, 14, 0, 22, 18, 14], '#141012', 6);
      },
    },
  ],
};

// ───── Óни: красный демон ─────
const oniBrow = (c: Ctx) => {
  c.fillStyle = '#141012';
  c.beginPath();
  c.moveTo(-40, -18);
  c.lineTo(34, 8);
  c.lineTo(30, 20);
  c.lineTo(-42, -2);
  c.closePath();
  c.fill();
};
const oniEye = (c: Ctx) => {
  ell(c, 0, 0, 30, 20, '#ffd23f', '#141012', 5);
  ell(c, 4, 2, 9, 12, '#141012');
};

const ONI: FaceDef = {
  name: 'Óни',
  base(c) {
    ell(c, 225, 345, 168, 192, '#c8323a', '#4a0a10', 5);
    // лохматая шапка волос: шипы по макушке, снизу — линия лба
    c.fillStyle = '#17121a';
    c.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (1.08 + (i / n) * 0.84);
      const r = i % 2 ? 1.0 : 1.16;
      const x = 225 + Math.cos(a) * 168 * r, y = 345 + Math.sin(a) * 192 * r;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.quadraticCurveTo(300, 215, 225, 240);
    c.quadraticCurveTo(150, 215, 225 + Math.cos(Math.PI * 1.08) * 168 * 1.16, 345 + Math.sin(Math.PI * 1.08) * 192 * 1.16);
    c.fill();
    // рога растут из волос
    for (const s of [-1, 1]) {
      c.fillStyle = '#f2e3b0';
      c.strokeStyle = '#5a3a18';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(225 + s * 60, 185);
      c.quadraticCurveTo(225 + s * 85, 120, 225 + s * 70, 75);
      c.quadraticCurveTo(225 + s * 125, 130, 225 + s * 110, 195);
      c.quadraticCurveTo(225 + s * 85, 205, 225 + s * 60, 185);
      c.fill();
      c.stroke();
    }
  },
  parts: [
    { id: 'browL', x: 168, y: 278, draw: oniBrow },
    { id: 'browR', x: 282, y: 278, draw: mirror(oniBrow) },
    { id: 'eyeL', x: 170, y: 322, draw: oniEye },
    { id: 'eyeR', x: 280, y: 322, draw: mirror(oniEye) },
    {
      id: 'nose', x: 225, y: 378, draw: (c) => {
        ell(c, 0, 0, 30, 20, '#a8222b', '#4a0a10', 4);
        ell(c, -12, 5, 7, 5, '#3a0608');
        ell(c, 12, 5, 7, 5, '#3a0608');
      },
    },
    {
      id: 'mouth', x: 225, y: 445, draw: (c) => {
        c.fillStyle = '#2a0608';
        c.beginPath();
        c.moveTo(-62, -10);
        c.quadraticCurveTo(0, -24, 62, -10);
        c.quadraticCurveTo(40, 34, 0, 34);
        c.quadraticCurveTo(-40, 34, -62, -10);
        c.fill();
        c.fillStyle = '#ffffff';
        for (const s of [-1, 1]) {
          c.beginPath();
          c.moveTo(s * 42, 18);
          c.lineTo(s * 30, -12);
          c.lineTo(s * 52, -10);
          c.closePath();
          c.fill();
        }
      },
    },
  ],
};

export const FACES: Record<FaceId, FaceDef> = { okame: OKAME, daruma: DARUMA, oni: ONI };

/** лицо на бумаге; parts — где лежат детали (null — «правильное» лицо, все детали на местах) */
export function renderFace(face: FaceId, parts: Placement[] | null, w = FACE_W, h = FACE_H): HTMLCanvasElement {
  const def = FACES[face] ?? OKAME;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(washiCanvas(FACE_W, FACE_H, 11), 0, 0, w, h);
  ctx.save();
  ctx.scale(w / FACE_W, h / FACE_H);
  def.base(ctx);
  const list = parts ?? def.parts.map((p) => ({ id: p.id, x: p.x, y: p.y }));
  for (const pl of list) {
    const p = def.parts.find((x) => x.id === pl.id);
    if (!p) continue;
    ctx.save();
    ctx.translate(pl.x, pl.y);
    p.draw(ctx);
    ctx.restore();
  }
  ctx.restore();
  return c;
}

const thumbCache = new Map<string, string>();
/** картинка детали для лотка на телефоне */
export function partThumb(face: FaceId, id: string): string {
  const key = face + ':' + id;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const p = FACES[face].parts.find((x) => x.id === id)!;
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 100;
  const ctx = c.getContext('2d')!;
  ctx.translate(80, 50);
  p.draw(ctx);
  const url = c.toDataURL();
  thumbCache.set(key, url);
  return url;
}
