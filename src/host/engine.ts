// Игровой движок хоста. Работает во вкладке ТВ (или headless в тесте).
// Сценарий написан последовательно через async/await; ожидания можно пропустить
// кнопкой ведущего «Далее». Снапшот сохраняется на контрольных точках,
// после перезагрузки ТВ игра продолжается с начала текущего хода.
import type {
  BonusId, DragonPublic, GameMsg, GameState, GroupGameId, GroupPublic, IaiRound, InputMsg, Player, PublicQuestion, Question, QContext, RewardType, Settings, SoloGameId, Stage, TopicId,
  Difficulty, KaijuPublic,
} from '../shared/types';
import { BONUS_INFO, COIN_DMG, catTopicOf, kaijuSettings, sumoSettings, FARM_NO, OKINAWA_NOTE, GROUP_GAMES, REWARD_INFO, SOLO_GAMES, dragonSettings, groupTime, iaidoRounds, isSpecialQ, soloAt, tasksForPref } from '../shared/settings';
import { FISH, cutForGrams, pieceGrams, randomTarget } from '../games/sashimi';
import { botHunter, botZilla, kaijuAwards, startCell, stepCell } from '../games/kaiju';
import { NOODLES, noodleOf, noodleScore, parseNoodle } from '../games/noodles';
import { ANGLE_MAX, ANGLE_MIN, PIT_TRIES, parsePits, pitDistance, randomWind } from '../games/cherry';
import { buildDebugScene } from './debugScenes';
import { OKINAWA, PREF, PREF_CODES, atDistance, isCoastal, neighbors, path, prefName } from '../map/mapData';
import { COUNTDOWN_MS } from '../shared/types';
import { pick, randInt, shuffle, uid } from '../shared/util';
import { AKITA_PREF, HATS, cleanLook, randomLook, type Look } from '../shared/look';
import { RHYTHM_TRACKS } from '../games/rhythmTracks';
import { RHYTHM_LEAD_BEATS, RING_CELLS, RING_PRIZE_INFO, RING_SLOW_MAX, RING_SLOW_MIN, RING_SLOW_MS, dragonTimes, dragonWindow, ringCellAt, ringLayout, ringResult } from '../games/logic';
import { SUDOKU_LEVELS, isSolved, makeSudoku } from '../games/sudoku';
import { clearT, setT } from './timers';
import { FLAG_CODES, flagUrl } from '../shared/flags';
import { EPOCHS, FIND_INFO, PRIZE_TIERS, TIER_INFO, epochFor, epochOf, epochRatesFor, fmtMul, median, netWorth, ratesOf, rewardYen, shopCost, tokensFor, tokensValue, type FindId, type PrizeTier } from '../shared/economy';
import { computeTitles, placePoints, type Tally } from '../shared/titles';
import { makeReelSpin, makeWheelSpin, wheelFinalRot } from '../shared/spin';
import { CAR_LOST, carName, dealerAt, type CarId } from '../shared/cars';
import { TRACKS, botRun, makeTrack, trackFor } from '../shared/race';
import { priceYen } from '../shared/economy';

export interface HostIO {
  now(): number;
  broadcast(msg: GameMsg): void;
  save(data: any): void;
  /** события для ТВ: звуки, эффекты, пнп */
  fx?(kind: string, data?: any): void;
  /** длина своего звука события, мс (0 — нет файла); иайдо ждёт, пока доиграет «нагнетание» */
  soundMs?(id: string): number;
}

class Aborted extends Error {}
/** игрока, чей сейчас ход, удалили — ход обрывается, игра идёт дальше */
class Kicked extends Error {}
const ANSWER_GRACE = 700; // мс: льгота на доставку ответа после дедлайна
const LEAD = 700; // мс: задержка старта таймера, чтобы вопрос успел дойти до всех
const PREF_INTRO_MS = 5000; // мс: интро префектуры при первом входе
const DRAGON_GRACE = 900; // мс: ждём промахи с телефонов, прежде чем засчитать шаг
const DRAGON_SILENT = 6000; // мс: телефон молчит так долго во время танца — игрок выбыл

interface Secrets {
  pins: Record<string, string>;
  used: string[];
  qn: number;
  logN: number;
  calibIdx: number;
  landingIdx: number;
  rhythmN: number;
  /** треки ритм-игры, ещё не сыгранные (каждая песня — один раз за игру; кончились — ритм-баттла больше нет) */
  rhythmBag?: number[];
  ring: Record<string, { seed: number; t0: number }>;
  groupN?: number;
  usedTasks?: string[];
  /** судоку: пройденных уровней и текущая головоломка игрока */
  sudoku?: Record<string, { level: number; puzzle: number[] }>;
  /** онсэн: где игрок уже вылечился (до ухода из префектуры) */
  onsen?: Record<string, number>;
  /** кто уже видел интро Окинавы (первое воскрешение) */
  okinawaSeen?: string[];
  /** защита от фарма: на каком своём ходу игрок последний раз играл в денежную соло-игру в префектуре */
  soloPlayed?: Record<string, Record<number, number>>;
  /** вопросы префектур, которые больше не задаются (одноразовые заданы, цикличные решены) */
  qDone?: string[];
  /** все заданные за игру вопросы — для связки «не раньше вопроса…» */
  asked?: string[];
  /** порядок тем калибровки (темы с вопросами «в числе первых» — вперёд) */
  calibOrder?: string[];
  /** финальное сумо: скрытый урон каждого и запас хода до края */
  sumo?: { dmg: Record<string, number>; cap: number; fixed: boolean };
  /** вопросы-флаги: текущие неверные варианты и уже выбранные (их больше не показываем) */
  flags?: Record<string, { decoys: number[]; banned: number[] }>;
  /** префектуры, чей флаг уже угадали, — по порядку (первые угаданные игроки скорее забыли) */
  flagSolved?: number[];
  /** выданные призы по рангам: чтобы один и тот же приз не выпал дважды */
  prizesGiven?: string[];
  /** находки: сколько своих ходов сделал игрок, на каком ходу была последняя находка; находок в текущем круге */
  ownTurns?: Record<string, number>;
  findAt?: Record<string, number>;
  findsRound?: { round: number; n: number };
  /** счётчики для титулов в финале (shared/titles.ts) */
  tally?: Tally;
  /** последний круг: кому выпадет жетон (аутсайдеры) */
  outsiders?: string[];
  /** титулы финала — чтобы вернуться к ним после колеса призов */
  titles?: Record<string, string[]>;
}

/** барабан бонуса: одинаковые ячейки, повторы задают вероятность (как прежний пул наград «Бонус») */
// сапога больше нет: его заменили машины (shared/cars.ts)
const BONUS_REEL: BonusId[] = ['fifty1', 'coin', 'fifty2', 'ticket', 'fifty1', 'ticket', 'coin'];

