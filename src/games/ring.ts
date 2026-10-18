// Отрисовка призового кольца: 24 ячейки по кругу, бегущий указатель.
import { RING_CELLS, type RingLayout } from './logic';
import { uiFont } from '../shared/util';

export function drawRing(ctx: CanvasRenderingContext2D, size: number, layout: RingLayout, cell: number | null, result: null | 'gold' | 'green' | 'miss', t: number) {
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  const c = size / 2;
  const R = size * 0.4;
  const cs = Math.floor(size * 0.085);
  // корпус
  ctx.fillStyle = '#2b1240';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ff4d6d';
  ctx.fillRect(c - R * 0.55, c - R * 0.55, R * 1.1, R * 1.1);
  ctx.fillStyle = '#1b1f3a';
  ctx.fillRect(c - R * 0.5, c - R * 0.5, R, R);
  ctx.fillStyle = '#ffd23f';
  ctx.font = `${Math.floor(size * 0.07)}px ${uiFont()}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = result === 'gold' ? 'ПРИЗ!!' : result === 'green' ? 'ВЫИГРЫШ' : result === 'miss' ? 'мимо…' : 'PRIZE';
  ctx.fillText(label, c, c);
  for (let i = 0; i < RING_CELLS; i++) {
    const a = (i / RING_CELLS) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(c + Math.cos(a) * R - cs / 2);
    const y = Math.round(c + Math.sin(a) * R - cs / 2);
    let col = '#3c4380';
    if (layout.green.includes(i)) col = '#2fd14a';
    if (layout.gold === i) col = Math.floor(t / 150) % 2 ? '#ffd23f' : '#ffb000';
    const active = cell === i;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 2, y - 2, cs + 4, cs + 4);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, cs, cs);
    if (active) {
      const blink = result ? Math.floor(t / 120) % 2 : 1;
      if (blink) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(x - 3, y - 3, cs + 6, 3);
        ctx.fillRect(x - 3, y + cs, cs + 6, 3);
        ctx.fillRect(x - 3, y, 3, cs);
        ctx.fillRect(x + cs, y, 3, cs);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(x, y, cs, cs);
      }
    }
  }
}
