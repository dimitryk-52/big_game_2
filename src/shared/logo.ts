// Логотип игры: src/img/logo_menu.webp (меню) и src/img/logo_text_px2.png (пиксельная надпись
// для угла ТВ, нарисована вручную; если её нет — logo_text_px.png). logo_menu.webp и logo_text_px.png
// собирает npm run build:logo из logo.png / logo_text.png; нет файла — null.
const files = import.meta.glob<string>(['../img/logo_menu.webp', '../img/logo_text_px.png', '../img/logo_text_px2.png'], { eager: true, import: 'default', query: '?url' });
const find = (name: string) => Object.entries(files).find(([p]) => p.endsWith(name))?.[1] ?? null;

export const LOGO_URL = find('logo_menu.webp');
export const LOGO_TEXT_URL = find('logo_text_px2.png') ?? find('logo_text_px.png');

/**
 * Пиксельная надпись в стиле логотипа (если своего logo_text_px.png нет): пиксельный шрифт
 * DotGothic16 в родном размере 16px без сглаживания, белые буквы, красная обводка и тёмная
 * тень — как у букв на logo.png. Холст в «пикселях логотипа», на экране растягивается без мыла.
 */
export async function pixelLogoUrl(text: string, px = 16): Promise<string> {
  const font = `${px}px DotGothic16`;
  try { await document.fonts.load(font, text); } catch { /* шрифт не обязателен */ }
  const m = document.createElement('canvas').getContext('2d')!;
  m.font = font;
  const tw = Math.ceil(m.measureText(text).width);
  const pad = 3;
  const w = tw + pad * 2, h = px + pad * 2 + 2;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sx = src.getContext('2d', { willReadFrequently: true })!;
  sx.font = font;
  sx.textBaseline = 'top';
  sx.fillStyle = '#fff';
  sx.fillText(text, pad, pad);
  const a = sx.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] >= 128;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  const ring = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) return true;
    return false;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = '';
    if (on(x, y)) c = '#ffffff';
    else if (ring(x, y)) c = '#e8202a';
    else if (ring(x - 1, y - 1) || ring(x, y - 1)) c = '#1b1440';
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  }
  return out.toDataURL();
}
