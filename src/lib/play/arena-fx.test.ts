import { test } from "node:test";
import assert from "node:assert/strict";
import { FxPool, Kind, TIER_SCALE, boostFuel, boostSeconds, orbPulse, orbTier, shakeAmplitude, shakeOffset } from "./arena-fx.ts";
import { ArenaSound, MIN_GAP_MS, SOUND_KEY } from "./arena-sound.ts";

test("orb tiers: values 1, 2 and 4 are the map orbs, anything else or flagged is loot", () => {
  assert.equal(orbTier(1), 0);
  assert.equal(orbTier(2), 1);
  assert.equal(orbTier(4), 2);
  assert.equal(orbTier(1.25), 3, "a body turned into orbs");
  assert.equal(orbTier(0.4), 3);
  assert.equal(orbTier(1, true), 3, "flagged as loot");
  assert.ok(TIER_SCALE[2] > TIER_SCALE[1] && TIER_SCALE[3] > TIER_SCALE[2], "bigger tiers are bigger");
});

test("orb pulse stays within 12 percent and differs between orbs", () => {
  for (let t = 0; t < 5000; t += 137) assert.ok(Math.abs(orbPulse(t, 7) - 1) <= 0.12 + 1e-9);
  assert.notEqual(orbPulse(1000, 1), orbPulse(1000, 2));
});

test("boost fuel is the share of the mass that can still be burned", () => {
  assert.equal(boostFuel(12), 0);
  assert.equal(boostFuel(5), 0);
  assert.ok(Math.abs(boostFuel(20) - 0.4) < 1e-9);
  assert.ok(boostFuel(100) > boostFuel(20));
  assert.ok(boostFuel(1e6) <= 1);
});

test("boost seconds follow the 1.5 percent per second cost down to the minimum", () => {
  assert.equal(boostSeconds(12), 0);
  // 20 -> 12 at 1.5% per second: ln(20/12) / -ln(0.985), about 34 s.
  const s = boostSeconds(20);
  assert.ok(s > 33 && s < 35, String(s));
  assert.ok(boostSeconds(100) > boostSeconds(20));
});

test("shake decays by half every half life and ends", () => {
  assert.equal(shakeAmplitude(10, 0), 10);
  assert.ok(Math.abs(shakeAmplitude(10, 110) - 5) < 1e-9);
  assert.equal(shakeAmplitude(10, 5000), 0);
  const [dx, dy] = shakeOffset(4, 123);
  assert.ok(Math.abs(dx) <= 4 && Math.abs(dy) <= 4);
  assert.equal(Math.abs(shakeOffset(0, 55)[0]) + Math.abs(shakeOffset(0, 55)[1]), 0);
});

test("the effect pool never grows past its size and expires effects", () => {
  const p = new FxPool(5);
  let seq = 0;
  const rand = () => ((seq = (seq + 1) % 7) + 0.5) / 8;
  p.burst(10, 10, 8, 100, 3, 0, rand);
  assert.equal(p.count, 5, "extra effects are dropped, not allocated");
  p.step(0.2);
  assert.equal(p.count, 5);
  p.step(2);
  assert.equal(p.count, 0, "everything expired");
  assert.equal(p.add(Kind.Ring, 0, 0, 0, 0, 1, 4, 0), true);
  p.pop(1, 1, 5, 1);
  assert.equal(p.count, 2);
  p.clear();
  assert.equal(p.count, 0);
});

test("pool step moves particles and slows them down", () => {
  const p = new FxPool(4);
  p.add(Kind.Particle, 0, 0, 100, 0, 1, 2, 0);
  p.step(0.1);
  const g = { globalAlpha: 1, strokeStyle: "", fillStyle: "", lineWidth: 0, beginPath() {}, arc: (x: number) => { xs.push(x); }, fill() {}, stroke() {} };
  const xs: number[] = [];
  p.draw(g as unknown as CanvasRenderingContext2D, ["#fff"], 1, -1000, 1000, -1000, 1000);
  assert.equal(xs.length, 1);
  assert.ok(xs[0] > 5 && xs[0] < 10, `moved less than 10 because of drag (${xs[0]})`);
});

class FakeStore { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }
const fakeAudio = () => {
  const calls: string[] = [];
  const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const ctx = {
    state: "running", currentTime: 0, destination: {},
    resume() { calls.push("resume"); return Promise.resolve(); },
    createOscillator() { return { type: "", frequency: param, connect: (n: unknown) => n, start() { calls.push("osc"); }, stop() {} }; },
    createGain() { return { gain: param, connect: (n: unknown) => n }; },
  };
  return { ctx: ctx as unknown as AudioContext, calls };
};

test("sound is off by default, remembers the choice and plays only after it is switched on", () => {
  const store = new FakeStore();
  const a = fakeAudio();
  let t = 0;
  const s = new ArenaSound({ storage: store, context: () => a.ctx, now: () => t });
  assert.equal(s.enabled, false);
  assert.equal(s.play("eat"), false, "silent by default");
  assert.equal(s.toggle(), true);
  assert.equal(store.getItem(SOUND_KEY), "on");
  t = 1000;
  assert.equal(s.play("eat"), true);
  t += MIN_GAP_MS.eat - 1;
  assert.equal(s.play("eat"), false, "rate limited");
  t += 5;
  assert.equal(s.play("eat"), true);
  assert.equal(a.calls.filter((c) => c === "osc").length, 2);
  // A new page load restores the choice.
  const s2 = new ArenaSound({ storage: store, context: () => a.ctx, now: () => 0 });
  assert.equal(s2.enabled, true);
  assert.equal(s2.toggle(), false);
  assert.equal(store.getItem(SOUND_KEY), "off");
});

test("sound survives blocked storage and a device without audio", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const s = new ArenaSound({ storage: broken, context: () => null });
  assert.equal(s.enabled, false);
  assert.equal(s.toggle(), true);
  assert.equal(s.play("death"), false, "no context, no sound, no error");
});
