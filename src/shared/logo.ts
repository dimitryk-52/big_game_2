// Логотип игры: src/img/logo_menu.webp (меню) и src/img/logo_text_px.png (пиксельная надпись
// для угла ТВ). Оба собирает npm run build:logo из logo.png / logo_text.png; нет файла — null.
const files = import.meta.glob<string>(['../img/logo_menu.webp', '../img/logo_text_px.png'], { eager: true, import: 'default', query: '?url' });
const find = (name: string) => Object.entries(files).find(([p]) => p.endsWith(name))?.[1] ?? null;

export const LOGO_URL = find('logo_menu.webp');
export const LOGO_TEXT_URL = find('logo_text_px.png');
