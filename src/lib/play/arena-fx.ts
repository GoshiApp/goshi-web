// Visual effects and small look decisions for the arena canvas: orb tiers, particles, rings, shake, the boost fuel.
// The pools are fixed size typed arrays, so a burst or a trail allocates nothing while a match runs. No DOM here
// (the draw methods take a context), so the logic is unit tested.
//
// The visual language (dark navy board, faint grid, glowing neon bodies with a bright head and two eyes, soft glowing
// pellets, a nitro bar) follows the .io style of the MIT licensed projects listed in THIRD_PARTY_NOTICES.md.

import { MIN_MASS } from "./predict.ts";

// ------------------------------------------------------------------ orbs

/** 0 small, 1 medium, 2 large, 3 loot (what a dead player leaves behind). */
export type OrbTier = 0 | 1 | 2 | 3;

/** The map spawns orbs of value 1, 2 and 4. Anything else is loot (a body turned into orbs), and is drawn bigger and golden. */
export function orbTier(value: number, loot: boolean = false): OrbTier {
  if (loot || !Number.isInteger(value) || value < 1 || value > 4) return 3;
  return value >= 4 ? 2 : value >= 2 ? 1 : 0;
}

/** Radius multiplier of a tier on top of the mass based radius, so a value 4 orb and loot stand out. */
export const TIER_SCALE: readonly [number, number, number, number] = [1, 1.1, 1.4, 1.55];

/** Base color of a tier (the sprite is a soft glow of it). */
export const TIER_COLOR: readonly [string, string, string, string] = ["#7be3c3", "#8ab4ff", "#f7d46a", "#ffe9a8"];

/** A gentle size pulse for an orb, different per orb so they do not breathe together. */
export const orbPulse = (nowMs: number, id: number): number => 1 + 0.12 * Math.sin(nowMs / 420 + id * 1.7);

// ------------------------------------------------------------------ boost

/** The share of your mass the boost can still burn before it stops at the minimum: 0 (nothing) to 1. */
export function boostFuel(mass: number): number {
  if (!(mass > MIN_MASS)) return 0;
  return Math.min(1, (mass - MIN_MASS) / mass);
}

/** Seconds a held boost lasts from this mass (it costs 1.5% of the mass each second, never below the minimum). */
export function boostSeconds(mass: number): number {
  if (!(mass > MIN_MASS)) return 0;
  return Math.log(mass / MIN_MASS) / -Math.log(1 - 0.015);
}

// ------------------------------------------------------------------ shake

/** Screen shake: amplitude (px) decays exponentially; the offset is a cheap deterministic wobble. */
export function shakeAmplitude(startAmp: number, sinceMs: number, halfLifeMs: number = 110): number {
  if (sinceMs < 0) return startAmp;
  const a = startAmp * Math.pow(0.5, sinceMs / halfLifeMs);
  return a < 0.2 ? 0 : a;
}

export function shakeOffset(amp: number, nowMs: number): [number, number] {
  return [amp * Math.sin(nowMs * 0.087), amp * Math.cos(nowMs * 0.071)];
}

// ------------------------------------------------------------------ pools

export const Kind = { Particle: 0, Ring: 1, Spark: 2 } as const;
export type KindId = (typeof Kind)[keyof typeof Kind];

/** A fixed size pool of short lived effects: particles (burst bits), rings (eat pops) and sparks (boost trail). */
export class FxPool {
  readonly cap: number;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly size: Float32Array;
  private readonly col: Uint8Array;
  private readonly kind: Uint8Array;
  private n = 0;

