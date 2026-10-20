import type { BonusId, DragonSettings, GroupGameId, GroupTask, Question, RewardType, Settings, SoloGameId } from './types';

/** версия экономики (награды за ответы и цены магазина). Подняли — сохранённые в админке старые значения заменяются новыми */
export const ECON_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  topics: [
    { id: 'music', name: 'Музыка', combat: true, color: '#ff6b8b' },
    { id: 'culture', name: 'Культура', combat: true, color: '#ffc94d' },
    { id: 'geo', name: 'География', combat: true, color: '#4dd2ff' },
    { id: 'general', name: 'Общие (префектуры)', combat: false, color: '#9be36d' },
    { id: 'okinawa', name: 'Окинава (воскрешение)', combat: false, color: '#c08cff' },
  ],
  calibRounds: 2,
  questionTime: 15,
  duelTime: 12,
  bonusTime: 5,
  pickTime: 10,
  landingTime: 30,
  revealMs: 4500,
  autoAdvance: true,
  hostPaced: true,
  baseStrength: 1,
  startHp: 10,
  specialPower: 5,
  duelRounds: 3,
  rhythmInDuel: true,
  reward: {
    moverCorrectYen: 500,
    moverCorrectStars: 1,
    moverWrongYen: 100,
    otherCorrectYen: 250,
    calibCorrectYen: 100,
    prefMoney: 500,
    prefStars: 2,
    reviveYen: 300,
    duelWinYen: 300,
    duelWinStars: 1,
  },
  shop: {
    special: { yen: 500, stars: 3 },
    hp: { yen: 1000, stars: 0, amount: 2 },
    stat: { yen: 900, stars: 2 },
    fifty1: { yen: 600, stars: 0 },
    fifty2: { yen: 1200, stars: 0 },
    move2: { yen: 800, stars: 0 },
  },
  // соло-игры и групповые по префектурам: см. RECOMMENDED_LAYOUT
  pachinkoPrefs: [23, 27, 11],
  // сеть магазинов: от магазина до ближайшего — два шага, рядом с любой префектурой есть магазин;
  // 4 внутри страны, остальные на побережье там, где без этого не обойтись; на соло-играх магазинов нет
  shopPrefs: [2, 6, 9, 12, 19, 21, 28, 29, 35, 38, 41, 43],
  shopTime: 45,
  groupPrefs: {
    26: 'calligraphy', 34: 'calligraphy', 19: 'calligraphy', 45: 'fukuwarai', 10: 'fukuwarai', 33: 'fukuwarai', 29: 'senryu', 24: 'senryu', 28: 'senryu',
    43: 'iaido', 46: 'iaido', 13: 'iaido', 30: 'sashimi', 1: 'sashimi', 41: 'sashimi', 42: 'dragon',
  },
  groupTasks: [
    { id: 'cal1', game: 'calligraphy', text: 'Нарисуйте свою версию кандзи «человек» 人', pref: 34 },
    { id: 'cal2', game: 'calligraphy', text: 'Нарисуйте кандзи «гора» 山', pref: 19 },
    { id: 'cal5', game: 'calligraphy', text: 'Нарисуйте свой кандзи года — какой хотите', pref: 26 },
    { id: 'fuku1', game: 'fukuwarai', text: 'Соберите лицо Окамэ — богини веселья', face: 'okame', pref: 45 },
    { id: 'fuku2', game: 'fukuwarai', text: 'Соберите лицо Дарумы', face: 'daruma', pref: 10 },
    { id: 'fuku3', game: 'fukuwarai', text: 'Соберите лицо демона Óни', face: 'oni', pref: 33 },
    { id: 'sen3', game: 'senryu', text: 'Сакура в цвету / Начальник под деревом', pref: 29 },
    { id: 'sen4', game: 'senryu', text: 'Тихий пруд в саду / В пруд прыгнул лягушонок', pref: 24 },
    { id: 'sen5', game: 'senryu', text: 'Караоке, ночь / Микрофон не отдаёт', pref: 28 },
    { id: 'iai1', game: 'iaido', text: 'Дуэль на рассвете у стен замка', scene: 'dawn', pref: 43 },
    { id: 'iai2', game: 'iaido', text: 'Поединок в бамбуковой роще', scene: 'bamboo', pref: 46 },
    { id: 'iai3', game: 'iaido', text: 'Ронины встретились на мосту', scene: 'bridge', pref: 13 },
    { id: 'sash1', game: 'sashimi', text: 'Тунец из Кацууры', fish: 'tuna', pref: 30 },
    { id: 'sash3', game: 'sashimi', text: 'Нога камчатского краба', fish: 'crab', pref: 1 },
    { id: 'sash4', game: 'sashimi', text: 'Живой кальмар из Ёбуко', fish: 'squid', pref: 41 },
  ],
  group: {
    drawTime: 30,
    times: { fukuwarai: 40, senryu: 60, sashimi: 25 },
    iaidoRounds: 3,
    voteTime: 20,
    showMs: 4000,
    // звёзды — только тройке лидеров, йены — всем местам до 7-го
    prizes: [{ yen: 1000, stars: 3 }, { yen: 700, stars: 2 }, { yen: 500, stars: 1 }, { yen: 350, stars: 0 }, { yen: 250, stars: 0 }, { yen: 150, stars: 0 }, { yen: 100, stars: 0 }],
    dragon: { bpm: 90, accel: 8, maxBpm: 220, warm: 8, steps: 160, tapLag: 30 },
  },
  ringPrefs: [14, 40, 4],
  onsenPrefs: [20],
  chohanPrefs: [22, 7, 44],
  chohan: { bets: [100, 300, 500, 1000] },
  sudokuPrefs: [8, 39, 15],
  sudoku: { rewards: [{ yen: 200, stars: 0 }, { yen: 500, stars: 1 }, { yen: 1000, stars: 3 }], givens9: 40 },
  pachinko: { yenPerBall: 4, pack: 25 },
  ring: { cost: 300, cellMs: 70 },
  audioLatencyMs: 0,
  prefRewards: {},
  prizeNames: ['Приз от ведущего'],
  econ: ECON_VERSION,
};

