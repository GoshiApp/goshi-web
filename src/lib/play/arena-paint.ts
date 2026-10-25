// Draws one frame of the arena. State and rules are elsewhere (orb-rush.ts keeps the snapshots and the prediction);
// this file only paints what it is given, and keeps what is expensive out of the per frame path:
//  - orbs are cached glow sprites (no shadowBlur per orb),
//  - a snake is traced once and stroked in a few layers (no shadowBlur on long paths),
//  - the vignette and the nitro bar gradients are cached per size,
//  - effects live in typed array pools, scratch arrays are reused.
//
// The look (dark navy board with a faint grid, glowing neon bodies, bright head with two eyes, soft pellets, a nitro
// bar and a leaderboard) follows the MIT licensed .io style projects in THIRD_PARTY_NOTICES.md. The code is our own.

import { FxPool, TIER_COLOR, TIER_SCALE, boostFuel, orbPulse, orbTier, type OrbTier } from "./arena-fx.ts";
import { SETTINGS, type QualitySettings } from "./arena-quality.ts";
import { FINAL_PHASE } from "./arena-zone.ts";
import { skinById, type SkinStyle } from "./skins.ts";
import { COINS, coinIndexOf } from "./coins.ts";
import { GOSHI_HUES, blinkAmount, dizzyAlpha, hash, moodOf, type Mood } from "./goshi-face.ts";
import { drawYouMarker } from "./you-marker.ts";
import { leadStrings } from "./lead-strings.ts";
import { HEAD_DRAW_SCALE, LabelPlacer, dangerAmong, headOnPairs, zoneGuide } from "./arena-view.ts";
import type { Orb, PlayerSnap, TrapSnap, ZoneNow } from "./protocol.ts";

export const SABOTEUR_COLOR = "#ff7a4a";
/** The fill of a saboteur's body: dark enough for the orange dashed outline to read. */
export const SABOTEUR_BODY = "#7a3a22";

/** Orb radius in world units for its mass value. */
export const orbRadius = (v: number): number => 3 + 1.6 * Math.sqrt(Math.max(v, 0));

/** A stable hue for a wallet (yellow green through the greens, blues and violets to pink). Saboteurs have their own orange, so the two never look alike. */
export function hueFor(wallet: string): number {
  let h = 0;
  for (let i = 0; i < wallet.length; i++) h = (h * 31 + wallet.charCodeAt(i)) >>> 0;
  // The whole wheel except the orange of the saboteurs: with twenty bodies on screen two must rarely look alike.
  return 70 + (h % 260);
}

/** The old plain color (used by the mini map and the legend). */
export const colorFor = (wallet: string): string => `hsl(${hueFor(wallet)} 68% 58%)`;

export interface LooseOrb extends Orb { loot?: boolean }

export interface Floater { x: number; y: number; text: string; age: number }

export interface PaintStrings {
  you: string;
  protectedHint: string;
  /** "Back to the safe zone ({n})" */
  backToZone: string;
  countdown: string;
  /** Label of the final circle (the hold of the last phase). */
  finalZone: string;
  /** Label of the next circle while it is announced or being moved to. */
  nextZone: string;
  nitro: string;
  mass: string;
}

/** Interface size on a screen of w x h CSS pixels: full from 600 px on the short side, down to 0.72 on a small phone. */
export function uiScale(w: number, h: number): number {
  return Math.max(0.72, Math.min(1, Math.min(w, h) / 600));
}

/** Rooms with money: what places 1, 2 and 3 would take if the match ended now (set by the page that knows the room). */
let podiumLabels: readonly string[] | null = null;
export function setPodiumPrizes(labels: readonly string[] | null): void { podiumLabels = labels; }

export interface Frame {
  /** Only the arena, without the minimap, the board and the lead lines (a replay such as the VAR). */
  bare?: boolean;
  g: CanvasRenderingContext2D;
  /** Canvas size in device pixels. */
  W: number;
  H: number;
  dpr: number;
  /** Traps on the map (rules 3). */
  traps?: readonly TrapSnap[];
  /** Survival: the mass of each body is shown with what it is worth in dollars (its coins are market coins). */
  massUsd?: boolean;
  /** The measured round trip to the game server (ms), shown at the top of the board; absent while it is not known. */
  pingMs?: number;
  /** Size of the interface (texts, board, map): dpr, made smaller on a small screen so it never covers the game. */
  ui: number;
  now: number;
  players: readonly PlayerSnap[];
  zone: ZoneNow;
  orbs: ReadonlyMap<number, LooseOrb>;
  world: { w: number; h: number; x0?: number; y0?: number };
  you: string;
  cam: { x: number; y: number };
  /** Device pixels per world unit. */
  scale: number;
  /** Screen shake offset in device pixels. */
  shake: readonly [number, number];
  meAlive: boolean;
  myMass: number;
  boosting: boolean;
  /** Seconds of spawn protection left (0 when over), for the hint. */
  protectLeft: number;
  /** Whether a first snapshot has arrived. */
  hasState: boolean;
  /** "-N" numbers rising from your head while you are outside the zone (age in seconds). */
  floaters: readonly Floater[];
  reduced: boolean;
  strings: PaintStrings;
}

interface Style { idx: number; body: string; alt?: string; art?: string; glowA: string; glowB: string; head: string; rim: string }

const SPRITE = 64;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Bitcoin, Ethereum and Solana wear the real logo of their coin (Bitcoin CC0, Ethereum CC BY 3.0 by the Ethereum Foundation,
 * Solana per its brand guidelines), saved under /skins, cut to the head
 * circle and kept upright. Until an image is loaded, and outside a browser, the drawn head is used instead.
 */
