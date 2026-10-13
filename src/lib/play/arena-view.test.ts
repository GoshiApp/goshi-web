import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HEAD_DRAW_SCALE, HEAD_SCREEN_FRACTION, aliveRank, dangerLevel, distanceToPath, protectionSecondsLeft, viewSpan, zoneGuide,
} from "./arena-view.ts";
import { bodyRadius } from "./predict.ts";

test("at the start the head is about 4 percent of the shorter side and the view zooms out with mass", () => {
  const head = 2 * bodyRadius(20) * HEAD_DRAW_SCALE;
  assert.ok(Math.abs(head / viewSpan(20) - HEAD_SCREEN_FRACTION) < 1e-9);
  assert.ok(viewSpan(100) > viewSpan(20));
  assert.ok(viewSpan(300) > viewSpan(100));
  // It zooms out slower than the body grows: the head gets a little bigger on screen, never smaller.
  const share = (m: number) => (2 * bodyRadius(m) * HEAD_DRAW_SCALE) / viewSpan(m);
  assert.ok(share(300) >= share(20));
  assert.ok(share(300) < 0.07);
});

test("distance to a path uses the segments, not only the points", () => {
  assert.equal(distanceToPath([5, 3], [[0, 0], [10, 0]]), 3);
  assert.equal(distanceToPath([-4, 3], [[0, 0], [10, 0]]), 5);
  assert.equal(distanceToPath([1, 1], []), Infinity);
});

test("danger starts at two body radii and is full at the lethal distance", () => {
  const other = [{ w: "x", path: [[0, 0], [100, 0]] as [number, number][], r: 15 }];
  const my = 15;
  assert.equal(dangerLevel([50, 15 + 2 * my + 1], my, other, false).level, 0);
  const lethal = 15 + 0.35 * my;
  assert.equal(dangerLevel([50, lethal], my, other, false).level, 1);
  const mid = dangerLevel([50, (lethal + 15 + 2 * my) / 2], my, other, false);
  assert.ok(Math.abs(mid.level - 0.5) < 1e-9);
  assert.equal(mid.by, "x");
  assert.equal(dangerLevel([50, lethal], my, other, true).level, 0, "protected: cannot die");
});

test("spawn protection counts 3 2 1 from the match clock", () => {
  assert.equal(protectionSecondsLeft(300000, 300000), 3);
  assert.equal(protectionSecondsLeft(300000, 299000), 2);
  assert.equal(protectionSecondsLeft(300000, 297500), 1);
  assert.equal(protectionSecondsLeft(300000, 297000), 0);
});

test("the zone guide says when you are outside and where to go", () => {
  const out = zoneGuide([0, 0], { cx: 100, cy: 0, r: 40 });
  assert.equal(out.outside, true);
  assert.equal(out.angle, 0);
  assert.equal(out.overBy, 60);
  assert.equal(zoneGuide([90, 0], { cx: 100, cy: 0, r: 40 }).outside, false);
});

test("rank among the alive players by mass, ties to the lower wallet", () => {
  const ps = [
    { w: "b", m: 30, alive: true }, { w: "a", m: 30, alive: true }, { w: "c", m: 50, alive: true }, { w: "d", m: 90, alive: false },
  ];
  assert.deepEqual(aliveRank(ps, "c"), { rank: 1, of: 3 });
  assert.deepEqual(aliveRank(ps, "a"), { rank: 2, of: 3 });
  assert.deepEqual(aliveRank(ps, "b"), { rank: 3, of: 3 });
  assert.equal(aliveRank(ps, "d"), null);
});


import { dangerAmong, distanceToSnake, headOnPairs } from "./arena-view.ts";

test("distance to a snake counts the head and every body segment", () => {
  assert.equal(distanceToSnake([0, 10], [0, 0], [[10, 0], [20, 0]]), 10);
  assert.equal(distanceToSnake([15, 3], [0, 0], [[10, 0], [20, 0]]), 3);
  assert.equal(distanceToSnake([30, 0], [0, 0], [[10, 0], [20, 0]]), 10);
  assert.equal(distanceToSnake([3, 4], [0, 0], []), 5);
});

