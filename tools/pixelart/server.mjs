// Мини-сервер для генерации пиксель-арта через Gemini (Nano Banana).
// Ключ берётся из .env в корне проекта (GEMINI_API_KEY) и в браузер не попадает.
// Запуск: node tools/pixelart/server.mjs  → http://localhost:4180
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.join(here, 'out');
const PORT = Number(process.env.PIXELART_PORT || process.env.PORT || 4180);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnv(path.join(root, '.env'));
loadEnv(path.join(root, '.env.local'));

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const MODELS = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];

fs.mkdirSync(outDir, { recursive: true });

// Очередь заданий (art/queue.json): Claude дописывает задания, человек прогоняет их на закладке «Очередь».
// Кнопка «В игру» кладёт картинку в src/img/<target> — только для целей из очереди.
const queueFile = path.join(root, 'art/queue.json');
const readQueue = () => JSON.parse(fs.readFileSync(queueFile, 'utf8'));
const writeQueue = (q) => fs.writeFileSync(queueFile, JSON.stringify(q, null, 2) + '\n');
const SAFE_TARGET = /^[a-z0-9_-]+\/[a-z0-9_-]+\.png$/;
/** картинки проекта, которые можно показать или взять референсом */
const SAFE_FILE = /^(src\/img|art)\/[a-zA-Z0-9_\/.-]+\.(png|webp|jpg)$/;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function slug(s) {
  return (s || 'art').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'art';
}

async function generate({ prompt, model, aspectRatio, imageSize, refs = [] }) {
  if (!MODELS.includes(model)) throw new Error('Неизвестная модель: ' + model);
  const parts = [{ text: prompt }];
  for (const r of refs) parts.push({ inlineData: { mimeType: r.mimeType, data: r.data } });

  const imageConfig = {};
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
  if (imageSize && model.startsWith('gemini-3')) imageConfig.imageSize = imageSize;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig },
      }),
    },
  );
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error?.message || `HTTP ${resp.status}`);

  const out = { images: [], text: '' };
  for (const p of json?.candidates?.[0]?.content?.parts || []) {
    if (p.inlineData?.data) out.images.push({ mimeType: p.inlineData.mimeType || 'image/png', data: p.inlineData.data });
    else if (p.text && !p.thought) out.text += p.text;
  }
  if (!out.images.length) {
    const reason = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason;
    throw new Error((out.text || 'Модель не вернула картинку') + (reason ? ` (${reason})` : ''));
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, fs.readFileSync(path.join(here, 'index.html')), 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/prefectures.js') {
      return send(res, 200, fs.readFileSync(path.join(here, 'prefectures.js')), 'text/javascript; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/api/queue') {
      const q = readQueue();
      for (const t of q.tasks) t.exists = SAFE_TARGET.test(t.target) && fs.existsSync(path.join(root, 'src/img', t.target));
      return send(res, 200, q);
    }

    if (req.method === 'POST' && url.pathname === '/api/queue/status') {
      const { id, status } = await readJson(req);
      if (!['todo', 'done'].includes(status)) return send(res, 400, { error: 'status: todo или done' });
      const q = readQueue();
      const t = q.tasks.find((x) => x.id === id);
      if (!t) return send(res, 404, { error: 'Нет задания ' + id });
      t.status = status;
      writeQueue(q);
      return send(res, 200, { ok: true });
    }

    // картинка из проекта (для превью в очереди и референсов)
    if (req.method === 'GET' && url.pathname === '/api/file') {
      const rel = url.searchParams.get('path') || '';
      if (!SAFE_FILE.test(rel) || rel.includes('..')) return send(res, 400, { error: 'Нельзя: ' + rel });
      const file = path.join(root, rel);
      if (!fs.existsSync(file)) return send(res, 404, { error: 'Нет файла ' + rel });
      const ext = path.extname(file).slice(1);
      return send(res, 200, fs.readFileSync(file), ext === 'jpg' ? 'image/jpeg' : 'image/' + ext);
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      return send(res, 200, { hasKey: !!API_KEY, models: MODELS, outDir: path.relative(root, outDir) });
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      if (!API_KEY) return send(res, 400, { error: 'Нет GEMINI_API_KEY в .env' });
      const body = await readJson(req);
      const result = await generate(body);
      return send(res, 200, result);
    }

    // Сохранение готовой (уже обработанной в браузере) картинки в tools/pixelart/out,
    // а для заданий из очереди — прямо в игру (src/img/<target>); задание отмечается выполненным
    if (req.method === 'POST' && url.pathname === '/api/save') {
      const { name, dataUrl, target } = await readJson(req);
      const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
      if (!m) return send(res, 400, { error: 'Ожидается PNG' });
      if (target) {
        const q = readQueue();
        const task = q.tasks.find((t) => t.target === target);
        if (!task || !SAFE_TARGET.test(target)) return send(res, 400, { error: 'Нельзя сохранить сюда: ' + target });
        const file = path.join(root, 'src/img', target);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(m[1], 'base64'));
        task.status = 'done';
        writeQueue(q);
        return send(res, 200, { file: path.relative(root, file).replace(/\\/g, '/'), id: task.id });
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const file = `${slug(name)}_${stamp}.png`;
      fs.writeFileSync(path.join(outDir, file), Buffer.from(m[1], 'base64'));
      return send(res, 200, { file: path.relative(root, path.join(outDir, file)) });
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message || String(e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Пиксель-арт генератор: http://localhost:${PORT}`);
  console.log(API_KEY ? 'Ключ Gemini найден.' : '⚠ GEMINI_API_KEY не найден в .env — добавь его и перезапусти.');
  console.log(`Сохранённые картинки: ${path.relative(root, outDir)}`);
});
