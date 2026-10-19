// Джа-одори на ТВ: улица Нагасаки едет назад, игроки несут дракона на шестах и шагают в такт.
// Сбившийся падает вместе со своим куском и остаётся позади, остальные смыкаются.
import { useEffect, useRef } from 'preact/hooks';
import type { DragonPublic, GameState } from '../shared/types';
import { Avatar, useFrame } from '../ui/common';
import { characterCanvas } from '../shared/sprites';
import { startDragonDrums } from '../shared/sound';
import { DRAGON_COUNT, DRAGON_BAR, dragonBpm, dragonFoot, dragonTimes } from '../games/logic';
import { STREET_GROUND, dragonImg, fallbackStreet } from '../games/dragonArt';
import { GROUP_GAMES } from '../shared/settings';
import { PREF } from '../map/mapData';
import { now, uiFont } from '../shared/util';

/** насколько уезжает улица за шаг, в пикселях street.png */
const STRIDE = 5;
/** персонаж рисуется в 2 раза крупнее пикселя мира */
const CH = 2;

/** дробный номер шага в момент t; до первого шага — отрицательный (отсчёт) */
function progress(d: DragonPublic, t: number) {
  if (!d.startAt) return -DRAGON_COUNT;
  const times = dragonTimes(d);
  const beat0 = 60000 / d.bpm;
  if (t < times[0]) return (t - times[0]) / beat0;
  let lo = 0, hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  if (lo >= times.length - 1) return times.length - 1;
  return lo + (t - times[lo]) / (times[lo + 1] - times[lo]);
}

export function DragonTv({ s }: { s: GameState }) {
  const d = s.dr!;
  useFrame(true);
  // барабаны: с начала отсчёта до конца танца
  useEffect(() => {
    if (d.phase !== 'play' || !d.startAt) return;
    return startDragonDrums(d, dragonTimes(d), s.settings.audioLatencyMs);
  }, [d.id, d.phase === 'play' ? d.startAt : 0]);

  // кто когда выбыл и когда была ничья — для всплывающих надписей
  const seen = useRef<{ id: number; out: Record<string, number>; tie: number | undefined; tieAt: number }>({ id: -1, out: {}, tie: undefined, tieAt: 0 });
  const S = seen.current;
  if (S.id !== d.id) { seen.current = { id: d.id, out: {}, tie: d.tie, tieAt: 0 }; }
  const tnow = performance.now();
  for (const id of Object.keys(d.out)) if (!(id in seen.current.out)) seen.current.out[id] = tnow;
  if (d.tie !== seen.current.tie) { seen.current.tie = d.tie; seen.current.tieAt = tnow; }

  const t = now();
  const p = progress(d, t);
  const step = Math.floor(p);
  const playing = d.phase === 'play' && d.startAt > 0;
  const beat = p - Math.floor(p);
  const info = GROUP_GAMES.dragon;
  const name = (id: string) => s.players[id]?.name ?? '?';
  const recentOut = Object.entries(seen.current.out).filter(([, at]) => tnow - at < 2600).map(([id]) => id);
  const total = d.players.length;

  return (
    <div class="dragon-tv">
      <DragonScene s={s} d={d} />
      <div class="dragon-hud">
        <span class="dragon-hud-title">{info.kanji} {info.name} <span class="jp">{info.ja}</span></span>
        {playing && p < 0 && <span>Приготовились…</span>}
        {playing && p >= 0 && step < d.warm && <span>Разминка · шаг {step + 1} из {d.warm} · без зачёта</span>}
        {playing && step >= d.warm && <span class="dragon-live">ЗАЧЁТ · {Math.round(dragonBpm(d, step))} ударов в минуту · несут {d.alive.length} из {total}</span>}
      </div>
      {playing && p < 0 && p >= -DRAGON_COUNT && (
        <div class="dragon-count" key={'c' + Math.floor(p)}>
          {DRAGON_COUNT + Math.floor(p) + 1}
          <span class="jp">{['いち', 'に', 'さん', 'し'][DRAGON_COUNT + Math.floor(p)]}</span>
        </div>
      )}
      {playing && p >= 0 && step >= d.warm && step < d.warm + 3 && <div class="dragon-big pop">ЗАЧЁТ! <span class="jp">はじめ！</span></div>}
      {playing && p >= 0 && d.alive.length > 1 && (
        <div class="dragon-foot" style={{ transform: `translateX(-50%) scale(${1 + 0.25 * Math.max(0, 1 - beat * 3)})` }}>
          {dragonFoot(step) === 'L' ? '左 ЛЕВОЙ' : 'ПРАВОЙ 右'}
        </div>
      )}
      {tnow - seen.current.tieAt < 2200 && seen.current.tieAt > 0 && <div class="dragon-big pop">Сбились все — прощаем!</div>}
      {recentOut.length > 0 && (
        <div class="dragon-outs">
          {recentOut.map((id) => <div class="dragon-out pop"><Avatar p={s.players[id]} size={30} /> {name(id)} сбился и выбыл!</div>)}
        </div>
      )}
      {d.phase === 'intro' && (
        <div class="dragon-center"><div class="dragon-card pop">
          <div class="group-kanji">{info.kanji}</div>
          <div class="group-sub">Групповая игра · {PREF[d.pref]?.ru}</div>
          <div class="group-title">{info.name} <span class="jp">{info.ja}</span></div>
          <div class="dragon-rules">
            <div>Танец дракона с фестиваля Нагасаки Кунчи. Все вместе несём дракона на шестах.</div>
            <div>На телефоне две кнопки: <b>ЛЕВАЯ</b> и <b>ПРАВАЯ</b>. Жмите по очереди в такт барабану.</div>
            <div>Сначала {d.warm} шагов разминки без зачёта, потом гонг — и зачёт.</div>
            <div>Каждые {DRAGON_BAR} шагов темп растёт. Сбился — выбыл со своим куском дракона.</div>
            <div>Кто дольше всех несёт дракона — тот победил!</div>
          </div>
        </div></div>
      )}
      {d.phase === 'results' && <div class="dragon-center side"><Results s={s} d={d} /></div>}
    </div>
  );
}

