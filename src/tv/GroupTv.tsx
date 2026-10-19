// Групповая игра на ТВ: задание → «рисуют…» → показ работ по одной → галерея для голосования → итоги.
import type { GameState, GroupPublic } from '../shared/types';
import { washiCanvas } from '../games/brush';
import { Avatar, TimerBar } from '../ui/common';
import { GROUP_GAMES, groupTime, senryuLines } from '../shared/settings';
import { PREF } from '../map/mapData';
import { now } from '../shared/util';

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

export function GroupTv({ s, imgs }: { s: GameState; imgs: Record<string, string | null> }) {
  const g = s.g;
  if (!g) return null;
  const info = GROUP_GAMES[g.game];
  const head = (
    <div class="group-head">
      <span class="group-game">{info.name} <span class="jp">{info.ja}</span></span>
      <span class="group-task">{g.prompt}</span>
    </div>
  );
  return (
    <div class="group-tv">
      {g.phase === 'intro' && (
        <div class="group-intro pop">
          <div class="group-kanji">{info.kanji}</div>
          <div class="group-sub">Групповая игра · {PREF[g.pref]?.ru}</div>
          <div class="group-title">{info.name}</div>
          <div class="group-prompt">{g.prompt}</div>
          <div class="muted">{info.how}. Время: {groupTime(s.settings, g.game)} c</div>
        </div>
      )}
      {(g.phase === 'draw' || (g.phase === 'show' && g.showIdx < 0)) && (
        <div class="group-draw">
          {head}
          <div class="group-brush">{{ calligraphy: '🖌️', fukuwarai: '🙈', senryu: '✍️', dragon: '🐉' }[g.game]}</div>
          <div class="group-sub">{g.phase === 'draw' ? info.doing : 'Собираем работы…'}</div>
          {g.phase === 'draw' && <TimerBar start={g.startAt} end={g.deadline} now={now} big />}
          <Who s={s} g={g} done={g.submitted} />
        </div>
      )}
      {g.phase === 'show' && g.showIdx >= 0 && (
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
      {g.phase === 'results' && <Results s={s} g={g} imgs={imgs} />}
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
  const podium = ranked.filter((id) => g.places?.[id]);
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
        {ranked.filter((id) => !g.places?.[id]).map((id) => (
          <div class="qpart done"><Avatar p={s.players[id]} size={30} /> <span>{s.players[id].name}</span> <span class="muted">№{g.order.indexOf(id) + 1} · {g.points?.[id] ?? 0}</span></div>
        ))}
      </div>
    </div>
  );
}
