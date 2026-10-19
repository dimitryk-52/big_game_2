// Иайдо на ТВ: «приготовились» → тишина (иногда ложный «?») → вспышка «!» → время каждого игрока.
// Момент сигнала знает только ТВ (хост), телефоны его не получают.
import { useEffect, useRef } from 'preact/hooks';
import type { GameState, GroupPublic } from '../shared/types';
import { Avatar, useFrame } from '../ui/common';
import { iaiSounds } from '../shared/sound';
import { now } from '../shared/util';

type Signal = { round: number; at: number; decoyAt?: number } | null;

export function IaidoTv({ s, g, sig }: { s: GameState; g: GroupPublic; sig: Signal }) {
  const iai = g.iai;
  const ready = iai?.step === 'ready';
  useFrame(ready);
  // звук «кин!» ставим в очередь AudioContext заранее — прозвучит ровно в момент сигнала
  const queued = useRef('');
  useEffect(() => {
    if (!iai || !sig || sig.round !== iai.round) return;
    const k = g.id + ':' + iai.round;
    if (queued.current === k) return;
    queued.current = k;
    iaiSounds(sig.at, sig.decoyAt);
  }, [iai?.round]);
  if (!iai) return null;

  const t = now();
  const s0 = sig && sig.round === iai.round ? sig : null;
  const go = !!s0 && (iai.step === 'done' || t >= s0.at);
  const decoy = !go && !!s0?.decoyAt && t >= s0.decoyAt && t < s0.decoyAt + 450;
  const before = t < g.startAt;
  const times = iai.times ?? {};
  const ranked = [...iai.cut].sort((a, b) => (times[a] ?? 0) - (times[b] ?? 0));
  const winner = iai.step === 'done' ? ranked[0] : undefined;
  const flash = go && s0 && t - s0.at < 160;

  return (
    <div class="iai-stage">
      {flash && <div class="iai-flash" />}
      <div class="iai-top">
        <span class="iai-round">Раунд {iai.round} / {iai.rounds}</span>
        <span class="group-task">{g.prompt}</span>
      </div>
      <div class={'iai-sign' + (go ? ' go' : decoy ? ' decoy' : '')}>
        {go ? '!' : decoy ? '?' : before ? <span class="iai-ready">Приготовились…</span> : <span class="iai-hush">…</span>}
      </div>
      {iai.step === 'done' && (
        <div class="iai-verdict pop">
          {winner ? <><Avatar p={s.players[winner]} size={44} /> {s.players[winner]?.name} — <b>{times[winner]} мс</b></> : 'Никто не успел'}
        </div>
      )}
      <div class="iai-row">
        {g.players.map((id) => {
          const p = s.players[id];
          if (!p) return null;
          const early = iai.early.includes(id);
          const cut = iai.cut.includes(id);
          const place = ranked.indexOf(id);
          return (
            <div class={'iai-samurai' + (early ? ' out' : '') + (id === winner ? ' win' : '')}>
              <div class="iai-badge">
                {early ? '✗' : iai.step === 'done' ? (cut ? (place < 3 ? ['斬', '2', '3'][place] : '·') : '—') : cut ? '✔' : ''}
              </div>
              <Avatar p={p} size={56} />
              <div class="iai-name">{p.name}</div>
              <div class="iai-time">
                {early ? 'рано!' : iai.step === 'done' ? (cut ? `${times[id]} мс` : 'не успел') : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** итоги иайдо: список по местам — номер, очки, лучшее время, награда */
export function IaidoResults({ s, g }: { s: GameState; g: GroupPublic }) {
  const ranked = [...g.players].filter((id) => s.players[id]).sort((a, b) =>
    (g.places?.[a] ?? 99) - (g.places?.[b] ?? 99) || (g.points?.[b] ?? 0) - (g.points?.[a] ?? 0));
  return (
    <div class="iai-results">
      {ranked.map((id) => {
        const p = s.players[id];
        const pl = g.places?.[id];
        return (
          <div class={'iai-res-row' + (pl ? ' place' + pl + ' pop' : ' out')}>
            <span class="iai-res-place">{pl ? `${pl}.` : '—'}</span>
            <Avatar p={p} size={40} />
            <span class="iai-res-name">{p.name}</span>
            <span class="muted">{g.best?.[id] != null ? `лучшее ${g.best[id]} мс` : 'без удачных ударов'}</span>
            <span class="iai-res-pts">{g.points?.[id] ?? 0} очк.</span>
            <span class="iai-res-award">{g.awards?.[id] ?? ''}</span>
          </div>
        );
      })}
    </div>
  );
}
