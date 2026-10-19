// Общие типы игры. Хост (ТВ) — единственный источник правды; телефоны получают
// публичное состояние и отправляют только действия игрока.

export type TopicId = string;
export type BonusId = 'fifty1' | 'fifty2' | 'move2' | 'turn2';
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
}

export interface Player {
  id: string;
  name: string;
  color: string;
  hat: number;
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
  prizes: string[];
  online: boolean;
  /** чем игрок занят на телефоне (пнп на ТВ) */
  busy: null | 'pachinko' | 'ring';
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

/** групповые игры: запускаются в префектурах, отмеченных в админке */
export type GroupGameId = 'calligraphy' | 'fukuwarai' | 'senryu' | 'iaido';
/** лицо для фукуварай */
export type FaceId = 'okame' | 'daruma' | 'oni';

/** задание групповой игры (например, «Нарисуйте кандзи „человек“») */
export interface GroupTask {
  id: string;
  game: GroupGameId;
  text: string;
  /** фукуварай: какое лицо собирать */
  face?: FaceId;
}

/** публичная часть групповой игры; сами рисунки в состояние не попадают (их видит только ТВ) */
export interface GroupPublic {
  id: number;
  game: GroupGameId;
  prompt: string;
  face?: FaceId;
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

export type QContext = 'calib' | 'pref' | 'duel' | 'revive';

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
  /** ведущий читает вопрос вслух: текст уже на экране, ответов и таймера ещё нет */
  reading?: boolean;
  startAt: number; // время хоста
  deadline: number; // время хоста
  participants: string[];
  answered: string[];
  removed: Record<string, number[]>;
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
  mode: 'quiz' | 'rhythm' | null;
  lastHit: null | { to: string; dmg: number; n: number };
  winner: string | null;
  over: boolean;
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

export type Stage =
  | { t: 'lobby' }
  | { t: 'banner'; text: string; sub?: string; big?: boolean }
  | { t: 'calibResult' }
  | { t: 'landing'; pid: string; deadline: number; blocked: number[] }
  | { t: 'turnStart'; pid: string }
  | { t: 'move'; pid: string; options: number[]; options2: number[] }
  | { t: 'moving'; pid: string; from: number | null; to: number; path: number[] }
  | { t: 'bonus'; pids: string[]; deadline: number; offers: Record<string, BonusId[]>; picked: Record<string, BonusId | 'none'> }
  | { t: 'question' }
  /** интро префектуры при первом входе: фон и название по центру */
  | { t: 'prefIntro'; code: number; pid: string }
  | { t: 'reward'; pid: string; reward: RewardType; text: string; pref: number }
  /** игрок у магазина: сначала решает, зайти ли; содержимое видно только на его телефоне */
  | { t: 'shop'; pid: string; deadline: number; entered: boolean }
  | { t: 'group' }
  /** после хода: игрок с бонусом «доп. ход» решает, ходить ли ещё раз */
  | { t: 'extraTurn'; pid: string; deadline: number }
  | { t: 'duelPick'; pid: string; deadline: number; topics: TopicId[]; canSpecial: boolean; canRhythm: boolean }
  | { t: 'rhythm' }
  | { t: 'duelResult' }
  | { t: 'prize'; pid: string; text: string }
  | { t: 'end' };

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
  };
  shop: {
    special: { yen: number; stars: number };
    hp: { yen: number; stars: number; amount: number };
    stat: { yen: number; stars: number };
    fifty1: { yen: number; stars: number };
    fifty2: { yen: number; stars: number };
    move2: { yen: number; stars: number };
  };
  pachinkoPrefs: number[];
  /** префектуры с магазином: покупки только здесь, после вопроса */
  shopPrefs: number[];
  /** сколько секунд игрок может пробыть в магазине */
  shopTime: number;
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
  };
  ringPrefs: number[];
  pachinko: { yenPerBall: number; pack: number };
  ring: { cost: number; prizeYen: number; physicalPrize: boolean; cellMs: number };
  /** задержка звука ТВ (саундбар/Bluetooth), мс — для ритм-игры */
  audioLatencyMs: number;
  /** ручные награды префектур: код → тип */
  prefRewards: Record<number, RewardType>;
  prizeNames: string[];
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
  g?: GroupPublic | null;
  log: LogEntry[];
  settings: Settings;
  paused: boolean;
  phase: 'lobby' | 'calib' | 'landing' | 'turns' | 'end';
  /** отладочная сцена поверх игры (меню 🐞); сценарий при этом не трогается */
  debug?: DebugView | null;
}

export interface DebugView {
  scene: string;
  stage: Stage;
  q?: PublicQuestion | null;
  duel?: DuelPublic | null;
  rhythm?: RhythmPublic | null;
}

// ───── Сообщения ─────

export type PickKind = 'landing' | 'move' | 'bonus' | 'duel' | 'shop' | 'vote' | 'extra' | 'iaido';

/** телефон/админ → хост (канал input) */
export type InputMsg =
  | { t: 'hello'; cid: string; pid?: string }
  | { t: 'join'; cid: string; name: string; color: string; hat: number }
  | { t: 'restore'; cid: string; name: string; pin: string }
  | { t: 'ping'; cid: string; n: number; t0: number; pid?: string }
  | { t: 'answer'; pid: string; n: number; choice: number; at: number }
  | { t: 'pick'; pid: string; kind: PickKind; value: any }
  /** рисунок групповой игры, по кускам (лимит размера сообщения) */
  | { t: 'draw'; pid: string; id: number; part: number; total: number; data: string }
  | { t: 'req'; pid: string; rid: number; op: string; args?: any }
  | { t: 'pnp'; pid: string; ev: any }
  | { t: 'rhythm'; pid: string; id: number; score: number; hits: number; total: number }
  | { t: 'ctl'; cmd: string; args?: any };

/** хост → все (канал game) */
export type GameMsg =
  | { t: 'st'; v: number; full: boolean; parts: Partial<GameState> }
  | { t: 'pong'; cid: string; n: number; t0: number; th: number }
  | { t: 'joined'; cid: string; pid: string; pin: string }
  | { t: 'joinErr'; cid: string; err: string }
  | { t: 'res'; pid: string; rid: number; ok: boolean; data?: any; err?: string }
  | { t: 'host'; hostId: string };
