import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player, PublicQuestion } from '../shared/types';
import { Avatar, HpBar, LETTERS, TimerBar } from '../ui/common';
import { BONUS_INFO, HATS, PLAYER_COLORS } from '../shared/settings';
import { PREF, prefName } from '../map/mapData';
import { fmtYen, vibrate } from '../shared/util';
import { MapView } from '../map/MapView';
import { RhythmBoard } from '../games/RhythmBoard';
import { Pachinko } from './Pachinko';
import { RingGame } from './RingGame';
import { Shop } from './Shop';
import { unlockAudio } from '../shared/sound';

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
  const s = client.s;
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
        <h2>BIG GAME 2</h2>
        <div class="jp">ビッグゲーム 2 · комната {client.room}</div>
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

type Attention = 'question' | 'bonus' | 'landing' | 'move' | 'duelPick' | 'rhythm' | null;

function attention(s: GameState, me: Player): Attention {
  const st = s.stage;
  if (st.t === 'question' && s.q?.participants.includes(me.id)) return 'question';
  if (st.t === 'bonus' && st.pids.includes(me.id) && !(me.id in st.picked)) return 'bonus';
  if (st.t === 'landing' && st.pid === me.id) return 'landing';
  if (st.t === 'move' && st.pid === me.id) return 'move';
  if (st.t === 'duelPick' && st.pid === me.id) return 'duelPick';
  if (st.t === 'rhythm' && s.rhythm?.players.includes(me.id)) return 'rhythm';
  return null;
}

