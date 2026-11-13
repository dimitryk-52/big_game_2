// «Годзилла» на ТВ: город по клеткам, Годзилла шагает и ломает дома, тени снарядов растут до падения.
import { useEffect, useRef } from 'preact/hooks';
import type { GameState, KaijuPublic } from '../shared/types';
import { Avatar, ResText, useFrame } from '../ui/common';
import { now } from '../shared/util';
import { cellXY } from '../games/kaiju';
import { GROUP_GAMES } from '../shared/settings';

let files: Record<string, string> = {};
try { files = import.meta.glob<string>('../img/kaiju/*.png', { eager: true, import: 'default', query: '?url' }); } catch { /* вне Vite */ }
const imgs = new Map<string, HTMLImageElement>();
function img(name: string) {
  let i = imgs.get(name);
  if (!i) { i = new Image(); i.src = files[`../img/kaiju/${name}.png`] ?? ''; imgs.set(name, i); }
  return i;
}
export const kaijuImg = (name: string) => files[`../img/kaiju/${name}.png`] ?? '';

const CW = 26, CH = 28, TOP = 22, BAY = 14, PADX = 8;
const HOUSES = ['house_a', 'house_b', 'house_c', 'house_d'];
const houseOf = (cell: number) => HOUSES[(cell * 7 + (cell >> 2) * 3) % HOUSES.length];

interface Boom { cell: number; at: number; hit: boolean }
interface Anim { pos: number; from: number; at: number; hp: number; shells: Map<number, { cell: number; at: number }>; booms: Boom[]; dust: { cell: number; at: number }[]; hitAt: number }

