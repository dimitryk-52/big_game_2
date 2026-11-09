// Пиксельный значок «VS»: буквы с тёмным контуром и бликом сверху.
// Рисуется SVG-прямоугольниками — чёткий при любом размере; выравнивается по центру строки.

// V и S по 5×7, между ними 1 пиксель
const V = ['X...X', 'X...X', 'X...X', '.X.X.', '.X.X.', '.X.X.', '..X..'];
const S = ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'];
const W = 11 + 2, H = 7 + 2;

/** пиксели: 'f' — буква, 'o' — контур */
const GRID: string[][] = (() => {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (rows: string[], dx: number) => rows.forEach((r, y) => r.split('').forEach((c, x) => { if (c === 'X') g[y + 1][x + dx + 1] = 'f'; }));
  put(V, 0);
  put(S, 6);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] !== '.') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g[y + dy]?.[x + dx] === 'f') g[y][x] = 'o';
  }
  return g;
})();

/** цвет буквы по строке: светлый верх → насыщенный низ */
const ROW = ['#fff3b0', '#ffe066', '#ffd23f', '#ffb52e', '#ff9330', '#ff7a2f', '#f05a28'];

export function VsBadge({ size = 22 }: { size?: number }) {
  const px = size / H;
  const rects: any[] = [];
  GRID.forEach((row, y) => row.forEach((c, x) => {
    if (c === '.') return;
    rects.push(<rect x={x} y={y} width={1.02} height={1.02} fill={c === 'o' ? '#1b1630' : ROW[Math.max(0, Math.min(6, y - 1))]} />);
  }));
  return (
    <svg class="vs-badge" width={Math.round(W * px)} height={size} viewBox={`0 0 ${W} ${H}`} shape-rendering="crispEdges" aria-label="против" role="img">
      {rects}
    </svg>
  );
}
