// Онсэн с обезьянами: панорама «из глаз» игрока. На телефоне её крутят пальцем или поворотом
// телефона, на ТВ (пнп) — тот же взгляд, плавно догоняющий присланный с телефона.
// Картинка натянута на сферу (равнопромежуточная проекция), а камера смотрит изнутри с перспективой —
// края кадра чуть выгибаются, как в 360-панораме. Нет WebGL — обычный сдвиг фона.
import { useEffect, useRef } from 'preact/hooks';
import panoUrl from '../img/onsen_pano.webp';

/** куда смотрим: доли от 0 до 1 по горизонтали и вертикали */
export interface OnsenLook { x: number; y: number }

/** во сколько раз картинка выше окна — немного запаса, чтобы смотреть вверх-вниз (запасной вариант без WebGL) */
export const ONSEN_ZOOM = 1.15;

const PANO_ASPECT = 2514 / 1000;
/** сколько градусов вокруг охватывает панорама по горизонтали; по вертикали — пропорционально */
const SPAN_X = 180;
const SPAN_Y = SPAN_X / PANO_ASPECT;
/** поле зрения камеры по вертикали, градусы (меньше SPAN_Y — остаётся куда посмотреть вверх-вниз) */
const FOV_Y = SPAN_Y / ONSEN_ZOOM;

const VS = `attribute vec2 p; varying vec2 v; void main() { v = p; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `precision mediump float;
varying vec2 v;
uniform sampler2D tex;
uniform vec2 look;   // рысканье и тангаж центра кадра, радианы
uniform vec2 halfTan; // тангенсы половины поля зрения по x и y
uniform vec2 span;   // охват панорамы, радианы
void main() {
  vec3 d = normalize(vec3(v.x * halfTan.x, v.y * halfTan.y, 1.0));
  float cp = cos(look.y), sp = sin(look.y);
  d = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
  float cy = cos(look.x), sy = sin(look.x);
  d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
  float yaw = atan(d.x, d.z);
  float pitch = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(yaw / span.x + 0.5, 0.5 - pitch / span.y);
  gl_FragColor = texture2D(tex, clamp(uv, 0.0, 1.0));
}`;

interface Gl { gl: WebGLRenderingContext; uLook: WebGLUniformLocation; uHalf: WebGLUniformLocation; ready: boolean }

function initGl(cv: HTMLCanvasElement): Gl | null {
  const gl = cv.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const pr = gl.createProgram()!;
  gl.attachShader(pr, vs);
  gl.attachShader(pr, fs);
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(gl.getUniformLocation(pr, 'span'), (SPAN_X * Math.PI) / 180, (SPAN_Y * Math.PI) / 180);
  const g: Gl = { gl, uLook: gl.getUniformLocation(pr, 'look')!, uHalf: gl.getUniformLocation(pr, 'halfTan')!, ready: false };
  const img = new Image();
  img.onload = () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    // картинка не степени двойки: без мипмапов и повтора; пиксели — чёткие
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    g.ready = true;
  };
  img.src = panoUrl;
  return g;
}

export function OnsenView({ look, smooth, class: cls }: { look: OnsenLook; smooth?: boolean; class?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const target = useRef(look);
  target.current = look;
  const glRef = useRef<Gl | null | undefined>(undefined);

  useEffect(() => {
    const c = cv.current!;
    glRef.current = initGl(c);
    const g = glRef.current;
    if (!g) return;
    const cur = { ...target.current };
    let raf = 0, last = performance.now();
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(100, t - last);
      last = t;
      // на ТВ взгляд догоняет присланный плавно, на телефоне — сразу
      const k = smooth ? 1 - Math.pow(0.004, dt / 1000) : 1;
      cur.x += (target.current.x - cur.x) * k;
      cur.y += (target.current.y - cur.y) * k;
      if (!g.ready) return;
      const r = box.current!.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const { gl } = g;
      gl.viewport(0, 0, w, h);
      const ty = Math.tan((FOV_Y * Math.PI) / 360);
      const tx = ty * (w / h);
      // сколько можно повернуть, чтобы край кадра не вылез за край панорамы
      const fovX = (Math.atan(tx) * 360) / Math.PI;
      const maxYaw = Math.max(0, (SPAN_X - fovX) / 2), maxPitch = Math.max(0, (SPAN_Y - FOV_Y) / 2);
      const yaw = ((cur.x - 0.5) * 2 * maxYaw * Math.PI) / 180;
      const pitch = ((0.5 - cur.y) * 2 * maxPitch * Math.PI) / 180;
      gl.uniform2f(g.uLook, yaw, pitch);
      gl.uniform2f(g.uHalf, tx, ty);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fallback = glRef.current === null;
  return (
    <div
      ref={box}
      class={'onsen-view' + (smooth ? ' smooth' : '') + (cls ? ' ' + cls : '')}
      style={fallback ? {
        backgroundImage: `url(${panoUrl})`,
        backgroundSize: `auto ${ONSEN_ZOOM * 100}%`,
        backgroundPosition: `${(look.x * 100).toFixed(2)}% ${(look.y * 100).toFixed(2)}%`,
      } : undefined}
    >
      <canvas ref={cv} class="onsen-gl" style={fallback ? { display: 'none' } : undefined} />
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
