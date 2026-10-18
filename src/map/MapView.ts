// Интерактивная карта на PixiJS: камера (зум/драг/пинч), фишки игроков,
// подсветка вариантов хода, частицы. Используется и на ТВ, и на телефоне.
import { Application, Container, Sprite, Text, Texture, TilingSprite, Graphics } from 'pixi.js';
import type { Player, PrefState } from '../shared/types';
import { PREF, PREF_CODES, cellAt } from './mapData';
import {
  CANVAS_H, CANVAS_W, prefAnchorWorld, prefBoundsWorld, renderMap, renderPrefMask, renderPrefOutline, renderSeaTile, worldToCell,
} from './render';
import { characterCanvas } from '../shared/sprites';
import { REWARD_INFO } from '../shared/settings';

export interface MapUpdate {
  prefs: Record<number, PrefState>;
  players: Player[];
  highlight?: number[];
  highlight2?: number[];
  blocked?: number[];
  selected?: number | null;
  activePid?: string | null;
  machines?: { pachinko: number[]; ring: number[] };
  showRewards?: boolean;
}

interface Token {
  pid: string;
  root: Container;
  body: Sprite;
  frames: Texture[];
  label: Text;
  ring: Graphics;
  x: number;
  y: number;
  tx: number;
  ty: number;
  hop: null | { pts: { x: number; y: number }[]; t: number; dur: number };
  flash: number;
  color: string;
  hat: number;
}

const FONT = 'DotGothic16, monospace';

export class MapView {
  app!: Application;
  private world = new Container();
  private sea!: TilingSprite;
  private mapCanvas = document.createElement('canvas');
  private mapTex!: Texture;
  private mapSprite!: Sprite;
  private hiLayer = new Container();
  private iconLayer = new Container();
  private labelLayer = new Container();
  private tokenLayer = new Container();
  private fxLayer = new Container();
  private masks = new Map<number, Texture & { ox?: number }>();
  private hiSprites: Sprite[] = [];
  private outline: Sprite | null = null;
  private tokens = new Map<string, Token>();
  private labels = new Map<number, Text>();
  private icons = new Map<string, Text>();
  private particles: { g: Graphics; vx: number; vy: number; life: number; max: number }[] = [];
  private lastLookKey = '';
  private last: MapUpdate | null = null;
  private time = 0;

  // камера
  private cam = { x: CANVAS_W / 2, y: CANVAS_H / 2, z: 1 };
  private camTarget: { x: number; y: number; z: number } | null = null;
  private userTouchedAt = -1e9;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragMoved = 0;
  private pinchDist = 0;

  onTap: ((code: number) => void) | null = null;
  interactive = true;

  static async create(el: HTMLElement, opts: { interactive?: boolean; background?: number } = {}) {
    const v = new MapView();
    v.interactive = opts.interactive ?? true;
    await v.init(el, opts.background ?? 0x1d2b5a);
    return v;
  }

