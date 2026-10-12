import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDeath, deathLine, type DeathStrings } from "./death.ts";

const S: DeathStrings = {
  youBody: "You ran into {name}'s body",
  youHead: "Head to head with {name} (lighter dies)",
  youZone: "Outside the safe zone",
  youWall: "World edge",
  onYourBody: "{name} touched your body",
  feedBody: "{name} ran into {by}'s body",
  feedHead: "{name} lost a head to head against {by}",
  feedZone: "{name} was outside the safe zone",
  feedWall: "{name} hit the world edge",
};
const names: Record<string, string> = { me: "Me", ana: "Ana", bo: "Bo" };
const nameOf = (w: string) => names[w] ?? w;
const ev = (w: string, by: string) => ({ k: "death" as const, w, by, rank: 5 });
const at = (x: number, m: number, r = 15) => ({ m, r, head: [x, 0] as const });

test("zone and wall come straight from the event", () => {
  assert.deepEqual(classifyDeath(ev("me", "zone"), undefined, undefined), { kind: "zone" });
  assert.deepEqual(classifyDeath(ev("me", "wall"), undefined, undefined), { kind: "wall" });
  assert.equal(deathLine({ kind: "zone" }, "me", "me", nameOf, S), "Outside the safe zone");
  assert.equal(deathLine({ kind: "wall" }, "me", "me", nameOf, S), "World edge");
});

test("a head that ran into a body is told so, even when the owner's head is far away", () => {
  const c = classifyDeath(ev("me", "ana"), at(0, 20), at(300, 60));
  assert.deepEqual(c, { kind: "body", by: "ana" });
  assert.equal(deathLine(c, "me", "me", nameOf, S), "You ran into Ana's body");
});

test("heads touching and the other one heavier is a head to head", () => {
  const c = classifyDeath(ev("me", "ana"), at(0, 20), at(28, 25));
  assert.deepEqual(c, { kind: "head", by: "ana" });
  assert.equal(deathLine(c, "me", "me", nameOf, S), "Head to head with Ana (lighter dies)");
  // Equal masses: both die, so it is still a head to head.
  assert.equal(classifyDeath(ev("me", "ana"), at(0, 20), at(28, 20)).kind, "head");
});

test("a lighter killer cannot have won a head to head: it was the body", () => {
  const c = classifyDeath(ev("me", "ana"), at(0, 30), at(20, 22));
  assert.deepEqual(c, { kind: "body", by: "ana" });
});

test("heads just outside touching range are not a head to head", () => {
  assert.equal(classifyDeath(ev("me", "ana"), at(0, 20, 15), at(15 + 15 + 5, 40, 15)).kind, "body");
});

test("nobody is told that somebody crashed into them", () => {
  // Every line for the local player's own death names what the player did or the zone.
  for (const cause of [{ kind: "body", by: "ana" }, { kind: "head", by: "ana" }, { kind: "zone" }, { kind: "wall" }] as const) {
    const line = deathLine(cause, "me", "me", nameOf, S);
    assert.ok(!/crash|your body/i.test(line), line);
  }
});

test("lines about other players", () => {
  assert.equal(deathLine({ kind: "body", by: "me" }, "ana", "me", nameOf, S), "Ana touched your body");
  assert.equal(deathLine({ kind: "body", by: "bo" }, "ana", "me", nameOf, S), "Ana ran into Bo's body");
  assert.equal(deathLine({ kind: "head", by: "bo" }, "ana", "me", nameOf, S), "Ana lost a head to head against Bo");
  assert.equal(deathLine({ kind: "zone" }, "ana", "me", nameOf, S), "Ana was outside the safe zone");
  assert.equal(deathLine({ kind: "wall" }, "ana", "me", nameOf, S), "Ana hit the world edge");
});
