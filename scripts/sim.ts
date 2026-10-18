// Headless-прогон движка с ботами на ускоренном времени: npm run sim
import { GameEngine } from '../src/host/engine';
import { DEFAULT_SETTINGS } from '../src/shared/settings';
import { SEED_QUESTIONS } from '../src/shared/seedQuestions';
import { prefName } from '../src/map/mapData';

const SPEED = 40;
const realST = globalThis.setTimeout;
const t0 = Date.now();
(globalThis as any).setTimeout = (fn: any, ms = 0, ...a: any[]) => realST(fn, ms / SPEED, ...a);
const now = () => t0 + (Date.now() - t0) * SPEED;

const settings = structuredClone(DEFAULT_SETTINGS);
settings.prefRewards = { 13: 'prize', 27: 'prize' };
let msgs = 0, bytes = 0, lastStage = '';
const eng = new GameEngine(
  {
    now,
    broadcast: (m) => { msgs++; bytes += JSON.stringify(m).length; },
    save: () => {},
    fx: (k, d) => {
      if (k === 'state') {
        const st = d.stage;
        const key = st.t + (st.pid ?? '');
        if (key !== lastStage) {
          lastStage = key;
          const who = st.pid ? d.players[st.pid]?.name : '';
          console.log(`[r${d.round}] ${st.t} ${who ?? ''} ${st.text ?? ''}${st.t === 'question' && d.q ? ' — ' + d.q.title : ''}`);
        }
      }
      if (k === 'hit') console.log('   HIT', eng.s.players[d.pid].name, -d.dmg, '→', eng.s.players[d.pid].hp);
    },
  },
  'TEST', settings, SEED_QUESTIONS,
);
eng.start();
for (let i = 0; i < 5; i++) eng.addBot();
eng.onCtl('start');

const SIM_MIN = Number(process.argv[2] ?? 25);
realST(() => {
  console.log('\n=== итог ===');
  for (const p of Object.values(eng.s.players))
    console.log(p.name, prefName(p.pref), `hp ${p.hp}/${p.maxHp}`, `${p.yen}¥ ${p.stars}★`, JSON.stringify(p.stats), 'призы:', p.prizes.join(','));
  console.log('раунд', eng.s.round, 'сообщений', msgs, 'байт', bytes, 'открыто префектур', Object.values(eng.s.prefs).filter((x) => x.rev).length);
  process.exit(0);
}, (SIM_MIN * 60000) / SPEED);
