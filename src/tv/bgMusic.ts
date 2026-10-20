// Фоновая музыка ТВ. Что на что — вкладка «Звуки» → «Фоновая музыка» (записи music:<трек> в
// sounds/sounds.json, файлы из папки sounds/). У карты и дуэли без своего файла — music/map.mp3 и
// music/duel.mp3 из папки music/ (локальные файлы, в git не попадают). Нет файла — просто тишина.
// Переключение — плавным перекрёстным затуханием.
import { soundOn } from '../shared/sound';
import { MUSIC_LIST, musicId, onSoundsChange, soundMap, soundUrl } from '../shared/sounds';

/** трек: map, duel, question, group:<игра> */
export type Track = string;

/** базовая громкость; итог = база × громкость из админки */
const BASE: Record<string, number> = { map: 0.35, duel: 0.45 };
const BASE_OTHER = 0.4;
const FADE_MS = 1200;

const players = new Map<Track, HTMLAudioElement>();
let want: Track | null = null;
let duck = 1;
let timer: ReturnType<typeof setInterval> | null = null;

/** файл трека и его громкость; null — у трека нет музыки */
function source(t: Track): { url: string; vol: number } | null {
  const id = musicId(t);
  const c = soundMap()[id];
  if (c?.mute) return null;
  const base = BASE[t] ?? BASE_OTHER;
  if (c?.file) return { url: soundUrl(c.file), vol: base * (c.vol ?? 1) };
  const d = MUSIC_LIST.find((m) => m.id === id)?.dflt;
  return d ? { url: d, vol: base } : null;
}

function player(t: Track, url: string) {
  let a = players.get(t);
  if (a && a.dataset.url !== url) { a.pause(); a = undefined; } // в админке поменяли файл
  if (!a) {
    a = new Audio(url);
    a.dataset.url = url;
    a.loop = true;
    a.volume = 0;
    a.preload = 'auto';
    a.onerror = () => { /* нет файла — играем без музыки */ };
    players.set(t, a);
  }
  return a;
}

/** шаг затухания: громкость каждого трека плавно идёт к цели; затихший трек ставится на паузу */
function step() {
  let busy = false;
  const tracks = new Set(players.keys());
  if (want) tracks.add(want);
  for (const t of tracks) {
    const src = want === t ? source(t) : null;
    const max = Math.min(1, src?.vol ?? BASE[t] ?? BASE_OTHER);
    const target = soundOn && src ? max * duck : 0;
    const a = src ? player(t, src.url) : players.get(t);
    if (!a) continue;
    if (target > 0 && a.paused) void a.play().catch(() => { /* браузер ещё не разрешил звук */ });
    const d = target - a.volume;
    const k = (max * 50) / FADE_MS;
    if (Math.abs(d) > 0.005) {
      a.volume = Math.max(0, Math.min(1, a.volume + Math.sign(d) * Math.min(Math.abs(d), k)));
      busy = true;
    } else {
      a.volume = target;
      if (target === 0 && !a.paused) a.pause();
    }
  }
  if (!busy && timer) { clearInterval(timer); timer = null; }
}

/** есть ли у трека музыка (свой файл или стандартный) */
export function hasMusic(t: Track) {
  return !!source(t);
}

/** какой трек должен звучать (null — тишина); quiet — приглушить (идёт вопрос под музыку карты/дуэли) */
export function setMusic(track: Track | null, quiet = false) {
  const nd = quiet ? 0.45 : 1;
  if (track === want && nd === duck && !timer) {
    // громкость могли поменять кнопкой звука — проверим ещё раз
    step();
    return;
  }
  want = track;
  duck = nd;
  timer ??= setInterval(step, 50);
}

/** пересчитать громкость (например, после кнопки звука) */
export function refreshMusic() {
  timer ??= setInterval(step, 50);
}

// поменяли назначения в админке — подхватываем новый файл/громкость
onSoundsChange(refreshMusic);
