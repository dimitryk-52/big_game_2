import { useEffect, useState } from 'preact/hooks';
import type { GameState, Player, RewardType, Topic } from '../shared/types';
import { REWARD_INFO } from '../shared/settings';
import { characterUrl, pixelIconUrl, topicIconUrl } from '../shared/sprites';
import { prefBgUrl, useSmoothBg } from '../shared/prefBg';
import { PREF } from '../map/mapData';

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

/** пиксельная иконка из sprites.ts (stars, money, bonus, special, prize, pachinko, ring) */
export function PixIcon({ id, size = 18 }: { id: string; size?: number }) {
  return <img class="pix-icon" src={pixelIconUrl(id)} height={size} alt="" draggable={false} />;
}

/** текст результата, где {skill:id} — иконка скилла (например «+1 {skill:music}») */
export function ResText({ text, topics, size = 18 }: { text: string; topics: Topic[]; size?: number }) {
  const parts = text.split(/\{skill:([\w-]+)\}/);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const t = topics.find((x) => x.id === part);
        return t ? <SkillIcon t={t} size={size} /> : part;
      })}
    </>
  );
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

/** интро префектуры при первом входе: фон (если нарисован) и название по-русски и по-японски */
/** bgLayer — фон рисует общий слой под интро (ТВ), здесь только заглушка, если фона нет */
export function PrefIntro({ code, who, reward, bgLayer }: { code: number; who?: Player; reward?: RewardType; bgLayer?: boolean }) {
  const bg = prefBgUrl(code);
  const smooth = useSmoothBg(bgLayer ? null : bg);
  const p = PREF[code];
  return (
    <div class={'pref-intro' + (bgLayer && bg ? ' over' : '')}>
      {bg ? !bgLayer && smooth.src && <img class={'pref-intro-bg zoom' + (smooth.smooth ? ' smooth' : '')} src={smooth.src} alt="" draggable={false} /> : <div class="pref-intro-bg empty" />}
      <div class="pref-intro-title">
        <div class="pref-intro-ja">{p?.ja}</div>
        <div class="pref-intro-ru">{p?.ru}</div>
        {reward && <div class="pref-intro-reward">Награда: <PixIcon id={reward} size={32} /> {REWARD_INFO[reward].name}</div>}
        {who && <div class="pref-intro-who"><Avatar p={who} size={36} /> {who.name}</div>}
      </div>
    </div>
  );
}