  constructor(cap: number = 320) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.col = new Uint8Array(cap);
    this.kind = new Uint8Array(cap);
  }

  get count(): number {
    return this.n;
  }

  clear(): void {
    this.n = 0;
  }

  /** Adds one effect. When the pool is full the oldest-ending slot is not touched: the new one is dropped. */
  add(kind: KindId, x: number, y: number, vx: number, vy: number, lifeS: number, size: number, color: number): boolean {
    if (this.n >= this.cap) return false;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = lifeS; this.max[i] = lifeS; this.size[i] = size; this.col[i] = color; this.kind[i] = kind;
    return true;
  }

  /** `count` bits flying out of a point (a snake that dies, along its body). `rand` is injected for tests. */
  burst(x: number, y: number, count: number, speed: number, size: number, color: number, rand: () => number = Math.random): void {
    for (let k = 0; k < count; k++) {
      const a = rand() * Math.PI * 2;
      const s = speed * (0.35 + rand() * 0.65);
      this.add(Kind.Particle, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.45 + rand() * 0.45, size * (0.6 + rand() * 0.8), color);
    }
  }

  /** The ring where an orb was eaten. */
  pop(x: number, y: number, size: number, color: number): void {
    this.add(Kind.Ring, x, y, 0, 0, 0.32, size, color);
  }

  /** Two coins fusing: a beam of bits flows from one into the other (each arrives as its life ends), then rings swell where they meet. */
  fuse(ax: number, ay: number, bx: number, by: number, size: number, color: number, rand: () => number = Math.random): void {
    const d = Math.hypot(bx - ax, by - ay) || 1;
    const speed = Math.max(220, d / 0.55);
    const ux = (bx - ax) / d, uy = (by - ay) / d;
    for (let k = 0; k < 18; k++) {
      const t = k / 18;
      const x = ax + (bx - ax) * t + (rand() - 0.5) * size * 0.6, y = ay + (by - ay) * t + (rand() - 0.5) * size * 0.6;
      const left = Math.hypot(bx - x, by - y);
      this.add(Kind.Spark, x, y, ux * speed, uy * speed, Math.max(0.05, left / speed), size * (0.35 + rand() * 0.3), color);
    }
    this.add(Kind.Ring, bx, by, 0, 0, 0.5, size * 1.6, color);
    this.add(Kind.Ring, bx, by, 0, 0, 0.8, size * 2.6, color);
    this.burst(bx, by, 10, 140, size * 0.45, color, rand);
  }

  /** One boost trail sparkle. */
  spark(x: number, y: number, size: number, color: number, rand: () => number = Math.random): void {
    this.add(Kind.Spark, x + (rand() - 0.5) * size * 2, y + (rand() - 0.5) * size * 2, (rand() - 0.5) * 40, (rand() - 0.5) * 40, 0.35 + rand() * 0.25, size * 0.5, color);
  }

  step(dt: number): void {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Remove by moving the last one into this slot.
        const last = --this.n;
        if (i !== last) {
          this.x[i] = this.x[last]; this.y[i] = this.y[last]; this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last];
          this.life[i] = this.life[last]; this.max[i] = this.max[last]; this.size[i] = this.size[last];
          this.col[i] = this.col[last]; this.kind[i] = this.kind[last];
        }
        continue;
      }
      const drag = Math.max(0, 1 - 2.2 * dt);
      this.vx[i] *= drag;
      this.vy[i] *= drag;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      i++;
    }
  }

  /** Draws every effect in world units. `palette` is indexed by the color given when the effect was added. */
  draw(g: CanvasRenderingContext2D, palette: readonly string[], scale: number, left: number, right: number, top: number, bottom: number): void {
    const prevAlpha = g.globalAlpha;
    for (let i = 0; i < this.n; i++) {
      const x = this.x[i], y = this.y[i];
      if (x < left || x > right || y < top || y > bottom) continue;
      const t = this.life[i] / this.max[i];
      const color = palette[this.col[i]] ?? "#ffffff";
      if (this.kind[i] === Kind.Ring) {
        const r = this.size[i] * (1 + (1 - t) * 1.6);
        g.globalAlpha = Math.min(1, t * 1.3) * 0.9;
        g.strokeStyle = color;
        g.lineWidth = Math.max(1.5 / scale, this.size[i] * 0.25);
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.stroke();
      } else {
        g.globalAlpha = t;
        g.fillStyle = color;
        g.beginPath();
        g.arc(x, y, Math.max(1.2 / scale, this.size[i] * (0.5 + 0.5 * t)), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = prevAlpha;
  }
}
