// Гонка на ТВ: схема трассы, две машины-«призрака» едут по отсечкам с телефонов.
// Между отсечками машина катится со своей последней средней скоростью и ждёт у следующей точки,
// пока телефон не пришлёт время, — картинка отстаёт от телефона не больше чем на один отрезок.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GameState, RacePublic } from '../shared/types';
import { Avatar } from '../ui/common';
import { CARS, carName } from '../shared/cars';
import { carUrl } from '../ui/carArt';
import { TRACKS, cornerName, fmtRace, makeTrack, trackAt, type Track } from '../shared/race';
import { pixelIcon } from '../shared/sprites';
import { now } from '../shared/util';
import { useFrame } from '../ui/common';

/** где «призрак» на трассе (м) в момент t мс от старта */
function ghostAt(tr: Track, splits: number[], finish: number | null, t: number): number {
  if (t <= 0) return 0;
  const pts: [number, number][] = [[0, 0], ...splits.map((ms, i) => [tr.cps[i], ms] as [number, number])];
  if (finish != null) pts.push([tr.total, finish]);
  // между известными точками — ровно
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][1]) {
    const [d0, t0] = pts[i - 1], [d1, t1] = pts[i];
    return d0 + ((d1 - d0) * (t - t0)) / Math.max(1, t1 - t0);
  }
  if (finish != null) return tr.total;
  const [d0, t0] = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const v = prev ? (d0 - prev[0]) / Math.max(1, t0 - prev[1]) : 0.03; // м/мс
  const nextCp = tr.cps[splits.length] ?? tr.total;
  return Math.min(d0 + v * (t - t0), nextCp - 6);
}

