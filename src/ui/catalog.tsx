// Каталог UI-кита (ui.html, только в npm run dev): все элементы интерфейса на настоящих стилях
// и компонентах игры. Стиль меняется в src/styles/kit.css — здесь сразу видно результат.
import './pxStyles';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import '../styles/base.css';
import '../styles/tv.css';
import '../styles/play.css';
import '../styles/kit.css';
import { loadIcons, characterUrl, pixelBadgeUrl, pixelIconUrl, topicIconUrl, SPECIAL_TOPIC } from '../shared/sprites';
import { Wheel, makeSpin, wheelLabel, wheelRot, type WheelSeg, type WheelSpin } from './Wheel';
import { DEFAULT_SETTINGS } from '../shared/settings';
import type { Player } from '../shared/types';
import { Avatar, HpBar, LETTERS, PixIcon, PrefIntro, ResText, SkillChips, SkillIcon, TimerBar, useFrame, PixelImg } from './common';
import { LOGO_TEXT_URL, LOGO_URL } from '../shared/logo';

const topics = DEFAULT_SETTINGS.topics;
const combat = topics.filter((t) => t.combat);
const mk = (name: string, color: string, hat: number, extra: Partial<Player> = {}): Player => ({
  id: name, name, color, hat, pref: 13, hp: 7, maxHp: 10, yen: 1200, stars: 3,
  stats: { music: 3, culture: 1, geo: 2 }, calib: {}, bonuses: { fifty1: 1, fifty2: 0, move2: 1, turn2: 1 }, specials: 1, prizes: [],
  online: true, busy: null, ...extra,
});
const A = mk('Дима', '#4dabff', 0);
const B = mk('Тануки', '#ff4d6d', 2, { hp: 2 });
const start = Date.now();
const now = () => start + ((Date.now() - start) % 15000);
const ICONS = ['money', 'stars', 'bonus', 'special', 'prize', 'pachinko', 'ring'];
const HAT_COLORS = ['#ff4d6d', '#4dabff', '#ffd23f', '#5ce16b', '#c77dff'];

function Section({ title, note, children }: { title: string; note?: string; children: any }) {
  return (
    <section class="ui-sec">
      <h2>{title}</h2>
      {note && <div class="muted ui-note">{note}</div>}
      <div class="ui-row">{children}</div>
    </section>
  );
}
const Label = ({ t }: { t: string }) => <div class="ui-label">{t}</div>;

// ───── барабан: примеры секторов (иконки строятся после loadIcons) ─────
function bonusSegs(): WheelSeg[] {
  return [
    { id: 'money', label: '¥300', short: '¥300', color: '#3cb54a', icon: pixelIconUrl('money', 4) },
    { id: 'fifty1', label: 'Убрать 1 неверный ответ', short: '−1', color: '#4a55a8', icon: pixelIconUrl('bonus_fifty1', 4) },
    { id: 'stars', label: '+1 ★', color: '#f2b51f', icon: pixelIconUrl('stars', 4) },
    { id: 'move2', label: 'Ход на 2 префектуры', short: '×2', color: '#ff9f43', icon: pixelIconUrl('bonus_move2', 4) },
    { id: 'turn2', label: 'Дополнительный ход', short: '↻', color: '#2fa23f', weight: 0.6, icon: pixelIconUrl('bonus_turn2', 4) },
    { id: 'special', label: 'Спецвопрос', color: '#ffffff', rainbow: true, weight: 0.6, icon: topicIconUrl('special', '#fff', 4) },
    { id: 'fifty2', label: '50/50', short: '50/50', color: '#2e7fd6', weight: 0.8, icon: pixelIconUrl('bonus_fifty2', 4) },
    { id: 'hp', label: '+2 HP', short: '+2♥', color: '#e8364e' },
    { id: 'none', label: 'Мимо!', short: '✕', color: '#5b5f7e' },
  ];
}
function topicSegs(): WheelSeg[] {
  const seg = (t: (typeof combat)[number]): WheelSeg => ({ id: t.id, label: t.name, color: t.color, icon: topicIconUrl(t.id, t.color, 4) });
  return [...combat.map(seg), { id: 'special', label: 'Спецтема!', color: '#fff', rainbow: true, icon: topicIconUrl('special', '#fff', 4) }, ...combat.map(seg)];
}

function WheelDemo({ title, segs }: { title: string; segs: WheelSeg[] }) {
  const [spin, setSpin] = useState<WheelSpin | null>(null);
  useFrame(true);
  const t = Date.now();
  const busy = !!spin && !wheelRot(segs, spin, t).done && t >= spin.startAt;
  const lab = wheelLabel(segs, spin, t);
  return (
    <div class="wheel-box panel" style={{ padding: 16 }}>
      <b>{title}</b>
      <Wheel segs={segs} spin={spin} now={Date.now} size={380} sound />
      <div class={'wheel-label' + (lab.done ? ' done' : '')}>{lab.text}</div>
      <button class="btn primary" disabled={busy} onClick={() => setSpin(makeSpin(segs, Date.now() + 100, spin ? wheelRot(segs, spin, Date.now()).rot : 0))}>Крутить</button>
    </div>
  );
}

