// «Картинка в картинке» на ТВ: что происходит у игроков в соло-играх (пачинко, призовая машина, чо-хан, судоку).
// Телефон присылает только разовые события (запуски шариков, старт/стоп кольца),
// а ТВ сам воспроизводит анимацию детерминированно.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameState } from '../shared/types';
import { PachinkoSim, drawPachinko } from './pachinko';
import { PACHI, ringCellAt, ringLayout, type RingLayout } from './logic';
import { drawRing } from './ring';
import { CH_H, CH_W, drawChohan } from './chohan';
import { SOLO_GAMES } from '../shared/settings';
import { now } from '../shared/util';
import { sfx } from '../shared/sound';

type Listener = (ev: any) => void;
class Bus {
  private subs = new Map<string, Set<Listener>>();
  private last = new Map<string, number>();
  private all = new Set<() => void>();
  emit(pid: string, ev: any) {
    this.last.set(pid, Date.now());
    if (KIND[ev?.k]) lastKind.set(pid, KIND[ev.k]);
    this.subs.get(pid)?.forEach((l) => l(ev));
    this.all.forEach((c) => c());
  }
  on(pid: string, l: Listener) {
    if (!this.subs.has(pid)) this.subs.set(pid, new Set());
    this.subs.get(pid)!.add(l);
    return () => { this.subs.get(pid)!.delete(l); };
  }
  onAny(c: () => void) {
    this.all.add(c);
    return () => { this.all.delete(c); };
  }
  recent(pid: string, ms: number) {
    return Date.now() - (this.last.get(pid) ?? 0) < ms;
  }
}
export const pnpBus = new Bus();

export function PnPLayer({ s }: { s: GameState }) {
  const [, force] = useState(0);
  useEffect(() => {
    const off = pnpBus.onAny(() => force((x) => x + 1));
    const t = setInterval(() => force((x) => x + 1), 3000);
    return () => { off(); clearInterval(t); };
  }, []);
  const active = Object.values(s.players).filter((p) => p.busy || pnpBus.recent(p.id, 8000));
  if (!active.length) return null;
  return (
    <div class="pnp-layer">
      {active.map((p) => {
        const kind = p.busy ?? lastKind.get(p.id) ?? 'pachinko';
        return (
          <div class="pnp" key={p.id} style={{ borderColor: p.color }}>
            <div class="pnp-head">{p.name} {SOLO_GAMES[kind as keyof typeof SOLO_GAMES]?.icon}</div>
            {kind === 'ring' ? <RingPnP pid={p.id} /> : kind === 'chohan' ? <ChohanPnP pid={p.id} /> : kind === 'sudoku' ? <SudokuPnP pid={p.id} /> : <PachiPnP pid={p.id} />}
          </div>
        );
      })}
    </div>
  );
}

const lastKind = new Map<string, string>();
/** событие → игра; вид запоминаем сразу, даже если окно на ТВ ещё не открыто */
const KIND: Record<string, string> = { pachi: 'pachinko', ring: 'ring', ringStop: 'ring', chohan: 'chohan', sudoku: 'sudoku', sudokuWin: 'sudoku' };

/** чо-хан: стакан поднимается, кости и результат */
function ChohanPnP({ pid }: { pid: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [res, setRes] = useState<{ d1: number; d2: number; win: boolean; bet: number } | null>(null);
  useEffect(() => {
    let t0 = 0, dice: [number, number] | null = null;
    const off = pnpBus.on(pid, (ev) => {
      if (ev.k !== 'chohan') return;
      dice = [ev.d1, ev.d2];
      t0 = performance.now();
      setRes(null);
      setTimeout(() => { setRes(ev); if (ev.win) sfx.coin(); }, 1300);
    });
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const c = cv.current;
      if (!c) return;
      const k = dice ? Math.max(0, Math.min(1, (t - t0 - 700) / 600)) : 0;
      drawChohan(c.getContext('2d')!, { shake: 0, lift: k, air: false, dice });
    };
    raf = requestAnimationFrame(loop);
    return () => { off(); cancelAnimationFrame(raf); };
  }, [pid]);
  const sum = res ? res.d1 + res.d2 : 0;
  return (
    <>
      <canvas ref={cv} width={CH_W} height={CH_H} class="pnp-cv" style={{ width: 200, height: 150 }} />
      <div class="pnp-foot">{res ? `${sum % 2 ? '半' : '丁'} ${sum} · ${res.win ? '+' : '−'}¥${res.bet}` : 'ставка…'}</div>
    </>
  );
}

