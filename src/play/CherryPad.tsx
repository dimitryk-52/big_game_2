// «Косточки» на телефоне: прицел качается — тап фиксирует угол; шкала силы бегает — второй тап плюёт.
// Сила в красной зоне — поперхнулся, косточка падает под ноги. Три попытки, у каждой свой ветер (один на всех).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GroupPublic, Player } from '../shared/types';
import { TimerBar } from '../ui/common';
import { vibrate } from '../shared/util';
import { sfx } from '../shared/sound';
import { useSubmit } from './GroupGame';
import { ANGLE_MAX, ANGLE_MIN, CHOKE, PIT_TRIES, cherryImg, meters, pitDistance, windText } from '../games/cherry';

type Step = 'angle' | 'power' | 'shown';
interface Run { i: number; step: Step; t0: number; angle: number; shots: ({ a: number; p: number; d: number } | null)[] }
const runs = new Map<number, Run>();

const ANGLE_MS = 1700;
const POWER_MS = 1050;
const swing = (t: number, ms: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / ms);

export function CherryPad({ client, g, me }: { client: GameClient; g: GroupPublic; me: Player }) {
  const run = (runs.get(g.id) ?? runs.set(g.id, { i: 0, step: 'angle', t0: performance.now(), angle: 45, shots: Array(PIT_TRIES).fill(null) }).get(g.id))!;
  const [, tick] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const loop = () => { tick((x) => x + 1); raf.current = requestAnimationFrame(loop); };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, []);
  const now = client.hostNow();
  const live = g.phase === 'draw' && now >= g.startAt && now < g.deadline;
  const finished = run.i >= PIT_TRIES;
  const { sent, submit } = useSubmit(client, g, me, () => 'pit:' + run.shots.map((x) => (x ? `${x.a.toFixed(1)},${x.p.toFixed(3)}` : '-')).join(';'));
  const playing = live && !finished && !sent;

  const t = performance.now() - run.t0;
  const angle = run.step === 'angle' ? ANGLE_MIN + (ANGLE_MAX - ANGLE_MIN) * swing(t, ANGLE_MS) : run.angle;
  const power = run.step === 'power' ? swing(t, POWER_MS) : run.shots[run.i]?.p ?? 0;
  const wind = g.winds?.[Math.min(run.i, PIT_TRIES - 1)] ?? 0;

  const tap = () => {
    if (!playing) return;
    if (run.step === 'angle') {
      run.angle = angle;
      run.step = 'power';
      run.t0 = performance.now();
      sfx.click();
      vibrate(15);
    } else if (run.step === 'power') {
      const p = power;
      const d = pitDistance(run.angle, p, wind);
      run.shots[run.i] = { a: run.angle, p, d };
      run.step = 'shown';
      client.pick('cherry', { id: g.id, i: run.i, a: run.angle, p });
      if (p > CHOKE) { sfx.stumble(); vibrate([60, 40, 60]); } else { sfx.slash(); vibrate(40); }
      // следующая попытка — после показа результата
      setTimeout(() => {
        run.i++;
        run.step = 'angle';
        run.t0 = performance.now();
        if (run.i >= PIT_TRIES) submit();
      }, 1600);
    }
  };

  const best = Math.max(0, ...run.shots.map((x) => x?.d ?? 0));
  const shot = run.shots[run.i];
  // стрелка прицела: 0° — вправо, растёт против часовой
  const rad = (angle * Math.PI) / 180;
  const nx = 10 + Math.cos(rad) * 84, ny = 94 - Math.sin(rad) * 84;

  return (
    <div class="pad col cherry-pad">
      {g.phase === 'draw' && !sent && <TimerBar start={g.startAt} end={g.deadline} now={() => client.hostNow()} />}
      <div class="cherry-task">{g.prompt}</div>
      <div class="cherry-tries">
        {run.shots.map((x, i) => <span class={'cherry-try' + (i === run.i && !finished ? ' cur' : '')}><img src={cherryImg('cherry_one')} alt="" /> {x ? meters(x.d) : `попытка ${i + 1}`}</span>)}
      </div>
      {!finished && (
        <div class="cherry-wind">
          <img src={cherryImg(wind < 0 ? 'koi_blue' : 'koi')} alt="" style={{ transform: `scaleX(${wind < 0 ? -1 : 1})`, width: `${40 + Math.abs(wind) * 18}px`, opacity: wind === 0 ? 0.35 : 1 }} />
          <span>Ветер: <b>{windText(wind)}</b></span>
        </div>
      )}
      <button class={'cherry-aim' + (playing ? ' live' : '')} onPointerDown={(e) => { e.preventDefault(); tap(); }} disabled={!playing}>
        <svg viewBox="0 0 110 100" class="cherry-gauge">
          <path d="M10 94 L94 94 A84 84 0 0 0 10 10 Z" class="cherry-gauge-bg" />
          {[20, 35, 50, 65].map((a) => { const r = (a * Math.PI) / 180; return <line x1={10 + Math.cos(r) * 70} y1={94 - Math.sin(r) * 70} x2={10 + Math.cos(r) * 84} y2={94 - Math.sin(r) * 84} class="cherry-gauge-tick" />; })}
          <line x1="10" y1="94" x2={nx} y2={ny} class={'cherry-needle' + (run.step === 'angle' ? '' : ' locked')} />
          <image href={cherryImg('pit')} x={nx - 4} y={ny - 4} width="8" height="8" style={{ imageRendering: 'pixelated' }} />
        </svg>
        <div class="cherry-power">
          <div class="cherry-power-red" style={{ height: `${(1 - CHOKE) * 100}%` }} />
          <div class="cherry-power-fill" style={{ height: `${power * 100}%`, opacity: run.step === 'angle' ? 0.25 : 1 }} />
        </div>
        <div class="cherry-angle">{Math.round(angle)}°</div>
      </button>
      {g.phase === 'intro' && <div class="muted center">Слушай задание — плевать по сигналу</div>}
      {playing && run.step === 'angle' && <div class="cherry-hint">Тап — угол</div>}
      {playing && run.step === 'power' && <div class="cherry-hint">Тап — сила! (красное — поперхнёшься)</div>}
      {run.step === 'shown' && shot && <div class="q-result pop">{shot.p > CHOKE ? `Поперхнулся! ${meters(shot.d)}` : meters(shot.d)}</div>}
      {(finished || sent) && <div class="q-result pop">Лучший плевок: {meters(best)}</div>}
    </div>
  );
}
