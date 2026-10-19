// Предпросмотр интро для админки (tv.html?preview=1, во фрейме вкладки «Интро»): настоящие
// компоненты и стили ТВ без игры — интро префектуры, свиток групповой игры, окошко соло-игры.
// Админка присылает postMessage { kind, id, pref, n }; новое n — анимация с начала. Звук играет сама админка.
import { useEffect, useState } from 'preact/hooks';
import type { GameState, GroupGameId, GroupPublic, Player, SoloGameId } from '../shared/types';
import { PrefIntro } from '../ui/common';
import { DEFAULT_SETTINGS, groupTasksFor } from '../shared/settings';
import { prefBgUrl } from '../shared/prefBg';
import { GroupScroll } from './GroupTv';
import { DragonTv } from './DragonTv';
import { PnPLayer } from '../games/PnP';
import { getParam } from '../shared/util';
import mapUrl from '../img/map_wide.png';

export interface PreviewMsg { type: 'bg-preview'; kind: 'pref' | 'group' | 'solo'; id: string; pref?: number; n: number }

const mk = (id: string, name: string, color: string, hat: number, extra: Partial<Player> = {}): Player => ({
  id, name, color, hat, pref: 13, hp: 7, maxHp: 10, yen: 1200, stars: 3, stats: {}, calib: {},
  bonuses: { fifty1: 0, fifty2: 0, move2: 0, turn2: 0 } as any, specials: 0, prizes: [], online: true, busy: null, ...extra,
});
const PLAYERS = [mk('a', 'Дима', '#4dabff', 0), mk('b', 'Тануки', '#ff4d6d', 2), mk('c', 'Кицунэ', '#ffd23f', 1), mk('d', 'Нэко', '#5ce16b', 3)];

function fakeState(extra: Partial<GameState>): GameState {
  return {
    players: Object.fromEntries(PLAYERS.map((p) => [p.id, p])), joinOrder: PLAYERS.map((p) => p.id), turnOrder: [], turnIdx: 0, round: 1,
    stage: { t: 'lobby' }, prefs: {}, q: null, duel: null, rhythm: null, g: null, dr: null, log: [], settings: DEFAULT_SETTINGS, paused: false, phase: 'turns',
    ...extra,
  } as any;
}

function groupPublic(game: GroupGameId, pref: number): GroupPublic {
  const task = groupTasksFor(DEFAULT_SETTINGS, game)[0];
  return {
    id: 1, game, prompt: task?.text ?? '', pref, phase: 'intro', players: PLAYERS.map((p) => p.id), startAt: 0, deadline: 0,
    submitted: [], showIdx: 0, voteRound: 0, order: [], votes: {}, scores: {},
    ...(game === 'fukuwarai' ? { face: (task as any)?.face ?? 'okame' } : {}),
    ...(game === 'sashimi' ? { fish: 'tuna', total: 1200, target: 300 } : {}),
  } as any;
}

export function IntroPreview() {
  const [m, setM] = useState<PreviewMsg>(() => ({
    type: 'bg-preview', kind: (getParam('kind') as any) ?? 'pref', id: getParam('id') ?? '13', pref: Number(getParam('pref') ?? 0) || undefined, n: 0,
  }));
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.data?.type === 'bg-preview') setM(e.data); };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
  return <div class="tv intro-preview" key={m.kind + m.id + m.n}><Scene m={m} /></div>;
}

function Scene({ m }: { m: PreviewMsg }) {
  if (m.kind === 'pref') return <PrefIntro code={Number(m.id)} who={PLAYERS[0]} reward="money" />;
  if (m.kind === 'group') {
    const game = m.id as GroupGameId;
    const pref = m.pref ?? 13;
    if (game === 'dragon') {
      const d = { id: 1, pref, phase: 'intro', players: PLAYERS.map((p) => p.id), alive: PLAYERS.map((p) => p.id), out: {}, startAt: 0, ...DEFAULT_SETTINGS.group.dragon! };
      return <DragonTv s={fakeState({ dr: d as any, stage: { t: 'dragon' } })} />;
    }
    const bg = prefBgUrl(pref);
    return (
      <>
        {bg ? <img class="tv-qbg" src={bg} alt="" draggable={false} /> : <div class="tv-qdim" />}
        <div class="group-tv"><GroupScroll g={groupPublic(game, pref)} /></div>
      </>
    );
  }
  // соло-игра: на ТВ поверх карты открывается окошко того, кто играет
  const p = { ...PLAYERS[0], busy: m.id as SoloGameId };
  return (
    <>
      <img class="tv-qbg intro-preview-map" src={mapUrl} alt="" draggable={false} />
      <PnPLayer s={fakeState({ players: { [p.id]: p }, joinOrder: [p.id] })} />
    </>
  );
}
