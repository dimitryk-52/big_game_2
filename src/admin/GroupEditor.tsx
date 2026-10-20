// Админка: групповые игры — задания, время, награды за места.
import { useEffect, useState } from 'preact/hooks';
import type { DragonSettings, FaceId, FishId, GroupGameId, IaiSceneId, Settings } from '../shared/types';
import { DEFAULT_SETTINGS, GROUP_GAMES, dragonSettings, groupTime, iaidoRounds } from '../shared/settings';
import { FACES } from '../games/faces';
import { FISH } from '../games/sashimi';
import { IAI_SCENES } from '../games/iaidoScenes';
import { PREF } from '../map/mapData';
import { uid } from '../shared/util';

export function GroupEditor({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => Promise<void> }) {
  const [s, setS] = useState<Settings>(structuredClone(settings));
  const [saved, setSaved] = useState(false);
  const [game, setGame] = useState<GroupGameId>('calligraphy');
  const upd = (fn: (x: Settings) => void) => { const c = structuredClone(s); fn(c); setS(c); };
  // в старых сохранённых настройках нет заданий новых игр — подставляем стандартные
  useEffect(() => {
    if (s.groupTasks.some((t) => t.game === game)) return;
    const def = DEFAULT_SETTINGS.groupTasks.filter((t) => t.game === game);
    if (def.length) upd((c) => { c.groupTasks.push(...structuredClone(def)); });
  }, [game]);
  const tasks = s.groupTasks.filter((t) => t.game === game);
  const codes = Object.entries(s.groupPrefs).filter(([, g]) => g === game).map(([c]) => +c).filter((c) => PREF[c]);
  const prefs = codes.map((c) => PREF[c].ru);
  const num = (label: string, get: () => number, set: (c: Settings, v: number) => void) => (
    <label class="set-row">
      <span>{label}</span>
      <input class="inp-s num" type="number" value={get()} onInput={(e) => upd((c) => set(c, Number((e.target as HTMLInputElement).value)))} />
    </label>
  );
  return (
    <div class="pad col" style={{ maxWidth: 900 }}>
      <div class="row">
        <button class="btn primary small" onClick={async () => { await onSave(s); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>{saved ? '✔ Сохранено' : 'Сохранить'}</button>
        <select value={game} onChange={(e) => setGame((e.target as HTMLSelectElement).value as GroupGameId)}>
          {(Object.keys(GROUP_GAMES) as GroupGameId[]).map((g) => <option value={g}>{GROUP_GAMES[g].name} {GROUP_GAMES[g].ja}</option>)}
        </select>
      </div>
      <div class="note">
        {game === 'iaido' && <>Иайдо: дуэль самураев на реакцию. Все держат палец над телефоном, в случайный момент на ТВ вспыхивает «!» (со звуком «кин»). Нажал раньше — выбыл из раунда; со второго раунда бывает ложная тревога — серый «?» и стук бамбука. Время нажатия сравнивается по синхронизированным часам, сеть на победителя не влияет. За раунд: самому быстрому 3 очка, второму 2, третьему 1; при равных очках выше лучшее время. Задание — подпись сцены, у каждого задания свой фон (выбор рядом с текстом).<br /></>}
        {game === 'calligraphy' && <>Каллиграфия:</>}
        {game === 'fukuwarai' && <>Фукуварай: на телефоне пустое лицо и детали. Детали перетаскивают на лицо, и они сразу исчезают — собираем вслепую. Не успел — оставшиеся детали падают куда попало. Потом лица раскрываются на ТВ и все голосуют.<br /></>}
        {game === 'sashimi' && <>Сашими: на телефоне рыба на доске и нож. Нужно отрезать кусок заданного веса (цель случайная, 15–55% от веса целиком). Вес зависит от толщины: у спины сантиметр весит больше, чем у хвоста. Потом куски взвешиваются на ТВ по одному, места — по точности, без голосования. В префектуре рыбы ({(Object.keys(FISH) as FishId[]).map((f) => `${FISH[f].name} — ${FISH[f].prefs.map((c) => PREF[c]?.ru).join(', ')}`).join('; ')}) берутся её задания, в остальных — любые.<br /></>}
        {game === 'dragon' && <>Джа-одори (танец дракона): все игроки несут дракона цепочкой и жмут на телефоне ЛЕВУЮ и ПРАВУЮ по очереди в такт барабану на ТВ.
          Сначала разминка без зачёта, потом гонг и зачёт; каждые 8 шагов темп растёт. Сбился — выбыл, остальные смыкаются. Места — по тому, кто дольше нёс;
          сбились все оставшиеся на одном шаге — прощаются. Картинки дракона и улицы — в <code>src/img/dragon/</code>.<br /></>}
        {game === 'senryu' && <>Сэнрю: в задании две первые строки через « / » (5 и 7 слогов), игроки дописывают последнюю (5 слогов), телефон считает слоги. Потом стихи по одному на ТВ и голосование.<br /></>}
        {game === 'calligraphy' && <> у всех на телефонах холст и кисть, по сигналу рисуют задание. Потом работы по одной показываются на ТВ под номерами,
        и все голосуют цифрами за 1, 2 и 3 место (3, 2 и 1 очко), за свою работу нельзя. Одинаковые очки — одно место, награду получают все.
        <br /></>}Где запускается: <b>{prefs.length ? prefs.join(', ') : 'нигде'}</b> — отметь на вкладке «Префектуры». Задание с префектурой играется именно там; в префектуре без своего задания выпадает любое свободное (не привязанное к другой префектуре), по очереди в случайном порядке.
      </div>
      {game !== 'dragon' && <h3 style={{ margin: '8px 0 0' }}>Задания</h3>}
      {game !== 'dragon' && tasks.map((t, i) => (
        <div class="row">
          <b title="Номер задания: на вкладке «Префектуры» оно выбирается как «{GROUP_GAMES[game].name} {i + 1}»" style={{ minWidth: 28, textAlign: 'right' }}>{i + 1}.</b>
          {game === 'fukuwarai' && (
            <select value={t.face ?? 'okame'} onChange={(e) => upd((c) => { c.groupTasks.find((x) => x.id === t.id)!.face = (e.target as HTMLSelectElement).value as FaceId; })}>
              {(Object.keys(FACES) as FaceId[]).map((f) => <option value={f}>{FACES[f].name}</option>)}
            </select>
          )}
          {game === 'sashimi' && (
            <select value={t.fish ?? 'tuna'} onChange={(e) => upd((c) => { c.groupTasks.find((x) => x.id === t.id)!.fish = (e.target as HTMLSelectElement).value as FishId; })}>
              {(Object.keys(FISH) as FishId[]).map((f) => <option value={f}>{FISH[f].name} ({FISH[f].total} г)</option>)}
            </select>
          )}
          {game === 'iaido' && (
            <select title="Фон картины" value={t.scene ?? 'moon'} onChange={(e) => upd((c) => { c.groupTasks.find((x) => x.id === t.id)!.scene = (e.target as HTMLSelectElement).value as IaiSceneId; })}>
              {(Object.keys(IAI_SCENES) as IaiSceneId[]).map((k) => <option value={k}>{IAI_SCENES[k].name}</option>)}
            </select>
          )}
          <input class="inp-s grow" placeholder={game === 'senryu' ? 'Первая строка / Вторая строка' : 'Текст задания'} value={t.text} onInput={(e) => upd((c) => { c.groupTasks.find((x) => x.id === t.id)!.text = (e.target as HTMLInputElement).value; })} />
          <select title="Префектура, где играется это задание" value={t.pref ?? ''} onChange={(e) => upd((c) => {
            const v = Number((e.target as HTMLSelectElement).value);
            const x = c.groupTasks.find((y) => y.id === t.id)!;
            if (v) x.pref = v; else delete x.pref;
          })}>
            <option value="">любая префектура</option>
            {[...new Set([...codes, ...(t.pref ? [t.pref] : [])])].map((c) => <option value={c}>{PREF[c]?.ru ?? `#${c}`}{codes.includes(c) ? '' : ' (игры там нет!)'}</option>)}
          </select>
          <button class="btn small" onClick={() => upd((c) => { c.groupTasks = c.groupTasks.filter((x) => x.id !== t.id); })}>🗑</button>
        </div>
      ))}
      {game !== 'dragon' && <div class="row"><button class="btn small" onClick={() => upd((c) => { c.groupTasks.push({ id: uid(8), game, text: '', ...(game === 'fukuwarai' ? { face: 'okame' as FaceId } : {}), ...(game === 'sashimi' ? { fish: 'tuna' as FishId } : {}) }); })}>+ Задание</button></div>}
      <h3 style={{ margin: '8px 0 0' }}>Время и награды</h3>
      <div class="settings-grid">
        {num('Каллиграфия: время на рисунок, сек', () => s.group.drawTime, (c, v) => (c.group.drawTime = v))}
        {num('Фукуварай: время, сек', () => groupTime(s, 'fukuwarai'), (c, v) => { (c.group.times ??= {}).fukuwarai = v; })}
        {num('Сэнрю: время, сек', () => groupTime(s, 'senryu'), (c, v) => { (c.group.times ??= {}).senryu = v; })}
        {num('Иайдо: раундов', () => iaidoRounds(s), (c, v) => (c.group.iaidoRounds = v))}
        {num('Сашими: время, сек', () => groupTime(s, 'sashimi'), (c, v) => { (c.group.times ??= {}).sashimi = v; })}
        {game === 'dragon' && ([
          ['Джа-одори: темп в начале, ударов/мин', 'bpm'],
          ['Ускорение каждые 8 шагов, %', 'accel'],
          ['Предельный темп, ударов/мин', 'maxBpm'],
          ['Шагов разминки (без зачёта)', 'warm'],
          ['Шагов зачёта максимум', 'steps'],
          ['Поправка на задержку касания, мс', 'tapLag'],
        ] as [string, keyof DragonSettings][]).map(([l, k]) => num(l, () => dragonSettings(s)[k], (c, v) => { c.group.dragon = { ...dragonSettings(c), [k]: v }; }))}
        {num('Время на голос, сек', () => s.group.voteTime, (c, v) => (c.group.voteTime = v))}
        {num('Показ каждой работы, мс', () => s.group.showMs, (c, v) => (c.group.showMs = v))}
        {s.group.prizes.map((_, i) => i).flatMap((i) => [
          num(`${i + 1} место, ¥`, () => s.group.prizes[i]?.yen ?? 0, (c, v) => { (c.group.prizes[i] ??= { yen: 0, stars: 0 }).yen = v; }),
          num(`${i + 1} место, ★`, () => s.group.prizes[i]?.stars ?? 0, (c, v) => { (c.group.prizes[i] ??= { yen: 0, stars: 0 }).stars = v; }),
        ])}
      </div>
    </div>
  );
}
