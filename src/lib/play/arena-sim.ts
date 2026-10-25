// A copy of server/src/game/arena.ts of goshi-escrow (the rules of the arena). The replay viewer uses it to play a match record again,
// so keep it identical to the server file: the same record must give the same match on both sides.
// Battle royale arena with solid bodies. Pure and deterministic: no network, no clock, no I/O.
// The rules are in server/PROTOCOL.md (section "Game rules").

/** A player whose connection drops is played by the bot and cannot be hurt for this long. It is part of the match record. */
export const AWAY_PROTECT_S = 20;
/** While the bot plays a body for a player who is not there, the body does not eat and loses this share of its mass per second. */
export const AWAY_DRAIN_PER_S = 0.03;
/** When they come back they get this long to find their body and steer. */
export const BACK_PROTECT_S = 5;
/** How many times a player may drop and be covered in one match (a flapping connection must not be a shield). */
export const MAX_AWAYS = 2;

export const ARENA = {
  w: 3000,
  h: 3000,
  matchMs: 300_000,
  shrinkStartMs: 120_000,
  tickRate: 20,
  zoneR0: 1450,
  zoneRMin: 150,
  startMass: 20,
  minMass: 12,
  orbTarget: 600,
  orbValues: [1, 2, 4] as const,
  maxBodySegments: 150,
  segmentSpacing: 10,
  trailSpacing: 5, // distance between stored path points (segmentSpacing is a multiple)
  protectSeconds: 8, // nobody can die in the first seconds of a match (time to find the screen and the mouse)
  turnRate: (270 * Math.PI) / 180,
  boostSpeed: 1.7,
  boostCostPerSecond: 0.015,
  deathMass: 5,
  maxDeathOrbs: 80,
  /** Every so often a cluster of rich coins lands inside the safe zone and pulls everybody toward it. */
  airdropEveryS: 30,
  airdropOrbs: 6,
  airdropValue: 4,
} as const;

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
}

export type Role = "paid" | "saboteur";
export interface Orb {
  id: number;
  x: number;
  y: number;
  v: number;
  /** Rules 5, a room paid by bag: the lamports this coin is worth (the pot is minted into coins). */
  l?: number;
}
export interface Player {
  w: string;
  n: string;
  role: Role;
  bot: boolean;
  alive: boolean;
  m: number;
  peak: number;
  x: number;
  y: number;
  heading: number;
  dx: number;
  dy: number;
  boost: boolean;
  /** Path of the head, newest first, one point every `trailSpacing` units. */
  trail: [number, number][];
  /** Seconds into the match until which the player cannot die. */
  protectUntil: number;
  /** True while the bot plays this body because the person's connection dropped. */
  auto?: boolean;
  /** How many times this player was covered after a dropped connection. */
  aways?: number;
  /** Seconds into the match when it died; -1 while alive. */
  diedAt: number;
  killer: string;
  /** Rules 6: the shield of the boss lasts until this time, and can be raised again from shieldReady. */
  shieldUntil?: number;
  shieldReady?: number;
  /** Rules 6: when the body started to cash out (it leaves the arena CASHOUT_S later if still alive), and what it took out. */
  cashoutAt?: number;
  banked?: number;
  /** Rules 5, a room paid by bag: the lamports of the coins this body carries. */
  bag?: number;
}

export interface Death {
  w: string;
  by: string; // wallet, "zone" or "wall"
}
export interface StepResult {
  eatenOrbs: number[];
  newOrbs: Orb[];
  deaths: Death[];
}

// Sized like the .io snake games: a head is about 15 units wide at the start and moves about 9 radii per second.
/**
 * The rules of the arena come in versions, and a match record says which one it was played with (see the server file):
 *  1: the first version. 2: bodies grow in proportion, a heavy body is a little slower only, a body three times heavier than
 *  another eats it by bites instead of dying on it, and the more a body weighs the richer the orbs it leaves.
 */
export type RulesVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/**
 * Rules 8: the pot is not cut in equal coins. Each coin gets a weight from a fixed sequence (many small, some middling, a few
 * big ones, up to thirteen times the smallest) and its share of the lamports follows the weight; the remainder of the integer
 * division goes to the heaviest one, so the sum is exact. Returns the shares and the weights.
 */
export function unevenSplit(total: number, n: number, salt: number): { parts: number[]; weights: number[] } {
  const weights: number[] = [];
  for (let k = 0; k < n; k++) { const f = ((k + salt) * 0.6180339887498949) % 1; weights.push(0.15 + f * 0.6 + f * f * f * 2.5); }
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  let big = 0;
  for (let k = 1; k < n; k++) if (weights[k] > weights[big]) big = k;
  parts[big] += total - parts.reduce((a, b) => a + b, 0);
  return { parts, weights };
}
/** Rules 7: when three bodies are left, the zone holds still this long so they can gather the coins lying around. */
export const FINAL3_FREEZE_S = 10;
export const RULES_NOW: RulesVersion = 3;
let activeRules: RulesVersion = RULES_NOW;
/**
 * Rules 4 (the test network first): nothing left to chance but where a dead body's coins land. The zone closes on the center,
 * the coins and the showers fall on a fixed public pattern (a golden-angle spiral), the starts are an exact ring. A new arena
 * uses the default set here; a record keeps the version it was played with.
 */
let defaultRules: RulesVersion = RULES_NOW;
export const setDefaultRules = (v: RulesVersion): void => { defaultRules = v; };
/** The golden angle and the fractional part of n times the golden ratio: an even, fixed spread with no randomness. */
const goldenFrac = (n: number) => (n * 0.6180339887498949) % 1;
/**
 * An even, fixed spread over a disc with no randomness: the R2 sequence (two unrelated irrational steps), so the angle and the
 * distance of point n never follow each other. (The golden angle with the golden fraction as distance are the same number in
 * disguise and lay every point on one spiral line.) Returns the angle in radians and the distance as a share of the radius.
 */
const R2A = 0.7548776662466927, R2B = 0.5698402909980532;
const spread = (n: number): [number, number] => [((0.5 + n * R2A) % 1) * Math.PI * 2, Math.sqrt((0.5 + n * R2B) % 1)];
export const setRules = (v: RulesVersion): void => { activeRules = v; };
export const rulesActive = (): RulesVersion => activeRules;
/** Radius of a body. Rules 8: past a mass of 200 it widens more slowly, so a giant (the boss) does not fill the map. */
export const bodyRadius = (m: number) => (activeRules === 1 ? 10 + 1.1 * Math.sqrt(m) : activeRules >= 8 && m > 200 ? 34.87 + (Math.sqrt(m) - 14.142) : 8 + 1.9 * Math.sqrt(m));
export const speedOf = (m: number) =>
  activeRules === 1 ? 135 / (1 + m / 600) : activeRules === 2 ? 135 / (1 + m / 2500) : 135 / (1 + 0.18 * Math.log(1 + Math.max(0, m) / 100));
