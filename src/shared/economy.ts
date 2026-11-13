// Экономика: эпохи (предсказуемая инфляция), стоимость игрока (net worth), находки отстающим.
import type { BonusId, GameState, Player, Settings } from './types';

/** эпохи по доле открытых префектур: цены растут быстрее наград, звёзды не дешевеют */
export const EPOCHS = [
  { name: 'Эдо', ja: '江戸', from: 0, price: 1, reward: 1 },
  { name: 'Мэйдзи', ja: '明治', from: 0.4, price: 1.5, reward: 1.25 },
  { name: 'Сёва', ja: '昭和', from: 0.75, price: 2, reward: 1.5 },
] as const;

/** эпоха по доле открытых префектур */
export function epochFor(s: Pick<GameState, 'prefs'>): number {
  const all = Object.values(s.prefs);
  if (!all.length) return 0;
  const f = all.filter((p) => p.rev).length / all.length;
  let e = 0;
  EPOCHS.forEach((x, i) => { if (f >= x.from) e = i; });
  return e;
}

/** текущая эпоха игры (запомнена движком при объявлении) */
export const epochOf = (s: Pick<GameState, 'epoch'>) => Math.max(0, Math.min(EPOCHS.length - 1, s.epoch ?? 0));

/** множители эпохи: цены и награды */
export interface EpochRates { price: number; reward: number }

/** множители эпохи из настроек (пульт ведущего), иначе стандартные */
export function epochRatesFor(st: Pick<Settings, 'epochRates'>, epoch: number): EpochRates {
  const d = EPOCHS[Math.max(0, Math.min(EPOCHS.length - 1, epoch))];
  const x = st.epochRates?.[epoch];
  const ok = (v: any) => typeof v === 'number' && v > 0 && v < 20;
  return { price: ok(x?.price) ? x!.price : d.price, reward: ok(x?.reward) ? x!.reward : d.reward };
}

/** множители текущей эпохи: запомнены движком в момент её наступления (ведущий мог поменять их на пульте заранее) */
export function ratesOf(s: Pick<GameState, 'epoch' | 'rates' | 'settings'>): EpochRates {
  return s.rates ?? epochRatesFor(s.settings, epochOf(s));
}

/** йены с учётом эпохи, округлено до 50 */
const round50 = (x: number) => Math.round(x / 50) * 50;
export const priceYen = (yen: number, r: EpochRates) => (yen ? round50(yen * r.price) : 0);
export const rewardYen = (yen: number, r: EpochRates) => (yen ? round50(yen * r.reward) : 0);
/** «×1,5» */
export const fmtMul = (x: number) => '×' + String(Math.round(x * 100) / 100).replace('.', ',');

/** цена товара в магазине: йены растут с эпохой, звёзды — нет; купон — половина цены в йенах */
export function shopCost(st: Settings, item: keyof Settings['shop'], r: EpochRates, coupon = false): { yen: number; stars: number } {
  const c = st.shop[item];
  const yen = priceYen(c.yen, r);
  return { yen: coupon ? round50(yen / 2) : yen, stars: c.stars };
}

/** курс звезды в йенах для подсчёта стоимости игрока */
export const STAR_YEN = 1000;

/** стоимость игрока: деньги + звёзды + предметы (полцены магазина) + спецвопросы */
export function netWorth(p: Player, st: Settings): number {
  const shop = st.shop as Record<string, { yen: number }>;
  let items = 0;
  for (const [b, n] of Object.entries(p.bonuses ?? {})) {
    const base = shop[b]?.yen ?? (b === 'turn2' ? 1000 : 400);
    items += (n ?? 0) * base * 0.5;
  }
  if (p.car) items += (st.car?.yen ?? 2000) * 0.5;
  return p.yen + p.stars * STAR_YEN + items + p.specials * (st.shop.special.yen * 0.5 + st.shop.special.stars * STAR_YEN * 0.5) + (p.maxHp - st.startHp) * 300;
}

/** медиана */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ───── находки ─────

/** что можно найти под ногами. Предметы попадают в инвентарь, остальное срабатывает сразу */
export type FindId = 'coin' | 'cheat' | 'wallet' | 'neko' | 'map' | 'rickshaw' | 'coupon' | 'ticket' | 'kitsune' | 'token';

