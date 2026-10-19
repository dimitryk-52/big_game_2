// Игровой движок хоста. Работает во вкладке ТВ (или headless в тесте).
// Сценарий написан последовательно через async/await; ожидания можно пропустить
// кнопкой ведущего «Далее». Снапшот сохраняется на контрольных точках,
// после перезагрузки ТВ игра продолжается с начала текущего хода.
import type {
  BonusId, GameMsg, GameState, GroupGameId, GroupPublic, InputMsg, Player, PublicQuestion, Question, QContext, RewardType, Settings, Stage, TopicId,
} from '../shared/types';
import { BONUS_INFO, REWARD_INFO, groupTasksFor, groupTime, isSpecialQ } from '../shared/settings';
import { buildDebugScene } from './debugScenes';
import { PREF, PREF_CODES, atDistance, neighbors, path, prefName } from '../map/mapData';
import { pick, randInt, shuffle, uid } from '../shared/util';
import { RHYTHM_LEAD_BEATS, ringCellAt, ringLayout, ringResult } from '../games/logic';
import { clearT, setT } from './timers';

export interface HostIO {
  now(): number;
  broadcast(msg: GameMsg): void;
  save(data: any): void;
  /** события для ТВ: звуки, эффекты, пнп */
  fx?(kind: string, data?: any): void;
}

class Aborted extends Error {}
const ANSWER_GRACE = 700; // мс: льгота на доставку ответа после дедлайна
const LEAD = 700; // мс: задержка старта таймера, чтобы вопрос успел дойти до всех
const PREF_INTRO_MS = 5000; // мс: интро префектуры при первом входе

interface Secrets {
  pins: Record<string, string>;
  used: string[];
  qn: number;
  logN: number;
  calibIdx: number;
  landingIdx: number;
  rhythmN: number;
  ring: Record<string, { seed: number; t0: number }>;
  groupN?: number;
  usedTasks?: string[];
}

type Waiter = { match: (m: InputMsg) => any; resolve: (v: any) => void };

/** все 24 перестановки четырёх ответов */
const PERMS4: number[][] = (() => {
  const out: number[][] = [];
  const go = (cur: number[]) => {
    if (cur.length === 4) return void out.push(cur);
    for (let i = 0; i < 4; i++) if (!cur.includes(i)) go([...cur, i]);
  };
  go([]);
  return out;
})();

/** каждому игроку свой порядок кнопок; до 24 игроков порядки не повторяются */
function answerOrders(pids: string[]): Record<string, number[]> {
  const res: Record<string, number[]> = {};
  let pool: number[][] = [];
  for (const id of shuffle(pids)) {
    if (!pool.length) pool = shuffle(PERMS4);
    res[id] = pool.pop()!;
  }
  return res;
}

export class GameEngine {
  s: GameState;
  sec: Secrets;
  questions: Question[] = [];
  private waiters: Waiter[] = [];
  private skipCbs = new Set<() => void>();
  private pauseCbs: (() => void)[] = [];
  private lastSent: Record<string, string> = {};
  private emitQueued = false;
  private forceFull = false;
  private curCorrect = -1;
  private qDone: (() => void) | null = null;
  private epoch = 0;
  private stageN = 0;
  private botKeys = new Set<string>();
  private rhythmDone: (() => void) | null = null;

  constructor(private io: HostIO, room: string, settings: Settings, questions: Question[], snapshot?: { s: GameState; sec: Secrets } | null) {
    this.questions = questions;
    if (snapshot) {
      this.s = snapshot.s;
      this.sec = snapshot.sec;
      this.s.settings = settings;
      for (const p of Object.values(this.s.players)) { p.online = !!p.bot; p.busy = null; }
      this.s.q = null;
      this.s.duel = null;
      this.s.rhythm = null;
      this.s.g = null;
      this.s.paused = false;
    } else {
      this.s = {
        v: 0, room, stage: { t: 'lobby' }, players: {}, joinOrder: [], turnOrder: [], turnIdx: 0, round: 1,
        prefs: {}, q: null, duel: null, rhythm: null, g: null, log: [], settings, paused: false, phase: 'lobby', debug: null,
      };
      this.sec = { pins: {}, used: [], qn: 0, logN: 0, calibIdx: 0, landingIdx: 0, rhythmN: 0, ring: {} };
    }
  }

  // ───────── публичное API ─────────

  start() {
    this.forceFull = true;
    this.emit();
    void this.run(this.epoch);
  }

  get now() {
    return this.io.now();
  }

  /** время последнего сообщения от игрока — для индикатора «на связи» */
  lastSeen: Record<string, number> = {};

  handle(m: InputMsg) {
    const pid = (m as any).pid as string | undefined;
    if (pid && this.s.players[pid]) {
      this.lastSeen[pid] = Date.now();
      if (!this.s.players[pid].online) { this.s.players[pid].online = true; this.emit(); }
    }
    switch (m.t) {
      case 'hello': return this.onHello(m);
      case 'join': return this.onJoin(m);
      case 'restore': return this.onRestore(m);
      case 'ping': return this.io.broadcast({ t: 'pong', cid: m.cid, n: m.n, t0: m.t0, th: this.now });
      case 'answer': return this.onAnswer(m);
      case 'req': return this.onReq(m);
      case 'rhythm': return this.onRhythm(m);
      case 'draw': return this.onDraw(m);
      case 'pnp': return this.io.fx?.('pnp', m);
      case 'ctl': return this.onCtl(m.cmd, m.args);
    }
    this.feed(m);
  }

  onCtl(cmd: string, args?: any) {
    switch (cmd) {
      case 'start':
        if (this.s.phase === 'lobby' && this.s.joinOrder.length) this.feed({ t: '__start' } as any);
        break;
      case 'next':
        this.skip();
        break;
      case 'pause':
        this.s.paused = !this.s.paused;
        if (!this.s.paused) this.pauseCbs.splice(0).forEach((c) => c());
        this.emit();
        break;
      case 'kick':
        this.kick(args?.pid);
        break;
      case 'give': {
        const p = this.s.players[args?.pid];
        if (!p) break;
        p.yen = Math.max(0, p.yen + (args.yen ?? 0));
        p.stars = Math.max(0, p.stars + (args.stars ?? 0));
        p.hp = Math.max(0, Math.min(p.maxHp, p.hp + (args.hp ?? 0)));
        if (args.prize) p.prizes.push(String(args.prize));
        this.emit();
        break;
      }
      case 'addBot':
        this.addBot();
        break;
      case 'teleport': {
        // ручное перемещение игрока ведущим (исправить спорную ситуацию)
        const p = this.s.players[args?.pid];
        const code = Number(args?.pref);
        if (!p || !PREF[code]) break;
        p.pref = code;
        this.s.prefs[code] && (this.s.prefs[code].rev = true);
        this.log(`Ведущий переместил ${p.name}: ${PREF[code].ru}`);
        this.emit();
        break;
      }
      case 'settings':
        if (args) { this.s.settings = args; this.emit(); }
        break;
      case 'questions':
        if (Array.isArray(args)) this.questions = args;
        break;
      case 'debug': {
        // отладочная сцена (меню 🐞 на ТВ/телефоне); null — закрыть
        const v = args?.scene ? buildDebugScene(this.s, this.questions, args, this.now) : null;
        this.s.debug = v;
        if (v?.rhythm) this.io.fx?.('rhythm', v.rhythm);
        this.emit();
        break;
      }
      case 'groupTest':
      case 'shopTest': {
        // отладка: прервать текущий ход, сыграть сцену и продолжить игру с начала хода
        if (this.s.joinOrder.length < (cmd === 'groupTest' ? 2 : 1)) break;
        const p = this.s.players[args?.pid] ?? this.s.players[this.s.joinOrder[0]];
        this.abort();
        const ep = this.epoch;
        this.s.q = null;
        this.s.duel = null;
        this.s.g = null;
        void (async () => {
          try {
            if (cmd === 'groupTest') await this.groupGame(ep, PREF[args?.pref] ? +args.pref : 26, args?.game ?? 'calligraphy');
            else if (p) await this.shopVisit(ep, p, true);
          } catch (e) { if (!(e instanceof Aborted)) console.error(e); }
          if (ep === this.epoch) void this.run(ep);
        })();
        break;
      }
      case 'debugFx':
        this.io.fx?.(args?.k, args?.d);
        break;
      case 'revealAll':
        for (const c of Object.keys(this.s.prefs)) this.s.prefs[+c].rev = true;
        this.emit();
        break;
      case 'hideAll': {
        // закрыть туманом всё, кроме префектур, где стоят игроки; награды вернуть
        const here = new Set(Object.values(this.s.players).map((p) => p.pref));
        for (const c of Object.keys(this.s.prefs)) {
          const ps = this.s.prefs[+c];
          ps.rev = here.has(+c);
          ps.taken = false;
        }
        this.emit();
        break;
      }
      case 'end':
        this.s.phase = 'end';
        this.setStage({ t: 'end' });
        this.abort();
        this.snapshot();
        break;
    }
  }

