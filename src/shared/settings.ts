import type { BonusId, GroupGameId, GroupTask, Question, RewardType, Settings, SoloGameId } from './types';

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
    moverCorrectYen: 300,
    moverCorrectStars: 1,
    moverWrongYen: 100,
    otherCorrectYen: 100,
    calibCorrectYen: 100,
    prefMoney: 500,
    prefStars: 2,
    reviveYen: 300,
    duelWinYen: 300,
    duelWinStars: 1,
  },
  shop: {
    special: { yen: 0, stars: 3 },
    hp: { yen: 500, stars: 0, amount: 2 },
    stat: { yen: 400, stars: 2 },
    fifty1: { yen: 300, stars: 0 },
    fifty2: { yen: 600, stars: 0 },
    move2: { yen: 400, stars: 0 },
  },
  // соло-игры и групповые по префектурам: см. RECOMMENDED_LAYOUT
  pachinkoPrefs: [23, 27, 13],
  // сеть магазинов: от магазина до ближайшего — два шага, рядом с любой префектурой есть магазин;
  // 4 внутри страны, остальные на побережье там, где без этого не обойтись
  shopPrefs: [2, 6, 9, 12, 19, 21, 28, 29, 35, 38, 41, 43],
  shopTime: 45,
  groupPrefs: { 26: 'calligraphy', 34: 'calligraphy', 33: 'fukuwarai', 3: 'fukuwarai', 13: 'senryu', 38: 'senryu', 1: 'sashimi', 30: 'sashimi', 41: 'sashimi' },
  groupTasks: [
    { id: 'cal1', game: 'calligraphy', text: 'Нарисуйте свою версию кандзи «человек» 人' },
    { id: 'cal2', game: 'calligraphy', text: 'Нарисуйте кандзи «гора» 山' },
    { id: 'cal3', game: 'calligraphy', text: 'Нарисуйте кандзи «сердце» 心' },
    { id: 'cal4', game: 'calligraphy', text: 'Нарисуйте кандзи «огонь» 火' },
    { id: 'cal5', game: 'calligraphy', text: 'Нарисуйте свой кандзи года — какой хотите' },
    { id: 'fuku1', game: 'fukuwarai', text: 'Соберите лицо Окамэ — богини веселья', face: 'okame' },
    { id: 'fuku2', game: 'fukuwarai', text: 'Соберите лицо Дарумы', face: 'daruma' },
    { id: 'fuku3', game: 'fukuwarai', text: 'Соберите лицо демона Óни', face: 'oni' },
    { id: 'sen1', game: 'senryu', text: 'Остыл мой рамен / Пока я его снимал' },
    { id: 'sen2', game: 'senryu', text: 'Токийский вагон / Все спят стоя, как кони' },
    { id: 'sen3', game: 'senryu', text: 'Сакура в цвету / Начальник под деревом' },
    { id: 'sen4', game: 'senryu', text: 'Тихий пруд в саду / В пруд прыгнул лягушонок' },
    { id: 'sen5', game: 'senryu', text: 'Караоке, ночь / Микрофон не отдаёт' },
    { id: 'sen6', game: 'senryu', text: 'Синкансэн летит / Фудзи мелькнула в окне' },
    { id: 'sash1', game: 'sashimi', text: 'Тунец из Кацууры', fish: 'tuna' },
    { id: 'sash2', game: 'sashimi', text: 'Лосось с Хоккайдо', fish: 'salmon' },
    { id: 'sash3', game: 'sashimi', text: 'Нога камчатского краба', fish: 'crab' },
    { id: 'sash4', game: 'sashimi', text: 'Живой кальмар из Ёбуко', fish: 'squid' },
  ],
  group: {
    drawTime: 30,
    times: { fukuwarai: 40, senryu: 60, sashimi: 25 },
    voteTime: 20,
    showMs: 4000,
    prizes: [{ yen: 1000, stars: 3 }, { yen: 600, stars: 2 }, { yen: 300, stars: 1 }],
  },
  ringPrefs: [14, 40, 4],
  chohanPrefs: [22, 10, 46],
  chohan: { bets: [100, 300, 500, 1000] },
  sudokuPrefs: [13, 20, 43],
  sudoku: { rewards: [{ yen: 200, stars: 0 }, { yen: 500, stars: 1 }, { yen: 1000, stars: 3 }], givens9: 40 },
  pachinko: { yenPerBall: 4, pack: 25 },
  ring: { cost: 200, prizeYen: 1500, physicalPrize: true, cellMs: 70 },
  audioLatencyMs: 0,
  prefRewards: {},
  prizeNames: ['Приз от ведущего'],
};

