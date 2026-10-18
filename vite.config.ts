import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';
import { devRelay } from './devserver/relay';

// PAGES=1 — сборка для GitHub Pages: публикуется только страница игрока.
// ТВ и админка запускаются локально (npm run local / npm run dev).
const pagesOnly = process.env.PAGES === '1';

export default defineConfig({
  // относительные пути — чтобы работало на GitHub Pages в подпапке репозитория
  base: './',
  plugins: [preact(), devRelay()],
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: pagesOnly
        ? { play: resolve(__dirname, 'play.html') }
        : {
            index: resolve(__dirname, 'index.html'),
            tv: resolve(__dirname, 'tv.html'),
            play: resolve(__dirname, 'play.html'),
            admin: resolve(__dirname, 'admin.html'),
          },
    },
  },
});
