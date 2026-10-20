// Призовая машина: указатель бежит по кольцу, нажми СТОП на зелёной ячейке.
// Старт и результат решает хост (по времени нажатия в часах хоста) — честно для всех.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player } from '../shared/types';
import { RING_PRIZE_INFO, ringCellAt, ringLayout, type RingLayout, type RingPrize } from '../games/logic';
import { drawRing } from '../games/ring';
import { vibrate } from '../shared/util';
import { sfx } from '../shared/sound';
import { ResText } from '../ui/common';

interface Run { layout: RingLayout; t0: number; cellMs: number; stop: null | { cell: number; res: RingPrize } }

/** paused — экран спрятан (вопрос, групповая игра): указатель идёт по часам хоста, поэтому
 *  запущенная попытка не теряется — вернувшись, игрок жмёт СТОП как обычно */
export function RingGame({ client, s, me, onExit }: { client: GameClient; s: GameState; me: Player; paused?: boolean; onExit: () => void }) {
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
      const cell = r ? (r.stop ? r.stop.cell : t < r.t0 ? 0 : ringCellAt(r.t0, t, r.cellMs).cell) : Math.floor(performance.now() / 400) % 24;
      drawRing(c.getContext('2d')!, c.width, r?.layout ?? idle, cell, r?.stop?.res ?? null, performance.now());
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

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
    // мгновенно замираем на ячейке, которую видел игрок
    r.stop = { cell: ringCellAt(r.t0, Math.max(at, r.t0), r.cellMs).cell, res: 'miss' };
    setPhase('stopping');
    vibrate(40);
    try {
      const res = await client.req<{ cell: number; res: RingPrize }>('ringStop', { at });
      r.stop = { cell: res.cell, res: res.res };
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
      <div class="muted small-text">Огонёк бежит по кольцу — жми СТОП на нужном призе. В каждом секторе свой приз: йены, звёзды, бонусы, спецвопрос и даже доп. ход.</div>
      <button class="btn small ghost" onClick={onExit}>Назад</button>
    </div>
  );
}
