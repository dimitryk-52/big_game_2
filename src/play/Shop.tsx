// Магазин: полки с товарами. На полке стоит значок товара, над ним — короткая подпись, под ним — ценник.
// Тап по товару — окошко покупки: описание, выбор темы (для силы и спецвопроса), кнопка «Купить».
// Картинки из src/img/shop/ (Nano Banana): shop_bg.png — стена лавки, shelf.png — доска полки.
// Пока их нет, стену и полки рисует CSS.
import { useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player, Settings } from '../shared/types';
import { BONUS_INFO } from '../shared/settings';
import { PREF } from '../map/mapData';
import { sfx } from '../shared/sound';
import { vibrate } from '../shared/util';
import { ratesOf, shopCost } from '../shared/economy';
import { BonusIcon, PixIcon, ResText, SkillIcon, TimerBar } from '../ui/common';
import { CARS, carName } from '../shared/cars';
import { priceYen } from '../shared/economy';

type Item = keyof Settings['shop'];

const art = import.meta.glob<string>('../img/shop/*.png', { eager: true, import: 'default', query: '?url' });
const artUrl = (name: string) => Object.entries(art).find(([p]) => p.endsWith('/' + name))?.[1];
const BG = artUrl('shop_bg.png');
const SHELF = artUrl('shelf.png');

/** порядок на полках: по три товара */
/** сапога в продаже больше нет — его заменили машины (полка «Автосалон») */
const SHELVES: Item[][] = [['special', 'stat', 'hp'], ['fifty1', 'fifty2', 'coin'], ['ticket', 'food', 'scroll']];