const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

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
  /** чей сейчас ход (или высадка): если этого игрока удалят, ход оборвётся */
  private turnPid: string | null = null;
  /** таймеры ожиданий сценария: на паузе замирают, после неё идут дальше с того же места */
  private pts = new Set<{ fire: () => void; left: number; at: number; id: any }>();

  constructor(private io: HostIO, room: string, settings: Settings, questions: Question[], snapshot?: { s: GameState; sec: Secrets } | null) {
    this.questions = questions;
    if (snapshot) {
      this.s = snapshot.s;
      this.sec = snapshot.sec;
      this.s.settings = settings;
      // ТВ перезагрузился: телефоны никуда не делись, но отзовутся только со следующим пингом (до 15 c).
      // Считаем всех на связи — иначе ходящего за эти секунды передвинуло бы случайно, а магазин закрылся бы сам.
      // Кто на самом деле пропал — отметится «не на связи» через 45 c молчания (host.ts)
      for (const p of Object.values(this.s.players)) { p.online = true; p.busy = null; this.lastSeen[p.id] = Date.now(); }
      this.s.q = null;
      this.s.duel = null;
      this.s.rhythm = null;
      this.s.race = null;
      this.s.g = null;
      this.s.dr = null;
      this.s.kj = null;
      this.s.paused = false;
      this.s.pausedAt = null;
      // вращение призового кольца перезагрузку не переживает: попытку возвращаем
      for (const id of Object.keys(this.sec.ring ?? {})) this.ringCancel(id);
      // ТВ перезагрузился посреди вращения: таймеров больше нет — выдаём выпавшее сразу
      for (const p of Object.values(this.s.players)) if (p.reel?.spin && !p.reel.done) this.grantReel(p, p.reel);
      const w = this.s.wheel;
      if (w?.spinner && w.spin) this.wheelDone(w, w.spinner, w.segs[w.spin.result]?.id);
    } else {
      this.s = {
        v: 0, room, stage: { t: 'lobby', show: 'blank' }, players: {}, joinOrder: [], turnOrder: [], turnIdx: 0, round: 1,
        prefs: {}, q: null, duel: null, rhythm: null, g: null, dr: null, kj: null, log: [], settings, paused: false, phase: 'lobby', debug: null,
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
      case 'dragon': return this.onDragon(m);
      case 'pnp': return this.io.fx?.('pnp', m);
      case 'ctl': return this.onCtl(m.cmd, m.args);
    }
    if (m.t === 'pick' && m.kind === 'noodle') return this.onNoodle(m.pid, m.value);
    if (m.t === 'pick' && m.kind === 'cherry') return this.onPit(m.pid, m.value);
    if (m.t === 'pick' && m.kind === 'race') return this.onRace(m.pid, m.value);
    if (m.t === 'pick' && m.kind === 'kaiju') return this.onKaiju(m.pid, m.value);
    this.feed(m);
  }

  onCtl(cmd: string, args?: any) {
    switch (cmd) {
      case 'start':
        if (this.s.phase === 'lobby' && this.s.joinOrder.length) this.feed({ t: '__start' } as any);
        break;
      case 'next': {
        // лобби: пустой фон → интро → тропа с QR; игру «Далее» не запускает — только «Начать игру»
        const st = this.s.stage;
        if (this.s.phase === 'lobby' && st.t === 'lobby' && st.show && st.show !== 'walk') {
          this.setStage({ t: 'lobby', show: st.show === 'blank' ? 'intro' : 'walk', at: this.now });
          this.snapshot();
          break;
        }
        this.skip();
        break;
      }
      case 'pause':
        this.setPaused(!this.s.paused);
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
        if (!p || !PREF_CODES.includes(code)) break;
        p.pref = code;
        this.s.prefs[code] && (this.s.prefs[code].rev = true);
        this.log(`Ведущий переместил ${p.name}: ${PREF[code].ru}`);
        this.emit();
        break;
      }
      case 'settings':
        if (args) { this.s.settings = args; this.emit(); }
        break;
      case 'auto': {
        // галочки пульта: интро → вопрос и вопрос → ответы без «Далее»
        const st = this.s.settings;
        if (typeof args?.autoIntro === 'boolean') st.autoIntro = args.autoIntro;
        if (typeof args?.autoReading === 'boolean') st.autoReading = args.autoReading;
        // пульт: финальные круги, множители эпох, жетоны, аутсайдер — сразу в игру
        if (Number.isInteger(args?.finalRounds)) st.finalRounds = Math.max(1, Math.min(4, args.finalRounds));
        if (Array.isArray(args?.epochRates)) st.epochRates = args.epochRates;
        if (args?.tokens) st.tokens = args.tokens;
        if (typeof args?.outsiderToken === 'boolean') st.outsiderToken = args.outsiderToken;
        if (typeof args?.outsiderTwo === 'boolean') st.outsiderTwo = args.outsiderTwo;
        this.emit();
        break;
      }
      case 'wheelStart':
        // колесо призов — после конца игры; reset — заново: жетоны и призы по текущим настройкам
        if (this.s.phase !== 'end') break;
        if (!this.s.wheel || args?.reset) this.wheelInit();
        // колесо из старого сохранения — без очереди
        else if (!this.s.wheel.order) this.wheelOrder(this.s.wheel);
        this.setStage({ t: 'wheel' });
        this.snapshot();
        break;
      case 'wheelNext': {
        // пульт: «Приз получен» — окно с призом закрывается, крутит следующий по очереди
        const w = this.s.wheel;
        if (this.s.phase !== 'end' || !w || w.spinner) break;
        w.last = null;
        this.wheelAdvance(w);
        this.emit();
        this.snapshot();
        break;
      }
      case 'wheelEnd':
        if (this.s.phase === 'end') this.setStage({ t: 'end', titles: this.sec.titles });
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
        this.s.dr = null;
      this.s.kj = null;
        void (async () => {
          try {
            if (cmd === 'groupTest' && args?.game === 'sumo') { this.s.sumo = null; delete this.sec.sumo; await this.sumoFinal(ep); }
            else if (cmd === 'groupTest') await this.groupGame(ep, PREF[args?.pref] ? +args.pref : 26, args?.game ?? 'calligraphy');
            else if (p) await this.shopVisit(ep, p, true);
          } catch (e) { if (!(e instanceof Aborted)) console.error(e); }
          if (ep === this.epoch) void this.run(ep);
        })();
        break;
      }
      case 'findTest': {
        // отладка: прервать ход и выдать находку игроку (kind — какую), потом игра продолжится с начала хода
        const p = this.s.players[args?.pid] ?? this.s.players[this.s.joinOrder[0]];
        if (!p || p.pref == null) break;
        this.abort();
        const ep = this.epoch;
        this.s.q = null;
        this.s.duel = null;
        void (async () => {
          try { await this.giveFind(ep, p, 2, undefined, args?.kind); } catch (e) { if (!(e instanceof Aborted)) console.error(e); }
          if (ep === this.epoch) void this.run(ep);
        })();
        break;
      }
      case 'epochTest': {
        // отладка: сразу сменить эпоху (без объявления)
        this.s.epoch = Math.max(0, Math.min(EPOCHS.length - 1, Number(args?.epoch) || 0));
        this.emit();
        break;
      }
      case 'debugFx':
        this.io.fx?.(args?.k, args?.d);
        break;
      case 'endgame': {
        // пульт: ускорить конец игры, если вечер затянулся. 'hunt' — открыть всю карту (после круга начнётся охота за призами);
        // 'final' — охоту не ждём: после текущего круга — финальные круги, сумо и титулы
        if (this.s.phase !== 'turns' || this.s.endgame?.step === 'sumo') break;
        const eg = this.s.endgame;
        if (args?.to === 'hunt' && !eg) {
          for (const c of Object.keys(this.s.prefs)) this.s.prefs[+c].rev = true;
          this.s.endgame = { step: 'open' };
          this.log('Ведущий открыл всю карту — доигрываем круг, потом охота за призами');
        } else if (args?.to === 'final' && eg?.step !== 'final' && eg?.step !== 'huntDone') {
          this.s.endgame = { step: 'huntDone' };
          this.log('Ведущий объявил финал — доигрываем круг');
        } else break;
        this.emit();
        this.snapshot();
        break;
      }
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
        this.abort();
        this.finish();
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
    if (this.turnPid && !this.s.players[this.turnPid]) throw new Kicked();
  }

  /** время игры: на паузе стоит на месте (по нему сверяются дедлайны ответов) */
  private get gameNow() {
    return this.s.paused && this.s.pausedAt ? this.s.pausedAt : this.now;
  }

  /** таймер ожидания, который замирает на паузе */
  private pT(fn: () => void, ms: number) {
    const pt = { fire: () => { this.pts.delete(pt); fn(); }, left: Math.max(0, ms), at: this.now, id: null as any };
    if (!this.s.paused) pt.id = setT(pt.fire, pt.left);
    this.pts.add(pt);
    return pt;
  }

  private pClear(pt: any) {
    if (!pt) return;
    clearT(pt.id);
    this.pts.delete(pt);
  }

  /** пауза ведущего: таймеры вопросов, магазина, высадки и т. п. замирают, дедлайны на экранах сдвигаются.
   *  Не касается того, что идёт в реальном времени: ритм-батл, шаги дракона, сигнал иайдо, вращения */
  private setPaused(on: boolean) {
    if (on === this.s.paused) return;
    const t = this.now;
    if (on) {
      this.s.paused = true;
      this.s.pausedAt = t;
      for (const pt of this.pts) if (pt.id != null) { clearT(pt.id); pt.id = null; pt.left = Math.max(0, pt.left - (t - pt.at)); }
    } else {
      const d = Math.max(0, t - (this.s.pausedAt ?? t));
      this.s.paused = false;
      this.s.pausedAt = null;
      const st: any = this.s.stage;
      if (typeof st.deadline === 'number' && st.deadline) st.deadline += d;
      if (st.pickTopic?.deadline) st.pickTopic.deadline += d;
      const q = this.s.q;
      if (q && !q.revealed && q.deadline) { q.startAt += d; q.deadline += d; }
      const g = this.s.g;
      if (g && g.deadline) { g.startAt += d; g.deadline += d; }
      for (const pt of this.pts) if (pt.id == null) { pt.at = t; pt.id = setT(pt.fire, pt.left); }
      this.pauseCbs.splice(0).forEach((c) => c());
      this.closeIfAllAnswered();
    }
    this.emit();
  }

  /** ждать сообщение, подходящее под match (вернуть не-undefined), или таймаут/скип → null */
  private waitInput<T>(epoch: number, match: (m: InputMsg) => T | undefined, ms: number | null): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      let timer: any;
      const w: Waiter = {
        match,
        resolve: (v) => { this.pClear(timer); resolve(v); },
      };
      this.waiters.push(w);
      if (ms != null) timer = this.pT(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        resolve(null);
      }, ms);
    }).then((v) => { this.check(epoch); return v; });
  }

  /** ждать выбор хода: на связи — сколько угодно (ведущий может пропустить кнопкой «Далее»), бот — 20 c,
   *  без связи 15 c подряд — случайный ход. Связь проверяем каждые 3 c: вернулся — ждём дальше, пропал посреди хода — пошёл отсчёт */
  private async waitMove<T>(epoch: number, p: Player, match: (m: InputMsg) => T | undefined): Promise<T | null> {
    let off = 0;
    for (;;) {
      const ms = p.bot ? 20000 : 3000;
      const t = this.gameNow;
      const v = await this.waitInput(epoch, match, ms);
      if (v != null || p.bot) return v;
      if (this.gameNow - t < ms - 100) return null; // «Далее»
      off = p.online ? 0 : off + ms;
      if (off >= 15000) return null;
    }
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
      const done = () => { this.pClear(t); this.skipCbs.delete(done); resolve(); };
      const t = this.pT(done, ms);
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
        // подэтап лобби (пустой фон / интро / тропа) переживает перезагрузку ТВ
        if (this.s.stage.t !== 'lobby') this.setStage({ t: 'lobby', show: 'blank' });
        // «Далее» в лобби игру не запускает — только «Начать игру»
        while (!(await this.waitInput(epoch, (m: any) => (m.t === '__start' ? true : undefined), null)) || !this.s.joinOrder.length) { /* ждём старта */ }
        this.s.phase = 'calib';
        this.initPrefs();
        this.s.epoch = 0;
        this.s.rates = epochRatesFor(this.s.settings, 0);
        // отсчёт 3-2-1 поверх тропы; дальше — карта и калибровка (calibration ждёт конца отсчёта)
        this.setStage({ t: 'countdown', at: this.now });
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
    // темы с вопросами «в числе первых N» идут в начале круга (меньшее N — раньше); порядок запоминаем на всю калибровку
    if (this.sec.calibIdx === 0 || !this.sec.calibOrder) {
      const minEarly = (id: string) => Math.min(1e9, ...this.questions.filter((q) => q.topic === id && !q.special && this.earlyDue(q)).map((q) => q.early!));
      this.sec.calibOrder = this.combatTopics().map((t, i) => ({ id: t.id, i, e: minEarly(t.id) })).sort((a, b) => a.e - b.e || a.i - b.i).map((x) => x.id);
    }
    const all = this.combatTopics();
    const topics = [...all].sort((a, b) => (this.sec.calibOrder!.indexOf(a.id) + 1 || 1e9) - (this.sec.calibOrder!.indexOf(b.id) + 1 || 1e9));
    const total = this.s.settings.calibRounds * topics.length;
    if (this.sec.calibIdx === 0) {
      const st = this.s.stage;
      if (st.t === 'countdown') await this.sleep(epoch, Math.max(0, st.at + COUNTDOWN_MS - this.now));
      // карта и музыка калибровки; сами вопросы — по «Далее» ведущего
      this.setStage({ t: 'banner', text: 'Калибровка', sub: 'Отвечайте на вопросы — так мы узнаем ваши сильные стороны', big: true, wait: this.hostPaced });
      await this.sleep(epoch, this.hostPaced ? 36e5 : 4000);
    }
    for (let i = this.sec.calibIdx; i < total; i++) {
      await this.gate(epoch);
      const topic = topics[i % topics.length];
      // первый круг — лёгкие, дальше — средние; помеченные «калибровка» идут первыми
      const diff: Difficulty = i < topics.length ? 'easy' : 'medium';
      const own = (x: Question) => x.topic === topic.id && !x.special && !x.pref;
      const q =
        this.pickQuestion((x) => own(x) && this.earlyDue(x), true) ??
        this.pickQuestion((x) => own(x) && !!x.calib && x.difficulty === diff, true) ??
        this.pickQuestion((x) => own(x) && !!x.calib, true) ??
        this.pickQuestion(own, false, diff) ??
        this.pickQuestion((x) => x.topic === topic.id && !x.special) ??
        this.pickQuestion((x) => !x.special && x.topic !== 'okinawa' && !x.pref) ??
        this.pickQuestion((x) => !x.special && x.topic !== 'okinawa');
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
      // высадка — с моря: только на побережье, не на занятые префектуры и не рядом с соперниками
      const occupied = Object.values(this.s.players).map((x) => x.pref).filter((x): x is number => !!x);
      const coast = PREF_CODES.filter(isCoastal);
      let blocked = new Set<number>([...occupied, ...PREF_CODES.filter((c) => !isCoastal(c))]);
      occupied.forEach((o) => neighbors(o).forEach((n) => blocked.add(n)));
      if (coast.every((c) => blocked.has(c))) blocked = new Set([...occupied, ...PREF_CODES.filter((c) => !isCoastal(c))]);
      const allowed = PREF_CODES.filter((c) => !blocked.has(c));
      const ms = this.s.settings.landingTime * 1000;
      this.setStage({ t: 'landing', pid, deadline: this.now + ms, blocked: [...blocked] });
      const v = await this.waitInput(epoch, (m) => (m.t === 'pick' && m.kind === 'landing' && m.pid === pid && allowed.includes(m.value) ? (m.value as number) : undefined), ms + 500);
      const code = v ?? pick(allowed);
      this.log(`${p.name} высаживается: ${prefName(code)}`);
      // высадка — полноценный ход: интро, вопрос, магазин, групповая игра
      await this.asTurn(pid, () => this.arrive(epoch, p, code, true));
      await this.checkEpoch(epoch);
      this.sec.landingIdx = i + 1;
      this.snapshot();
    }
    this.s.phase = 'turns';
    this.s.turnIdx = 0;
    this.snapshot();
  }

  private async turns(epoch: number) {
    for (;;) {
      // игру восстановили посреди финальной схватки — продолжаем её
      if (this.s.endgame?.step === 'sumo') { await this.sumoFinal(epoch); this.finish(); return; }
      // всех игроков удалили — ждём, а не крутим пустые круги
      if (!this.s.turnOrder.length) { await this.sleep(epoch, 2000); continue; }
      while (this.s.turnIdx < this.s.turnOrder.length) {
        await this.gate(epoch);
        this.s.turnIdx = Math.max(0, this.s.turnIdx);
        const pid = this.s.turnOrder[this.s.turnIdx];
        if (this.s.players[pid]) await this.asTurn(pid, () => this.turn(epoch, pid));
        // редкий бонус: после хода можно сходить ещё раз
        while (this.s.players[pid] && (await this.asTurn(pid, () => this.offerExtraTurn(epoch, pid)))) await this.asTurn(pid, () => this.turn(epoch, pid));
        await this.checkEpoch(epoch);
        this.checkEndgame();
        this.s.turnIdx++;
        this.snapshot();
      }
      this.s.turnIdx = 0;
      this.s.round++;
      this.log(`Круг ${this.s.round}`);
      this.snapshot();
      if (await this.roundEnd(epoch)) return;
      this.snapshot();
    }
  }

  /** ход игрока pid: если его удалят посреди хода, ход обрывается (экран чистим), а игра идёт дальше */
  private async asTurn<T>(pid: string, fn: () => Promise<T>): Promise<T | undefined> {
    const ep = this.epoch;
    this.turnPid = pid;
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof Kicked) || ep !== this.epoch) throw e;
      this.turnPid = null;
      this.s.q = null;
      this.s.duel = null;
      this.s.rhythm = null;
      this.s.race = null;
      this.s.g = null;
      this.s.dr = null;
      this.s.kj = null;
      this.setStage({ t: 'banner', text: 'Игрок удалён', sub: 'Ход переходит дальше' });
      await this.sleep(ep, 1500);
      return undefined;
    } finally {
      this.turnPid = null;
    }
  }

  // ───────── конец игры: охота за призами и финальные круги ─────────

  /** сколько наград префектур ещё никто не забрал */
  private rewardsLeft() {
    return PREF_CODES.filter((c) => this.s.prefs[c] && !this.s.prefs[c].taken).length;
  }

  private finalRounds() {
    return Math.max(1, Math.min(4, this.s.settings.finalRounds ?? 3));
  }

  /** после хода: открылась вся карта / разыграны все призы — доигрываем круг */
  private checkEndgame() {
    const eg = this.s.endgame;
    if (!eg) {
      if (PREF_CODES.every((c) => this.s.prefs[c]?.rev)) {
        this.s.endgame = { step: 'open' };
        this.log('Вся карта открыта — доигрываем круг');
      }
    } else if (eg.step === 'hunt' && !this.rewardsLeft()) {
      eg.step = 'huntDone';
      this.log('Все призы разыграны — доигрываем круг');
    }
  }

  /** конец круга: начало охоты, финальные круги («осталось N»), конец игры. true — игра окончена */
  private async roundEnd(epoch: number): Promise<boolean> {
    const eg = this.s.endgame;
    if (!eg) return false;
    if (eg.step === 'open') {
      const n = this.rewardsLeft();
      if (n) {
        eg.step = 'hunt';
        this.log(`Охота за призами: ${n}`);
        this.io.fx?.('hunt', { n });
        this.setStage({ t: 'banner', text: 'Охота за призами!', sub: `Над префектурами — ${n} ${plural(n, 'награда', 'награды', 'наград')}, которые ещё никто не забрал. Ответь верно первым — и она твоя!`, big: true });
        await this.sleep(epoch, this.hostPaced ? 36e5 : 6000);
        return false;
      }
      eg.step = 'huntDone';
    }
    if (eg.step === 'huntDone') { eg.step = 'final'; eg.played = 0; }
    else if (eg.step === 'final') eg.played = (eg.played ?? 0) + 1;
    else return false;
    const left = this.finalRounds() - (eg.played ?? 0);
    if (left <= 0) {
      eg.step = 'sumo';
      this.snapshot();
      await this.sumoFinal(epoch);
      this.finish();
      return true;
    }
    if (left === 1) this.pickOutsiders();
    this.io.fx?.('finalRound', { left });
    this.setStage({
      t: 'banner', big: true,
      text: left === 1 ? 'Последний круг!' : `Осталось ${left} ${plural(left, 'круг', 'круга', 'кругов')}`,
      sub: eg.played === 0 ? 'Призы разыграны — финал: свободное перемещение по карте' : left === 1 ? 'После этого круга — итоги игры' : 'Финал игры',
    });
    await this.sleep(epoch, 5000);
    return false;
  }

  /** игра окончена: титулы */
  private finish() {
    this.s.phase = 'end';
    this.sec.titles = computeTitles(this.alivePids().map((id) => this.s.players[id]), this.sec.tally ?? {});
    this.setStage({ t: 'end', titles: this.sec.titles });
    this.snapshot();
  }

  /** последний круг: жетон аутсайдеру — у кого меньше всего звёзд и денег в пересчёте на жетоны (ничья — всем) */
  private pickOutsiders() {
    const st = this.s.settings;
    this.sec.outsiders = [];
    if (st.outsiderToken === false) return;
    const ids = this.alivePids();
    if (ids.length < 2) return;
    const val = (id: string) => tokensValue(this.s.players[id], st) + (this.s.players[id].tokens ?? 0);
    const sorted = [...ids].sort((a, b) => val(a) - val(b));
    const edge = val(sorted[Math.min(sorted.length - 1, st.outsiderTwo ? 1 : 0)]);
    this.sec.outsiders = ids.filter((id) => val(id) <= edge + 1e-9);
  }

  private occupants(code: number, except?: string) {
    return Object.values(this.s.players).filter((p) => p.pref === code && p.id !== except);
  }

  private async turn(epoch: number, pid: string) {
    const p = this.s.players[pid];
    const st = this.s.settings;
    this.setStage({ t: 'turnStart', pid });
    // Хозяин: сколько ходов (любых игроков) акита-ину бежала за ним
    const dogOwner = Object.values(this.s.players).find((x) => x.akita);
    if (dogOwner) this.bump('akitaTurns', dogOwner.id);
    await this.sleep(epoch, 1800);
    // крутит призовое кольцо — ход начнётся, когда огонёк остановится (но не дольше 25 с)
    for (const t0 = Date.now(); (this.sec.ring[pid] || (this.ringSettle[pid] ?? 0) > Date.now()) && Date.now() - t0 < 25000;) await this.sleep(epoch, 300);
    // СТОП так и не нажали (ушёл со страницы, телефон перезагрузился): попытку отменяем, иначе каждый ход ждал бы заново
    this.ringCancel(pid);
    // барабан бонуса так и не покрутили — крутится сам (виден у игрока на телефоне)
    if (p.reel?.done) delete p.reel;
    else if (p.reel && !p.reel.spin) this.spinBonusReel(p);

    // последний круг: аутсайдер находит жетон финальной игры
    let token = false;
    if (this.sec.outsiders?.includes(pid)) {
      this.sec.outsiders = this.sec.outsiders.filter((x) => x !== pid);
      if (this.s.settings.outsiderToken !== false && p.pref != null) {
        await this.giveFind(epoch, p, 2, undefined, 'token');
        token = true;
      }
    }

    // восстановился на Окинаве — получил деньги и бонус, ходит уже в следующий раз
    if (p.hp <= 0) {
      await this.revive(epoch, p);
      this.setStage({ t: 'banner', text: `${p.name} снова в строю`, sub: 'Ход — в следующем круге' });
      await this.sleep(epoch, 2200);
      return;
    }

    // ── находка под ногами (тайная помощь отстающим) ──
    const found = token ? (this.countTurn(p), null) : await this.maybeFind(epoch, p);
    const rickshaw = found === 'rickshaw';

    // ── выбор хода ──
    const from = p.pref!;
    const free = (c: number) => this.occupants(c, pid).length < 2;
    const options = neighbors(from).filter(free);
    // машина: на 1 или 2 префектуры, сколько угодно раз; без неё — старый сапог из сохранённой игры или попутный рикша
    const options2 = p.car || p.bonuses.move2 > 0 || rickshaw ? atDistance(from, 2).filter(free) : [];
    // билет на синкансэн: со станции — на любую другую станцию, где есть место
    const rail = st.shinkansen ?? [];
    const options3 = (p.bonuses.ticket ?? 0) > 0 && rail.includes(from) ? rail.filter((c) => c !== from && free(c)) : [];
    // свиток-вызов (果たし状): вместо хода — дуэль с любым живым игроком на карте
    const foes = () => (p.bonuses.scroll ?? 0) > 0 && p.hp > 0 ? Object.values(this.s.players).filter((x) => x.id !== pid && x.hp > 0 && x.pref != null).map((x) => x.id) : [];
    if (!options.length && !options2.length && !options3.length && !foes().length) {
      this.setStage({ t: 'banner', text: `${p.name}: некуда идти`, sub: 'Ход пропущен' });
      await this.sleep(epoch, 2500);
      return;
    }
    // корм: до хода можно переманить акиту, если её хозяин стоит в соседней префектуре
    const dogNear = () => (p.bonuses.food ?? 0) > 0 && Object.values(this.s.players).some((x) => x.akita && x.id !== pid && x.pref != null && neighbors(from).includes(x.pref));
    // кусок сашими: так же переманивается кошка
    const catNear = () => (p.bonuses.sashimi ?? 0) > 0 && Object.values(this.s.players).some((x) => x.cat && x.id !== pid && x.pref != null && neighbors(from).includes(x.pref));
    const moveStage = () => this.setStage({ t: 'move', pid, options, options2, ...(options3.length ? { options3 } : {}), ...(dogNear() ? { lure: true } : {}), ...(catNear() ? { lureCat: true } : {}), ...(foes().length ? { challenge: foes() } : {}) });
    moveStage();
    // выбор: код префектуры; 'rail:<код>' — поездка по билету (на соседнюю станцию можно и пешком, и поездом); 'lure' — корм
    let choice: number | string | null | undefined;
    for (;;) {
      choice = await this.waitMove(epoch, p, (m) => {
        if (m.t !== 'pick' || m.kind !== 'move' || m.pid !== pid) return undefined;
        if (m.value === 'lure') return dogNear() ? 'lure' : undefined;
        if (m.value === 'lureCat') return catNear() ? 'lureCat' : undefined;
        if (typeof m.value === 'string' && m.value.startsWith('duel:')) return foes().includes(m.value.slice(5)) ? m.value : undefined;
        if (typeof m.value === 'string' && m.value.startsWith('rail:')) {
          const c = Number(m.value.slice(5));
          return options3.includes(c) ? m.value : undefined;
        }
        const c = Number(m.value);
        return options.includes(c) || options2.includes(c) ? c : undefined;
      }); // без связи — случайный ход через 15 c
      if (choice === 'lureCat') {
        const owner = Object.values(this.s.players).find((x) => x.cat)!;
        owner.cat = false;
        p.cat = true;
        p.bonuses.sashimi--;
        this.bump('lured', pid);
        this.log(`${p.name} переманил ириомотейскую кошку кусочком сашими у ${owner.name}`);
        this.io.fx?.('lureCat', { pid, from: owner.id });
        this.setStage({ t: 'banner', text: 'Кошка убежала!', sub: `${owner.name} → ${p.name}: на запах свежей рыбы`, big: true });
        await this.sleep(epoch, 3000);
        moveStage();
        continue;
      }
      if (choice !== 'lure') break;
      const owner = Object.values(this.s.players).find((x) => x.akita)!;
      owner.akita = false;
      p.akita = true;
      p.bonuses.food--;
      this.bump('lured', pid);
      this.log(`${p.name} переманил акиту-ину кормом у ${owner.name}`);
      this.io.fx?.('lure', { pid, from: owner.id });
      this.setStage({ t: 'banner', text: 'Акита-ину убежала!', sub: `${owner.name} → ${p.name}: на запах корма`, big: true });
      await this.sleep(epoch, 3000);
      moveStage();
    }
    if (typeof choice === 'string' && choice.startsWith('duel:')) {
      const foe = this.s.players[choice.slice(5)];
      p.bonuses.scroll--;
      this.log(`${p.name} шлёт свиток-вызов игроку ${foe.name}`);
      this.io.fx?.('challenge', { pid, to: foe.id });
      this.setStage({ t: 'banner', text: 'Свиток-вызов летит…', sub: `${p.name} → ${foe.name}` });
      await this.sleep(epoch, 2600);
      this.setStage({ t: 'banner', text: '果たし状', sub: `${p.name} вызывает ${foe.name} на поединок!`, big: true });
      await this.sleep(epoch, 3200);
      // дуэль на расстоянии: никто никуда не идёт; после неё ход окончен
      await this.duel(epoch, p, foe);
      return;
    }
    if (choice == null && !options.length && !options2.length && !options3.length) return; // идти некуда, а вызов не отправлен
    const byRail = typeof choice === 'string' && choice.startsWith('rail:');
    const to = byRail ? Number((choice as string).slice(5)) : (choice as number | undefined) ?? pick(options.length ? options : options2.length ? options2 : options3);
    const rode = byRail || (!options.includes(to) && !options2.includes(to));
    if (rode) {
      p.bonuses.ticket--;
      this.log(`${p.name} едет на синкансэне: ${PREF[from]?.ru ?? from} → ${PREF[to]?.ru ?? to}`);
      this.io.fx?.('rail', { pid });
    } else if (!options.includes(to)) {
      if (p.car) { /* на машине — бесплатно */ }
      else if (rickshaw) this.log(`${p.name} едет на рикше`);
      else {
        p.bonuses.move2--;
        this.log(`${p.name} использует «${BONUS_INFO.move2.short}»`);
      }
    }
    // разведка старой карты нужна только на этот ход
    if (p.scouted) delete p.scouted;
    // Таксист: сколько префектур проехал на машине
    if (p.car && !rode) this.bump('carCells', pid, options.includes(to) ? 1 : 2);
    this.setStage({ t: 'moving', pid, from, to, path: rode || options.includes(to) ? [from, to] : path(from, to) });
    await this.sleep(epoch, 1500);
    await this.arrive(epoch, p, to);
  }

  /** сколько держать интро префектуры: по «Далее» ведущего или само (галочка на пульте) */
  private get introWait() {
    return this.hostPaced && !this.s.settings.autoIntro ? 36e5 : PREF_INTRO_MS;
  }

  /** игрок пришёл или высадился в префектуру: интро при первом входе, затем всё, что в ней есть */
  private async arrive(epoch: number, p: Player, to: number, landing = false) {
    const st = this.s.settings;
    const pid = p.id;
    // Странник: пройденное расстояние в шагах между префектурами (синкансэн, рикша, ×2 — тоже по карте)
    if (!landing && p.pref != null && p.pref !== to) this.bump('distance', pid, path(p.pref, to).length - 1);
    p.pref = to;
    if (this.sec.onsen) delete this.sec.onsen[pid];
    this.closeFarm(p, to);
    const ps = this.s.prefs[to];
    const firstVisit = !ps.rev;
    if (firstVisit) this.bump('opened', pid);
    ps.rev = true;
    ps.visits++;
    // первый, кто дошёл до Акиты, получает собаку акита-ину: она защищает хозяина от нападений (см. dogChase)
    if (to === AKITA_PREF && !Object.values(this.s.players).some((x) => x.akita)) {
      p.akita = true;
      this.log(`${p.name}: акита-ину теперь бежит следом!`);
    }
    this.io.fx?.(landing ? 'land' : 'arrive', { pid, code: to, firstVisit });
    this.emit();
    if (firstVisit) {
      await this.sleep(epoch, 700);
      this.setStage({ t: 'prefIntro', code: to, pid });
      await this.sleep(epoch, this.introWait);
    }
    await this.gate(epoch);

    // акита-ину охраняет хозяина: напасть нельзя — собака кусает (−1 HP) и прогоняет в соседнюю префектуру.
    // Свиток-вызов сюда не попадает — он собаку обходит
    const guard = this.occupants(to, pid).find((o) => o.akita && o.hp > 0);
    if (guard && p.hp > 0) {
      await this.dogChase(epoch, p, guard, to);
      return;
    }

    // порядок в префектуре: вопрос (пусто) или дуэль (занято) → магазин → групповая игра.
    // Соло-игры (пачинко, онсэн, чо-хан…) — на телефоне, пока игрок стоит здесь
    const other = this.occupants(to, pid).find((o) => o.hp > 0);
    if (other && p.hp > 0) await this.duel(epoch, p, other);
    else await this.prefQuestion(epoch, p, to);

    if ((st.shopPrefs?.includes(to) || dealerAt(st, to)) && p.hp > 0) await this.shopVisit(epoch, p);

    // групповая игра — как в Марио Пати: ход закончен, играют все (один раз на префектуру)
    const game = st.groupPrefs?.[to];
    if (game && !ps.groupDone && this.s.joinOrder.filter((id) => this.s.players[id]).length >= 2) {
      await this.gate(epoch);
      await this.groupGame(epoch, to, game);
      // отмечаем после игры: если её оборвали (перезагрузка ТВ), она сыграется при следующем приходе
      ps.groupDone = true;
    }
  }

  /** незавершённая попытка призового кольца: убрать и вернуть деньги */
  private ringCancel(pid: string) {
    if (!this.sec.ring?.[pid]) return;
    delete this.sec.ring[pid];
    const p = this.s.players[pid];
    if (!p) return;
    p.yen += this.s.settings.ring.cost;
    if (p.busy === 'ring') p.busy = null;
    this.log(`${p.name}: призовое кольцо остановлено, ¥${this.s.settings.ring.cost} возвращены`);
  }

  /** денежные соло-игры, которые закрываются от фарма (онсэн не в счёт: за лечение платят) */
  private static readonly FARM: SoloGameId[] = ['pachinko', 'ring', 'chohan', 'sudoku'];

  /** пришёл в префектуру: если недавно уже играл здесь в денежную соло-игру — она закрыта на этот приход */
  private closeFarm(p: Player, code: number) {
    delete p.closed;
    const game = soloAt(this.s.settings, code).find((g) => GameEngine.FARM.includes(g));
    const last = this.sec.soloPlayed?.[p.id]?.[code];
    if (!game || last == null) return;
    const cd = this.s.settings.soloCooldown ?? 3;
    const passed = (this.sec.ownTurns?.[p.id] ?? 0) - last;
    if (passed < cd) p.closed = { code, game, left: cd - passed };
  }

  /** сыграл в денежную соло-игру: запоминаем ход (для защиты от фарма) */
  private playedSolo(p: Player) {
    if (p.pref == null) return;
    ((this.sec.soloPlayed ??= {})[p.id] ??= {})[p.pref] = this.sec.ownTurns?.[p.id] ?? 0;
  }

  /** акита-ину кусает пришедшего (−1 HP) и прогоняет: он выбирает другую соседнюю префектуру и приходит туда как обычно */
  private async dogChase(epoch: number, p: Player, owner: Player, at: number) {
    const pid = p.id;
    this.log(`Акита-ину ${owner.name} не пускает ${p.name}: −1 HP`);
    this.io.fx?.('akita', { pid, owner: owner.id, code: at });
    this.setStage({ t: 'banner', text: 'Гав! Акита-ину охраняет хозяина', sub: `${p.name}: −1 HP — ищи другую дорогу`, big: true });
    await this.sleep(epoch, 1200);
    this.hit(p, 1);
    await this.sleep(epoch, 2000);
    if (p.hp <= 0) {
      this.setStage({ t: 'banner', text: `${p.name} без сил`, sub: 'Собака оказалась сильнее', big: true });
      await this.sleep(epoch, 2500);
      return;
    }
    const options = neighbors(at).filter((c) => this.occupants(c, pid).length < 2 && !this.occupants(c, pid).some((o) => o.akita && o.hp > 0));
    if (!options.length) {
      this.setStage({ t: 'banner', text: `${p.name}: бежать некуда`, sub: 'Ход окончен' });
      await this.sleep(epoch, 2500);
      return;
    }
    this.setStage({ t: 'move', pid, options, options2: [] });
    const choice = await this.waitMove(epoch, p, (m) => {
      if (m.t !== 'pick' || m.kind !== 'move' || m.pid !== pid) return undefined;
      const c = Number(m.value);
      return options.includes(c) ? c : undefined;
    });
    const to = choice ?? pick(options);
    this.setStage({ t: 'moving', pid, from: at, to, path: [at, to] });
    await this.sleep(epoch, 1500);
    await this.arrive(epoch, p, to);
  }

  /** вопросы префектуры по порядку, которые ещё можно задать */
  private prefQueue(code: number): Question[] {
    const done = this.sec.qDone ?? [];
    return this.questions
      .filter((q) => q.pref === code && !isSpecialQ(this.s.settings, q) && !done.includes(q.id) && (q.kind === 'flag' || q.answers?.length === 4))
      .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
  }

  /** вопрос «выбери флаг»: правильный + 3 неверных; выбранные ранее неверные и уже угаданные флаги не показываем */
  private buildFlagQuestion(q: Question): Question & { flagOpts: number[] } {
    const code = q.pref!;
    const fs = ((this.sec.flags ??= {})[q.id] ??= { decoys: [], banned: [] });
    const solved = this.sec.flagSolved ?? [];
    const others = FLAG_CODES.filter((c) => c !== code);
    const ok = (c: number) => !fs.banned.includes(c) && !solved.includes(c);
    // прежние неверные варианты, которые никто не выбирал, остаются; выбранные заменяются новыми
    const decoys = fs.decoys.filter((c) => others.includes(c) && ok(c));
    decoys.push(...shuffle(others.filter((c) => !decoys.includes(c) && ok(c))).slice(0, 3 - decoys.length));
    // вариантов мало — берём самые первые угаданные флаги (вдруг забыли), в крайнем случае уже выбранные
    for (const c of [...solved, ...fs.banned]) {
      if (decoys.length >= 3) break;
      if (c !== code && others.includes(c) && !decoys.includes(c)) decoys.push(c);
    }
    fs.decoys = decoys.slice(0, 3);
    const opts = shuffle([code, ...fs.decoys]);
    return {
      ...q,
      text: q.text?.trim() || `Какой флаг у префектуры ${PREF[code]?.ru ?? ''}?`,
      answers: opts.map((c) => ({ image: flagUrl(c) })),
      answerImages: true,
      correct: opts.indexOf(code),
      flagOpts: opts,
    };
  }

  /** вопрос префектуры, куда пришёл (или высадился) игрок p: свои вопросы префектуры по порядку, один за приход.
   *  Обычный — отвечают все, у p награда больше; призовой — только p, за верный ответ приз своего ранга. */
  private async prefQuestion(epoch: number, p: Player, to: number) {
    const st = this.s.settings;
    const pid = p.id;
    const own = this.prefQueue(to)[0];
    let base: Question | null = own ?? this.pickQuestion((x) => x.topic === 'general' && !x.pref && !x.special, true) ?? null;
    if (!base) {
      // кончились и общие вопросы — тему выбирает барабан (крутит ходящий, не успел — крутится сам)
      const topic = await this.topicReel(epoch, p, 'pref');
      base =
        (topic ? this.pickQuestion((x) => x.topic === topic && !x.pref && !x.special) : null) ??
        this.pickQuestion((x) => !x.special && x.topic !== 'okinawa' && !x.pref) ??
        this.pickQuestion((x) => !x.special && x.topic !== 'okinawa');
    }
    if (!base) return;
    const flag = base.kind === 'flag' ? this.buildFlagQuestion(base) : null;
    const q: Question = flag ?? base;
    const prize = own && q.prize ? q.prize : 0;
    const cycle = !!own && q.mode === 'cycle';
    const pids = prize ? [pid] : this.s.joinOrder.filter((id) => this.s.players[id]);
    const title = `${PREF[to].ru} ${PREF[to].ja}`;
    // бонусы «убрать неверные» — кнопками под ответами, прямо во время вопроса
    const res = await this.ask(epoch, q, 'pref', title, pids, q.time ?? st.questionTime, {}, to, { prize, cycle });
    const results: Record<string, string> = {};
    const moverOk = res[pid] === q.correct;
    const solved = prize ? moverOk : pids.some((id) => res[id] === q.correct);
    const ep = ratesOf(this.s);
    // манэки-нэко: за правильный ответ — вдвое больше йен (срабатывает сама и тратится)
    const neko = (pl: Player, yen: number) => {
      if (!((pl.bonuses.neko ?? 0) > 0)) return { yen, tag: '' };
      pl.bonuses.neko--;
      return { yen: yen * 2, tag: ' (нэко ×2)' };
    };
    for (const id of pids) {
      const pl = this.s.players[id];
      if (prize) continue;
      if (id === pid) {
        if (moverOk) {
          const r = neko(pl, rewardYen(st.reward.moverCorrectYen, ep));
          pl.yen += r.yen;
          pl.stars += st.reward.moverCorrectStars;
          results[id] = `+¥${r.yen} +${st.reward.moverCorrectStars}★${r.tag}`;
        } else {
          const y = rewardYen(st.reward.moverWrongYen, ep);
          pl.yen += y;
          results[id] = `+¥${y}`;
        }
      } else if (res[id] === q.correct) {
        const r = neko(pl, rewardYen(st.reward.otherCorrectYen, ep));
        pl.yen += r.yen;
        results[id] = `+¥${r.yen}${r.tag}`;
      }
    }
    if (own) {
      // одноразовый больше не задаётся; цикличный — пока не ответят верно (призовой — пока не выиграет ходящий)
      if (!cycle || solved) (this.sec.qDone ??= []).push(own.id);
      if (flag) {
        const fs = this.sec.flags![own.id];
        for (const id of pids) {
          const c = res[id];
          if (c != null && c !== q.correct && !fs.banned.includes(flag.flagOpts[c])) fs.banned.push(flag.flagOpts[c]);
        }
        if (solved && !(this.sec.flagSolved ??= []).includes(to)) this.sec.flagSolved.push(to);
        for (const id of pids) if (res[id] === q.correct) this.bump('flags', id);
      }
    }
    // цикличный без верного ответа: правильный не показываем — вопрос вернётся
    await this.reveal(epoch, results, cycle && !solved);
    if (prize) {
      if (moverOk) await this.prizeWin(epoch, p, prize);
    } else if (moverOk) await this.prefReward(epoch, p, to);
  }

  /** приз ранга rank (1 — главный): из списка призов этого ранга, ещё не выданный */
  private async prizeWin(epoch: number, p: Player, rank: number) {
    const st = this.s.settings;
    const tier = (st.prizeTiers?.[rank - 1] ?? []).filter(Boolean);
    const pool = tier.length ? tier : st.prizeNames;
    const given = (this.sec.prizesGiven ??= []);
    const free = pool.filter((x) => !given.includes(x));
    const name = free[0] ?? (pool.length ? pick(pool) : rank === 1 ? 'Главный приз' : `Приз ${rank}-го ранга`);
    given.push(name);
    p.prizes.push(name);
    this.log(`🏆 ${p.name} получает ПРИЗ: ${name}`);
    this.io.fx?.('prize', { pid: p.id });
    this.setStage({ t: 'prize', pid: p.id, text: name });
    await this.sleep(epoch, 7000);
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
    let secret: string | undefined;
    let bonus: BonusId | undefined;
    switch (reward) {
      case 'money': { const y = rewardYen(st.reward.prefMoney, ratesOf(this.s)); p.yen += y; text = `+¥${y}`; break; }
      case 'stars': p.stars += st.reward.prefStars; text = `+${st.reward.prefStars} ★`; break;
      case 'bonus': {
        // бонус игрок крутит на барабане у себя на телефоне; ТВ тем временем идёт дальше.
        // Что выпало — секрет: на ТВ просто «Бонус»
        p.reel = { segs: [...BONUS_REEL] };
        text = 'Бонус';
        secret = 'Крути барабан бонуса!';
        break;
      }
      case 'special': {
        p.specials++;
        text = 'Спецвопрос (сила ' + st.specialPower + ')';
        // спецтемы узкие — получатель сам выбирает, из какой будет вопрос (тема — секрет, как в магазине)
        const topics = st.topics.filter((t) => t.special).map((t) => t.id);
        if (topics.length) {
          const ms = 30000;
          this.setStage({ t: 'reward', pid: p.id, reward, text, pref: code, pickTopic: { topics, deadline: this.now + ms } });
          this.io.fx?.('reward', { pid: p.id, reward });
          const v = await this.waitInput(epoch, (m) => (m.t === 'pick' && m.kind === 'specialTopic' && m.pid === p.id && topics.includes(m.value) ? String(m.value) : undefined),
            p.bot ? 1500 : p.online ? ms : 4000);
          const topic = v ?? pick(topics);
          (p.specialTopics ??= []).push(topic);
          secret = `Спецвопрос «${st.topics.find((t) => t.id === topic)?.name ?? topic}»`;
          this.setStage({ t: 'reward', pid: p.id, reward, text, pref: code, secret });
          await this.sleep(epoch, 2000);
          return;
        }
        break;
      }
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
    this.setStage({ t: 'reward', pid: p.id, reward, text, pref: code, ...(secret ? { secret } : {}), ...(bonus ? { bonus } : {}) });
    this.io.fx?.('reward', { pid: p.id, reward });
    // получателю — карточка на телефоне: что именно выпало
    await this.sleep(epoch, bonus ? 4000 : 2600);
  }

  private async revive(epoch: number, p: Player) {
    const st = this.s.settings;
    // первое воскрешение игрока — интро Окинавы: что здесь происходит
    const seen = (this.sec.okinawaSeen ??= []);
    if (!seen.includes(p.id)) {
      seen.push(p.id);
      this.setStage({ t: 'prefIntro', code: OKINAWA, pid: p.id, note: OKINAWA_NOTE });
      await this.sleep(epoch, this.introWait);
      await this.gate(epoch);
    }
    // первый, кто попал на Окинаву, уходит с неё с ириомотейской кошкой
    if (!Object.values(this.s.players).some((x) => x.cat)) {
      p.cat = true;
      this.log(`${p.name} подружился с ириомотейской кошкой`);
      this.io.fx?.('cat', { pid: p.id });
      this.setStage({ t: 'banner', text: 'Ириомотейская кошка!', sub: `Дикая кошка с острова Ириомотэ забралась на плечо к ${p.name}. Отлично знает биологию`, big: true });
      await this.sleep(epoch, 4500);
    }
    this.setStage({ t: 'banner', text: `${p.name} восстанавливается`, sub: 'Отдых на Окинаве: ответь, чтобы получить бонус', big: true });
    await this.sleep(epoch, 2500);
    const q = this.pickQuestion((x) => x.topic === 'okinawa') ?? this.pickQuestion((x) => !x.special);
    p.hp = p.maxHp;
    this.bump('revive', p.id);
    if (!q) return;
    const res = await this.ask(epoch, q, 'revive', 'Окинава · 沖縄', [p.id], q.time ?? st.questionTime);
    const results: Record<string, string> = {};
    if (res[p.id] === q.correct) {
      const y = rewardYen(st.reward.reviveYen, ratesOf(this.s));
      p.yen += y;
      const b = pick<BonusId>(['fifty1', 'fifty2', 'ticket', 'coin']);
      p.bonuses[b]++;
      results[p.id] = `+¥${y} и бонус`; // какой — секрет, видно в инвентаре
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
    this.bump('duelAttack', att.id);
    // «крыса»: напал на того, кто беднее (по чистой стоимости)
    if (netWorth(def, st) < netWorth(att, st)) this.bump('attackWeak', att.id);
    const hp0 = { [att.id]: att.hp, [def.id]: def.hp };
    // ставки зрителей: до выбора темы
    const spectators = this.alivePids().filter((id) => id !== att.id && id !== def.id);
    if (spectators.length) await this.duelBets(epoch, d, spectators);
    // машина против машины — всегда гонка: вопросов нет, HP не тратится; кража и ставки — как обычно
    const racing = !!att.car && !!def.car;
    const raceLoser = racing ? await this.raceBattle(epoch, d, att, def) : null;
    outer: for (let r = 1; r <= (racing ? 0 : st.duelRounds); r++) {
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
        this.setStage({ t: 'duelPick', pid: asker.id, deadline: this.now + ms, topics, canSpecial: asker.specials > 0, canRhythm: this.rhythmLeft() });
        const choice = await this.waitInput(epoch, (m) => {
          if (m.t !== 'pick' || m.kind !== 'duel' || m.pid !== asker.id) return undefined;
          // спецвопрос: 'special' — из любой спецтемы, 'special:<тема>' — купленный на эту тему
          if (m.value === 'special' && asker.specials > (asker.specialTopics?.length ?? 0)) return 'special';
          if (typeof m.value === 'string' && m.value.startsWith('special:') && asker.specialTopics?.includes(m.value.slice(8))) return m.value;
          if (m.value === 'rhythm' && this.rhythmLeft()) return 'rhythm';
          return topics.includes(m.value) ? (m.value as string) : undefined;
        }, ms + 400);
        // не выбрал за время — тему решает барабан (без спецвопроса)
        const pickV = choice ?? (await this.topicReel(epoch, asker, 'duel')) ?? pick(topics);

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
            this.bump('rhythmWin', win.id);
            this.log(`${win.name} побеждает в ритме: −${dmg} HP у ${lose.name}`);
          } else this.log('Ритм: ничья');
          this.setStage({ t: 'duelResult' });
          await this.sleep(epoch, 3500);
          this.s.rhythm = null;
          continue;
        }

        d.mode = 'quiz';
        let q: Question | null;
        if (pickV === 'special' || pickV.startsWith('special:')) {
          asker.specials--;
          this.bump('specials', asker.id);
          d.special = true;
          const sTopic = pickV.startsWith('special:') ? pickV.slice(8) : null;
          if (sTopic) asker.specialTopics!.splice(asker.specialTopics!.indexOf(sTopic), 1);
          // вопрос купленной спецтемы (или любой спецтемы); если их нет — обычный боевой
          // по отстающему спецвопрос бьёт вопросом средней сложности (если такие есть) — шанс пережить сильную атаку
          const soft: Difficulty | undefined = this.lagging(target.id) ? 'medium' : undefined;
          q = (sTopic ? this.pickQuestion((x) => x.topic === sTopic, false, soft) : null) ?? this.pickQuestion((x) => !!x.special, false, soft) ?? this.pickQuestion((x) => topics.includes(x.topic));
        } else {
          q = this.pickQuestion((x) => x.topic === pickV && !x.special) ?? this.pickQuestion((x) => topics.includes(x.topic));
        }
        if (!q) continue;
        d.topic = q.topic;
        this.emit();
        const topicName = this.s.settings.topics.find((t) => t.id === q!.topic)?.name ?? q.topic;
        const res = await this.ask(epoch, q, 'duel', `Дуэль · раунд ${r} · ${d.special ? (st.topics.find((t) => t.id === q!.topic)?.special ? topicName : 'Спецвопрос') : topicName} · спрашивает ${asker.name}`, [asker.id, target.id], q.time ?? st.duelTime, {}, def.pref);
        const okA = res[asker.id] === q.correct, okT = res[target.id] === q.correct;
        const results: Record<string, string> = {};
        if (okA !== okT) {
          const win = okA ? asker : target;
          const lose = okA ? target : asker;
          // спецвопрос бьёт с силой specialPower, если правильно ответил задавший
          // монетка победителя добавляет урон (брошенная, но не сработавшая — просто потрачена)
          const coin = this.s.q?.coins?.[win.id];
          const extra = coin ? COIN_DMG[coin] : 0;
          const dmg = (d.special && win === asker ? st.specialPower : win.stats[q.topic] ?? st.baseStrength) + extra;
          this.hit(lose, dmg);
          results[lose.id] = `−${dmg} HP`;
          results[win.id] = `удар ${dmg}` + (extra ? ` (монетка +${extra})` : '');
        }
        await this.reveal(epoch, results);
      }
    }
    d.over = true;
    d.asker = null;
    // победитель: нокаут, иначе тот, кто потерял меньше HP; поровну — ничья
    const lostA = hp0[att.id] - att.hp, lostD = hp0[def.id] - def.hp;
    const ko = att.hp <= 0 ? att : def.hp <= 0 ? def : null;
    const loser = racing ? raceLoser : ko ?? (lostA === lostD ? null : lostA > lostD ? att : def);
    if (loser) {
      const win = loser === att ? def : att;
      d.winner = win.id;
      this.bump('duelWin', win.id);
      // победитель забирает часть денег проигравшего
      const stolen = Math.floor((loser.yen * (st.reward.duelStealPct ?? 20)) / 100 / 10) * 10;
      loser.yen -= stolen;
      win.yen += stolen;
      d.stolen = stolen;
      this.bump('stolen', win.id, stolen);
      if (win === att && stolen > 0) this.bump('robbed', win.id);
      if (ko) {
        d.ko = true;
        win.yen += rewardYen(st.reward.duelWinYen, ratesOf(this.s));
        win.stars += st.reward.duelWinStars;
        this.log(`${win.name} побеждает в дуэли! ${loser.name} без сил`);
      } else this.log(racing ? `${win.name} побеждает в гонке` : `${win.name} побеждает в дуэли по очкам`);
      // любое поражение в дуэли — машины больше нет (в гонке — авария)
      if (this.loseCar(loser, d, racing)) this.bump('carWreck', win.id);
      if (stolen) {
        this.log(`${win.name} забирает ¥${stolen} у ${loser.name}`);
        this.io.fx?.('steal', { pid: win.id, from: loser.id, yen: stolen });
      }
    } else this.log('Дуэль окончена: ничья');
    this.settleBets(d);
    this.setStage({ t: 'duelResult' });
    await this.sleep(epoch, d.carLost ? 7000 : 4500);
    this.s.duel = null;
    this.s.race = null;
    this.emit();
  }

  /** ставки зрителей перед дуэлью: +100 / +500 на любого бойца, деньги списываются сразу */
  private async duelBets(epoch: number, d: NonNullable<GameState['duel']>, spectators: string[]) {
    const ms = (this.s.settings.betTime ?? 15) * 1000;
    const stage: Extract<Stage, { t: 'duelBet' }> = { t: 'duelBet', deadline: this.now + LEAD + ms, done: [] };
    d.bets = {};
    this.setStage(stage);
    // дедлайн читаем из стадии: пауза его сдвигает
    const end = () => stage.deadline + 300;
    const waiting = () => spectators.some((id) => !stage.done.includes(id) && (this.s.players[id]?.online || this.s.players[id]?.bot));
    while (waiting() && this.gameNow < end()) {
      const m = await this.waitInput(epoch, (x) => (x.t === 'pick' && x.kind === 'bet' && spectators.includes(x.pid) && !stage.done.includes(x.pid) ? x : undefined), end() - this.gameNow);
      if (!m || m.t !== 'pick') break;
      const p = this.s.players[m.pid];
      if (!p) continue;
      if (m.value === 'done') { stage.done.push(m.pid); this.emit(); continue; }
      const on = m.value?.on, amt = Number(m.value?.amt);
      if ((on !== d.attacker && on !== d.defender) || (amt !== 100 && amt !== 500) || p.yen < amt) continue;
      p.yen -= amt;
      const mine = (d.bets[m.pid] ??= {});
      mine[on] = (mine[on] ?? 0) + amt;
      this.io.fx?.('bet', { pid: m.pid, on, amt });
      this.emit();
    }
    const total = Object.values(d.bets).reduce((a, b) => a + Object.values(b).reduce((x, y) => x + y, 0), 0);
    if (total) this.log(`Ставки на дуэль: ¥${total}`);
  }

  /** выплата ставок: на победителя — вдвое; ничья — деньги назад */
  private settleBets(d: NonNullable<GameState['duel']>) {
    if (!d.bets) return;
    const payouts: Record<string, number> = {};
    for (const [pid, bets] of Object.entries(d.bets)) {
      const p = this.s.players[pid];
      const staked = Object.values(bets).reduce((a, b) => a + b, 0);
      if (!p || !staked) continue;
      const back = d.winner ? (bets[d.winner] ?? 0) * 2 : staked;
      p.yen += back;
      payouts[pid] = back - staked;
      this.bump('betNet', pid, back - staked);
      this.gamble(pid, staked);
    }
    d.payouts = payouts;
  }

  /** новая эпоха наступает, когда открыто достаточно префектур: объявляем на ТВ.
   *  Множители берутся из настроек (пульт) в момент наступления и дальше не меняются */
  private async checkEpoch(epoch: number) {
    const e = epochFor(this.s);
    if (e <= epochOf(this.s)) return;
    this.s.epoch = e;
    this.s.rates = epochRatesFor(this.s.settings, e);
    this.log(`Наступила эпоха ${EPOCHS[e].name}`);
    this.io.fx?.('epoch', { epoch: e });
    this.setStage({ t: 'epoch', epoch: e });
    await this.sleep(epoch, this.hostPaced ? 36e5 : 6000);
    this.snapshot();
  }

  /**
   * Находка под ногами в начале хода — тайная помощь отстающим по стоимости (net worth).
   * Лидер не находит ничего; сильно отстающий (меньше половины медианы) — 30%, отстающий (меньше 3/4) — 15%;
   * остальные изредка находят мелочь (4%) — чтобы находки не выглядели подачкой.
   * Между находками игрока — минимум 2 своих хода, за круг — не больше двух находок на всех.
   */
  /** свой ход игрока (для находок и защиты от фарма) */
  private countTurn(p: Player) {
    const turns = (this.sec.ownTurns ??= {});
    turns[p.id] = (turns[p.id] ?? 0) + 1;
    return turns;
  }

  private async maybeFind(epoch: number, p: Player): Promise<FindId | null> {
    const st = this.s.settings;
    const turns = this.countTurn(p);
    const ids = this.alivePids();
    if (ids.length < 2 || this.s.round < 2 || p.pref == null) return null;
    const fr = (this.sec.findsRound ??= { round: this.s.round, n: 0 });
    if (fr.round !== this.s.round) { fr.round = this.s.round; fr.n = 0; }
    if (fr.n >= 2) return null;
    const last = this.sec.findAt?.[p.id];
    if (last != null && turns[p.id] - last <= 2) return null;
    const nw = Object.fromEntries(ids.map((id) => [id, netWorth(this.s.players[id], st)]));
    const mine = nw[p.id];
    const top = Math.max(...Object.values(nw));
    if (mine >= top) return null; // лидер (или все равны)
    const med = median(Object.values(nw));
    const tier = med >= 1000 && mine < med * 0.5 ? 2 : med >= 1000 && mine < med * 0.75 ? 1 : 0;
    if (Math.random() >= [0.04, 0.15, 0.3][tier]) return null;
    return this.giveFind(epoch, p, tier, nw);
  }

  /** выдать находку: tier 0 — мелочь для маскировки, 1 — отстающему, 2 — сильно отстающему; force — для отладки */
  async giveFind(epoch: number, p: Player, tier: number, nw?: Record<string, number>, force?: FindId): Promise<FindId> {
    const st = this.s.settings;
    const ids = this.alivePids();
    nw ??= Object.fromEntries(ids.map((id) => [id, netWorth(this.s.players[id], st)]));
    const from = p.pref!;
    const free = (c: number) => this.occupants(c, p.id).length < 2;
    // старая карта: что в тумане вокруг и где лежат награды префектур (их на карте не видно до охоты за призами)
    const fog = [...neighbors(from), ...atDistance(from, 2)].filter((c) => !this.s.prefs[c]?.rev || (!this.s.prefs[c]?.taken && !this.s.endgame));
    const top = Math.max(...Object.values(nw));
    const leader = this.s.players[ids.find((id) => nw![id] === top && id !== p.id) ?? ''];
    const gap = Math.max(0, median(Object.values(nw)) - nw[p.id]);
    const weights: [FindId, number][] = tier === 0
      ? [['coin', 3], ['coupon', 2], ['map', fog.length ? 2 : 0], ['wallet', 2]]
      : [
        ['coin', 3], ['cheat', 2], ['wallet', 3], ['neko', 2], ['map', fog.length ? 2 : 0],
        ['rickshaw', atDistance(from, 2).some(free) ? 2 : 0], ['coupon', 2], ['ticket', 1],
        ['kitsune', tier === 2 && leader && leader.yen >= 300 ? 2 : 0],
      ];
    let kind: FindId = 'coin';
    if (force) kind = force;
    else {
      let r = Math.random() * weights.reduce((a, [, w]) => a + w, 0);
      for (const [k, w] of weights) { if ((r -= w) < 0) { kind = k; break; } }
    }
    if (kind === 'kitsune' && !leader) kind = 'wallet';

    let amount: number | undefined;
    let fromPid: string | undefined;
    const info = FIND_INFO[kind];
    if (info.bonus) p.bonuses[info.bonus] = (p.bonuses[info.bonus] ?? 0) + 1;
    if (kind === 'wallet') {
      // закрывает около четверти отставания до медианы; мелочь — тем, кто не отстаёт
      amount = tier === 0 ? 100 + randInt(3) * 50 : Math.max(200, Math.min(1500, Math.round((gap * 0.25) / 50) * 50));
      p.yen += amount;
    }
    if (kind === 'kitsune') {
      amount = Math.min(leader.yen, rewardYen(pick([300, 400, 500]), ratesOf(this.s)));
      leader.yen -= amount;
      p.yen += amount;
      fromPid = leader.id;
      this.log(`Кицунэ утащила ¥${amount} у ${leader.name} и принесла ${p.name}`);
    }
    if (kind === 'map') p.scouted = fog;
    if (kind === 'token') p.tokens = (p.tokens ?? 0) + 1;
    this.bump('finds', p.id);
    const turns = (this.sec.ownTurns ??= {});
    this.sec.findAt = { ...(this.sec.findAt ?? {}), [p.id]: turns[p.id] ?? 0 };
    if (this.sec.findsRound) this.sec.findsRound.n++;
    this.io.fx?.('find', { pid: p.id, kind });
    this.setStage({ t: 'find', pid: p.id, kind, ...(amount ? { amount } : {}), ...(fromPid ? { from: fromPid } : {}) });
    await this.sleep(epoch, kind === 'kitsune' ? 6000 : 4000);
    return kind;
  }

  /** счётчик для титулов в финале */
  private bump(metric: string, pid: string, n = 1) {
    if (!n) return;
    const m = ((this.sec.tally ??= {})[metric] ??= {});
    m[pid] = (m[pid] ?? 0) + n;
  }

  /** азартные игры (пачинко, кольцо, чо-хан, ставки на дуэль) — для приза «Азартный игрок» на пульте */
  private gamble(pid: string, yen: number) {
    this.bump('gambleN', pid);
    this.bump('gambleYen', pid, yen);
  }

  private hit(p: Player, dmg: number) {
    p.hp = Math.max(0, p.hp - dmg);
    if (this.s.duel) this.s.duel.lastHit = { to: p.id, dmg, n: this.stageN };
    this.io.fx?.('hit', { pid: p.id, dmg });
    this.emit();
  }

  /** ритм-баттл ещё можно выбрать: включён в настройках и осталась несыгранная песня */
  private rhythmLeft() {
    return this.s.settings.rhythmInDuel && (this.sec.rhythmBag?.length ?? RHYTHM_TRACKS.length) > 0;
  }

  private async rhythmBattle(epoch: number, pids: string[]): Promise<Record<string, number | null>> {
    // трек: случайный из ещё не сыгранных (до вызова кнопку прячет rhythmLeft)
    this.sec.rhythmBag ??= RHYTHM_TRACKS.map((_, i) => i);
    if (!this.sec.rhythmBag.length) this.sec.rhythmBag = RHYTHM_TRACKS.map((_, i) => i); // на всякий случай: кнопку уже спрятал rhythmLeft
    const track = this.sec.rhythmBag.splice(randInt(this.sec.rhythmBag.length), 1)[0];
    const tr = RHYTHM_TRACKS[track];
    const bpm = tr.bpm;
    const beats = Math.ceil(tr.dur / (60000 / bpm));
    const startAt = this.now + 4500;
    const id = ++this.sec.rhythmN;
    this.s.rhythm = { id, seed: randInt(1e9), bpm, startAt, beats, track, players: pids, scores: Object.fromEntries(pids.map((p) => [p, null])) };
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

  // ───────── барабаны ─────────

  /**
   * Барабан темы вопроса (без спецвопроса). why 'pref' — кончились вопросы префектуры и общие; 'duel' — не выбрал
   * тему дуэли за время. Никто его не запускает: показывается на ТВ и сразу крутится сам.
   */
  private async topicReel(epoch: number, p: Player, why: 'pref' | 'duel'): Promise<TopicId | null> {
    const topics = this.combatTopics().map((t) => t.id);
    if (!topics.length) return null;
    // на ленте не меньше 6 ячеек, иначе одна и та же тема видна в окошке дважды
    const segs = topics.length < 4 ? [...topics, ...topics] : topics;
    // вращение начинается почти сразу — после короткой паузы, чтобы барабан успел появиться
    const spin = makeReelSpin(segs.map(() => 1), this.now + 900);
    this.setStage({ t: 'reel', pid: p.id, why, segs, deadline: 0, spin });
    await this.sleep(epoch, 600);
    this.io.fx?.('reel', { pid: p.id });
    const topic = segs[spin.result];
    await this.sleep(epoch, 300 + spin.dur + 1800);
    this.log(`Барабан выбрал тему: ${this.s.settings.topics.find((t) => t.id === topic)?.name ?? topic}`);
    return topic;
  }

  /** барабан бонуса на телефоне: хост решает, что выпадет, и выдаёт, когда лента остановится */
  private spinBonusReel(p: Player) {
    const r = p.reel;
    if (!r || r.spin) return;
    r.spin = makeReelSpin(r.segs.map(() => 1), this.now + 400);
    this.emit();
    setT(() => this.grantReel(p, r), 400 + r.spin.dur);
  }

  private grantReel(p: Player, r: NonNullable<Player['reel']>) {
    if (p.reel !== r || r.done || !r.spin) return;
    const b = r.segs[r.spin.result];
    p.bonuses[b] = (p.bonuses[b] ?? 0) + 1;
    r.done = true;
    this.emit();
  }

  // ───────── колесо призов (финальная игра) ─────────

  private wheelSegs(left: Record<PrizeTier, number>) {
    return PRIZE_TIERS.filter((k) => left[k] > 0).map((k) => ({ id: k, w: left[k] * TIER_INFO[k].mul }));
  }

  /** жетоны: звёзды и деньги по курсу + найденные; призы — из настроек пульта (берутся один раз, при запуске) */
  private wheelInit() {
    const st = this.s.settings;
    const pr = st.tokens?.prizes;
    const left = Object.fromEntries(PRIZE_TIERS.map((k) => [k, Math.max(0, Math.floor(Number(pr?.[k] ?? 0)) || 0)])) as Record<PrizeTier, number>;
    const tokens = Object.fromEntries(this.alivePids().map((id) => [id, tokensFor(this.s.players[id], st) + (this.s.players[id].tokens ?? 0)]));
    this.s.wheel = { left, tokens, segs: this.wheelSegs(left), spin: null, spinner: null, last: null, history: [] };
    this.wheelOrder(this.s.wheel);
    this.log(`Колесо призов: жетонов ${Object.values(tokens).reduce((a, b) => a + b, 0)}, призов ${Object.values(left).reduce((a, b) => a + b, 0)}`);
  }

  /** очередь колеса: от самого сильного (больше жетонов; равенство — жребий); первый ход — первому с жетонами */
  private wheelOrder(w: NonNullable<GameState['wheel']>) {
    w.order = shuffle(Object.keys(w.tokens)).sort((a, b) => (w.tokens[b] ?? 0) - (w.tokens[a] ?? 0));
    w.turn = null;
    this.wheelAdvance(w, true);
  }

  /** ход колеса — следующему по очереди, у кого есть жетоны (fromStart — с начала очереди) */
  private wheelAdvance(w: NonNullable<GameState['wheel']>, fromStart = false) {
    const order = (w.order ?? []).filter((id) => this.s.players[id]);
    const prizes = PRIZE_TIERS.some((k) => w.left[k] > 0);
    const at = fromStart || !w.turn ? -1 : order.indexOf(w.turn);
    w.turn = null;
    if (!prizes) return;
    for (let k = 1; k <= order.length; k++) {
      const id = order[(at + k + order.length) % order.length];
      if ((w.tokens[id] ?? 0) > 0) { w.turn = id; return; }
    }
  }

  private wheelDone(w: NonNullable<GameState['wheel']>, pid: string, tier: PrizeTier | undefined) {
    if (this.s.wheel !== w || w.spinner !== pid) return;
    w.spinner = null;
    if (tier) {
      w.left[tier] = Math.max(0, w.left[tier] - 1);
      w.history.push({ pid, tier });
      w.last = { pid, tier };
      this.log(`${this.s.players[pid]?.name ?? '?'}: приз «${TIER_INFO[tier].name}»`);
      this.io.fx?.('prize', { pid });
    }
    this.emit();
    this.snapshot();
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
    const dealer = p.pref != null ? dealerAt(this.s.settings, p.pref) : null;
    if (p.bot && !force) {
      // бот в магазин не заходит, но машину при деньгах иногда берёт
      if (dealer && !p.car && p.yen >= this.carCost(p).yen && Math.random() < 0.7) this.buyCar(p, dealer);
      return;
    }
    const ms = this.s.settings.shopTime * 1000;
    const noShop = !(p.pref != null && this.s.settings.shopPrefs?.includes(p.pref)) && !!dealer && !force;
    const stage: Extract<Stage, { t: 'shop' }> = { t: 'shop', pid: p.id, deadline: this.now + ms, entered: false, ...(dealer ? { dealer } : {}), ...(noShop ? { noShop } : {}) };
    this.setStage(stage);
    // дедлайн читаем из стадии: пауза его сдвигает
    const end = () => stage.deadline + 300;
    while (this.gameNow < end()) {
      // без связи долго не ждём
      const v = await this.waitInput(epoch, (m) => (m.t === 'pick' && m.kind === 'shop' && m.pid === p.id ? String(m.value) : undefined), p.online ? end() - this.gameNow : Math.min(end() - this.gameNow, 8000));
      if (v === 'enter' && !stage.entered) {
        stage.entered = true;
        this.emit();
        continue;
      }
      break;
    }
  }

  /** цена машины для игрока: растёт с эпохой; купон — половина */
  private carCost(p: Player) {
    const yen = priceYen(this.s.settings.car?.yen ?? 2000, ratesOf(this.s));
    const coupon = (p.bonuses.coupon ?? 0) > 0;
    return { yen: coupon ? Math.round(yen / 2 / 50) * 50 : yen, coupon };
  }

  /** покупка машины в автосалоне; старая (если была) уходит на металлолом за монетку */
  private buyCar(p: Player, car: CarId): string | null {
    if (p.car === car) return 'У тебя уже такая';
    const c = this.carCost(p);
    if (p.yen < c.yen) return 'Не хватает денег';
    p.yen -= c.yen;
    if (c.coupon) p.bonuses.coupon--;
    this.bump('shopSpent', p.id, c.yen);
    this.bump('carBought', p.id);
    if (p.car) {
      p.bonuses.coin = (p.bonuses.coin ?? 0) + 1;
      this.log(`${p.name} сдал ${carName(p.car)} на металлолом за монетку`);
    }
    p.car = car;
    this.log(`${p.name} купил машину: ${carName(car)}`);
    this.io.fx?.('car', { pid: p.id, car });
    this.emit();
    return null;
  }

  /** проиграл дуэль — остался без машины: остов уходит на металлолом за монетку */
  private loseCar(p: Player, d: NonNullable<GameState['duel']>, crash = false): boolean {
    if (!p.car) return false;
    const how = crash ? CAR_LOST[0] : pick([...CAR_LOST]);
    d.carLost = { pid: p.id, car: p.car, how: how.id };
    this.log(`${p.name} остался без машины (${carName(p.car)}): ${how.text.toLowerCase()} Металлолом — за монетку`);
    delete p.car;
    p.bonuses.coin = (p.bonuses.coin ?? 0) + 1;
    this.bump('carsLost', p.id);
    this.io.fx?.('carLost', { pid: p.id, how: how.id });
    return true;
  }

  /**
   * Гонка — дуэль «машина против машины». Трасса одна на двоих (общее зерно), каждый едет на своём телефоне
   * от общего старта по времени хоста; сюда приходят отсечки и финиш. Возвращает проигравшего (null — ничья).
   */
  private raceDone: (() => void) | null = null;
  private async raceBattle(epoch: number, d: NonNullable<GameState['duel']>, att: Player, def: Player): Promise<Player | null> {
    const kind = trackFor(PREF[def.pref ?? att.pref ?? 0]?.region);
    const tr = TRACKS[kind];
    d.mode = 'race';
    this.setStage({ t: 'banner', text: `ГОНКА! ${tr.ja}`, sub: `${tr.name} — ${tr.sub}. У обоих машины: решит трасса`, big: true });
    await this.sleep(epoch, 3600);
    const id = ++this.sec.rhythmN;
    const pids = [att.id, def.id];
    const race: NonNullable<GameState['race']> = {
      id, seed: randInt(1e9), kind, startAt: this.now + 6500, players: pids,
      cars: { [att.id]: att.car!, [def.id]: def.car! },
      splits: { [att.id]: [], [def.id]: [] }, times: { [att.id]: null, [def.id]: null },
    };
    this.s.race = race;
    this.setStage({ t: 'race' });
    this.io.fx?.('race', { id });
    await new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearT(t);
        this.skipCbs.delete(done);
        this.raceDone = null;
        resolve();
      };
      // не доехал за три минуты — сход
      const t = setT(done, race.startAt - this.now + 180000);
      this.skipCbs.add(done);
      this.raceDone = () => {
        if (pids.every((p) => race.times[p] != null)) return done();
        // соперник не на связи — ждать его незачем
        const waiting = pids.filter((p) => race.times[p] == null);
        if (waiting.length < pids.length && waiting.every((p) => !this.s.players[p]?.online && !this.s.players[p]?.bot)) done();
      };
    });
    this.check(epoch);
    race.over = true;
    this.emit();
    const ta = race.times[att.id], tb = race.times[def.id];
    const fmt = (ms: number | null) => (ms == null ? 'сход' : (ms / 1000).toFixed(2) + ' с');
    this.log(`Гонка: ${att.name} — ${fmt(ta)}, ${def.name} — ${fmt(tb)}`);
    await this.sleep(epoch, 4000);
    if (ta === tb) return null; // равное время (или оба сошли) — ничья, обе машины целы
    const loser = tb == null || (ta != null && ta < tb) ? def : att;
    this.bump('raceWin', loser === att ? def.id : att.id);
    return loser;
  }

  private onRace(pid: string, v: any) {
    const r = this.s.race;
    if (!r || r.over || r.id !== v?.id || !r.players.includes(pid) || r.times[pid] != null) return;
    const ms = Math.round(Number(v.ms));
    if (!(ms > 0) || ms > 600000) return;
    if (v.done) {
      r.times[pid] = ms;
      this.io.fx?.('raceFinish', { pid });
    } else if (r.splits[pid].length < 16) r.splits[pid] = [...r.splits[pid], ms];
    this.emit();
    this.raceDone?.();
  }

  // ───────── групповые игры ─────────

  /** рисунки текущей групповой игры (только на ТВ, в состояние не попадают) */
  groupImgs: Record<string, string | null> = {};
  private drawParts: Record<string, string[]> = {};
  private votes: Record<string, number[]> = {};
  private groupDone: (() => void) | null = null;
  /** иайдо: момент сигнала и ложной тревоги текущего раунда — только для ТВ, в состояние не попадает */
  iaiSignal: { round: number; at: number; decoyAt?: number } | null = null;

  private async groupGame(epoch: number, code: number, game: GroupGameId) {
    if (game === 'dragon') return this.dragonGame(epoch, code);
    if (game === 'godzilla') return this.kaijuGame(epoch, code);
    const st = this.s.settings;
    let tasks = tasksForPref(st, game, code);
    // сашими: в родной префектуре рыбы — её задания (если задание не привязано к префектуре напрямую)
    if (game === 'sashimi' && !tasks.some((t) => t.pref === code)) {
      const local = tasks.filter((t) => t.fish && FISH[t.fish]?.prefs.includes(code));
      if (local.length) tasks = local;
    }
    const used = (this.sec.usedTasks ??= []);
    const fresh = tasks.filter((t) => !used.includes(t.id));
    const task = fresh.length ? pick(fresh) : tasks.length ? pick(tasks) : null;
    if (task) used.push(task.id);
    const players = this.s.joinOrder.filter((id) => this.s.players[id]);
    const g: GroupPublic = {
      id: (this.sec.groupN = (this.sec.groupN ?? 0) + 1), game, prompt: task?.text ?? 'Нарисуйте любой кандзи', pref: code,
      ...(game === 'fukuwarai' ? { face: task?.face ?? 'okame' } : {}),
      ...(game === 'iaido' && task?.scene ? { scene: task.scene } : {}),
      ...(game === 'sashimi' ? (() => { const fish = task?.fish && FISH[task.fish] ? task.fish : 'tuna'; return { fish, total: FISH[fish].total, target: randomTarget(fish) }; })() : {}),
      ...(game === 'noodles' ? (() => {
        const noodle = task?.noodle && NOODLES[task.noodle] ? task.noodle : 'soba';
        const d = NOODLES[noodle];
        // у каждого свой скрытый предел живота — из одних и тех же границ
        const limits = Object.fromEntries(players.map((id) => [id, d.min + randInt(d.max - d.min + 1)]));
        return { noodle, limits, bowls: Object.fromEntries(players.map((id) => [id, 0])), closed: [], burst: [] };
      })() : {}),
      ...(game === 'cherry' ? { winds: Array.from({ length: PIT_TRIES }, randomWind), pits: Object.fromEntries(players.map((id) => [id, Array(PIT_TRIES).fill(null)])), throws: [] } : {}),
      phase: 'intro', players, startAt: 0, deadline: 0, order: shuffle(players), submitted: [], showIdx: 0, voteRound: 0,
      voteRounds: game === 'iaido' || game === 'noodles' || game === 'cherry' ? 0 : Math.min(3, players.length - 1), voted: [],
    };
    this.groupImgs = {};
    this.drawParts = {};
    this.votes = {};
    this.s.g = g;
    this.setStage({ t: 'group' });
    this.io.fx?.('group', g);
    // ведущий зачитывает задание
    await this.sleep(epoch, this.hostPaced ? 36e5 : 6000);

    if (game === 'iaido') {
      const { points, best } = await this.iaido(epoch, g);
      g.best = best;
      // при равных очках выше тот, у кого лучшее время
      // места — всем, кто хоть раз ударил вовремя; при равных очках выше лучшее время
      await this.groupResults(epoch, g, points, (id) => points[id] * 1e5 - Math.min(99999, best[id] ?? 99999), (id) => id in best);
      return;
    }

    // ── рисуем ──
    g.phase = 'draw';
    g.startAt = this.now + LEAD;
    g.deadline = g.startAt + groupTime(st, game) * 1000;
    this.emit();
    this.botDraw(g);
    // косточки: боты плюются по ходу игры, чтобы на ТВ было на что смотреть
    if (game === 'cherry') for (const id of g.players) if (this.s.players[id]?.bot) for (let i = 0; i < PIT_TRIES; i++) {
      setT(() => {
        if (this.s.g === g) this.onPit(id, { id: g.id, i, a: 25 + randInt(35), p: 0.55 + Math.random() * 0.42 });
      }, g.startAt - this.now + 5000 + i * 9000 + randInt(4000));
    }
    await new Promise<void>((resolve) => {
      const done = () => { this.pClear(t); this.skipCbs.delete(done); this.groupDone = null; resolve(); };
      // после конца времени ждём, пока рисунки долетят
      const t = this.pT(done, g.deadline - this.now + 8000);
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

    if (game === 'noodles') return this.noodleResults(epoch, g);
    if (game === 'cherry') return this.pitResults(epoch, g);
    if (GROUP_GAMES[game].scored) return this.sashimiResults(epoch, g);

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
      // без таймера: ждём, пока проголосуют все, кто на связи (ведущий может пропустить)
      g.startAt = this.now + LEAD;
      g.deadline = 0;
      this.emit();
      const voters = () => g.players.filter((id) => this.s.players[id] && (this.s.players[id].online || this.s.players[id].bot));
      let skipped = false;
      const skip = () => { skipped = true; };
      this.skipCbs.add(skip);
      while (!skipped && voters().some((id) => !g.voted.includes(id))) {
        const m = await this.waitInput(epoch, (x) => {
          if (x.t !== 'pick' || x.kind !== 'vote' || !g.players.includes(x.pid) || g.voted.includes(x.pid)) return undefined;
          const n = Number(x.value);
          const mine = this.votes[x.pid] ?? [];
          if (!(n >= 1 && n <= g.order.length) || g.order[n - 1] === x.pid || mine.includes(n)) return undefined;
          return { pid: x.pid, n };
        }, 2000);
        if (!m) continue; // проверяем, кто ещё на связи
        (this.votes[m.pid] ??= [])[r - 1] = m.n;
        g.voted.push(m.pid);
        this.io.fx?.('answered', { pid: m.pid });
        this.emit();
      }
      this.skipCbs.delete(skip);
    }

    // ── итоги: 3 очка за голос «1 место», 2 — за второе, 1 — за третье ──
    const points: Record<string, number> = Object.fromEntries(g.players.map((id) => [id, 0]));
    for (const vs of Object.values(this.votes)) vs.forEach((n, i) => { if (n) points[g.order[n - 1]] += 3 - i; });
    await this.groupResults(epoch, g, points);
  }

  /** места и награды; одинаковый ключ (по умолчанию — очки) — одно место на всех (1, 1, 2, 3…) */
  private async groupResults(epoch: number, g: GroupPublic, points: Record<string, number>, key: (id: string) => number = (id) => points[id], ranked: (id: string) => boolean = (id) => points[id] > 0) {
    const st = this.s.settings;
    const scored = g.players.filter(ranked);
    const levels = [...new Set(scored.map(key))].sort((a, b) => b - a);
    const places: Record<string, number> = {};
    const awards: Record<string, string> = {};
    for (const id of scored) {
      const lv = levels.indexOf(key(id));
      const p = this.s.players[id];
      if (lv < 0 || lv >= st.group.prizes.length || !p) continue;
      places[id] = lv + 1;
      this.bump('group:' + g.game, id, placePoints(lv + 1));
      const pr0 = st.group.prizes[lv] ?? { yen: 0, stars: 0 };
      const pr = { yen: rewardYen(pr0.yen, ratesOf(this.s)), stars: pr0.stars };
      p.yen += pr.yen;
      p.stars += pr.stars;
      awards[id] = [pr.yen ? `+¥${pr.yen}` : '', pr.stars ? `+${pr.stars}★` : ''].filter(Boolean).join(' ');
      // сашими: победителю достаётся лучший кусок
      if (g.game === 'sashimi' && lv === 0) { p.bonuses.sashimi = (p.bonuses.sashimi ?? 0) + 1; awards[id] += ' + кусочек'; }
    }
    g.points = points;
    g.places = places;
    g.awards = awards;
    g.phase = 'results';
    this.emit();
    this.io.fx?.('prize', { game: g.game });
    const win = g.players.filter((id) => places[id] === 1).map((id) => this.s.players[id]?.name).filter(Boolean);
    if (win.length) this.log(`${GROUP_GAMES[g.game].name}: побеждает ${win.join(', ')}`);
    await this.sleep(epoch, this.hostPaced ? 36e5 : 12000);
    this.s.g = null;
    this.groupImgs = {};
    this.iaiSignal = null;
    this.emit();
  }

  /**
   * Иайдо: несколько раундов. В случайный момент на ТВ вспыхивает «!»; телефон шлёт время нажатия
   * по часам хоста — сравниваем время, а не порядок прихода сообщений. Нажал раньше — выбыл из раунда.
   * За раунд: 3 очка самому быстрому, 2 второму, 1 третьему.
   */
  private async iaido(epoch: number, g: GroupPublic) {
    const rounds = iaidoRounds(this.s.settings);
    const points: Record<string, number> = Object.fromEntries(g.players.map((id) => [id, 0]));
    const best: Record<string, number> = {};
    g.phase = 'draw';
    for (let r = 1; r <= rounds; r++) {
      await this.gate(epoch);
      const iai: IaiRound = { round: r, rounds, step: 'ready', early: [], cut: [] };
      g.iai = iai;
      g.startAt = this.now + LEAD + 1500; // «приготовились»
      g.deadline = 0; // момент сигнала телефонам не сообщаем
      // своё «нагнетание» (вкладка «Звуки») звучит с начала раунда; «!» — только когда оно доиграет
      const tension = this.io.soundMs?.('iaiTension') ?? 0;
      const calm = tension ? g.startAt + tension : g.startAt; // раньше этого момента сигнала не будет
      const at = tension ? calm + 1000 + randInt(4000) : g.startAt + 2000 + randInt(5000);
      // со второго раунда — иногда ложная тревога (серый «?»): кто дёрнулся — выбыл
      const decoyFrom = tension ? calm + 400 : g.startAt + 900;
      const decoyAt = r > 1 && at - decoyFrom > 1400 && Math.random() < 0.6 ? decoyFrom + Math.random() * (at - decoyFrom - 800) : undefined;
      this.iaiSignal = { round: r, at, decoyAt };
      this.emit();
      this.botIaido(g, iai, at);
      const presses: Record<string, number> = {};
      const end = at + 2500;
      const waiting = () => g.players.some((id) => !(id in presses) && (this.s.players[id]?.online || this.s.players[id]?.bot));
      while (waiting() && this.now < end) {
        const m = await this.waitInput(epoch, (x) => (x.t === 'pick' && x.kind === 'iaido' && g.players.includes(x.pid) && x.value?.r === r && !(x.pid in presses) ? x : undefined), end - this.now);
        if (!m) break;
        let t = Number(m.value.at);
        // из будущего не бывает; без времени — считаем по приходу
        if (!Number.isFinite(t) || t > this.now + 50) t = this.now;
        presses[m.pid] = t;
        if (t < at) {
          iai.early.push(m.pid);
          this.io.fx?.('iaiEarly', { pid: m.pid });
        } else {
          iai.cut.push(m.pid);
          this.io.fx?.('answered', { pid: m.pid });
        }
        this.emit();
      }
      // если все поторопились, ждём, пока «!» всё-таки покажется
      if (this.now < at + 300) await this.sleep(epoch, at + 300 - this.now);
      const times = Object.fromEntries(iai.cut.map((id) => [id, Math.round(presses[id] - at)]));
      const ranked = [...iai.cut].sort((a, b) => times[a] - times[b]);
      ranked.slice(0, 3).forEach((id, i) => { points[id] += 3 - i; });
      for (const id of iai.cut) best[id] = Math.min(best[id] ?? Infinity, times[id]);
      iai.times = times;
      iai.step = 'done';
      this.emit();
      this.io.fx?.('iaiCut', { pid: ranked[0] ?? null });
      if (ranked[0]) this.log(`斬 ${this.s.players[ranked[0]]?.name}: ${times[ranked[0]]} мс`);
      await this.sleep(epoch, 4500);
    }
    g.iai = undefined;
    return { points, best };
  }

  /** боты: реакция 0,25–0,6 c, иногда фальстарт */
  private botIaido(g: GroupPublic, iai: IaiRound, at: number) {
    for (const id of g.players) if (this.s.players[id]?.bot) {
      const t = Math.random() < 0.12 ? at - 300 - randInt(1500) : at + 250 + randInt(350);
      setT(() => {
        if (this.s.g !== g || g.iai !== iai) return;
        this.feed({ t: 'pick', pid: id, kind: 'iaido', value: { r: iai.round, at: t } });
      }, Math.max(0, t - this.now + 40));
    }
  }

  /** сашими: взвешиваем куски по одному (от худшего к лучшему), места — по точности */
  private async sashimiResults(epoch: number, g: GroupPublic) {
    const fish = g.fish!;
    const cuts: Record<string, number> = {};
    const grams: Record<string, number> = {};
    for (const id of g.players) {
      const v = this.groupImgs[id];
      const t = v?.startsWith('cut:') ? Number(v.slice(4)) : NaN;
      if (!isFinite(t)) continue;
      cuts[id] = Math.max(0, Math.min(1, t));
      grams[id] = pieceGrams(fish, cuts[id]);
    }
    const err: Record<string, number> = Object.fromEntries(Object.keys(grams).map((id) => [id, Math.abs(grams[id] - g.target!)]));
    g.cuts = cuts;
    g.grams = grams;
    g.order = Object.keys(grams).sort((a, b) => err[b] - err[a]);
    g.phase = 'show';
    for (let i = 0; i < g.order.length; i++) {
      g.showIdx = i;
      this.emit();
      this.io.fx?.('chop', {});
      await this.sleep(epoch, Math.max(2500, this.s.settings.group.showMs));
    }
    // меньше промах — выше место; одинаковый промах — одно место
    await this.groupResults(epoch, g, err, (id) => -err[id], (id) => id in err);
  }

  /**
   * Лапша: итоги. Телефон сам считает миски и шлёт «nood:<съедено>:<как кончил>»; хост сверяет со скрытым пределом:
   * съел больше предела — лопнул (в зачёт половина предела). Кто не прислал итог — по последнему ходу игры.
   */
  private async noodleResults(epoch: number, g: GroupPublic) {
    const d = noodleOf(g.noodle);
    // больше, чем физически можно съесть за время игры, не бывает
    const maxBowls = Math.ceil((groupTime(this.s.settings, 'noodles') * 1000) / (d.tossMs + d.taps * 70)) + 2;
    const points: Record<string, number> = {};
    const bowls = (g.bowls ??= {});
    const burst = new Set(g.burst ?? []);
    const closed = new Set(g.closed ?? []);
    for (const id of g.players) {
      const r = parseNoodle(this.groupImgs[id]);
      const lim = g.limits?.[id] ?? d.max;
      let n = Math.min(maxBowls, r ? r.n : bowls[id] ?? 0);
      if (r?.how === 'burst' || n > lim) { burst.add(id); n = lim; }
      else if (r?.how === 'lid') closed.add(id);
      bowls[id] = n;
      points[id] = noodleScore(n, burst.has(id));
    }
    g.burst = [...burst];
    g.closed = [...closed].filter((id) => !burst.has(id));
    // при равных очках выше тот, кто не лопнул
    await this.groupResults(epoch, g, points, (id) => points[id] * 2 + (burst.has(id) ? 0 : 1), (id) => points[id] > 0);
  }

  /** лапша: ход игры с телефона (сколько съел, закрыл ли миску) — для ТВ; рассылаем не чаще раза в 0,4 c */
  private noodleEmitT: any = null;
  private onNoodle(pid: string, v: any) {
    const g = this.s.g;
    if (!g || g.game !== 'noodles' || g.phase !== 'draw' || g.id !== v?.id || !g.players.includes(pid) || !g.bowls) return;
    if (g.burst?.includes(pid) || g.closed?.includes(pid)) return;
    const n = Math.max(0, Math.min(999, Math.floor(Number(v.n) || 0)));
    const lim = g.limits?.[pid] ?? 0;
    if (v.how === 'burst' || n > lim) { (g.burst ??= []).push(pid); g.bowls[pid] = lim; this.io.fx?.('noodleBurst', { pid }); }
    else {
      g.bowls[pid] = Math.max(g.bowls[pid] ?? 0, n);
      if (v.how === 'lid') { (g.closed ??= []).push(pid); this.io.fx?.('answered', { pid }); }
    }
    if (!this.noodleEmitT) this.noodleEmitT = setT(() => { this.noodleEmitT = null; this.emit(); }, 400);
  }

  /** косточки: бросок (угол, сила) → дальность по ветру этой попытки; каждая попытка — один раз */
  private throwPit(g: GroupPublic, pid: string, i: number, a: number, p: number): boolean {
    const row = g.pits?.[pid];
    if (!row || !(i >= 0 && i < PIT_TRIES) || row[i] != null || !Number.isFinite(a) || !Number.isFinite(p)) return false;
    if (a < ANGLE_MIN - 1 || a > ANGLE_MAX + 1 || p < 0 || p > 1) return false;
    const d = pitDistance(a, p, g.winds?.[i] ?? 0);
    row[i] = d;
    (g.throws ??= []).push({ pid, i, d });
    return true;
  }

  private onPit(pid: string, v: any) {
    const g = this.s.g;
    if (!g || g.game !== 'cherry' || g.phase !== 'draw' || g.id !== v?.id || !g.players.includes(pid)) return;
    if (!this.throwPit(g, pid, Number(v.i), Number(v.a), Number(v.p))) return;
    this.io.fx?.('pit', { pid });
    this.emit();
  }

  /** косточки: досчитываем броски из итогов телефонов (если живые сообщения потерялись), места — по лучшей дальности */
  private async pitResults(epoch: number, g: GroupPublic) {
    for (const id of g.players) parsePits(this.groupImgs[id])?.forEach((x, i) => { if (x) this.throwPit(g, id, i, x.a, x.p); });
    const best: Record<string, number> = {};
    for (const id of g.players) {
      const ds = (g.pits?.[id] ?? []).filter((d): d is number => d != null);
      if (ds.length) best[id] = Math.max(...ds);
    }
    this.emit();
    await this.groupResults(epoch, g, best, (id) => Math.round(best[id] * 100), (id) => id in best);
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
    this.groupImgs[m.pid] = url.startsWith('data:image/') || ((url.startsWith('text:') || url.startsWith('cut:') || url.startsWith('nood:') || url.startsWith('pit:')) && url.length < 300) ? url : null;
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
        this.groupImgs[id] = g.game === 'senryu' ? 'text:' + pick(lines)
          : g.game === 'sashimi' ? 'cut:' + cutForGrams(g.fish!, g.target! * (0.7 + Math.random() * 0.6)).toFixed(4)
          : g.game === 'cherry' ? 'pit:' + Array.from({ length: PIT_TRIES }, () => `${25 + randInt(35)},${(0.55 + Math.random() * 0.42).toFixed(3)}`).join(';')
          : g.game === 'noodles' ? (() => { const d = noodleOf(g.noodle); const n = d.min + randInt(d.max - d.min + 4); return `nood:${n}:${n > (g.limits?.[id] ?? 0) ? 'burst' : 'lid'}`; })() : null;
        g.submitted.push(id);
        this.emit();
        this.groupDone?.();
      }, Math.max(0, g.deadline - this.now - 1000 - randInt(3000)));
    }
  }

  // ───────── джа-одори ─────────

  /** промахи игроков (номера шагов), пока не засчитаны */
  private dragonMiss: Record<string, Set<number>> = {};
  /** призовое кольцо: до какого времени огонёк ещё тормозит после СТОП */
  private ringSettle: Record<string, number> = {};
  /** прощённые ничьей шаги: промахи до этого шага включительно больше не считаются */
  private dragonForgiven: Record<string, number> = {};

  private async dragonGame(epoch: number, code: number) {
    const st = this.s.settings;
    const cfg = dragonSettings(st);
    const players = shuffle(this.alivePids());
    const d: DragonPublic = {
      id: (this.sec.groupN = (this.sec.groupN ?? 0) + 1), pref: code, phase: 'intro', players, alive: [...players], out: {},
      startAt: 0, bpm: cfg.bpm, accel: cfg.accel, maxBpm: Math.max(cfg.bpm, cfg.maxBpm), warm: Math.max(0, cfg.warm | 0),
      steps: Math.max(8, cfg.steps | 0), tapLag: cfg.tapLag,
    };
    const rounds = Math.max(1, Math.min(5, cfg.rounds ?? 3));
    d.round = 1;
    d.rounds = rounds;
    d.score = {};
    // суммарно пронесённые шаги — тай-брейк по очкам
    const carried: Record<string, number> = {};
    this.s.dr = d;
    this.setStage({ t: 'dragon' });
    // ведущий объясняет правила
    await this.sleep(epoch, this.hostPaced ? 36e5 : 8000);

    for (let r = 1; r <= rounds; r++) {
      if (r > 1) {
        d.id = this.sec.groupN = (this.sec.groupN ?? 0) + 1;
        d.round = r;
        d.alive = d.players.filter((id) => this.s.players[id]);
        d.out = {};
        d.tie = undefined;
        d.roundPlaces = undefined;
      }
      await this.dragonRound(epoch, d);
      // места раунда: кто дольше нёс — выше; выбывшие на одном шаге делят место
      const levels = [Infinity, ...new Set(Object.values(d.out))].sort((a, b) => b - a);
      const rp: Record<string, number> = {};
      for (const id of d.players) {
        if (!this.s.players[id]) continue;
        const lv = levels.indexOf(d.alive.includes(id) ? Infinity : d.out[id]);
        rp[id] = lv + 1;
        d.score![id] = (d.score![id] ?? 0) + Math.max(0, 3 - lv);
        carried[id] = (carried[id] ?? 0) + (d.alive.includes(id) ? d.steps + d.warm : d.out[id]);
      }
      d.roundPlaces = rp;
      if (r < rounds) {
        d.phase = 'results';
        this.emit();
        await this.sleep(epoch, this.hostPaced ? 36e5 : 7000);
      }
    }

    // ── итоги: больше очков за раунды — выше; при равенстве — кто суммарно дольше нёс ──
    const key = (id: string) => `${d.score![id] ?? 0}:${carried[id] ?? 0}`;
    const ids = d.players.filter((id) => this.s.players[id]);
    const levels = [...new Set(ids.map(key))].sort((a, b) => { const [sa, ca] = a.split(':').map(Number), [sb, cb] = b.split(':').map(Number); return sb - sa || cb - ca; });
    const places: Record<string, number> = {};
    const awards: Record<string, string> = {};
    for (const id of ids) {
      const p = this.s.players[id];
      const lv = levels.indexOf(key(id));
      if (lv < 0 || lv >= st.group.prizes.length) continue;
      places[id] = lv + 1;
      this.bump('group:dragon', id, placePoints(lv + 1));
      const pr0 = st.group.prizes[lv] ?? { yen: 0, stars: 0 };
      const pr = { yen: rewardYen(pr0.yen, ratesOf(this.s)), stars: pr0.stars };
      p.yen += pr.yen;
      p.stars += pr.stars;
      awards[id] = [pr.yen ? `+¥${pr.yen}` : '', pr.stars ? `+${pr.stars}★` : ''].filter(Boolean).join(' ');
    }
    d.places = places;
    d.awards = awards;
    d.phase = 'results';
    this.emit();
    this.io.fx?.('prize', { game: 'dragon' });
    const win = d.players.filter((id) => places[id] === 1).map((id) => this.s.players[id]?.name).filter(Boolean);
    if (win.length) this.log(`🐉 Джа-одори: лучше всех дракона нёс ${win.join(', ')}`);
    await this.sleep(epoch, this.hostPaced ? 36e5 : 12000);
    this.s.dr = null;
    this.emit();
  }

  /** один раунд шествия: до последнего носильщика или до конца шагов */
  private async dragonRound(epoch: number, d: DragonPublic) {
    this.dragonMiss = {};
    this.dragonForgiven = {};
    d.phase = 'play';
    d.startAt = this.now + 2500;
    this.emit();
    this.io.fx?.('dragon', d);
    const times = dragonTimes(d);
    // боты сбиваются в случайный момент зачёта
    for (const id of d.players) if (this.s.players[id]?.bot) this.dragonMiss[id] = new Set([d.warm + 4 + randInt(Math.min(d.steps - 4, 90))]);
    let stopped = false;
    const stop = () => { stopped = true; };
    this.skipCbs.add(stop);
    let settled = -1;
    while (!stopped && d.alive.length > 1 && settled < times.length - 1) {
      await new Promise<void>((r) => setT(r, 100));
      this.check(epoch);
      const t = this.now;
      while (settled < times.length - 1 && times[settled + 1] + dragonWindow(d, settled + 1) + DRAGON_GRACE <= t) {
        const step = ++settled;
        if (step < d.warm) continue;
        const alive = d.alive.filter((id) => this.s.players[id]);
        const silent = (id: string) => !this.s.players[id].bot && Date.now() - (this.lastSeen[id] ?? 0) > DRAGON_SILENT;
        const fails = alive.filter((id) => [...(this.dragonMiss[id] ?? [])].some((n) => n <= step) || silent(id));
        if (fails.length && fails.length === alive.length) {
          // сбились все оставшиеся — прощаем всем
          for (const id of fails) {
            this.dragonMiss[id] = new Set([...(this.dragonMiss[id] ?? [])].filter((n) => n > step));
            this.dragonForgiven[id] = step;
          }
          d.tie = step;
          this.emit();
          continue;
        }
        if (!fails.length && alive.length === d.alive.length) continue;
        for (const id of fails) d.out[id] = step;
        d.alive = alive.filter((id) => !fails.includes(id));
        if (fails.length) this.io.fx?.('dragonOut', { pids: fails, step });
        this.emit();
        if (d.alive.length <= 1) break;
      }
    }
    this.skipCbs.delete(stop);
  }

  // ───────── финальная схватка: сумо ─────────

  /** Все — на дохё. По кругу каждый выбирает тему (как в дуэли); отвечают все. Ведущий круга ответил верно — все ошибшиеся
   *  отъезжают к краю на его силу в теме (спецвопрос — specialPower, монетка +1). Ошибся сам — отъезжает сам.
   *  Запас хода до края скрыт: он считается от силы игроков и числа спецвопросов; в первых кругах (grace) никто не вылетает,
   *  а после них запас поправляется так, чтобы даже молчавший всё время устоял. С круга rampFrom толчки растут. */
  private async sumoFinal(epoch: number) {
    const st = this.s.settings;
    const cfg = sumoSettings(st);
    const ids = (this.s.turnOrder.length ? this.s.turnOrder : this.s.joinOrder).filter((id) => this.s.players[id]);
    if (!cfg.enabled || ids.length < 2) return;
    const topics = this.combatTopics().map((t) => t.id);
    const sec = (this.sec.sumo ??= { dmg: {}, cap: 0, fixed: false });
    let su = this.s.sumo;
    if (!su) {
      su = this.s.sumo = { id: (this.sec.groupN = (this.sec.groupN ?? 0) + 1), phase: 'intro', ring: ids, alive: [...ids], out: [], pos: Object.fromEntries(ids.map((id) => [id, 0])), asker: null, circle: 1 };
      // типичный удар: медиана средней силы игроков; спецвопросы бьют сильнее — добавляем запас
      const mean = (p: Player) => (topics.length ? topics.reduce((a, t) => a + (p.stats[t] ?? st.baseStrength), 0) / topics.length : st.baseStrength);
      const hit = Math.max(1, median(ids.map((id) => mean(this.s.players[id]))));
      const specials = ids.reduce((a, id) => a + (this.s.players[id].specials ?? 0), 0);
      sec.cap = cfg.misses * hit + (specials * st.specialPower * 0.5 * (ids.length - 1)) / ids.length;
      sec.dmg = Object.fromEntries(ids.map((id) => [id, 0]));
      this.log('Финальная схватка: сумо');
      this.io.fx?.('sumo', { kind: 'start' });
      this.setStage({ t: 'sumo' });
      await this.sleep(epoch, this.hostPaced ? 36e5 : 10000);
    }
    const S = su;
    const live = () => S.alive.filter((id) => this.s.players[id]);
    const place = (id: string) => Math.min(1, sec.dmg[id] / sec.cap);
    const ms = st.pickTime * 1000;
    while (live().length > 1) {
      const mult = 1 + cfg.ramp * Math.max(0, S.circle - cfg.rampFrom + 1);
      const grace = S.circle <= cfg.grace;
      for (const pid of [...S.ring]) {
        S.alive = live();
        if (S.alive.length <= 1) break;
        if (!S.alive.includes(pid)) continue;
        await this.gate(epoch);
        const asker = this.s.players[pid];
        S.asker = pid;
        S.phase = 'pick';
        S.fell = [];
        this.setStage({ t: 'duelPick', pid, deadline: this.now + ms, topics, canSpecial: asker.specials > 0, canRhythm: false, sumo: true });
        const choice = await this.waitInput(epoch, (m) => {
          if (m.t !== 'pick' || m.kind !== 'duel' || m.pid !== pid) return undefined;
          if (m.value === 'special' && asker.specials > (asker.specialTopics?.length ?? 0)) return 'special';
          if (typeof m.value === 'string' && m.value.startsWith('special:') && asker.specialTopics?.includes(m.value.slice(8))) return m.value;
          return topics.includes(m.value) ? (m.value as string) : undefined;
        }, ms + 400);
        const pickV = choice ?? (await this.topicReel(epoch, asker, 'duel')) ?? pick(topics);
        let special = false;
        let q: Question | null;
        if (pickV === 'special' || pickV.startsWith('special:')) {
          asker.specials--;
          this.bump('specials', asker.id);
          special = true;
          const sTopic = pickV.startsWith('special:') ? pickV.slice(8) : null;
          if (sTopic) asker.specialTopics!.splice(asker.specialTopics!.indexOf(sTopic), 1);
          // кто-то уже у самого края — спецвопрос средней сложности (если есть): шанс пережить сильный толчок
          const soft: Difficulty | undefined = S.alive.some((id) => id !== pid && place(id) >= 0.6) ? 'medium' : undefined;
          q = (sTopic ? this.pickQuestion((x) => x.topic === sTopic, false, soft) : null) ?? this.pickQuestion((x) => !!x.special, false, soft) ?? this.pickQuestion((x) => topics.includes(x.topic));
        } else {
          q = this.pickQuestion((x) => x.topic === pickV && !x.special) ?? this.pickQuestion((x) => topics.includes(x.topic));
        }
        if (!q) continue;
        const tName = st.topics.find((t) => t.id === q!.topic)?.name ?? q.topic;
        const everyone = [...S.alive, ...S.out.filter((id) => this.s.players[id])];
        const res = await this.ask(epoch, q, 'sumo', `Сумо · круг ${S.circle} · ${special ? 'Спецвопрос · ' : ''}${tName} · спрашивает ${asker.name}`, everyone, q.time ?? st.duelTime);
        const okA = res[pid] === q.correct;
        const coin = this.s.q?.coins?.[pid];
        const power = ((special ? st.specialPower : asker.stats[q.topic] ?? st.baseStrength) + (coin ? COIN_DMG[coin] : 0)) * mult;
        const pushed: string[] = [];
        const results: Record<string, string> = {};
        if (okA) {
          results[pid] = 'Толкает!';
          for (const id of S.alive) if (id !== pid) { if (res[id] === q.correct) results[id] = 'Устоял'; else { pushed.push(id); results[id] = 'Толчок!'; } }
        } else {
          pushed.push(pid);
          results[pid] = 'Оступился!';
          for (const id of S.alive) if (id !== pid && res[id] === q.correct) results[id] = 'Устоял';
        }
        // выбывшие играют за гостевые деньги
        for (const id of S.out) {
          const p = this.s.players[id];
          if (!p || res[id] !== q.correct) continue;
          const y = rewardYen(st.reward.otherCorrectYen, ratesOf(this.s));
          p.yen += y;
          results[id] = `+¥${y}`;
        }
        await this.reveal(epoch, results);
        // толчок
        S.prev = { ...S.pos };
        for (const id of pushed) sec.dmg[id] = (sec.dmg[id] ?? 0) + power;
        // в «безопасных» кругах никто не вылетает: стоят у края
        for (const id of S.alive) S.pos[id] = grace ? Math.min(0.9, place(id)) : place(id);
        const fell = grace ? [] : pushed.filter((id) => sec.dmg[id] >= sec.cap).sort((a, b) => sec.dmg[b] - sec.dmg[a]);
        S.phase = 'push';
        this.setStage({ t: 'sumo' });
        if (pushed.length) this.io.fx?.('sumo', { kind: 'push', pids: pushed });
        await this.sleep(epoch, pushed.length ? 2600 : 1200);
        if (fell.length) {
          S.fell = fell;
          S.out.push(...fell);
          S.alive = S.alive.filter((id) => !fell.includes(id));
          for (const id of fell) this.log(`Сумо: ${this.s.players[id]?.name} вытолкнут с дохё`);
          this.io.fx?.('sumo', { kind: 'out', pids: fell });
          this.emit();
          await this.sleep(epoch, 3200);
        }
        S.prev = undefined;
        this.snapshot();
      }
      // круг пройден: после «безопасных» кругов поправляем запас — даже молчавший всё время должен устоять
      if (S.circle === cfg.grace && !sec.fixed) {
        sec.fixed = true;
        const worst = Math.max(0, ...live().map((id) => sec.dmg[id] ?? 0));
        sec.cap = Math.max(sec.cap, worst / 0.85);
        for (const id of live()) S.pos[id] = place(id);
      }
      S.circle++;
    }
    // ── итоги: победитель — первый, выбывшие — с конца ──
    S.alive = live();
    const order = [...S.alive, ...[...S.out].reverse()].filter((id) => this.s.players[id]);
    const places: Record<string, number> = {};
    const awards: Record<string, string> = {};
    order.forEach((id, i) => {
      const p = this.s.players[id];
      places[id] = i + 1;
      const pr0 = st.group.prizes[i] ?? { yen: 0, stars: 0 };
      const yen = rewardYen(Math.round(pr0.yen * cfg.mult), ratesOf(this.s)), stars = Math.round(pr0.stars * cfg.mult);
      p.yen += yen;
      p.stars += stars;
      awards[id] = [yen ? `+¥${yen}` : '', stars ? `+${stars}★` : ''].filter(Boolean).join(' ');
    });
    if (order[0]) { this.bump('sumoWin', order[0]); this.log(`Ёкодзуна — ${this.s.players[order[0]].name}!`); }
    S.places = places;
    S.awards = awards;
    S.asker = null;
    S.phase = 'results';
    this.setStage({ t: 'sumo' });
    this.io.fx?.('sumo', { kind: 'win' });
    this.io.fx?.('prize', { game: 'sumo' });
    await this.sleep(epoch, this.hostPaced ? 36e5 : 15000);
    this.s.sumo = null;
    delete this.sec.sumo;
  }

  // ───────── «Годзилла» ─────────

  /** желание Годзиллы шагнуть: исполняется, как только выйдет время шага */
  private kaijuWant: number | null = null;
  private kaijuLastStep = 0;
  private kaijuN = 0;
  private kaijuEmitAt = 0;

  /** лидер по состоянию — Годзилла, остальные — охотники; идёт cfg.time секунд или пока у Годзиллы не кончатся жизни */
  private async kaijuGame(epoch: number, code: number) {
    const st = this.s.settings;
    const cfg = kaijuSettings(st);
    const ids = this.s.joinOrder.filter((id) => this.s.players[id]);
    if (ids.length < 2) return;
    const top = Math.max(...ids.map((id) => netWorth(this.s.players[id], st)));
    const zilla = pick(ids.filter((id) => netWorth(this.s.players[id], st) === top));
    const hunters = ids.filter((id) => id !== zilla);
    const cols = Math.max(3, Math.min(9, cfg.cols | 0)), rows = Math.max(3, Math.min(7, cfg.rows | 0));
    const start = startCell({ cols, rows });
    const k: KaijuPublic = {
      id: (this.sec.groupN = (this.sec.groupN ?? 0) + 1), pref: code, phase: 'intro', zilla, hunters, cols, rows,
      startAt: 0, endAt: 0, pos: start, face: 1, hp: cfg.hp, maxHp: cfg.hp, stunUntil: 0, down: [start], stomped: 0,
      shells: [], ready: {}, hits: Object.fromEntries(hunters.map((id) => [id, 0])), shots: {},
      // перезарядка рассчитана на 6 охотников: если их меньше, каждый стреляет чаще
      cfg: { stepMs: cfg.stepMs, smashMs: cfg.smashMs, fuseMs: cfg.fuseMs, reloadMs: Math.round(cfg.reloadMs * Math.max(0.4, Math.min(1.5, hunters.length / 6))) }, busyUntil: 0,
    };
    this.s.kj = k;
    this.kaijuWant = null;
    this.kaijuLastStep = 0;
    this.setStage({ t: 'kaiju' });
    this.log(`Годзилла выходит из залива: ${this.s.players[zilla].name} против всех`);
    // ведущий объясняет правила
    await this.sleep(epoch, this.hostPaced ? 36e5 : 9000);

    k.phase = 'play';
    k.startAt = this.now + 3500;
    k.endAt = k.startAt + cfg.time * 1000;
    this.emit();
    this.io.fx?.('kaiju', { kind: 'start' });
    let stopped = false;
    const stop = () => { stopped = true; };
    this.skipCbs.add(stop);
    const botAt: Record<string, number> = {};
    while (!stopped && k.hp > 0 && this.now < k.endAt) {
      await new Promise<void>((r) => setT(r, 50));
      this.check(epoch);
      const t = this.now;
      if (t < k.startAt) continue;
      let dirty = false;
      // боты: Годзилла думает раз в шаг, охотники стреляют с задержкой после перезарядки
      if (this.s.players[k.zilla]?.bot && this.kaijuWant == null && t >= k.busyUntil + 120) { const d = botZilla(k, t); if (d >= 0) this.kaijuWant = d; }
      for (const id of k.hunters) {
        if (!this.s.players[id]?.bot || (k.ready[id] ?? 0) > t) continue;
        botAt[id] ??= t + 300 + randInt(1500);
        if (t >= botAt[id]) { delete botAt[id]; this.kaijuFire(k, id, botHunter(k), t); dirty = true; }
      }
      // шаг Годзиллы
      if (this.kaijuWant != null && t >= k.busyUntil) {
        const to = stepCell(k, k.pos, this.kaijuWant);
        if (this.kaijuWant === 1) k.face = 1; else if (this.kaijuWant === 3) k.face = -1;
        this.kaijuWant = null;
        if (to >= 0) {
          k.pos = to;
          this.kaijuLastStep = t;
          k.busyUntil = t + (k.down.includes(to) ? k.cfg.stepMs : k.cfg.smashMs);
          if (!k.down.includes(to)) { k.down.push(to); k.stomped++; this.io.fx?.('kaiju', { kind: 'stomp', cell: to }); }
          else this.io.fx?.('kaiju', { kind: 'step', cell: to });
          dirty = true;
        }
      }
      // снаряды падают
      const landed = k.shells.filter((s) => s.at <= t);
      if (landed.length) {
        k.shells = k.shells.filter((s) => s.at > t);
        for (const s of landed) {
          const hit = s.cell === k.pos && t >= k.stunUntil && k.hp > 0;
          if (hit) {
            k.hp--;
            k.stunUntil = t + cfg.stunMs;
            k.hits[s.pid] = (k.hits[s.pid] ?? 0) + 1;
          }
          this.io.fx?.('kaiju', { kind: hit ? 'hit' : 'boom', cell: s.cell, pid: s.pid });
        }
        dirty = true;
      }
      // рассылаем не чаще раза в 120 мс
      if (dirty && t - this.kaijuEmitAt >= 120) { this.kaijuEmitAt = t; this.emit(); }
      else if (dirty) this.pT(() => { if (this.s.kj === k) this.emit(); }, 130);
    }
    this.skipCbs.delete(stop);
    k.shells = [];
    k.endAt = Math.min(k.endAt, this.now);

    // ── итоги: деньги получают все ──
    const downed = k.hp <= 0;
    const aw = kaijuAwards(k, cfg);
    const awards: Record<string, string> = {};
    const stars: string[] = [];
    for (const [id, a] of Object.entries(aw)) {
      const p = this.s.players[id];
      if (!p) continue;
      const yen = rewardYen(a.yen, ratesOf(this.s));
      p.yen += yen;
      if (a.star) { p.stars += 1; stars.push(id); }
      awards[id] = `+¥${yen}` + (a.star ? ' +1★' : '');
    }
    this.bump('group:godzilla', k.zilla, downed ? 0 : 3);
    for (const id of stars) if (id !== k.zilla) this.bump('group:godzilla', id, 3);
    k.awards = awards;
    k.stars = stars;
    k.phase = 'results';
    this.emit();
    this.io.fx?.('kaiju', { kind: downed ? 'down' : 'win' });
    this.io.fx?.('prize', { game: 'godzilla' });
    this.log(downed ? `Годзилла повержен! Растоптано домов: ${k.stomped}` : `Годзилла (${this.s.players[k.zilla]?.name}) растоптал ${k.stomped} домов и ушёл в залив`);
    await this.sleep(epoch, this.hostPaced ? 36e5 : 12000);
    this.s.kj = null;
    this.emit();
  }

  private kaijuFire(k: KaijuPublic, pid: string, cell: number, t: number) {
    if (!(cell >= 0 && cell < k.cols * k.rows) || (k.ready[pid] ?? 0) > t + 150) return false;
    k.ready[pid] = t + k.cfg.reloadMs;
    k.shots[pid] = (k.shots[pid] ?? 0) + 1;
    k.shells.push({ n: ++this.kaijuN, pid, cell, at: t + k.cfg.fuseMs });
    this.io.fx?.('kaiju', { kind: 'fire', cell, pid });
    return true;
  }

  /** телефон: Годзилла — { id, dir }, охотник — { id, cell } */
  private onKaiju(pid: string, v: any) {
    const k = this.s.kj;
    const t = this.now;
    if (!k || k.id !== v?.id || k.phase !== 'play' || t < k.startAt || t >= k.endAt || k.hp <= 0) return;
    if (pid === k.zilla) {
      const d = Number(v.dir);
      if (Number.isInteger(d) && d >= 0 && d < 4 && stepCell(k, k.pos, d) >= 0) this.kaijuWant = d;
    } else if (k.hunters.includes(pid)) {
      if (this.kaijuFire(k, pid, Number(v.cell), t)) this.emit();
    }
  }

  private onDragon(m: Extract<InputMsg, { t: 'dragon' }>) {
    const d = this.s.dr;
    if (!d || d.id !== m.id || d.phase !== 'play' || !d.alive.includes(m.pid) || !Array.isArray(m.miss)) return;
    const set = (this.dragonMiss[m.pid] ??= new Set());
    const from = Math.max(d.warm, (this.dragonForgiven[m.pid] ?? -1) + 1);
    for (const n of m.miss.slice(0, 50)) if (Number.isInteger(n) && n >= from) set.add(n);
  }

  // ───────── вопросы ─────────

  /** freshOnly — только ещё не заданные (иначе, когда свежие кончились, вопросы идут по второму кругу) */
  /** вопрос ещё рано задавать: связанный с ним не прозвучал или его префектура не открыта */
  private tooEarly(q: Question): boolean {
    if (q.after && this.questions.some((x) => x.id === q.after) && !(this.sec.asked ?? []).includes(q.after)) return true;
    if (q.afterPref && !this.s.prefs[q.afterPref]?.rev) return true;
    return false;
  }

  /** игрок отстаёт: его состояние ниже медианы — по нему спецвопросы бьют вопросами средней сложности */
  private lagging(pid: string): boolean {
    const st = this.s.settings;
    const nw = this.alivePids().map((id) => netWorth(this.s.players[id], st));
    const p = this.s.players[pid];
    return !!p && nw.length > 1 && netWorth(p, st) < median(nw);
  }

  /** вопрос с пометкой «в числе первых N» ещё не задан, и задано меньше N вопросов */
  private earlyDue(q: Question): boolean {
    const asked = this.sec.asked ?? [];
    return !!q.early && !q.pref && asked.length < q.early && !asked.includes(q.id);
  }

  /** prefer — желаемая сложность: если такие вопросы среди подходящих есть, выбор только из них */
  private pickQuestion(f: (q: Question) => boolean, freshOnly = false, prefer?: Difficulty): Question | null {
    // вопросы спецтем считаются спецвопросами, даже если галочка не стоит
    const st = this.s.settings;
    const done = this.sec.qDone ?? [];
    const all = this.questions.filter((q) => q.answers?.length === 4 && !q.prize && q.kind !== 'flag' && !done.includes(q.id) && !this.tooEarly(q) && f(isSpecialQ(st, q) === !!q.special ? q : { ...q, special: isSpecialQ(st, q) }));
    if (!all.length) return null;
    // «в числе первых N»: пока окно не прошло, такой вопрос идёт раньше всех (меньшее N — первее)
    const due = all.filter((q) => this.earlyDue(q));
    if (due.length) {
      const min = Math.min(...due.map((q) => q.early!));
      const q = pick(due.filter((x) => x.early === min));
      if (!this.sec.used.includes(q.id)) this.sec.used.push(q.id);
      return q;
    }
    let fresh = all.filter((q) => !this.sec.used.includes(q.id));
    if (freshOnly && !fresh.length) return null;
    if (prefer) {
      const want = (fresh.length ? fresh : all).filter((q) => q.difficulty === prefer);
      if (want.length) { const q = pick(want); if (!this.sec.used.includes(q.id)) this.sec.used.push(q.id); return q; }
    }
    const q = pick(fresh.length ? fresh : all);
    if (!fresh.length) this.sec.used = this.sec.used.filter((id) => !all.some((x) => x.id === id));
    this.sec.used.push(q.id);
    return q;
  }

  private async ask(epoch: number, q: Question, context: QContext, title: string, participants: string[], timeSec: number, removed: Record<string, number[]> = {}, pref: number | null = null, extra: { prize?: number; cycle?: boolean } = {}): Promise<Record<string, number | null>> {
    const n = ++this.sec.qn;
    (this.sec.asked ??= []).push(q.id);
    this.curCorrect = q.correct;
    const reading = this.hostPaced;
    const pq: PublicQuestion = {
      qid: q.id, n, context, title, text: q.text, media: q.media, answers: q.answers, answerImages: !!q.answerImages,
      topic: q.topic, special: isSpecialQ(this.s.settings, q), startAt: 0, deadline: 0, participants, answered: [], removed, revealed: false,
      orders: answerOrders(Object.keys(this.s.players)),
      ...(reading ? { reading } : {}),
      ...(q.kind === 'flag' ? { flag: true } : {}),
      ...(pref ? { pref } : {}),
      ...(extra.prize ? { prize: extra.prize } : {}),
      ...(extra.cycle ? { cycle: true } : {}),
    };
    // кошка «отлично знает биологию»: хозяину лапа показывает ответ
    const catOwner = Object.values(this.s.players).find((x) => x.cat);
    if (catOwner && participants.includes(catOwner.id) && q.topic === catTopicOf(this.s.settings) && q.kind !== 'flag') pq.paw = { [catOwner.id]: q.correct };
    this.s.q = pq;
    this.choices = {};
    this.answerAt = {};
    this.setStage({ t: 'question' });
    this.io.fx?.('question', pq);
    // ведущий читает вопрос вслух; ответы и таймер — по «Далее»
    if (reading) {
      await this.sleep(epoch, this.s.settings.autoReading ? readingMs(q) : 36e5);
      delete pq.reading;
    }
    pq.startAt = this.now + LEAD;
    const deadline = pq.deadline = pq.startAt + timeSec * 1000;
    this.emit();
    await new Promise<void>((resolve) => {
      const done = () => { this.pClear(t); this.skipCbs.delete(done); this.qDone = null; resolve(); };
      const t = this.pT(done, deadline - this.now + ANSWER_GRACE);
      this.skipCbs.add(done);
      this.qDone = done;
    });
    this.check(epoch);
    const out: Record<string, number | null> = {};
    for (const id of participants) out[id] = this.choices[id] ?? null;
    return out;
  }

  private choices: Record<string, number> = {};
  private answerAt: Record<string, number> = {};

  /** вопрос ведёт ведущий кнопкой «Далее» (по умолчанию да) */
  private get hostPaced() {
    return this.s.settings.hostPaced !== false;
  }

  private onAnswer(m: Extract<InputMsg, { t: 'answer' }>) {
    const q = this.s.q;
    if (!q || q.revealed || q.reading || q.n !== m.n || !q.participants.includes(m.pid) || m.pid in this.choices) return;
    if (m.choice < 0 || m.choice > 3 || q.removed[m.pid]?.includes(m.choice)) return;
    const t = this.gameNow;
    // ответ засчитывается по времени нажатия (в часах хоста), с защитой от подделки
    const at = Math.min(m.at ?? t, t);
    if (at > q.deadline + 150 || t > q.deadline + ANSWER_GRACE) return;
    this.choices[m.pid] = m.choice;
    // ответившие — по времени нажатия: самый быстрый первым (на ТВ — слева)
    this.answerAt[m.pid] = at;
    q.answered.push(m.pid);
    q.answered.sort((a, b) => (this.answerAt[a] ?? 0) - (this.answerAt[b] ?? 0));
    this.io.fx?.('answered', { pid: m.pid });
    this.emit();
    this.closeIfAllAnswered();
  }

  /** все ответили — вопрос закрывается досрочно (на паузе — нет: закроется, когда паузу снимут) */
  private closeIfAllAnswered() {
    const q = this.s.q;
    if (!q || q.revealed || q.reading || this.s.paused) return;
    if (q.participants.every((id) => id in this.choices || !this.s.players[id])) this.qDone?.();
  }

  private async reveal(epoch: number, results: Record<string, string>, hideCorrect = false) {
    const q = this.s.q!;
    q.revealed = true;
    if (!hideCorrect) q.correct = this.curCorrect;
    q.choices = Object.fromEntries(q.participants.map((id) => [id, this.choices[id] ?? null]));
    for (const id of q.participants) if (this.choices[id] === this.curCorrect) this.bump('correct', id);
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

  private newPlayer(name: string, color: string, hat: number, look: Look, bot = false): Player {
    const st = this.s.settings;
    const stats: Record<TopicId, number> = {};
    const calib: Record<TopicId, number> = {};
    for (const t of st.topics.filter((x) => x.combat)) { stats[t.id] = st.baseStrength; calib[t.id] = 0; }
    return {
      id: uid(10), name, color, hat: Number.isInteger(hat) && hat >= 0 && hat < HATS.length ? hat : 0, look, pref: null, hp: st.startHp, maxHp: st.startHp, yen: 0, stars: 0, stats, calib,
      bonuses: { fifty1: 0, fifty2: 0, move2: 0, turn2: 0, coin: 0, ticket: 0, food: 0, cheat: 0, neko: 0, coupon: 0, scroll: 0, sashimi: 0 }, specials: 0, prizes: [], online: true, busy: null, bot,
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
    const p = this.newPlayer(name, m.color, m.hat, cleanLook(m.look));
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
      // удалили ходящего — следующий по очереди встаёт на его место, его ход не пропадает
      if (idx < this.s.turnIdx || (idx === this.s.turnIdx && this.s.phase === 'turns')) this.s.turnIdx--;
    }
    delete this.sec.ring[pid];
    this.log(`${name} удалён из игры`);
    // ход удалённого обрывается сразу (см. asTurn)
    if (this.turnPid === pid) this.skip();
    this.closeIfAllAnswered();
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
        if (!st.shop[item]) return reply(false, null, 'Нет такого товара');
        // купон: −50% по йенам на одну покупку
        const coupon = (p.bonuses.coupon ?? 0) > 0 && st.shop[item].yen > 0;
        const cost = shopCost(st, item, ratesOf(this.s), coupon);
        if (item === 'stat' && !(a.topic in p.stats)) return reply(false, null, 'Выбери тему');
        const sTopics = st.topics.filter((t) => t.special).map((t) => t.id);
        if (item === 'special' && sTopics.length && !sTopics.includes(a.topic)) return reply(false, null, 'Выбери тему спецвопроса');
        if (!pay(cost)) return reply(false, null, 'Не хватает денег');
        if (coupon) p.bonuses.coupon--;
        this.bump('shopSpent', p.id, cost.yen);
        if (item === 'special') { p.specials++; if (a.topic) (p.specialTopics ??= []).push(a.topic); }
        else if (item === 'hp') { p.maxHp += st.shop.hp.amount; p.hp += st.shop.hp.amount; }
        else if (item === 'stat') p.stats[a.topic]++;
        else p.bonuses[item as BonusId] = (p.bonuses[item as BonusId] ?? 0) + 1;
        this.log(`${p.name} купил: ${shopName(item, st, a.topic)}`);
        this.emit();
        return reply(true);
      }
      case 'buyCar': {
        const ss = this.s.stage;
        if (ss.t !== 'shop' || ss.pid !== p.id || !ss.entered || !ss.dealer) return reply(false, null, 'Машины — только в автосалоне');
        const err = this.buyCar(p, ss.dealer);
        return err ? reply(false, null, err) : reply(true);
      }
      case 'qBonus': {
        // «убрать 1/2 неверных» во время вопроса: один бонус на вопрос, пока игрок не ответил
        const q = this.s.q;
        const b = a.b as BonusId;
        if (!q || q.n !== a.n || q.revealed || q.reading || !q.participants.includes(p.id) || p.id in this.choices) return reply(false, null, 'Сейчас нельзя');
        if (b !== 'fifty1' && b !== 'fifty2' && b !== 'cheat') return reply(false, null, 'Нет такого бонуса');
        if (b === 'cheat' && (q.context !== 'pref' || q.prize)) return reply(false, null, 'Шпаргалка — только для вопросов префектур');
        if (q.removed[p.id]?.length) return reply(false, null, 'Бонус уже использован');
        if (!(p.bonuses[b] > 0)) return reply(false, null, 'Нет бонуса');
        if (this.gameNow > q.deadline) return reply(false, null, 'Время вышло');
        p.bonuses[b]--;
        const wrong = shuffle([0, 1, 2, 3].filter((i) => i !== this.curCorrect));
        q.removed = { ...q.removed, [p.id]: wrong.slice(0, b === 'cheat' ? 3 : b === 'fifty2' ? 2 : 1) };
        if (b === 'cheat') this.log(`${p.name} подглядывает в шпаргалку`);
        this.io.fx?.('bonusUsed', { pid: p.id, b });
        this.emit();
        return reply(true, { removed: q.removed[p.id] });
      }
      case 'coin': {
        // монетка в дуэли: бросить на текущий вопрос, пока не показан ответ; одна на вопрос
        const q = this.s.q;
        const b = a.b as 'coin';
        if (!q || q.n !== a.n || !(q.context === 'duel' || (q.context === 'sumo' && this.s.sumo?.asker === p.id)) || q.revealed || q.reading || !q.participants.includes(p.id)) return reply(false, null, 'Сейчас нельзя');
        if (b !== 'coin') return reply(false, null, 'Нет такой монеты');
        if (q.coins?.[p.id]) return reply(false, null, 'Монетка уже брошена');
        if (!((p.bonuses[b] ?? 0) > 0)) return reply(false, null, 'Нет монеты');
        if (this.gameNow > q.deadline) return reply(false, null, 'Время вышло');
        p.bonuses[b]--;
        q.coins = { ...(q.coins ?? {}), [p.id]: b };
        this.log(`${p.name} бросает монетку`);
        this.io.fx?.('bonusUsed', { pid: p.id, b });
        this.emit();
        return reply(true);
      }
      case 'reelSpin': {
        // барабан бонуса: игрок крутит у себя на телефоне
        if (!p.reel || p.reel.spin) return reply(false, null, 'Барабан уже крутится');
        this.spinBonusReel(p);
        return reply(true);
      }
      case 'reelClose': {
        if (p.reel?.done) delete p.reel;
        this.emit();
        return reply(true);
      }
      case 'wheelSpin': {
        // колесо призов: опустил жетон — колесо крутится (одно вращение за раз)
        const w = this.s.wheel;
        if (!w || this.s.stage.t !== 'wheel') return reply(false, null, 'Колесо ещё не запущено');
        if (w.spinner) return reply(false, null, 'Колесо крутится — подожди');
        if (!((w.tokens[p.id] ?? 0) > 0)) return reply(false, null, 'Жетонов больше нет');
        if (w.last) return reply(false, null, 'Ведущий вручает приз — подожди');
        if (w.order && w.turn !== p.id) return reply(false, null, 'Сейчас не твоя очередь');
        const segs = this.wheelSegs(w.left);
        if (!segs.length) return reply(false, null, 'Призы закончились');
        // колесо продолжает с того места, где остановилось
        const from = w.spin ? wheelFinalRot(w.segs.map((x) => x.w), w.spin) % (Math.PI * 2) : 0;
        w.tokens[p.id]--;
        w.segs = segs;
        w.spin = makeWheelSpin(segs.map((x) => x.w), this.now + 500, from);
        w.spinner = p.id;
        w.last = null;
        const tier = segs[w.spin.result].id;
        this.emit();
        this.io.fx?.('wheel', { pid: p.id });
        setT(() => this.wheelDone(w, p.id, tier), 500 + w.spin.dur);
        return reply(true);
      }
      case 'pachiBuy': {
        if (!soloAt(st, p.pref).includes('pachinko')) return reply(false, null, 'Здесь нет пачинко');
        if (p.closed?.code === p.pref) return reply(false, null, FARM_NO.pachinko);
        const packs = Math.max(1, Math.min(10, Math.floor(a.packs ?? 1)));
        const balls = packs * st.pachinko.pack;
        const cost = balls * st.pachinko.yenPerBall;
        if (p.yen < cost) return reply(false, null, 'Не хватает йен');
        p.yen -= cost;
        this.bump('pachiNet', p.id, -cost);
        this.gamble(p.id, cost);
        p.busy = 'pachinko';
        this.playedSolo(p);
        this.emit();
        return reply(true, { balls });
      }
      case 'pachiCash': {
        const balls = Math.max(0, Math.min(20000, Math.floor(a.balls ?? 0)));
        if (balls > 0 && !soloAt(st, p.pref).includes('pachinko')) return reply(false, null, 'Обменять шарики можно только у автомата пачинко');
        const yen = balls * st.pachinko.yenPerBall;
        p.yen += yen;
        this.bump('pachiNet', p.id, yen);
        if (a.exit) p.busy = null;
        if (yen > 0) this.log(`${p.name} обменял ${balls} шариков на ¥${yen}`);
        this.emit();
        return reply(true, { yen });
      }
      case 'busy': {
        const g = a.busy as keyof typeof SOLO_GAMES | null;
        if (g && !soloAt(st, p.pref).includes(g)) return reply(false, null, 'Здесь нет такой игры');
        if (g && p.closed?.code === p.pref && p.closed.game === g) return reply(false, null, FARM_NO[g as keyof typeof FARM_NO]);
        p.busy = g ?? null;
        // онсэн лечит: один раз за приход в префектуру
        if (g === 'onsen' && (this.sec.onsen ??= {})[p.id] !== p.pref) {
          this.sec.onsen[p.id] = p.pref!;
          const healed = p.maxHp - p.hp;
          p.hp = p.maxHp;
          if (healed > 0) this.bump('onsen', p.id);
          if (healed > 0) this.log(`♨️ ${p.name} отдохнул в онсэне: +${healed} HP`);
        }
        this.emit();
        return reply(true);
      }
      case 'ringStart': {
        if (!soloAt(st, p.pref).includes('ring')) return reply(false, null, 'Здесь нет призовой машины');
        if (p.closed?.code === p.pref) return reply(false, null, FARM_NO.ring);
        if (!pay({ yen: st.ring.cost, stars: 0 })) return reply(false, null, 'Не хватает йен');
        this.gamble(p.id, st.ring.cost);
        this.playedSolo(p);
        const seed = randInt(1e9);
        const t0 = this.now + 1200;
        this.sec.ring[p.id] = { seed, t0 };
        p.busy = 'ring';
        this.emit();
        this.io.fx?.('ring', { pid: p.id, seed, t0, cellMs: st.ring.cellMs });
        return reply(true, { seed, t0, cellMs: st.ring.cellMs });
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
        const { cell: from } = ringCellAt(r.t0, at, st.ring.cellMs);
        // огонёк ещё проходит 3–5 клеток, замедляясь: результат труднее угадать
        const cell = (from + RING_SLOW_MIN + randInt(RING_SLOW_MAX - RING_SLOW_MIN + 1)) % RING_CELLS;
        const res = ringResult(ringLayout(r.seed), cell);
        const info = RING_PRIZE_INFO[res];
        // приз зачисляется, когда огонёк остановится (иначе деньги в шапке выдадут результат раньше)
        this.ringSettle[p.id] = Date.now() + RING_SLOW_MS;
        setT(() => {
          p.yen += info.yen ?? 0;
          p.stars += info.stars ?? 0;
          if (res === 'fifty1' || res === 'fifty2' || res === 'move2' || res === 'turn2' || res === 'coin' || res === 'ticket' || res === 'scroll') p.bonuses[res] = (p.bonuses[res] ?? 0) + 1;
          if (res === 'special') p.specials++;
          if (res !== 'miss') this.bump('ringPrizes', p.id);
          if (res !== 'miss') this.log(`${p.name} выиграл в призовом кольце: ${info.name}`);
          if (res === 'special' || res === 'turn2' || res === 'yen1500' || res === 'star3') this.io.fx?.('prize', { pid: p.id });
          this.emit();
        }, RING_SLOW_MS);
        this.io.fx?.('ringStop', { pid: p.id, cell, from, res, at, t0: r.t0 });
        return reply(true, { cell, from, res, at });
      }
      case 'chohanRoll': {
        if (!(st.chohanPrefs ?? []).includes(p.pref!)) return reply(false, null, 'Здесь не играют в чо-хан');
        const bet = Math.floor(Number(a.bet));
        if (!(st.chohan?.bets ?? []).includes(bet)) return reply(false, null, 'Нет такой ставки');
        if (a.guess !== 'cho' && a.guess !== 'han') return reply(false, null, 'Чёт или нечет?');
        if (p.yen < bet) return reply(false, null, 'Не хватает йен');
        if (p.closed?.code === p.pref) return reply(false, null, FARM_NO.chohan);
        this.playedSolo(p);
        const d1 = 1 + randInt(6), d2 = 1 + randInt(6);
        const win = (a.guess === 'cho') === ((d1 + d2) % 2 === 0);
        p.yen += win ? bet : -bet;
        this.bump('chohanNet', p.id, win ? bet : -bet);
        this.gamble(p.id, bet);
        if (bet >= 500) this.log(`🎲 ${p.name} ${win ? 'выиграл' : 'проиграл'} в чо-хан ¥${bet}`);
        this.emit();
        this.io.fx?.('chohan', { pid: p.id, d1, d2, guess: a.guess, bet, win });
        return reply(true, { d1, d2, win });
      }
      case 'sudokuGet': {
        if (!(st.sudokuPrefs ?? []).includes(p.pref!)) return reply(false, null, 'Здесь нет судоку');
        return reply(true, this.sudokuFor(p.id));
      }
      case 'sudokuSolve': {
        if (!(st.sudokuPrefs ?? []).includes(p.pref!)) return reply(false, null, 'Здесь нет судоку');
        const cur = this.sudokuFor(p.id);
        if (cur.done) return reply(false, null, 'Все судоку уже решены');
        const grid = Array.isArray(a.grid) ? a.grid.map(Number) : [];
        if (p.closed?.code === p.pref) return reply(false, null, FARM_NO.sudoku);
        if (!isSolved(cur.puzzle!, grid, cur.size!)) return reply(false, null, 'Пока не решено');
        this.playedSolo(p);
        this.bump('sudoku', p.id);
        const pr = st.sudoku?.rewards?.[cur.level] ?? { yen: 0, stars: 0 };
        p.yen += pr.yen;
        p.stars += pr.stars;
        const text = [pr.yen ? `+¥${pr.yen}` : '', pr.stars ? `+${pr.stars}★` : ''].filter(Boolean).join(' ');
        this.log(`🔢 ${p.name} решил судоку ${cur.size}×${cur.size}${text ? ': ' + text : ''}`);
        const sd = this.sec.sudoku![p.id];
        sd.level++;
        sd.puzzle = [];
        this.emit();
        this.snapshot();
        this.io.fx?.('sudoku', { pid: p.id, size: cur.size, solved: true });
        return reply(true, { reward: text, next: this.sudokuFor(p.id) });
      }
    }
    reply(false, null, 'Неизвестная операция');
  }

  /** текущее судоку игрока; новая головоломка создаётся, когда прошлая решена */
  private sudokuFor(pid: string): { level: number; done: boolean; size?: number; puzzle?: number[] } {
    const all = (this.sec.sudoku ??= {});
    const sd = (all[pid] ??= { level: 0, puzzle: [] });
    const lv = SUDOKU_LEVELS[sd.level];
    if (!lv) return { level: sd.level, done: true };
    if (!sd.puzzle.length) {
      const givens = lv.size === 9 ? Math.max(24, Math.min(70, this.s.settings.sudoku?.givens9 ?? lv.givens)) : lv.givens;
      sd.puzzle = makeSudoku(lv.size, givens);
      this.snapshot();
    }
    return { level: sd.level, done: false, size: lv.size, puzzle: sd.puzzle };
  }

  // ───────── боты (для тестов без телефонов) ─────────

  addBot() {
    if (this.s.phase !== 'lobby' || this.s.joinOrder.length >= 10) return;
    const names = ['Тануки', 'Кицунэ', 'Нэко', 'Сакура', 'Кайдзю', 'Тэнгу', 'Каппа', 'Онигири', 'Дарума', 'Моти'];
    const used = new Set(Object.values(this.s.players).map((p) => p.name));
    const name = names.find((n) => !used.has('🤖' + n)) ?? 'Бот' + randInt(100);
    const colors = ['#ff4d6d', '#4dabff', '#ffd23f', '#5ce16b', '#c77dff', '#ff9f43', '#2ee6d6', '#ff7ad9', '#a3a3ff', '#f5f5f5'];
    const p = this.newPlayer('🤖' + name, colors[this.s.joinOrder.length % colors.length], randInt(HATS.length), randomLook(), true);
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
      const walk = [...st.options, ...st.options2];
      // свиток-вызов бот тратит иногда (или когда идти некуда)
      const value = st.challenge?.length && (!walk.length || Math.random() < 0.4) ? 'duel:' + pick(st.challenge) : pick(walk);
      this.botLater('move', 1500, () => this.handle({ t: 'pick', pid: st.pid, kind: 'move', value }));
    }

    for (const b of bots) if (b.reel && !b.reel.spin) this.botLater('breel' + b.id, 1500, () => this.handle({ t: 'req', pid: b.id, rid: 0, op: 'reelSpin' }));
    for (const b of bots) if (b.reel?.done) this.botLater('breelc' + b.id, 2500, () => this.handle({ t: 'req', pid: b.id, rid: 0, op: 'reelClose' }));
    const w = this.s.wheel;
    if (st.t === 'wheel' && w && !w.spinner && !w.last) {
      const b = bots.find((x) => x.id === w.turn && (w.tokens[x.id] ?? 0) > 0);
      if (b) this.botLater('wheel' + w.history.length, 2500, () => this.handle({ t: 'req', pid: b.id, rid: 0, op: 'wheelSpin' }));
    }
    if (st.t === 'extraTurn' && isBot(st.pid)) {
      this.botLater('extra', 1200, () => this.handle({ t: 'pick', pid: st.pid, kind: 'extra', value: Math.random() < 0.7 }));
    }
    if (st.t === 'duelBet' && this.s.duel) {
      const d = this.s.duel;
      for (const b of bots) if (b.id !== d.attacker && b.id !== d.defender && !st.done.includes(b.id)) {
        this.botLater('bet' + b.id, 1000 + randInt(3000), () => {
          if (Math.random() < 0.6 && b.yen >= 100) this.handle({ t: 'pick', pid: b.id, kind: 'bet', value: { on: pick([d.attacker, d.defender]), amt: b.yen >= 500 && Math.random() < 0.3 ? 500 : 100 } });
          this.handle({ t: 'pick', pid: b.id, kind: 'bet', value: 'done' });
        });
      }
    }
    if (st.t === 'duelPick' && isBot(st.pid)) {
      this.botLater('duel', 1500, () => {
        const opts: string[] = [...st.topics];
        const bp = this.s.players[st.pid];
        if (st.canSpecial) opts.push(bp.specialTopics?.length ? 'special:' + bp.specialTopics[0] : 'special');
        if (st.canRhythm) opts.push('rhythm');
        this.handle({ t: 'pick', pid: st.pid, kind: 'duel', value: pick(opts) });
      });
    }
    const q = this.s.q;
    if (st.t === 'question' && q && !q.revealed && !q.reading) {
      for (const id of q.participants) if (isBot(id)) {
        const n = q.n;
        const fifty = (['fifty1', 'fifty2'] as BonusId[]).find((b) => this.s.players[id].bonuses[b] > 0);
        if (fifty && Math.random() < 0.4) this.botLater('fifty' + id + n, Math.max(0, q.startAt - this.now) + 600, () => this.handle({ t: 'req', pid: id, rid: 0, op: 'qBonus', args: { n, b: fifty } }));
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
    const race = this.s.race;
    if (st.t === 'race' && race && !race.over) {
      for (const id of race.players) if (isBot(id) && race.times[id] == null && !this.botKeys.has('raceplan' + id + race.id)) {
        this.botKeys.add('raceplan' + id + race.id);
        const splits = botRun(makeTrack(race.seed, race.kind), 0.4 + Math.random() * 0.5, randInt(1e6));
        const t0 = Math.max(0, race.startAt - this.now);
        splits.forEach((ms, i) => this.botLater('race' + id + race.id + '_' + i, t0 + ms, () =>
          this.onRace(id, { id: race.id, ms, done: i === splits.length - 1 })));
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

/** сколько ведущему читать вопрос вслух, прежде чем сами покажутся ответы: по длине текста (~13 знаков/с) */
export function readingMs(q: Pick<Question, 'text' | 'media'>) {
  return Math.round(Math.max(3000, Math.min(20000, 1500 + q.text.length * 75)) + (q.media?.type === 'image' ? 1500 : 0));
}

export function shopName(item: string, st: Settings, topic?: string) {
  switch (item) {
    case 'special': return topic ? `Спецвопрос «${st.topics.find((t) => t.id === topic)?.name ?? topic}»` : 'Спецвопрос';
    case 'hp': return `+${st.shop.hp.amount} к макс. HP`;
    case 'stat': return `+1 к силе «${st.topics.find((t) => t.id === topic)?.name ?? topic}»`;
    default: return BONUS_INFO[item as BonusId]?.name ?? item;
  }
}

export { REWARD_INFO, RHYTHM_LEAD_BEATS };
