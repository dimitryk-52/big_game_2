// Полная партия без браузера: 7 «телефонов» (не боты — шлют те же сообщения, что настоящие телефоны), ведущий жмёт «Далее»,
// паузы, перезагрузки ТВ посреди игры, колесо призов. Боевые настройки и вопросы — из .devdata (node scripts/pull-real.mjs).
//   npx tsx scripts/fullgame-test.ts [игроков=7] [перезагрузок ТВ=4] [-] [предел, часов=10] [через сколько минут охоты ведущий жмёт «к финальным кругам»] [early — открыть карту кнопкой на 3-м круге] [trace]
import fs from 'node:fs';
import { GameEngine } from '../src/host/engine';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/shared/settings';
import { SEED_QUESTIONS } from '../src/shared/seedQuestions';
import { PREF_CODES, path } from '../src/map/mapData';
import { randomLook } from '../src/shared/look';
import { botRun, makeTrack } from '../src/shared/race';
import { PIT_TRIES } from '../src/games/cherry';
import type { GameMsg, GameState, InputMsg, Settings } from '../src/shared/types';

const N = Number(process.argv[2] ?? 7);
const RELOADS = Number(process.argv[3] ?? 4);
const SPEED = 50;
const realST = globalThis.setTimeout;
const t0 = Date.now();
(globalThis as any).setTimeout = (fn: any, ms = 0, ...a: any[]) => realST(fn, ms / SPEED, ...a);
const now = () => t0 + (Date.now() - t0) * SPEED;
const wait = (ms: number) => new Promise<void>((r) => realST(r, ms / SPEED));
const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]) => a[rnd(a.length)];

const real = fs.existsSync('.devdata/real_settings.json');
const settings: Settings = real ? mergeSettings(JSON.parse(fs.readFileSync('.devdata/real_settings.json', 'utf8'))) : structuredClone(DEFAULT_SETTINGS);
const questions = real ? JSON.parse(fs.readFileSync('.devdata/real_questions.json', 'utf8')) : SEED_QUESTIONS;
console.log(real ? `боевые данные: вопросов ${questions.length}` : 'ВНИМАНИЕ: боевых данных нет, играем на встроенных');

