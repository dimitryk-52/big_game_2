import '../ui/pxStyles';
import { render } from 'preact';
import { loadIcons } from '../shared/sprites';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import '../styles/base.css';
import '../styles/admin.css';
import '../styles/kit.css';
import type { GameMsg, GameState, Question, RewardType, Settings } from '../shared/types';
import { getStore } from '../shared/store';
import { SEED_QUESTIONS } from '../shared/seedQuestions';
import { PREFS, PREF } from '../map/mapData';
import { GroupPick } from './TaskPick';
import { DEFAULT_SETTINGS, REWARD_INFO, isSpecialQ, withRecommendedLayout } from '../shared/settings';
import { createTransport, netMode, type Transport } from '../shared/net';
import { Avatar, PixIcon, SkillIcon } from '../ui/common';
import { Topics } from './Topics';
import { Questions } from './Questions';
import { GroupEditor } from './GroupEditor';
import { PrefMap } from './PrefMap';
import { IntrosTab, SoundsTab } from './Sounds';
import { fmtYen, uid } from '../shared/util';
import { DEFAULT_TOKENS, EPOCHS, PRIZE_TIERS, TIER_INFO, epochOf, epochRatesFor, fmtMul, tokensFor } from '../shared/economy';

type Tab = 'questions' | 'topics' | 'group' | 'prefs' | 'map' | 'sounds' | 'intros' | 'settings' | 'remote';

function App() {
  const [tab, setTab] = useState<Tab>('questions');
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [err, setErr] = useState('');
  /** «+ вопрос» с вкладки тем: открыть редактор вопроса этой темы */
  const [newIn, setNewIn] = useState<{ topic: string; n: number } | null>(null);
  const store = getStore();
  const reload = async () => {
    try {
      const [q, s] = await Promise.all([store.loadQuestions(), store.loadSettings()]);
      setQuestions(q);
      setSettings(s);
    } catch (e: any) { setErr(String(e.message ?? e)); }
  };
  useEffect(() => { void reload(); }, []);
  return (
    <div class="admin">
      <header class="admin-hdr">
        <b>BIG GAME 2 · ведущий</b>
        <nav>
          {([['questions', 'Вопросы'], ['topics', 'Темы'], ['group', 'Групповые игры'], ['prefs', 'Префектуры'], ['map', 'Карта'], ['sounds', '🔊 Звуки'], ['intros', '🎬 Интро'], ['settings', 'Настройки'], ['remote', 'Пульт']] as [Tab, string][]).map(([k, l]) => (
            <button class={'btn small' + (tab === k ? ' yellow' : '')} onClick={() => setTab(k)}>{l}</button>
          ))}
          <a class="btn small ghost" href="ui.html" target="_blank" title="Все элементы интерфейса: кнопки, барабан, иконки">UI-кит ↗</a>
          <a class="btn small ghost" href="tv.html" target="_blank">ТВ ↗</a>
        </nav>
        <span class="muted small">данные: {store.kind} · сеть: {netMode()}</span>
      </header>
      {err && <div class="warn">{err}</div>}
      {!questions || !settings ? <div class="pad">Загрузка…</div> : (
        <>
          {tab === 'questions' && <Questions questions={questions} settings={settings} onChange={reload} newIn={newIn} />}
          {tab === 'topics' && <Topics settings={settings} questions={questions} onSave={async (s) => { await store.saveSettings(s); setSettings(s); }} onAddQuestion={(topic) => { setNewIn({ topic, n: Date.now() }); setTab('questions'); }} />}
          {tab === 'group' && <GroupEditor settings={settings} onSave={async (s) => { await store.saveSettings(s); setSettings(s); }} />}
          {tab === 'prefs' && <Prefs settings={settings} questions={questions} onSave={async (s) => { await store.saveSettings(s); setSettings(s); }} />}
          {tab === 'map' && <PrefMap settings={settings} questions={questions} onSave={async (s) => { await store.saveSettings(s); setSettings(s); }} />}
          {tab === 'settings' && <SettingsEditor settings={settings} onSave={async (s) => { await store.saveSettings(s); setSettings(s); }} />}
          {tab === 'sounds' && <SoundsTab />}
          {tab === 'intros' && <IntrosTab settings={settings} />}
          {tab === 'remote' && <Remote settings={settings} onSave={async (s) => { await store.saveSettings(s); setSettings(s); }} />}
        </>
      )}
    </div>
  );
}

