// Онсэн с обезьянами: панорама «из глаз» игрока. На телефоне её крутят пальцем или поворотом
// телефона, на ТВ (пнп) — тот же взгляд, плавно догоняющий присланный с телефона.
import panoUrl from '../img/onsen_pano.webp';

/** куда смотрим: доли от 0 до 1 по горизонтали и вертикали */
export interface OnsenLook { x: number; y: number }

/** во сколько раз картинка выше окна — немного запаса, чтобы смотреть вверх-вниз */
export const ONSEN_ZOOM = 1.15;

export function OnsenView({ look, smooth, class: cls }: { look: OnsenLook; smooth?: boolean; class?: string }) {
  return (
    <div
      class={'onsen-view' + (smooth ? ' smooth' : '') + (cls ? ' ' + cls : '')}
      style={{
        backgroundImage: `url(${panoUrl})`,
        backgroundSize: `auto ${ONSEN_ZOOM * 100}%`,
        backgroundPosition: `${(look.x * 100).toFixed(2)}% ${(look.y * 100).toFixed(2)}%`,
      }}
    >
      <div class="onsen-steam"><i /><i /><i /><i /><i /></div>
    </div>
  );
}

/** сколько пикселей окна приходится на всю ширину/высоту хода взгляда (для перетаскивания) */
export function onsenTravel(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const h = r.height * ONSEN_ZOOM;
  const w = h * PANO_ASPECT;
  return { x: Math.max(1, w - r.width), y: Math.max(1, h - r.height) };
}

const PANO_ASPECT = 2514 / 1000;
