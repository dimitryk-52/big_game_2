// Пачинко на телефоне. Вся физика — локально; на хост уходят только покупка
// шариков, обмен и пачки запусков (раз в секунду) для PnP на ТВ.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player } from '../shared/types';
import { PachinkoSim, drawPachinko } from '../games/pachinko';
import { PACHI } from '../games/logic';
import { randInt, vibrate } from '../shared/util';
import { sfx } from '../shared/sound';

export function Pachinko({ client, s, me, paused, onExit }: { client: GameClient; s: GameState; me: Player; paused: boolean; onExit: () => void }) {
  const key = `bg_balls_${client.room}_${me.id}`;
  const cv = useRef<HTMLCanvasElement>(null);
  const sim = useRef(new PachinkoSim());
  const [balls, setBallsState] = useState(() => Number(localStorage.getItem(key) ?? 0));
  const ballsRef = useRef(balls);
  const [power, setPower] = useState(0.88);
  const powerRef = useRef(power);
  powerRef.current = power;
  const firing = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [win, setWin] = useState<string | null>(null);
  const batch = useRef<{ s: number; p: number; t: number }[]>([]);
  const here = me.pref != null && s.settings.pachinkoPrefs.includes(me.pref);
  const st = s.settings.pachinko;

  const setBalls = (fn: (b: number) => number) => {
    ballsRef.current = Math.max(0, fn(ballsRef.current));
    localStorage.setItem(key, String(ballsRef.current));
    setBallsState(ballsRef.current);
  };

  useEffect(() => {
    const sm = sim.current;
    sm.onPocket = (p) => {
      const add = p.kind === 'start' ? PACHI.startBalls : PACHI.tulipBalls;
      setBalls((b) => b + add);
      sfx.coin();
      vibrate(20);
    };
    sm.onSpinEnd = (sp) => {
      if (sp.jackpot) {
        setBalls((b) => b + PACHI.jackpotBalls);
        sfx.jackpot();
        vibrate([100, 50, 100, 50, 200]);
        setWin(`ДЖЕКПОТ! +${PACHI.jackpotBalls} шариков`);
        setTimeout(() => setWin(null), 3000);
      }
    };
    let raf = 0, last = performance.now(), lastShot = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = t - last;
      last = t;
      if (pausedRef.current) return; // вопрос — всё замирает
      if (firing.current && ballsRef.current > 0 && t - lastShot > 260) {
        lastShot = t;
        const seed = randInt(2 ** 31);
        const p = Math.max(0, Math.min(1, powerRef.current + (Math.random() - 0.5) * 0.02));
        sm.launch(seed, p);
        batch.current.push({ s: seed, p, t: Math.round(t) });
        setBalls((b) => b - 1);
        sfx.pachi();
      }
      sm.advance(dt);
      const c = cv.current;
      if (c && c.offsetParent !== null) {
        const ctx = c.getContext('2d')!;
        drawPachinko(ctx, sm, c.width / PACHI.W);
      }
    };
    raf = requestAnimationFrame(loop);
    // пачка событий для PnP раз в секунду (только если были запуски)
    const iv = setInterval(() => {
      if (!batch.current.length) return;
      client.pnp({ k: 'pachi', l: batch.current.splice(0), b: ballsRef.current });
    }, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(iv); };
  }, []);

  useEffect(() => { if (paused) firing.current = false; }, [paused]);

  const buy = async () => {
    setErr('');
    setBusy(true);
    try {
      const r = await client.req<{ balls: number }>('pachiBuy', { packs: 1 });
      setBalls((b) => b + r.balls);
      sfx.coin();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const cash = async (exit: boolean) => {
    setErr('');
    setBusy(true);
    try {
      const n = ballsRef.current;
      await client.req('pachiCash', { balls: n, exit });
      setBalls(() => 0);
      if (exit) onExit();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const scale = 2;
  return (
    <div class="pachi">
      <div class="pachi-top">
        <span>Шарики: <b>{balls}</b></span>
        <span class="muted">= ¥{balls * st.yenPerBall}</span>
      </div>
      <div class="pachi-board">
        <canvas ref={cv} width={PACHI.W * scale} height={PACHI.H * scale} />
        {win && <div class="pachi-win pop">{win}</div>}
        {paused && <div class="pachi-paused">⏸ пауза — вопрос!</div>}
      </div>
      <div class="pachi-ctrl">
        <label class="col" style={{ gap: 2, flex: 1 }}>
          <span class="muted small-text">Сила запуска: {Math.round(power * 100)}</span>
          <input type="range" min={0} max={100} value={Math.round(power * 100)} onInput={(e) => setPower(Number((e.target as HTMLInputElement).value) / 100)} />
        </label>
        <button
          class="btn primary fire"
          disabled={!balls || paused}
          onPointerDown={(e) => { e.preventDefault(); firing.current = true; }}
          onPointerUp={() => (firing.current = false)}
          onPointerLeave={() => (firing.current = false)}
          onPointerCancel={() => (firing.current = false)}
        >
          ДЕРЖИ
        </button>
      </div>
      {err && <div class="warn">{err}</div>}
      <div class="row wrap pad-x">
        {here && <button class="btn small yellow" disabled={busy} onClick={buy}>+{st.pack} шариков за ¥{st.pack * st.yenPerBall}</button>}
        <button class="btn small" disabled={busy || !balls} onClick={() => cash(false)}>Обменять на ¥</button>
        <button class="btn small" disabled={busy} onClick={() => cash(true)}>Выйти</button>
      </div>
      {!here && <div class="muted small-text pad-x">Ты ушёл от автомата — можно только обменять оставшиеся шарики.</div>}
    </div>
  );
}
