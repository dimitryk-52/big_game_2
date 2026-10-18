// Транспорт сообщений. Три реализации с одним интерфейсом:
//  - supabase: Realtime Broadcast (боевой режим)
//  - ws: dev-ретранслятор из vite (тест на телефонах в локальной сети без Supabase)
//  - local: BroadcastChannel (несколько вкладок одного браузера)
//
// Каналы:
//  game  — хост → все (состояние). Подписаны все телефоны.
//  input — телефоны → хост. Подписан ТОЛЬКО хост, телефоны шлют без подписки
//          (в Supabase через REST httpSend), чтобы сообщения игроков не размножались
//          на всех подписчиков и не съедали лимит.
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { getParam } from './util';

export type Chan = 'game' | 'input';
export type NetStatus = 'connecting' | 'online' | 'offline';
export type NetMode = 'supabase' | 'ws' | 'local';

export interface Transport {
  mode: NetMode;
  /** подписаться на канал (получать сообщения) */
  listen(ch: Chan, cb: (msg: any) => void): void;
  send(ch: Chan, msg: any): void;
  status: NetStatus;
  onStatus(cb: (s: NetStatus) => void): void;
}

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function netMode(): NetMode {
  const p = getParam('net');
  if (p === 'supabase' || p === 'ws' || p === 'local') return p;
  if (SB_URL && SB_KEY) return 'supabase';
  if (import.meta.env.DEV) return 'ws';
  return 'local';
}

let sbClient: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!SB_URL || !SB_KEY) return null;
  // worker: heartbeat из воркера, чтобы скрытая вкладка ТВ не теряла соединение
  sbClient ??= createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 40 }, worker: true } });
  return sbClient;
}

abstract class Base implements Transport {
  abstract mode: NetMode;
  status: NetStatus = 'connecting';
  private statusCbs: ((s: NetStatus) => void)[] = [];
  protected cbs: Record<Chan, ((m: any) => void)[]> = { game: [], input: [] };
  onStatus(cb: (s: NetStatus) => void) {
    this.statusCbs.push(cb);
  }
  protected setStatus(s: NetStatus) {
    if (s === this.status) return;
    this.status = s;
    this.statusCbs.forEach((c) => c(s));
  }
  protected deliver(ch: Chan, msg: any) {
    for (const cb of this.cbs[ch]) {
      try { cb(msg); } catch (e) { console.error(e); }
    }
  }
  abstract listen(ch: Chan, cb: (msg: any) => void): void;
  abstract send(ch: Chan, msg: any): void;
}

class LocalTransport extends Base {
  mode: NetMode = 'local';
  private chans: Partial<Record<Chan, BroadcastChannel>> = {};
  constructor(private room: string) {
    super();
    setTimeout(() => this.setStatus('online'));
  }
  private bc(ch: Chan) {
    return (this.chans[ch] ??= new BroadcastChannel(`bg:${this.room}:${ch}`));
  }
  listen(ch: Chan, cb: (m: any) => void) {
    if (!this.cbs[ch].length) this.bc(ch).onmessage = (e) => this.deliver(ch, e.data);
    this.cbs[ch].push(cb);
  }
  send(ch: Chan, msg: any) {
    this.bc(ch).postMessage(msg);
  }
}

class WsTransport extends Base {
  mode: NetMode = 'ws';
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private retry = 0;
  constructor(private room: string) {
    super();
    this.connect();
  }
  private connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/relay?room=${encodeURIComponent(this.room)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      for (const ch of Object.keys(this.cbs) as Chan[]) if (this.cbs[ch].length) ws.send(JSON.stringify({ sub: ch }));
      this.queue.splice(0).forEach((m) => ws.send(m));
      this.setStatus('online');
    };
    ws.onmessage = (e) => {
      const { ch, msg } = JSON.parse(e.data);
      this.deliver(ch, msg);
    };
    ws.onclose = () => {
      this.setStatus('offline');
      setTimeout(() => this.connect(), Math.min(5000, 300 * 2 ** this.retry++));
    };
  }
  listen(ch: Chan, cb: (m: any) => void) {
    if (!this.cbs[ch].length && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ sub: ch }));
    this.cbs[ch].push(cb);
  }
  send(ch: Chan, msg: any) {
    const s = JSON.stringify({ ch, msg });
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(s);
    else if (this.queue.length < 50) this.queue.push(s);
  }
}

class SupabaseTransport extends Base {
  mode: NetMode = 'supabase';
  private sub: Partial<Record<Chan, RealtimeChannel>> = {};
  private joined: Partial<Record<Chan, boolean>> = {};
  private rest: Partial<Record<Chan, RealtimeChannel>> = {};
  constructor(private room: string, private sb: SupabaseClient) {
    super();
    // если подписок нет (телефон шлёт только по REST) — считаем, что мы онлайн
    setTimeout(() => { if (!Object.keys(this.sub).length) this.setStatus('online'); }, 0);
  }
  private name(ch: Chan) {
    return `bg-${this.room}-${ch}`;
  }
  listen(ch: Chan, cb: (m: any) => void) {
    this.cbs[ch].push(cb);
    if (this.sub[ch]) return;
    const c = this.sb.channel(this.name(ch), { config: { broadcast: { self: false, ack: false } } });
    c.on('broadcast', { event: 'm' }, ({ payload }) => this.deliver(ch, payload));
    c.subscribe((status) => {
      this.joined[ch] = status === 'SUBSCRIBED';
      if (status === 'SUBSCRIBED') this.setStatus('online');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') this.setStatus('offline');
    });
    this.sub[ch] = c;
  }
  send(ch: Chan, msg: any) {
    const c = this.sub[ch];
    if (c && this.joined[ch]) {
      c.send({ type: 'broadcast', event: 'm', payload: msg });
      return;
    }
    // без подписки — через REST (не получаем чужие сообщения этого канала)
    const r = (this.rest[ch] ??= this.sb.channel(this.name(ch), { config: { broadcast: { self: false } } }));
    const anyR = r as any;
    const p: Promise<any> = typeof anyR.httpSend === 'function' ? anyR.httpSend('m', msg) : r.send({ type: 'broadcast', event: 'm', payload: msg });
    p.catch((e: any) => {
      console.warn('send failed', e);
      this.setStatus('offline');
      setTimeout(() => this.setStatus('online'), 1500);
    });
  }
}

export function createTransport(room: string): Transport {
  const mode = netMode();
  if (mode === 'supabase') {
    const sb = supabase();
    if (sb) return new SupabaseTransport(room, sb);
  }
  if (mode === 'ws') return new WsTransport(room);
  return new LocalTransport(room);
}
