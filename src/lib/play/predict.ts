// Client side prediction for the arena. Pure math, no DOM, no clock.
//
// The server (~/goshi-escrow/server/src/game/arena.ts) decides everything. What it sends is always a little old:
// half the round trip plus the time since the snapshot arrived. This file moves what is DRAWN forward to where the
// server will be by the time the player sees it, using the same speed and turn rules, so the head on screen is where
// the collisions are decided. Nothing here changes any rule or result.

export type Pt = [number, number];

/** Same constants as the server arena. */
export const TURN_RATE = (270 * Math.PI) / 180;
export const BOOST_SPEED = 1.7;
export const MIN_MASS = 12;
export const START_MASS = 20;
/** Seconds into the match during which nobody can die. */
export const PROTECT_SECONDS = 3;
/** Beyond this error (world units) the drawn head is moved at once instead of gliding. */
export const SNAP_DISTANCE = 60;
/** Never extrapolate further than this: after it the picture is a guess, so it holds. */
export const MAX_EXTRAPOLATE_S = 0.4;
/** Time constant of the error correction (seconds). */
export const CORRECTION_TAU_S = 0.1;

export const speedOf = (mass: number): number => 135 / (1 + Math.max(0, mass) / 600);
/** Turn rate for a mass (radians per second). Same formula as the server. */
export const turnRateOf = (mass: number): number => TURN_RATE / (1 + 0.35 * Math.log(1 + Math.max(0, mass - START_MASS) / 60));
export const bodyRadius = (mass: number): number => 10 + 1.1 * Math.sqrt(Math.max(0, mass));

/** Speed with the boost applied (the boost does nothing at the minimum mass). */
export const effectiveSpeed = (mass: number, boost: boolean): number =>
  speedOf(mass) * (boost && mass > MIN_MASS ? BOOST_SPEED : 1);

export const normalizeAngle = (a: number): number => {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
};

/** Signed shortest turn from `from` to `to`, in -PI..PI. */
export const angleDiff = (from: number, to: number): number => normalizeAngle(to - from);

/** Turns `heading` toward `want` by at most `rate * dt`. */
export function turnToward(heading: number, want: number, dt: number, rate: number = TURN_RATE): number {
  const maxTurn = rate * Math.max(0, dt);
  const d = angleDiff(heading, want);
  return normalizeAngle(heading + Math.max(-maxTurn, Math.min(maxTurn, d)));
}

export const headingOf = (dx: number, dy: number): number => Math.atan2(dy, dx);

export interface Kin { x: number; y: number; h: number }

/** One step of the local head: turn toward `want` (or keep the heading when null), then move along the new heading. */
export function advance(k: Kin, want: number | null, speed: number, dt: number, rate: number = TURN_RATE): Kin {
  const h = want === null ? k.h : turnToward(k.h, want, dt, rate);
  return { x: k.x + Math.cos(h) * speed * dt, y: k.y + Math.sin(h) * speed * dt, h };
}

/** Where a head will be after `dt` seconds going straight along `h`. */
export function ahead(head: Pt, h: number, speed: number, dt: number): Pt {
  const d = Math.min(Math.max(0, dt), MAX_EXTRAPOLATE_S);
  return [head[0] + Math.cos(h) * speed * d, head[1] + Math.sin(h) * speed * d];
}

/** Exponential smoothing factor for a frame of `dt` seconds with time constant `tau`. */
export const smoothingFactor = (dt: number, tau: number = CORRECTION_TAU_S): number => 1 - Math.exp(-Math.max(0, dt) / tau);

/**
 * Moves the drawn position toward the reference the server implies. Small errors are absorbed smoothly, a big one
 * (above `snapDistance`) is taken at once. Heading is left alone: it already follows the player's own input.
 */
export function reconcile(
  local: Kin,
  ref: Pt,
  dt: number,
  snapDistance: number = SNAP_DISTANCE,
  tau: number = CORRECTION_TAU_S,
): { kin: Kin; snapped: boolean; error: number } {
  const ex = ref[0] - local.x;
  const ey = ref[1] - local.y;
  const error = Math.hypot(ex, ey);
  if (error > snapDistance) return { kin: { x: ref[0], y: ref[1], h: local.h }, snapped: true, error };
  const k = smoothingFactor(dt, tau);
  return { kin: { x: local.x + ex * k, y: local.y + ey * k, h: local.h }, snapped: false, error };
}

// ------------------------------------------------------------------ paths

