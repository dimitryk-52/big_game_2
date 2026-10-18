// Отладочное меню 🐞: показать любой экран игры (на ТВ и телефонах сразу), эффекты карты,
// иконки и фоны. ТВ — кнопка на пульте ведущего, телефон — play.html?debug=1.
import { useState } from 'preact/hooks';
import type { GameState } from '../shared/types';
import { DEBUG_SCENES } from '../host/debugScenes';
import { PREFS } from '../map/mapData';
import { prefBgUrl } from '../shared/prefBg';
import { PixIcon } from './common';

type Send = (cmd: string, args?: any) => void;

const ICONS = ['money', 'stars', 'bonus', 'special', 'prize', 'pachinko', 'ring'];

export function DebugMenu({ s, send, onClose, fx }: { s: GameState; send: Send; onClose: () => void; fx?: boolean }) {
  const pids = s.joinOrder.filter((id) => s.players[id]);
  const [pid, setPid] = useState(pids[0] ?? '');
  const [pref, setPref] = useState<number>(s.players[pid]?.pref ?? 13);
  const show = (scene: string) => send('debug', { scene, pid, pref });
  const groups = [...new Set(DEBUG_SCENES.map((x) => x.group))];
  const withBg = PREFS.filter((p) => prefBgUrl(p.code)).length;
  return (
    <div class="debug-menu">
      <div class="debug-head">
        <b>🐞 Отладка</b>
        <button class="btn small" onClick={() => send('debug', null)} disabled={!s.debug}>✖ Убрать сцену</button>
        <button class="btn small ghost" onClick={onClose}>Скрыть</button>
      </div>
      {!pids.length && <div class="warn">Нет игроков — добавь бота (на ТВ: tv.html?bots=3).</div>}
      <div class="debug-row">
        <label>Игрок <select value={pid} onChange={(e) => setPid((e.target as HTMLSelectElement).value)}>
          {pids.map((id) => <option value={id}>{s.players[id].name}</option>)}
        </select></label>
        <label>Префектура <select value={pref} onChange={(e) => setPref(+(e.target as HTMLSelectElement).value)}>
          {PREFS.map((p) => <option value={p.code}>{prefBgUrl(p.code) ? '🖼 ' : ''}{p.ru}</option>)}
        </select></label>
      </div>
      <div class="muted debug-note">Фоны есть у {withBg} из {PREFS.length} префектур (🖼). Сцена видна на ТВ и всех телефонах; игра под ней идёт дальше — поставь паузу, если мешает.</div>
      {s.debug && <div class="debug-note">Сейчас: <b>{DEBUG_SCENES.find((x) => x.id === s.debug!.scene)?.name ?? s.debug.scene}</b></div>}
      {groups.map((g) => (
        <div class="debug-group">
          <div class="debug-gname">{g}</div>
          <div class="debug-btns">
            {DEBUG_SCENES.filter((x) => x.group === g).map((x) => (
              <button class={'btn small' + (s.debug?.scene === x.id ? ' on' : '')} onClick={() => show(x.id)}>{x.name}</button>
            ))}
          </div>
        </div>
      ))}
      <div class="debug-group">
        <div class="debug-gname">Игра и карта</div>
        <div class="debug-btns">
          <button class="btn small" onClick={() => send('pause')}>{s.paused ? '▶ Снять паузу' : '⏸ Пауза игры'}</button>
          <button class="btn small" onClick={() => send('next')}>⏭ Далее</button>
          <button class="btn small" onClick={() => send('revealAll')}>Открыть все префектуры</button>
          <button class="btn small" onClick={() => send('teleport', { pid, pref })}>Переместить игрока сюда</button>
          <button class="btn small" onClick={() => send('give', { pid, yen: 1000, stars: 3 })}>+1000 ¥ +3 ★</button>
          <button class="btn small" onClick={() => send('give', { pid, hp: -3 })}>−3 HP</button>
          <button class="btn small" onClick={() => send('give', { pid, hp: 99 })}>Вылечить</button>
          {fx && <>
            <button class="btn small" onClick={() => send('debugFx', { k: 'arrive', d: { pid, code: pref, firstVisit: true } })}>Эффект: прибытие</button>
            <button class="btn small" onClick={() => send('debugFx', { k: 'hit', d: { pid } })}>Эффект: удар</button>
            <button class="btn small" onClick={() => send('debugFx', { k: 'prize', d: { pid } })}>Эффект: конфетти</button>
            <button class="btn small" onClick={() => send('debugFx', { k: 'reward' })}>Звук: монета</button>
          </>}
        </div>
      </div>
      <div class="debug-group">
        <div class="debug-gname">Иконки</div>
        <div class="debug-btns">{ICONS.map((id) => <span class="debug-icon" title={id}><PixIcon id={id} size={36} /></span>)}</div>
      </div>
    </div>
  );
}

/** телефон: меню включается параметром ?debug=1 (запоминается), ?debug=0 — выключить */
export function phoneDebugEnabled() {
  const q = new URLSearchParams(location.search).get('debug');
  try {
    if (q === '1') localStorage.setItem('bg_debug', '1');
    if (q === '0') localStorage.removeItem('bg_debug');
    return localStorage.getItem('bg_debug') === '1';
  } catch {
    return q === '1';
  }
}