function Catalog() {
  return (
    <div class="ui-page">
      <header class="ui-head">
        {LOGO_URL && <img src={LOGO_URL} alt="" height={90} />}
        <div>
          <h1>UI-кит BIG GAME 2</h1>
          <div class="muted">Все элементы интерфейса в одном месте. Стиль — src/styles/kit.css, иконки — src/img/icons/*.png.</div>
        </div>
      </header>

      <Section title="Кнопки" note="Контур в пиксель, срезанные углы, светлая полоса сверху и тёмная снизу. Цвет задаётся переменной --c.">
        <button class="btn">Обычная</button>
        <button class="btn primary">Главная</button>
        <button class="btn yellow">Жёлтая</button>
        <button class="btn green">Зелёная</button>
        <button class="btn ghost">Тихая</button>
        <button class="btn" disabled>Недоступна</button>
        <button class="btn small">Маленькая</button>
        <button class="btn small primary">▶ Далее</button>
        {combat.map((t) => <button class="btn" style={{ '--c': t.color } as any}><SkillIcon t={t} size={22} /> {t.name}</button>)}
      </Section>

      <Section title="Ответы на вопрос" note="Телефон (q-btn) и ТВ (qans): обычный, выбранный, верный, неверный.">
        <div class="ui-col" style={{ width: 360 }}>
          {['', 'chosen', 'correct', 'wrong'].map((k, i) => (
            <button class={'q-btn ' + k}><span class="qletter">{LETTERS[i]}</span><span>Телефон: {k || 'обычный'}</span></button>
          ))}
        </div>
        <div class="ui-col" style={{ width: 420 }}>
          {['', 'correct', 'wrong', 'dim'].map((k, i) => (
            <div class={'qans ' + k}><span>ТВ: {k || 'обычный'}</span></div>
          ))}
        </div>
      </Section>

      <Section title="Полоски" note="Время, здоровье, сила по темам.">
        <div class="ui-col" style={{ width: 360 }}>
          <Label t="Таймер" /><TimerBar start={start} end={start + 15000} now={now} />
          <Label t="Таймер большой (ТВ)" /><TimerBar start={start} end={start + 15000} now={now} big />
          <Label t="HP" /><HpBar hp={7} max={10} />
          <Label t="HP мало (мигает)" /><HpBar hp={2} max={10} />
          <Label t="Скиллы" />
          <SkillChips topics={combat} stats={Object.fromEntries(combat.map((t, i) => [t.id, i + 1]))} size={22} grid />
        </div>
      </Section>

      {LOGO_TEXT_URL && (
        <Section title="Надпись в углу ТВ" note="logo_text_px.png через PixelImg: целое число точек экрана на пиксель — линии не ломаются при масштабе Windows 125–150% и зуме браузера.">
          <div class="ui-icon" style={{ background: '#a9c8e6' }}><PixelImg src={LOGO_TEXT_URL} /><div class="ui-label">×1</div></div>
          <div class="ui-icon" style={{ background: '#a9c8e6' }}><PixelImg src={LOGO_TEXT_URL} scale={2} /><div class="ui-label">×2</div></div>
        </Section>
      )}

      <Section title="Барабан" note="Хост выбирает сектор заранее (makeSpin) и рассылает время старта — все экраны останавливаются на одном секторе. Размер сектора = шанс выпасть (weight). Радужный сектор — спецтема.">
        <WheelDemo title="Бонус игроку" segs={bonusSegs()} />
        <WheelDemo title="Тема вопроса" segs={topicSegs()} />
      </Section>

      <Section title="Спецтема" note="Иконка — круг с радужным градиентом (своя картинка: src/img/icons/topic_special.png). Рамка .rainbow — у спецвопроса при выборе темы в дуэли.">
        <div class="ui-icon"><SkillIcon t={SPECIAL_TOPIC as any} size={48} /><div class="ui-label">topic_special</div></div>
        <div class="panel ui-col" style={{ width: 380, padding: 14 }}>
          <b>Дуэль! Твой вопрос</b>
          {combat.map((t) => (
            <button class="btn big-btn" style={{ '--c': t.color } as any}><SkillIcon t={t} size={24} /> <span class="grow" style={{ textAlign: 'left' }}>{t.name}</span> <b>{A.stats[t.id]}</b> <span class="muted">против</span> <b>{B.stats[t.id]}</b></button>
          ))}
          <button class="btn big-btn rainbow"><SkillIcon t={SPECIAL_TOPIC as any} size={24} /> <span class="grow" style={{ textAlign: 'left' }}>Спецвопрос</span> <b>сила 5</b> <span class="muted">· осталось 1</span></button>
        </div>
        <span class="chip rainbow">Спецтема</span>
      </Section>

      <Section title="Панели и карточки">
        <div class="panel" style={{ width: 280 }}><b>Панель</b><div class="muted">Обычный контейнер (.panel)</div></div>
        <div class="status-card" style={{ width: 280 }}>Статус-карточка телефона</div>
        <div class="pcard" style={{ '--frame': A.color, width: 300 } as any}>
          <div class="pc-top">
            <Avatar p={A} size={56} />
            <div class="pc-info">
              <div class="pc-name"><span class="pname">{A.name}</span><span class="dot on" /></div>
              <HpBar hp={A.hp} max={A.maxHp} />
              <div class="pc-money"><span>¥1 200</span><span class="pc-stars"><PixIcon id="stars" size={18} />3</span></div>
            </div>
          </div>
          <SkillChips topics={combat} stats={A.stats} size={20} grid />
        </div>
        <div class="pcard current" style={{ '--frame': B.color, width: 300 } as any}>
          <div class="pc-top"><Avatar p={B} size={56} /><div class="pc-info"><div class="pc-name"><span class="pname">{B.name} — ходит</span></div><HpBar hp={B.hp} max={B.maxHp} /></div></div>
        </div>
      </Section>

      <Section title="Плашки">
        <span class="chip">Калибровка</span>
        <span class="chip">Комната ABCD</span>
        {combat.map((t) => <span class="chip" style={{ '--frame': t.color, color: t.color } as any}>{t.name}</span>)}
        <span class="chip special"><PixIcon id="special" size={18} /> СПЕЦВОПРОС</span>
        <div class="qpart waiting"><Avatar p={A} size={36} /><span>не ответил</span></div>
        <div class="qpart done"><Avatar p={A} size={36} /><span>ответил</span></div>
        <div class="qpart done ok"><Avatar p={A} size={36} /><span>верно</span><span class="qres"><ResText text="+1 {skill:music}" topics={topics} /></span></div>
        <div class="qpart done bad"><Avatar p={B} size={36} /><span>неверно</span></div>
      </Section>

      <Section title="Иконки" note="PNG из src/img/icons — контур и тень добавляет игра.">
        {ICONS.map((id) => <div class="ui-icon"><PixIcon id={id} size={48} /><div class="ui-label">{id}</div></div>)}
        {topics.map((t) => <div class="ui-icon"><SkillIcon t={t} size={44} /><div class="ui-label">topic_{t.id}</div></div>)}
      </Section>

      <Section title="Награды на карте" note="Награда — кремовая выноска (покачивается, пропадает, когда забрали). Автомат — голубая, неподвижная, остаётся всегда.">
        {ICONS.slice(0, 5).map((id) => <div class="ui-icon"><img class="pix-icon" src={pixelBadgeUrl(id, 4)} alt="" /><div class="ui-label">{id}</div></div>)}
        {ICONS.slice(5).map((id) => <div class="ui-icon"><img class="pix-icon" src={pixelBadgeUrl(id, 4, 'machine')} alt="" /><div class="ui-label">{id} (автомат)</div></div>)}
      </Section>

      <Section title="Персонажи" note="Пока рисуются кодом: src/shared/sprites.ts (BASE, HATS).">
        {HAT_COLORS.map((c, h) => <img class="avatar" src={characterUrl(c, h, 4)} width={72} height={96} />)}
        <SkillChips topics={combat} stats={A.stats} size={20} />
      </Section>

      <Section title="Сообщения на ТВ">
        <div class="banner-inner"><div class="banner-text">Ход: Дима</div><div class="banner-sub">Круг 2 · Токио</div></div>
        <div class="banner-inner"><div class="reward-icon"><PixIcon id="stars" size={72} /></div><div class="banner-text">+2 ★</div></div>
        <div class="prompt" style={{ position: 'static', transform: 'none' }}><Avatar p={A} size={40} /> <b>Дима</b> выбирает, куда идти</div>
      </Section>

      <Section title="Интро префектуры">
        <div class="ui-intro"><PrefIntro code={13} who={A} reward="stars" /></div>
        <div class="ui-intro"><PrefIntro code={46} who={B} reward="money" /></div>
      </Section>

      <Section title="Поля ввода">
        <input class="inp" placeholder="Твоё имя" style={{ width: 280 }} />
        <input class="inp big" value="ABCD" style={{ width: 200 }} />
      </Section>
    </div>
  );
}

void loadIcons().then(() => render(<Catalog />, document.getElementById('app')!));