/**
 * Рекомендуемая раскладка игр по префектурам (кнопка в админке, вкладка «Префектуры»).
 * Соло: пачинко — Нагоя (родина пачинко), Осака, Токио; чо-хан — Сидзуока (Симидзу-но Дзиротё),
 * Гумма (Кунисада Тюдзи), Кагосима; судоку — Токио (издательство Nikoli), Нагано, Кумамото.
 * Групповые: каллиграфия — Киото, Хиросима (кисти Кумано); фукуварай — Окаяма (Момотаро и óни),
 * Иватэ (легенда об óни и отпечатке руки); сэнрю — Токио (Эдо, Карай Сэнрю), Эхимэ (Мацуяма, город хайку);
 * сашими — Хоккайдо (краб, лосось), Вакаяма (тунец), Сага (кальмар Ёбуко).
 * Магазины не трогаем: они уживаются с любыми играми.
 */
export const RECOMMENDED_LAYOUT: Pick<Settings, 'pachinkoPrefs' | 'ringPrefs' | 'chohanPrefs' | 'sudokuPrefs' | 'groupPrefs'> = {
  pachinkoPrefs: DEFAULT_SETTINGS.pachinkoPrefs,
  ringPrefs: DEFAULT_SETTINGS.ringPrefs,
  chohanPrefs: DEFAULT_SETTINGS.chohanPrefs,
  sudokuPrefs: DEFAULT_SETTINGS.sudokuPrefs,
  groupPrefs: DEFAULT_SETTINGS.groupPrefs,
};

export function mergeSettings(saved: Partial<Settings> | null | undefined): Settings {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!saved) return d;
  const out: any = { ...d, ...saved };
  for (const k of ['reward', 'shop', 'pachinko', 'ring', 'group', 'chohan', 'sudoku'] as const) out[k] = { ...(d as any)[k], ...((saved as any)[k] ?? {}) };
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

/** scored — места по результату, без голосования */
export const GROUP_GAMES: Record<GroupGameId, { name: string; ja: string; kanji: string; how: string; doing: string; scored?: boolean }> = {
  calligraphy: { name: 'Каллиграфия', ja: '書道', kanji: '書', how: 'У всех на телефонах — холст и кисть', doing: 'Рисуют…' },
  fukuwarai: { name: 'Фукуварай', ja: '福笑い', kanji: '福', how: 'Собираем лицо вслепую: положенные детали сразу исчезают', doing: 'Собирают лица вслепую…' },
  senryu: { name: 'Сэнрю', ja: '川柳', kanji: '句', how: 'Допишите последнюю строку стиха (5 слогов)', doing: 'Сочиняют…' },
  sashimi: { name: 'Сашими', ja: '刺身', kanji: '刺', how: 'Отрежьте кусок нужного веса. Побеждает самый точный', doing: 'Примеряются ножом…', scored: true },
};

export const SOLO_GAMES: Record<SoloGameId, { name: string; icon: string; key: 'pachinkoPrefs' | 'ringPrefs' | 'chohanPrefs' | 'sudokuPrefs' }> = {
  pachinko: { name: 'Пачинко', icon: '🎰', key: 'pachinkoPrefs' },
  ring: { name: 'Призовая машина', icon: '🎡', key: 'ringPrefs' },
  chohan: { name: 'Чо-хан', icon: '🎲', key: 'chohanPrefs' },
  sudoku: { name: 'Судоку', icon: '🔢', key: 'sudokuPrefs' },
};

/** соло-игры в префектуре */
export function soloAt(st: Settings, code: number | null | undefined): SoloGameId[] {
  if (code == null) return [];
  return (Object.keys(SOLO_GAMES) as SoloGameId[]).filter((g) => (st[SOLO_GAMES[g].key] ?? DEFAULT_SETTINGS[SOLO_GAMES[g].key]).includes(code));
}

/** время на работу в групповой игре, сек */
export function groupTime(st: Settings, game: GroupGameId) {
  return game === 'calligraphy' ? st.group.drawTime : st.group.times?.[game] ?? DEFAULT_SETTINGS.group.times![game]!;
}

/** задания игры; если в сохранённых настройках их нет (игра новее настроек) — стандартные */
export function groupTasksFor(st: Settings, game: GroupGameId): GroupTask[] {
  const own = (st.groupTasks ?? []).filter((t) => t.game === game && t.text.trim());
  return own.length ? own : DEFAULT_SETTINGS.groupTasks.filter((t) => t.game === game);
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
