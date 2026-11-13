import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GameState, Player, PublicQuestion } from '../shared/types';
import type { Host } from '../host/host';
import { MapView } from '../map/MapView';
import { PREF, neighbors, prefName } from '../map/mapData';
import { Avatar, BonusIcon, HpBar, PixIcon, PrefIntro, ResText, SkillChips, SkillIcon, TimerBar, PixelImg, setTimerFreeze } from '../ui/common';
import { finalRank } from '../shared/titles';
import { BONUS_INFO, REWARD_INFO, SOLO_GAMES, machinesOf, prefIcons } from '../shared/settings';
import { prefBgUrl, prewarmBg, prewarmBgs, useSmoothBg } from '../shared/prefBg';
import { viewState } from '../host/debugScenes';
import { DebugMenu } from '../ui/DebugMenu';
import { fmtYen, glue, now } from '../shared/util';
import { playRhythmMusic, setSound, soundOn } from '../shared/sound';
import { RhythmBoard } from '../games/RhythmBoard';
import { PnPLayer, pnpBus } from '../games/PnP';
import { resolveMedia } from './localMedia';
import { MediaBox } from './MediaBox';
import { GroupTv } from './GroupTv';
import { DragonTv } from './DragonTv';
import { KaijuTv } from './KaijuTv';
import { SumoTv } from './SumoTv';
import { FinaleTv } from './FinaleTv';
import { hasMusic, refreshMusic, setMusic } from './bgMusic';
import { soundMs } from '../shared/sounds';
import { groupTableId, hasCustom, playSound } from '../shared/sounds';
import { useTvSounds } from './tvSounds';
import { LobbyTv, MapFlash } from './LobbyTv';
import { BetBoard, DuelSpoils, EpochBanner, EpochChip, FindPopup } from './EconTv';
import { TopicReelTv, WheelTv } from './ReelTv';
import { epochOf, ratesOf, rewardYen } from '../shared/economy';
import { LOGO_TEXT_URL, pixelLogoUrl } from '../shared/logo';
import { pixelIconUrl } from '../shared/sprites';
import { CAR_LOST, carName, dealersOf } from '../shared/cars';
import { carUrl } from '../ui/carArt';
import { RaceTv } from './RaceTv';
import { fmtRace, trackFor } from '../shared/race';

