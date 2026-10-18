// Dev-ретранслятор: позволяет тестировать игру на реальных телефонах в локальной сети
// без Supabase. Работает только внутри `npm run dev`.
//  - WebSocket /relay?room=XXXX — пересылка сообщений между клиентами комнаты по каналам
//  - GET/PUT /devstore/<key> — простое key-value хранилище в папке .devdata
import type { Plugin } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'node:fs';
import path from 'node:path';

export function devRelay(): Plugin {
  return {
    name: 'dev-relay',
    apply: 'serve',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      const subs = new Map<WebSocket, { room: string; chans: Set<string> }>();

      server.httpServer?.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url ?? '', 'http://x');
        if (url.pathname !== '/relay') return;
        wss.handleUpgrade(req, socket, head, (ws) => {
          const room = url.searchParams.get('room') ?? 'default';
          subs.set(ws, { room, chans: new Set() });
          ws.on('message', (data) => {
            let m: any;
            try { m = JSON.parse(String(data)); } catch { return; }
            const me = subs.get(ws)!;
            if (m.sub) { me.chans.add(m.sub); return; }
            if (!m.ch) return;
            const out = JSON.stringify({ ch: m.ch, msg: m.msg });
            for (const [other, info] of subs) {
              if (other !== ws && info.room === me.room && info.chans.has(m.ch) && other.readyState === WebSocket.OPEN) other.send(out);
            }
          });
          ws.on('close', () => subs.delete(ws));
        });
      });

      const dir = path.resolve('.devdata');
      server.middlewares.use('/devstore/', (req, res) => {
        const key = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0]).replace(/[^a-zA-Z0-9_:.-]/g, '_');
        const file = path.join(dir, key + '.json');
        if (req.method === 'GET') {
          res.setHeader('content-type', 'application/json');
          res.end(fs.existsSync(file) ? fs.readFileSync(file) : 'null');
          return;
        }
        if (req.method === 'PUT') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(file, body || 'null');
            res.end('ok');
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}
