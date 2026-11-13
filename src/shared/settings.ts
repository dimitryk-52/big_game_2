import { DEFAULT_TOKENS, EPOCHS } from './economy';
import { DEFAULT_CAR, DEFAULT_DEALERS, OLD_DEALERS } from './cars';
import { KAIJU_DEFAULT } from '../games/kaiju';
import type { BonusId, DragonSettings, KaijuSettings, SumoSettings, GroupGameId, GroupTask, Question, RewardType, Settings, SoloGameId } from './types';

/** версия экономики (награды за ответы и цены магазина). Подняли — сохранённые в админке старые значения заменяются новыми */
export const ECON_VERSION = 4;
/** версия раскладки игр по префектурам (см. mergeSettings) */
export const LAYOUT_V = 4;
/** магазины и призовые машины до LAYOUT_V 3 (автосалоны тогда стояли отдельно от магазинов) */
const OLD_SHOPS = [2, 6, 9, 12, 19, 21, 28, 29, 35, 38, 41, 43];
const OLD_RING = [14, 40, 4];

/**
 * Линии синкансэна по префектурам — в том порядке, как их проходит поезд (по реальным линиям).
 * Нужны, чтобы нарисовать путь на карте; ехать по билету можно только между станциями (settings.shinkansen).
 */
export const SHINKANSEN_LINES: number[][] = [
  // Кюсю → Санъё → Токайдо → Тохоку → Хоккайдо
  [46, 43, 40, 35, 34, 33, 28, 27, 26, 23, 22, 14, 13, 11, 9, 7, 4, 3, 2, 1], // Сига и Гифу пропущены — иначе на карте зигзаг
  [11, 10, 15], // Дзёэцу: Омия → Такасаки → Ниигата
  [10, 20, 16, 17, 18], // Хокурику: Такасаки → Нагано → Тояма → Канадзава → Цуруга
  [40, 41, 42], // Ниси-Кюсю
  [3, 5], // Акита
  [7, 6], // Ямагата
];
/** станции по умолчанию: Хакодате (Хоккайдо), Аомори, Сэндай (Мияги), Токио, Ниигата, Канадзава (Исикава),
 *  Нагоя (Айти), Осака, Хиросима, Хаката (Фукуока), Кагосима — концы линий и большие узлы, 11 из 47 */
export const SHINKANSEN_STATIONS = [1, 2, 4, 13, 15, 17, 23, 27, 34, 40, 46];