function Game({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const att = attention(s, me);
  const [tab, setTab] = useState<'home' | 'shop' | 'map' | 'pachinko' | 'ring'>('home');
  const lastAtt = useRef<Attention>(null);
  useEffect(() => {
    if (att && att !== lastAtt.current) vibrate([60, 40, 60]);
    lastAtt.current = att;
  }, [att]);
  const hasPachinko = me.pref != null && s.settings.pachinkoPrefs.includes(me.pref);
  const hasRing = me.pref != null && s.settings.ringPrefs.includes(me.pref);
  const ballsKey = `bg_balls_${client.room}_${me.id}`;
  const hasBalls = Number(localStorage.getItem(ballsKey) ?? 0) > 0;
  useEffect(() => {
    if ((tab === 'pachinko' && !hasPachinko && !hasBalls) || (tab === 'ring' && !hasRing)) setTab('home');
  }, [hasPachinko, hasRing, tab]);

  return (
    <div class="phone game">
      <Header client={client} s={s} me={me} />
      <div class="main">
        {/* мини-игры остаются смонтированными (на паузе), пока идёт вопрос */}
        {(tab === 'pachinko' || hasBalls) && (hasPachinko || hasBalls) && (
          <div style={{ display: !att && tab === 'pachinko' ? 'contents' : 'none' }}>
            <Pachinko client={client} s={s} me={me} paused={!!att || tab !== 'pachinko'} onExit={() => setTab('home')} />
          </div>
        )}
        {att === 'question' && s.q && <QuestionView key={s.q.n} client={client} s={s} q={s.q} me={me} />}
        {att === 'bonus' && <BonusPick client={client} s={s} me={me} />}
        {(att === 'landing' || att === 'move') && <MapPick key={att} client={client} s={s} me={me} mode={att} />}
        {att === 'duelPick' && <DuelPick client={client} s={s} me={me} />}
        {att === 'rhythm' && s.rhythm && (
          <div class="rhythm-wrap">
            <RhythmBoard key={s.rhythm.id} r={s.rhythm} now={() => client.hostNow()} onDone={(score, hits, total) => client.send({ t: 'rhythm', pid: me.id, id: s.rhythm!.id, score, hits, total })} />
          </div>
        )}
        {!att && tab === 'home' && <Home client={client} s={s} me={me} />}
        {!att && tab === 'shop' && <Shop client={client} s={s} me={me} />}
        {!att && tab === 'map' && <FreeMap s={s} me={me} />}
        {!att && tab === 'ring' && hasRing && <RingGame client={client} s={s} me={me} onExit={() => setTab('home')} />}
      </div>
      {!att && (
        <nav class="tabbar">
          <button class={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}>🏠<span>Игра</span></button>
          <button class={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}>🗾<span>Карта</span></button>
          <button class={tab === 'shop' ? 'on' : ''} onClick={() => setTab('shop')}>🛒<span>Магазин</span></button>
          {(hasPachinko || hasBalls) && <button class={tab === 'pachinko' ? 'on' : ''} onClick={() => setTab('pachinko')}>🎰<span>Пачинко</span></button>}
          {hasRing && <button class={tab === 'ring' ? 'on' : ''} onClick={() => setTab('ring')}>🎡<span>Приз</span></button>}
        </nav>
      )}
    </div>
  );
}

function Header({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  return (
    <header class="hdr" style={{ borderColor: me.color }}>
      <Avatar p={me} size={40} dim={me.hp <= 0} />
      <div class="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <div class="row" style={{ gap: 6 }}>
          <b class="ellipsis">{me.name}</b>
          <span class={'dot ' + (client.status === 'online' ? 'on' : 'off')} />
        </div>
        <HpBar hp={me.hp} max={me.maxHp} />
      </div>
      <div class="col" style={{ gap: 2, alignItems: 'flex-end' }}>
        <span>{fmtYen(me.yen)}</span>
        <span>⭐ {me.stars}{me.specials ? ` · 💥${me.specials}` : ''}</span>
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
    case 'reward': return `${n(st.pid)}: ${st.text}`;
    case 'duelPick': return `Дуэль: ${n(st.pid)} выбирает тему`;
    case 'rhythm': return 'Ритм-дуэль на ТВ!';
    case 'duelResult': return 'Итоги дуэли';
    case 'prize': return `🏆 ${n(st.pid)} получает приз!`;
    case 'end': return 'Игра окончена!';
  }
}

function Home({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const topics = s.settings.topics.filter((t) => t.combat);
  const order = s.turnOrder.indexOf(me.id);
  return (
    <div class="scroll pad col">
      <div class="status-card slide-up" key={s.stage.t}>{stageText(s, me)}</div>
      <div class="panel col">
        <div class="row"><span class="muted">Где ты:</span> <b>{me.pref ? `${PREF[me.pref].ru} ${PREF[me.pref].ja}` : '—'}</b></div>
        {order >= 0 && <div class="row"><span class="muted">Порядок хода:</span> <b>{order + 1}</b> из {s.turnOrder.length}</div>}
        <div class="muted">Сила по темам</div>
        <div class="row wrap">
          {topics.map((t) => <span class="chip" style={{ borderColor: t.color }}>{t.name}: <b>{me.stats[t.id] ?? 0}</b></span>)}
        </div>
        <div class="muted">Бонусы</div>
        <div class="row wrap">
          {(['fifty1', 'fifty2', 'move2'] as const).map((b) => (
            <span class="chip">{BONUS_INFO[b].icon} {BONUS_INFO[b].short}: <b>{me.bonuses[b]}</b></span>
          ))}
          <span class="chip">💥 Спецвопросы: <b>{me.specials}</b></span>
        </div>
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
            <span class="muted">{prefName(p.pref)}</span> <span>❤{p.hp}</span>
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
  const expired = client.hostNow() > q.deadline;
  const locked = choice !== null || expired || q.revealed || q.answered.includes(me.id);
  const pickAns = (i: number) => {
    if (locked || removed.includes(i)) return;
    setChoice(i);
    myChoices.set(q.n, i);
    client.answer(q.n, i);
    vibrate(30);
  };
  const ok = q.revealed && q.correct === (choice ?? q.choices?.[me.id]);
  const imgs = q.answerImages;
  return (
    <div class={'question scroll pad col' + (q.revealed ? (ok ? ' ok' : ' bad') : '')}>
      <div class="q-title">{q.title}{q.special ? ' · 💥' : ''}</div>
      {!q.revealed && <TimerBar start={q.startAt} end={q.deadline} now={() => client.hostNow()} />}
      {q.media?.type === 'image' && <img class="q-img" src={q.media.url} alt="" />}
      {q.media?.type === 'audio' && <div class="q-tv">🎵 Слушай на ТВ</div>}
      {q.media?.type === 'video' && <div class="q-tv">🎬 Смотри на ТВ</div>}
      <div class="q-text">{q.text}</div>
      <div class={imgs ? 'q-grid' : 'q-list'}>
        {q.answers.map((a, i) => {
          const gone = removed.includes(i);
          let cls = 'q-btn';
          if (choice === i) cls += ' chosen';
          if (q.revealed && i === q.correct) cls += ' correct';
          else if (q.revealed && choice === i) cls += ' wrong';
          if (gone) cls += ' gone';
          return (
            <button class={cls} disabled={gone || (locked && choice !== i && !q.revealed)} onClick={() => pickAns(i)}>
              <span class="qletter">{LETTERS[i]}</span>
              {a.image ? <img src={a.image} alt="" /> : <span>{a.text}</span>}
            </button>
          );
        })}
      </div>
      {!q.revealed && choice !== null && <div class="center muted">Ответ принят. Ждём остальных…</div>}
      {!q.revealed && choice === null && expired && <div class="center muted">Время вышло</div>}
      {q.revealed && (
        <div class="q-result pop">
          {ok ? '✔ Верно!' : choice === null ? '⏱ Без ответа' : '✘ Неверно'}
          {q.results?.[me.id] && <div class="q-res-sub">{q.results[me.id]}</div>}
        </div>
      )}
    </div>
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
        <button class="btn yellow big-btn" onClick={() => client.pick('bonus', b)}>{BONUS_INFO[b].icon} {BONUS_INFO[b].name} (есть {me.bonuses[b]})</button>
      ))}
      <button class="btn big-btn" onClick={() => client.pick('bonus', null)}>Не хочу</button>
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
          <button class="btn big-btn" style={{ borderColor: t.color }} disabled={sent} onClick={() => send(id)}>
            {t.name} · твоя сила {me.stats[id]} / у него {foe?.stats[id]}
          </button>
        );
      })}
      {st.canSpecial && <button class="btn primary big-btn" disabled={sent} onClick={() => send('special')}>💥 Спецвопрос (сила {s.settings.specialPower}, осталось {me.specials})</button>}
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
      activePid: me.id,
      machines: { pachinko: s.settings.pachinkoPrefs, ring: s.settings.ringPrefs },
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
            {st.options2.map((c) => <button class={'btn small two' + (sel === c ? ' yellow' : '')} onClick={() => setSel(c)}>👟 {PREF[c].ru}</button>)}
          </div>
        )}
        {st.t === 'move' && st.options2.length > 0 && <div class="muted small-text">👟 — ход на 2 префектуры (потратит бонус)</div>}
        {st.t === 'landing' && <div class="muted small-text">Тёмные префектуры заняты или рядом с соперниками. Тапни по карте.</div>}
        <button class="btn primary big-btn" disabled={!sel || sent} onClick={confirm}>
          {sel ? `${sent ? '✔ ' : ''}${PREF[sel].ru} ${PREF[sel].ja}` : 'Выбери префектуру'}
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
    machines: { pachinko: s.settings.pachinkoPrefs, ring: s.settings.ringPrefs },
  });
  useEffect(upd, [s.v]);
  return <div class="freemap" ref={el} />;
}
