import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import QRCode from 'qrcode';
import type { GameState, Player, PublicQuestion } from '../shared/types';
import type { Host } from '../host/host';
import { MapView } from '../map/MapView';
import { PREF, neighbors, prefName } from '../map/mapData';
import { Avatar, HpBar, LETTERS, PixIcon, PrefIntro, ResText, SkillChips, SkillIcon, SkillRow, TimerBar, skillMax } from '../ui/common';
import { BONUS_INFO, REWARD_INFO } from '../shared/settings';
import { prefBgUrl, prewarmBg, prewarmBgs, useSmoothBg } from '../shared/prefBg';
import { viewState } from '../host/debugScenes';
import { DebugMenu } from '../ui/DebugMenu';
import { fmtYen, now } from '../shared/util';
import { playRhythmMusic, sfx, setSound, soundOn } from '../shared/sound';
import { RhythmBoard } from '../games/RhythmBoard';
import { PnPLayer, pnpBus } from '../games/PnP';
import { resolveMedia } from './localMedia';
import { MediaBox } from './MediaBox';
import { refreshMusic, setMusic } from './bgMusic';
import { LOGO_TEXT_URL, LOGO_URL, pixelLogoUrl } from '../shared/logo';

export function TvApp({ host, onNewGame }: { host: Host; onNewGame: () => void }) {
  const [, force] = useState(0);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<MapView | null>(null);
  const lastStageKey = useRef('');
  const [panel, setPanel] = useState(true);
  const [debug, setDebug] = useState(false);
  const s = viewState(host.state);

  // подписка на события движка
  useEffect(() => {
    let raf: any = 0;
    const off = host.onFx((k, d) => {
      if (k === 'state') {
        // таймер, а не rAF: в фоновой вкладке rAF замирает
        if (!raf) raf = setTimeout(() => { raf = 0; force((x) => x + 1); }, 30);
        return;
      }
      const m = map.current;
      switch (k) {
        case 'question': sfx.question(); break;
        case 'answered': sfx.answered(); break;
        case 'reveal': sfx.reveal(); break;
        case 'join': sfx.join(); break;
        case 'land': sfx.land(); m?.puff(d.code); break;
        case 'arrive': sfx.land(); m?.puff(d.code, d.firstVisit ? 0xffffff : 0xfff27a); break;
        case 'hit': sfx.hit(); m?.hit(d.pid); break;
        case 'reward': sfx.coin(); break;
        case 'duel': sfx.duel(); break;
        case 'prize': {
          sfx.fanfare();
          const p = host.state.players[d.pid];
          if (p?.pref) m?.confetti(p.pref);
          break;
        }
        case 'rhythm': playRhythmMusic(d.seed, d.bpm, d.beats, d.startAt, host.state.settings.audioLatencyMs); break;
        case 'pnp': pnpBus.emit(d.pid, d.ev); break;
        case 'ring': pnpBus.emit(d.pid, { k: 'ring', ...d }); break;
        case 'ringStop': pnpBus.emit(d.pid, { k: 'ringStop', ...d }); break;
      }
    });
    return () => { off(); clearTimeout(raf); };
  }, [host]);

  // карта
  useEffect(() => {
    let dead = false;
    MapView.create(mapEl.current!, { interactive: true }).then((v) => {
      if (dead) return v.destroy();
      map.current = v;
      force((x) => x + 1);
    });
    return () => { dead = true; map.current?.destroy(); };
  }, []);

  // клавиши ведущего
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space' || e.code === 'ArrowRight') { e.preventDefault(); host.ctl(host.state.phase === 'lobby' ? 'start' : 'next'); }
      if (e.code === 'KeyP') host.ctl('pause');
      if (e.code === 'KeyH') setPanel((x) => !x);
      if (e.code === 'KeyF') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [host]);

  // синхронизация карты с состоянием
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const st = s.stage;
    const players = s.joinOrder.map((id) => s.players[id]).filter(Boolean);
    const activePid = 'pid' in st ? (st as any).pid : s.turnOrder[s.turnIdx] ?? null;
    m.update({
      prefs: s.prefs,
      players,
      highlight: st.t === 'move' ? st.options : undefined,
      highlight2: st.t === 'move' ? st.options2 : undefined,
      blocked: st.t === 'landing' ? st.blocked : undefined,
      arrow: st.t === 'moving' ? st.path : null,
      activePid: s.phase === 'turns' ? activePid : null,
      machines: { pachinko: s.settings.pachinkoPrefs, ring: s.settings.ringPrefs },
    });
    const key = st.t + ':' + ('pid' in st ? (st as any).pid : '') + ':' + (st.t === 'moving' ? st.to : '');
    if (key === lastStageKey.current) return;
    lastStageKey.current = key;
    const pref = (pid: string) => s.players[pid]?.pref;
    switch (st.t) {
      case 'turnStart': {
        const p = pref(st.pid);
        if (p) m.focus([p, ...neighbors(p)], true, 2.4);
        break;
      }
      case 'move': {
        const p = pref(st.pid)!;
        m.focus([p, ...st.options, ...st.options2], true, 2.6);
        break;
      }
      case 'moving':
        m.animateMove(st.pid, st.path);
        m.focus(st.path, true, 2.6);
        break;
      case 'landing':
      case 'lobby':
      case 'calibResult':
        m.fitAll();
        break;
      case 'banner':
        if (s.phase === 'calib' || s.phase === 'landing') m.fitAll();
        break;
    }
  });

  const st = s.stage;
  // фон префектуры — один слой от интро до конца вопроса (и выбора бонусов между ними),
  // чтобы при переходе интро → вопрос он не затухал и не мелькала карта
  const sceneCode = useRef<number | null>(null);
  let bgCode: number | null = null;
  if (st.t === 'prefIntro') bgCode = st.code;
  else if (st.t === 'question' && s.q?.pref) bgCode = s.q.pref;
  else if (st.t === 'bonus') bgCode = sceneCode.current;
  // зум фона — только если сцена началась с интро
  const sceneZoom = useRef(false);
  if (bgCode && sceneCode.current === null) sceneZoom.current = st.t === 'prefIntro';
  sceneCode.current = bgCode;
  const sceneBg = useSmoothBg(prefBgUrl(bgCode));
  // увеличенные копии фонов для зума готовим заранее: все — в фоне, цель хода — пока фишка идёт
  useEffect(() => { prewarmBgs(); }, []);
  useEffect(() => { if (st.t === 'moving') prewarmBg(st.to); }, [st.t === 'moving' ? st.to : null]);

  const inDuel = !!s.duel && ['duelPick', 'question', 'rhythm', 'duelResult', 'bonus'].includes(st.t);

  // фоновая музыка: карта всю игру, во время дуэли — боевая; тишина в ритм-батле (своя музыка)
  // и в вопросах с аудио/видео; в обычных вопросах тише
  const qMedia = st.t === 'question' && (s.q?.media?.type === 'audio' || s.q?.media?.type === 'video');
  const track = st.t === 'lobby' || st.t === 'rhythm' || qMedia ? null : s.duel ? 'duel' : 'map';
  useEffect(() => { setMusic(track, st.t === 'question'); }, [track, st.t]);

  return (
    <div class={'tv' + (s.joinOrder.filter((id) => s.players[id]).length > 5 && s.phase !== 'lobby' ? ' wide-list' : '') + (st.t === 'question' && s.q?.context === 'duel' && s.duel ? ' duel-q' : '')}>
      <div class="tv-map" ref={mapEl} />
      {sceneBg.src
        ? <img class={'tv-qbg' + (sceneZoom.current ? ' zoom' : '') + (sceneBg.smooth ? ' smooth' : '')} key="scene-bg" src={sceneBg.src} alt="" draggable={false} />
        : st.t === 'question' && <div class="tv-qdim" />}
      <TopBar s={s} />
      {s.phase !== 'lobby' && <PlayerList s={s} />}
      {st.t === 'lobby' && <Lobby s={s} host={host} />}
      {st.t === 'banner' && <Banner key={st.text} text={st.text} sub={st.sub} big={st.big} />}
      {st.t === 'calibResult' && <CalibResult s={s} />}
      {st.t === 'landing' && (
        <Prompt>
          <Avatar p={s.players[st.pid]} size={40} /> <b>{s.players[st.pid]?.name}</b> выбирает место высадки
          <div class="prompt-timer"><TimerBar start={st.deadline - s.settings.landingTime * 1000} end={st.deadline} now={now} /></div>
        </Prompt>
      )}
      {st.t === 'turnStart' && <Banner key={'ts' + st.pid} text={`Ход: ${s.players[st.pid]?.name ?? ''}`} sub={`Круг ${s.round} · ${prefName(s.players[st.pid]?.pref)}`} avatar={s.players[st.pid]} />}
      {st.t === 'move' && (
        <Prompt>
          <Avatar p={s.players[st.pid]} size={40} /> <b>{s.players[st.pid]?.name}</b> выбирает, куда идти
          <div class="prompt-opts">
            {st.options.map((c) => <span class="chip">{PREF[c].ru}</span>)}
            {st.options2.map((c) => <span class="chip two">👟 {PREF[c].ru}</span>)}
          </div>
          {!s.players[st.pid]?.online && <div class="muted" style={{ fontSize: '0.7em' }}>Игрок не на связи — случайный ход через 15 c (или Пробел)</div>}
        </Prompt>
      )}
      {st.t === 'moving' && <Prompt><Avatar p={s.players[st.pid]} size={40} /> {s.players[st.pid]?.name} → <b>{PREF[st.to].ru} {PREF[st.to].ja}</b></Prompt>}
      {inDuel && !(st.t === 'question' && s.q?.context === 'duel') && <DuelHud s={s} />}
      {st.t === 'bonus' && <BonusPrompt s={s} />}
      {st.t === 'prefIntro' && <PrefIntro key={st.code} code={st.code} who={s.players[st.pid]} bgLayer reward={s.prefs[st.code]?.taken ? undefined : s.prefs[st.code]?.reward} />}
      {st.t === 'question' && s.q && <QuestionPanel key={s.q.n} s={s} q={s.q} />}
      {st.t === 'duelPick' && (
        <div class="duel-pick pop">
          <b>{s.players[st.pid]?.name}</b> выбирает тему вопроса…
          <TimerBar start={st.deadline - s.settings.pickTime * 1000} end={st.deadline} now={now} />
        </div>
      )}
      {st.t === 'rhythm' && s.rhythm && (
        <div class="tv-rhythm">
          <RhythmBoard r={s.rhythm} now={now} spectator players={s.players} />
        </div>
      )}
      {st.t === 'duelResult' && s.duel && <DuelResult s={s} />}
      {st.t === 'reward' && <RewardPopup s={s} />}
      {st.t === 'prize' && <PrizePopup s={s} />}
      {st.t === 'end' && <EndScreen s={s} />}
      {s.paused && <div class="paused">ПАУЗА</div>}
      <PnPLayer s={s} />
      {panel && <HostPanel s={s} host={host} onNewGame={onNewGame} onDebug={() => setDebug((x) => !x)} />}
      {debug && <DebugMenu s={host.state} send={(cmd, args) => host.ctl(cmd, args)} onClose={() => setDebug(false)} fx />}
    </div>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}