/** награды групповых игр по местам (v3: звезда только за 1 место) */
export const GROUP_PRIZES = [{ yen: 1200, stars: 1 }, { yen: 800, stars: 0 }, { yen: 600, stars: 0 }, { yen: 400, stars: 0 }, { yen: 300, stars: 0 }, { yen: 200, stars: 0 }, { yen: 100, stars: 0 }];

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
    duelStealPct: 20,
  },
  betTime: 15,
  shop: {
    special: { yen: 500, stars: 3 },
    hp: { yen: 1000, stars: 0, amount: 2 },
    stat: { yen: 900, stars: 2 },
    fifty1: { yen: 600, stars: 0 },
    fifty2: { yen: 1200, stars: 0 },
    move2: { yen: 800, stars: 0 },
    coin: { yen: 500, stars: 0 },
    food: { yen: 600, stars: 0 },
    scroll: { yen: 1500, stars: 0 },
    ticket: { yen: 1000, stars: 0 },
  },
  // машины: цена и автосалоны марок (Гумма, Канагава, Гифу, Хёго, Ямагути, Кумамото) — все внутри магазинов
  car: { ...DEFAULT_CAR },
  dealers: { ...DEFAULT_DEALERS },
  // станции синкансэна (см. SHINKANSEN_LINES): 11 из 47, по одной на крупный город линии
  shinkansen: [...SHINKANSEN_STATIONS],
  // соло-игры и групповые по префектурам: см. RECOMMENDED_LAYOUT
  pachinkoPrefs: [23, 27, 11],
  // сеть магазинов: от магазина до ближайшего — два шага, рядом с любой префектурой есть магазин;
  // 3 внутри страны, остальные на побережье там, где без этого не обойтись; на соло-играх магазинов нет.
  // Все шесть автосалонов (dealers) — в этих же магазинах: Гумма, Канагава, Гифу, Хёго, Ямагути, Кумамото
  shopPrefs: [2, 6, 10, 12, 14, 21, 28, 29, 35, 38, 41, 43],
  shopTime: 45,
  soloCooldown: 3,
  groupPrefs: {
    26: 'calligraphy', 34: 'calligraphy', 19: 'calligraphy', 45: 'fukuwarai', 10: 'fukuwarai', 33: 'fukuwarai', 29: 'senryu', 24: 'senryu', 28: 'senryu',
    43: 'iaido', 46: 'iaido', 8: 'iaido', 13: 'godzilla', 30: 'sashimi', 1: 'sashimi', 41: 'sashimi', 42: 'dragon',
    3: 'noodles', 2: 'noodles', 37: 'noodles', 6: 'cherry',
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
    { id: 'iai3', game: 'iaido', text: 'Ронины встретились на мосту', scene: 'bridge', pref: 8 },
    { id: 'sash1', game: 'sashimi', text: 'Тунец из Кацууры', fish: 'tuna', pref: 30 },
    { id: 'sash3', game: 'sashimi', text: 'Нога камчатского краба', fish: 'crab', pref: 1 },
    { id: 'sash4', game: 'sashimi', text: 'Живой кальмар из Ёбуко', fish: 'squid', pref: 41 },
    { id: 'nood1', game: 'noodles', text: 'Ванко-соба в Мориоке: официантка не остановится', noodle: 'soba', pref: 3 },
    { id: 'nood2', game: 'noodles', text: 'Рамен на нибоси в Аомори: ещё порцию лапши!', noodle: 'ramen', pref: 2 },
    { id: 'nood3', game: 'noodles', text: 'Сануки-удон в Кагаве — префектуре удона', noodle: 'udon', pref: 37 },
    { id: 'cher1', game: 'cherry', text: 'Чемпионат Хигасинэ по плевкам вишнёвыми косточками', pref: 6 },
  ],
  group: {
    drawTime: 30,
    times: { fukuwarai: 40, senryu: 60, sashimi: 25, noodles: 40, cherry: 45 },
    iaidoRounds: 3,
    voteTime: 20,
    showMs: 4000,
    // звезда — только победителю (звёзд в игре мало: их меняют на жетоны финала), йены — всем местам до 7-го
    prizes: [...GROUP_PRIZES],
    dragon: { bpm: 90, accel: 8, maxBpm: 220, warm: 8, steps: 160, tapLag: 30, rounds: 3 },
    layoutV: LAYOUT_V,
  },
  ringPrefs: [9, 40, 4],
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
  epochRates: EPOCHS.map((e) => ({ price: e.price, reward: e.reward })),
  finalRounds: 3,
  sumo: { enabled: true, misses: 8, grace: 1, rampFrom: 3, ramp: 0.25, mult: 2 },
  tokens: structuredClone(DEFAULT_TOKENS),
  outsiderToken: true,
  outsiderTwo: false,
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
 * Лапша: ванко-соба — Иватэ (Мориока), рамен на нибоси — Аомори, сануки-удон — Кагава («префектура удона»).
 * Косточки — Ямагата (вишни сато-нисики, чемпионат по плевкам косточками в Хигасинэ).
 * Соло: пачинко — Айти (родина пачинко), Осака, Сайтама; призовая машина — Тотиги, Фукуока, Мияги; онсэн — Нагано (снежные обезьяны);
 * чо-хан — Сидзуока (Симидзу-но Дзиротё), Фукусима, Оита; судоку — Ибараки (Цукуба), Коти, Ниигата.
 * Магазины: от магазина до ближайшего — два шага, рядом с любой префектурой есть магазин; 3 внутри страны.
 * Автосалоны — внутри магазинов: Subaru — Гумма, Nissan — Канагава (Иокогама), Toyota — Гифу (Айти занят пачинко),
 * Mitsubishi — Хёго, Mazda — Ямагути (завод в Хофу; магазин в Хиросиме не встаёт в сеть), Honda — Кумамото.
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
  for (const k of ['reward', 'shop', 'pachinko', 'ring', 'group', 'chohan', 'sudoku', 'sumo'] as const) out[k] = { ...(d as any)[k], ...((saved as any)[k] ?? {}) };
  // экономику пересчитали: старые сохранённые награды и цены заменяем новыми (один раз, дальше решает ведущий)
  const econ = saved.econ ?? 0;
  if (econ < 1) {
    out.reward = { ...out.reward, moverCorrectYen: d.reward.moverCorrectYen, moverWrongYen: d.reward.moverWrongYen, otherCorrectYen: d.reward.otherCorrectYen };
    out.shop = structuredClone(d.shop);
    out.ring = { ...out.ring, cost: d.ring.cost };
  }
  // v2: кража в дуэли 15% → 20% (если ведущий не менял)
  if (econ < 2 && out.reward.duelStealPct === 15) out.reward.duelStealPct = d.reward.duelStealPct;
  // v3: звёзды в групповых играх — только победителю
  if (econ < 3) out.group = { ...out.group, prizes: structuredClone(GROUP_PRIZES) };
  out.tokens = { ...d.tokens!, ...(saved.tokens ?? {}), prizes: { ...d.tokens!.prizes, ...(saved.tokens?.prizes ?? {}) } };
  // v4: призы колеса стали «Носки / Не носки / VIP» (9/10/9) — старые количества заменяем
  if (econ < 4) out.tokens.prizes = structuredClone(d.tokens!.prizes);
  out.epochRates = d.epochRates!.map((x, i) => ({ ...x, ...(saved.epochRates?.[i] ?? {}) }));
  out.econ = ECON_VERSION;
  // в старых настройках награды только за 3 места — остальные места берём стандартные
  out.group.prizes = d.group.prizes.map((x, i) => out.group.prizes[i] ?? x);
  // джа-одори появилась позже сохранённых настроек: один раз закрепляем её за Нагасаки, если там свободно.
  // После сохранения в админке group.dragon уже есть — дальше решает ведущий
  if (!saved.group?.dragon && saved.groupPrefs && !Object.values(saved.groupPrefs).includes('dragon') && !saved.groupPrefs[42]) {
    out.groupPrefs = { ...saved.groupPrefs, 42: 'dragon' };
  }
  // игры, добавленные позже сохранённых настроек: один раз ставим их в свободные префектуры (дальше решает ведущий)
  for (const [v, game] of [[1, 'noodles'], [2, 'cherry']] as const) {
    if ((saved.group?.layoutV ?? 0) >= v || !saved.groupPrefs || Object.values(out.groupPrefs).includes(game)) continue;
    const add = Object.fromEntries(Object.entries(d.groupPrefs).filter(([c, g]) => g === game && !out.groupPrefs[+c]));
    out.groupPrefs = { ...out.groupPrefs, ...add };
  }
  // v3: автосалоны переехали в магазины — меняем только то, что ведущий не трогал (совпадает со старым по умолчанию)
  if ((saved.group?.layoutV ?? 0) < 3) {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (saved.shopPrefs && same([...saved.shopPrefs].sort((a, b) => a - b), OLD_SHOPS)) out.shopPrefs = [...d.shopPrefs];
    if (saved.ringPrefs && same(saved.ringPrefs, OLD_RING)) out.ringPrefs = [...d.ringPrefs];
    if (!saved.dealers || same(Object.entries(saved.dealers).sort(), Object.entries(OLD_DEALERS).sort())) out.dealers = { ...DEFAULT_DEALERS };
  }
  // v4: «Годзилла» занимает Токио; игра, что стояла там, переезжает в Ибараки (если там свободно) вместе с заданиями
  if ((saved.group?.layoutV ?? 0) < 4 && saved.groupPrefs && out.groupPrefs[13] !== 'godzilla') {
    const was = out.groupPrefs[13];
    const gp = { ...out.groupPrefs };
    if (was && !gp[8]) {
      gp[8] = was;
      out.groupTasks = out.groupTasks.map((t: GroupTask) => (t.game === was && t.pref === 13 ? { ...t, pref: 8 } : t));
    }
    gp[13] = 'godzilla';
    out.groupPrefs = gp;
  }
  out.group.layoutV = LAYOUT_V;
  // сцены иайдо появились позже: стандартным заданиям без сцены даём их фон
  if (Array.isArray(saved.groupTasks)) out.groupTasks = out.groupTasks.map((t: GroupTask) => {
    const def = !t.scene && t.game === 'iaido' ? d.groupTasks.find((x) => x.id === t.id)?.scene : undefined;
    return def ? { ...t, scene: def } : t;
  });
  return out;
}

