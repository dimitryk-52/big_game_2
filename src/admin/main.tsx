import '../ui/pxStyles';
import { render } from 'preact';
import { loadIcons } from '../shared/sprites';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import '../styles/base.css';
import '../styles/admin.css';
import '../styles/kit.css';
import type { GameMsg, GameState, Question, RewardType, Settings } from '../shared/types';
import { getStore } from '../shared/store';
import { SEED_QUESTIONS } from '../shared/seedQuestions';
import { PREFS, PREF } from '../map/mapData';
import { DEFAULT_SETTINGS, REWARD_INFO, isSpecialQ } from '../shared/settings';
import { createTransport, netMode, type Transport } from '../shared/net';
import { Avatar, PixIcon, SkillIcon } from '../ui/common';
import { Topics } from './Topics';
import { fmtYen, uid } from '../shared/util';

type Tab = 'questions' | 'topics' | 'prefs' | 'settings' | 'remote';

function App() {
  const [tab, setTab] = useState<Tab>('questions');
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [err, setErr] = useState('');
  /** «+ вопрос» с вкладки тем: открыть редактор вопроса этой темы */
  const [newIn, setNewIn] = useState<{ topic: string; n: number } | null>(null);
  const store = getStore();
  const reload = async () => {
    try {
      const [q, s] = await Promise.all([store.loadQuestions(), store.loadSettings()]);
      setQuestions(q);
      setSettings(s);
    } catch (e: any) { setErr(String(e.message ?? e)); }
  };
  useEffect(() => { void reload(); }, []);
  return (
    <div class="admin">
      <header class="admin-hdr">
        <b>BIG GAME 2 · ведущий</b>
        <nav>
          {([['questions', 'Вопросы'], ['topics', 'Темы'], ['prefs', 'Префектуры'], ['settings', 'Настройки'], ['remote', 'Пульт']] as [Tab, string][]).map(([k, l]) => (
            <button class={'btn small' + (tab === k ? ' yellow' : '')} onClick={() => setTab(k)}>{l}</button>
          ))}
          <a class="btn small ghost" href="ui.html" target="_blank" title="Все элементы интерфейса: кнопки, барабан, иконки">UI-кит ↗</a>
          <a class="btn small ghost" href="tv.html" target="_blank">ТВ ↗</a>
        </nav>
        <span class="muted small">данные: {store.kind} · сеть: {netMode()}</span>
      </header>
      {err && <div class="warn">{err}</div>}
      {!questions || !settings ? <div class="pad">Загрузка…</div> : (
        <>
          {tab === 'questions' && <Questions questions={questions} settings={settings} onChange={reload} newIn={newIn} />}
          {tab === 'topics' && <Topics settings={settings} questions={questions} onSave={async (s) => { await store.saveSettings(s); setSettings(s); }} onAddQuestion={(topic) => { setNewIn({ topic, n: Date.now() }); setTab('questions'); }} />}
          {tab === 'prefs' && <Prefs settings={settings} questions={questions} onSave={async (s) => { await store.saveSettings(s); setSettings(s); }} />}
          {tab === 'settings' && <SettingsEditor settings={settings} onSave={async (s) => { await store.saveSettings(s); setSettings(s); }} />}
          {tab === 'remote' && <Remote />}
        </>
      )}
    </div>
  );
}

// ───────── вопросы ─────────

function emptyQuestion(topic: string): Question {
  return { id: uid(12), text: '', answers: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], correct: 0, topic };
}

