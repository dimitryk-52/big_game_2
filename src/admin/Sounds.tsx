// Вкладки «Звуки» (события игры) и «Интро» (префектуры, групповые и соло-игры с предпросмотром).
// Файлы кладутся в папку sounds/ проекта на этом компьютере, назначения — в sounds/sounds.json.
// В git и в базу ничего не уходит: звуки играет только ТВ, а он запускается здесь же.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Settings } from '../shared/types';
import {
  INTRO_LIST, MUSIC_LIST, PHONE_SOUNDS, SOUND_EVENTS, SOUND_GROUPS, introId, listSoundFiles, onSoundsChange, playFile, saveSounds, soundLabel, soundMap, soundUrl, stopAllSounds, uploadSound,
  type IntroKind, type SoundCfg, type SoundMap,
} from '../shared/sounds';
import { unlockAudio } from '../shared/sound';
import { GROUP_GAMES, SOLO_GAMES, prefIcons, soloAt } from '../shared/settings';
import { PREF } from '../map/mapData';
import { PixIcon } from '../ui/common';

/** назначения + список файлов; изменения сразу пишутся на диск */
function useSounds() {
  const [map, setMap] = useState<SoundMap>(soundMap());
  const [files, setFiles] = useState<string[] | null | undefined>(undefined);
  const [status, setStatus] = useState('');
  const refreshFiles = async () => setFiles(await listSoundFiles());
  useEffect(() => {
    void refreshFiles();
    return onSoundsChange(() => setMap({ ...soundMap() }));
  }, []);
  const set = async (id: string, cfg: SoundCfg) => {
    const next = { ...map, [id]: cfg };
    setMap(next);
    try {
      await saveSounds(next);
      setStatus('✔ сохранено');
      setTimeout(() => setStatus(''), 1200);
    } catch (e: any) { setStatus('⚠ ' + e.message); }
  };
  const upload = async (f: File) => {
    const name = await uploadSound(f);
    await refreshFiles();
    return name;
  };
  return { map, files, status, set, upload, refreshFiles };
}
type Snd = ReturnType<typeof useSounds>;

/** что сейчас играет в предпросмотре (id события) — у него ▶ становится ■ */
let nowId: string | null = null;
let nowTok = 0;
const nowSubs = new Set<() => void>();
function setNowId(id: string | null) {
  nowId = id;
  nowSubs.forEach((c) => c());
  return ++nowTok;
}
/** отметить, что у события id играет предпросмотр, пока src не доиграет */
function track(id: string, src: Promise<AudioBufferSourceNode | undefined> | HTMLAudioElement | undefined) {
  const tok = setNowId(id);
  const end = () => { if (nowTok === tok) setNowId(null); };
  if (src instanceof HTMLAudioElement) src.addEventListener('ended', end);
  else if (src) void src.then((x) => (x ? x.addEventListener('ended', end) : end()));
  else end();
}
function usePreviewing() {
  const [, bump] = useState(0);
  useEffect(() => {
    const c = () => bump((x) => x + 1);
    nowSubs.add(c);
    return () => { nowSubs.delete(c); };
  }, []);
  return nowId;
}

/** предпросмотр фоновой музыки — обычным <audio>, чтобы не декодировать весь трек */
let musicEl: HTMLAudioElement | null = null;
function stopMusic() {
  musicEl?.pause();
  musicEl = null;
}
function previewMusic(id: string, cfg: SoundCfg | undefined, dflt?: string) {
  stopAll();
  if (cfg?.mute) return;
  const url = cfg?.file ? soundUrl(cfg.file) : dflt;
  if (!url) return;
  musicEl = new Audio(url);
  musicEl.volume = Math.min(1, 0.6 * (cfg?.file ? cfg.vol ?? 1 : 1));
  void musicEl.play().catch(() => {});
  track(id, musicEl);
}
function stopAll() {
  stopAllSounds();
  stopMusic();
  if (nowId) setNowId(null);
}

/** сыграть то, что сейчас стоит на событии */
function preview(id: string, cfg: SoundCfg | undefined) {
  unlockAudio();
  stopAll();
  if (cfg?.mute) return;
  if (cfg?.file) return track(id, playFile(cfg.file, cfg.vol ?? 1));
  SOUND_EVENTS[id]?.synth?.();
}

