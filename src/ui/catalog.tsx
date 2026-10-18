// Каталог UI-кита (ui.html, только в npm run dev): все элементы интерфейса на настоящих стилях
// и компонентах игры. Стиль меняется в src/styles/kit.css — здесь сразу видно результат.
import './pxStyles';
import { render } from 'preact';
import '../styles/base.css';
import '../styles/tv.css';
import '../styles/play.css';
import '../styles/kit.css';
import { loadIcons, characterUrl, pixelBadgeUrl } from '../shared/sprites';
import { DEFAULT_SETTINGS } from '../shared/settings';
import type { Player } from '../shared/types';
import { Avatar, HpBar, LETTERS, PixIcon, PrefIntro, ResText, SkillChips, SkillIcon, SkillRow, TimerBar } from './common';
import { LOGO_URL } from '../shared/logo';

const topics = DEFAULT_SETTINGS.topics;
const combat = topics.filter((t) => t.combat);
const mk = (name: string, color: string, hat: number, extra: Partial<Player> = {}): Player => ({
  id: name, name, color, hat, pref: 13, hp: 7, maxHp: 10, yen: 1200, stars: 3,
  stats: { music: 3, culture: 1, geo: 2 }, calib: {}, bonuses: { fifty1: 1, fifty2: 0, move2: 1 }, specials: 1, prizes: [],
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
            <div class={'qans ' + k}><span class="qletter">{LETTERS[i]}</span><span>ТВ: {k || 'обычный'}</span></div>
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
          {combat.map((t, i) => <SkillRow t={t} value={i + 1} max={5} />)}
        </div>
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
          <div class="pc-skills">{combat.map((t) => <SkillRow t={t} value={A.stats[t.id]} max={5} />)}</div>
        </div>
        <div class="pcard current" style={{ '--frame': B.color, width: 300 } as any}>
          <div class="pc-top"><Avatar p={B} size={56} /><div class="pc-info"><div class="pc-name"><span class="pname">{B.name} — ходит</span></div><HpBar hp={B.hp} max={B.maxHp} /></div></div>
        </div>
      </Section>

      <Section title="Плашки">
        <span class="chip">Калибровка</span>
        <span class="chip">Комната ABCD</span>
        {combat.map((t) => <span class="chip" style={{ '--frame': t.color, color: t.color } as any}>{t.name}</span>)}
        <span class="chip special">💥 СПЕЦВОПРОС</span>
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
