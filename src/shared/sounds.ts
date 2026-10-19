// Свои звуки на события и интро. Файлы лежат в папке sounds/ на компьютере ТВ (в git не попадают),
// что на что назначено — в sounds/sounds.json; всё это раздаёт локальный сервер (devserver/media.ts).
// Назначает ведущий в админке (вкладки «Звуки» и «Интро»). Нет своего файла — играет встроенный
// 8-битный звук (если он у события есть). На телефонах (GitHub Pages) списка нет — там всегда 8 бит.
import { audio, sfx, soundOn } from './sound';
import { GROUP_GAMES, SOLO_GAMES } from './settings';
import { PREFS } from '../map/mapData';
import type { GroupGameId, SoloGameId } from './types';
import { now } from './util';

export interface SoundCfg {
  /** имя файла в sounds/; пусто — встроенный звук */
  file?: string;
  /** громкость 0…1.5, по умолчанию 1 */
  vol?: number;
  /** true — на это событие тишина (даже встроенного звука нет) */
  mute?: boolean;
}
export type SoundMap = Record<string, SoundCfg>;

export interface SoundEvent {
  id: string;
  name: string;
  /** когда звучит — понятным языком */
  when: string;
  /** встроенный 8-битный звук; нет — событие пока молчит */
  synth?: () => void;
}
export interface SoundGroup { id: string; name: string; note?: string; events: SoundEvent[] }

