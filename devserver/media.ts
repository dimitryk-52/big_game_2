// Раздача медиа из папки media/ (вопросы) и music/ (музыка карты и боя) в корне проекта —
// и в `npm run dev`, и в `npm run local`.
// ТВ запускается на этом же компьютере, поэтому видео и аудио никуда не загружаются:
//   /media/<файл>       — сам файл (с поддержкой Range, чтобы видео перематывалось)
//   /media-list.json    — список файлов (ТВ показывает, каких не хватает; админка подсказывает имена)
//   /music/<файл>       — музыка (map.mp3, duel.mp3), тоже только локально
//   /sounds/<файл>      — звуки событий и интро (папка sounds/), тоже только локально
//   /sounds-list.json   — список звуков; POST /sounds-upload?name=… — положить файл в sounds/
//   /sounds-config.json — какой файл на какое событие (sounds/sounds.json); POST — сохранить
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

const AUDIO = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.opus', '.flac', '.webm']);

function readBody(req: Connect.IncomingMessage, limit = 30 * 1024 * 1024): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const parts: Buffer[] = [];
    let n = 0;
    req.on('data', (c: Buffer) => { n += c.length; if (n > limit) { fail(new Error('too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts)));
    req.on('error', fail);
  });
}

/** звуки: список, загрузка файлов и настройки «событие → файл» — всё в папке sounds/ на этом компьютере */
function soundsApi(dir: string): Connect.NextHandleFunction {
  const cfg = path.join(dir, 'sounds.json');
  const json = (res: any, data: unknown, code = 200) => {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(data));
  };
  return async (req, res, next) => {
    const [p, q = ''] = (req.url ?? '').split('?');
    const url = decodeURIComponent(p);
    try {
      if (url.endsWith('/sounds-list.json')) {
        return json(res, listFiles(dir).filter((f) => AUDIO.has(path.extname(f).toLowerCase())));
      }
      if (url.endsWith('/sounds-config.json')) {
        if (req.method === 'POST') {
          const data = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8'));
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(cfg, JSON.stringify(data, null, 2));
          return json(res, { ok: true });
        }
        return json(res, fs.existsSync(cfg) ? JSON.parse(fs.readFileSync(cfg, 'utf8')) : {});
      }
      if (url.endsWith('/sounds-upload') && req.method === 'POST') {
        const raw = new URLSearchParams(q).get('name') ?? '';
        const name = path.basename(raw).replace(/[<>:"/\|?*\x00-\x1f]/g, '_').trim();
        if (!name || !AUDIO.has(path.extname(name).toLowerCase())) return json(res, { error: 'Нужен аудиофайл (mp3, wav, ogg, m4a…)' }, 400);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, name), await readBody(req));
        return json(res, { ok: true, name });
      }
    } catch (e: any) {
      return json(res, { error: String(e?.message ?? e) }, 500);
    }
    next();
  };
}

export function localMedia(): Plugin {
  const dir = path.resolve('media');
  const music = path.resolve('music');
  const sounds = path.resolve('sounds');
  return {
    name: 'local-media',
    configureServer(server) {
      server.middlewares.use(handler(dir));
      server.middlewares.use(handler(music, 'music'));
      server.middlewares.use(soundsApi(sounds));
      server.middlewares.use(handler(sounds, 'sounds'));
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler(dir));
      server.middlewares.use(handler(music, 'music'));
      server.middlewares.use(soundsApi(sounds));
      server.middlewares.use(handler(sounds, 'sounds'));
    },
  };
}
