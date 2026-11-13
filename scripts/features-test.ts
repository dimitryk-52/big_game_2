// Проверка новых режимов на ботах без браузера: tsx scripts/features-test.ts
// Годзилла (все получают деньги), финальное сумо (первый круг без вылетов, места, награды), кошка (Окинава, лапа, сашими).
import { GameEngine } from '../src/host/engine';
import { DEFAULT_SETTINGS, catTopicOf } from '../src/shared/settings';
import { SEED_QUESTIONS } from '../src/shared/seedQuestions';

const SPEED = 40;
const realST = globalThis.setTimeout;
const t0 = Date.now();
(globalThis as any).setTimeout = (fn: any, ms = 0, ...a: any[]) => realST(fn, ms / SPEED, ...a);
const now = () => t0 + (Date.now() - t0) * SPEED;
const wait = (ms: number) => new Promise<void>((r) => realST(r, ms / SPEED));

const settings = structuredClone(DEFAULT_SETTINGS);
settings.hostPaced = false;
settings.calibRounds = 1;
settings.groupPrefs = {};
settings.shopPrefs = [];
settings.topics.push({ id: 'bio', name: 'Биология', combat: true, color: '#3ddc97' });
const qs = [...SEED_QUESTIONS, ...Array.from({ length: 6 }, (_, i) => ({ id: 'bio' + i, topic: 'bio', text: 'Био ' + i, answers: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }], correct: i % 4 }))];
const fx: string[] = [];
const eng = new GameEngine({ now, broadcast: () => {}, save: () => {}, fx: (k: string, d: any) => { if (k === 'kaiju' || k === 'sumo') fx.push(k + ':' + d?.kind); } }, 'TEST', settings, qs as any);
eng.start();
for (let i = 0; i < 7; i++) eng.addBot();

let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name} ${extra}`); if (!cond) fails++; };
const until = async (cond: () => boolean, maxMs: number) => { const end = now() + maxMs; while (!cond() && now() < end) await wait(200); return cond(); };

(async () => {
  eng.onCtl('start');
  ok('дошли до ходов', await until(() => eng.s.phase === 'turns' && eng.s.stage.t === 'move', 30 * 60000));
  const P = () => Object.values(eng.s.players);

  // ── Годзилла ──
  const yen0 = Object.fromEntries(P().map((p) => [p.id, p.yen]));
  eng.onCtl('groupTest', { pref: 13, game: 'godzilla' });
  ok('Годзилла началась', await until(() => !!eng.s.kj, 5000));
  const k = eng.s.kj!;
  ok('Годзилла: 1 против 6', k.hunters.length === 6 && !k.hunters.includes(k.zilla));
  ok('Годзилла: итоги', await until(() => eng.s.kj?.phase === 'results', 120000), `hp ${k.hp}/${k.maxHp}, домов ${k.stomped}, попаданий ${Object.values(k.hits).reduce((a, b) => a + b, 0)}`);
  ok('Годзилла: деньги получили все', P().every((p) => p.yen > yen0[p.id]));
  ok('Годзилла: звезда по правилам', k.hp > 0 ? k.stars!.join() === k.zilla : !k.stars!.includes(k.zilla));
  ok('Годзилла: были выстрелы и шаги', fx.includes('kaiju:fire') && (fx.includes('kaiju:stomp') || fx.includes('kaiju:step')));
  await until(() => !eng.s.kj, 30000);

  // ── кошка ──
  await until(() => eng.s.stage.t === 'move', 60000);
  const a = P()[0];
  a.cat = true;
  await (eng as any).ask((eng as any).epoch, qs.find((q) => q.id === 'bio1'), 'pref', 'тест', P().map((p) => p.id), 5).catch(() => {});
  ok('кошка: тема биологии найдена', catTopicOf(settings) === 'bio');

  // ── сумо ──
  for (const p of P()) { p.specials = 1; }
  eng.onCtl('groupTest', { game: 'sumo' });
  ok('сумо началось', await until(() => !!eng.s.sumo, 5000));
  const su = eng.s.sumo!;
  let pawSeen = false, outInGrace = false, maxCircle = 1, questions = 0, lastN = -1;
  const done = await until(() => {
    const s = eng.s.sumo;
    if (!s) return true;
    if (eng.s.q && eng.s.q.context === 'sumo') { if (eng.s.q.n !== lastN) { lastN = eng.s.q.n; questions++; } if (eng.s.q.paw?.[a.id] != null) pawSeen = true; }
    if (s.circle <= 1 && s.out.length) outInGrace = true;
    maxCircle = Math.max(maxCircle, s.circle);
    return s.phase === 'results';
  }, 4 * 3600000);
  ok('сумо: дошло до итогов', done, `кругов ${maxCircle}, вопросов ${questions}`);
  ok('сумо: в первом круге никто не вылетел', !outInGrace);
  ok('сумо: один победитель, места у всех', su.alive.length === 1 && Object.keys(su.places ?? {}).length === 7 && su.places![su.alive[0]] === 1);
  ok('сумо: первый выбывший — последнее место', su.places![su.out[0]] === 7);
  console.log('   лапа кошки в сумо показывалась:', pawSeen);
  console.log(fails ? `\nПровалено: ${fails}` : '\nВсё хорошо');
  process.exit(fails ? 1 : 0);
})();