test("dangerAmong agrees with dangerLevel, skips you and the dead", () => {
  const my = 15;
  const lethal = 15 + 0.35 * my;
  const snakes = [
    { w: "me", head: [50, lethal] as [number, number], body: [] as [number, number][], r: 15, alive: true },
    { w: "x", head: [0, 0] as [number, number], body: [[100, 0]] as [number, number][], r: 15, alive: true },
    { w: "dead", head: [50, 1] as [number, number], body: [] as [number, number][], r: 15, alive: false },
  ];
  assert.equal(dangerAmong([50, lethal], my, snakes, "me", false), 1);
  assert.equal(dangerAmong([50, lethal], my, snakes, "me", true), 0);
  const viaLevel = dangerLevel([50, 30], my, [{ w: "x", path: [[0, 0], [100, 0]], r: 15 }], false).level;
  assert.ok(Math.abs(dangerAmong([50, 30], my, snakes, "me", false) - viaLevel) < 1e-9);
});

test("the head of a lighter player is not a danger, the head of a heavier one is, bodies always are", () => {
  const my = 15, mine = 100;
  const at = (x: number, y: number) => [x, y] as [number, number];
  const lighter = { w: "small", head: at(0, 0), body: [at(-10, 0), at(-20, 0), at(-30, 0)], r: 15, alive: true, m: 40 };
  const heavier = { ...lighter, w: "big", m: 400 };
  const equal = { ...lighter, w: "twin", m: 100 };
  // my head right on their head (inside the head contact distance of 30)
  assert.equal(dangerAmong(at(20, 0), my, [lighter], "me", false, mine), 0, "I win a head on against a lighter one");
  assert.equal(dangerAmong(at(20, 0), my, [heavier], "me", false, mine), 1, "I lose it against a heavier one");
  assert.equal(dangerAmong(at(20, 0), my, [equal], "me", false, mine), 1, "equal masses both die");
  // my head on their body, outside the head contact distance (30): lethal whoever is heavier
  assert.equal(dangerAmong(at(-30, 15 + 0.35 * my), my, [lighter], "me", false, mine), 1);
  assert.equal(dangerAmong(at(-30, 15 + 0.35 * my), my, [heavier], "me", false, mine), 1);
  // a head still a bit away from a lighter head: nothing to warn about
  assert.equal(dangerAmong(at(60, 0), my, [lighter], "me", false, mine), 0);
  // without masses every part is lethal, as before
  assert.equal(dangerAmong(at(20, 0), my, [{ ...lighter, m: undefined }], "me", false), 1);
});

test("head on pairs: the heavier head benefits, the lighter one is eliminated, equal masses nobody benefits", () => {
  const at = (x: number, y: number) => [x, y] as [number, number];
  const mk = (w: string, x: number, m: number, extra: object = {}) => ({ w, head: at(x, 0), body: [] as [number, number][], r: 15, alive: true, m, ...extra });
  // touching distance is r + r = 30
  const one = headOnPairs([mk("big", 0, 400), mk("small", 30, 40)]);
  assert.equal(one.length, 1);
  assert.equal(one[0].winner, "big");
  assert.equal(one[0].level, 1);
  assert.equal(headOnPairs([mk("a", 0, 100), mk("b", 30, 100)])[0].winner, null, "equal masses both die");
  assert.equal(headOnPairs([mk("a", 0, 100), mk("b", 200, 40)]).length, 0, "far away");
  assert.equal(headOnPairs([mk("a", 0, 100), mk("b", 30, 40, { prot: true })]).length, 0, "protected: harmless");
  assert.equal(headOnPairs([mk("a", 0, 100), mk("b", 30, 40, { alive: false })]).length, 0, "dead");
  assert.equal(headOnPairs([mk("a", 0, 100), mk("b", 30, 40, { m: undefined })]).length, 0, "no mass, no verdict");
  // approaching: the level grows as the heads get closer
  const far = headOnPairs([mk("a", 0, 100), mk("b", 50, 40)])[0].level;
  const close = headOnPairs([mk("a", 0, 100), mk("b", 40, 40)])[0].level;
  assert.ok(far > 0 && close > far && close < 1);
  // three heads: every pair that is close is reported once
  assert.equal(headOnPairs([mk("a", 0, 100), mk("b", 30, 40), mk("c", 60, 10)]).length, 2);
});

test("the zone guide follows a zone that is not centered on the arena", () => {
  // The circle has drifted to the north east: from the arena center you are outside it and the way back is up and right.
  const zone = { cx: 2300, cy: 700, r: 300 };
  const g = zoneGuide([1500, 1500], zone);
  assert.equal(g.outside, true);
  assert.ok(Math.abs(g.angle - Math.atan2(-800, 800)) < 1e-9);
  assert.ok(Math.abs(g.overBy - (Math.hypot(800, 800) - 300)) < 1e-9);
  assert.equal(zoneGuide([2300, 700], zone).outside, false);
});
