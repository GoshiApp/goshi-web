// Reads a match record ("GA\x01", the file "Download the full match record") and plays it again in the browser with the
// same rules as the server (arena-sim.ts). Nothing here talks to a server: the file and the rules are all it needs.
// Format: seed u32 | matchMs u32 | shrinkStartMs u32 | nPlayers u8 | per player: wallet length u8, wallet, role u8, bot u8, mass u16 (x10) |
// nEntries u32 | per entry: tick u16, player index u8, angle u8, boost u8.
import { Arena, ARENA, bodyPoints, bodyRadius, type Role } from "./arena-sim.ts";
import type { Orb, PlayerSnap, ZoneNow } from "./protocol.ts";

export interface RecordPlayer { w: string; n: string; role: Role; bot: boolean; m: number }
export interface MatchRecord { seed: number; matchMs: number; shrinkStartMs: number; players: RecordPlayer[]; log: [number, number, number, number][] }

export function decodeRecord(bytes: Uint8Array): MatchRecord {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  if (magic !== "GA\u0001") throw new Error("not-arena-record");
  let o = 3;
  const seed = v.getUint32(o); o += 4;
  const matchMs = v.getUint32(o); o += 4;
  const shrinkStartMs = v.getUint32(o); o += 4;
  const n = v.getUint8(o++);
  const players: RecordPlayer[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const len = v.getUint8(o++);
    const w = dec.decode(bytes.subarray(o, o + len)); o += len;
    const role: Role = v.getUint8(o++) === 1 ? "saboteur" : "paid";
    const bot = v.getUint8(o++) === 1;
    const m = v.getUint16(o) / 10; o += 2;
    // The same short name the game shows (first 4 and last 4 characters), not the whole address.
    players.push({ w, n: `${w.slice(0, 4)}..${w.slice(-4)}`, role, bot, m });
  }
  const count = v.getUint32(o); o += 4;
  const log: [number, number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    log.push([v.getUint16(o), v.getUint8(o + 2), v.getUint8(o + 3), v.getUint8(o + 4)]);
    o += 5;
  }
  return { seed, matchMs, shrinkStartMs, players, log };
}

export const TICK_S = 1 / ARENA.tickRate;

/** One match being played again. Moves forward by ticks; `seek` starts over and runs to a tick (it is fast: no drawing). */
export class Replay {
  arena!: Arena;
  tick = 0;
  private k = 0;
  /** Every elimination so far: when, who and by what (a wallet, "zone" or "wall"). */
  deaths: { t: number; w: string; by: string }[] = [];
  /** What the last tick did: the orbs that were eaten (where they were) and who was eliminated. */
  lastEaten: Orb[] = [];
  lastDeaths: { w: string; by: string }[] = [];
  private idx = new Map<number, Orb>();
  readonly totalTicks: number;
  readonly rec: MatchRecord;
  constructor(rec: MatchRecord) {
    this.rec = rec;
    this.totalTicks = Math.floor(rec.matchMs / 1000 / TICK_S);
    this.reset();
  }
  reset() {
    const r = this.rec;
    this.arena = new Arena(r.seed, r.players, { matchMs: r.matchMs, shrinkStartMs: r.shrinkStartMs });
    r.players.forEach((p, i) => { this.arena.players[i].m = p.m; this.arena.players[i].peak = p.m; });
    this.tick = 0;
    this.k = 0;
    this.deaths = [];
    this.lastEaten = [];
    this.lastDeaths = [];
    this.idx = new Map(this.arena.orbs.map((o) => [o.id, o]));
  }
  get done() { return this.arena.finished() || this.tick >= this.totalTicks; }
  /** Plays one tick. Returns false when the match is over. */
  step(): boolean {
    if (this.done) return false;
    const log = this.rec.log;
    while (this.k < log.length && log[this.k][0] === this.tick) {
      const [, pi, ab, f] = log[this.k++];
      const p = this.arena.players[pi];
      const hd = (ab / 256) * Math.PI * 2;
      p.dx = Math.cos(hd);
      p.dy = Math.sin(hd);
      p.boost = f === 1;
    }
    const ev = this.arena.step(TICK_S);
    for (const d of ev.deaths) this.deaths.push({ t: this.arena.time, w: d.w, by: d.by });
    this.lastEaten = [];
    for (const id of ev.eatenOrbs) {
      const o = this.idx.get(id);
      if (o) { this.lastEaten.push(o); this.idx.delete(id); }
    }
    for (const o of ev.newOrbs) this.idx.set(o.id, o);
    this.lastDeaths = ev.deaths;
    this.tick++;
    return true;
  }
  seek(tick: number) {
    if (tick < this.tick) this.reset();
    while (this.tick < tick && this.step());
  }
  get seconds() { return this.arena.time; }
  get lengthSeconds() { return Math.min(this.rec.matchMs / 1000, this.arena.finished() ? this.arena.time : this.rec.matchMs / 1000); }
}

export function zoneOf(a: Arena): ZoneNow {
  const z = a.zoneNow();
  const out: ZoneNow = { cx: z.cx, cy: z.cy, r: z.r, phase: z.phase, state: z.state, inMs: Math.round(z.inSeconds * 1000) };
  if (z.target) out.target = { cx: z.target.cx, cy: z.target.cy, r: z.target.r };
  return out;
}

export function snapPlayers(a: Arena): PlayerSnap[] {
  const z = a.zoneNow();
  return a.players.map((p) => ({
    w: p.w, n: p.n, role: p.role, bot: p.bot, alive: p.alive,
    zout: p.alive && Math.hypot(p.x - z.cx, p.y - z.cy) > z.r,
    prot: p.alive && p.protectUntil > a.time,
    h: p.heading, m: p.m, r: bodyRadius(p.m),
    head: [p.x, p.y] as [number, number],
    body: p.alive ? bodyPoints(p).slice(1).map((q) => [q[0], q[1]] as [number, number]) : [],
  }));
}

/** Orbs by id. The ones a body turned into have fractional values: the painter draws them as golden loot, like in the game. */
export const orbMap = (orbs: readonly Orb[]): Map<number, Orb & { loot?: boolean }> =>
  new Map(orbs.map((o) => [o.id, Number.isInteger(o.v) ? o : { ...o, loot: true }]));
