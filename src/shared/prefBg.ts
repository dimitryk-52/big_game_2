// Фоны префектур для экранов вопроса: src/img/bgs/bg_<префектура>.png — пиксель-арт в родном
// разрешении (собирается из bg_*_orig.png скриптом scripts/pixelart.py --bgs).
// Картинка квадратная; на месте её кадрирует CSS (object-fit: cover по центру).
import { PREF } from '../map/mapData';

const files = import.meta.glob<string>(['../img/bgs/bg_*.png', '!../img/bgs/*_orig.png'], { eager: true, import: 'default', query: '?url' });
const byName: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) byName[path.replace(/^.*\/bg_|\.png$/g, '')] = url;

export function prefBgUrl(code: number | null | undefined): string | null {
  const en = code ? PREF[code]?.en : null;
  return en ? byName[en.toLowerCase()] ?? null : null;
}
