// Групповая игра на телефоне: каллиграфия (холст с кистью) → голосование цифрами → итоги.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, GroupPublic, Player } from '../shared/types';
import { InkBrush, washiCanvas } from '../games/brush';
import { TimerBar } from '../ui/common';
import { vibrate } from '../shared/util';
import { GROUP_GAMES } from '../shared/settings';
import { FacePad, SenryuPad, SashimiPad, MyWork } from './GroupPads';

export const CANVAS_W = 600;
export const CANVAS_H = 800;
const CHUNK = 48000;

const SIZES = [
  { id: 'big', label: 'Толстая', r: 26 },
  { id: 'mid', label: 'Средняя', r: 17 },
  { id: 'thin', label: 'Тонкая', r: 9 },
];

/** что уже отправлено в этой игре (переживает перерисовки) */
const sentFor = new Set<number>();
const myVotes = new Map<number, number[]>();
let paperUrl: string | undefined;

export function GroupGame({ client, s, me }: { client: GameClient; s: GameState; me: Player }) {
  const g = s.g;
  if (!g) return null;
  const inGame = g.players.includes(me.id);
  const info = GROUP_GAMES[g.game];
  if (!inGame) return <div class="pad col center-screen"><h2>{info.name}</h2><div class="muted">Смотри на ТВ!</div></div>;
  const drawing = g.phase === 'intro' || g.phase === 'draw' || (g.phase === 'show' && g.showIdx < 0);
  return (
    <div class="group-phone">
      {drawing && g.game === 'calligraphy' && <DrawPad key={g.id} client={client} g={g} me={me} />}
      {drawing && g.game === 'fukuwarai' && <FacePad key={g.id} client={client} g={g} me={me} />}
      {drawing && g.game === 'senryu' && <SenryuPad key={g.id} client={client} g={g} me={me} />}
      {drawing && g.game === 'sashimi' && <SashimiPad key={g.id} client={client} g={g} me={me} />}
      {g.phase === 'show' && g.showIdx >= 0 && g.game === 'sashimi' && (
        <div class="pad col center-screen">
          <h2>Взвешиваем на ТВ</h2>
          <div class="muted">Кусок {g.showIdx + 1} из {g.order.length} · цель {g.target} г</div>
          {g.order.indexOf(me.id) >= 0 && g.order.indexOf(me.id) <= g.showIdx
            ? <div class="q-result pop">Твой кусок: {g.grams?.[me.id]} г</div>
            : <div class="muted">Самые точные — в конце</div>}
        </div>
      )}
      {g.phase === 'show' && g.showIdx >= 0 && g.game !== 'sashimi' && (
        <div class="pad col center-screen">
          <h2>Смотрим работы на ТВ</h2>
          <div class="muted">Работа {g.showIdx + 1} из {g.order.length}</div>
          <MyNumber g={g} me={me} />
          <MyWork g={g} />
        </div>
      )}
      {g.phase === 'vote' && <Vote key={g.voteRound} client={client} s={s} g={g} me={me} />}
      {g.phase === 'results' && <Results g={g} me={me} />}
    </div>
  );
}

export function MyNumber({ g, me }: { g: GroupPublic; me: Player }) {
  const n = g.order.indexOf(me.id) + 1;
  return n ? <div class="group-mynum">Твоя работа — <b>№{n}</b></div> : null;
}

