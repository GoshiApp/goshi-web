import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_KEY, LIMIT_KEY, LIMIT_OPTIONS, SPENT_KEY, SpendGuard, dayKey, feeLabel, parseFeeOptions, readDaily, recordMatch, saveDaily, shareText, solText,
  usdText, xIntentUrl, type Daily,
} from "./quick.ts";

class Store {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

test("fee options: strings from the server become sorted bigints, junk is dropped", () => {
  const o = parseFeeOptions([{ lamports: "33000000", usd: 5 }, { lamports: "7000000", usd: 1 }, { lamports: "x", usd: 2 }, { lamports: "0", usd: 1 }, { lamports: "1", usd: -1 }, null, 3]);
  assert.deepEqual(o, [{ lamports: 7_000_000n, usd: 1 }, { lamports: 33_000_000n, usd: 5 }]);
  assert.deepEqual(parseFeeOptions(undefined), []);
  assert.deepEqual(parseFeeOptions("nope"), []);
});

test("fee labels show dollars and SOL: $1 about 0.007 SOL", () => {
  assert.equal(usdText(1), "$1");
  assert.equal(usdText(2.5), "$2.50");
  assert.equal(solText(7_000_000n), "0.007");
  assert.equal(solText(1_500_000_000n), "1.5");
  assert.equal(solText(1_000_000_000n), "1");
  assert.equal(solText(100n), "0.001", "a tiny amount shows the smallest step, not zero");
  assert.deepEqual(feeLabel({ lamports: 6_667_000n, usd: 1 }), { usd: "$1", sol: "0.007" });
  assert.equal(solText(7_000_000n, "es"), "0,007");
});

test("spend guard: counts what was spent, blocks past the limit and remembers across pages in the session", () => {
  const store = new Store();
  const g = new SpendGuard(store);
  assert.equal(g.spent, 0n);
  assert.equal(g.limit, null);
  assert.equal(g.allows(10_000_000_000n), true, "no limit, no block");
  g.setLimit(LIMIT_OPTIONS[0]); // 0.05 SOL
  g.add(30_000_000n);
  assert.equal(g.remaining, 20_000_000n);
  assert.equal(g.allows(20_000_000n), true);
  assert.equal(g.allows(20_000_001n), false);
  g.add(20_000_000n);
  assert.equal(g.remaining, 0n);
  assert.equal(g.allows(1n), false);
  // Another page of the same session.
  const again = new SpendGuard(store);
  assert.equal(again.spent, 50_000_000n);
  assert.equal(again.limit, 50_000_000n);
  assert.equal(store.getItem(SPENT_KEY), "50000000");
  again.setLimit(null);
  assert.equal(again.allows(1_000_000_000n), true);
  assert.equal(store.getItem(LIMIT_KEY), null);
  assert.deepEqual([...LIMIT_OPTIONS], [50_000_000n, 100_000_000n, 250_000_000n]);
});

test("spend guard survives bad stored values and blocked storage", () => {
  const store = new Store();
  store.setItem(SPENT_KEY, "-5");
  store.setItem(LIMIT_KEY, "abc");
  const g = new SpendGuard(store);
  assert.equal(g.spent, 0n);
  assert.equal(g.limit, null);
  const bad = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); }, removeItem() { throw new Error("no"); } };
  const b = new SpendGuard(bad);
  b.setLimit(50_000_000n);
  b.add(10n);
  assert.equal(b.spent, 10n);
  assert.equal(b.limit, 50_000_000n);
});

test("best of the day and the streak", () => {
  const day1 = recordMatch(null, "2026-10-10", 5, 40);
  assert.equal(day1.daily.streak, 1);
  assert.equal(day1.daily.bestPlace, 5);
  assert.equal(day1.beatBest, false, "nothing to beat on the first match");
  assert.equal(day1.newDay, true);
  // A worse result the same day keeps the best.
  const worse = recordMatch(day1.daily, "2026-10-10", 7, 60);
  assert.equal(worse.daily.bestPlace, 5);
  assert.equal(worse.beatBest, false);
  assert.equal(worse.daily.played, 2);
  assert.equal(worse.newDay, false);
  // A better place beats it.
  const better = recordMatch(worse.daily, "2026-10-10", 3, 30);
  assert.equal(better.daily.bestPlace, 3);
  assert.equal(better.beatBest, true);
  assert.deepEqual(better.previousBest, { place: 5, mass: 40 });
  // The same place with more mass also beats it.
  const heavier = recordMatch(better.daily, "2026-10-10", 3, 55);
  assert.equal(heavier.beatBest, true);
  assert.equal(heavier.daily.bestMass, 55);
  // The next day continues the streak and resets the best of the day.
  const next = recordMatch(heavier.daily, "2026-10-11", 9, 20);
  assert.equal(next.daily.streak, 2);
  assert.equal(next.daily.bestPlace, 9);
  assert.equal(next.daily.played, 1);
  assert.equal(next.newDay, true);
  // A gap restarts it.
  const gap = recordMatch(next.daily, "2026-10-14", 2, 90);
  assert.equal(gap.daily.streak, 1);
  // Across a month end.
  assert.equal(recordMatch({ day: "2026-10-31", bestPlace: 4, bestMass: 10, streak: 3, played: 1 }, "2026-11-01", 4, 10).daily.streak, 4);
});

test("daily data is saved and read back, and junk is ignored", () => {
  const s = new Store();
  assert.equal(readDaily(s), null);
  const d: Daily = { day: "2026-10-10", bestPlace: 3, bestMass: 77, streak: 4, played: 2 };
  saveDaily(s, d);
  assert.deepEqual(readDaily(s), d);
  s.setItem(DAILY_KEY, "{broken");
  assert.equal(readDaily(s), null);
  s.setItem(DAILY_KEY, JSON.stringify({ day: "yesterday" }));
  assert.equal(readDaily(s), null);
  assert.equal(dayKey(new Date(2026, 9, 5)), "2026-10-05");
});

test("share text fills the place, the field size, the mass and the link, and the X link is encoded", () => {
  const t = shareText("I finished #{place} of {n} in Goshi with mass {mass}, can you beat me? {url}", 3, 10, 41.6, "goshi.app");
  assert.equal(t, "I finished #3 of 10 in Goshi with mass 42, can you beat me? goshi.app");
  const u = xIntentUrl(t);
  assert.ok(u.startsWith("https://twitter.com/intent/tweet?text="));
  assert.ok(u.includes(encodeURIComponent("#3 of 10")));
  assert.ok(!u.includes(" "));
});
