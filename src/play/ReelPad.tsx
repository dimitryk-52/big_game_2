// Телефон: барабан темы (крутит ходящий), барабан бонуса (крутит получивший награду, пока игра идёт дальше)
// и слот колеса призов — опустить жетон.
import { useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player } from '../shared/types';
import { Reel, reelLabel, reelPos } from '../ui/Reel';
import { bonusSegs, topicSegs } from '../ui/reelSegs';
import { BonusIcon, PixIcon, useFrame } from '../ui/common';
import { BONUS_DESC, TIER_INFO } from '../shared/economy';
import { BONUS_INFO } from '../shared/settings';
import { vibrate } from '../shared/util';

/** барабан темы: крутится сам, телефон только показывает */
export function TopicReelPad({ client, s }: { client: GameClient; s: GameState; me: Player }) {
  useFrame(true);
  const st = s.stage;
  if (st.t !== 'reel') return null;
  const segs = topicSegs(s, st.segs);
  const now = () => client.hostNow();
  const lab = reelLabel(segs, st.spin, now());
  const w = Math.min(360, window.innerWidth - 40);
  return (
    <div class="pad col center-screen">
      <h2>{st.why === 'duel' ? 'Время вышло — тему решит барабан' : 'Тему вопроса выберет барабан'}</h2>
      <Reel segs={segs} spin={st.spin} now={now} size={w} />
      <div class={'reel-label' + (lab.done ? ' done' : '')}>{lab.text}</div>
    </div>
  );
}

/** барабан бонуса — поверх экрана «Игра», пока его не покрутили и не забрали выигрыш */
export function BonusReelSheet({ client, me }: { client: GameClient; me: Player }) {
  useFrame(true);
  const [busy, setBusy] = useState(false);
  const r = me.reel;
  if (!r) return null;
  const segs = bonusSegs(r.segs);
  const now = () => client.hostNow();
  const pos = reelPos(segs, r.spin ?? null, now());
  const won = r.done && r.spin ? r.segs[r.spin.result] : null;
  const w = Math.min(340, window.innerWidth - 60);
  return (
    <div class="sheet-back">
      <div class="sheet pop col" style={{ alignItems: 'center' }}>
        <h2>Награда префектуры — бонус!</h2>
        <Reel segs={segs} spin={r.spin ?? null} now={now} size={w} sound />
        {won && pos.done ? (
          <>
            <div class="reel-label done"><BonusIcon b={won} size={28} /> {BONUS_INFO[won].name}</div>
            <div class="muted small-text">{BONUS_DESC[won] ?? ''}</div>
            <button class="btn yellow big-btn" onClick={() => void client.req('reelClose').catch(() => {})}>В инвентарь</button>
          </>
        ) : !r.spin ? (
          <>
            <div class="muted">Что выпадет — увидишь только ты</div>
            <button class="btn yellow big-btn" disabled={busy} onClick={() => { setBusy(true); vibrate(40); void client.req('reelSpin').catch(() => setBusy(false)); }}>Крутить!</button>
          </>
        ) : <div class="reel-label">Крутим…</div>}
      </div>
    </div>
  );
}

/** колесо призов: свои жетоны и слот — перетащи жетон в слот (или нажми на него) */
export function WheelPad({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  useFrame(true);
  const w = s.wheel;
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const slot = useRef<HTMLDivElement>(null);
  if (!w) return null;
  const mine = w.tokens[me.id] ?? 0;
  const busy = !!w.spinner;
  const prizes = w.left.common + w.left.uncommon + w.left.rare;
  const can = mine > 0 && !busy && prizes > 0 && !dropping;
  const spinner = w.spinner ? s.players[w.spinner] : null;
  const myLast = w.last?.pid === me.id ? w.last.tier : null;
  const won = w.history.filter((h) => h.pid === me.id);

  const drop = () => {
    setDropping(true);
    vibrate([30, 30, 60]);
    void client.req('wheelSpin').then(() => setErr(null), (e: any) => setErr(String(e?.message ?? e))).finally(() => setTimeout(() => setDropping(false), 700));
  };
  const onDown = (e: PointerEvent) => {
    if (!can) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  };
  const onMove = (e: PointerEvent) => { if (drag) setDrag({ ...drag, dx: e.clientX - drag.x, dy: e.clientY - drag.y }); };
  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    const r = slot.current?.getBoundingClientRect();
    const moved = Math.hypot(drag.dx, drag.dy);
    setDrag(null);
    // отпустил над слотом — или просто нажал на жетон
    if (moved < 8 || (r && e.clientX > r.left - 30 && e.clientX < r.right + 30 && e.clientY > r.top - 40 && e.clientY < r.bottom + 40)) drop();
  };

  return (
    <div class="pad col center-screen wheel-pad">
      <h2>Колесо призов</h2>
      <div class="muted">{spinner ? `Крутит ${spinner.name}…` : prizes ? 'Опусти жетон в слот — колесо на ТВ закрутится' : 'Все призы разыграны!'}</div>
      <div ref={slot} class={'token-slot' + (drag ? ' hot' : '') + (dropping ? ' eat' : '')}><div class="token-slit" /></div>
      <div class="token-row">
        {mine > 0 ? (
          <div
            class={'token-drag' + (can ? '' : ' off')}
            style={drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.15)` } : undefined}
            onPointerDown={onDown as any} onPointerMove={onMove as any} onPointerUp={onUp as any} onPointerCancel={() => setDrag(null)}
          >
            <PixIcon id="token" size={84} />
          </div>
        ) : <div class="muted">Жетонов нет</div>}
      </div>
      <div class="token-count"><PixIcon id="token" size={26} /> × <b>{mine}</b></div>
      {myLast && !busy && <div class="reel-label done" style={{ color: TIER_INFO[myLast].color }}>Твой приз: {TIER_INFO[myLast].name.toLowerCase()}!</div>}
      {won.length > 0 && <div class="muted small-text">Выиграно: {won.map((h) => TIER_INFO[h.tier].name.toLowerCase()).join(', ')}</div>}
      {err && <div class="muted small-text">{err}</div>}
    </div>
  );
}
