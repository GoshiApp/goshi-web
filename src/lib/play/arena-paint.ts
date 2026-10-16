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
import { skinById } from "./skins.ts";
import { COINS, coinIndex } from "./coins.ts";
import { GOSHI_HUES, blinkAmount, dizzyAlpha, hash, moodOf, type Mood } from "./goshi-face.ts";
import { drawYouMarker } from "./you-marker.ts";
import { leadStrings } from "./lead-strings.ts";
import { HEAD_DRAW_SCALE, LabelPlacer, dangerAmong, headOnPairs, zoneGuide } from "./arena-view.ts";
import type { Orb, PlayerSnap, ZoneNow } from "./protocol.ts";

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

export interface Frame {
  g: CanvasRenderingContext2D;
  /** Canvas size in device pixels. */
  W: number;
  H: number;
  dpr: number;
  now: number;
  players: readonly PlayerSnap[];
  zone: ZoneNow;
  orbs: ReadonlyMap<number, LooseOrb>;
  world: { w: number; h: number };
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
  }

  /** The goshi that just ate shows a happy mouth for a moment. */
  noteAte(wallet: string, now: number): void {
    this.ateAt.set(wallet, now);
  }

  /** A dizzy face where a goshi died, fading out. */
  noteDeath(x: number, y: number, r: number, colorIdx: number, now: number): void {
    const d = this.dizzy;
    const slot = d.length < 10 ? d.push({ x, y, r, c: colorIdx, at: now }) - 1 : d.reduce((m, e, i) => (e.at < d[m].at ? i : m), 0);
    d[slot] = { x, y, r, c: colorIdx, at: now };
  }

  styleFor(p: { w: string; role: string }): Style {
    const own = p.w === this.curYou && this.ownHue !== null && p.role !== "saboteur";
    const skinId = p.role === "saboteur" ? null : p.w === this.curYou && this.ownSkin ? this.ownSkin : this.skins[p.w] ?? null;
    const skin = skinById(skinId);
    const key = p.role === "saboteur" ? `s:${p.w}` : skin ? `k:${skin.id}` : own ? `me:${this.ownHue}` : p.w;
    let s = this.styles.get(key);
    if (s) return s;
    if (skin) {
      s = { idx: 0, ...skin.style };
    } else if (own) {
      const h = this.ownHue as number;
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

    // Players: light ones first so heavy ones are on top.
    const order = this.order;
    order.length = 0;
    for (let i = 0; i < f.players.length; i++) if (f.players[i].alive) order.push(f.players[i]);
    order.sort(byMass);
    for (let i = 0; i < order.length; i++) this.snake(f, order[i], left, right, top, bottom);

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
    this.minimap(f, order);
    // Extras: a failure in one of them must never take the whole picture with it.
    try { this.board(f, order); } catch { /* the board is optional */ }
    try { this.leaderMark(f, order); } catch { /* so is the leader mark */ }
    try { this.leadStrip(f, order); } catch { /* and the lead strip */ }

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
    g.fillStyle = "#0d1436";
    g.fillRect(0, 0, f.world.w, f.world.h);
    g.strokeStyle = "rgba(120,150,255,0.09)";
    g.lineWidth = 1 / scale;
    g.beginPath();
    const x1 = Math.min(f.world.w, right), y1 = Math.min(f.world.h, bottom);
    const x0 = Math.max(0, left), y0 = Math.max(0, top);
    for (let x = Math.max(0, Math.floor(left / 100) * 100); x <= x1; x += 100) { g.moveTo(x, y0); g.lineTo(x, y1); }
    for (let y = Math.max(0, Math.floor(top / 100) * 100); y <= y1; y += 100) { g.moveTo(x0, y); g.lineTo(x1, y); }
    g.stroke();
    // The edge of the world: a soft red glow made of two strokes.
    g.strokeStyle = "rgba(255,70,80,0.25)";
    g.lineWidth = 16 / scale;
    g.strokeRect(0, 0, f.world.w, f.world.h);
    g.strokeStyle = "#ff4b5a";
    g.lineWidth = 3 / scale;
    g.strokeRect(0, 0, f.world.w, f.world.h);
  }

  private orbLayer(f: Frame, left: number, right: number, top: number, bottom: number) {
    const { g, scale, now } = f;
    const sprites = this.orbSprites();
    const coins = this.coinSprites();
    const minR = 2 / scale;
    for (const o of f.orbs.values()) {
      const tier: OrbTier = orbTier(o.v, o.loot === true);
      const r = Math.max(orbRadius(o.v) * TIER_SCALE[tier], minR);
      const half = r * 3;
      if (o.x < left - half || o.x > right + half || o.y < top - half || o.y > bottom + half) continue;
      const k = f.reduced ? 1 : orbPulse(now, o.id);
      const h = half * k;
      if (o.loot === true) g.drawImage(sprites[tier], o.x - h, o.y - h, h * 2, h * 2);
      // The orbs of this game are coins: small ones SOL, DOGE and AVAX, bigger ones ETH and BNB, the richest BTC.
      const idx = coinIndex(o.v, o.id);
      g.drawImage(coins[idx], o.x - h, o.y - h, h * 2, h * 2);
    }
  }

  /** Simple meme heads drawn in the head circle, facing along the heading (forward is +x after the rotation). */
  private memeHead(g: CanvasRenderingContext2D, art: string, hx: number, hy: number, r: number, heading: number, happy: boolean) {
    g.save();
    g.translate(hx, hy);
    g.rotate(heading);
    const disc = (x: number, y: number, rad: number, fill: string) => { g.fillStyle = fill; g.beginPath(); g.arc(x * r, y * r, rad * r, 0, Math.PI * 2); g.fill(); };
    const tri = (pts: [number, number][], fill: string) => { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * r, y * r) : g.moveTo(x * r, y * r))); g.closePath(); g.fill(); };
    const eye = (x: number, y: number, big = 0.2) => { disc(x, y, big, "#ffffff"); disc(x + 0.06, y, big * 0.5, "#10142e"); };
    switch (art) {
      case "pepe":
        disc(0.1, -0.5, 0.36, "#86c24a"); disc(0.1, 0.5, 0.36, "#86c24a");
        eye(0.18, -0.5, 0.26); eye(0.18, 0.5, 0.26);
        g.strokeStyle = "#7a2a2a"; g.lineWidth = r * 0.12; g.lineCap = "round";
        g.beginPath(); g.moveTo(0.55 * r, -0.7 * r); g.quadraticCurveTo(0.8 * r, 0, 0.55 * r, 0.7 * r); g.stroke();
        disc(0.62, 0, 0.12, "#e0707a");
        break;
      case "shiba":
        tri([[-0.5, -0.5], [-0.9, -1.0], [-0.1, -0.85]], "#e89a3c"); tri([[-0.5, 0.5], [-0.9, 1.0], [-0.1, 0.85]], "#e89a3c");
        disc(0.35, 0, 0.5, "#fff3dc");
        eye(0.2, -0.38, 0.14); eye(0.2, 0.38, 0.14);
        disc(0.75, 0, 0.13, "#10142e");
        break;
      case "doge":
        tri([[-0.45, -0.55], [-0.95, -0.9], [-0.15, -0.9]], "#c9a45c"); tri([[-0.45, 0.55], [-0.95, 0.9], [-0.15, 0.9]], "#c9a45c");
        disc(0.4, 0, 0.5, "#fff6dc");
        eye(0.22, -0.4, 0.13); eye(0.22, 0.4, 0.13);
        g.strokeStyle = "#8a6a2a"; g.lineWidth = r * 0.07;
        g.beginPath(); g.moveTo(0.05 * r, -0.62 * r); g.lineTo(0.35 * r, -0.5 * r); g.moveTo(0.05 * r, 0.62 * r); g.lineTo(0.35 * r, 0.5 * r); g.stroke();
        disc(0.78, 0, 0.12, "#10142e");
        break;
      case "bonk":
        g.strokeStyle = "#8a5a2b"; g.lineWidth = r * 0.22; g.lineCap = "round";
        g.beginPath(); g.moveTo(-0.9 * r, 0.9 * r); g.lineTo(0.5 * r, -0.9 * r); g.stroke();
        tri([[-0.4, -0.5], [-0.8, -0.95], [-0.05, -0.8]], "#e8921c"); tri([[-0.4, 0.5], [-0.8, 0.95], [-0.05, 0.8]], "#e8921c");
        eye(0.2, -0.38, 0.15); eye(0.2, 0.38, 0.15);
        disc(0.68, 0, 0.14, "#10142e");
        break;
      case "popcat":
        tri([[-0.2, -0.7], [-0.55, -1.05], [0.15, -0.95]], "#ffd0dc"); tri([[-0.2, 0.7], [-0.55, 1.05], [0.15, 0.95]], "#ffd0dc");
        disc(0.15, -0.36, 0.1, "#10142e"); disc(0.15, 0.36, 0.1, "#10142e");
        disc(0.5, 0, happy ? 0.3 : 0.24, "#c2415e");
        break;
      case "wif":
        disc(0.35, 0, 0.5, "#fff0d8");
        eye(0.22, -0.38, 0.13); eye(0.22, 0.38, 0.13);
        disc(0.75, 0, 0.12, "#10142e");
        disc(-0.25, 0, 0.62, "#ff7aa8");
        g.strokeStyle = "#e0507f"; g.lineWidth = r * 0.1;
        g.beginPath(); g.arc(-0.25 * r, 0, 0.62 * r, -Math.PI / 2, Math.PI / 2); g.stroke();
        break;
    }
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
    if (q.shine) {
      // A soft shine along the middle of the body.
      g.strokeStyle = "rgba(255,255,255,0.22)";
      g.lineWidth = r * 0.7;
      g.stroke();
    }

    // Head: the goshi face. Bright, a white rim for you, eyes toward the heading, a blink, a happy mouth after eating.
    const hr = r * HEAD_DRAW_SCALE;
    const hx = p.head[0], hy = p.head[1];
    g.fillStyle = st.head;
    g.beginPath();
    g.arc(hx, hy, hr, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = (mine ? 3 : 1.8) / scale;
    g.strokeStyle = mine ? "#ffffff" : "rgba(3,5,18,0.7)";
    g.stroke();
    const mood = moodOf(this.ateAt.get(p.w), f.now);
    if (st.art) {
      try { this.memeHead(g, st.art, hx, hy, hr, p.h, mood === "happy"); } catch { g.restore(); this.face(g, hx, hy, hr, p.h, 0, mood, scale); }
    } else this.face(g, hx, hy, hr, p.h, f.reduced ? 0 : blinkAmount(hash(p.w), f.now), mood, scale);
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
      const hr = Math.max(p.r, 3 / scale) * HEAD_DRAW_SCALE * 1.45;
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
    const base = hy - r * HEAD_DRAW_SCALE * 1.5 - 4 / scale - (p.prot ? r * 1.2 : 0);
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
    const { g, W, H, dpr } = f;
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
    const { g, W, H, dpr } = f;
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
    const { g, W, H, dpr } = f;
    if (alive.length === 0) return;
    const size = Math.max(84 * dpr, Math.min(150 * dpr, Math.min(W, H) * 0.24));
    const pad = 10 * dpr;
    const rowH = 17 * dpr;
    const wBox = Math.min(size + 40 * dpr, W * 0.45);
    const x0 = W - wBox - pad;
    const rows = [...alive].sort((a, b) => b.m - a.m);
    const top = rows.slice(0, 10);
    const meIdx = rows.findIndex((p) => p.w === f.you);
    const extra = meIdx >= 10 ? rows[meIdx] : null;
    const y0 = pad + size * (f.world.h / Math.max(f.world.w, f.world.h)) + 8 * dpr;
    const n = top.length + (extra ? 1 : 0);
    if (y0 + n * rowH + 8 * dpr > H * 0.75) return; // never cover the play area on a very small screen
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
      g.fillText(String(Math.round(p.m)), x0 + wBox - 7 * dpr, y);
    };
    top.forEach((p, i) => drawRow(p, i + 1, y0 + 4 * dpr + (i + 0.5) * rowH));
    if (extra) drawRow(extra, meIdx + 1, y0 + 4 * dpr + (top.length + 0.5) * rowH);
    g.globalAlpha = 1;
  }

  /** Who is first and by how much, always on screen, big enough to read on a phone: the leader and the gap to you (or your lead). */
  private leadStrip(f: Frame, alive: readonly PlayerSnap[]) {
    const { g, W, H, dpr } = f;
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
    const { g, W, H, dpr, scale } = f;
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
    const { g, W, H, dpr } = f;
    const size = Math.max(84 * dpr, Math.min(150 * dpr, Math.min(W, H) * 0.24));
    const pad = 10 * dpr;
    const x0 = W - size - pad;
    const y0 = pad;
    const k = size / Math.max(f.world.w, f.world.h);
    const { scale } = f;
    const left = f.cam.x - W / 2 / scale, right = f.cam.x + W / 2 / scale, top = f.cam.y - H / 2 / scale, bottom = f.cam.y + H / 2 / scale;
    g.globalAlpha = 0.9;
    g.fillStyle = "rgba(5,8,25,0.72)";
    g.fillRect(x0, y0, f.world.w * k, f.world.h * k);
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 1 * dpr;
    g.strokeRect(x0, y0, f.world.w * k, f.world.h * k);
    g.strokeStyle = "#ff3b4a";
    g.lineWidth = 1.5 * dpr;
    g.beginPath();
    g.arc(x0 + f.zone.cx * k, y0 + f.zone.cy * k, Math.max(1, f.zone.r * k), 0, Math.PI * 2);
    g.stroke();
    const tg = f.zone.target;
    if (tg) {
      g.setLineDash([3 * dpr, 3 * dpr]);
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1 * dpr;
      g.beginPath();
      g.arc(x0 + tg.cx * k, y0 + tg.cy * k, Math.max(2 * dpr, tg.r * k), 0, Math.PI * 2);
      g.stroke();
      g.setLineDash(NO_DASH);
    }
    g.strokeStyle = "rgba(255,255,255,0.45)";
    g.lineWidth = 1 * dpr;
    g.strokeRect(
      x0 + Math.max(0, left) * k, y0 + Math.max(0, top) * k,
      (Math.min(f.world.w, right) - Math.max(0, left)) * k, (Math.min(f.world.h, bottom) - Math.max(0, top)) * k,
    );
    for (let i = 0; i < alive.length; i++) {
      const p = alive[i];
      const mine = p.w === f.you;
      g.fillStyle = mine ? "#ffffff" : p.role === "saboteur" ? SABOTEUR_COLOR : this.styleFor(p).rim;
      g.beginPath();
      g.arc(x0 + p.head[0] * k, y0 + p.head[1] * k, (mine ? 3.2 : 2) * dpr, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

const NO_DASH: number[] = [];


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
