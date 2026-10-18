import type { BonusId, RewardType, Settings } from './types';

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
  pachinkoPrefs: [13, 27, 23],
  ringPrefs: [14, 40, 4],
  pachinko: { yenPerBall: 4, pack: 25 },
  ring: { cost: 200, prizeYen: 1500, physicalPrize: true, cellMs: 70 },
  audioLatencyMs: 0,
  prefRewards: {},
  prizeNames: ['Приз от ведущего'],
};

export function mergeSettings(saved: Partial<Settings> | null | undefined): Settings {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!saved) return d;
  const out: any = { ...d, ...saved };
  for (const k of ['reward', 'shop', 'pachinko', 'ring'] as const) out[k] = { ...(d as any)[k], ...((saved as any)[k] ?? {}) };
  return out;
}

export const BONUS_INFO: Record<BonusId, { name: string; short: string; icon: string }> = {
  fifty1: { name: 'Убрать 1 неверный ответ', short: '−1 ответ', icon: '✂️' },
  fifty2: { name: 'Убрать 2 неверных ответа', short: '50/50', icon: '🎯' },
  move2: { name: 'Ход на 2 префектуры', short: '×2 ход', icon: '👟' },
};

export const REWARD_INFO: Record<RewardType, { name: string; icon: string }> = {
  money: { name: 'Йены', icon: '💴' },
  stars: { name: 'Звёзды', icon: '⭐' },
  bonus: { name: 'Бонус', icon: '🎁' },
  special: { name: 'Спецвопрос', icon: '💥' },
  prize: { name: 'ПРИЗ', icon: '🏆' },
};

export const PLAYER_COLORS = ['#ff4d6d', '#4dabff', '#ffd23f', '#5ce16b', '#c77dff', '#ff9f43', '#2ee6d6', '#ff7ad9', '#a3a3ff', '#f5f5f5'];
export const HATS = ['Кепка', 'Хатимаки', 'Корона', 'Ушки', 'Без шляпы'];
