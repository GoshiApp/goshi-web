// "The minute of frenzy": a 60 second individual phase on a map that is the same for everybody in the room.
// Pure and deterministic: no network, no clock, no I/O. Fixed step of 20 Hz, inputs quantized to one byte of angle and a
// nitro bit, so a whole minute replays from a few hundred bytes. The same code runs live and when a replay is verified.
// Browser copy of server/src/game/frenzy.ts (the same fixed step simulation), used to re-run a replay and check it.
// Keep the two in sync: frenzy-sim.test.ts replays a fixture produced by the server code.
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

export const FRENZY = {
  w: 2400,
  h: 2400,
  ms: 60_000,
  tickRate: 20,
  ticks: 1200,
  startX: 1200,
  startY: 1200,
  startMass: 20,
  minMass: 12,
  speed: 140,
  nitroSpeed: 1.7,
  nitroCostPerSecond: 0.015,
  pickup: 26,
  bodyR: 12,
  laserPenalty: 0.25,
  stunTicks: 20,
  stunSpeed: 0.4,
  btcRespawnTicks: 300, // 15 seconds
  carryCap: 90,
  laserPeriod: 120,
  laserOn: 60,
} as const;

export type Sym = "SOL" | "DOGE" | "AVAX" | "ETH" | "BNB" | "BTC";
export const SYMBOLS: readonly Sym[] = ["SOL", "DOGE", "AVAX", "ETH", "BNB", "BTC"];
const TIERS: Record<Sym, 1 | 2 | 3> = { SOL: 1, DOGE: 1, AVAX: 1, ETH: 2, BNB: 2, BTC: 3 };
export const tierOf = (s: Sym) => TIERS[s];

// ───────────── price snapshot ─────────────

