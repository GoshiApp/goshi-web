import { test } from "node:test";
import assert from "node:assert/strict";
import { Arena, arenaBrain } from "./arena-sim.ts";
import { Replay, decodeRecord, snapPlayers, zoneOf } from "./arena-record.ts";

// Encodes like server/src/game/arena-replay.ts (GA\x01).
function encode(seed: number, matchMs: number, shrink: number, players: { w: string; role: string; bot: boolean; m: number }[], log: number[][]): Uint8Array {
  const enc = new TextEncoder();
  const names = players.map((p) => enc.encode(p.w));
  const size = 3 + 12 + 1 + players.reduce((a, _p, i) => a + 1 + names[i].length + 4, 0) + 4 + log.length * 5;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  out.set([0x47, 0x41, 1], 0);
  let o = 3;
  v.setUint32(o, seed >>> 0); o += 4; v.setUint32(o, matchMs); o += 4; v.setUint32(o, shrink); o += 4;
  v.setUint8(o++, players.length);
  players.forEach((p, i) => {
    v.setUint8(o++, names[i].length); out.set(names[i], o); o += names[i].length;
    v.setUint8(o++, p.role === "saboteur" ? 1 : 0); v.setUint8(o++, p.bot ? 1 : 0); v.setUint16(o, Math.round(p.m * 10)); o += 2;
  });
  v.setUint32(o, log.length); o += 4;
  for (const [t, i, a, f] of log) { v.setUint16(o, t); v.setUint8(o + 2, i); v.setUint8(o + 3, a); v.setUint8(o + 4, f); o += 5; }
  return out;
}

test("a record plays back to the same ranking and masses as the match that made it", () => {
  const ents = Array.from({ length: 6 }, (_, i) => ({ w: `W${i}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`, n: `P${i}`, role: (i < 5 ? "paid" : "saboteur") as "paid" | "saboteur", bot: true }));
  const matchMs = 40_000;
  const a = new Arena(12345, ents, { matchMs, shrinkStartMs: 10_000 });
  while (!a.finished()) a.step(1 / 20, arenaBrain);
  const bytes = encode(12345, matchMs, 10_000, ents.map((e) => ({ ...e, m: 20 })), a.inputLog);
  const rec = decodeRecord(bytes);
  assert.equal(rec.players.length, 6);
  const r = new Replay(rec);
  while (r.step());
  assert.deepEqual(r.arena.ranking(), a.ranking());
  // the effects index follows the arena: every orb that was eaten was found where it lay
  const probe = new Replay(rec);
  let eaten = 0, deaths = 0;
  while (probe.step()) { eaten += probe.lastEaten.length; deaths += probe.lastDeaths.length; }
  assert.ok(eaten > 0);
  assert.equal(deaths, probe.deaths.length);
  assert.deepEqual(r.arena.players.map((p) => Math.round(p.m * 10)), a.players.map((p) => Math.round(p.m * 10)));
  // seeking back and forward lands on the same state
  const t = Math.floor(r.tick / 2);
  r.seek(t);
  const mid = JSON.stringify(snapPlayers(r.arena).map((p) => [p.w, p.m, p.head]));
  r.seek(r.totalTicks);
  r.seek(t);
  assert.equal(JSON.stringify(snapPlayers(r.arena).map((p) => [p.w, p.m, p.head])), mid);
  assert.ok(zoneOf(r.arena).r > 0);
});

test("a file that is not an arena record is refused", () => {
  assert.throws(() => decodeRecord(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])), /not-arena-record/);
});
