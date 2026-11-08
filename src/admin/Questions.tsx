// Вкладка «Вопросы»: два вида — «По префектурам» (вопросы префектуры по порядку, флаги, призы)
// и «Списком» (вся база с фильтрами). Редактор вопроса — общий.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { QMode, Question, Settings } from '../shared/types';
import { getStore } from '../shared/store';
import { SEED_QUESTIONS } from '../shared/seedQuestions';
import { PREFS, PREF } from '../map/mapData';
import { isSpecialQ } from '../shared/settings';
import { flagUrl } from '../shared/flags';
import { PixIcon, SkillIcon } from '../ui/common';
import { uid } from '../shared/util';

type View = 'prefs' | 'list';

const RANKS = [1, 2, 3, 4];
const rankName = (r: number) => (r === 1 ? 'главный' : `${r}-й`);
const isFlag = (q: Question) => q.kind === 'flag';

function emptyQuestion(topic: string): Question {
  return { id: uid(12), text: '', answers: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], correct: 0, topic };
}

function flagQuestion(code: number, settings: Settings, order: number): Question {
  const topic = settings.topics.some((t) => t.id === 'geo') ? 'geo' : 'general';
  return { id: uid(12), kind: 'flag', text: '', answers: [], correct: 0, topic, pref: code, mode: 'cycle', order };
}

/** значки параметров вопроса */
export function QBadges({ q }: { q: Question }) {
  return (
    <span class="qbadges">
      {isFlag(q) && <span class="qb flag" title="Выбери флаг: варианты собирает игра">🚩 флаг</span>}
      {q.prize ? <span class="qb prize" title="Призовой: отвечает только ходящий">🏆 приз · {rankName(q.prize)}</span> : null}
      {q.mode === 'cycle'
        ? <span class="qb cycle" title="Повторяется, пока не ответят верно; правильный ответ при ошибке не показывается">🔁 до верного</span>
        : q.pref ? <span class="qb once" title="Задаётся один раз, даже при неверном ответе">1× разовый</span> : null}
    </span>
  );
}

