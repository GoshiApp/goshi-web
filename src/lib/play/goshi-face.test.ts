import { test } from "node:test";
import assert from "node:assert/strict";
import { DIZZY_MS, GOSHI_HUES, HAPPY_MS, blinkAmount, dizzyAlpha, hash, moodOf, parseColorChoice } from "./goshi-face.ts";

test("eight free colors, parsed safely from storage", () => {
  assert.equal(GOSHI_HUES.length, 8);
  assert.equal(new Set(GOSHI_HUES).size, 8, "all different");
  assert.equal(parseColorChoice("0"), 0);
  assert.equal(parseColorChoice("7"), 7);
  assert.equal(parseColorChoice("8"), null);
  assert.equal(parseColorChoice("-1"), null);
  assert.equal(parseColorChoice("2.5"), null);
  assert.equal(parseColorChoice("abc"), null);
  assert.equal(parseColorChoice(null), null);
  assert.equal(parseColorChoice(""), null);
});

test("a blink is short, comes every few seconds and differs per goshi", () => {
  const seed = hash("some-wallet");
  let closed = 0, samples = 0, max = 0;
  for (let t = 0; t < 20_000; t += 10) {
    const b = blinkAmount(seed, t);
    assert.ok(b >= 0 && b <= 1);
    samples++;
    if (b > 0.55) closed++;
    max = Math.max(max, b);
  }
  assert.ok(max > 0.9, "the eyes do close");
  assert.ok(closed / samples < 0.03, "closed for a small share of the time");
  assert.ok(closed > 0);
  // Two different goshis do not blink on the same beat.
  let same = 0;
  for (let t = 0; t < 20_000; t += 10) if (blinkAmount(hash("a"), t) > 0.5 && blinkAmount(hash("b"), t) > 0.5) same++;
  assert.ok(same < 5);
});

test("happy right after eating, then back to normal", () => {
  assert.equal(moodOf(undefined, 1000), "normal");
  assert.equal(moodOf(1000, 1100), "happy");
  assert.equal(moodOf(1000, 1000 + HAPPY_MS), "normal");
  assert.equal(moodOf(1000, 900), "normal", "an eat in the future is ignored");
});

test("the dizzy flash fades out over its time", () => {
  assert.equal(dizzyAlpha(0), 1);
  assert.ok(Math.abs(dizzyAlpha(DIZZY_MS / 2) - 0.5) < 1e-9);
  assert.equal(dizzyAlpha(DIZZY_MS), 0);
  assert.equal(dizzyAlpha(-5), 0);
});
