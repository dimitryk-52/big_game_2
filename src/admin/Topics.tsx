// Вкладка «Темы»: обычные темы и спецтемы игроков, число вопросов, иконки.
// Иконка рисуется прямо здесь (IconEditor) и хранится в настройках темы — в игру попадает
// после «Сохранить» (и «Обновить настройки в игре» на пульте, если игра уже идёт).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Question, Settings, Topic } from '../shared/types';
import { gridIconUrl, iconPresets, topicIconUrl } from '../shared/sprites';
import { uid } from '../shared/util';

type Grid = (string | null)[][];

/** id, которые игра использует по имени — их не удаляем */
const SYSTEM_IDS: Record<string, string> = {
  general: 'запасные вопросы для префектур без своих вопросов',
  okinawa: 'вопросы воскрешения на Окинаве',
};

function TopicIcon({ t, size = 32 }: { t: Topic; size?: number }) {
  return <img class="topic-icon" src={topicIconUrl(t.id, t.color, 4, { icon: t.icon, special: t.special })} width={size} height={size} alt="" />;
}

export function Topics({ settings, questions, onSave, onAddQuestion }: {
  settings: Settings;
  questions: Question[];
  onSave: (s: Settings) => Promise<void>;
  onAddQuestion: (topic: string) => void;
}) {
  const [s, setS] = useState<Settings>(structuredClone(settings));
  const [saved, setSaved] = useState(false);
  const [iconFor, setIconFor] = useState<number | null>(null);
  const dirty = JSON.stringify(s.topics) !== JSON.stringify(settings.topics);
  const upd = (i: number, p: Partial<Topic>) => setS((c) => ({ ...c, topics: c.topics.map((t, k) => (k === i ? { ...t, ...p } : t)) }));
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    questions.forEach((q) => (c[q.topic] = (c[q.topic] ?? 0) + 1));
    return c;
  }, [questions]);
  const save = async () => { await onSave(s); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  const add = (special: boolean) => setS((c) => ({
    ...c,
    topics: [...c.topics, special
      ? { id: 'sp_' + uid(6).toLowerCase(), name: 'Новая спецтема', combat: false, special: true, color: '#ffffff' }
      : { id: 't_' + uid(6).toLowerCase(), name: 'Новая тема', combat: true, color: '#7ad7ff' }],
  }));
  const del = (i: number) => {
    const t = s.topics[i];
    const n = counts[t.id] ?? 0;
    if (!confirm(`Удалить тему «${t.name}»?` + (n ? `\nУ неё ${n} вопр. — они останутся без темы.` : ''))) return;
    setS((c) => ({ ...c, topics: c.topics.filter((_, k) => k !== i) }));
  };

  const row = (t: Topic, i: number) => (
    <tr class={t.special ? 'sp-row' : ''}>
      <td>
        <button class={'icon-btn' + (t.special ? ' rainbow' : '')} title="Нарисовать иконку" onClick={() => setIconFor(i)}><TopicIcon t={t} /></button>
      </td>
      <td><input class="inp-s" style={{ width: '100%' }} value={t.name} onInput={(e) => upd(i, { name: (e.target as HTMLInputElement).value })} /></td>
      <td>
        {t.special ? null : SYSTEM_IDS[t.id] ? <span class="muted small">{SYSTEM_IDS[t.id]}</span> : (
          <label><input type="checkbox" checked={t.combat} onChange={(e) => upd(i, { combat: (e.target as HTMLInputElement).checked })} /> боевая</label>
        )}
      </td>
      <td><input type="color" value={/^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#ffffff'} title="Цвет темы: кнопки, полоски силы" onInput={(e) => upd(i, { color: (e.target as HTMLInputElement).value })} /></td>
      <td class={counts[t.id] ? '' : 'muted'}>{counts[t.id] ?? 0}</td>
      <td class="nowrap">
        <button class="btn small" onClick={() => onAddQuestion(t.id)} disabled={dirty} title={dirty ? 'Сначала сохрани темы' : ''}>+ вопрос</button>
        {!SYSTEM_IDS[t.id] && <button class="btn small" onClick={() => del(i)}>✕</button>}
      </td>
    </tr>
  );

  const normal = s.topics.map((t, i) => [t, i] as const).filter(([t]) => !t.special);
  const special = s.topics.map((t, i) => [t, i] as const).filter(([t]) => t.special);
  return (
    <div class="pad col" style={{ maxWidth: 980 }}>
      <div class="row">
        <button class="btn primary small" disabled={!dirty && !saved} onClick={save}>{saved ? '✔ Сохранено' : 'Сохранить'}</button>
        {dirty && <span class="small" style={{ color: 'var(--yellow)' }}>есть несохранённые изменения</span>}
        <span class="muted small">Если игра уже идёт — потом «Обновить настройки в игре» на пульте.</span>
      </div>

      <h3 style={{ margin: '8px 0 0' }}>Темы</h3>
      <div class="note">«Боевые» темы участвуют в калибровке, дают силу и выбираются в дуэлях. Нажми на иконку, чтобы нарисовать свою.</div>
      <table class="qtable topics-table">
        <thead><tr><th style={{ width: 56 }}>Иконка</th><th>Название</th><th style={{ width: 240 }}></th><th style={{ width: 50 }}>Цвет</th><th style={{ width: 70 }}>Вопр.</th><th style={{ width: 150 }}></th></tr></thead>
        <tbody>{normal.map(([t, i]) => row(t, i))}</tbody>
      </table>
      <div><button class="btn small" onClick={() => add(false)}>+ тема</button></div>

      <h3 style={{ margin: '16px 0 0' }}>Спецтемы</h3>
      <div class="note">
        Спецтемы ни за кем не закреплены. Спецвопросы игрок покупает в магазине и использует в дуэли:
        если он ответит верно — удар с силой «спецвопроса» из настроек.
      </div>
      <table class="qtable topics-table">
        <thead><tr><th style={{ width: 56 }}>Иконка</th><th>Название</th><th style={{ width: 240 }}></th><th style={{ width: 50 }}>Цвет</th><th style={{ width: 70 }}>Вопр.</th><th style={{ width: 150 }}></th></tr></thead>
        <tbody>{special.map(([t, i]) => row(t, i))}</tbody>
      </table>
      {!special.length && <div class="muted small">Пока нет ни одной спецтемы.</div>}
      <div><button class="btn small rainbow" onClick={() => add(true)}>+ спецтема</button></div>

      {iconFor !== null && s.topics[iconFor] && (
        <IconEditor
          topic={s.topics[iconFor]}
          onClose={() => setIconFor(null)}
          onApply={(icon) => { upd(iconFor, { icon }); setIconFor(null); }}
        />
      )}
    </div>
  );
}

// ───────── редактор иконки ─────────

const toHex = (() => {
  const ctx = document.createElement('canvas').getContext('2d')!;
  return (c: string) => { ctx.fillStyle = '#000'; ctx.fillStyle = c; return ctx.fillStyle as string; };
})();
const shade = (hex: string, k: number) => {
  const v = parseInt(hex.slice(1), 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => Math.round(k > 0 ? x + (255 - x) * k : x * (1 + k)));
  return '#' + ch.map((x) => x.toString(16).padStart(2, '0')).join('');
};
const BASE_PALETTE = ['#ffffff', '#c9cbe0', '#5b5f7e', '#1b1440', '#e8364e', '#ff9f43', '#ffd23f', '#5ce16b', '#2ee6d6', '#4dabff', '#c77dff', '#ff7ad9', '#8a5a2b'];
const blank = (n: number): Grid => Array.from({ length: n }, () => Array(n).fill(null));
/** вписать сетку в квадрат n×n по центру (обрезая лишнее) */
function fit(g: Grid, n: number): Grid {
  const out = blank(n);
  const h = g.length, w = g[0]?.length ?? 0;
  const oy = Math.floor((n - h) / 2), ox = Math.floor((n - w) / 2);
  g.forEach((r, y) => r.forEach((c, x) => { const yy = y + oy, xx = x + ox; if (c && yy >= 0 && xx >= 0 && yy < n && xx < n) out[yy][xx] = toHex(c); }));
  return out;
}

type Tool = 'pen' | 'erase' | 'fill' | 'pick';

function IconEditor({ topic, onApply, onClose }: { topic: Topic; onApply: (icon: Grid | undefined) => void; onClose: () => void }) {
  const presets = useMemo(() => iconPresets(), []);
  const start = (): Grid => {
    if (topic.icon?.length) return topic.icon.map((r) => [...r]);
    const own = presets['topic_' + topic.id];
    if (own) return fit(own, Math.max(10, own.length, own[0].length));
    return topic.special ? fit(presets['радуга'], 11) : fit(presets['ромб'].map((r) => r.map((c) => (c ? topic.color : null))), 10);
  };
  const [g, setG] = useState<Grid>(start);
  const [hist, setHist] = useState<Grid[]>([]);
  const [color, setColor] = useState(() => toHex(topic.color));
  const [tool, setTool] = useState<Tool>('pen');
  const drawing = useRef<null | 'draw' | 'erase'>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const n = g.length;
  const cell = Math.floor(340 / n);

  const commit = (next: Grid) => { setHist((h) => [...h.slice(-40), g]); setG(next); };
  const undo = () => setHist((h) => { if (!h.length) return h; setG(h[h.length - 1]); return h.slice(0, -1); });
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });

  const paint = (x: number, y: number, c: string | null, base = g) => {
    if (base[y][x] === c) return base;
    const next = base.map((r) => [...r]);
    next[y][x] = c;
    return next;
  };
  const flood = (x: number, y: number, c: string | null) => {
    const from = g[y][x];
    if (from === c) return;
    const next = g.map((r) => [...r]);
    const st = [[x, y]];
    while (st.length) {
      const [cx, cy] = st.pop()!;
      if (cx < 0 || cy < 0 || cx >= n || cy >= n || next[cy][cx] !== from) continue;
      next[cy][cx] = c;
      st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    commit(next);
  };
  const down = (x: number, y: number, right: boolean) => {
    if (tool === 'pick') { const c = g[y][x]; if (c) { setColor(toHex(c)); setTool('pen'); } return; }
    if (tool === 'fill') { flood(x, y, right ? null : color); return; }
    const erase = right || tool === 'erase';
    drawing.current = erase ? 'erase' : 'draw';
    commit(paint(x, y, erase ? null : color));
  };
  const over = (x: number, y: number) => {
    if (!drawing.current) return;
    setG((cur) => paint(x, y, drawing.current === 'erase' ? null : color, cur));
  };
  useEffect(() => {
    const up = () => (drawing.current = null);
    addEventListener('pointerup', up);
    return () => removeEventListener('pointerup', up);
  }, []);

  const resize = (m: number) => commit(fit(g, m));
  const flip = () => commit(g.map((r) => [...r].reverse()));
  const shift = (dx: number, dy: number) => commit(g.map((_, y) => g[0].map((_, x) => g[(y - dy + n) % n][(x - dx + n) % n])));
  const recolor = () => {
    // перекрасить основной цвет иконки в цвет кисти (самый частый непрозрачный цвет, кроме белого и тёмного)
    const cnt = new Map<string, number>();
    g.flat().forEach((c) => { if (c && !['#ffffff', '#1b1440', '#0d0d1a'].includes(c)) cnt.set(c, (cnt.get(c) ?? 0) + 1); });
    const main = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (main) commit(g.map((r) => r.map((c) => (c === main ? color : c))));
  };
  const importImage = (f: File) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = n;
      c.height = n;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      const k = Math.min(n / img.width, n / img.height);
      const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      ctx.drawImage(img, Math.floor((n - w) / 2), Math.floor((n - h) / 2), w, h);
      const d = ctx.getImageData(0, 0, n, n).data;
      commit(Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => {
        const i = (y * n + x) * 4;
        return d[i + 3] < 128 ? null : '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      })));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };

  const used = useMemo(() => [...new Set(g.flat().filter(Boolean) as string[])].map(toHex), [g]);
  const tc = toHex(topic.color);
  const palette = [...new Set([tc, shade(tc, 0.45), shade(tc, -0.35), ...BASE_PALETTE, ...used])];
  const preview = useMemo(() => (g.some((r) => r.some(Boolean)) ? gridIconUrl(g, 4) : ''), [g]);
  const TOOLS: [Tool, string, string][] = [['pen', '✏️', 'Карандаш (правая кнопка — стереть)'], ['erase', '🧽', 'Ластик'], ['fill', '🪣', 'Заливка (правая — залить пустотой)'], ['pick', '💧', 'Пипетка']];

  return (
    <div class="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal panel col icon-editor">
        <h3 style={{ margin: 0 }}>Иконка: {topic.name}</h3>
        <div class="row" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div
            class="ie-grid"
            style={{ gridTemplateColumns: `repeat(${n}, ${cell}px)`, gridAutoRows: `${cell}px` }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {g.map((r, y) => r.map((c, x) => (
              <i
                style={c ? { background: c } : undefined}
                onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); down(x, y, e.button === 2); }}
                onPointerEnter={() => over(x, y)}
              />
            )))}
          </div>
          <div class="col" style={{ gap: 10, width: 330 }}>
            <div class="row wrap" style={{ gap: 4 }}>
              {TOOLS.map(([k, ic, title]) => <button class={'btn small' + (tool === k ? ' yellow' : '')} title={title} onClick={() => setTool(k)}>{ic}</button>)}
              <button class="btn small" title="Отменить (Ctrl+Z)" disabled={!hist.length} onClick={undo}>↶</button>
            </div>
            <div class="ie-palette">
              {palette.map((c) => <button class={c === color ? 'on' : ''} style={{ background: c }} title={c} onClick={() => { setColor(c); if (tool === 'erase' || tool === 'pick') setTool('pen'); }} />)}
              <input type="color" value={color} title="Свой цвет" onInput={(e) => setColor((e.target as HTMLInputElement).value)} />
            </div>
            <div class="row wrap" style={{ gap: 4 }}>
              <button class="btn small" onClick={flip} title="Отразить по горизонтали">⇋</button>
              <button class="btn small" onClick={() => shift(-1, 0)} title="Сдвинуть влево">←</button>
              <button class="btn small" onClick={() => shift(1, 0)} title="Сдвинуть вправо">→</button>
              <button class="btn small" onClick={() => shift(0, -1)} title="Сдвинуть вверх">↑</button>
              <button class="btn small" onClick={() => shift(0, 1)} title="Сдвинуть вниз">↓</button>
              <button class="btn small" onClick={recolor} title="Основной цвет иконки → цвет кисти">🎨 перекрасить</button>
              <button class="btn small" onClick={() => commit(blank(n))}>Очистить</button>
            </div>
            <label class="small">Размер
              <select value={String(n)} onChange={(e) => resize(Number((e.target as HTMLSelectElement).value))}>
                {[8, 9, 10, 11, 12, 14, 16].map((m) => <option value={String(m)}>{m}×{m}</option>)}
              </select>
              <span class="muted">(у готовых 9–11)</span>
            </label>
            <label class="small">Взять готовую
              <select value="" onChange={(e) => { const k = (e.target as HTMLSelectElement).value; if (k) commit(fit(presets[k], n)); }}>
                <option value="">—</option>
                {Object.keys(presets).map((k) => <option value={k}>{k.replace(/^topic_/, 'тема: ')}</option>)}
              </select>
            </label>
            <div class="row" style={{ gap: 6 }}>
              <button class="btn small" onClick={() => fileRef.current?.click()}>Из картинки…</button>
              <span class="muted small">PNG ужмётся в {n}×{n}</span>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) importImage(f); (e.target as HTMLInputElement).value = ''; }} />
            </div>
            <div class="ie-preview">
              {preview ? <>
                <img src={preview} style={{ height: 18 }} />
                <img src={preview} style={{ height: 24 }} />
                <img src={preview} style={{ height: 44 }} />
                <span class={'btn small' + (topic.special ? ' rainbow' : '')} style={{ '--c': topic.color } as any}><img src={preview} style={{ height: 22, verticalAlign: 'middle' }} /> {topic.name}</span>
              </> : <span class="muted small">пусто — будет стандартная иконка</span>}
            </div>
            <div class="muted small">Чёрный контур добавляется в игре сам — рисовать его не нужно.</div>
          </div>
        </div>
        <div class="row">
          <button class="btn primary" onClick={() => onApply(g.some((r) => r.some(Boolean)) ? g : undefined)}>Готово</button>
          {topic.icon && <button class="btn" onClick={() => onApply(undefined)} title="Вернуть стандартную иконку">Стандартная</button>}
          <button class="btn" onClick={onClose}>Отмена</button>
          <span class="muted small">Иконка сохранится в базу после «Сохранить» на вкладке.</span>
        </div>
      </div>
    </div>
  );
}

