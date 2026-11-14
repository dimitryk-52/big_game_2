// Горячие клавиши ведущего — для Stream Deck и клавиатуры.
// Работают и на пульте (админка → Пульт), и на экране ТВ — в том окне, которое сейчас в фокусе.
// Ctrl+Alt+Shift+буква не занята ни Windows, ни Chrome; F13–F18 на обычной клавиатуре нет вовсе.
// Сравниваем по e.code, поэтому раскладка (рус/англ) не важна.

export type HotCmd = 'next' | 'pause' | 'start' | 'wheelNext' | 'sound' | 'panel';

export const HOTKEYS: { cmd: HotCmd; letter: string; f: string; label: string }[] = [
  { cmd: 'next', letter: 'N', f: 'F13', label: 'Далее' },
  { cmd: 'pause', letter: 'P', f: 'F14', label: 'Пауза / продолжить' },
  { cmd: 'start', letter: 'S', f: 'F15', label: 'Начать игру' },
  { cmd: 'wheelNext', letter: 'W', f: 'F16', label: 'Колесо: приз получен' },
  { cmd: 'sound', letter: 'M', f: 'F17', label: 'Звук ТВ вкл/выкл' },
  { cmd: 'panel', letter: 'H', f: 'F18', label: 'Панель ведущего на ТВ' },
];

export function hotkeyCmd(e: KeyboardEvent): HotCmd | null {
  if (e.repeat) return null;
  for (const h of HOTKEYS) {
    if (e.code === h.f) return h.cmd;
    if (e.ctrlKey && e.altKey && e.shiftKey && !e.metaKey && e.code === 'Key' + h.letter) return h.cmd;
  }
  return null;
}