const LOGO_ARTS = new Set(["btc", "eth", "sol"]);
const logoCache = new Map<string, HTMLImageElement>();
function logoOf(art: string): HTMLImageElement | null {
  if (typeof Image === "undefined" || !LOGO_ARTS.has(art)) return null;
  let img = logoCache.get(art);
  if (!img) { img = new Image(); img.src = `/skins/${art}.png`; logoCache.set(art, img); }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** The mass a body needs to eat the big orbs of the live arena (by their `t`), the same numbers as the server. */
export const BIG_ORB_MASS = [0, 1500, 10_000] as const;

/** The test sites draw every orb as a SOL coin, in every mode (practice, survival, rooms, the arenas, replays): the only coin
 *  of the game there is SOL. The real site keeps plain orbs for points and SOL coins only for real SOL. */
const ALL_SOL = (import.meta as { env?: Record<string, string | undefined> }).env?.PUBLIC_TARGET === "test";

export class ArenaPainter {
  /** What to draw (see arena-quality.ts). Changed by the quality manager between frames. */
  quality: QualitySettings = SETTINGS[0];
  /** The effect pool; orb-rush adds bursts, pops and sparkles to it. */
  readonly fx = new FxPool(320);
  /** Colors for the effects: 0..3 are the orb tiers, 4 is white, snakes are added as they appear. */
  readonly palette: string[] = [...TIER_COLOR, "#ffffff"];
  private readonly styles = new Map<string, Style>();
  private sprites: HTMLCanvasElement[] | null = null;
  private vignette: { w: number; h: number; grad: CanvasGradient } | null = null;
  private dangerGrad: { w: number; h: number; grad: CanvasGradient } | null = null;
  private chanceGrad: { w: number; h: number; grad: CanvasGradient } | null = null;
  private nitroGrad: { x: number; w: number; grad: CanvasGradient } | null = null;
  private readonly fonts = new Map<number, string>();
  private readonly order: PlayerSnap[] = [];
  private dash: { scale: number; pattern: number[] } = { scale: 0, pattern: [] };
  private readonly placer = new LabelPlacer();
  private ownHue: number | null = null;
  private curYou = "";
  /** When the body of the player was first seen protected (a fresh body): the "you" marker counts from there. */
  private youSince = 0;
  /** A new body for the viewer (the live arena): the "this one is you" marker plays again. */
  resetYouMarker(): void { this.youSince = 0; }
  private readonly ateAt = new Map<string, number>();
  /** Previous frame head position per player: speed is derived from it to detect boosting (not part of PlayerSnap). */
  private readonly lastHead = new Map<string, { x: number; y: number; t: number }>();
  private readonly dizzy: { x: number; y: number; r: number; c: number; at: number }[] = [];
  private ringText = "";
  private ringX = 0;
  private ringY = 0;
  private outGrad: { w: number; h: number; grad: CanvasGradient } | null = null;

  // ------------------------------------------------------------------ styles and sprites

  /** The color the player picked for its own goshi (an index of GOSHI_HUES), or null for the default. Drawn on this client only. */
  setOwnColor(index: number | null): void {
    this.ownHue = index === null ? null : GOSHI_HUES[index] ?? null;
  }

  private skins: Record<string, string> = {};
  private ownSkin: string | null = null;
  /** The skins of the players of this match (from the server), and the local choice, drawn for you before the server confirms. */
  setSkins(map: Record<string, string> | undefined, own: string | null): void {
    this.skins = map ?? {};
    this.ownSkin = own;
    this.styles.clear();
    this.lastHead.clear();
  }

  /** The goshi that just ate shows a happy mouth for a moment. */
  noteAte(wallet: string, now: number): void {
    this.ateAt.set(wallet, now);
  }

  /** The SOL coin picture, for the cash out animation. */
  solCoin(): HTMLCanvasElement { return this.coinSprites()[coinIndexOf("SOL") ?? 0]; }

  /** A room paid by bag: what every body carries (lamports). The board then ranks and shows the bags, not the mass. */
  private bagsMap: ReadonlyMap<string, number> | null = null;
  setBags(m: ReadonlyMap<string, number> | null): void { this.bagsMap = m; }

  /** A goshi that just used a power (a trap, its shield): its special face for a moment (popcat pops, the lasers fire...). */
  private readonly firedAt = new Map<string, number>();
  noteFired(wallet: string, now: number): void {
    this.firedAt.set(wallet, now);
  }

  /** A dizzy face where a goshi died, fading out. */
  /** Deaths shown as a supernova: the body glowing as it fades, a flash and a shock ring, and its coins flying to where they land. */
  private novas: { pts: [number, number][]; hx: number; hy: number; r: number; color: string; at: number }[] = [];
  private flights = new Map<number, { fx: number; fy: number; tx: number; ty: number; v: number; c?: string; id: number; at: number; delay: number }>();

  supernova(head: [number, number], body: readonly [number, number][], r: number, color: string, coins: readonly { id: number; x: number; y: number; v: number; c?: string }[], now: number): void {
    const pts: [number, number][] = [head, ...body.map((q) => [q[0], q[1]] as [number, number])];
    this.novas.push({ pts, hx: head[0], hy: head[1], r, color, at: now });
    if (this.novas.length > 12) this.novas.shift();
    coins.forEach((o, i) => {
      const from = pts[Math.floor((i * pts.length) / Math.max(1, coins.length))] ?? head;
      this.flights.set(o.id, { fx: from[0], fy: from[1], tx: o.x, ty: o.y, v: o.v, c: o.c, id: o.id, at: now, delay: (i % 12) * 25 });
    });
  }

  /** The supernovas and the coins in flight (world space). */
  private novaLayer(f: Frame): void {
    const g = f.g, now = f.now;
    this.novas = this.novas.filter((n) => now - n.at < NOVA_MS);
    for (const n of this.novas) {
      const t = (now - n.at) / NOVA_MS;
      // The body: still there, glowing, fading out.
      g.save();
      g.lineCap = "round"; g.lineJoin = "round";
      g.globalAlpha = Math.max(0, 1 - t) * 0.85;
      g.strokeStyle = n.color;
      g.lineWidth = n.r * 2 * (1 + t * 0.6);
      if (this.quality.shadowGlow) { g.shadowColor = n.color; g.shadowBlur = 30; }
      g.beginPath();
      n.pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
      g.stroke();
      g.shadowBlur = 0;
      // The flash and the shock ring at the head.
      const ring = n.r * (2 + 14 * Math.sqrt(t));
      g.globalAlpha = Math.max(0, 1 - t * 1.6);
      g.strokeStyle = "#ffffff";
      g.lineWidth = Math.max(2, n.r * 0.5 * (1 - t));
      g.beginPath(); g.arc(n.hx, n.hy, ring, 0, Math.PI * 2); g.stroke();
      if (t < 0.25) {
        g.globalAlpha = (0.25 - t) * 3;
        const gr = g.createRadialGradient(n.hx, n.hy, 0, n.hx, n.hy, n.r * 6);
        gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.4, n.color); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.beginPath(); g.arc(n.hx, n.hy, n.r * 6, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
    // The coins fly out, big and spinning, and land where they will be eaten.
    if (!this.flights.size) return;
    const coins = this.coinSprites();
    for (const [id, c] of this.flights) {
      const k = (now - c.at - c.delay) / FLIGHT_MS;
      if (k >= 1) { this.flights.delete(id); continue; }
      if (k < 0) continue;
      const e = 1 - (1 - k) * (1 - k);
      const x = c.fx + (c.tx - c.fx) * e, y = c.fy + (c.ty - c.fy) * e - Math.sin(k * Math.PI) * 120;
      const size = orbRadius(c.v) * 3 * (1.8 - 0.8 * k);
      g.globalAlpha = 1;
      // The same rule as on the map: a SOL coin only when it carries SOL, otherwise a plain glowing orb.
      if (c.c === "SOL") g.drawImage(coins[coinIndexOf("SOL") ?? 0], x - size, y - size, size * 2, size * 2);
      else g.drawImage(this.orbSprites()[3], x - size, y - size, size * 2, size * 2);
    }
  }

  /** An orb still flying out of a supernova is drawn by novaLayer, not at its spot yet. */
  isFlying(id: number): boolean { return this.flights.has(id); }

  noteDeath(x: number, y: number, r: number, colorIdx: number, now: number): void {
    const d = this.dizzy;
    const slot = d.length < 10 ? d.push({ x, y, r, c: colorIdx, at: now }) - 1 : d.reduce((m, e, i) => (e.at < d[m].at ? i : m), 0);
    d[slot] = { x, y, r, c: colorIdx, at: now };
  }

  styleFor(p: { w: string; role: string }): Style {
    const own = p.w === this.curYou && this.ownHue !== null && p.role !== "saboteur";
    const skinId = p.role === "saboteur" ? null : p.w === this.curYou && this.ownSkin ? this.ownSkin : this.skins[p.w] ?? null;
    // A goshi color chosen by another player (told by the server as "hue:N"), so everybody, and the VAR, see it as its owner does.
    const hueOf = skinId && /^hue:[0-7]$/.test(skinId) ? GOSHI_HUES[Number(skinId.slice(4))] ?? null : null;
    const skin = hueOf === null ? skinById(skinId) : undefined;
    const key = p.role === "saboteur" ? `s:${p.w}` : skin ? `k:${skin.id}` : own ? `me:${this.ownHue}` : hueOf !== null ? `h:${hueOf}` : p.w;
    let s = this.styles.get(key);
    if (s) return s;
    if (skin) {
      s = { idx: 0, ...skin.style };
    } else if (own || hueOf !== null) {
      const h = own ? (this.ownHue as number) : (hueOf as number);
      s = {
        idx: 0, body: `hsl(${h} 92% 58%)`, glowA: `hsla(${h} 100% 62% / 0.10)`, glowB: `hsla(${h} 100% 62% / 0.24)`,
        head: `hsl(${h} 100% 90%)`, rim: `hsl(${h} 100% 75%)`,
      };
    } else if (p.role === "saboteur") {
      s = { idx: 0, body: SABOTEUR_BODY, glowA: "rgba(255,122,74,0.10)", glowB: "rgba(255,122,74,0.24)", head: "#ffcfb8", rim: SABOTEUR_COLOR };
    } else {
      const h = hueFor(p.w);
      s = {
        idx: 0, body: `hsl(${h} 92% 58%)`, glowA: `hsla(${h} 100% 62% / 0.10)`, glowB: `hsla(${h} 100% 62% / 0.24)`,
        head: `hsl(${h} 100% 90%)`, rim: `hsl(${h} 100% 75%)`,
      };
    }
    s.idx = this.palette.length < 250 ? this.palette.push(s.rim) - 1 : 4;
    this.styles.set(key, s);
    return s;
  }

  /** Color index for effects of a snake (burst bits, sparkles). */
  effectColor(p: { w: string; role: string }): number {
    return this.styleFor(p).idx;
  }

  private coins: HTMLCanvasElement[] | null = null;
  /**
   * The edible coins of the arena: crypto bubbles with their ticker. Small ones are memes and small caps, medium ones are
   * the big chains, the richest are BTC and ETH. The color is the coin's usual color and has nothing to do with price moves.
   */
  private coinSprites(): HTMLCanvasElement[] {
    if (this.coins) return this.coins;
    this.coins = COINS.map(([ticker, a]) => {
      const c = makeCanvas(SPRITE, SPRITE);
      const g = c.getContext("2d");
      if (g) {
        const h = SPRITE / 2;
        const halo = g.createRadialGradient(h, h, 0, h, h, h);
        halo.addColorStop(0, `${a}bb`);
        halo.addColorStop(0.45, `${a}44`);
        halo.addColorStop(1, `${a}00`);
        g.fillStyle = halo;
        g.fillRect(0, 0, SPRITE, SPRITE);
        const R = SPRITE * 0.22;
        if (ticker === "SOL") {
          // The real Solana mark, no letters: three slanted bars in the green to purple gradient on a black coin.
          g.fillStyle = "#0b0b14"; g.beginPath(); g.arc(h, h, R, 0, Math.PI * 2); g.fill();
          g.lineWidth = 1.4; g.strokeStyle = "rgba(255,255,255,0.75)"; g.stroke();
          const gr = g.createLinearGradient(h - R * 0.6, h + R * 0.5, h + R * 0.6, h - R * 0.5);
          gr.addColorStop(0, "#14f195"); gr.addColorStop(0.5, "#80ecff"); gr.addColorStop(1, "#9945ff");
          g.fillStyle = gr;
          const bar = (pts: [number, number][]) => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(h + x * R, h + y * R) : g.moveTo(h + x * R, h + y * R))); g.closePath(); g.fill(); };
          bar([[-0.38, -0.46], [0.6, -0.46], [0.4, -0.27], [-0.58, -0.27]]);
          bar([[-0.58, -0.1], [0.4, -0.1], [0.6, 0.09], [-0.38, 0.09]]);
          bar([[-0.38, 0.27], [0.6, 0.27], [0.4, 0.46], [-0.58, 0.46]]);
          return c;
        }
        const disc = g.createRadialGradient(h - R * 0.3, h - R * 0.4, R * 0.1, h, h, R);
        disc.addColorStop(0, "#ffffff55");
        disc.addColorStop(0.35, a);
        disc.addColorStop(1, "#00000066");
        g.fillStyle = a;
        g.beginPath();
        g.arc(h, h, R, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = disc;
        g.fill();
        g.lineWidth = 1.6;
        g.strokeStyle = "rgba(255,255,255,0.9)";
        g.stroke();
        g.fillStyle = "#ffffff";
        const px = Math.round(Math.min(R * 0.95, (R * 2 * 0.86) / Math.max(2.2, ticker.length * 0.62)));
        g.font = `800 ${px}px system-ui, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineJoin = "round";
        g.strokeStyle = "rgba(0,0,0,0.55)";
        g.lineWidth = 2;
        g.strokeText(ticker, h, h + 0.5);
        g.fillText(ticker, h, h + 0.5);
      }
      return c;
    });
    return this.coins;
  }

  private orbSprites(): HTMLCanvasElement[] {
    if (this.sprites) return this.sprites;
    this.sprites = TIER_COLOR.map((color) => {
      const c = makeCanvas(SPRITE, SPRITE);
      const g = c.getContext("2d");
      if (g) {
        const h = SPRITE / 2;
        const grad = g.createRadialGradient(h, h, 0, h, h, h);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.16, color);
        grad.addColorStop(0.32, color);
        grad.addColorStop(0.55, `${color}55`);
        grad.addColorStop(1, `${color}00`);
        g.fillStyle = grad;
        g.fillRect(0, 0, SPRITE, SPRITE);
      }
      return c;
    });
    return this.sprites;
  }

  private font(px: number): string {
    const k = Math.round(px);
    let f = this.fonts.get(k);
    if (!f) { f = `800 ${k}px system-ui, sans-serif`; this.fonts.set(k, f); }
    return f;
  }

  /** The ping, always in view at the top center: green when good, yellow when so so, red when high. */
  private pingLabel(f: Frame): void {
    const { g, W } = f;
    const dpr = f.ui;
    const ms = Math.round(f.pingMs!);
    const text = `${ms} ms`;
    g.font = this.font(12 * dpr);
    g.textAlign = "center";
    g.textBaseline = "top";
    const w = g.measureText(text).width + 14 * dpr;
    g.fillStyle = "rgba(5,8,25,0.6)";
    roundRect(g, W / 2 - w / 2, 6 * dpr, w, 20 * dpr, 8 * dpr);
    g.fill();
    g.fillStyle = ms <= 80 ? "#7dffb0" : ms <= 160 ? "#ffd35c" : "#ff7b7b";
    g.fillText(text, W / 2, 9 * dpr);
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
  }

  // ------------------------------------------------------------------ traps

  /** Lasers are a red beam that flickers in its last second; puddles a blue disc with a soft rim. Your own are drawn fainter. */
  private trapLayer(f: Frame): void {
    const g = f.g;
    for (const t of f.traps!) {
      const mine = t.o === f.you;
      const fading = t.s < 1 && !f.reduced ? 0.5 + 0.5 * Math.sin(f.now / 40) : 1;
      if (t.k === 1) {
        g.strokeStyle = `rgba(255, 60, 80, ${(mine ? 0.45 : 0.95) * fading})`;
        g.lineWidth = 7 / f.scale + 4;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(t.x, t.y);
        g.lineTo(t.x2, t.y2);
        g.stroke();
        g.strokeStyle = `rgba(255, 220, 230, ${(mine ? 0.4 : 0.9) * fading})`;
        g.lineWidth = 2 / f.scale + 1.5;
        g.stroke();
      } else {
        g.fillStyle = `rgba(70, 150, 255, ${(mine ? 0.12 : 0.22) * fading})`;
        g.strokeStyle = `rgba(120, 190, 255, ${(mine ? 0.35 : 0.7) * fading})`;
        g.lineWidth = 3 / f.scale;
        g.beginPath();
        g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
  }

  // ------------------------------------------------------------------ the frame

  frame(f: Frame): void {
    const { g, W, H, dpr, scale, now } = f;
    this.curYou = f.you;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = "#070b22";
    g.fillRect(0, 0, W, H);
    g.setTransform(scale, 0, 0, scale, W / 2 - f.cam.x * scale + f.shake[0], H / 2 - f.cam.y * scale + f.shake[1]);

    const left = f.cam.x - W / 2 / scale;
    const right = f.cam.x + W / 2 / scale;
    const top = f.cam.y - H / 2 / scale;
    const bottom = f.cam.y + H / 2 / scale;

    this.floor(f, left, right, top, bottom);
    this.orbLayer(f, left, right, top, bottom);
    this.novaLayer(f);
    if (f.traps && f.traps.length) this.trapLayer(f);

    // Players: light ones first so heavy ones are on top.
    const order = this.order;
    order.length = 0;
    for (let i = 0; i < f.players.length; i++) if (f.players[i].alive) order.push(f.players[i]);
    order.sort(byMass);
    for (let i = 0; i < order.length; i++) this.snake(f, order[i], left, right, top, bottom);
    // Weak points: a body five times lighter than yours can lose its tail to you (its last quarter): it glows gold.
    if (f.massUsd && f.meAlive && f.myMass > 0) {
      const pulse = f.reduced ? 1 : 0.55 + 0.45 * Math.sin(f.now / 160);
      g.save();
      g.lineCap = "round"; g.lineJoin = "round";
      for (const p of order) {
        if (p.w === f.you || p.m * 5 > f.myMass || p.body.length < 4) continue;
        const from = Math.floor(p.body.length * 0.75);
        g.strokeStyle = `rgba(255, 211, 92, ${0.75 * pulse})`;
        g.lineWidth = p.r * 2.4;
        g.setLineDash([p.r * 1.2, p.r * 0.8]);
        g.beginPath();
        for (let i = from; i < p.body.length; i++) (i === from ? g.moveTo(p.body[i][0], p.body[i][1]) : g.lineTo(p.body[i][0], p.body[i][1]));
        g.stroke();
      }
      g.setLineDash(NO_DASH);
      g.restore();
    }

    if (this.quality.particles) this.fx.draw(g, this.palette, scale, left, right, top, bottom);
    this.dizzyLayer(f);
    this.zoneLayer(f, left, right, top, bottom);
    this.labelPass(f, order, left, right, top, bottom);
    this.floatLayer(f);

    // Head to head: the ring of the head that the touch favors (the heavier one) is green, the ring of the one it eliminates is
    // red (both red when the masses are equal). Danger: your head is close to a body, or to a head that would eliminate you.
    let danger = 0;
    let chance = 0;
    let me: PlayerSnap | null = null;
    for (let i = 0; i < order.length; i++) if (order[i].w === f.you) { me = order[i]; break; }
    if (f.meAlive && me) danger = dangerAmong(me.head, me.r, order, f.you, me.prot, me.m);
    if (order.length > 1) {
      const pulse = f.reduced ? 1 : 0.65 + 0.35 * Math.sin(now / 90);
      g.lineWidth = 5 / scale;
      for (const pair of headOnPairs(order)) {
        for (const w of [pair.a, pair.b]) {
          const s = order.find((p) => p.w === w);
          if (!s) continue;
          const wins = pair.winner === w;
          // Your own ring is red while anything can eliminate you (below); the other heads follow the rule.
          if (w === f.you && danger > 0) continue;
          const rgb = wins ? "70, 255, 140" : "255, 70, 70";
          g.strokeStyle = `rgba(${rgb}, ${(0.4 + 0.6 * pair.level) * pulse})`;
          g.beginPath();
          g.arc(s.head[0], s.head[1], s.r * 1.9, 0, Math.PI * 2);
          if (!wins) { g.fillStyle = `rgba(${rgb}, ${0.2 * pair.level})`; g.fill(); }
          g.stroke();
          if (w === f.you && wins && pair.level > chance) chance = pair.level;
        }
      }
    }
    if (f.meAlive && me && danger > 0) {
      const pulse = f.reduced ? 1 : 0.65 + 0.35 * Math.sin(now / 90);
      g.strokeStyle = `rgba(255, 70, 70, ${(0.35 + 0.65 * danger) * pulse})`;
      g.lineWidth = 3.5 / scale;
      g.beginPath();
      g.arc(me.head[0], me.head[1], me.r * 1.9, 0, Math.PI * 2);
      g.stroke();
    }

    // Screen space.
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (f.pingMs !== undefined) this.pingLabel(f);
    if (f.meAlive && me) {
      if (this.youSince === 0 && me.prot) this.youSince = now;
      if (this.youSince > 0) {
        const sxm = (me.head[0] - f.cam.x) * scale + W / 2 + f.shake[0];
        const sym = (me.head[1] - f.cam.y) * scale + H / 2 + f.shake[1];
        drawYouMarker(g, sxm, sym, me.r * scale, (now - this.youSince) / 1000, dpr);
      }
    }
    if (this.quality.vignette) this.vignetteLayer(g, W, H);
    if (danger > 0) {
      let d = this.dangerGrad;
      if (!d || d.w !== W || d.h !== H) {
        const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
        grad.addColorStop(0, "rgba(255,40,40,0)");
        grad.addColorStop(1, "rgba(255,40,40,0.5)");
        d = this.dangerGrad = { w: W, h: H, grad };
      }
      g.globalAlpha = danger;
      g.fillStyle = d.grad;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (chance > 0) {
      let d = this.chanceGrad;
      if (!d || d.w !== W || d.h !== H) {
        const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
        grad.addColorStop(0, "rgba(40,255,120,0)");
        grad.addColorStop(1, "rgba(40,255,120,0.38)");
        d = this.chanceGrad = { w: W, h: H, grad };
      }
      g.globalAlpha = chance;
      g.fillStyle = d.grad;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    const out = f.meAlive && me !== null && me.zout;
    if (out) {
      // Outside the safe zone: red edges that pulse (steady when motion is reduced).
      let o = this.outGrad;
      if (!o || o.w !== W || o.h !== H) {
        const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
        grad.addColorStop(0, "rgba(255,30,50,0)");
        grad.addColorStop(1, "rgba(255,30,50,0.75)");
        o = this.outGrad = { w: W, h: H, grad };
      }
      g.globalAlpha = f.reduced ? 0.6 : 0.45 + 0.35 * Math.sin(f.now / 170);
      g.fillStyle = o.grad;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (f.meAlive && me) {
      const guide = zoneGuide(me.head, f.zone);
      if (guide.outside || out) this.zoneArrow(f, guide.angle, guide.overBy, out);
      if (me.prot && f.protectLeft > 0) {
        g.font = this.font(26 * dpr);
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineJoin = "round";
        g.lineWidth = 5 * dpr;
        g.strokeStyle = "rgba(5,8,25,0.9)";
        g.fillStyle = "#9fe8ff";
        const text = f.strings.protectedHint.replace("{s}", String(f.protectLeft));
        g.strokeText(text, W / 2, H * 0.16);
        g.fillText(text, W / 2, H * 0.16);
      }
      this.nitro(f);
    }
    if (!f.bare) {
      this.minimap(f, order);
      // Extras: a failure in one of them must never take the whole picture with it.
      try { this.board(f, order); } catch { /* the board is optional */ }
      try { this.leaderMark(f, order); } catch { /* so is the leader mark */ }
      try { this.leadStrip(f, order); } catch { /* and the lead strip */ }
    }

    if (!f.hasState) {
      g.fillStyle = "#ffffff";
      g.font = this.font(H / 12);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(f.strings.countdown, W / 2, H / 2);
    }
  }

  // ------------------------------------------------------------------ layers

  private floor(f: Frame, left: number, right: number, top: number, bottom: number) {
    const { g, scale } = f;
    // The world is round: its floor and its grid live inside the circle of the map, and outside it is only night.
    const ox = f.world.x0 ?? 0, oy = f.world.y0 ?? 0;
    const cx = ox + f.world.w / 2, cy = oy + f.world.h / 2, r = Math.max(f.world.w, f.world.h) / 2;
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = "#0d1436";
    g.fill();
    g.clip();
    g.strokeStyle = "rgba(120,150,255,0.09)";
    g.lineWidth = 1 / scale;
    g.beginPath();
    const x1 = Math.min(cx + r, right), y1 = Math.min(cy + r, bottom);
    const x0 = Math.max(cx - r, left), y0 = Math.max(cy - r, top);
    for (let x = Math.floor(x0 / 100) * 100; x <= x1; x += 100) { g.moveTo(x, y0); g.lineTo(x, y1); }
    for (let y = Math.floor(y0 / 100) * 100; y <= y1; y += 100) { g.moveTo(x0, y); g.lineTo(x1, y); }
    g.stroke();
    g.restore();
    // Survival: the edge is the circle of the map (drawn with the zone).
    if (f.world.x0 !== undefined) return;
    // The edge of the world: a soft round glow.
    g.strokeStyle = "rgba(255,70,80,0.18)";
    g.lineWidth = 16 / scale;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }

  private orbLayer(f: Frame, left: number, right: number, top: number, bottom: number) {
    const { g, scale, now } = f;
    const sprites = this.orbSprites();
    const coins = this.coinSprites();
    const sol = coinIndexOf("SOL") ?? 0;
    const minR = 2 / scale;
    for (const o of f.orbs.values()) {
      if (this.flights.size && this.flights.has(o.id)) continue;
      const tier: OrbTier = orbTier(o.v, o.loot === true);
      const r = Math.max(orbRadius(o.v) * TIER_SCALE[tier], minR);
      const half = r * 3;
      if (o.x < left - half || o.x > right + half || o.y < top - half || o.y > bottom + half) continue;
      const k = f.reduced ? 1 : orbPulse(now, o.id);
      const h = half * k;
      // One rule on every site: a SOL coin only when the orb really carries SOL (a room paid by bag, the cash arena); everything
      // else is points (mass) and is drawn as a plain glowing orb, with no crypto logo, so nothing looks like money that is not.
      if (o.c === "SOL" || ALL_SOL) {
        if (o.loot === true) g.drawImage(sprites[tier], o.x - h, o.y - h, h * 2, h * 2);
        g.drawImage(coins[sol], o.x - h, o.y - h, h * 2, h * 2);
      } else {
        g.drawImage(sprites[tier], o.x - h, o.y - h, h * 2, h * 2);
      }
      // A big orb you are still too small to eat: a red ring, so it never looks like a bug.
      if (o.t && f.meAlive && f.myMass < BIG_ORB_MASS[o.t]) {
        g.strokeStyle = "rgba(255,80,80,0.85)"; g.lineWidth = 2 / scale;
        g.beginPath(); g.arc(o.x, o.y, h * 0.55, 0, Math.PI * 2); g.stroke();
      }
    }
  }

  /** Little legs under the body by the head and a wagging tail at the body's end, so the animal meme skins don't look like floating heads. */
  private appendages(g: CanvasRenderingContext2D, art: string, hx: number, hy: number, hr: number, heading: number, now: number, speed: number, scale: number, bodyR: number, body: readonly [number, number][]) {
    // Pepe's face is drawn from the front with its own eyes and lips: legs and arms floated over it, so it has none.
    if (art === "pepe") return;
    const walk = Math.min(1, speed / 300);
    const step = (now / 120) * (0.5 + walk);
    const minW = 1.5 / scale;
    const fx = Math.cos(heading), fy = Math.sin(heading);
    const sx = -fy, sy = fx;
    // Legs tuck under the body just behind the head (outside the head circle), straddling the body edge.
    const paw = (cx: number, cy: number, fill: string) => {
      g.fillStyle = fill;
      g.beginPath();
      g.ellipse(cx, cy, Math.max(minW, bodyR * 0.36), Math.max(minW, bodyR * 0.27), heading, 0, Math.PI * 2);
      g.fill();
    };
    // The legs grow from the body, not from the head: a front pair at about a fifth of its length and a back pair further
    // down, on both sides of the body where it curves, stepping with the gait.
    const leg = (dist: number, side: number, off: number, fill: string) => {
      const s = Math.sin(step + off);
      const lift = Math.max(0, s) * bodyR * 0.22 * (0.25 + walk);
      const swing = s * bodyR * 0.28 * walk;
      const n = body.length;
      if (n < 3) return;
      const k = Math.min(n - 2, Math.max(1, Math.floor(n * (dist < hr ? 0.18 : 0.4))));
      const ax = body[k - 1][0], ay = body[k - 1][1], bx = body[k + 1][0], by = body[k + 1][1];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const dx = (ax - bx) / len, dy = (ay - by) / len; // toward the head
      const qx = body[k][0] + dx * swing - dy * side * (bodyR * 0.95 - lift), qy = body[k][1] + dy * swing + dx * side * (bodyR * 0.95 - lift);
      g.fillStyle = fill;
      g.beginPath();
      g.ellipse(qx, qy, Math.max(minW, bodyR * 0.4), Math.max(minW, bodyR * 0.28), Math.atan2(dy, dx), 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(3,5,18,0.35)"; g.lineWidth = Math.max(minW * 0.5, bodyR * 0.06); g.stroke();
    };
    switch (art) {
      case "fox":
      case "shiba":
      case "doge":
      case "bonk":
      case "panda":
      case "wif": {
        const cream = art === "fox" ? "#ffe8d0" : art === "shiba" ? "#fff3dc" : art === "bonk" ? "#ffe3b0" : art === "wif" ? "#f0d8b8" : art === "panda" ? "#1c1c20" : "#f7e3c0";
        // Two pairs with a diagonal gait: front-left steps with back-right.
        leg(hr * 0.75, -1, 0, cream);
        leg(hr * 1.6, 1, 0, cream);
        leg(hr * 0.75, 1, Math.PI, cream);
        leg(hr * 1.6, -1, Math.PI, cream);
        break;
      }
      case "popcat":
        // Cats: front paws only, with a hint of toe beans.
        leg(hr * 1.1, -1, 0, "#fff1f1");
        leg(hr * 1.1, 1, Math.PI, "#fff1f1");
        g.fillStyle = "#e88aa0";
        for (const side of [-1, 1]) {
          g.beginPath();
          g.arc(hx - fx * hr * 1.1 + sx * side * bodyR * 0.8, hy - fy * hr * 1.1 + sy * side * bodyR * 0.8, Math.max(minW, bodyR * 0.09), 0, Math.PI * 2);
          g.fill();
        }
        break;
      case "pepe":
        // Frog legs along the body, green with a darker rim.
        leg(hr * 0.75, -1, 0, "#7fcf4c");
        leg(hr * 1.6, 1, 0, "#6fbf3c");
        leg(hr * 0.75, 1, Math.PI, "#7fcf4c");
        leg(hr * 1.6, -1, Math.PI, "#6fbf3c");
        break;
      case "whale":
        // Pectoral fins with a soft swim sweep.
        for (const side of [-1, 1]) {
          const sweep = Math.sin(step) * 0.12 * (0.3 + walk);
          const bx = hx - fx * hr * 0.9 + sx * side * bodyR * 0.7;
          const by = hy - fy * hr * 0.9 + sy * side * bodyR * 0.7;
          g.fillStyle = "#5b8fd9";
          g.beginPath();
          g.moveTo(bx, by);
          g.quadraticCurveTo(bx + sx * side * bodyR * (1.3 + sweep) - fx * bodyR * 0.4, by + sy * side * bodyR * (1.3 + sweep) - fy * bodyR * 0.4, bx + sx * side * bodyR * (0.6 + sweep) - fx * bodyR * 0.9, by + sy * side * bodyR * (0.6 + sweep) - fy * bodyR * 0.9);
          g.closePath();
          g.fill();
        }
        break;
    }

    const end = body.length ? body[body.length - 1] : null;
    if (!end) return;
    const prevPt = body.length > 1 ? body[body.length - 2] : ([hx, hy] as [number, number]);
    const tailAng = Math.atan2(end[1] - prevPt[1], end[0] - prevPt[0]);
    if (art === "whale") {
      // Horizontal flukes at the body's end, a slow heavy wag.
      const wag = Math.sin(now / 260) * 0.3;
      const ca = Math.cos(tailAng), sa = Math.sin(tailAng);
      for (const side of [-1, 1]) {
        g.save();
        g.translate(end[0] + ca * bodyR * 0.4 - sa * side * bodyR * 0.1, end[1] + sa * bodyR * 0.4 + ca * side * bodyR * 0.1);
        g.rotate(tailAng + side * (0.85 + wag));
        g.fillStyle = "#5b8fd9";
        g.beginPath();
        g.ellipse(bodyR * 0.75, 0, bodyR * 0.8, bodyR * 0.38, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#3d6cb8";
        g.lineWidth = Math.max(minW, bodyR * 0.1);
        g.stroke();
        g.restore();
      }
      return;
    }
    const tail: Record<string, { len: number; c1: string; c2: string; curl: number }> = {
      fox: { len: 2.8, c1: "#d97b2f", c2: "#fff3e0", curl: 0.3 },
      shiba: { len: 2.0, c1: "#e89a3c", c2: "#f7c877", curl: 0.8 },
      doge: { len: 1.6, c1: "#d9b878", c2: "#f3e1b0", curl: 0.35 },
      bonk: { len: 2.0, c1: "#e8921c", c2: "#ffc34a", curl: 0.5 },
      wif: { len: 1.8, c1: "#d9b090", c2: "#e9c9a0", curl: 0.35 },
      popcat: { len: 2.6, c1: "#ffd0dc", c2: "#fff1f1", curl: 0.55 },
      panda: { len: 0.9, c1: "#f4f4f6", c2: "#ffffff", curl: 0.2 },
    };
    const t = tail[art];
    if (!t) return;
    // A tapered wagging trail, starting under the body end so it grows out of it, curling up at the base.
    const wag = Math.sin(now / 200) * (0.25 + walk * 0.6);
    const segs = 5;
    let a = tailAng;
    let px = end[0] - Math.cos(tailAng) * bodyR * 0.6;
    let py = end[1] - Math.sin(tailAng) * bodyR * 0.6;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let i = 0; i < segs; i++) {
      const k = i / segs;
      a += wag / segs + (t.curl / segs) * (i === 0 ? 1 : 0.4);
      const segLen = (t.len * bodyR) / segs;
      const nx = px + Math.cos(a) * segLen;
      const ny = py + Math.sin(a) * segLen;
      g.strokeStyle = k > 0.6 ? t.c2 : t.c1;
      g.lineWidth = Math.max(minW, bodyR * 1.7 * (1 - k * 0.8));
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(nx, ny);
      g.stroke();
      px = nx;
      py = ny;
    }
  }

  /** The beads of a meme body, from the tail to the neck so the ones near the head lie on top. */
  private beads(g: CanvasRenderingContext2D, head: readonly [number, number], body: readonly (readonly [number, number])[], r: number, st: { body: string; rim: string; alt?: string; art?: string }, now: number, scale: number) {
    const step = r * 0.9;
    const xs: number[] = [], ys: number[] = [];
    let px = head[0], py = head[1], carry = step;
    for (let i = 0; i < body.length; i++) {
      const qx = body[i][0], qy = body[i][1];
      const d = Math.hypot(qx - px, qy - py);
      let t = carry;
      while (t <= d) { xs.push(px + ((qx - px) * t) / d); ys.push(py + ((qy - py) * t) / d); t += step; }
      carry = t - d;
      px = qx; py = qy;
    }
    // The very end of the tail gets its own bead, so the body never shows a bare stroke there.
    if (body.length) { xs.push(px); ys.push(py); }
    const frog = st.art === "pepe";
    const rim = Math.max(1 / scale, r * 0.07);
    for (let i = xs.length - 1; i >= 0; i--) {
      const x = xs[i], y = ys[i];
      // The ripple: each bead swells a little in turn, running from the head to the tail.
      const rr = r * (1.02 + 0.06 * Math.sin(now / 160 - i * 0.55));
      const banded = !frog && st.alt && Math.floor(i / 2) % 2 === 1;
      const gr = g.createRadialGradient(x - rr * 0.35, y - rr * 0.4, rr * 0.1, x, y, rr);
      if (st.art === "panda") {
        // Pure white and pure black beads, only a soft edge so they keep their volume.
        gr.addColorStop(0, banded ? "#4a4a52" : "#ffffff");
        gr.addColorStop(0.6, banded ? "#111114" : "#ffffff");
        gr.addColorStop(1, banded ? "#000000" : "#d4d7df");
      } else {
        gr.addColorStop(0, frog ? "#c8f08c" : st.rim);
        gr.addColorStop(0.55, banded ? st.alt! : st.body);
        gr.addColorStop(1, frog ? "#2f6a18" : "rgba(0,0,0,0.55)");
      }
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(3,5,18,0.35)"; g.lineWidth = rim; g.stroke();
      if (frog && i % 3 === 1) {
        // Frog spots, darker green, off the middle line.
        g.fillStyle = "rgba(40,90,20,0.7)";
        g.beginPath(); g.arc(x + rr * 0.25, y + rr * 0.2 * (i % 2 ? 1 : -1), rr * 0.26, 0, Math.PI * 2); g.fill();
      }
    }
  }

  /** A small still of one skin (a short beaded body, its legs and its head), for the skin picker. */
  preview(g: CanvasRenderingContext2D, style: SkinStyle, x: number, y: number, r: number, now = 0): void {
    g.save();
    g.lineCap = "round";
    const body: [number, number][] = [[x - r * 1.4, y + r * 0.25], [x - r * 2.6, y + r * 0.5], [x - r * 3.6, y + r * 0.55]];
    this.beads(g, [x, y], body, r, style, now, 2 / r);
    g.fillStyle = style.head;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(3,5,18,0.7)"; g.lineWidth = Math.max(1, r * 0.1); g.stroke();
    if (style.art) {
      try { this.appendages(g, style.art, x, y, r, 0, now, 90, 2 / r, r * 0.68, body); } catch { /* optional */ }
      try { this.memeHead(g, style.art, x, y, r, 0, { happy: false, boost: false, now, px: r * 2 }); } catch { /* the head fill alone still shows the color */ }
    } else {
      this.face(g, x, y, r, 0, 0, "normal", 1);
    }
    g.restore();
  }

  /**
   * Meme heads drawn in the head circle, facing along the heading (forward is +x after the rotation). Shaded with
   * gradients when the head is big enough; `state` carries the mood, whether the player is boosting and the clock.
   */
  private memeHead(g: CanvasRenderingContext2D, art: string, hx: number, hy: number, r: number, heading: number, state: { happy: boolean; boost: boolean; now: number; px: number; fired?: boolean }) {
    const { happy, boost, now } = state;
    const fired = state.fired === true;
    g.save();
    g.translate(hx, hy);
    g.rotate(heading);
    const rich = state.px >= 18; // below this the head is small on screen: flat fills read better than gradients
    const disc = (x: number, y: number, rad: number, fill: string) => { g.fillStyle = fill; g.beginPath(); g.arc(x * r, y * r, rad * r, 0, Math.PI * 2); g.fill(); };
    const ball = (x: number, y: number, rad: number, hi: string, lo: string) => {
      g.beginPath(); g.arc(x * r, y * r, rad * r, 0, Math.PI * 2);
      if (rich) {
        const gr = g.createRadialGradient((x - rad * 0.35) * r, (y - rad * 0.4) * r, rad * r * 0.15, x * r, y * r, rad * r);
        gr.addColorStop(0, hi); gr.addColorStop(1, lo);
        g.fillStyle = gr;
      } else g.fillStyle = hi;
      g.fill();
    };
    const ring = (x: number, y: number, rad: number, color: string, w: number) => { g.strokeStyle = color; g.lineWidth = r * w; g.beginPath(); g.arc(x * r, y * r, rad * r, 0, Math.PI * 2); g.stroke(); };
    const tri = (pts: [number, number][], fill: string) => { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * r, y * r) : g.moveTo(x * r, y * r))); g.closePath(); g.fill(); };
    const ell = (x: number, y: number, rx: number, ry: number, rot: number, hi: string, lo: string) => {
      g.beginPath(); g.ellipse(x * r, y * r, rx * r, ry * r, rot, 0, Math.PI * 2);
      if (rich) {
        const gr = g.createLinearGradient((x - rx) * r, (y - ry) * r, (x + rx) * r, (y + ry) * r);
        gr.addColorStop(0, hi); gr.addColorStop(1, lo);
        g.fillStyle = gr;
      } else g.fillStyle = hi;
      g.fill();
    };
    const eye = (x: number, y: number, big = 0.2) => {
      disc(x, y, big, "#ffffff");
      ring(x, y, big, "rgba(16,20,46,0.45)", 0.045);
      disc(x + 0.06, y, big * 0.5, "#10142e");
      disc(x + big * 0.6, y - big * 0.3, big * 0.17, "#ffffff");
    };
    const xEye = (x: number, y: number, k: number, color: string) => { g.strokeStyle = color; g.lineWidth = r * k; g.lineCap = "round"; g.beginPath(); g.moveTo((x - k * 1.4) * r, (y - k * 1.4) * r); g.lineTo((x + k * 1.4) * r, (y + k * 1.4) * r); g.moveTo((x + k * 1.4) * r, (y - k * 1.4) * r); g.lineTo((x - k * 1.4) * r, (y + k * 1.4) * r); g.stroke(); };
    const shade = (color: string) => { if (!rich) return; const gr = g.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, color); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); };
    const sparkle = (x: number, y: number, s: number, alpha: number) => {
      g.fillStyle = `rgba(255,255,255,${alpha})`;
      tri([[x, y - s], [x + s * 0.28, y - s * 0.28], [x + s, y], [x + s * 0.28, y + s * 0.28], [x, y + s], [x - s * 0.28, y + s * 0.28], [x - s, y], [x - s * 0.28, y - s * 0.28]], `rgba(255,255,255,${alpha})`);
    };
    // A dog face from the front (shiba, doge, bonk, dogwifhat): pointed ears, the head, cream cheeks and muzzle, eyes and nose.
    const dog = (base: string, dark: string, cream: string, inner: string, sideEye = false, hatOn = false) => {
      if (!hatOn) {
        tri([[-0.86, -0.12], [-0.66, -0.98], [-0.18, -0.64]], base);
        tri([[0.86, -0.12], [0.66, -0.98], [0.18, -0.64]], base);
        tri([[-0.72, -0.22], [-0.64, -0.8], [-0.32, -0.6]], inner);
        tri([[0.72, -0.22], [0.64, -0.8], [0.32, -0.6]], inner);
      }
      ball(0, 0.05, 0.9, base, dark);
      ell(-0.34, 0.34, 0.4, 0.32, 0, cream, cream);
      ell(0.34, 0.34, 0.4, 0.32, 0, cream, cream);
      ell(0, 0.42, 0.34, 0.3, 0, cream, cream);
      disc(-0.3, -0.36, 0.06, cream); disc(0.3, -0.36, 0.06, cream);
      for (const side of [-1, 1]) {
        if (sideEye) {
          ell(side * 0.3, -0.14, 0.15, 0.11, 0, "#ffffff", "#e8e0d0");
          disc(side * 0.3 - 0.07, -0.13, 0.07, "#1c120a");
        } else {
          disc(side * 0.3, -0.14, 0.11, "#1c120a");
          if (rich) disc(side * 0.3 - 0.03, -0.18, 0.035, "#ffffff");
        }
      }
      ball(0, 0.24, 0.12, "#2a1a10", "#000000");
      g.strokeStyle = "#5a3a1a"; g.lineWidth = r * 0.05; g.lineCap = "round";
      g.beginPath(); g.moveTo(0, 0.34 * r); g.lineTo(0, 0.44 * r); g.stroke();
      g.beginPath(); g.moveTo(-0.18 * r, (happy ? 0.46 : 0.5) * r); g.quadraticCurveTo(0, (happy ? 0.62 : 0.52) * r, 0.18 * r, (happy ? 0.46 : 0.5) * r); g.stroke();
    };
    const logo = logoOf(art);
    if (logo) {
      g.rotate(-heading);
      g.save();
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.clip();
      g.drawImage(logo, -r, -r, r * 2, r * 2);
      g.restore();
      ring(0, 0, 1, "rgba(3,5,18,0.6)", 0.08);
      // A power used: a quick white flash around the logo (the logos have no face to animate).
      if (fired) ring(0, 0, 1.18, `rgba(255,255,255,${0.5 + 0.4 * Math.sin(now / 60)})`, 0.12);
      g.restore();
      return;
    }
    // Every head is drawn upright and from the front, like a sticker, whatever the heading.
    if (art !== "pepe" && art !== "btc" && art !== "eth" && art !== "sol") g.rotate(-heading);
    // A sticker finish on every drawn head, after its own art: a soft light on the top left, a shade on the bottom right and
    // an ink outline, so they all read as one polished set.
    const finish = () => {
      if (rich) {
        const lg = g.createRadialGradient(-0.35 * r, -0.45 * r, 0, -0.35 * r, -0.45 * r, 0.75 * r);
        lg.addColorStop(0, "rgba(255,255,255,0.28)"); lg.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = lg; g.beginPath(); g.arc(0, 0, 0.95 * r, 0, Math.PI * 2); g.fill();
        const sh = g.createLinearGradient(0, 0, 0.7 * r, 0.9 * r);
        sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, art === "panda" ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.18)");
        g.fillStyle = sh; g.beginPath(); g.arc(0, 0, 0.95 * r, 0, Math.PI * 2); g.fill();
      }
      ring(0, 0.03, 0.93, "rgba(16,12,28,0.75)", 0.07);
    };
    switch (art) {
      case "pepe": {
        // Pepe, upright like a sticker whatever the heading, close to the classic drawing: a bright green face, two big
        // bulging eyes on top with heavy half-closed lids looking to the side, and the thick red lips.
        g.rotate(-heading);
        ball(0, 0.08, 0.95, "#8ee05a", "#3e8a22");
        // The eye domes rise above the head line.
        for (const side of [-1, 1]) ball(side * 0.42, -0.5, 0.46, "#9ae668", "#4c9a2a");
        for (const side of [-1, 1]) {
          const ex = side * 0.42, ey = -0.46;
          ell(ex, ey, 0.38, 0.3, 0, "#ffffff", "#dfe6d6");
          // Pupils to the side (the bored side glance), following the way a little.
          const px = ex + 0.14 + Math.cos(heading) * 0.04, py = ey + 0.06 + Math.sin(heading) * 0.04;
          disc(px, py, 0.13, "#2a1a0c");
          disc(px, py, 0.07, "#0c0806");
          if (rich) disc(px - 0.05, py - 0.05, 0.035, "#ffffff");
          // Heavy lid over the top half, closing now and then.
          const blink = Math.max(0, Math.sin(now / 900 + side * 0.15) - 0.96) * 25;
          const lid = 0.04 + 0.26 * Math.min(1, blink);
          g.fillStyle = "#7fd04c";
          g.beginPath(); g.ellipse(ex * r, ey * r, 0.4 * r, 0.32 * r, 0, Math.PI, Math.PI * 2); g.lineTo((ex + 0.4) * r, (ey + lid) * r); g.lineTo((ex - 0.4) * r, (ey + lid) * r); g.closePath(); g.fill();
          g.strokeStyle = "#2f6a16"; g.lineWidth = r * 0.07; g.lineCap = "round";
          g.beginPath(); g.moveTo((ex - 0.38) * r, (ey + lid) * r); g.lineTo((ex + 0.38) * r, (ey + lid) * r); g.stroke();
          g.lineWidth = r * 0.035;
          g.beginPath(); g.ellipse(ex * r, ey * r, 0.38 * r, 0.3 * r, 0, 0, Math.PI); g.stroke();
        }
        // The thick red lips: an upper and a lower lip with the mouth line between them.
        const smile = happy ? 0.08 : 0;
        ell(0.04, 0.38 + smile * 0.5, 0.62, 0.15, 0, "#ef5a4a", "#b52a22");
        ell(0.04, 0.52 + smile, 0.56, 0.16, 0, "#e04a3c", "#a3201a");
        g.strokeStyle = "#6a0e0a"; g.lineWidth = r * 0.06; g.lineCap = "round";
        g.beginPath(); g.moveTo(-0.56 * r, (0.44 - smile) * r); g.quadraticCurveTo(0.04 * r, (0.48 + smile) * r, 0.64 * r, (0.42 - smile) * r); g.stroke();
        if (rich) { g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.ellipse(-0.14 * r, 0.33 * r, 0.2 * r, 0.045 * r, 0, 0, Math.PI * 2); g.fill(); }
        break;
      }
      case "shiba": {
        // The SHIB dog, from the front: orange face, cream cheeks and muzzle, pointed ears.
        dog("#ef9a3a", "#b9611a", "#fff3dc", "#ffd9a6");
        break;
      }
      case "doge": {
        // Kabosu, the doge: a tan face with a lot of cream, raised brows and the famous side glance.
        dog("#d9a65a", "#a8762e", "#f7e9c6", "#f7e9c6", true);
        break;
      }
      case "bonk": {
        // BONK: the orange dog with the bat over its shoulder, swung when it uses a power.
        const swing = fired ? 0.35 * Math.sin(now / 90) : 0;
        g.save(); g.rotate(-0.7 + swing);
        g.fillStyle = "#8a5a2b"; g.fillRect(-0.09 * r, -1.25 * r, 0.18 * r, 1.4 * r);
        g.fillStyle = "#6e4520"; g.beginPath(); g.ellipse(0, -1.2 * r, 0.16 * r, 0.24 * r, 0, 0, Math.PI * 2); g.fill();
        g.restore();
        dog("#f5a524", "#c27512", "#ffe8b8", "#ffd28a");
        break;
      }
      case "popcat": {
        // POPCAT: a white cat face with pink ears that pops its mouth wide open when it uses a power.
        tri([[-0.85, -0.15], [-0.7, -1.0], [-0.2, -0.68]], "#fbe6ea");
        tri([[0.85, -0.15], [0.7, -1.0], [0.2, -0.68]], "#fbe6ea");
        tri([[-0.74, -0.25], [-0.66, -0.82], [-0.32, -0.62]], "#ff9fb8");
        tri([[0.74, -0.25], [0.66, -0.82], [0.32, -0.62]], "#ff9fb8");
        ball(0, 0.05, 0.9, "#fffafa", "#e6d3d6");
        disc(-0.3, -0.12, 0.08, "#1a1420"); disc(0.3, -0.12, 0.08, "#1a1420");
        disc(0, 0.14, 0.05, "#ff8fa8");
        const pop = fired;
        if (pop) { ball(0, 0.42, 0.3, "#c0405c", "#560e1c"); disc(0, 0.5, 0.14, "#ff7b93"); }
        else { g.strokeStyle = "#5a2a36"; g.lineWidth = r * 0.05; g.lineCap = "round"; g.beginPath(); g.moveTo(-0.14 * r, 0.3 * r); g.quadraticCurveTo(0, 0.38 * r, 0.14 * r, 0.3 * r); g.stroke(); }
        g.strokeStyle = "rgba(90,60,70,0.5)"; g.lineWidth = r * 0.03;
        for (const side of [-1, 1]) for (const k of [-0.06, 0.06]) { g.beginPath(); g.moveTo(side * 0.45 * r, (0.2 + k) * r); g.lineTo(side * 0.95 * r, (0.12 + k * 2) * r); g.stroke(); }
        break;
      }
      case "wif": {
        // dogwifhat: the dog with the pink knitted beanie pulled down over its ears.
        dog("#d2a678", "#9c7346", "#f2e0c4", "#f2e0c4", false, true);
        g.fillStyle = "#ff8fb5";
        g.beginPath(); g.ellipse(0, -0.42 * r, 0.9 * r, 0.62 * r, 0, Math.PI, Math.PI * 2); g.closePath(); g.fill();
        g.strokeStyle = "rgba(190,50,100,0.55)"; g.lineWidth = r * 0.05;
        for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(k * 0.22 * r, -0.44 * r); g.lineTo(k * 0.2 * r, -0.95 * r); g.stroke(); }
        g.fillStyle = "#ff6f9f"; g.fillRect(-0.9 * r, -0.5 * r, 1.8 * r, 0.18 * r);
        break;
      }
      case "btc": {
        // The Bitcoin logo, upright whatever the heading: an orange coin with the white B tilted 14 degrees and its two strokes.
        g.rotate(-heading);
        ball(0, 0, 0.95, "#ffa733", "#d97806");
        ring(0, 0, 0.95, "rgba(255,230,180,0.6)", 0.05);
        g.save();
        g.rotate(0.244);
        g.fillStyle = "#ffffff";
        g.font = `900 ${Math.round(1.25 * r)}px Arial, Helvetica, sans-serif`;
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText("B", 0.02 * r, 0.06 * r);
        const bar = (x: number, y: number) => g.fillRect((x - 0.045) * r, y * r, 0.09 * r, 0.2 * r);
        bar(-0.14, -0.72); bar(0.12, -0.72); bar(-0.14, 0.52); bar(0.12, 0.52);
        g.restore();
        if (boost) {
          const a = now / 240;
          g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = r * 0.12; g.lineCap = "round";
          g.beginPath(); g.arc(0, 0, 0.6 * r, a, a + 0.9); g.stroke();
        }
        break;
      }
      case "eth": {
        // The Ethereum diamond, upright whatever the heading.
        g.rotate(-heading);
        tri([[0, -0.78], [-0.42, -0.08], [0.42, -0.08]], "#ece8ff");
        tri([[0, -0.78], [-0.42, -0.08], [0, 0.02]], "#f7f4ff");
        tri([[-0.42, -0.02], [0, 0.1], [0, 0.78]], "#b0a4f0");
        tri([[0.42, -0.02], [0, 0.1], [0, 0.78]], "#8f83dd");
        tri([[0, 0.16], [-0.42, -0.02], [0, 0.1]], "#cfc6fa");
        g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = r * 0.04;
        g.beginPath(); g.moveTo(0, -0.78 * r); g.lineTo(-0.42 * r, -0.08 * r); g.moveTo(0, -0.78 * r); g.lineTo(0.42 * r, -0.08 * r); g.stroke();
        if (boost) {
          const t = (Math.sin(now / 240) + 1) / 2;
          tri([[0, -0.55 + t * 0.9], [-0.3, -0.05 + t * 0.9], [0.3, -0.05 + t * 0.9]], `rgba(255,255,255,${0.18 + 0.16 * Math.sin(now / 120)})`);
        }
        break;
      }
      case "sol": {
        // The Solana logo, upright whatever the heading: three slanted bars (the middle one the other way) in the official
        // green to purple gradient, on a black coin.
        g.rotate(-heading);
        disc(0, 0, 0.98, "#0b0b14");
        const gr = g.createLinearGradient(-0.6 * r, 0.5 * r, 0.6 * r, -0.5 * r);
        gr.addColorStop(0, "#14f195"); gr.addColorStop(0.5, "#80ecff"); gr.addColorStop(1, "#9945ff");
        g.fillStyle = gr;
        const bar = (pts: [number, number][]) => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x * r, y * r) : g.moveTo(x * r, y * r))); g.closePath(); g.fill(); };
        bar([[-0.38, -0.46], [0.6, -0.46], [0.4, -0.27], [-0.58, -0.27]]);
        bar([[-0.58, -0.1], [0.4, -0.1], [0.6, 0.09], [-0.38, 0.09]]);
        bar([[-0.38, 0.27], [0.6, 0.27], [0.4, 0.46], [-0.58, 0.46]]);
        if (boost) { g.strokeStyle = `rgba(160,255,230,${0.3 + 0.3 * Math.sin(now / 130)})`; g.lineWidth = r * 0.06; g.beginPath(); g.arc(0, 0, 0.9 * r, 0, Math.PI * 2); g.stroke(); }
        break;
      }
      case "laser": {
        // Laser eyes: a golden face whose eyes glow red, and fire two beams when it uses a power.
        ball(0, 0, 0.92, "#ffd968", "#d9a21c");
        const len = fired ? 2.6 : 0;
        for (const side of [-1, 1]) {
          const ex = side * 0.32, ey = -0.12;
          if (len) g.strokeStyle = "rgba(255,50,50,0.35)"; g.lineWidth = r * 0.3; g.lineCap = "round";
          if (len) {
            g.beginPath(); g.moveTo(ex * r, ey * r); g.lineTo((ex + len) * r, (ey - 0.25 * len) * r); g.stroke();
            g.strokeStyle = "#ff2a2a"; g.lineWidth = r * 0.1;
            g.beginPath(); g.moveTo(ex * r, ey * r); g.lineTo((ex + len) * r, (ey - 0.25 * len) * r); g.stroke();
          }
          disc(ex, ey, 0.17, "#ff2a2a"); disc(ex, ey, 0.08, "#fff2f2");
        }
        g.strokeStyle = "#8a5a10"; g.lineWidth = r * 0.07; g.lineCap = "round";
        g.beginPath(); g.moveTo(-0.3 * r, 0.38 * r); g.quadraticCurveTo(0, (happy ? 0.6 : 0.48) * r, 0.3 * r, 0.38 * r); g.stroke();
        break;
      }
      case "whale": {
        // The whale: a big blue face with a pale belly, a smile, and a spout when it boosts or uses a power.
        ball(0, 0, 0.94, "#4a8cf0", "#1f4fa8");
        g.fillStyle = "#cfe6ff"; g.beginPath(); g.ellipse(0, 0.45 * r, 0.7 * r, 0.42 * r, 0, 0, Math.PI); g.fill();
        g.strokeStyle = "rgba(60,110,190,0.6)"; g.lineWidth = r * 0.03;
        for (const k of [0.55, 0.68, 0.8]) { g.beginPath(); g.moveTo(-0.5 * r, k * r); g.lineTo(0.5 * r, k * r); g.stroke(); }
        eye(-0.4, 0.05, 0.13); eye(0.4, 0.05, 0.13);
        g.strokeStyle = "#173c86"; g.lineWidth = r * 0.06; g.lineCap = "round";
        g.beginPath(); g.moveTo(-0.25 * r, 0.3 * r); g.quadraticCurveTo(0, 0.42 * r, 0.25 * r, 0.3 * r); g.stroke();
        if (boost || fired) {
          const h = 0.3 + 0.15 * Math.sin(now / 100);
          g.fillStyle = "rgba(180,225,255,0.85)";
          for (const dx of [-0.18, 0, 0.18]) { g.beginPath(); g.arc(dx * r, (-0.95 - h + Math.abs(dx)) * r, 0.1 * r, 0, Math.PI * 2); g.fill(); }
          g.strokeStyle = "rgba(180,225,255,0.85)"; g.lineWidth = r * 0.08;
          g.beginPath(); g.moveTo(0, -0.85 * r); g.lineTo(0, (-0.9 - h) * r); g.stroke();
        }
        break;
      }
      case "degen": {
        // The degen: a pink face, one huge spinning eye and one small, the tongue out and a drop of sweat.
        ball(0, 0, 0.92, "#ff8fd0", "#c2408c");
        disc(-0.32, -0.12, 0.3, "#ffffff"); ring(-0.32, -0.12, 0.3, "#5a1a40", 0.05);
        g.strokeStyle = "#1a0c14"; g.lineWidth = r * 0.06;
        g.beginPath();
        for (let k = 0; k < 24; k++) { const a = now / 200 + k * 0.5, rr = 0.02 + k * 0.011; const x = (-0.32 + Math.cos(a) * rr) * r, y = (-0.12 + Math.sin(a) * rr) * r; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
        disc(0.34, -0.08, 0.13, "#ffffff"); disc(0.37, -0.06, 0.06, "#1a0c14");
        g.strokeStyle = "#5a1a40"; g.lineWidth = r * 0.06; g.lineCap = "round";
        g.beginPath(); g.moveTo(-0.3 * r, 0.38 * r); g.quadraticCurveTo(0.05 * r, 0.55 * r, 0.35 * r, 0.32 * r); g.stroke();
        ell(0.12, 0.55, 0.12, 0.17, 0, "#ff5a7a", "#c02a4a");
        ell(0.62, -0.5, 0.07, 0.12, 0, "#bfe8ff", "#6ab8ee");
        break;
      }
      case "rugged": {
        // Rugged: a grey face with X eyes, a wobbly frown and a crack.
        ball(0, 0, 0.92, "#b4b9c4", "#6e7480");
        xEye(-0.3, -0.12, 0.09, "#2a2e38"); xEye(0.3, -0.12, 0.09, "#2a2e38");
        g.strokeStyle = "#2a2e38"; g.lineWidth = r * 0.06; g.lineCap = "round";
        g.beginPath(); g.moveTo(-0.32 * r, 0.42 * r);
        for (let k = 1; k <= 6; k++) g.lineTo((-0.32 + k * 0.107) * r, (0.42 - (k % 2 ? 0.07 : 0) - 0.1 * Math.sin((k / 6) * Math.PI)) * r);
        g.stroke();
        g.strokeStyle = "rgba(40,44,56,0.6)"; g.lineWidth = r * 0.035;
        g.beginPath(); g.moveTo(0.35 * r, -0.85 * r); g.lineTo(0.22 * r, -0.6 * r); g.lineTo(0.32 * r, -0.48 * r); g.lineTo(0.18 * r, -0.3 * r); g.stroke();
        break;
      }
      case "panda": {
        // The panda: a round white face, black ears, the black patches around the eyes, a little nose and pink cheeks.
        ball(-0.6, -0.68, 0.28, "#1a1a1e", "#000000");
        ball(0.6, -0.68, 0.28, "#1a1a1e", "#000000");
        ball(0, 0.04, 0.92, "#ffffff", "#eef0f4");
        ell(-0.33, -0.1, 0.24, 0.3, 0.5, "#111114", "#000000");
        ell(0.33, -0.1, 0.24, 0.3, -0.5, "#111114", "#000000");
        for (const side of [-1, 1]) {
          disc(side * 0.31, -0.12, 0.1, "#ffffff");
          disc(side * 0.31 + Math.cos(heading) * 0.03, -0.11 + Math.sin(heading) * 0.03, 0.06, "#101014");
          if (rich) disc(side * 0.31 - 0.03, -0.16, 0.025, "#ffffff");
        }
        ell(0, 0.2, 0.13, 0.09, 0, "#2a2a2e", "#050506");
        g.strokeStyle = "#2a2a2e"; g.lineWidth = r * 0.05; g.lineCap = "round";
        g.beginPath(); g.moveTo(0, 0.28 * r); g.lineTo(0, 0.36 * r); g.stroke();
        g.beginPath(); g.moveTo(-0.14 * r, 0.38 * r); g.quadraticCurveTo(0, (happy ? 0.52 : 0.44) * r, 0.14 * r, 0.38 * r); g.stroke();
        disc(-0.55, 0.28, 0.12, "rgba(255,150,170,0.45)"); disc(0.55, 0.28, 0.12, "rgba(255,150,170,0.45)");
        break;
      }
      case "moonboy": {
        // Moonboy: an astronaut helmet with a dark visor (a moon and stars in its reflection) and two antennae.
        const sway = Math.sin(now / 300) * 0.06;
        for (const [bx, len] of [[-0.3, 0.45], [0.3, 0.38]] as [number, number][]) {
          g.strokeStyle = "#c8ccd8"; g.lineWidth = r * 0.05;
          g.beginPath(); g.moveTo(bx * r, -0.85 * r); g.lineTo((bx + sway) * r, -(0.85 + len) * r); g.stroke();
          disc(bx + sway, -(0.85 + len), 0.08, `rgba(255,220,120,${0.7 + 0.3 * Math.sin(now / 200 + bx * 10)})`);
        }
        ball(0, 0, 0.95, "#f4f6fb", "#b9c0d4");
        ell(0, 0.02, 0.68, 0.56, 0, "#24306a", "#0b1030");
        disc(0.22, -0.16, 0.13, "#f4e7a6"); disc(0.27, -0.2, 0.11, "#1a2250");
        for (const [x, y] of [[-0.35, -0.2], [-0.15, 0.25], [0.35, 0.2]] as [number, number][]) disc(x, y, 0.03, "#ffffff");
        if (rich) { g.fillStyle = "rgba(255,255,255,0.28)"; g.beginPath(); g.ellipse(-0.3 * r, -0.25 * r, 0.22 * r, 0.1 * r, -0.6, 0, Math.PI * 2); g.fill(); }
        break;
      }
      case "fox": {
        // The fox: orange face, white cheeks, black-tipped pointed ears and a small black nose.
        tri([[-0.85, -0.1], [-0.6, -1.08], [-0.15, -0.65]], "#e8661e");
        tri([[0.85, -0.1], [0.6, -1.08], [0.15, -0.65]], "#e8661e");
        tri([[-0.72, -0.82], [-0.6, -1.08], [-0.48, -0.86]], "#2a1a12");
        tri([[0.72, -0.82], [0.6, -1.08], [0.48, -0.86]], "#2a1a12");
        tri([[-0.7, -0.25], [-0.6, -0.85], [-0.3, -0.62]], "#ffd9bf");
        tri([[0.7, -0.25], [0.6, -0.85], [0.3, -0.62]], "#ffd9bf");
        ball(0, 0.05, 0.9, "#f07a2c", "#b04a10");
        tri([[-0.9, 0.05], [0, 0.85], [-0.05, 0.2]], "#fff6ec");
        tri([[0.9, 0.05], [0, 0.85], [0.05, 0.2]], "#fff6ec");
        disc(-0.3, -0.15, 0.1, "#1c120c"); disc(0.3, -0.15, 0.1, "#1c120c");
        if (rich) { disc(-0.27, -0.19, 0.03, "#ffffff"); disc(0.33, -0.19, 0.03, "#ffffff"); }
        ball(0, 0.42, 0.1, "#2a1a12", "#000000");
        break;
      }
    }
    if (art !== "btc" && art !== "eth" && art !== "sol") finish();
    g.restore();
  }

  /** The goshi face on a head: two big eyes looking along the heading, blush, a little mouth. */
  private face(g: CanvasRenderingContext2D, hx: number, hy: number, hr: number, heading: number, blink: number, mood: Mood, scale: number) {
    const fx = Math.cos(heading), fy = Math.sin(heading);
    const sx = -fy, sy = fx;
    const px = hr * scale; // the head's size on screen: small heads get a simpler face
    if (px > 9) {
      g.fillStyle = "rgba(255,120,150,0.55)";
      for (let side = -1; side <= 1; side += 2) {
        g.beginPath();
        g.arc(hx - fx * hr * 0.05 + sx * hr * 0.72 * side, hy - fy * hr * 0.05 + sy * hr * 0.72 * side, hr * 0.16, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let side = -1; side <= 1; side += 2) {
      const ex = hx + fx * hr * 0.25 + sx * hr * 0.42 * side;
      const ey = hy + fy * hr * 0.25 + sy * hr * 0.42 * side;
      if (blink > 0.55 || mood === "happy") {
        // Closed eye (a blink) or a happy squint: a short curved line across the eye.
        g.strokeStyle = "#0b1130";
        g.lineWidth = Math.max(1.2 / scale, hr * 0.1);
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(ex - sx * hr * 0.2 - fx * hr * 0.05, ey - sy * hr * 0.2 - fy * hr * 0.05);
        g.lineTo(ex + fx * hr * (mood === "happy" ? 0.14 : 0), ey + fy * hr * (mood === "happy" ? 0.14 : 0));
        g.lineTo(ex + sx * hr * 0.2 - fx * hr * 0.05, ey + sy * hr * 0.2 - fy * hr * 0.05);
        g.stroke();
        continue;
      }
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(ex, ey, hr * 0.32, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#0b1130";
      g.beginPath();
      g.arc(ex + fx * hr * 0.12, ey + fy * hr * 0.12, hr * 0.17, 0, Math.PI * 2);
      g.fill();
      if (px > 9) {
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.arc(ex + fx * hr * 0.17 - sx * hr * 0.05, ey + fy * hr * 0.17 - sy * hr * 0.05, hr * 0.06, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (px > 9) {
      // The mouth, a little ahead of the eyes.
      const mx = hx + fx * hr * 0.66, my = hy + fy * hr * 0.66;
      g.strokeStyle = "#0b1130";
      g.fillStyle = "#0b1130";
      g.lineWidth = Math.max(1.1 / scale, hr * 0.07);
      g.beginPath();
      if (mood === "happy") {
        g.ellipse(mx, my, hr * 0.22, hr * 0.15, heading, 0, Math.PI * 2);
        g.fill();
      } else {
        // A smile that opens toward the heading.
        g.arc(mx + fx * hr * 0.1, my + fy * hr * 0.1, hr * 0.17, heading + Math.PI * 0.55, heading + Math.PI * 1.45);
        g.stroke();
      }
    }
  }

  /** The dizzy flash where goshis died: a pale face with crossed eyes that fades. */
  private dizzyLayer(f: Frame) {
    const list = this.dizzy;
    if (list.length === 0) return;
    const { g, scale } = f;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const a = dizzyAlpha(f.now - d.at);
      if (a <= 0) continue;
      const hr = d.r * HEAD_DRAW_SCALE * (1 + (1 - a) * 0.4);
      g.globalAlpha = a * 0.9;
      g.fillStyle = "#fff4cf";
      g.beginPath();
      g.arc(d.x, d.y, hr, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#0b1130";
      g.lineWidth = Math.max(1.2 / scale, hr * 0.1);
      g.lineCap = "round";
      for (let side = -1; side <= 1; side += 2) {
        const ex = d.x + side * hr * 0.4, ey = d.y - hr * 0.1, k = hr * 0.17;
        g.beginPath();
        g.moveTo(ex - k, ey - k); g.lineTo(ex + k, ey + k);
        g.moveTo(ex + k, ey - k); g.lineTo(ex - k, ey + k);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(d.x - hr * 0.3, d.y + hr * 0.45);
      g.quadraticCurveTo(d.x - hr * 0.1, d.y + hr * 0.3, d.x, d.y + hr * 0.45);
      g.quadraticCurveTo(d.x + hr * 0.1, d.y + hr * 0.6, d.x + hr * 0.3, d.y + hr * 0.45);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /** One snake: a path traced once and stroked in layers (glow, outline, body, shine), then the head. */
  private snake(f: Frame, p: PlayerSnap, left: number, right: number, top: number, bottom: number) {
    const { g, scale } = f;
    const r = Math.max(p.r, 3 / scale);
    const pad = r * 4;
    const body = p.body;
    // Cheap culling: the head and the tail end both off the same side is not enough to be sure, so check every point.
    let near = p.head[0] > left - pad && p.head[0] < right + pad && p.head[1] > top - pad && p.head[1] < bottom + pad;
    for (let i = 0; i < body.length && !near; i++) {
      const b = body[i];
      near = b[0] > left - pad && b[0] < right + pad && b[1] > top - pad && b[1] < bottom + pad;
    }
    if (!near) return;
    const saboteur = p.role === "saboteur";
    const mine = p.w === f.you;
    const st = this.styleFor(p);

    g.lineCap = "round";
    g.lineJoin = "round";
    g.setLineDash(NO_DASH);
    g.beginPath();
    g.moveTo(p.head[0], p.head[1]);
    for (let i = 0; i < body.length; i++) g.lineTo(body[i][0], body[i][1]);
    if (body.length === 0) g.lineTo(p.head[0] + 0.01, p.head[1]);

    const q = this.quality;
    if (q.layeredGlow) {
      // Glow: two wide, faint strokes (cheaper than shadowBlur on a long path).
      g.strokeStyle = st.glowA;
      g.lineWidth = 2 * r + 22 / scale;
      g.stroke();
      g.strokeStyle = st.glowB;
      g.lineWidth = 2 * r + 11 / scale;
      g.stroke();
    }
    // Outline, so two overlapping bodies stay readable.
    g.strokeStyle = "rgba(3,5,18,0.7)";
    g.lineWidth = 2 * r + (saboteur ? 9 : 5) / scale;
    g.stroke();
    if (saboteur) {
      // Saboteurs keep an orange dashed outline.
      g.lineCap = "butt";
      if (this.dash.scale !== scale) this.dash = { scale, pattern: [12 / scale, 9 / scale] };
      g.setLineDash(this.dash.pattern);
      g.strokeStyle = SABOTEUR_COLOR;
      g.lineWidth = 2 * r + 7 / scale;
      g.stroke();
      g.setLineDash(NO_DASH);
      g.lineCap = "round";
    }
    if (q.shadowGlow) {
      // The nicest glow, and the most expensive: the body itself is stroked with a blurred colored shadow.
      g.shadowColor = st.rim;
      g.shadowBlur = 12 * f.dpr;
    }
    g.strokeStyle = st.body;
    g.lineWidth = 2 * r;
    g.stroke();
    if (q.shadowGlow) { g.shadowBlur = 0; g.shadowColor = "transparent"; }
    if (st.alt) {
      // A striped skin: the second color in short dashes over the body.
      g.lineCap = "butt";
      g.setLineDash([r * 1.1, r * 1.9]);
      g.strokeStyle = st.alt;
      g.lineWidth = 2 * r * 0.88;
      g.stroke();
      g.setLineDash(NO_DASH);
      g.lineCap = "round";
    }
    // Meme skins (snake.io style): the body as round beads with volume, a dark rim, a ripple that runs down it and the
    // skin's own pattern (frog spots, stripes). Only where the beads are big enough to see.
    if (st.art && q.shine && r * scale >= 3) this.beads(g, p.head, body, r, st, f.now, scale);
    else if (q.shine) {
      // A soft shine along the middle of the body; pepe's is his pale frog belly.
      g.strokeStyle = st.art === "pepe" ? "rgba(228,244,178,0.55)" : "rgba(255,255,255,0.22)";
      g.lineWidth = st.art === "pepe" ? r * 1.05 : r * 0.7;
      g.stroke();
    }

    // Head: the goshi face. Bright, a white rim for you, eyes toward the heading, a blink, a happy mouth after eating.
    // Meme heads ride bigger (snake.io style) so the face stays readable at the far zoom of a full arena.
    const hr = r * HEAD_DRAW_SCALE * (st.art ? 1.5 : 1);
    const hx = p.head[0], hy = p.head[1];
    // Speed from the previous frame (the server does not send it). Normal crawl is at most ~135 u/s, boost is 1.7x that:
    // legs step and tails wag with it, and past 175 u/s counts as boosting.
    let spd = 0;
    const prev = this.lastHead.get(p.w);
    if (prev) {
      const dt = (f.now - prev.t) / 1000;
      const dist = Math.hypot(hx - prev.x, hy - prev.y);
      if (dt > 0 && dt < 0.5 && dist < 400) spd = dist / dt;
    }
    this.lastHead.set(p.w, { x: hx, y: hy, t: f.now });
    const boost = spd > 175;
    g.fillStyle = st.head;
    g.beginPath();
    g.arc(hx, hy, hr, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = (mine ? 3 : 1.8) / scale;
    g.strokeStyle = mine ? "#ffffff" : "rgba(3,5,18,0.7)";
    g.stroke();
    const mood = moodOf(this.ateAt.get(p.w), f.now);
    if (st.art) {
      try { this.memeHead(g, st.art, hx, hy, hr, p.h, { happy: mood === "happy", boost, now: f.now, px: hr * scale, fired: f.now - (this.firedAt.get(p.w) ?? -1e9) < 900 }); } catch { g.restore(); this.face(g, hx, hy, hr, p.h, 0, mood, scale); }
    } else this.face(g, hx, hy, hr, p.h, f.reduced ? 0 : blinkAmount(hash(p.w), f.now), mood, scale);
    // Meme appendages: legs straddling the head and a tail at the body's end, over the body so they read as attached.
    // Only when the head is big enough on screen, so far zoom stays clean.
    if (st.art && hr * scale >= 30) {
      try { this.appendages(g, st.art, hx, hy, hr, p.h, f.now, spd, scale, r, body); } catch { /* appendages are optional */ }
    }
    // Spawn protection: a shield ring.
    if (p.prot) {
      const pulse = f.reduced ? 1 : 0.75 + 0.25 * Math.sin(f.now / 160);
      g.fillStyle = `rgba(120,220,255,${0.16 * pulse})`;
      g.beginPath();
      g.arc(hx, hy, r * 2.1, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(150,235,255,${0.95 * pulse})`;
      g.lineWidth = 3.5 / scale;
      g.stroke();
    }
    // You: a clear white ring around the head, whatever the colors around.
    if (mine) {
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2.5 / scale;
      g.beginPath();
      g.arc(hx, hy, hr * 1.45, 0, Math.PI * 2);
      g.stroke();
    }
  }

  /**
   * Names, drawn after everything else so they are readable: above the head, in priority order (you first, then the
   * heavier), and a name is hidden when it would sit on another name or on another snake's head. A red dot marks
   * players that are outside the safe zone and bleeding.
   */
  private labelPass(f: Frame, order: readonly PlayerSnap[], left: number, right: number, top: number, bottom: number) {
    const { scale } = f;
    const placer = this.placer;
    placer.reset();
    const n = order.length;
    for (let i = 0; i < n; i++) {
      const p = order[i];
      const art = !!this.styleFor(p).art;
      const hr = Math.max(p.r, 3 / scale) * HEAD_DRAW_SCALE * (art ? 2.1 : 1.45);
      placer.block(p.head[0] - hr, p.head[1] - hr, p.head[0] + hr, p.head[1] + hr, i);
    }
    let meIdx = -1;
    for (let j = 0; j < n; j++) if (order[j].w === f.you) { meIdx = j; break; }
    // You first, then the heaviest (order is light to heavy).
    if (meIdx >= 0) this.drawName(f, order[meIdx], meIdx, left, right, top, bottom);
    for (let idx = n - 1; idx >= 0; idx--) if (idx !== meIdx) this.drawName(f, order[idx], idx, left, right, top, bottom);
    // The label of a ring goes last, only where it covers no name and no head.
    if (this.ringText) this.ringLabel(f, this.ringText, this.ringX, this.ringY, left, right, top, bottom);
    this.ringText = "";
  }

  private drawName(f: Frame, p: PlayerSnap, idx: number, left: number, right: number, top: number, bottom: number) {
    const { g, scale } = f;
    const hx = p.head[0], hy = p.head[1];
    if (hx < left - 60 || hx > right + 60 || hy < top - 60 || hy > bottom + 60) return;
    const r = Math.max(p.r, 3 / scale);
    const fontPx = Math.max(13 / scale, Math.min(24, r * 1.2));
    const mine = p.w === f.you;
    const label = mine ? `${p.n} (${f.strings.you})` : p.n;
    const dot = !mine && p.zout;
    const textW = label.length * fontPx * 0.58;
    const w = textW + (dot ? fontPx * 0.9 : 0);
    const base = hy - r * HEAD_DRAW_SCALE * (this.styleFor(p).art ? 2.3 : 1.5) - 4 / scale - (p.prot ? r * 1.2 : 0);
    if (!this.placer.tryPlace(hx - w / 2, base - fontPx * 1.15, hx + w / 2, base, idx)) return;
    g.font = this.font(fontPx);
    g.textAlign = "center";
    g.textBaseline = "bottom";
    g.lineJoin = "round";
    g.lineWidth = 3 / scale;
    g.strokeStyle = "rgba(5,8,25,0.85)";
    g.fillStyle = "#ffffff";
    const tx = hx + (dot ? fontPx * 0.45 : 0);
    g.strokeText(label, tx, base);
    g.fillText(label, tx, base);
    if (dot) {
      g.fillStyle = "#ff3b4a";
      g.beginPath();
      g.arc(tx - textW / 2 - fontPx * 0.45, base - fontPx * 0.4, fontPx * 0.26, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** "-N" numbers rising from the head while you bleed outside the zone. */
  private floatLayer(f: Frame) {
    const list = f.floaters;
    if (list.length === 0) return;
    const { g, scale } = f;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    for (let i = 0; i < list.length; i++) {
      const fl = list[i];
      const t = Math.min(1, fl.age / 1.1);
      const rise = f.reduced ? 0 : t * 38 / scale;
      g.globalAlpha = 1 - t * t;
      g.font = this.font(20 / scale);
      g.lineWidth = 3.5 / scale;
      g.strokeStyle = "rgba(40,0,6,0.9)";
      g.fillStyle = "#ff6070";
      g.strokeText(fl.text, fl.x, fl.y - 30 / scale - rise);
      g.fillText(fl.text, fl.x, fl.y - 30 / scale - rise);
    }
    g.globalAlpha = 1;
  }

  /** Outside the safe zone is darkened and the edge is a red ring (over the snakes: it is information). */
  private zoneLayer(f: Frame, left: number, right: number, top: number, bottom: number) {
    const { g, scale, zone } = f;
    g.save();
    g.beginPath();
    g.rect(left - 50, top - 50, right - left + 100, bottom - top + 100);
    g.arc(zone.cx, zone.cy, Math.max(1, zone.r), 0, Math.PI * 2, true);
    g.fillStyle = "rgba(10, 0, 4, 0.5)";
    g.fill("evenodd");
    g.restore();
    g.strokeStyle = "rgba(255,120,130,0.45)";
    g.lineWidth = 14 / scale;
    g.beginPath();
    g.arc(zone.cx, zone.cy, Math.max(1, zone.r), 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#ff3b4a";
    g.lineWidth = 5 / scale;
    g.stroke();
    // The next circle (announced, or being moved to): a thin dashed white ring. The last circle is the red one.
    const tg = zone.target;
    if (tg) {
      if (this.dash.scale !== scale) this.dash = { scale, pattern: [12 / scale, 9 / scale] };
      g.setLineDash(this.dash.pattern);
      g.strokeStyle = "rgba(255,255,255,0.92)";
      g.lineWidth = 2 / scale;
      g.beginPath();
      g.arc(tg.cx, tg.cy, Math.max(1, tg.r), 0, Math.PI * 2);
      g.stroke();
      g.setLineDash(NO_DASH);
      this.ringText = f.strings.nextZone; this.ringX = tg.cx; this.ringY = tg.cy - tg.r;
    } else if ((zone.phase ?? 0) >= FINAL_PHASE && zone.state === "hold") {
      this.ringText = f.strings.finalZone; this.ringX = zone.cx; this.ringY = zone.cy - zone.r;
    }
  }

  /** A small label on a ring. It is drawn only where it does not cover a name or a head. */
  private ringLabel(f: Frame, text: string, x: number, y: number, left: number, right: number, top: number, bottom: number) {
    const { g, scale } = f;
    const px = 13 / scale;
    const w = text.length * px * 0.6;
    if (x < left || x > right || y < top || y > bottom) return;
    const base = y - 6 / scale;
    if (!this.placer.tryPlace(x - w / 2, base - px * 1.15, x + w / 2, base)) return;
    g.font = this.font(px);
    g.textAlign = "center";
    g.textBaseline = "bottom";
    g.lineJoin = "round";
    g.lineWidth = 3 / scale;
    g.strokeStyle = "rgba(5,8,25,0.85)";
    g.fillStyle = "#ffffff";
    g.strokeText(text, x, base);
    g.fillText(text, x, base);
  }

  private vignetteLayer(g: CanvasRenderingContext2D, W: number, H: number) {
    let v = this.vignette;
    if (!v || v.w !== W || v.h !== H) {
      const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      grad.addColorStop(0, "rgba(2,4,16,0)");
      grad.addColorStop(1, "rgba(2,4,16,0.6)");
      v = this.vignette = { w: W, h: H, grad };
    }
    g.fillStyle = v.grad;
    g.fillRect(0, 0, W, H);
  }

  /** The nitro bar: the share of your mass the boost can still burn (it costs 1.5% of the mass a second). */
  private nitro(f: Frame) {
    const { g, W, H } = f;
    const dpr = f.ui;
    const fuel = boostFuel(f.myMass);
    const w = Math.min(240 * dpr, W * 0.46);
    const h = 9 * dpr;
    const x = (W - w) / 2;
    const y = H - 18 * dpr - h;
    g.fillStyle = "rgba(5,8,25,0.72)";
    roundRect(g, x - 2 * dpr, y - 2 * dpr, w + 4 * dpr, h + 4 * dpr, (h + 4 * dpr) / 2);
    g.fill();
    let n = this.nitroGrad;
    if (!n || n.x !== x || n.w !== w) {
      const grad = g.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, "#22d3ee");
      grad.addColorStop(1, "#3b82f6");
      n = this.nitroGrad = { x, w, grad };
    }
    g.fillStyle = n.grad;
    if (fuel > 0) {
      roundRect(g, x, y, Math.max(h, w * fuel), h, h / 2);
      g.fill();
    }
    if (f.boosting && fuel > 0) {
      g.strokeStyle = "rgba(160,240,255,0.9)";
      g.lineWidth = 1.5 * dpr;
      roundRect(g, x - 2 * dpr, y - 2 * dpr, w + 4 * dpr, h + 4 * dpr, (h + 4 * dpr) / 2);
      g.stroke();
    }
    g.font = this.font(11 * dpr);
    g.textAlign = "center";
    g.textBaseline = "bottom";
    g.fillStyle = fuel < 0.15 ? "#ff8a8a" : "#9fe8ff";
    g.fillText(f.strings.nitro, W / 2, y - 5 * dpr);
    g.textAlign = "left";
    g.font = this.font(22 * dpr);
    g.fillStyle = "#ffffff";
    g.textBaseline = "alphabetic";
    g.fillText(String(Math.round(f.myMass)), 14 * dpr, H - 14 * dpr);
    g.font = this.font(11 * dpr);
    g.fillStyle = "rgba(200,215,255,0.8)";
    g.fillText(f.strings.mass, 14 * dpr, H - 14 * dpr - 26 * dpr);
  }

  /** A red arrow around the screen center that points to the safe zone, with how far out you are. */
  private zoneArrow(f: Frame, angle: number, overBy: number, bold: boolean) {
    const { g, W, H } = f;
    const dpr = f.ui;
    const radius = Math.min(W, H) * 0.27;
    const cx = W / 2 + Math.cos(angle) * radius;
    const cy = H / 2 + Math.sin(angle) * radius;
    // Bold while you are losing mass: bigger, with a white edge.
    const size = (bold ? 26 : 16) * dpr;
    g.save();
    g.translate(cx, cy);
    g.rotate(angle);
    g.fillStyle = "#ff3b4a";
    g.strokeStyle = bold ? "#ffffff" : "rgba(5,8,25,0.9)";
    g.lineWidth = (bold ? 4 : 3) * dpr;
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(size * 1.1, 0);
    g.lineTo(-size * 0.7, size * 0.8);
    g.lineTo(-size * 0.3, 0);
    g.lineTo(-size * 0.7, -size * 0.8);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
    g.font = this.font((bold ? 18 : 14) * dpr);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 4 * dpr;
    g.strokeStyle = "rgba(5,8,25,0.9)";
    g.fillStyle = bold ? "#ffffff" : "#ffd0d4";
    const text = f.strings.backToZone.replace("{n}", String(Math.max(1, Math.round(overBy))));
    g.strokeText(text, W / 2, H / 2 + radius + 28 * dpr);
    g.fillText(text, W / 2, H / 2 + radius + 28 * dpr);
  }

  /** A small map in the corner: the world, the safe zone, the other players, you and what the camera shows. */
  /** Top ten by mass under the minimap, like the .io games: the leader has a crown and you always see your own row. */
  private board(f: Frame, alive: readonly PlayerSnap[]) {
    const { g, W, H } = f;
    const dpr = f.ui;
    if (alive.length === 0) return;
    const size = Math.max(84 * dpr, Math.min(150 * dpr, Math.min(W, H) * 0.24));
    const pad = 10 * dpr;
    const rowH = (this.bagsMap ? 14 : 17) * dpr;
    const bags = this.bagsMap;
    const wBox = Math.min(size + (f.massUsd || podiumLabels || bags ? 80 : 40) * dpr, W * 0.5);
    const x0 = W - wBox - pad;
    const rows = bags ? [...alive].sort((a, b) => (bags.get(b.w) ?? 0) - (bags.get(a.w) ?? 0) || b.m - a.m) : [...alive].sort((a, b) => b.m - a.m);
    // A room with money shows every player and its bag; the others the top ten.
    // A phone (narrow screen) keeps it short: the top five and your own row, so the board never covers the game.
    const compact = W / Math.max(1, f.dpr) < 560;
    const shown = bags ? (compact ? 5 : rows.length) : 10;
    const top = rows.slice(0, shown);
    const meIdx = rows.findIndex((p) => p.w === f.you);
    const extra = meIdx >= shown ? rows[meIdx] : null;
    const y0 = pad + size * (f.world.h / Math.max(f.world.w, f.world.h)) + 8 * dpr;
    // With money at stake, places 1 to 3 get a second line: what each would take if the match ended now.
    const prizes = bags ? null : podiumLabels;
    const extraLines = prizes ? Math.min(3, top.length) : 0;
    const n = top.length + (extra ? 1 : 0) + extraLines * 0.85;
    if (y0 + n * rowH + 8 * dpr > H * (bags ? 0.95 : 0.75)) return; // never cover the play area on a very small screen
    g.globalAlpha = 0.9;
    g.fillStyle = "rgba(5,8,25,0.6)";
    roundRect(g, x0, y0, wBox, n * rowH + 8 * dpr, 8 * dpr);
    g.fill();
    g.font = this.font(12 * dpr);
    g.textBaseline = "middle";
    const drawRow = (p: PlayerSnap, rank: number, y: number) => {
      const mine = p.w === f.you;
      g.fillStyle = mine ? "#ffe08a" : p.role === "saboteur" ? SABOTEUR_COLOR : "#ffffff";
      g.textAlign = "left";
      const name = p.n.length > 11 ? `${p.n.slice(0, 10)}…` : p.n;
      g.fillText(`${rank === 1 ? "♛" : rank}  ${name}`, x0 + 7 * dpr, y);
      g.textAlign = "right";
      const mass = Math.round(p.m);
      g.fillText(bags ? `${((bags.get(p.w) ?? 0) / 1e9).toFixed(9)}` : f.massUsd ? `${mass}  $${usdShort(p.m * 0.01)}` : String(mass), x0 + wBox - 7 * dpr, y);
      if (prizes && rank <= 3 && prizes[rank - 1]) {
        g.font = this.font(10 * dpr);
        g.fillStyle = "#f2c94c";
        g.fillText(prizes[rank - 1], x0 + wBox - 7 * dpr, y + rowH * 0.85);
        g.font = this.font(12 * dpr);
      }
    };
    let yy = y0 + 4 * dpr;
    top.forEach((p, i) => { drawRow(p, i + 1, yy + 0.5 * rowH); yy += rowH * (prizes && i < 3 ? 1.85 : 1); });
    if (extra) drawRow(extra, meIdx + 1, yy + 0.5 * rowH);
    g.globalAlpha = 1;
  }

  /** Who is first and by how much, always on screen, big enough to read on a phone: the leader and the gap to you (or your lead). */
  private leadStrip(f: Frame, alive: readonly PlayerSnap[]) {
    const { g, W, H } = f;
    const dpr = f.ui;
    if (alive.length < 2) return;
    const rows = [...alive].sort((a, b) => b.m - a.m || (a.w < b.w ? -1 : 1));
    const lead = rows[0];
    const meIdx = rows.findIndex((p) => p.w === f.you);
    const s = leadStrings();
    const name = (p: PlayerSnap) => (p.n.length > 12 ? `${p.n.slice(0, 11)}\u2026` : p.n);
    const l1 = s.top.replace("{name}", name(lead)).replace("{m}", String(Math.round(lead.m)));
    let l2 = "";
    if (meIdx === 0) l2 = s.youLead.replace("{n}", String(Math.max(0, Math.round(lead.m - rows[1].m))));
    else if (meIdx > 0) l2 = s.youBehind.replace("{rank}", String(meIdx + 1)).replace("{n}", String(Math.max(0, Math.round(lead.m - rows[meIdx].m))));
    const px = Math.round(Math.max(13, Math.min(17, W / 30 / dpr * 1)) * dpr);
    g.font = this.font(px);
    const wMax = Math.min(W - 230 * dpr, W * 0.7);
    const w1 = g.measureText(l1).width, w2 = l2 ? g.measureText(l2).width : 0;
    const w = Math.min(wMax, Math.max(w1, w2) + 20 * dpr);
    const h = (l2 ? 2 : 1) * px * 1.3 + 12 * dpr;
    const x = W / 2 - w / 2;
    const y = H - h - 54 * dpr;
    g.globalAlpha = 0.86;
    g.fillStyle = "rgba(5,8,25,0.78)";
    roundRect(g, x, y, w, h, 10 * dpr);
    g.fill();
    g.globalAlpha = 1;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#ffd447";
    g.fillText(l1, W / 2, y + 6 * dpr + px * 0.65, w - 12 * dpr);
    if (l2) {
      g.fillStyle = meIdx === 0 ? "#7be3c3" : "#ffffff";
      g.fillText(l2, W / 2, y + 6 * dpr + px * 1.95, w - 12 * dpr);
    }
  }

  /** A crown over the leader's head, or an arrow with a crown at the screen edge that points to it. */
  private leaderMark(f: Frame, alive: readonly PlayerSnap[]) {
    const { g, W, H, scale } = f;
    const dpr = f.ui;
    let lead: PlayerSnap | null = null;
    for (const p of alive) if (!lead || p.m > lead.m) lead = p;
    if (!lead || lead.w === f.you || !f.meAlive) return;
    const sx = W / 2 + (lead.head[0] - f.cam.x) * scale;
    const sy = H / 2 + (lead.head[1] - f.cam.y) * scale;
    const m = 30 * dpr;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = 4 * dpr;
    g.strokeStyle = "rgba(5,8,25,0.9)";
    g.fillStyle = "#ffd54a";
    if (sx > m && sx < W - m && sy > m && sy < H - m) {
      g.font = this.font(18 * dpr);
      g.strokeText("♛", sx, sy - 26 * dpr);
      g.fillText("♛", sx, sy - 26 * dpr);
      return;
    }
    const ang = Math.atan2(sy - H / 2, sx - W / 2);
    const ex = Math.max(m, Math.min(W - m, sx));
    const ey = Math.max(m + 120 * dpr * 0, Math.min(H - m, sy));
    g.save();
    g.translate(ex, ey);
    g.globalAlpha = 0.9;
    g.rotate(ang);
    g.beginPath();
    g.moveTo(14 * dpr, 0);
    g.lineTo(-8 * dpr, -9 * dpr);
    g.lineTo(-8 * dpr, 9 * dpr);
    g.closePath();
    g.fill();
    g.restore();
    g.font = this.font(16 * dpr);
    const cx = ex - Math.cos(ang) * 20 * dpr, cy = ey - Math.sin(ang) * 20 * dpr;
    g.strokeText("♛", cx, cy);
    g.fillText("♛", cx, cy);
    g.globalAlpha = 1;
  }

  private minimap(f: Frame, alive: readonly PlayerSnap[]) {
    const { g, W, H } = f;
    const dpr = f.ui;
    const size = Math.max(84 * dpr, Math.min(150 * dpr, Math.min(W, H) * 0.24));
    const pad = 10 * dpr;
    const x0 = W - size - pad;
    const y0 = pad;
    // A round radar: the world is a circle (its square's inscribed circle), drawn in a circle, and every body is drawn as
    // a line as thick as it really is, so the big ones look big at a glance.
    const ox = f.world.x0 ?? 0, oy = f.world.y0 ?? 0;
    const wcx = ox + f.world.w / 2, wcy = oy + f.world.h / 2, wr = Math.max(f.world.w, f.world.h) / 2;
    const mr = size / 2, mcx = x0 + mr, mcy = y0 + mr;
    const k = mr / wr;
    const mx = (x: number) => mcx + (x - wcx) * k, my = (y: number) => mcy + (y - wcy) * k;
    const { scale } = f;
    const left = f.cam.x - W / 2 / scale, right = f.cam.x + W / 2 / scale, top = f.cam.y - H / 2 / scale, bottom = f.cam.y + H / 2 / scale;
    g.globalAlpha = 0.9;
    g.save();
    g.beginPath();
    g.arc(mcx, mcy, mr, 0, Math.PI * 2);
    g.fillStyle = "rgba(5,8,25,0.72)";
    g.fill();
    g.clip();
    g.strokeStyle = "#ff3b4a";
    g.lineWidth = 1.5 * dpr;
    g.beginPath();
    g.arc(mx(f.zone.cx), my(f.zone.cy), Math.max(1, f.zone.r * k), 0, Math.PI * 2);
    g.stroke();
    const tg = f.zone.target;
    if (tg) {
      g.setLineDash([3 * dpr, 3 * dpr]);
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1 * dpr;
      g.beginPath();
      g.arc(mx(tg.cx), my(tg.cy), Math.max(2 * dpr, tg.r * k), 0, Math.PI * 2);
      g.stroke();
      g.setLineDash(NO_DASH);
    }
    g.strokeStyle = "rgba(255,255,255,0.45)";
    g.lineWidth = 1 * dpr;
    g.strokeRect(mx(left), my(top), (right - left) * k, (bottom - top) * k);
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let i = 0; i < alive.length; i++) {
      const p = alive[i];
      const mine = p.w === f.you;
      const color = mine ? "#ffffff" : p.role === "saboteur" ? SABOTEUR_COLOR : this.styleFor(p).rim;
      const w = Math.max(1.4 * dpr, p.r * 2 * k);
      if (p.body.length > 1) {
        g.strokeStyle = color;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(mx(p.head[0]), my(p.head[1]));
        const step = Math.max(1, Math.floor(p.body.length / 24));
        for (let j = 0; j < p.body.length; j += step) g.lineTo(mx(p.body[j][0]), my(p.body[j][1]));
        g.stroke();
      }
      g.fillStyle = color;
      g.beginPath();
      g.arc(mx(p.head[0]), my(p.head[1]), Math.max(mine ? 3.2 * dpr : 2 * dpr, w * 0.75), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 1 * dpr;
    g.beginPath();
    g.arc(mcx, mcy, mr, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  }
}

const NO_DASH: number[] = [];
/** How long a supernova lasts, and how long its coins fly (ms). */
const NOVA_MS = 1600;
const FLIGHT_MS = 900;

/** Dollars written short: $0.45, $27, $1.2k. */
function usdShort(x: number): string {
  if (x >= 1000) return `${(x / 1000).toFixed(1)}k`;
  if (x >= 10) return String(Math.round(x));
  return x.toFixed(2);
}


const byMass = (a: PlayerSnap, b: PlayerSnap) => a.m - b.m;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  g.lineTo(x + w, y + h - rr);
  g.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  g.lineTo(x + rr, y + h);
  g.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  g.lineTo(x, y + rr);
  g.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  g.closePath();
}