/** событие, которое без своего файла играет другое (fallbackTo, по умолчанию «Приз / победа») */
function fallbackPreview(id: string, cfg: SoundCfg | undefined) {
  if (cfg?.file || cfg?.mute) return preview(id, cfg);
  const to = SOUND_EVENTS[id]?.fallbackTo ?? 'prize';
  const alt = soundMap()[to];
  if (alt?.file && !alt.mute) {
    unlockAudio();
    stopAll();
    return track(id, playFile(alt.file, alt.vol ?? 1));
  }
  preview(to, alt);
}

/** где ещё стоит файл (кроме события except) — названия событий */
function usedBy(map: SoundMap, file: string | undefined, except?: string) {
  if (!file) return [];
  return Object.entries(map).filter(([k, c]) => k !== except && c.file === file && !c.mute).map(([k]) => soundLabel(k));
}
const usedShort = (u: string[]) => u.slice(0, 2).join(', ') + (u.length > 2 ? ` и ещё ${u.length - 2}` : '');

function NoServer({ files }: { files: string[] | null | undefined }) {
  if (files !== null) return null;
  return <div class="warn">Список звуков недоступен: админка открыта не с локального сервера. Запусти «Запустить админку.bat» (или npm run dev) — звуки хранятся в папке sounds/ на этом компьютере.</div>;
}

/** выбор звука для одного события: файл из папки / загрузить / встроенный / тишина + громкость */
function Picker({ id, snd, synth, onPlay, label, none }: { id: string; snd: Snd; synth: boolean; onPlay?: (cfg: SoundCfg) => void; label?: string; none?: string }) {
  const cfg = snd.map[id] ?? {};
  const inp = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState(false);
  const choose = (file: string) => {
    const next = { ...cfg, file, mute: false };
    void snd.set(id, next);
    if (onPlay) onPlay(next);
    else preview(id, next);
  };
  const take = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const name = await snd.upload(f);
      const next = { ...cfg, file: name, mute: false };
      await snd.set(id, next);
      if (onPlay) onPlay(next);
      else preview(id, next);
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  const value = cfg.mute ? '__mute' : cfg.file ?? '';
  const files = snd.files ?? [];
  const on = usePreviewing() === id;
  return (
    <div class={'snd-pick' + (drag ? ' drag' : '')}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void take(e.dataTransfer?.files[0]); }}>
      <button class="btn small" title={on ? 'Остановить' : 'Послушать'} onClick={() => (on ? stopAll() : onPlay ? onPlay(cfg) : preview(id, cfg))}>{on ? '■' : '▶'}</button>
      <select value={value} onChange={(e) => {
        const v = (e.target as HTMLSelectElement).value;
        const next: SoundCfg = v === '__mute' ? { ...cfg, file: undefined, mute: true } : { ...cfg, file: v || undefined, mute: false };
        void snd.set(id, next);
        if (onPlay) onPlay(next);
        else preview(id, next);
      }}>
        <option value="">{none ?? (synth ? '8-бит (встроенный)' : '— нет звука —')}</option>
        {(synth || none) && <option value="__mute">🔇 выключить</option>}
        {cfg.file && !files.includes(cfg.file) && <option value={cfg.file}>⚠ {cfg.file} (нет в папке)</option>}
        {folders(files).map(([dir, fs]) => (
          <optgroup label={folderName(dir)}>{fs.map((f) => {
            const u = usedBy(snd.map, f, id);
            return <option value={f}>{f.split('/').pop()}{u.length ? `  ● уже: ${usedShort(u)}` : ''}</option>;
          })}</optgroup>
        ))}
      </select>
      <button class="btn small" title="Открыть библиотеку: все звуки из папки sounds/ с прослушиванием" onClick={() => setLib(true)}>🎵 Библиотека</button>
      {lib && <Library snd={snd} current={cfg.file} title={label ?? soundLabel(id)} onPick={(f) => { setLib(false); choose(f); }} onClose={() => { stopAll(); setLib(false); }} />}
      <button class="btn small ghost" disabled={busy} title="Выбрать файл на компьютере — он скопируется в папку sounds/. Можно и перетащить файл сюда." onClick={() => inp.current?.click()}>{busy ? '…' : '📁 Файл'}</button>
      <input ref={inp} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.opus,.flac" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; void take(f); }} />
      {cfg.file && (
        <label class="snd-vol" title="Громкость">
          🔊<input type="range" min={0} max={1.5} step={0.05} value={cfg.vol ?? 1}
            onChange={(e) => {
              const vol = +(e.target as HTMLInputElement).value;
              const next = { ...cfg, vol };
              void snd.set(id, next);
              if (onPlay) onPlay(next);
              else { stopAll(); track(id, playFile(cfg.file!, vol)); }
            }} />
          <span>{Math.round((cfg.vol ?? 1) * 100)}%</span>
        </label>
      )}
    </div>
  );
}

