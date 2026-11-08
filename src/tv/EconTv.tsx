// ТВ: эпохи, ставки на дуэль, находки, итог дуэли с кражей и ставками.
import type { GameState } from '../shared/types';
import { Avatar, PixIcon, TimerBar } from '../ui/common';
import { EPOCHS, epochOf } from '../shared/economy';
import { fmtYen, now } from '../shared/util';

/** плашка эпохи в верхней строке */
export function EpochChip({ s }: { s: GameState }) {
  const E = EPOCHS[epochOf(s)];
  return <div class="chip epoch-chip">Эпоха {E.name} {E.ja}</div>;
}

/** объявление новой эпохи */
export function EpochBanner({ s }: { s: GameState }) {
  const st = s.stage;
  if (st.t !== 'epoch') return null;
  const E = EPOCHS[st.epoch];
  return (
    <div class="banner big">
      <div class="banner-inner epoch-banner pop">
        <div class="epoch-kanji">{E.ja}</div>
        <div class="banner-text">Наступила эпоха {E.name}</div>
        <div class="banner-sub">Цены в магазинах ×{E.price} · награды ×{E.reward}</div>
      </div>
    </div>
  );
}

/** ставки зрителей перед дуэлью: под каждым бойцом — кто и сколько поставил */
export function BetBoard({ s }: { s: GameState }) {
  const st = s.stage;
  const d = s.duel;
  if (st.t !== 'duelBet' || !d) return null;
  const bets = d.bets ?? {};
  const side = (id: string, role: string) => {
    const p = s.players[id];
    if (!p) return null;
    const on = Object.entries(bets).map(([pid, b]) => [pid, b[id] ?? 0] as const).filter(([, v]) => v > 0);
    const total = on.reduce((a, [, v]) => a + v, 0);
    return (
      <div class="bet-side">
        <Avatar p={p} size={110} idle flip={id === d.defender} />
        <div class="bet-name">{p.name} <span class="muted">{role}</span></div>
        <div class="bet-total">{fmtYen(total)}</div>
        <div class="bet-list">
          {on.map(([pid, v]) => s.players[pid] && <span class="chip bet-chip pop" key={pid + v}><Avatar p={s.players[pid]} size={26} /> {fmtYen(v)}</span>)}
        </div>
      </div>
    );
  };
  return (
    <div class="overlay-center">
      <div class="panel bet-board pop">
        <h2>Ставки на дуэль!</h2>
        <div class="muted">Зрители ставят на телефонах: +100 или +500. Угадал — получишь вдвое.</div>
        <div class="bet-row">
          {side(d.attacker, 'атакует')}
          <div class="duel-vs">VS</div>
          {side(d.defender, 'защищается')}
        </div>
        <TimerBar start={st.deadline - (s.settings.betTime ?? 15) * 1000} end={st.deadline} now={now} big />
      </div>
    </div>
  );
}

/** находка: на ТВ только «что-то нашёл»; кицунэ — публично, со всеми подробностями */
export function FindPopup({ s }: { s: GameState }) {
  const st = s.stage;
  if (st.t !== 'find') return null;
  const p = s.players[st.pid];
  if (st.kind === 'kitsune') {
    const from = st.from ? s.players[st.from] : null;
    return (
      <div class="banner big">
        <div class="banner-inner find-banner kitsune pop">
          <div class="reward-icon"><PixIcon id="find_kitsune" size={120} /></div>
          <div class="banner-text">Кицунэ!</div>
          <div class="kitsune-row">
            {from && <span class="kitsune-who"><Avatar p={from} size={64} /> {from.name}</span>}
            <span class="kitsune-yen">−{fmtYen(st.amount ?? 0)} <PixIcon id="ui_right" size={32} /></span>
            {p && <span class="kitsune-who"><Avatar p={p} size={64} /> {p.name}</span>}
          </div>
          <div class="banner-sub">Лиса-проказница утащила деньги у лидера и отдала их {p?.name}</div>
        </div>
      </div>
    );
  }
  return (
    <div class="banner">
      <div class="banner-inner find-banner pop">
        <div class="reward-icon find-glint"><PixIcon id="find" size={96} /></div>
        {p && <Avatar p={p} size={80} />}
        <div class="banner-text">{p?.name} что-то нашёл под ногами!</div>
      </div>
    </div>
  );
}

/** итог дуэли: кража денег и выплаты по ставкам */
export function DuelSpoils({ s }: { s: GameState }) {
  const d = s.duel;
  if (!d?.over) return null;
  const w = d.winner ? s.players[d.winner] : null;
  const loser = d.winner ? s.players[d.winner === d.attacker ? d.defender : d.attacker] : null;
  const pays = Object.entries(d.payouts ?? {}).filter(([id]) => s.players[id]);
  return (
    <>
      {w && loser && !!d.stolen && <div class="banner-sub steal-line">Забирает {fmtYen(d.stolen)} у {loser.name}</div>}
      {pays.length > 0 && (
        <div class="pays">
          {pays.map(([id, v]) => (
            <span class={'chip pay ' + (v > 0 ? 'plus' : v < 0 ? 'minus' : '')}><Avatar p={s.players[id]} size={26} /> {v > 0 ? '+' : v < 0 ? '−' : '±'}{fmtYen(Math.abs(v))}</span>
          ))}
        </div>
      )}
    </>
  );
}
