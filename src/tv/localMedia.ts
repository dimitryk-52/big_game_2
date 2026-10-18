// Локальная медиатека ТВ: аудио и видео лежат в папке на компьютере, который
// показывает ТВ-страницу. Никуда не загружаются и не тратят трафик Supabase.
// В вопросе хранится только имя файла (например kurenai.mp4).
//
// Chrome/Edge: showDirectoryPicker, доступ к папке запоминается между запусками
// (после перезагрузки браузер может попросить подтвердить доступ одним кликом).
// Остальные браузеры: обычный выбор папки, нужно выбирать при каждом запуске.

const files = new Map<string, File>();
const blobUrls = new Map<string, string>();
let folderName = '';
const subs = new Set<() => void>();

const MEDIA_RE = /\.(mp4|webm|mov|m4v|ogv|mp3|m4a|aac|wav|ogg|oga|flac|opus|jpg|jpeg|png|gif|webp|avif)$/i;

function key(name: string) {
  return name.split(/[\\/]/).pop()!.trim().toLowerCase();
}

function notify() {
  subs.forEach((c) => c());
}

export function onMediaChange(cb: () => void) {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function mediaInfo() {
  return { folder: folderName, count: files.size };
}

export function hasLocal(url: string | undefined) {
  return !!url && files.has(key(url));
}

/** URL для <video>/<audio>/<img> на ТВ: локальный файл по имени, иначе как есть */
export function resolveMedia(url: string): string {
  if (/^(blob:|data:)/.test(url)) return url;
  const k = key(url);
  const f = files.get(k);
  if (!f) return url;
  let u = blobUrls.get(k);
  if (!u) {
    u = URL.createObjectURL(f);
    blobUrls.set(k, u);
  }
  return u;
}

/** аудио/видео, которые указаны в вопросах как имя файла, но не найдены в папке */
export function missingMedia(qs: { media?: { type: string; url: string } }[]): string[] {
  const out = new Set<string>();
  for (const q of qs) {
    const m = q.media;
    if (!m || m.type === 'image' || !m.url) continue;
    if (/^(https?:|blob:|data:)/.test(m.url)) continue;
    if (!files.has(key(m.url))) out.add(m.url);
  }
  return [...out];
}

function setFiles(list: File[], name: string) {
  blobUrls.forEach((u) => URL.revokeObjectURL(u));
  blobUrls.clear();
  files.clear();
  for (const f of list) if (MEDIA_RE.test(f.name)) files.set(key(f.name), f);
  folderName = name;
  notify();
}

// ───── запоминание папки (IndexedDB) ─────

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('bg-media', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('h');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function saveHandle(h: any) {
  try {
    const db = await idb();
    db.transaction('h', 'readwrite').objectStore('h').put(h, 'dir');
  } catch { /* не критично */ }
}
async function loadHandle(): Promise<any> {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const r = db.transaction('h').objectStore('h').get('dir');
      r.onsuccess = () => res(r.result ?? null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

async function readDir(dir: any, out: File[], depth = 0) {
  for await (const entry of dir.values()) {
    if (entry.kind === 'file' && MEDIA_RE.test(entry.name)) out.push(await entry.getFile());
    else if (entry.kind === 'directory' && depth < 3) await readDir(entry, out, depth + 1);
  }
}

export const canRememberFolder = typeof (window as any).showDirectoryPicker === 'function';

/** выбрать папку (нужен клик пользователя) */
export async function pickFolder(): Promise<void> {
  if (canRememberFolder) {
    const dir = await (window as any).showDirectoryPicker({ id: 'big-game-2-media', mode: 'read' });
    const list: File[] = [];
    await readDir(dir, list);
    setFiles(list, dir.name);
    await saveHandle(dir);
    return;
  }
  // запасной вариант: <input webkitdirectory>
  await new Promise<void>((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    (inp as any).webkitdirectory = true;
    inp.multiple = true;
    inp.onchange = () => {
      const list = [...(inp.files ?? [])];
      const name = (list[0] as any)?.webkitRelativePath?.split('/')[0] ?? 'папка';
      setFiles(list, name);
      resolve();
    };
    inp.click();
  });
}

/**
 * Восстановить запомненную папку. С interactive=true (внутри клика) браузер может
 * спросить подтверждение; без клика — только если доступ уже выдан.
 */
export async function restoreFolder(interactive: boolean): Promise<'ok' | 'need-click' | 'none'> {
  if (!canRememberFolder) return 'none';
  const dir = await loadHandle();
  if (!dir) return 'none';
  let perm = await dir.queryPermission?.({ mode: 'read' });
  if (perm !== 'granted' && interactive) perm = await dir.requestPermission?.({ mode: 'read' });
  if (perm !== 'granted') return 'need-click';
  try {
    const list: File[] = [];
    await readDir(dir, list);
    setFiles(list, dir.name);
    return 'ok';
  } catch {
    return 'none';
  }
}
