// Внешность персонажа: части (рисунки в src/img/char/*.png, исходник art/chars/chars.px.js) и палитры.
// Цвет верха = цвет игрока (Player.color), головной убор = Player.hat, остальное — Player.look.

export interface Look {
  skin: number;
  hair: number;
  hairC: number;
  hatC: number;
  top: number;
  bot: number;
  botC: number;
}

export type Part = { id: string; name: string };

export const HAIRS: Part[] = [
  { id: 'short', name: 'Короткие' },
  { id: 'spiky', name: 'Аниме' },
  { id: 'bob', name: 'Каре' },
  { id: 'long', name: 'Длинные' },
  { id: 'pony', name: 'Хвост' },
  { id: 'topknot', name: 'Тёнмагэ' },
  { id: 'buns', name: 'Пучки' },
  { id: 'afro', name: 'Афро' },
  { id: 'none', name: 'Лысый' },
];
/** за телом рисуется вторая часть причёски */
export const HAIR_BACK = new Set(['long', 'pony']);

/** cover: top — прячет волосы над собой, all — прячет все волосы */
export const HATS: (Part & { cover?: 'top' | 'all' })[] = [
  { id: 'none', name: 'Без убора' },
  { id: 'cap', name: 'Кепка', cover: 'top' },
  { id: 'band', name: 'Хатимаки' },
  { id: 'kasa', name: 'Каса', cover: 'top' },
  { id: 'cat', name: 'Ушки' },
  { id: 'fox', name: 'Кицунэ' },
  { id: 'beanie', name: 'Шапка', cover: 'top' },
  { id: 'oni', name: 'Рожки они' },
  { id: 'crown', name: 'Корона' },
  { id: 'ninja', name: 'Ниндзя', cover: 'all' },
];

export const TOPS: Part[] = [
  { id: 'tee', name: 'Футболка' },
  { id: 'kimono', name: 'Кимоно' },
  { id: 'happi', name: 'Хаппи' },
  { id: 'uniform', name: 'Гакуран' },
  { id: 'sailor', name: 'Матроска' },
  { id: 'hoodie', name: 'Худи' },
  { id: 'armor', name: 'Доспех' },
];

export const BOTS: Part[] = [
  { id: 'pants', name: 'Брюки' },
  { id: 'shorts', name: 'Шорты' },
  { id: 'skirt', name: 'Юбка' },
  { id: 'hakama', name: 'Хакама' },
];

/** [светлый, тень] */
export type Tone = [string, string];

export const SKINS: Tone[] = [
  ['#f6d2b0', '#d29a78'],
  ['#e0a878', '#b0744c'],
  ['#9c6440', '#6c4028'],
  ['#8cd47c', '#4c9a50'],
];

export const HAIR_COLORS: Tone[] = [
  ['#3a3442', '#1c1824'],
  ['#7a4630', '#4e2a1e'],
  ['#b0683c', '#743e22'],
  ['#f0c850', '#b88c28'],
  ['#e07030', '#a04818'],
  ['#e8e8f0', '#a8a8b8'],
  ['#f088b8', '#b85888'],
  ['#5878e0', '#3448a0'],
  ['#58c070', '#2e8448'],
  ['#9a68d8', '#64409c'],
];

/** ткань: низ и головной убор */
export const CLOTH_COLORS: Tone[] = [
  ['#3858c0', '#24387c'],
  ['#44444e', '#24242c'],
  ['#8a5a34', '#5a3a20'],
  ['#c8a868', '#907438'],
  ['#a0a0b0', '#686878'],
  ['#f0f0f0', '#b8b8c8'],
  ['#d83a48', '#982434'],
  ['#48a858', '#2c7038'],
  ['#8a58c8', '#5a3888'],
  ['#f08cb8', '#b8588a'],
  ['#f0c838', '#b88c20'],
  ['#30b8b0', '#1c7c78'],
];

export const DEFAULT_LOOK: Look = { skin: 0, hair: 0, hairC: 1, hatC: 6, top: 0, bot: 0, botC: 0 };

export function randomLook(rnd: () => number = Math.random): Look {
  const r = (n: number) => Math.floor(rnd() * n);
  return {
    skin: r(SKINS.length), hair: r(HAIRS.length), hairC: r(HAIR_COLORS.length), hatC: r(CLOTH_COLORS.length),
    top: r(TOPS.length), bot: r(BOTS.length), botC: r(CLOTH_COLORS.length),
  };
}

/** привести к допустимым индексам (данные с телефона) */
export function cleanLook(l: Partial<Look> | undefined): Look {
  const d = DEFAULT_LOOK;
  const ix = (v: unknown, n: number, def: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : def);
  return {
    skin: ix(l?.skin, SKINS.length, d.skin), hair: ix(l?.hair, HAIRS.length, d.hair), hairC: ix(l?.hairC, HAIR_COLORS.length, d.hairC),
    hatC: ix(l?.hatC, CLOTH_COLORS.length, d.hatC), top: ix(l?.top, TOPS.length, d.top), bot: ix(l?.bot, BOTS.length, d.bot),
    botC: ix(l?.botC, CLOTH_COLORS.length, d.botC),
  };
}

/** префектура Акита: первый, кто туда придёт, получает собаку */
export const AKITA_PREF = 5;
/** Токио: к нему персонаж повёрнут при высадке */
export const TOKYO_PREF = 13;
