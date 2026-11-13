// Импорт вопросов из разобранных файлов (new.json) в базу: замена похожих, сложность старым, спец-тема «Литература».
// Запуск: node scripts/import-questions.mjs <папка с new.json> [--write]
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const dir = process.argv[2];
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter((l) => /^\s*VITE_/.test(l)).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const fresh = JSON.parse(fs.readFileSync(path.join(dir, 'new.json'), 'utf8'));
const { data, error } = await sb.from('questions').select('id,data');
if (error) throw error;
const old = data.map((r) => r.data);
const kv = await sb.from('kv').select('value').eq('key', 'settings').single();
if (kv.error) throw kv.error;
const settings = kv.data.value;
fs.writeFileSync(path.join(dir, `backup-${Date.now()}.json`), JSON.stringify({ questions: old, settings }));

// старый вопрос (id) → номер в japan-файле; число — старый удаляется, "I…" — старый (с префектурой) получает новый текст и остаётся на месте
const MAP = {
  'culture-28': 85, 'culture-18': 76, 'culture-21': 91, 'culture-22': 115, 'culture-23': 30, 'culture-19': 175, 'culture-20': 83, 'culture-24': 108, 'culture-25': 105, 'culture-26': 89, 'culture-27': 95,
  'general-80': 86, 'general-82': 21, 'general-81': 19, 'general-84': 7, 'general-85': 43,
  'general-60': 'I129', 'general-53': 'I132', 'general-54': 'I124', 'general-55': 'I125', 'general-57': 'I140', 'general-58': 'I139', 'general-56': 'I292', 'general-65': 'I137', 'general-61': 'I138', 'general-69': 'I143',
  'geo-39': 144, 'geo-32': 120, 'geo-33': 148, 'geo-34': 127, 'geo-35': 207, 'geo-37': 149, 'geo-40': 157, 'geo-42': 131, 'geo-44': 126,
  'music-10': 59, 'music-11': 63, 'music-13': 69, 'music-14': 65, 'music-6': 61, 'music-7': 58, 'music-8': 66, 'music-2': 60, 'music-3': 54, 'music-4': 71, 'music-5': 56,
  'film-01': 264, 'film-02': 260, 'film-03': 262, 'film-05': 263, 'film-08': 274, 'film-09': 269, 'film-10': 270, 'film-11': 265, 'film-12': 258,
  'games-03': 184, 'games-04': 183, 'games-07': 192, 'games-08': 193, 'games-09': 200, 'games-13': 195, 'games-14': 190,
  'sport-01': 159, 'sport-02': 168, 'sport-03': 164, 'sport-04': 167, 'sport-05': 174, 'sport-06': 170, 'sport-07': 169, 'sport-08': 158, 'sport-09': 177, 'sport-10': 160, 'sport-15': 166,
  'general-83': 278, 'culture-29': 283, 'food-01': 285, 'food-02': 289, 'food-04': 280, 'food-06': 279, 'food-07': 286, 'food-08': 291, 'food-09': 77, 'food-10': 293, 'food-11': 281, 'food-12': 302, 'food-13': 282,
  'hist-01': 209, 'hist-02': 213, 'hist-03': 230, 'hist-04': 234, 'hist-05': 212, 'hist-06': 210, 'hist-07': 211, 'hist-08': 221, 'hist-10': 219, 'hist-12': 232, 'hist-13': 214, 'geo-45': 231,
  'bio-01': 238, 'bio-06': 243, 'bio-02': 290, 'bio-03': 242, 'bio-05': 93, 'bio-07': 252, 'bio-13': 244, 'bio-15': 241,
};
// сложность оставшихся старых вопросов (оценка)
const DIFF = {
  'culture-16': 'easy', 'culture-17': 'hard', 'culture-30': 'medium',
  'geo-41': 'medium', 'geo-36': 'easy', 'geo-38': 'hard', 'geo-43': 'hard',
  'music-1': 'hard', 'music-12': 'hard', 'music-9': 'hard', 'music-15': 'medium',
  'film-04': 'easy', 'film-06': 'medium', 'film-07': 'hard', 'film-13': 'medium',
  'games-01': 'easy', 'games-02': 'easy', 'games-05': 'easy', 'games-06': 'easy', 'games-10': 'easy', 'games-11': 'easy', 'games-12': 'medium',
  'sport-11': 'easy', 'sport-12': 'easy', 'sport-13': 'easy', 'sport-14': 'hard',
  'food-03': 'easy', 'food-05': 'hard',
  'hist-09': 'medium', 'hist-11': 'medium', 'culture-31': 'medium',
  'bio-04': 'medium', 'bio-08': 'medium', 'bio-09': 'easy', 'bio-10': 'medium', 'bio-11': 'easy', 'bio-12': 'easy', 'bio-14': 'easy',
  'okinawa-46': 'easy', 'okinawa-47': 'medium', 'okinawa-48': 'hard', 'okinawa-49': 'hard', 'okinawa-50': 'medium', 'okinawa-51': 'hard', 'okinawa-52': 'easy',
  'general-70': 'medium', 'general-75': 'hard', 'general-63': 'medium', 'general-64': 'medium', 'general-76': 'hard', 'general-73': 'hard', 'general-74': 'medium', 'general-62': 'medium', 'general-66': 'easy',
  'nuj9vs5nmdk6': 'hard', 'mvefsahf8577': 'hard', 'fpzmuf2p9m52': 'hard',
  'general-59': 'medium', 'general-72': 'hard', 'general-71': 'medium', 'general-79': 'hard', 'general-68': 'hard', 'general-67': 'hard', 'general-78': 'medium', 'general-77': 'medium',
};
const KEYS = Object.keys({ ...MAP, ...DIFF });
const keyOf = (id) => KEYS.find((k) => id === k || id.endsWith('-' + k));