/** все события, которые звучат на ТВ. id — постоянные: по ним хранятся назначения */
export const SOUND_GROUPS: SoundGroup[] = [
  {
    id: 'game', name: 'Игра и ходы', events: [
      { id: 'join', name: 'Игрок подключился', when: 'В лобби, когда новый игрок заходит с телефона', synth: sfx.join },
      { id: 'banner', name: 'Объявление на экране', when: 'Большая плашка по центру: «Калибровка», «Высадка», начало круга и т. п.' },
      { id: 'land', name: 'Высадка на карту', when: 'Игрок выбрал префектуру высадки в начале игры', synth: sfx.land },
      { id: 'turnStart', name: 'Начало хода', when: 'Плашка «Ход: Имя» — камера наезжает на игрока' },
      { id: 'moving', name: 'Фишка пошла', when: 'Игрок выбрал, куда идти, фишка поехала по стрелке' },
      { id: 'arrive', name: 'Фишка пришла', when: 'Фишка встала в новую префектуру (облачко на карте)', synth: sfx.land },
      { id: 'extraTurn', name: 'Доп. ход', when: 'У игрока бонус «доп. ход» — он решает, ходить ли ещё раз' },
      { id: 'end', name: 'Конец игры', when: 'Финальный экран с итогами' },
    ],
  },
  {
    id: 'question', name: 'Вопросы', events: [
      { id: 'question', name: 'Новый вопрос', when: 'Вопрос появился на экране', synth: sfx.question },
      { id: 'answered', name: 'Кто-то ответил', when: 'Игрок нажал ответ на телефоне (и сдал работу в групповой игре)', synth: sfx.answered },
      { id: 'reveal', name: 'Правильный ответ', when: 'Открывается правильный ответ', synth: sfx.reveal },
      { id: 'bonus', name: 'Выбор бонуса', when: 'Перед вопросом игроки выбирают бонус (50/50 и т. п.)' },
    ],
  },
  {
    id: 'reward', name: 'Награды и магазин', events: [
      { id: 'reward', name: 'Награда', when: 'Игрок получил йены / звёзды / бонус (всплывашка награды)', synth: sfx.coin },
      { id: 'prize', name: 'Приз / победа', when: 'Главный приз префектуры, итоги групповой игры, выигрыш в призовой машине (+ конфетти)', synth: sfx.fanfare },
      { id: 'shop', name: 'Магазин', when: 'Игрок подошёл к магазину' },
    ],
  },
  {
    id: 'duel', name: 'Дуэль', events: [
      { id: 'duel', name: 'Начало дуэли', when: 'Игрок пришёл туда, где уже кто-то стоит', synth: sfx.duel },
      { id: 'duelPick', name: 'Выбор темы дуэли', when: 'Нападающий выбирает тему вопроса' },
      { id: 'hit', name: 'Удар', when: 'Игрок получил урон (полоска силы уменьшилась)', synth: sfx.hit },
      { id: 'duelResult', name: 'Итог дуэли', when: 'Экран результата дуэли' },
    ],
  },
  {
    id: 'group', name: 'Групповые игры', note: 'Интро каждой игры — на вкладке «Интро».', events: [
      { id: 'groupGo', name: 'Старт работы', when: 'Свиток свернулся — все начали рисовать / сочинять / резать' },
      { id: 'groupShow', name: 'Показ работы', when: 'Каждая следующая работа на экране (каллиграфия, фукуварай, сэнрю)' },
      { id: 'groupVote', name: 'Голосование', when: 'Галерея работ — все голосуют' },
      { id: 'iaiSignal', name: 'Иайдо: сигнал «!»', when: 'Вспыхнул сигнал — пора рубить. Свой файл тоже звучит точно в момент сигнала (без своего — встроенный «кин!»)' },
      { id: 'iaiDecoy', name: 'Иайдо: ложный «?»', when: 'Ложная тревога (без своего файла — встроенный стук бамбука)' },
      { id: 'iaiCut', name: 'Иайдо: удар', when: 'Кто-то первым срубил', synth: sfx.slash },
      { id: 'iaiEarly', name: 'Иайдо: фальстарт', when: 'Игрок нажал раньше сигнала', synth: sfx.early },
      { id: 'chop', name: 'Сашими: разрез', when: 'Игрок отрезал кусок рыбы', synth: sfx.chop },
      { id: 'dragonOut', name: 'Джа-одори: сбился', when: 'Игрок сбился с ритма и выбыл', synth: sfx.stumble },
    ],
  },
  {
    id: 'solo', name: 'Соло-игры (окошки на ТВ)', note: 'Звуки на самих телефонах (шарики пачинко, стакан чо-хан) остаются 8-битными — телефоны берут игру с GitHub, файлов там нет. Интро соло-игр — на вкладке «Интро».', events: [
      { id: 'soloWin', name: 'Выигрыш в соло-игре', when: 'В окошке на ТВ: выигрыш в пачинко, чо-хан, кольце, решённое судоку', synth: sfx.coin },
      { id: 'soloJackpot', name: 'Джекпот пачинко', when: 'Шарик попал в джекпот', synth: sfx.jackpot },
    ],
  },
  {
    id: 'misc', name: 'Прочее', events: [
      { id: 'pause', name: 'Пауза', when: 'Ведущий поставил игру на паузу (клавиша P)' },
    ],
  },
];

export const SOUND_EVENTS: Record<string, SoundEvent> = Object.fromEntries(SOUND_GROUPS.flatMap((g) => g.events.map((e) => [e.id, e])));

/** интро: префектура (первый приход), групповая игра (свиток), соло-игра (открылось окошко на ТВ) */
export type IntroKind = 'pref' | 'group' | 'solo';
export const introId = (k: IntroKind, id: string | number) => `${k}:${id}`;
export const INTRO_LIST: { kind: IntroKind; id: string; name: string; sub: string }[] = [
  ...PREFS.map((p) => ({ kind: 'pref' as const, id: String(p.code), name: p.ru, sub: p.ja })),
  ...(Object.keys(GROUP_GAMES) as GroupGameId[]).map((g) => ({ kind: 'group' as const, id: g, name: GROUP_GAMES[g].name, sub: GROUP_GAMES[g].ja })),
  ...(Object.keys(SOLO_GAMES) as SoloGameId[]).map((g) => ({ kind: 'solo' as const, id: g, name: SOLO_GAMES[g].name, sub: '' })),
];

// ───────── назначения ─────────

let map: SoundMap = {};
let loaded = false;
const subs = new Set<() => void>();
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bg-sounds') : null;
chan?.addEventListener('message', () => void loadSounds());