export function RaceTv({ s, r }: { s: GameState; r: RacePublic }) {
  useFrame(true);
  const cv = useRef<HTMLCanvasElement>(null);
  const tr = useMemo(() => makeTrack(r.seed, r.kind), [r.seed, r.kind]);
  const info = TRACKS[r.kind];
  const [size, setSize] = useState({ w: 0, h: 0 });
  const t = now() - r.startAt;

  useEffect(() => {
    const el = cv.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = cv.current;
    if (!el || !size.w || !size.h) return;
    // рисуем в мелкой сетке и растягиваем без сглаживания — пиксель-арт на любом экране
    const K = Math.max(2, Math.round(size.w / 420));
    const W = Math.floor(size.w / K), H = Math.floor(size.h / K);
    if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }
    const ctx = el.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, info.sky[0]); g.addColorStop(1, info.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // трасса вписана в холст
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of tr.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const pad = 22;
    const k = Math.min((W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0));
    const ox = (W - (x1 - x0) * k) / 2 - x0 * k, oy = (H - (y1 - y0) * k) / 2 - y0 * k;
    const X = (p: { x: number; y: number }) => [Math.round(p.x * k + ox), Math.round(p.y * k + oy)] as const;
    const stroke = (col: string, w: number, a = 0, b = tr.total, dash?: number[]) => {
      ctx.beginPath();
      for (let d = a; d <= b; d += 4) { const [x, y] = X(trackAt(tr, d)); if (d === a) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.setLineDash(dash ?? []);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    stroke('rgba(0,0,0,0.45)', 11);
    stroke(info.ground, 9);
    for (const q of tr.corners) stroke('#e8364e', 7, q.a, q.b);
    stroke(info.road, 5);
    stroke(info.line, 1, 0, tr.total, [3, 4]);
    // отсечки и финиш
    tr.cps.forEach((d, i) => {
      const [x, y] = X(trackAt(tr, d));
      const last = i === tr.cps.length - 1;
      ctx.fillStyle = '#0d0b1e'; ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = last ? '#ffffff' : '#ffd23f'; ctx.fillRect(x - 2, y - 2, 4, 4);
      if (last) { ctx.fillStyle = '#0d0b1e'; ctx.fillRect(x - 2, y - 2, 2, 2); ctx.fillRect(x, y, 2, 2); }
    });
    const [sx, sy] = X(trackAt(tr, 0));
    ctx.fillStyle = '#5ce16b'; ctx.fillRect(sx - 2, sy - 2, 4, 4);
    // машины: спрайт сбоку, смотрит по ходу; впереди идущий рисуется поверх
    const cars = r.players.map((id) => ({ id, d: ghostAt(tr, r.splits[id] ?? [], r.times[id], t) })).sort((a, b) => a.d - b.d);
    for (const c of cars) {
      const p = trackAt(tr, c.d);
      const [x, y] = X(p);
      const img = pixelIcon('car_' + r.cars[c.id], 1);
      const col = s.players[c.id]?.color ?? '#fff';
      ctx.fillStyle = '#0d0b1e'; ctx.fillRect(x - 4, y - 4, 8, 8);
      ctx.fillStyle = col; ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.save();
      ctx.translate(x, y - 14);
      if (Math.cos(p.h) < 0) ctx.scale(-1, 1);
      ctx.drawImage(img, -Math.round(img.width / 2), -Math.round(img.height / 2));
      ctx.restore();
    }
  });

  const leadGap = () => {
    const [a, b] = r.players;
    const sa = r.splits[a] ?? [], sb = r.splits[b] ?? [];
    const i = Math.min(sa.length, sb.length) - 1;
    return i >= 0 ? { [a]: sa[i] - sb[i], [b]: sb[i] - sa[i] } : null;
  };
  const gap = leadGap();
  const both = r.players.every((id) => r.times[id] != null);
  const best = both ? Math.min(...r.players.map((id) => r.times[id]!)) : null;
  const tie = both && r.times[r.players[0]] === r.times[r.players[1]];

  return (
    <div class="race-tv">
      <div class="race-tv-head">
        <span class="race-tv-ja">{info.ja}</span>
        <b>{info.name}</b>
        <span class="muted">{tr.corners.length} поворотов · {(tr.total / 1000).toFixed(1)} км</span>
        <span class="race-tv-clock">{fmtRace(Math.max(0, both ? Math.max(...r.players.map((id) => r.times[id]!)) : t))}</span>
      </div>
      <div class="race-tv-body">
        {r.players.map((id, n) => {
          const p = s.players[id];
          if (!p) return null;
          const fin = r.times[id];
          const sp = r.splits[id] ?? [];
          return (
            <div class={'race-card ' + (n ? 'right' : 'left') + (fin != null && fin === best && !tie ? ' win' : '')} style={{ '--frame': p.color } as any}>
              <Avatar p={p} size={96} idle flip={n === 1} />
              <div class="race-card-name">{p.name}</div>
              <img class="race-card-car" src={carUrl(r.cars[id], 6)} alt="" style={n ? { transform: 'scaleX(-1)' } : undefined} />
              <div class="muted">{carName(r.cars[id])} · {CARS[r.cars[id]].color}</div>
              <div class="race-card-time">{fin != null ? fmtRace(fin) : sp.length ? `отсечка ${sp.length}/${tr.cps.length}` : t < 0 ? 'на старте' : 'едет…'}</div>
              {fin == null && gap && <div class={'race-card-gap ' + (gap[id] <= 0 ? 'ahead' : 'behind')}>{gap[id] <= 0 ? '−' : '+'}{(Math.abs(gap[id]) / 1000).toFixed(2)}</div>}
              {fin != null && <div class="race-card-gap ahead">{tie ? 'ничья!' : fin === best ? 'ФИНИШ ПЕРВЫМ' : both ? `+${((fin - best!) / 1000).toFixed(2)}` : 'финиш'}</div>}
            </div>
          );
        }).reduce<any[]>((acc, el, i) => (i === 1 ? [...acc, <div class="race-map" key="map"><canvas ref={cv} class="race-map-cv" />
          {t < 0 && <div class="race-lights">{[3, 2, 1].map((k) => <i class={-t / 1000 <= k ? 'on' : ''} />)}</div>}
          {t >= 0 && t < 1200 && <div class="race-go">СТАРТ!</div>}
          {t < -3200 && <div class="race-how">Трасса: {tr.corners.map((q) => (q.dir < 0 ? '◀ ' : '▶ ') + cornerName(q)).join(' · ')}</div>}
        </div>, el] : [...acc, el]), [])}
      </div>
    </div>
  );
}