export function TvApp({ host, onNewGame }: { host: Host; onNewGame: () => void }) {
  const [, force] = useState(0);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<MapView | null>(null);
  const lastStageKey = useRef('');
  const [panel, setPanel] = useState(false); // на ТВ кнопок нет: панель ведущего только по H (отладка)
  const [debug, setDebug] = useState(false);
  const s = viewState(host.state);
  // пауза: полоски таймеров замирают
  setTimerFreeze(s.paused ? s.pausedAt ?? null : null);
  useTvSounds(s);

  // подписка на события движка
  useEffect(() => {
    let raf: any = 0;
    const raceTimers: ReturnType<typeof setTimeout>[] = [];
    const off = host.onFx((k, d) => {
      if (k === 'state') {
        // таймер, а не rAF: в фоновой вкладке rAF замирает
        if (!raf) raf = setTimeout(() => { raf = 0; force((x) => x + 1); }, 30);
        return;
      }
      const m = map.current;
      switch (k) {
        case 'question': playSound('question'); break;
        case 'answered': playSound('answered'); break;
        case 'reveal': playSound('reveal'); break;
        case 'join': playSound('join'); break;
        case 'land': playSound('land'); m?.puff(d.code); break;
        case 'arrive': playSound('arrive'); m?.puff(d.code, d.firstVisit ? 0xffffff : 0xfff27a); break;
        case 'hit': playSound('hit'); m?.hit(d.pid); break;
        case 'reward': playSound('reward'); break;
        case 'rail': playSound('rail'); break;
        case 'find': playSound('reward'); { const c = host.state.players[d.pid]?.pref; if (c) m?.puff(c, 0xfff27a); } break;
        case 'bet': playSound('coinToss'); break;
        case 'steal': playSound('reward'); break;
        case 'epoch': playSound('prize'); break;
        case 'challenge': {
          // свиток-вызов летит через карту к сопернику
          const a = host.state.players[d.pid]?.pref, b = host.state.players[d.to]?.pref;
          playSound('challenge');
          if (m && a && b) { m.focus([a, b], true, 2.6); m.fly(a, b, pixelIconUrl('bonus_scroll')); }
          break;
        }
        case 'cat': playSound('cat'); break;
        case 'lureCat': playSound('cat'); { const c = host.state.players[d.pid]?.pref; if (c) m?.puff(c, 0xfff27a); } break;
        case 'lure': playSound('lure'); { const c = host.state.players[d.pid]?.pref; if (c) m?.puff(c, 0xfff27a); } break;
        case 'akita': playSound('akita'); if (d.code) m?.puff(d.code, 0xe2453c); break;
        case 'bonusUsed': if (d.b === 'coin') playSound('coinToss'); break;
        case 'duel': playSound('duel'); break;
        case 'iaiCut': playSound('iaiCut'); break;
        case 'iaiEarly': playSound('iaiEarly'); break;
        case 'dragonOut': playSound('dragonOut'); break;
        case 'kaiju': playSound('kaiju:' + d.kind); break;
        case 'sumo': playSound('sumo:' + d.kind); break;
        case 'prize': {
          // таблица групповой игры: свой звук игры, если назначен
          playSound(d.game && hasCustom(groupTableId(d.game)) ? groupTableId(d.game) : 'prize');
          const p = host.state.players[d.pid];
          if (p?.pref) m?.confetti(p.pref);
          break;
        }
        case 'rhythm': playRhythmMusic(d.seed, d.bpm, d.beats, d.startAt, host.state.settings.audioLatencyMs); break;
        case 'pnp': pnpBus.emit(d.pid, d.ev); break;
        case 'ring': pnpBus.emit(d.pid, { k: 'ring', ...d }); break;
        case 'ringStop': pnpBus.emit(d.pid, { k: 'ringStop', ...d }); break;
        case 'chohan': pnpBus.emit(d.pid, { k: 'chohan', ...d }); break;
        case 'chop': playSound('chop'); break;
        case 'noodleBurst': playSound('noodleBurst'); break;
        case 'pit': playSound('pit'); break;
        case 'car': playSound('carBuy'); break;
        case 'carLost': playSound('carLost'); break;
        case 'raceFinish': playSound('raceFinish'); break;
        case 'race': {
          // схема трассы, потом светофор 3–2–1 и «СТАРТ!» — точно по времени старта хоста
          // своего звука трассы нет — ничего не запускаем: звук «Гонка: объявление» просто доигрывает
          if (hasCustom('raceTrack')) playSound('raceTrack');
          const r = host.state.race;
          if (r) for (const [ms, id] of [[3000, 'raceLight'], [2000, 'raceLight'], [1000, 'raceLight'], [0, 'raceGo']] as const) {
            const left = r.startAt - ms - now();
            if (left > -200) raceTimers.push(setTimeout(() => { if (host.state.race?.id === r.id) playSound(id); }, Math.max(0, left)));
          }
          break;
        }
        case 'sudoku': pnpBus.emit(d.pid, { k: 'sudokuWin', ...d }); break;
      }
    });
    return () => { off(); clearTimeout(raf); raceTimers.forEach(clearTimeout); };
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

  // команды экрану ТВ с пульта
  useEffect(() => {
    host.onTvCmd = (cmd, args) => {
      if (cmd === 'newGame') onNewGame();
      if (cmd === 'sound') { setSound(args?.on ?? !soundOn); refreshMusic(); }
      if (cmd === 'debug') setDebug((x) => !x);
      if (cmd === 'panel') setPanel((x) => !x);
    };
    return () => { host.onTvCmd = undefined; };
  }, [host]);

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
      // билет — секрет до выбора; машину видят все, поэтому её дальние ходы подсвечены
      highlight2: st.t === 'move' && s.players[st.pid]?.car ? st.options2 : undefined,
      rail: s.settings.shinkansen,
      blocked: st.t === 'landing' ? st.blocked : undefined,
      arrow: st.t === 'moving' ? st.path : null,
      activePid: s.phase === 'turns' ? activePid : null,
      machines: machinesOf(s.settings),
      shops: s.settings.shopPrefs,
      dealers: dealersOf(s.settings),
      // награды префектур видны только с начала охоты за призами
      huntRewards: !!s.endgame && s.endgame.step !== 'open',
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
        m.focus([p, ...st.options], true, 2.6);
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
  // белая вспышка над картой сразу после отсчёта
  const prevStage = useRef(st.t);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (prevStage.current === 'countdown' && st.t !== 'countdown') {
      setFlash((x) => x + 1);
    }
    prevStage.current = st.t;
  }, [st.t]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(0), 1300);
    return () => clearTimeout(t);
  }, [flash]);
  // фон префектуры — один слой от интро до конца вопроса (и выбора бонусов между ними),
  // чтобы при переходе интро → вопрос он не затухал и не мелькала карта
  const sceneCode = useRef<number | null>(null);
  let bgCode: number | null = null;
  if (st.t === 'prefIntro') bgCode = st.code;
  else if (st.t === 'question' && s.q?.pref) bgCode = s.q.pref;
  else if (st.t === 'bonus') bgCode = sceneCode.current;
  else if (st.t === 'group' && s.g) bgCode = s.g.pref;
  // зум фона — только если сцена началась с интро
  const sceneZoom = useRef(false);
  if (bgCode && sceneCode.current === null) sceneZoom.current = st.t === 'prefIntro';
  sceneCode.current = bgCode;
  const sceneBg = useSmoothBg(prefBgUrl(bgCode));
  // увеличенные копии фонов для зума готовим заранее: все — в фоне, цель хода — пока фишка идёт
  useEffect(() => { prewarmBgs(); }, []);
  useEffect(() => { if (st.t === 'moving') prewarmBg(st.to); }, [st.t === 'moving' ? st.to : null]);

  // эпоха перекрашивает интерфейс (фон, панели, рамки)
  const ep = epochOf(s);
  useEffect(() => { document.documentElement.dataset.epoch = String(ep); }, [ep]);

  const inDuel = !!s.duel && ['duelPick', 'question', 'rhythm', 'duelResult', 'bonus'].includes(st.t) && s.duel.mode !== 'race';
  // список игроков: до 7 — одна колонка (6–7 — плотные карточки), больше — две
  const nPlayers = s.joinOrder.filter((id) => s.players[id]).length;
  const hasList = s.phase !== 'lobby' && st.t !== 'wheel' && st.t !== 'end';
  const bigPanel = st.t === 'group' || (st.t === 'question' && !!(s.q?.answerImages || s.q?.media?.type === 'image' || s.q?.media?.type === 'video'));

  // фоновая музыка: карта всю игру, во время дуэли — боевая; тишина в ритм-батле (своя музыка)
  // и в вопросах с аудио/видео; в обычных вопросах тише
  const qMedia = st.t === 'question' && (s.q?.media?.type === 'audio' || s.q?.media?.type === 'video');
  // иайдо — в тишине, чтобы был слышен «кин!»; джа-одори — под свои барабаны
  const iaiQuiet = st.t === 'group' && s.g?.game === 'iaido' && s.g.phase === 'draw';
  // музыка карты — только пока видна карта: интро префектуры, её вопрос и групповые игры идут в тишине
  const mapHidden = !!bgCode || st.t === 'prefIntro' || st.t === 'group' || st.t === 'dragon' || st.t === 'kaiju' || !!s.sumo;
  // своя музыка (вкладка «Звуки» → «Фоновая музыка»): у обычных вопросов и у каждой групповой игры
  const ownTrack = s.duel ? null
    : (st.t === 'question' || st.t === 'bonus') && hasMusic('question') ? 'question'
    : st.t === 'group' && s.g && s.g.phase !== 'intro' ? 'group:' + s.g.game
    : st.t === 'dragon' && s.dr ? 'group:dragon'
    : st.t === 'kaiju' && s.kj ? 'group:godzilla'
    : s.sumo && hasMusic('sumo') ? 'sumo'
    : null;
  // гонка: музыка трассы → общая музыка гонки → музыка дуэли
  const raceKind = s.duel?.mode === 'race' ? s.race?.kind ?? trackFor(PREF[s.players[s.duel.defender]?.pref ?? 0]?.region) : null;
  const raceTrack = raceKind ? (hasMusic('race:' + raceKind) ? 'race:' + raceKind : hasMusic('race') ? 'race' : 'duel') : null;
  // начало игры: интро — песня после вылета логотипа; тропа — своя музыка или та же песня; отсчёт — тишина
  const introAt = st.t === 'lobby' && st.show === 'intro' ? st.at ?? 0 : 0;
  const [introSong, setIntroSong] = useState(false);
  useEffect(() => {
    setIntroSong(false);
    if (!introAt) return;
    const t = setTimeout(() => setIntroSong(true), Math.max(0, introAt + (soundMs('introSting') || 1500) - now()));
    return () => clearTimeout(t);
  }, [introAt]);
  const lobbyTrack = st.t === 'lobby' ? (st.show === 'intro' ? (introSong ? 'intro' : null) : st.show === 'blank' ? null : hasMusic('lobby') ? 'lobby' : 'intro') : null;
  const calibTrack = s.phase === 'calib' && hasMusic('calib') && !qMedia ? 'calib' : null;
  const track = st.t === 'lobby' ? lobbyTrack : st.t === 'countdown' ? null : calibTrack ? calibTrack
    : st.t === 'rhythm' || (st.t === 'dragon' && s.dr?.phase === 'play') || qMedia || iaiQuiet ? null
    : raceTrack ? raceTrack : s.duel ? 'duel' : ownTrack && hasMusic(ownTrack) ? ownTrack : mapHidden ? null : 'map';
  useEffect(() => { setMusic(track, st.t === 'question' && (track === 'map' || track === 'duel')); }, [track, st.t]);

  return (
    <div class={'tv' + (hasList ? ' has-list' : '') + (nPlayers > 7 && hasList ? ' wide-list' : '') + (bigPanel ? ' big-panel' : '') + (st.t === 'question' && s.q?.context === 'duel' && s.duel ? ' duel-q' : '') + (st.t === 'dragon' && s.dr ? ' dragon-on' : '')}>
      <div class="tv-map" ref={mapEl} />
      {sceneBg.src
        ? <img class={'tv-qbg' + (sceneZoom.current ? ' zoom' : '') + (sceneBg.smooth ? ' smooth' : '')} key="scene-bg" src={sceneBg.src} alt="" draggable={false} />
        : st.t === 'question' && <div class="tv-qdim" />}
      {st.t !== 'lobby' && st.t !== 'countdown' && <TopBar s={s} />}
      {hasList && <PlayerList s={s} />}
      {(st.t === 'lobby' || st.t === 'countdown') && <Lobby s={s} host={host} />}
      {flash > 0 && <MapFlash key={flash} />}
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
            {st.options.map((c) => <span class="chip">{s.prefs[c]?.rev ? PREF[c].ru : '?'}</span>)}
          </div>
          {!s.players[st.pid]?.online && <div class="muted" style={{ fontSize: '0.7em' }}>Игрок не на связи — случайный ход через 15 c (или Пробел)</div>}
        </Prompt>
      )}
      {st.t === 'moving' && <Prompt><Avatar p={s.players[st.pid]} size={40} /> {s.players[st.pid]?.name} <PixIcon id="ui_right" size={28} /> <b>{s.prefs[st.to]?.rev ? `${PREF[st.to].ru} ${PREF[st.to].ja}` : '???'}</b></Prompt>}
      {inDuel && !(st.t === 'question' && s.q?.context === 'duel') && <DuelHud s={s} />}
      {st.t === 'bonus' && <BonusPrompt s={s} />}
      {st.t === 'duelBet' && <BetBoard s={s} />}
      {st.t === 'find' && <FindPopup s={s} />}
      {st.t === 'epoch' && <EpochBanner s={s} />}
      {st.t === 'prefIntro' && <PrefIntro key={st.code} code={st.code} who={s.players[st.pid]} bgLayer icons={st.note ? ['ui_plus'] : prefIcons(s.settings, st.code, s.prefs[st.code])} />}
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
      {st.t === 'race' && s.race && <RaceTv key={s.race.id} s={s} r={s.race} />}
      {st.t === 'duelResult' && s.duel && <DuelResult s={s} />}
      {st.t === 'reel' && <TopicReelTv s={s} />}
      {st.t === 'wheel' && <WheelTv s={s} />}
      {st.t === 'shop' && (
        <Prompt>
          <Avatar p={s.players[st.pid]} size={40} /> <b>{s.players[st.pid]?.name}</b> {st.noShop ? (st.entered ? 'в автосалоне' : 'у автосалона') : st.entered ? 'в магазине' : 'у магазина'} {st.noShop ? <PixIcon id={'emb_' + st.dealer} size={32} /> : <PixIcon id="shop" size={32} />}
          <div class="prompt-timer"><TimerBar start={st.deadline - s.settings.shopTime * 1000} end={st.deadline} now={now} /></div>
        </Prompt>
      )}
      {st.t === 'extraTurn' && (
        <Prompt>
          {/* доп. ход — секрет, пока игрок не решил им воспользоваться */}
          <Avatar p={s.players[st.pid]} size={40} /> <b>{s.players[st.pid]?.name}</b> заканчивает ход…
        </Prompt>
      )}
      {st.t === 'group' && s.g && <GroupTv s={s} imgs={host.engine.groupImgs} iaiSignal={host.engine.iaiSignal} />}
      {st.t === 'dragon' && s.dr && <DragonTv s={s} />}
      {st.t === 'kaiju' && s.kj && <KaijuTv s={s} />}
      {s.sumo && (st.t === 'sumo' || st.t === 'duelPick' || st.t === 'reel') && <SumoTv s={s} picking={st.t !== 'sumo'} />}
      {st.t === 'reward' && <RewardPopup s={s} />}
      {st.t === 'prize' && <PrizePopup s={s} />}
      {st.t === 'end' && (st.titles ? <FinaleTv s={s} titles={st.titles} /> : <EndScreen s={s} />)}
      {s.paused && <div class="paused">ПАУЗА</div>}
      {/* «вид из глаз» тех, кто играет в соло-игры — только поверх карты; скрываем, а не убираем, чтобы не сбить анимацию */}
      <PnPLayer s={s} hidden={!!sceneBg.src || ['question', 'rhythm', 'end', 'lobby'].includes(st.t)} />
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
  if (urls.length === 1) return <PixelImg class="logo-img" src={urls[0]} alt="BIG GAME 2" />;
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
      {s.phase !== 'lobby' && <EpochChip s={s} />}
      {s.endgame?.step === 'hunt' && <div class="chip hunt-chip">Охота за призами</div>}
      {s.endgame?.step === 'final' && s.phase === 'turns' && <div class="chip hunt-chip">{finalLeft(s) === 1 ? 'Последний круг' : `Финал: осталось ${finalLeft(s)}`}</div>}
      {s.phase !== 'lobby' && <div class="chip">Комната {s.room}</div>}
    </div>
  );
}