export function Shop({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const [carOpen, setCarOpen] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  const st = s.stage;
  if (st.t !== 'shop') return null;
  const timer = <TimerBar start={st.deadline - s.settings.shopTime * 1000} end={st.deadline} now={() => client.hostNow()} />;
  if (!st.entered) {
    return (
      <div class="pad col center-screen">
        <div class="shop-door pop">{st.noShop && st.dealer ? <PixIcon id={'car_' + st.dealer} size={78} /> : <PixIcon id="shop" size={96} />}</div>
        <h2>{st.noShop && st.dealer ? `Автосалон ${CARS[st.dealer].brand}!` : st.dealer ? 'Магазин и автосалон!' : 'Магазин!'}</h2>
        <div class="muted">Зайдёшь? Остальные увидят только, что ты {st.noShop ? 'в автосалоне' : 'в магазине'}.</div>
        {timer}
        <button class="btn yellow big-btn" onClick={() => client.pick('shop', 'enter')}>Зайти</button>
        <button class="btn big-btn" onClick={() => client.pick('shop', 'leave')}>Пройти мимо</button>
      </div>
    );
  }
  const shop = s.settings.shop;
  const combat = s.settings.topics.filter((t) => t.combat && t.id in me.stats);
  const specials = s.settings.topics.filter((t) => t.special);
  const stations = (s.settings.shinkansen ?? []).map((c) => PREF[c]?.ru).filter(Boolean).join(', ');
  // цены растут с эпохой; купон — −50% по йенам на одну покупку
  const coupon = (me.bonuses.coupon ?? 0) > 0;
  const price = (item: Item) => shopCost(s.settings, item, ratesOf(s), coupon && shop[item].yen > 0);
  const can = (c: { yen: number; stars: number }) => me.yen >= c.yen && me.stars >= c.stars;
  const needsTopic = (item: Item) => item === 'stat' || (item === 'special' && specials.length > 0);

  const info: Record<Item, { name: string; tag: string; desc: string; icon: any; have?: string }> = {
    special: {
      name: 'Спецвопрос', tag: 'спец', icon: <PixIcon id="special" size={44} />,
      desc: `Суперудар в дуэли: сила ${s.settings.specialPower}. Выбери спецтему — в дуэли задашь вопрос именно из неё.`,
      have: `Есть: ${me.specials}`,
    },
    stat: { name: '+1 к силе темы', tag: 'сила', icon: <PixIcon id="ui_up" size={44} />, desc: 'Сильнее бьёшь в дуэли, когда правильно отвечаешь на вопрос этой темы.' },
    hp: { name: `+${shop.hp.amount} к макс. HP`, tag: 'здоровье', icon: <PixIcon id="ui_heart" size={44} />, desc: `Больше здоровья в дуэлях. Сейчас ${me.hp}/${me.maxHp}.` },
    fifty1: { name: BONUS_INFO.fifty1.name, tag: '−1 ответ', icon: <BonusIcon b="fifty1" size={44} />, desc: 'Кнопка под вариантами ответа: убирает один неверный.', have: `Есть: ${me.bonuses.fifty1}` },
    fifty2: { name: BONUS_INFO.fifty2.name, tag: '50/50', icon: <BonusIcon b="fifty2" size={44} />, desc: 'Кнопка под вариантами ответа: убирает два неверных.', have: `Есть: ${me.bonuses.fifty2}` },
    move2: { name: BONUS_INFO.move2.name, tag: 'сапог', icon: <BonusIcon b="move2" size={44} />, desc: 'Один раз шагнуть через префектуру — сразу на две.', have: `Есть: ${me.bonuses.move2}` },
    coin: { name: BONUS_INFO.coin.name, tag: '+1 удар', icon: <BonusIcon b="coin" size={44} />, desc: 'В дуэли брось монетку на вопрос: если твой удар пройдёт, он сильнее на 1. Монетка тратится в любом случае.', have: `Есть: ${me.bonuses.coin ?? 0}` },
    // что это собачий корм, не говорим: игрок сам поймёт, когда окажется рядом с акитой
    food: { name: BONUS_INFO.food.name, tag: 'корм', icon: <BonusIcon b="food" size={44} />, desc: 'Пахнет вкусно. Кому-нибудь обязательно понравится — главное, оказаться рядом.', have: `Есть: ${me.bonuses.food ?? 0}` },
    ticket: { name: BONUS_INFO.ticket.name, tag: 'билет', icon: <BonusIcon b="ticket" size={44} />, desc: `Стоишь на станции синкансэна — в свой ход уезжаешь на любую другую станцию, где есть место. Станции: ${stations}.`, have: `Есть: ${me.bonuses.ticket ?? 0}` },
    scroll: { name: BONUS_INFO.scroll.name, tag: 'вызов', icon: <BonusIcon b="scroll" size={44} />, desc: '果たし状 — вызов на поединок. В свой ход вместо шага отправь свиток любому игроку на карте: дуэль начнётся прямо там, где вы стоите, и никто не сможет помешать. После дуэли ход окончен.', have: `Есть: ${me.bonuses.scroll ?? 0}` },
  };

  // автосалон: одна машина марки этой префектуры
  const dealer = st.dealer ?? null;
  const carYen = (() => { const y = priceYen(s.settings.car?.yen ?? 2000, ratesOf(s)); return coupon ? Math.round(y / 2 / 50) * 50 : y; })();
  const buyCar = async () => {
    setBusy(true);
    setMsg('');
    try {
      await client.req('buyCar', {});
      sfx.coin();
      vibrate([30, 40, 80]);
      setMsg(`Ключи твои: ${dealer ? carName(dealer) : 'машина'}!`);
      setCarOpen(false);
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };

  const buy = async (item: Item) => {
    if (needsTopic(item) && !topic) return;
    setBusy(true);
    setMsg('');
    try {
      await client.req('buy', { item, topic: needsTopic(item) ? topic : undefined });
      sfx.coin();
      vibrate(30);
      setMsg(`Куплено: ${info[item].name}`);
      setOpen(null);
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  const choose = (item: Item) => { setOpen(item); setTopic(null); setMsg(''); };

  return (
    <div class={'shop scroll' + (BG ? ' has-art' : '')} style={BG ? { backgroundImage: `url(${BG})` } : undefined}>
      {/* верх — на занавесе-норэн; полки начинаются под ним */}
      <div class="shop-top">
        <div class="shop-head">
          {!BG && <div class="shop-sign">店 Магазин</div>}
          {coupon && <span class="shop-wallet"><span class="chip">купон −50%</span></span>}
        </div>
        {/* на картинке — надпись прямо на занавесе, будто выкрашена на ткани */}
        {BG && <div class="shop-noren"><span>{st.noShop ? '車' : '店'}</span>{st.noShop ? 'АВТОСАЛОН' : 'МАГАЗИН'}</div>}
      </div>
      <div class="pad-x">{timer}</div>
      {msg && <div class="status-card pop shop-msg">{msg}</div>}
      {dealer && (
        <div class="shelf car-shelf">
          {/* витрина автосалона: светлый стенд на ширину полки, сверху вывеска марки, машина стоит на его полу */}
          <div class="showroom" />
          <div class="car-shelf-head"><PixIcon id={'emb_' + dealer} size={26} /><span>{CARS[dealer].brand}</span></div>
          <button class={'shelf-item car-item' + (me.yen >= carYen && me.car !== dealer ? '' : ' poor')} onClick={() => { setCarOpen(true); setMsg(''); }}>
            <span class="shelf-icon car-icon"><PixIcon id={'car_' + dealer} size={72} /></span>
            <span class="price-tag"><b>{CARS[dealer].model}</b><span>·</span><span>{me.car === dealer ? 'твоя' : `¥${carYen}`}</span></span>
          </button>
          <div class={'shelf-plank' + (SHELF ? ' art' : '')} style={SHELF ? { backgroundImage: `url(${SHELF})` } : undefined} />
        </div>
      )}
      {!st.noShop && SHELVES.map((row) => (
        <div class="shelf">
          <div class="shelf-items">
            {row.map((item) => {
              const c = price(item);
              const ok = can(c);
              return (
                <button class={'shelf-item' + (ok ? '' : ' poor')} onClick={() => choose(item)}>
                  <span class="shelf-icon">{info[item].icon}</span>
                  <span class="price-tag">
                    <b>{info[item].tag}</b><span>·</span>
                    {c.yen > 0 && <span>¥{c.yen}</span>}
                    {c.stars > 0 && <span>{c.stars}<PixIcon id="stars" size={14} /></span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div class={'shelf-plank' + (SHELF ? ' art' : '')} style={SHELF ? { backgroundImage: `url(${SHELF})` } : undefined} />
        </div>
      ))}
      <div class="pad-x"><button class="btn primary big-btn" onClick={() => client.pick('shop', 'leave')}>{st.noShop ? 'Выйти из автосалона' : 'Выйти из магазина'}</button></div>

      {carOpen && dealer && (
        <div class="sheet-back" onClick={() => setCarOpen(false)}>
          <div class="sheet pop" onClick={(e) => e.stopPropagation()}>
            <div class="car-sheet-art"><PixIcon id={'car_' + dealer} size={104} /></div>
            <div class="row"><PixIcon id={'emb_' + dealer} size={30} /><b class="grow">{carName(dealer)}</b></div>
            <div class="small-text">{CARS[dealer].note}</div>
            <div class="small-text">
              С машиной каждый ход можно ехать на <b>1 или 2</b> префектуры — сколько угодно раз.<br />
              Проиграешь <b>любую</b> дуэль — машины не станет (металлолом сдашь за монетку). Страховки нет.<br />
              Встретишь игрока на машине — вместо вопросов будет <b>гонка</b>.
              {me.car && me.car !== dealer && <><br />Твоя {carName(me.car)} уйдёт на металлолом за монетку.</>}
            </div>
            <button class="btn yellow big-btn" disabled={busy || me.yen < carYen || me.car === dealer} onClick={buyCar}>
              {me.car === dealer ? 'У тебя уже такая' : me.yen < carYen ? 'Не хватает' : <>Купить · ¥{carYen}</>}
            </button>
            <button class="btn small ghost" onClick={() => setCarOpen(false)}>Закрыть</button>
          </div>
        </div>
      )}

      {open && (
        <div class="sheet-back" onClick={() => setOpen(null)}>
          <div class="sheet pop" onClick={(e) => e.stopPropagation()}>
            <div class="row">
              <span class="sheet-icon">{info[open].icon}</span>
              <div class="col grow" style={{ gap: 2 }}>
                <b>{info[open].name}</b>
                {info[open].have && <span class="muted small-text">{info[open].have}</span>}
              </div>
            </div>
            <div class="small-text">{info[open].desc}</div>
            {open === 'stat' && (
              <div class="topic-grid">
                {combat.map((t) => (
                  <button class={'btn small' + (topic === t.id ? ' picked' : '')} style={{ '--c': t.color } as any} onClick={() => setTopic(t.id)}>
                    <SkillIcon t={t} size={20} /> {t.name} <b>{me.stats[t.id] ?? 0}</b>
                  </button>
                ))}
              </div>
            )}
            {open === 'special' && specials.length > 0 && (
              <div class="topic-grid">
                {specials.map((t) => (
                  <button class={'btn small rainbow' + (topic === t.id ? ' picked' : '')} onClick={() => setTopic(t.id)}>
                    <SkillIcon t={t} size={20} /> {t.name}
                    {(me.specialTopics ?? []).filter((x) => x === t.id).length > 0 && <span class="muted"> ×{(me.specialTopics ?? []).filter((x) => x === t.id).length}</span>}
                  </button>
                ))}
              </div>
            )}
            <button class="btn yellow big-btn" disabled={busy || !can(price(open)) || (needsTopic(open) && !topic)} onClick={() => buy(open)}>
              {!can(price(open)) ? 'Не хватает' : needsTopic(open) && !topic ? 'Выбери тему' : <>Купить · <ResText text={[price(open).yen ? `¥${price(open).yen}` : '', price(open).stars ? `${price(open).stars} ★` : ''].filter(Boolean).join(' + ')} size={16} /></>}
            </button>
            <button class="btn small ghost" onClick={() => setOpen(null)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}
