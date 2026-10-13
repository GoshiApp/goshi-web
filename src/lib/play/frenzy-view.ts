// "The minute of frenzy", client side: draws the individual 60 second phase and reads the pointer, touch (floating
// joystick) and keyboard. The game is simulated ONLY on the server; this file shows what the server sends (fsnap) with a
// small interpolation, and sends the direction and the nitro bit at 20 Hz at most.
import type { FrenzyInfo, FrenzyEnd, FrenzySnap } from "./protocol.ts";
import { COINS } from "./coins.ts";
import { selectedSkin, skinById } from "./skins.ts";

export interface FrenzyStrings {
  title: string;
  mass: string;
  rank: string;
  top: string;
  nitro: string;
  stun: string;
  gap: string;
  carried: string;
  you: string;
  hint: string;
  hit: string;
  startsIn: string;
  cap: string;
}

export interface FrenzyDeps {
  sendInput(dx: number, dy: number, boost: boolean): boolean;
  strings: FrenzyStrings;
  reduced: boolean;
}

const SYM = ["SOL", "DOGE", "AVAX", "ETH", "BNB", "BTC"] as const;
const SYM_COLOR = SYM.map((t) => COINS.find((c) => c[0] === t)?.[1] ?? "#ffffff");

interface Gem { id: number; x: number; y: number; s: number; m: number; btc: boolean }
interface Rect { x: number; y: number; w: number; h: number }
interface Laser extends Rect { off: number }
interface Floater { x: number; y: number; text: string; age: number; color: string }

export class FrenzyView {
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private info: FrenzyInfo | null = null;
  private you = "";
  private gems: Gem[] = [];
  private walls: Rect[] = [];
  private lasers: Laser[] = [];
  private gone = new Set<number>();
  private cur = { x: 0, y: 0, m: 20, stun: 0, h: 0 };
  private prev = { x: 0, y: 0 };
  private curAt = 0;
  private tick = 0;
  private timeLeftMs = 0;
  private rank = 0;
  private top: [string, number][] = [];
  private floaters: Floater[] = [];
  private flash = 0;
  private done: FrenzyEnd | null = null;
  private host: HTMLElement | null = null;
  private cleanup: (() => void)[] = [];
  // input
  private pointer: { x: number; y: number } | null = null;
  private joy: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private keys = new Set<string>();
  private boostKey = false;
  private boostBtn = false;
  private lastSend = 0;
  private lastSig = "";
  private dpr = 1;
  private W = 0;
  private H = 0;

  constructor(private deps: FrenzyDeps) {}

