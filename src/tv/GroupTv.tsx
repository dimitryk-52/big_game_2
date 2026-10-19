// Групповая игра на ТВ: задание → «рисуют…» → показ работ по одной → галерея для голосования → итоги.
import type { GameState, GroupPublic } from '../shared/types';
import { washiCanvas } from '../games/brush';
import { Avatar, TimerBar } from '../ui/common';
import { GROUP_GAMES, senryuLines } from '../shared/settings';
import { IaidoResults, IaidoTv } from './IaidoTv';
import { PREF } from '../map/mapData';
import { now } from '../shared/util';
import { useEffect, useState } from 'preact/hooks';
import { FishBoard, Scale } from '../games/FishBoard';
import { FISH } from '../games/sashimi';

let paperUrl: string | undefined;
const paper = () => (paperUrl ??= washiCanvas(450, 600, 7).toDataURL());

/** работа на листе васи с красной печатью-номером: тушь (каллиграфия), лицо (фукуварай) или стих (сэнрю) */
export function Sheet({ g, img, n, big }: { g: GroupPublic; img: string | null | undefined; n?: number; big?: boolean }) {
  const poem = g.game === 'senryu';
  return (
    <div class={'sheet' + (big ? ' big' : '') + (g.game === 'fukuwarai' ? ' plain' : '') + (poem ? ' poem' : '')} style={{ backgroundImage: `url(${paper()})` }}>
      {poem ? (
        <div class="poem-lines">
          {senryuLines(g.prompt).map((l) => <div>{l}</div>)}
          <div class="poem-mine">{img?.startsWith('text:') ? img.slice(5) : '…'}</div>
        </div>
      ) : img ? <img src={img} alt="" draggable={false} /> : <div class="sheet-empty">{img === null ? 'пустой лист' : '…'}</div>}
      {n != null && <div class="hanko">{n}</div>}
    </div>
  );
}

/** фукуварай: «Собери лицо …» с именем в нужном падеже */
const FACE_CALL: Record<string, string> = { okame: 'Собери лицо Окамэ!', daruma: 'Собери лицо Дарумы!', oni: 'Собери лицо демона Óни!' };

/**
 * Баннер начала групповой игры — свиток-какэдзику поверх фона префектуры
 * (интро префектуры — горизонтальная полоса, обычные баннеры — тёмная плашка).
 */
function GroupScroll({ g }: { g: GroupPublic }) {
  const info = GROUP_GAMES[g.game];
  const call = g.game === 'calligraphy' ? g.prompt : g.game === 'fukuwarai' ? FACE_CALL[g.face ?? ''] ?? info.call
    : g.game === 'sashimi' ? `${g.prompt}: отрежь ${g.target} г` : info.call;
  return (
    <div class="gscroll">
      <div class="gscroll-rod" />
      <div class="gscroll-paper" style={{ backgroundImage: `url(${paper()})` }}>
        <div class="gscroll-sub">Играют все · {PREF[g.pref]?.ru}</div>
        <div class="gscroll-kanji">{info.kanji}</div>
        <div class="gscroll-name">{info.name} <span>{info.ja}</span></div>
        <div class="gscroll-call">{call}</div>
        <div class="gscroll-how">{info.how}</div>
        <div class="gscroll-seal">{info.ja.slice(0, 2)}</div>
      </div>
      <div class="gscroll-rod" />
    </div>
  );
}