/**
 * Рекомендуемая раскладка игр по префектурам (кнопка в админке, вкладка «Префектуры»).
 * В каждой префектуре не больше одной игры. Магазин может стоять вместе с групповой игрой, но не с соло-игрой —
 * иначе игрок, оставшийся поиграть, загораживает магазин.
 * У каждой групповой игры три задания, и каждое привязано к своей префектуре (RECOMMENDED_TASK_PREFS):
 * каллиграфия: «человек» — Хиросима (кисти Кумано), «гора» — Яманаси (Фудзи), кандзи года — Киото (его пишут в Киёмидзу-дэра);
 * фукуварай: Окамэ — Миядзаки (Такатихо, танец Амэ-но Удзумэ), Дарума — Гумма (Такасаки, город дарум), óни — Окаяма (Момотаро);
 * сэнрю: сакура и начальник — Нара (Ёсино), лягушка — Миэ (Ига, родина Басё), караоке — Хёго (караоке придумали в Кобе);
 * иайдо: дуэль у замка — Кумамото (замок, здесь Мусаси написал «Книгу пяти колец»), бамбуковая роща — Кагосима (сацумская школа Дзигэн-рю, бамбук),
 * ронины на мосту — Токио (47 ронинов, мост Рёгоку);
 * сашими: тунец — Вакаяма (Кацуура), краб — Хоккайдо, кальмар — Сага (Ёбуко).
 * Джа-одори — Нагасаки (праздник Кунти).
 * Соло: пачинко — Айти (родина пачинко), Осака, Сайтама; призовая машина — Канагава, Фукуока, Мияги; онсэн — Нагано (снежные обезьяны);
 * чо-хан — Сидзуока (Симидзу-но Дзиротё), Фукусима, Оита; судоку — Ибараки (Цукуба), Коти, Ниигата.
 * Магазины: от магазина до ближайшего — два шага, рядом с любой префектурой есть магазин; 4 внутри страны.
 */
export const RECOMMENDED_LAYOUT: Pick<Settings, 'pachinkoPrefs' | 'ringPrefs' | 'onsenPrefs' | 'chohanPrefs' | 'sudokuPrefs' | 'groupPrefs' | 'shopPrefs'> = {
  pachinkoPrefs: DEFAULT_SETTINGS.pachinkoPrefs,
  ringPrefs: DEFAULT_SETTINGS.ringPrefs,
  onsenPrefs: DEFAULT_SETTINGS.onsenPrefs,
  chohanPrefs: DEFAULT_SETTINGS.chohanPrefs,
  sudokuPrefs: DEFAULT_SETTINGS.sudokuPrefs,
  groupPrefs: DEFAULT_SETTINGS.groupPrefs,
  shopPrefs: DEFAULT_SETTINGS.shopPrefs,
};

/** задание → префектура в рекомендуемой раскладке (по id стандартных заданий) */
export const RECOMMENDED_TASK_PREFS: Record<string, number> = Object.fromEntries(DEFAULT_SETTINGS.groupTasks.map((t) => [t.id, t.pref!]));

/** настройки с рекомендуемой раскладкой: игры, магазины и привязка заданий к префектурам.
 *  Свои задания без пары в раскладке теряют привязку — иначе могли бы указывать на префектуру без этой игры */