  private async init(el: HTMLElement, bg: number) {
    try { await document.fonts.load('16px DotGothic16'); } catch { /* шрифт не обязателен */ }
    this.app = new Application();
    await this.app.init({ resizeTo: el, background: bg, antialias: false, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    el.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    this.app.canvas.style.display = 'block';

    this.sea = new TilingSprite({ texture: Texture.from(renderSeaTile()), width: CANVAS_W * 6, height: CANVAS_H * 6 });
    this.sea.texture.source.scaleMode = 'nearest';
    this.sea.position.set(-CANVAS_W * 2.5, -CANVAS_H * 2.5);
    this.mapCanvas.width = CANVAS_W;
    this.mapCanvas.height = CANVAS_H;
    this.mapTex = Texture.from(this.mapCanvas);
    this.mapTex.source.scaleMode = 'nearest';
    this.mapSprite = new Sprite(this.mapTex);
    this.world.addChild(this.sea, this.mapSprite, this.hiLayer, this.iconLayer, this.tokenLayer, this.labelLayer, this.fxLayer);
    this.app.stage.addChild(this.world);

    this.fitAll(false);
    this.app.ticker.add((t) => this.tick(t.deltaMS));
    if (this.interactive) this.bindInput();
    new ResizeObserver(() => { if (!this.camTarget && performance.now() - this.userTouchedAt > 4000) this.refocus(); }).observe(el);
  }

  destroy() {
    this.app.destroy(true, { children: true });
  }

  // ───── обновление состояния ─────

  update(u: MapUpdate) {
    this.last = u;
    const revKey = PREF_CODES.map((c) => (u.prefs[c]?.rev ? 1 : 0)).join('');
    const lookKey = revKey + '|' + (u.blocked ?? []).join(',');
    if (lookKey !== this.lastLookKey) {
      this.lastLookKey = lookKey;
      renderMap(this.mapCanvas.getContext('2d')!, { prefs: u.prefs, blocked: u.blocked });
      this.mapTex.source.update();
    }
    this.updateHighlights(u);
    this.updateLabels(u);
    this.updateIcons(u);
    this.updateTokens(u);
  }

  private maskTex(code: number) {
    let t = this.masks.get(code);
    if (!t) {
      const m = renderPrefMask(code);
      t = Texture.from(m.canvas) as any;
      t!.source.scaleMode = 'nearest';
      (t as any).ox = m.x;
      (t as any).oy = m.y;
      this.masks.set(code, t!);
    }
    return t!;
  }

  private updateHighlights(u: MapUpdate) {
    this.hiSprites.forEach((s) => s.destroy());
    this.hiSprites = [];
    const add = (codes: number[] | undefined, tint: number) => {
      for (const c of codes ?? []) {
        const t = this.maskTex(c) as any;
        const s = new Sprite(t);
        s.position.set(t.ox, t.oy);
        s.tint = tint;
        s.alpha = 0.4;
        (s as any).code = c;
        this.hiLayer.addChild(s);
        this.hiSprites.push(s);
      }
    };
    add(u.highlight, 0xfff27a);
    add(u.highlight2, 0xff9df0);
    if (this.outline) { this.outline.destroy(); this.outline = null; }
    if (u.selected) {
      const o = renderPrefOutline(u.selected, '#ffffff');
      const s = new Sprite(Texture.from(o.canvas));
      s.texture.source.scaleMode = 'nearest';
      s.position.set(o.x, o.y);
      this.hiLayer.addChild(s);
      this.outline = s;
    }
  }

  private updateLabels(u: MapUpdate) {
    const want = new Map<number, 'opt' | 'rev'>();
    for (const c of PREF_CODES) if (u.prefs[c]?.rev) want.set(c, 'rev');
    for (const c of [...(u.highlight ?? []), ...(u.highlight2 ?? [])]) want.set(c, 'opt');
    if (u.selected) want.set(u.selected, 'opt');
    for (const [c, l] of this.labels) if (!want.has(c)) { l.destroy(); this.labels.delete(c); }
    for (const [c, kind] of want) {
      let l = this.labels.get(c);
      if (!l) {
        l = new Text({ text: PREF[c].ru, style: { fontFamily: FONT, fontSize: 22, fill: 0xffffff, stroke: { color: 0x101020, width: 5 }, align: 'center' } });
        l.anchor.set(0.5, 0.5);
        l.resolution = 2;
        const a = prefAnchorWorld(c);
        l.position.set(a.x, a.y + 10);
        this.labelLayer.addChild(l);
        this.labels.set(c, l);
      }
      (l as any).kind = kind;
      l.style.fill = kind === 'opt' ? 0xfff27a : 0xffffff;
    }
  }

  private updateIcons(u: MapUpdate) {
    const want = new Map<string, { code: number; text: string; dx: number }>();
    for (const c of u.machines?.pachinko ?? []) if (u.prefs[c]?.rev) want.set('p' + c, { code: c, text: '🎰', dx: -12 });
    for (const c of u.machines?.ring ?? []) if (u.prefs[c]?.rev) want.set('r' + c, { code: c, text: '🎡', dx: -12 });
    if (u.showRewards !== false) for (const c of PREF_CODES) {
      const p = u.prefs[c];
      if (!p?.rev) continue;
      want.set('w' + c, { code: c, text: REWARD_INFO[p.reward].icon, dx: 12 });
    }
    for (const [k, t] of this.icons) if (!want.has(k)) { t.destroy(); this.icons.delete(k); }
    for (const [k, w] of want) {
      let t = this.icons.get(k);
      if (!t) {
        t = new Text({ text: w.text, style: { fontSize: 16 } });
        t.anchor.set(0.5, 1);
        t.resolution = 2;
        this.iconLayer.addChild(t);
        this.icons.set(k, t);
      }
      if (t.text !== w.text) t.text = w.text;
      const a = prefAnchorWorld(w.code);
      t.position.set(a.x + w.dx, a.y - 6);
    }
  }

  private tokenTarget(p: Player, all: Player[]) {
    const a = prefAnchorWorld(p.pref!);
    const same = all.filter((x) => x.pref === p.pref);
    const i = same.findIndex((x) => x.id === p.id);
    const dx = same.length > 1 ? (i === 0 ? -9 : 9) : 0;
    return { x: a.x + dx, y: a.y };
  }

  private updateTokens(u: MapUpdate) {
    const live = new Set<string>();
    for (const p of u.players) {
      if (!p.pref) continue;
      live.add(p.id);
      let t = this.tokens.get(p.id);
      const target = this.tokenTarget(p, u.players);
      if (!t || t.color !== p.color || t.hat !== p.hat) {
        t?.root.destroy({ children: true });
        const frames = [0, 1].map((f) => {
          const tx = Texture.from(characterCanvas(p.color, p.hat, 1, f));
          tx.source.scaleMode = 'nearest';
          return tx;
        });
        const root = new Container();
        const ring = new Graphics();
        const body = new Sprite(frames[0]);
        body.anchor.set(0.5, 1);
        body.scale.set(1.6);
        const label = new Text({ text: p.name, style: { fontFamily: FONT, fontSize: 18, fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
        label.anchor.set(0.5, 1);
        label.resolution = 2;
        label.position.set(0, -28);
        root.addChild(ring, body, label);
        this.tokenLayer.addChild(root);
        t = { pid: p.id, root, body, frames, label, ring, x: target.x, y: target.y, tx: target.x, ty: target.y, hop: null, flash: 0, color: p.color, hat: p.hat };
        this.tokens.set(p.id, t);
      }
      t.label.text = p.name;
      t.tx = target.x;
      t.ty = target.y;
      t.body.alpha = p.hp <= 0 ? 0.45 : 1;
      t.ring.clear();
      if (u.activePid === p.id) {
        t.ring.ellipse(0, 0, 11, 5).fill({ color: 0xfff27a, alpha: 0.9 });
      } else t.ring.ellipse(0, 0, 8, 3.5).fill({ color: 0x000000, alpha: 0.35 });
    }
    for (const [id, t] of this.tokens) if (!live.has(id)) { t.root.destroy({ children: true }); this.tokens.delete(id); }
  }

  /** анимация прыжков по пути префектур */
  animateMove(pid: string, codes: number[], dur = 1300) {
    const t = this.tokens.get(pid);
    if (!t || codes.length < 2) return;
    const pts = codes.map((c) => prefAnchorWorld(c));
    pts[0] = { x: t.x, y: t.y };
    t.hop = { pts, t: 0, dur };
  }

  puff(code: number, color = 0xffffff, n = 26) {
    const a = prefAnchorWorld(code);
    for (let i = 0; i < n; i++) {
      const g = new Graphics();
      const s = 2 + Math.random() * 4;
      g.rect(-s / 2, -s / 2, s, s).fill({ color });
      g.position.set(a.x, a.y);
      const ang = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 2.2;
      this.fxLayer.addChild(g);
      this.particles.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.6 - 0.6, life: 0, max: 700 + Math.random() * 600 });
    }
  }

  confetti(code: number) {
    const cols = [0xff4d6d, 0xffd23f, 0x4dabff, 0x5ce16b, 0xc77dff];
    for (let i = 0; i < 5; i++) this.puff(code, cols[i], 14);
  }

  hit(pid: string) {
    const t = this.tokens.get(pid);
    if (t) t.flash = 600;
  }

  // ───── камера ─────

  private viewSize() {
    return { w: this.app.screen.width, h: this.app.screen.height };
  }

  fitBounds(b: { x: number; y: number; w: number; h: number }, animate = true, pad = 60, maxZoom = 4) {
    const { w, h } = this.viewSize();
    const z = Math.min(maxZoom, Math.min((w - pad * 2) / Math.max(b.w, 1), (h - pad * 2) / Math.max(b.h, 1)));
    const target = { x: b.x + b.w / 2, y: b.y + b.h / 2, z };
    if (animate) this.camTarget = target;
    else { this.cam = target; this.camTarget = null; this.applyCam(); }
  }

  private focusCodes: number[] | null = null;
  focus(codes: number[], animate = true, maxZoom = 3.2) {
    this.focusCodes = codes;
    if (!codes.length) return this.fitAll(animate);
    // если пользователь только что двигал карту — не дёргаем камеру
    if (this.interactive && performance.now() - this.userTouchedAt < 2500) return;
    this.fitBounds(prefBoundsWorld(codes), animate, Math.min(this.viewSize().w, this.viewSize().h) * 0.1, maxZoom);
  }

  fitAll(animate = true) {
    this.focusCodes = null;
    this.fitBounds({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }, animate, 20);
  }

  refocus() {
    if (this.focusCodes) this.focus(this.focusCodes, true);
    else this.fitAll(true);
  }

  private applyCam() {
    const { w, h } = this.viewSize();
    this.world.scale.set(this.cam.z);
    this.world.position.set(w / 2 - this.cam.x * this.cam.z, h / 2 - this.cam.y * this.cam.z);
  }

  private screenToWorld(sx: number, sy: number) {
    const { w, h } = this.viewSize();
    return { x: (sx - w / 2) / this.cam.z + this.cam.x, y: (sy - h / 2) / this.cam.z + this.cam.y };
  }

  private bindInput() {
    const cv = this.app.canvas;
    const pos = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, pos(e));
      this.dragMoved = 0;
      this.camTarget = null;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const p = pos(e);
      if (this.pointers.size === 1) {
        this.cam.x -= (p.x - prev.x) / this.cam.z;
        this.cam.y -= (p.y - prev.y) / this.cam.z;
        this.dragMoved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
      }
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.pinchDist);
        this.pinchDist = d;
        this.dragMoved += 100;
      }
      this.userTouchedAt = performance.now();
      this.clampCam();
      this.applyCam();
    });
    const up = (e: PointerEvent) => {
      const had = this.pointers.has(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (had && this.pointers.size === 0 && this.dragMoved < 10 && this.onTap) {
        const p = pos(e);
        const w = this.screenToWorld(p.x, p.y);
        const code = this.codeAtWorld(w.x, w.y);
        if (code) this.onTap(code);
      }
      if (this.pointers.size < 2) this.pinchDist = 0;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = pos(e);
      this.camTarget = null;
      this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
      this.userTouchedAt = performance.now();
      this.applyCam();
    }, { passive: false });
  }

  private codeAtWorld(wx: number, wy: number) {
    const c = worldToCell(wx, wy);
    let code = cellAt(c.x, c.y);
    if (code) return code;
    // промах мимо — ищем ближайшую подсвеченную префектуру в радиусе (удобно пальцем)
    const opts = [...(this.last?.highlight ?? []), ...(this.last?.highlight2 ?? [])];
    let best = 0, bd = 1e9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const k = cellAt(c.x + dx, c.y + dy);
      if (!k || (opts.length && !opts.includes(k))) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  private zoomAt(sx: number, sy: number, k: number) {
    const before = this.screenToWorld(sx, sy);
    this.cam.z = Math.max(0.3, Math.min(8, this.cam.z * k));
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }

  private clampCam() {
    this.cam.x = Math.max(0, Math.min(CANVAS_W, this.cam.x));
    this.cam.y = Math.max(0, Math.min(CANVAS_H, this.cam.y));
  }

  // ───── кадр ─────

  private tick(dt: number) {
    this.time += dt;
    if (this.camTarget) {
      const k = 1 - Math.pow(0.0025, dt / 1000);
      this.cam.x += (this.camTarget.x - this.cam.x) * k;
      this.cam.y += (this.camTarget.y - this.cam.y) * k;
      this.cam.z += (this.camTarget.z - this.cam.z) * k;
      if (Math.abs(this.camTarget.z - this.cam.z) < 0.001 && Math.abs(this.camTarget.x - this.cam.x) < 0.3) this.camTarget = null;
    }
    this.applyCam();
    this.sea.tilePosition.x = Math.floor(this.time / 220) % 64;

    const pulse = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(this.time / 180));
    this.hiSprites.forEach((s) => (s.alpha = pulse));
    if (this.outline) this.outline.alpha = 0.6 + 0.4 * Math.sin(this.time / 120);

    // подписи: постоянный экранный размер; обычные — только при приближении
    const inv = 1 / this.cam.z;
    for (const l of this.labels.values()) {
      const opt = (l as any).kind === 'opt';
      l.scale.set(inv * (opt ? 0.85 : 0.6));
      l.visible = opt || this.cam.z > 1.6;
    }
    for (const t of this.icons.values()) {
      t.scale.set(Math.max(0.7, Math.min(1.6, inv * 1.4)));
      t.visible = this.cam.z > 0.75;
    }

    for (const t of this.tokens.values()) {
      if (t.hop) {
        t.hop.t += dt;
        const seg = t.hop.pts.length - 1;
        const f = Math.min(1, t.hop.t / t.hop.dur) * seg;
        const i = Math.min(seg - 1, Math.floor(f));
        const k = f - i;
        const a = t.hop.pts[i], b = t.hop.pts[i + 1];
        t.x = a.x + (b.x - a.x) * k;
        t.y = a.y + (b.y - a.y) * k;
        t.body.y = -Math.sin(k * Math.PI) * 22;
        t.body.texture = t.frames[Math.floor(this.time / 120) % 2];
        if (t.hop.t >= t.hop.dur) { t.hop = null; t.body.y = 0; t.body.texture = t.frames[0]; }
      } else {
        t.x += (t.tx - t.x) * Math.min(1, dt / 120);
        t.y += (t.ty - t.y) * Math.min(1, dt / 120);
        t.body.y = -Math.abs(Math.sin(this.time / 300 + t.tx)) * 1.5;
      }
      if (t.flash > 0) {
        t.flash -= dt;
        t.body.tint = Math.floor(t.flash / 80) % 2 ? 0xff3030 : 0xffffff;
        t.root.x = t.x + (Math.random() - 0.5) * 4;
      } else {
        t.body.tint = 0xffffff;
        t.root.x = t.x;
      }
      t.root.y = t.y;
      const s = Math.max(0.6, Math.min(1.4, 1.1 / Math.sqrt(this.cam.z)));
      t.root.scale.set(s);
      t.label.visible = this.cam.z > 0.8;
    }
    // порядок отрисовки по Y
    this.tokenLayer.children.sort((a, b) => a.y - b.y);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.g.x += p.vx * (dt / 16);
      p.g.y += p.vy * (dt / 16);
      p.vy += 0.02 * (dt / 16);
      p.g.alpha = 1 - p.life / p.max;
      if (p.life >= p.max) { p.g.destroy(); this.particles.splice(i, 1); }
    }
  }
}