// ───────── префектуры ─────────

function Prefs({ settings, questions, onSave }: { settings: Settings; questions: Question[]; onSave: (s: Settings) => Promise<void> }) {
  const [s, setS] = useState(settings);
  const [saved, setSaved] = useState(false);
  const qCount = (code: number) => questions.filter((q) => q.pref === code).length;
  const toggle = (list: number[] | undefined, code: number) => ((list ?? []).includes(code) ? list!.filter((x) => x !== code) : [...(list ?? []), code]);
  return (
    <div class="pad col">
      <div class="note">Награда за правильный ответ ходящего игрока. «Авто» — случайно при старте игры. Приз — физический подарок, выдаётся один раз, потом префектура даёт йены. Порядок в префектуре: вопрос (или дуэль, если там уже кто-то стоит) → магазин → групповая игра. Групповая игра — один раз за игру, при первом приходе: ход заканчивается, и играют все. Соло-игры (пачинко, призовая машина, онсэн, чо-хан, судоку) доступны на телефоне, пока игрок стоит в префектуре; онсэн лечит. На магазин и групповую игру нельзя высадиться.</div>
      <div class="row">
        <button class="btn primary small" onClick={async () => { await onSave(s); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>{saved ? '✔ Сохранено' : 'Сохранить'}</button>
        <button class="btn small" title="Пачинко, призовая машина, онсэн, чо-хан, судоку и групповые игры — по тематике префектур, по одной на префектуру; каждое задание групповой игры — в своей префектуре; магазины — не на соло-играх (два шага между магазинами). Награды не меняются." onClick={() => {
          if (confirm('Расставить соло-игры, групповые игры, их задания и магазины по рекомендуемой раскладке? Награды останутся как есть. Потом нажми «Сохранить».')) setS(withRecommendedLayout(s));
        }}>🗾 Рекомендуемая раскладка игр</button>
      </div>
      <table class="qtable">
        <thead><tr><th>#</th><th>Префектура</th><th>Награда</th><th><PixIcon id="pachinko" size={16} /> Пачинко</th><th><PixIcon id="ring" size={16} /> Призовая машина</th><th><PixIcon id="onsen" size={16} /> Онсэн</th><th><PixIcon id="chohan" size={16} /> Чо-хан</th><th><PixIcon id="sudoku" size={16} /> Судоку</th><th><PixIcon id="shop" size={16} /> Магазин</th><th title="Станция синкансэна: с билетом отсюда можно уехать на любую другую станцию"><PixIcon id="bonus_ticket" size={16} /> Синкансэн</th><th>Групповая игра (номер задания)</th><th>Своих вопросов</th></tr></thead>
        <tbody>
          {PREFS.map((p) => (
            <tr>
              <td>{p.code}</td>
              <td>{p.ru} <span class="muted">{p.ja}</span></td>
              <td>
                <select value={s.prefRewards[p.code] ?? ''} onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value as RewardType | '';
                  const pr = { ...s.prefRewards };
                  if (v) pr[p.code] = v; else delete pr[p.code];
                  setS({ ...s, prefRewards: pr });
                }}>
                  <option value="">Авто</option>
                  {(Object.keys(REWARD_INFO) as RewardType[]).map((r) => <option value={r}>{REWARD_INFO[r].icon} {REWARD_INFO[r].name}</option>)}
                </select>
              </td>
              <td><input type="checkbox" checked={s.pachinkoPrefs.includes(p.code)} onChange={() => setS({ ...s, pachinkoPrefs: toggle(s.pachinkoPrefs, p.code) })} /></td>
              <td><input type="checkbox" checked={s.ringPrefs.includes(p.code)} onChange={() => setS({ ...s, ringPrefs: toggle(s.ringPrefs, p.code) })} /></td>
              <td><input type="checkbox" checked={(s.onsenPrefs ?? []).includes(p.code)} onChange={() => setS({ ...s, onsenPrefs: toggle(s.onsenPrefs ?? [], p.code) })} /></td>
              <td><input type="checkbox" checked={(s.chohanPrefs ?? []).includes(p.code)} onChange={() => setS({ ...s, chohanPrefs: toggle(s.chohanPrefs ?? [], p.code) })} /></td>
              <td><input type="checkbox" checked={(s.sudokuPrefs ?? []).includes(p.code)} onChange={() => setS({ ...s, sudokuPrefs: toggle(s.sudokuPrefs ?? [], p.code) })} /></td>
              <td><input type="checkbox" checked={s.shopPrefs.includes(p.code)} onChange={() => setS({ ...s, shopPrefs: toggle(s.shopPrefs, p.code) })} /></td>
              <td><input type="checkbox" checked={(s.shinkansen ?? []).includes(p.code)} onChange={() => setS({ ...s, shinkansen: toggle(s.shinkansen, p.code) })} /></td>
              <td><GroupPick s={s} code={p.code} setS={setS} /></td>
              <td class={qCount(p.code) ? '' : 'muted'}>{qCount(p.code)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────── настройки ─────────

const NUM_FIELDS: [string, string][] = [
  ['calibRounds', 'Кругов калибровки'],
  ['sumo.misses', 'Сумо: сколько пропущенных ударов средней силы до края'],
  ['sumo.grace', 'Сумо: кругов без вылетов'],
  ['sumo.rampFrom', 'Сумо: с какого круга толчки усиливаются'],
  ['sumo.ramp', 'Сумо: усиление за круг (0.25 = +25%)'],
  ['sumo.mult', 'Сумо: множитель наград групповой лестницы'],
  ['questionTime', 'Время на вопрос, сек'],
  ['duelTime', 'Время на вопрос в дуэли, сек'],
  ['bonusTime', 'Время на выбор бонуса, сек'],
  ['pickTime', 'Время на выбор темы в дуэли, сек'],
  ['landingTime', 'Время на высадку, сек'],
  ['revealMs', 'Показ ответа, мс'],
  ['shopTime', 'Время в магазине, сек'],
  ['soloCooldown', 'Денежные мини-игры (пачинко, кольцо, чо-хан, судоку): снова через N своих ходов'],
  ['baseStrength', 'Базовая сила темы'],
  ['startHp', 'Стартовое HP'],
  ['specialPower', 'Сила спецвопроса'],
  ['duelRounds', 'Раундов в дуэли'],
  ['audioLatencyMs', 'Задержка звука ТВ (ритм), мс'],
  ['reward.moverCorrectYen', 'Ходящий: верно, ¥'],
  ['reward.moverCorrectStars', 'Ходящий: верно, ★'],
  ['reward.moverWrongYen', 'Ходящий: неверно, ¥'],
  ['reward.otherCorrectYen', 'Остальные: верно, ¥'],
  ['reward.calibCorrectYen', 'Калибровка: верно, ¥'],
  ['reward.prefMoney', 'Награда «йены», ¥'],
  ['reward.prefStars', 'Награда «звёзды», ★'],
  ['reward.reviveYen', 'Воскрешение: верно, ¥'],
  ['reward.duelWinYen', 'Победа в дуэли нокаутом, ¥ (растёт с эпохой)'],
  ['reward.duelWinStars', 'Победа в дуэли нокаутом, ★'],
  ['reward.duelStealPct', 'Победитель дуэли забирает у проигравшего, % денег'],
  ['betTime', 'Время на ставки зрителей перед дуэлью, сек'],
  ['shop.special.stars', 'Магазин: спецвопрос, ★'],
  ['shop.special.yen', 'Магазин: спецвопрос, ¥'],
  ['shop.hp.yen', 'Магазин: +HP, ¥'],
  ['shop.hp.amount', 'Магазин: сколько HP'],
  ['shop.stat.yen', 'Магазин: +1 сила, ¥'],
  ['shop.stat.stars', 'Магазин: +1 сила, ★'],
  ['shop.fifty1.yen', 'Магазин: −1 ответ, ¥'],
  ['shop.fifty2.yen', 'Магазин: 50/50, ¥'],
  ['car.yen', 'Автосалон: машина (ход на 1–2 префектуры), ¥'],
  ['shop.coin.yen', 'Магазин: монета (+1 удар), ¥'],
  ['shop.food.yen', 'Магазин: корм (переманить акиту у соседа), ¥'],
  ['shop.scroll.yen', 'Магазин: свиток-вызов (дуэль с любым игроком вместо хода), ¥'],
  ['shop.ticket.yen', 'Магазин: билет на синкансэн, ¥'],
  ['pachinko.yenPerBall', 'Пачинко: ¥ за шарик'],
  ['pachinko.pack', 'Пачинко: шариков в пачке'],
  ['ring.cost', 'Призовая машина: цена, ¥'],
  ['ring.cellMs', 'Призовая машина: мс на ячейку (меньше — быстрее)'],
  ['sudoku.rewards.0.yen', 'Судоку 4×4: награда, ¥'],
  ['sudoku.rewards.0.stars', 'Судоку 4×4: награда, ★'],
  ['sudoku.rewards.1.yen', 'Судоку 6×6: награда, ¥'],
  ['sudoku.rewards.1.stars', 'Судоку 6×6: награда, ★'],
  ['sudoku.rewards.2.yen', 'Судоку 9×9: награда, ¥'],
  ['sudoku.rewards.2.stars', 'Судоку 9×9: награда, ★'],
  ['sudoku.givens9', 'Судоку 9×9: открытых цифр (обычно 25–30, у нас проще)'],
];
const getPath = (o: any, p: string) => p.split('.').reduce((a, k) => a?.[k], o);
const setPath = (o: any, p: string, v: any) => {
  const ks = p.split('.');
  const last = ks.pop()!;
  ks.reduce((a, k) => a[k], o)[last] = v;
};

function SettingsEditor({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => Promise<void> }) {
  const [s, setS] = useState<Settings>(structuredClone(settings));
  const [saved, setSaved] = useState(false);
  const upd = (fn: (x: Settings) => void) => { const c = structuredClone(s); fn(c); setS(c); };
  return (
    <div class="pad col" style={{ maxWidth: 900 }}>
      <div class="row">
        <button class="btn primary small" onClick={async () => { await onSave(s); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>{saved ? '✔ Сохранено' : 'Сохранить'}</button>
        <button class="btn small" onClick={() => { if (confirm('Сбросить все настройки к стандартным?')) setS(structuredClone(DEFAULT_SETTINGS)); }}>Сбросить</button>
        <span class="muted small">Изменения применяются к новой игре или после кнопки «Обновить настройки в игре» на пульте.</span>
      </div>
      <div class="settings-grid">
        {NUM_FIELDS.map(([path, label]) => (
          <label class="set-row">
            <span>{label}</span>
            <input class="inp-s num" type="number" value={getPath(s, path)} onInput={(e) => upd((c) => setPath(c, path, Number((e.target as HTMLInputElement).value)))} />
          </label>
        ))}
        <label class="set-row"><span>Вопрос ведёт ведущий кнопкой «Далее» (интро → текст → ответы и таймер → закрыть)</span><input type="checkbox" checked={s.hostPaced !== false} onChange={(e) => upd((c) => (c.hostPaced = (e.target as HTMLInputElement).checked))} /></label>
        <label class="set-row"><span>Авто-переход после показа ответа</span><input type="checkbox" checked={s.autoAdvance} onChange={(e) => upd((c) => (c.autoAdvance = (e.target as HTMLInputElement).checked))} /></label>
        <label class="set-row"><span>Ритм-баттл в дуэлях</span><input type="checkbox" checked={s.rhythmInDuel} onChange={(e) => upd((c) => (c.rhythmInDuel = (e.target as HTMLInputElement).checked))} /></label>
        <label class="set-row"><span>Чо-хан: ставки, ¥ (через запятую)</span><input class="inp-s" value={(s.chohan?.bets ?? []).join(', ')} onChange={(e) => upd((c) => (c.chohan = { ...c.chohan, bets: (e.target as HTMLInputElement).value.split(/[,\s]+/).map(Number).filter((x) => x > 0) }))} /></label>
      </div>
      <div class="note">Темы и спецтемы игроков — на вкладке «Темы».</div>
      <h3>Названия призов</h3>
      <textarea rows={4} value={s.prizeNames.join('\n')} onInput={(e) => upd((c) => (c.prizeNames = (e.target as HTMLTextAreaElement).value.split('\n').map((x) => x.trim()).filter(Boolean)))} />
      <div class="muted small">По одному на строку. При выигрыше приза выбирается случайное название.</div>
      <h3>Призы призовых вопросов — по рангам</h3>
      <div class="note small">Призовой вопрос (вкладка «Вопросы») выдаёт приз своего ранга: первый ещё не выданный из списка. Если список ранга пуст — берётся из «Названий призов».</div>
      <div class="settings-grid">
        {[0, 1, 2, 3].map((i) => (
          <label class="col" style={{ alignItems: 'stretch' }}>
            <span>Ранг {i + 1}{i === 0 ? ' — главный' : ''}</span>
            <textarea rows={3} value={(s.prizeTiers?.[i] ?? []).join('\n')} placeholder="по одному на строку" onInput={(e) => upd((c) => {
              const t = [...(c.prizeTiers ?? [])];
              while (t.length <= i) t.push([]);
              t[i] = (e.target as HTMLTextAreaElement).value.split('\n').map((x) => x.trim()).filter(Boolean);
              c.prizeTiers = t;
            })} />
          </label>
        ))}
      </div>
    </div>
  );
}

// ───────── пульт ─────────

function Remote({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => Promise<void> }) {
  const [room, setRoom] = useState(() => localStorage.getItem('bg_tv_room') ?? localStorage.getItem('bg_admin_room') ?? '');
  const [net, setNet] = useState<Transport | null>(null);
  const [s, setS] = useState<GameState | null>(null);
  const [give, setGive] = useState<Record<string, string>>({});
  const connect = () => {
    localStorage.setItem('bg_admin_room', room);
    const t = createTransport(room.toUpperCase());
    let state: GameState | null = null;
    t.listen('game', (m: GameMsg) => {
      if (m.t !== 'st') return;
      if (!state && !m.full) return;
      state = { ...(state ?? ({} as GameState)), ...m.parts, v: m.v };
      setS(state);
    });
    setNet(t);
    setTimeout(() => t.send('input', { t: 'hello', cid: 'admin' }), 400);
  };
  const ctl = (cmd: string, args?: any) => net?.send('input', { t: 'ctl', cmd, args });
  if (!net) {
    return (
      <div class="pad col" style={{ maxWidth: 420 }}>
        <div class="note">Пульт управляет игрой на ТВ по сети — удобно с телефона ведущего. Пульт получает все обновления состояния, поэтому держи его открытым только когда нужен.</div>
        <input class="inp-s" placeholder="Код комнаты" value={room} onInput={(e) => setRoom((e.target as HTMLInputElement).value.toUpperCase())} />
        <button class="btn primary" disabled={room.length !== 4} onClick={connect}>Подключиться</button>
      </div>
    );
  }
  return (
    <div class="pad col">
      <div class="row wrap">
        <b>Комната {room}</b>
        <span class="chip">{s ? (s.phase === 'turns' ? `круг ${s.round}` : s.phase) : 'ждём состояние…'}</span>
        {s?.paused && <span class="chip">ПАУЗА</span>}
      </div>
      <div class="row wrap remote-btns">
        {s?.phase === 'lobby' && <button class="btn primary" onClick={() => ctl('start')}>▶ Начать игру</button>}
        <button class="btn primary" onClick={() => ctl('next')}>⏭ {nextLabel(s)}</button>
        <button class="btn" onClick={() => ctl('pause')}>{s?.paused ? '▶ Продолжить' : '⏸ Пауза'}</button>
        {s?.phase === 'lobby' && <button class="btn" onClick={() => ctl('addBot')}>+ бот</button>}
        <button class="btn" onClick={() => ctl('reload')}>🔄 Обновить вопросы и настройки в игре</button>
        <button class="btn" onClick={() => { if (confirm('Завершить игру?')) ctl('end'); }}>🏁 Завершить</button>
        <button class="btn" onClick={() => ctl('sound')}>🔈 Звук ТВ вкл/выкл</button>
        <button class="btn" onClick={() => { if (confirm('Начать новую игру? Текущая будет потеряна. Комната останется той же.')) ctl('newGame'); }}>🆕 Новая игра</button>
        <button class="btn" onClick={() => ctl('debug')}>🐞 Отладка на ТВ</button>
        <button class="btn" onClick={() => ctl('panel')}>🛠 Панель ведущего на ТВ</button>
      </div>
      <div class="col remote-auto">
        {([
          ['autoIntro', 'Само: интро префектуры → вопрос (через 5 с)'],
          ['autoReading', 'Само: вопрос → варианты ответов (когда ведущий успел прочитать, по длине текста)'],
        ] as const).map(([k, label]) => {
          const on = !!(s?.settings ?? settings)[k];
          return (
            <label class="set-row"><span>{label}</span><input type="checkbox" checked={on} onChange={(e) => {
              const v = (e.target as HTMLInputElement).checked;
              // сразу в игру и в сохранённые настройки — чтобы «Обновить настройки» не сбросило галочку
              ctl('auto', { [k]: v });
              void onSave({ ...settings, [k]: v });
            }} /></label>
          );
        })}
        {settings.hostPaced === false && <div class="muted small">Ведущий не управляет вопросами (галочка в «Настройках» снята) — всё и так идёт само.</div>}
      </div>
      <RemoteTuning s={s} settings={settings} ctl={ctl} onSave={onSave} />
      {s && (
        <table class="qtable">
          <thead><tr><th>Игрок</th><th>Где</th><th>HP</th><th>¥</th><th>★</th><th>Связь</th><th>Выдать (¥ / ★ / HP / приз)</th><th></th></tr></thead>
          <tbody>
            {s.joinOrder.map((id) => s.players[id]).filter(Boolean).map((p) => (
              <tr>
                <td class="row"><Avatar p={p} size={24} /> {p.name}</td>
                <td>
                  <select value={String(p.pref ?? '')} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v && confirm(`Переместить ${p.name} в ${PREF[Number(v)].ru}?`)) ctl('teleport', { pid: p.id, pref: Number(v) }); }}>
                    <option value="">—</option>
                    {PREFS.map((x) => <option value={String(x.code)}>{x.ru}</option>)}
                  </select>
                </td>
                <td>{p.hp}/{p.maxHp}</td>
                <td>{fmtYen(p.yen)}</td>
                <td>{p.stars}</td>
                <td><span class={'dot ' + (p.online ? 'on' : 'off')} /></td>
                <td class="row">
                  <input class="inp-s num" placeholder="¥" value={give[p.id + 'y'] ?? ''} onInput={(e) => setGive({ ...give, [p.id + 'y']: (e.target as HTMLInputElement).value })} />
                  <input class="inp-s num" placeholder="★" value={give[p.id + 's'] ?? ''} onInput={(e) => setGive({ ...give, [p.id + 's']: (e.target as HTMLInputElement).value })} />
                  <input class="inp-s num" placeholder="HP" value={give[p.id + 'h'] ?? ''} onInput={(e) => setGive({ ...give, [p.id + 'h']: (e.target as HTMLInputElement).value })} />
                  <input class="inp-s" style={{ width: 110 }} placeholder="приз" value={give[p.id + 'p'] ?? ''} onInput={(e) => setGive({ ...give, [p.id + 'p']: (e.target as HTMLInputElement).value })} />
                  <button class="btn small" onClick={() => {
                    ctl('give', { pid: p.id, yen: Number(give[p.id + 'y'] || 0), stars: Number(give[p.id + 's'] || 0), hp: Number(give[p.id + 'h'] || 0), prize: give[p.id + 'p'] || undefined });
                    setGive({});
                  }}>OK</button>
                </td>
                <td><button class="btn small" onClick={() => { if (confirm(`Удалить ${p.name} из игры?`)) ctl('kick', { pid: p.id }); }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** пульт: ручки темпа и экономики, которые ведущий крутит по ходу игры (сразу в игру и в сохранённые настройки) */
function RemoteTuning({ s, settings, ctl, onSave }: { s: GameState | null; settings: Settings; ctl: (cmd: string, args?: any) => void; onSave: (s: Settings) => Promise<void> }) {
  const live = s?.settings ?? settings;
  const [tok, setTok] = useState(() => structuredClone(live.tokens ?? DEFAULT_TOKENS));
  const [rates, setRates] = useState(() => [0, 1, 2].map((e) => epochRatesFor(live, e)));
  const apply = (patch: Partial<Settings>) => {
    ctl('auto', patch);
    void onSave({ ...settings, ...patch });
  };
  const cur = s ? epochOf(s) : -1;
  const finalRounds = live.finalRounds ?? 3;
  const eg = s?.endgame;
  const MULS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
  const prizes = PRIZE_TIERS.reduce((a, k) => a + (tok.prizes[k] || 0), 0);
  const tokensNow = s ? s.joinOrder.map((id) => s.players[id]).filter(Boolean).map((p) => ({ p, n: tokensFor(p, { ...live, tokens: tok }) + (p.tokens ?? 0) })) : [];
  return (
    <div class="col remote-tuning">
      <h3>Финал</h3>
      <div class="muted small">
        {!eg ? 'Когда откроется вся карта, игра доиграет круг и начнётся охота за призами (значки наград появятся над префектурами). Все призы разыграны → доигрываем круг → финальные круги.'
          : eg.step === 'open' ? 'Вся карта открыта — доигрываем круг, потом охота за призами.'
          : eg.step === 'hunt' ? 'Идёт охота за призами.'
          : eg.step === 'huntDone' ? 'Призы разыграны — доигрываем круг, потом финальные круги.'
          : `Финальные круги: сыграно ${eg.played ?? 0} из ${finalRounds}.`}
      </div>
      <div class="row wrap">
        <span>Кругов свободного перемещения в финале:</span>
        {[1, 2, 3, 4].map((n) => <button class={'btn small' + (finalRounds === n ? ' yellow' : '')} onClick={() => apply({ finalRounds: n })}>+{n}</button>)}
      </div>

      <h3>Эпохи: множители</h3>
      <div class="muted small">Эпоха берёт множители в момент наступления — менять можно заранее, пока она не началась. Цены растут быстрее наград; звёзды не дорожают.</div>
      <table class="qtable" style={{ maxWidth: 520 }}>
        <thead><tr><th>Эпоха</th><th>Цены</th><th>Награды</th><th></th></tr></thead>
        <tbody>
          {EPOCHS.map((E, i) => {
            const locked = cur >= i;
            const sel = (k: 'price' | 'reward') => (
              <select disabled={locked} value={String(rates[i][k])} onChange={(e) => { const r = rates.map((x) => ({ ...x })); r[i][k] = Number((e.target as HTMLSelectElement).value); setRates(r); apply({ epochRates: r }); }}>
                {[...new Set([...MULS, rates[i][k]])].sort((a, b) => a - b).map((m) => <option value={String(m)}>{fmtMul(m)}</option>)}
              </select>
            );
            return (
              <tr>
                <td>{E.ja} {E.name} <span class="muted small">с {Math.round(E.from * 100)}% карты</span></td>
                <td>{sel('price')}</td>
                <td>{sel('reward')}</td>
                <td class="muted small">{cur === i ? `идёт: ${fmtMul(s!.rates?.price ?? rates[i].price)} / ${fmtMul(s!.rates?.reward ?? rates[i].reward)}` : locked ? 'прошла' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Жетоны финальной призовой игры</h3>
      <div class="row wrap">
        <label class="row">1 жетон = <input class="inp-s num" type="number" min={1} value={tok.starsPer} onInput={(e) => setTok({ ...tok, starsPer: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) })} /> ★</label>
        <label class="row">или <input class="inp-s num" style={{ width: 90 }} type="number" min={1} step={500} value={tok.yenPer} onInput={(e) => setTok({ ...tok, yenPer: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) })} /> ¥</label>
        <span class="muted small">(звёзды и деньги складываются, дробные части тоже)</span>
      </div>
      <div class="row wrap">
        <span>Призов на колесе:</span>
        {PRIZE_TIERS.map((k) => (
          <label class="row"><span class="tier-dot" style={{ background: TIER_INFO[k].color }} /> {TIER_INFO[k].name} <input class="inp-s num" type="number" min={0} value={tok.prizes[k]} onInput={(e) => setTok({ ...tok, prizes: { ...tok.prizes, [k]: Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0)) } })} /></label>
        ))}
        <span class="muted small">всего {prizes}; сектор = призов этой редкости (обычные и необычные ×3), выпавший приз убирается с колеса</span>
      </div>
      <div class="row wrap">
        <button class="btn small primary" onClick={() => apply({ tokens: tok })}>Применить курс и призы</button>
        {s && <span class="muted small">По этому курсу сейчас: {tokensNow.map(({ p, n }) => `${p.name} ${n}`).join(' · ')} — всего {tokensNow.reduce((a, x) => a + x.n, 0)} жетонов на {prizes} призов</span>}
      </div>
      <label class="set-row"><span>Дать жетон аутсайдеру — в последнем круге тому, у кого меньше всего звёзд и денег в пересчёте на жетоны (ничья — всем)</span><input type="checkbox" checked={live.outsiderToken !== false} onChange={(e) => apply({ outsiderToken: (e.target as HTMLInputElement).checked })} /></label>
      <label class="set-row"><span>…двум последним (игра непредсказуема)</span><input type="checkbox" disabled={live.outsiderToken === false} checked={!!live.outsiderTwo} onChange={(e) => apply({ outsiderTwo: (e.target as HTMLInputElement).checked })} /></label>
      <div class="row wrap">
        {s?.phase === 'end' && !s.wheel && <button class="btn primary" onClick={() => { apply({ tokens: tok }); setTimeout(() => ctl('wheelStart'), 300); }}>🎡 Колесо призов: обменять звёзды и деньги на жетоны</button>}
        {s?.phase === 'end' && s.wheel && s.stage.t !== 'wheel' && <button class="btn primary" onClick={() => ctl('wheelStart')}>🎡 Вернуться к колесу призов</button>}
        {s?.phase === 'end' && s.wheel && s.stage.t === 'wheel' && <button class="btn" onClick={() => ctl('wheelEnd')}>Показать титулы</button>}
        {s?.phase === 'end' && s.wheel && <button class="btn" onClick={() => { if (confirm('Начать колесо заново? Жетоны и призы пересчитаются по текущим настройкам, история выигрышей сотрётся.')) { apply({ tokens: tok }); setTimeout(() => ctl('wheelStart', { reset: true }), 300); } }}>Колесо заново</button>}
        {s?.phase !== 'end' && <span class="muted small">Колесо призов запускается после конца игры.</span>}
      </div>
      {s?.wheel && (
        <div class="muted small">Колесо: осталось {PRIZE_TIERS.map((k) => `${TIER_INFO[k].name.toLowerCase()} ${s.wheel!.left[k]}`).join(', ')} · жетонов у игроков {Object.values(s.wheel.tokens).reduce((a, b) => a + b, 0)}</div>
      )}
    </div>
  );
}

// иконки — PNG из src/img/icons, читаются до первого рендера
void loadIcons().then(() => render(<App />, document.getElementById('app')!));

/** что сделает «Далее» сейчас — подсказка ведущему на пульте */
function nextLabel(s: GameState | null) {
  if (!s || s.settings.hostPaced === false) return 'Далее';
  const st = s.stage;
  if (st.t === 'prefIntro') return 'Далее: показать вопрос';
  if (st.t === 'group' && s.g?.phase === 'intro') return 'Далее: начать игру';
  if (st.t === 'group' && s.g?.phase === 'results') return 'Далее: закрыть итоги';
  if (st.t === 'question' && s.q?.reading) return 'Далее: ответы и таймер';
  if (st.t === 'question' && s.q?.revealed) return 'Далее: закрыть вопрос';
  return 'Далее';
}
