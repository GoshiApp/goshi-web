import { test } from "node:test";
import assert from "node:assert/strict";
import { duelPrize, houseSplit, royalePrizes, vsPrizes } from "./prizes.ts";

test("a full royale pays like the program does (contract v6 vectors)", () => {
  const r = royalePrizes(9_000_000n);
  assert.deepEqual([r.first, r.second, r.third, r.saboteurPool, r.house], [51_300_000n, 21_375_000n, 12_825_000n, 1_800_000n, 2_700_000n]);
  assert.equal(r.first + r.second + r.third + r.saboteurPool + r.house, r.pot);
});

test("VS and duel follow the program tests", () => {
  const v = vsPrizes(1_000_000_000n, 2n);
  assert.equal(v.loser, 776_000_000n);
  assert.equal(v.winner, 1_164_000_000n);
  assert.equal(v.winner + v.loser + v.house, v.pot);
  const d = duelPrize(1_000_000_000n, 2n);
  assert.equal(d.winner, 1_940_000_000n);
  assert.equal(d.house, 60_000_000n);
});

test("the house share is split in four and adds up", () => {
  const s = houseSplit(9_000_000n);
  assert.deepEqual([s.burn, s.infra, s.liquidity, s.jackpot], [900_000n, 1_350_000n, 2_250_000n, 4_500_000n]);
  assert.equal(s.burn + s.infra + s.liquidity + s.jackpot, 9_000_000n);
});