/** финальных кругов осталось (вместе с текущим) */
const finalLeft = (s: GameState) => Math.max(1, Math.min(4, s.settings.finalRounds ?? 3) - (s.endgame?.played ?? 0));

function PlayerList({ s }: { s: GameState }) {
  const order = s.turnOrder.length ? s.turnOrder : s.joinOrder;
  const cur = s.phase === 'turns' ? s.turnOrder[s.turnIdx] : null;
  const answered = new Set(s.q?.answered ?? []);
  const combat = s.settings.topics.filter((t) => t.combat);
  const ids = order.filter((id) => s.players[id]);
  return (
    <div class={'plist' + (ids.length > 7 ? ' cols-2' : ids.length > 5 ? ' dense' : '')}>
      {ids.map((id) => {
        const p = s.players[id];
        const done = answered.has(id) && s.q && !s.q.revealed;
        return (
          <div key={id} class={'pcard' + (cur === id ? ' current' : '') + (p.hp <= 0 ? ' ko' : '') + (p.online ? '' : ' off')} style={{ '--frame': p.color, '--pc': p.color } as any}>
            {/* имя — светлая плашка с тёмным текстом: читается с дивана; у ходящего она жёлтая */}
            <div class="pc-head">
              <span class="pname">{p.name}</span>
              {p.car && <span class="pc-car"><img src={carUrl(p.car)} alt="" /></span>}
              {p.busy && <span class="pc-busy" title={SOLO_GAMES[p.busy]?.doing}><PixIcon id={p.busy} size={20} /></span>}
              {done && <span class="ans-check"><PixIcon id="ui_check" size={20} /></span>}
              {!p.online && <span class="pc-off">нет связи</span>}
            </div>
            <div class="pc-body">
              <div class="pc-av"><Avatar p={p} size={56} dim={p.hp <= 0} /></div>
              <div class="pc-info">
                <div class="pc-money">
                  <span class="pc-yen">{fmtYen(p.yen)}</span>
                  <span class="pc-stars"><PixIcon id="stars" size={20} />{p.stars}</span>
                  {/* бонусы и спецвопросы секретны: на ТВ их не показываем, раскрываются только при использовании */}
                </div>
                <HpBar hp={p.hp} max={p.maxHp} />
              </div>
            </div>
            {/* скиллы — одной строкой во всю ширину: боевых тем бывает 9 */}
            <div class={'pc-skills' + (combat.length > 5 ? ' many' : '')} style={{ '--n': combat.length } as any}><SkillChips topics={combat} stats={p.stats} size={22} grid /></div>
          </div>
        );
      })}
    </div>
  );
}

