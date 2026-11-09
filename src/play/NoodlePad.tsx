// «Лапша» на телефоне: тапаешь по миске — ешь; миска пустеет — подкладывают новую порцию.
// Живот наполняется; где-то в красной зоне — твой скрытый предел. Съел больше — лопнул (в зачёт половина).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GroupPublic, Player } from '../shared/types';
import { PixIcon, TimerBar } from '../ui/common';
import { vibrate } from '../shared/util';
import { sfx } from '../shared/sound';
import { useSubmit } from './GroupGame';
import { noodleImg, noodleOf, noodleScore, plural } from '../games/noodles';

interface Run { n: number; bites: number; tossUntil: number; end: 'lid' | 'burst' | null }
/** ход игры переживает перерисовки и переподключение экрана */
const runs = new Map<number, Run>();

export function NoodlePad({ client, g, me }: { client: GameClient; g: GroupPublic; me: Player }) {
  const d = noodleOf(g.noodle);
  const run = (runs.get(g.id) ?? runs.set(g.id, { n: 0, bites: 0, tossUntil: 0, end: null }).get(g.id))!;
  const [, tick] = useState(0);
  const lastSent = useRef(-1);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 150);
    return () => clearInterval(t);
  }, []);
  const now = client.hostNow();
  const live = g.phase === 'draw' && now >= g.startAt && now < g.deadline;
  const lim = g.limits?.[me.id] ?? d.max;

  const { sent, submit } = useSubmit(client, g, me, () => `nood:${run.n}:${run.end ?? 'time'}`);
  const playing = live && !run.end && !sent;

  // ход игры — на ТВ (после каждой миски и в конце)
  const report = (how?: 'lid' | 'burst') => {
    lastSent.current = run.n;
    client.pick('noodle', { id: g.id, n: run.n, how });
  };

  const bite = () => {
    if (!playing) return;
    const t = client.hostNow();
    if (t < run.tossUntil) return; // порцию ещё подкладывают
    run.bites++;
    sfx.tick();
    vibrate(12);
    if (run.bites >= d.taps) {
      run.bites = 0;
      if (run.n + 1 > lim) {
        // эта миска уже не влезла
        run.end = 'burst';
        sfx.stumble();
        vibrate([80, 40, 200]);
        report('burst');
        submit();
      } else {
        run.n++;
        run.tossUntil = t + d.tossMs;
        sfx.step();
        report();
      }
    }
    tick((x) => x + 1);
  };
  const stop = () => {
    if (!playing) return;
    run.end = 'lid';
    sfx.answered();
    vibrate(40);
    report('lid');
    submit();
  };

  const tossing = playing && now < run.tossUntil;
  const left = d.taps - run.bites;
  const fill = Math.min(1, run.n / d.max);
  const red = d.min / d.max;
  const bowlImg = run.end === 'lid' ? d.done : run.end === 'burst' ? d.empty : tossing ? d.empty : d.full;
  const score = noodleScore(run.end === 'burst' ? lim : run.n, run.end === 'burst');

  return (
    <div class="pad col noodle-pad">
      {g.phase === 'draw' && !sent && <TimerBar start={g.startAt} end={g.deadline} now={() => client.hostNow()} />}
      <div class="noodle-task">{g.prompt}</div>
      <div class="noodle-count"><b>{run.n}</b> {plural(run.n, d.unit)}</div>
      <div class="noodle-bites">{playing && !tossing && Array.from({ length: d.taps }, (_, i) => <i class={i < run.bites ? 'on' : ''} />)}</div>
      <button class={'noodle-bowl' + (playing ? ' live' : '') + (run.end === 'burst' ? ' burst' : '')} onPointerDown={(e) => { e.preventDefault(); bite(); }} disabled={!playing}>
        {tossing && <img class="noodle-fly" key={run.n} src={noodleImg(d.fly)} alt="" />}
        <img class="noodle-img" src={noodleImg(bowlImg)} alt="" draggable={false} />
        {run.end === 'burst' && <div class="noodle-boom pop">ЛОПНУЛ!</div>}
      </button>
      <div class="noodle-belly" title="Живот">
        <div class="noodle-belly-red" style={{ left: `${red * 100}%` }} />
        <div class="noodle-belly-fill" style={{ width: `${fill * 100}%` }} />
        <div class="noodle-belly-mark" style={{ left: `${red * 100}%` }} />
        <span class="noodle-belly-label">живот</span>
      </div>
      <div class="muted small-text center">Предел где-то в красной зоне: от {d.min} до {d.max}. Свой — не знаешь.</div>
      {g.phase === 'intro' && <div class="muted center">Слушай задание — миску подадут по сигналу</div>}
      {playing && <div class="muted small-text center">{tossing ? 'Подкладывают…' : `Тапай по миске! Ещё ${left}`}</div>}
      {playing && <button class="btn big-btn primary" onClick={stop}>{d.stop}</button>}
      {run.end === 'lid' && <div class="q-result pop"><PixIcon id="ui_check" size={18} /> {d.stopped}: {run.n} в зачёт</div>}
      {run.end === 'burst' && <div class="q-result pop">Влезло {lim}, в зачёт половина: {score}</div>}
      {!run.end && sent && <div class="muted center">Время вышло: {run.n} в зачёт</div>}
    </div>
  );
}