function Questions({ questions, settings, onChange, newIn }: { questions: Question[]; settings: Settings; onChange: () => void; newIn?: { topic: string; n: number } | null }) {
  const store = getStore();
  const [filter, setFilter] = useState({ topic: '', q: '', pref: '' });
  const [edit, setEdit] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const newQ = (topic: string) => ({ ...emptyQuestion(topic), ...(settings.topics.find((t) => t.id === topic)?.special ? { special: true } : {}) });
  useEffect(() => { if (newIn) { setFilter((f) => ({ ...f, topic: newIn.topic })); setEdit(newQ(newIn.topic)); } }, [newIn?.n]);
  const firstSpecial = settings.topics.find((t) => t.special);
  // база пуста — показываем стартовый набор; после первой записи он уже в базе, и пересохранять его нельзя (затрёт правки)
  const isSeed = questions === SEED_QUESTIONS;
  const list = useMemo(() => questions.filter((q) =>
    (!filter.topic || q.topic === filter.topic) &&
    (!filter.pref || String(q.pref ?? '') === filter.pref || (filter.pref === 'special' && isSpecialQ(settings, q))) &&
    (!filter.q || q.text.toLowerCase().includes(filter.q.toLowerCase()))), [questions, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    questions.forEach((q) => (c[q.topic] = (c[q.topic] ?? 0) + 1));
    return c;
  }, [questions]);
  const save = async (q: Question) => {
    setBusy(true);
    try {
      // первый ручной вопрос — сначала сохраняем стартовый набор, чтобы он не пропал
      if (isSeed) await store.saveQuestions(SEED_QUESTIONS);
      await store.saveQuestions([{ ...q, special: isSpecialQ(settings, q) || undefined }]);
      setEdit(null);
      onChange();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  const del = async (q: Question) => {
    if (!confirm('Удалить вопрос?')) return;
    if (isSeed) await store.saveQuestions(SEED_QUESTIONS);
    await store.deleteQuestion(q.id);
    onChange();
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
        <button class="btn primary small" onClick={() => setEdit(newQ(filter.topic || 'general'))}>+ Новый вопрос</button>
        <button class="btn small rainbow" title={firstSpecial ? 'Вопрос в спецтему игрока' : 'Сначала создай спецтему на вкладке «Темы»'} onClick={() => { const sp = settings.topics.find((t) => t.id === filter.topic && t.special) ?? firstSpecial; if (sp) setEdit(newQ(sp.id)); else alert('Сначала создай спецтему на вкладке «Темы»'); }}>+ Спецвопрос</button>
        <select value={filter.topic} onChange={(e) => setFilter({ ...filter, topic: (e.target as HTMLSelectElement).value })}>
          <option value="">Все темы ({questions.length})</option>
          {settings.topics.filter((t) => !t.special).map((t) => <option value={t.id}>{t.name} ({counts[t.id] ?? 0})</option>)}
          {settings.topics.some((t) => t.special) && <optgroup label="Спецтемы игроков">
            {settings.topics.filter((t) => t.special).map((t) => <option value={t.id}>🌈 {t.name}{t.owner ? ` — ${t.owner}` : ''} ({counts[t.id] ?? 0})</option>)}
          </optgroup>}
        </select>
        <select value={filter.pref} onChange={(e) => setFilter({ ...filter, pref: (e.target as HTMLSelectElement).value })}>
          <option value="">Любая префектура</option>
          <option value="special">🌈 Только спецвопросы</option>
          {PREFS.map((p) => <option value={String(p.code)}>{p.ru}</option>)}
        </select>
        <input class="inp-s" placeholder="Поиск" value={filter.q} onInput={(e) => setFilter({ ...filter, q: (e.target as HTMLInputElement).value })} />
        <span class="grow" />
        <button class="btn small" onClick={exportJson}>Экспорт JSON</button>
        <button class="btn small" onClick={() => fileRef.current?.click()}>Импорт JSON</button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void importJson(f); }} />
      </div>
      {isSeed && <div class="note">Сейчас используется стартовый набор вопросов. Как только ты добавишь или изменишь вопрос, набор сохранится в базу.</div>}
      <table class="qtable">
        <thead><tr><th>Тема</th><th>Вопрос</th><th>Ответ</th><th>Пр.</th><th></th></tr></thead>
        <tbody>
          {list.map((q) => {
            const t = settings.topics.find((x) => x.id === q.topic);
            const sp = isSpecialQ(settings, q);
            return (
              <tr>
                <td><span class={'chip topic-chip' + (sp ? ' rainbow' : '')} style={{ borderColor: t?.color }}>{t && <SkillIcon t={t} size={18} />}{t?.name ?? q.topic}{t?.owner ? <span class="muted"> · {t.owner}</span> : ''}</span></td>
                <td>{q.media && `[${q.media.type}] `}{q.text}</td>
                <td class="muted">{q.answers[q.correct]?.text ?? (q.answers[q.correct]?.image ? '[картинка]' : '')}</td>
                <td>{q.pref ? PREF[q.pref]?.ru : ''}</td>
                <td class="nowrap">
                  <button class="btn small" onClick={() => setEdit(structuredClone(q))}>✎</button>
                  <button class="btn small" onClick={() => setEdit({ ...structuredClone(q), id: uid(12) })}>⧉</button>
                  <button class="btn small" onClick={() => del(q)}>🗑</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {edit && <QuestionEditor q={edit} settings={settings} busy={busy} onSave={save} onClose={() => setEdit(null)} />}
    </div>
  );
}

function QuestionEditor({ q: q0, settings, busy, onSave, onClose }: { q: Question; settings: Settings; busy: boolean; onSave: (q: Question) => void; onClose: () => void }) {
  const [q, setQ] = useState<Question>(q0);
  const [uploading, setUploading] = useState(false);
  // файлы из папки media/ (раздаёт локальный сервер) — для подсказок в поле имени
  const [mediaFiles, setMediaFiles] = useState<string[]>([]);
  useEffect(() => {
    fetch('media-list.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then(setMediaFiles).catch(() => {});
  }, []);
  const set = (p: Partial<Question>) => setQ({ ...q, ...p });
  const upload = async (f: File, apply: (url: string) => void) => {
    setUploading(true);
    try { apply(await getStore().uploadImage(f)); } catch (e: any) { alert('Не удалось загрузить: ' + e.message); }
    setUploading(false);
  };
  const valid = q.text.trim() && q.answers.every((a) => (q.answerImages ? a.image : a.text?.trim()));
  return (
    <div class="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal panel col">
        <h3 style={{ margin: 0 }}>Вопрос</h3>
        <textarea rows={3} value={q.text} placeholder="Текст вопроса" onInput={(e) => set({ text: (e.target as HTMLTextAreaElement).value })} />
        <div class="row wrap">
          <label>Тема <select value={q.topic} onChange={(e) => { const id = (e.target as HTMLSelectElement).value; set({ topic: id, special: settings.topics.find((t) => t.id === id)?.special ? true : undefined }); }}>
            {settings.topics.filter((t) => !t.special).map((t) => <option value={t.id}>{t.name}</option>)}
            {settings.topics.some((t) => t.special) && <optgroup label="Спецтемы игроков">
              {settings.topics.filter((t) => t.special).map((t) => <option value={t.id}>🌈 {t.name}{t.owner ? ` — ${t.owner}` : ''}</option>)}
            </optgroup>}
          </select></label>
          <label>Префектура <select value={String(q.pref ?? '')} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; set({ pref: v ? Number(v) : undefined }); }}>
            <option value="">—</option>
            {PREFS.map((p) => <option value={String(p.code)}>{p.ru} {p.ja}</option>)}
          </select></label>
          {settings.topics.find((t) => t.id === q.topic)?.special && <span class="chip rainbow"><PixIcon id="special" size={16} /> спецвопрос игрока</span>}
          <label>Время, сек <input class="inp-s num" type="number" min={5} max={120} value={q.time ?? ''} placeholder="авто" onInput={(e) => { const v = (e.target as HTMLInputElement).value; set({ time: v ? Number(v) : undefined }); }} /></label>
        </div>
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
                <input class="inp-s grow" placeholder="URL картинки" value={a.image ?? ''} onInput={(e) => { const ans = [...q.answers]; ans[i] = { ...a, image: (e.target as HTMLInputElement).value }; set({ answers: ans }); }} />
                <input type="file" accept="image/*" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void upload(f, (url) => { const ans = [...q.answers]; ans[i] = { ...a, image: url }; setQ((cur) => ({ ...cur, answers: ans })); }); }} />
                {a.image && <img src={a.image} class="thumb" />}
              </>
            ) : (
              <input class="inp-s grow" placeholder={`Ответ ${'ABCD'[i]}`} value={a.text ?? ''} onInput={(e) => { const ans = [...q.answers]; ans[i] = { ...a, text: (e.target as HTMLInputElement).value }; set({ answers: ans }); }} />
            )}
          </div>
        ))}
        <div class="muted small">Отметь кружком правильный ответ. Порядок ответов сохраняется как есть.</div>
        <div class="row">
          <button class="btn primary" disabled={!valid || busy || uploading} onClick={() => onSave(q)}>{uploading ? 'Загрузка…' : 'Сохранить'}</button>
          <button class="btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

