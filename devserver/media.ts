// Раздача медиа из папки media/ (вопросы) и music/ (музыка карты и боя) в корне проекта —
// и в `npm run dev`, и в `npm run local`.
// ТВ запускается на этом же компьютере, поэтому видео и аудио никуда не загружаются:
//   /media/<файл>       — сам файл (с поддержкой Range, чтобы видео перематывалось)
//   /media-list.json    — список файлов (ТВ показывает, каких не хватает; админка подсказывает имена)
//   /music/<файл>       — музыка (map.mp3, duel.mp3), тоже только локально
import type { Connect, Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
};

function listFiles(dir: string, base = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(path.join(dir, e.name), rel));
    else if (TYPES[path.extname(e.name).toLowerCase()]) out.push(rel);
  }
  return out;
}

function handler(dir: string, prefix = 'media'): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = decodeURIComponent((req.url ?? '').split('?')[0]);
    if (prefix === 'media' && url.endsWith('/media-list.json')) {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(listFiles(dir)));
      return;
    }
    const m = url.match(new RegExp(`/${prefix}/(.+)$`));
    if (!m) return next();
    // ищем по относительному пути, а если нет — по имени файла в любой подпапке
    let file = path.join(dir, m[1]);
    if (!file.startsWith(dir) || !fs.existsSync(file)) {
      const name = path.basename(m[1]).toLowerCase();
      const found = listFiles(dir).find((f) => path.basename(f).toLowerCase() === name);
      if (!found) return next();
      file = path.join(dir, found);
    }
    const stat = fs.statSync(file);
    res.setHeader('content-type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('accept-ranges', 'bytes');
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      res.statusCode = 206;
      res.setHeader('content-range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('content-length', String(end - start + 1));
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.setHeader('content-length', String(stat.size));
      fs.createReadStream(file).pipe(res);
    }
  };
}

export function localMedia(): Plugin {
  const dir = path.resolve('media');
  const music = path.resolve('music');
  return {
    name: 'local-media',
    configureServer(server) {
      server.middlewares.use(handler(dir));
      server.middlewares.use(handler(music, 'music'));
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler(dir));
      server.middlewares.use(handler(music, 'music'));
    },
  };
}