/** Distance between two body points. Rules 3: a body heavier than 432 keeps getting longer (a quarter power of its mass). */
export const segmentSpacingOf = (m: number) =>
  activeRules >= 3 && m > 432 ? Math.min(MAX_SPACING, ARENA.segmentSpacing * Math.pow(m / 432, 0.25)) : ARENA.segmentSpacing;
const MAX_SPACING = 40;
/** Boost cost per second, as a share of the mass. Rules 3: cheaper, so a big body can still catch somebody. */
export const boostCostOf = () => (activeRules >= 3 ? 0.006 : ARENA.boostCostPerSecond);
/** Path points kept behind a head: enough for the longest body of the rules in use. */
export const trailKeep = () => Math.round((ARENA.maxBodySegments * (activeRules >= 3 ? MAX_SPACING : ARENA.segmentSpacing)) / ARENA.trailSpacing) + 6;
/** Turn rate in radians per second: a heavy body turns wider, but never becomes a slug (a log, not a hyperbola). */
export const turnRateOf = (m: number) => ARENA.turnRate / (1 + 0.35 * Math.log(1 + Math.max(0, m - ARENA.startMass) / 60));
export const segmentCount = (m: number) =>
  Math.max(6, Math.min(ARENA.maxBodySegments, 6 + Math.floor(m / 3)));

export interface Zone {
  cx: number;
  cy: number;
  r: number;
}

/** Radii of the safe zone phases: the start circle and five shrinks, the last one is the final circle. */
export const ZONE_RADII = [1450, 1050, 720, 460, 290, 150] as const;
export const ZONE_PHASES = ZONE_RADII.length - 1;
/** Each phase: the next circle is announced (warn), then the zone moves to it (shrink), then it holds. */
const WARN_FRAC = 0.2;
const SHRINK_FRAC = 0.35;

export interface ZonePlan {
  centers: { x: number; y: number }[]; // length ZONE_RADII.length, centers[0] is the arena center
  matchMs: number;
  shrinkStartMs: number;
}

/** Random, nested circles: every next circle lies completely inside the previous one but its center is somewhere else. */
export function buildZonePlan(rng: Rng, matchMs: number, shrinkStartMs: number, fixed = false): ZonePlan {
  const centers = [{ x: ARENA.w / 2, y: ARENA.h / 2 }];
  // Rules 4: every circle closes on the center, the same in every match.
  if (fixed) { for (let i = 0; i < ZONE_PHASES; i++) centers.push({ ...centers[0] }); return { centers, matchMs, shrinkStartMs }; }
  for (let i = 0; i < ZONE_PHASES; i++) {
    const room = ZONE_RADII[i] - ZONE_RADII[i + 1];
    const ang = rng.range(0, Math.PI * 2);
    const dist = rng.range(0.3, 0.92) * room;
    centers.push({ x: centers[i].x + Math.cos(ang) * dist, y: centers[i].y + Math.sin(ang) * dist });
  }
  return { centers, matchMs, shrinkStartMs };
}

export interface ZoneState extends Zone {
  /** 0 before the first announcement, 1..5 for the phases. */
  phase: number;
  state: "calm" | "warn" | "shrink" | "hold";
  /** Seconds until the state changes (0 when it never does). */
  inSeconds: number;
  /** The circle the zone is moving to, while it is announced or moving. */
  target: Zone | null;
}

/** The safe zone at time t (seconds). */
export function zoneState(t: number, plan: ZonePlan): ZoneState {
  const start = plan.shrinkStartMs / 1000;
  const span = plan.matchMs / 1000 - start;
  const L = span / ZONE_PHASES;
  const warn = L * WARN_FRAC;
  const shrink = L * SHRINK_FRAC;
  const c0 = plan.centers[0];
  if (t < start) {
    // The first target is announced a few seconds before the shrink begins.
    const lead = 5;
    const showing = t >= start - lead;
    return {
      cx: c0.x, cy: c0.y, r: ZONE_RADII[0], phase: 0, state: showing ? "warn" : "calm", inSeconds: start - t,
      target: showing ? { cx: plan.centers[1].x, cy: plan.centers[1].y, r: ZONE_RADII[1] } : null,
    };
  }
  const i = Math.min(ZONE_PHASES - 1, Math.floor((t - start) / L));
  const local = t - (start + i * L);
  const from = plan.centers[i];
  const to = plan.centers[i + 1];
  const r0 = ZONE_RADII[i];
  const r1 = ZONE_RADII[i + 1];
  const target = { cx: to.x, cy: to.y, r: r1 };
  if (local < warn) return { cx: from.x, cy: from.y, r: r0, phase: i + 1, state: "warn", inSeconds: warn - local, target };
  if (local < warn + shrink) {
    const f = (local - warn) / shrink;
    return {
      cx: from.x + (to.x - from.x) * f, cy: from.y + (to.y - from.y) * f, r: r0 + (r1 - r0) * f,
      phase: i + 1, state: "shrink", inSeconds: warn + shrink - local, target,
    };
  }
  const last = i === ZONE_PHASES - 1;
  return { cx: to.x, cy: to.y, r: r1, phase: i + 1, state: "hold", inSeconds: last ? 0 : L - local, target: null };
}

/** Outside the zone a player loses mass every second: 10 percent plus 3, harsher in later phases. */
export function zoneDamagePerSecond(mass: number, phase: number): number {
  return (mass * 0.1 + 3) * (1 + 0.3 * Math.max(0, phase - 1));
}

/** Body points of a player, head first, spaced `segmentSpacing` apart along its path. */
export function bodyPoints(p: Player): [number, number][] {
  const step = segmentSpacingOf(p.m) / ARENA.trailSpacing;
  const n = segmentCount(p.m);
  const out: [number, number][] = [[p.x, p.y]];
  for (let k = 1; k <= n; k++) {
    const idx = Math.round(k * step) - 1;
    if (idx >= p.trail.length) break;
    out.push(p.trail[idx]);
  }
  return out;
}

export const TRAP_LASER = 1;
export const TRAP_SLOW = 2;
export type TrapKind = typeof TRAP_LASER | typeof TRAP_SLOW | typeof POWER_KAMIKAZE | typeof POWER_SHIELD | typeof POWER_CASHOUT;
/**
 * Rules 6, the boss: the heaviest body alive, when it weighs at least BOSS_MIN_MASS and twice the next one. Every BOSS_CYCLE_S
 * seconds it is announced (BOSS_WARN_S ahead) and then exposed for BOSS_OPEN_S: its tail (the last quarter of its body) can be bitten by any
 * head without dying, each bite takes BOSS_BITE of its mass (half to the biter, half on the floor with the same share of its bag).
 * Against it: the kamikaze (a body near it blows up and takes up to KAMIKAZE_TAKE of its mass, the kamikaze dies). Its answer:
 * the shield (no bites and no kamikaze for SHIELD_S, once every SHIELD_CD_S, costs SHIELD_COST of its mass).
 * Cash out: a body channels CASHOUT_S at half speed; if it is still alive it leaves the arena with what it carries.
 */
