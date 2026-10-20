// Магазин: полки с товарами. На полке стоит значок товара, над ним — короткая подпись, под ним — ценник.
// Тап по товару — окошко покупки: описание, выбор темы (для силы и спецвопроса), кнопка «Купить».
// Картинки из src/img/shop/ (Nano Banana): shop_bg.png — стена лавки, shop_shelf.png — доска полки.
// Пока их нет, стену и полки рисует CSS.
import { useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player, Settings } from '../shared/types';
import { BONUS_INFO } from '../shared/settings';
import { sfx } from '../shared/sound';
import { fmtYen, vibrate } from '../shared/util';
import { BonusIcon, PixIcon, ResText, SkillIcon, TimerBar } from '../ui/common';

type Item = keyof Settings['shop'];

const art = import.meta.glob<string>('../img/shop/*.png', { eager: true, import: 'default', query: '?url' });
const artUrl = (name: string) => Object.entries(art).find(([p]) => p.endsWith('/' + name))?.[1];
const BG = artUrl('shop_bg.png');
const SHELF = artUrl('shop_shelf.png') ?? artUrl('shelf.png');

/** порядок на полках: по три товара */
const SHELVES: Item[][] = [['special', 'stat', 'hp'], ['fifty1', 'fifty2', 'move2']];

export function Shop({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
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
  const combat = s.settings.topics.filter((t) => t.combat && t.id in me.stats);
  const specials = s.settings.topics.filter((t) => t.special);
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
      <div class="shop-head">
        <div class="shop-sign">店 Магазин</div>
        <span class="shop-wallet">{fmtYen(me.yen)} · {me.stars} <PixIcon id="stars" size={16} /></span>
      </div>
      <div class="pad-x">{timer}</div>
      {msg && <div class="status-card pop shop-msg">{msg}</div>}
      {SHELVES.map((row) => (
        <div class="shelf">
          <div class="shelf-items">
            {row.map((item) => {
              const c = shop[item];
              const ok = can(c);
              return (
                <button class={'shelf-item' + (ok ? '' : ' poor')} onClick={() => choose(item)}>
                  <span class="shelf-tag">{info[item].tag}</span>
                  <span class="shelf-icon">{info[item].icon}</span>
                  <span class="price-tag">
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
      <div class="pad-x"><button class="btn primary big-btn" onClick={() => client.pick('shop', 'leave')}>Выйти из магазина</button></div>

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
            <button class="btn yellow big-btn" disabled={busy || !can(shop[open]) || (needsTopic(open) && !topic)} onClick={() => buy(open)}>
              {!can(shop[open]) ? 'Не хватает' : needsTopic(open) && !topic ? 'Выбери тему' : <>Купить · <ResText text={[shop[open].yen ? `¥${shop[open].yen}` : '', shop[open].stars ? `${shop[open].stars} ★` : ''].filter(Boolean).join(' + ')} size={16} /></>}
            </button>
            <button class="btn small ghost" onClick={() => setOpen(null)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}