export function withRecommendedLayout(s: Settings): Settings {
  const groupTasks = s.groupTasks.map((t) => {
    const { pref: _, ...rest } = t;
    const pref = RECOMMENDED_TASK_PREFS[t.id];
    return pref && RECOMMENDED_LAYOUT.groupPrefs[pref] === t.game ? { ...rest, pref } : rest;
  });
  return { ...s, ...structuredClone(RECOMMENDED_LAYOUT), groupTasks };
}

/** задание групповой игры для префектуры: привязанное к ней, иначе — не привязанное к другой префектуре этой игры */
export function tasksForPref(st: Settings, game: GroupGameId, code: number): GroupTask[] {
  const tasks = groupTasksFor(st, game);
  const own = tasks.filter((t) => t.pref === code);
  if (own.length) return own;
  const loose = tasks.filter((t) => !t.pref || st.groupPrefs[t.pref] !== game);
  return loose.length ? loose : tasks;
}

export function mergeSettings(saved: Partial<Settings> | null | undefined): Settings {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!saved) return d;
  const out: any = { ...d, ...saved };
  for (const k of ['reward', 'shop', 'pachinko', 'ring', 'group', 'chohan', 'sudoku'] as const) out[k] = { ...(d as any)[k], ...((saved as any)[k] ?? {}) };
  // экономику пересчитали: старые сохранённые награды и цены заменяем новыми (один раз, дальше решает ведущий)
  if ((saved.econ ?? 0) < ECON_VERSION) {
    out.reward = { ...out.reward, moverCorrectYen: d.reward.moverCorrectYen, moverWrongYen: d.reward.moverWrongYen, otherCorrectYen: d.reward.otherCorrectYen };
    out.shop = structuredClone(d.shop);
    out.ring = { ...out.ring, cost: d.ring.cost };
    out.econ = ECON_VERSION;
  }
  // в старых настройках награды только за 3 места — остальные места берём стандартные
  out.group.prizes = d.group.prizes.map((x, i) => out.group.prizes[i] ?? x);
  // джа-одори появилась позже сохранённых настроек: один раз закрепляем её за Нагасаки, если там свободно.
  // После сохранения в админке group.dragon уже есть — дальше решает ведущий
  if (!saved.group?.dragon && saved.groupPrefs && !Object.values(saved.groupPrefs).includes('dragon') && !saved.groupPrefs[42]) {
    out.groupPrefs = { ...saved.groupPrefs, 42: 'dragon' };
  }
  // сцены иайдо появились позже: стандартным заданиям без сцены даём их фон
  if (Array.isArray(saved.groupTasks)) out.groupTasks = out.groupTasks.map((t: GroupTask) => {
    const def = !t.scene && t.game === 'iaido' ? d.groupTasks.find((x) => x.id === t.id)?.scene : undefined;
    return def ? { ...t, scene: def } : t;
  });
  return out;
}

/** вопрос — спецвопрос: отмечен сам или лежит в спецтеме */
export function isSpecialQ(st: Pick<Settings, 'topics'>, q: Pick<Question, 'special' | 'topic'>): boolean {
  // спецвопрос = вопрос из спецтемы; флаг q.special в обычных темах игнорируется (старые данные)
  return !!st.topics.find((t) => t.id === q.topic)?.special;
}

export const BONUS_INFO: Record<BonusId, { name: string; short: string; icon: string }> = {
  fifty1: { name: 'Убрать 1 неверный ответ', short: '−1 ответ', icon: '✂️' },
  fifty2: { name: 'Убрать 2 неверных ответа', short: '50/50', icon: '🎯' },
  move2: { name: 'Ход на 2 префектуры', short: '×2 ход', icon: '👟' },
  turn2: { name: 'Дополнительный ход', short: 'доп. ход', icon: '🔁' },
};

export const REWARD_INFO: Record<RewardType, { name: string; icon: string }> = {
  money: { name: 'Йены', icon: '💴' },
  stars: { name: 'Звёзды', icon: '⭐' },
  bonus: { name: 'Бонус', icon: '🎁' },
  special: { name: 'Спецвопрос', icon: '🌈' },
  turn2: { name: 'Доп. ход', icon: '🔁' },
  prize: { name: 'ПРИЗ', icon: '🏆' },
};