export const POWER_KAMIKAZE = 3;
export const POWER_SHIELD = 4;
export const POWER_CASHOUT = 5;
export const BOSS_MIN_MASS = 300;
export const BOSS_LEAD = 2;
export const BOSS_CYCLE_S = 30;
export const BOSS_WARN_S = 5;
export const BOSS_OPEN_S = 4;
export const BOSS_BITE = 0.01;
export const KAMIKAZE_R = 320;
/** Rules 6: only the last quarter of the boss (its tail) is exposed. */
export const BOSS_TAIL = 0.75;
export const KAMIKAZE_TAKE = 0.15;
export const SHIELD_S = 4;
export const SHIELD_CD_S = 25;
export const SHIELD_COST = 0.05;
export const CASHOUT_S = 5;
export const TRAP_LASER_S = 3;
export const TRAP_LASER_HALF = 130;
/** Share of the mass a laser takes from a head it touches (and gives to its owner). */
export const TRAP_LASER_TAKE = 0.1;
export const TRAP_SLOW_S = 6;
export const TRAP_SLOW_R = 110;
export const TRAP_SLOW_FACTOR = 0.5;
/** Price of each trap as a share of the entry fee (percent), paid from the backpack. */
/** Price of a trap or a power, in percent of the entry fee (paid from the backpack, or from the bag in a room paid by bag). */
export const TRAP_PRICE_PCT: Readonly<Record<TrapKind, number>> = { 1: 10, 2: 5, 3: 0, 4: 5, 5: 0 };
export interface Trap { kind: number; owner: string; /** Heads this laser already hit. */ hit: string[]; x: number; y: number; x2: number; y2: number; r: number; until: number }

