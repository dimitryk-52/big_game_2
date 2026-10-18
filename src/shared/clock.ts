// Синхронизация часов телефона с часами хоста (ТВ) по принципу NTP.
// Эталон времени — хост. hostNow() = локальное время + offset.
import { now } from './util';

export class ClockSync {
  offset = 0;
  rtt = Infinity;
  synced = false;
  private n = 0;
  private samples: { off: number; rtt: number }[] = [];
  private sent = new Map<number, number>();

  constructor(private sendPing: (n: number, t0: number) => void) {}

  hostNow() {
    return now() + this.offset;
  }

  /** серия пингов: при подключении и периодически */
  burst(count = 6, gap = 250) {
    for (let i = 0; i < count; i++) setTimeout(() => this.ping(), i * gap);
  }

  ping() {
    const n = ++this.n;
    const t0 = now();
    this.sent.set(n, t0);
    this.sendPing(n, t0);
  }

  onPong(n: number, t0: number, th: number) {
    if (!this.sent.has(n)) return;
    this.sent.delete(n);
    const t1 = now();
    const rtt = t1 - t0;
    const off = th - (t0 + t1) / 2;
    this.samples.push({ off, rtt });
    if (this.samples.length > 12) this.samples.shift();
    // берём замеры с наименьшим RTT — они точнее всего
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 3);
    this.offset = best.reduce((s, x) => s + x.off, 0) / best.length;
    this.rtt = best[0].rtt;
    this.synced = true;
  }
}
