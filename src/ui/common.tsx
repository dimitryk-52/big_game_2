import { useEffect, useState } from 'preact/hooks';
import type { Player } from '../shared/types';
import { characterUrl } from '../shared/sprites';

/** перерисовка каждый кадр (для таймеров) */
export function useFrame(active = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = () => { set((x) => (x + 1) % 1e6); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

export function TimerBar({ start, end, now, big }: { start: number; end: number; now: () => number; big?: boolean }) {
  useFrame(true);
  const t = now();
  const total = Math.max(1, end - start);
  const left = Math.max(0, Math.min(total, end - t));
  const frac = left / total;
  const secs = Math.ceil(left / 1000);
  const waiting = t < start;
  return (
    <div class={'timer' + (big ? ' big' : '') + (frac < 0.3 ? ' low' : '')}>
      <div class="timer-fill" style={{ width: `${(waiting ? 1 : frac) * 100}%` }} />
      <span class="timer-num">{waiting ? '…' : secs}</span>
    </div>
  );
}

export function Avatar({ p, size = 48, dim }: { p: Pick<Player, 'color' | 'hat'>; size?: number; dim?: boolean }) {
  return (
    <img
      class="avatar"
      src={characterUrl(p.color, p.hat, 4)}
      style={{ width: size * 0.75, height: size, opacity: dim ? 0.4 : 1 }}
      alt=""
      draggable={false}
    />
  );
}

export function HpBar({ hp, max }: { hp: number; max: number }) {
  const f = Math.max(0, Math.min(1, hp / Math.max(1, max)));
  return (
    <div class={'hpbar' + (f <= 0.3 ? ' low' : '')}>
      <div class="hp-fill" style={{ width: `${f * 100}%` }} />
      <span>{hp}/{max}</span>
    </div>
  );
}

export const LETTERS = ['A', 'B', 'C', 'D'];
