import { test } from "node:test";
import assert from "node:assert/strict";
import { SABOTEUR_COLOR, colorFor, orbRadius, steerFromKeys, steerFromPointer, viewSpan } from "./orb-rush.ts";

test("pointer steering has a dead zone and reaches full speed at a third of the board", () => {
  assert.deepEqual(steerFromPointer(5, 5, 600, 450), { dx: 0, dy: 0 });
  const far = steerFromPointer(300, 0, 600, 450);
  assert.deepEqual(far, { dx: 1, dy: 0 });
  const mid = steerFromPointer(0, -81, 600, 450); // dead 12, full 150: (81-12)/(150-12) = 0.5
  assert.equal(mid.dx, 0);
  assert.equal(Math.round(mid.dy * 100) / 100, -0.5);
});

test("keyboard steering: WASD and arrows, diagonals normalized, null when no key is held", () => {
  assert.equal(steerFromKeys(new Set()), null);
  assert.deepEqual(steerFromKeys(new Set(["d"])), { dx: 1, dy: 0 });
  assert.deepEqual(steerFromKeys(new Set(["arrowup"])), { dx: 0, dy: -1 });
  const diag = steerFromKeys(new Set(["w", "d"]))!;
  assert.equal(Math.round(diag.dx * 1000), 707);
  assert.equal(Math.round(diag.dy * 1000), -707);
  assert.deepEqual(steerFromKeys(new Set(["a", "d"])), { dx: 0, dy: 0 }); // opposite keys cancel but still override the pointer
});

test("a wallet always gets the same color", () => {
  assert.equal(colorFor("abc"), colorFor("abc"));
  assert.notEqual(colorFor("abc"), colorFor("abd"));
  assert.match(colorFor("x"), /^hsl\(\d+ 68% 58%\)$/);
  // Paid players never get the saboteur hue family (orange and red).
  for (const w of ["a", "b", "c", "wallet1", "wallet2", "9bpD", "zzzz"]) {
    const h = Number(/hsl\((\d+)/.exec(colorFor(w))![1]);
    assert.ok(h >= 70 && h < 330, w);
  }
  assert.notEqual(colorFor("a"), SABOTEUR_COLOR);
});

test("the view widens with mass but never beyond its limit", () => {
  assert.equal(viewSpan(0), viewSpan(20), "never tighter than at the start");
  assert.ok(viewSpan(200) > viewSpan(20));
  assert.equal(viewSpan(100000), 1800);
});

test("orbs grow with their value", () => {
  assert.ok(orbRadius(1) < orbRadius(10));
  assert.equal(orbRadius(0), 3);
});
