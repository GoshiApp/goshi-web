import { test } from "node:test";
import assert from "node:assert/strict";
import { FINAL_PHASE, phaseKey, zoneDamagePerSecond, zoneStatus, zoneText, type ZoneStrings } from "./arena-zone.ts";
import { LabelPlacer } from "./arena-view.ts";

const S: ZoneStrings = {
  calm: "Zone phase 1 starts in {s} s",
  warn: "Next zone marked, it moves in {s} s",
  shrink: "The zone is closing, get inside",
  hold: "Zone holds, next in {s} s",
  final: "Final zone",
};

test("outside damage is the server formula: (mass * 0.10 + 3) * (1 + 0.3 * (phase - 1))", () => {
  assert.equal(zoneDamagePerSecond(20, 1), 5);
  assert.equal(zoneDamagePerSecond(100, 1), 13);
  assert.ok(Math.abs(zoneDamagePerSecond(20, 3) - 5 * 1.6) < 1e-9);
  assert.ok(Math.abs(zoneDamagePerSecond(50, 5) - 8 * 2.2) < 1e-9);
  assert.equal(zoneDamagePerSecond(20, 0), 5, "before the first phase it is the base rate");
  assert.equal(zoneDamagePerSecond(-5, 1), 3);
});

test("the zone line follows the state: calm, warn, shrink, hold and the final zone", () => {
  assert.equal(zoneText(zoneStatus({ phase: 0, state: "calm", inMs: 4500 }), S), "Zone phase 1 starts in 5 s");
  assert.equal(zoneText(zoneStatus({ phase: 0, state: "warn", inMs: 3000 }), S), "Next zone marked, it moves in 3 s");
  assert.equal(zoneText(zoneStatus({ phase: 2, state: "warn", inMs: 7200 }), S), "Next zone marked, it moves in 8 s");
  assert.equal(zoneText(zoneStatus({ phase: 2, state: "shrink", inMs: 9000 }), S), "The zone is closing, get inside");
  assert.equal(zoneText(zoneStatus({ phase: 3, state: "hold", inMs: 12000 }), S), "Zone holds, next in 12 s");
  assert.equal(zoneText(zoneStatus({ phase: FINAL_PHASE, state: "hold", inMs: 0 }), S), "Final zone");
  assert.equal(zoneText(zoneStatus({ phase: 4, state: "hold", inMs: 1000 }), S), "Zone holds, next in 1 s", "Final zone is only for phase 5");
});

test("the countdown runs between snapshots and never goes below zero", () => {
  assert.equal(zoneStatus({ phase: 1, state: "hold", inMs: 5000 }, 2200).seconds, 3);
  assert.equal(zoneStatus({ phase: 1, state: "hold", inMs: 1000 }, 5000).seconds, 0);
  assert.equal(zoneStatus({}).line, "calm", "an older server with no state");
});

test("a phase or a state is announced once: the key changes only when one begins", () => {
  assert.equal(phaseKey({ phase: 0, state: "calm" }), null);
  assert.equal(phaseKey({}), null);
  const a = phaseKey({ phase: 1, state: "warn" });
  assert.equal(a, phaseKey({ phase: 1, state: "warn" }));
  assert.notEqual(a, phaseKey({ phase: 1, state: "shrink" }));
  assert.notEqual(phaseKey({ phase: 1, state: "hold" }), phaseKey({ phase: 2, state: "hold" }));
});

test("labels: one on top of another is hidden, a label may touch its own head, and heads block labels", () => {
  const p = new LabelPlacer();
  p.block(100, 100, 120, 120, 0); // the head of snake 0
  p.block(105, 150, 125, 170, 1); // the head of snake 1, below snake 0
  assert.equal(p.tryPlace(95, 80, 130, 100, 0), true, "above its own head");
  // Snake 1's label would sit over snake 0's head box and label: hidden.
  assert.equal(p.tryPlace(98, 105, 140, 125, 1), false);
  assert.equal(p.tryPlace(200, 200, 240, 215, 2), true, "somewhere free");
  assert.equal(p.tryPlace(100, 85, 150, 100, 3), false, "over the first label");
  p.reset();
  assert.equal(p.tryPlace(100, 85, 150, 100, 3), true, "after a reset");
});
