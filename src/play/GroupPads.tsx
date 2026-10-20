// Фукуварай, сэнрю и сашими на телефоне.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GroupPublic, Player } from '../shared/types';
import { FACES, FACE_H, FACE_W, partThumb, renderFace, type Placement } from '../games/faces';
import { PixIcon, TimerBar } from '../ui/common';
import { senryuLines, syllables } from '../shared/settings';
import { shuffle, vibrate } from '../shared/util';
import { useSubmit } from './GroupGame';
import { FISH, SW, tToX, xToT, type SashimiView } from '../games/sashimi';
import { FishBoard, Scale } from '../games/FishBoard';
import { sfx } from '../shared/sound';

/** своя работа (для показа себе после раскрытия на ТВ) */
const myWork = new Map<number, string>();

export function MyWork({ g }: { g: GroupPublic }) {
  const w = myWork.get(g.id);
  if (!w || g.game === 'calligraphy' || g.game === 'sashimi') return null;
  if (w.startsWith('text:')) return <div class="senryu-mine">«{w.slice(5)}»</div>;
  return <img class="face-mine" src={w} alt="" />;
}

// ───────── фукуварай ─────────

export function FacePad({ client, g, me }: { client: GameClient; g: GroupPublic; me: Player }) {
  const face = g.face ?? 'okame';
  const def = FACES[face];
  const tray0 = useMemo(() => shuffle(def.parts.map((p) => p.id)), [g.id]);
  const placed = useRef<Placement[]>([]);
  const [tray, setTray] = useState(tray0);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; overFace: boolean } | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const faceEl = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState({ w: 270, h: 360 });
  const [, tick] = useState(0);
  const blank = useMemo(() => renderFace(face, []).toDataURL(), [face]);
  const live = g.phase === 'draw' && client.hostNow() >= g.startAt && client.hostNow() < g.deadline;

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 250);
    const fit = () => {
      const el = area.current;
      if (!el) return;
      const k = Math.min(el.clientWidth / FACE_W, el.clientHeight / FACE_H);
      setBox({ w: Math.floor(FACE_W * k), h: Math.floor(FACE_H * k) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(area.current!);
    return () => { clearInterval(t); ro.disconnect(); };
  }, []);

  const { sent, submit } = useSubmit(client, g, me, () => {
    // не успел — оставшиеся детали падают куда попало
    const rest = def.parts.filter((p) => !placed.current.some((x) => x.id === p.id));
    for (const p of rest) placed.current.push({ id: p.id, x: 60 + Math.random() * (FACE_W - 120), y: 120 + Math.random() * (FACE_H - 200) });
    const url = renderFace(face, placed.current).toDataURL('image/jpeg', 0.82);
    myWork.set(g.id, url);
    return url;
  });

  const faceRect = () => faceEl.current!.getBoundingClientRect();
  const onDown = (id: string) => (e: PointerEvent) => {
    if (!live || sent) return;
    e.preventDefault();
    setDrag({ id, x: e.clientX, y: e.clientY, overFace: false });
    vibrate(15);
  };
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const r = faceRect();
      const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY, overFace: over });
    };
    const up = (e: PointerEvent) => {
      const r = faceRect();
      const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (over) {
        placed.current.push({ id: drag.id, x: ((e.clientX - r.left) / r.width) * FACE_W, y: ((e.clientY - r.top) / r.height) * FACE_H });
        const left = tray.filter((x) => x !== drag.id);
        setTray(left);
        vibrate(25);
        if (!left.length) setTimeout(submit, 300);
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag?.id]);

  return (
    <div class="drawpad face-pad">
      <div class="drawpad-head">
        <div class="drawpad-task">{g.prompt}</div>
        {g.phase === 'draw' && !sent && <TimerBar start={g.startAt} end={g.deadline} now={() => client.hostNow()} />}
        {g.phase === 'intro' && <div class="muted small-text">Детали появятся по сигналу</div>}
        {sent && <div class="muted small-text"><PixIcon id="ui_check" size={14} /> Лицо собрано — раскроем на ТВ!</div>}
      </div>
      <div class="drawpad-area" ref={area}>
        <img ref={faceEl} class={'face-blank' + (drag ? ' target' : '')} src={blank} style={{ width: box.w, height: box.h }} alt="" draggable={false} />
      </div>
      <div class="face-tray">
        {live && !sent && tray.map((id) => (
          <button class={'face-part' + (drag?.id === id ? ' lifted' : '')} onPointerDown={onDown(id) as any}>
            <img src={partThumb(face, id)} alt="" draggable={false} />
          </button>
        ))}
        {live && !sent && <div class="muted small-text face-hint">Тащи детали на лицо. Положенная деталь исчезает — вспоминай, где что!</div>}
      </div>
      {/* деталь видна только над лотком; над лицом — вслепую */}
      {drag && !drag.overFace && <img class="face-ghost" src={partThumb(face, drag.id)} style={{ left: drag.x, top: drag.y }} alt="" />}
      {drag && drag.overFace && <div class="face-finger" style={{ left: drag.x, top: drag.y }} />}
    </div>
  );
}

// ───────── сэнрю ─────────