function Lobby({ s, host }: { s: GameState; host: Host }) {
  const url = joinUrl(s.room, host.net.mode);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const warn = local && /localhost|127.0.0.1/.test(url)
    ? 'QR ведёт на localhost — телефоны не смогут открыть его. ' + (host.net.mode === 'supabase' ? 'Добавь VITE_PUBLIC_URL (адрес GitHub Pages) в .env и перезапусти.' : 'Открой эту страницу по сетевому адресу (см. вывод npm run dev).')
    : null;
  return <LobbyTv s={s} url={url} warn={warn} />;
}

function Banner({ text, sub, big, avatar }: { text: string; sub?: string; big?: boolean; avatar?: Player }) {
  return (
    <div class={'banner' + (big ? ' big' : '')}>
      <div class="banner-inner pop">
        {avatar && <Avatar p={avatar} size={80} />}
        <div class="banner-text"><ResText text={text} size={48} /></div>
        {sub && <div class="banner-sub"><ResText text={sub} size={32} /></div>}
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
                  <td class="calib-name"><span class="row"><Avatar p={p} size={32} /> {p.name}</span></td>
                  {topics.map((t) => <td class="calib-skill">{p.stats[t.id] ?? 0}</td>)}
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
            {st.picked[id] ? (st.picked[id] === 'none' ? ' — нет' : <> <BonusIcon b={st.picked[id] as 'fifty1'} size={20} /></>) : ' …'}
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
          {q.special && <span class="chip special"><PixIcon id="special" size={18} /> СПЕЦВОПРОС</span>}
          {q.prize ? <span class="chip prize-chip">🏆 ПРИЗОВОЙ{q.prize > 1 ? ` · ранг ${q.prize}` : ''}</span> : null}
          {q.cycle && <span class="chip">🔁 до верного ответа</span>}
        </div>
        {q.prize && !q.revealed ? <div class="qnote">Отвечает только {s.players[q.participants[0]]?.name ?? 'ходящий'} — приз не делится</div> : null}
        {q.media?.type === 'image' && <img class="qmedia" src={resolveMedia(q.media.url)} alt="" />}
        {q.media?.type === 'audio' && <audio class="qaudio" src={resolveMedia(q.media.url)} autoPlay controls />}
        {q.media?.type === 'video' && <video class="qmedia" src={resolveMedia(q.media.url)} autoPlay playsInline />}
        <div class="qtext">{glue(q.text)}</div>
        {!q.reading && <div class={'qanswers' + (imgs ? ' imgs' : '')}>
          {q.answers.map((a, i) => {
            // флаги: чужой неверный выбор не раскрываем — просто «неверно» у игрока внизу
            const hideWrong = q.flag && i !== q.correct;
            const cls = q.revealed ? (i === q.correct ? ' correct' : choosers(i).length && !hideWrong ? ' wrong' : ' dim') : '';
            return (
              <div class={'qans' + cls}>
                {a.image ? <img src={a.image} alt="" /> : <span class="qans-text">{a.text}</span>}
                {q.revealed && !hideWrong && (
                  <span class="qchoosers">
                    {choosers(i).map((p) => <Avatar p={p} size={30} />)}
                  </span>
                )}
              </div>
            );
          })}
        </div>}
        {!q.revealed && !q.reading && <TimerBar start={q.startAt} end={q.deadline} now={now} big />}
        {q.revealed && q.correct === undefined && <div class="qnote">Верного ответа нет — правильный не показываем, вопрос вернётся</div>}
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
                {q.revealed && q.flag && !ok && <span class="qres">{q.choices?.[id] == null ? 'нет ответа' : 'неверно'}</span>}
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
      <div class={'fighter-av' + (hurt ? ' hurt' : '')} key={hurt ? d!.lastHit!.n : 0}><Avatar p={p} size={128} idle flip={side === 'right'} /></div>
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
  // соперники смотрят друг на друга: левый вправо, правый влево
  const side = (p: Player, role: string) => (
    <div class={'duel-side' + (p.id === d.defender ? ' def' : '') + (d.asker === p.id ? ' asking' : '') + (d.lastHit?.to === p.id ? ' hurt' : '')} key={p.id + (d.lastHit?.to === p.id ? hitKey : '')}>
      <Avatar p={p} size={64} idle flip={p.id === d.defender} />
      <div class="col" style={{ gap: 4, minWidth: 160 }}>
        <div><b>{p.name}</b> <span class="muted">{role}</span></div>
        <HpBar hp={p.hp} max={p.maxHp} />
        <div class="row small-stats">
          <SkillChips topics={s.settings.topics.filter((t) => t.combat)} stats={p.stats} size={18} />
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
          w ? <><Avatar p={w} size={90} /><div class="banner-text">{w.name} побеждает{d.mode === 'race' ? ' в гонке!' : d.ko ? ' нокаутом!' : ' по очкам!'}</div>{d.mode === 'race' && s.race && <div class="banner-sub">{s.race.players.map((id) => `${s.players[id]?.name}: ${s.race!.times[id] != null ? fmtRace(s.race!.times[id]!) : 'сход'}`).join(' · ')}</div>}{d.ko && <div class="banner-sub">+¥{rewardYen(s.settings.reward.duelWinYen, ratesOf(s))} · +{s.settings.reward.duelWinStars} <PixIcon id="stars" size={32} /></div>}<DuelSpoils s={s} /></>
            : <><div class="banner-text">{d.mode === 'race' ? 'Ничья — обе машины целы' : 'Ничья'}</div><DuelSpoils s={s} /></>
        ) : d.mode === 'rhythm' && s.rhythm ? (
          <>
            <div class="banner-text">Ритм: итог</div>
            {s.rhythm.players.map((id) => <div class="banner-sub">{s.players[id]?.name}: {s.rhythm!.scores[id] ?? '—'}</div>)}
          </>
        ) : null}
        {d.over && <CarLost s={s} />}
      </div>
    </div>
  );
}

