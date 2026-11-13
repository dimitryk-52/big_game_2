// Прикидка баланса «Годзиллы» на ботах: tsx scripts/kaiju-sim.ts [охотников] [игр]
// Боты грубее людей (Годзилла не предугадывает залпы, охотники не сговариваются) — это ориентир, а не истина.
import { KAIJU_DEFAULT, botHunter, botZilla, startCell, stepCell } from '../src/games/kaiju';
import type { KaijuPublic } from '../src/shared/types';

const hunters = Number(process.argv[2] ?? 6), games = Number(process.argv[3] ?? 2000);

function play(cfg = KAIJU_DEFAULT, react = 250) {
  const start = startCell(cfg);
  const k: KaijuPublic = {
    id: 1, pref: 13, phase: 'play', zilla: 'z', hunters: Array.from({ length: hunters }, (_, i) => 'h' + i), cols: cfg.cols, rows: cfg.rows,
    startAt: 0, endAt: cfg.time * 1000, pos: start, face: 1, hp: cfg.hp, maxHp: cfg.hp, stunUntil: 0, down: [start], stomped: 0,
    shells: [], ready: {}, hits: {}, shots: {}, cfg: { stepMs: cfg.stepMs, smashMs: cfg.smashMs, fuseMs: cfg.fuseMs, reloadMs: cfg.reloadMs }, busyUntil: 0,
  };
  let want: number | null = null, last = -1e9, n = 0;
  const botAt: Record<string, number> = {};
  for (let t = 0; t < k.endAt && k.hp > 0; t += 50) {
    // Годзилла-человек: замечает обстановку с задержкой react
    if (want == null && t >= k.busyUntil + react) { const d = botZilla(k, t); if (d >= 0) want = d; }
    for (const id of k.hunters) {
      if ((k.ready[id] ?? 0) > t) continue;
      botAt[id] ??= t + 300 + Math.random() * 1500;
      if (t >= botAt[id]) { delete botAt[id]; k.ready[id] = t + cfg.reloadMs; k.shells.push({ n: ++n, pid: id, cell: botHunter(k), at: t + cfg.fuseMs }); }
    }
    if (want != null && t >= k.busyUntil) {
      const to = stepCell(k, k.pos, want);
      want = null;
      if (to >= 0) { k.pos = to; last = t; k.busyUntil = t + (k.down.includes(to) ? cfg.stepMs : cfg.smashMs); if (!k.down.includes(to)) { k.down.push(to); k.stomped++; } }
    }
    for (const s of k.shells.filter((s) => s.at <= t)) {
      if (s.cell === k.pos && t >= k.stunUntil && k.hp > 0) { k.hp--; k.stunUntil = t + cfg.stunMs; k.hits[s.pid] = (k.hits[s.pid] ?? 0) + 1; }
    }
    k.shells = k.shells.filter((s) => s.at > t);
  }
  return k;
}

for (const react of [150, 300, 450]) {
  let surv = 0, houses = 0, hits = 0;
  for (let i = 0; i < games; i++) { const k = play(KAIJU_DEFAULT, react); if (k.hp > 0) surv++; houses += k.stomped; hits += KAIJU_DEFAULT.hp - k.hp; }
  console.log(`реакция ${react} мс: выжил ${(100 * surv / games).toFixed(0)}%, домов ${(houses / games).toFixed(1)} из ${KAIJU_DEFAULT.cols * KAIJU_DEFAULT.rows - 1}, попаданий ${(hits / games).toFixed(2)}`);
}