/** вопрос — спецвопрос: отмечен сам или лежит в спецтеме */
/** тема, в которой подсказывает ириомотейская кошка: из настроек или тема с «биолог» в названии */
export function catTopicOf(st: Pick<Settings, 'topics'> & { catTopic?: string }): string | undefined {
  return st.catTopic || st.topics.find((t) => /биолог/i.test(t.name))?.id;
}

export function isSpecialQ(st: Pick<Settings, 'topics'>, q: Pick<Question, 'special' | 'topic'>): boolean {
  // спецвопрос = вопрос из спецтемы; флаг q.special в обычных темах игнорируется (старые данные)
  return !!st.topics.find((t) => t.id === q.topic)?.special;
}

/** интро Окинавы (первое воскрешение игрока) */
export const OKINAWA_NOTE = 'Остров, где приходят в себя после нокаута. HP восстанавливается полностью, а за верный ответ на вопрос — деньги и бонус. Потом — обратно в бой!';

/** защита от фарма: отказ денежной соло-игры, если игрок вернулся слишком быстро */
export const FARM_NO = {
  pachinko: 'Автомат узнал тебя в лицо и притворился сломанным.',
  ring: 'Барабан ещё не остыл после прошлого раза — дай ему передохнуть.',
  chohan: 'Якудза за столом переглядываются: «Опять ты? Шёл бы погулять».',
  sudoku: 'Монах-составитель ещё не придумал для тебя новую головоломку.',
} as const;

