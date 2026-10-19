// Чо-хан на телефоне: встряхнуть стакан → ставка и «чёт/нечет» → стакан поднимается.
// Кости бросает хост в момент ставки — честно для всех.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player } from '../shared/types';
import { CH_H, CH_W, drawChohan, type ChohanView } from '../games/chohan';
import { fmtYen, vibrate } from '../shared/util';
import { sfx } from '../shared/sound';

type Phase = 'idle' | 'shaking' | 'bet' | 'rolling' | 'reveal' | 'done';
type Guess = 'cho' | 'han';

export function ChoHan({ client, s, me, onExit }: { client: GameClient; s: GameState; me: Player; onExit: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const view = useRef<ChohanView>({ shake: 0, lift: 0, air: false, dice: null });
  const anim = useRef<{ kind: 'shake' | 'lift'; t0: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const bets = s.settings.chohan?.bets ?? [100, 300, 500, 1000];
  const [bet, setBet] = useState(bets[0]);
  const [res, setRes] = useState<{ d1: number; d2: number; win: boolean; guess: Guess; bet: number } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    void client.req('busy', { busy: 'chohan' }).catch(() => {});
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const v = view.current;
      const a = anim.current;
      if (a?.kind === 'shake') {
        const k = (t - a.t0) / 1300;
        v.air = k < 0.9;
        v.shake = k < 0.9 ? Math.sin(t / 35) * 5 : 0;
        if (k >= 1) { anim.current = null; v.air = false; setPhase('bet'); sfx.click(); vibrate(60); }
      } else if (a?.kind === 'lift') {
        const k = Math.min(1, (t - a.t0) / 600);
        v.lift = k;
        if (k >= 1) anim.current = null;
      }
      const c = cv.current;
      if (c) drawChohan(c.getContext('2d')!, v);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); void client.req('busy', { busy: null }).catch(() => {}); };
  }, []);

  const shake = () => {
    setErr('');
    setRes(null);
    view.current = { shake: 0, lift: 0, air: true, dice: null };
    anim.current = { kind: 'shake', t0: performance.now() };
    setPhase('shaking');
    vibrate([30, 30, 30, 30, 30, 30, 30]);
    sfx.rattle();
  };
  const call = async (guess: Guess) => {
    if (phase !== 'bet') return;
    setPhase('rolling');
    try {
      const r = await client.req<{ d1: number; d2: number; win: boolean }>('chohanRoll', { bet, guess });
      view.current.dice = [r.d1, r.d2];
      setPhase('reveal');
      // пауза перед подъёмом стакана
      setTimeout(() => {
        anim.current = { kind: 'lift', t0: performance.now() };
        setTimeout(() => {
          setRes({ ...r, guess, bet });
          setPhase('done');
          if (r.win) { sfx.jackpot(); vibrate([80, 40, 160]); } else { sfx.wrong(); vibrate(200); }
        }, 650);
      }, 700);
    } catch (e: any) {
      setErr(e.message);
      setPhase('bet');
    }
  };
  const sum = res ? res.d1 + res.d2 : 0;
  return (
    <div class="chohan pad col">
      <div class="center"><b>Чо-хан</b> <span class="jp">丁半</span> · чёт или нечет?</div>
      <canvas ref={cv} width={CH_W} height={CH_H} class="chohan-cv" />
      {res && (
        <div class={'status-card pop center ' + (res.win ? 'win' : 'lose')}>
          {res.d1} + {res.d2} = {sum} — {sum % 2 === 0 ? '丁 чёт' : '半 нечет'}
          <div>{res.win ? `Выигрыш +${fmtYen(res.bet)}` : `Проигрыш −${fmtYen(res.bet)}`}</div>
        </div>
      )}
      {err && <div class="warn">{err}</div>}
      {(phase === 'idle' || phase === 'done') && (
        <button class="btn yellow big-btn" disabled={me.yen < bets[0]} onClick={shake}>{phase === 'done' ? 'Ещё партию' : 'Встряхнуть стакан'}</button>
      )}
      {phase === 'shaking' && <div class="center muted">Дилер трясёт стакан…</div>}
      {(phase === 'bet' || phase === 'rolling') && (
        <>
          <div class="muted center">Ставка</div>
          <div class="chohan-bets">
            {bets.map((b) => <button class={'btn small' + (bet === b ? ' yellow' : '')} disabled={me.yen < b || phase !== 'bet'} onClick={() => setBet(b)}>{fmtYen(b)}</button>)}
          </div>
          <div class="chohan-calls">
            <button class="btn primary big-btn" disabled={phase !== 'bet' || me.yen < bet} onClick={() => call('cho')}><span class="jp-big">丁</span> Чо · чёт</button>
            <button class="btn big-btn chohan-han" disabled={phase !== 'bet' || me.yen < bet} onClick={() => call('han')}><span class="jp-big">半</span> Хан · нечет</button>
          </div>
        </>
      )}
      {phase === 'reveal' && <div class="center muted">Открываем…</div>}
      <div class="muted small-text center">Под стаканом две кости. Сумма чётная — 丁 «чо», нечётная — 半 «хан». Угадал — ставка удваивается.</div>
      <button class="btn small ghost" onClick={onExit}>Назад</button>
    </div>
  );
}
