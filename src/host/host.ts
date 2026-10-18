// Хост во вкладке ТВ: связывает движок с транспортом, хранилищем и экраном.
import { GameEngine } from './engine';
import { createTransport, type Transport } from '../shared/net';
import { getStore } from '../shared/store';
import type { GameState, InputMsg } from '../shared/types';
import { now } from '../shared/util';

export type FxHandler = (kind: string, data?: any) => void;

export class Host {
  engine!: GameEngine;
  net: Transport;
  private fxSubs = new Set<FxHandler>();
  private saveTimer: any = null;
  private pendingSave: any = null;

  constructor(readonly room: string) {
    this.net = createTransport(room);
  }

  onFx(cb: FxHandler) {
    this.fxSubs.add(cb);
    return () => this.fxSubs.delete(cb);
  }

  async start(opts: { resume: boolean }) {
    const store = getStore();
    const [settings, questions, snap] = await Promise.all([
      store.loadSettings(),
      store.loadQuestions(),
      opts.resume ? store.loadSnapshot(this.room) : Promise.resolve(null),
    ]);
    this.engine = new GameEngine(
      {
        now,
        broadcast: (m) => this.net.send('game', m),
        save: (d) => this.save(d),
        fx: (k, d) => this.fxSubs.forEach((c) => c(k, d)),
      },
      this.room,
      settings,
      questions,
      snap && snap.s && snap.s.phase !== 'end' ? snap : null,
    );
    this.net.listen('input', (m: InputMsg) => {
      if (m.t === 'ctl' && m.cmd === 'reload') return void this.reload();
      this.engine.handle(m);
    });
    this.net.onStatus((s) => { if (s === 'online') this.engine.sendFull(); });
    this.engine.start();
    // присутствие: нет сообщений 45 c — «не на связи» (телефоны пингуют каждые 15 c)
    setInterval(() => {
      const t = Date.now();
      for (const p of Object.values(this.engine.s.players)) {
        const seen = this.engine.lastSeen[p.id] ?? 0;
        if (p.online && !p.bot && t - seen > 45000) this.engine.setOffline(p.id);
      }
    }, 5000);
  }

  /** снапшот пишем не чаще раза в 1.5 c, чтобы не долбить базу */
  private save(d: any) {
    this.pendingSave = d;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      const data = JSON.parse(JSON.stringify(this.pendingSave));
      try { await getStore().saveSnapshot(this.room, data); } catch (e) { console.warn('snapshot save failed', e); }
    }, 1500);
  }

  /** перечитать вопросы и настройки из базы (кнопка на пульте) */
  async reload() {
    const store = getStore();
    const [settings, questions] = await Promise.all([store.loadSettings(), store.loadQuestions()]);
    this.engine.onCtl('settings', settings);
    this.engine.onCtl('questions', questions);
  }

  get state(): GameState {
    return this.engine.s;
  }

  ctl(cmd: string, args?: any) {
    this.engine.onCtl(cmd, args);
  }
}
