// Онсэн на телефоне: сидишь в горячем источнике с обезьянами и осматриваешься —
// пальцем или поворачивая телефон. Взгляд раз в полсекунды уходит на ТВ (пнп «из глаз»).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GameState, Player } from '../shared/types';
import { OnsenView, onsenTravel, type OnsenLook } from '../games/OnsenView';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** поворот телефона на столько градусов — вся панорама из конца в конец */
const GYRO_SPAN_X = 160;
const GYRO_SPAN_Y = 50;

export function Onsen({ client, paused }: { client: GameClient; s: GameState; me: Player; paused?: boolean }) {
  const [look, setLook] = useState<OnsenLook>({ x: 0.5, y: 0.5 });
  const lookRef = useRef(look);
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [gyro, setGyro] = useState<'off' | 'on' | 'denied'>('off');
  const [hint, setHint] = useState(true);

  const move = (fn: (l: OnsenLook) => OnsenLook) => {
    lookRef.current = fn(lookRef.current);
    setLook(lookRef.current);
  };

  // пока онсэн открыт (не на паузе), ТВ показывает «вид из глаз»; первый заход в префектуре лечит
  useEffect(() => {
    if (paused) return;
    void client.req('busy', { busy: 'onsen' }).catch(() => {});
    return () => { void client.req('busy', { busy: null }).catch(() => {}); };
  }, [paused]);

  // взгляд на ТВ: не чаще раза в 0,5 c и только если заметно сдвинулся (лимиты Supabase)
  useEffect(() => {
    if (paused) return;
    let sent = { x: -1, y: -1 };
    const iv = setInterval(() => {
      const l = lookRef.current;
      if (Math.abs(l.x - sent.x) < 0.004 && Math.abs(l.y - sent.y) < 0.004) return;
      sent = { ...l };
      client.pnp({ k: 'onsen', x: +l.x.toFixed(3), y: +l.y.toFixed(3) });
    }, 500);
    return () => clearInterval(iv);
  }, [paused]);

  // гироскоп: запоминаем начальное положение телефона, дальше смотрим относительно него
  useEffect(() => {
    if (gyro !== 'on') return;
    let base: { a: number; b: number; x: number; y: number } | null = null;
    const on = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null) return;
      if (!base) { base = { a: e.alpha, b: e.beta, x: lookRef.current.x, y: lookRef.current.y }; return; }
      let da = e.alpha - base.a;
      if (da > 180) da -= 360;
      if (da < -180) da += 360;
      const db = e.beta - base.b;
      move(() => ({ x: clamp01(base!.x - da / GYRO_SPAN_X), y: clamp01(base!.y - db / GYRO_SPAN_Y) }));
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, [gyro]);

  const toggleGyro = async () => {
    if (gyro === 'on') return setGyro('off');
    const D = (window as any).DeviceOrientationEvent;
    try {
      // iPhone спрашивает разрешение — только по нажатию
      if (D?.requestPermission && (await D.requestPermission()) !== 'granted') return setGyro('denied');
      setGyro(D ? 'on' : 'denied');
    } catch { setGyro('denied'); }
  };

  const down = (e: PointerEvent) => {
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setHint(false);
  };
  const pmove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !el.current) return;
    const tr = onsenTravel(el.current);
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    // тянем картинку: палец влево — взгляд вправо
    move((l) => ({ x: clamp01(l.x - dx / tr.x), y: clamp01(l.y - dy / tr.y) }));
  };
  const up = (e: PointerEvent) => { if (drag.current?.id === e.pointerId) drag.current = null; };

  return (
    <div class="onsen">
      <div ref={el} class="onsen-frame" onPointerDown={down} onPointerMove={pmove} onPointerUp={up} onPointerCancel={up}>
        <OnsenView look={look} />
        {hint && gyro !== 'on' && <div class="onsen-hint">👆 Води пальцем — осмотрись</div>}
      </div>
      <div class="onsen-bar">
        <div class="onsen-title">♨️ Онсэн · здоровье восстановлено</div>
        <button class={'btn small' + (gyro === 'on' ? ' on' : '')} onClick={toggleGyro}>
          {gyro === 'on' ? '📱 Поворот телефона: вкл' : gyro === 'denied' ? '📱 Поворот недоступен' : '📱 Смотреть, поворачивая телефон'}
        </button>
      </div>
    </div>
  );
}