export interface PriceSnapshot {
  mass: Record<Sym, number>;
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const round1 = (n: number) => Math.round(n * 10) / 10;


// ───────────── the map ─────────────

export interface Gem { id: number; x: number; y: number; s: number; m: number; btc: boolean }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Laser extends Rect { off: number }
export interface FrenzyMap {
  w: number;
  h: number;
  seed: number;
  gems: Gem[];
  walls: Rect[];
  lasers: Laser[];
}

const overlapsAny = (x: number, y: number, r: number, rects: readonly Rect[]) =>
  rects.some((q) => x > q.x - r && x < q.x + q.w + r && y > q.y - r && y < q.y + q.h + r);

export function buildMap(seed: number, snap: PriceSnapshot): FrenzyMap {
  const rng = new Rng(seed);
  const walls: Rect[] = [];
  const lasers: Laser[] = [];
  const gems: Gem[] = [];
  let nextId = 1;
  const T = 12; // wall thickness
  const ROOM = 200; // inner size of a BTC room
  const DOOR = 70;

  // Three BTC rooms: a closed square with one door that has a timed laser.
  const centers: { x: number; y: number }[] = [];
  let guard = 0;
  while (centers.length < 3 && guard++ < 500) {
    const x = Math.round(rng.range(350, FRENZY.w - 350));
    const y = Math.round(rng.range(350, FRENZY.h - 350));
    if (Math.hypot(x - FRENZY.startX, y - FRENZY.startY) < 500) continue;
    if (centers.some((c) => Math.hypot(c.x - x, c.y - y) < 800)) continue;
    centers.push({ x, y });
  }
  const sym = (name: Sym) => SYMBOLS.indexOf(name);
  for (const c of centers) {
    const x0 = c.x - ROOM / 2;
    const y0 = c.y - ROOM / 2;
    const door = Math.floor(rng.next() * 4); // 0 top, 1 right, 2 bottom, 3 left
    const sides: { side: number; rect: Rect }[] = [
      { side: 0, rect: { x: x0 - T, y: y0 - T, w: ROOM + 2 * T, h: T } },
      { side: 1, rect: { x: x0 + ROOM, y: y0 - T, w: T, h: ROOM + 2 * T } },
      { side: 2, rect: { x: x0 - T, y: y0 + ROOM, w: ROOM + 2 * T, h: T } },
      { side: 3, rect: { x: x0 - T, y: y0 - T, w: T, h: ROOM + 2 * T } },
    ];
    for (const s of sides) {
      if (s.side !== door) {
        walls.push(s.rect);
        continue;
      }
      // Split the door side in two walls and put the laser in the gap.
      const horizontal = s.side === 0 || s.side === 2;
      const total = horizontal ? s.rect.w : s.rect.h;
      const half = Math.floor((total - DOOR) / 2);
      if (horizontal) {
        walls.push({ x: s.rect.x, y: s.rect.y, w: half, h: s.rect.h });
        walls.push({ x: s.rect.x + half + DOOR, y: s.rect.y, w: total - half - DOOR, h: s.rect.h });
        lasers.push({ x: s.rect.x + half, y: s.rect.y, w: DOOR, h: s.rect.h, off: Math.floor(rng.next() * FRENZY.laserPeriod) });
      } else {
        walls.push({ x: s.rect.x, y: s.rect.y, w: s.rect.w, h: half });
        walls.push({ x: s.rect.x, y: s.rect.y + half + DOOR, w: s.rect.w, h: total - half - DOOR });
        lasers.push({ x: s.rect.x, y: s.rect.y + half, w: s.rect.w, h: DOOR, off: Math.floor(rng.next() * FRENZY.laserPeriod) });
      }
    }
    gems.push({ id: nextId++, x: c.x, y: c.y, s: sym("BTC"), m: snap.mass.BTC, btc: true });
  }

  // Free laser bars across the plain: shortcuts that cost mass if you cross them while they burn.
  for (let i = 0; i < 6; i++) {
    const horizontal = rng.next() < 0.5;
    const len = Math.round(rng.range(180, 320));
    const x = Math.round(rng.range(150, FRENZY.w - 150 - len));
    const y = Math.round(rng.range(150, FRENZY.h - 150 - len));
    const r: Laser = horizontal ? { x, y, w: len, h: 10, off: 0 } : { x, y, w: 10, h: len, off: 0 };
    if (Math.hypot(x + r.w / 2 - FRENZY.startX, y + r.h / 2 - FRENZY.startY) < 250) continue;
    if (overlapsAny(x + r.w / 2, y + r.h / 2, 20, walls)) continue;
    r.off = Math.floor(rng.next() * FRENZY.laserPeriod);
    lasers.push(r);
  }

  const place = (name: Sym) => {
    for (let k = 0; k < 40; k++) {
      const x = Math.round(rng.range(60, FRENZY.w - 60));
      const y = Math.round(rng.range(60, FRENZY.h - 60));
      if (overlapsAny(x, y, 20, walls) || overlapsAny(x, y, 20, lasers)) continue;
      gems.push({ id: nextId++, x, y, s: sym(name), m: snap.mass[name], btc: false });
      return;
    }
  };
  const common: Sym[] = ["SOL", "DOGE", "AVAX"];
  for (let i = 0; i < 420; i++) place(common[Math.floor(rng.next() * common.length)]);
  const rare: Sym[] = ["ETH", "BNB"];
  for (let i = 0; i < 60; i++) place(rare[Math.floor(rng.next() * rare.length)]);

  return { w: FRENZY.w, h: FRENZY.h, seed, gems, walls, lasers };
}

export const laserActive = (l: Laser, tick: number) => (tick + l.off) % FRENZY.laserPeriod < FRENZY.laserOn;

// ───────────── the player ─────────────

// 256 headings, rounded to 6 decimals so every JavaScript engine holds the same constants.
const COS = new Float64Array(256);
const SIN = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  COS[i] = Math.round(Math.cos((i / 256) * Math.PI * 2) * 1e6) / 1e6;
  SIN[i] = Math.round(Math.sin((i / 256) * Math.PI * 2) * 1e6) / 1e6;
}

/** Direction (dx, dy) to one byte of angle. */
export const angleByte = (dx: number, dy: number): number => {
  const a = Math.atan2(dy, dx);
  return Math.round(((a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2)) * 256) & 255;
};
export const headingOf = (b: number) => (b & 255) / 256 * Math.PI * 2;

export interface FrenzyPlayer {
  x: number;
  y: number;
  m: number;
  tick: number;
  stun: number;
  angle: number;
  nitro: boolean;
  /** Stand still (no input has arrived yet): a player never starts running before touching the controls. */
  hold: boolean;
  /** gem id -> tick when it can be eaten again (Infinity for a gem that does not come back). */
  taken: Map<number, number>;
  eaten: number;
}

export function newPlayer(): FrenzyPlayer {
  return { x: FRENZY.startX, y: FRENZY.startY, m: FRENZY.startMass, tick: 0, stun: 0, angle: 0, nitro: false, hold: false, taken: new Map(), eaten: 0 };
}

export interface StepOut {
  taken: number[];
  back: number[];
  hit: boolean;
}

const hitsRect = (x: number, y: number, r: number, q: Rect) => x > q.x - r && x < q.x + q.w + r && y > q.y - r && y < q.y + q.h + r;