export function GroupTv({ s, imgs, iaiSignal }: { s: GameState; imgs: Record<string, string | null>; iaiSignal?: { round: number; at: number; decoyAt?: number } | null }) {
  const g = s.g;
  if (!g) return null;
  const info = GROUP_GAMES[g.game];
  const head = (
    <div class="group-head">
      <span class="group-game">{info.name} <span class="jp">{info.ja}</span></span>
      <span class="group-task">{g.prompt}{g.game === 'sashimi' && <> · цель <b>{g.target} г</b> из {g.total} г</>}</span>
    </div>
  );
  return (
    <div class="group-tv">
      {g.phase === 'intro' && <GroupScroll g={g} />}
      {g.game === 'iaido' && g.phase === 'draw' && <IaidoTv s={s} g={g} sig={iaiSignal ?? null} />}
      {g.game !== 'iaido' && (g.phase === 'draw' || (g.phase === 'show' && g.showIdx < 0)) && (
        <div class="group-draw">
          {head}
          {g.game === 'sashimi'
            ? <FishBoard fish={g.fish ?? 'tuna'} view={{}} scale={5} class="big" />
            : <div class="group-brush">{{ calligraphy: '🖌️', fukuwarai: '🙈', senryu: '✍️', iaido: '⚔️', sashimi: '🔪', dragon: '🐉' }[g.game]}</div>}
          <div class="group-sub">{g.phase === 'draw' ? info.doing : 'Собираем работы…'}</div>
          {g.phase === 'draw' && <TimerBar start={g.startAt} end={g.deadline} now={now} big />}
          <Who s={s} g={g} done={g.submitted} />
        </div>
      )}
      {g.phase === 'show' && g.showIdx >= 0 && g.game === 'sashimi' && <SashimiShow s={s} g={g} head={head} />}
      {g.phase === 'show' && g.showIdx >= 0 && g.game !== 'sashimi' && (
        <div class="group-show">
          {head}
          <div class="group-sub">Работа {g.showIdx + 1} из {g.order.length}</div>
          <Sheet key={g.showIdx} g={g} img={imgs[g.order[g.showIdx]]} n={g.showIdx + 1} big />
        </div>
      )}
      {g.phase === 'vote' && (
        <div class="group-vote">
          <div class="group-head">
            <span class="group-game">Голосуем за {g.voteRound} место <span class="muted">· {4 - g.voteRound} очк.</span></span>
            <span class="group-task">За свою работу голосовать нельзя</span>
          </div>
          <Gallery g={g} imgs={imgs} />
          <TimerBar start={g.startAt} end={g.deadline} now={now} big />
          <Who s={s} g={g} done={g.voted} />
        </div>
      )}
      {g.phase === 'results' && (g.game === 'iaido'
        ? <div class="group-results iai-final"><div class="group-head"><span class="group-game">Итоги · {info.name} <span class="jp">{info.ja}</span></span><span class="group-task">{g.prompt}</span></div><IaidoResults s={s} g={g} /></div>
        : g.game === 'sashimi' ? <SashimiResults s={s} g={g} /> : <Results s={s} g={g} imgs={imgs} />)}
    </div>
  );
}

function Gallery({ g, imgs }: { g: GroupPublic; imgs: Record<string, string | null> }) {
  const n = g.order.length;
  return (
    <div class={'gallery' + (n > 6 ? ' many' : '')}>
      {g.order.map((id, i) => <Sheet key={id} g={g} img={imgs[id]} n={i + 1} />)}
    </div>
  );
}

function Who({ s, g, done }: { s: GameState; g: GroupPublic; done: string[] }) {
  return (
    <div class="qparts">
      {g.players.map((id) => {
        const p = s.players[id];
        if (!p) return null;
        return (
          <div class={'qpart' + (done.includes(id) ? ' done' : ' waiting')}>
            <Avatar p={p} size={36} /> <span>{p.name}</span>{done.includes(id) && <span class="ans-check">✔</span>}
          </div>
        );
      })}
    </div>
  );
}

