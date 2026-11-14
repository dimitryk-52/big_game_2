// Проверка движка без браузера: npm test
// 1) «Далее» в лобби не запускает игру; 2) удаление ходящего игрока не съедает ход следующего;
// 3) пауза останавливает таймер вопроса; 4) пустой список игроков не вешает движок.
import { GameEngine } from '../src/host/engine';
import { DEFAULT_SETTINGS } from '../src/shared/settings';
import { SEED_QUESTIONS } from '../src/shared/seedQuestions';

const SPEED = 60;
const realST = globalThis.setTimeout;
const t0 = Date.now();
(globalThis as any).setTimeout = (fn: any, ms = 0, ...a: any[]) => realST(fn, ms / SPEED, ...a);
const now = () => t0 + (Date.now() - t0) * SPEED;
const wait = (ms: number) => new Promise<void>((r) => realST(r, ms / SPEED));

const settings = structuredClone(DEFAULT_SETTINGS);
settings.hostPaced = false;
settings.calibRounds = 1;
settings.groupPrefs = {}; // без групповых игр — быстрее дойти до ходов
settings.shopPrefs = [];
// «в числе первых N»: вопрос последней боевой темы помечаем «первым», ещё один из другой темы — «среди 3 первых»
const QS = structuredClone(SEED_QUESTIONS);
const combat = settings.topics.filter((t) => t.combat);
const plain = (topic: string) => QS.find((q) => q.topic === topic && !q.pref && !q.special && q.answers?.length === 4)!;
const early1 = plain(combat[combat.length - 1].id); early1.early = 1;
const early3 = plain(combat[combat.length - 2].id); early3.early = 3;
const eng = new GameEngine({ now, broadcast: () => {}, save: () => {}, fx: () => {} }, 'TEST', settings, QS);
eng.start();
for (let i = 0; i < 4; i++) eng.addBot();

let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name} ${extra}`); if (!cond) fails++; };
const until = async (cond: () => boolean, maxMs: number) => { const end = now() + maxMs; while (!cond() && now() < end) await wait(200); return cond(); };

(async () => {
  eng.onCtl('next');
  await wait(2000);
  ok('«Далее» в лобби не запускает игру', eng.s.phase === 'lobby');
  eng.onCtl('start');
  await wait(500);
  ok('«Начать игру» запускает', eng.s.phase !== 'lobby');
  ok('после «Начать» — отсчёт 3-2-1', eng.s.stage.t === 'countdown');
  await until(() => eng.s.stage.t === 'banner', 10000);
  await wait(1500);
  ok('калибровка ждёт «Далее» ведущего', eng.s.stage.t === 'banner' && !eng.s.q);
  eng.onCtl('next');

  // пауза на вопросе калибровки
  await until(() => !!eng.s.q && !eng.s.q.revealed && eng.s.q.deadline > 0, 60000);
  const q = eng.s.q!;
  ok('вопрос «первым» прозвучал первым', q.qid === early1.id);
  const d0 = q.deadline;
  eng.onCtl('pause');
  await wait(40000); // дольше, чем время на ответ
  ok('на паузе вопрос не закрывается', eng.s.q === q && !q.revealed);
  eng.onCtl('pause');
  ok('после паузы дедлайн сдвинут', q.deadline - d0 > 35000, `(+${Math.round((q.deadline - d0) / 1000)} c)`);
  await until(() => (eng.sec.asked ?? []).length >= 3, 120000);
  ok('вопрос «среди 3 первых» — в первых трёх', (eng.sec.asked ?? []).slice(0, 3).includes(early3.id));
  // порядок ответивших: по времени нажатия, а не по приходу
  {
    await until(() => !!eng.s.q && !eng.s.q.revealed && eng.s.q.deadline > 0 && eng.s.q.startAt < now() && eng.s.q.answered.length === 0, 120000);
    const qq = eng.s.q!;
    const [p1, p2] = qq.participants;
    eng.handle({ t: 'answer', pid: p1, n: qq.n, choice: 0, at: now() } as any);
    eng.handle({ t: 'answer', pid: p2, n: qq.n, choice: 1, at: now() - 2000 } as any);
    ok('ответившие — по времени ответа', qq.answered[0] === p2 && qq.answered[1] === p1, `(${qq.answered.join(',')})`);
  }

  // удаление ходящего
  ok('дошли до ходов', await until(() => eng.s.phase === 'turns' && eng.s.stage.t === 'move', 30 * 60000));
  // машины: оба на машинах → дуэль = гонка; проигравший остаётся без машины и получает монетку
  {
    const st = eng.s.stage as any;
    const a = eng.s.players[st.pid as string];
    const b = Object.values(eng.s.players).find((p) => p.id !== a.id)!;
    const to = st.options[0] as number;
    for (const p of Object.values(eng.s.players)) if (p.pref === to) p.pref = null;
    b.pref = to;
    a.car = 'subaru';
    b.car = 'mitsubishi';
    const coins = { [a.id]: a.bonuses.coin, [b.id]: b.bonuses.coin };
    eng.handle({ t: 'pick', pid: a.id, kind: 'move', value: to });
    ok('машина против машины — гонка', await until(() => eng.s.stage.t === 'race' && eng.s.duel?.mode === 'race', 120000));
    ok('гонка закончилась', await until(() => !!eng.s.duel?.over, 300000), `(${Object.values(eng.s.race?.times ?? {}).map((x) => (x == null ? 'сход' : (x / 1000).toFixed(1) + ' c')).join(' / ')})`);
    const d = eng.s.duel!;
    const loser = d.winner ? eng.s.players[d.winner === a.id ? b.id : a.id] : null;
    if (loser) {
      const win = eng.s.players[d.winner!];
      ok('проигравший без машины, победитель с машиной', !loser.car && !!win.car && d.carLost?.pid === loser.id);
      ok('металлолом — за монетку', loser.bonuses.coin === coins[loser.id] + 1);
    } else ok('ничья — обе машины целы', !!a.car && !!b.car);
    await until(() => eng.s.stage.t === 'move', 10 * 60000);
  }

  const order = [...eng.s.turnOrder];
  const cur = (eng.s.stage as any).pid as string;
  const next = order[(order.indexOf(cur) + 1) % order.length];
  eng.onCtl('kick', { pid: cur });
  const got = await until(() => (eng.s.stage.t === 'turnStart' || eng.s.stage.t === 'move') && (eng.s.stage as any).pid !== cur, 60000);
  ok('после удаления ходит следующий по очереди', got && (eng.s.stage as any).pid === next, `(ждали ${eng.s.players[next]?.name}, ходит ${eng.s.players[(eng.s.stage as any).pid]?.name})`);
  ok('удалённого нет в очереди', !eng.s.turnOrder.includes(cur) && eng.s.turnIdx >= 0);

  // удалить всех — движок не должен зависнуть
  for (const id of [...eng.s.joinOrder]) eng.onCtl('kick', { pid: id });
  let alive = false;
  realST(() => { alive = true; }, 300);
  await new Promise<void>((r) => realST(r, 600));
  ok('пустая игра не вешает движок', alive);
  console.log(fails ? `\nОшибок: ${fails}` : '\nВсе проверки прошли');
  process.exit(fails ? 1 : 0);
})();
