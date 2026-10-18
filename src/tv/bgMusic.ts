// Фоновая музыка ТВ: music/map.mp3 (карта) и music/duel.mp3 (дуэль) из папки music/ в корне
// проекта — локальные файлы, в git не попадают. Переключение — плавным перекрёстным затуханием.
// Нет файла — просто тишина.
import { soundOn } from '../shared/sound';

export type Track = 'map' | 'duel';

const VOLUME: Record<Track, number> = { map: 0.35, duel: 0.45 };
const FADE_MS = 1200;

const players = new Map<Track, HTMLAudioElement>();
let want: Track | null = null;
let duck = 1;
let timer: ReturnType<typeof setInterval> | null = null;

function player(t: Track) {
  let a = players.get(t);
  if (!a) {
    a = new Audio(`music/${t}.mp3`);
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
  for (const t of ['map', 'duel'] as Track[]) {
    const target = soundOn && want === t ? VOLUME[t] * duck : 0;
    const a = target > 0 ? player(t) : players.get(t);
    if (!a) continue;
    if (target > 0 && a.paused) void a.play().catch(() => { /* браузер ещё не разрешил звук */ });
    const d = target - a.volume;
    const k = (VOLUME[t] * 50) / FADE_MS;
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

/** какой трек должен звучать (null — тишина); quiet — приглушить (идёт вопрос) */
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
