// Джа-одори на телефоне: две кнопки, ЛЕВАЯ и ПРАВАЯ, жать по очереди в такт барабану на ТВ.
// Шаги судит сам телефон по часам хоста (как ритм-баттл); хосту уходят только номера шагов,
// на которых игрок сбился, и раз в 2 c — «я на связи».
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { DragonPublic, GameState, Player } from '../shared/types';
import { useFrame } from '../ui/common';
import { DRAGON_COUNT, dragonFoot, dragonNearest, dragonTimes, dragonWindow } from '../games/logic';
import { GROUP_GAMES } from '../shared/settings';
import { vibrate } from '../shared/util';

type Foot = 'L' | 'R';
interface Judge {
  id: number;
  /** шаги до from уже рассужены (или были до того, как открылся экран) */
  from: number;
  judged: Map<number, 'hit' | 'miss'>;
  misses: number[];
  fb: { text: string; good: boolean; at: number } | null;
  pressed: Record<Foot, number>;
}

export function DragonPad({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const d = s.dr!;
  const info = GROUP_GAMES.dragon;
  const alive = d.alive.includes(me.id);
  const playing = d.phase === 'play' && d.startAt > 0;
  useFrame(playing);
  const J = useRef<Judge | null>(null);
  if (!J.current || J.current.id !== d.id) J.current = { id: d.id, from: -1, judged: new Map(), misses: [], fb: null, pressed: { L: 0, R: 0 } };
  const aliveRef = useRef(alive);
  aliveRef.current = alive;
  const [, bump] = useState(0);

  const miss = (i: number, why: string) => {
    const j = J.current!;
    j.judged.set(i, 'miss');
    j.fb = { text: why, good: false, at: performance.now() };
    if (i < d.warm) return;
    j.misses.push(i);
    client.send({ t: 'dragon', pid: me.id, id: d.id, miss: [i] });
    vibrate(250);
  };

  // пропущенные шаги и «я на связи»
  useEffect(() => {
    if (!playing) return;
    const times = dragonTimes(d);
    const j = J.current!;
    if (j.from < 0) {
      // экран открылся посреди танца — прошлые шаги не судим
      const t = client.hostNow();
      j.from = 0;
      while (j.from < times.length && times[j.from] + dragonWindow(d, j.from) < t) j.from++;
    }
    const tick = () => {
      const t = client.hostNow() - d.tapLag;
      for (; j.from < times.length && times[j.from] + dragonWindow(d, j.from) < t; j.from++) {
        if (!aliveRef.current || j.judged.has(j.from)) continue;
        miss(j.from, 'Пропустил шаг!');
      }
    };
    const t1 = setInterval(tick, 40);
    const beat = () => client.send({ t: 'dragon', pid: me.id, id: d.id, miss: j.misses.slice(-10) });
    beat();
    const t2 = setInterval(beat, 2000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [d.id, playing]);

  const tap = (foot: Foot, evStamp: number) => {
    const j = J.current!;
    j.pressed[foot] = performance.now();
    vibrate(12);
    bump((x) => x + 1);
    if (!playing || !alive) return;
    const times = dragonTimes(d);
    // время нажатия по часам хоста: момент события, а не обработки; минус задержка касания
    const t = client.hostNow() - Math.max(0, performance.now() - evStamp) - d.tapLag;
    if (t < times[0] - dragonWindow(d, 0) * 2) return; // жмут во время отсчёта — не страшно
    let i = dragonNearest(times, t);
    if (j.judged.get(i) === 'hit') {
      // этот шаг уже сделан — лишнее нажатие: сбил следующий шаг
      if (i + 1 >= times.length) return;
      i++;
    }
    if (j.judged.has(i) || i < j.from) return;
    const dt = t - times[i];
    const win = dragonWindow(d, i);
    if (Math.abs(dt) > win) return miss(i, dt < 0 ? 'Рано!' : 'Поздно!');
    if (dragonFoot(i) !== foot) return miss(i, 'Не та нога!');
    j.judged.set(i, 'hit');
    j.fb = { text: Math.abs(dt) < win * 0.45 ? 'В такт!' : 'Хорошо', good: true, at: performance.now() };
  };

  // клавиатура для проверки с компьютера: ← и →
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') tap('L', e.timeStamp);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') tap('R', e.timeStamp);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pos = d.players.indexOf(me.id) + 1;
  if (d.phase === 'intro') {
    return (
      <div class="pad col center-screen dragon-phone">
        <div class="group-kanji small">{info.kanji}</div>
        <h2>{info.name} <span class="jp">{info.ja}</span></h2>
        <div class="dragon-place">Ты несёшь {pos === 1 ? 'голову дракона' : pos === d.players.length ? 'хвост дракона' : `кусок №${pos}`}</div>
        <div class="muted">Жми <b>ЛЕВУЮ</b> и <b>ПРАВУЮ</b> по очереди в такт барабану на ТВ. Сначала {d.warm} шагов разминки, потом зачёт. Сбился — выбыл.</div>
        <Buttons j={J.current} hint={null} onTap={() => {}} disabled />
      </div>
    );
  }
  if (d.phase === 'results') {
    const pl = d.places?.[me.id];
    return (
      <div class="pad col center-screen">
        <h2>{pl ? `${pl} место!` : 'Итоги на ТВ'}</h2>
        <div class="muted">{d.out[me.id] == null ? 'Ты донёс дракона до конца!' : `Ты сбился на шаге ${d.out[me.id] - d.warm + 1}`}</div>
        {d.awards?.[me.id] && <div class="q-result pop">{d.awards[me.id]}</div>}
      </div>
    );
  }
  if (!alive) {
    return (
      <div class="pad col center-screen">
        <div class="dragon-dizzy">😵</div>
        <h2>Ты выбыл</h2>
        <div class="muted">Сбился на шаге {(d.out[me.id] ?? d.warm) - d.warm + 1}. Смотри, кто донесёт дракона, — на ТВ!</div>
        <div class="muted">Несут: {d.alive.length} из {d.players.length}</div>
      </div>
    );
  }

  const times = d.startAt ? dragonTimes(d) : [];
  const t = client.hostNow();
  const beat0 = 60000 / d.bpm;
  const count = times.length && t < times[0] ? Math.max(0, DRAGON_COUNT - Math.ceil((times[0] - t) / beat0)) : -1;
  const next = times.length ? Math.min(times.length - 1, dragonNearest(times, t + 1)) : 0;
  const warm = next < d.warm;
  // подсказка на разминке: какую кнопку жать следующей, ярче к моменту удара
  const left = times.length ? times[next] - t : 0;
  const glow = warm && count < 0 ? Math.max(0, 1 - Math.abs(left) / 400) : 0;
  const fb = J.current.fb && performance.now() - J.current.fb.at < 700 ? J.current.fb : null;
  return (
    <div class="dragon-phone">
      <div class="dragon-top">
        <div class="dragon-status">
          {count >= 0 ? <span class="dragon-count-ph">{count + 1} <span class="jp">{['いち', 'に', 'さん', 'し'][count]}</span></span>
            : warm ? <>Разминка · {Math.min(d.warm, next + 1)} из {d.warm}</>
            : <span class="dragon-live">ЗАЧЁТ · несут {d.alive.length} из {d.players.length}</span>}
        </div>
        <div class={'dragon-fb' + (fb ? (fb.good ? ' good' : ' bad') : '')} key={fb?.at}>{fb?.text ?? ' '}</div>
      </div>
      <Buttons j={J.current} hint={warm && count < 0 ? { foot: dragonFoot(next), glow } : null} onTap={tap} />
    </div>
  );
}

function Buttons({ j, hint, onTap, disabled }: { j: Judge; hint: { foot: Foot; glow: number } | null; onTap: (f: Foot, stamp: number) => void; disabled?: boolean }) {
  const btn = (foot: Foot) => {
    const lit = hint?.foot === foot ? hint.glow : 0;
    const pressed = performance.now() - j.pressed[foot] < 110;
    return (
      <button
        class={'dragon-btn ' + foot + (pressed ? ' pressed' : '') + (hint?.foot === foot ? ' next' : '')}
        style={lit ? { boxShadow: `0 0 ${Math.round(40 * lit)}px ${Math.round(12 * lit)}px rgba(255, 210, 63, ${lit})` } : undefined}
        disabled={disabled}
        onPointerDown={(e) => { e.preventDefault(); onTap(foot, e.timeStamp); }}
      >
        <span class="dragon-btn-kanji">{foot === 'L' ? '左' : '右'}</span>
        <span>{foot === 'L' ? 'ЛЕВАЯ' : 'ПРАВАЯ'}</span>
      </button>
    );
  };
  return <div class="dragon-btns">{btn('L')}{btn('R')}</div>;
}
