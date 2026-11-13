// Звуки ТВ, которые движок не присылает отдельным событием: смена сцены (начало хода, магазин,
// итог дуэли…), фазы групповых игр и интро (префектура, групповая игра, открылось окошко соло-игры).
// Сравниваем с прошлым состоянием и играем звук один раз на переход.
import { useEffect, useRef } from 'preact/hooks';
import type { GameState, GroupGameId } from '../shared/types';
import { GROUP_TIMED, groupEndId, hasCustom, introId, loadSounds, onSoundsChange, playSound } from '../shared/sounds';
import { now } from '../shared/util';

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

  // конец времени групповой игры: в момент дедлайна, а если все сдали раньше — при смене фазы. Один раз на игру
  const ended = useRef(-1);
  const drawing = g && st.t === 'group' && g.phase === 'draw' && GROUP_TIMED.includes(g.game) ? g : null;
  const timeUp = (id: number, game: GroupGameId) => {
    if (ended.current === id) return;
    ended.current = id;
    playSound(groupEndId(game));
  };
  useEffect(() => {
    if (!drawing) return;
    const left = drawing.deadline - now();
    if (left < -1000) { ended.current = drawing.id; return; } // ТВ перезагрузили после конца времени
    const t = setTimeout(() => timeUp(drawing.id, drawing.game), Math.max(0, left));
    return () => clearTimeout(t);
  }, [drawing?.id, drawing?.deadline]);

  useEffect(() => {
    const p = prev.current;
    prev.current = { stage: stageKey, group: groupKey, dragon: dragonKey, busy, paused: s.paused };
    if (!p) return; // первый кадр (в т. ч. после перезагрузки) — без звуков
    if (s.paused && !p.paused) playSound('pause');
    if (stageKey !== p.stage) {
      if (st.t === 'prefIntro') playSound(introId('pref', st.code));
      // плашка «ГОНКА!»: свой звук гонки, если назначен, иначе — как обычное объявление
      else if (st.t === 'banner' && s.duel?.mode === 'race' && hasCustom('raceIntro')) playSound('raceIntro');
      else if (STAGE_SOUND[st.t]) playSound(STAGE_SOUND[st.t]);
    }
    if (groupKey && groupKey !== p.group && g) {
      if (p.group === `${g.id}:draw:` && GROUP_TIMED.includes(g.game)) timeUp(g.id, g.game);
      if (g.phase === 'intro') playSound(introId('group', g.game));
      else if (g.phase === 'draw') playSound('groupGo');
      else if (g.phase === 'show' && g.showIdx >= 0) playSound('groupShow');
      else if (g.phase === 'vote') playSound('groupVote');
    }
    if (dragonKey && dragonKey !== p.dragon && dr?.phase === 'intro') playSound(introId('group', 'dragon'));
    for (const [id, kind] of Object.entries(busy)) if (kind && p.busy[id] !== kind) playSound(introId('solo', kind));
  });
}
