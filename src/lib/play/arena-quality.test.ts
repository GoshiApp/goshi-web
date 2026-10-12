import { test } from "node:test";
import assert from "node:assert/strict";
import { PAUSE_MS, QUALITY_KEY, QualityManager, RECOVER_AFTER_MS, SETTINGS, SLOW_FRAME_MS, WINDOW_MS } from "./arena-quality.ts";
import { ArenaDiag } from "./arena-diag.ts";

class Store { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }

/** Feeds frames of `ms` for `seconds`, returns the time reached and how many level changes happened. */
function run(q: QualityManager, from: number, seconds: number, ms: number): { t: number; changes: number } {
  let t = from, changes = 0;
  for (; t < from + seconds * 1000; t += ms) if (q.record(ms, t)) changes++;
  return { t, changes };
}

test("starts at high, and quality settings only get cheaper going down", () => {
  const q = new QualityManager();
  assert.equal(q.level, 0);
  assert.equal(q.mode, "auto");
  assert.ok(SETTINGS[0].shadowGlow && !SETTINGS[1].shadowGlow && !SETTINGS[2].shadowGlow);
  assert.ok(SETTINGS[1].layeredGlow && !SETTINGS[2].layeredGlow);
  assert.ok(SETTINGS[0].dprCap <= 1.5 && SETTINGS[2].dprCap === 1);
  assert.ok(!SETTINGS[2].particles && !SETTINGS[2].vignette);
});

test("a steady 60 fps never changes the level", () => {
  const q = new QualityManager();
  assert.equal(run(q, 0, 30, 16.7).changes, 0);
  assert.equal(q.level, 0);
});

test("a window averaging above 20 ms drops one level, then another, and stops at low", () => {
  const q = new QualityManager();
  let r = run(q, 0, 1.6, 30); // one 1.5 s window of 30 ms frames
  assert.equal(q.level, 1);
  r = run(q, r.t, 1.6, 30);
  assert.equal(q.level, 2);
  r = run(q, r.t, 5, 30);
  assert.equal(q.level, 2, "low is the floor");
});

test("one slow frame in a good window does not drop the level", () => {
  const q = new QualityManager();
  let t = 0;
  for (let i = 0; i < 90; i++) { q.record(i === 40 ? 120 : 16.7, t); t += 16.7; }
  assert.equal(q.level, 0);
});

test("it recovers one level after 6 s of good frames, not before", () => {
  const q = new QualityManager();
  let r = run(q, 0, 1.6, 30);
  assert.equal(q.level, 1);
  r = run(q, r.t, (RECOVER_AFTER_MS - 2000) / 1000, 16.7);
  assert.equal(q.level, 1, "not yet");
  r = run(q, r.t, 4, 16.7);
  assert.equal(q.level, 0, "back to high");
});

test("if it drops again right after a recovery it waits longer before trying again", () => {
  const q = new QualityManager();
  let r = run(q, 0, 1.6, 30);
  r = run(q, r.t, 7.5, 16.7);
  assert.equal(q.level, 0);
  r = run(q, r.t, 1.6, 30);
  assert.equal(q.level, 1);
  // The same 7.5 s of good frames is no longer enough (the wait doubled to 12 s).
  r = run(q, r.t, 7.5, 16.7);
  assert.equal(q.level, 1);
  r = run(q, r.t, 6, 16.7);
  assert.equal(q.level, 0);
});

test("a hidden tab (a very long gap) is a pause, not a slow frame", () => {
  const q = new QualityManager();
  let t = 0;
  for (let i = 0; i < 20; i++) { q.record(16.7, t); t += 16.7; }
  assert.equal(q.record(PAUSE_MS + 1, t + 5000), false);
  for (let i = 0; i < 100; i++) { q.record(16.7, t + 6000 + i * 16.7); }
  assert.equal(q.level, 0);
});

test("a manual choice is fixed, remembered, and the automatic logic stays out of it", () => {
  const store = new Store();
  const q = new QualityManager(store);
  q.setMode("low");
  assert.equal(q.level, 2);
  assert.equal(store.getItem(QUALITY_KEY), "low");
  assert.equal(run(q, 0, 10, 16.7).changes, 0);
  const again = new QualityManager(store);
  assert.equal(again.mode, "low");
  assert.equal(again.level, 2);
  again.setMode("auto");
  assert.equal(again.level, 0);
  assert.equal(run(again, 0, 1.6, 40).changes, 1);
  store.setItem(QUALITY_KEY, "nonsense");
  assert.equal(new QualityManager(store).mode, "auto");
  assert.equal(SLOW_FRAME_MS, 20);
  assert.equal(WINDOW_MS, 1500);
});

test("a blocked storage does not break the manager", () => {
  const bad = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); } };
  const q = new QualityManager(bad);
  q.setMode("medium");
  assert.equal(q.level, 1);
});

test("diagnostics: fps, worst frame, snapshot rate, jitter and bytes", () => {
  const d = new ArenaDiag();
  // 2 s of 60 fps frames with one 40 ms gap, drawing 2 ms each.
  let t = 0;
  for (let i = 0; i < 120; i++) { const gap = i === 60 ? 40 : 16.7; t += gap; d.frame(gap, 2, t); }
  // Snapshots every 50 ms, 1000 bytes each, over the same 2 s.
  for (let s = 1; s <= 40; s++) d.snapshot(s * 50, 1000);
  const m = d.summary(2000);
  assert.ok(m.fps >= 58 && m.fps <= 61, String(m.fps));
  assert.equal(m.worstMs, 40);
  assert.ok(Math.abs(m.drawMs - 2) < 1e-9);
  assert.equal(m.sps, 20);
  assert.ok(m.jitterMs < 1e-6, "perfectly even snapshots have no jitter");
  assert.equal(m.bytesPerSec, 20000);
  // Uneven arrivals have jitter.
  const j = new ArenaDiag();
  let at = 0;
  for (let s = 0; s < 30; s++) { at += s % 2 === 0 ? 30 : 70; j.snapshot(at, 500); }
  assert.ok(Math.abs(j.summary(at).jitterMs - 20) < 1.5, String(j.summary(at).jitterMs));
});

test("diagnostics: old numbers age out and reset empties it", () => {
  const d = new ArenaDiag();
  d.frame(50, 1, 100);
  d.snapshot(100, 10);
  const m = d.summary(5000);
  assert.equal(m.fps, 0);
  assert.equal(m.worstMs, 0);
  assert.equal(m.sps, 0);
  d.frame(10, 1, 6000);
  d.reset();
  assert.equal(d.summary(6001).fps, 0);
});