export function SenryuPad({ client, g, me }: { client: GameClient; g: GroupPublic; me: Player }) {
  const [text, setText] = useState('');
  const textRef = useRef('');
  textRef.current = text;
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);
  const live = g.phase === 'draw' && client.hostNow() >= g.startAt && client.hostNow() < g.deadline;
  const { sent, submit } = useSubmit(client, g, me, () => {
    const v = textRef.current.trim().slice(0, 60);
    const data = v ? 'text:' + v : 'text:…';
    myWork.set(g.id, data);
    return data;
  });
  const lines = senryuLines(g.prompt);
  const n = syllables(text);
  return (
    <div class="pad col senryu-pad">
      {g.phase === 'draw' && !sent && <TimerBar start={g.startAt} end={g.deadline} now={() => client.hostNow()} />}
      <div class="tanzaku">
        {lines.map((l) => <div class="tz-line">{l}</div>)}
        <div class="tz-line mine">{text || (sent ? '…' : '＿＿＿＿＿')}</div>
      </div>
      {g.phase === 'intro' && <div class="muted center">Слушай начало стиха — по сигналу допиши последнюю строку</div>}
      {!sent && g.phase !== 'intro' && (
        <>
          <input class="inp" maxLength={60} placeholder="Последняя строка…" value={text} disabled={!live}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) submit(); }} />
          <div class={'syl' + (n === 5 ? ' ok' : '')}>Слогов: <b>{n}</b> из 5{n === 5 && <> <PixIcon id="ui_check" size={16} /></>}</div>
          <button class="btn primary big-btn" disabled={!live || !text.trim()} onClick={submit}>Готово</button>
        </>
      )}
      {sent && <div class="center muted"><PixIcon id="ui_check" /> Стих на ТВ!</div>}
    </div>
  );
}

// ───────── сашими ─────────

export function SashimiPad({ client, g, me }: { client: GameClient; g: GroupPublic; me: Player }) {
  const fish = g.fish ?? 'tuna';
  const f = FISH[fish];
  const view = useRef<SashimiView>({ knife: null, cut: null });
  const knifeT = useRef(0.5);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);
  const live = g.phase === 'draw' && client.hostNow() >= g.startAt && client.hostNow() < g.deadline;
  const { sent, submit } = useSubmit(client, g, me, () => {
    // не успел — режем там, где стоит нож
    const v = view.current;
    if (v.cut == null) v.cut = knifeT.current;
    const data = 'cut:' + v.cut.toFixed(4);
    myWork.set(g.id, data);
    return data;
  });
  const liveRef = useRef(false);
  liveRef.current = live && !sent;
  // нож виден, только пока можно резать
  view.current.knife = liveRef.current && view.current.cut == null ? knifeT.current : null;
  const move = (dt: number) => {
    if (!liveRef.current || view.current.cut != null) return;
    knifeT.current = xToT(tToX(knifeT.current) + dt);
    view.current.knife = knifeT.current;
  };
  // палец двигает нож относительно (точнее, чем тыкать): весь экран доски — тачпад
  const cvEl = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = cvEl.current;
    if (!c) return;
    let last: number | null = null, pid: number | null = null;
    const down = (e: PointerEvent) => {
      if (pid !== null || !liveRef.current) return;
      pid = e.pointerId;
      last = e.clientX;
      try { c.setPointerCapture(e.pointerId); } catch { /* уже отпущен */ }
    };
    const mv = (e: PointerEvent) => {
      if (e.pointerId !== pid || last == null) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      move(((e.clientX - last) / r.width) * SW * 0.6);
      last = e.clientX;
    };
    const up = (e: PointerEvent) => { if (e.pointerId === pid) { pid = null; last = null; } };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', mv);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', mv);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    };
  }, []);
  const cut = () => {
    const v = view.current;
    if (!liveRef.current || v.cut != null) return;
    v.cut = knifeT.current;
    v.knife = null;
    sfx.chop();
    vibrate(60);
    submit();
  };
  return (
    <div class="pad col sashimi-pad">
      {g.phase === 'draw' && !sent && <TimerBar start={g.startAt} end={g.deadline} now={() => client.hostNow()} />}
      <div class="sashimi-task">
        <div>{g.prompt}</div>
        <div class="sashimi-target">Отрежь <b>{g.target} г</b></div>
      </div>
      <FishBoard fish={fish} view={view} onRef={(c) => (cvEl.current = c)} class={live && !sent ? 'live' : ''} />
      <Scale grams={null} label={`${f.name} целиком: ${f.total} г · твой кусок — справа от ножа, тёмное уйдёт в обрезки`} />
      {g.phase === 'intro' && <div class="muted center">Слушай задание — нож появится по сигналу</div>}
      {!sent && g.phase !== 'intro' && (
        <>
          <div class="muted small-text center">Води пальцем по доске — нож двигается. Кнопки — по миллиметру.</div>
          <div class="row sashimi-ctrl">
            <button class="btn" disabled={!live} onClick={() => move(-0.5)}><PixIcon id="ui_left" size={20} /></button>
            <button class="btn primary big-btn" disabled={!live} onClick={cut}><PixIcon id="group_sashimi" size={26} /> Резать</button>
            <button class="btn" disabled={!live} onClick={() => move(0.5)}><PixIcon id="ui_right" size={20} /></button>
          </div>
        </>
      )}
      {sent && <div class="center muted"><PixIcon id="ui_check" /> Отрезано! Взвешиваем на ТВ…</div>}
    </div>
  );
}