// ───────── префектуры ─────────

function Prefs({ settings, questions, onSave }: { settings: Settings; questions: Question[]; onSave: (s: Settings) => Promise<void> }) {
  const [s, setS] = useState(settings);
  const [saved, setSaved] = useState(false);
  const qCount = (code: number) => questions.filter((q) => q.pref === code).length;
  const toggle = (list: number[], code: number) => (list.includes(code) ? list.filter((x) => x !== code) : [...list, code]);
  return (
    <div class="pad col">
      <div class="note">Награда за правильный ответ ходящего игрока. «Авто» — случайно при старте игры. Приз — физический подарок, выдаётся один раз, потом префектура даёт йены.</div>
      <div class="row"><button class="btn primary small" onClick={async () => { await onSave(s); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>{saved ? '✔ Сохранено' : 'Сохранить'}</button></div>
      <table class="qtable">
        <thead><tr><th>#</th><th>Префектура</th><th>Награда</th><th>🎰 Пачинко</th><th>🎡 Призовая машина</th><th>Своих вопросов</th></tr></thead>
        <tbody>
          {PREFS.map((p) => (
            <tr>
              <td>{p.code}</td>
              <td>{p.ru} <span class="muted">{p.ja}</span></td>
              <td>
                <select value={s.prefRewards[p.code] ?? ''} onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value as RewardType | '';
                  const pr = { ...s.prefRewards };
                  if (v) pr[p.code] = v; else delete pr[p.code];
                  setS({ ...s, prefRewards: pr });
                }}>
                  <option value="">Авто</option>
                  {(Object.keys(REWARD_INFO) as RewardType[]).map((r) => <option value={r}>{REWARD_INFO[r].icon} {REWARD_INFO[r].name}</option>)}
                </select>
              </td>
              <td><input type="checkbox" checked={s.pachinkoPrefs.includes(p.code)} onChange={() => setS({ ...s, pachinkoPrefs: toggle(s.pachinkoPrefs, p.code) })} /></td>
              <td><input type="checkbox" checked={s.ringPrefs.includes(p.code)} onChange={() => setS({ ...s, ringPrefs: toggle(s.ringPrefs, p.code) })} /></td>
              <td class={qCount(p.code) ? '' : 'muted'}>{qCount(p.code)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────── настройки ─────────

const NUM_FIELDS: [string, string][] = [
  ['calibRounds', 'Кругов калибровки'],
  ['questionTime', 'Время на вопрос, сек'],
  ['duelTime', 'Время на вопрос в дуэли, сек'],
  ['bonusTime', 'Время на выбор бонуса, сек'],
  ['pickTime', 'Время на выбор темы в дуэли, сек'],
  ['landingTime', 'Время на высадку, сек'],
  ['revealMs', 'Показ ответа, мс'],
  ['baseStrength', 'Базовая сила темы'],
  ['startHp', 'Стартовое HP'],
  ['specialPower', 'Сила спецвопроса'],
  ['duelRounds', 'Раундов в дуэли'],
  ['audioLatencyMs', 'Задержка звука ТВ (ритм), мс'],
  ['reward.moverCorrectYen', 'Ходящий: верно, ¥'],
  ['reward.moverCorrectStars', 'Ходящий: верно, ★'],
  ['reward.moverWrongYen', 'Ходящий: неверно, ¥'],
  ['reward.otherCorrectYen', 'Остальные: верно, ¥'],
  ['reward.calibCorrectYen', 'Калибровка: верно, ¥'],
  ['reward.prefMoney', 'Награда «йены», ¥'],
  ['reward.prefStars', 'Награда «звёзды», ★'],
  ['reward.reviveYen', 'Воскрешение: верно, ¥'],
  ['reward.duelWinYen', 'Победа в дуэли, ¥'],
  ['reward.duelWinStars', 'Победа в дуэли, ★'],
  ['shop.special.stars', 'Магазин: спецвопрос, ★'],
  ['shop.special.yen', 'Магазин: спецвопрос, ¥'],
  ['shop.hp.yen', 'Магазин: +HP, ¥'],
  ['shop.hp.amount', 'Магазин: сколько HP'],
  ['shop.stat.yen', 'Магазин: +1 сила, ¥'],
  ['shop.stat.stars', 'Магазин: +1 сила, ★'],
  ['shop.fifty1.yen', 'Магазин: −1 ответ, ¥'],
  ['shop.fifty2.yen', 'Магазин: 50/50, ¥'],
  ['shop.move2.yen', 'Магазин: ход ×2, ¥'],
  ['pachinko.yenPerBall', 'Пачинко: ¥ за шарик'],
  ['pachinko.pack', 'Пачинко: шариков в пачке'],
  ['ring.cost', 'Призовая машина: цена, ¥'],
  ['ring.prizeYen', 'Призовая машина: выигрыш, ¥'],
  ['ring.cellMs', 'Призовая машина: мс на ячейку (меньше — быстрее)'],
];
const getPath = (o: any, p: string) => p.split('.').reduce((a, k) => a?.[k], o);
const setPath = (o: any, p: string, v: any) => {
  const ks = p.split('.');
  const last = ks.pop()!;
  ks.reduce((a, k) => a[k], o)[last] = v;
};

function SettingsEditor({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => Promise<void> }) {
  const [s, setS] = useState<Settings>(structuredClone(settings));
  const [saved, setSaved] = useState(false);
  const upd = (fn: (x: Settings) => void) => { const c = structuredClone(s); fn(c); setS(c); };
  return (
    <div class="pad col" style={{ maxWidth: 900 }}>
      <div class="row">
        <button class="btn primary small" onClick={async () => { await onSave(s); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>{saved ? '✔ Сохранено' : 'Сохранить'}</button>
        <button class="btn small" onClick={() => { if (confirm('Сбросить все настройки к стандартным?')) setS(structuredClone(DEFAULT_SETTINGS)); }}>Сбросить</button>
        <span class="muted small">Изменения применяются к новой игре или после кнопки «Обновить настройки в игре» на пульте.</span>
      </div>
      <div class="settings-grid">
        {NUM_FIELDS.map(([path, label]) => (
          <label class="set-row">
            <span>{label}</span>
            <input class="inp-s num" type="number" value={getPath(s, path)} onInput={(e) => upd((c) => setPath(c, path, Number((e.target as HTMLInputElement).value)))} />
          </label>
        ))}
        <label class="set-row"><span>Вопрос ведёт ведущий кнопкой «Далее» (интро → текст → ответы и таймер → закрыть)</span><input type="checkbox" checked={s.hostPaced !== false} onChange={(e) => upd((c) => (c.hostPaced = (e.target as HTMLInputElement).checked))} /></label>
        <label class="set-row"><span>Авто-переход после показа ответа</span><input type="checkbox" checked={s.autoAdvance} onChange={(e) => upd((c) => (c.autoAdvance = (e.target as HTMLInputElement).checked))} /></label>
        <label class="set-row"><span>Ритм-баттл в дуэлях</span><input type="checkbox" checked={s.rhythmInDuel} onChange={(e) => upd((c) => (c.rhythmInDuel = (e.target as HTMLInputElement).checked))} /></label>
        <label class="set-row"><span>Золотая ячейка (настоящий приз) в призовой машине</span><input type="checkbox" checked={s.ring.physicalPrize} onChange={(e) => upd((c) => (c.ring.physicalPrize = (e.target as HTMLInputElement).checked))} /></label>
      </div>
      <div class="note">Темы и спецтемы игроков — на вкладке «Темы».</div>
      <h3>Названия призов</h3>
      <textarea rows={4} value={s.prizeNames.join('\n')} onInput={(e) => upd((c) => (c.prizeNames = (e.target as HTMLTextAreaElement).value.split('\n').map((x) => x.trim()).filter(Boolean)))} />
      <div class="muted small">По одному на строку. При выигрыше приза выбирается случайное название.</div>
    </div>
  );
}

// ───────── пульт ─────────

function Remote() {
  const [room, setRoom] = useState(() => localStorage.getItem('bg_tv_room') ?? localStorage.getItem('bg_admin_room') ?? '');
  const [net, setNet] = useState<Transport | null>(null);
  const [s, setS] = useState<GameState | null>(null);
  const [give, setGive] = useState<Record<string, string>>({});
  const connect = () => {
    localStorage.setItem('bg_admin_room', room);
    const t = createTransport(room.toUpperCase());
    let state: GameState | null = null;
    t.listen('game', (m: GameMsg) => {
      if (m.t !== 'st') return;
      if (!state && !m.full) return;
      state = { ...(state ?? ({} as GameState)), ...m.parts, v: m.v };
      setS(state);
    });
    setNet(t);
    setTimeout(() => t.send('input', { t: 'hello', cid: 'admin' }), 400);
  };
  const ctl = (cmd: string, args?: any) => net?.send('input', { t: 'ctl', cmd, args });
  if (!net) {
    return (
      <div class="pad col" style={{ maxWidth: 420 }}>
        <div class="note">Пульт управляет игрой на ТВ по сети — удобно с телефона ведущего. Пульт получает все обновления состояния, поэтому держи его открытым только когда нужен.</div>
        <input class="inp-s" placeholder="Код комнаты" value={room} onInput={(e) => setRoom((e.target as HTMLInputElement).value.toUpperCase())} />
        <button class="btn primary" disabled={room.length !== 4} onClick={connect}>Подключиться</button>
      </div>
    );
  }
  return (
    <div class="pad col">
      <div class="row wrap">
        <b>Комната {room}</b>
        <span class="chip">{s ? (s.phase === 'turns' ? `круг ${s.round}` : s.phase) : 'ждём состояние…'}</span>
        {s?.paused && <span class="chip">ПАУЗА</span>}
      </div>
      <div class="row wrap remote-btns">
        {s?.phase === 'lobby' && <button class="btn primary" onClick={() => ctl('start')}>▶ Начать игру</button>}
        <button class="btn primary" onClick={() => ctl('next')}>⏭ {nextLabel(s)}</button>
        <button class="btn" onClick={() => ctl('pause')}>{s?.paused ? '▶ Продолжить' : '⏸ Пауза'}</button>
        {s?.phase === 'lobby' && <button class="btn" onClick={() => ctl('addBot')}>+ бот</button>}
        <button class="btn" onClick={() => ctl('reload')}>🔄 Обновить вопросы и настройки в игре</button>
        <button class="btn" onClick={() => { if (confirm('Завершить игру?')) ctl('end'); }}>🏁 Завершить</button>
      </div>
      {s && (
        <table class="qtable">
          <thead><tr><th>Игрок</th><th>Где</th><th>HP</th><th>¥</th><th>★</th><th>Связь</th><th>Выдать (¥ / ★ / HP / приз)</th><th></th></tr></thead>
          <tbody>
            {s.joinOrder.map((id) => s.players[id]).filter(Boolean).map((p) => (
              <tr>
                <td class="row"><Avatar p={p} size={24} /> {p.name}</td>
                <td>
                  <select value={String(p.pref ?? '')} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v && confirm(`Переместить ${p.name} в ${PREF[Number(v)].ru}?`)) ctl('teleport', { pid: p.id, pref: Number(v) }); }}>
                    <option value="">—</option>
                    {PREFS.map((x) => <option value={String(x.code)}>{x.ru}</option>)}
                  </select>
                </td>
                <td>{p.hp}/{p.maxHp}</td>
                <td>{fmtYen(p.yen)}</td>
                <td>{p.stars}</td>
                <td><span class={'dot ' + (p.online ? 'on' : 'off')} /></td>
                <td class="row">
                  <input class="inp-s num" placeholder="¥" value={give[p.id + 'y'] ?? ''} onInput={(e) => setGive({ ...give, [p.id + 'y']: (e.target as HTMLInputElement).value })} />
                  <input class="inp-s num" placeholder="★" value={give[p.id + 's'] ?? ''} onInput={(e) => setGive({ ...give, [p.id + 's']: (e.target as HTMLInputElement).value })} />
                  <input class="inp-s num" placeholder="HP" value={give[p.id + 'h'] ?? ''} onInput={(e) => setGive({ ...give, [p.id + 'h']: (e.target as HTMLInputElement).value })} />
                  <input class="inp-s" style={{ width: 110 }} placeholder="приз" value={give[p.id + 'p'] ?? ''} onInput={(e) => setGive({ ...give, [p.id + 'p']: (e.target as HTMLInputElement).value })} />
                  <button class="btn small" onClick={() => {
                    ctl('give', { pid: p.id, yen: Number(give[p.id + 'y'] || 0), stars: Number(give[p.id + 's'] || 0), hp: Number(give[p.id + 'h'] || 0), prize: give[p.id + 'p'] || undefined });
                    setGive({});
                  }}>OK</button>
                </td>
                <td><button class="btn small" onClick={() => { if (confirm(`Удалить ${p.name} из игры?`)) ctl('kick', { pid: p.id }); }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// иконки — PNG из src/img/icons, читаются до первого рендера
void loadIcons().then(() => render(<App />, document.getElementById('app')!));

/** что сделает «Далее» сейчас — подсказка ведущему на пульте */
function nextLabel(s: GameState | null) {
  if (!s || s.settings.hostPaced === false) return 'Далее';
  const st = s.stage;
  if (st.t === 'prefIntro') return 'Далее: показать вопрос';
  if (st.t === 'question' && s.q?.reading) return 'Далее: ответы и таймер';
  if (st.t === 'question' && s.q?.revealed) return 'Далее: закрыть вопрос';
  return 'Далее';
}
