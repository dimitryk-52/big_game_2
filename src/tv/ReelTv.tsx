// ТВ: барабан темы вопроса и колесо призов финальной игры.
import type { GameState } from '../shared/types';
import { Avatar, PixIcon, useFrame } from '../ui/common';
import { Reel, reelLabel } from '../ui/Reel';
import { Wheel, wheelLabel } from '../ui/Wheel';
import { tierSegs, topicSegs } from '../ui/reelSegs';
import { PRIZE_TIERS, TIER_INFO } from '../shared/economy';
import { now } from '../shared/util';

/** барабан темы: игрок крутит на телефоне (или он крутится сам) */
export function TopicReelTv({ s }: { s: GameState }) {
  useFrame(true);
  const st = s.stage;
  if (st.t !== 'reel') return null;
  const p = s.players[st.pid];
  const segs = topicSegs(s, st.segs);
  const lab = reelLabel(segs, st.spin, now());
  return (
    <div class="overlay-center">
      <div class="panel reel-tv pop">
        <div class="row reel-tv-head">
          {p && <Avatar p={p} size={48} />}
          <div>
            <b>{st.why === 'duel' ? 'Тему не выбрали — решает барабан!' : 'Вопросы кончились — тему выбирает барабан!'}</b>

          </div>
        </div>
        <Reel segs={segs} spin={st.spin} now={now} size={Math.min(460, Math.round(window.innerHeight * 0.5))} sound />
        <div class={'reel-label' + (lab.done ? ' done' : '')}>{lab.text}</div>

      </div>
    </div>
  );
}

/** колесо призов: игроки опускают жетоны на телефонах, колесо крутится здесь */
export function WheelTv({ s }: { s: GameState }) {
  useFrame(true);
  const w = s.wheel;
  if (!w) return null;
  const segs = tierSegs(w.segs);
  const t = now();
  const lab = wheelLabel(segs, w.spin, t);
  const spinner = w.spinner ? s.players[w.spinner] : null;
  const last = w.last ? s.players[w.last.pid] : null;
  const ids = s.joinOrder.filter((id) => s.players[id]);
  const prizesLeft = PRIZE_TIERS.reduce((a, k) => a + w.left[k], 0);
  return (
    <div class="wheel-tv">
      <div class="wheel-tv-main">
        <h2 class="wheel-tv-title">Колесо призов</h2>
        {segs.length ? <Wheel segs={segs} spin={w.spin} now={now} size={Math.min(620, Math.round(window.innerHeight * 0.68))} sound /> : <div class="banner-text">Все призы разыграны!</div>}
        <div class={'wheel-label' + (lab.done ? ' done' : '')}>
          {spinner ? <><Avatar p={spinner} size={40} /> {spinner.name} крутит колесо…</>
            : last && w.last ? <><Avatar p={last} size={40} /> {last.name}: <span style={{ color: TIER_INFO[w.last.tier].color }}>приз «{TIER_INFO[w.last.tier].name}»!</span></>
            : prizesLeft ? 'Опусти жетон в слот на телефоне' : ''}
        </div>
      </div>
      <div class="panel wheel-tv-side">
        <b>Осталось призов</b>
        {PRIZE_TIERS.map((k) => (
          <div class="row wheel-tier"><span class="tier-dot" style={{ background: TIER_INFO[k].color }} /> <span class="grow">{TIER_INFO[k].name}</span> <b>{w.left[k]}</b></div>
        ))}
        <b style={{ marginTop: 12 }}>Жетоны</b>
        {ids.map((id) => {
          const p = s.players[id];
          const won = w.history.filter((h) => h.pid === id);
          return (
            <div class={'row wheel-player' + (w.spinner === id ? ' on' : '')}>
              <Avatar p={p} size={30} /> <span class="grow">{p.name}</span>
              {won.map((h) => <span class="tier-dot" title={TIER_INFO[h.tier].name} style={{ background: TIER_INFO[h.tier].color }} />)}
              <span class="wheel-tokens"><PixIcon id="token" size={22} /> {w.tokens[id] ?? 0}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
