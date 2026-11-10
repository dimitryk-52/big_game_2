// Гонка на телефоне: вид сверху, машина едет сама по дороге — игрок держит ГАЗ и ловит ЗАНОС в поворотах.
// Физика (shared/race.ts) идёт фиксированным шагом от общего старта по часам хоста, поэтому время честное:
// у кого телефон быстрее — преимущества нет. На хост уходят отсечки и финиш.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player, RacePublic } from '../shared/types';
import { CARS } from '../shared/cars';
import { DT, TRACKS, cornerName, entryKmh, fmtRace, kmh, makeTrack, newCar, stepCar, trackAt, type Car, type Track } from '../shared/race';
import { uiFont, vibrate } from '../shared/util';
import { sfx } from '../shared/sound';

/** метров в одном пикселе маленького холста */
const M = 0.55;
const VW = 180, VH = 230;

export function RacePad({ client, s, me, r }: { client: GameClient; s: GameState; me: Player; r: RacePublic }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const track = useRef<Track>(makeTrack(r.seed, r.kind));
  const car = useRef<Car>(newCar());
  const keys = useRef({ gas: false, drift: false });
  const sentSplits = useRef(0);
  const [, force] = useState(0);
  const [done, setDone] = useState<number | null>(null);
  const foe = s.players[r.players.find((id) => id !== me.id) ?? ''];
  const info = TRACKS[r.kind];

  useEffect(() => {
    let raf = 0, n = 0;
    const smoke: { x: number; y: number; life: number }[] = [];
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const tr = track.current, c = car.current;
      const t = (client.hostNow() - r.startAt) / 1000;
      // догоняем часы хоста фиксированными шагами
      const want = Math.floor(t / DT);
      let guard = 0;
      const hits0 = c.hits, perf0 = c.perfect;
      while (!c.done && c.steps < want && guard++ < 240) stepCar(c, tr, keys.current.gas, keys.current.drift);
      if (c.hits > hits0) { vibrate([80, 40, 120]); sfx.wrong?.(); }
      if (c.perfect > perf0) vibrate(25);
      // отсечки (последняя — финиш)
      while (sentSplits.current < c.splits.length && sentSplits.current < tr.cps.length - 1) {
        client.pick('race', { id: r.id, ms: c.splits[sentSplits.current] });
        sentSplits.current++;
      }
      if (c.done && done == null) {
        const ms = Math.round(c.t * 1000);
        setDone(ms);
        client.pick('race', { id: r.id, ms, done: true });
        vibrate([40, 40, 40, 40, 200]);
      }
      draw(t, smoke);
      // цифры обновляем по времени, а не по кадрам: на слабом телефоне кадров мало
      const nowMs = performance.now();
      if (nowMs - n > 90) { n = nowMs; force((x) => x + 1); }
    };
    const draw = (t: number, smoke: { x: number; y: number; life: number }[]) => {
      const el = cv.current;
      if (!el) return;
      if (el.width !== VW) { el.width = VW; el.height = VH; }
      const ctx = el.getContext('2d')!;
      const tr = track.current, c = car.current;
      const p = trackAt(tr, c.s);
      const corner = tr.corners.find((q) => c.s >= q.a && c.s < q.b);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = info.ground;
      ctx.fillRect(0, 0, VW, VH);
      // мир → экран: машина внизу по центру, нос вверх
      const cx = VW / 2, cy = VH * 0.76;
      const rot = -p.h - Math.PI / 2;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const P = (d: number, off = 0) => {
        const q = trackAt(tr, d);
        const wx = q.x - Math.sin(q.h) * off - p.x, wy = q.y + Math.cos(q.h) * off - p.y;
        return [cx + (wx * cos - wy * sin) / M, cy + (wx * sin + wy * cos) / M] as const;
      };
      const d0 = Math.max(0, c.s - 40), d1 = Math.min(tr.total, c.s + 150);
      const path = (off = 0) => {
        ctx.beginPath();
        for (let d = d0; d <= d1; d += 4) { const [x, y] = P(d, off); if (d === d0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      };
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';
      // обочина, поребрик поворотов, асфальт
      path(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 15 / M; ctx.stroke();
      for (const q of tr.corners) {
        if (q.b < d0 || q.a > d1) continue;
        ctx.beginPath();
        for (let d = Math.max(d0, q.a); d <= Math.min(d1, q.b); d += 4) { const [x, y] = P(d); if (d <= Math.max(d0, q.a)) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.strokeStyle = '#e8364e'; ctx.lineWidth = 14.5 / M; ctx.setLineDash([5, 5]); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineDashOffset = 5; ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      path(); ctx.strokeStyle = info.road; ctx.lineWidth = 12 / M; ctx.stroke();
      path(); ctx.strokeStyle = info.line; ctx.lineWidth = 1; ctx.setLineDash([6, 8]); ctx.lineDashOffset = -(c.s / M) % 14; ctx.stroke();
      ctx.setLineDash([]);
      // вход и выход поворота: жёлтая черта — жми занос, зелёная — отпускай
      const bar = (d: number, col: string) => {
        if (d < d0 || d > d1) return;
        const [x1, y1] = P(d, -6), [x2, y2] = P(d, 6);
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      };
      for (const q of tr.corners) { bar(q.a, '#ffd23f'); bar(q.b, '#5ce16b'); }
      // финиш
      if (tr.total <= d1) {
        const [x1, y1] = P(tr.total, -6), [x2, y2] = P(tr.total, 6);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.setLineDash([]);
      }
      // дым из-под колёс в заносе
      const sliding = c.drift && c.v > 6;
      if (sliding && Math.random() < 0.7) smoke.push({ x: cx + (Math.random() - 0.5) * 8, y: cy + 8, life: 1 });
      for (let i = smoke.length - 1; i >= 0; i--) {
        const q = smoke[i];
        q.y += c.v * DT / M; q.life -= 0.04;
        if (q.life <= 0) { smoke.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(230,230,240,${q.life * 0.6})`;
        const z = Math.round(2 + (1 - q.life) * 4);
        ctx.fillRect(Math.round(q.x - z / 2), Math.round(q.y), z, z);
      }
      // машина: вид сверху, в заносе — боком к повороту
      const ang = sliding ? (corner?.dir ?? (c.exitOf >= 0 ? tr.corners[c.exitOf].dir : 1)) * 0.5 : 0;
      const shake = c.stun > 0 ? Math.round(Math.sin(t * 60) * 2) : 0;
      ctx.save();
      ctx.translate(cx + shake, cy);
      ctx.rotate(ang);
      const body = CARS[r.cars[me.id]]?.hex ?? '#e8364e';
      ctx.fillStyle = '#0d0b1e'; ctx.fillRect(-6, -10, 12, 20);
      ctx.fillStyle = body; ctx.fillRect(-5, -9, 10, 18);
      ctx.fillStyle = '#9fd3ff'; ctx.fillRect(-4, -5, 8, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-4, 3, 8, 3);
      ctx.fillStyle = '#fff2a8'; ctx.fillRect(-5, -9, 2, 1); ctx.fillRect(3, -9, 2, 1);
      ctx.fillStyle = '#e2343c'; ctx.fillRect(-5, 8, 2, 1); ctx.fillRect(3, 8, 2, 1);
      ctx.restore();
      if (c.stun > 0) {
        ctx.fillStyle = `rgba(255,60,60,${Math.min(0.5, c.stun)})`;
        ctx.fillRect(0, 0, VW, VH);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [r.id]);

  // финиш дошёл до хоста не сразу — повторяем
  useEffect(() => {
    if (done == null) return;
    const t = setInterval(() => { if (client.s?.race?.times[me.id] == null) client.pick('race', { id: r.id, ms: done, done: true }); }, 2000);
    return () => clearInterval(t);
  }, [done]);

  const c = car.current, tr = track.current;
  const t = (client.hostNow() - r.startAt) / 1000;
  const next = tr.corners.find((q) => q.b > c.s);
  const inCorner = next && c.s >= next.a;
  const dist = next ? Math.max(0, Math.round((next.a - c.s) / 10) * 10) : 0;
  const tooFast = next && !inCorner && next.a - c.s < 120 && kmh(c.v) > entryKmh(next, r.kind) + 2;
  const ev = c.ev && c.t - c.ev.at < 1.1 ? c.ev.k : null;
  const hold = (k: 'gas' | 'drift') => ({
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
      keys.current[k] = true;
      // палец может съехать с кнопки — держим нажатие до отпускания
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* не у всех браузеров */ }
      force((x) => x + 1);
    },
    onPointerUp: () => { keys.current[k] = false; force((x) => x + 1); },
    onPointerCancel: () => { keys.current[k] = false; force((x) => x + 1); },
    onContextMenu: (e: Event) => e.preventDefault(),
  });
  const foeSplit = foe ? r.splits[foe.id] ?? [] : [];
  const i = Math.min(c.splits.length, foeSplit.length) - 1;
  const gap = i >= 0 ? c.splits[i] - foeSplit[i] : null;

  return (
    <div class="race-pad" style={{ fontFamily: uiFont() }}>
      <div class="race-hud">
        <span class="race-time">{fmtRace(Math.max(0, Math.round((done ?? c.t * 1000))))}</span>
        <span class="race-speed"><b>{kmh(c.v)}</b> км/ч</span>
        {gap != null && foe && <span class={'race-gap ' + (gap <= 0 ? 'ahead' : 'behind')}>{gap <= 0 ? '−' : '+'}{(Math.abs(gap) / 1000).toFixed(2)}</span>}
      </div>
      {/* штурман: что впереди */}
      <div class={'race-call' + (inCorner ? ' in' : '') + (tooFast ? ' warn' : '')}>
        {done != null ? <b>ФИНИШ!</b>
          : next ? <>
              <span class="race-arrow">{next.dir < 0 ? '◀' : '▶'}</span>
              <b>{next.dir < 0 ? 'левый' : 'правый'} — {cornerName(next)}</b>
              <span>{inCorner ? 'держи занос!' : tooFast ? `сбрось газ! вход ${entryKmh(next, r.kind)}` : `через ${dist} м`}</span>
            </>
          : <b>финишная прямая — газ в пол!</b>}
      </div>
      <div class="race-view">
        <canvas ref={cv} class="race-cv" />
        {t < 0 && <div class="race-count">{t < -3.2 ? info.name : Math.ceil(-t)}</div>}
        {t >= 0 && t < 0.9 && <div class="race-count go">СТАРТ!</div>}
        {ev === 'hit' && <div class="race-ev bad">ОТБОЙНИК!</div>}
        {ev === 'perfect' && <div class="race-ev good">ИДЕАЛЬНЫЙ ВЫХОД!</div>}
        {ev === 'late' && <div class="race-ev">поздно отпустил</div>}
        {ev === 'early' && <div class="race-ev">рано отпустил</div>}
        {done != null && <div class="race-count">{fmtRace(done)}<small>{foe && r.times[foe.id] == null ? `ждём ${foe.name}…` : 'смотри на ТВ'}</small></div>}
      </div>
      <div class="race-btns">
        <button class={'race-btn drift' + (keys.current.drift ? ' on' : '')} {...hold('drift')}>ЗАНОС<small>зажми на жёлтой черте, отпусти на зелёной</small></button>
        <button class={'race-btn gas' + (keys.current.gas ? ' on' : '')} {...hold('gas')}>ГАЗ<small>держи</small></button>
      </div>
    </div>
  );
}