/** судоку: сколько клеток заполнено */
function SudokuPnP({ pid }: { pid: string }) {
  const [st, setSt] = useState<{ size: number; filled: number; total: number; win?: boolean } | null>(null);
  useEffect(() => pnpBus.on(pid, (ev) => {
    if (ev.k === 'sudoku') setSt({ size: ev.size, filled: ev.filled, total: ev.total });
    if (ev.k === 'sudokuWin') { setSt((x) => ({ size: ev.size, filled: x?.total ?? 1, total: x?.total ?? 1, win: true })); sfx.coin(); }
  }), [pid]);
  const n = st?.size ?? 4;
  const k = st ? st.filled / st.total : 0;
  return (
    <>
      <div class="pnp-sudoku" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {Array.from({ length: n * n }, (_, i) => <span class={i < Math.round(k * n * n) ? 'on' : ''} />)}
      </div>
      <div class="pnp-foot">{st ? (st.win ? `✔ ${n}×${n} решено!` : `${n}×${n} · ${st.filled}/${st.total}`) : 'думает…'}</div>
    </>
  );
}

function PachiPnP({ pid }: { pid: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [balls, setBalls] = useState<number | null>(null);
  useEffect(() => {
    const sim = new PachinkoSim();
    sim.onSpinEnd = (sp) => { if (sp.jackpot) sfx.jackpot(); };
    const off = pnpBus.on(pid, (ev) => {
      if (ev.k !== 'pachi') return;
      if (typeof ev.b === 'number') setBalls(ev.b);
      // запуски из пачки воспроизводим с теми же интервалами
      const t0 = ev.l?.[0]?.t ?? 0;
      for (const l of ev.l ?? []) setTimeout(() => sim.launch(l.s, l.p), Math.max(0, l.t - t0));
    });
    let raf = 0, last = performance.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      sim.advance(t - last);
      last = t;
      const c = cv.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      drawPachinko(ctx, sim, c.width / PACHI.W);
    };
    raf = requestAnimationFrame(loop);
    return () => { off(); cancelAnimationFrame(raf); };
  }, [pid]);
  return (
    <>
      <canvas ref={cv} width={150} height={240} class="pnp-cv" />
      <div class="pnp-foot">{balls != null ? `шариков: ${balls}` : 'играет…'}</div>
    </>
  );
}

function RingPnP({ pid }: { pid: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const st = useRef<{ layout: RingLayout; t0: number; cellMs: number; stop: null | { cell: number; res: any } } | null>(null);
  useEffect(() => {
    const off = pnpBus.on(pid, (ev) => {
      if (ev.k === 'ring') {
        st.current = { layout: ringLayout(ev.seed, ev.physical), t0: ev.t0, cellMs: ev.cellMs, stop: null };
      }
      if (ev.k === 'ringStop' && st.current) {
        st.current.stop = { cell: ev.cell, res: ev.res };
        if (ev.res !== 'miss') sfx.coin();
      }
    });
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = cv.current, r = st.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      if (!r) { ctx.fillStyle = '#2b1240'; ctx.fillRect(0, 0, c.width, c.height); return; }
      const cell = r.stop ? r.stop.cell : now() < r.t0 ? null : ringCellAt(r.t0, now(), r.cellMs).cell;
      drawRing(ctx, c.width, r.layout, cell, r.stop?.res ?? null, performance.now());
    };
    raf = requestAnimationFrame(loop);
    return () => { off(); cancelAnimationFrame(raf); };
  }, [pid]);
  return <canvas ref={cv} width={180} height={180} class="pnp-cv" />;
}
