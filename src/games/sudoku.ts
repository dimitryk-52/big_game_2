// Судоку: генерация с единственным решением и проверка. Уровни: 4×4 → 6×6 → 9×9.
// Сетка — массив size*size, 0 — пустая клетка.

export const SUDOKU_LEVELS = [
  { size: 4, givens: 7 },
  { size: 6, givens: 17 },
  { size: 9, givens: 40 },
] as const;

/** размер блока: 4 → 2×2, 6 → 2 строки × 3 столбца, 9 → 3×3 */
export function boxOf(size: number): [number, number] {
  return size === 6 ? [2, 3] : size === 4 ? [2, 2] : [3, 3];
}

function shuffled(n: number, rnd: () => number) {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function canPlace(g: number[], size: number, i: number, v: number) {
  const [bh, bw] = boxOf(size);
  const r = Math.floor(i / size), c = i % size;
  for (let k = 0; k < size; k++) if (g[r * size + k] === v || g[k * size + c] === v) return false;
  const r0 = r - (r % bh), c0 = c - (c % bw);
  for (let y = r0; y < r0 + bh; y++) for (let x = c0; x < c0 + bw; x++) if (g[y * size + x] === v) return false;
  return true;
}

/** решений у сетки (считаем до limit) */
function countSolutions(g: number[], size: number, limit: number): number {
  const i = g.indexOf(0);
  if (i < 0) return 1;
  let n = 0;
  for (let v = 1; v <= size && n < limit; v++) {
    if (!canPlace(g, size, i, v)) continue;
    g[i] = v;
    n += countSolutions(g, size, limit - n);
    g[i] = 0;
  }
  return n;
}

function fill(g: number[], size: number, rnd: () => number): boolean {
  const i = g.indexOf(0);
  if (i < 0) return true;
  for (const v of shuffled(size, rnd)) {
    if (!canPlace(g, size, i, v)) continue;
    g[i] = v;
    if (fill(g, size, rnd)) return true;
  }
  g[i] = 0;
  return false;
}

/** головоломка с единственным решением и примерно givens открытыми цифрами */
export function makeSudoku(size: number, givens: number, rnd: () => number = Math.random): number[] {
  const full = new Array(size * size).fill(0);
  fill(full, size, rnd);
  const g = [...full];
  let open = size * size;
  const order = shuffled(size * size, rnd).map((x) => x - 1);
  for (const i of order) {
    if (open <= givens) break;
    const v = g[i];
    g[i] = 0;
    if (countSolutions([...g], size, 2) !== 1) g[i] = v;
    else open--;
  }
  return g;
}

/** клетки, конфликтующие с другими (одинаковая цифра в строке, столбце или блоке) */
export function conflicts(g: number[], size: number): Set<number> {
  const [bh, bw] = boxOf(size);
  const bad = new Set<number>();
  for (let i = 0; i < g.length; i++) {
    if (!g[i]) continue;
    const r = Math.floor(i / size), c = i % size;
    for (let j = i + 1; j < g.length; j++) {
      if (g[j] !== g[i]) continue;
      const r2 = Math.floor(j / size), c2 = j % size;
      const sameBox = Math.floor(r / bh) === Math.floor(r2 / bh) && Math.floor(c / bw) === Math.floor(c2 / bw);
      if (r === r2 || c === c2 || sameBox) { bad.add(i); bad.add(j); }
    }
  }
  return bad;
}

/** сетка решена: всё заполнено, нет конфликтов и открытые цифры не тронуты */
export function isSolved(puzzle: number[], g: number[], size: number) {
  if (g.length !== size * size) return false;
  if (g.some((v, i) => !(v >= 1 && v <= size) || (puzzle[i] && puzzle[i] !== v))) return false;
  return conflicts(g, size).size === 0;
}
