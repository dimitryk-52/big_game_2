// Призовая машина: указатель бежит по кольцу, нажми СТОП на зелёной ячейке.
// Старт и результат решает хост (по времени нажатия в часах хоста) — честно для всех.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player } from '../shared/types';
import { RING_PRIZE_INFO, ringCellAt, ringLayout, ringSlowCell, type RingLayout, type RingPrize } from '../games/logic';
import { drawRing } from '../games/ring';
import { vibrate } from '../shared/util';
import { sfx } from '../shared/sound';
import { ResText } from '../ui/common';

interface Run { layout: RingLayout; t0: number; cellMs: number; stop: null | { from: number; at: number; cell: number | null; res: RingPrize | null } }

/** paused — экран спрятан (вопрос, групповая игра): указатель идёт по часам хоста, поэтому
 *  запущенная попытка не теряется — вернувшись, игрок жмёт СТОП как обычно */
export function RingGame({ client, s, me, paused, onExit }: { client: GameClient; s: GameState; me: Player; paused?: boolean; onExit: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const run = useRef<Run | null>(null);
  const [phase, setPhase] = useState<'idle' | 'running' | 'stopping' | 'done'>('idle');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const st = s.settings.ring;

  useEffect(() => {
    let raf = 0;
    const idle = ringLayout(7);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = cv.current;
      if (!c) return;
      const r = run.current;
      const t = client.hostNow();
      // после СТОП огонёк тормозит ещё 3–5 клеток
      const slow = r?.stop ? ringSlowCell(r.stop.from, r.stop.cell, performance.now() - r.stop.at) : null;
      const cell = r ? (slow ? slow.cell : t < r.t0 ? 0 : ringCellAt(r.t0, t, r.cellMs).cell) : Math.floor(performance.now() / 400) % 24;
      drawRing(c.getContext('2d')!, c.width, r?.layout ?? idle, cell, slow?.done ? r!.stop!.res : null, performance.now());
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  // ТВ показывает окно кольца, пока игрок у машины (на паузе — нет)
  useEffect(() => {
    if (paused) return;
    void client.req('busy', { busy: 'ring' }).catch(() => {});
    return () => { void client.req('busy', { busy: null }).catch(() => {}); };
  }, [paused]);

  const start = async () => {
    setErr('');
    setMsg('');
    try {
      const r = await client.req<{ seed: number; t0: number; cellMs: number }>('ringStart');
      run.current = { layout: ringLayout(r.seed), t0: r.t0, cellMs: r.cellMs, stop: null };
      setPhase('running');
      sfx.click();
    } catch (e: any) { setErr(e.message); }
  };
  const stop = async () => {
    const r = run.current;
    if (!r || phase !== 'running') return;
    const at = client.hostNow();
    // огонёк не замирает, а тормозит с той клетки, которую видел игрок
    const stop: NonNullable<Run['stop']> = { from: ringCellAt(r.t0, Math.max(at, r.t0), r.cellMs).cell, at: performance.now(), cell: null, res: null };
    r.stop = stop;
    setPhase('stopping');
    vibrate(40);
    try {
      const res = await client.req<{ cell: number; from: number; res: RingPrize }>('ringStop', { at });
      stop.from = res.from ?? stop.from;
      stop.cell = res.cell;
      stop.res = res.res;
      // ждём, пока огонёк докатится
      const left = ringSlowCell(stop.from, stop.cell, performance.now() - stop.at).doneIn;
      await new Promise((ok) => setTimeout(ok, Math.max(0, left)));
      const big = ['yen1500', 'star3', 'special', 'turn2'].includes(res.res);
      if (res.res === 'miss') { sfx.wrong(); setMsg('Мимо! Попробуй ещё'); }
      else {
        if (big) { sfx.fanfare(); vibrate([100, 50, 100, 50, 300]); } else sfx.jackpot();
        setMsg(`{ico:${RING_PRIZE_INFO[res.res].icon}} Выигрыш: ${RING_PRIZE_INFO[res.res].name}`);
      }
    } catch (e: any) { setErr(e.message); }
    setPhase('done');
  };

  return (
    <div class="ringgame pad col">
      <div class="center"><b>Призовое кольцо</b> · попытка ¥{st.cost}</div>
      <canvas ref={cv} width={600} height={600} class="ring-cv" />
      {msg && <div class="status-card pop center"><ResText text={msg} /></div>}
      {err && <div class="warn">{err}</div>}
      {phase === 'running' || phase === 'stopping' ? (
        <button class="btn primary big-btn stop-btn" disabled={phase !== 'running'} onPointerDown={(e) => { e.preventDefault(); void stop(); }}>СТОП</button>
      ) : (
        <button class="btn yellow big-btn" disabled={me.yen < st.cost} onClick={start}>Играть (¥{st.cost})</button>
      )}
      <div class="muted small-text">Огонёк бежит по кольцу — жми СТОП, и он, замедляясь, проедет ещё 3–5 секторов. В каждом секторе свой приз: йены, звёзды, бонусы, спецвопрос и даже доп. ход.</div>
      <button class="btn small ghost" onClick={onExit}>Назад</button>
    </div>
  );
}
