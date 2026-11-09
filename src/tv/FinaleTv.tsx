// Финал на ТВ: игроки на листе бумаги, на них по очереди падают печати-ханко,
// под именем выезжают плашки того же цвета с титулом. Порядок — от последнего места к первому,
// печать Императора — самой последней.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { GameState } from '../shared/types';
import { Avatar } from '../ui/common';
import { TITLE_BY_ID, finalRank } from '../shared/titles';
import { sfx } from '../shared/sound';
import '../styles/finale.css';

const STEP_MS = 1300;
const START_MS = 1800;
/** пиксельные рамки печатей по форме (белые маски, цвет даёт CSS) */
const FRAMES = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../img/hanko/*.png', { eager: true, import: 'default', query: '?url' })).map(([k, v]) => [k.replace(/^.*hanko_|\.png$/g, ''), v]),
);
/** центры печатей вокруг персонажа (поворот — случайный) */
const SPOTS = [
  { x: 186, y: 40 },
  { x: 38, y: 70 },
  { x: 182, y: 116 },
];
/** случайный наклон печати, ±20° */
const randRot = () => Math.round((Math.random() * 2 - 1) * 20);

const RAINBOW_BG = 'linear-gradient(90deg,#e53935,#fb8c00,#fdd835,#43a047,#1e88e5,#8e24aa)';

export function FinaleTv({ s, titles }: { s: GameState; titles: Record<string, string[]> }) {
  const players = finalRank(s.joinOrder.map((id) => s.players[id]).filter(Boolean));
  // очередь печатей: снизу таблицы вверх, по всем титулам игрока
  const queue: { pid: string; i: number }[] = [];
  for (const p of [...players].reverse()) (titles[p.id] ?? []).forEach((_, i) => queue.push({ pid: p.id, i }));
  // Император — в самом конце
  queue.sort((a, b) => Number(titles[a.pid][a.i] === 'emperor') - Number(titles[b.pid][b.i] === 'emperor'));
  const [shown, setShown] = useState(0);
  // наклоны выбираются один раз на показ финала — иначе печати дёргались бы при каждой перерисовке
  const rots = useMemo(() => Object.fromEntries(queue.map((q) => [q.pid + ':' + q.i, randRot()])), [JSON.stringify(titles)]);
  useEffect(() => {
    setShown(0);
    let n = 0;
    let t: any = setTimeout(function next() {
      n++;
      setShown(n);
      sfx.stamp();
      if (n < queue.length) t = setTimeout(next, STEP_MS);
    }, START_MS);
    return () => clearTimeout(t);
  }, [JSON.stringify(titles)]);
  const order = new Map(queue.map((q, k) => [q.pid + ':' + q.i, k]));
  const n = players.length;
  const cols = n <= 4 ? n : n <= 6 ? 3 : n <= 8 ? 4 : 5;

  return (
    <div class="finale">
      <div class="finale-head">
        <span class="finale-ja">番付</span>
        <span>Итоги</span>
      </div>
      <div class="finale-grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, 1fr)` }}>
        {players.map((p) => {
          const mine = titles[p.id] ?? [];
          const last = queue[shown - 1];
          return (
            <div class={'finale-card' + (last?.pid === p.id ? ' active' : '')} key={p.id}>
              <div class="finale-fig">
                <Avatar p={p} size={120} />
                {mine.map((id, i) => {
                  const k = order.get(p.id + ':' + i) ?? 0;
                  if (k >= shown) return null;
                  const t = TITLE_BY_ID[id];
                  const sp = SPOTS[i % SPOTS.length];
                  const rainbow = t.color === 'rainbow';
                  return (
                    <div
                      class={'fseal ' + t.shape + (rainbow ? ' rainbow' : '')}
                      style={{ left: sp.x + 'px', top: sp.y + 'px', '--rot': (rots[p.id + ':' + i] ?? 0) + 'deg', '--c': rainbow ? '#c0392b' : t.color, '--frame': `url(${FRAMES[t.shape]})` } as any}
                    >
                      <span>{t.kanji}</span>
                    </div>
                  );
                })}
              </div>
              <div class="finale-name">{p.name}</div>
              <div class="finale-plaques">
                {mine.map((id, i) => {
                  const k = order.get(p.id + ':' + i) ?? 0;
                  const t = TITLE_BY_ID[id];
                  const rainbow = t.color === 'rainbow';
                  return (
                    <div class={'plaque' + (k < shown ? ' on' : '')} style={{ background: rainbow ? RAINBOW_BG : t.color }}>
                      {t.name}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
