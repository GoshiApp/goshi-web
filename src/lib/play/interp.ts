// Smooths the 20 Hz snapshots from the server for drawing at the screen's frame rate.
// The picture is drawn a little in the past (renderDelayMs) so there are almost always two snapshots to blend.

import type { PlayerSnap, ZoneNow } from "./protocol.ts";
import { MAX_EXTRAPOLATE_S, ahead, extendBody, observedSpeed, observedSpeedXY, speedOf } from "./predict.ts";

export interface TimedSnap {
  /** Local time (ms) when the snapshot arrived. */
  at: number;
  /** Server tick, when known: two ticks are exactly 1000 / tickRate ms apart, whatever the network did. */
  tick?: number;
  players: PlayerSnap[];
  zone: ZoneNow;
}

export interface Sampled {
  players: PlayerSnap[];
  zone: ZoneNow;
}

/** Draw this far behind real time. Two snapshots at 20 Hz are 100 ms apart. */
export const RENDER_DELAY_MS = 120;
/** The live view blends only a little: about one snapshot interval plus a margin. */
export const LIVE_DELAY_MS = 60;
/** Snapshot interval of the server (20 Hz). */
export const TICK_MS = 50;
/** The live buffer never waits longer than this, whatever the network does. */
export const MAX_LIVE_DELAY_MS = 220;
/** Players are moved ahead by at most this much for the ping: more overshoots on every turn. */
export const MAX_LEAD_MS = 30;

/**
 * Live delay that fits the stream: one snapshot interval (50 ms at 20 Hz, 100 ms for viewers at 10 Hz) plus twice the
 * measured arrival jitter, never below LIVE_DELAY_MS nor above MAX_LIVE_DELAY_MS.
 */
export function adaptiveLiveDelay(intervalMs: number, jitterMs: number): number {
  const d = Math.max(0, intervalMs) + 2 * Math.max(0, jitterMs) + 10;
  return Math.min(MAX_LIVE_DELAY_MS, Math.max(LIVE_DELAY_MS, d));
}

/**
 * Turns arrival times into tick times: `at = tick * TICK_MS + offset`, where the offset follows the fastest arrivals
 * (a late packet does not move the clock) and drifts slowly up when the link gets slower. A tick that goes back or a
 * jump of more than a second (new match, reconnect) starts the clock again.
 */
export class TickClock {
  private offset: number | undefined;
  private lastTick = -1;
  /** Smoothed arrival jitter (ms). */
  jitterMs = 0;
  /** Smoothed interval between snapshots (ms) by their ticks. */
  intervalMs = TICK_MS;

  stamp(arrival: number, tick: number | undefined): number {
    if (tick === undefined) return arrival;
    const off = arrival - tick * TICK_MS;
    if (this.offset === undefined || tick <= this.lastTick || Math.abs(off - this.offset) > 1000) {
      this.offset = off;
      this.jitterMs = 0;
      this.intervalMs = TICK_MS;
    } else {
      this.intervalMs += ((tick - this.lastTick) * TICK_MS - this.intervalMs) * 0.1;
      const late = off - this.offset;
      this.jitterMs += (Math.abs(late) - this.jitterMs) * 0.1;
      // Earlier than expected: the clock was behind, follow at once. Later: drift up slowly.
      this.offset = late < 0 ? off : this.offset + late * 0.02;
    }
    this.lastTick = tick;
    return tick * TICK_MS + this.offset;
  }

