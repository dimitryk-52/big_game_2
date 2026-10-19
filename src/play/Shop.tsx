import { useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player, Settings } from '../shared/types';
import { BONUS_INFO } from '../shared/settings';
import { sfx } from '../shared/sound';
import { fmtYen } from '../shared/util';
import { BonusIcon, PixIcon, TimerBar } from '../ui/common';

type Item = keyof Settings['shop'];

export function Shop({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const st = s.stage;
  if (st.t !== 'shop') return null;
  const timer = <TimerBar start={st.deadline - s.settings.shopTime * 1000} end={st.deadline} now={() => client.hostNow()} />;
  if (!st.entered) {
    return (
      <div class="pad col center-screen">
        <div class="shop-door pop"><PixIcon id="shop" size={96} /></div>
        <h2>Магазин!</h2>
        <div class="muted">Зайдёшь? Остальные увидят только, что ты в магазине.</div>
        {timer}
        <button class="btn yellow big-btn" onClick={() => client.pick('shop', 'enter')}>Зайти</button>
        <button class="btn big-btn" onClick={() => client.pick('shop', 'leave')}>Пройти мимо</button>
      </div>
    );
  }
  const shop = s.settings.shop;
  const topics = s.settings.topics.filter((t) => t.combat);
  const price = (c: { yen: number; stars: number }) => [c.yen ? `¥${c.yen}` : '', c.stars ? `${c.stars} ★` : ''].filter(Boolean).join(' + ') || 'бесплатно';
  const can = (c: { yen: number; stars: number }) => me.yen >= c.yen && me.stars >= c.stars;
  const buy = async (item: Item, topic?: string) => {
    setBusy(true);
    setMsg('');
    try {
      await client.req('buy', { item, topic });
      sfx.coin();
      setMsg('Куплено!');
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  const row = (item: Item, title: any, desc: string) => (
    <div class="shop-item">
      <div class="col" style={{ gap: 2, flex: 1 }}>
        <b>{title}</b>
        <span class="muted small-text">{desc}</span>
      </div>
      <button class="btn small yellow" disabled={busy || !can(shop[item])} onClick={() => buy(item)}>{price(shop[item])}</button>
    </div>
  );
  return (
    <div class="scroll pad col">
      <div class="row"><h3 class="grow" style={{ margin: '4px 0' }}>Магазин</h3><span class="muted">{fmtYen(me.yen)} · {me.stars} ★</span></div>
      {timer}
      {msg && <div class="status-card pop">{msg}</div>}
      {row('special', <><PixIcon id="special" size={18} /> Спецвопрос</>, `Можно задать в дуэли. Сила удара ${s.settings.specialPower}. Есть: ${me.specials}`)}
      {row('hp', `❤ +${shop.hp.amount} к макс. HP`, `Сейчас ${me.hp}/${me.maxHp}`)}
      <div class="shop-item col" style={{ alignItems: 'stretch' }}>
        <b>💪 +1 к силе темы</b>
        <span class="muted small-text">Цена: {price(shop.stat)}</span>
        <div class="row wrap">
          {topics.map((t) => (
            <button class="btn small" style={{ '--c': t.color } as any} disabled={busy || !can(shop.stat)} onClick={() => buy('stat', t.id)}>
              {t.name} ({me.stats[t.id]})
            </button>
          ))}
        </div>
      </div>
      {(['fifty1', 'fifty2', 'move2'] as const).map((b) => row(b, <><BonusIcon b={b} size={22} /> {BONUS_INFO[b].name}</>, `Есть: ${me.bonuses[b]}`))}
      <button class="btn primary big-btn" onClick={() => client.pick('shop', 'leave')}>Выйти из магазина</button>
    </div>
  );
}