const problems: string[] = [];
const problem = (s: string) => { const line = `[${clock()}] ${s}`; if (!problems.includes(line)) { problems.push(line); console.log('!!! ' + line); } };
const clock = () => { const m = Math.floor((now() - t0) / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const origErr = console.error;
console.error = (...a: any[]) => { problem('console.error: ' + a.map((x) => (x instanceof Error ? x.stack : String(x))).join(' ').slice(0, 600)); };
process.on('unhandledRejection', (e: any) => problem('unhandledRejection: ' + (e?.stack ?? e)));
process.on('uncaughtException', (e: any) => problem('uncaughtException: ' + (e?.stack ?? e)));

// ── транспорт: хост → телефоны ──
let msgs = 0, bytes = 0, maxMsg = 0, inputs = 0;
const perMin: Record<number, number> = {};
let lastSnap: string | null = null;
let eng!: GameEngine;
const stageLog: string[] = [];
const seenStages = new Set<string>();
const seenFx = new Set<string>();
let lastV = -1, lastChange = now();
let huntDuels = 0, huntQs = 0, lastMoveKey = '', dupRefused = false;

interface Phone { cid: string; name: string; pid: string | null; skill: number; s: GameState | null; done: Set<string>; rid: number }
const phones: Phone[] = [];
const NAMES = ['Дима', 'Аня', 'Серёга', 'Катя', 'Макс', 'Оля', 'Витя', 'Лена', 'Паша', 'Юля'];

const io = {
  now,
  broadcast: (m: GameMsg) => {
    const size = JSON.stringify(m).length;
    msgs++; bytes += size; maxMsg = Math.max(maxMsg, size);
    const min = Math.floor((now() - t0) / 60000);
    perMin[min] = (perMin[min] ?? 0) + 1;
    if (m.t === 'joined') { const ph = phones.find((p) => p.cid === m.cid); if (ph) ph.pid = m.pid; }
    if (m.t === 'joinErr') { if (m.cid === 'dup') dupRefused = true; else problem('joinErr: ' + m.err); }
    if (m.t === 'res' && !m.ok && !/Не хватает|уже|Сейчас нельзя|Время вышло|закрыт|Пока не решено|только|Колесо крутится|Призы закончились|Жетонов больше|Якудза|Автомат узнал|не остыл|Игра не начата|Судоку|монах/i.test(m.err ?? '')) problem(`отказ запроса: ${m.err}`);
  },
  save: (d: any) => { lastSnap = JSON.stringify(d); },
  fx: (k: string, d: any) => {
    seenFx.add(k);
    if (process.argv[8] === 'trace' && eng?.s?.endgame?.step === 'hunt' && Object.values(eng.s.prefs).filter((x) => !x.taken).length <= 6) {
      const nm = (id: string) => eng.s.players[id]?.name;
      if (k === 'arrive') console.log(`   [${clock()}] ${nm(d.pid)} → ${d.code}${eng.s.prefs[d.code].taken ? '' : ' (НАГРАДА ' + eng.s.prefs[d.code].reward + ')'}; там: ${Object.values(eng.s.players).filter((p) => p.pref === d.code && p.id !== d.pid).map((p) => p.name + (p.hp <= 0 ? '(ko)' : '') + (p.akita ? '(акита)' : '')).join(',') || '—'}`);
      if (k === 'reveal' && d.context === 'pref') console.log(`      вопрос ${d.pref}: ${d.prize ? 'призовой ' : ''}${Object.entries(d.results ?? {}).map(([id, r]) => nm(id) + ' ' + r).join('; ')}`);
      if (k === 'duel' || k === 'akita' || k === 'reward') console.log(`      ${k} ${d?.pid ? nm(d.pid) : ''} ${d?.reward ?? ''}`);
      if (k === 'state' && d.stage.t === 'move' && lastMoveKey !== d.stage.pid + (eng as any).stageN) { lastMoveKey = d.stage.pid + (eng as any).stageN; console.log(`   [${clock()}] ход ${nm(d.stage.pid)} из ${eng.s.players[d.stage.pid]?.pref}: варианты ${d.stage.options.join(',')} | x2 ${d.stage.options2.join(',')}`); }
    }
    if (k !== 'state') return;
    const s = d as GameState;
    const st: any = s.stage;
    const key = st.t + ':' + (st.pid ?? '') + ':' + (st.text ?? '') + (st.t === 'question' && s.q ? s.q.n : '') + (s.g ? s.g.game + s.g.phase : '');
    if (s.endgame?.step === 'hunt' && key !== stageLog[stageLog.length - 1]) { if (st.t === 'banner' && st.text === 'ДУЭЛЬ!') huntDuels++; if (st.t === 'question' && s.q?.context === 'pref') huntQs++; }
    seenStages.add(st.t + (st.t === 'group' && s.g ? ':' + s.g.game : '') + (s.q ? ':q-' + s.q.context : ''));
    if (stageLog[stageLog.length - 1] !== key) { stageLog.push(key); if (stageLog.length > 40) stageLog.shift(); }
    realST(() => tickPhones(), 0);
  },
  soundMs: () => 0,
};

const send = (m: InputMsg) => { inputs++; try { eng.handle(m); } catch (e: any) { problem('handle упал: ' + (e?.stack ?? e)); } };
const later = (ms: number, fn: () => void) => { const e = eng; realST(() => { if (e === eng) { try { fn(); } catch (err: any) { problem('телефон упал: ' + (err?.stack ?? err)); } } }, ms / SPEED); };
/** одно действие на ключ (как кнопка, которую нажали один раз) */
const once = (ph: Phone, key: string, ms: number, fn: () => void) => { if (ph.done.has(key)) return; ph.done.add(key); later(ms, fn); };
const req = (ph: Phone, op: string, args?: any) => send({ t: 'req', pid: ph.pid!, rid: ++ph.rid, op, args });

function tickPhones() {
  const s = eng.s;
  const st: any = s.stage;
  for (const ph of phones) {
    if (!ph.pid || !s.players[ph.pid]) continue;
    const me = s.players[ph.pid];
    const id = ph.pid;
    const sn = (eng as any).stageN;
    if (st.t === 'landing' && st.pid === id) once(ph, 'land' + sn, 1500 + rnd(4000), () => send({ t: 'pick', pid: id, kind: 'landing', value: pick(PREF_CODES.filter((c) => !st.blocked.includes(c))) }));
    if (st.t === 'move' && st.pid === id) once(ph, 'move' + sn, 1500 + rnd(5000), () => {
      const r = Math.random();
      if (st.lure && r < 0.8) return send({ t: 'pick', pid: id, kind: 'move', value: 'lure' });
      if (st.lureCat && r < 0.8) return send({ t: 'pick', pid: id, kind: 'move', value: 'lureCat' });
      if (st.challenge?.length && r < 0.5) return send({ t: 'pick', pid: id, kind: 'move', value: 'duel:' + pick(st.challenge) });
      if (st.options3?.length && r < 0.6) return send({ t: 'pick', pid: id, kind: 'move', value: 'rail:' + pick(st.options3) });
      const walk = [...st.options, ...st.options2];
      // тянемся к закрытым префектурам и к неразыгранным наградам (как живые игроки), иногда — к сопернику
      const fog = walk.filter((c) => !s.prefs[c]?.rev || (s.endgame && !s.prefs[c]?.taken));
      const foe = walk.filter((c) => Object.values(s.players).some((p) => p.pref === c && p.id !== id));
      // рядом цели нет — идём к ближайшей закрытой префектуре / неразыгранной награде кратчайшим путём (люди видят карту)
      let toward: number | undefined;
      if (!fog.length && walk.length && me.pref != null) {
        const goals = PREF_CODES.filter((c) => c !== me.pref && (!s.prefs[c]?.rev || (s.endgame && !s.prefs[c]?.taken)));
        let best = 99;
        for (const g of goals) for (const w of walk) { const d = path(w, g).length; if (d < best) { best = d; toward = w; } }
      }
      const to = foe.length && Math.random() < 0.3 ? pick(foe) : fog.length && Math.random() < 0.85 ? pick(fog) : toward != null && Math.random() < 0.85 ? toward : pick(walk.length ? walk : st.options3 ?? []);
      if (to == null) return;
      send({ t: 'pick', pid: id, kind: 'move', value: st.options3?.includes(to) && !walk.includes(to) ? 'rail:' + to : to });
    });
    // после приманки стадия та же — разрешаем нажать ещё раз
    if (st.t === 'banner') ph.done.delete('move' + sn);
    const q = s.q;
    if (st.t === 'question' && q && !q.revealed && !q.reading && q.participants.includes(id)) {
      const delay = Math.max(0, q.startAt - now()) + 1200 + rnd(8000);
      const b = (['cheat', 'fifty2', 'fifty1'] as const).find((x) => (me.bonuses[x] ?? 0) > 0 && (x !== 'cheat' || (q.context === 'pref' && !q.prize)));
      if (b && Math.random() < 0.5) once(ph, 'qb' + q.n, Math.max(0, q.startAt - now()) + 500, () => req(ph, 'qBonus', { n: q.n, b }));
      if ((me.bonuses.coin ?? 0) > 0 && (q.context === 'duel' || (q.context === 'sumo' && s.sumo?.asker === id))) once(ph, 'coin' + q.n, Math.max(0, q.startAt - now()) + 700, () => req(ph, 'coin', { n: q.n, b: 'coin' }));
      once(ph, 'ans' + q.n, delay, () => {
        const cur = eng.s.q;
        if (!cur || cur.n !== q.n) return;
        const removed = cur.removed[id] ?? [];
        const opts = [0, 1, 2, 3].filter((i) => !removed.includes(i));
        const correct = (eng as any).curCorrect as number;
        if (Math.random() < 0.08) return; // не успел ответить
        const paw = cur.paw?.[id];
        send({ t: 'answer', pid: id, n: q.n, choice: paw != null ? paw : Math.random() < ph.skill ? correct : pick(opts), at: now() });
      });
    }
    if (st.t === 'reward' && st.pid === id && st.pickTopic) once(ph, 'spt' + sn, 2000 + rnd(4000), () => send({ t: 'pick', pid: id, kind: 'specialTopic', value: pick(st.pickTopic.topics) }));
    if (st.t === 'shop' && st.pid === id) {
      if (!st.entered) once(ph, 'shop' + sn, 1500 + rnd(2500), () => send({ t: 'pick', pid: id, kind: 'shop', value: Math.random() < 0.85 ? 'enter' : 'leave' }));
      else once(ph, 'shopIn' + sn, 1500, () => {
        const sp = s.settings.topics.filter((t) => t.special).map((t) => t.id);
        const cb = s.settings.topics.filter((t) => t.combat).map((t) => t.id);
        if (st.dealer && Math.random() < 0.8) req(ph, 'buyCar', {});
        if (!st.noShop) for (let i = 0; i < 1 + rnd(4); i++) {
          const item = pick(Object.keys(s.settings.shop));
          req(ph, 'buy', { item, topic: item === 'special' ? pick(sp) : item === 'stat' ? pick(cb) : undefined });
        }
        later(3000 + rnd(6000), () => send({ t: 'pick', pid: id, kind: 'shop', value: 'leave' }));
      });
    }
    if (st.t === 'duelBet' && s.duel && id !== s.duel.attacker && id !== s.duel.defender && !st.done.includes(id)) once(ph, 'bet' + sn, 1500 + rnd(6000), () => {
      const d = eng.s.duel;
      if (!d) return;
      if (Math.random() < 0.7) send({ t: 'pick', pid: id, kind: 'bet', value: { on: pick([d.attacker, d.defender]), amt: pick([100, 100, 500]) } });
      if (Math.random() < 0.85) send({ t: 'pick', pid: id, kind: 'bet', value: 'done' }); // остальные ждут таймер
    });
    if (st.t === 'duelPick' && st.pid === id) once(ph, 'dp' + sn, 1500 + rnd(11000), () => {
      const opts: string[] = [...st.topics];
      if (st.canSpecial) for (let i = 0; i < 4; i++) opts.push(me.specialTopics?.length ? 'special:' + me.specialTopics[0] : 'special');
      if (st.canRhythm) opts.push('rhythm', 'rhythm');
      send({ t: 'pick', pid: id, kind: 'duel', value: pick(opts) });
    });
    const r = s.rhythm;
    if (st.t === 'rhythm' && r && r.players.includes(id)) once(ph, 'rh' + r.id, Math.max(0, r.startAt - now()) + (r.beats * 60000) / r.bpm + 400 + rnd(900), () => send({ t: 'rhythm', pid: id, id: r.id, score: 300 + rnd(900), hits: 20, total: 36 }));
    const race = s.race;
    if (st.t === 'race' && race && !race.over && race.players.includes(id)) once(ph, 'race' + race.id, 0, () => {
      const splits = botRun(makeTrack(race.seed, race.kind), 0.4 + Math.random() * 0.5, rnd(1e6));
      const start = Math.max(0, race.startAt - now());
      splits.forEach((ms, i) => later(start + ms, () => send({ t: 'pick', pid: id, kind: 'race', value: { id: race.id, ms, done: i === splits.length - 1 } })));
    });
    if (st.t === 'extraTurn' && st.pid === id) once(ph, 'ex' + sn, 1500 + rnd(3000), () => send({ t: 'pick', pid: id, kind: 'extra', value: Math.random() < 0.8 }));
    if (me.reel && !me.reel.spin) once(ph, 'reel' + sn, 2000 + rnd(20000), () => req(ph, 'reelSpin'));
    if (me.reel?.done) once(ph, 'reelc' + sn, 2500, () => req(ph, 'reelClose'));
    // ── групповые игры ──
    const g = s.g;
    if (st.t === 'group' && g && g.players.includes(id)) {
      if (g.phase === 'draw' && g.game !== 'iaido' && !g.submitted.includes(id)) {
        const total = Math.max(1000, g.deadline - g.startAt);
        if (g.game === 'cherry') for (let i = 0; i < PIT_TRIES; i++) once(ph, `pit${g.id}_${i}`, Math.max(0, g.startAt - now()) + 3000 + i * 7000 + rnd(2500), () => send({ t: 'pick', pid: id, kind: 'cherry', value: { id: g.id, i, a: 25 + rnd(35), p: 0.5 + Math.random() * 0.5 } }));
        if (g.game === 'noodles') once(ph, 'nood' + g.id, Math.max(0, g.startAt - now()) + 2000, () => {
          const target = 2 + rnd(14);
          let n = 0;
          const eat = () => {
            const cur = eng.s.g;
            if (cur !== g || g.phase !== 'draw' || g.burst?.includes(id) || g.closed?.includes(id)) return;
            n++;
            send({ t: 'pick', pid: id, kind: 'noodle', value: { id: g.id, n, how: n >= target ? 'lid' : undefined } });
            if (n < target) later(1500 + rnd(1500), eat);
          };
          eat();
        });
        once(ph, 'draw' + g.id, Math.max(0, g.startAt - now()) + total * (0.35 + Math.random() * 0.75), () => {
          const cur = eng.s.g;
          if (cur !== g || g.submitted.includes(id)) return;
          const data = g.game === 'senryu' ? 'text:Сакэ закончилось ' + ph.name
            : g.game === 'sashimi' ? 'cut:' + (0.2 + Math.random() * 0.6).toFixed(4)
            : g.game === 'cherry' ? 'pit:' + Array.from({ length: PIT_TRIES }, () => `${25 + rnd(35)},${(0.5 + Math.random() * 0.5).toFixed(3)}`).join(';')
            : g.game === 'noodles' ? `nood:${g.bowls?.[id] ?? 0}:${g.burst?.includes(id) ? 'burst' : 'lid'}`
            : 'data:image/webp;base64,' + 'A'.repeat(9000);
          // как телефон: кусками
          const parts = data.match(/.{1,3000}/gs) ?? [data];
          parts.forEach((p, i) => send({ t: 'draw', pid: id, id: g.id, part: i, total: parts.length, data: p }));
        });
      }
      if (g.phase === 'vote' && !g.voted.includes(id)) once(ph, `vote${g.id}_${g.voteRound}`, 1500 + rnd(6000), () => {
        if (eng.s.g !== g) return;
        const mine = ((eng as any).votes[id] ?? []) as number[];
        const opts = g.order.map((_, i) => i + 1).filter((n) => g.order[n - 1] !== id && !mine.includes(n));
        if (opts.length) send({ t: 'pick', pid: id, kind: 'vote', value: pick(opts) });
      });
      const iai = g.iai;
      if (g.game === 'iaido' && iai && iai.step === 'ready') once(ph, `iai${g.id}_${iai.round}`, 0, () => {
        const sig = eng.iaiSignal;
        if (!sig) return;
        const at = Math.random() < 0.12 ? sig.at - 200 - rnd(900) : sig.at + 200 + rnd(450);
        later(Math.max(0, at - now()) + 30, () => { if (eng.s.g === g && g.iai === iai) send({ t: 'pick', pid: id, kind: 'iaido', value: { r: iai.round, at } }); });
      });
    }
    const d = s.dr;
    if (st.t === 'dragon' && d && d.phase === 'play' && d.alive.includes(id)) once(ph, 'dr' + d.id, 0, () => {
      const failAt = d.warm + 3 + rnd(Math.min(d.steps - 4, 70));
      const beat = () => {
        const cur = eng.s.dr;
        if (cur !== d || d.phase !== 'play' || !d.alive.includes(id)) return;
        send({ t: 'dragon', pid: id, id: d.id, miss: Math.random() < 0.5 ? [failAt] : [] });
        later(1500, beat);
      };
      beat();
    });
    const k = s.kj;
    if (st.t === 'kaiju' && k && k.phase === 'play') once(ph, 'kj' + k.id, Math.max(0, k.startAt - now()) + 200, () => {
      const act = () => {
        const cur = eng.s.kj;
        if (cur !== k || k.phase !== 'play') return;
        if (id === k.zilla) send({ t: 'pick', pid: id, kind: 'kaiju', value: { id: k.id, dir: rnd(4) } });
        else {
          const near = [k.pos, k.pos + 1, k.pos - 1, k.pos + k.cols, k.pos - k.cols].filter((c) => c >= 0 && c < k.cols * k.rows);
          send({ t: 'pick', pid: id, kind: 'kaiju', value: { id: k.id, cell: pick(near) } });
        }
        later(id === k.zilla ? 500 + rnd(500) : 900 + rnd(1500), act);
      };
      act();
    });
    // ── соло-игры между ходами (пока идёт чужой ход) ──
    if (s.phase === 'turns' && me.pref != null && me.hp > 0 && (st.t === 'move' || st.t === 'turnStart') && st.pid !== id) {
      const cfg = s.settings;
      const key = 'solo' + me.pref + ':' + ((eng as any).sec.ownTurns?.[id] ?? 0);
      if (cfg.pachinkoPrefs.includes(me.pref)) once(ph, key, 1000, () => { req(ph, 'pachiBuy', { packs: 1 }); later(8000, () => req(ph, 'pachiCash', { balls: rnd(40), exit: true })); });
      if (cfg.ringPrefs.includes(me.pref)) once(ph, key, 1000, () => { req(ph, 'busy', { busy: 'ring' }); req(ph, 'ringStart'); if (Math.random() < 0.85) later(3000 + rnd(3000), () => { req(ph, 'ringStop', { at: now() }); later(4000, () => req(ph, 'busy', { busy: null })); }); });
      if (cfg.chohanPrefs.includes(me.pref)) once(ph, key, 1000, () => { req(ph, 'busy', { busy: 'chohan' }); req(ph, 'chohanRoll', { bet: pick(cfg.chohan.bets), guess: pick(['cho', 'han']) }); later(2000, () => req(ph, 'busy', { busy: null })); });
      if (cfg.onsenPrefs.includes(me.pref)) once(ph, key, 1000, () => { req(ph, 'busy', { busy: 'onsen' }); later(5000, () => req(ph, 'busy', { busy: null })); });
      if (cfg.sudokuPrefs.includes(me.pref)) once(ph, key, 1000, () => { req(ph, 'busy', { busy: 'sudoku' }); req(ph, 'sudokuGet'); later(3000, () => req(ph, 'busy', { busy: null })); });
    }
    const w = s.wheel;
    if (st.t === 'wheel' && w && !w.spinner && (w.tokens[id] ?? 0) > 0) once(ph, 'wheel' + w.history.length + ':' + w.tokens[id], 2000 + rnd(3000), () => req(ph, 'wheelSpin'));
  }
}

// ── проверки состояния ──
function invariants() {
  const s = eng.s;
  for (const p of Object.values(s.players)) {
    const bad = (what: string) => problem(`${p.name}: ${what} (стадия ${s.stage.t})`);
    if (!Number.isFinite(p.yen) || p.yen < 0) bad(`деньги ${p.yen}`);
    if (!Number.isFinite(p.stars) || p.stars < 0) bad(`звёзды ${p.stars}`);
    if (!Number.isFinite(p.hp) || p.hp < 0 || p.hp > p.maxHp) bad(`hp ${p.hp}/${p.maxHp}`);
    if (p.specials < 0 || (p.specialTopics?.length ?? 0) > p.specials) bad(`спецвопросы ${p.specials}, тем ${p.specialTopics?.length}`);
    for (const [b, n] of Object.entries(p.bonuses)) if (!Number.isInteger(n) || n < 0) bad(`бонус ${b} = ${n}`);
    for (const [t, n] of Object.entries(p.stats)) if (!Number.isFinite(n) || n < 0) bad(`сила ${t} = ${n}`);
  }
  if (s.phase === 'turns' || s.phase === 'end') for (const c of PREF_CODES) {
    const here = Object.values(s.players).filter((p) => p.pref === c);
    if (here.length > 2) problem(`в префектуре ${c} сразу ${here.length} игроков`);
  }
  if (Object.values(s.players).filter((p) => p.akita).length > 1) problem('акита у двоих');
  if (Object.values(s.players).filter((p) => p.cat).length > 1) problem('кошка у двоих');
  for (const l of s.log) if (/Ошибка движка/.test(l.text)) problem(l.text);
  const size = JSON.stringify(s).length;
  if (size > 200000) problem(`состояние раздулось: ${size} байт`);
}

// ── ведущий ──
let pauses = 0, reloads = 0, nexts = 0;
const stuckSeen = new Set<string>();
function hostTick() {
  const s = eng.s;
  const st: any = s.stage;
  const t = now();
  if (s.v !== lastV) { lastV = s.v; lastChange = t; }
  const idle = t - lastChange;
  if (s.paused) { if (idle > 20000) { eng.onCtl('pause'); lastChange = t; } return; }
  const q = s.q;
  const g = s.g;
  const timed = (typeof st.deadline === 'number' && st.deadline > t) || (st.pickTopic?.deadline > t) || (q && !q.revealed && !q.reading)
    || (g && (g.deadline > t - 9000 || g.phase === 'show' || g.game === 'iaido' && g.phase === 'draw')) || (s.dr?.phase === 'play') || (s.kj?.phase === 'play')
    || st.t === 'rhythm' || st.t === 'race' || st.t === 'reel' || st.t === 'wheel' || st.t === 'lobby' || st.t === 'end';
  const waitingPlayer = st.t === 'move' || (g?.phase === 'vote');
  if (waitingPlayer) {
    if (idle > 90000) { const k = st.t + stageLog.at(-1); if (!stuckSeen.has(k)) { stuckSeen.add(k); problem(`ждём игрока дольше 90 с: ${stageLog.at(-1)}`); } eng.onCtl('next'); nexts++; lastChange = t; }
    return;
  }
  if (timed) {
    if (idle > 400000) { problem(`зависло на таймере: ${stageLog.at(-1)} (${JSON.stringify(st).slice(0, 200)})`); eng.onCtl('next'); lastChange = t; }
    return;
  }
  // ведущий читает/смотрит и жмёт «Далее»
  const think = q?.reading ? 5000 : q?.revealed ? 4000 : 6000;
  if (idle > think) { eng.onCtl('next'); nexts++; lastChange = t; }
}

function newEngine(snapshot: any) {
  eng = new GameEngine(io as any, 'TEST', settings, questions, snapshot);
  eng.start();
}

function reloadTv(why: string) {
  if (!lastSnap) return;
  reloads++;
  console.log(`[${clock()}] ↻ перезагрузка ТВ (${why}; стадия ${eng.s.stage.t}, круг ${eng.s.round})`);
  const old = eng;
  old.abort();
  // старый движок больше ничего не шлёт
  (old as any).io = { now, broadcast: () => {}, save: () => {}, fx: () => {} };
  newEngine(JSON.parse(lastSnap));
  for (const ph of phones) ph.done.clear();
  lastV = -1;
  lastChange = now();
  // телефоны пингуют раз в 15 с — каждый в свой момент
  for (const ph of phones) if (ph.pid) later(rnd(15000), () => send({ t: 'ping', cid: ph.cid, n: 1, t0: 0, pid: ph.pid! } as any));
}

(async () => {
  newEngine(null);
  for (let i = 0; i < N; i++) {
    const ph: Phone = { cid: 'c' + i, name: NAMES[i], pid: null, skill: 0.3 + (i / Math.max(1, N - 1)) * 0.5, s: null, done: new Set(), rid: 0 };
    phones.push(ph);
    send({ t: 'hello', cid: ph.cid });
    send({ t: 'join', cid: ph.cid, name: ph.name, color: '#ff4d6d', hat: i, look: randomLook() });
  }
  // занятое имя не принимается
  send({ t: 'join', cid: 'dup', name: NAMES[0].toUpperCase(), color: '#fff', hat: 0 });
  if (!dupRefused) problem('занятое имя приняли');
  await wait(3000);
  if (phones.some((p) => !p.pid)) problem('не все вошли');
  eng.onCtl('next');
  await wait(1000);
  if (eng.s.phase !== 'lobby') problem('«Далее» запустило игру из лобби');
  eng.onCtl('start');

  const pingT = setInterval(() => { for (const ph of phones) if (ph.pid && eng.s.players[ph.pid]) send({ t: 'ping', cid: ph.cid, n: 1, t0: 0, pid: ph.pid } as any); }, 15000);
  const reloadAt = new Set<string>();
  const wantReload = ['question', 'shop', 'group', 'move', 'duelPick', 'sumo', 'kaiju', 'dragon', 'duelBet', 'reward'].sort(() => Math.random() - 0.5).slice(0, RELOADS);
  let lastPause = now();
  const maxMs = Number(process.argv[5] ?? 10) * 3600000;
  let mile = '', lastReport = 0, huntAt = 0, forced = false;
  const HUNT_MAX = Number(process.argv[6] ?? 1e9);
  const EARLY_HUNT = process.argv[7] === 'early';
  let wheelStarted = false, endAt = 0;
  for (;;) {
    await wait(1000);
    invariants();
    hostTick();
    const s = eng.s;
    const st = s.stage.t;
    {
      const open = Object.values(s.prefs).filter((x) => x.rev).length;
      const left = Object.values(s.prefs).filter((x) => !x.taken).length;
      const m = `${s.phase}/эпоха ${s.epoch}/${s.endgame?.step ?? '-'}${s.endgame?.played != null ? ':' + s.endgame.played : ''}${s.sumo ? '/сумо' : ''}`;
      if (m !== mile || now() - lastReport > 30 * 60000) { mile = m; lastReport = now(); console.log(`[${clock()}] ${m} · круг ${s.round} · открыто ${open}/46 · наград не взято ${left} · вопросов задано ${(eng as any).sec.qn}`); }
    }
    // проверка охоты пораньше: ведущий открывает карту кнопкой пульта на 3-м круге
    if (EARLY_HUNT && s.phase === 'turns' && s.round >= 3 && !s.endgame) { console.log(`[${clock()}] ведущий: «открыть карту → охота»`); eng.onCtl('endgame', { to: 'hunt' }); }
    // ведущий: охота затянулась — жмёт на пульте «Сразу к финальным кругам»
    if (s.endgame?.step === 'hunt') {
      huntAt ||= now();
      if (now() - huntAt > HUNT_MAX * 60000 && !forced) { forced = true; console.log(`[${clock()}] ведущий: охота идёт ${HUNT_MAX} мин, осталось наград ${Object.values(s.prefs).filter((x) => !x.taken).length} → «к финальным кругам»`); eng.onCtl('endgame', { to: 'final' }); }
    }
    // пауза ведущего время от времени
    if (!s.paused && now() - lastPause > 20 * 60000 && ['question', 'shop', 'landing', 'duelPick', 'group'].includes(st)) { lastPause = now(); pauses++; eng.onCtl('pause'); }
    // перезагрузки ТВ в разных местах
    if (s.phase === 'turns' && s.round >= 2 && wantReload.includes(st) && !reloadAt.has(st) && Math.random() < 0.15) { reloadAt.add(st); reloadTv(st); }
    if (s.phase === 'end') {
      if (!endAt) {
        endAt = now();
        const titles = (s.stage as any).titles ?? {};
        if (Object.keys(titles).length !== N) problem(`титулы не у всех: ${Object.keys(titles).length}/${N}`);
        console.log(`[${clock()}] конец игры, титулы:`, Object.entries(titles).map(([id, t]) => `${s.players[id]?.name}: ${(t as string[]).join('/')}`).join('; '));
      }
      if (!wheelStarted && now() - endAt > 20000) { wheelStarted = true; eng.onCtl('wheelStart'); console.log(`[${clock()}] колесо: жетоны`, JSON.stringify(Object.fromEntries(Object.entries(s.wheel?.tokens ?? {}).map(([id, n]) => [s.players[id].name, n]))), 'призы', JSON.stringify(s.wheel?.left)); }
      const w = s.wheel;
      if (wheelStarted && w && !w.spinner && (Object.values(w.tokens).every((n) => n <= 0) || Object.values(w.left).every((n) => n <= 0))) {
        await wait(8000);
        eng.onCtl('wheelEnd');
        await wait(2000);
        if (eng.s.stage.t !== 'end') problem('после колеса не вернулись к титулам');
        console.log(`[${clock()}] колесо разыграно: ${w.history.length} призов, осталось ${JSON.stringify(w.left)}`);
        break;
      }
      if (wheelStarted && now() - endAt > 40 * 60000) { problem('колесо не доиграли за 40 минут: ' + JSON.stringify(w)); break; }
    }
    if (now() - t0 > maxMs) { problem(`игра не закончилась за отведённое время: круг ${s.round}, ${st}, endgame ${JSON.stringify(s.endgame)}, открыто ${Object.values(s.prefs).filter((x) => x.rev).length}`); break; }
  }
  clearInterval(pingT);
  const s = eng.s;
  console.log('\n=== итог ===');
  console.log('не взяты награды:', PREF_CODES.filter((c) => !s.prefs[c].taken).map((c) => `${c}(${s.prefs[c].reward}, своих вопросов ${(eng as any).prefQueue(c).length}${(eng as any).prefQueue(c)[0]?.prize ? ', первый — призовой' : ''}, стоят: ${Object.values(s.players).filter((p) => p.pref === c).length})`).join(' '));
  console.log(`в охоте: дуэлей ${huntDuels}, вопросов префектур ${huntQs}`);
  for (const p of Object.values(s.players)) console.log(`${p.name.padEnd(8)} ¥${String(p.yen).padStart(6)} ${String(p.stars).padStart(3)}★ hp ${p.hp}/${p.maxHp} сила ${Object.values(p.stats).join(',')} ${p.car ?? ''} ${p.akita ? 'акита ' : ''}${p.cat ? 'кошка ' : ''}призы: ${p.prizes.join(',')}`);
  const mins = Object.values(perMin);
  console.log(`время игры ${clock()}, кругов ${s.round}, эпоха ${s.epoch}, «Далее» ${nexts}, пауз ${pauses}, перезагрузок ТВ ${reloads}`);
  console.log(`сообщений хоста ${msgs} (${(bytes / 1e6).toFixed(1)} МБ, самое большое ${maxMsg} б, пик ${Math.max(...mins)}/мин), сообщений телефонов ${inputs}`);
  const ALL = ['banner', 'calibResult', 'landing', 'turnStart', 'move', 'moving', 'prefIntro', 'reward', 'shop', 'extraTurn', 'duelBet', 'find', 'epoch', 'reel', 'wheel', 'duelPick', 'sumo', 'rhythm', 'race', 'duelResult', 'prize', 'end', 'kaiju', 'dragon'];
  const groups = [...new Set(Object.values(settings.groupPrefs))].filter((x) => x !== 'dragon' && x !== 'godzilla');
  const got = (k: string) => [...seenStages].some((x) => x === k || x.startsWith(k + ':'));
  console.log('не встретились стадии:', ALL.filter((k) => !got(k)).join(', ') || '—', '| групповые:', groups.filter((x) => !seenStages.has('group:' + x)).join(', ') || '—', '| контексты вопросов:', ['calib', 'pref', 'duel', 'revive', 'sumo'].filter((c) => ![...seenStages].some((x) => x.endsWith(':q-' + c))).join(', ') || '—');
  console.log(problems.length ? `\nПРОБЛЕМ: ${problems.length}\n` + problems.join('\n') : '\nПроблем не найдено');
  console.error = origErr;
  process.exit(problems.length ? 1 : 0);
})();
