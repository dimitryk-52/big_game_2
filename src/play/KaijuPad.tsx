// «Годзилла» на телефоне. Годзилла — крестовина: шаг по клетке (держишь — идёт дальше).
// Охотник — карта города: тап по клетке — выстрел туда, потом перезарядка.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player } from '../shared/types';
import { ResText, useFrame } from '../ui/common';
import { vibrate } from '../shared/util';
import { sfx } from '../shared/sound';
import { kaijuImg } from '../tv/KaijuTv';

const ARROWS = ['▲', '▶', '▼', '◀'];

export function KaijuPad({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const k = s.kj!;
  useFrame(k.phase === 'play');
  const t = client.hostNow();
  const live = k.phase === 'play' && t >= k.startAt && t < k.endAt && k.hp > 0;
  const isZilla = k.zilla === me.id;
  const hold = useRef<any>(null);
  // своя перезарядка считается сразу, не дожидаясь ответа ТВ
  const [localReady, setLocalReady] = useState(0);
  const [lastCell, setLastCell] = useState(-1);
  useEffect(() => () => clearInterval(hold.current), []);

  // удержание стрелки переживает перерисовки: читаем свежее состояние, а не то, что было в момент нажатия
  const cur = useRef({ live, id: k.id });
  cur.current = { live, id: k.id };
  const go = (dir: number) => {
    if (!cur.current.live) return;
    client.pick('kaiju', { id: cur.current.id, dir });
    vibrate(10);
  };
  const press = (dir: number) => {
    go(dir);
    clearInterval(hold.current);
    hold.current = setInterval(() => go(dir), Math.max(250, k.cfg.stepMs - 40));
  };
  const release = () => clearInterval(hold.current);
  if (k.phase !== 'play' || t >= k.endAt || k.hp <= 0) clearInterval(hold.current);

  const ready = Math.max(k.ready[me.id] ?? 0, localReady);
  const reload = Math.max(0, Math.min(1, (ready - t) / k.cfg.reloadMs));
  const fire = (cell: number) => {
    if (!live || reload > 0) return;
    client.pick('kaiju', { id: k.id, cell });
    setLocalReady(client.hostNow() + k.cfg.reloadMs);
    setLastCell(cell);
    sfx.click();
    vibrate(25);
  };

  const left = Math.max(0, Math.ceil((k.endAt - Math.max(t, k.startAt)) / 1000));
  const head = (
    <div class="kjp-head">
      <span class="kj-hp">{Array.from({ length: k.maxHp }, (_, i) => <i class={i < k.hp ? 'on' : ''} />)}</span>
      <span>домов: {k.stomped}</span>
      {k.phase === 'play' && <b class="kjp-clock">{t < k.startAt ? `старт через ${Math.ceil((k.startAt - t) / 1000)}` : left}</b>}
    </div>
  );

  if (k.phase === 'results') {
    return (
      <div class="pad col center-screen">
        <h2>{k.hp <= 0 ? 'Годзилла повержен!' : 'Годзилла ушёл в залив'}</h2>
        <div class="muted">{isZilla ? `Ты растоптал домов: ${k.stomped}` : `Твои попадания: ${k.hits[me.id] ?? 0}`}</div>
        {k.awards?.[me.id] && <div class="q-res-sub"><ResText text={k.awards[me.id]} topics={s.settings.topics} size={26} /></div>}
      </div>
    );
  }

  if (isZilla) {
    return (
      <div class="pad col kjp">
        {head}
        <div class="kjp-role"><img src={kaijuImg('zilla')} alt="" /> Ты — Годзилла! {k.phase === 'intro' ? 'Смотри на ТВ и готовься' : 'Топчи дома и уходи от теней'}</div>
        <div class={'kjp-dpad' + (live ? '' : ' off')}>
          {ARROWS.map((a, d) => (
            <button class={'btn kjp-arrow d' + d} onPointerDown={(e) => { e.preventDefault(); press(d); }} onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()}>{a}</button>
          ))}
        </div>
        <div class="muted center small">По руинам идёшь быстро. Целый дом ломаешь секунду — в это время стоишь на месте.</div>
      </div>
    );
  }

  return (
    <div class="pad col kjp">
      {head}
      <div class="kjp-role">{k.phase === 'intro' ? 'Ты — охотник. Готовься!' : reload > 0 ? 'Перезарядка…' : 'Тапни клетку — туда упадёт снаряд'}</div>
      <div class="kjp-reload"><i style={{ width: `${(1 - reload) * 100}%` }} /></div>
      <div class={'kjp-grid' + (live && reload === 0 ? '' : ' off')} style={{ gridTemplateColumns: `repeat(${k.cols}, 1fr)` }}>
        {Array.from({ length: k.cols * k.rows }, (_, cell) => {
          const mine = k.shells.some((x) => x.cell === cell && x.pid === me.id) || (cell === lastCell && reload > 0.6);
          const other = k.shells.some((x) => x.cell === cell);
          return (
            <button class={'kjp-cell' + (k.down.includes(cell) ? ' down' : '') + (mine ? ' mine' : other ? ' shot' : '')} onPointerDown={(e) => { e.preventDefault(); fire(cell); }}>
              {k.pos === cell && <img src={kaijuImg('zilla')} alt="" style={{ transform: k.face < 0 ? 'scaleX(-1)' : undefined }} />}
            </button>
          );
        })}
      </div>
      <div class="muted center small">Снаряд летит чуть больше секунды — бей туда, куда Годзилла пойдёт. Залив — снизу.</div>
    </div>
  );
}