function Results({ s, d }: { s: GameState; d: DragonPublic }) {
  const medal = ['', '🥇', '🥈', '🥉'];
  const order = [...d.players].filter((id) => s.players[id]).sort((a, b) => (d.out[b] ?? Infinity) - (d.out[a] ?? Infinity));
  return (
    <div class="dragon-card dragon-results pop">
      <div class="group-title">Итоги · Джа-одори</div>
      {order.map((id) => {
        const pl = d.places?.[id];
        const out = d.out[id];
        return (
          <div class={'dragon-row' + (pl ? ' place' + pl : '')}>
            <span class="medal">{pl ? medal[pl] : ''}</span>
            <Avatar p={s.players[id]} size={30} />
            <b>{s.players[id].name}</b>
            <span class="muted">{out == null ? 'донёс дракона' : `шаг ${out - d.warm + 1}`}</span>
            <span class="dragon-award">{d.awards?.[id] ?? ''}</span>
          </div>
        );
      })}
    </div>
  );
}

// ───────── сцена (canvas) ─────────

interface Anim {
  id: number;
  xs: Record<string, number>;
  fallen: Record<string, { wx: number; y: number; at: number }>;
  endP: number | null;
  last: number;
}

function DragonScene({ s, d }: { s: GameState; d: DragonPublic }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const live = useRef({ s, d });
  live.current = { s, d };
  const anim = useRef<Anim>({ id: -1, xs: {}, fallen: {}, endP: null, last: 0 });

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const c = cv.current;
      if (c) draw(c, live.current.s, live.current.d, anim.current);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={cv} class="dragon-cv" />;
}