/** проигравший остался без машины: как именно — случайная история */
function CarLost({ s }: { s: GameState }) {
  const lost = s.duel?.carLost;
  const p = lost ? s.players[lost.pid] : null;
  if (!lost || !p) return null;
  const how = CAR_LOST.find((x) => x.id === lost.how) ?? CAR_LOST[0];
  return (
    <div class={'car-lost how-' + how.id}>
      <img class="car-lost-img" src={carUrl(lost.car, 6)} alt="" />
      <div class="car-lost-text">
        <b>{how.text}</b>
        <span>{p.name}: {carName(lost.car)} — {how.sub}</span>
        <span class="muted">Остов сдан на металлолом — за монетку{p.akita ? '. Акита-ину выпрыгнула и дальше бежит сама' : ''}</span>
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
        <div class="banner-sub">Награда префектуры {PREF[st.pref].ru}: <ResText text={st.text} size={32} /></div>
        {st.pickTopic && <div class="banner-sub muted">Выбирает спецтему на телефоне…</div>}
        {st.reward === 'bonus' && <div class="banner-sub muted">Крутит барабан бонуса на телефоне…</div>}
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
        <div class="reward-icon spin"><PixIcon id="prize" size={96} /></div>
        <div class="banner-text">ПРИЗ!</div>
        {p && <Avatar p={p} size={96} />}
        <div class="banner-text">{p?.name}</div>
        <div class="banner-sub"><ResText text={st.text} size={32} /></div>
      </div>
    </div>
  );
}

