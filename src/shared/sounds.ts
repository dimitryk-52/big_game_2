// Свои звуки на события и интро. Файлы лежат в папке sounds/ на компьютере ТВ (в git не попадают),
// что на что назначено — в sounds/sounds.json; всё это раздаёт локальный сервер (devserver/media.ts).
// Назначает ведущий в админке (вкладки «Звуки» и «Интро»). Нет своего файла — играет встроенный
// 8-битный звук (если он у события есть). На телефонах (GitHub Pages) списка нет — там всегда 8 бит.
import { audio, sfx, soundOn } from './sound';
import { GROUP_GAMES, SOLO_GAMES } from './settings';
import { OKINAWA, PREF, PREFS } from '../map/mapData';
import type { GroupGameId, SoloGameId } from './types';
import { now } from './util';
import { TRACKS, type TrackKind } from './race';

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
  /** без своего файла играет другое событие — подпись для админки */
  fallback?: string;
  /** какое событие играет вместо него (для прослушки в админке; по умолчанию «Приз / победа») */
  fallbackTo?: string;
  /** подложка (длинный звук под действием), а не короткий fx */
  bed?: boolean;
}
export interface SoundGroup { id: string; name: string; note?: string; events: SoundEvent[] }

/** групповые игры с таймером на работу (у иайдо и джа-одори его нет) */
export const GROUP_TIMED: GroupGameId[] = ['calligraphy', 'fukuwarai', 'senryu', 'sashimi', 'noodles', 'cherry'];
export const groupEndId = (g: GroupGameId) => `groupEnd:${g}`;
export const groupTableId = (g: GroupGameId) => `groupTable:${g}`;

