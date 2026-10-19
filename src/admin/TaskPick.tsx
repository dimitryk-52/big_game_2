// Админка: групповая игра и её задание в префектуре (вкладки «Префектуры» и «Карта»).
// Задания нумеруются по порядку на вкладке «Групповые игры»: «Каллиграфия 2» — второе задание каллиграфии
import type { GroupGameId, Settings } from '../shared/types';
import { GROUP_GAMES } from '../shared/settings';
import { PREF } from '../map/mapData';

/** задания игры в порядке вкладки «Групповые игры» (номер = индекс + 1) */
export function gameTasks(s: Settings, game: GroupGameId) {
  return s.groupTasks.filter((t) => t.game === game);
}

/** выбор «игра + номер задания»; выбранное задание переезжает сюда из другой префектуры */
export function GroupPick({ s, code, setS }: { s: Settings; code: number; setS: (s: Settings) => void }) {
  const game = s.groupPrefs[code];
  const cur = game ? gameTasks(s, game).find((t) => t.pref === code) : undefined;
  return (
    <select title={cur?.text ?? ''} value={cur ? `${game}:${cur.id}` : game ?? ''} onChange={(e) => {
      const [g, id] = (e.target as HTMLSelectElement).value.split(':') as [GroupGameId | '', string | undefined];
      const gp = { ...s.groupPrefs };
      if (g) gp[code] = g; else delete gp[code];
      setS({
        ...s,
        groupPrefs: gp,
        groupTasks: s.groupTasks.map((t) => {
          if (id && t.id === id) return { ...t, pref: code };
          if (t.pref === code) { const { pref: _, ...rest } = t; return rest; }
          return t;
        }),
      });
    }}>
      <option value="">—</option>
      {(Object.keys(GROUP_GAMES) as GroupGameId[]).map((g) => {
        const tasks = g === 'dragon' ? [] : gameTasks(s, g);
        if (!tasks.length) return <option value={g}>{GROUP_GAMES[g].name}</option>;
        return (
          <optgroup label={GROUP_GAMES[g].name}>
            {tasks.map((t, i) => (
              <option value={`${g}:${t.id}`}>
                {GROUP_GAMES[g].name} {i + 1}{t.pref && t.pref !== code ? ` (сейчас: ${PREF[t.pref]?.ru ?? '#' + t.pref})` : ''}
              </option>
            ))}
            <option value={g}>{GROUP_GAMES[g].name}: любое свободное</option>
          </optgroup>
        );
      })}
    </select>
  );
}