/** Distance from a point to a segment. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

export class Arena {
  readonly rng: Rng;
  readonly players: Player[] = [];
  orbs: Orb[] = [];
  time = 0; // seconds
  private nextOrbId = 1;
  readonly matchMs: number;
  /** The version of the rules this match is played with. */
  readonly rules: RulesVersion;
  readonly shrinkStartMs: number;
  readonly zonePlan: ZonePlan;
  /** Every change of steering or boost of every player, as [tick, player index, angle byte, boost]. This is the match record. */
  readonly inputLog: [number, number, number, number][] = [];
  private stepN = 0;
  private lastKey: number[] = [];
  /** Traps on the map (rules 3): a laser behind a tail kills a head that touches it, a puddle slows the heads in it. */
  traps: Trap[] = [];
  private pendingTraps: { pi: number; kind: number }[] = [];

  /** A player sets a trap behind its tail; it is placed at the next step and written in the record (flag 4). */
  queueTrap(pi: number, kind: TrapKind): boolean {
    const p = this.players[pi];
    if (!p || !p.alive || this.rules < 3) return false;
    if (kind !== TRAP_LASER && kind !== TRAP_SLOW && (this.rules < 6 || !this.powerAllowed(p, kind))) return false;
    if (this.spellCost(kind) > (p.bag ?? 0)) return false;
    this.pendingTraps.push({ pi, kind });
    return true;
  }

  /** Rules 6: whether this body may use this power now (the boss is near for a kamikaze, it is the boss for a shield...). */
  powerAllowed(p: Player, kind: number): boolean {
    if (kind === POWER_KAMIKAZE) {
      const b = this.boss();
      return !!b && b !== p && (b.shieldUntil ?? 0) <= this.time && this.nearestPoint(b, p.x, p.y) >= 0;
    }
    if (kind === POWER_SHIELD) return this.boss() === p && (p.shieldReady ?? 0) <= this.time;
    if (kind === POWER_CASHOUT) return p.cashoutAt === undefined;
    return false;
  }
  /** Rules 6: the boss, the heaviest body alive when it weighs at least BOSS_MIN_MASS and twice the next one. */
  boss(): Player | null {
    if (this.rules < 6) return null;
    let a: Player | null = null, b: Player | null = null;
    for (const p of this.players) {
      if (!p.alive) continue;
      if (!a || p.m > a.m) { b = a; a = p; } else if (!b || p.m > b.m) b = p;
    }
    return a && a.m >= BOSS_MIN_MASS && a.m >= (b ? b.m : 0) * BOSS_LEAD ? a : null;
  }
  /** Rules 6: the boss cycle. "calm", "warn" (it will be exposed) or "open" (its back can be bitten), and seconds to the next change. */
  bossPhase(): { state: "calm" | "warn" | "open"; inS: number } {
    const t = this.time % BOSS_CYCLE_S, openAt = BOSS_CYCLE_S - BOSS_OPEN_S, warnAt = openAt - BOSS_WARN_S;
    if (t < warnAt) return { state: "calm", inS: warnAt - t };
    if (t < openAt) return { state: "warn", inS: openAt - t };
    return { state: "open", inS: BOSS_CYCLE_S - t };
  }
  /** Index of the point of body b nearest to (x, y) within KAMIKAZE_R, or -1. */
  private nearestPoint(b: Player, x: number, y: number): number {
    const pts = bodyPoints(b);
    let best = -1, bd = KAMIKAZE_R * KAMIKAZE_R;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i][0] - x) ** 2 + (pts[i][1] - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  /** Rules 5 and 6, a room paid by bag: the entry fee, which prices the traps and powers paid from the bag. */
  bagFee = 0;
  /** Lamports spent from bags on traps and powers: they leave the players' pot and go to the house (maintenance). */
  bagSpent = 0;
  spellCost(kind: number): number {
    return this.bagFee > 0 ? Math.floor((this.bagFee * (TRAP_PRICE_PCT[kind as TrapKind] ?? 0)) / 100) : 0;
  }
  /** Takes `mass` from body b at point (x, y): `give` of it goes to the taker, the rest falls there as a coin with the same share of b's bag. */
  private chip(b: Player, mass: number, taker: Player | null, give: number, x: number, y: number, ev: StepResult): void {
    mass = Math.max(0, Math.min(mass, b.m - ARENA.minMass));
    if (mass <= 0) return;
    const share = b.bag ? Math.floor((b.bag * mass) / b.m) : 0;
    b.m -= mass;
    if (share) b.bag = (b.bag ?? 0) - share;
    const toTaker = taker ? mass * give : 0;
    if (taker) { taker.m += toTaker; if (taker.m > taker.peak) taker.peak = taker.m; }
    const o: Orb = { id: this.nextOrbId++, x: Math.round(x), y: Math.round(y), v: Math.round((mass - toTaker) * 1000) / 1000 };
    if (share) { o.l = share; }
    this.orbs.push(o);
    ev.newOrbs.push(o);
  }
  /** Rules 6: a head on the exposed tail of the boss bites instead of dying (at most two bites a second per head). */
  private bossAt = new Map<string, number>();
  private bossBite(a: Player, b: Player, k: number, n: number, ev: StepResult): boolean {
    if (this.rules < 6 || b !== this.bossNow || this.bossPhase().state !== "open" || (b.shieldUntil ?? 0) > this.time || k < n * BOSS_TAIL) return false;
    if ((this.bossAt.get(a.w) ?? -1) > this.time - 0.5) return true;
    this.bossAt.set(a.w, this.time);
    const pt = bodyPoints(b)[k] ?? [b.x, b.y];
    this.chip(b, b.m * BOSS_BITE, a, 0.5, pt[0], pt[1], ev);
    return true;
  }
  private bossNow: Player | null = null;

  private placeTrap(pi: number, kind: number, ev: StepResult): void {
    const p = this.players[pi];
    if (!p || !p.alive) return;
    if (this.rules >= 6 && !this.powerAllowed(p, kind) && kind !== TRAP_LASER && kind !== TRAP_SLOW) return;
    const cost = this.spellCost(kind);
    if (cost > (p.bag ?? 0)) return;
    if (cost) { p.bag = (p.bag ?? 0) - cost; this.bagSpent += cost; }
    if (kind === POWER_KAMIKAZE) {
      const b = this.boss()!;
      const at = bodyPoints(b)[this.nearestPoint(b, p.x, p.y)];
      this.chip(b, Math.min(b.m * KAMIKAZE_TAKE, p.m * 3 + 50), null, 0, at[0], at[1], ev);
      this.kill(p, "kamikaze", ev);
      return;
    }
    if (kind === POWER_SHIELD) {
      p.m = Math.max(ARENA.minMass, p.m * (1 - SHIELD_COST));
      p.shieldUntil = this.time + SHIELD_S;
      p.shieldReady = this.time + SHIELD_CD_S;
      return;
    }
    if (kind === POWER_CASHOUT) { p.cashoutAt = this.time; return; }
    const pts = bodyPoints(p);
    const tail = pts[pts.length - 1];
    const prev = pts[Math.max(0, pts.length - 2)];
    let ux = tail[0] - prev[0], uy = tail[1] - prev[1];
    const len = Math.hypot(ux, uy) || 1;
    ux /= len; uy /= len;
    if (kind === TRAP_LASER) {
      if (this.rules >= 4) {
        const hx = Math.cos(p.heading), hy = Math.sin(p.heading), r0 = bodyRadius(p.m) + 18;
        this.traps.push({ kind, owner: p.w, hit: [], x: p.x + hx * r0, y: p.y + hy * r0, x2: p.x + hx * (r0 + TRAP_LASER_HALF * 2), y2: p.y + hy * (r0 + TRAP_LASER_HALF * 2), r: 0, until: this.time + TRAP_LASER_S });
      } else {
        const cx = tail[0] + ux * 24, cy = tail[1] + uy * 24;
        const h = TRAP_LASER_HALF;
        this.traps.push({ kind, owner: p.w, hit: [], x: cx - uy * h, y: cy + ux * h, x2: cx + uy * h, y2: cy - ux * h, r: 0, until: this.time + TRAP_LASER_S });
      }
    } else {
      this.traps.push({ kind, owner: p.w, hit: [], x: tail[0] + ux * 40, y: tail[1] + uy * 40, x2: 0, y2: 0, r: TRAP_SLOW_R, until: this.time + TRAP_SLOW_S });
    }
  }

  /** Speed factor of a head in a puddle that is not its own. */
  private slowOf(p: Player): number {
    for (const t of this.traps) {
      if (t.kind === TRAP_SLOW && t.owner !== p.w && Math.hypot(p.x - t.x, p.y - t.y) < t.r) return TRAP_SLOW_FACTOR;
    }
    return 1;
  }

  constructor(
    seed: number,
    entrants: { w: string; n: string; role: Role; bot: boolean }[],
    opts: { matchMs?: number; shrinkStartMs?: number; rules?: RulesVersion } = {},
  ) {
    this.rules = opts.rules ?? defaultRules;
    setRules(this.rules);
    this.matchMs = opts.matchMs ?? ARENA.matchMs;
    this.shrinkStartMs = opts.shrinkStartMs ?? ARENA.shrinkStartMs;
    this.rng = new Rng(seed);
    const cx = ARENA.w / 2;
    const cy = ARENA.h / 2;
    this.zonePlan = buildZonePlan(this.rng, this.matchMs, this.shrinkStartMs, this.rules >= 4);
    entrants.forEach((e, i) => {
      // Spread the starts on a ring inside the zone, facing the center.
      const ang = (i / entrants.length) * Math.PI * 2 + (this.rules >= 4 ? 0 : this.rng.range(-0.1, 0.1));
      const rad = ARENA.zoneR0 * 0.6;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      const heading = Math.atan2(cy - y, cx - x);
      // The body exists from the first tick: it lies straight behind the head, as if the player had been walking in a line.
      const back = ARENA.maxBodySegments * Math.round(ARENA.segmentSpacing / ARENA.trailSpacing) + 6;
      const trail: [number, number][] = [];
      for (let k = 1; k <= back; k++) {
        const tx = x - Math.cos(heading) * ARENA.trailSpacing * k;
        const ty = y - Math.sin(heading) * ARENA.trailSpacing * k;
        trail.push([Math.max(0, Math.min(ARENA.w, tx)), Math.max(0, Math.min(ARENA.h, ty))]);
      }
      this.players.push({
        w: e.w, n: e.n, role: e.role, bot: e.bot, alive: true,
        m: ARENA.startMass, peak: ARENA.startMass,
        x, y, heading, dx: Math.cos(heading), dy: Math.sin(heading), boost: false,
        trail, protectUntil: ARENA.protectSeconds, diedAt: -1, killer: "",
      });
    });
    while (this.orbs.length < ARENA.orbTarget) this.orbs.push(this.newOrb());
  }

  zoneNow(): ZoneState {
    return zoneState(this.zoneTime(), this.zonePlan);
  }

  zone(): Zone {
    return this.zoneNow();
  }

  private nextDrop: number = ARENA.airdropEveryS;

  /** Rules 4: how many orbs and showers were laid, the position in their fixed patterns. */
  private orbSeq = 0;
  private dropSeq = 0;

  private newOrb(): Orb {
    // Uniform over the current safe zone, so loot always lies where people have to go.
    const z = this.zone();
    let a: number, r: number, v: number;
    if (this.rules >= 4) {
      // A fixed spiral over the zone, and a fixed cycle of values: the same map for everybody, every time.
      const n = this.orbSeq++;
      const [sa, sr] = spread(n);
      a = sa;
      r = sr * (z.r - 30);
      const c = n % 20;
      v = c < 14 ? ARENA.orbValues[0] : c < 19 ? ARENA.orbValues[1] : ARENA.orbValues[2];
    } else {
      a = this.rng.range(0, Math.PI * 2);
      r = Math.sqrt(this.rng.next()) * (z.r - 30);
      const k = this.rng.next();
      v = k < 0.7 ? ARENA.orbValues[0] : k < 0.93 ? ARENA.orbValues[1] : ARENA.orbValues[2];
    }
    return { id: this.nextOrbId++, x: Math.round(z.cx + Math.cos(a) * r), y: Math.round(z.cy + Math.sin(a) * r), v };
  }

  player(w: string) {
    return this.players.find((p) => p.w === w);
  }

  setInput(w: string, dx: number, dy: number, boost: boolean) {
    const p = this.player(w);
    if (!p || !p.alive || p.auto) return;
    let x = Number.isFinite(dx) ? dx : 0;
    let y = Number.isFinite(dy) ? dy : 0;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    if (len > 0) { p.dx = x; p.dy = y; }
    p.boost = !!boost;
  }

  private pendingAway: { w: string; back: boolean }[] = [];
  /** The person's connection dropped: the bot plays the body and nothing can hurt it for AWAY_PROTECT_S. Limited per match.
   *  It takes effect at the next step and is written in the match record (flag 2), so the match still replays exactly. */
  away(w: string): boolean {
    const p = this.player(w);
    if (!p || !p.alive || p.auto || (p.aways ?? 0) >= MAX_AWAYS) return false;
    p.aways = (p.aways ?? 0) + 1;
    p.auto = true;
    this.pendingAway.push({ w, back: false });
    return true;
  }
  /** The person is back: they steer again and have BACK_PROTECT_S to find their body (flag 3 in the record). */
  back(w: string): boolean {
    const p = this.player(w);
    if (!p || !p.alive || !p.auto) return false;
    p.auto = false;
    this.pendingAway.push({ w, back: true });
    return true;
  }

  aliveCount() {
    return this.players.filter((p) => p.alive).length;
  }

  private kill(p: Player, by: string, ev: StepResult) {
    if (!p.alive) return;
    p.alive = false;
    p.diedAt = this.time;
    p.killer = by;
    ev.deaths.push({ w: p.w, by });
    // 100% of the mass becomes orbs over the exact path of the body.
    const pts = bodyPoints(p);
    // Rules 8, a room paid by bag: every coin on the map is worth money, so a dead body drops only its bag (none at all when it is
    // empty), and one of the last three keeps its bag (it reached the final; the coins of its mass still fall, worthless ones do not).
    const keepBag = this.bagMode && this.freezeAt >= 0;
    // Never more coins than lamports: every coin carries at least one lamport, the smallest amount of SOL.
    const count = this.bagMode ? (p.bag && !keepBag ? Math.min(24, p.bag, Math.max(1, Math.floor(p.m))) : 0) : Math.max(1, Math.min(ARENA.maxDeathOrbs, Math.floor(p.m)));
    const value = (p.m / count) * (this.rules >= 2 ? 1 + Math.min(0.5, p.m / 6000) : 1);
    // Rules 4: the coins are scattered over the whole safe zone (the one thing left to the seed), not laid in a line where the
    // body was, so they do not all go to whoever happened to be next to it.
    const zl = this.rules >= 4 ? this.zone() : null;
    // Rules 8: the bag of a dead body falls in coins of different sizes too.
    const bagCut = this.rules >= 8 && p.bag && count ? unevenSplit(p.bag, count, this.stepN % 97).parts : null;
    for (let i = 0; i < count; i++) {
      let [x, y] = pts[Math.min(pts.length - 1, Math.floor((i * pts.length) / count))];
      if (zl) { const t = this.rng.range(0, Math.PI * 2), d = Math.sqrt(this.rng.next()) * Math.max(0, zl.r - 40); x = zl.cx + Math.cos(t) * d; y = zl.cy + Math.sin(t) * d; }
      const o: Orb = { id: this.nextOrbId++, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, v: Math.round(value * 1000) / 1000 };
      // Rules 5: the bag falls with the body, spread over its coins (the remainder on the first one).
      if (p.bag) {
        const l = bagCut ? bagCut[i] : Math.floor(p.bag / count) + (i === 0 ? p.bag % count : 0);
        if (l > 0) { o.l = l; }
      }
      this.orbs.push(o);
      ev.newOrbs.push(o);
    }
    if (keepBag) p.banked = p.m; else p.bag = 0;
    p.m = 0;
    p.trail = [];
  }

  step(dt: number, brain?: (a: Arena, p: Player) => { dx: number; dy: number; boost: boolean }): StepResult {
    const ev: StepResult = { eatenOrbs: [], newOrbs: [], deaths: [] };
    setRules(this.rules);
    for (const q of this.pendingAway.splice(0)) {
      const pi = this.players.findIndex((x) => x.w === q.w);
      if (pi < 0) continue;
      const secs = q.back ? BACK_PROTECT_S : AWAY_PROTECT_S;
      this.players[pi].protectUntil = Math.max(this.players[pi].protectUntil, this.time + secs);
      this.inputLog.push([this.stepN, pi, 0, q.back ? 3 : 2]);
    }
    for (const q of this.pendingTraps.splice(0)) {
      this.placeTrap(q.pi, q.kind, ev);
      this.inputLog.push([this.stepN, q.pi, q.kind, 4]);
    }
    this.time += dt;
    const zoneNow = this.zoneNow();
    const cx = zoneNow.cx;
    const cy = zoneNow.cy;
    const zr = zoneNow.r;

    // Move.
    const tickNo = this.stepN++;
    for (let pi = 0; pi < this.players.length; pi++) {
      const p = this.players[pi];
      if (!p.alive) continue;
      if ((p.bot || p.auto) && brain) {
        const a = brain(this, p);
        p.dx = a.dx; p.dy = a.dy; p.boost = a.boost;
      }
      // The steering is quantized to 256 directions, so the match record (angle byte and boost) replays it exactly.
      const TAU = Math.PI * 2;
      const ab = Math.round((((Math.atan2(p.dy, p.dx) % TAU) + TAU) % TAU) / TAU * 256) & 255;
      const hd = (ab / 256) * TAU;
      p.dx = Math.cos(hd);
      p.dy = Math.sin(hd);
      const key = ab | (p.boost ? 256 : 0);
      if (this.lastKey[pi] !== key) {
        this.lastKey[pi] = key;
        this.inputLog.push([tickNo, pi, ab, p.boost ? 1 : 0]);
      }
      const want = Math.atan2(p.dy, p.dx);
      let diff = want - p.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // Giant hunter: the heavier the body, the slower it turns, so a light player can out-maneuver a big one.
      const maxTurn = turnRateOf(p.m) * dt;
      p.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));

      let speed = speedOf(p.m) * (this.traps.length ? this.slowOf(p) : 1) * (p.cashoutAt !== undefined ? 0.5 : 1);
      if (p.boost && p.m > ARENA.minMass) {
        speed *= ARENA.boostSpeed;
        p.m = Math.max(ARENA.minMass, p.m - p.m * boostCostOf() * dt);
      }
      const px = p.x, py = p.y;
      p.x += Math.cos(p.heading) * speed * dt;
      p.y += Math.sin(p.heading) * speed * dt;

      // Store the path: points are laid every trailSpacing units along the actual movement.
      const moved = Math.hypot(p.x - px, p.y - py);
      if (moved > 0) {
        const last = p.trail[0] ?? [px, py];
        let remain = Math.hypot(p.x - last[0], p.y - last[1]);
        if (remain >= ARENA.trailSpacing) {
          const n = Math.floor(remain / ARENA.trailSpacing);
          const ux = (p.x - last[0]) / remain;
          const uy = (p.y - last[1]) / remain;
          for (let i = 1; i <= n; i++) {
            p.trail.unshift([last[0] + ux * ARENA.trailSpacing * i, last[1] + uy * ARENA.trailSpacing * i]);
          }
          const keep = trailKeep();
          if (p.trail.length > keep) p.trail.length = keep;
        }
      }
    }

    // The edge and the zone.
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.protectUntil > this.time) {
        // Protected: the edge cannot kill and the zone does not hurt yet; keep the head on the map.
        p.x = Math.max(0, Math.min(ARENA.w, p.x));
        p.y = Math.max(0, Math.min(ARENA.h, p.y));
        continue;
      }
      if (p.x < 0 || p.y < 0 || p.x > ARENA.w || p.y > ARENA.h) {
        this.kill(p, "wall", ev);
        continue;
      }
      if (Math.hypot(p.x - cx, p.y - cy) > zr) {
        p.m -= zoneDamagePerSecond(p.m, zoneNow.phase) * dt;
        if (p.m < ARENA.deathMass) this.kill(p, "zone", ev);
      }
    }

    // A body that is played by the bot because its person is not there is shielded for a short time, but it shrinks and eats
    // nothing: dropping the connection is never a way to keep a body alive for free.
    for (const p of this.players) {
      if (p.alive && p.auto && p.m > ARENA.minMass) p.m = Math.max(ARENA.minMass, p.m * (1 - AWAY_DRAIN_PER_S * dt));
    }

    // Traps: a laser takes a tenth of the mass of a head that touches it (once per head) and gives it to its owner; it never
    // kills. Not its owner's own head, not a protected one. Old traps go away.
    if (this.traps.length) {
      for (const t of this.traps) {
        if (t.kind !== TRAP_LASER) continue;
        const owner = this.players.find((q) => q.w === t.owner);
        for (const p of this.players) {
          if (!p.alive || p.w === t.owner || p.protectUntil > this.time || t.hit.includes(p.w)) continue;
          if (segDist(p.x, p.y, t.x, t.y, t.x2, t.y2) < bodyRadius(p.m)) {
            t.hit.push(p.w);
            const take = Math.max(0, Math.min(p.m - ARENA.minMass, p.m * TRAP_LASER_TAKE));
            p.m -= take;
            if (owner && owner.alive) { owner.m += take; if (owner.m > owner.peak) owner.peak = owner.m; }
          }
        }
      }
      this.traps = this.traps.filter((t) => t.until > this.time);
    }

    // Rules 5: the coins the zone leaves outside are part of the pot too. Once a second they fuse, slice by slice of the circle,
    // into one bigger coin that jumps back inside, so nothing of value is left where nobody can go.
    if (this.rules >= 5 && tickNo % ARENA.tickRate === 0) this.fuseOutside(cx, cy, zr, ev);
    // Rules 5: once the zone starts closing, coins lying close together fuse every few seconds, so the last ones are few and big.
    if (this.rules >= 5 && zoneNow.phase >= 2 && tickNo % (ARENA.tickRate * 4) === 0) this.fuseNear(ev);
    // Rules 5: the map never holds more coins than its area can show; the smallest ones fuse into their nearest neighbour.
    if (this.rules >= 5 && tickNo % ARENA.tickRate === 0) this.capCoins(zr, ev);
    // Rules 5, a room paid by bag: the showers of the pot.
    while (this.bagDrops.length && this.time >= this.bagDrops[0][0]) this.bagShower(this.bagDrops.shift()![1], ev);

    // Orbs.
    for (const p of this.players) {
      if (!p.alive || p.auto) continue;
      const r = bodyRadius(p.m) + 6;
      for (let i = this.orbs.length - 1; i >= 0; i--) {
        const o = this.orbs[i];
        const ddx = o.x - p.x;
        const ddy = o.y - p.y;
        if (Math.abs(ddx) <= r && Math.abs(ddy) <= r && ddx * ddx + ddy * ddy <= r * r) {
          p.m += o.v;
          if (o.l) p.bag = (p.bag ?? 0) + o.l;
          if (p.m > p.peak) p.peak = p.m;
          ev.eatenOrbs.push(o.id);
          this.orbs.splice(i, 1);
        }
      }
    }

    // Rules 6: who is the boss in this step; and the bodies that finished cashing out leave the arena with what they carry.
    this.bossNow = this.boss();
    if (this.rules >= 6) {
      for (const p of this.players) {
        if (!p.alive || p.cashoutAt === undefined || this.time - p.cashoutAt < CASHOUT_S) continue;
        p.banked = p.m;
        p.alive = false;
        p.diedAt = this.time;
        p.killer = "cashout";
        p.cashoutAt = undefined;
        p.trail = [];
        ev.deaths.push({ w: p.w, by: "cashout" });
      }
    }

    // Collisions: a head that touches another player's solid body dies. Head against head: the lighter dies.
    const dying = new Map<string, string>();
    const bodies = new Map<string, [number, number][]>();
    for (const p of this.players) if (p.alive) bodies.set(p.w, bodyPoints(p));
    for (const a of this.players) {
      if (!a.alive || a.protectUntil > this.time) continue;
      const ra = bodyRadius(a.m);
      for (const b of this.players) {
        if (b === a || !b.alive) continue;
        // A protected player can neither be hurt nor hurt: the same rule in both directions.
        if (b.protectUntil > this.time) continue;
        const rb = bodyRadius(b.m);
        // Head against head decides alone (the body points next to a head must not turn a head-on into an unfair death):
        // the heavier survives, equal masses both die. Handled once per pair.
        const hx = a.x - b.x, hy = a.y - b.y;
        if (hx * hx + hy * hy < (ra + rb) * (ra + rb)) {
          if (a.w < b.w) {
            if (a.m < b.m) { if (!dying.has(a.w)) dying.set(a.w, b.w); }
            else if (b.m < a.m) { if (!dying.has(b.w)) dying.set(b.w, a.w); }
            else { if (!dying.has(a.w)) dying.set(a.w, b.w); if (!dying.has(b.w)) dying.set(b.w, a.w); }
          }
          continue;
        }
        const pts = bodies.get(b.w)!;
        // Skip the head point (index 0): head against head is handled above.
        for (let k = 1; k < pts.length; k++) {
          const ddx = a.x - pts[k][0];
          const ddy = a.y - pts[k][1];
          const lim = rb + ra * 0.35;
          if (ddx * ddx + ddy * ddy < lim * lim) {
            // Rules 2: a body at least three times heavier eats a bite of the small body instead of dying on it.
            if (this.rules >= 2 && a.m >= b.m * 3) {
              const bite = Math.max(0.4, b.m * 0.04);
              b.m -= bite;
              a.m += bite;
              if (a.m > a.peak) a.peak = a.m;
              if (b.m < ARENA.deathMass && !dying.has(b.w)) dying.set(b.w, a.w);
              break;
            }
            if (this.bossBite(a, b, k, pts.length, ev)) break;
            if (!dying.has(a.w)) dying.set(a.w, b.w);
            break;
          }
        }
      }
    }
    for (const [w, by] of dying) {
      const p = this.player(w);
      if (p) this.kill(p, by, ev);
    }

    // Rules 7: the moment three bodies are left, the zone stops closing for FINAL3_FREEZE_S seconds.
    if (this.rules >= 7 && this.freezeAt < 0 && this.aliveCount() <= 3) this.freezeAt = this.time;

    // Airdrop: a cluster of rich coins somewhere inside the zone.
    if (this.time >= this.nextDrop && !this.bagMode) {
      this.nextDrop += ARENA.airdropEveryS;
      const z = this.zone();
      const fixed = this.rules >= 4;
      const dn = this.dropSeq++;
      const [da, dr] = spread(dn + 7);
      const a = fixed ? da : this.rng.range(0, Math.PI * 2);
      const rr = (fixed ? 0.2 + 0.6 * dr : Math.sqrt(this.rng.next())) * Math.max(0, z.r - 160);
      const cx = z.cx + Math.cos(a) * rr, cy = z.cy + Math.sin(a) * rr;
      for (let i = 0; i < ARENA.airdropOrbs; i++) {
        const t = fixed ? (i * Math.PI * 2) / 9 : this.rng.range(0, Math.PI * 2), d = fixed ? 45 : this.rng.range(0, 70);
        const o: Orb = { id: this.nextOrbId++, x: Math.round(cx + Math.cos(t) * d), y: Math.round(cy + Math.sin(t) * d), v: ARENA.airdropValue };
        this.orbs.push(o);
        ev.newOrbs.push(o);
      }
    }

    // Keep the map stocked.
    let mapOrbs = this.orbs.length;
    const target = this.rules >= 5 ? this.coinCap(zr) : ARENA.orbTarget;
    while (!this.bagMode && mapOrbs < target) {
      const o = this.newOrb();
      this.orbs.push(o);
      ev.newOrbs.push(o);
      mapOrbs++;
    }
    return ev;
  }

  /** Rules 7: when the zone froze for the last three (-1 until then), and the clock the zone follows (it skips the freeze). */
  freezeAt = -1;
  zoneTime(): number {
    if (this.freezeAt < 0) return this.time;
    return this.time < this.freezeAt + FINAL3_FREEZE_S ? this.freezeAt : this.time - FINAL3_FREEZE_S;
  }
  /** Rules 7: seconds left of the freeze of the last three, or 0. */
  freezeLeft(): number {
    return this.freezeAt < 0 ? 0 : Math.max(0, this.freezeAt + FINAL3_FREEZE_S - this.time);
  }

  /** Rules 5, a room paid by bag: the pot (lamports) still to fall as showers, [time in seconds, lamports]. */
  private bagDrops: [number, number][] = [];
  private bagSeq = 0;
  /** Rules 8: a room paid by bag, where every orb on the map is a coin of the pot (set by mintBags). */
  bagMode = false;
  /** Lamports minted into coins so far (equal to the pot once every shower fell). */
  bagMinted = 0;
  /**
   * Rules 5, a room paid by bag: the pot becomes coins. 30 percent falls at once over the zone, the other 70 in equal showers
   * every 15 seconds until 70 percent of the match. Every lamport is in exactly one coin; nothing is created.
   */
  mintBags(pool: number): StepResult {
    const ev: StepResult = { eatenOrbs: [], newOrbs: [], deaths: [] };
    if (this.rules < 5 || pool <= 0) return ev;
    const first = Math.floor(pool * 0.3);
    // Rules 8: the map holds only the pot. The free food goes and the pot falls in more, smaller coins.
    if (this.rules >= 8) {
      this.bagMode = true;
      for (const o of this.orbs) ev.eatenOrbs.push(o.id);
      this.orbs.length = 0;
    }
    const z = this.zone();
    const N = this.rules >= 8 ? 150 : 40;
    const cut = this.rules >= 8 ? unevenSplit(first, N, 3) : null;
    for (let i = 0; i < N; i++) {
      const [a, r] = spread(i + 501);
      const l = cut ? cut.parts[i] : Math.floor(first / N) + (i === 0 ? first % N : 0);
      // Rules 8: a coin is as big as it is rich (its mass follows its weight).
      const v = cut ? Math.round(Math.min(10, Math.max(1, (3 * cut.weights[i] * N) / cut.weights.reduce((x, y) => x + y, 0))) * 10) / 10 : 3;
      this.mintCoin(z.cx + Math.cos(a) * r * (z.r - 80), z.cy + Math.sin(a) * r * (z.r - 80), l, ev, v);
    }
    const until = (this.matchMs / 1000) * 0.7;
    const times: number[] = [];
    for (let t = 15; t <= until; t += 15) times.push(t);
    if (!times.length) times.push(1);
    const rest = pool - first;
    this.bagDrops = times.map((t, i) => [t, Math.floor(rest / times.length) + (i === 0 ? rest % times.length : 0)]);
    return ev;
  }
  private mintCoin(x: number, y: number, l: number, ev: StepResult, v = 3): void {
    if (l <= 0) return;
    const o: Orb = { id: this.nextOrbId++, x: Math.round(x), y: Math.round(y), v, l };
    this.bagMinted += l;
    this.orbs.push(o);
    ev.newOrbs.push(o);
  }
  /** A shower of the pot: eight coins in a ring at a fixed spot of the zone. */
  private bagShower(total: number, ev: StepResult): void {
    const z = this.zone();
    const [a, r] = spread(this.bagSeq++ + 701);
    const cx = z.cx + Math.cos(a) * r * Math.max(0, z.r - 160), cy = z.cy + Math.sin(a) * r * Math.max(0, z.r - 160);
    const N = this.rules >= 8 ? 20 : 8;
    const cut = this.rules >= 8 ? unevenSplit(total, N, this.bagSeq * 7) : null;
    for (let i = 0; i < N; i++) {
      const t = (i * Math.PI * 2) / N;
      const v = cut ? Math.round(Math.min(10, Math.max(1, (3 * cut.weights[i] * N) / cut.weights.reduce((x, y) => x + y, 0))) * 10) / 10 : 3;
      this.mintCoin(cx + Math.cos(t) * 50, cy + Math.sin(t) * 50, cut ? cut.parts[i] : Math.floor(total / N) + (i === 0 ? total % N : 0), ev, v);
    }
  }
  /** Rules 5: how many coins the safe zone holds, in proportion to its area (600 on the full map, 40 at least). */
  coinCap(zr: number): number {
    return Math.max(40, Math.round(ARENA.orbTarget * (zr / ARENA.zoneR0) ** 2));
  }
  /** Rules 5: while the map holds more coins than the cap, the smallest coin fuses into the nearest one (value and lamports added). */
  private capCoins(zr: number, ev: StepResult): void {
    let extra = this.orbs.length - this.coinCap(zr);
    while (extra-- > 0 && this.orbs.length > 1) {
      let si = 0;
      for (let i = 1; i < this.orbs.length; i++) {
        const o = this.orbs[i], b = this.orbs[si];
        if (o.v < b.v || (o.v === b.v && o.id < b.id)) si = i;
      }
      const a = this.orbs[si];
      let ni = -1, nd = Infinity;
      for (let i = 0; i < this.orbs.length; i++) {
        if (i === si) continue;
        const d = (this.orbs[i].x - a.x) ** 2 + (this.orbs[i].y - a.y) ** 2;
        if (d < nd) { nd = d; ni = i; }
      }
      const b = this.orbs[ni];
      const l = (a.l ?? 0) + (b.l ?? 0);
      const o: Orb = { id: this.nextOrbId++, x: b.x, y: b.y, v: a.v + b.v };
      if (l) { o.l = l; }
      ev.eatenOrbs.push(a.id, b.id);
      this.orbs.splice(Math.max(si, ni), 1);
      this.orbs.splice(Math.min(si, ni), 1);
      this.orbs.push(o);
      ev.newOrbs.push(o);
    }
  }

  /** Rules 5: coins lying within 60 units of each other fuse into the bigger one's spot (value and lamports added). */
  private fuseNear(ev: StepResult): void {
    const R2 = 60 * 60;
    const gone = new Set<number>();
    const out: Orb[] = [];
    for (let i = 0; i < this.orbs.length; i++) {
      const a = this.orbs[i];
      if (gone.has(a.id)) continue;
      let group: Orb[] | null = null;
      for (let j = i + 1; j < this.orbs.length; j++) {
        const b = this.orbs[j];
        if (gone.has(b.id)) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        if (dx * dx + dy * dy <= R2) { (group ??= [a]).push(b); gone.add(b.id); }
      }
      if (!group) continue;
      gone.add(a.id);
      const big = group.reduce((m, o) => (o.v > m.v ? o : m), group[0]);
      const v = group.reduce((n, o) => n + o.v, 0);
      const l = group.reduce((n, o) => n + (o.l ?? 0), 0);
      const o: Orb = { id: this.nextOrbId++, x: big.x, y: big.y, v };
      if (l) { o.l = l; }
      out.push(o);
    }
    if (!gone.size) return;
    for (let i = this.orbs.length - 1; i >= 0; i--) if (gone.has(this.orbs[i].id)) { ev.eatenOrbs.push(this.orbs[i].id); this.orbs.splice(i, 1); }
    for (const o of out) { this.orbs.push(o); ev.newOrbs.push(o); }
  }

  /** Rules 5: the orbs outside the zone fuse by slice of the circle (16 slices) into one orb a little inside the edge. */
  private fuseOutside(cx: number, cy: number, zr: number, ev: StepResult): void {
    const SLICES = 16;
    const groups = new Map<number, Orb[]>();
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      if (Math.hypot(o.x - cx, o.y - cy) <= zr) continue;
      const s = Math.floor((Math.atan2(o.y - cy, o.x - cx) / (Math.PI * 2) + 1) * SLICES) % SLICES;
      const list = groups.get(s);
      if (list) list.push(o); else groups.set(s, [o]);
      ev.eatenOrbs.push(o.id);
      this.orbs.splice(i, 1);
    }
    const inner = Math.max(0, zr - 140);
    for (const [s, list] of [...groups].sort((a, b) => a[0] - b[0])) {
      const a = ((s + 0.5) / SLICES) * Math.PI * 2;
      const v = list.reduce((n, o) => n + o.v, 0);
      const l = list.reduce((n, o) => n + (o.l ?? 0), 0);
      const o: Orb = { id: this.nextOrbId++, x: Math.round(cx + Math.cos(a) * inner), y: Math.round(cy + Math.sin(a) * inner), v };
      if (l) { o.l = l; }
      this.orbs.push(o);
      ev.newOrbs.push(o);
    }
  }

  /** Alive players by mass, then dead players by time of death (later is better). Ties: lower wallet. */
  ranking(): { w: string; rank: number; score: number; role: Role }[] {
    const sorted = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      if (a.alive) return b.m - a.m || (a.w < b.w ? -1 : 1);
      return b.diedAt - a.diedAt || (a.w < b.w ? -1 : 1);
    });
    return sorted.map((p, i) => ({ w: p.w, rank: i + 1, score: Math.round(p.peak * 10) / 10, role: p.role }));
  }

  finished(): boolean {
    return this.time * 1000 >= this.matchMs || this.aliveCount() <= 1;
  }
}