export const FIND_INFO: Record<FindId, { name: string; icon: string; desc: string; bonus?: BonusId; public?: boolean }> = {
  coin: { name: 'Монетка', icon: 'bonus_coin', bonus: 'coin', desc: 'В дуэли брось её на вопрос — если твой удар пройдёт, он сильнее на 1.' },
  cheat: { name: 'Шпаргалка', icon: 'bonus_cheat', bonus: 'cheat', desc: 'Кнопка под ответами в вопросе префектуры: оставит только правильный ответ. Не работает в дуэлях и призовых вопросах.' },
  wallet: { name: 'Кошелёк', icon: 'find_wallet', desc: 'Кто-то обронил кошелёк. Деньги уже у тебя.' },
  neko: { name: 'Манэки-нэко', icon: 'bonus_neko', bonus: 'neko', desc: 'Кошка удачи: за следующий правильный ответ на вопрос префектуры получишь вдвое больше йен. Срабатывает сама.' },
  map: { name: 'Старая карта', icon: 'find_map', desc: 'На карте отмечены награды префектур вокруг тебя и то, что скрыто в тумане. Смотри при выборе хода.' },
  rickshaw: { name: 'Попутный рикша', icon: 'find_rickshaw', desc: 'Рикша подвезёт: в этот ход можно пройти сразу на 2 префектуры — бесплатно.' },
  coupon: { name: 'Купон', icon: 'bonus_coupon', bonus: 'coupon', desc: 'Скидка 50% на одну покупку в магазине (по йенам). Тратится на первую покупку.' },
  ticket: { name: 'Билет на синкансэн', icon: 'bonus_ticket', bonus: 'ticket', desc: 'Стоишь на станции синкансэна — в свой ход уезжаешь на любую другую станцию.' },
  kitsune: { name: 'Кицунэ', icon: 'find_kitsune', public: true, desc: 'Лиса-проказница утащила деньги у лидера и принесла тебе.' },
  token: { name: 'Жетон', icon: 'token', desc: 'Жетон финальной призовой игры! Он уже твой — добавится к тем, что получишь в обмен на звёзды и деньги.' },
};

// ───── финальная призовая игра: жетоны и колесо ─────

/** редкость приза: размер сектора = призов этой редкости (у обычных и необычных — ×3) */
export type PrizeTier = 'common' | 'uncommon' | 'rare';
export const PRIZE_TIERS: PrizeTier[] = ['common', 'uncommon', 'rare'];
export const TIER_INFO: Record<PrizeTier, { name: string; color: string; mul: number }> = {
  common: { name: 'Обычный', color: '#8d93b8', mul: 3 },
  uncommon: { name: 'Необычный', color: '#3cb54a', mul: 3 },
  rare: { name: 'Редкий', color: '#c77dff', mul: 1 },
};
export const DEFAULT_TOKENS = { starsPer: 3, yenPer: 3000, prizes: { common: 8, uncommon: 5, rare: 3 } as Record<PrizeTier, number> };

/** жетонов в обмен на звёзды и деньги (дробные части складываются) */
export function tokensValue(p: Pick<Player, 'stars' | 'yen'>, st: Settings): number {
  const t = st.tokens ?? DEFAULT_TOKENS;
  return p.stars / Math.max(1, t.starsPer) + p.yen / Math.max(1, t.yenPer);
}
export const tokensFor = (p: Pick<Player, 'stars' | 'yen'>, st: Settings) => Math.floor(tokensValue(p, st) + 1e-9);

/** как работает предмет — для инвентаря на телефоне */
export const BONUS_DESC: Partial<Record<BonusId, string>> = {
  fifty1: 'Кнопка под ответами: убирает один неверный вариант.',
  fifty2: 'Кнопка под ответами: убирает два неверных варианта.',
  move2: 'При выборе хода можно шагнуть сразу на 2 префектуры.',
  turn2: 'После хода предложат сходить ещё раз.',
  coin: 'В дуэли брось на вопрос: если твой удар пройдёт, он сильнее на 1.',
  ticket: 'Со станции синкансэна — в свой ход на любую другую станцию.',
  food: 'Пахнет вкусно. Кому-нибудь обязательно понравится — главное, оказаться рядом.',
  sashimi: 'Лучший кусок с победной доски. Свежайший — пальчики оближешь.',
  cheat: FIND_INFO.cheat.desc,
  neko: FIND_INFO.neko.desc,
  coupon: FIND_INFO.coupon.desc,
};