// Публичный адрес страниц игрока (GitHub Pages). Нужен, когда ТВ запущен локально:
// телефоны не могут открыть localhost, поэтому QR ведёт на опубликованный сайт.
const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim();

function joinUrl(room: string, mode: string) {
  const base = mode === 'supabase' && PUBLIC_URL ? (PUBLIC_URL.endsWith('/') ? PUBLIC_URL : PUBLIC_URL + '/') : location.href;
  const u = new URL('play.html', base);
  u.search = `?room=${room}`;
  const net = new URLSearchParams(location.search).get('net');
  if (net) u.search += `&net=${net}`;
  return u.toString();
}

/** надпись в левом верхнем углу: свой logo_text_px.png, иначе пиксельная надпись в стиле логотипа */
function TvLogo() {
  const [urls, setUrls] = useState<string[] | null>(LOGO_TEXT_URL ? [LOGO_TEXT_URL] : null);
  useEffect(() => {
    if (LOGO_TEXT_URL) return;
    void Promise.all([pixelLogoUrl('ビッグゲーム'), pixelLogoUrl('BIG GAME 2')]).then(setUrls);
  }, []);
  if (!urls) return <div class="logo">BIG GAME 2 <span>ビッグゲーム 2</span></div>;
  if (urls.length === 1) return <img class="logo-img" src={urls[0]} alt="BIG GAME 2" />;
  return (
    <div class="logo-px">
      <img class="logo-px-jp" src={urls[0]} alt="ビッグゲーム" />
      <img class="logo-px-en" src={urls[1]} alt="BIG GAME 2" />
    </div>
  );
}