export function Questions({ questions, settings, onChange, newIn }: { questions: Question[]; settings: Settings; onChange: () => void; newIn?: { topic: string; n: number } | null }) {
  const store = getStore();
  const [view, setView] = useState<View>(() => (localStorage.getItem('bg_admin_qview') as View) || 'prefs');
  const [filter, setFilter] = useState({ topic: '', q: '', pref: '', kind: '' });
  const [sel, setSel] = useState<number>(() => Number(localStorage.getItem('bg_admin_qpref')) || 1);
  const [edit, setEdit] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { try { localStorage.setItem('bg_admin_qview', view); localStorage.setItem('bg_admin_qpref', String(sel)); } catch { /* */ } }, [view, sel]);
  const newQ = (topic: string, extra: Partial<Question> = {}) => ({ ...emptyQuestion(topic), ...(settings.topics.find((t) => t.id === topic)?.special ? { special: true } : {}), ...extra });
  useEffect(() => { if (newIn) { setView('list'); setFilter((f) => ({ ...f, topic: newIn.topic })); setEdit(newQ(newIn.topic)); } }, [newIn?.n]);
  const firstSpecial = settings.topics.find((t) => t.special);
  // база пуста — показываем стартовый набор; после первой записи он уже в базе, и пересохранять его нельзя (затрёт правки)
  const isSeed = questions === SEED_QUESTIONS;
  const ensureSeed = async () => { if (isSeed) await store.saveQuestions(SEED_QUESTIONS); };

  const byPref = useMemo(() => {
    const m: Record<number, Question[]> = {};
    questions.forEach((q) => { if (q.pref && !isSpecialQ(settings, q)) (m[q.pref] ??= []).push(q); });
    // без порядка — после упорядоченных, в порядке базы (так же сортирует игра)
    Object.values(m).forEach((l) => l.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9)));
    return m;
  }, [questions, settings]);
  /** поставить вопрос в конец очереди префектуры: соседей нумеруем 0..n-1, ему — n */
  const appendTo = (code: number, q: Question): Question[] => {
    const sib = (byPref[code] ?? []).filter((x) => x.id !== q.id);
    const fixed = sib.map((x, i) => ({ ...x, order: i })).filter((x, i) => sib[i].order !== i);
    return [...fixed, { ...q, order: sib.length }];
  };
  const noFlag = PREFS.filter((p) => !(byPref[p.code] ?? []).some(isFlag));

  const saveMany = async (qs: Question[]) => {
    setBusy(true);
    try {
      await ensureSeed();
      await store.saveQuestions(qs.map((q) => ({ ...q, special: isSpecialQ(settings, q) || undefined })));
      onChange();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  const save = async (q: Question) => {
    // новый вопрос префектуры (или перенесённый в другую) — в конец её очереди
    const was = questions.find((x) => x.id === q.id);
    if (q.pref && (!was || was.pref !== q.pref)) await saveMany(appendTo(q.pref, q));
    else await saveMany([q]);
    setEdit(null);
  };
  const del = async (q: Question) => {
    if (!confirm('Удалить вопрос?')) return;
    await ensureSeed();
    await store.deleteQuestion(q.id);
    onChange();
  };
  /** сдвинуть вопрос в очереди префектуры; порядок у всех её вопросов перенумеровывается */
  const move = (code: number, idx: number, d: number) => {
    const list = [...(byPref[code] ?? [])];
    const j = idx + d;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    void saveMany(list.map((q, i) => ({ ...q, order: i })));
  };
  const addFlags = async () => {
    if (!noFlag.length) return;
    if (!confirm(`Создать флаговый вопрос («выбери флаг префектуры») для ${noFlag.length} префектур? Режим — «до верного ответа», ставится в конец очереди префектуры.`)) return;
    await saveMany(noFlag.flatMap((p) => appendTo(p.code, flagQuestion(p.code, settings, 0))));
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'questions.json';
    a.click();
  };
  const importJson = async (f: File) => {
    try {
      const arr = JSON.parse(await f.text());
      if (!Array.isArray(arr)) throw new Error('Ожидается массив вопросов');
      const qs: Question[] = arr.map((q: any) => ({ ...q, id: q.id ?? uid(12) }));
      await store.saveQuestions(qs);
      alert(`Импортировано: ${qs.length}`);
      onChange();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div class="pad col">
      <div class="row wrap">
        <div class="seg">
          <button class={'btn small' + (view === 'prefs' ? ' yellow' : '')} onClick={() => setView('prefs')}>🗾 По префектурам</button>
          <button class={'btn small' + (view === 'list' ? ' yellow' : '')} onClick={() => setView('list')}>📋 Списком ({questions.length})</button>
        </div>
        <button class="btn primary small" onClick={() => setEdit(view === 'prefs' ? newQ('general', { pref: sel }) : newQ(filter.topic || 'general'))}>+ Новый вопрос</button>
        <button class="btn small rainbow" title={firstSpecial ? 'Вопрос в спецтему' : 'Сначала создай спецтему на вкладке «Темы»'} onClick={() => { const sp = settings.topics.find((t) => t.id === filter.topic && t.special) ?? firstSpecial; if (sp) setEdit(newQ(sp.id)); else alert('Сначала создай спецтему на вкладке «Темы»'); }}>+ Спецвопрос</button>
        <button class="btn small" disabled={!noFlag.length || busy} title="Один вопрос «выбери флаг» в каждую префектуру, где его ещё нет" onClick={addFlags}>🚩 Флаговые вопросы{noFlag.length ? ` (+${noFlag.length})` : ' — есть везде'}</button>
        <span class="grow" />
        <button class="btn small" onClick={exportJson}>Экспорт JSON</button>
        <button class="btn small" onClick={() => fileRef.current?.click()}>Импорт JSON</button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void importJson(f); }} />
      </div>
      {isSeed && <div class="note">Сейчас используется стартовый набор вопросов. Как только ты добавишь или изменишь вопрос, набор сохранится в базу.</div>}

      {view === 'prefs'
        ? <PrefView settings={settings} byPref={byPref} sel={sel} setSel={setSel} busy={busy}
            onEdit={(q) => setEdit(structuredClone(q))} onDel={del} onMove={move}
            onAdd={(extra) => setEdit(newQ('general', { pref: sel, ...extra }))}
            onAddFlag={() => void saveMany(appendTo(sel, flagQuestion(sel, settings, 0)))} />
        : <ListView questions={questions} settings={settings} filter={filter} setFilter={setFilter}
            onEdit={(q) => setEdit(structuredClone(q))} onCopy={(q) => setEdit({ ...structuredClone(q), id: uid(12), order: undefined })} onDel={del} />}

      {edit && <QuestionEditor q={edit} settings={settings} busy={busy} onSave={save} onClose={() => setEdit(null)} />}
    </div>
  );
}