  /** The live delay for the stream as measured so far. */
  delay(): number {
    return adaptiveLiveDelay(this.intervalMs, this.jitterMs);
  }
}
/** A jump larger than this between two snapshots is not movement (a bug or a reset): do not glide across the map. */
export const TELEPORT_DISTANCE = 250;
const MAX_KEPT = 24;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPoint = (a: [number, number], b: [number, number], t: number): [number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Blend of two snapshots at fraction t (0 = a, 1 = b). Players only in b, or dead in either, are shown as they are in b. */
export function blend(a: TimedSnap, b: TimedSnap, t: number): Sampled {
  const before = new Map(a.players.map((p) => [p.w, p]));
  const players = b.players.map((p) => {
    const q = before.get(p.w);
    if (!q || !q.alive || !p.alive) return p;
    if (Math.hypot(p.head[0] - q.head[0], p.head[1] - q.head[1]) > TELEPORT_DISTANCE) return p;
    // The body is a path that follows the head: blend the points that exist in both, keep the rest.
    const body = p.body.map((pt, i) => (q.body[i] ? lerpPoint(q.body[i], pt, t) : pt));
    return { ...p, head: lerpPoint(q.head, p.head, t), body, m: lerp(q.m, p.m, t), r: lerp(q.r, p.r, t) };
  });
  return { players, zone: { cx: lerp(a.zone.cx, b.zone.cx, t), cy: lerp(a.zone.cy, b.zone.cy, t), r: lerp(a.zone.r, b.zone.r, t) } };
}

/** Seconds between two snapshots: from the ticks when both have one, else from the arrival times. */
function gapSeconds(a: TimedSnap, b: TimedSnap): number {
  if (a.tick !== undefined && b.tick !== undefined && b.tick > a.tick) return ((b.tick - a.tick) * TICK_MS) / 1000;
  return Math.max(0, b.at - a.at) / 1000;
}

/** A player moved forward `extra` seconds along its heading (alive players only). `prev` is the snapshot before `cur`. */
export function extrapolatePlayer(p: PlayerSnap, prev: TimedSnap | null, cur: TimedSnap, extra: number): PlayerSnap {
  if (!p.alive || extra <= 0 || p.body.length === 0) return p;
  const before = prev?.players.find((q) => q.w === p.w);
  const after = cur.players.find((q) => q.w === p.w);
  let speed = speedOf(p.m);
  if (before && before.alive && after && prev) {
    speed = observedSpeed({ x: before.head[0], y: before.head[1] }, { x: after.head[0], y: after.head[1] }, p.m, gapSeconds(prev, cur));
  }
  const head = ahead(p.head, p.h, speed, extra);
  return { ...p, head, body: extendBody(p.head, p.body, head) };
}

export class SnapBuffer {
  private snaps: TimedSnap[] = [];

  push(snap: TimedSnap): void {
    const last = this.snaps[this.snaps.length - 1];
    if (last && snap.at <= last.at) return; // out of order or duplicate: ignore
    this.snaps.push(snap);
    if (this.snaps.length > MAX_KEPT) this.snaps.shift();
  }

  clear(): void {
    this.snaps = [];
  }

  get latest(): TimedSnap | null {
    return this.snaps[this.snaps.length - 1] ?? null;
  }

  /** The scene as it should be drawn at local time `now` (already shifted by the render delay). Null before the first snapshot. */
  sample(now: number, delay: number = RENDER_DELAY_MS): Sampled | null {
    const t = now - delay;
    const s = this.snaps;
    if (s.length === 0) return null;
    if (t <= s[0].at) return { players: s[0].players, zone: s[0].zone };
    const last = s[s.length - 1];
    if (t >= last.at) return { players: last.players, zone: last.zone }; // no extrapolation: hold the last known state
    for (let i = s.length - 1; i > 0; i--) {
      if (s[i - 1].at <= t) return blend(s[i - 1], s[i], (t - s[i - 1].at) / (s[i].at - s[i - 1].at));
    }
    return { players: s[0].players, zone: s[0].zone };
  }

  private readonly sampler = new LiveSampler();

  /**
   * The scene for the live view: a short blend (`delay`, about one snapshot) and every player moved forward along its
   * heading by half the round trip, so the picture is close to what the server has now. A snapshot that is late is
   * extrapolated (at most MAX_EXTRAPOLATE_S in total) instead of freezing. The zone is blended the same way, so a
   * drifting zone moves smoothly between snapshots.
   *
   * The result is built in buffers that are reused: it is valid until the next call. Nothing is allocated per frame.
   */
  sampleLive(now: number, rttMs: number, delay: number = LIVE_DELAY_MS): Sampled | null {
    const s = this.snaps;
    if (s.length === 0) return null;
    const t = now - delay;
    const lead = Math.min(MAX_LEAD_MS, Math.max(0, rttMs) / 2) / 1000;
    const last = s[s.length - 1];
    const prevLast = s.length > 1 ? s[s.length - 2] : null;
    if (t <= s[0].at) return this.sampler.build(null, s[0], 1, lead);
    if (t >= last.at) {
      // Late: hold the last blend, extrapolate players along their heading and the zone along its drift.
      const gap = prevLast ? Math.max(1, last.at - prevLast.at) : 1;
      return this.sampler.build(prevLast, last, 1 + (t - last.at) / gap, lead + (t - last.at) / 1000, true);
    }
    for (let i = s.length - 1; i > 0; i--) {
      if (s[i - 1].at <= t) {
        const a = s[i - 1], b = s[i];
        return this.sampler.build(a, b, (t - a.at) / (b.at - a.at), lead);
      }
    }
    return this.sampler.build(null, s[0], 1, lead);
  }
}

/** Blends two snapshots and extrapolates players into reusable objects (no allocation once warm). */
export class LiveSampler {
  private readonly slots = new Map<string, Slot>();
  private readonly players: PlayerSnap[] = [];
  private readonly zone: ZoneNow = { cx: 0, cy: 0, r: 0 };
  private readonly out: Sampled = { players: this.players, zone: this.zone };

  /**
   * `a` (may be null) and `b` are consecutive snapshots; `f` is where the scene is between them (0 = a, 1 = b, above 1
   * extrapolates the zone). `extra` seconds are added to every alive player along its heading. `held` means the blend
   * of the players stays at b (the snapshot is late).
   */
  build(a: TimedSnap | null, b: TimedSnap, f: number, extra: number, held: boolean = false): Sampled {
    const k = held ? 1 : Math.max(0, Math.min(1, f));
    const bp = b.players;
    this.players.length = bp.length;
    const dtSnap = a ? gapSeconds(a, b) : 0;
    for (let i = 0; i < bp.length; i++) {
      const p = bp[i];
      if (!p.alive || p.body.length === 0 && extra <= 0) { this.players[i] = p; continue; }
      let q: PlayerSnap | undefined = a?.players[i];
      if (a && (!q || q.w !== p.w)) q = a.players.find((x) => x.w === p.w);
      this.players[i] = this.fill(p, q && q.alive ? q : undefined, k, extra, dtSnap);
    }
    // The zone: linear between the two snapshots and beyond (the server moves it linearly), never negative.
    const z = this.zone;
    if (a) {
      const g = Math.max(0, Math.min(f, 2));
      z.cx = a.zone.cx + (b.zone.cx - a.zone.cx) * g;
      z.cy = a.zone.cy + (b.zone.cy - a.zone.cy) * g;
      z.r = Math.max(0, a.zone.r + (b.zone.r - a.zone.r) * g);
    } else {
      z.cx = b.zone.cx; z.cy = b.zone.cy; z.r = b.zone.r;
    }
    // What the zone is doing comes from the newest snapshot; the target only while it is announced or moving.
    z.target = b.zone.target;
    z.phase = b.zone.phase;
    z.state = b.zone.state;
    z.inMs = b.zone.inMs;
    return this.out;
  }

  private fill(p: PlayerSnap, q: PlayerSnap | undefined, k: number, extra: number, dtSnap: number): PlayerSnap {
    let slot = this.slots.get(p.w);
    if (!slot) {
      slot = { snap: { ...p, head: [0, 0], body: [] }, a: [], b: [] };
      this.slots.set(p.w, slot);
    }
    const o = slot.snap;
    o.w = p.w; o.n = p.n; o.role = p.role; o.bot = p.bot; o.alive = true; o.prot = p.prot; o.h = p.h;
    const blendIt = q !== undefined && k < 1 && Math.hypot(p.head[0] - q.head[0], p.head[1] - q.head[1]) <= TELEPORT_DISTANCE;
    let hx = p.head[0], hy = p.head[1];
    if (blendIt && q) {
      hx = q.head[0] + (hx - q.head[0]) * k;
      hy = q.head[1] + (hy - q.head[1]) * k;
      o.m = q.m + (p.m - q.m) * k;
      o.r = q.r + (p.r - q.r) * k;
    } else {
      o.m = p.m;
      o.r = p.r;
    }
    // The blended path in buffer A (tuples are reused).
    const A = slot.a;
    const n = p.body.length;
    for (let i = 0; i < n; i++) {
      const pt = p.body[i];
      let x = pt[0], y = pt[1];
      if (blendIt && q && q.body[i]) { x = q.body[i][0] + (x - q.body[i][0]) * k; y = q.body[i][1] + (y - q.body[i][1]) * k; }
      const t = A[i];
      if (t) { t[0] = x; t[1] = y; } else A[i] = [x, y];
    }
    A.length = n;
    // Extrapolate the head along its heading with its observed speed, keep the length of the snake.
    let speed = speedOf(o.m);
    if (q && dtSnap > 0) speed = observedSpeedXY(q.head[0], q.head[1], p.head[0], p.head[1], o.m, dtSnap);
    const d = Math.min(Math.max(0, extra), MAX_EXTRAPOLATE_S);
    const nx = hx + Math.cos(p.h) * speed * d;
    const ny = hy + Math.sin(p.h) * speed * d;
    const gap = Math.hypot(nx - hx, ny - hy);
    const B = slot.b;
    if (gap < 0.25) {
      o.head[0] = hx; o.head[1] = hy;
      for (let i = 0; i < n; i++) { const t = B[i]; if (t) { t[0] = A[i][0]; t[1] = A[i][1]; } else B[i] = [A[i][0], A[i][1]]; }
      B.length = n;
    } else {
      // Total length of the old path (head then body); the new path is the head's new place plus that path, cut there.
      let len = 0;
      let px = hx, py = hy;
      for (let i = 0; i < n; i++) { len += Math.hypot(A[i][0] - px, A[i][1] - py); px = A[i][0]; py = A[i][1]; }
      let remain = len;
      let ax = nx, ay = ny;
      let w = 0;
      for (let i = 0; i <= n; i++) {
        const cx = i === 0 ? hx : A[i - 1][0];
        const cy = i === 0 ? hy : A[i - 1][1];
        const seg = Math.hypot(cx - ax, cy - ay);
        let ox = cx, oy = cy;
        const cut = seg > remain;
        if (cut && seg > 0) { const r = remain / seg; ox = ax + (cx - ax) * r; oy = ay + (cy - ay) * r; }
        const t = B[w];
        if (t) { t[0] = ox; t[1] = oy; } else B[w] = [ox, oy];
        w++;
        if (cut) break;
        remain -= seg;
        ax = cx; ay = cy;
      }
      B.length = w;
      o.head[0] = nx; o.head[1] = ny;
    }
    o.body = B;
    return o;
  }
}

interface Slot { snap: PlayerSnap; a: [number, number][]; b: [number, number][] }