function DrawPad({ client, g, me }: { client: GameClient; g: GroupPublic; me: Player }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const brush = useRef<InkBrush | null>(null);
  const undo = useRef<ImageData[]>([]);
  const [size, setSize] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [sent, setSent] = useState(sentFor.has(g.id));
  void sent;
  const [box, setBox] = useState({ w: 300, h: 400 });
  const [, tick] = useState(0);

  const live = g.phase === 'draw' && client.hostNow() >= g.startAt && client.hostNow() < g.deadline;
  const liveRef = useRef(live);
  liveRef.current = live && !sent;

  // холст вписываем в свободное место с пропорцией 3:4
  useEffect(() => {
    const fit = () => {
      const el = wrap.current;
      if (!el) return;
      const W = el.clientWidth, H = el.clientHeight;
      const k = Math.min(W / CANVAS_W, H / CANVAS_H);
      setBox({ w: Math.floor(CANVAS_W * k), h: Math.floor(CANVAS_H * k) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap.current!);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = cv.current!;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    brush.current = new InkBrush(ctx);
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const b = brush.current;
    if (b) { b.size = SIZES[size].r; }
  }, [size]);
  useEffect(() => {
    if (brush.current) brush.current.unit = CANVAS_W / box.w;
  }, [box.w]);

  // ввод: только один палец, все промежуточные точки (getCoalescedEvents)
  useEffect(() => {
    const c = cv.current!;
    let pid: number | null = null;
    let raf = 0;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * CANVAS_W, ((e.clientY - r.top) / r.height) * CANVAS_H] as const;
    };
    const loop = () => {
      brush.current?.hold(performance.now());
      raf = requestAnimationFrame(loop);
    };
    const down = (e: PointerEvent) => {
      if (pid !== null || !liveRef.current) return;
      e.preventDefault();
      pid = e.pointerId;
      try { c.setPointerCapture(e.pointerId); } catch { /* палец уже отпущен */ }
      const ctx = c.getContext('2d')!;
      undo.current.push(ctx.getImageData(0, 0, CANVAS_W, CANVAS_H));
      if (undo.current.length > 8) undo.current.shift();
      setCanUndo(true);
      const [x, y] = pos(e);
      brush.current!.begin(x, y, e.timeStamp, e.pointerType === 'pen' ? e.pressure : 0.5);
      raf = requestAnimationFrame(loop);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      e.preventDefault();
      if (!liveRef.current) return up(e);
      const evs = (e as any).getCoalescedEvents?.() as PointerEvent[] | undefined;
      for (const ev of evs?.length ? evs : [e]) {
        const [x, y] = pos(ev);
        brush.current!.move(x, y, ev.timeStamp, ev.pointerType === 'pen' ? ev.pressure : undefined);
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = null;
      cancelAnimationFrame(raf);
      brush.current!.end(e.timeStamp);
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    return () => {
      cancelAnimationFrame(raf);
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    };
  }, []);

  const { submitted, submit } = useSubmit(client, g, me, () => {
    brush.current?.end(performance.now());
    return exportInk(cv.current!);
  });
  useEffect(() => { if (submitted || sentFor.has(g.id)) setSent(true); });

  const doUndo = () => {
    const d = undo.current.pop();
    if (d) cv.current!.getContext('2d')!.putImageData(d, 0, 0);
    setCanUndo(undo.current.length > 0);
  };
  const clear = () => {
    const ctx = cv.current!.getContext('2d')!;
    undo.current.push(ctx.getImageData(0, 0, CANVAS_W, CANVAS_H));
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    setCanUndo(true);
  };

  const paper = (paperUrl ??= washiCanvas(CANVAS_W, CANVAS_H).toDataURL());
  const done = sent || submitted;
  return (
    <div class="drawpad">
      <div class="drawpad-head">
        <div class="drawpad-task">{g.prompt}</div>
        {g.phase === 'draw' && !done && <TimerBar start={g.startAt} end={g.deadline} now={() => client.hostNow()} />}
        {g.phase === 'intro' && <div class="muted small-text">Слушай задание — холст откроется по сигналу</div>}
        {done && <div class="muted small-text">{submitted ? '✔ Работа на ТВ' : 'Отправляем…'}</div>}
      </div>
      <div class="drawpad-area" ref={wrap}>
        <div class={'drawpad-paper' + (live && !done ? '' : ' locked')} style={{ width: box.w, height: box.h, backgroundImage: `url(${paper})` }}>
          <canvas ref={cv} width={CANVAS_W} height={CANVAS_H} style={{ width: box.w, height: box.h }} />
          {g.phase === 'intro' && <div class="drawpad-wait">筆</div>}
        </div>
      </div>
      <div class="drawpad-tools">
        {SIZES.map((x, i) => (
          <button class={'brush-btn' + (size === i ? ' on' : '')} onClick={() => setSize(i)} disabled={done}>
            <span class="brush-dot" style={{ width: x.r * 0.9, height: x.r * 0.9 }} />
            <span>{x.label}</span>
          </button>
        ))}
        <button class="btn small" disabled={!canUndo || done || !live} onClick={doUndo}>↶</button>
        <button class="btn small" disabled={done || !live} onClick={clear}>🗑</button>
        <button class="btn small primary" disabled={done || !live} onClick={submit}>✔</button>
      </div>
    </div>
  );
}

/**
 * Сдача работы: по кнопке «Готово», когда вышло время или ведущий закончил раньше.
 * Досылаем каждые 4 c, пока хост не подтвердит (сообщения могут теряться).
 */
export function useSubmit(client: GameClient, g: GroupPublic, me: Player, make: () => string) {
  const submitted = g.submitted.includes(me.id);
  const over = g.phase !== 'intro' && (g.phase !== 'draw' || client.hostNow() >= g.deadline);
  const lastSend = useRef(0);
  const data = useRef<string | null>(null);
  const send = () => {
    if (submitted) return;
    lastSend.current = Date.now();
    data.current ??= make();
    sentFor.add(g.id);
    const url = data.current;
    const total = Math.ceil(url.length / CHUNK) || 1;
    for (let i = 0; i < total; i++) client.send({ t: 'draw', pid: me.id, id: g.id, part: i, total, data: url.slice(i * CHUNK, (i + 1) * CHUNK) });
    vibrate(40);
  };
  useEffect(() => {
    if (submitted || (!over && !data.current)) return;
    if (Date.now() - lastSend.current < 4000) return;
    send();
  });
  return { submitted, sent: sentFor.has(g.id) || submitted, submit: send };
}

/** тушь на белом, JPEG: ТВ кладёт её на бумагу «умножением». Ужимаем, чтобы влезть в лимит сообщений */
function exportInk(c: HTMLCanvasElement): string {
  const out = document.createElement('canvas');
  out.width = 450;
  out.height = 600;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(c, 0, 0, out.width, out.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const url = out.toDataURL('image/jpeg', q);
    if (url.length < 400000) return url;
  }
  return out.toDataURL('image/jpeg', 0.3);
}

function Vote({ client, s, g, me }: { client: GameClient; s: GameState; g: GroupPublic; me: Player }) {
  const mine = myVotes.get(g.id) ?? [];
  const [chosen, setChosen] = useState<number | null>(mine[g.voteRound - 1] ?? null);
  const voted = g.voted.includes(me.id) || chosen !== null;
  const myN = g.order.indexOf(me.id) + 1;
  const pts = 4 - g.voteRound;
  const vote = (n: number) => {
    if (voted) return;
    setChosen(n);
    const arr = [...mine];
    arr[g.voteRound - 1] = n;
    myVotes.set(g.id, arr);
    client.pick('vote', n);
    vibrate(30);
  };
  return (
    <div class="pad col center-screen">
      <h2>Голосуем за {g.voteRound} место</h2>
      <div class="muted">Номер работы с ТВ · {pts} {pts === 1 ? 'очко' : 'очка'}</div>
      <TimerBar start={g.startAt} end={g.deadline} now={() => client.hostNow()} />
      <div class="vote-grid">
        {g.order.map((_, i) => {
          const n = i + 1;
          const own = n === myN;
          const before = mine.slice(0, g.voteRound - 1).includes(n);
          return (
            <button class={'vote-btn' + (chosen === n ? ' on' : '')} disabled={own || before || (voted && chosen !== n)} onClick={() => vote(n)}>
              {n}
              {own && <small>твоя</small>}
              {before && <small>уже</small>}
            </button>
          );
        })}
      </div>
      {voted && <div class="center muted">Голос принят. Ждём остальных…</div>}
      {s.paused && <div class="muted">Пауза</div>}
    </div>
  );
}

function Results({ g, me }: { g: GroupPublic; me: Player }) {
  const place = g.places?.[me.id];
  return (
    <div class="pad col center-screen">
      <h2>{place ? `${place} место!` : 'Итоги на ТВ'}</h2>
      {g.game === 'sashimi'
        ? <div class="muted">{g.grams?.[me.id] != null ? <>Твой кусок: <b>{g.grams[me.id]} г</b> из {g.target} г (промах {g.points?.[me.id]} г)</> : 'Ты не успел отрезать'}</div>
        : <div class="muted">Твои очки: <b>{g.points?.[me.id] ?? 0}</b></div>}
      {g.awards?.[me.id] && <div class="q-result pop">{g.awards[me.id]}</div>}
      {g.game !== 'sashimi' && <MyNumber g={g} me={me} />}
    </div>
  );
}