export function soundMap() { return map; }
export function onSoundsChange(cb: () => void) {
  subs.add(cb);
  if (!loaded) void loadSounds();
  return () => { subs.delete(cb); };
}

/** перечитать sounds/sounds.json (нет локального сервера — пустые назначения) */
export async function loadSounds() {
  try {
    const r = await fetch('sounds-config.json', { cache: 'no-store' });
    map = r.ok ? await r.json() : {};
  } catch { map = {}; }
  loaded = true;
  for (const c of map ? Object.values(map) : []) if (c.file) void buffer(c.file);
  subs.forEach((c) => c());
}

export async function saveSounds(next: SoundMap) {
  const clean: SoundMap = {};
  for (const [k, v] of Object.entries(next)) if (v.file || v.mute || (v.vol != null && v.vol !== 1)) clean[k] = v;
  const r = await fetch('sounds-config.json', { method: 'POST', body: JSON.stringify(clean) });
  if (!r.ok) throw new Error('Не удалось сохранить: страница открыта не с локального сервера?');
  map = clean;
  subs.forEach((c) => c());
  chan?.postMessage('changed'); // открытый ТВ в этом же браузере перечитает сразу
}

/** файлы в папке sounds/; null — локального сервера нет */
export async function listSoundFiles(): Promise<string[] | null> {
  try {
    const r = await fetch('sounds-list.json', { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function uploadSound(f: File): Promise<string> {
  const r = await fetch('sounds-upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? 'Не удалось загрузить файл');
  return j.name;
}

// ───────── проигрывание ─────────

const buffers = new Map<string, Promise<AudioBuffer | null>>();
const soundUrl = (file: string) => 'sounds/' + file.split('/').map(encodeURIComponent).join('/');

function buffer(file: string) {
  let b = buffers.get(file);
  if (!b) {
    b = fetch(soundUrl(file))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((ab) => audio().decodeAudioData(ab))
      .catch(() => { buffers.delete(file); return null; });
    buffers.set(file, b);
  }
  return b;
}

/** играющие сейчас файлы — чтобы предпросмотр в админке можно было остановить */
const playing = new Set<AudioBufferSourceNode>();
export function stopAllSounds() {
  playing.forEach((s) => { try { s.stop(); } catch { /* уже закончился */ } });
  playing.clear();
}

/** сыграть файл; at — время хоста (для точных сигналов), иначе сразу. Вернёт узел — чтобы узнать, когда доиграл */
export async function playFile(file: string, vol = 1, at?: number): Promise<AudioBufferSourceNode | undefined> {
  if (!soundOn) return;
  const b = await buffer(file);
  if (!b) return;
  const a = audio();
  const src = a.createBufferSource();
  src.buffer = b;
  const g = a.createGain();
  g.gain.value = Math.max(0, Math.min(1.5, vol));
  src.connect(g).connect(a.destination);
  const outLat = ((a as any).outputLatency ?? 0) + (a.baseLatency ?? 0);
  const when = at != null ? Math.max(0, (at - now()) / 1000 - outLat) : 0;
  src.addEventListener('ended', () => playing.delete(src));
  playing.add(src);
  src.start(a.currentTime + when);
  return src;
}

/** подпись события или интро по id — для «где уже стоит этот файл» */
export function soundLabel(id: string) {
  if (SOUND_EVENTS[id]) return SOUND_EVENTS[id].name;
  const [k, x] = id.split(':');
  const it = INTRO_LIST.find((i) => i.kind === k && i.id === x);
  return it ? `Интро: ${it.name}` : id;
}

/** есть ли у события свой файл (или оно выключено) — тогда встроенный звук не нужен */
export function hasCustom(id: string) {
  const c = map[id];
  return !!(c?.file || c?.mute);
}

/** звук события: свой файл → встроенный 8-битный → тишина */
export function playSound(id: string, at?: number) {
  const c = map[id];
  if (c?.mute) return;
  if (c?.file) return void playFile(c.file, c.vol ?? 1, at);
  SOUND_EVENTS[id]?.synth?.();
}
