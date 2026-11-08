// Флаги префектур: src/img/flags/NN.svg (NN — код префектуры 01..47), с Wikimedia Commons.
// Используются в вопросах «выбери флаг префектуры» — варианты ответа собирает хост.
let files: Record<string, string> = {};
try {
  files = import.meta.glob<string>('../img/flags/*.svg', { eager: true, import: 'default', query: '?url' });
} catch {
  // вне Vite (headless-симуляция): картинки не нужны, только коды
  for (let c = 1; c <= 47; c++) files[`${String(c).padStart(2, '0')}.svg`] = `flag-${c}`;
}

const URLS: Record<number, string> = {};
for (const [path, url] of Object.entries(files)) {
  const m = path.match(/(\d+)\.svg$/);
  if (m) URLS[Number(m[1])] = url;
}

export const FLAG_CODES: number[] = Object.keys(URLS).map(Number).sort((a, b) => a - b);

export function flagUrl(code: number | null | undefined): string {
  return code ? URLS[code] ?? '' : '';
}
