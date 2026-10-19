// Отладочные сцены: любой экран игры по кнопке, без прохождения сценария.
// Сцена кладётся в state.debug и подменяет stage/q/duel/rhythm у ТВ и телефонов (см. viewState),
// сам сценарий игры при этом не трогается — «Закрыть» возвращает всё как было.
import type { BonusId, DebugView, GameState, PublicQuestion, Question, RewardType, Stage } from '../shared/types';
import { PREF, PREF_CODES, neighbors, atDistance, path } from '../map/mapData';

export const DEBUG_SCENES: { id: string; name: string; group: string }[] = [
  { id: 'prefIntro', name: 'Интро префектуры', group: 'Префектура' },
  { id: 'question', name: 'Вопрос префектуры', group: 'Префектура' },
  { id: 'questionReveal', name: 'Ответ на вопрос', group: 'Префектура' },
  { id: 'questionImages', name: 'Вопрос с картинками', group: 'Префектура' },
  { id: 'reward:money', name: 'Награда: йены', group: 'Награды' },
  { id: 'reward:stars', name: 'Награда: звёзды', group: 'Награды' },
  { id: 'reward:bonus', name: 'Награда: бонус', group: 'Награды' },
  { id: 'reward:special', name: 'Награда: спецвопрос', group: 'Награды' },
  { id: 'reward:prize', name: 'Награда: приз (рулетка)', group: 'Награды' },
  { id: 'prize', name: 'Приз выпал', group: 'Награды' },
  { id: 'calibQuestion', name: 'Калибровка: ответ', group: 'Калибровка и ходы' },
  { id: 'calibResult', name: 'Итоги калибровки', group: 'Калибровка и ходы' },
  { id: 'landing', name: 'Высадка', group: 'Калибровка и ходы' },
  { id: 'turnStart', name: 'Начало хода', group: 'Калибровка и ходы' },
  { id: 'move', name: 'Выбор хода', group: 'Калибровка и ходы' },
  { id: 'moving', name: 'Перемещение (стрелка)', group: 'Калибровка и ходы' },
  { id: 'bonus', name: 'Выбор бонуса', group: 'Калибровка и ходы' },
  { id: 'banner', name: 'Баннер', group: 'Калибровка и ходы' },
  { id: 'duelPick', name: 'Дуэль: выбор темы', group: 'Дуэль' },
  { id: 'duelQuestion', name: 'Дуэль: вопрос', group: 'Дуэль' },
  { id: 'duelResult', name: 'Дуэль: итог', group: 'Дуэль' },
  { id: 'rhythm', name: 'Ритм-батл', group: 'Дуэль' },
  { id: 'end', name: 'Финал', group: 'Дуэль' },
];

export interface DebugArgs {
  scene: string;
  pref?: number;
  pid?: string;
}