/** A small bot for the devnet test mode: stay inside the zone, avoid bodies, eat orbs. */
export function arenaBrain(a: Arena, me: Player): { dx: number; dy: number; boost: boolean } {
  setRules(a.rules);
  const zone = a.zone();
  const cx = zone.cx;
  const cy = zone.cy;
  const zr = zone.r;
  const dc = Math.hypot(me.x - cx, me.y - cy);
  const bodyR = bodyRadius(me.m);

  // Candidate headings; pick the safest, then the one nearest to an orb.
  let best = { score: -Infinity, dx: me.dx, dy: me.dy };
  for (let i = 0; i < 9; i++) {
    const ang = me.heading + ((i - 4) * Math.PI) / 8;
    const ahead = 70 + bodyR * 2;
    const tx = me.x + Math.cos(ang) * ahead;
    const ty = me.y + Math.sin(ang) * ahead;
    let score = 0;
    if (tx < 20 || ty < 20 || tx > ARENA.w - 20 || ty > ARENA.h - 20) score -= 1000;
    const dz = Math.hypot(tx - cx, ty - cy);
    if (dz > zr - 40) score -= 200 + (dz - (zr - 40));
    if (dc > zr - 150) score += 120 - Math.hypot(tx - cx, ty - cy) * 0.1; // drift inward when the zone closes
    for (const o of a.players) {
      if (o === me || !o.alive) continue;
      const pts = bodyPoints(o);
      for (let k = 0; k < pts.length; k += 2) {
        const d = Math.hypot(tx - pts[k][0], ty - pts[k][1]);
        const lim = bodyRadius(o.m) + bodyR + 25;
        if (d < lim) score -= 600 - d;
      }
    }
    let nearest = Infinity;
    for (const orb of a.orbs) {
      const d = Math.hypot(orb.x - tx, orb.y - ty);
      const w = d / (1 + orb.v);
      if (w < nearest) nearest = w;
    }
    score -= nearest * 0.4;
    score -= Math.abs(i - 4) * 2;
    if (score > best.score) best = { score, dx: Math.cos(ang), dy: Math.sin(ang) };
  }
  return { dx: best.dx, dy: best.dy, boost: false };
}