export function stepPlayer(map: FrenzyMap, p: FrenzyPlayer): StepOut {
  const out: StepOut = { taken: [], back: [], hit: false };
  const dt = 1 / FRENZY.tickRate;
  p.tick++;
  let speed = p.hold ? 0 : FRENZY.speed;
  if (p.hold) {
    // standing: nothing moves, nothing is spent
  } else if (p.stun > 0) {
    p.stun--;
    speed *= FRENZY.stunSpeed;
  } else if (p.nitro && p.m > FRENZY.minMass) {
    speed *= FRENZY.nitroSpeed;
    p.m = Math.max(FRENZY.minMass, p.m - p.m * FRENZY.nitroCostPerSecond * dt);
  }
  const vx = COS[p.angle & 255] * speed * dt;
  const vy = SIN[p.angle & 255] * speed * dt;
  const R = FRENZY.bodyR;

  // Move one axis at a time so walls slide.
  let nx = p.x + vx;
  if (nx < R || nx > map.w - R || map.walls.some((q) => hitsRect(nx, p.y, R, q))) nx = p.x;
  let ny = p.y + vy;
  if (ny < R || ny > map.h - R || map.walls.some((q) => hitsRect(nx, ny, R, q))) ny = p.y;

  // A burning laser costs mass, stops you for a moment and leaves you where you were.
  for (const l of map.lasers) {
    if (laserActive(l, p.tick) && hitsRect(nx, ny, R, l)) {
      p.m = Math.max(FRENZY.minMass, p.m * (1 - FRENZY.laserPenalty));
      p.stun = FRENZY.stunTicks;
      out.hit = true;
      nx = p.x;
      ny = p.y;
      break;
    }
  }
  p.x = nx;
  p.y = ny;

  const rr = FRENZY.pickup * FRENZY.pickup;
  for (const g of map.gems) {
    const back = p.taken.get(g.id);
    if (back !== undefined) {
      if (p.tick < back) continue;
      p.taken.delete(g.id);
      out.back.push(g.id);
    }
    const dx = g.x - p.x;
    const dy = g.y - p.y;
    if (dx * dx + dy * dy <= rr) {
      p.m += g.m;
      p.eaten++;
      p.taken.set(g.id, g.btc ? p.tick + FRENZY.btcRespawnTicks : Infinity);
      out.taken.push(g.id);
    }
  }
  return out;
}

// ───────────── replay ─────────────

/** One entry per change of input: the tick it starts to apply on, the angle byte and the nitro bit. */
export interface InputEntry { tick: number; angle: number; nitro: boolean; hold?: boolean }

export class Recorder {
  readonly entries: InputEntry[] = [];
  private angle = 0;
  private nitro = false;
  private hold = false;
  /** Call once per tick with the input that the step of that tick uses. */
  note(tick: number, angle: number, nitro: boolean, hold = false) {
    if (this.entries.length === 0 || angle !== this.angle || nitro !== this.nitro || hold !== this.hold) {
      this.entries.push({ tick, angle, nitro, hold });
      this.angle = angle;
      this.nitro = nitro;
      this.hold = hold;
    }
  }
}

const MAGIC = [0x47, 0x52, 0x01]; // "GR" version 1

export function decodeReplay(b: Uint8Array): { seed: number; snapshotPrefix: string; entries: InputEntry[] } {
  if (b.length < 17 || b[0] !== MAGIC[0] || b[1] !== MAGIC[1] || b[2] !== MAGIC[2]) throw new Error("not a replay");
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = dv.getUint16(15, true);
  if (b.length !== 17 + n * 4) throw new Error("replay length does not match");
  const entries: InputEntry[] = [];
  for (let i = 0; i < n; i++) {
    const o = 17 + i * 4;
    entries.push({ tick: dv.getUint16(o, true), angle: b[o + 2], nitro: (b[o + 3] & 1) === 1, hold: (b[o + 3] & 2) === 2 });
  }
  return { seed: dv.getUint32(3, true), snapshotPrefix: Array.from(b.slice(7, 15), (x) => x.toString(16).padStart(2, "0")).join(""), entries };
}

/** Re-runs a minute from its entries and returns the final state. Used to verify a replay and in tests. */
export function simulate(map: FrenzyMap, entries: readonly InputEntry[], ticks: number = FRENZY.ticks): FrenzyPlayer {
  const p = newPlayer();
  let k = 0;
  for (let t = 1; t <= ticks; t++) {
    while (k < entries.length && entries[k].tick <= t) {
      p.angle = entries[k].angle;
      p.nitro = entries[k].nitro;
      p.hold = entries[k].hold === true;
      k++;
    }
    stepPlayer(map, p);
  }
  return p;
}

/** The mass a player carries into the arena: its frenzy mass, held between the start mass and the cap. */
export const carriedMass = (m: number) => round1(clamp(m, FRENZY.startMass, FRENZY.carryCap));

