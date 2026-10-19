// Доска с рыбой для «Сашими» (телефон и ТВ): пиксельная рыба, нож, разрезы, улетающие обрезки.
import { useEffect, useRef } from 'preact/hooks';
import type { FishId } from '../shared/types';
import { SH, SW, drawSashimi, type SashimiView } from './sashimi';

/** view читается каждый кадр — можно менять ref без перерисовки компонента; split анимируется сам */
export function FishBoard({ fish, view, scale = 4, class: cls, onRef }: {
  fish: FishId; view: SashimiView | { current: SashimiView }; scale?: number; class?: string;
  onRef?: (c: HTMLCanvasElement | null) => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    let raf = 0;
    let cutAt: number | null = null, t0 = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const c = cv.current;
      if (!c) return;
      const vv = viewRef.current;
      const v: SashimiView = 'current' in vv ? vv.current : vv;
      // обрезки улетают за 600 мс после разреза
      if (v.cut != null && v.cut !== cutAt) { cutAt = v.cut; t0 = t; }
      if (v.cut == null) cutAt = null;
      const split = v.cut != null ? Math.min(1, (t - t0) / 600) : 0;
      drawSashimi(c.getContext('2d')!, c.width, c.height, fish, { ...v, split: v.split ?? split });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fish]);
  return <canvas ref={(c) => { (cv as any).current = c; onRef?.(c); }} width={SW * scale} height={SH * scale} class={'fish-board ' + (cls ?? '')} />;
}

/** электронные весы */
export function Scale({ grams, label }: { grams: number | null; label?: string }) {
  return (
    <div class="scale">
      <div class="scale-lcd">{grams == null ? '- - - -' : grams}<small> г</small></div>
      {label && <div class="scale-label">{label}</div>}
    </div>
  );
}