function EndScreen({ s }: { s: GameState }) {
  const ps = finalRank(Object.values(s.players));
  return (
    <div class="overlay-center">
      <div class="panel calib pop">
        <h2>Финал</h2>
        <table>
          <tbody>
            {ps.map((p, i) => (
              <tr>
                <td>{i + 1}</td>
                <td class="calib-name"><span class="row"><Avatar p={p} size={32} /> {p.name}</span></td>
                <td><PixIcon id="stars" /> {p.stars}</td>
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
      <button class="btn small" title="Пробел" onClick={() => host.ctl(s.phase === 'lobby' ? 'start' : 'next')}><PixIcon id="ui_play" size={14} /> Далее</button>
      <button class="btn small" title="P" onClick={() => host.ctl('pause')}>{s.paused ? <><PixIcon id="ui_play" size={14} /> Продолжить</> : <><PixIcon id="ui_pause" size={14} /> Пауза</>}</button>
      <button class="btn small" title="F" onClick={toggleFullscreen}><PixIcon id="ui_fullscreen" size={16} /></button>
      <button class="btn small" onClick={() => { setSound(!snd); setSnd(!snd); refreshMusic(); }}><PixIcon id={snd ? 'ui_sound' : 'ui_mute'} size={16} /></button>
      <button class="btn small" onClick={() => { if (confirm('Завершить игру и показать итоги?')) host.ctl('end'); }}><PixIcon id="ui_flag" size={16} /></button>
      <button class="btn small" onClick={() => { if (confirm('Начать новую игру? Текущая будет потеряна.')) onNewGame(); }}><PixIcon id="ui_plus" size={16} /></button>
      <button class="btn small" title="Отладка: любой экран игры" onClick={onDebug}><PixIcon id="ui_bug" size={16} /></button>
      <MediaBox questions={host.engine.questions} compact />
      <span class="chip" title="Режим сети">{netLabel} · {host.net.status === 'online' ? 'онлайн' : host.net.status}</span>
      <span class="muted" style={{ fontSize: 12 }}>H — скрыть</span>
    </div>
  );
}
