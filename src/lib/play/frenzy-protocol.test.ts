import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeServer } from "./protocol.ts";

const frenzy = {
  startsAt: 1, ms: 60000, tickRate: 20, start: { x: 1200, y: 1200, m: 20 }, carryCap: 90,
  map: { w: 2400, h: 2400, gems: [[1, 10, 20, 0, 1, 0], [2, 30, 40, 5, 8, 1]], walls: [[0, 0, 10, 10]], lasers: [[5, 5, 10, 10, 3]], laserPeriod: 120, laserOn: 60, btcRespawnMs: 15000 },
  snapshot: { hash: "ab", source: "coingecko", at: 1, usd: { SOL: 100 }, mass: { SOL: 1 } },
  commit: "cd", signature: "ef",
};
const start = {
  t: "start", roomId: "r", mode: "royale", startsAt: 5, matchMs: 300000, shrinkStartMs: 120000, world: { w: 3000, h: 3000 },
  zone: { cx: 1500, cy: 1500, r0: 1450, rMin: 150 }, orbs: [], you: "me", roles: { me: "paid" }, frenzy,
};

test("start carries the minute of frenzy", () => {
  const m = decodeServer(JSON.stringify(start));
  assert.equal(m?.t, "start");
  if (m?.t === "start") {
    assert.equal(m.frenzy?.map.gems.length, 2);
    assert.equal(m.frenzy?.map.gems[1][5], 1);
  }
});

test("a start with a broken frenzy still decodes, without it", () => {
  const m = decodeServer(JSON.stringify({ ...start, frenzy: { ...frenzy, map: { ...frenzy.map, gems: [[1, 2]] } } }));
  assert.equal(m?.t, "start");
  if (m?.t === "start") assert.equal(m.frenzy, undefined);
});

test("fsnap, fend and stats are validated", () => {
  const f = decodeServer(JSON.stringify({ t: "fsnap", roomId: "r", tick: 3, timeLeftMs: 59000, you: { x: 1, y: 2, m: 20, stun: 0, h: 5 }, taken: [4], back: [], hit: false, top: [["a", 30]], rank: 1 }));
  assert.equal(f?.t, "fsnap");
  assert.equal(decodeServer(JSON.stringify({ t: "fsnap", roomId: "r" })), null);
  assert.equal(decodeServer(JSON.stringify({ t: "fend", roomId: "r", mass: 40, carried: 40, eaten: 20, replay: "ab" }))?.t, "fend");
  const s = decodeServer(JSON.stringify({ t: "stats", online: 3, playing: 1, matches: 7, volume: "123", prices: null, solUsd: 100 }));
  assert.equal(s?.t, "stats");
  assert.equal(decodeServer(JSON.stringify({ t: "stats", online: "x" })), null);
});
