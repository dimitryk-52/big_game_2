// Таймеры движка через Web Worker: Chrome сильно тормозит setTimeout в скрытых
// вкладках (до раза в минуту), а в воркере — нет. Без Worker (node-симуляция)
// используется обычный setTimeout.
let worker: Worker | null | undefined;
const cbs = new Map<number, () => void>();
let nextId = 1;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return (worker = null);
  try {
    const src = 'const t=new Map();onmessage=(e)=>{const d=e.data;if(d.c){clearTimeout(t.get(d.id));t.delete(d.id);return}' +
      't.set(d.id,setTimeout(()=>{t.delete(d.id);postMessage(d.id)},d.ms))}';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = (e) => {
      const cb = cbs.get(e.data);
      cbs.delete(e.data);
      cb?.();
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function setT(fn: () => void, ms = 0): any {
  const w = getWorker();
  if (!w) return globalThis.setTimeout(fn, ms);
  const id = nextId++;
  cbs.set(id, fn);
  w.postMessage({ id, ms });
  return id;
}

export function clearT(id: any) {
  if (id == null) return;
  const w = getWorker();
  if (!w) return globalThis.clearTimeout(id);
  cbs.delete(id);
  w.postMessage({ id, c: 1 });
}
