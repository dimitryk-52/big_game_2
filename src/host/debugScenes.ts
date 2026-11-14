// Отладочные сцены: любой экран игры по кнопке, без прохождения сценария.
// Сцена кладётся в state.debug и подменяет stage/q/duel/rhythm у ТВ и телефонов (см. viewState),
// сам сценарий игры при этом не трогается — «Закрыть» возвращает всё как было.
import type { BonusId, DebugView, GameState, PublicQuestion, Question, RewardType, Stage } from '../shared/types';
import { OKINAWA, PREF, PREF_CODES, neighbors, atDistance, path } from '../map/mapData';
import { OKINAWA_NOTE } from '../shared/settings';
import { FLAG_CODES, flagUrl } from '../shared/flags';
import { TITLES } from '../shared/titles';
import { makeReelSpin, makeWheelSpin } from '../shared/spin';
import type { CarId } from '../shared/cars';

export const DEBUG_SCENES: { id: string; name: string; group: string }[] = [
  { id: 'prefIntro', name: 'Интро префектуры', group: 'Префектура' },
  { id: 'okinawaIntro', name: 'Интро Окинавы (первое воскрешение)', group: 'Префектура' },
  { id: 'question', name: 'Вопрос префектуры', group: 'Префектура' },
  { id: 'questionReveal', name: 'Ответ на вопрос', group: 'Префектура' },
  { id: 'questionImages', name: 'Вопрос с картинками', group: 'Префектура' },
  { id: 'flagQuestion', name: 'Флаговый вопрос', group: 'Префектура' },
  { id: 'flagWrong', name: 'Цикличный: все ошиблись (ответ скрыт)', group: 'Префектура' },
  { id: 'prizeQuestion', name: 'Призовой вопрос', group: 'Префектура' },
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
  { id: 'race', name: 'Гонка (машина против машины)', group: 'Дуэль' },
  { id: 'carLost', name: 'Дуэль: итог, машина потеряна', group: 'Дуэль' },
  { id: 'duelBet', name: 'Дуэль: ставки зрителей', group: 'Дуэль' },
  { id: 'duelSteal', name: 'Дуэль: кража и выплаты ставок', group: 'Дуэль' },
  { id: 'end', name: 'Финал', group: 'Дуэль' },
  { id: 'find:coin', name: 'Находка: монетка', group: 'Находки и эпохи' },
  { id: 'find:cheat', name: 'Находка: шпаргалка', group: 'Находки и эпохи' },
  { id: 'find:wallet', name: 'Находка: кошелёк', group: 'Находки и эпохи' },
  { id: 'find:neko', name: 'Находка: манэки-нэко', group: 'Находки и эпохи' },
  { id: 'find:map', name: 'Находка: старая карта', group: 'Находки и эпохи' },
  { id: 'find:rickshaw', name: 'Находка: рикша', group: 'Находки и эпохи' },
  { id: 'find:coupon', name: 'Находка: купон', group: 'Находки и эпохи' },
  { id: 'find:ticket', name: 'Находка: билет', group: 'Находки и эпохи' },
  { id: 'find:kitsune', name: 'Находка: кицунэ (видят все)', group: 'Находки и эпохи' },
  { id: 'epoch:1', name: 'Эпоха Мэйдзи', group: 'Находки и эпохи' },
  { id: 'epoch:2', name: 'Эпоха Сёва', group: 'Находки и эпохи' },
  { id: 'find:token', name: 'Находка: жетон (аутсайдеру)', group: 'Находки и эпохи' },
  { id: 'reel:spin', name: 'Барабан темы (крутится сам)', group: 'Барабаны и финал' },
  { id: 'reel:bonus', name: 'Награда: бонус (барабан на телефоне)', group: 'Барабаны и финал' },
  { id: 'hunt', name: 'Охота за призами', group: 'Барабаны и финал' },
  { id: 'final', name: 'Осталось 3 круга', group: 'Барабаны и финал' },
  { id: 'wheel', name: 'Колесо призов', group: 'Барабаны и финал' },
  { id: 'wheelPrize', name: 'Колесо: окно приза', group: 'Барабаны и финал' },
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
  // соперник — следующий по списку игрок (чтобы остальные могли быть зрителями)
  const other = pids.length > 1 ? pids[(pids.indexOf(pid) + 1) % pids.length] : pid;
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
    case 'okinawaIntro': return view({ t: 'prefIntro', code: OKINAWA, pid, note: OKINAWA_NOTE });
    case 'question': return view({ t: 'question' }, { q: mkQ(findQ((q) => !q.answerImages && !q.special && !q.media), {}) });
    case 'questionImages': return view({ t: 'question' }, { q: mkQ(findQ((q) => !!q.answerImages), {}) });
    case 'flagQuestion':
    case 'flagWrong': {
      const opts = [pref, ...FLAG_CODES.filter((c) => c !== pref).sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
      const q = mkQ(questions[0], { text: `Какой флаг у префектуры ${PREF[pref].ru}?`, answers: opts.map((c) => ({ image: flagUrl(c) })), answerImages: true, topic: 'geo', cycle: true, flag: true });
      if (!q || kind === 'flagQuestion') return view({ t: 'question' }, { q });
      const right = opts.indexOf(pref);
      const wrongs = [0, 1, 2, 3].filter((i) => i !== right);
      const choices = Object.fromEntries(pids.map((id, i) => [id, i % 3 === 2 ? null : wrongs[i % 3]]));
      return view({ t: 'question' }, { q: { ...q, revealed: true, choices, results: { [pid]: `+¥${s.settings.reward.moverWrongYen}` }, answered: pids } });
    }
    case 'prizeQuestion': return view({ t: 'question' }, { q: mkQ(findQ((q) => !q.answerImages && !q.special && !q.media), { prize: 1, participants: [pid] }) });
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
      const text = { money: `+¥${s.settings.reward.prefMoney}`, stars: `+${s.settings.reward.prefStars} ★`, bonus: 'Бонус', special: 'Спецвопрос', turn2: 'Дополнительный ход', prize: 'Крутим рулетку…' }[reward];
      const topics = s.settings.topics.filter((t) => t.special).map((t) => t.id);
      return view({ t: 'reward', pid, reward, text, pref,
        ...(reward === 'bonus' ? { bonus: 'fifty2' as BonusId, secret: 'Бонус: 50/50' } : {}),
        ...(reward === 'special' && topics.length ? { pickTopic: { topics, deadline: now + 30000 } } : {}) });
    }
    case 'prize': return view({ t: 'prize', pid, text: s.settings.prizeNames[0] ?? 'Приз' });
    case 'calibResult': return view({ t: 'calibResult' });
    case 'landing': {
      const occupied = pids.map((id) => s.players[id].pref).filter((x): x is number => !!x);
      return view({ t: 'landing', pid, deadline: now + s.settings.landingTime * 1000, blocked: occupied.flatMap((o) => [o, ...neighbors(o)]) });
    }
    case 'turnStart': return view({ t: 'turnStart', pid });
    case 'move': return view({ t: 'move', pid, options: neighbors(pref), options2: atDistance(pref, 2), options3: (s.settings.shinkansen ?? []).filter((c) => c !== pref), lure: true, challenge: pids.filter((id) => id !== pid) });
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
    case 'race': {
      const players = [pid, other];
      const k = Math.abs(base.n);
      const cars = { [pid]: s.players[pid].car ?? 'subaru', [other]: s.players[other].car ?? 'mitsubishi' } as Record<string, CarId>;
      return view({ t: 'race' }, { duel: duel({ mode: 'race' }), race: { id: base.n, seed: 4242 + k, kind: (['touge', 'wangan', 'snow', 'coast'] as const)[k % 4], startAt: now + 6500, players, cars, splits: { [pid]: [], [other]: [] }, times: { [pid]: null, [other]: null } } });
    }
    case 'carLost':
      return view({ t: 'duelResult' }, { duel: duel({ over: true, winner: pid, stolen: 240, carLost: { pid: other, car: s.players[other].car ?? 'honda', how: (['crash', 'stall', 'tow', 'fine', 'tanuki'] as const)[Math.abs(base.n) % 5] } }) });
    case 'rhythm': {
      const players = [pid, other];
      return view({ t: 'rhythm' }, { duel: duel({ mode: 'rhythm' }), rhythm: { id: base.n, seed: 12345, bpm: 110, startAt: now + 2500, beats: 32, players, scores: Object.fromEntries(players.map((p) => [p, null])) } });
    }
    case 'duelBet': {
      const spect = pids.filter((id) => id !== pid && id !== other);
      const bets = Object.fromEntries(spect.map((id, i) => [id, i % 2 ? { [other]: 500 } : { [pid]: 100 * (i + 1) }]));
      return view({ t: 'duelBet', deadline: now + (s.settings.betTime ?? 15) * 1000, done: [] }, { duel: duel({ asker: null, mode: null, topic: null, bets }) });
    }
    case 'duelSteal': {
      const spect = pids.filter((id) => id !== pid && id !== other);
      const payouts = Object.fromEntries(spect.map((id, i) => [id, i % 2 ? -500 : 100 * (i + 1)]));
      return view({ t: 'duelResult' }, { duel: duel({ over: true, winner: pid, ko: true, stolen: 340, payouts, lastHit: { to: other, dmg: 3, n: 1 } }) });
    }
    case 'find': return view({ t: 'find', pid, kind: (sub ?? 'coin') as any, ...(sub === 'wallet' || sub === 'kitsune' ? { amount: 400 } : {}), ...(sub === 'kitsune' ? { from: other } : {}) });
    case 'epoch': return view({ t: 'epoch', epoch: Number(sub) || 1 });
    case 'reel': {
      if (sub === 'bonus') return view({ t: 'reward', pid, reward: 'bonus', text: 'Бонус', pref, secret: 'Крути барабан бонуса!' });
      const topics = s.settings.topics.filter((t) => t.combat).map((t) => t.id);
      const segs = topics.length < 4 ? [...topics, ...topics] : topics;
      return view({ t: 'reel', pid, why: 'pref', segs, deadline: 0, spin: makeReelSpin(segs.map(() => 1), now + 600) });
    }
    case 'hunt': return view({ t: 'banner', text: 'Охота за призами!', sub: 'Над префектурами — 12 наград, которые ещё никто не забрал. Ответь верно первым — и она твоя!', big: true });
    case 'final': return view({ t: 'banner', text: 'Осталось 3 круга', sub: 'Призы разыграны — финал: свободное перемещение по карте', big: true });
    case 'wheel': {
      const left = { common: 6, uncommon: 4, rare: 2 };
      const segs = [{ id: 'common' as const, w: 30 }, { id: 'uncommon' as const, w: 20 }, { id: 'rare' as const, w: 2 }];
      return view({ t: 'wheel' }, {
        wheel: {
          left, segs, spinner: pid, spin: makeWheelSpin(segs.map((x) => x.w), now + 600), last: null,
          tokens: Object.fromEntries(pids.map((id, i) => [id, (i * 2) % 5])),
          history: [{ pid: other, tier: 'common' }, { pid: other, tier: 'uncommon' }, { pid, tier: 'rare' }],
        },
      });
    }
    case 'wheelPrize': {
      const left = { common: 5, uncommon: 4, rare: 1 };
      const segs = [{ id: 'common' as const, w: 25 }, { id: 'uncommon' as const, w: 20 }, { id: 'rare' as const, w: 1 }];
      return view({ t: 'wheel' }, {
        wheel: {
          left, segs, spinner: null, spin: null, last: { pid, tier: 'rare' }, order: pids, turn: pid,
          tokens: Object.fromEntries(pids.map((id, i) => [id, (i * 2) % 5])),
          history: [{ pid: other, tier: 'common' }, { pid, tier: 'rare' }],
        },
      });
    }
    case 'end': {
      // пример титулов: Император — первому, последнему — «Турист», остальным 1–3 случайных
      const pool = TITLES.filter((t) => t.id !== 'emperor').map((t) => t.id).sort(() => Math.random() - 0.5);
      const titles = Object.fromEntries(pids.map((id, i) => [id,
        i === 0 ? ['emperor', ...pool.splice(0, 2)] : i === pids.length - 1 && pids.length > 2 ? ['tourist'] : pool.splice(0, 1 + (i % 3))]));
      return view({ t: 'end', titles });
    }
  }
  return null;
}

/** то, что рисуют экраны: игра с подменой из отладочной сцены */
export function viewState(s: GameState): GameState {
  const d = s.debug;
  if (!d) return s;
  return { ...s, stage: d.stage, q: d.q !== undefined ? d.q : s.q, duel: d.duel !== undefined ? d.duel : s.duel, rhythm: d.rhythm !== undefined ? d.rhythm : s.rhythm, race: d.race !== undefined ? d.race : s.race, wheel: d.wheel !== undefined ? d.wheel : s.wheel, paused: false };
}

export const ALL_PREFS = PREF_CODES;