export const BONUS_INFO: Record<BonusId, { name: string; short: string; icon: string }> = {
  fifty1: { name: 'Убрать 1 неверный ответ', short: '−1 ответ', icon: '✂️' },
  fifty2: { name: 'Убрать 2 неверных ответа', short: '50/50', icon: '🎯' },
  move2: { name: 'Ход на 2 префектуры', short: '×2 ход', icon: '👟' },
  turn2: { name: 'Дополнительный ход', short: 'доп. ход', icon: '🔁' },
  coin: { name: 'Монета', short: '+1 удар', icon: '🪙' },
  food: { name: 'Корм', short: 'корм', icon: '🥡' },
  ticket: { name: 'Билет на синкансэн', short: 'синкансэн', icon: '🚄' },
  cheat: { name: 'Шпаргалка', short: 'шпаргалка', icon: '📜' },
  neko: { name: 'Манэки-нэко', short: '×2 йены', icon: '🐱' },
  coupon: { name: 'Купон −50%', short: 'купон', icon: '🎫' },
  scroll: { name: 'Свиток-вызов', short: 'вызов', icon: '📜' },
  sashimi: { name: 'Кусочек сашими', short: 'сашими', icon: '🍣' },
};

/** монетка: сколько урона добавляет к удару в дуэли */
export const COIN_DMG = { coin: 1 } as const;

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
  dragon: { name: 'Джа-одори', ja: '蛇踊り', kanji: '龍', how: 'Тапай в такт: ЛЕВАЯ, ПРАВАЯ, ЛЕВАЯ… Сбился — выбыл', doing: 'Шагают…', call: 'Неси дракона!' },
  cherry: { name: 'Косточки', ja: '種飛ばし', kanji: '種', how: 'Три плевка: поймай угол, потом силу. Ветер у попытки один на всех. Перестараешься — поперхнёшься', doing: 'Плюются косточками…', call: 'Плюнь дальше всех!' },
  godzilla: { name: 'Годзилла', ja: 'ゴジラ', kanji: '怪', how: 'Лидер — Годзилла: шагай и топчи дома. Остальные — охотники: тапни клетку, снаряд упадёт туда через секунду', doing: 'Токио в опасности…', call: 'Спаси Токио — или растопчи!' },
  noodles: { name: 'Лапша', ja: '麺', kanji: '麺', how: 'Тапай по миске — ешь. Остановись вовремя: переешь — лопнешь, и в зачёт пойдёт половина', doing: 'Едят наперегонки…', call: 'Ешь, пока влезает!' },
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

/** что есть в префектуре — иконки для плашки интро: награда (пока не забрали), соло-игры, магазин, групповая игра (пока не сыграна) */
export function prefIcons(st: Settings, code: number, ps?: { reward: RewardType; taken?: boolean; groupDone?: boolean } | null): string[] {
  const out: string[] = [];
  if (ps && !ps.taken) out.push(ps.reward);
  out.push(...soloAt(st, code));
  if ((st.shopPrefs ?? []).includes(code)) out.push('shop');
  const dealer = (st.dealers ?? DEFAULT_DEALERS)[code];
  if (dealer) out.push('emb_' + dealer);
  const g = st.groupPrefs?.[code];
  if (g && !ps?.groupDone) out.push('group_' + g);
  return out;
}

/** настройки джа-одори (в старых сохранённых настройках их нет) */
export function sumoSettings(st: Settings): SumoSettings {
  return { ...(DEFAULT_SETTINGS.sumo as SumoSettings), ...(st.sumo ?? {}) };
}

export function kaijuSettings(st: Settings): KaijuSettings {
  return { ...KAIJU_DEFAULT, ...(st.group.kaiju ?? {}) };
}

export function dragonSettings(st: Settings): DragonSettings {
  return { ...DEFAULT_SETTINGS.group.dragon!, ...(st.group.dragon ?? {}) };
}

/** время на работу в групповой игре, сек */
export function groupTime(st: Settings, game: GroupGameId) {
  if (game === 'iaido' || game === 'dragon' || game === 'godzilla') return 0;
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

/** значки соло-игр на карте: id иконки → префектуры */
export function machinesOf(st: Settings): Record<string, number[]> {
  return Object.fromEntries((Object.keys(SOLO_GAMES) as SoloGameId[]).map((g) => [g, st[SOLO_GAMES[g].key] ?? []]));
}
