import { useEffect, useState } from 'preact/hooks';
import type { GameState, Player, Topic } from '../shared/types';
import { characterUrl, topicIconUrl } from '../shared/sprites';

/** перерисовка каждый кадр (для таймеров) */
export function useFrame(active = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = () => { set((x) => (x + 1) % 1e6); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

export function TimerBar({ start, end, now, big }: { start: number; end: number; now: () => number; big?: boolean }) {
  useFrame(true);
  const t = now();
  const total = Math.max(1, end - start);
  const left = Math.max(0, Math.min(total, end - t));
  const frac = left / total;
  const secs = Math.ceil(left / 1000);
  const waiting = t < start;
  return (
    <div class={'timer' + (big ? ' big' : '') + (frac < 0.3 ? ' low' : '')}>
      <div class="timer-fill" style={{ width: `${(waiting ? 1 : frac) * 100}%` }} />
      <span class="timer-num">{waiting ? '…' : secs}</span>
    </div>
  );
}

export function Avatar({ p, size = 48, dim }: { p: Pick<Player, 'color' | 'hat'>; size?: number; dim?: boolean }) {
  return (
    <img
      class="avatar"
      src={characterUrl(p.color, p.hat, 4)}
      style={{ width: size * 0.75, height: size, opacity: dim ? 0.4 : 1 }}
      alt=""
      draggable={false}
    />
  );
}

export function HpBar({ hp, max }: { hp: number; max: number }) {
  const f = Math.max(0, Math.min(1, hp / Math.max(1, max)));
  return (
    <div class={'hpbar' + (f <= 0.3 ? ' low' : '')}>
      <div class="hp-fill" style={{ width: `${f * 100}%` }} />
      <span>{hp}/{max}</span>
    </div>
  );
}

export const LETTERS = ['A', 'B', 'C', 'D'];

// ───── скиллы: иконка + цифра + полоска ─────

/** масштаб полосок: не меньше 5, иначе по самому сильному игроку */
export function skillMax(s: Pick<GameState, 'players'>) {
  let m = 5;
  for (const p of Object.values(s.players ?? {})) for (const v of Object.values(p.stats ?? {})) m = Math.max(m, v);
  return m;
}

export function SkillIcon({ t, size = 18 }: { t: Pick<Topic, 'id' | 'color' | 'name'>; size?: number }) {
  return <img class="skill-icon" src={topicIconUrl(t.id, t.color)} width={size} height={size} alt={t.name} title={t.name} draggable={false} />;
}

/** сегментированная пиксельная полоска */
export function SkillBar({ value, max, color }: { value: number; max: number; color: string }) {
  const segs = Math.max(1, Math.min(12, max));
  const filled = Math.round((Math.min(value, max) / max) * segs);
  return (
    <span class="skill-bar">
      {Array.from({ length: segs }, (_, i) => <i style={i < filled ? { background: color } : undefined} />)}
    </span>
  );
}

export function SkillRow({ t, value, max, size = 18 }: { t: Topic; value: number; max: number; size?: number }) {
  return (
    <div class="skill-row">
      <SkillIcon t={t} size={size} />
      <b class="skill-num">{value}</b>
      <SkillBar value={value} max={max} color={t.color} />
    </div>
  );
}

/** компактно: иконка и цифра в строку */
export function SkillChips({ topics, stats, size = 16 }: { topics: Topic[]; stats: Record<string, number>; size?: number }) {
  return (
    <span class="skill-chips">
      {topics.map((t) => <span class="skill-chip"><SkillIcon t={t} size={size} /><b>{stats[t.id] ?? 0}</b></span>)}
    </span>
  );
}