  /** «Далее»: пропустить текущее ожидание */
  skip() {
    this.skipCbs.forEach((c) => c());
    this.skipCbs.clear();
    // ожидающие ввода получают null (поведение по умолчанию)
    const ws = this.waiters.splice(0);
    ws.forEach((w) => w.resolve(null));
  }

  abort() {
    this.epoch++;
    this.skip();
  }

  // ───────── состояние и рассылка ─────────

  emit() {
    if (this.emitQueued) return;
    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      const parts: any = {};
      const full = this.forceFull;
      this.forceFull = false;
      for (const k of Object.keys(this.s) as (keyof GameState)[]) {
        if (k === 'v') continue;
        const j = JSON.stringify(this.s[k]);
        if (full || this.lastSent[k] !== j) {
          parts[k] = this.s[k];
          this.lastSent[k] = j;
        }
      }
      if (!full && !Object.keys(parts).length) return;
      this.s.v++;
      this.io.broadcast({ t: 'st', v: this.s.v, full, parts });
      this.io.fx?.('state', this.s);
      this.botTick();
    });
  }

  sendFull() {
    this.forceFull = true;
    this.emit();
  }

  private setStage(st: Stage) {
    this.s.stage = st;
    this.stageN++;
    this.emit();
  }

  private log(text: string) {
    this.s.log.push({ id: ++this.sec.logN, text });
    if (this.s.log.length > 6) this.s.log.shift();
    this.emit();
  }

  snapshot() {
    this.io.save({ s: this.s, sec: this.sec, savedAt: Date.now() });
  }

  // ───────── примитивы ожидания ─────────

  private check(epoch: number) {
    if (epoch !== this.epoch) throw new Aborted();
  }

  /** ждать сообщение, подходящее под match (вернуть не-undefined), или таймаут/скип → null */
  private waitInput<T>(epoch: number, match: (m: InputMsg) => T | undefined, ms: number | null): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      let timer: any;
      const w: Waiter = {
        match,
        resolve: (v) => { clearT(timer); resolve(v); },
      };
      this.waiters.push(w);
      if (ms != null) timer = setT(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        resolve(null);
      }, ms);
    }).then((v) => { this.check(epoch); return v; });
  }

  private feed(m: InputMsg) {
    for (const w of [...this.waiters]) {
      const v = w.match(m);
      if (v !== undefined) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve(v);
      }
    }
  }

  /** пауза, которую можно пропустить кнопкой «Далее» */
  private sleep(epoch: number, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => { clearT(t); this.skipCbs.delete(done); resolve(); };
      const t = setT(done, ms);
      this.skipCbs.add(done);
    }).then(() => this.check(epoch));
  }

  /** ждать снятия паузы ведущим */
  private async gate(epoch: number) {
    while (this.s.paused) {
      await new Promise<void>((r) => this.pauseCbs.push(r));
      this.check(epoch);
    }
  }

  // ───────── сценарий ─────────

  private async run(epoch: number): Promise<void> {
    try {
      if (this.s.phase === 'lobby') {
        this.setStage({ t: 'lobby' });
        await this.waitInput(epoch, (m: any) => (m.t === '__start' ? true : undefined), null);
        if (!this.s.joinOrder.length) return this.run(epoch);
        this.s.phase = 'calib';
        this.initPrefs();
        this.snapshot();
      }
      if (this.s.phase === 'calib') await this.calibration(epoch);
      if (this.s.phase === 'landing') await this.landing(epoch);
      if (this.s.phase === 'turns') await this.turns(epoch);
    } catch (e) {
      if (!(e instanceof Aborted)) {
        console.error(e);
        this.log('Ошибка движка: ' + (e as Error).message);
      }
    }
  }

  private initPrefs() {
    const st = this.s.settings;
    // доп. ход редкий — так же, как спецвопрос
    const weighted: RewardType[] = ['money', 'money', 'money', 'money', 'stars', 'stars', 'stars', 'bonus', 'bonus', 'special', 'turn2'];
    for (const code of PREF_CODES) {
      const manual = st.prefRewards?.[code];
      this.s.prefs[code] = { rev: false, reward: manual ?? pick(weighted), prizeTaken: false, visits: 0 };
    }
  }

  private combatTopics() {
    return this.s.settings.topics.filter((t) => t.combat);
  }

  private async calibration(epoch: number) {
    const topics = this.combatTopics();
    const total = this.s.settings.calibRounds * topics.length;
    if (this.sec.calibIdx === 0) {
      this.setStage({ t: 'banner', text: 'Калибровка', sub: 'Отвечайте на вопросы — так мы узнаем ваши сильные стороны', big: true });
      await this.sleep(epoch, 4000);
    }
    for (let i = this.sec.calibIdx; i < total; i++) {
      await this.gate(epoch);
      const topic = topics[i % topics.length];
      const q = this.pickQuestion((x) => x.topic === topic.id && !x.special) ?? this.pickQuestion((x) => !x.special && x.topic !== 'okinawa');
      if (!q) break;
      const pids = this.alivePids();
      const res = await this.ask(epoch, q, 'calib', `Калибровка ${i + 1}/${total} · ${topic.name}`, pids, this.s.settings.questionTime);
      const results: Record<string, string> = {};
      for (const pid of pids) {
        const p = this.s.players[pid];
        if (res[pid] === q.correct) {
          p.calib[topic.id] = (p.calib[topic.id] ?? 0) + 1;
          p.stats[topic.id] = (p.stats[topic.id] ?? 0) + 1;
          p.yen += this.s.settings.reward.calibCorrectYen;
          results[pid] = `+1 {skill:${topic.id}}`;
        }
      }
      await this.reveal(epoch, results);
      this.sec.calibIdx = i + 1;
      this.snapshot();
    }
    // порядок ходов: от слабого к сильному (по сумме силы), равенство — жребий
    const pids = shuffle(this.s.joinOrder.filter((id) => this.s.players[id]));
    const power = (id: string) => Object.values(this.s.players[id].stats).reduce((a, b) => a + b, 0);
    this.s.turnOrder = pids.sort((a, b) => power(a) - power(b));
    this.setStage({ t: 'calibResult' });
    await this.sleep(epoch, 9000);
    this.s.phase = 'landing';
    this.snapshot();
  }

  private async landing(epoch: number) {
    const order = [...this.s.turnOrder].reverse(); // высадка: от сильного к слабому
    if (this.sec.landingIdx === 0) {
      this.setStage({ t: 'banner', text: 'Высадка', sub: 'Выбирайте, где начать. Нельзя рядом с соперниками!', big: true });
      await this.sleep(epoch, 3500);
    }
    for (let i = this.sec.landingIdx; i < order.length; i++) {
      await this.gate(epoch);
      const pid = order[i];
      const p = this.s.players[pid];
      if (!p || p.pref) continue;
      const occupied = Object.values(this.s.players).map((x) => x.pref).filter((x): x is number => !!x);
      let blocked = new Set<number>(occupied);
      occupied.forEach((o) => neighbors(o).forEach((n) => blocked.add(n)));
      if (blocked.size >= PREF_CODES.length) blocked = new Set(occupied);
      // на магазин и групповую игру не высаживаются — туда нужно прийти
      const special = [...(this.s.settings.shopPrefs ?? []), ...Object.keys(this.s.settings.groupPrefs ?? {}).map(Number)];
      if (PREF_CODES.some((c) => !blocked.has(c) && !special.includes(c))) special.forEach((c) => blocked.add(c));
      const allowed = PREF_CODES.filter((c) => !blocked.has(c));
      const ms = this.s.settings.landingTime * 1000;
      this.setStage({ t: 'landing', pid, deadline: this.now + ms, blocked: [...blocked] });
      const v = await this.waitInput(epoch, (m) => (m.t === 'pick' && m.kind === 'landing' && m.pid === pid && allowed.includes(m.value) ? (m.value as number) : undefined), ms + 500);
      const code = v ?? pick(allowed);
      p.pref = code;
      this.s.prefs[code].rev = true;
      this.log(`${p.name} высаживается: ${prefName(code)}`);
      this.io.fx?.('land', { pid, code });
      this.setStage({ t: 'prefIntro', code, pid });
      await this.sleep(epoch, this.hostPaced ? 36e5 : PREF_INTRO_MS);
      // первый вопрос — сразу на месте высадки
      await this.gate(epoch);
      await this.prefQuestion(epoch, p, code);
      this.sec.landingIdx = i + 1;
      this.snapshot();
    }
    this.s.phase = 'turns';
    this.s.turnIdx = 0;
    this.snapshot();
  }

  private async turns(epoch: number) {
    for (;;) {
      while (this.s.turnIdx < this.s.turnOrder.length) {
        await this.gate(epoch);
        const pid = this.s.turnOrder[this.s.turnIdx];
        if (this.s.players[pid]) await this.turn(epoch, pid);
        // редкий бонус: после хода можно сходить ещё раз
        while (this.s.players[pid] && (await this.offerExtraTurn(epoch, pid))) await this.turn(epoch, pid);
        this.s.turnIdx++;
        this.snapshot();
      }
      this.s.turnIdx = 0;
      this.s.round++;
      this.log(`Круг ${this.s.round}`);
      this.snapshot();
    }
  }

  private occupants(code: number, except?: string) {
    return Object.values(this.s.players).filter((p) => p.pref === code && p.id !== except);
  }

  private async turn(epoch: number, pid: string) {
    const p = this.s.players[pid];
    const st = this.s.settings;
    this.setStage({ t: 'turnStart', pid });
    await this.sleep(epoch, 1800);

    if (p.hp <= 0) await this.revive(epoch, p);

    // ── выбор хода ──
    const from = p.pref!;
    const free = (c: number) => this.occupants(c, pid).length < 2;
    const options = neighbors(from).filter(free);
    const options2 = p.bonuses.move2 > 0 ? atDistance(from, 2).filter(free) : [];
    if (!options.length && !options2.length) {
      this.setStage({ t: 'banner', text: `${p.name}: некуда идти`, sub: 'Ход пропущен' });
      await this.sleep(epoch, 2500);
      return;
    }
    this.setStage({ t: 'move', pid, options, options2 });
    const choice = await this.waitInput(epoch, (m) => {
      if (m.t !== 'pick' || m.kind !== 'move' || m.pid !== pid) return undefined;
      const c = Number(m.value);
      return options.includes(c) || options2.includes(c) ? c : undefined;
    }, p.bot ? 20000 : p.online ? null : 15000); // без связи — случайный ход через 15 c
    const to = choice ?? pick(options.length ? options : options2);
    if (!options.includes(to)) {
      p.bonuses.move2--;
      this.log(`${p.name} использует «${BONUS_INFO.move2.short}»`);
    }
    this.setStage({ t: 'moving', pid, from, to, path: options.includes(to) ? [from, to] : path(from, to) });
    await this.sleep(epoch, 1500);
    p.pref = to;
    const ps = this.s.prefs[to];
    const firstVisit = !ps.rev;
    ps.rev = true;
    ps.visits++;
    this.io.fx?.('arrive', { pid, code: to, firstVisit });
    this.emit();
    if (firstVisit) {
      await this.sleep(epoch, 700);
      this.setStage({ t: 'prefIntro', code: to, pid });
      await this.sleep(epoch, this.hostPaced ? 36e5 : PREF_INTRO_MS);
    }
    await this.gate(epoch);

    // групповая игра — при первом приходе вместо вопроса префектуры
    const game = st.groupPrefs?.[to];
    if (game && !ps.groupDone && this.s.joinOrder.length >= 2) {
      ps.groupDone = true;
      await this.groupGame(epoch, to, game);
    } else await this.prefQuestion(epoch, p, to);

    // магазин — после вопроса, до дуэли
    if (st.shopPrefs?.includes(to) && p.hp > 0) await this.shopVisit(epoch, p);

    // ── дуэль ──
    const other = this.occupants(to, pid)[0];
    if (other && other.hp > 0 && p.hp > 0) await this.duel(epoch, p, other);
  }

  /** вопрос префектуры, куда пришёл (или высадился) игрок p: отвечают все, у p награда больше */
  private async prefQuestion(epoch: number, p: Player, to: number) {
    const st = this.s.settings;
    const pid = p.id;
    const q =
      this.pickQuestion((x) => x.pref === to && !x.special) ??
      this.pickQuestion((x) => x.topic === 'general' && !x.pref && !x.special) ??
      this.pickQuestion((x) => !x.special && x.topic !== 'okinawa');
    if (q) {
      const pids = this.s.joinOrder.filter((id) => this.s.players[id]);
      const removed = await this.bonusPhase(epoch, pids, false, q);
      const res = await this.ask(epoch, q, 'pref', `${PREF[to].ru} ${PREF[to].ja}`, pids, q.time ?? st.questionTime, removed, to);
      const results: Record<string, string> = {};
      const moverOk = res[pid] === q.correct;
      for (const id of pids) {
        const pl = this.s.players[id];
        if (id === pid) {
          if (moverOk) {
            pl.yen += st.reward.moverCorrectYen;
            pl.stars += st.reward.moverCorrectStars;
            results[id] = `+¥${st.reward.moverCorrectYen} +${st.reward.moverCorrectStars}★`;
          } else {
            pl.yen += st.reward.moverWrongYen;
            results[id] = `+¥${st.reward.moverWrongYen}`;
          }
        } else if (res[id] === q.correct) {
          pl.yen += st.reward.otherCorrectYen;
          results[id] = `+¥${st.reward.otherCorrectYen}`;
        }
      }
      await this.reveal(epoch, results);
      if (moverOk) await this.prefReward(epoch, p, to);
    }
  }

  private async prefReward(epoch: number, p: Player, code: number) {
    const st = this.s.settings;
    const ps = this.s.prefs[code];
    // награда префектуры одноразовая: кто первым ответил верно, тот и забрал
    if (ps.taken) return;
    ps.taken = true;
    let reward = ps.reward;
    if (reward === 'prize' && ps.prizeTaken) reward = 'money';
    let text = '';
    switch (reward) {
      case 'money': p.yen += st.reward.prefMoney; text = `+¥${st.reward.prefMoney}`; break;
      case 'stars': p.stars += st.reward.prefStars; text = `+${st.reward.prefStars} ★`; break;
      case 'bonus': {
        const b = pick<BonusId>(['fifty1', 'fifty1', 'fifty2', 'move2']);
        p.bonuses[b]++;
        text = `Бонус: ${BONUS_INFO[b].name}`;
        break;
      }
      case 'special': p.specials++; text = 'Спецвопрос (сила ' + st.specialPower + ')'; break;
      case 'turn2': p.bonuses.turn2 = (p.bonuses.turn2 ?? 0) + 1; text = 'Дополнительный ход'; break;
      case 'prize': {
        ps.prizeTaken = true;
        ps.reward = 'money';
        const name = st.prizeNames.length ? st.prizeNames[randInt(st.prizeNames.length)] : 'Приз';
        p.prizes.push(name);
        this.log(`🏆 ${p.name} получает ПРИЗ: ${name}`);
        this.io.fx?.('prize', { pid: p.id });
        this.setStage({ t: 'prize', pid: p.id, text: name });
        await this.sleep(epoch, 7000);
        return;
      }
    }
    this.setStage({ t: 'reward', pid: p.id, reward, text, pref: code });
    this.io.fx?.('reward', { pid: p.id, reward });
    await this.sleep(epoch, 2600);
  }

  private async revive(epoch: number, p: Player) {
    const st = this.s.settings;
    this.setStage({ t: 'banner', text: `${p.name} восстанавливается`, sub: 'Отдых на Окинаве: ответь, чтобы получить бонус', big: true });
    await this.sleep(epoch, 2500);
    const q = this.pickQuestion((x) => x.topic === 'okinawa') ?? this.pickQuestion((x) => !x.special);
    p.hp = p.maxHp;
    if (!q) return;
    const res = await this.ask(epoch, q, 'revive', 'Окинава · 沖縄', [p.id], q.time ?? st.questionTime);
    const results: Record<string, string> = {};
    if (res[p.id] === q.correct) {
      p.yen += st.reward.reviveYen;
      const b = pick<BonusId>(['fifty1', 'fifty2', 'move2']);
      p.bonuses[b]++;
      results[p.id] = `+¥${st.reward.reviveYen} и ${BONUS_INFO[b].short}`;
    } else results[p.id] = 'Ожил';
    await this.reveal(epoch, results);
  }

  // ───────── дуэль ─────────

  private async duel(epoch: number, att: Player, def: Player) {
    const st = this.s.settings;
    this.s.duel = { attacker: att.id, defender: def.id, round: 1, asker: null, topic: null, special: false, mode: null, lastHit: null, winner: null, over: false };
    this.setStage({ t: 'banner', text: 'ДУЭЛЬ!', sub: `${att.name} нападает на ${def.name}`, big: true });
    this.io.fx?.('duel');
    await this.sleep(epoch, 2800);
    const d = this.s.duel!;
    outer: for (let r = 1; r <= st.duelRounds; r++) {
      for (const asker of [att, def]) {
        if (att.hp <= 0 || def.hp <= 0) break outer;
        await this.gate(epoch);
        const target = asker === att ? def : att;
        d.round = r;
        d.asker = asker.id;
        d.topic = null;
        d.special = false;
        d.mode = null;
        const topics = this.combatTopics().map((t) => t.id);
        const ms = st.pickTime * 1000;
        this.setStage({ t: 'duelPick', pid: asker.id, deadline: this.now + ms, topics, canSpecial: asker.specials > 0, canRhythm: st.rhythmInDuel });
        const choice = await this.waitInput(epoch, (m) => {
          if (m.t !== 'pick' || m.kind !== 'duel' || m.pid !== asker.id) return undefined;
          if (m.value === 'special' && asker.specials > 0) return 'special';
          if (m.value === 'rhythm' && st.rhythmInDuel) return 'rhythm';
          return topics.includes(m.value) ? (m.value as string) : undefined;
        }, ms + 400);
        const pickV = choice ?? pick(topics);

        if (pickV === 'rhythm') {
          d.mode = 'rhythm';
          d.topic = 'music';
          const scores = await this.rhythmBattle(epoch, [asker.id, target.id]);
          const sa = scores[asker.id] ?? 0, sb = scores[target.id] ?? 0;
          if (sa !== sb) {
            const win = sa > sb ? asker : target;
            const lose = win === asker ? target : asker;
            const dmg = win.stats.music ?? st.baseStrength;
            this.hit(lose, dmg);
            this.log(`${win.name} побеждает в ритме: −${dmg} HP у ${lose.name}`);
          } else this.log('Ритм: ничья');
          this.setStage({ t: 'duelResult' });
          await this.sleep(epoch, 3500);
          this.s.rhythm = null;
          continue;
        }

        d.mode = 'quiz';
        let q: Question | null;
        if (pickV === 'special') {
          asker.specials--;
          d.special = true;
          // любой вопрос из спецтем; если их нет — обычный боевой
          q = this.pickQuestion((x) => !!x.special) ?? this.pickQuestion((x) => topics.includes(x.topic));
        } else {
          q = this.pickQuestion((x) => x.topic === pickV && !x.special) ?? this.pickQuestion((x) => topics.includes(x.topic));
        }
        if (!q) continue;
        d.topic = q.topic;
        this.emit();
        // бонусы: сначала атакующий дуэли, потом защитник
        const removed = await this.bonusPhase(epoch, [att.id, def.id], true, q);
        const topicName = this.s.settings.topics.find((t) => t.id === q!.topic)?.name ?? q.topic;
        const res = await this.ask(epoch, q, 'duel', `Дуэль · раунд ${r} · ${d.special ? (st.topics.find((t) => t.id === q!.topic)?.special ? topicName : 'Спецвопрос') : topicName} · спрашивает ${asker.name}`, [asker.id, target.id], q.time ?? st.duelTime, removed, def.pref);
        const okA = res[asker.id] === q.correct, okT = res[target.id] === q.correct;
        const results: Record<string, string> = {};
        if (okA !== okT) {
          const win = okA ? asker : target;
          const lose = okA ? target : asker;
          // спецвопрос бьёт с силой specialPower, если правильно ответил задавший
          const dmg = d.special && win === asker ? st.specialPower : win.stats[q.topic] ?? st.baseStrength;
          this.hit(lose, dmg);
          results[lose.id] = `−${dmg} HP`;
          results[win.id] = `удар ${dmg}`;
        }
        await this.reveal(epoch, results);
      }
    }
    d.over = true;
    d.asker = null;
    const loser = att.hp <= 0 ? att : def.hp <= 0 ? def : null;
    if (loser) {
      const win = loser === att ? def : att;
      d.winner = win.id;
      win.yen += st.reward.duelWinYen;
      win.stars += st.reward.duelWinStars;
      this.log(`${win.name} побеждает в дуэли! ${loser.name} без сил`);
    } else this.log('Дуэль окончена: оба держатся');
    this.setStage({ t: 'duelResult' });
    await this.sleep(epoch, 4500);
    this.s.duel = null;
    this.emit();
  }

  private hit(p: Player, dmg: number) {
    p.hp = Math.max(0, p.hp - dmg);
    if (this.s.duel) this.s.duel.lastHit = { to: p.id, dmg, n: this.stageN };
    this.io.fx?.('hit', { pid: p.id, dmg });
    this.emit();
  }

  private async rhythmBattle(epoch: number, pids: string[]): Promise<Record<string, number | null>> {
    const bpm = 96 + randInt(5) * 8;
    const beats = 36;
    const startAt = this.now + 4500;
    const id = ++this.sec.rhythmN;
    this.s.rhythm = { id, seed: randInt(1e9), bpm, startAt, beats, players: pids, scores: Object.fromEntries(pids.map((p) => [p, null])) };
    this.setStage({ t: 'rhythm' });
    this.io.fx?.('rhythm', this.s.rhythm);
    const dur = (beats * 60000) / bpm;
    await new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearT(t);
        this.skipCbs.delete(done);
        this.rhythmDone = null;
        resolve();
      };
      const t = setT(done, startAt - this.now + dur + 5000);
      this.skipCbs.add(done);
      this.rhythmDone = () => { if (pids.every((p) => this.s.rhythm!.scores[p] != null)) done(); };
    });
    this.check(epoch);
    return this.s.rhythm!.scores;
  }

  private onRhythm(m: Extract<InputMsg, { t: 'rhythm' }>) {
    const r = this.s.rhythm;
    if (!r || r.id !== m.id || !r.players.includes(m.pid) || r.scores[m.pid] != null) return;
    r.scores[m.pid] = Math.max(0, Math.min(100000, Math.round(m.score)));
    this.emit();
    this.rhythmDone?.();
  }

  // ───────── доп. ход ─────────

  private async offerExtraTurn(epoch: number, pid: string): Promise<boolean> {
    const p = this.s.players[pid];
    if (!p || p.hp <= 0 || (p.bonuses.turn2 ?? 0) <= 0) return false;
    const ms = 15000;
    this.setStage({ t: 'extraTurn', pid, deadline: this.now + ms });
    const v = await this.waitInput(epoch, (m) => (m.t === 'pick' && m.kind === 'extra' && m.pid === pid ? !!m.value : undefined), p.online || p.bot ? ms + 400 : 3000);
    if (!v) return false;
    p.bonuses.turn2--;
    this.log(`${p.name} использует «${BONUS_INFO.turn2.name}»`);
    this.setStage({ t: 'banner', text: 'Ещё один ход!', sub: p.name, big: true });
    await this.sleep(epoch, 1800);
    return true;
  }

  // ───────── магазин ─────────

  /** игрок пришёл в префектуру с магазином: решает, зайти ли; ассортимент видит только он */
  private async shopVisit(epoch: number, p: Player, force = false) {
    if (p.bot && !force) return;
    const ms = this.s.settings.shopTime * 1000;
    const stage: Extract<Stage, { t: 'shop' }> = { t: 'shop', pid: p.id, deadline: this.now + ms, entered: false };
    this.setStage(stage);
    const end = stage.deadline + 300;
    while (this.now < end) {
      // без связи долго не ждём
      const v = await this.waitInput(epoch, (m) => (m.t === 'pick' && m.kind === 'shop' && m.pid === p.id ? String(m.value) : undefined), p.online ? end - this.now : Math.min(end - this.now, 8000));
      if (v === 'enter' && !stage.entered) {
        stage.entered = true;
        this.emit();
        continue;
      }
      break;
    }
  }

  // ───────── групповые игры ─────────

  /** рисунки текущей групповой игры (только на ТВ, в состояние не попадают) */
  groupImgs: Record<string, string | null> = {};
  private drawParts: Record<string, string[]> = {};
  private votes: Record<string, number[]> = {};
  private groupDone: (() => void) | null = null;

  private async groupGame(epoch: number, code: number, game: GroupGameId) {
    const st = this.s.settings;
    const tasks = groupTasksFor(st, game);
    const used = (this.sec.usedTasks ??= []);
    const fresh = tasks.filter((t) => !used.includes(t.id));
    const task = fresh.length ? pick(fresh) : tasks.length ? pick(tasks) : null;
    if (task) used.push(task.id);
    const players = this.s.joinOrder.filter((id) => this.s.players[id]);
    const g: GroupPublic = {
      id: (this.sec.groupN = (this.sec.groupN ?? 0) + 1), game, prompt: task?.text ?? 'Нарисуйте любой кандзи', pref: code,
      ...(game === 'fukuwarai' ? { face: task?.face ?? 'okame' } : {}),
      phase: 'intro', players, startAt: 0, deadline: 0, order: shuffle(players), submitted: [], showIdx: 0, voteRound: 0,
      voteRounds: Math.min(3, players.length - 1), voted: [],
    };
    this.groupImgs = {};
    this.drawParts = {};
    this.votes = {};
    this.s.g = g;
    this.setStage({ t: 'group' });
    this.io.fx?.('group', g);
    // ведущий зачитывает задание
    await this.sleep(epoch, this.hostPaced ? 36e5 : 6000);

    // ── рисуем ──
    g.phase = 'draw';
    g.startAt = this.now + LEAD;
    g.deadline = g.startAt + groupTime(st, game) * 1000;
    this.emit();
    this.botDraw(g);
    await new Promise<void>((resolve) => {
      const done = () => { clearT(t); this.skipCbs.delete(done); this.groupDone = null; resolve(); };
      // после конца времени ждём, пока рисунки долетят
      const t = setT(done, g.deadline - this.now + 8000);
      this.skipCbs.add(done);
      this.groupDone = () => { if (g.players.every((id) => g.submitted.includes(id) || !this.s.players[id])) done(); };
    });
    this.check(epoch);
    // ведущий закончил раньше — телефоны увидят смену фазы и сдадут рисунки; ждём их чуть-чуть
    if (g.players.some((id) => !g.submitted.includes(id) && this.s.players[id]?.online)) {
      g.phase = 'show';
      g.showIdx = -1;
      this.emit();
      const until = this.now + 4000;
      while (this.now < until && g.players.some((id) => !g.submitted.includes(id) && this.s.players[id]?.online)) {
        await new Promise<void>((r) => { this.groupDone = r; setT(r, until - this.now); });
        this.check(epoch);
      }
      this.groupDone = null;
    }
    // кто не успел прислать — пустой лист
    for (const id of g.players) if (!(id in this.groupImgs)) this.groupImgs[id] = null;

    // ── показ работ по одной ──
    g.phase = 'show';
    for (let i = 0; i < g.order.length; i++) {
      g.showIdx = i;
      this.emit();
      await this.sleep(epoch, st.group.showMs);
    }

    // ── голосование: за 1, 2 и 3 место по очереди ──
    g.phase = 'vote';
    for (let r = 1; r <= g.voteRounds; r++) {
      await this.gate(epoch);
      g.voteRound = r;
      g.voted = [];
      g.startAt = this.now + LEAD;
      g.deadline = g.startAt + st.group.voteTime * 1000;
      this.emit();
      const voters = () => g.players.filter((id) => this.s.players[id] && (this.s.players[id].online || this.s.players[id].bot));
      const end = g.deadline + ANSWER_GRACE;
      while (voters().some((id) => !g.voted.includes(id)) && this.now < end) {
        const m = await this.waitInput(epoch, (x) => {
          if (x.t !== 'pick' || x.kind !== 'vote' || !g.players.includes(x.pid) || g.voted.includes(x.pid)) return undefined;
          const n = Number(x.value);
          const mine = this.votes[x.pid] ?? [];
          if (!(n >= 1 && n <= g.order.length) || g.order[n - 1] === x.pid || mine.includes(n)) return undefined;
          return { pid: x.pid, n };
        }, end - this.now);
        if (!m) break;
        (this.votes[m.pid] ??= [])[r - 1] = m.n;
        g.voted.push(m.pid);
        this.io.fx?.('answered', { pid: m.pid });
        this.emit();
      }
    }

    // ── итоги: 3 очка за голос «1 место», 2 — за второе, 1 — за третье ──
    const points: Record<string, number> = Object.fromEntries(g.players.map((id) => [id, 0]));
    for (const vs of Object.values(this.votes)) vs.forEach((n, i) => { if (n) points[g.order[n - 1]] += 3 - i; });
    // одинаковые очки — одно место на всех (1, 1, 2, 3…)
    const levels = [...new Set(Object.values(points).filter((x) => x > 0))].sort((a, b) => b - a);
    const places: Record<string, number> = {};
    const awards: Record<string, string> = {};
    for (const id of g.players) {
      const lv = levels.indexOf(points[id]);
      const p = this.s.players[id];
      if (lv < 0 || lv > 2 || !p) continue;
      places[id] = lv + 1;
      const pr = st.group.prizes[lv] ?? { yen: 0, stars: 0 };
      p.yen += pr.yen;
      p.stars += pr.stars;
      awards[id] = [pr.yen ? `+¥${pr.yen}` : '', pr.stars ? `+${pr.stars}★` : ''].filter(Boolean).join(' ');
    }
    g.points = points;
    g.places = places;
    g.awards = awards;
    g.phase = 'results';
    this.emit();
    this.io.fx?.('prize', {});
    const win = g.players.filter((id) => places[id] === 1).map((id) => this.s.players[id]?.name).filter(Boolean);
    if (win.length) this.log(`🖌 Каллиграфия: побеждает ${win.join(', ')}`);
    await this.sleep(epoch, this.hostPaced ? 36e5 : 12000);
    this.s.g = null;
    this.groupImgs = {};
    this.emit();
  }

  private onDraw(m: Extract<InputMsg, { t: 'draw' }>) {
    const g = this.s.g;
    if (!g || g.id !== m.id || !g.players.includes(m.pid) || g.submitted.includes(m.pid)) return;
    if (g.phase !== 'draw' && !(g.phase === 'show' && g.showIdx < 0)) return;
    const total = Math.max(1, Math.min(40, m.total | 0));
    const parts = (this.drawParts[m.pid] ??= new Array(total).fill(''));
    if (!(m.part >= 0 && m.part < total) || typeof m.data !== 'string') return;
    parts[m.part] = m.data;
    if (parts.some((x) => !x)) return;
    const url = parts.join('');
    delete this.drawParts[m.pid];
    this.groupImgs[m.pid] = url.startsWith('data:image/') || (url.startsWith('text:') && url.length < 300) ? url : null;
    g.submitted.push(m.pid);
    this.io.fx?.('answered', { pid: m.pid });
    this.emit();
    this.groupDone?.();
  }

  /** боты сдают работу незадолго до конца времени: в сэнрю — готовую строку, иначе пустой лист */
  private botDraw(g: GroupPublic) {
    const lines = ['И снова понедельник', 'Сакэ закончилось', 'Где же мой зонтик?', 'А я сплю в метро', 'Котик съел суши', 'Опять дедлайн'];
    for (const id of g.players) if (this.s.players[id]?.bot) {
      setT(() => {
        if (this.s.g !== g || g.submitted.includes(id)) return;
        this.groupImgs[id] = g.game === 'senryu' ? 'text:' + pick(lines) : null;
        g.submitted.push(id);
        this.emit();
        this.groupDone?.();
      }, Math.max(0, g.deadline - this.now - 1000 - randInt(3000)));
    }
  }

  // ───────── бонусы ─────────

  private async bonusPhase(epoch: number, pids: string[], sequential: boolean, q: Question): Promise<Record<string, number[]>> {
    const removed: Record<string, number[]> = {};
    const st = this.s.settings;
    const offersFor = (id: string): BonusId[] => {
      const p = this.s.players[id];
      return p ? (['fifty1', 'fifty2'] as BonusId[]).filter((b) => p.bonuses[b] > 0) : [];
    };
    const groups = sequential ? pids.map((p) => [p]) : [pids];
    for (const g of groups) {
      const who = g.filter((id) => offersFor(id).length);
      if (!who.length) continue;
      const offers = Object.fromEntries(who.map((id) => [id, offersFor(id)]));
      const ms = st.bonusTime * 1000;
      const stage: Stage = { t: 'bonus', pids: who, deadline: this.now + ms, offers, picked: {} };
      this.setStage(stage);
      const end = this.now + ms + 300;
      while (who.some((id) => !(id in stage.picked)) && this.now < end) {
        const m = await this.waitInput(epoch, (x) => (x.t === 'pick' && x.kind === 'bonus' && who.includes(x.pid) && !(x.pid in stage.picked) ? x : undefined), end - this.now);
        if (!m) break;
        const b = m.value as BonusId | null;
        stage.picked[m.pid] = b && offers[m.pid].includes(b) ? b : 'none';
        this.emit();
      }
      for (const id of who) {
        const b = stage.picked[id];
        if (b && b !== 'none') {
          this.s.players[id].bonuses[b]--;
          const wrong = shuffle([0, 1, 2, 3].filter((i) => i !== q.correct));
          removed[id] = wrong.slice(0, b === 'fifty2' ? 2 : 1);
        }
      }
    }
    return removed;
  }

  // ───────── вопросы ─────────

  private pickQuestion(f: (q: Question) => boolean): Question | null {
    // вопросы спецтем считаются спецвопросами, даже если галочка не стоит
    const st = this.s.settings;
    const all = this.questions.filter((q) => q.answers?.length === 4 && f(isSpecialQ(st, q) === !!q.special ? q : { ...q, special: isSpecialQ(st, q) }));
    if (!all.length) return null;
    const fresh = all.filter((q) => !this.sec.used.includes(q.id));
    const q = pick(fresh.length ? fresh : all);
    if (!fresh.length) this.sec.used = this.sec.used.filter((id) => !all.some((x) => x.id === id));
    this.sec.used.push(q.id);
    return q;
  }

  private async ask(epoch: number, q: Question, context: QContext, title: string, participants: string[], timeSec: number, removed: Record<string, number[]> = {}, pref: number | null = null): Promise<Record<string, number | null>> {
    const n = ++this.sec.qn;
    this.curCorrect = q.correct;
    const reading = this.hostPaced;
    const pq: PublicQuestion = {
      qid: q.id, n, context, title, text: q.text, media: q.media, answers: q.answers, answerImages: !!q.answerImages,
      topic: q.topic, special: isSpecialQ(this.s.settings, q), startAt: 0, deadline: 0, participants, answered: [], removed, revealed: false,
      orders: answerOrders(Object.keys(this.s.players)),
      ...(reading ? { reading } : {}),
      ...(pref ? { pref } : {}),
    };
    this.s.q = pq;
    this.choices = {};
    this.setStage({ t: 'question' });
    this.io.fx?.('question', pq);
    // ведущий читает вопрос вслух; ответы и таймер — по «Далее»
    if (reading) {
      await this.sleep(epoch, 36e5);
      delete pq.reading;
    }
    pq.startAt = this.now + LEAD;
    const deadline = pq.deadline = pq.startAt + timeSec * 1000;
    this.emit();
    await new Promise<void>((resolve) => {
      const done = () => { clearT(t); this.skipCbs.delete(done); this.qDone = null; resolve(); };
      const t = setT(done, deadline - this.now + ANSWER_GRACE);
      this.skipCbs.add(done);
      this.qDone = done;
    });
    this.check(epoch);
    const out: Record<string, number | null> = {};
    for (const id of participants) out[id] = this.choices[id] ?? null;
    return out;
  }

  private choices: Record<string, number> = {};

  /** вопрос ведёт ведущий кнопкой «Далее» (по умолчанию да) */
  private get hostPaced() {
    return this.s.settings.hostPaced !== false;
  }

  private onAnswer(m: Extract<InputMsg, { t: 'answer' }>) {
    const q = this.s.q;
    if (!q || q.revealed || q.reading || q.n !== m.n || !q.participants.includes(m.pid) || m.pid in this.choices) return;
    if (m.choice < 0 || m.choice > 3 || q.removed[m.pid]?.includes(m.choice)) return;
    const t = this.now;
    // ответ засчитывается по времени нажатия (в часах хоста), с защитой от подделки
    const at = Math.min(m.at ?? t, t);
    if (at > q.deadline + 150 || t > q.deadline + ANSWER_GRACE) return;
    this.choices[m.pid] = m.choice;
    q.answered.push(m.pid);
    this.io.fx?.('answered', { pid: m.pid });
    this.emit();
    if (q.participants.every((id) => id in this.choices || !this.s.players[id])) this.qDone?.();
  }

  private async reveal(epoch: number, results: Record<string, string>) {
    const q = this.s.q!;
    q.revealed = true;
    q.correct = this.curCorrect;
    q.choices = Object.fromEntries(q.participants.map((id) => [id, this.choices[id] ?? null]));
    q.results = results;
    this.emit();
    this.io.fx?.('reveal', q);
    // без авто-перехода ответ висит, пока ведущий не нажмёт «Далее»
    await this.sleep(epoch, this.s.settings.autoAdvance && !this.hostPaced ? this.s.settings.revealMs : 36e5);
    this.s.q = null;
    this.emit();
  }

  // ───────── игроки ─────────

  private alivePids() {
    return this.s.joinOrder.filter((id) => this.s.players[id]);
  }

  private newPlayer(name: string, color: string, hat: number, bot = false): Player {
    const st = this.s.settings;
    const stats: Record<TopicId, number> = {};
    const calib: Record<TopicId, number> = {};
    for (const t of st.topics.filter((x) => x.combat)) { stats[t.id] = st.baseStrength; calib[t.id] = 0; }
    return {
      id: uid(10), name, color, hat, pref: null, hp: st.startHp, maxHp: st.startHp, yen: 0, stars: 0, stats, calib,
      bonuses: { fifty1: 0, fifty2: 0, move2: 0, turn2: 0 }, specials: 0, prizes: [], online: true, busy: null, bot,
    };
  }

  private onHello(m: Extract<InputMsg, { t: 'hello' }>) {
    const p = m.pid ? this.s.players[m.pid] : null;
    if (p && !p.online) { p.online = true; this.log(`${p.name} на связи`); }
    this.sendFull();
  }

  private onJoin(m: Extract<InputMsg, { t: 'join' }>) {
    const name = String(m.name ?? '').trim().slice(0, 16);
    const err = (e: string) => this.io.broadcast({ t: 'joinErr', cid: m.cid, err: e });
    if (!name) return err('Введите имя');
    if (this.s.phase !== 'lobby') return err('Игра уже идёт. Если ты уже играешь — нажми «Я уже в игре».');
    if (this.s.joinOrder.length >= 10) return err('Уже 10 игроков — мест нет');
    if (Object.values(this.s.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) return err('Это имя уже занято');
    const p = this.newPlayer(name, m.color, m.hat);
    const pin = String(1000 + randInt(9000));
    this.s.players[p.id] = p;
    this.s.joinOrder.push(p.id);
    this.sec.pins[p.id] = pin;
    this.io.broadcast({ t: 'joined', cid: m.cid, pid: p.id, pin });
    this.io.fx?.('join', { pid: p.id });
    this.log(`${name} в игре!`);
    this.snapshot();
  }

  private onRestore(m: Extract<InputMsg, { t: 'restore' }>) {
    const p = Object.values(this.s.players).find((x) => x.name.toLowerCase() === String(m.name).trim().toLowerCase());
    if (!p || this.sec.pins[p.id] !== String(m.pin).trim()) return this.io.broadcast({ t: 'joinErr', cid: m.cid, err: 'Неверное имя или PIN' });
    p.online = true;
    this.io.broadcast({ t: 'joined', cid: m.cid, pid: p.id, pin: this.sec.pins[p.id] });
    this.log(`${p.name} вернулся`);
    this.sendFull();
  }

  setOffline(pid: string) {
    const p = this.s.players[pid];
    if (p && p.online && !p.bot) { p.online = false; this.emit(); }
  }

  private kick(pid: string) {
    if (!this.s.players[pid]) return;
    const name = this.s.players[pid].name;
    delete this.s.players[pid];
    this.s.joinOrder = this.s.joinOrder.filter((x) => x !== pid);
    const idx = this.s.turnOrder.indexOf(pid);
    if (idx >= 0) {
      this.s.turnOrder.splice(idx, 1);
      if (idx < this.s.turnIdx) this.s.turnIdx--;
    }
    this.log(`${name} удалён из игры`);
    this.qDone && this.s.q && this.s.q.participants.every((id) => id in this.choices || !this.s.players[id]) && this.qDone();
    this.snapshot();
  }

  // ───────── запросы с телефона (магазин, мини-игры) ─────────

  private onReq(m: Extract<InputMsg, { t: 'req' }>) {
    const p = this.s.players[m.pid];
    const reply = (ok: boolean, data?: any, err?: string) => this.io.broadcast({ t: 'res', pid: m.pid, rid: m.rid, ok, data, err });
    if (!p) return reply(false, null, 'Нет такого игрока');
    const st = this.s.settings;
    const a = m.args ?? {};
    const pay = (c: { yen: number; stars: number }) => {
      if (p.yen < c.yen || p.stars < c.stars) return false;
      p.yen -= c.yen;
      p.stars -= c.stars;
      return true;
    };
    switch (m.op) {
      case 'buy': {
        const ss = this.s.stage;
        if (ss.t !== 'shop' || ss.pid !== p.id || !ss.entered) return reply(false, null, 'Покупки — только в магазине');
        const item = a.item as keyof Settings['shop'];
        const cost = st.shop[item];
        if (!cost) return reply(false, null, 'Нет такого товара');
        if (item === 'stat' && !(a.topic in p.stats)) return reply(false, null, 'Выбери тему');
        if (!pay(cost)) return reply(false, null, 'Не хватает денег');
        if (item === 'special') p.specials++;
        else if (item === 'hp') { p.maxHp += st.shop.hp.amount; p.hp += st.shop.hp.amount; }
        else if (item === 'stat') p.stats[a.topic]++;
        else p.bonuses[item as BonusId]++;
        this.log(`${p.name} купил: ${shopName(item, st, a.topic)}`);
        this.emit();
        return reply(true);
      }
      case 'pachiBuy': {
        if (!st.pachinkoPrefs.includes(p.pref!)) return reply(false, null, 'Здесь нет пачинко');
        const packs = Math.max(1, Math.min(10, Math.floor(a.packs ?? 1)));
        const balls = packs * st.pachinko.pack;
        const cost = balls * st.pachinko.yenPerBall;
        if (p.yen < cost) return reply(false, null, 'Не хватает йен');
        p.yen -= cost;
        p.busy = 'pachinko';
        this.emit();
        return reply(true, { balls });
      }
      case 'pachiCash': {
        const balls = Math.max(0, Math.min(20000, Math.floor(a.balls ?? 0)));
        const yen = balls * st.pachinko.yenPerBall;
        p.yen += yen;
        if (a.exit) p.busy = null;
        if (yen > 0) this.log(`${p.name} обменял ${balls} шариков на ¥${yen}`);
        this.emit();
        return reply(true, { yen });
      }
      case 'busy':
        p.busy = a.busy ?? null;
        this.emit();
        return reply(true);
      case 'ringStart': {
        if (!st.ringPrefs.includes(p.pref!)) return reply(false, null, 'Здесь нет призовой машины');
        if (!pay({ yen: st.ring.cost, stars: 0 })) return reply(false, null, 'Не хватает йен');
        const seed = randInt(1e9);
        const t0 = this.now + 1200;
        this.sec.ring[p.id] = { seed, t0 };
        p.busy = 'ring';
        this.emit();
        this.io.fx?.('ring', { pid: p.id, seed, t0, cellMs: st.ring.cellMs, physical: st.ring.physicalPrize });
        return reply(true, { seed, t0, cellMs: st.ring.cellMs, physical: st.ring.physicalPrize });
      }
      case 'ringStop': {
        const r = this.sec.ring[p.id];
        if (!r) return reply(false, null, 'Игра не начата');
        delete this.sec.ring[p.id];
        const t = this.now;
        // время нажатия по часам хоста (от телефона), не позже прихода и не раньше старта
        let at = Number(a.at);
        if (!isFinite(at) || at > t + 50 || at < t - 3000) at = t;
        at = Math.max(at, r.t0);
        const { cell } = ringCellAt(r.t0, at, st.ring.cellMs);
        const res = ringResult(ringLayout(r.seed, st.ring.physicalPrize), cell);
        p.busy = null;
        if (res === 'green') { p.yen += st.ring.prizeYen; this.log(`${p.name} выиграл в призовой машине ¥${st.ring.prizeYen}!`); }
        if (res === 'gold') {
          const name = st.prizeNames[randInt(st.prizeNames.length)] ?? 'Приз';
          p.prizes.push(name);
          this.log(`🏆 ${p.name} выиграл ПРИЗ в призовой машине: ${name}`);
          this.io.fx?.('prize', { pid: p.id });
        }
        this.emit();
        this.io.fx?.('ringStop', { pid: p.id, cell, res, at });
        return reply(true, { cell, res, at });
      }
    }
    reply(false, null, 'Неизвестная операция');
  }

  // ───────── боты (для тестов без телефонов) ─────────

  addBot() {
    if (this.s.phase !== 'lobby' || this.s.joinOrder.length >= 10) return;
    const names = ['Тануки', 'Кицунэ', 'Нэко', 'Сакура', 'Кайдзю', 'Тэнгу', 'Каппа', 'Онигири', 'Дарума', 'Моти'];
    const used = new Set(Object.values(this.s.players).map((p) => p.name));
    const name = names.find((n) => !used.has('🤖' + n)) ?? 'Бот' + randInt(100);
    const colors = ['#ff4d6d', '#4dabff', '#ffd23f', '#5ce16b', '#c77dff', '#ff9f43', '#2ee6d6', '#ff7ad9', '#a3a3ff', '#f5f5f5'];
    const p = this.newPlayer('🤖' + name, colors[this.s.joinOrder.length % colors.length], randInt(5), true);
    this.s.players[p.id] = p;
    this.s.joinOrder.push(p.id);
    this.sec.pins[p.id] = '0000';
    this.emit();
  }

  private botLater(key: string, ms: number, fn: () => void) {
    const k = this.stageN + ':' + key;
    if (this.botKeys.has(k)) return;
    this.botKeys.add(k);
    if (this.botKeys.size > 500) this.botKeys = new Set([...this.botKeys].slice(-100));
    setT(fn, ms);
  }

  private botTick() {
    const st = this.s.stage;
    const bots = Object.values(this.s.players).filter((p) => p.bot);
    if (!bots.length) return;
    const isBot = (id: string) => !!this.s.players[id]?.bot;
    if (st.t === 'landing' && isBot(st.pid)) {
      this.botLater('land', 1200, () => {
        const allowed = PREF_CODES.filter((c) => !st.blocked.includes(c));
        this.handle({ t: 'pick', pid: st.pid, kind: 'landing', value: pick(allowed) });
      });
    }
    if (st.t === 'move' && isBot(st.pid)) {
      this.botLater('move', 1500, () => this.handle({ t: 'pick', pid: st.pid, kind: 'move', value: pick([...st.options, ...st.options2]) }));
    }
    if (st.t === 'bonus') {
      for (const id of st.pids) if (isBot(id)) this.botLater('bonus' + id, 800 + randInt(1500), () =>
        this.handle({ t: 'pick', pid: id, kind: 'bonus', value: Math.random() < 0.5 ? st.offers[id][0] : null }));
    }
    if (st.t === 'extraTurn' && isBot(st.pid)) {
      this.botLater('extra', 1200, () => this.handle({ t: 'pick', pid: st.pid, kind: 'extra', value: Math.random() < 0.7 }));
    }
    if (st.t === 'duelPick' && isBot(st.pid)) {
      this.botLater('duel', 1500, () => {
        const opts: string[] = [...st.topics];
        if (st.canSpecial) opts.push('special');
        if (st.canRhythm) opts.push('rhythm');
        this.handle({ t: 'pick', pid: st.pid, kind: 'duel', value: pick(opts) });
      });
    }
    const q = this.s.q;
    if (st.t === 'question' && q && !q.revealed && !q.reading) {
      for (const id of q.participants) if (isBot(id)) {
        const n = q.n;
        this.botLater('ans' + id + n, Math.max(0, q.startAt - this.now) + 1500 + randInt(7000), () => {
          const removed = q.removed[id] ?? [];
          const opts = [0, 1, 2, 3].filter((i) => !removed.includes(i));
          const choice = Math.random() < 0.55 ? this.curCorrect : pick(opts);
          this.handle({ t: 'answer', pid: id, n, choice, at: this.now });
        });
      }
    }
    const g = this.s.g;
    if (st.t === 'group' && g && g.phase === 'vote') {
      for (const id of g.players) if (isBot(id) && !g.voted.includes(id)) {
        const round = g.voteRound;
        this.botLater('vote' + id + g.id + '_' + round, 1000 + randInt(3000), () => {
          if (this.s.g !== g || g.voteRound !== round) return;
          const mine = this.votes[id] ?? [];
          const opts = g.order.map((_, i) => i + 1).filter((n) => g.order[n - 1] !== id && !mine.includes(n));
          if (opts.length) this.handle({ t: 'pick', pid: id, kind: 'vote', value: pick(opts) });
        });
      }
    }
    const r = this.s.rhythm;
    if (st.t === 'rhythm' && r) {
      for (const id of r.players) if (isBot(id)) {
        const dur = (r.beats * 60000) / r.bpm;
        this.botLater('rh' + id + r.id, Math.max(0, r.startAt - this.now) + dur + 500, () =>
          this.handle({ t: 'rhythm', pid: id, id: r.id, score: 400 + randInt(800), hits: 0, total: 0 }));
      }
    }
  }
}

export function shopName(item: string, st: Settings, topic?: string) {
  switch (item) {
    case 'special': return 'Спецвопрос';
    case 'hp': return `+${st.shop.hp.amount} к макс. HP`;
    case 'stat': return `+1 к силе «${st.topics.find((t) => t.id === topic)?.name ?? topic}»`;
    default: return BONUS_INFO[item as BonusId]?.name ?? item;
  }
}

export { REWARD_INFO, RHYTHM_LEAD_BEATS };