/** все события, которые звучат на ТВ. id — постоянные: по ним хранятся назначения */
export const SOUND_GROUPS: SoundGroup[] = [
  {
    id: 'start', name: 'Начало игры', note: 'Музыка интро, тропы и калибровки — внизу, в «Фоновой музыке».', events: [
      { id: 'introSting', name: 'Интро: вылет логотипа', when: 'Ведущий нажал «Далее: интро» — логотип вылетает на экран. Песня интро начнётся, когда этот звук доиграет', synth: sfx.fanfare },
      { id: 'count3', name: 'Отсчёт: «3»', when: 'Ведущий нажал «Начать игру» — на экране «3»', synth: sfx.click },
      { id: 'count2', name: 'Отсчёт: «2»', when: 'Через секунду — «2»', synth: sfx.click },
      { id: 'count1', name: 'Отсчёт: «1»', when: 'Ещё через секунду — «1»', synth: sfx.click },
      { id: 'toMap', name: 'Переход на карту', when: 'Белая вспышка после «1» — открывается карта', synth: sfx.reveal },
    ],
  },
  {
    id: 'game', name: 'Игра и ходы', events: [
      { id: 'join', name: 'Игрок подключился', when: 'В лобби, когда новый игрок заходит с телефона', synth: sfx.join },
      { id: 'banner', name: 'Объявление на экране', when: 'Большая плашка по центру: «Калибровка», «Высадка», начало круга и т. п.' },
      { id: 'land', name: 'Высадка на карту', when: 'Игрок выбрал префектуру высадки в начале игры', synth: sfx.land },
      { id: 'turnStart', name: 'Начало хода', when: 'Плашка «Ход: Имя» — камера наезжает на игрока' },
      { id: 'moving', name: 'Фишка пошла', when: 'Игрок выбрал, куда идти, фишка поехала по стрелке' },
      { id: 'cat', name: 'Кошка', when: 'Первый игрок на Окинаве получил ириомотейскую кошку; кошку переманили кусочком сашими', synth: sfx.meow },
      { id: 'sumo:start', name: 'Сумо: начало', when: 'Финальная схватка начинается', synth: sfx.duel },
      { id: 'sumo:push', name: 'Сумо: толчок', when: 'После вопроса кого-то отодвинули к краю', synth: sfx.stamp },
      { id: 'sumo:out', name: 'Сумо: вылетел', when: 'Сумоиста вытолкнули за круг', synth: sfx.stumble },
      { id: 'sumo:win', name: 'Сумо: ёкодзуна', when: 'На дохё остался один', synth: sfx.fanfare },
      { id: 'kaiju:stomp', name: 'Годзилла: сломал дом', when: 'Годзилла наступил на целый дом', synth: sfx.stamp },
      { id: 'kaiju:fire', name: 'Годзилла: выстрел', when: 'Охотник выпустил снаряд', synth: sfx.step },
      { id: 'kaiju:boom', name: 'Годзилла: мимо', when: 'Снаряд упал, но не попал', synth: sfx.chop },
      { id: 'kaiju:hit', name: 'Годзилла: попадание', when: 'Снаряд попал в Годзиллу', synth: sfx.hit },
      { id: 'kaiju:down', name: 'Годзилла повержен', when: 'У Годзиллы кончились жизни', synth: sfx.fanfare },
      { id: 'kaiju:win', name: 'Годзилла ушёл', when: 'Время вышло, Годзилла выжил', synth: sfx.stumble },
      { id: 'lure', name: 'Акиту переманили', when: 'Игрок потратил корм — акита-ину убежала к нему', synth: sfx.woof },
      { id: 'akita', name: 'Акита не пускает', when: 'Игрок пришёл к хозяину акиты — собака кусает и прогоняет', synth: sfx.woof },
      { id: 'rail', name: 'Синкансэн', when: 'Игрок поехал по билету на синкансэн', synth: sfx.rail },
      { id: 'challenge', name: 'Свиток-вызов', when: 'Игрок отправил свиток-вызов — свиток летит через карту к сопернику', synth: sfx.challenge },
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
      { id: 'coinToss', name: 'Монетка в дуэли', when: 'Игрок бросил монетку (+урон) на вопрос дуэли', synth: sfx.coinToss },
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
    id: 'cars', name: 'Машины и гонка', note: 'Музыка самой гонки — внизу, в «Фоновой музыке». Итог гонки звучит как «Итог дуэли».', events: [
      { id: 'carBuy', name: 'Купил машину', when: 'Игрок купил машину в автосалоне', synth: sfx.coin },
      { id: 'carLost', name: 'Машины не стало', when: 'Проигравший дуэль остался без машины (авария, эвакуатор, тануки…)', synth: sfx.wrong },
      { id: 'raceIntro', name: 'Гонка: объявление', when: 'Плашка «ГОНКА!» — встретились две машины', fallback: 'как «Объявление на экране»', fallbackTo: 'banner' },
      { id: 'raceTrack', name: 'Гонка: трасса', when: 'На ТВ появилась схема трассы, до старта ~6 c', fallback: 'как «Гонка: объявление»', fallbackTo: 'raceIntro' },
      { id: 'raceLight', name: 'Гонка: светофор', when: 'Каждый из трёх огней перед стартом (3 — 2 — 1)', synth: sfx.click },
      { id: 'raceGo', name: 'Гонка: старт!', when: 'Зелёный — «СТАРТ!»', synth: () => { sfx.click(); setTimeout(sfx.answered, 80); } },
      { id: 'raceFinish', name: 'Гонка: финиш', when: 'Игрок пересёк финиш (звучит на каждого)', synth: sfx.fanfare },
    ],
  },
  {
    id: 'group', name: 'Групповые игры', note: 'Интро каждой игры — на вкладке «Интро».', events: [
      { id: 'groupGo', name: 'Старт работы', when: 'Свиток свернулся — все начали рисовать / сочинять / резать' },
      { id: 'groupShow', name: 'Показ работы', when: 'Каждая следующая работа на экране (каллиграфия, фукуварай, сэнрю)' },
      { id: 'groupVote', name: 'Голосование', when: 'Галерея работ — все голосуют' },
      { id: 'iaiTension', bed: true, name: 'Иайдо: нагнетание', when: 'Один раз в начале каждого раунда (например, кабуки). «!» не вспыхнет, пока файл не доиграет до конца, потом — через случайные 1–5 c. Нет файла — как раньше: сигнал через 2–7 c' },
      { id: 'iaiSignal', name: 'Иайдо: сигнал «!»', when: 'Вспыхнул сигнал — пора рубить. Свой файл тоже звучит точно в момент сигнала (без своего — встроенный «кин!»)' },
      { id: 'iaiDecoy', name: 'Иайдо: ложный «?»', when: 'Ложная тревога (без своего файла — встроенный стук бамбука)' },
      { id: 'iaiCut', name: 'Иайдо: удар', when: 'Кто-то первым срубил', synth: sfx.slash },
      { id: 'iaiEarly', name: 'Иайдо: фальстарт', when: 'Игрок нажал раньше сигнала', synth: sfx.early },
      { id: 'chop', name: 'Сашими: разрез', when: 'Игрок отрезал кусок рыбы', synth: sfx.chop },
      { id: 'noodleBurst', name: 'Лапша: лопнул', when: 'Игрок съел больше своего предела', synth: sfx.stumble },
      { id: 'pit', name: 'Косточки: плевок', when: 'Игрок плюнул косточкой', synth: sfx.slash },
      { id: 'dragonOut', name: 'Джа-одори: сбился', when: 'Игрок сбился с ритма и выбыл', synth: sfx.stumble },
    ],
  },
  {
    id: 'groupEach', name: 'Групповые игры: конец времени и таблица',
    note: 'Без своего файла у конца времени — тишина, у таблицы — звук «Приз / победа».', events: (Object.keys(GROUP_GAMES) as GroupGameId[]).flatMap((g) => [
      ...(GROUP_TIMED.includes(g) ? [{ id: groupEndId(g), name: `${GROUP_GAMES[g].name}: время вышло`, when: 'Таймер дошёл до нуля (или все сдали раньше)' }] : []),
      { id: groupTableId(g), name: `${GROUP_GAMES[g].name}: таблица итогов`, when: 'На ТВ показали места и награды', fallback: 'как «Приз / победа»' },
    ]),
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

/** звуки на телефонах: всегда встроенные 8-битные — телефоны берут игру с GitHub Pages, файлы туда не качаются */
export const PHONE_SOUNDS: { name: string; when: string; synth: () => void }[] = [
  { name: 'Пачинко: шарик', when: 'Запуск каждого шарика', synth: sfx.pachi },
  { name: 'Пачинко: шарик в лунке', when: 'Шарик попал в лунку; ещё — покупка шариков', synth: sfx.coin },
  { name: 'Пачинко: джекпот', when: 'Барабаны сошлись', synth: sfx.jackpot },
  { name: 'Чо-хан: стакан', when: 'Трясут стакан с костями', synth: sfx.rattle },
  { name: 'Чо-хан: кости легли', when: 'Можно ставить', synth: sfx.click },
  { name: 'Чо-хан: выигрыш / проигрыш', when: 'Угадал (джекпот) или нет', synth: () => { sfx.jackpot(); setTimeout(sfx.wrong, 900); } },
  { name: 'Призовая машина: старт', when: 'Кольцо запущено', synth: sfx.click },
  { name: 'Призовая машина: итог', when: 'Мимо / выигрыш / большой выигрыш', synth: () => { sfx.wrong(); setTimeout(sfx.jackpot, 700); setTimeout(sfx.fanfare, 1700); } },
  { name: 'Судоку: решено', when: 'Решённое судоку принято', synth: sfx.jackpot },
  { name: 'Магазин: покупка', when: 'Игрок купил бонус', synth: sfx.coin },
  { name: 'Сашими: разрез', when: 'Игрок отрезал кусок на своём телефоне', synth: sfx.chop },
  { name: 'Гонка: отбойник', when: 'Не вписался в поворот на своём телефоне', synth: sfx.wrong },
];

export const SOUND_EVENTS: Record<string, SoundEvent> = Object.fromEntries(SOUND_GROUPS.flatMap((g) => g.events.map((e) => [e.id, e])));

/** интро: префектура (первый приход), групповая игра (свиток), соло-игра (открылось окошко на ТВ) */
export type IntroKind = 'pref' | 'group' | 'solo';
export const introId = (k: IntroKind, id: string | number) => `${k}:${id}`;
export const INTRO_LIST: { kind: IntroKind; id: string; name: string; sub: string }[] = [
  // Окинавы нет в PREFS (её нет на карте), но интро у неё есть — добавляем отдельно
  ...[...PREFS, PREF[OKINAWA]].map((p) => ({ kind: 'pref' as const, id: String(p.code), name: p.ru, sub: p.ja })),
  ...(Object.keys(GROUP_GAMES) as GroupGameId[]).map((g) => ({ kind: 'group' as const, id: g, name: GROUP_GAMES[g].name, sub: GROUP_GAMES[g].ja })),
  ...(Object.keys(SOLO_GAMES) as SoloGameId[]).map((g) => ({ kind: 'solo' as const, id: g, name: SOLO_GAMES[g].name, sub: '' })),
];

/** фоновая музыка ТВ (идёт по кругу, переключается плавно). У карты и дуэли без своего файла —
 *  music/map.mp3 и music/duel.mp3; у остальных без файла — тишина (как раньше) */
export const musicId = (k: string) => `music:${k}`;
export const MUSIC_LIST: { id: string; name: string; when: string; dflt?: string }[] = [
  { id: musicId('intro'), name: 'Интро', when: 'После вылета логотипа (когда доиграет звук «Интро: вылет логотипа»); дальше — на тропе, если у тропы нет своей' },
  { id: musicId('lobby'), name: 'Тропа (лобби)', when: 'Экран с QR, пока игроки заходят. Нет файла — продолжает играть песня интро' },
  { id: musicId('calib'), name: 'Калибровка', when: 'От вспышки после отсчёта до конца калибровки. Нет файла — как обычно (карта / вопросы)' },
  { id: musicId('map'), name: 'Карта', when: 'Всю игру, пока видна карта', dflt: 'music/map.mp3' },
  { id: musicId('duel'), name: 'Дуэль', when: 'Вся дуэль: выбор темы, вопросы, итог', dflt: 'music/duel.mp3' },
  { id: musicId('race'), name: 'Гонка', when: 'Вся гонка, от плашки «ГОНКА!» до финиша. Нет файла — музыка дуэли' },
  ...(Object.keys(TRACKS) as TrackKind[]).map((k) => ({ id: musicId('race:' + k), name: `Гонка: ${TRACKS[k].name}`, when: `Только на этой трассе (${TRACKS[k].sub}). Нет файла — общая музыка гонки` })),
  { id: musicId('sumo'), name: 'Финальное сумо', when: 'Вся финальная схватка (нет файла — музыка вопросов и дуэлей по обычным правилам)' },
  { id: musicId('question'), name: 'Обычные вопросы', when: 'Вопросы префектур, калибровки, Окинавы (кроме вопросов с аудио/видео)' },
  ...(Object.keys(GROUP_GAMES) as GroupGameId[]).map((g) => ({
    id: musicId('group:' + g), name: GROUP_GAMES[g].name,
    when: g === 'iaido' ? 'После свитка; во время ожидания сигнала — тишина' : g === 'dragon' ? 'Правила и итоги; во время шествия — тишина (свои барабаны)' : 'После свитка — пока работают, смотрят и голосуют',
  })),
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
  for (const [k, c] of map ? Object.entries(map) : []) if (c.file && !k.startsWith('music:')) void buffer(c.file); // музыку играет <audio>, не декодируем
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

/** адрес файла из sounds/ — для <audio> */
export const soundUrl = (file: string) => 'sounds/' + file.split('/').map(encodeURIComponent).join('/');

const buffers = new Map<string, Promise<AudioBuffer | null>>();
/** длины уже загруженных файлов, мс */
const durations = new Map<string, number>();

function buffer(file: string) {
  let b = buffers.get(file);
  if (!b) {
    b = fetch(soundUrl(file))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((ab) => audio().decodeAudioData(ab))
      .then((d) => { durations.set(file, d.duration * 1000); return d; })
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
  const mu = MUSIC_LIST.find((m) => m.id === id);
  if (mu) return `Музыка: ${mu.name}`;
  const [k, x] = id.split(':');
  const it = INTRO_LIST.find((i) => i.kind === k && i.id === x);
  return it ? `Интро: ${it.name}` : id;
}

/** есть ли у события свой файл (или оно выключено) — тогда встроенный звук не нужен */
export function hasCustom(id: string) {
  const c = map[id];
  return !!(c?.file || c?.mute);
}

/** длина своего файла события, мс; 0 — файла нет (или он ещё не загрузился) */
export function soundMs(id: string) {
  const c = map[id];
  return c?.file && !c.mute ? Math.round(durations.get(c.file) ?? 0) : 0;
}

/** звук события: свой файл → встроенный 8-битный → тишина */
export function playSound(id: string, at?: number) {
  const c = map[id];
  if (c?.mute) return;
  if (c?.file) return void playFile(c.file, c.vol ?? 1, at);
  SOUND_EVENTS[id]?.synth?.();
}