function draw(cv: HTMLCanvasElement, k: KaijuPublic, s: GameState, a: Anim, t: number) {
  const W = k.cols * CW + PADX * 2, H = TOP + k.rows * CH + BAY;
  if (cv.width !== W) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  // небо заката, асфальт, залив
  const sky = ctx.createLinearGradient(0, 0, 0, TOP);
  sky.addColorStop(0, '#2a1f4a');
  sky.addColorStop(1, '#c8506a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, TOP);
  ctx.fillStyle = '#3a3c4c';
  ctx.fillRect(0, TOP, W, k.rows * CH);
  ctx.fillStyle = '#2a5a8c';
  ctx.fillRect(0, TOP + k.rows * CH, W, BAY);
  ctx.fillStyle = '#4a82b8';
  for (let x = (Math.floor(t / 400) % 8) - 8; x < W; x += 8) ctx.fillRect(x, TOP + k.rows * CH + 4 + ((x >> 3) % 2) * 5, 4, 1);
  // разметка улиц
  ctx.fillStyle = '#50525f';
  for (let c = 0; c <= k.cols; c++) ctx.fillRect(PADX + c * CW - 1, TOP, 1, k.rows * CH);
  for (let r = 0; r <= k.rows; r++) ctx.fillRect(PADX, TOP + r * CH - 1, k.cols * CW, 1);

  const cx = (cell: number) => PADX + cellXY(k, cell)[0] * CW;
  const cy = (cell: number) => TOP + cellXY(k, cell)[1] * CH;
  // где Годзилла: плавно между клетками
  const dur = Math.min(k.cfg.stepMs, 260);
  const f = Math.min(1, (t - a.at) / dur);
  const zx = cx(a.from) + (cx(a.pos) - cx(a.from)) * f;
  const zy = cy(a.from) + (cy(a.pos) - cy(a.from)) * f;
  const zRow = cellXY(k, f < 0.5 ? a.from : a.pos)[1];
  const stunned = t < k.stunUntil;
  const smashing = t < k.busyUntil && t - a.at > dur && k.busyUntil - a.at > k.cfg.stepMs + 50;

  for (let r = 0; r < k.rows; r++) {
    for (let c = 0; c < k.cols; c++) {
      const cell = r * k.cols + c;
      const x = PADX + c * CW, y = TOP + r * CH;
      // тени снарядов: кольцо цвета охотника сжимается к моменту падения
      for (const sh of k.shells) if (sh.cell === cell) {
        const left = Math.max(0, Math.min(1, (sh.at - t) / k.cfg.fuseMs));
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(x + CW / 2, y + CH / 2, 4 + 6 * (1 - left), 3 + 4 * (1 - left), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = s.players[sh.pid]?.color ?? '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1.5, y + 1.5, CW - 4, CH - 4);
      }
      if (k.down.includes(cell)) {
        if (cell !== k.down[0]) { const rb = img('rubble'); if (rb.width) ctx.drawImage(rb, x + 1, y + CH - rb.height - 2); }
      } else {
        const h = img(houseOf(cell));
        if (h.width) ctx.drawImage(h, x + 1, y + CH - h.height - 1);
      }
    }
    if (r === zRow) {
      const z = img(f < 1 && Math.floor(t / 120) % 2 ? 'zilla_w' : 'zilla');
      if (z.width && !(stunned && Math.floor(t / 90) % 2)) {
        const bob = smashing ? (Math.floor(t / 110) % 2) * 2 : 0;
        ctx.save();
        ctx.translate(Math.round(zx + CW / 2), Math.round(zy + CH - 1 + bob));
        if (k.face < 0) ctx.scale(-1, 1);
        ctx.drawImage(z, -Math.round(z.width * 0.6), -z.height); // тело правее середины: слева хвост
        ctx.restore();
      }
    }
  }
  // пыль от сломанных домов
  for (const d of a.dust) {
    const p = (t - d.at) / 500;
    if (p < 0 || p > 1) continue;
    ctx.fillStyle = `rgba(200,200,210,${0.7 * (1 - p)})`;
    for (let i = 0; i < 5; i++) ctx.fillRect(cx(d.cell) + 4 + i * 4 + Math.sin(i * 9) * 2, cy(d.cell) + 6 - p * 12 - (i % 2) * 3, 3, 3);
  }
  // снаряды летят сверху
  const shell = img('shell');
  for (const sh of k.shells) {
    const left = Math.max(0, (sh.at - t) / k.cfg.fuseMs);
    if (shell.width) ctx.drawImage(shell, cx(sh.cell) + CW / 2 - 3, cy(sh.cell) + CH / 2 - shell.height - left * (TOP + cy(sh.cell)));
  }
  // взрывы
  for (const b of a.booms) {
    const p = (t - b.at) / 420;
    if (p < 0 || p > 1) continue;
    const x = cx(b.cell) + CW / 2, y = cy(b.cell) + CH / 2;
    ctx.fillStyle = b.hit ? `rgba(255,90,60,${1 - p})` : `rgba(255,210,90,${1 - p})`;
    ctx.beginPath();
    ctx.arc(x, y, 3 + p * (b.hit ? 16 : 10), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${1 - p})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + p * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (t - a.hitAt < 160) { ctx.fillStyle = 'rgba(255,60,60,0.25)'; ctx.fillRect(0, 0, W, H); }
}

export function KaijuTv({ s }: { s: GameState }) {
  const k = s.kj!;
  useFrame(true); // и на заставке: картинки домов подгружаются не сразу
  const cv = useRef<HTMLCanvasElement>(null);
  const anim = useRef<Anim | null>(null);
  const t = now();
  const z = s.players[k.zilla];
  const info = GROUP_GAMES.godzilla;
  if (!anim.current || (anim.current as any).id !== k.id) anim.current = Object.assign({ pos: k.pos, from: k.pos, at: 0, hp: k.hp, shells: new Map(), booms: [], dust: [], hitAt: 0 }, { id: k.id });
  const a = anim.current!;
  if (a.pos !== k.pos) {
    a.from = a.pos; a.pos = k.pos; a.at = t;
    if (k.down[k.down.length - 1] === k.pos && t < k.busyUntil - k.cfg.stepMs) a.dust.push({ cell: k.pos, at: t + 200 });
  }
  if (k.hp < a.hp) { a.hp = k.hp; a.hitAt = t; }
  // снаряд исчез из состояния — значит, упал
  const live = new Set(k.shells.map((x) => x.n));
  for (const [n, sh] of a.shells) if (!live.has(n)) { a.booms.push({ cell: sh.cell, at: t, hit: sh.cell === k.pos && t - a.hitAt < 300 }); a.shells.delete(n); }
  for (const sh of k.shells) a.shells.set(sh.n, { cell: sh.cell, at: sh.at });
  a.booms = a.booms.filter((b) => t - b.at < 600);
  a.dust = a.dust.filter((d) => t - d.at < 800);
  useEffect(() => { if (cv.current) draw(cv.current, k, s, a, now()); });

  const left = Math.max(0, Math.ceil((k.endAt - Math.max(t, k.startAt)) / 1000));
  const count = k.phase === 'play' && t < k.startAt ? Math.ceil((k.startAt - t) / 1000) : 0;
  const downed = k.hp <= 0;
  return (
    <div class="kj-tv">
      <div class="kj-head">
        <b>{info.name}</b> <span class="kj-ja">{info.ja}</span>
        {z && <span class="kj-who"><Avatar p={z} size={40} /> {z.name}</span>}
        <span class="kj-hp">{Array.from({ length: k.maxHp }, (_, i) => <i class={i < k.hp ? 'on' : ''} />)}</span>
        <span class="kj-houses">домов: {k.stomped}</span>
        {k.phase === 'play' && <span class="kj-clock">{left}</span>}
      </div>
      <div class="kj-body">
        <canvas ref={cv} class="kj-canvas" />
        {k.phase === 'intro' && (
          <div class="kj-over panel pop">
            <h2>{z?.name} — Годзилла!</h2>
            <p>Годзилла шагает по Токио и топчет дома. По руинам — быстро, целый дом ломает секунду и в это время стоит на месте.</p>
            <p>Охотники: тапни клетку — туда упадёт снаряд. Тень видна заранее, так что бей туда, куда он пойдёт.</p>
            <p class="muted">{k.maxHp} попадания — и Годзилла повержен. Продержится до конца — уйдёт в залив с добычей.</p>
          </div>
        )}
        {count > 0 && <div class="kj-count pop" key={count}>{count}</div>}
        {k.phase === 'results' && (
          <div class="kj-over panel pop">
            <h2>{downed ? 'Годзилла повержен!' : 'Годзилла уходит в залив'}</h2>
            <p>{downed ? 'Токио спасён.' : 'Токио лежит в руинах.'} Растоптано домов: <b>{k.stomped}</b></p>
            <table class="kj-res"><tbody>
              {[k.zilla, ...[...k.hunters].sort((x, y) => (k.hits[y] ?? 0) - (k.hits[x] ?? 0))].map((id) => {
                const p = s.players[id];
                if (!p) return null;
                return (
                  <tr class={k.stars?.includes(id) ? 'star' : ''}>
                    <td><span class="row"><Avatar p={p} size={34} /> {p.name}</span></td>
                    <td class="muted">{id === k.zilla ? `Годзилла · домов ${k.stomped}` : `попаданий ${k.hits[id] ?? 0} из ${k.shots[id] ?? 0}`}</td>
                    <td class="kj-aw"><ResText text={k.awards?.[id] ?? ''} topics={s.settings.topics} size={22} /></td>
                  </tr>
                );
              })}
            </tbody></table>
          </div>
        )}
      </div>
      <div class="kj-hunters">
        {k.hunters.map((id) => {
          const p = s.players[id];
          if (!p) return null;
          const rl = Math.max(0, Math.min(1, ((k.ready[id] ?? 0) - t) / k.cfg.reloadMs));
          return (
            <div class="kj-hunter" style={{ '--c': p.color } as any}>
              <Avatar p={p} size={36} />
              <div class="col" style={{ gap: 2 }}>
                <span>{p.name} <b>{'✹'.repeat(k.hits[id] ?? 0)}</b></span>
                <span class="kj-reload"><i style={{ width: `${(1 - rl) * 100}%` }} /></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
