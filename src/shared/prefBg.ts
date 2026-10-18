// Фоны префектур для экранов вопроса: src/img/bgs/bg_<префектура>.png — пиксель-арт в родном
// разрешении (собирается из bg_*_orig.png скриптом scripts/pixelart.py --bgs).
// Картинка квадратная; на месте её кадрирует CSS (object-fit: cover по центру).
import { useEffect, useState } from 'preact/hooks';
import { PREF } from '../map/mapData';

const files = import.meta.glob<string>(['../img/bgs/bg_*.png', '!../img/bgs/*_orig.png'], { eager: true, import: 'default', query: '?url' });
const byName: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) byName[path.replace(/^.*\/bg_|\.png$/g, '')] = url;

export function prefBgUrl(code: number | null | undefined): string | null {
  const en = code ? PREF[code]?.en : null;
  return en ? byName[en.toLowerCase()] ?? null : null;
}

// ───── плавный зум без дрожания ─────
// Пиксель-арт 341×341 при дробном масштабе с nearest «дрожит»: каждый кадр пиксели округляются
// заново. Поэтому для анимации картинка заранее увеличивается в UPSCALE раз по пикселям, а дальше
// браузер масштабирует её плавно (image-rendering: auto) — края пикселей остаются чёткими.

const UPSCALE = 6;
const upscaled = new Map<string, Promise<string>>();

function upscale(url: string): Promise<string> {
  let p = upscaled.get(url);
  if (!p) {
    p = new Promise<string>((ok) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width * UPSCALE;
        c.height = img.height * UPSCALE;
        const ctx = c.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => ok(b ? URL.createObjectURL(b) : url), 'image/png');
      };
      img.onerror = () => ok(url);
      img.src = url;
    });
    upscaled.set(url, p);
  }
  return p;
}

/** фон для анимации: пока увеличенная копия готовится — исходник (smooth = false, рисовать pixelated) */
export function useSmoothBg(url: string | null): { src: string | null; smooth: boolean } {
  const [big, setBig] = useState<{ url: string; src: string } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    void upscale(url).then((src) => { if (live) setBig({ url, src }); });
    return () => { live = false; };
  }, [url]);
  if (!url) return { src: null, smooth: false };
  return big?.url === url && big.src !== url ? { src: big.src, smooth: true } : { src: url, smooth: false };
}

/** заранее готовит увеличенные копии фонов — по одной, чтобы не мешать игре (ТВ при запуске) */
export function prewarmBgs(first: (number | null | undefined)[] = []) {
  const urls = [...first.map((c) => prefBgUrl(c)), ...Object.values(byName)].filter((u): u is string => !!u);
  const queue = [...new Set(urls)];
  const next = () => {
    const u = queue.shift();
    if (u) void upscale(u).then(() => setTimeout(next, 200));
  };
  next();
}

/** подготовить фон конкретной префектуры вне очереди (например, пока фишка идёт к ней) */
export function prewarmBg(code: number | null | undefined) {
  const u = prefBgUrl(code);
  if (u) void upscale(u);
}
