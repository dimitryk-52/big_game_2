// Клиент игрока: принимает состояние от хоста, синхронизирует часы, шлёт действия.
import type { GameMsg, GameState, InputMsg } from './types';
import { createTransport, type NetStatus, type Transport } from './net';
import { ClockSync } from './clock';
import { uid } from './util';

export class GameClient {
  s: GameState | null = null;
  pid: string | null;
  pin: string | null;
  readonly cid = uid(10);
  readonly clock: ClockSync;
  readonly net: Transport;
  status: NetStatus = 'connecting';
  joinError: string | null = null;
  private subs = new Set<() => void>();
  private pending = new Map<number, { res: (v: any) => void; rej: (e: any) => void; t: any }>();
  private rid = 0;
  private lastHello = 0;
  private lastMsgAt = 0;

  constructor(readonly room: string) {
    this.pid = localStorage.getItem(this.key('pid'));
    this.pin = localStorage.getItem(this.key('pin'));
    this.net = createTransport(room);
    this.clock = new ClockSync((n, t0) => this.send({ t: 'ping', cid: this.cid, n, t0, pid: this.pid ?? undefined } as any));
  }

  private key(k: string) {
    return `bg_${k}_${this.room}`;
  }

  start() {
    this.net.listen('game', (m: GameMsg) => this.onMsg(m));
    this.net.onStatus((s) => {
      this.status = s;
      if (s === 'online') this.hello(true);
      this.notify();
    });
    this.status = this.net.status;
    setTimeout(() => this.hello(true), 300);
    setInterval(() => {
      this.clock.ping();
      // давно ничего не приходило — возможно, пропустили; просим полное состояние
      if (Date.now() - this.lastMsgAt > 30000) this.hello(true);
    }, 15000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.hello(true);
    });
  }

  hello(withClock = false) {
    const t = Date.now();
    if (t - this.lastHello < 1000) return;
    this.lastHello = t;
    this.send({ t: 'hello', cid: this.cid, pid: this.pid ?? undefined });
    if (withClock) this.clock.burst();
  }

  subscribe(cb: () => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  notify() {
    this.subs.forEach((c) => c());
  }

  send(m: InputMsg) {
    this.net.send('input', m);
  }

  private onMsg(m: GameMsg) {
    this.lastMsgAt = Date.now();
    switch (m.t) {
      case 'st': {
        if (!this.s && !m.full) { this.hello(); return; }
        if (this.s && !m.full && m.v !== this.s.v + 1) this.hello();
        if (this.s && !m.full && m.v <= this.s.v) return;
        this.s = { ...(this.s ?? ({} as GameState)), ...m.parts, v: m.v };
        if (this.pid && this.s.players && !this.s.players[this.pid] && this.s.phase !== 'lobby' && m.full) {
          // игрока удалили
        }
        this.notify();
        break;
      }
      case 'pong':
        if (m.cid === this.cid) this.clock.onPong(m.n, m.t0, m.th);
        break;
      case 'joined':
        if (m.cid !== this.cid) return;
        this.pid = m.pid;
        this.pin = m.pin;
        this.joinError = null;
        localStorage.setItem(this.key('pid'), m.pid);
        localStorage.setItem(this.key('pin'), m.pin);
        this.hello(true);
        this.notify();
        break;
      case 'joinErr':
        if (m.cid !== this.cid) return;
        this.joinError = m.err;
        this.notify();
        break;
      case 'res': {
        if (m.pid !== this.pid) return;
        const p = this.pending.get(m.rid);
        if (!p) return;
        clearTimeout(p.t);
        this.pending.delete(m.rid);
        if (m.ok) p.res(m.data);
        else p.rej(new Error(m.err ?? 'Ошибка'));
        break;
      }
    }
  }

  get me() {
    return this.pid && this.s ? this.s.players?.[this.pid] ?? null : null;
  }

  hostNow() {
    return this.clock.hostNow();
  }

  join(name: string, color: string, hat: number) {
    this.joinError = null;
    this.send({ t: 'join', cid: this.cid, name, color, hat });
  }
  restore(name: string, pin: string) {
    this.joinError = null;
    this.send({ t: 'restore', cid: this.cid, name, pin });
  }
  logout() {
    localStorage.removeItem(this.key('pid'));
    localStorage.removeItem(this.key('pin'));
    this.pid = null;
    this.pin = null;
    this.notify();
  }
  answer(n: number, choice: number) {
    if (!this.pid) return;
    this.send({ t: 'answer', pid: this.pid, n, choice, at: this.hostNow() });
  }
  pick(kind: 'landing' | 'move' | 'bonus' | 'duel', value: any) {
    if (!this.pid) return;
    this.send({ t: 'pick', pid: this.pid, kind, value });
  }
  pnp(ev: any) {
    if (!this.pid) return;
    this.send({ t: 'pnp', pid: this.pid, ev });
  }
  req<T = any>(op: string, args?: any): Promise<T> {
    if (!this.pid) return Promise.reject(new Error('Нет игрока'));
    const rid = ++this.rid;
    return new Promise<T>((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(rid); rej(new Error('Хост не ответил')); }, 8000);
      this.pending.set(rid, { res, rej, t });
      this.send({ t: 'req', pid: this.pid!, rid, op, args });
    });
  }
}