/** call — короткая фраза для баннера-свитка в начале игры (у каллиграфии — само задание); scored — места по результату, без голосования */
export const GROUP_GAMES: Record<GroupGameId, { name: string; ja: string; kanji: string; how: string; doing: string; call: string; scored?: boolean }> = {
  calligraphy: { name: 'Каллиграфия', ja: '書道', kanji: '書', how: 'У всех на телефонах — холст и кисть', doing: 'Рисуют…', call: 'Нарисуй кандзи!' },
  fukuwarai: { name: 'Фукуварай', ja: '福笑い', kanji: '福', how: 'Детали лица исчезают, как только их положишь', doing: 'Собирают лица вслепую…', call: 'Собери лицо вслепую!' },
  senryu: { name: 'Сэнрю', ja: '川柳', kanji: '句', how: 'Допиши последнюю строку — 5 слогов', doing: 'Сочиняют…', call: 'Заверши хокку!' },
  iaido: { name: 'Иайдо', ja: '居合道', kanji: '斬', how: 'Жми, когда на ТВ вспыхнет «!». Раньше — выбываешь из раунда', doing: 'Ждём сигнала…', call: 'Руби первым!' },
  sashimi: { name: 'Сашими', ja: '刺身', kanji: '刺', how: 'Отрежь кусок нужного веса. Побеждает самый точный', doing: 'Примеряются ножом…', call: 'Отрежь точно!', scored: true },
  dragon: { name: 'Джа-одори', ja: '蛇踊り', kanji: '龍', how: 'Несём дракона: жмите ЛЕВУЮ и ПРАВУЮ по очереди в такт барабану. Сбился — выбыл', doing: 'Шагают…', call: 'Неси дракона!' },
};

/** соло-игры: доступны на телефоне, пока игрок стоит в префектуре; на паузе во время вопросов и групповых игр.
 *  Значок — пиксельная иконка с тем же id (src/img/icons). */
export const SOLO_GAMES: Record<SoloGameId, { name: string; icon: string; doing: string; key: 'pachinkoPrefs' | 'ringPrefs' | 'onsenPrefs' | 'chohanPrefs' | 'sudokuPrefs' }> = {
  pachinko: { name: 'Пачинко', icon: '🎰', doing: 'играет в пачинко', key: 'pachinkoPrefs' },
  ring: { name: 'Призовая машина', icon: '🎡', doing: 'крутит призовую машину', key: 'ringPrefs' },
  onsen: { name: 'Онсэн', icon: '♨️', doing: 'отдыхает в онсэне', key: 'onsenPrefs' },
  chohan: { name: 'Чо-хан', icon: '🎲', doing: 'играет в чо-хан', key: 'chohanPrefs' },
  sudoku: { name: 'Судоку', icon: '🔢', doing: 'решает судоку', key: 'sudokuPrefs' },
};

/** соло-игры в префектуре */
export function soloAt(st: Settings, code: number | null | undefined): SoloGameId[] {
  if (code == null) return [];
  return (Object.keys(SOLO_GAMES) as SoloGameId[]).filter((g) => (st[SOLO_GAMES[g].key] ?? DEFAULT_SETTINGS[SOLO_GAMES[g].key]).includes(code));
}

/** настройки джа-одори (в старых сохранённых настройках их нет) */
export function dragonSettings(st: Settings): DragonSettings {
  return { ...DEFAULT_SETTINGS.group.dragon!, ...(st.group.dragon ?? {}) };
}

/** время на работу в групповой игре, сек */
export function groupTime(st: Settings, game: GroupGameId) {
  if (game === 'iaido' || game === 'dragon') return 0;
  return game === 'calligraphy' ? st.group.drawTime : st.group.times?.[game] ?? DEFAULT_SETTINGS.group.times![game]!;
}

/** задания игры; если в сохранённых настройках их нет (игра новее настроек) — стандартные */
export function groupTasksFor(st: Settings, game: GroupGameId): GroupTask[] {
  const own = (st.groupTasks ?? []).filter((t) => t.game === game && t.text.trim());
  return own.length ? own : DEFAULT_SETTINGS.groupTasks.filter((t) => t.game === game);
}

export function iaidoRounds(st: Settings) {
  return Math.max(1, Math.min(9, st.group.iaidoRounds ?? DEFAULT_SETTINGS.group.iaidoRounds!));
}

/** сэнрю: строки задания (через « / » или перевод строки) */
export function senryuLines(text: string) {
  return text.split(/\s*\/\s*|\n/).map((x) => x.trim()).filter(Boolean);
}

/** слоги в русском тексте = гласные */
export function syllables(text: string) {
  return (text.toLowerCase().match(/[аеёиоуыэюяaeiouy]/g) ?? []).length;
}

export const PLAYER_COLORS = ['#ff4d6d', '#4dabff', '#ffd23f', '#5ce16b', '#c77dff', '#ff9f43', '#2ee6d6', '#ff7ad9', '#a3a3ff', '#f5f5f5'];
export const HATS = ['Кепка', 'Хатимаки', 'Корона', 'Ушки', 'Без шляпы'];

/** значки соло-игр на карте: id иконки → префектуры */
export function machinesOf(st: Settings): Record<string, number[]> {
  return Object.fromEntries((Object.keys(SOLO_GAMES) as SoloGameId[]).map((g) => [g, st[SOLO_GAMES[g].key] ?? []]));
}
