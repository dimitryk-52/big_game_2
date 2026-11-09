// Ячейки барабанов (темы, бонусы) и сектора колеса призов — для ТВ и телефона.
import type { BonusId, GameState, TopicId } from '../shared/types';
import type { ReelSeg } from './Reel';
import type { WheelSeg } from './Wheel';
import { BONUS_INFO } from '../shared/settings';
import { TIER_INFO, type PrizeTier } from '../shared/economy';
import { pixelIconUrl, topicIconUrl } from '../shared/sprites';

export function topicSegs(s: GameState, ids: TopicId[]): ReelSeg[] {
  return ids.map((id) => {
    const t = s.settings.topics.find((x) => x.id === id);
    return { id, label: t?.name ?? id, color: t?.color ?? '#888', icon: topicIconUrl(id, t?.color ?? '#888', 4, { icon: t?.icon as any }) };
  });
}

const BONUS_COLOR: Partial<Record<BonusId, string>> = { fifty1: '#4a55a8', fifty2: '#2e7fd6', move2: '#ff9f43', coin: '#b8662e', ticket: '#e8364e', turn2: '#2fa23f', scroll: '#a63a4c' };

export function bonusSegs(ids: BonusId[]): ReelSeg[] {
  return ids.map((b) => ({ id: b, label: BONUS_INFO[b].name, short: BONUS_INFO[b].short, color: BONUS_COLOR[b] ?? '#5b5f7e', icon: pixelIconUrl('bonus_' + b, 4) }));
}

export function tierSegs(segs: { id: PrizeTier; w: number }[]): WheelSeg[] {
  return segs.map((x) => ({ id: x.id, label: TIER_INFO[x.id].name, short: TIER_INFO[x.id].name, color: TIER_INFO[x.id].color, weight: x.w }));
}
