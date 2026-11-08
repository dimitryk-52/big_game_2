// Телефон: ставки на дуэль, карточка находки, подсказки к предметам.
import { useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { BonusId, GameState, Player } from '../shared/types';
import { Avatar, BonusIcon, PixIcon, TimerBar } from '../ui/common';
import { BONUS_DESC, FIND_INFO } from '../shared/economy';
import { BONUS_INFO } from '../shared/settings';
import { PREF } from '../map/mapData';
import { fmtYen, vibrate } from '../shared/util';

/** ставки зрителей: под каждым бойцом +100 / +500; деньги списываются сразу */
export function BetPad({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const st = s.stage;
  const d = s.duel;
  const [sent, setSent] = useState(false);
  if (st.t !== 'duelBet' || !d) return null;
  const mine = d.bets?.[me.id] ?? {};
  const bet = (on: string, amt: number) => { client.pick('bet', { on, amt }); vibrate(20); };
  const done = () => { setSent(true); client.pick('bet', 'done'); vibrate(30); };
  const fighter = (id: string) => {
    const p = s.players[id];
    if (!p) return null;
    return (
      <div class="panel col bet-fighter">
        <div class="row"><Avatar p={p} size={44} flip={id === d.defender} /> <b class="grow">{p.name}</b> <PixIcon id="ui_heart" size={16} /> {p.hp}</div>
        <div class="muted">Твоя ставка: <b>{fmtYen(mine[id] ?? 0)}</b></div>
        <div class="row">
          {[100, 500].map((amt) => (
            <button class="btn yellow grow" disabled={sent || me.yen < amt} onClick={() => bet(id, amt)}>+{amt}</button>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div class="scroll pad col">
      <h2>Ставки на дуэль</h2>
      <div class="muted">Победит тот, на кого поставил, — получишь вдвое. Поставишь на обоих поровну — ничего не потеряешь. Ничья — деньги вернутся.</div>
      <TimerBar start={st.deadline - (s.settings.betTime ?? 15) * 1000} end={st.deadline} now={() => client.hostNow()} />
      {fighter(d.attacker)}
      {fighter(d.defender)}
      <div class="muted center">У тебя {fmtYen(me.yen)}</div>
      <button class="btn big-btn" disabled={sent} onClick={done}>{sent ? 'Ждём остальных…' : 'Готово'}</button>
    </div>
  );
}

/** находка у меня под ногами: что это и как работает */
export function FindCard({ s }: { s: GameState; me: Player }) {
  const st = s.stage;
  if (st.t !== 'find') return null;
  const info = FIND_INFO[st.kind];
  const from = st.from ? s.players[st.from] : null;
  let extra = '';
  if (st.kind === 'wallet') extra = `В кошельке ${fmtYen(st.amount ?? 0)}.`;
  if (st.kind === 'kitsune') extra = `Она принесла ${fmtYen(st.amount ?? 0)}${from ? ` от ${from.name}` : ''}. Это видели все.`;
  const scouted = st.kind === 'map' ? (s.players[st.pid]?.scouted ?? []) : [];
  return (
    <div class="pad col center-screen find-card">
      <div class="shop-door pop"><PixIcon id={info.icon} size={96} /></div>
      <h2>Ты нашёл: {info.name}</h2>
      <div>{info.desc}</div>
      {extra && <div><b>{extra}</b></div>}
      {scouted.length > 0 && (
        <div class="panel col small-text">
          {scouted.map((c) => <div><b>{PREF[c]?.ru}</b> <span class="muted">{scoutNote(s, c)}</span></div>)}
        </div>
      )}
      {info.bonus && <div class="muted">Лежит в инвентаре — описание там же, на главном экране.</div>}
      {!info.public && <div class="muted small-text">На ТВ видно только, что ты что-то нашёл.</div>}
    </div>
  );
}

/** что в префектуре под туманом (для старой карты) */
export function scoutNote(s: GameState, c: number): string {
  const st = s.settings;
  const out: string[] = [];
  const ps = s.prefs[c];
  if (ps && !ps.taken) out.push({ money: 'йены', stars: 'звёзды', bonus: 'бонус', special: 'спецвопрос', turn2: 'доп. ход', prize: 'ПРИЗ' }[ps.reward] ?? '');
  if (st.shopPrefs?.includes(c)) out.push('магазин');
  if (st.groupPrefs?.[c] && !ps?.groupDone) out.push('групповая игра');
  return out.filter(Boolean).join(', ');
}

/** мои предметы с описанием, как ими пользоваться */
export function ItemHelp({ me }: { me: Player }) {
  const own = (Object.keys(me.bonuses) as BonusId[]).filter((b) => (me.bonuses[b] ?? 0) > 0 && BONUS_INFO[b]);
  if (!own.length) return null;
  return (
    <div class="col item-help">
      {own.map((b) => (
        <div class="row small-text">
          <BonusIcon b={b} size={24} />
          <span class="grow"><b>{BONUS_INFO[b].name}</b> ×{me.bonuses[b]} — <span class="muted">{BONUS_DESC[b] ?? ''}</span></span>
        </div>
      ))}
    </div>
  );
}
