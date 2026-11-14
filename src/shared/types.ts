// Общие типы игры. Хост (ТВ) — единственный источник правды; телефоны получают
// публичное состояние и отправляют только действия игрока.

import type { Look } from './look';
import type { EpochRates, FindId, PrizeTier } from './economy';
import type { ReelSpin, WheelSpin } from './spin';
import type { CarId, CarLostId } from './cars';
import type { TrackKind } from './race';

export type TopicId = string;
export type BonusId = 'fifty1' | 'fifty2' | 'move2' | 'turn2' | 'coin' | 'ticket' | 'food' | 'cheat' | 'neko' | 'coupon' | 'scroll' | 'sashimi';
export type RewardType = 'money' | 'stars' | 'bonus' | 'special' | 'turn2' | 'prize';

export interface Topic {
  id: TopicId;
  name: string;
  /** участвует в калибровке и даёт силу в дуэлях */
  combat: boolean;
  color: string;
  /** спецтема: её вопросы задаются только как спецвопрос в дуэли */
  special?: boolean;
  /** своя пиксельная иконка из админки: строки пикселей, цвет '#rrggbb' или null — пусто */
  icon?: (string | null)[][];
}

export interface Answer {
  text?: string;
  image?: string;
}

export interface Question {
  id: string;
  text: string;
  /** медиа к вопросу: картинка дублируется на телефон, аудио/видео — только ТВ */
  media?: { type: 'image' | 'audio' | 'video'; url: string };
  answers: Answer[]; // ровно 4
  answerImages?: boolean;
  correct: number; // 0..3
  topic: TopicId;
  /** код префектуры, если вопрос привязан к ней */
  pref?: number;
  special?: boolean;
  /** своё время на ответ, сек (например, для видео) */
  time?: number;
  /** 'once' (по умолчанию) — задаётся один раз, даже при неверном ответе;
   *  'cycle' — повторяется, пока не ответят верно; правильный ответ при ошибке не показывается */
  mode?: QMode;
  /** призовой: отвечает только ходящий игрок, за верный ответ — приз этого ранга (1 — главный) */
  prize?: number;
  /** порядок среди вопросов префектуры (меньше — раньше) */
  order?: number;
  /** 'flag' — «выбери флаг префектуры»: варианты собирает игра, answers пустые */
  kind?: 'flag';
  /** сложность: для калибровки (лёгкий + средний от темы), фильтра в админке и щадящего выбора спецвопроса */
  difficulty?: Difficulty;
  /** точно попадает в калибровку (раньше случайных той же сложности) */
  calib?: boolean;
  /** id вопроса, раньше которого этот появиться не может (вопросы связаны) */
  after?: string;
  /** код префектуры: вопрос не появится, пока её не открыли */
  afterPref?: number;
  /** заметка для ведущего (видна только в админке), например какое фото найти */
  note?: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export type QMode = 'once' | 'cycle';

export interface Player {
  id: string;
  name: string;
  color: string;
  hat: number;
  /** внешность (нет у старых сохранений — тогда DEFAULT_LOOK) */
  look?: Look;
  /** машина: ход на 1 или 2 префектуры; пропадает при поражении в дуэли */
  car?: CarId;
  /** собака акита-ину — у первого, кто пришёл в Акиту */
  akita?: boolean;
  /** ириомотейская кошка — у первого, кто попал на Окинаву; подсказывает ответы по своей теме (биология) */
  cat?: boolean;
  pref: number | null;
  hp: number;
  maxHp: number;
  yen: number;
  stars: number;
  /** сила по темам (база + калибровка + покупки) */
  stats: Record<TopicId, number>;
  calib: Record<TopicId, number>;
  bonuses: Record<BonusId, number>;
  specials: number;
  /** темы купленных спецвопросов (по одной на спецвопрос); остальные спецвопросы — из любой спецтемы */
  specialTopics?: TopicId[];
  prizes: string[];
  /** находка «старая карта»: префектуры в тумане, которые игрок разведал (видит только он на телефоне) */
  scouted?: number[];
  online: boolean;
  /** чем игрок занят на телефоне (пнп на ТВ) */
  busy: null | SoloGameId;
  /** защита от фарма: денежная соло-игра здесь закрыта для игрока на этот приход (left — через сколько своих ходов откроется) */
  closed?: { code: number; game: SoloGameId; left: number };
  /** жетоны финальной призовой игры, найденные в игре (редкая находка аутсайдеру) */
  tokens?: number;
  /** барабан бонуса: игрок крутит его у себя на телефоне, игра тем временем идёт дальше */
  reel?: { segs: BonusId[]; spin?: ReelSpin; done?: boolean };
  bot?: boolean;
}

export interface PrefState {
  rev: boolean;
  reward: RewardType;
  prizeTaken: boolean;
  /** награду уже забрали — больше не выдаётся и не видна на карте */
  taken?: boolean;
  visits: number;
  /** групповая игра этой префектуры уже сыграна */
  groupDone?: boolean;
}

/** соло-игры: доступны, пока игрок стоит в префектуре с ними (можно возвращаться) */
export type SoloGameId = 'pachinko' | 'ring' | 'onsen' | 'chohan' | 'sudoku';

/** групповые игры: запускаются в префектурах, отмеченных в админке */
export type GroupGameId = 'calligraphy' | 'fukuwarai' | 'senryu' | 'iaido' | 'sashimi' | 'dragon' | 'noodles' | 'cherry' | 'godzilla';
/** какая лапша в «Лапше» */
export type NoodleId = 'soba' | 'ramen' | 'udon';
/** что режем в «Сашими» */
export type FishId = 'tuna' | 'salmon' | 'crab' | 'squid';
/** лицо для фукуварай */
/** иайдо: фон картины (src/games/iaidoScenes.ts) */
export type IaiSceneId = 'moon' | 'dawn' | 'bamboo' | 'bridge';

export type FaceId = 'okame' | 'daruma' | 'oni';

/** задание групповой игры (например, «Нарисуйте кандзи „человек“») */
export interface GroupTask {
  id: string;
  game: GroupGameId;
  text: string;
  /** фукуварай: какое лицо собирать */
  face?: FaceId;
  /** сашими: что режем; задания со своей рыбой выбираются в её префектурах */
  fish?: FishId;
  /** иайдо: фон картины (по умолчанию ночная сакура) */
  scene?: IaiSceneId;
  /** лапша: соба, рамен или удон */
  noodle?: NoodleId;
  /** префектура задания: там играется именно оно, в других префектурах игры — не выпадает */
  pref?: number;
}

/** публичная часть групповой игры; сами рисунки в состояние не попадают (их видит только ТВ) */
export interface GroupPublic {
  id: number;
  game: GroupGameId;
  prompt: string;
  face?: FaceId;
  /** сашими: что режем, вес целиком и сколько нужно отрезать, г */
  fish?: FishId;
  total?: number;
  target?: number;
  /** иайдо: фон картины */
  scene?: IaiSceneId;
  pref: number;
  phase: 'intro' | 'draw' | 'show' | 'vote' | 'results';
  players: string[];
  startAt: number;
  deadline: number;
  /** номер работы i+1 → автор; перемешан, чтобы номер не выдавал автора */
  order: string[];
  submitted: string[];
  showIdx: number;
  voteRound: number;
  voteRounds: number;
  voted: string[];
  /** итоги (после голосования) */
  points?: Record<string, number>;
  places?: Record<string, number>;
  awards?: Record<string, string>;
  /** иайдо: текущий раунд; момент сигнала знает только ТВ (engine.iaiSignal) */
  iai?: IaiRound;
  /** иайдо: лучшее время каждого игрока, мс */
  best?: Record<string, number>;
  /** сашими (после сдачи): место разреза 0..1 и вес куска, г */
  cuts?: Record<string, number>;
  grams?: Record<string, number>;
  /** лапша: что едим, скрытый предел живота каждого (мисок), съедено, кто закрыл миску, кто лопнул */
  noodle?: NoodleId;
  limits?: Record<string, number>;
  bowls?: Record<string, number>;
  closed?: string[];
  burst?: string[];
  /** косточки: ветер каждой попытки (м/с, «+» в спину), дальности игроков по попыткам, броски по порядку (для полёта на ТВ) */
  winds?: number[];
  pits?: Record<string, (number | null)[]>;
  throws?: { pid: string; i: number; d: number }[];
}

/** раунд иайдо: ready — ждём сигнала, done — итог раунда */
export interface IaiRound {
  round: number;
  rounds: number;
  step: 'ready' | 'done';
  /** нажали раньше сигнала — выбыли из раунда */
  early: string[];
  /** нажали после сигнала (время раскрывается в done) */
  cut: string[];
  /** реакция, мс */
  times?: Record<string, number>;
}

/** финальная схватка: все — сумоисты на дохё; неверный ответ отодвигает к краю, за краем — выбыл */
export interface SumoPublic {
  id: number;
  phase: 'intro' | 'pick' | 'push' | 'results';
  /** места на дохё по дуге (порядок ходов) */
  ring: string[];
  alive: string[];
  /** выбывшие по порядку: первый — последнее место */
  out: string[];
  /** насколько сумоист отодвинут к краю: 0 — центр, 1 — край (сами числа урона не показываем) */
  pos: Record<string, number>;
  /** где стояли до последнего толчка — для анимации */
  prev?: Record<string, number>;
  /** только что вылетели */
  fell?: string[];
  asker: string | null;
  circle: number;
  places?: Record<string, number>;
  awards?: Record<string, string>;
}

export interface SumoSettings {
  enabled: boolean;
  /** сколько пропущенных ударов средней силы выдерживает сумоист */
  misses: number;
  /** кругов, в которых никто не вылетает (останавливаются на краю) */
  grace: number;
  /** с какого круга толчки усиливаются и на сколько за круг (доля) */
  rampFrom: number;
  ramp: number;
  /** множитель наград групповой лестницы */
  mult: number;
}

/** «Годзилла» (Токио): лидер топчет город, остальные обстреливают его по клеткам */
export interface KaijuPublic {
  id: number;
  pref: number;
  phase: 'intro' | 'play' | 'results';
  zilla: string;
  hunters: string[];
  cols: number;
  rows: number;
  /** время хоста: старт и конец раунда */
  startAt: number;
  endAt: number;
  /** клетка Годзиллы и куда он смотрит */
  pos: number;
  face: 1 | -1;
  hp: number;
  maxHp: number;
  /** после попадания Годзилла неуязвим до этого момента */
  stunUntil: number;
  /** растоптанные клетки (включая стартовую) и сколько домов растоптано */
  down: number[];
  stomped: number;
  /** летящие снаряды: клетка и момент падения (время хоста) */
  shells: { n: number; pid: string; cell: number; at: number }[];
  /** когда охотник сможет выстрелить снова (время хоста) */
  ready: Record<string, number>;
  hits: Record<string, number>;
  shots: Record<string, number>;
  cfg: { stepMs: number; smashMs: number; fuseMs: number; reloadMs: number };
  /** до какого момента Годзилла занят (шагает или ломает дом) — время хоста */
  busyUntil: number;
  awards?: Record<string, string>;
  stars?: string[];
}

export interface KaijuSettings {
  /** длительность, сек; жизни Годзиллы; размер города */
  time: number;
  hp: number;
  cols: number;
  rows: number;
  /** шаг Годзиллы, полёт снаряда, перезарядка охотника, неуязвимость после попадания — мс */
  stepMs: number;
  /** сколько Годзилла ломает целый дом (стоит на нём и не может шагнуть), мс */
  smashMs: number;
  fuseMs: number;
  reloadMs: number;
  stunMs: number;
  /** Годзилла выжил: база + за каждый дом (и звезда); свалили — утешительные */
  zillaWinYen: number;
  houseYen: number;
  zillaLoseYen: number;
  /** охотники, если Годзилла выжил: база + за попадание; если свалили: база + за попадание (и звезда самому меткому) */
  hunterYen: number;
  hitYen: number;
  hunterWinYen: number;
  hitWinYen: number;
}

/** джа-одори (танец дракона, Нагасаки): все шагают Л-П в такт, сбившийся выбывает со своим куском дракона */
export interface DragonPublic {
  id: number;
  pref: number;
  phase: 'intro' | 'play' | 'results';
  /** цепочка от головы к хвосту */
  players: string[];
  /** ещё несут дракона */
  alive: string[];
  /** выбывшие: игрок → номер шага, на котором сбился */
  out: Record<string, number>;
  /** время хоста первой доли отсчёта; 0 — ещё не назначено */
  startAt: number;
  bpm: number;
  /** ускорение за каждые 8 шагов зачёта, % */
  accel: number;
  maxBpm: number;
  /** шагов разминки (без зачёта) */
  warm: number;
  /** шагов зачёта максимум; дошли до конца — оставшиеся делят первое место */
  steps: number;
  /** поправка на задержку касания, мс */
  tapLag: number;
  /** ничья на шаге: сбились все оставшиеся — никто не выбыл */
  tie?: number;
  /** раунд (с 1) и сколько всего; итоги раунда — phase 'results' при round < rounds */
  round?: number;
  rounds?: number;
  /** места в этом раунде и очки за все раунды (3/2/1 за 1/2/3 место раунда) */
  roundPlaces?: Record<string, number>;
  score?: Record<string, number>;
  places?: Record<string, number>;
  awards?: Record<string, string>;
}

export type QContext = 'calib' | 'pref' | 'duel' | 'revive' | 'sumo';

/** Публичная часть активного вопроса (правильный ответ появляется только после reveal) */
export interface PublicQuestion {
  qid: string;
  n: number; // порядковый номер вопроса в игре — уникальный ключ
  context: QContext;
  title: string;
  text: string;
  media?: Question['media'];
  answers: Answer[];
  answerImages: boolean;
  topic: TopicId;
  special: boolean;
  /** призовой вопрос: ранг приза */
  prize?: number;
  /** цикличный: при ошибке правильный ответ не показывается */
  cycle?: boolean;
  /** флаг: на ТВ не показываем, какой неверный вариант выбрал игрок (видно только на его телефоне) */
  flag?: boolean;
  /** ведущий читает вопрос вслух: текст уже на экране, ответов и таймера ещё нет */
  reading?: boolean;
  startAt: number; // время хоста
  deadline: number; // время хоста
  participants: string[];
  answered: string[];
  removed: Record<string, number[]>;
  /** дуэль: монетка, брошенная игроком на этот вопрос (+урон, если его удар пройдёт) */
  coins?: Record<string, 'coin'>;
  /** кошка: хозяину на телефоне лапа отмечает этот ответ (вопросы её темы) */
  paw?: Record<string, number>;
  /** порядок кнопок на телефоне игрока (позиция → индекс ответа), у всех разный — от подглядывания */
  orders?: Record<string, number[]>;
  revealed: boolean;
  correct?: number;
  choices?: Record<string, number | null>;
  /** итоги: кто сколько получил — для экрана ответа */
  results?: Record<string, string>;
  /** префектура, где задают вопрос (для фона) */
  pref?: number;
}

export interface DuelPublic {
  attacker: string;
  defender: string;
  round: number; // 1..N
  asker: string | null;
  topic: TopicId | null;
  special: boolean;
  mode: 'quiz' | 'rhythm' | 'race' | null;
  /** проигравший лишился машины: чья, какая и как именно */
  carLost?: { pid: string; car: CarId; how: CarLostId };
  lastHit: null | { to: string; dmg: number; n: number };
  winner: string | null;
  over: boolean;
  /** победа нокаутом (тогда ещё и награда за победу) */
  ko?: boolean;
  /** сколько йен победитель украл у проигравшего */
  stolen?: number;
  /** ставки зрителей: кто → на кого → сколько */
  bets?: Record<string, Record<string, number>>;
  /** итог ставок: кто сколько выиграл (+) или проиграл (−) */
  payouts?: Record<string, number>;
}

/** гонка «машина против машины»: каждый едет на своём телефоне, сюда приходят только отсечки и финиш */
export interface RacePublic {
  id: number;
  seed: number;
  kind: TrackKind;
  /** время хоста, когда гаснут огни светофора */
  startAt: number;
  players: string[];
  cars: Record<string, CarId>;
  /** отсечки по контрольным точкам, мс от старта */
  splits: Record<string, number[]>;
  /** время финиша, мс; null — ещё едет */
  times: Record<string, number | null>;
  over?: boolean;
}

export interface RhythmPublic {
  id: number;
  seed: number;
  bpm: number;
  startAt: number; // время хоста, когда должна прозвучать нулевая доля
  beats: number; // длина в долях
  players: string[];
  scores: Record<string, number | null>;
}

export type LobbyShow = 'blank' | 'intro' | 'walk';
/** длина отсчёта 3-2-1 до вспышки, мс: цифры на 0.5 / 1.5 / 2.5 c, вспышка на 3.5 c */
export const COUNTDOWN_MS = 3600;

export type Stage =
  /** show — подэтап начала: пустой фон → интро (логотип + песня) → тропа с QR (нет — тропа, старые сохранения) */
  | { t: 'lobby'; show?: LobbyShow; at?: number }
  /** «Начать игру»: отсчёт 3-2-1 поверх тропы, потом вспышка и карта (at — время хоста начала отсчёта) */
  | { t: 'countdown'; at: number }
  /** wait — ждём «Далее» ведущего (перед калибровкой) */
  | { t: 'banner'; text: string; sub?: string; big?: boolean; wait?: boolean }
  | { t: 'calibResult' }
  | { t: 'landing'; pid: string; deadline: number; blocked: number[] }
  | { t: 'turnStart'; pid: string }
  /** options3 — станции синкансэна, куда можно уехать по билету */
  | { t: 'move'; pid: string; options: number[]; options2: number[]; options3?: number[]; /** корм: акита у соседа — её можно переманить (видит только ходящий на телефоне) */ lure?: boolean; /** кусок сашими: кошка у соседа — её можно переманить */ lureCat?: boolean; /** свиток-вызов: кого можно вызвать на дуэль вместо хода (видит только ходящий на телефоне) */ challenge?: string[] }
  | { t: 'moving'; pid: string; from: number | null; to: number; path: number[] }
  | { t: 'bonus'; pids: string[]; deadline: number; offers: Record<string, BonusId[]>; picked: Record<string, BonusId | 'none'> }
  | { t: 'question' }
  /** интро префектуры при первом входе: фон и название по центру */
  | { t: 'prefIntro'; code: number; pid: string; /** пояснение под названием (интро Окинавы) */ note?: string }
  /** secret — что именно получено (видит только сам игрок); text — для всех */
  | { t: 'reward'; pid: string; reward: RewardType; text: string; pref: number; secret?: string;
      /** какой бонус выпал (показывает только телефон получателя) */
      bonus?: BonusId;
      /** спецвопрос: получатель выбирает спецтему до deadline */
      pickTopic?: { topics: TopicId[]; deadline: number } }
  /** игрок у магазина: сначала решает, зайти ли; содержимое видно только на его телефоне */
  | { t: 'shop'; pid: string; deadline: number; entered: boolean; /** автосалон этой марки (вместе с магазином или вместо него) */ dealer?: CarId; /** обычного магазина здесь нет — только автосалон */ noShop?: boolean }
  | { t: 'group' }
  | { t: 'dragon' }
  | { t: 'kaiju' }
  /** после хода: игрок с бонусом «доп. ход» решает, ходить ли ещё раз */
  | { t: 'extraTurn'; pid: string; deadline: number }
  /** ставки зрителей перед дуэлью; done — кто уже закончил ставить */
  | { t: 'duelBet'; deadline: number; done: string[] }
  /** находка под ногами: на ТВ только «что-то нашёл» (кицунэ — публично); подробности у игрока на телефоне */
  | { t: 'find'; pid: string; kind: FindId; amount?: number; from?: string }
  /** наступила новая эпоха */
  | { t: 'epoch'; epoch: number }
  /** барабан темы вопроса: никто не запускает — показывается на ТВ и сразу крутится сам; pid — кому вопрос; segs — id тем */
  | { t: 'reel'; pid: string; why: 'pref' | 'duel'; segs: TopicId[]; deadline: number; spin: ReelSpin | null }
  /** финальная призовая игра: колесо жетонов (s.wheel) */
  | { t: 'wheel' }
  | { t: 'duelPick'; pid: string; deadline: number; topics: TopicId[]; canSpecial: boolean; canRhythm: boolean; /** финальное сумо: тему выбирает ведущий круга, бьёт по всем */ sumo?: boolean }
  | { t: 'sumo' }
  | { t: 'rhythm' }
  | { t: 'race' }
  | { t: 'duelResult' }
  | { t: 'prize'; pid: string; text: string }
  /** titles — титулы игроков (id из shared/titles.ts, самые редкие первыми) */
  | { t: 'end'; titles?: Record<string, string[]> };

export interface LogEntry {
  id: number;
  text: string;
}

export interface Settings {
  topics: Topic[];
  calibRounds: number;
  questionTime: number;
  duelTime: number;
  bonusTime: number;
  pickTime: number;
  landingTime: number;
  revealMs: number;
  autoAdvance: boolean;
  /** вопрос ведёт ведущий кнопкой «Далее»: интро → текст (читает вслух) → ответы и таймер → закрыть */
  hostPaced?: boolean;
  /** пульт: интро префектуры само переходит к вопросу */
  autoIntro?: boolean;
  /** пульт: ответы появляются сами, когда ведущий успел прочитать вопрос (по длине текста) */
  autoReading?: boolean;
  /** версия экономики: при росте старые сохранённые цены и награды заменяются новыми */
  econ?: number;
  baseStrength: number;
  /** делений на полоске силы; если у кого-то сила больше — шкала растёт сама */
  startHp: number;
  specialPower: number;
  duelRounds: number;
  rhythmInDuel: boolean;
  reward: {
    moverCorrectYen: number;
    moverCorrectStars: number;
    moverWrongYen: number;
    otherCorrectYen: number;
    calibCorrectYen: number;
    prefMoney: number;
    prefStars: number;
    reviveYen: number;
    duelWinYen: number;
    duelWinStars: number;
    /** победитель дуэли забирает этот % денег проигравшего */
    duelStealPct: number;
  };
  /** ставки зрителей перед дуэлью, сек */
  betTime?: number;
  shop: {
    special: { yen: number; stars: number };
    hp: { yen: number; stars: number; amount: number };
    stat: { yen: number; stars: number };
    fifty1: { yen: number; stars: number };
    fifty2: { yen: number; stars: number };
    move2: { yen: number; stars: number };
    coin: { yen: number; stars: number };
    food: { yen: number; stars: number };
    ticket: { yen: number; stars: number };
    scroll: { yen: number; stars: number };
  };
  /** станции синкансэна (коды префектур): билет перевозит с одной на любую другую */
  shinkansen: number[];
  /** цена машины в автосалоне, йены (растёт с эпохой) */
  car?: { yen: number };
  /** автосалоны: код префектуры → марка */
  dealers?: Record<number, CarId>;
  pachinkoPrefs: number[];
  /** префектуры с магазином: покупки только здесь, после вопроса */
  shopPrefs: number[];
  /** сколько секунд игрок может пробыть в магазине */
  shopTime: number;
  /** защита от фарма: денежную соло-игру (пачинко, кольцо, чо-хан, судоку) снова можно играть через столько своих ходов (онсэн — без ограничений) */
  soloCooldown?: number;
  /** префектуры с групповой игрой: код → игра */
  groupPrefs: Record<number, GroupGameId>;
  groupTasks: GroupTask[];
  group: {
    drawTime: number;
    /** время на работу в остальных играх, сек (каллиграфия — drawTime) */
    times?: Partial<Record<GroupGameId, number>>;
    /** иайдо: сколько раундов */
    iaidoRounds?: number;
    voteTime: number;
    /** сколько показывать каждую работу на ТВ, мс */
    showMs: number;
    /** награды за места: [0] — 1 место и т. д. */
    prizes: { yen: number; stars: number }[];
    /** джа-одори: темп, ускорение, разминка */
    dragon?: DragonSettings;
    /** «Годзилла»: баланс и награды */
    kaiju?: Partial<KaijuSettings>;
    /** версия раскладки новых игр: старые сохранённые настройки один раз получают новые игры в свободных префектурах */
    layoutV?: number;
  };
  ringPrefs: number[];
  /** префектуры с онсэном: отдых лечит */
  onsenPrefs: number[];
  /** чо-хан: кости под стаканом, чёт или нечет */
  chohanPrefs: number[];
  chohan: { bets: number[] };
  /** судоку: 4×4 → 6×6 → 9×9, прогресс у игрока сохраняется */
  sudokuPrefs: number[];
  sudoku: { rewards: { yen: number; stars: number }[]; givens9: number };
  pachinko: { yenPerBall: number; pack: number };
  /** призовое кольцо: цена попытки и скорость; призы секторов — RING_SET в games/logic.ts */
  ring: { cost: number; cellMs: number };
  /** задержка звука ТВ (саундбар/Bluetooth), мс — для ритм-игры */
  audioLatencyMs: number;
  /** ручные награды префектур: код → тип */
  prefRewards: Record<number, RewardType>;
  prizeNames: string[];
  /** призы по рангам для призовых вопросов: [0] — ранг 1 (главный), [1] — ранг 2… */
  prizeTiers?: string[][];
  /** пульт: множители эпох (цены, награды); эпоха берёт свои в момент наступления */
  epochRates?: EpochRates[];
  /** пульт: сколько кругов свободного перемещения в финале (1–4) */
  finalRounds?: number;
  /** финальная схватка сумо после последнего круга */
  sumo?: Partial<SumoSettings>;
  /** пульт: курс обмена звёзд и денег на жетоны и призы колеса по редкости */
  tokens?: { starsPer: number; yenPer: number; prizes: Record<PrizeTier, number> };
  /** пульт: в последнем круге дать жетон аутсайдеру (тому, у кого меньше всего на жетоны) */
  outsiderToken?: boolean;
  /** …и не одному, а двум последним */
  outsiderTwo?: boolean;
}

/** конец игры: вся карта открыта → доигрываем круг → охота за призами → доигрываем круг → финальные круги */
export interface EndgameState {
  step: 'open' | 'hunt' | 'huntDone' | 'final' | 'sumo';
  /** сыграно финальных кругов */
  played?: number;
}

/** колесо призов: сектор = призов этой категории (носки и не носки ×5), выпавший приз убирается */
export interface WheelState {
  left: Record<PrizeTier, number>;
  tokens: Record<string, number>;
  /** сектора колеса для текущего (последнего) вращения */
  segs: { id: PrizeTier; w: number }[];
  spin: WheelSpin | null;
  spinner: string | null;
  /** что выпало в последнем вращении (когда колесо остановилось) */
  last?: { pid: string; tier: PrizeTier } | null;
  history: { pid: string; tier: PrizeTier }[];
  /** очередь: от самого сильного (больше всего жетонов на старте) к слабому */
  order?: string[];
  /** чья очередь крутить; после выигрыша ход держится, пока ведущий не нажмёт «Приз получен» */
  turn?: string | null;
}

export interface DragonSettings {
  bpm: number;
  accel: number;
  maxBpm: number;
  warm: number;
  steps: number;
  tapLag: number;
  /** раундов шествия (по умолчанию 3) */
  rounds?: number;
}

export interface GameState {
  v: number;
  room: string;
  stage: Stage;
  players: Record<string, Player>;
  joinOrder: string[];
  turnOrder: string[];
  turnIdx: number;
  round: number;
  prefs: Record<number, PrefState>;
  q: PublicQuestion | null;
  duel: DuelPublic | null;
  rhythm: RhythmPublic | null;
  race?: RacePublic | null;
  g?: GroupPublic | null;
  dr?: DragonPublic | null;
  kj?: KaijuPublic | null;
  sumo?: SumoPublic | null;
  log: LogEntry[];
  settings: Settings;
  paused: boolean;
  /** время хоста, когда поставили паузу: таймеры на экранах стоят на нём */
  pausedAt?: number | null;
  phase: 'lobby' | 'calib' | 'landing' | 'turns' | 'end';
  /** эпоха (0 — Эдо, 1 — Мэйдзи, 2 — Сёва): цены и награды, цвета интерфейса */
  epoch?: number;
  /** множители текущей эпохи — запомнены при её наступлении */
  rates?: EpochRates;
  /** конец игры (охота за призами, финальные круги) */
  endgame?: EndgameState | null;
  /** финальная призовая игра */
  wheel?: WheelState | null;
  /** отладочная сцена поверх игры (меню 🐞); сценарий при этом не трогается */
  debug?: DebugView | null;
}

export interface DebugView {
  scene: string;
  stage: Stage;
  q?: PublicQuestion | null;
  duel?: DuelPublic | null;
  rhythm?: RhythmPublic | null;
  race?: RacePublic | null;
  wheel?: WheelState | null;
}

// ───── Сообщения ─────

export type PickKind = 'landing' | 'move' | 'bonus' | 'duel' | 'shop' | 'vote' | 'extra' | 'iaido' | 'bet' | 'noodle' | 'cherry' | 'specialTopic' | 'reel' | 'race' | 'kaiju';

/** телефон/админ → хост (канал input) */
export type InputMsg =
  | { t: 'hello'; cid: string; pid?: string }
  | { t: 'join'; cid: string; name: string; color: string; hat: number; look?: Look }
  | { t: 'restore'; cid: string; name: string; pin: string }
  | { t: 'ping'; cid: string; n: number; t0: number; pid?: string }
  | { t: 'answer'; pid: string; n: number; choice: number; at: number }
  | { t: 'pick'; pid: string; kind: PickKind; value: any }
  /** рисунок групповой игры, по кускам (лимит размера сообщения) */
  | { t: 'draw'; pid: string; id: number; part: number; total: number; data: string }
  | { t: 'req'; pid: string; rid: number; op: string; args?: any }
  | { t: 'pnp'; pid: string; ev: any }
  | { t: 'rhythm'; pid: string; id: number; score: number; hits: number; total: number }
  /** джа-одори: шаги, на которых игрок сбился (телефон судит сам); без промахов — «я на связи» */
  | { t: 'dragon'; pid: string; id: number; miss: number[] }
  | { t: 'ctl'; cmd: string; args?: any };

/** хост → все (канал game) */
export type GameMsg =
  | { t: 'st'; v: number; full: boolean; parts: Partial<GameState> }
  | { t: 'pong'; cid: string; n: number; t0: number; th: number }
  | { t: 'joined'; cid: string; pid: string; pin: string }
  | { t: 'joinErr'; cid: string; err: string }
  | { t: 'res'; pid: string; rid: number; ok: boolean; data?: any; err?: string }
  | { t: 'host'; hostId: string };
