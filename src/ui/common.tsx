import { useEffect, useState } from 'preact/hooks';
import type { BonusId, GameState, Player, RewardType, Topic } from '../shared/types';
import { BONUS_INFO, REWARD_INFO } from '../shared/settings';
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

/** devicePixelRatio, который обновляется при смене масштаба Windows / зума браузера */
export function useDpr() {
  const [dpr, setDpr] = useState(window.devicePixelRatio || 1);
  useEffect(() => {
    const mq = matchMedia(`(resolution: ${dpr}dppx)`);
    const on = () => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [dpr]);
  return dpr;
}

/**
 * Пиксель-арт без «рваных» линий: картинка растягивается в целое число РЕАЛЬНЫХ пикселей экрана.
 * При масштабе Windows 125% или зуме браузера обычные 183 CSS-пикселя — это 228.75 точек,
 * и часть пикселей рисунка становится шире соседних. scale — желаемый размер в CSS-пикселях
 * на пиксель рисунка; берётся ближайший целый множитель в точках экрана.
 */
export function PixelImg({ src, scale = 1, class: cls, alt = '' }: { src: string; scale?: number; class?: string; alt?: string }) {
  const dpr = useDpr();
  const [nat, setNat] = useState<[number, number] | null>(null);
  const k = Math.max(1, Math.round(scale * dpr));
  const style = nat ? { width: (nat[0] * k) / dpr, height: (nat[1] * k) / dpr } : { visibility: 'hidden' };
  return (
    <img class={'pixel-img' + (cls ? ' ' + cls : '')} src={src} alt={alt} draggable={false} style={style as any}
      onLoad={(e) => { const i = e.currentTarget as HTMLImageElement; setNat([i.naturalWidth, i.naturalHeight]); }} />
  );
}

// ───── скиллы: иконка + цифра + полоска ─────

export function SkillIcon({ t, size = 18 }: { t: Pick<Topic, 'id' | 'color' | 'name' | 'icon' | 'special'>; size?: number }) {
  return <img class="skill-icon" src={topicIconUrl(t.id, t.color, 3, { icon: t.icon, special: t.special })} width={size} height={size} alt={t.name} title={t.name} draggable={false} />;
}

/** пиксельная иконка из sprites.ts (stars, money, bonus, special, prize, pachinko, ring) */
export function PixIcon({ id, size = 18 }: { id: string; size?: number }) {
  return <img class="pix-icon" src={pixelIconUrl(id)} height={size} alt="" draggable={false} />;
}

export const BONUS_IDS: BonusId[] = ['fifty1', 'fifty2', 'move2', 'turn2'];

/** иконка бонуса (src/img/icons/bonus_<id>.png) */
export function BonusIcon({ b, size = 18 }: { b: BonusId; size?: number }) {
  return <img class="pix-icon" src={pixelIconUrl('bonus_' + b)} height={size} alt={BONUS_INFO[b].name} title={BONUS_INFO[b].name} draggable={false} />;
}

/** инвентарь: иконки со счётчиком, без подписей (название — во всплывающей подсказке) */
export function Inventory({ p, size = 32, all }: { p: Pick<Player, 'bonuses' | 'specials'>; size?: number; all?: boolean }) {
  const items: { key: string; icon: any; n: number; title: string }[] = [
    ...BONUS_IDS.map((b) => ({ key: b, icon: <BonusIcon b={b} size={size} />, n: p.bonuses[b] ?? 0, title: BONUS_INFO[b].name })),
    { key: 'special', icon: <PixIcon id="special" size={size} />, n: p.specials, title: 'Спецвопрос' },
  ];
  return (
    <div class="inv">
      {items.filter((x) => all || x.n > 0).map((x) => (
        <span class={'inv-slot' + (x.n ? '' : ' empty')} title={x.title}>
          {x.icon}
          <b class="inv-n">{x.n}</b>
        </span>
      ))}
    </div>
  );
}

/** символы в текстах (награды, итоги), которые рисуются пиксельными иконками, а не шрифтом */
const CHAR_ICONS: Record<string, string> = { '★': 'stars', '⭐': 'stars', '❤': 'ui_heart', '✔': 'ui_check', '✘': 'ui_cross', '✗': 'ui_cross', '→': 'ui_right', '➜': 'ui_right', '🏆': 'prize' };
const CHAR_RE = new RegExp(`\\{(skill|ico):([\\w-]+)\\}|(${Object.keys(CHAR_ICONS).join('|')})\\uFE0F?`, 'u');

/** текст с иконками: {skill:id} — иконка скилла (например «+1 {skill:music}»), {ico:id} — любая PixIcon, ★ ❤ ✔ → … — пиксельные значки */
export function ResText({ text, topics = [], size = 18 }: { text: string; topics?: Topic[]; size?: number }) {
  const out: any[] = [];
  let rest = text;
  for (let m = CHAR_RE.exec(rest); m; m = CHAR_RE.exec(rest)) {
    if (m.index) out.push(rest.slice(0, m.index));
    const t = m[1] === 'skill' && topics.find((x) => x.id === m[2]);
    out.push(t ? <SkillIcon t={t} size={size} /> : m[1] === 'ico' ? <PixIcon id={m[2]} size={size} /> : m[1] ? m[0] : <PixIcon id={CHAR_ICONS[m[3]]} size={size} />);
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push(rest);
  return <>{out}</>;
}

/** иконка и цифра; grid — сеткой в несколько строк (тем может быть 10+) */
export function SkillChips({ topics, stats, size = 16, grid }: { topics: Topic[]; stats: Record<string, number>; size?: number; grid?: boolean }) {
  return (
    <span class={'skill-chips' + (grid ? ' grid' : '')} style={grid ? { '--ic': size + 'px' } as any : undefined}>
      {topics.map((t) => <span class="skill-chip"><SkillIcon t={t} size={size} /><b>{stats[t.id] ?? 0}</b></span>)}
    </span>
  );
}

/** интро префектуры при первом входе: фон (если нарисован) и название по-русски и по-японски */
/** bgLayer — фон рисует общий слой под интро (ТВ), здесь только заглушка, если фона нет */
/** still — без анимаций (телефон): тот же фон и та же плашка с названием, что на ТВ */
export function PrefIntro({ code, who, reward, bgLayer, still }: { code: number; who?: Player; reward?: RewardType; bgLayer?: boolean; still?: boolean }) {
  const bg = prefBgUrl(code);
  const smooth = useSmoothBg(bgLayer || still ? null : bg);
  const p = PREF[code];
  return (
    <div class={'pref-intro' + (bgLayer && bg ? ' over' : '') + (still ? ' still' : '')}>
      {bg ? (still ? <img class="pref-intro-bg" src={bg} alt="" draggable={false} /> : !bgLayer && smooth.src && <img class={'pref-intro-bg zoom' + (smooth.smooth ? ' smooth' : '')} src={smooth.src} alt="" draggable={false} />) : <div class="pref-intro-bg empty" />}
      <div class="pref-intro-title">
        <div class="pref-intro-ja">{p?.ja}</div>
        <div class="pref-intro-ru">{p?.ru}</div>
        {reward && <div class="pref-intro-reward">Награда: <PixIcon id={reward} size={32} /> {REWARD_INFO[reward].name}</div>}
        {who && <div class="pref-intro-who"><Avatar p={who} size={36} /> {who.name}</div>}
      </div>
    </div>
  );
}
