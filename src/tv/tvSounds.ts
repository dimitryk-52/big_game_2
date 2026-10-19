// Звуки ТВ, которые движок не присылает отдельным событием: смена сцены (начало хода, магазин,
// итог дуэли…), фазы групповых игр и интро (префектура, групповая игра, открылось окошко соло-игры).
// Сравниваем с прошлым состоянием и играем звук один раз на переход.
import { useEffect, useRef } from 'preact/hooks';
import type { GameState } from '../shared/types';
import { introId, loadSounds, onSoundsChange, playSound } from '../shared/sounds';

/** у каких сцен свой звук (id события на вкладке «Звуки») */
const STAGE_SOUND: Record<string, string> = {
  banner: 'banner', turnStart: 'turnStart', moving: 'moving', extraTurn: 'extraTurn', end: 'end',
  bonus: 'bonus', shop: 'shop', duelPick: 'duelPick', duelResult: 'duelResult',
};

export function useTvSounds(s: GameState) {
  // назначения: при старте, по сигналу из админки в этом же браузере и раз в 10 c (админка могла быть открыта отдельно)
  useEffect(() => {
    const off = onSoundsChange(() => {});
    const t = setInterval(() => { if (!document.hidden) void loadSounds(); }, 10000);
    return () => { off(); clearInterval(t); };
  }, []);

  const prev = useRef<{ stage: string; group: string; dragon: string; busy: Record<string, string | null>; paused: boolean } | null>(null);
  const st = s.stage as any;
  const stageKey = st.t + ':' + (st.pid ?? '') + ':' + (st.t === 'moving' ? st.to : st.t === 'banner' ? st.text : st.t === 'prefIntro' ? st.code : '');
  const g = s.g;
  const groupKey = g && st.t === 'group' ? `${g.id}:${g.phase}:${g.phase === 'show' ? g.showIdx : ''}` : '';
  const dr = s.dr;
  const dragonKey = dr && st.t === 'dragon' ? `${dr.id}:${dr.phase}` : '';
  const busy = Object.fromEntries(Object.values(s.players).map((p) => [p.id, p.busy ?? null]));

  useEffect(() => {
    const p = prev.current;
    prev.current = { stage: stageKey, group: groupKey, dragon: dragonKey, busy, paused: s.paused };
    if (!p) return; // первый кадр (в т. ч. после перезагрузки) — без звуков
    if (s.paused && !p.paused) playSound('pause');
    if (stageKey !== p.stage) {
      if (st.t === 'prefIntro') playSound(introId('pref', st.code));
      else if (STAGE_SOUND[st.t]) playSound(STAGE_SOUND[st.t]);
    }
    if (groupKey && groupKey !== p.group && g) {
      if (g.phase === 'intro') playSound(introId('group', g.game));
      else if (g.phase === 'draw') playSound('groupGo');
      else if (g.phase === 'show' && g.showIdx >= 0) playSound('groupShow');
      else if (g.phase === 'vote') playSound('groupVote');
    }
    if (dragonKey && dragonKey !== p.dragon && dr?.phase === 'intro') playSound(introId('group', 'dragon'));
    for (const [id, kind] of Object.entries(busy)) if (kind && p.busy[id] !== kind) playSound(introId('solo', kind));
  });
}