/** собирает сцену; null — сцена не получилась (нет игроков/вопросов) */
export function buildDebugScene(s: GameState, questions: Question[], a: DebugArgs, now: number): DebugView | null {
  const pids = s.joinOrder.filter((id) => s.players[id]);
  const pid = a.pid && s.players[a.pid] ? a.pid : pids[0];
  if (!pid) return null;
  const other = pids.find((id) => id !== pid) ?? pid;
  const pref = a.pref && PREF[a.pref] ? a.pref : s.players[pid].pref ?? 13;
  const base = { n: -(Date.now() % 1e9) };

  const findQ = (f: (q: Question) => boolean) => questions.find((q) => f(q) && q.answers.every((x) => x.text || x.image)) ?? questions[0];
  const mkQ = (q: Question | undefined, extra: Partial<PublicQuestion>): PublicQuestion | null => q ? {
    qid: q.id, n: base.n, context: 'pref', title: `${PREF[pref].ru} ${PREF[pref].ja}`, text: q.text, media: q.media, answers: q.answers,
    answerImages: !!q.answerImages, topic: q.topic, special: !!q.special, startAt: now + 300, deadline: now + 300 + 15000,
    participants: pids, answered: [], removed: {}, revealed: false, pref, ...extra,
  } : null;
  const revealed = (q: PublicQuestion | null, results: (id: string, ok: boolean) => string | undefined): PublicQuestion | null => {
    if (!q) return null;
    const choices: Record<string, number | null> = {};
    const res: Record<string, string> = {};
    const correct = 0;
    pids.forEach((id, i) => {
      choices[id] = i % 3 === 2 ? null : i % 2 ? 1 : correct;
      const r = results(id, choices[id] === correct);
      if (r) res[id] = r;
    });
    return { ...q, revealed: true, correct, choices, results: res, answered: pids };
  };
  const duel = (extra: Partial<NonNullable<GameState['duel']>> = {}) => ({
    attacker: pid, defender: other, round: 1, asker: pid, topic: 'music', special: false, mode: 'quiz' as const,
    lastHit: null, winner: null, over: false, ...extra,
  });
  const view = (stage: Stage, extra: Partial<DebugView> = {}): DebugView => ({ scene: a.scene, stage, ...extra });

  const [kind, sub] = a.scene.split(':');
  switch (kind) {
    case 'prefIntro': return view({ t: 'prefIntro', code: pref, pid });
    case 'question': return view({ t: 'question' }, { q: mkQ(findQ((q) => !q.answerImages && !q.special && !q.media), {}) });
    case 'questionImages': return view({ t: 'question' }, { q: mkQ(findQ((q) => !!q.answerImages), {}) });
    case 'questionReveal': {
      const q = mkQ(findQ((q) => !q.answerImages && !q.special && !q.media), {});
      return view({ t: 'question' }, { q: revealed(q, (id, ok) => (ok ? (id === pid ? `+¥${s.settings.reward.moverCorrectYen} +1★` : `+¥${s.settings.reward.otherCorrectYen}`) : undefined)) });
    }
    case 'calibQuestion': {
      const topic = s.settings.topics.find((t) => t.combat)!;
      const q = mkQ(findQ((q) => q.topic === topic.id), { context: 'calib', title: `Калибровка 1/6 · ${topic.name}` });
      if (q) delete q.pref;
      return view({ t: 'question' }, { q: revealed(q, (_id, ok) => (ok ? `+1 {skill:${topic.id}}` : undefined)) });
    }
    case 'reward': {
      const reward = (sub ?? 'money') as RewardType;
      const text = { money: `+¥${s.settings.reward.prefMoney}`, stars: `+${s.settings.reward.prefStars} ★`, bonus: 'Бонус: 50/50', special: 'Спецвопрос', turn2: 'Дополнительный ход', prize: 'Крутим рулетку…' }[reward];
      return view({ t: 'reward', pid, reward, text, pref });
    }
    case 'prize': return view({ t: 'prize', pid, text: s.settings.prizeNames[0] ?? 'Приз' });
    case 'calibResult': return view({ t: 'calibResult' });
    case 'landing': {
      const occupied = pids.map((id) => s.players[id].pref).filter((x): x is number => !!x);
      return view({ t: 'landing', pid, deadline: now + s.settings.landingTime * 1000, blocked: occupied.flatMap((o) => [o, ...neighbors(o)]) });
    }
    case 'turnStart': return view({ t: 'turnStart', pid });
    case 'move': return view({ t: 'move', pid, options: neighbors(pref), options2: atDistance(pref, 2) });
    case 'moving': {
      const to = atDistance(pref, 2)[0] ?? neighbors(pref)[0] ?? pref;
      return view({ t: 'moving', pid, from: pref, to, path: path(pref, to) });
    }
    case 'bonus': {
      const offers: Record<string, BonusId[]> = Object.fromEntries(pids.map((id) => [id, ['fifty1', 'fifty2'] as BonusId[]]));
      return view({ t: 'bonus', pids, deadline: now + s.settings.bonusTime * 1000, offers, picked: {} });
    }
    case 'banner': return view({ t: 'banner', text: 'ДУЭЛЬ!', sub: 'Так выглядит баннер', big: true });
    case 'duelPick': {
      const topics = s.settings.topics.filter((t) => t.combat).map((t) => t.id);
      return view({ t: 'duelPick', pid, deadline: now + s.settings.pickTime * 1000, topics, canSpecial: true, canRhythm: true }, { duel: duel({ asker: pid, mode: null, topic: null }) });
    }
    case 'duelQuestion': {
      const q = mkQ(findQ((q) => q.topic === 'music' && !q.answerImages), { context: 'duel', title: 'Дуэль · раунд 1 · спрашивает ' + s.players[pid].name, participants: [pid, other] });
      return view({ t: 'question' }, { q, duel: duel() });
    }
    case 'duelResult': return view({ t: 'duelResult' }, { duel: duel({ over: true, winner: pid, lastHit: { to: other, dmg: 3, n: 1 } }) });
    case 'rhythm': {
      const players = [pid, other];
      return view({ t: 'rhythm' }, { duel: duel({ mode: 'rhythm' }), rhythm: { id: base.n, seed: 12345, bpm: 110, startAt: now + 2500, beats: 32, players, scores: Object.fromEntries(players.map((p) => [p, null])) } });
    }
    case 'end': return view({ t: 'end' });
  }
  return null;
}

/** то, что рисуют экраны: игра с подменой из отладочной сцены */
export function viewState(s: GameState): GameState {
  const d = s.debug;
  if (!d) return s;
  return { ...s, stage: d.stage, q: d.q !== undefined ? d.q : s.q, duel: d.duel !== undefined ? d.duel : s.duel, rhythm: d.rhythm !== undefined ? d.rhythm : s.rhythm, paused: false };
}

export const ALL_PREFS = PREF_CODES;
