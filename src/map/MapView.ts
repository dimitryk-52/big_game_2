// Интерактивная карта на PixiJS: камера (зум/драг/пинч), фишки игроков,
// подсветка вариантов хода, частицы. Используется и на ТВ, и на телефоне.
import { Application, CanvasTextMetrics, Container, Sprite, Text, Texture, ImageSource, Graphics } from 'pixi.js';
import type { Player, PrefState } from '../shared/types';
import { PREF, PREF_CODES } from './mapData';
import {
  CANVAS_H, CANVAS_W, FOCUS_WORLD, SCALE, codeAt, loadMapAssets, prefAnchorWorld, prefBoundsWorld, renderMoveArrow, renderPrefFog, renderPrefMask, renderPrefOutline,
  worldToImage, type PrefLayer,
} from './render';
import { characterCanvas, pixelBadge, type BadgePart } from '../shared/sprites';

export interface MapUpdate {
  prefs: Record<number, PrefState>;
  players: Player[];
  highlight?: number[];
  highlight2?: number[];
  /** розовая заливка без ограничения нажатий (админка: префектуры с групповой игрой) */
  marked?: number[];
  /** групповые игры: код префектуры → id игры (выноска только в админке — в игре они одноразовые) */
  groupGames?: Record<number, string>;
  blocked?: number[];
  selected?: number | null;
  activePid?: string | null;
  /** соло-игры: id иконки → префектуры */
  machines?: Record<string, number[]>;
  /** магазины: плашка видна всегда, даже под туманом */
  shops?: number[];
  showRewards?: boolean;
  /** путь стрелки хода (коды префектур от текущей до цели) */
  arrow?: number[] | null;
}

interface Token {
  pid: string;
  root: Container;
  body: Sprite;
  frames: Texture[];
  label: Text;
  plate: Graphics;
  plateFor: string;
  ring: Graphics;
  x: number;
  y: number;
  tx: number;
  ty: number;
  hop: null | { pts: { x: number; y: number }[]; t: number; dur: number };
  /** куда фишка ушла анимацией, пока хост ещё не записал новую префектуру (и до какого времени ждём) */
  goingTo: null | { code: number; until: number };
  flash: number;
  color: string;
  hat: number;
}

/** шрифт берётся из CSS-переменной --font (меняется в одном месте — base.css) */
const font = () => getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'DotGothic16, monospace';

export class MapView {
  app!: Application;
  private world = new Container();
  private regions!: Uint8Array;
  private mapSprite!: Sprite;
  /** туман и затемнение недоступных — спрайты по форме префектур поверх рисунка */
  private fogLayer = new Container();
  private hiLayer = new Container();
  private arrowLayer = new Container();
  private arrow: (Sprite & { base: { x: number; y: number }; dir: { x: number; y: number } }) | null = null;
  private arrowKey = '';
  private arrowPts: { x: number; y: number }[] | null = null;
  private iconLayer = new Container();
  private labelLayer = new Container();
  private tokenLayer = new Container();
  private fxLayer = new Container();
  private layerCache = new Map<string, { tex: Texture; x: number; y: number }>();
  private hiSprites: Sprite[] = [];
  private outline: Sprite | null = null;
  private tokens = new Map<string, Token>();
  private labels = new Map<number, Text>();
  private icons = new Map<number, Sprite & { key?: string; bobs?: boolean; bob?: number }>();
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
  /** значки видны при любом зуме (админка) */
  iconsAlways = false;

  static async create(el: HTMLElement, opts: { interactive?: boolean; background?: number } = {}) {
    const v = new MapView();
    v.interactive = opts.interactive ?? true;
    await v.init(el, opts.background ?? 0x4984bc);
    return v;
  }

