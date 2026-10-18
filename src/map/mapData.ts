import raw from './japan.json';

export interface PrefInfo {
  code: number;
  ja: string;
  ru: string;
  en: string;
  region: string;
  size: number;
  anchor: [number, number];
  bb: [number, number, number, number];
  adj: number[];
}

export const MAP_W: number = raw.w;
export const MAP_H: number = raw.h;
const cellStr: string = raw.cells;
export const GRID = new Uint8Array(MAP_W * MAP_H);
for (let i = 0; i < GRID.length; i++) GRID[i] = cellStr.charCodeAt(i) - 48;

export const PREFS: PrefInfo[] = raw.prefs as any;
export const PREF: Record<number, PrefInfo> = Object.fromEntries(PREFS.map((p) => [p.code, p]));
export const PREF_CODES = PREFS.map((p) => p.code);

export function cellAt(x: number, y: number) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 0;
  return GRID[y * MAP_W + x];
}

export function neighbors(code: number) {
  return PREF[code]?.adj ?? [];
}

/** все префектуры ровно на расстоянии d (по графу соседства) */
export function atDistance(from: number, d: number): number[] {
  const dist = new Map<number, number>([[from, 0]]);
  let frontier = [from];
  for (let k = 1; k <= d; k++) {
    const next: number[] = [];
    for (const f of frontier) for (const n of neighbors(f)) if (!dist.has(n)) { dist.set(n, k); next.push(n); }
    frontier = next;
  }
  return [...dist.entries()].filter(([, v]) => v === d).map(([c]) => c);
}

/** кратчайший путь (BFS) — для анимации перемещения */
export function path(from: number, to: number): number[] {
  const prev = new Map<number, number>([[from, -1]]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    if (c === to) break;
    for (const n of neighbors(c)) if (!prev.has(n)) { prev.set(n, c); q.push(n); }
  }
  if (!prev.has(to)) return [from, to];
  const out = [to];
  let c = to;
  while (prev.get(c)! !== -1) { c = prev.get(c)!; out.unshift(c); }
  return out;
}

export function prefName(code: number | null | undefined) {
  return code ? PREF[code]?.ru ?? '?' : '—';
}