// ───────── по префектурам ─────────

function PrefView({ settings, byPref, sel, setSel, busy, onEdit, onDel, onMove, onAdd, onAddFlag }: {
  settings: Settings;
  byPref: Record<number, Question[]>;
  sel: number;
  setSel: (c: number) => void;
  busy: boolean;
  onEdit: (q: Question) => void;
  onDel: (q: Question) => void;
  onMove: (code: number, idx: number, d: number) => void;
  onAdd: (extra?: Partial<Question>) => void;
  onAddFlag: () => void;
}) {
  const [find, setFind] = useState('');
  const list = byPref[sel] ?? [];
  const p = PREF[sel];
  const prefs = PREFS.filter((x) => !find || (x.ru + x.ja + x.en).toLowerCase().includes(find.toLowerCase()));
  return (
    <div class="qp">
      <aside class="qp-side">
        <input class="inp-s" placeholder="Найти префектуру" value={find} onInput={(e) => setFind((e.target as HTMLInputElement).value)} />
        <div class="qp-list">
          {prefs.map((x) => {
            const l = byPref[x.code] ?? [];
            const plain = l.filter((q) => !isFlag(q)).length;
            return (
              <button class={'qp-item' + (x.code === sel ? ' on' : '')} onClick={() => setSel(x.code)}>
                <img class="qp-flag" src={flagUrl(x.code)} alt="" />
                <span class="grow">{x.ru}</span>
                {l.some((q) => q.prize) && <span title="Есть призовой">🏆</span>}
                {l.some(isFlag) && <span title="Есть флаговый">🚩</span>}
                <span class={'qp-n' + (plain ? '' : ' zero')} title="Обычных вопросов">{plain}</span>
              </button>
            );
          })}
        </div>
      </aside>
      <section class="qp-main col">
        <div class="qp-head">
          {flagUrl(sel) ? <img class="qp-bigflag" src={flagUrl(sel)} alt="" /> : <div class="qp-bigflag empty">нет флага</div>}
          <div class="col" style={{ gap: 2 }}>
            <h2 style={{ margin: 0 }}>{p?.ru} <span class="muted">{p?.ja}</span></h2>
            <span class="muted small">№{sel} · вопросов: {list.length}</span>
          </div>
        </div>
        <div class="note small">
          За один приход — один вопрос, сверху вниз. Одноразовый уходит из очереди сразу, «до верного» — когда кто-то ответит верно
          (призовой — когда ответит ходящий). Когда своих вопросов не осталось — задаются общие.
        </div>
        {!list.length && <div class="muted">Своих вопросов нет — здесь будут общие вопросы.</div>}
        <ol class="qp-qs">
          {list.map((q, i) => {
            const t = settings.topics.find((x) => x.id === q.topic);
            return (
              <li class={'qp-q' + (q.prize ? ' prize' : '')}>
                <span class="qp-num">{i + 1}</span>
                <div class="qp-move">
                  <button class="btn small" disabled={busy || i === 0} onClick={() => onMove(sel, i, -1)} title="Выше">▲</button>
                  <button class="btn small" disabled={busy || i === list.length - 1} onClick={() => onMove(sel, i, 1)} title="Ниже">▼</button>
                </div>
                <div class="grow col" style={{ gap: 4, minWidth: 0 }}>
                  <div class="row wrap" style={{ gap: 6 }}>
                    <QBadges q={q} />
                    {t && <span class="chip topic-chip" style={{ borderColor: t.color }}><SkillIcon t={t} size={14} />{t.name}</span>}
                  </div>
                  <div class="qp-text">{q.media && `[${q.media.type}] `}{isFlag(q) ? (q.text || `Какой флаг у префектуры ${p?.ru}?`) : q.text}</div>
                  {isFlag(q)
                    ? <div class="row" style={{ gap: 6 }}><img class="qp-ansflag ok" src={flagUrl(sel)} alt="" /><span class="muted small">+ 3 неверных из других префектур (выбранные ранее и уже угаданные не повторяются)</span></div>
                    : <div class="qp-ans">{q.answers.map((a, k) => <span class={k === q.correct ? 'ok' : ''}>{a.image ? <img src={a.image} class="qp-ansimg" alt="" /> : a.text}</span>)}</div>}
                </div>
                <div class="nowrap">
                  <button class="btn small" onClick={() => onEdit(q)}>✎</button>
                  <button class="btn small" onClick={() => onDel(q)}>🗑</button>
                </div>
              </li>
            );
          })}
        </ol>
        <div class="row wrap">
          <button class="btn small primary" onClick={() => onAdd()}>+ Вопрос</button>
          <button class="btn small yellow" onClick={() => onAdd({ prize: 1 })}>+ 🏆 Призовой</button>
          {!list.some(isFlag) && <button class="btn small" disabled={busy || !flagUrl(sel)} onClick={onAddFlag}>+ 🚩 Флаговый</button>}
        </div>
      </section>
    </div>
  );
}

