import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player, PublicQuestion, SoloGameId } from '../shared/types';
import { prefBgUrl } from '../shared/prefBg';
import { viewState } from '../host/debugScenes';
import { DebugMenu, phoneDebugEnabled, setPhoneDebug } from '../ui/DebugMenu';
import { Avatar, BonusIcon, HpBar, Inventory, LETTERS, PixIcon, ResText, SkillChips, SkillIcon, TimerBar } from '../ui/common';
import { BONUS_INFO, HATS, PLAYER_COLORS, SOLO_GAMES, machinesOf, soloAt } from '../shared/settings';
import { PREF, path as prefPath, prefName } from '../map/mapData';
import { fmtYen, vibrate } from '../shared/util';
import { MapView } from '../map/MapView';
import { RhythmBoard } from '../games/RhythmBoard';
import { Pachinko } from './Pachinko';
import { RingGame } from './RingGame';
import { ChoHan } from './ChoHan';
import { Sudoku } from './Sudoku';
import { Shop } from './Shop';
import { GroupGame } from './GroupGame';
import { unlockAudio } from '../shared/sound';
import { LOGO_URL } from '../shared/logo';
import { SPECIAL_TOPIC } from '../shared/sprites';

function useClient(c: GameClient) {
  const [, force] = useState(0);
  useEffect(() => {
    const off = c.subscribe(() => force((x) => x + 1));
    // события могли прийти до подписки — перерисуемся сразу
    force((x) => x + 1);
    return off;
  }, [c]);
}

let wakeLock: any = null;
async function keepAwake() {
  try { if (!wakeLock) wakeLock = await (navigator as any).wakeLock?.request('screen'); } catch { /* нет поддержки */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { wakeLock = null; void keepAwake(); } });

export function PlayApp({ client, onLeaveRoom }: { client: GameClient; onLeaveRoom: () => void }) {
  useClient(client);
  const s = client.s && viewState(client.s);
  const me = client.me;

  useEffect(() => {
    const f = () => { unlockAudio(); void keepAwake(); };
    window.addEventListener('pointerdown', f, { once: true });
    return () => window.removeEventListener('pointerdown', f);
  }, []);

  // сохранённый игрок пропал (новая игра в той же комнате) — сбрасываем
  useEffect(() => {
    if (s && client.pid && s.players && !s.players[client.pid]) client.logout();
  }, [s?.v]);

  if (!s) {
    return (
      <div class="phone center-screen">
        <div class="panel center col">
          <div>Подключение к комнате <b>{client.room}</b>…</div>
          <div class="muted">Сеть: {client.status}. Если долго — проверь, что ТВ запущен.</div>
          <button class="btn small ghost" onClick={onLeaveRoom}>Другая комната</button>
        </div>
      </div>
    );
  }
  if (!me) return <Join client={client} s={s} onLeaveRoom={onLeaveRoom} />;
  return <Game client={client} s={s} me={me} />;
}

// ───────── регистрация ─────────

