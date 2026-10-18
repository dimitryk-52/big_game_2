// Проверка физики пачинко: распределение исходов по силе запуска
import { launchBall, stepBall, slotSpin, PACHI } from '../src/games/logic';
let totalIn = 0, totalOut = 0;
for (let p = 0; p <= 1.0001; p += 0.1) {
  const res: Record<string, number> = { start: 0, tulip: 0, lost: 0, stuck: 0 };
  let steps = 0, out = 0;
  for (let s = 1; s <= 400; s++) {
    const b = launchBall(s * 7919, p);
    let ev: any = null, k = 0;
    for (; k < 3000 && !ev; k++) ev = stepBall(b);
    steps += k;
    const key = !ev ? 'stuck' : ev === 'lost' ? 'lost' : ev.kind;
    res[key]++;
    if (key === 'tulip') out += PACHI.tulipBalls;
    if (key === 'start') { out += PACHI.startBalls; if (slotSpin(s * 7919).jackpot) out += PACHI.jackpotBalls; }
  }
  totalIn += 400; totalOut += out;
  console.log(p.toFixed(1), JSON.stringify(res), 'avg steps', Math.round(steps / 400), 'return', (out / 400).toFixed(2));
}
console.log('overall return per ball', (totalOut / totalIn).toFixed(2));
// детерминизм
const a = launchBall(42, 0.5), b = launchBall(42, 0.5);
for (let i = 0; i < 500; i++) { stepBall(a); stepBall(b); }
console.log('deterministic', a.x === b.x && a.y === b.y);
