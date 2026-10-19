// Вкладка «Карта»: то же, что «Префектуры», но выбор префектуры — нажатием на карте
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PrefState, Question, RewardType, Settings, SoloGameId } from '../shared/types';
import { PREF, PREF_CODES } from '../map/mapData';
import { MapView } from '../map/MapView';
import { REWARD_INFO, SOLO_GAMES, isSpecialQ, machinesOf } from '../shared/settings';
import { GroupPick } from './TaskPick';
import { PixIcon } from '../ui/common';

/** состояние карты из настроек: всё открыто, значок награды — только у заданных вручную */
function mapPrefs(s: Settings): Record<number, PrefState> {
  return Object.fromEntries(PREF_CODES.map((c) => {
    const r = s.prefRewards[c];
    return [c, { rev: true, reward: r ?? 'money', taken: !r, prizeTaken: false, visits: 0 }];
  }));
}

export function PrefMap({ settings, questions, onSave }: { settings: Settings; questions: Question[]; onSave: (s: Settings) => Promise<void> }) {
  const [s, setS] = useState(settings);
  const [sel, setSel] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const elRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<MapView | null>(null);
  const dirty = s !== settings;

  useEffect(() => {
    let v: MapView | null = null, dead = false;
    void MapView.create(elRef.current!).then((m) => {
      if (dead) return m.destroy();
      v = m;
      m.onTap = (c) => setSel(c);
      m.iconsAlways = true;
      setView(m);
    });
    return () => { dead = true; v?.destroy(); };
  }, []);

  useEffect(() => {
    view?.update({
      prefs: mapPrefs(s),
      players: [],
      selected: sel,
      marked: Object.keys(s.groupPrefs).map(Number),
      groupGames: s.groupPrefs,
      machines: machinesOf(s),
      shops: s.shopPrefs,
    });
  }, [view, s, sel]);

  const toggle = (list: number[], code: number) => (list.includes(code) ? list.filter((x) => x !== code) : [...list, code]);
  const p = sel ? PREF[sel] : null;
  const qs = sel ? questions.filter((q) => q.pref === sel) : [];
  return (
    <div class="prefmap">
      <div class="prefmap-map" ref={elRef} />
      <div class="prefmap-side col">
        <div class="row">
          <button class="btn primary small" disabled={!dirty && !saved} onClick={async () => { await onSave(s); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>{saved ? '✔ Сохранено' : 'Сохранить'}</button>
          {dirty && !saved && <span class="muted small">есть несохранённые изменения</span>}
        </div>
        {!p ? (
          <div class="note">Нажми на префектуру на карте. Значки: награда (если задана вручную), соло-игры (пачинко, призовая машина, онсэн, чо-хан, судоку), магазин; розовые выноска и заливка — групповая игра. Колесо мыши — зум, перетаскивание — сдвиг.</div>
        ) : (
          <>
            <h3 style={{ margin: 0 }}>{p.ru} <span class="muted">{p.ja}</span> <span class="muted small">#{p.code}</span></h3>
            <label class="set-row"><span>Награда</span>
              <select value={s.prefRewards[p.code] ?? ''} onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value as RewardType | '';
                const pr = { ...s.prefRewards };
                if (v) pr[p.code] = v; else delete pr[p.code];
                setS({ ...s, prefRewards: pr });
              }}>
                <option value="">Авто</option>
                {(Object.keys(REWARD_INFO) as RewardType[]).map((r) => <option value={r}>{REWARD_INFO[r].icon} {REWARD_INFO[r].name}</option>)}
              </select>
            </label>
            {(Object.keys(SOLO_GAMES) as SoloGameId[]).map((g) => {
              const k = SOLO_GAMES[g].key;
              return <label class="set-row"><span><PixIcon id={g} size={20} /> {SOLO_GAMES[g].name}{g === 'onsen' ? ' (лечит)' : ''}</span><input type="checkbox" checked={(s[k] ?? []).includes(p.code)} onChange={() => setS({ ...s, [k]: toggle(s[k] ?? [], p.code) })} /></label>;
            })}
            <div class="muted small">Соло-игры доступны на телефоне, пока игрок стоит в префектуре; на время вопросов и групповых игр — пауза.</div>
            <label class="set-row"><span><PixIcon id="shop" size={20} /> Магазин</span><input type="checkbox" checked={s.shopPrefs.includes(p.code)} onChange={() => setS({ ...s, shopPrefs: toggle(s.shopPrefs, p.code) })} /></label>
            <label class="set-row"><span>Групповая игра</span><GroupPick s={s} code={p.code} setS={setS} /></label>
            <div class="muted small">Соседи: {p.adj.map((c) => PREF[c]?.ru).filter(Boolean).join(', ')}</div>
            <h4 style={{ margin: '8px 0 0' }}>Свои вопросы: {qs.length}</h4>
            {qs.map((q) => <div class="small">{isSpecialQ(s, q) ? '🌈 ' : '• '}{q.text}</div>)}
          </>
        )}
      </div>
    </div>
  );
}
