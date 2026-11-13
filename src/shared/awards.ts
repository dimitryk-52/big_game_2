// Индивидуальные призы (только на пульте ведущего): победитель, главный азартный игрок и главная «крыса».
// Считаются по счётчикам хоста (Tally из сохранённой партии), игрокам не показываются.
import { finalRank, type Tally } from './titles';
import type { Player } from './types';

/** очки «подлости»: за что и сколько */
export const RAT_RULES = [
  { metric: 'lured', pts: 5, icon: '🐾', label: 'увёл животное кормом/сашими' },
  { metric: 'carWreck', pts: 3, icon: '🚗', label: 'оставил соперника без машины' },
  { metric: 'duelAttack', pts: 2, icon: '⚔️', label: 'напал (дуэль, вызов)' },
  { metric: 'attackWeak', pts: 1, icon: '⬇️', label: 'напал на того, кто беднее' },
  { metric: 'robbed', pts: 2, icon: '💰', label: 'напал и ограбил (победа нападающего)' },
] as const;

export interface AwardRow {
  p: Player;
  /** главное число для сравнения */
  score: number;
  /** подсказка: из чего сложилось */
  detail: string;
  /** одинаковый ключ = настоящая ничья (с учётом доп. показателей) */
  key: string;
}

export interface Awards {
  winner: AwardRow[];
  gambler: AwardRow[];
  rat: AwardRow[];
}

const get = (t: Tally, m: string, id: string) => t[m]?.[id] ?? 0;
const yen = (n: number) => '¥' + Math.round(n).toLocaleString('ru-RU');

/** все игроки по убыванию; первые с равным счётом — лидеры (ничья — несколько) */
export function computeAwards(players: Player[], tally: Tally): Awards {
  const winner = finalRank(players).map((p) => ({ p, score: p.stars * 1e7 + p.yen, detail: `${p.stars}★ · ${yen(p.yen)}`, key: `${p.stars}|${p.yen}` }));

  const gambler = players
    .map((p) => {
      const n = get(tally, 'gambleN', p.id), staked = get(tally, 'gambleYen', p.id);
      return { p, score: n, staked, detail: `${n} ${plural(n, 'игра', 'игры', 'игр')} · поставлено ${yen(staked)}`, key: `${n}|${staked}` };
    })
    .sort((a, b) => b.score - a.score || b.staked - a.staked);

  const rat = players
    .map((p) => {
      const parts = RAT_RULES.map((r) => ({ r, n: get(tally, r.metric, p.id) })).filter((x) => x.n > 0);
      const score = parts.reduce((a, x) => a + x.n * x.r.pts, 0);
      const lured = get(tally, 'lured', p.id), stolen = get(tally, 'stolen', p.id);
      return { p, score, lured, stolen, detail: parts.map((x) => `${x.r.icon}×${x.n}`).join(' ') || '—', key: `${score}|${lured}|${stolen}` };
    })
    .sort((a, b) => b.score - a.score || b.lured - a.lured || b.stolen - a.stolen);

  return { winner, gambler, rat };
}

function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
