import { test } from "node:test";
import assert from "node:assert/strict";
import { RENDER_DELAY_MS, SnapBuffer, blend, type TimedSnap } from "./interp.ts";
import type { PlayerSnap } from "./protocol.ts";

const P = (w: string, x: number, y: number, m = 20, alive = true, body: [number, number][] = []): PlayerSnap => ({
  w, n: w, role: "paid", bot: false, alive, prot: false, h: 0, m, r: 5 + 0.6 * Math.sqrt(m), head: [x, y], body,
});
const snap = (at: number, zr: number, ...players: PlayerSnap[]): TimedSnap => ({ at, players, zone: { cx: 1500, cy: 1500, r: zr } });

test("blend takes the midpoint of the head, the body points, mass and the zone", () => {
  const out = blend(
    snap(0, 1000, P("a", 0, 0, 10, true, [[-10, 0], [-20, 0]])),
    snap(100, 800, P("a", 100, 40, 20, true, [[90, 40], [80, 40]])),
    0.5,
  );
  assert.deepEqual(out.players[0].head, [50, 20]);
  assert.deepEqual(out.players[0].body, [[40, 20], [30, 20]]);
  assert.equal(out.players[0].m, 15);
  assert.equal(out.zone.r, 900);
});

test("a body that grew keeps its new tail points", () => {
  const out = blend(snap(0, 1, P("a", 0, 0, 10, true, [[-1, 0]])), snap(100, 1, P("a", 10, 0, 10, true, [[9, 0], [8, 0]])), 0.5);
  assert.deepEqual(out.players[0].body, [[4, 0], [8, 0]]);
});

test("a jump larger than the teleport distance, a dead or a new player is shown as it is", () => {
  assert.deepEqual(blend(snap(0, 1, P("a", 0, 0)), snap(100, 1, P("a", 1500, 1500)), 0.5).players[0].head, [1500, 1500]);
  assert.deepEqual(blend(snap(0, 1, P("a", 0, 0, 20, false)), snap(100, 1, P("a", 80, 0)), 0.5).players[0].head, [80, 0]);
  assert.deepEqual(blend(snap(0, 1), snap(100, 1, P("b", 5, 5)), 0.5).players[0].head, [5, 5]);
});

test("sample blends between the two snapshots around the render time", () => {
  const b = new SnapBuffer();
  b.push(snap(1000, 100, P("a", 0, 0)));
  b.push(snap(1100, 90, P("a", 100, 0)));
  b.push(snap(1200, 80, P("a", 300, 0)));
  assert.equal(b.sample(1050 + RENDER_DELAY_MS)!.players[0].head[0], 50);
  assert.equal(b.sample(1150 + RENDER_DELAY_MS)!.players[0].head[0], 200);
  assert.equal(b.sample(1150 + RENDER_DELAY_MS)!.zone.r, 85);
});

test("sample holds the first and last snapshot outside the range, and handles empty", () => {
  const b = new SnapBuffer();
  assert.equal(b.sample(0), null);
  b.push(snap(1000, 1, P("a", 10, 0)));
  b.push(snap(1100, 1, P("a", 20, 0)));
  assert.equal(b.sample(500)!.players[0].head[0], 10);
  assert.equal(b.sample(5000)!.players[0].head[0], 20);
});

test("out of order and duplicate snapshots are ignored, and the buffer is bounded", () => {
  const b = new SnapBuffer();
  b.push(snap(100, 1, P("a", 1, 0)));
  b.push(snap(100, 1, P("a", 2, 0)));
  b.push(snap(50, 1, P("a", 3, 0)));
  assert.equal(b.latest?.players[0].head[0], 1);
  for (let i = 1; i <= 100; i++) b.push(snap(100 + i, 1, P("a", i, 0)));
  assert.equal(b.latest?.players[0].head[0], 100);
  b.clear();
  assert.equal(b.latest, null);
});