function Join({ client, s, onLeaveRoom }: { client: GameClient; s: GameState; onLeaveRoom: () => void }) {
  const [mode, setMode] = useState<'new' | 'restore'>(s.phase === 'lobby' ? 'new' : 'restore');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const taken = new Set(Object.values(s.players).map((p) => p.color));
  const [color, setColor] = useState(PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[0]);
  const [hat, setHat] = useState(0);
  const [sent, setSent] = useState(false);
  useEffect(() => { if (client.joinError) setSent(false); }, [client.joinError]);
  return (
    <div class="phone scroll">
      <div class="join-head">
        {LOGO_URL ? <img class="menu-logo small" src={LOGO_URL} alt="BIG GAME 2" /> : <h2>BIG GAME 2</h2>}
        <div class="jp">{LOGO_URL ? '' : 'ビッグゲーム 2 · '}комната {client.room}</div>
      </div>
      <div class="tabs">
        <button class={'tab' + (mode === 'new' ? ' on' : '')} onClick={() => setMode('new')}>Новый игрок</button>
        <button class={'tab' + (mode === 'restore' ? ' on' : '')} onClick={() => setMode('restore')}>Я уже в игре</button>
      </div>
      {mode === 'new' ? (
        <div class="col pad">
          <div class="avatar-preview pop" key={color + hat}><Avatar p={{ color, hat }} size={120} /></div>
          <input class="inp" maxLength={16} placeholder="Твоё имя" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <div class="muted">Цвет</div>
          <div class="colors">
            {PLAYER_COLORS.map((c) => (
              <button class={'swatch' + (c === color ? ' on' : '') + (taken.has(c) ? ' taken' : '')} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
          <div class="muted">Головной убор</div>
          <div class="row wrap">
            {HATS.map((h, i) => <button class={'btn small' + (i === hat ? ' yellow' : '')} onClick={() => setHat(i)}>{h}</button>)}
          </div>
          {client.joinError && <div class="warn">{client.joinError}</div>}
          <button class="btn primary big-btn" disabled={!name.trim() || sent} onClick={() => { setSent(true); client.join(name.trim(), color, hat); setTimeout(() => setSent(false), 4000); }}>
            {sent ? 'Подключаемся…' : 'Играть!'}
          </button>
        </div>
      ) : (
        <div class="col pad">
          <div class="muted">Если телефон перезагрузился или ты зашёл с другого устройства — выбери себя и введи PIN, который показывался при регистрации.</div>
          <div class="row wrap">
            {s.joinOrder.map((id) => s.players[id]).filter(Boolean).map((p) => (
              <button class={'btn small' + (name === p.name ? ' yellow' : '')} onClick={() => setName(p.name)}><Avatar p={p} size={24} /> {p.name}</button>
            ))}
          </div>
          <input class="inp" placeholder="Имя" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <input class="inp big" inputMode="numeric" maxLength={4} placeholder="PIN" value={pin} onInput={(e) => setPin((e.target as HTMLInputElement).value)} />
          {client.joinError && <div class="warn">{client.joinError}</div>}
          <button class="btn primary big-btn" disabled={!name || pin.length !== 4} onClick={() => client.restore(name, pin)}>Вернуться в игру</button>
        </div>
      )}
      <div class="pad"><button class="btn small ghost" onClick={onLeaveRoom}>Другая комната</button></div>
    </div>
  );
}

// ───────── игра ─────────

type Attention = 'question' | 'bonus' | 'landing' | 'move' | 'duelPick' | 'rhythm' | 'shop' | 'group' | 'extraTurn' | null;

function attention(s: GameState, me: Player): Attention {
  const st = s.stage;
  if (st.t === 'question' && s.q?.participants.includes(me.id)) return 'question';
  if (st.t === 'bonus' && st.pids.includes(me.id) && !(me.id in st.picked)) return 'bonus';
  if (st.t === 'landing' && st.pid === me.id) return 'landing';
  if (st.t === 'move' && st.pid === me.id) return 'move';
  if (st.t === 'duelPick' && st.pid === me.id) return 'duelPick';
  if (st.t === 'rhythm' && s.rhythm?.players.includes(me.id)) return 'rhythm';
  if (st.t === 'shop' && st.pid === me.id) return 'shop';
  if (st.t === 'extraTurn' && st.pid === me.id) return 'extraTurn';
  if (st.t === 'group' && s.g?.players.includes(me.id)) return 'group';
  return null;
}

function Game({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const att = attention(s, me);
  const [tab, setTab] = useState<'home' | 'map' | SoloGameId>('home');
  const lastAtt = useRef<Attention>(null);
  useEffect(() => {
    if (att && att !== lastAtt.current) vibrate([60, 40, 60]);
    lastAtt.current = att;
  }, [att]);
  const solo = soloAt(s.settings, me.pref);
  const hasPachinko = solo.includes('pachinko');
  const hasRing = solo.includes('ring');
  const ballsKey = `bg_balls_${client.room}_${me.id}`;
  const hasBalls = Number(localStorage.getItem(ballsKey) ?? 0) > 0;
  useEffect(() => {
    if ((tab === 'pachinko' && !hasPachinko && !hasBalls) || ((tab === 'ring' || tab === 'chohan' || tab === 'sudoku') && !solo.includes(tab))) setTab('home');
  }, [solo.join(), hasBalls, tab]);
  // открытые соло-игры остаются смонтированными (на паузе), пока идёт вопрос или групповая игра:
  // после неё игрок возвращается ровно туда, где остановился
  const [opened, setOpened] = useState<SoloGameId[]>([]);
  useEffect(() => {
    if ((tab === 'ring' || tab === 'chohan' || tab === 'sudoku') && !opened.includes(tab)) setOpened([...opened, tab]);
  }, [tab]);
  const soloView = (g: SoloGameId, el: (paused: boolean) => any) => opened.includes(g) && solo.includes(g) && (
    <div style={{ display: !att && tab === g ? 'contents' : 'none' }}>{el(!!att || tab !== g)}</div>
  );

  const [debug, setDebug] = useState(phoneDebugEnabled);
  const [debugOpen, setDebugOpen] = useState(false);
  // отладка: перенос к автомату — вкладку открываем, когда хост подтвердит новую префектуру
  const [pendingTab, setPendingTab] = useState<SoloGameId | null>(null);
  useEffect(() => {
    if (pendingTab && solo.includes(pendingTab)) { setTab(pendingTab); setPendingTab(null); }
  }, [pendingTab, solo.join()]);
  const onGame = (game: SoloGameId, pid: string) => {
    const prefs = s.settings[SOLO_GAMES[game].key] ?? [];
    if (!prefs.length) return alert('В настройках нет префектур с этим автоматом');
    if (pid === me.id && me.pref != null && prefs.includes(me.pref)) setTab(game);
    else { client.send({ t: 'ctl', cmd: 'teleport', args: { pid: me.id, pref: prefs[0] } }); setPendingTab(game); }
    setDebugOpen(false);
  };
  const toggleDebug = () => { setPhoneDebug(!debug); setDebug(!debug); setDebugOpen(!debug); };
  return (
    <div class="phone game">
      <Header client={client} s={s} me={me} onSecret={toggleDebug} />
      {debug && <button class="debug-fab" onClick={() => setDebugOpen((x) => !x)}>🐞</button>}
      {debug && debugOpen && client.s && (
        <div class="debug-sheet"><DebugMenu s={client.s} send={(cmd, args) => client.send({ t: 'ctl', cmd, args })} onClose={() => setDebugOpen(false)} onGame={onGame} /></div>
      )}
      <div class="main">
        {/* мини-игры остаются смонтированными (на паузе), пока идёт вопрос */}
        {(tab === 'pachinko' || hasBalls) && (hasPachinko || hasBalls) && (
          <div style={{ display: !att && tab === 'pachinko' ? 'contents' : 'none' }}>
            <Pachinko client={client} s={s} me={me} paused={!!att || tab !== 'pachinko'} onExit={() => setTab('home')} />
          </div>
        )}
        {/* интро префектуры идёт на ТВ; на телефоне — только её фон, вопрос потом появится поверх */}
        {s.stage.t === 'prefIntro' && (
          <div class="phone-intro">{prefBgUrl(s.stage.code) && <img class="q-bg" src={prefBgUrl(s.stage.code)!} alt="" draggable={false} />}</div>
        )}
        {att === 'question' && s.q && <QuestionView key={s.q.n} client={client} s={s} q={s.q} me={me} />}
        {att === 'bonus' && <BonusPick client={client} s={s} me={me} />}
        {(att === 'landing' || att === 'move') && <MapPick key={att} client={client} s={s} me={me} mode={att} />}
        {att === 'duelPick' && <DuelPick client={client} s={s} me={me} />}
        {att === 'shop' && <Shop client={client} s={s} me={me} />}
        {att === 'extraTurn' && <ExtraTurn client={client} s={s} me={me} />}
        {att === 'group' && <GroupGame client={client} s={s} me={me} />}
        {att === 'rhythm' && s.rhythm && (
          <div class="rhythm-wrap">
            <RhythmBoard key={s.rhythm.id} r={s.rhythm} now={() => client.hostNow()} onDone={(score, hits, total) => client.send({ t: 'rhythm', pid: me.id, id: s.rhythm!.id, score, hits, total })} />
          </div>
        )}
        {!att && tab === 'home' && <Home client={client} s={s} me={me} />}
        {!att && tab === 'map' && <FreeMap s={s} me={me} />}
        {soloView('ring', (paused) => <RingGame client={client} s={s} me={me} paused={paused} onExit={() => setTab('home')} />)}
        {soloView('chohan', (paused) => <ChoHan client={client} s={s} me={me} paused={paused} onExit={() => setTab('home')} />)}
        {soloView('sudoku', (paused) => <Sudoku client={client} s={s} me={me} paused={paused} onExit={() => setTab('home')} />)}
      </div>
      {!att && s.stage.t !== 'prefIntro' && (
        <nav class="tabbar">
          <button class={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}>🏠<span>Игра</span></button>
          <button class={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}>🗾<span>Карта</span></button>
          {(hasPachinko || hasBalls) && <button class={tab === 'pachinko' ? 'on' : ''} onClick={() => setTab('pachinko')}>🎰<span>Пачинко</span></button>}
          {hasRing && <button class={tab === 'ring' ? 'on' : ''} onClick={() => setTab('ring')}>🎡<span>Приз</span></button>}
          {solo.includes('chohan') && <button class={tab === 'chohan' ? 'on' : ''} onClick={() => setTab('chohan')}>🎲<span>Чо-хан</span></button>}
          {solo.includes('sudoku') && <button class={tab === 'sudoku' ? 'on' : ''} onClick={() => setTab('sudoku')}>🔢<span>Судоку</span></button>}
        </nav>
      )}
    </div>
  );
}

function Header({ client, s, me, onSecret }: { client: GameClient; s: GameState; me: Player; onSecret: () => void }) {
  // 5 быстрых тапов по своему аватару — включить/выключить меню отладки
  const taps = useRef<number[]>([]);
  const tap = () => {
    const t = Date.now();
    taps.current = [...taps.current.filter((x) => t - x < 2000), t];
    if (taps.current.length >= 5) { taps.current = []; onSecret(); }
  };
  return (
    <header class="hdr" style={{ borderColor: me.color }}>
      <span onClick={tap}><Avatar p={me} size={40} dim={me.hp <= 0} /></span>
      <div class="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <div class="row" style={{ gap: 6 }}>
          <b class="ellipsis">{me.name}</b>
          <span class={'dot ' + (client.status === 'online' ? 'on' : 'off')} />
        </div>
        <HpBar hp={me.hp} max={me.maxHp} />
      </div>
      <div class="col" style={{ gap: 2, alignItems: 'flex-end' }}>
        <span>{fmtYen(me.yen)}</span>
        <span><PixIcon id="stars" size={18} /> {me.stars}{me.specials ? <> · <PixIcon id="special" size={18} /> {me.specials}</> : ''}</span>
      </div>
    </header>
  );
}

function stageText(s: GameState, me: Player): string {
  const st = s.stage;
  const n = (id: string) => s.players[id]?.name ?? '?';
  switch (st.t) {
    case 'lobby': return 'Ждём остальных игроков. Смотри на экран ТВ!';
    case 'banner': return st.text + (st.sub ? ' — ' + st.sub : '');
    case 'calibResult': return 'Итоги калибровки — на ТВ';
    case 'landing': return `${n(st.pid)} выбирает место высадки`;
    case 'turnStart': return st.pid === me.id ? 'Твой ход!' : `Ход: ${n(st.pid)}`;
    case 'move': return `${n(st.pid)} выбирает, куда идти`;
    case 'moving': return `${n(st.pid)} идёт в ${PREF[st.to].ru}`;
    case 'bonus': return 'Игроки выбирают бонусы…';
    case 'question': return s.q ? 'Вопрос на ТВ: ' + s.q.title : 'Вопрос';
    case 'prefIntro': return PREF[st.code]?.ru ?? '';
    case 'reward': return `${n(st.pid)}: ${st.text}`;
    case 'shop': return st.pid === me.id ? 'Ты у магазина' : `${n(st.pid)} в магазине 🛒`;
    case 'group': return 'Групповая игра — смотри на ТВ!';
    case 'extraTurn': return `${n(st.pid)} решает, ходить ли ещё раз`;
    case 'duelPick': return `Дуэль: ${n(st.pid)} выбирает тему`;
    case 'rhythm': return 'Ритм-дуэль на ТВ!';
    case 'duelResult': return 'Итоги дуэли';
    case 'prize': return `🏆 ${n(st.pid)} получает приз!`;
    case 'end': return 'Игра окончена!';
  }
}

function Home({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const topics = s.settings.topics.filter((t) => t.combat);
  return (
    <div class="scroll pad col">
      <div class="status-card slide-up" key={s.stage.t}>{stageText(s, me)}</div>
      <div class="panel col">
        <div class="row"><span class="muted">Где ты:</span> <b>{me.pref ? `${PREF[me.pref].ru} ${PREF[me.pref].ja}` : '—'}</b></div>
        <div class="muted">Сила</div>
        <SkillChips topics={topics} stats={me.stats} size={26} grid />
        <div class="muted">Инвентарь</div>
        <Inventory p={me} size={36} all />
        {me.prizes.length > 0 && <div class="prizes">🏆 Призы: {me.prizes.join(', ')}</div>}
      </div>
      <div class="panel col small-text">
        <div>Твой PIN для входа с другого устройства: <b class="pin">{client.pin ?? '—'}</b></div>
        <div class="muted">Связь: {client.status}, синхронизация часов ±{isFinite(client.clock.rtt) ? Math.round(client.clock.rtt / 2) : '?'} мс</div>
      </div>
      <div class="panel col small-text">
        <b>Другие игроки</b>
        {s.joinOrder.filter((id) => id !== me.id).map((id) => s.players[id]).filter(Boolean).map((p) => (
          <div class="row">
            <Avatar p={p} size={22} /> <span class="grow">{p.name}</span>
            <SkillChips topics={topics} stats={p.stats} size={14} /> <span>❤{p.hp}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────── вопрос ─────────

const myChoices = new Map<number, number>();

function QuestionView({ client, s, q, me }: { client: GameClient; s: GameState; q: PublicQuestion; me: Player }) {
  const [choice, setChoice] = useState<number | null>(myChoices.get(q.n) ?? null);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);
  const removed = q.removed[me.id] ?? [];
  const expired = !q.reading && client.hostNow() > q.deadline;
  const locked = !!q.reading || choice !== null || expired || q.revealed || q.answered.includes(me.id);
  const pickAns = (i: number) => {
    if (locked || removed.includes(i)) return;
    setChoice(i);
    myChoices.set(q.n, i);
    client.answer(q.n, i);
    vibrate(30);
  };
  const ok = q.revealed && q.correct === (choice ?? q.choices?.[me.id]);
  const imgs = q.answerImages;
  const bg = prefBgUrl(q.pref);
  return (
    <>
    {bg && <img class="q-bg" src={bg} alt="" draggable={false} />}
    <div class={'question scroll pad col' + (q.revealed ? (ok ? ' ok' : ' bad') : '') + (bg ? ' has-bg' : '')}>
      <div class="q-title">{q.title}{q.special ? <> · <PixIcon id="special" size={18} /></> : ''}</div>
      {!q.revealed && !q.reading && <TimerBar start={q.startAt} end={q.deadline} now={() => client.hostNow()} />}
      {q.media?.type === 'image' && <img class="q-img" src={q.media.url} alt="" />}
      {q.media?.type === 'audio' && <div class="q-tv">🎵 Слушай на ТВ</div>}
      {q.media?.type === 'video' && <div class="q-tv">🎬 Смотри на ТВ</div>}
      <div class="q-text">{q.text}</div>
      {q.reading && <div class="center muted">Слушайте вопрос — варианты появятся следом</div>}
      {!q.reading && <div class={imgs ? 'q-grid' : 'q-list'}>
        {(q.orders?.[me.id] ?? [0, 1, 2, 3]).map((i, pos) => {
          const a = q.answers[i];
          const gone = removed.includes(i);
          let cls = 'q-btn';
          if (choice === i) cls += ' chosen';
          if (q.revealed && i === q.correct) cls += ' correct';
          else if (q.revealed && choice === i) cls += ' wrong';
          if (gone) cls += ' gone';
          return (
            <button class={cls} disabled={gone || (locked && choice !== i && !q.revealed)} onClick={() => pickAns(i)}>
              <span class="qletter">{LETTERS[pos]}</span>
              {a.image ? <img src={a.image} alt="" /> : <span>{a.text}</span>}
            </button>
          );
        })}
      </div>}
      {!q.revealed && choice !== null && <div class="center muted">Ответ принят. Ждём остальных…</div>}
      {!q.revealed && choice === null && expired && <div class="center muted">Время вышло</div>}
      {q.revealed && (
        <div class="q-result pop">
          {ok ? '✔ Верно!' : choice === null ? '⏱ Без ответа' : '✘ Неверно'}
          {q.results?.[me.id] && <div class="q-res-sub"><ResText text={q.results[me.id]} topics={s.settings.topics} size={24} /></div>}
        </div>
      )}
    </div>
    </>
  );
}

function BonusPick({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const st = s.stage;
  if (st.t !== 'bonus') return null;
  const offers = st.offers[me.id] ?? [];
  return (
    <div class="pad col center-screen">
      <h2>Использовать бонус?</h2>
      <TimerBar start={st.deadline - s.settings.bonusTime * 1000} end={st.deadline} now={() => client.hostNow()} />
      {offers.map((b) => (
        <button class="btn yellow big-btn" onClick={() => client.pick('bonus', b)}><BonusIcon b={b} size={28} /> {BONUS_INFO[b].name} (есть {me.bonuses[b]})</button>
      ))}
      <button class="btn big-btn" onClick={() => client.pick('bonus', null)}>Не хочу</button>
    </div>
  );
}

function ExtraTurn({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const st = s.stage;
  const [sent, setSent] = useState(false);
  if (st.t !== 'extraTurn') return null;
  const send = (v: boolean) => { if (sent) return; setSent(true); client.pick('extra', v); vibrate(30); };
  return (
    <div class="pad col center-screen">
      <div class="shop-door pop"><BonusIcon b="turn2" size={96} /></div>
      <h2>Ещё один ход?</h2>
      <div class="muted">У тебя {me.bonuses.turn2 ?? 0} × «{BONUS_INFO.turn2.name}». Можно сходить ещё раз прямо сейчас.</div>
      <TimerBar start={st.deadline - 15000} end={st.deadline} now={() => client.hostNow()} />
      <button class="btn yellow big-btn" disabled={sent} onClick={() => send(true)}>Ходить ещё раз</button>
      <button class="btn big-btn" disabled={sent} onClick={() => send(false)}>Приберечь</button>
    </div>
  );
}

function DuelPick({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const [sent, setSent] = useState(false);
  const st = s.stage;
  if (st.t !== 'duelPick' || !s.duel) return null;
  const d = s.duel;
  const foe = s.players[d.attacker === me.id ? d.defender : d.attacker];
  const send = (v: string) => { if (sent) return; setSent(true); client.pick('duel', v); vibrate(30); };
  return (
    <div class="pad col center-screen">
      <h2>Дуэль! Твой вопрос</h2>
      <div class="muted">Противник: {foe?.name} (❤ {foe?.hp}). Выбери тему — урон зависит от силы того, кто ответит правильно.</div>
      <TimerBar start={st.deadline - s.settings.pickTime * 1000} end={st.deadline} now={() => client.hostNow()} />
      {st.topics.map((id) => {
        const t = s.settings.topics.find((x) => x.id === id)!;
        return (
          <button class="btn big-btn" style={{ '--c': t.color } as any} disabled={sent} onClick={() => send(id)}>
            <SkillIcon t={t} size={24} /> <span class="grow" style={{ textAlign: 'left' }}>{t.name}</span> <b>{me.stats[id]}</b> <span class="muted">против</span> <b>{foe?.stats[id]}</b>
          </button>
        );
      })}
      {st.canSpecial && <button class="btn big-btn rainbow" disabled={sent} onClick={() => send('special')}><SkillIcon t={SPECIAL_TOPIC} size={24} /> <span class="grow" style={{ textAlign: 'left' }}>Спецвопрос</span> <b>сила {s.settings.specialPower}</b> <span class="muted">· осталось {me.specials}</span></button>}
      {st.canRhythm && <button class="btn yellow big-btn" disabled={sent} onClick={() => send('rhythm')}>🥁 Ритм-баттл (сила музыки)</button>}
    </div>
  );
}

// ───────── карта ─────────

function MapPick({ client, s, me, mode }: { client: GameClient; s: GameState; me: Player; mode: 'landing' | 'move' }) {
  const el = useRef<HTMLDivElement>(null);
  const view = useRef<MapView | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [sent, setSent] = useState(false);
  const st = s.stage;
  const allowed: number[] = st.t === 'move' ? [...st.options, ...st.options2]
    : st.t === 'landing' ? Object.keys(s.prefs).map(Number).filter((c) => !st.blocked.includes(c)) : [];
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;

  useEffect(() => {
    let dead = false;
    MapView.create(el.current!, { interactive: true }).then((v) => {
      if (dead) return v.destroy();
      view.current = v;
      v.onTap = (code) => { if (allowedRef.current.includes(code)) { setSel(code); vibrate(15); } };
      refresh();
      if (st.t === 'move') v.focus([me.pref!, ...allowed], false, 4);
      else v.fitAll(false);
    });
    return () => { dead = true; view.current?.destroy(); };
  }, []);

  const refresh = () => {
    const v = view.current;
    if (!v) return;
    v.update({
      prefs: s.prefs,
      players: s.joinOrder.map((id) => s.players[id]).filter(Boolean),
      highlight: st.t === 'move' ? st.options : undefined,
      highlight2: st.t === 'move' ? st.options2 : undefined,
      blocked: st.t === 'landing' ? st.blocked : undefined,
      selected: sel,
      arrow: st.t === 'move' && sel && me.pref ? (st.options.includes(sel) ? [me.pref, sel] : prefPath(me.pref, sel)) : null,
      activePid: me.id,
      machines: machinesOf(s.settings),
      shops: s.settings.shopPrefs,
    });
  };
  useEffect(refresh, [sel, s.v]);

  const confirm = () => {
    if (!sel || sent) return;
    setSent(true);
    client.pick(mode, sel);
    vibrate(40);
  };
  return (
    <div class="mappick">
      <div class="mappick-head">
        <b>{mode === 'landing' ? 'Выбери место высадки' : 'Куда идём?'}</b>
        {st.t === 'landing' && <TimerBar start={st.deadline - s.settings.landingTime * 1000} end={st.deadline} now={() => client.hostNow()} />}
      </div>
      <div class="mappick-map" ref={el} />
      <div class="mappick-foot">
        {st.t === 'move' && (
          <div class="opt-list">
            {st.options.map((c) => <button class={'btn small' + (sel === c ? ' yellow' : '')} onClick={() => setSel(c)}>{PREF[c].ru}</button>)}
            {st.options2.map((c) => <button class={'btn small two' + (sel === c ? ' yellow' : '')} onClick={() => setSel(c)}><BonusIcon b="move2" size={18} /> {PREF[c].ru}</button>)}
          </div>
        )}
        {st.t === 'move' && st.options2.length > 0 && <div class="muted small-text"><BonusIcon b="move2" size={16} /> — ход на 2 префектуры (потратит сапог)</div>}
        {st.t === 'landing' && <div class="muted small-text">Тёмные префектуры заняты или рядом с соперниками. Тапни по карте.</div>}
        <button class="btn primary big-btn" disabled={!sel || sent} onClick={confirm}>
          {!sel ? 'Выбери префектуру' : mode === 'move' ? (sent ? '✔ Идём!' : 'Пойти ➜') : `${sent ? '✔ ' : ''}Высадиться: ${PREF[sel].ru}`}
        </button>
      </div>
    </div>
  );
}

function FreeMap({ s, me }: { s: GameState; me: Player }) {
  const el = useRef<HTMLDivElement>(null);
  const view = useRef<MapView | null>(null);
  useEffect(() => {
    let dead = false;
    MapView.create(el.current!, { interactive: true }).then((v) => {
      if (dead) return v.destroy();
      view.current = v;
      upd();
      if (me.pref) v.focus([me.pref], false, 3);
    });
    return () => { dead = true; view.current?.destroy(); };
  }, []);
  const upd = () => view.current?.update({
    prefs: s.prefs,
    players: s.joinOrder.map((id) => s.players[id]).filter(Boolean),
    activePid: me.id,
    machines: machinesOf(s.settings),
      shops: s.settings.shopPrefs,
  });
  useEffect(upd, [s.v]);
  return <div class="freemap" ref={el} />;
}
