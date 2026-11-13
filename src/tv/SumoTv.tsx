// Финальное сумо на ТВ: зал, дохё и сумоисты дугой «С» — трое слева, один наверху (анфас), трое справа.
// Чем ближе к краю круга, тем меньше осталось; за краем — вылетел. Чисел не показываем.
import type { GameState, SumoPublic } from '../shared/types';
import { ResText } from '../ui/common';
import { SUMO_H, SUMO_W, sumoUrl } from '../shared/sprites';

let files: Record<string, string> = {};
try { files = import.meta.glob<string>('../img/sumo/*.png', { eager: true, import: 'default', query: '?url' }); } catch { /* вне Vite */ }
const hall = () => files['../img/sumo/hall.png'] ?? '';

// фон 320×180: центр круга и его полуоси
const CX = 160, CY = 132, RX = 100, RY = 32;

/** угол места на дуге (градусы, 90 — дальняя точка круга): от левого-ближнего через верх к правому-ближнему */
function seatAngle(i: number, n: number) {
  if (n <= 1) return 90;
  const from = 235, to = -55;
  return from + ((to - from) * i) / (n - 1);
}

export function sumoSeat(su: SumoPublic, id: string) {
  const i = su.ring.indexOf(id), n = su.ring.length;
  const deg = seatAngle(i, n);
  const a = (deg * Math.PI) / 180;
  const front = Math.abs(deg - 90) < 18;
  return { a, front, flip: !front && Math.cos(a) > 0 };
}

export function SumoTv({ s, picking }: { s: GameState; picking?: boolean }) {
  const su = s.sumo!;
  const fell = new Set(su.fell ?? []);
  const shown = su.ring.filter((id) => s.players[id] && (su.alive.includes(id) || fell.has(id)));
  // ближние рисуются поверх дальних
  const seats = shown.map((id) => ({ id, ...sumoSeat(su, id) })).sort((x, y) => Math.sin(y.a) - Math.sin(x.a));
  const order = su.places ? Object.keys(su.places).sort((a, b) => su.places![a] - su.places![b]) : [];
  return (
    <div class="sumo-tv">
      <div class="sumo-stage">
        <div class="sumo-box">
        <img class="sumo-hall" src={hall()} alt="" />
        {seats.map(({ id, a, front, flip }) => {
          const p = s.players[id];
          const out = fell.has(id);
          // 0 — у стартовой линии, 1 — на соломенном кольце, дальше — за кругом
          const k = out ? 1.8 : 0.52 + 0.46 * Math.min(1, su.pos[id] ?? 0);
          const x = CX + Math.cos(a) * RX * k, y = CY - Math.sin(a) * RY * k;
          const edge = !out && (su.pos[id] ?? 0) >= 0.85;
          const pushed = su.phase === 'push' && su.prev && (su.pos[id] ?? 0) > (su.prev[id] ?? 0) + 1e-6;
          return (
            <div key={id} class={'sumo-man' + (out ? ' out' : '') + (edge ? ' edge' : '') + (pushed ? ' pushed' : '') + (su.asker === id && su.phase !== 'results' ? ' asker' : '')}
              style={{ left: `${(x / 320) * 100}%`, top: `${(y / 180) * 100}%`, zIndex: 10 + Math.round(y), '--c': p.color } as any}>
              <img src={sumoUrl(p, front, flip, 4)} style={{ aspectRatio: `${SUMO_W} / ${SUMO_H}` }} alt="" />
              <span class="sumo-name">{p.name}</span>
            </div>
          );
        })}
        </div>
        {su.phase === 'intro' && (
          <div class="sumo-over panel pop">
            <h2>Финальная схватка <span class="sumo-ja">大相撲</span></h2>
            <p>Все выходят на дохё. По кругу каждый выбирает тему — отвечают все.</p>
            <p>Выбравший ответил верно — все, кто ошибся, отъезжают к краю: тем дальше, чем он сильнее в теме. Ошибся сам — отъезжает сам.</p>
            <p class="muted">Спецвопросы, предметы и монетки работают. Вылетел за круг — играешь дальше за деньги. Последний на дохё — ёкодзуна!</p>
          </div>
        )}
        {su.phase === 'results' && (
          <div class="sumo-over panel pop">
            <h2>Ёкодзуна — {s.players[order[0]]?.name}! <span class="sumo-ja">横綱</span></h2>
            <table class="kj-res"><tbody>
              {order.map((id) => s.players[id] && (
                <tr class={su.places![id] === 1 ? 'star' : ''}>
                  <td>{su.places![id]}</td>
                  <td><span class="row"><img class="sumo-mini" src={sumoUrl(s.players[id], true, false, 2)} alt="" /> {s.players[id].name}</span></td>
                  <td class="kj-aw"><ResText text={su.awards?.[id] ?? ''} topics={s.settings.topics} size={22} /></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
        {!!fell.size && <div class="sumo-call pop">{[...fell].map((id) => s.players[id]?.name).filter(Boolean).join(', ')} — за кругом!</div>}
      </div>
      <div class={'sumo-foot' + (picking ? ' dim' : '')}>
        <b>Круг {su.circle}</b>
        <span>на дохё: {su.alive.length}</span>
        {su.out.length > 0 && <span class="muted">выбыли: {su.out.map((id) => s.players[id]?.name).filter(Boolean).join(', ')}</span>}
      </div>
    </div>
  );
}