  /** Creates the canvas over the board `host` and starts drawing. Safe to call once per match. */
  mount(host: HTMLElement) {
    this.host = host;
    const c = document.createElement("canvas");
    c.className = "frenzy-canvas";
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:3;touch-action:none;background:#0b1030;";
    host.appendChild(c);
    this.canvas = c;
    this.g = c.getContext("2d");
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    this.cleanup.push(() => ro.disconnect());
    this.bindInput(c);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  start(info: FrenzyInfo, you: string) {
    this.info = info;
    this.you = you;
    this.gems = info.map.gems.map((a) => ({ id: a[0], x: a[1], y: a[2], s: a[3], m: a[4], btc: a[5] === 1 }));
    this.walls = info.map.walls.map((a) => ({ x: a[0], y: a[1], w: a[2], h: a[3] }));
    this.lasers = info.map.lasers.map((a) => ({ x: a[0], y: a[1], w: a[2], h: a[3], off: a[4] }));
    this.gone.clear();
    this.cur = { x: info.start.x, y: info.start.y, m: info.start.m, stun: 0, h: 0 };
    this.prev = { x: info.start.x, y: info.start.y };
    this.curAt = performance.now();
    this.timeLeftMs = info.ms;
    this.done = null;
  }

  snap(m: FrenzySnap) {
    this.prev = { x: this.cur.x, y: this.cur.y };
    this.cur = { x: m.you.x, y: m.you.y, m: m.you.m, stun: m.you.stun, h: m.you.h };
    this.curAt = performance.now();
    this.tick = m.tick;
    this.timeLeftMs = m.timeLeftMs;
    this.rank = m.rank;
    this.top = m.top;
    for (const id of m.taken) {
      this.gone.add(id);
      const g = this.gems.find((q) => q.id === id);
      if (g && !this.deps.reduced) this.floaters.push({ x: g.x, y: g.y, text: `+${g.m}`, age: 0, color: SYM_COLOR[g.s] ?? "#fff" });
    }
    for (const id of m.back) this.gone.delete(id);
    if (m.hit) this.flash = 1;
  }

  end(m: FrenzyEnd) {
    this.done = m;
  }

  /** The canvas goes away when the arena takes over. */
  dispose() {
    cancelAnimationFrame(this.raf);
    for (const f of this.cleanup) f();
    this.cleanup = [];
    this.canvas?.remove();
    this.canvas = null;
    this.g = null;
  }

  // ------------------------------------------------------------------ input

  private bindInput(c: HTMLCanvasElement) {
    const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    const rel = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    on<PointerEvent>(c, "pointerdown", (e) => {
      c.setPointerCapture?.(e.pointerId);
      const p = rel(e);
      if (e.pointerType === "touch") this.joy = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      else this.pointer = p;
    });
    on<PointerEvent>(c, "pointermove", (e) => {
      const p = rel(e);
      if (this.joy && this.joy.id === e.pointerId) { this.joy.x = p.x; this.joy.y = p.y; }
      else if (e.pointerType !== "touch") this.pointer = p;
    });
    const up = (e: PointerEvent) => {
      if (this.joy && this.joy.id === e.pointerId) this.joy = null;
    };
    on<PointerEvent>(c, "pointerup", up);
    on<PointerEvent>(c, "pointercancel", up);
    on<KeyboardEvent>(window, "keydown", (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) { this.keys.add(k); e.preventDefault(); }
      if (k === " " || k === "shift") { this.boostKey = true; e.preventDefault(); }
    });
    on<KeyboardEvent>(window, "keyup", (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === " " || k === "shift") this.boostKey = false;
    });
    on<Event>(window, "blur", () => { this.keys.clear(); this.boostKey = false; this.pointer = null; this.joy = null; });
    const btn = this.host?.closest("#realtime-arena-host")?.querySelector<HTMLElement>("[data-boost-button]");
    if (btn) {
      const set = (v: boolean) => { this.boostBtn = v; btn.setAttribute("aria-pressed", String(v)); };
      on<PointerEvent>(btn, "pointerdown", (e) => { e.preventDefault(); set(true); });
      on<PointerEvent>(btn, "pointerup", () => set(false));
      on<PointerEvent>(btn, "pointerleave", () => set(false));
      on<PointerEvent>(btn, "pointercancel", () => set(false));
    }
  }

  /** Direction from the joystick, the pointer or the keys; null when nobody is steering. */
  private steer(): { dx: number; dy: number } | null {
    if (this.joy) {
      const dx = this.joy.x - this.joy.ox;
      const dy = this.joy.y - this.joy.oy;
      if (Math.hypot(dx, dy) > 6) return { dx, dy };
      return null;
    }
    if (this.keys.size) {
      const k = this.keys;
      const dx = (k.has("arrowright") || k.has("d") ? 1 : 0) - (k.has("arrowleft") || k.has("a") ? 1 : 0);
      const dy = (k.has("arrowdown") || k.has("s") ? 1 : 0) - (k.has("arrowup") || k.has("w") ? 1 : 0);
      if (dx || dy) return { dx, dy };
    }
    if (this.pointer) {
      const dx = this.pointer.x - this.W / this.dpr / 2;
      const dy = this.pointer.y - this.H / this.dpr / 2;
      if (Math.hypot(dx, dy) > 8) return { dx, dy };
    }
    return null;
  }

  private sendInput(now: number) {
    if (now - this.lastSend < 50) return;
    const s = this.steer();
    const boost = this.boostKey || this.boostBtn;
    const len = s ? Math.hypot(s.dx, s.dy) : 0;
    const dx = s && len ? s.dx / len : 0;
    const dy = s && len ? s.dy / len : 0;
    const sig = `${dx.toFixed(2)},${dy.toFixed(2)},${boost}`;
    if (sig === this.lastSig && now - this.lastSend < 400) return;
    if (this.deps.sendInput(dx, dy, boost)) {
      this.lastSend = now;
      this.lastSig = sig;
    }
  }

  // ------------------------------------------------------------------ drawing

  private resize() {
    if (!this.canvas || !this.host) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.host.getBoundingClientRect();
    this.W = Math.max(200, Math.round(r.width * this.dpr));
    this.H = Math.max(200, Math.round(r.height * this.dpr));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
  }

  private laserOn(l: Laser): boolean {
    const m = this.info?.map;
    if (!m) return false;
    return (this.tick + l.off) % m.laserPeriod < m.laserOn;
  }

  private frame(now: number) {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const g = this.g;
    if (!g || !this.info) return;
    this.sendInput(now);
    const dt = 1 / 60;
    const s = this.deps.strings;
    const W = this.W, H = this.H, dpr = this.dpr;

    // Interpolate the head between the last two server positions (50 ms apart).
    const k = Math.min(1, (now - this.curAt) / 50);
    const px = this.prev.x + (this.cur.x - this.prev.x) * k;
    const py = this.prev.y + (this.cur.y - this.prev.y) * k;
    const span = 820;
    const scale = Math.min(W, H) / span;
    const sx = (x: number) => (x - px) * scale + W / 2;
    const sy = (y: number) => (y - py) * scale + H / 2;

    g.fillStyle = "#0b1030";
    g.fillRect(0, 0, W, H);
    // grid
    g.strokeStyle = "rgba(120,140,255,0.08)";
    g.lineWidth = 1;
    const gs = 100;
    g.beginPath();
    for (let x = Math.floor((px - W / 2 / scale) / gs) * gs; x < px + W / 2 / scale; x += gs) { g.moveTo(sx(x), 0); g.lineTo(sx(x), H); }
    for (let y = Math.floor((py - H / 2 / scale) / gs) * gs; y < py + H / 2 / scale; y += gs) { g.moveTo(0, sy(y)); g.lineTo(W, sy(y)); }
    g.stroke();
    // map border
    g.strokeStyle = "#7be3c3";
    g.lineWidth = 3 * dpr;
    g.strokeRect(sx(0), sy(0), this.info.map.w * scale, this.info.map.h * scale);

    // walls
    g.fillStyle = "#2c3770";
    for (const q of this.walls) g.fillRect(sx(q.x), sy(q.y), q.w * scale, q.h * scale);
    // lasers
    for (const l of this.lasers) {
      const on = this.laserOn(l);
      g.fillStyle = on ? "#ff3b6b" : "rgba(255,59,107,0.18)";
      if (on && !this.deps.reduced) { g.shadowColor = "#ff3b6b"; g.shadowBlur = 14 * dpr; }
      g.fillRect(sx(l.x), sy(l.y), Math.max(2, l.w * scale), Math.max(2, l.h * scale));
      g.shadowBlur = 0;
    }
    // gems
    const margin = 40;
    for (const q of this.gems) {
      if (this.gone.has(q.id)) continue;
      const x = sx(q.x), y = sy(q.y);
      if (x < -margin || y < -margin || x > W + margin || y > H + margin) continue;
      // The bubble is drawn about three times wider than the disc so the glow shows: the disc is 0.6 of that.
      const r = (q.btc ? 26 : q.m >= 3 ? 19 : 15) * scale;
      const half = r * 1.7;
      g.drawImage(bubble(q.s), x - half, y - half, half * 2, half * 2);
    }
    // the goshi: the same head and face as in the arena, in the colors of the chosen skin
    const R = 15 * scale * (1 + Math.min(0.8, (this.cur.m - 20) / 140));
    const sk = skinById(selectedSkin())?.style;
    const hue = 48;
    const headCol = this.cur.stun > 0 ? "#ffc2cf" : sk?.head ?? `hsl(${hue} 100% 90%)`;
    const heading = (this.cur.h / 256) * Math.PI * 2;
    const fx = Math.cos(heading), fy = Math.sin(heading), qx = -fy, qy = fx;
    const cx = W / 2, cy = H / 2;
    g.fillStyle = `${sk?.glowB ?? `hsla(${hue} 100% 62% / 0.28)`}`;
    g.beginPath(); g.arc(cx, cy, R * 1.9, 0, Math.PI * 2); g.fill();
    g.fillStyle = sk?.body ?? `hsl(${hue} 92% 58%)`;
    g.beginPath(); g.arc(cx - fx * R * 0.9, cy - fy * R * 0.9, R * 0.9, 0, Math.PI * 2); g.fill();
    g.fillStyle = headCol;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.lineWidth = Math.max(2, 3 * dpr);
    g.strokeStyle = "#fff";
    g.stroke();
    g.fillStyle = "rgba(255,120,150,0.55)";
    for (const side of [-1, 1]) { g.beginPath(); g.arc(cx - fx * R * 0.05 + qx * R * 0.72 * side, cy - fy * R * 0.05 + qy * R * 0.72 * side, R * 0.16, 0, Math.PI * 2); g.fill(); }
    for (const side of [-1, 1]) {
      const ex = cx + fx * R * 0.25 + qx * R * 0.42 * side, ey = cy + fy * R * 0.25 + qy * R * 0.42 * side;
      g.fillStyle = "#fff"; g.beginPath(); g.arc(ex, ey, R * 0.32, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#0b1130"; g.beginPath(); g.arc(ex + fx * R * 0.12, ey + fy * R * 0.12, R * 0.17, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(ex + fx * R * 0.17 - qx * R * 0.05, ey + fy * R * 0.17 - qy * R * 0.05, R * 0.06, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = "#0b1130"; g.lineWidth = Math.max(1.2, R * 0.07); g.lineCap = "round";
    g.beginPath(); g.arc(cx + fx * R * 0.76, cy + fy * R * 0.76, R * 0.17, heading + Math.PI * 0.55, heading + Math.PI * 1.45); g.stroke();
    // floaters
    g.font = `800 ${Math.round(14 * dpr)}px system-ui, sans-serif`;
    g.textAlign = "center";
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.age += dt;
      if (f.age > 0.9) { this.floaters.splice(i, 1); continue; }
      g.globalAlpha = 1 - f.age / 0.9;
      g.fillStyle = f.color;
      g.fillText(f.text, sx(f.x), sy(f.y) - f.age * 40 * dpr);
      g.globalAlpha = 1;
    }
    // laser hit flash
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,59,107,${0.35 * this.flash})`;
      g.fillRect(0, 0, W, H);
      this.flash = Math.max(0, this.flash - dt * 3);
    }
    // joystick
    if (this.joy) {
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.arc(this.joy.ox * dpr, this.joy.oy * dpr, 44 * dpr, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.35)";
      const jx = this.joy.x - this.joy.ox, jy = this.joy.y - this.joy.oy;
      const jl = Math.min(44, Math.hypot(jx, jy));
      const ja = Math.atan2(jy, jx);
      g.beginPath();
      g.arc(this.joy.ox * dpr + Math.cos(ja) * jl * dpr, this.joy.oy * dpr + Math.sin(ja) * jl * dpr, 20 * dpr, 0, Math.PI * 2);
      g.fill();
    }

    if (this.tick === 0) {
      const left = Math.ceil((this.info.startsAt - Date.now()) / 1000);
      if (left > 0 && left <= 10) {
        g.fillStyle = "rgba(7,11,31,0.55)";
        g.fillRect(0, 0, W, H);
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#ffe08a";
        g.font = `800 ${Math.round(64 * dpr)}px system-ui, sans-serif`;
        g.fillText(String(left), W / 2, H / 2);
        g.font = `700 ${Math.round(16 * dpr)}px system-ui, sans-serif`;
        g.fillStyle = "#fff";
        g.fillText(`${s.title}: ${s.startsIn}`, W / 2, H / 2 + 50 * dpr);
      }
    }

    // HUD
    const pad = 12 * dpr;
    g.textAlign = "left";
    g.textBaseline = "top";
    g.fillStyle = "#fff";
    g.font = `800 ${Math.round(22 * dpr)}px system-ui, sans-serif`;
    const sec = Math.ceil(this.timeLeftMs / 1000);
    g.fillText(`${s.title}  ${sec}s`, pad, pad);
    g.font = `700 ${Math.round(15 * dpr)}px system-ui, sans-serif`;
    g.fillStyle = "#ffe08a";
    g.fillText(`${s.mass} ${Math.round(this.cur.m)}   ${s.rank} ${this.rank || "-"}`, pad, pad + 28 * dpr);
    if (this.cur.stun > 0) {
      g.fillStyle = "#ff8fa3";
      g.fillText(s.stun, pad, pad + 50 * dpr);
    }
    // time bar
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(0, H - 8 * dpr, W, 8 * dpr);
    g.fillStyle = "#7be3c3";
    g.fillRect(0, H - 8 * dpr, (W * (this.info.ms - this.timeLeftMs)) / this.info.ms, 8 * dpr);
    // top 5
    g.textAlign = "right";
    g.font = `700 ${Math.round(13 * dpr)}px system-ui, sans-serif`;
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillText(s.top, W - pad, pad);
    this.top.forEach((t, i) => {
      g.fillStyle = i === this.rank - 1 ? "#ffe08a" : "rgba(255,255,255,0.75)";
      g.fillText(`${i + 1}. ${t[0]}  ${Math.round(t[1])}`, W - pad, pad + (i + 1) * 17 * dpr);
    });
    if (this.done) {
      g.fillStyle = "rgba(7,11,31,0.72)";
      g.fillRect(0, 0, W, H);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffe08a";
      g.font = `800 ${Math.round(26 * dpr)}px system-ui, sans-serif`;
      g.fillText(`${s.carried} ${Math.round(this.done.carried)}`, W / 2, H / 2 - 14 * dpr);
      g.fillStyle = "#fff";
      g.font = `700 ${Math.round(16 * dpr)}px system-ui, sans-serif`;
      g.fillText(s.gap, W / 2, H / 2 + 20 * dpr);
    }
  }
}

/** One glowing crypto bubble with its ticker, like the orbs of the arena: drawn once per symbol, then stamped. */
const bubbleCache = new Map<number, HTMLCanvasElement>();
function bubble(index: number): HTMLCanvasElement {
  let c = bubbleCache.get(index);
  if (c) return c;
  const SIZE = 96;
  c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d");
  if (g) {
    const col = SYM_COLOR[index] ?? "#ffffff";
    const h = SIZE / 2;
    const halo = g.createRadialGradient(h, h, 0, h, h, h);
    halo.addColorStop(0, `${col}cc`);
    halo.addColorStop(0.45, `${col}44`);
    halo.addColorStop(1, `${col}00`);
    g.fillStyle = halo;
    g.fillRect(0, 0, SIZE, SIZE);
    const R = SIZE * 0.3;
    g.fillStyle = col;
    g.beginPath(); g.arc(h, h, R, 0, Math.PI * 2); g.fill();
    const shade = g.createRadialGradient(h - R * 0.3, h - R * 0.4, R * 0.1, h, h, R);
    shade.addColorStop(0, "rgba(255,255,255,0.35)");
    shade.addColorStop(1, "rgba(0,0,0,0.4)");
    g.fillStyle = shade;
    g.fill();
    g.lineWidth = 2.4;
    g.strokeStyle = "rgba(255,255,255,0.92)";
    g.stroke();
    const t = SYM[index] ?? "";
    g.fillStyle = "#fff";
    g.font = `800 ${Math.round(Math.min(R * 0.95, (R * 2 * 0.86) / Math.max(2.2, t.length * 0.62)))}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.lineWidth = 2.5;
    g.strokeText(t, h, h + 1);
    g.fillText(t, h, h + 1);
  }
  bubbleCache.set(index, c);
  return c;
}

export { SYM as FRENZY_SYMBOLS };