  private async init(el: HTMLElement, bg: number) {
    // ждём именно те начертания, которыми рисуются подписи (600) и имена (700) — иначе первые тексты уходят запасным шрифтом
    const fam = font().split(',')[0];
    try { await Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 16px ${fam}`, 'Привет 日本'))); } catch { /* шрифт не обязателен */ }
    const assets = await loadMapAssets();
    this.regions = assets.regions;
    this.app = new Application();
    await this.app.init({ resizeTo: el, background: bg, antialias: false, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    el.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    this.app.canvas.style.display = 'block';

    // при приближении — чёткие пиксели (nearest), при отдалении — мипмапы без ряби
    const src = new ImageSource({
      resource: assets.image,
      autoGenerateMipmaps: true,
      magFilter: 'nearest',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    this.mapSprite = new Sprite(new Texture({ source: src }));
    this.mapSprite.scale.set(SCALE);
    this.world.addChild(this.mapSprite, this.fogLayer, this.hiLayer, this.iconLayer, this.arrowLayer, this.tokenLayer, this.labelLayer, this.fxLayer);
    this.app.stage.addChild(this.world);

    this.fitAll(false);
    this.app.ticker.add((t) => this.tick(t.deltaMS));
    if (this.interactive) this.bindInput();
    // шрифт догрузился позже — перерисовываем подписи (старые текстуры остались бы запасным шрифтом)
    const onFonts = (e: FontFaceSetLoadEvent) => { if (e.fontfaces.some((f) => f.family.replace(/["']/g, '') === fam.replace(/["']/g, ''))) this.redrawTexts(); };
    document.fonts.addEventListener('loadingdone', onFonts);
    this.app.renderer.runners.destroy.add({ destroy: () => document.fonts.removeEventListener('loadingdone', onFonts) });
    new ResizeObserver(() => { if (!this.camTarget && performance.now() - this.userTouchedAt > 4000) this.refocus(); }).observe(el);
  }

  private redrawTexts() {
    CanvasTextMetrics.clearMetrics();
    for (const l of this.labels.values()) l.destroy();
    this.labels.clear();
    for (const t of this.tokens.values()) {
      // сначала уничтожаем старую — иначе новая возьмёт из кеша ту же текстуру
      const i = t.root.getChildIndex(t.label), name = t.label.text;
      t.label.destroy();
      const l = nameLabel(name);
      t.root.addChildAt(l, i);
      t.label = l;
      t.plateFor = '';
    }
    if (this.last) { this.updateLabels(this.last); this.updateTokens(this.last); }
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
      this.updateFog(u);
    }
    this.updateHighlights(u);
    this.arrowPts = u.arrow && u.arrow.length >= 2 ? u.arrow.map((c) => prefAnchorWorld(c)) : null;
    this.updateLabels(u);
    this.updateIcons(u);
    this.updateTokens(u);
  }

  /** спрайт слоя префектуры (маска/туман/контур); текстуры строятся один раз и кешируются */
  private layerSprite(kind: 'mask' | 'fog' | 'outline', code: number) {
    const key = kind + code;
    let l = this.layerCache.get(key);
    if (!l) {
      const make: (r: Uint8Array, c: number) => PrefLayer = kind === 'mask' ? renderPrefMask : kind === 'fog' ? renderPrefFog : renderPrefOutline;
      const m = make(this.regions, code);
      const tex = Texture.from(m.canvas);
      tex.source.scaleMode = 'nearest';
      l = { tex, x: m.x, y: m.y };
      this.layerCache.set(key, l);
    }
    const s = new Sprite(l.tex);
    s.position.set(l.x, l.y);
    s.scale.set(SCALE);
    return s;
  }

  private updateFog(u: MapUpdate) {
    this.fogLayer.removeChildren().forEach((s) => s.destroy());
    const blocked = new Set(u.blocked ?? []);
    for (const c of PREF_CODES) {
      if (!u.prefs[c]?.rev) this.fogLayer.addChild(this.layerSprite('fog', c));
      if (blocked.has(c)) {
        const s = this.layerSprite('mask', c);
        s.tint = 0x101828;
        s.alpha = 0.5;
        this.fogLayer.addChild(s);
      }
    }
  }

  private updateHighlights(u: MapUpdate) {
    this.hiSprites.forEach((s) => s.destroy());
    this.hiSprites = [];
    // варианты хода: лёгкая заливка + явный контур
    const add = (codes: number[] | undefined, tint: number) => {
      for (const c of codes ?? []) {
        for (const kind of ['mask', 'outline'] as const) {
          const s = this.layerSprite(kind, c);
          s.tint = tint;
          (s as any).kind = kind;
          this.hiLayer.addChild(s);
          this.hiSprites.push(s);
        }
      }
    };
    add(u.highlight, 0xfff27a);
    add(u.highlight2, 0xff9df0);
    add(u.marked, 0xff9df0);
    if (this.outline) { this.outline.destroy(); this.outline = null; }
    if (u.selected) {
      const s = this.layerSprite('outline', u.selected);
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
        l = new Text({ text: PREF[c].ru, style: { fontFamily: font(), fontSize: 26, fontWeight: '600', fill: 0xffffff, stroke: { color: 0x101020, width: 5 }, align: 'center' } });
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
    // выноски над центром префектуры; пока там стоит игрок — прячем, чтобы не закрывать его имя.
    // Награда (кремовая, покачивается) — пока её не забрали; автомат (голубой, неподвижный) — всегда,
    // это постоянное место: к нему можно вернуться и играть ещё. Всё, что есть в префектуре, —
    // в одной общей выноске (автомат левее, групповая игра правее), чтобы влезало в маленькие префектуры.
    const want = new Map<number, BadgePart[]>();
    const add = (code: number, part: BadgePart) => {
      if (!want.has(code)) want.set(code, []);
      want.get(code)!.push(part);
    };
    const occupied = new Set(u.players.map((p) => p.pref));
    const shown = (c: number) => !!u.prefs[c]?.rev && !occupied.has(c);
    for (const [icon, codes] of Object.entries(u.machines ?? {})) for (const c of codes) if (shown(c)) add(c, { id: icon, kind: 'machine' });
    for (const c of u.shops ?? []) if (!occupied.has(c)) add(c, { id: 'shop', kind: 'machine' });
    for (const c of PREF_CODES) {
      if (u.showRewards !== false && shown(c) && !u.prefs[c].taken) add(c, { id: u.prefs[c].reward, kind: 'reward' });
    }
    for (const [c, g] of Object.entries(u.groupGames ?? {})) add(Number(c), { id: 'group_' + g, kind: 'group' });
    const sig = (parts: BadgePart[]) => parts.map((p) => p.id + ':' + p.kind).join(',');
    for (const [k, t] of this.icons) if (!want.has(k)) { t.destroy(); this.icons.delete(k); }
    for (const [code, parts] of want) {
      let t = this.icons.get(code);
      const key = sig(parts);
      if (!t || t.key !== key) {
        t?.destroy();
        const tex = Texture.from(pixelBadge(parts, 1));
        tex.source.scaleMode = 'nearest';
        t = Object.assign(new Sprite(tex), { key, bobs: parts.some((p) => p.kind === 'reward'), bob: Math.random() * 6 });
        // якорь — кончик указателя (посередине снизу)
        t.anchor.set(0.5, (tex.height - 1) / tex.height);
        this.iconLayer.addChild(t);
        this.icons.set(code, t);
      }
      const a = prefAnchorWorld(code);
      t.position.set(a.x, a.y);
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
      let target = this.tokenTarget(p, u.players);
      const going = this.tokens.get(p.id)?.goingTo;
      if (going) {
        // хост записывает новую префектуру чуть позже конца прыжка — не тянем фишку назад
        if (p.pref === going.code || performance.now() > going.until) this.tokens.get(p.id)!.goingTo = null;
        else target = prefAnchorWorld(going.code);
      }
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
        const label = nameLabel(p.name);
        const plate = new Graphics();
        root.addChild(ring, body, plate, label);
        this.tokenLayer.addChild(root);
        t = { pid: p.id, root, body, frames, label, plate, plateFor: '', ring, x: target.x, y: target.y, tx: target.x, ty: target.y, hop: null, goingTo: null, flash: 0, color: p.color, hat: p.hat };
        this.tokens.set(p.id, t);
      }
      t.label.text = p.name;
      if (t.plateFor !== p.name) { t.plateFor = p.name; drawNamePlate(t.plate, t.label, p.color); }
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
    const to = codes[codes.length - 1];
    t.goingTo = { code: to, until: performance.now() + dur + 3000 };
    t.tx = pts[pts.length - 1].x;
    t.ty = pts[pts.length - 1].y;
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

  /** стрелка хода: одна пиксельная дуга от игрока к цели (маршрут целиком не рисуем) */
  private drawArrow() {
    const pts = this.arrowPts;
    const key = pts ? `${pts[0].x},${pts[0].y}>${pts[pts.length - 1].x},${pts[pts.length - 1].y}` : '';
    if (key !== this.arrowKey) {
      this.arrowKey = key;
      this.arrow?.destroy({ texture: true });
      this.arrow = null;
      if (pts) {
        const a = worldToImage(pts[0].x, pts[0].y), b = worldToImage(pts[pts.length - 1].x, pts[pts.length - 1].y);
        const m = renderMoveArrow(a, b);
        const tex = Texture.from(m.canvas);
        tex.source.scaleMode = 'nearest';
        this.arrow = Object.assign(new Sprite(tex), { base: { x: m.x, y: m.y }, dir: m.dir });
        this.arrow.scale.set(SCALE);
        this.arrowLayer.addChild(this.arrow);
      }
    }
    if (!this.arrow) return;
    // покачивание к цели ступеньками по пикселю карты
    const step = Math.round((0.5 + 0.5 * Math.sin(this.time / 160)) * 2) * SCALE;
    this.arrow.position.set(this.arrow.base.x + this.arrow.dir.x * step, this.arrow.base.y + this.arrow.dir.y * step);
  }

  // ───── камера ─────

  private viewSize() {
    return { w: this.app.screen.width, h: this.app.screen.height };
  }

  fitBounds(b: { x: number; y: number; w: number; h: number }, animate = true, pad = 60, maxZoom = 4) {
    const { w, h } = this.viewSize();
    const z = Math.min(maxZoom, Math.min((w - pad * 2) / Math.max(b.w, 1), (h - pad * 2) / Math.max(b.h, 1)));
    const target = this.clamped({ x: b.x + b.w / 2, y: b.y + b.h / 2, z });
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
    this.fitBounds(FOCUS_WORLD, animate, 20);
  }

  refocus() {
    if (this.focusCodes) this.focus(this.focusCodes, true);
    else this.fitAll(true);
  }

  /** камера в пределах картинки: края карты никогда не видны (не отдалить дальше и не увести за край) */
  private clamped(c: { x: number; y: number; z: number }) {
    const { w, h } = this.viewSize();
    const z = Math.max(c.z, w / CANVAS_W, h / CANVAS_H);
    const hw = w / 2 / z, hh = h / 2 / z;
    return { z, x: Math.max(hw, Math.min(CANVAS_W - hw, c.x)), y: Math.max(hh, Math.min(CANVAS_H - hh, c.y)) };
  }

  private applyCam() {
    this.cam = this.clamped(this.cam);
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
    const p = worldToImage(wx, wy);
    const opts = [...(this.last?.highlight ?? []), ...(this.last?.highlight2 ?? [])];
    const code = codeAt(this.regions, p.x, p.y);
    if (code && (!opts.length || opts.includes(code))) return code;
    // промах мимо — ищем ближайшую подсвеченную префектуру в радиусе ~20px экрана (удобно пальцем)
    const R = Math.max(3, 20 / (this.cam.z * SCALE)), step = Math.max(1, R / 10);
    let best = code, bd = 1e9;
    for (let dy = -R; dy <= R; dy += step) for (let dx = -R; dx <= R; dx += step) {
      const k = codeAt(this.regions, p.x + dx, p.y + dy);
      if (!k || (opts.length && !opts.includes(k))) continue;
      const d = dx * dx + dy * dy;
      if (d < bd && d <= R * R) { bd = d; best = k; }
    }
    return best;
  }

  private zoomAt(sx: number, sy: number, k: number) {
    const before = this.screenToWorld(sx, sy);
    this.cam.z = Math.min(8, this.cam.z * k);
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }

  private clampCam() {
    this.cam = this.clamped(this.cam);
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
    this.drawArrow();

    const wave = 0.5 + 0.5 * Math.sin(this.time / 180);
    this.hiSprites.forEach((s) => (s.alpha = (s as any).kind === 'outline' ? 0.7 + 0.3 * wave : 0.1 + 0.12 * wave));
    if (this.outline) this.outline.alpha = 0.6 + 0.4 * Math.sin(this.time / 120);

    // подписи: постоянный экранный размер; обычные — только при приближении
    const inv = 1 / this.cam.z;
    for (const l of this.labels.values()) {
      const opt = (l as any).kind === 'opt';
      l.scale.set(inv * (opt ? 0.85 : 0.6));
      l.visible = opt || this.cam.z > 1.6;
    }
    // иконки — в масштабе фишек (пиксель иконки ≈ пиксель персонажа), чуть покачиваются
    const iconScale = 1.4 * Math.max(0.6, Math.min(1.4, 1.1 / Math.sqrt(this.cam.z)));
    for (const t of this.icons.values()) {
      t.scale.set(iconScale);
      t.pivot.y = t.bobs ? Math.round(Math.sin(this.time / 400 + t.bob!) * 0.8) : 0;
      t.visible = this.iconsAlways || this.cam.z > 0.75;
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
      t.label.visible = t.plate.visible = this.cam.z > 0.8;
      // имя рендерится в разрешении экрана: при приближении текстура текста не растягивается
      const res = Math.min(8, Math.ceil(this.cam.z * s * this.app.renderer.resolution));
      if (t.label.resolution !== res) t.label.resolution = res;
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

/** имя над фишкой */
function nameLabel(name: string) {
  const label = new Text({ text: name, style: { fontFamily: font(), fontSize: 20, fontWeight: '700', fill: 0xffffff } });
  label.anchor.set(0.5, 1);
  label.resolution = 2;
  label.position.set(0, -29);
  return label;
}

/** пиксельная плашка под именем над персонажем: тёмная, рамка цвета игрока, хвостик вниз */
function drawNamePlate(g: Graphics, label: Text, color: string) {
  const P = 2; // «пиксель» плашки в единицах фишки
  const w = Math.ceil((label.width + 12) / P) * P, h = Math.ceil((label.height - 2) / P) * P;
  const x = -w / 2, y = label.y - h + P;
  const c = parseInt(color.slice(1), 16);
  g.clear();
  // контур со срезанными углами, рамка цвета игрока, тёмная середина
  const box = (inset: number, fill: number) => {
    const i = inset * P;
    g.poly([
      x + i + P, y + i, x + w - i - P, y + i, x + w - i - P, y + i + P, x + w - i, y + i + P,
      x + w - i, y + h - i - P, x + w - i - P, y + h - i - P, x + w - i - P, y + h - i, x + i + P, y + h - i,
      x + i + P, y + h - i - P, x + i, y + h - i - P, x + i, y + i + P, x + i + P, y + i + P,
    ]).fill({ color: fill });
  };
  box(0, 0x0d0b1e);
  box(1, c);
  box(2, 0x1b1f3a);
  // хвостик к голове персонажа
  g.rect(-2 * P, y + h, 4 * P, P).fill({ color: 0x0d0b1e });
  g.rect(-P, y + h - P, 2 * P, P).fill({ color: c });
  g.rect(-P, y + h + P, 2 * P, P).fill({ color: 0x0d0b1e });
}
