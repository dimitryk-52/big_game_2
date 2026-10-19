// Вкладка «Карта»: то же, что «Префектуры», но выбор префектуры — нажатием на карте
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GroupGameId, PrefState, Question, RewardType, Settings } from '../shared/types';
import { PREF, PREF_CODES } from '../map/mapData';
import { MapView } from '../map/MapView';
import { GROUP_GAMES, REWARD_INFO, isSpecialQ } from '../shared/settings';
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
      machines: { pachinko: s.pachinkoPrefs, ring: s.ringPrefs, onsen: s.onsenPrefs ?? [] },
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
          <div class="note">Нажми на префектуру на карте. Значки: награда (если задана вручную), пачинко, призовая машина, онсэн, магазин; розовые выноска и заливка — групповая игра. Колесо мыши — зум, перетаскивание — сдвиг.</div>
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
            <label class="set-row"><span><PixIcon id="pachinko" size={20} /> Пачинко</span><input type="checkbox" checked={s.pachinkoPrefs.includes(p.code)} onChange={() => setS({ ...s, pachinkoPrefs: toggle(s.pachinkoPrefs, p.code) })} /></label>
            <label class="set-row"><span><PixIcon id="ring" size={20} /> Призовая машина</span><input type="checkbox" checked={s.ringPrefs.includes(p.code)} onChange={() => setS({ ...s, ringPrefs: toggle(s.ringPrefs, p.code) })} /></label>
            <label class="set-row"><span><PixIcon id="onsen" size={20} /> Онсэн (отдых на круг лечит)</span><input type="checkbox" checked={(s.onsenPrefs ?? []).includes(p.code)} onChange={() => setS({ ...s, onsenPrefs: toggle(s.onsenPrefs ?? [], p.code) })} /></label>
            <div class="muted small">Пачинко, машина и онсэн предлагаются в конце хода: игрок остаётся на круг — пропускает ход и викторины, но играет в групповые игры и может быть атакован.</div>
            <label class="set-row"><span><PixIcon id="shop" size={20} /> Магазин</span><input type="checkbox" checked={s.shopPrefs.includes(p.code)} onChange={() => setS({ ...s, shopPrefs: toggle(s.shopPrefs, p.code) })} /></label>
            <label class="set-row"><span>Групповая игра</span>
              <select value={s.groupPrefs[p.code] ?? ''} onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value as GroupGameId | '';
                const gp = { ...s.groupPrefs };
                if (v) gp[p.code] = v; else delete gp[p.code];
                setS({ ...s, groupPrefs: gp });
              }}>
                <option value="">—</option>
                {(Object.keys(GROUP_GAMES) as GroupGameId[]).map((g) => <option value={g}>{GROUP_GAMES[g].name}</option>)}
              </select>
            </label>
            <div class="muted small">Соседи: {p.adj.map((c) => PREF[c]?.ru).filter(Boolean).join(', ')}</div>
            <h4 style={{ margin: '8px 0 0' }}>Свои вопросы: {qs.length}</h4>
            {qs.map((q) => <div class="small">{isSpecialQ(s, q) ? '🌈 ' : '• '}{q.text}</div>)}
          </>
        )}
      </div>
    </div>
  );
}