function draw(c: HTMLCanvasElement, s: GameState, d: DragonPublic, A: Anim) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = c.clientWidth, H = c.clientHeight;
  if (!W || !H) return;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (A.id !== d.id) Object.assign(A, { id: d.id, xs: {}, fallen: {}, endP: null, last: 0 });
  const perf = performance.now();
  const dt = A.last ? Math.min(0.1, (perf - A.last) / 1000) : 0;
  A.last = perf;

  // ── время танца ──
  let p = d.phase === 'play' ? progress(d, now()) : d.phase === 'results' ? (A.endP ?? progress(d, now())) : -DRAGON_COUNT;
  if (d.phase === 'results') A.endP = p;
  const walk = Math.max(0, p);
  const moving = d.phase === 'play' && p >= 0;

  // ── фон ──
  const street = dragonImg('street');
  const sky = dragonImg('sky');
  const bg = street ?? fallbackStreet();
  const k = H / bg.height;
  const scroll = walk * STRIDE * k; // в пикселях экрана
  if (sky) tile(ctx, sky, scroll * 0.25, W, H);
  tile(ctx, bg, scroll, W, H);

  // ── мир: единица — «пиксель» высотой H/VH ──
  const alive = d.alive.filter((id) => s.players[id]);
  const n = d.players.length;
  const VH = n <= 5 ? 170 : n <= 8 ? 200 : 230;
  const u = H / VH;
  const VW = W / u;
  const gy = H * STREET_GROUND / u; // мостовая
  const scrollU = scroll / u;
  ctx.save();
  ctx.scale(u, u);

  const spacing = Math.min(34, (VW - 110) / Math.max(1, alive.length));
  // на итогах дракон уходит влево — справа таблица мест
  const cx = d.phase === 'results' ? VW * 0.27 : VW / 2 - 14;
  const target = (j: number) => cx + ((alive.length - 1) / 2 - j) * spacing;
  alive.forEach((id, j) => {
    const tx = target(j);
    const x = A.xs[id];
    A.xs[id] = x == null ? tx : x + (tx - x) * Math.min(1, dt * 3.5);
  });

  // волна по дракону: от головы к хвосту
  const ph = moving ? walk * Math.PI / 2 : perf / 700;
  const DY = gy - 16 * CH - 30;
  const AMP = 7;
  const yAt = (sIdx: number) => DY + AMP * Math.sin(ph - sIdx * 0.9);

  // выбывшие: остаются на месте улицы и уезжают назад вместе с ней
  for (const id of Object.keys(d.out)) {
    if (!A.fallen[id]) {
      const j = d.players.indexOf(id);
      A.fallen[id] = { wx: (A.xs[id] ?? VW / 2) + scrollU, y: yAt(Math.max(0, j)), at: perf };
    }
  }
  const body = dragonImg('body')!;
  const BH = 16;
  for (const [id, f] of Object.entries(A.fallen)) {
    const p0 = s.players[id];
    if (!p0) continue;
    const x = f.wx - scrollU;
    if (x < -40 || x > VW + 40) continue;
    const a = Math.min(1, (perf - f.at) / 500);
    // кусок туловища падает на мостовую
    const segY = f.y + (gy - BH / 2 - f.y) * a * a;
    drawSprite(ctx, body, x - 14, segY, BH, a * 0.3);
    // игрок падает лицом вперёд
    ctx.save();
    ctx.translate(x, gy);
    ctx.rotate(a * Math.PI / 2);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(characterCanvas(p0.color, p0.hat, 1, 0), -6 * CH, -16 * CH, 12 * CH, 16 * CH);
    ctx.restore();
    ctx.globalAlpha = 1;
    // имя видно, пока игрок падает, потом не мешает остальным
    const fade = 1 - Math.max(0, Math.min(1, (perf - f.at - 2200) / 600));
    if (fade > 0) {
      ctx.globalAlpha = fade;
      label(ctx, p0.name, x, gy + 9, '#9aa0b8');
      ctx.globalAlpha = 1;
    }
  }

  // точки дракона: s = 0 — голова, s = n-1 — хвост; между носильщиками — линейно
  const xsArr = alive.map((id) => A.xs[id]);
  // последний носильщик несёт короткого дракона: голова, пара кусков и хвост
  const sp = alive.length > 1 ? spacing : 26;
  const xAt = (sIdx: number) => {
    if (!xsArr.length) return VW / 2;
    if (sIdx <= 0) return xsArr[0] - sIdx * sp;
    if (sIdx >= xsArr.length - 1) return xsArr[xsArr.length - 1] - (sIdx - xsArr.length + 1) * sp;
    const i = Math.floor(sIdx);
    return xsArr[i] + (xsArr[i + 1] - xsArr[i]) * (sIdx - i);
  };
  const angAt = (sIdx: number) => Math.max(-0.5, Math.min(0.5, Math.atan2(yAt(sIdx - 0.05) - yAt(sIdx + 0.05), xAt(sIdx - 0.05) - xAt(sIdx + 0.05))));
  const last = Math.max(0, alive.length - 1);
  const s0 = alive.length > 1 ? -0.35 : -0.5;
  const s1 = last + (alive.length > 1 ? 0.45 : 0.9);

  if (alive.length) {
    // шесты
    alive.forEach((_, j) => {
      const x = xsArr[j];
      const top = yAt(j) + 4, h = gy - 14 - top;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(x + 3.5, top, 3, h);
      ctx.fillStyle = '#c9965a';
      ctx.fillRect(x + 4, top, 2, h);
    });
    // жемчужина впереди
    const pearl = dragonImg('pearl')!;
    const px = xsArr[0] + 52, py = DY - 4 + Math.sin(perf / 300) * 4;
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(perf / 200);
    ctx.fillStyle = '#ffe58a';
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawSprite(ctx, pearl, px, py, 12, 0);
    // хвост, туловище от хвоста к голове, голова
    drawSprite(ctx, dragonImg('tail')!, xAt(s1), yAt(s1), 18, angAt(s1), 0.35);
    const stepS = Math.max(0.08, 7 / Math.max(8, sp));
    for (let x = s1 - 0.15; x >= s0 + 0.1; x -= stepS) drawSprite(ctx, body, xAt(x), yAt(x), BH, angAt(x));
    drawSprite(ctx, dragonImg('head')!, xAt(s0), yAt(s0) - 4, 30, angAt(s0), -0.3);
  }

  // носильщики и имена
  alive.forEach((id, j) => {
    const pl = s.players[id];
    const x = xsArr[j];
    const frac = walk - Math.floor(walk);
    const frame = moving ? Math.floor(walk) % 2 : 0;
    const bob = moving ? -Math.max(0, 1 - frac * 3) * 1.5 : 0;
    ctx.drawImage(characterCanvas(pl.color, pl.hat, 1, frame), x - 6 * CH, gy - 16 * CH + bob, 12 * CH, 16 * CH);
    label(ctx, pl.name, x, gy + 9, '#ffffff');
  });
  ctx.restore();
}

/** картинка по ширине экрана повторяется со сдвигом */
function tile(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, offset: number, W: number, H: number) {
  const k = H / img.height;
  const tw = Math.round(img.width * k);
  let x = -Math.round(offset % tw);
  for (; x < W; x += tw) ctx.drawImage(img, x, 0, tw + 1, H);
}

/** спрайт по высоте h с центром в (x, y), повёрнутый на угол ang; ox — сдвиг центра по ширине (доля) */
function drawSprite(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, h: number, ang: number, ox = 0) {
  const w = (img.width / img.height) * h;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.drawImage(img, -w / 2 + ox * w, -h / 2, w, h);
  ctx.restore();
}

let font = '';
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.font = font ||= `7px ${uiFont()}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
