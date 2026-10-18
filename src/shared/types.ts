// Общие типы игры. Хост (ТВ) — единственный источник правды; телефоны получают
// публичное состояние и отправляют только действия игрока.

export type TopicId = string;
export type BonusId = 'fifty1' | 'fifty2' | 'move2';
export type RewardType = 'money' | 'stars' | 'bonus' | 'special' | 'prize';

export interface Topic {
  id: TopicId;
  name: string;
  /** участвует в калибровке и даёт силу в дуэлях */
  combat: boolean;
  color: string;
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
  skillScale: number;
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

/** телефон/админ → хост (канал input) */
export type InputMsg =
  | { t: 'hello'; cid: string; pid?: string }
  | { t: 'join'; cid: string; name: string; color: string; hat: number }
  | { t: 'restore'; cid: string; name: string; pin: string }
  | { t: 'ping'; cid: string; n: number; t0: number; pid?: string }
  | { t: 'answer'; pid: string; n: number; choice: number; at: number }
  | { t: 'pick'; pid: string; kind: 'landing' | 'move' | 'bonus' | 'duel'; value: any }
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
