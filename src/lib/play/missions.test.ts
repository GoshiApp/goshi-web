import { test } from "node:test";
import assert from "node:assert/strict";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const m = await import("./missions.ts");

test("three different missions, the same for a given day", () => {
  const a = m.missionsFor("2026-10-12");
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((x) => x.kind)).size, 3);
  assert.deepEqual(a, m.missionsFor("2026-10-12"));
});

test("progress, completion and the streak across days", () => {
  store.clear();
  const d1 = new Date("2026-10-12T10:00:00Z");
  const need = m.missionsFor("2026-10-12");
  // A strong match: big peak, kills, a win in a full room, and enough games for any pool target.
  let done = false;
  for (let i = 0; i < 4 && !done; i++) done = m.record({ peak: 500, kills: 3, rank: 1, total: 10 }, d1).completedNow;
  assert.ok(done, `missions ${need.map((x) => x.id)} completed`);
  assert.equal(m.today(d1).streak, 1);
  const d2 = new Date("2026-10-13T10:00:00Z");
  assert.equal(m.today(d2).streak, 1, "yesterday was full, the streak is still alive");
  for (let i = 0; i < 4; i++) m.record({ peak: 500, kills: 3, rank: 1, total: 10 }, d2);
  assert.equal(m.today(d2).streak, 2);
  const d4 = new Date("2026-10-15T10:00:00Z");
  assert.equal(m.today(d4).streak, 0, "a missed day breaks it");
  assert.equal(m.today(d4).best, 2);
});
