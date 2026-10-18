/** Детерминированный ГПСЧ (mulberry32). Одинаковый результат на всех устройствах. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(n: number) {
  return Math.floor(Math.random() * n);
}
export function pick<T>(arr: T[]): T {
  return arr[randInt(arr.length)];
}
export function shuffle<T>(arr: T[], r: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function uid(len = 8) {
  const s = 'abcdefghijkmnpqrstuvwxyz23456789';
  let o = '';
  for (let i = 0; i < len; i++) o += s[randInt(s.length)];
  return o;
}
export function roomCode() {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let o = '';
  for (let i = 0; i < 4; i++) o += s[randInt(s.length)];
  return o;
}
/** Миллисекунды с высоким разрешением, сопоставимые между вкладками одного устройства. */
export function now() {
  return performance.timeOrigin + performance.now();
}
export function fmtYen(n: number) {
  return n.toLocaleString('ru-RU') + ' ¥';
}
export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
export function getParam(name: string) {
  return new URLSearchParams(location.search).get(name);
}
export function vibrate(p: number | number[]) {
  try { navigator.vibrate?.(p); } catch { /* iOS не поддерживает */ }
}