const byNew = new Map(fresh.map((q) => [q.id, q]));
const toQ = (n) => {
  const q = { id: n.id, text: n.text, answers: n.answers.map((t) => ({ text: t === 'Сасшими' ? 'Сашими' : t })), correct: n.correct, topic: n.topic, difficulty: n.difficulty };
  if (n.topic.startsWith('sp_')) q.special = true;
  if (n.calib) q.calib = true;
  if (n.after) q.after = n.after;
  if (n.afterPref) q.afterPref = n.afterPref;
  if (n.note) q.note = n.note;
  return q;
};
const upserts = [], deletes = [], skipNew = new Set(), log = [], seen = new Set(), moved = {};
for (const o of old) {
  const k = keyOf(o.id);
  if (!k) { if (o.kind !== 'flag' && !o.difficulty) log.push(`· без оценки сложности: ${o.id} «${o.text.slice(0, 50)}»`); continue; }
  seen.add(k);
  const m = MAP[k];
  if (m == null) { upserts.push({ ...o, difficulty: DIFF[k] }); continue; }
  const inplace = typeof m === 'string';
  const n = byNew.get('japan-' + (inplace ? m.slice(1) : m));
  if (!n) throw new Error('нет нового вопроса для ' + k);
  if (inplace) {
    const nq = toQ(n);
    upserts.push({ ...o, text: nq.text, answers: nq.answers, correct: nq.correct, difficulty: nq.difficulty });
    skipNew.add(n.id);
    moved[n.id] = o.id;
    log.push(`≈ на месте (преф. ${o.pref}): «${o.text.slice(0, 45)}» → «${n.text.slice(0, 45)}»`);
  } else {
    deletes.push(o.id);
    log.push(`✂ заменён: «${o.text.slice(0, 45)}» → ${n.id} «${n.text.slice(0, 45)}»`);
  }
}
for (const k of KEYS) if (!seen.has(k)) log.push('!! не найден в базе: ' + k);
for (const n of fresh) if (!skipNew.has(n.id)) upserts.push(toQ(n));
for (const q of upserts) {
  if (q.after && moved[q.after]) q.after = moved[q.after];
  if (q.after && !upserts.some((x) => x.id === q.after)) log.push('!! after без цели: ' + q.id + ' → ' + q.after);
}
if (!settings.topics.some((t) => t.id === 'sp_lit')) settings.topics.push({ id: 'sp_lit', name: 'Литература', color: '#c9a36b', owner: '', combat: false, special: true });
console.log(log.join('\n'));
console.log(`\nстарых: ${old.length}; удалить: ${deletes.length}; записать: ${upserts.length} (новых из файлов: ${fresh.length - skipNew.size}); итог: ${old.length - deletes.length + fresh.length - skipNew.size}`);
if (WRITE) {
  for (let i = 0; i < upserts.length; i += 100) {
    const { error } = await sb.from('questions').upsert(upserts.slice(i, i + 100).map((q) => ({ id: q.id, data: q })));
    if (error) throw error;
  }
  for (const id of deletes) {
    const { error } = await sb.from('questions').delete().eq('id', id);
    if (error) throw error;
  }
  const { error } = await sb.from('kv').upsert({ key: 'settings', value: settings });
  if (error) throw error;
  console.log('✔ записано');
} else console.log('(пробный прогон — без записи; добавь --write)');
