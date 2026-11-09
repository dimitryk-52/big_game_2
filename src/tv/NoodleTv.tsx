// «Лапша» на ТВ: у каждого растёт стопка пустых мисок; кто накрыл миску — остановился, кто лопнул — 💥.
import type { GameState, GroupPublic } from '../shared/types';
import { Avatar, ResText, TimerBar } from '../ui/common';
import { now } from '../shared/util';
import { noodleImg, noodleOf, plural } from '../games/noodles';
import { GROUP_GAMES } from '../shared/settings';

/** стопка пустых мисок (больше 14 не рисуем — дальше только число) */
function Stack({ n, img, top }: { n: number; img: string; top?: string }) {
  const shown = Math.min(14, n);
  return (
    <div class="nood-stack">
      {top && <img class="nood-top" src={noodleImg(top)} alt="" />}
      {Array.from({ length: shown }, (_, i) => <img key={i} src={noodleImg(img)} alt="" style={{ zIndex: shown - i }} />)}
    </div>
  );
}

export function NoodleTv({ s, g, head }: { s: GameState; g: GroupPublic; head: any }) {
  const d = noodleOf(g.noodle);
  return (
    <div class="group-draw nood-tv">
      {head}
      <div class="nood-row">
        <img class="nood-server" src={noodleImg('server')} alt="" />
        <div class="nood-players">
          {g.players.map((id) => {
            const p = s.players[id];
            if (!p) return null;
            const n = g.bowls?.[id] ?? 0;
            const burst = g.burst?.includes(id);
            const closed = g.closed?.includes(id);
            return (
              <div class={'nood-card' + (burst ? ' burst' : '') + (closed ? ' closed' : '')} key={id}>
                <Stack n={n} img={d.empty} top={closed ? d.done : burst ? undefined : d.full} />
                <div class="nood-n">{n}</div>
                <div class="nood-name"><Avatar p={p} size={30} /> <span style={{ color: p.color }}>{p.name}</span></div>
                <div class="nood-state">{burst ? '💥 лопнул' : closed ? 'хватит!' : 'ест…'}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div class="group-sub">{g.phase === 'draw' ? `Предел живота у каждого свой: от ${d.min} до ${d.max}` : 'Считаем миски…'}</div>
      {g.phase === 'draw' && <TimerBar start={g.startAt} end={g.deadline} now={now} big />}
    </div>
  );
}

export function NoodleResults({ s, g }: { s: GameState; g: GroupPublic }) {
  const d = noodleOf(g.noodle);
  const ranked = g.players.filter((id) => s.players[id]).sort((a, b) => (g.places?.[a] ?? 99) - (g.places?.[b] ?? 99) || (g.points?.[b] ?? 0) - (g.points?.[a] ?? 0));
  return (
    <div class="group-results nood-results">
      <div class="group-head"><span class="group-game">Итоги · {GROUP_GAMES.noodles.name} · {d.name}</span><span class="group-task">{g.prompt}</span></div>
      <div class="nood-rank">
        {ranked.map((id) => {
          const p = s.players[id];
          const n = g.bowls?.[id] ?? 0;
          const burst = g.burst?.includes(id);
          return (
            <div class={'qpart done' + (g.places?.[id] === 1 ? ' place1' : '')}>
              <b class="nood-place">{g.places?.[id] ? `${g.places[id]}.` : '—'}</b>
              <Avatar p={p} size={32} /> <span style={{ color: p.color }}>{p.name}</span>
              <img class="nood-mini" src={noodleImg(burst ? d.empty : d.done)} alt="" />
              <span>{n} {plural(n, d.unit)}</span>
              {burst && <span class="nood-burst">💥 половина: {g.points?.[id] ?? 0}</span>}
              <span class="muted">предел {g.limits?.[id] ?? '?'}</span>
              {g.awards?.[id] && <b><ResText text={g.awards[id]} /></b>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
