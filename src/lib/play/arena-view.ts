// What the arena canvas needs to decide what to show. Pure functions (no DOM), so they are unit tested.

import { PROTECT_SECONDS, START_MASS, bodyRadius, type Pt } from "./predict.ts";

/** At the start your head is about this share of the shorter side of the screen. */
export const HEAD_SCREEN_FRACTION = 0.04;
/** The drawn head is a little larger than the body radius. */
export const HEAD_DRAW_SCALE = 1.12;
const MAX_SPAN = 1800;

/**
 * World units visible along the short side of the screen. At the start (mass 20) the head, drawn 2 * r * 1.12 wide,
 * is HEAD_SCREEN_FRACTION of it; it zooms out gently as the body radius grows, so a big snake never fills the screen.
 */
export function viewSpan(mass: number): number {
  const start = 2 * bodyRadius(START_MASS) * HEAD_DRAW_SCALE;
  const base = start / HEAD_SCREEN_FRACTION;
  const grow = bodyRadius(Math.max(START_MASS, mass)) / bodyRadius(START_MASS);
  return Math.min(MAX_SPAN, base * Math.pow(grow, 0.8));
}

/** Distance from point p to the polyline (0 for an empty path is Infinity). */
export function distanceToPath(p: Pt, path: readonly Pt[]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return Math.hypot(p[0] - path[0][0], p[1] - path[0][1]);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1][0], ay = path[i - 1][1];
    const bx = path[i][0], by = path[i][1];
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - ax) * vx + (p[1] - ay) * vy) / len2));
    const d = Math.hypot(p[0] - (ax + vx * t), p[1] - (ay + vy * t));
    if (d < best) best = d;
  }
  return best;
}

export interface BodyRef { w: string; path: readonly Pt[]; r: number }

/**
 * How close your head is to being on another body: 0 (not near) to 1 (touching). The warning starts when the head is
 * within two body radii of the other body, and it is full at the lethal distance (the server: r_other + 0.35 r_you).
 * A protected player cannot die, so it gets 0.
 */
export function dangerLevel(head: Pt, myRadius: number, others: readonly BodyRef[], protectedNow: boolean): { level: number; by: string | null } {
  if (protectedNow) return { level: 0, by: null };
  let level = 0;
  let by: string | null = null;
  for (const o of others) {
    const d = distanceToPath(head, o.path);
    const lethal = o.r + 0.35 * myRadius;
    const warn = o.r + 2 * myRadius;
    const l = d <= lethal ? 1 : d >= warn ? 0 : 1 - (d - lethal) / (warn - lethal);
    if (l > level) { level = l; by = o.w; }
  }
  return { level, by };
}

/** Whole seconds of spawn protection left (3, 2, 1), from the match clock; 0 when over. */
export function protectionSecondsLeft(matchMs: number, timeLeftMs: number): number {
  const elapsed = (matchMs - timeLeftMs) / 1000;
  const left = PROTECT_SECONDS - elapsed;
  return left > 0 ? Math.ceil(left) : 0;
}

export interface ZoneCircle { cx: number; cy: number; r: number }

/** Where the zone is from a head: whether the head is outside it, the direction to its center and the distance back in. */
export function zoneGuide(head: Pt, zone: ZoneCircle): { outside: boolean; angle: number; toCenter: number; overBy: number } {
  const dx = zone.cx - head[0];
  const dy = zone.cy - head[1];
  const toCenter = Math.hypot(dx, dy);
  return { outside: toCenter > zone.r, angle: Math.atan2(dy, dx), toCenter, overBy: Math.max(0, toCenter - zone.r) };
}

/** 1-based place among the alive players by mass (heavier first; a tie goes to the lower wallet, like the server). */
export function aliveRank(players: readonly { w: string; m: number; alive: boolean }[], me: string): { rank: number; of: number } | null {
  const alive = players.filter((p) => p.alive).sort((a, b) => b.m - a.m || (a.w < b.w ? -1 : 1));
  const i = alive.findIndex((p) => p.w === me);
  return i < 0 ? null : { rank: i + 1, of: alive.length };
}


/** Distance from p to a snake: its head point and the path of its body. No allocation (this runs every frame). */
export function distanceToSnake(p: Pt, head: Pt, body: readonly Pt[]): number {
  let best = Math.hypot(p[0] - head[0], p[1] - head[1]);
  let ax = head[0], ay = head[1];
  for (let i = 0; i < body.length; i++) {
    const bx = body[i][0], by = body[i][1];
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - ax) * vx + (p[1] - ay) * vy) / len2));
    const d = Math.hypot(p[0] - (ax + vx * t), p[1] - (ay + vy * t));
    if (d < best) best = d;
    ax = bx; ay = by;
  }
  return best;
}

export interface SnakeView { w: string; head: Pt; body: readonly Pt[]; r: number; alive: boolean }

/** Same as dangerLevel, straight from the snapshot players, without building arrays. `you` is skipped. */
export function dangerAmong(head: Pt, myRadius: number, snakes: readonly SnakeView[], you: string, protectedNow: boolean): number {
  if (protectedNow) return 0;
  let level = 0;
  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i];
    if (!s.alive || s.w === you) continue;
    const d = distanceToSnake(head, s.head, s.body);
    const lethal = s.r + 0.35 * myRadius;
    const warn = s.r + 2 * myRadius;
    const l = d <= lethal ? 1 : d >= warn ? 0 : 1 - (d - lethal) / (warn - lethal);
    if (l > level) level = l;
  }
  return level;
}

/**
 * Decides which labels are drawn so that none sits on another label or on a head. Heads are registered first as
 * blockers (with the owner they belong to: a label may touch its own head's box), then labels are tried in priority
 * order. Fixed size typed arrays, so a frame allocates nothing.
 */
export class LabelPlacer {
  private readonly x0 = new Float32Array(96);
  private readonly y0 = new Float32Array(96);
  private readonly x1 = new Float32Array(96);
  private readonly y1 = new Float32Array(96);
  private readonly owner = new Int16Array(96);
  private n = 0;

  reset(): void {
    this.n = 0;
  }

  /** A box nothing may be drawn over (a head). `owner` is an index, -1 for none. */
  block(x0: number, y0: number, x1: number, y1: number, owner: number = -1): void {
    this.add(x0, y0, x1, y1, owner);
  }

  /** Reserves the box and returns true when it does not overlap any box of another owner; false means do not draw it. */
  tryPlace(x0: number, y0: number, x1: number, y1: number, owner: number = -1): boolean {
    for (let i = 0; i < this.n; i++) {
      if (owner >= 0 && this.owner[i] === owner) continue;
      if (x0 < this.x1[i] && x1 > this.x0[i] && y0 < this.y1[i] && y1 > this.y0[i]) return false;
    }
    this.add(x0, y0, x1, y1, owner);
    return true;
  }

  private add(x0: number, y0: number, x1: number, y1: number, owner: number) {
    if (this.n >= this.x0.length) return;
    const i = this.n++;
    this.x0[i] = x0; this.y0[i] = y0; this.x1[i] = x1; this.y1[i] = y1; this.owner[i] = owner;
  }
}