export function pathLength(points: readonly Pt[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return n;
}

/** The first `length` units of a path (the rest is cut off, ending exactly on the cut). */
export function trimPath(points: readonly Pt[], length: number): Pt[] {
  if (points.length === 0) return [];
  const out: Pt[] = [points[0]];
  let left = Math.max(0, length);
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (seg <= left) {
      out.push(points[i]);
      left -= seg;
    } else {
      if (seg > 0 && left > 0) {
        const f = left / seg;
        out.push([points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f]);
      }
      break;
    }
  }
  return out;
}

/**
 * Puts a snake's head at `newHead` (ahead of where the snapshot had it) and keeps the body a continuous path of the
 * same length: the path from the new head to the old head is added in front and the same length is cut off the tail.
 * `body` does not include the head (as in the snapshots). Returns the new body.
 */
export function extendBody(head: Pt, body: readonly Pt[], newHead: Pt): Pt[] {
  const gap = Math.hypot(newHead[0] - head[0], newHead[1] - head[1]);
  if (gap < 0.25) return body.slice() as Pt[];
  const old: Pt[] = [head, ...body];
  const total = pathLength(old);
  const trimmed = trimPath([newHead, ...old], total);
  return trimmed.slice(1);
}

/**
 * Same as extendBody, written into `out` (its tuples are reused) so a frame allocates nothing. `body` and `out` must be
 * different arrays. Returns the number of points written (out.length is set to it).
 */
export function extendBodyInto(out: Pt[], hx: number, hy: number, body: readonly Pt[], nx: number, ny: number): number {
  const n = body.length;
  let len = 0;
  let px = hx, py = hy;
  for (let i = 0; i < n; i++) { len += Math.hypot(body[i][0] - px, body[i][1] - py); px = body[i][0]; py = body[i][1]; }
  let remain = len;
  let ax = nx, ay = ny;
  let w = 0;
  for (let i = 0; i <= n; i++) {
    const cx = i === 0 ? hx : body[i - 1][0];
    const cy = i === 0 ? hy : body[i - 1][1];
    const seg = Math.hypot(cx - ax, cy - ay);
    let ox = cx, oy = cy;
    const cut = seg > remain;
    if (cut && seg > 0) { const r = remain / seg; ox = ax + (cx - ax) * r; oy = ay + (cy - ay) * r; }
    const t = out[w];
    if (t) { t[0] = ox; t[1] = oy; } else out[w] = [ox, oy];
    w++;
    if (cut) break;
    remain -= seg;
    ax = cx; ay = cy;
  }
  out.length = w;
  return w;
}

// ------------------------------------------------------------------ others

export interface HeadSample { x: number; y: number }

/**
 * Speed of another player from two consecutive snapshots `dt` seconds apart. The snapshot has no boost flag, so a
 * boost shows as a faster move. Falls back to the formula when the distance is not credible (a respawn, rounding).
 */
export function observedSpeed(prev: HeadSample, cur: HeadSample, mass: number, dt: number): number {
  return observedSpeedXY(prev.x, prev.y, cur.x, cur.y, mass, dt);
}

/** Same as observedSpeed with plain numbers (no objects, for the per frame path). */
export function observedSpeedXY(px: number, py: number, cx: number, cy: number, mass: number, dt: number): number {
  const base = speedOf(mass);
  if (!(dt > 0.01)) return base;
  const v = Math.hypot(cx - px, cy - py) / dt;
  if (!Number.isFinite(v)) return base;
  return Math.max(base * 0.9, Math.min(base * BOOST_SPEED * 1.05, v));
}

// ------------------------------------------------------------------ round trip

/** Smoothed round trip time, fed with ping/pong pairs. */
export class RttMeter {
  private est: number | null = null;
  /** Latest sample (ms). */
  last = 0;
  private sentAt: number | null = null;

  /** A ping was sent at local time `now` (ms). */
  sent(now: number): void {
    this.sentAt = now;
  }

  /** The pong arrived at `now`. Returns the sample or null when no ping was pending. */
  received(now: number): number | null {
    if (this.sentAt === null) return null;
    const sample = Math.max(0, now - this.sentAt);
    this.sentAt = null;
    this.last = sample;
    // A fast reaction to a worse connection, a slow one to a better one, so a spike is not hidden.
    this.est = this.est === null ? sample : sample > this.est ? this.est * 0.5 + sample * 0.5 : this.est * 0.8 + sample * 0.2;
    return sample;
  }

  /** Smoothed round trip in ms, or `fallback` before the first measurement. */
  get ms(): number {
    return this.est ?? 0;
  }

  get known(): boolean {
    return this.est !== null;
  }
}

/** Seconds to look ahead for what the player sees: time since the snapshot arrived plus one way latency. */
export function lookAheadSeconds(sinceArrivalMs: number, rttMs: number): number {
  return Math.max(0, sinceArrivalMs + rttMs / 2) / 1000;
}
