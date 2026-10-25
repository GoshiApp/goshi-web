import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanGuestCode, cleanGuestName, GUEST_NAME_A, GUEST_NAME_B, GUEST_NAME_MAX, makeGuestName } from "./guest.ts";

test("cleanGuestName strips symbols and caps at 14 characters", () => {
  assert.equal(cleanGuestName("  Orb***Veloz😀  "), "OrbVeloz");
  assert.equal(cleanGuestName("a".repeat(30)), "a".repeat(GUEST_NAME_MAX));
  assert.equal(cleanGuestName("!!!"), "");
});

test("makeGuestName is deterministic with an injected rng and stays short", () => {
  assert.equal(makeGuestName(() => 0), `${GUEST_NAME_A[0]}${GUEST_NAME_B[0]}00`);
  for (let i = 0; i < 100; i++) {
    const name = makeGuestName(Math.random);
    assert.ok(name.length <= GUEST_NAME_MAX, `too long: ${name}`);
    assert.match(name, /^[A-Za-z0-9]+$/);
  }
});

test("cleanGuestCode uppercases and keeps only valid characters", () => {
  assert.equal(cleanGuestCode("k7q2"), "K7Q2");
  assert.equal(cleanGuestCode(" k7 q2! "), "K7Q2");
  assert.equal(cleanGuestCode("!!!"), "");
});
