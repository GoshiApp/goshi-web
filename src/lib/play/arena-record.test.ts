import { test } from "node:test";
import assert from "node:assert/strict";
import { Arena, arenaBrain } from "./arena-sim.ts";
import { Replay, decodeRecord, snapPlayers, zoneOf } from "./arena-record.ts";

// Encodes like server/src/game/arena-replay.ts (GA\x01 for rules 1, GA\x02 for rules 2).
function encode(seed: number, matchMs: number, shrink: number, players: { w: string; role: string; bot: boolean; m: number }[], log: number[][], rules = 2): Uint8Array {
  const enc = new TextEncoder();
  const names = players.map((p) => enc.encode(p.w));
  const size = 3 + 12 + 1 + players.reduce((a, _p, i) => a + 1 + names[i].length + 4, 0) + 4 + log.length * 5;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  out.set([0x47, 0x41, rules], 0);
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

test("a record with a dropped connection and a return plays back like the match that made it", () => {
  const ents = Array.from({ length: 6 }, (_, i) => ({ w: `W${i}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`, n: `P${i}`, role: "paid" as const, bot: i >= 2 }));
  const a = new Arena(4711, ents, { matchMs: 60_000, shrinkStartMs: 8_000 });
  const start = a.players.map((p) => ({ w: p.w, role: p.role, bot: p.bot, m: p.m }));
  let tick = 0;
  while (!a.finished() && a.time * 1000 < 60_000) {
    for (const e of [ents[0], ents[1]]) a.setInput(e.w, Math.cos(tick / 40), Math.sin(tick / 40), tick % 90 < 10);
    if (tick === 200) a.away(ents[0].w);
    if (tick === 300) a.away(ents[1].w);
    if (tick === 600) a.back(ents[0].w);
    a.step(1 / 20, arenaBrain);
    tick++;
  }
  assert.ok(a.inputLog.some((e) => e[3] === 2));
  assert.ok(a.inputLog.some((e) => e[3] === 3));
  const r = new Replay(decodeRecord(encode(4711, 60_000, 8_000, start, a.inputLog)));
  while (r.step());
  assert.deepEqual(r.arena.ranking(), a.ranking());
  assert.deepEqual(r.arena.players.map((p) => p.alive), a.players.map((p) => p.alive));
  // The drain and "eats nothing" are part of the simulation: the masses must agree too.
  assert.deepEqual(r.arena.players.map((p) => Math.round(p.m * 10)), a.players.map((p) => Math.round(p.m * 10)));
});

test("a record of the first version plays back with the first rules, and a new one with the new rules", () => {
  for (const rules of [1, 2] as const) {
    const ents = Array.from({ length: 6 }, (_, i) => ({ w: `V${i}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`, n: `P${i}`, role: "paid" as const, bot: true }));
    const a = new Arena(777, ents, { matchMs: 30_000, shrinkStartMs: 8_000, rules });
    while (!a.finished() && a.time * 1000 < 30_000) a.step(1 / 20, arenaBrain);
    const rec = decodeRecord(encode(777, 30_000, 8_000, ents.map((e) => ({ ...e, m: 20 })), a.inputLog, rules));
    assert.equal(rec.rules, rules);
    const r = new Replay(rec);
    while (r.step());
    assert.deepEqual(r.arena.ranking(), a.ranking());
  }
});
