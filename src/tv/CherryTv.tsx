// «Косточки» на ТВ: поле в Хигасинэ, ветер трёх попыток, косточки летят и ложатся цветными метками.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameState, GroupPublic } from '../shared/types';
import { Avatar, ResText, TimerBar } from '../ui/common';
import { now } from '../shared/util';
import { FIELD, PIT_TRIES, cherryImg, meters, windText } from '../games/cherry';
import { GROUP_GAMES } from '../shared/settings';

const xPct = (d: number) => ((FIELD.x0 + Math.min(21.5, d) * FIELD.pxPerM) / FIELD.w) * 100;
const yPct = (px: number) => (px / FIELD.h) * 100;
/** метки ложатся «лесенкой», чтобы не закрывать друг друга */
const laneY = (idx: number) => yPct(147 + (idx % 5) * 7);

interface Fly { key: string; pid: string; d: number }

function Field({ s, g, marks, live }: { s: GameState; g: GroupPublic; marks: Record<string, number>; live?: boolean }) {
  const seen = useRef(live ? (g.throws?.length ?? 0) : Infinity);
  const [flying, setFlying] = useState<Fly[]>([]);
  // новые броски — летят по дуге, потом исчезают (метка лучшего остаётся)
  useEffect(() => {
    const th = g.throws ?? [];
    if (th.length <= seen.current) return;
    const add = th.slice(seen.current).map((x, k) => ({ key: `${seen.current + k}`, pid: x.pid, d: x.d }));
    seen.current = th.length;
    setFlying((f) => [...f, ...add]);
    const t = setTimeout(() => setFlying((f) => f.filter((x) => !add.includes(x))), 1400);
    return () => clearTimeout(t);
  }, [g.throws?.length]);
  return (
    <div class="pit-field">
      <img class="pit-bg" src={cherryImg('bg')} alt="" />
      {Array.from({ length: 10 }, (_, k) => (k + 1) * 2).map((m) => <span class="pit-m" style={{ left: `${xPct(m)}%`, top: `${yPct(127)}%` }}>{m}</span>)}
      {g.players.map((id, idx) => {
        const p = s.players[id];
        const d = marks[id];
        if (!p || d == null) return null;
        return (
          <div class="pit-mark" style={{ left: `${xPct(d)}%`, top: `${laneY(idx)}%`, '--c': p.color } as any}>
            <img src={cherryImg('pit')} alt="" />
            <span>{p.name}</span>
          </div>
        );
      })}
      {flying.map((f) => {
        const h = 8 + Math.min(20, f.d) * 1.6; // выше дуга — дальше полёт
        return (
          <div class="pit-fly" key={f.key} style={{ '--x0': `${xPct(0)}%`, '--x1': `${xPct(f.d)}%`, top: `${laneY(g.players.indexOf(f.pid))}%`, '--h': `${h}%` } as any}>
            <img src={cherryImg('pit')} alt="" />
          </div>
        );
      })}
    </div>
  );
}

function Winds({ g }: { g: GroupPublic }) {
  return (
    <div class="pit-winds">
      {(g.winds ?? []).map((w, i) => (
        <div class="pit-wind">
          <span class="muted">Попытка {i + 1}</span>
          <img src={cherryImg(w < 0 ? 'koi_blue' : 'koi')} alt="" style={{ transform: `scaleX(${w < 0 ? -1 : 1})`, width: `${36 + Math.abs(w) * 14}px`, opacity: w === 0 ? 0.35 : 1 }} />
          <span>{windText(w)}</span>
        </div>
      ))}
    </div>
  );
}

const bestOf = (g: GroupPublic, id: string) => {
  const ds = (g.pits?.[id] ?? []).filter((d): d is number => d != null);
  return ds.length ? Math.max(...ds) : undefined;
};

export function CherryTv({ s, g, head }: { s: GameState; g: GroupPublic; head: any }) {
  const marks: Record<string, number> = {};
  for (const id of g.players) { const b = bestOf(g, id); if (b != null) marks[id] = b; }
  return (
    <div class="group-draw pit-tv">
      {head}
      <Winds g={g} />
      <Field s={s} g={g} marks={marks} live />
      <div class="qparts">
        {g.players.map((id) => {
          const p = s.players[id];
          if (!p) return null;
          const tries = g.pits?.[id] ?? [];
          return (
            <div class={'qpart' + (tries.every((d) => d != null) ? ' done' : '')}>
              <Avatar p={p} size={30} /> <span style={{ color: p.color }}>{p.name}</span>
              <span class="pit-tries">{Array.from({ length: PIT_TRIES }, (_, i) => <i class={tries[i] != null ? 'on' : ''} />)}</span>
              <b>{meters(marks[id])}</b>
            </div>
          );
        })}
      </div>
      {g.phase === 'draw' && <TimerBar start={g.startAt} end={g.deadline} now={now} big />}
    </div>
  );
}

export function CherryResults({ s, g }: { s: GameState; g: GroupPublic }) {
  const marks = g.points ?? {};
  const ranked = g.players.filter((id) => s.players[id]).sort((a, b) => (marks[b] ?? -1) - (marks[a] ?? -1));
  return (
    <div class="group-results pit-results">
      <div class="group-head"><span class="group-game">Итоги · {GROUP_GAMES.cherry.name} <span class="jp">{GROUP_GAMES.cherry.ja}</span></span><span class="group-task">{g.prompt}</span></div>
      <Field s={s} g={g} marks={marks} />
      <div class="nood-rank">
        {ranked.map((id) => {
          const p = s.players[id];
          return (
            <div class={'qpart done' + (g.places?.[id] === 1 ? ' place1' : '')}>
              <b class="nood-place">{g.places?.[id] ? `${g.places[id]}.` : '—'}</b>
              <Avatar p={p} size={32} /> <span style={{ color: p.color }}>{p.name}</span>
              <b>{meters(marks[id])}</b>
              <span class="muted">{(g.pits?.[id] ?? []).map((d) => meters(d)).join(' · ')}</span>
              {g.awards?.[id] && <b><ResText text={g.awards[id]} /></b>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
