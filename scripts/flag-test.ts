// Проверка логики флаговых вопросов и очереди вопросов префектуры: npx tsx scripts/flag-test.ts
import { GameEngine } from '../src/host/engine';
import { DEFAULT_SETTINGS } from '../src/shared/settings';
import type { Question } from '../src/shared/types';

const flagQ = (code: number, extra: Partial<Question> = {}): Question => ({ id: 'flag' + code, kind: 'flag', text: '', answers: [], correct: 0, topic: 'geo', pref: code, mode: 'cycle', ...extra });
const plain = (id: string, pref: number, extra: Partial<Question> = {}): Question => ({ id, text: id, answers: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }], correct: 0, topic: 'general', pref, ...extra });

const qs = [plain('second', 13, { order: 1 }), plain('prize', 13, { order: 0, prize: 1 }), flagQ(13, { order: 2 }), flagQ(27)];
const eng: any = new GameEngine({ now: () => Date.now(), broadcast: () => {}, save: () => {} }, 'T', structuredClone(DEFAULT_SETTINGS), qs);

let fail = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fail++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

ok(eng.prefQueue(13).map((q: Question) => q.id).join() === 'prize,second,flag13', 'очередь Токио по порядку');
ok(!eng.pickQuestion((q: Question) => q.pref === 13 && q.prize), 'призовой не попадает в общие вопросы');

// флаг: 3 неверных, выбранный неверный больше не показывается, остальные остаются
const a = eng.buildFlagQuestion(flagQ(27));
ok(a.flagOpts.length === 4 && a.flagOpts.includes(27) && a.flagOpts[a.correct] === 27, 'флаг: 4 варианта, правильный на месте');
const wrong = a.flagOpts.find((c: number) => c !== 27);
eng.sec.flags.flag27.banned.push(wrong);
const keep = a.flagOpts.filter((c: number) => c !== 27 && c !== wrong);
const b = eng.buildFlagQuestion(flagQ(27));
ok(!b.flagOpts.includes(wrong), 'выбранный неверный не показывается');
ok(keep.every((c: number) => b.flagOpts.includes(c)), 'невыбранные неверные остаются');

// угаданные флаги не показываются
eng.sec.flagSolved = [1, 2, 3, 4, 5];
for (let i = 0; i < 20; i++) {
  delete eng.sec.flags.flag27;
  const c = eng.buildFlagQuestion(flagQ(27));
  if (c.flagOpts.some((x: number) => [1, 2, 3, 4, 5].includes(x))) { ok(false, 'угаданный флаг показан'); break; }
}
ok(true, 'угаданные флаги не показываются (20 попыток)');

// мало вариантов: все угаданы, кроме 2 → добираем самыми первыми угаданными
const all = Array.from({ length: 47 }, (_, i) => i + 1).filter((c) => c !== 27);
eng.sec.flagSolved = all.slice(0, all.length - 1); // свободен один
delete eng.sec.flags.flag27;
const d = eng.buildFlagQuestion(flagQ(27));
const dec = d.flagOpts.filter((c: number) => c !== 27).sort((x: number, y: number) => x - y);
ok(dec.includes(all[all.length - 1]) && dec.includes(all[0]) && dec.includes(all[1]), 'мало вариантов — берём первые угаданные: ' + dec.join(','));

console.log(fail ? `\n${fail} FAIL` : '\nвсё ок');
process.exit(fail ? 1 : 0);