// ───────── списком ─────────

function ListView({ questions, settings, filter, setFilter, onEdit, onCopy, onDel }: {
  questions: Question[];
  settings: Settings;
  filter: { topic: string; q: string; pref: string; kind: string };
  setFilter: (f: { topic: string; q: string; pref: string; kind: string }) => void;
  onEdit: (q: Question) => void;
  onCopy: (q: Question) => void;
  onDel: (q: Question) => void;
}) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    questions.forEach((q) => (c[q.topic] = (c[q.topic] ?? 0) + 1));
    return c;
  }, [questions]);
  const list = useMemo(() => questions.filter((q) =>
    (!filter.topic || q.topic === filter.topic) &&
    (!filter.pref || String(q.pref ?? '') === filter.pref || (filter.pref === 'special' && isSpecialQ(settings, q)) || (filter.pref === 'none' && !q.pref)) &&
    (!filter.kind || (filter.kind === 'prize' && q.prize) || (filter.kind === 'cycle' && q.mode === 'cycle') || (filter.kind === 'flag' && isFlag(q))) &&
    (!filter.q || q.text.toLowerCase().includes(filter.q.toLowerCase()))), [questions, filter]);
  return (
    <>
      <div class="row wrap">
        <select value={filter.topic} onChange={(e) => setFilter({ ...filter, topic: (e.target as HTMLSelectElement).value })}>
          <option value="">Все темы ({questions.length})</option>
          {settings.topics.filter((t) => !t.special).map((t) => <option value={t.id}>{t.name} ({counts[t.id] ?? 0})</option>)}
          {settings.topics.some((t) => t.special) && <optgroup label="Спецтемы">
            {settings.topics.filter((t) => t.special).map((t) => <option value={t.id}>🌈 {t.name} ({counts[t.id] ?? 0})</option>)}
          </optgroup>}
        </select>
        <select value={filter.pref} onChange={(e) => setFilter({ ...filter, pref: (e.target as HTMLSelectElement).value })}>
          <option value="">Любая префектура</option>
          <option value="none">Без префектуры</option>
          <option value="special">🌈 Только спецвопросы</option>
          {PREFS.map((p) => <option value={String(p.code)}>{p.ru}</option>)}
        </select>
        <select value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: (e.target as HTMLSelectElement).value })}>
          <option value="">Любой тип</option>
          <option value="prize">🏆 Призовые</option>
          <option value="cycle">🔁 До верного ответа</option>
          <option value="flag">🚩 Флаговые</option>
        </select>
        <input class="inp-s" placeholder="Поиск" value={filter.q} onInput={(e) => setFilter({ ...filter, q: (e.target as HTMLInputElement).value })} />
        <span class="muted small">показано {list.length}</span>
      </div>
      <table class="qtable">
        <thead><tr><th>Тема</th><th>Вопрос</th><th>Ответ</th><th>Префектура</th><th>Параметры</th><th></th></tr></thead>
        <tbody>
          {list.map((q) => {
            const t = settings.topics.find((x) => x.id === q.topic);
            const sp = isSpecialQ(settings, q);
            return (
              <tr>
                <td><span class={'chip topic-chip' + (sp ? ' rainbow' : '')} style={{ borderColor: t?.color }}>{t && <SkillIcon t={t} size={18} />}{t?.name ?? q.topic}</span></td>
                <td>{q.media && `[${q.media.type}] `}{isFlag(q) ? (q.text || `Какой флаг у префектуры ${PREF[q.pref!]?.ru}?`) : q.text}</td>
                <td class="muted">{isFlag(q) ? <img class="qp-ansflag" src={flagUrl(q.pref)} alt="" /> : q.answers[q.correct]?.text ?? (q.answers[q.correct]?.image ? '[картинка]' : '')}</td>
                <td class="nowrap">{q.pref ? <>{flagUrl(q.pref) && <img class="qp-flag" src={flagUrl(q.pref)} alt="" />} {PREF[q.pref]?.ru}</> : ''}</td>
                <td><QBadges q={q} /></td>
                <td class="nowrap">
                  <button class="btn small" onClick={() => onEdit(q)}>✎</button>
                  <button class="btn small" onClick={() => onCopy(q)}>⧉</button>
                  <button class="btn small" onClick={() => onDel(q)}>🗑</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// ───────── редактор ─────────

function QuestionEditor({ q: q0, settings, busy, onSave, onClose }: { q: Question; settings: Settings; busy: boolean; onSave: (q: Question) => void; onClose: () => void }) {
  const [q, setQ] = useState<Question>(q0);
  const [uploading, setUploading] = useState(false);
  // файлы из папки media/ (раздаёт локальный сервер) — для подсказок в поле имени
  const [mediaFiles, setMediaFiles] = useState<string[]>([]);
  useEffect(() => {
    fetch('media-list.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then(setMediaFiles).catch(() => {});
  }, []);
  const set = (p: Partial<Question>) => setQ((cur) => ({ ...cur, ...p }));
  const upload = async (f: File, apply: (url: string) => void) => {
    setUploading(true);
    try { apply(await getStore().uploadImage(f)); } catch (e: any) { alert('Не удалось загрузить: ' + e.message); }
    setUploading(false);
  };
  const flag = isFlag(q);
  const special = !!settings.topics.find((t) => t.id === q.topic)?.special;
  const valid = flag ? !!q.pref : q.text.trim() && q.answers.length === 4 && q.answers.every((a) => (q.answerImages ? a.image : a.text?.trim()));
  const setKind = (k: string) => {
    if (k === 'flag') set({ kind: 'flag', answers: [], answerImages: undefined, media: undefined, mode: q.mode ?? 'cycle' });
    else set({ kind: undefined, answers: q.answers.length === 4 ? q.answers : [{ text: '' }, { text: '' }, { text: '' }, { text: '' }] });
  };
  const clean = (x: Question): Question => {
    const out = { ...x };
    if (!out.pref) { delete out.prize; delete out.order; if (out.kind === 'flag') delete out.kind; }
    if (!out.prize) delete out.prize;
    if (out.mode !== 'cycle') delete out.mode;
    return out;
  };
  return (
    <div class="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal panel col qmodal">
        <h3 style={{ margin: 0 }}>{flag ? '🚩 Флаговый вопрос' : q.prize ? '🏆 Призовой вопрос' : 'Вопрос'}</h3>
        <div class="row wrap">
          <label>Префектура <select value={String(q.pref ?? '')} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; set({ pref: v ? Number(v) : undefined }); }}>
            <option value="">—</option>
            {PREFS.map((p) => <option value={String(p.code)}>{p.ru} {p.ja}</option>)}
          </select></label>
          {q.pref && !special && <label>Тип <select value={flag ? 'flag' : ''} onChange={(e) => setKind((e.target as HTMLSelectElement).value)}>
            <option value="">обычный</option>
            <option value="flag">🚩 выбери флаг</option>
          </select></label>}
          <label>Тема <select value={q.topic} onChange={(e) => { const id = (e.target as HTMLSelectElement).value; set({ topic: id, special: settings.topics.find((t) => t.id === id)?.special ? true : undefined }); }}>
            {settings.topics.filter((t) => !t.special).map((t) => <option value={t.id}>{t.name}</option>)}
            {!flag && settings.topics.some((t) => t.special) && <optgroup label="Спецтемы">
              {settings.topics.filter((t) => t.special).map((t) => <option value={t.id}>🌈 {t.name}</option>)}
            </optgroup>}
          </select></label>
          {special && <span class="chip rainbow"><PixIcon id="special" size={16} /> спецвопрос</span>}
          <label>Время, сек <input class="inp-s num" type="number" min={5} max={120} value={q.time ?? ''} placeholder="авто" onInput={(e) => { const v = (e.target as HTMLInputElement).value; set({ time: v ? Number(v) : undefined }); }} /></label>
        </div>

        {q.pref && !special && (
          <div class="qparams">
            <div class="qparam">
              <b>Повтор</b>
              {([['once', '1× Одноразовый', 'задаётся один раз, даже если ответили неверно; правильный ответ показывается'], ['cycle', '🔁 До верного ответа', 'повторяется при следующих приходах, пока кто-то не ответит верно; при ошибке правильный ответ не показывается']] as [QMode, string, string][]).map(([m, l, d]) => (
                <label class="qopt" title={d}><input type="radio" name="qmode" checked={(q.mode ?? 'once') === m} onChange={() => set({ mode: m })} /> <span>{l}<br /><span class="muted small">{d}</span></span></label>
              ))}
            </div>
            <div class="qparam">
              <b>Приз</b>
              <label class="qopt"><input type="checkbox" checked={!!q.prize} onChange={(e) => set({ prize: (e.target as HTMLInputElement).checked ? 1 : undefined })} /> <span>🏆 Призовой<br /><span class="muted small">отвечает только ходящий игрок — приз не делится; за верный ответ приз выбранного ранга</span></span></label>
              {!!q.prize && <label>Ранг приза <select value={String(q.prize)} onChange={(e) => set({ prize: Number((e.target as HTMLSelectElement).value) })}>
                {RANKS.map((r) => <option value={String(r)}>{r} — {rankName(r)}{settings.prizeTiers?.[r - 1]?.length ? ` (${settings.prizeTiers[r - 1].join(', ')})` : ''}</option>)}
              </select></label>}
              {!!q.prize && <span class="muted small">Сами призы по рангам — на вкладке «Настройки».</span>}
            </div>
          </div>
        )}

        {flag ? (
          <>
            <input class="inp-s" placeholder={`Текст (необязательно): Какой флаг у префектуры ${PREF[q.pref!]?.ru ?? ''}?`} value={q.text} onInput={(e) => set({ text: (e.target as HTMLInputElement).value })} />
            <div class="row" style={{ gap: 10, alignItems: 'center' }}>
              <img class="qp-ansflag ok big" src={flagUrl(q.pref)} alt="" />
              <span class="muted small">
                Правильный — флаг этой префектуры, ещё 3 варианта игра подберёт сама: выбранные ранее неверные не повторяются,
                уже угаданные флаги других префектур не показываются (если вариантов не хватает — берутся самые давно угаданные).
              </span>
            </div>
          </>
        ) : (
          <>
            <textarea rows={3} value={q.text} placeholder="Текст вопроса" onInput={(e) => set({ text: (e.target as HTMLTextAreaElement).value })} />
            <div class="row wrap">
              <label>Медиа <select value={q.media?.type ?? ''} onChange={(e) => { const v = (e.target as HTMLSelectElement).value as any; set({ media: v ? { type: v, url: q.media?.url ?? '' } : undefined }); }}>
                <option value="">нет</option>
                <option value="image">картинка (ТВ + телефон)</option>
                <option value="audio">аудио (только ТВ)</option>
                <option value="video">видео (только ТВ)</option>
              </select></label>
              {q.media && <input class="inp-s grow" placeholder={q.media.type === 'image' ? 'URL картинки или загрузи файл →' : 'Имя файла из папки media, например kurenai.mp4'} list={q.media.type === 'image' ? undefined : 'media-files'} value={q.media.url} onInput={(e) => set({ media: { ...q.media!, url: (e.target as HTMLInputElement).value } })} />}
              {(q.media?.type === 'audio' || q.media?.type === 'video') && <input type="file" accept={q.media.type + '/*'} title="Файл не загружается — берётся только имя. Сам файл положи в папку media проекта." onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) set({ media: { type: q.media!.type, url: f.name } }); }} />}
              {q.media?.type === 'image' && <input type="file" accept="image/*" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void upload(f, (url) => set({ media: { type: 'image', url } })); }} />}
            </div>
            {q.media?.type === 'image' && q.media.url && <img src={q.media.url} class="preview" />}
            {(q.media?.type === 'audio' || q.media?.type === 'video') && <datalist id="media-files">{mediaFiles.map((f) => <option value={f} />)}</datalist>}
            {(q.media?.type === 'audio' || q.media?.type === 'video') && <div class="muted small">Аудио и видео играют только на ТВ из папки <b>media</b> в проекте. Никуда не загружаются — в вопросе хранится только имя файла. Телефоны видят только текст и ответы.</div>}
            <label><input type="checkbox" checked={!!q.answerImages} onChange={(e) => set({ answerImages: (e.target as HTMLInputElement).checked })} /> Ответы — картинки (сетка 2×2 на телефоне)</label>
            {q.answers.map((a, i) => (
              <div class={'ans-row' + (q.correct === i ? ' right' : '')}>
                <label class="nowrap"><input type="radio" name="correct" checked={q.correct === i} onChange={() => set({ correct: i })} /> {'ABCD'[i]}</label>
                {q.answerImages ? (
                  <>
                    <input class="inp-s grow" placeholder="URL картинки" value={a.image ?? ''} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setQ((cur) => { const ans = [...cur.answers]; ans[i] = { ...ans[i], image: v }; return { ...cur, answers: ans }; }); }} />
                    <input type="file" accept="image/*" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void upload(f, (url) => setQ((cur) => { const ans = [...cur.answers]; ans[i] = { ...ans[i], image: url }; return { ...cur, answers: ans }; })); }} />
                    {a.image && <img src={a.image} class="thumb" />}
                  </>
                ) : (
                  <input class="inp-s grow" placeholder={`Ответ ${'ABCD'[i]}`} value={a.text ?? ''} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setQ((cur) => { const ans = [...cur.answers]; ans[i] = { ...ans[i], text: v }; return { ...cur, answers: ans }; }); }} />
                )}
              </div>
            ))}
            <div class="muted small">Отметь кружком правильный ответ. На телефонах порядок ответов перемешивается.</div>
          </>
        )}
        <div class="row">
          <button class="btn primary" disabled={!valid || busy || uploading} onClick={() => onSave(clean(q))}>{uploading ? 'Загрузка…' : 'Сохранить'}</button>
          <button class="btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