/** файлы по папкам: корень sounds/ (загруженные) и подпапки (stock/ и т. п.) */
function folders(files: string[]): [string, string[]][] {
  const m = new Map<string, string[]>();
  for (const f of files) {
    const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
    if (!m.has(dir)) m.set(dir, []);
    m.get(dir)!.push(f);
  }
  return [...m.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
}
const folderName = (dir: string) => (dir ? `📂 ${dir}` : '📂 загруженные (sounds/)');

/** библиотека: все файлы из sounds/ с прослушиванием, поиском и «где уже стоит» */
function Library({ snd, current, title, onPick, onClose }: { snd: Snd; current?: string; title: string; onPick: (f: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    void snd.refreshFiles(); // файлы могли положить в папку руками — перечитываем при каждом открытии
    const on = (e: KeyboardEvent) => { if (e.code === 'Escape') onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  const listen = async (f: string) => {
    unlockAudio();
    stopAll();
    if (now === f) return setNow(null);
    setNow(f);
    const src = await playFile(f);
    src?.addEventListener('ended', () => setNow((x) => (x === f ? null : x)));
  };
  const used = (f: string) => usedBy(snd.map, f);
  const files = (snd.files ?? []).filter((f) => !q || f.toLowerCase().includes(q.toLowerCase().replace(/ /g, '_')) || f.toLowerCase().includes(q.toLowerCase()));
  return (
    <div class="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="panel modal snd-lib col">
        <div class="row">
          <b style={{ flex: 1 }}>Библиотека звуков → «{title}»</b>
          <button class="btn small ghost" onClick={onClose}>✕</button>
        </div>
        <input class="inp-s" placeholder="Поиск по названию: gong, bell, intro…" value={q} autoFocus onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        {!files.length && <div class="muted">Ничего не нашлось. Свои файлы можно добавить кнопкой «📁 Файл» или положить в папку sounds/.</div>}
        {folders(files).map(([dir, fs]) => (
          <section>
            <h4>{folderName(dir)} <span class="muted small">{fs.length}</span></h4>
            {fs.map((f) => {
              const u = used(f);
              return (
                <div class={'snd-lib-row' + (f === current ? ' cur' : '') + (f === now ? ' play' : '')}>
                  <button class="btn small" title="Прослушать" onClick={() => void listen(f)}>{f === now ? '■' : '▶'}</button>
                  <span class="snd-lib-name">{f.split('/').pop()}</span>
                  {u.length > 0 && <span class="muted small" title={u.join(', ')}>уже: {usedShort(u)}</span>}
                  {f === current ? <span class="snd-badge own">выбран</span> : <button class="btn small primary" onClick={() => onPick(f)}>Выбрать</button>}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

/** где играет и что это: короткий fx или подложка */
const where = (fx: boolean) => <>{fx && <span class="snd-badge fx" title="Короткий звук на событие">fx</span>}</>;
const TV = <span class="snd-where" title="Играет на ТВ — можно поставить свой файл">📺 ТВ</span>;

function badge(cfg: SoundCfg | undefined, synth: boolean, fallback?: string) {
  if (cfg?.mute) return <span class="snd-badge off">тишина</span>;
  if (cfg?.file) return <span class="snd-badge own">свой</span>;
  if (fallback) return <span class="snd-badge synth">{fallback}</span>;
  return synth ? <span class="snd-badge synth">8-бит</span> : <span class="snd-badge none">молчит</span>;
}

// ───────── вкладка «Звуки» ─────────

/** фоновая музыка ТВ: карта, дуэль, обычные вопросы и каждая групповая игра */
function MusicSection({ snd }: { snd: Snd }) {
  useEffect(() => stopMusic, []);
  return (
    <section class="snd-group">
      <h3>🎵 Фоновая музыка {TV} <span class="muted small">подложка</span></h3>
      <div class="muted small">
        Играет по кругу на ТВ, между треками — плавный переход. У вопросов и групповых игр без своего файла — как раньше (тишина);
        у карты и дуэли без своего файла — <code>music/map.mp3</code> и <code>music/duel.mp3</code>. В вопросах с аудио/видео и в ритм-батле музыки нет.
      </div>
      <table class="qtable snd-table">
        <tbody>
          {MUSIC_LIST.map((m) => {
            const cfg = snd.map[m.id];
            return (
              <tr>
                <td class="snd-name">
                  <b>{m.name}</b> {cfg?.mute ? <span class="snd-badge off">тишина</span> : cfg?.file ? <span class="snd-badge own">свой</span> : m.dflt ? <span class="snd-badge synth">стандартная</span> : <span class="snd-badge none">тишина</span>}
                  <div class="muted small">{m.when}</div>
                </td>
                <td><Picker id={m.id} snd={snd} synth={false} label={'Музыка: ' + m.name} none={m.dflt ? `стандартная (${m.dflt})` : undefined} onPlay={(c) => { unlockAudio(); previewMusic(m.id, c, m.dflt); }} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function SoundsTab() {
  const snd = useSounds();
  const [onlyTodo, setOnlyTodo] = useState(false);
  const all = SOUND_GROUPS.flatMap((g) => g.events);
  const own = all.filter((e) => snd.map[e.id]?.file).length;
  return (
    <div class="pad col snd">
      <div class="note">
        Здесь — звуки событий игры. Все они играют <b>только на ТВ</b>, поэтому файлы никуда не загружаются: кнопка «📁 Файл» (или перетаскивание файла на строку)
        копирует его в папку <code>sounds/</code> проекта, а «🎵 Библиотека» показывает все звуки оттуда (стоковые — в <code>sounds/stock/</code>) с прослушиванием; а выбор сохраняется в <code>sounds/sounds.json</code>. Нет своего файла — играет встроенный 8-битный звук,
        а у событий с пометкой «молчит» звука пока нет вовсе — им можно его дать. Открытый ТВ подхватывает изменения сам (за ~10 c).
        Интро префектур и игр — на вкладке «Интро».
      </div>
      <NoServer files={snd.files} />
      <MusicSection snd={snd} />
      <div class="row wrap">
        <b>Своих звуков: {own} из {all.length}</b>
        <label><input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo((e.target as HTMLInputElement).checked)} /> только без своего файла</label>
        <button class="btn small ghost" onClick={() => void snd.refreshFiles()} title="Если положил файлы в папку sounds/ вручную">↻ Обновить список файлов ({snd.files?.length ?? 0})</button>
        <button class="btn small ghost" onClick={() => stopAll()}>■ Стоп</button>
        <span class="muted small">{snd.status}</span>
      </div>
      {SOUND_GROUPS.map((g) => {
        const evs = g.events.filter((e) => !onlyTodo || !snd.map[e.id]?.file);
        if (!evs.length) return null;
        return (
          <section class="snd-group">
            <h3>{g.name} {TV}</h3>
            {g.note && <div class="muted small">{g.note}</div>}
            <table class="qtable snd-table">
              <tbody>
                {evs.map((e) => (
                  <tr>
                    <td class="snd-name"><b>{e.name}</b> {where(!e.bed)}{badge(snd.map[e.id], !!e.synth, e.fallback)}<div class="muted small">{e.when}</div></td>
                    <td><Picker id={e.id} snd={snd} synth={!!e.synth} label={e.name} none={e.fallback} onPlay={e.fallback ? (c) => fallbackPreview(e.id, c) : undefined} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      <section class="snd-group">
        <h3>На телефонах <span class="snd-where">📱 телефон</span></h3>
        <div class="muted small">Всегда встроенные 8-битные: телефоны берут игру с GitHub Pages, свои файлы туда не качаются (и не нужно — трафик и задержка). Здесь только послушать.</div>
        <table class="qtable snd-table">
          <tbody>
            {PHONE_SOUNDS.map((e) => (
              <tr>
                <td class="snd-name"><b>{e.name}</b> {where(true)}<span class="snd-badge synth">8-бит</span><div class="muted small">{e.when}</div></td>
                <td><button class="btn small" title="Послушать" onClick={() => { unlockAudio(); stopAll(); e.synth(); }}>▶</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ───────── вкладка «Интро» ─────────

const SECTIONS: { kind: IntroKind; name: string; hint: string }[] = [
  { kind: 'pref', name: 'Префектуры', hint: 'Звучит при первом приходе в префектуру — вместе с наездом на её фон и названием.' },
  { kind: 'group', name: 'Групповые игры', hint: 'Звучит, когда разворачивается свиток с названием игры (у джа-одори — карточка правил).' },
  { kind: 'solo', name: 'Соло-игры', hint: 'Звучит, когда игрок открыл соло-игру на телефоне и на ТВ появилось его окошко.' },
];

/** фрейм 1600×900 с настоящим ТВ, уменьшенный под ширину колонки */
function PreviewFrame({ kind, id, pref, n, icons }: { kind: IntroKind; id: string; pref?: number; n: number; icons?: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const fr = useRef<HTMLIFrameElement>(null);
  const [k, setK] = useState(0.5);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const ro = new ResizeObserver(() => setK((box.current?.clientWidth ?? 800) / 1600));
    ro.observe(box.current!);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (ready) fr.current?.contentWindow?.postMessage({ type: 'bg-preview', kind, id, pref, n, icons }, location.origin);
  }, [kind, id, pref, n, ready, icons?.join()]);
  const src = useMemo(() => `tv.html?preview=1&kind=${kind}&id=${id}${pref ? '&pref=' + pref : ''}`, []);
  return (
    <div class="intro-frame" ref={box} style={{ height: 900 * k }}>
      <iframe ref={fr} src={src} onLoad={() => setReady(true)} style={{ transform: `scale(${k})` }} />
    </div>
  );
}

export function IntrosTab({ settings }: { settings: Settings }) {
  const snd = useSounds();
  const [sel, setSel] = useState(INTRO_LIST[0]);
  const [n, setN] = useState(0);
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [auto, setAuto] = useState(true);
  const sid = introId(sel.kind, sel.id);
  const list = INTRO_LIST.filter((x) => !onlyTodo || !snd.map[introId(x.kind, x.id)]?.file || x === sel);
  /** у групповой игры фон — префектура, где она стоит в раскладке */
  const groupPref = (game: string) => Number(Object.entries(settings.groupPrefs).find(([, g]) => g === game)?.[0]) || undefined;
  const pref = sel.kind === 'group' ? groupPref(sel.id) : undefined;

  const play = (withSound = true, c: SoundCfg | undefined = snd.map[sid]) => {
    setN((x) => x + 1);
    unlockAudio();
    stopAll();
    if (withSound && c?.file && !c.mute) track(sid, playFile(c.file, c.vol ?? 1));
  };
  const go = (d: number) => {
    const i = list.indexOf(sel);
    const next = list[Math.max(0, Math.min(list.length - 1, i + d))];
    if (next && next !== sel) pick(next);
  };
  const pick = (x: typeof sel) => {
    setSel(x);
    stopAll();
    setN((v) => v + 1);
    if (auto) {
      const c = snd.map[introId(x.kind, x.id)];
      unlockAudio();
      if (c?.file) track(introId(x.kind, x.id), playFile(c.file, c.vol ?? 1));
    }
  };
  // ↑/↓ — соседний пункт, пробел — ещё раз
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      if (e.code === 'ArrowDown') { e.preventDefault(); go(1); }
      if (e.code === 'ArrowUp') { e.preventDefault(); go(-1); }
      if (e.code === 'Space') { e.preventDefault(); play(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  /** что ещё есть в префектуре — подсказка, под что подбирать звук */
  const prefInfo = (code: number) => {
    const out: string[] = [];
    const g = settings.groupPrefs[code];
    if (g) out.push('групповая: ' + GROUP_GAMES[g].name);
    for (const s of soloAt(settings, code)) out.push(SOLO_GAMES[s].name);
    if (settings.shopPrefs.includes(code)) out.push('магазин');
    return out.join(' · ');
  };

  return (
    <div class="intros">
      <aside class="intros-list">
        <label class="small"><input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo((e.target as HTMLInputElement).checked)} /> только без звука</label>
        {SECTIONS.map((sec) => {
          const items = list.filter((x) => x.kind === sec.kind);
          const total = INTRO_LIST.filter((x) => x.kind === sec.kind);
          const done = total.filter((x) => snd.map[introId(x.kind, x.id)]?.file).length;
          return (
            <div class="intros-sec">
              <h3>{sec.name} <span class="muted small">{done} / {total.length}</span></h3>
              {items.map((x) => {
                const xid = introId(x.kind, x.id);
                const has = !!snd.map[xid]?.file;
                const dup = usedBy(snd.map, snd.map[xid]?.file, xid);
                return (
                  <button class={'intros-item' + (x === sel ? ' on' : '')} onClick={() => pick(x)}
                    title={dup.length ? 'Этот же звук стоит ещё: ' + dup.join(', ') : undefined}
                    ref={(el) => { if (el && x === sel) el.scrollIntoView({ block: 'nearest' }); }}>
                    <span class={'dot' + (dup.length ? ' dup' : has ? ' ok' : '')} />
                    {x.kind === 'pref' && <span class="muted small num">{x.id}</span>}
                    {x.kind === 'solo' && <PixIcon id={x.id} size={16} />}
                    <span>{x.name}</span> <span class="muted small">{x.sub}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </aside>
      <main class="intros-main col">
        <NoServer files={snd.files} />
        <div class="row wrap intros-title">
          <h2>{sel.name} <span class="muted">{sel.sub}</span> {TV}{where(true)}</h2>
          <span class="muted small">{SECTIONS.find((x) => x.kind === sel.kind)!.hint}</span>
        </div>
        {sel.kind === 'pref' && prefInfo(+sel.id) && <div class="muted small">Здесь: {prefInfo(+sel.id)}</div>}
        {sel.kind === 'group' && <div class="muted small">{GROUP_GAMES[sel.id as keyof typeof GROUP_GAMES].how}{pref ? ` · фон: ${PREF[pref]?.ru}` : ''}</div>}
        <PreviewFrame kind={sel.kind} id={sel.id} pref={pref} n={n}
          icons={sel.kind === 'pref' ? prefIcons(settings, +sel.id, { reward: settings.prefRewards[+sel.id] ?? 'money' }) : undefined} />
        <div class="row wrap">
          <button class="btn primary" onClick={() => play()}>▶ Интро со звуком <span class="muted small">(пробел)</span></button>
          <button class="btn small" onClick={() => play(false)}>↻ Только анимация</button>
          <button class="btn small ghost" onClick={() => stopAll()}>■ Стоп</button>
          <span style={{ flex: 1 }} />
          <button class="btn small" onClick={() => go(-1)}>← Пред. <span class="muted small">↑</span></button>
          <button class="btn small" onClick={() => go(1)}>След. → <span class="muted small">↓</span></button>
          <label class="small" title="При переходе к следующему пункту сразу проигрывать его интро"><input type="checkbox" checked={auto} onChange={(e) => setAuto((e.target as HTMLInputElement).checked)} /> автоплей</label>
        </div>
        <div class="row wrap">
          <b>Звук:</b>
          <Picker id={sid} snd={snd} synth={false} onPlay={(c) => play(true, c)} label={'Интро: ' + sel.name} />
          <span class="muted small">{snd.status}</span>
        </div>
        {usedBy(snd.map, snd.map[sid]?.file, sid).length > 0 && <div class="snd-dup small">● Этот же файл стоит ещё: {usedBy(snd.map, snd.map[sid]?.file, sid).join(', ')}</div>}
        <div class="muted small">Совет: перетащи файл прямо на строку «Звук» — он скопируется в папку sounds/ и сразу проиграется вместе с анимацией.</div>
      </main>
    </div>
  );
}
