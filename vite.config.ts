import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';
import { devRelay } from './devserver/relay.ts';
import { localMedia } from './devserver/media.ts';

// PAGES=1 — сборка для GitHub Pages: публикуется только страница игрока.
// ТВ и админка запускаются локально (npm run local / npm run dev).
const pagesOnly = process.env.PAGES === '1';

export default defineConfig({
  // относительные пути — чтобы работало на GitHub Pages в подпапке репозитория
  base: './',
  plugins: [preact(), devRelay(), localMedia()],
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: pagesOnly
        ? { play: resolve(import.meta.dirname, 'play.html') }
        : {
            index: resolve(import.meta.dirname, 'index.html'),
            tv: resolve(import.meta.dirname, 'tv.html'),
            play: resolve(import.meta.dirname, 'play.html'),
            admin: resolve(import.meta.dirname, 'admin.html'),
            ui: resolve(import.meta.dirname, 'ui.html'),
          },
    },
  },
});