function TopBar({ s }: { s: GameState }) {
  const phase = { lobby: 'Регистрация', calib: 'Калибровка', landing: 'Высадка', turns: `Круг ${s.round}`, end: 'Финал' }[s.phase];
  return (
    <div class="topbar">
      <TvLogo />
      <div class="chip">{phase}</div>
      {s.phase !== 'lobby' && <div class="chip">Комната {s.room}</div>}
    </div>
  );
}

function PlayerList({ s }: { s: GameState }) {
  const order = s.turnOrder.length ? s.turnOrder : s.joinOrder;
  const cur = s.phase === 'turns' ? s.turnOrder[s.turnIdx] : null;
  const answered = new Set(s.q?.answered ?? []);
  const combat = s.settings.topics.filter((t) => t.combat);
  const max = skillMax(s);
  const ids = order.filter((id) => s.players[id]);
  return (
    <div class={'plist' + (ids.length > 5 ? ' cols-2' : '')}>
      {ids.map((id) => {
        const p = s.players[id];
        return (
          <div key={id} class={'pcard' + (cur === id ? ' current' : '') + (p.hp <= 0 ? ' ko' : '')} style={{ '--frame': p.color } as any}>
            <div class="pc-top">
              <Avatar p={p} size={56} dim={p.hp <= 0} />
              <div class="pc-info">
                <div class="pc-name">
                  <span class="pname">{p.name}</span>
                  {answered.has(id) && s.q && !s.q.revealed && <span class="ans-check">✔</span>}
                  {p.busy && <span title={p.busy}>{p.busy === 'pachinko' ? '🎰' : '🎡'}</span>}
                  <span class={'dot ' + (p.online ? 'on' : 'off')} title={p.online ? 'на связи' : 'нет связи'} />
                </div>
                <HpBar hp={p.hp} max={p.maxHp} />
                <div class="pc-money">
                  <span>{fmtYen(p.yen)}</span>
                  <span class="pc-stars"><PixIcon id="stars" size={18} />{p.stars}</span>
                  {p.specials > 0 && <span>💥{p.specials}</span>}
                  {p.prizes.length > 0 && <span>🏆{p.prizes.length}</span>}
                  {(['fifty1', 'fifty2', 'move2'] as const).map((b) => p.bonuses[b] > 0 && <span>{BONUS_INFO[b].icon}{p.bonuses[b]}</span>)}
                </div>
              </div>
            </div>
            <div class="pc-skills">
              {combat.map((t) => <SkillRow t={t} value={p.stats[t.id] ?? 0} max={max} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Lobby({ s, host }: { s: GameState; host: Host }) {
  const url = joinUrl(s.room, host.net.mode);
  const [qr, setQr] = useState('');
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, scale: 8 }).then(setQr); }, [url]);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const players = s.joinOrder.map((id) => s.players[id]).filter(Boolean);
  return (
    <div class="lobby pop">
      <div class="lobby-left">
        {LOGO_URL ? <img class="lobby-logo" src={LOGO_URL} alt="BIG GAME 2" /> : <><h1>BIG GAME 2</h1><div class="jp-title">ビッグゲーム 2</div></>}
        {qr && <img class="qr" src={qr} alt="QR" />}
        <div class="room">Комната: <b>{s.room}</b></div>
        <div class="url">{url}</div>
        {local && /localhost|127.0.0.1/.test(url) && (
          <div class="warn">
            ⚠ QR ведёт на localhost — телефоны не смогут открыть его.{' '}
            {host.net.mode === 'supabase' ? 'Добавь VITE_PUBLIC_URL (адрес GitHub Pages) в .env и перезапусти.' : 'Открой эту страницу по сетевому адресу (см. вывод npm run dev).'}
          </div>
        )}
      </div>
      <div class="lobby-right">
        <h2>Игроки ({players.length}/10)</h2>
        <div class="lobby-players">
          {players.map((p) => (
            <div class="lobby-p pop" key={p.id}>
              <Avatar p={p} size={72} />
              <div>{p.name}</div>
            </div>
          ))}
          {!players.length && <div class="muted">Сканируйте QR-код телефоном…</div>}
        </div>
        <div class="row" style={{ marginTop: 24, gap: 16 }}>
          <button class="btn primary" disabled={!players.length} onClick={() => host.ctl('start')}>▶ Начать игру</button>
          <button class="btn small" onClick={() => host.ctl('addBot')}>+ бот</button>
        </div>
      </div>
    </div>
  );
}

function Banner({ text, sub, big, avatar }: { text: string; sub?: string; big?: boolean; avatar?: Player }) {
  return (
    <div class={'banner' + (big ? ' big' : '')}>
      <div class="banner-inner pop">
        {avatar && <Avatar p={avatar} size={80} />}
        <div class="banner-text">{text}</div>
        {sub && <div class="banner-sub">{sub}</div>}
      </div>
    </div>
  );
}

function Prompt({ children }: { children: any }) {
  return <div class="prompt slide-up">{children}</div>;
}

function CalibResult({ s }: { s: GameState }) {
  const topics = s.settings.topics.filter((t) => t.combat);
  return (
    <div class="overlay-center">
      <div class="panel calib pop">
        <h2>Итоги калибровки</h2>
        <table>
          <thead>
            <tr><th>Игрок</th>{topics.map((t) => <th><SkillIcon t={t} size={28} /></th>)}</tr>
          </thead>
          <tbody>
            {s.turnOrder.map((id, i) => {
              const p = s.players[id];
              return (
                <tr class="slide-up" style={{ animationDelay: `${i * 0.12}s` }}>
                  <td class="row"><Avatar p={p} size={32} /> {p.name}</td>
                  {topics.map((t) => <td class="calib-skill"><SkillRow t={t} value={p.stats[t.id] ?? 0} max={skillMax(s)} size={22} /></td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BonusPrompt({ s }: { s: GameState }) {
  const st = s.stage;
  if (st.t !== 'bonus') return null;
  return (
    <div class="bonus-prompt slide-up">
      <div>Выбор бонусов</div>
      <div class="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        {st.pids.map((id) => (
          <span class="chip">
            <Avatar p={s.players[id]} size={24} /> {s.players[id].name}
            {st.picked[id] ? (st.picked[id] === 'none' ? ' — нет' : ' ' + BONUS_INFO[st.picked[id] as 'fifty1'].icon) : ' …'}
          </span>
        ))}
      </div>
      <TimerBar start={st.deadline - s.settings.bonusTime * 1000} end={st.deadline} now={now} />
    </div>
  );
}

function QuestionPanel({ s, q }: { s: GameState; q: PublicQuestion }) {
  const topic = s.settings.topics.find((t) => t.id === q.topic);
  const imgs = q.answerImages;
  const duel = q.context === 'duel' && s.duel ? s.duel : null;
  const choosers = (i: number) => Object.entries(q.choices ?? {}).filter(([, c]) => c === i).map(([id]) => s.players[id]).filter(Boolean);
  return (
    <div class={'qwrap' + (duel ? ' duel' : '')}>
      {duel && <Fighter s={s} q={q} id={duel.attacker} role="атакует" side="left" />}
      <div class={'qpanel pop' + (q.special ? ' special' : '')}>
        <div class="qhead">
          <span class="qtitle">{q.title}</span>
          {topic && <span class="chip" style={{ '--frame': topic.color, color: topic.color } as any}>{topic.name}</span>}
          {q.special && <span class="chip special">💥 СПЕЦВОПРОС</span>}
        </div>
        {q.media?.type === 'image' && <img class="qmedia" src={resolveMedia(q.media.url)} alt="" />}
        {q.media?.type === 'audio' && <audio class="qaudio" src={resolveMedia(q.media.url)} autoPlay controls />}
        {q.media?.type === 'video' && <video class="qmedia" src={resolveMedia(q.media.url)} autoPlay playsInline />}
        <div class="qtext">{q.text}</div>
        <div class={'qanswers' + (imgs ? ' imgs' : '')}>
          {q.answers.map((a, i) => {
            const cls = q.revealed ? (i === q.correct ? ' correct' : choosers(i).length ? ' wrong' : ' dim') : '';
            return (
              <div class={'qans' + cls}>
                <span class="qletter">{LETTERS[i]}</span>
                {a.image ? <img src={a.image} alt="" /> : <span class="qans-text">{a.text}</span>}
                {q.revealed && (
                  <span class="qchoosers">
                    {choosers(i).map((p) => <Avatar p={p} size={30} />)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {!q.revealed && <TimerBar start={q.startAt} end={q.deadline} now={now} big />}
        {!duel && <div class="qparts">
          {q.participants.map((id) => {
            const p = s.players[id];
            if (!p) return null;
            const done = q.answered.includes(id);
            const ok = q.revealed && q.choices?.[id] === q.correct;
            return (
              <div class={'qpart' + (done || q.revealed ? ' done' : ' waiting') + (q.revealed ? (ok ? ' ok' : ' bad') : '')}>
                <Avatar p={p} size={36} />
                <span>{p.name}</span>
                {q.revealed && q.results?.[id] && <span class="qres"><ResText text={q.results[id]} topics={s.settings.topics} /></span>}
              </div>
            );
          })}
        </div>}
      </div>
      {duel && <Fighter s={s} q={q} id={duel.defender} role="защищается" side="right" />}
    </div>
  );
}

/** боец дуэли сбоку от вопроса: полупрозрачный, пока не ответил; после ответа — зелёный/красный */
function Fighter({ s, q, id, role, side }: { s: GameState; q: PublicQuestion; id: string; role: string; side: 'left' | 'right' }) {
  const p = s.players[id];
  if (!p) return <div class="fighter" />;
  const d = s.duel;
  const done = q.answered.includes(id) || q.revealed;
  const ok = q.revealed && q.choices?.[id] === q.correct;
  const hurt = d?.lastHit?.to === id;
  return (
    <div class={'fighter ' + side + (done ? '' : ' waiting') + (q.revealed ? (ok ? ' ok' : ' bad') : '') + (d?.asker === id ? ' asking' : '')}>
      <div class="fighter-role">{d?.asker === id ? 'спрашивает' : role}</div>
      <div class={'fighter-av' + (hurt ? ' hurt' : '')} key={hurt ? d!.lastHit!.n : 0}><Avatar p={p} size={128} /></div>
      <div class="fighter-name">{p.name}</div>
      <HpBar hp={p.hp} max={p.maxHp} />
      <SkillChips topics={s.settings.topics.filter((t) => t.combat)} stats={p.stats} size={20} />
      {q.revealed && q.results?.[id] && <div class="fighter-res"><ResText text={q.results[id]} topics={s.settings.topics} /></div>}
    </div>
  );
}

function DuelHud({ s }: { s: GameState }) {
  const d = s.duel!;
  const a = s.players[d.attacker], b = s.players[d.defender];
  if (!a || !b) return null;
  const hitKey = d.lastHit ? d.lastHit.n : 0;
  const side = (p: Player, role: string) => (
    <div class={'duel-side' + (d.asker === p.id ? ' asking' : '') + (d.lastHit?.to === p.id ? ' hurt' : '')} key={p.id + (d.lastHit?.to === p.id ? hitKey : '')}>
      <Avatar p={p} size={64} />
      <div class="col" style={{ gap: 4, minWidth: 160 }}>
        <div><b>{p.name}</b> <span class="muted">{role}</span></div>
        <HpBar hp={p.hp} max={p.maxHp} />
        <div class="row small-stats">
          <SkillChips topics={s.settings.topics.filter((t) => t.combat)} stats={p.stats} size={18} />
          {p.specials > 0 && <span>💥{p.specials}</span>}
        </div>
      </div>
      {d.lastHit?.to === p.id && <div class="dmg" key={hitKey}>−{d.lastHit.dmg}</div>}
    </div>
  );
  return (
    <div class="duel-hud slide-up">
      {side(a, 'атакует')}
      <div class="duel-vs">
        <div>VS</div>
        <div class="muted">раунд {d.round}/{s.settings.duelRounds}</div>
      </div>
      {side(b, 'защищается')}
    </div>
  );
}

function DuelResult({ s }: { s: GameState }) {
  const d = s.duel!;
  const w = d.winner ? s.players[d.winner] : null;
  return (
    <div class="banner">
      <div class="banner-inner pop">
        {d.over ? (
          w ? <><Avatar p={w} size={90} /><div class="banner-text">{w.name} побеждает!</div><div class="banner-sub">+¥{s.settings.reward.duelWinYen} · +{s.settings.reward.duelWinStars} ★</div></>
            : <div class="banner-text">Дуэль окончена</div>
        ) : d.mode === 'rhythm' && s.rhythm ? (
          <>
            <div class="banner-text">Ритм: итог</div>
            {s.rhythm.players.map((id) => <div class="banner-sub">{s.players[id]?.name}: {s.rhythm!.scores[id] ?? '—'}</div>)}
          </>
        ) : null}
      </div>
    </div>
  );
}

function RewardPopup({ s }: { s: GameState }) {
  const st = s.stage;
  if (st.t !== 'reward') return null;
  const p = s.players[st.pid];
  return (
    <div class="banner">
      <div class="banner-inner reward pop">
        <div class="reward-icon"><PixIcon id={st.reward} size={96} /></div>
        <div class="banner-text">{p?.name}</div>
        <div class="banner-sub">Награда префектуры {PREF[st.pref].ru}: {st.text}</div>
      </div>
    </div>
  );
}

function PrizePopup({ s }: { s: GameState }) {
  const st = s.stage;
  if (st.t !== 'prize') return null;
  const p = s.players[st.pid];
  return (
    <div class="banner prize">
      <div class="banner-inner pop">
        <div class="reward-icon spin">🏆</div>
        <div class="banner-text">ПРИЗ!</div>
        {p && <Avatar p={p} size={96} />}
        <div class="banner-text">{p?.name}</div>
        <div class="banner-sub">{st.text}</div>
      </div>
    </div>
  );
}

function EndScreen({ s }: { s: GameState }) {
  const ps = Object.values(s.players).sort((a, b) => b.prizes.length - a.prizes.length || b.stars - a.stars || b.yen - a.yen);
  return (
    <div class="overlay-center">
      <div class="panel calib pop">
        <h2>Финал</h2>
        <table>
          <tbody>
            {ps.map((p, i) => (
              <tr>
                <td>{i + 1}</td>
                <td class="row"><Avatar p={p} size={32} /> {p.name}</td>
                <td>🏆 {p.prizes.length}</td>
                <td>⭐ {p.stars}</td>
                <td>{fmtYen(p.yen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HostPanel({ s, host, onNewGame, onDebug }: { s: GameState; host: Host; onNewGame: () => void; onDebug: () => void }) {
  const [snd, setSnd] = useState(soundOn);
  const netLabel = useMemo(() => ({ supabase: 'Supabase', ws: 'LAN (dev)', local: 'вкладки' }[host.net.mode]), [host]);
  return (
    <div class="host-panel">
      <button class="btn small" title="Пробел" onClick={() => host.ctl(s.phase === 'lobby' ? 'start' : 'next')}>▶ Далее</button>
      <button class="btn small" title="P" onClick={() => host.ctl('pause')}>{s.paused ? '▶ Продолжить' : '⏸ Пауза'}</button>
      <button class="btn small" title="F" onClick={toggleFullscreen}>⛶</button>
      <button class="btn small" onClick={() => { setSound(!snd); setSnd(!snd); refreshMusic(); }}>{snd ? '🔊' : '🔇'}</button>
      <button class="btn small" onClick={() => { if (confirm('Завершить игру и показать итоги?')) host.ctl('end'); }}>🏁</button>
      <button class="btn small" onClick={() => { if (confirm('Начать новую игру? Текущая будет потеряна.')) onNewGame(); }}>🆕</button>
      <button class="btn small" title="Отладка: любой экран игры" onClick={onDebug}>🐞</button>
      <MediaBox questions={host.engine.questions} compact />
      <span class="chip" title="Режим сети">{netLabel} · {host.net.status === 'online' ? 'онлайн' : host.net.status}</span>
      <span class="muted" style={{ fontSize: 12 }}>H — скрыть</span>
    </div>
  );
}