function Results({ s, g, imgs }: { s: GameState; g: GroupPublic; imgs: Record<string, string | null> }) {
  const ranked = [...g.players].filter((id) => s.players[id]).sort((a, b) => (g.points?.[b] ?? 0) - (g.points?.[a] ?? 0));
  const podium = ranked.filter((id) => (g.places?.[id] ?? 9) <= 3);
  const medal = ['', '🥇', '🥈', '🥉'];
  return (
    <div class="group-results">
      <div class="group-head"><span class="group-game">Итоги · {GROUP_GAMES[g.game].name}</span><span class="group-task">{g.prompt}</span></div>
      <div class="podium" style={{ "--k": Math.min(1, 3 / Math.max(1, podium.length)) } as any}>
        {podium.map((id) => {
          const p = s.players[id];
          const pl = g.places![id];
          return (
            <div class={'podium-item place' + pl + ' pop'}>
              <Sheet g={g} img={imgs[id]} n={g.order.indexOf(id) + 1} />
              <div class="podium-name"><span class="medal">{medal[pl]}</span> <Avatar p={p} size={32} /> {p.name}</div>
              <div class="podium-pts">{g.points?.[id]} очк. · {g.awards?.[id]}</div>
            </div>
          );
        })}
        {!podium.length && <div class="group-sub">Никто не получил голосов</div>}
      </div>
      <div class="qparts">
        {ranked.filter((id) => (g.places?.[id] ?? 9) > 3).map((id) => (
          <div class="qpart done">{g.places?.[id] && <b>{g.places[id]}.</b>} <Avatar p={s.players[id]} size={30} /> <span>{s.players[id].name}</span> <span class="muted">№{g.order.indexOf(id) + 1} · {g.points?.[id] ?? 0}</span> {g.awards?.[id] && <span class="iai-res-award">{g.awards[id]}</span>}</div>
        ))}
      </div>
    </div>
  );
}

/** вес на весах набегает от нуля */
function CountUp({ to, target, ms = 1200 }: { to: number; target: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <Scale grams={v} label={v === to ? `промах ${Math.abs(to - target)} г` : 'взвешиваем…'} />;
}

function SashimiShow({ s, g, head }: { s: GameState; g: GroupPublic; head: any }) {
  const id = g.order[g.showIdx];
  const p = s.players[id];
  const grams = g.grams?.[id] ?? 0;
  const diff = grams - (g.target ?? 0);
  const [done, setDone] = useState(false);
  useEffect(() => { setDone(false); const t = setTimeout(() => setDone(true), 1300); return () => clearTimeout(t); }, [id]);
  return (
    <div class="group-show sashimi-show">
      {head}
      <div class="group-sub">Кусок {g.showIdx + 1} из {g.order.length}{g.showIdx === g.order.length - 1 ? ' · самый точный' : ''}</div>
      {p && <div class="sashimi-who pop" key={id}><Avatar p={p} size={48} /> {p.name}</div>}
      <FishBoard key={id} fish={g.fish ?? 'tuna'} view={{ cut: g.cuts?.[id] ?? null }} scale={5} class="big" />
      <div class="sashimi-scale-row">
        <CountUp key={id} to={grams} target={g.target ?? 0} />
        <div class={'sashimi-diff' + (done ? ' pop' : '')} style={{ visibility: done ? 'visible' : 'hidden' }}>
          цель {g.target} г<br /><b class={Math.abs(diff) <= (g.target ?? 0) * 0.05 ? 'good' : ''}>{diff > 0 ? '+' : ''}{diff} г</b>
        </div>
      </div>
    </div>
  );
}

function SashimiResults({ s, g }: { s: GameState; g: GroupPublic }) {
  const ranked = Object.keys(g.grams ?? {}).filter((id) => s.players[id]).sort((a, b) => (g.points?.[a] ?? 0) - (g.points?.[b] ?? 0));
  const marks = ranked.map((id) => ({ t: g.cuts![id], color: s.players[id].color }));
  const medal = ['', '🥇', '🥈', '🥉'];
  return (
    <div class="group-results sashimi-results">
      <div class="group-head"><span class="group-game">Итоги · Сашими · {FISH[g.fish ?? 'tuna'].name}</span><span class="group-task">цель {g.target} г</span></div>
      <FishBoard fish={g.fish ?? 'tuna'} view={{ marks }} scale={5} class="big" />
      <div class="sashimi-rank">
        {ranked.map((id) => {
          const p = s.players[id];
          const pl = g.places?.[id];
          return (
            <div class={'qpart done' + (pl ? ' place' + pl : '')}>
              <span class="medal">{pl ? medal[pl] : ''}</span> <Avatar p={p} size={32} /> <span style={{ color: p.color }}>{p.name}</span>
              <span>{g.grams![id]} г</span> <span class="muted">±{g.points?.[id]}</span> {g.awards?.[id] && <b>{g.awards[id]}</b>}
            </div>
          );
        })}
        {!ranked.length && <div class="group-sub">Никто не отрезал</div>}
      </div>
    </div>
  );
}
