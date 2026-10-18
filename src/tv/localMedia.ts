// Медиа для вопросов лежат в папке media/ проекта на компьютере ТВ.
// Локальный сервер (npm run local / npm run dev) раздаёт их по адресу media/<файл>,
// поэтому ничего выбирать и никуда загружать не нужно. В вопросе хранится только имя файла.

let available: Set<string> | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();

function key(name: string) {
  return name.split(/[\\/]/).pop()!.trim().toLowerCase();
}

/** перечитать список файлов в папке media/ */
export function refreshMedia(): Promise<void> {
  loading = fetch('media-list.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((list: string[] | null) => { available = list ? new Set(list.map(key)) : null; })
    .catch(() => { available = null; })
    .finally(() => subs.forEach((c) => c()));
  return loading;
}

export function onMediaChange(cb: () => void) {
  subs.add(cb);
  if (!loading) void refreshMedia();
  return () => { subs.delete(cb); };
}

/** null — список недоступен (страница открыта не с локального сервера) */
export function mediaCount(): number | null {
  return available ? available.size : null;
}

const isUrl = (u: string) => /^(https?:|blob:|data:|\/)/.test(u);

/** адрес для <video>/<audio>/<img> на ТВ: имя файла → media/<имя>, полный URL — как есть */
export function resolveMedia(url: string): string {
  if (isUrl(url)) return url;
  const name = url.replace(/^media\//, '');
  return 'media/' + name.split('/').map(encodeURIComponent).join('/');
}

/** аудио/видео из вопросов, которых нет в папке media/ */
export function missingMedia(qs: { media?: { type: string; url: string } }[]): string[] {
  if (!available) return [];
  const out = new Set<string>();
  for (const q of qs) {
    const m = q.media;
    if (!m || m.type === 'image' || !m.url || isUrl(m.url)) continue;
    if (!available.has(key(m.url))) out.add(m.url);
  }
  return [...out];
}
