// Судоку на телефоне: 4×4 → 6×6 → 9×9. Головоломку выдаёт хост и помнит уровень игрока:
// ушёл из префектуры — вернёшься и продолжишь с того же места (свои цифры хранятся на телефоне).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player } from '../shared/types';
import { SUDOKU_LEVELS, boxOf, conflicts } from '../games/sudoku';
import { vibrate } from '../shared/util';
import { sfx } from '../shared/sound';
import { PixIcon, ResText } from '../ui/common';

interface Cur { level: number; done: boolean; size?: number; puzzle?: number[] }

export function Sudoku({ client, s, me, paused, onExit }: { client: GameClient; s: GameState; me: Player; paused: boolean; onExit: () => void }) {
  const [cur, setCur] = useState<Cur | null>(null);
  const [err, setErr] = useState('');
  const [won, setWon] = useState('');
  const load = async () => {
    setErr('');
    try { setCur(await client.req<Cur>('sudokuGet')); } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { void load(); }, []);
  // ТВ показывает окно игры, пока игрок решает (на паузе — нет)
  useEffect(() => {
    if (paused) return;
    void client.req('busy', { busy: 'sudoku' }).catch(() => {});
    return () => { void client.req('busy', { busy: null }).catch(() => {}); };
  }, [paused]);
  const rewards = s.settings.sudoku?.rewards ?? [];
  const rw = (i: number) => [rewards[i]?.yen ? `¥${rewards[i].yen}` : '', rewards[i]?.stars ? `${rewards[i].stars}★` : ''].filter(Boolean).join(' + ');

  return (
    <div class="sudoku pad col">
      <div class="sudoku-levels">
        {SUDOKU_LEVELS.map((l, i) => (
          <div class={'sudoku-lv' + (cur && i < cur.level ? ' done' : '') + (cur && i === cur.level && !cur.done ? ' on' : '')}>
            <b>{l.size}×{l.size}</b><small><ResText text={cur && i < cur.level ? '✔ решено' : rw(i)} size={14} /></small>
          </div>
        ))}
      </div>
      {err && <div class="warn">{err}</div>}
      {won && <div class="status-card pop center">{won}</div>}
      {cur && !cur.done && cur.puzzle && (
        <Board key={cur.puzzle.join('')} client={client} me={me} size={cur.size!} puzzle={cur.puzzle} onSolved={async (grid) => {
          try {
            const r = await client.req<{ reward: string; next: Cur }>('sudokuSolve', { grid });
            sfx.jackpot();
            vibrate([80, 40, 80, 40, 200]);
            setWon(`Решено! ${r.reward}`);
            setTimeout(() => { setWon(''); setCur(r.next); }, 2500);
          } catch (e: any) { setErr(e.message); }
        }} />
      )}
      {cur?.done && <div class="status-card center">Все три судоку решены! <PixIcon id="prize" /></div>}
      <button class="btn small ghost" onClick={onExit}>Назад</button>
    </div>
  );
}

function Board({ client, me, size, puzzle, onSolved }: { client: GameClient; me: Player; size: number; puzzle: number[]; onSolved: (g: number[]) => void }) {
  const key = `bg_sudoku_${client.room}_${me.id}_${puzzle.join('')}`;
  const [grid, setGridState] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (Array.isArray(saved) && saved.length === puzzle.length) return saved.map((v: number, i: number) => puzzle[i] || v);
    } catch { /* нет сохранения */ }
    return [...puzzle];
  });
  const [sel, setSel] = useState<number | null>(null);
  const sent = useRef(false);
  const bad = useMemo(() => conflicts(grid, size), [grid]);
  const [bh, bw] = boxOf(size);
  const filled = grid.filter(Boolean).length;

  const setGrid = (g: number[]) => {
    setGridState(g);
    try { localStorage.setItem(key, JSON.stringify(g)); } catch { /* приватный режим */ }
  };
  // ТВ показывает, как продвигается игрок
  useEffect(() => {
    const t = setTimeout(() => client.pnp({ k: 'sudoku', size, filled, total: size * size }), 300);
    return () => clearTimeout(t);
  }, [filled]);
  useEffect(() => {
    if (filled === grid.length && !bad.size && !sent.current) {
      sent.current = true;
      onSolved(grid);
    }
    if (filled < grid.length || bad.size) sent.current = false;
  }, [grid]);

  const put = (v: number) => {
    if (sel == null || puzzle[sel]) return;
    const g = [...grid];
    g[sel] = v;
    setGrid(g);
    vibrate(15);
  };
  const peers = (i: number, j: number) => {
    const r = Math.floor(i / size), c = i % size, r2 = Math.floor(j / size), c2 = j % size;
    return r === r2 || c === c2 || (Math.floor(r / bh) === Math.floor(r2 / bh) && Math.floor(c / bw) === Math.floor(c2 / bw));
  };

  return (
    <>
      <div class={'sudoku-grid s' + size} style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {grid.map((v, i) => {
          const r = Math.floor(i / size), c = i % size;
          let cls = 'sd-cell';
          if (puzzle[i]) cls += ' given';
          if (sel === i) cls += ' sel';
          else if (sel != null && peers(sel, i)) cls += ' peer';
          if (sel != null && v && grid[sel] === v) cls += ' same';
          if (bad.has(i) && !puzzle[i]) cls += ' bad';
          if (c % bw === bw - 1 && c < size - 1) cls += ' br';
          if (r % bh === bh - 1 && r < size - 1) cls += ' bb';
          return <button class={cls} onClick={() => setSel(i)}>{v || ''}</button>;
        })}
      </div>
      <div class={'sudoku-pad n' + size}>
        {Array.from({ length: size }, (_, i) => i + 1).map((n) => (
          <button class="btn" disabled={sel == null || !!puzzle[sel]} onClick={() => put(n)}>{n}</button>
        ))}
        <button class="btn" disabled={sel == null || !!puzzle[sel] || !grid[sel]} onClick={() => put(0)}><PixIcon id="ui_backspace" size={20} /></button>
      </div>
      <div class="muted small-text center">Заполнено {filled} из {grid.length}. Ушёл — решение сохранится до следующего раза.</div>
    </>
  );
}
