import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_VS_PLAYERS, royalePot, settleRoyale, settleVs } from "./split.ts";

// Vectors of server/test/settlement.test.ts and the Rust tests of programs/goshi-escrow/src/lib.rs (contract v3).
const SOL = 1_000_000_000n;
const spent = (s: NonNullable<ReturnType<typeof settleRoyale>>) => s.prizes[0] + s.prizes[1] + s.prizes[2] + s.saboteurTotal + s.rake;

test("a room of ten 1 SOL entries: 88% to the Top 3 paid players, 2% to three saboteurs, 10% to the house", () => {
  const nominal = 10n * SOL;
  const s = settleRoyale(nominal, nominal, 3)!;
  assert.deepEqual(s.prizes, [5_280_000_000n, 2_200_000_000n, 1_320_000_000n]);
  assert.equal(s.prizePool, 8_800_000_000n);
  assert.equal(s.saboteurPool, 200_000_000n);
  assert.equal(s.saboteurEach, 66_666_666n);
  assert.equal(s.saboteurTotal, 199_999_998n);
  assert.equal(s.rake, 1_000_000_002n);
  assert.equal(spent(s), nominal);
});

test("the house share is split 10 burn, 15 infrastructure, 25 liquidity and the rest to the super pot", () => {
  const s = settleRoyale(10n * SOL, 10n * SOL, 0)!;
  assert.equal(s.saboteurTotal, 0n);
  assert.equal(s.rake, 1_200_000_000n, "an unused saboteur pool goes to the house");
  assert.equal(s.buybackBurn, 120_000_000n);
  assert.equal(s.infra, 180_000_000n);
  assert.equal(s.liquidity, 300_000_000n);
  assert.equal(s.rakeJackpot, 600_000_000n);
  assert.equal(s.buybackBurn + s.infra + s.liquidity + s.rakeJackpot, s.rake);
});

test("a pass seat: the room never owes more than it holds, the house forgoes almost its whole share", () => {
  const fee = 7_500_000_000n;
  const s = settleRoyale(fee * 10n, fee * 9n, 3)!;
  assert.equal(spent(s), fee * 9n);
  assert.ok(s.rake <= 3n, `rake ${s.rake}`);
  assert.equal(s.prizes[0], 39_600_000_000n, "the prizes are the same as without a pass seat");
});

test("two pass seats would be insolvent and are refused", () => {
  assert.equal(settleRoyale(10n * SOL, 8n * SOL, 3), null);
});

test("every scenario conserves the cash to the lamport", () => {
  for (const nominal of [0n, 7n, 999n, 12_345_678n, 10n * SOL, 123_456_789_123n]) {
    for (let sab = 0; sab <= 3; sab++) {
      const s = settleRoyale(nominal, nominal, sab)!;
      assert.equal(spent(s), nominal);
      assert.ok(s.prizes[2] <= s.prizes[1] + 1n || nominal < 100n);
    }
  }
});

test("bad input gives no split", () => {
  assert.equal(settleRoyale(10n * SOL, 10n * SOL, 4), null);
  assert.equal(settleRoyale(10n * SOL, 10n * SOL, -1), null);
  assert.equal(settleRoyale(2n ** 64n, 1n, 3), null);
});

test("VS with two players: winner 120% of the net entry, loser 80%", () => {
  const v = settleVs(SOL, 2)!;
  assert.equal(v.rake, 200_000_000n);
  assert.equal(v.loser, 720_000_000n);
  assert.equal(v.winner, 1_080_000_000n);
});

test("VS from 2 to 9 players conserves the pot", () => {
  for (let n = 2; n <= MAX_VS_PLAYERS; n++) {
    const entry = 123_456_789n;
    const v = settleVs(entry, n)!;
    assert.equal(v.winner + v.loser * BigInt(n - 1) + v.rake, entry * BigInt(n));
    assert.equal(v.buybackBurn + v.infra + v.liquidity + v.rakeJackpot, v.rake);
  }
});

test("VS is only for 2 to 9 paid players", () => {
  assert.equal(settleVs(SOL, 1), null);
  assert.equal(settleVs(SOL, 10), null);
  assert.equal(settleVs(2n ** 63n, 9), null);
});

test("royalePot", () => {
  assert.equal(royalePot(7_000_000n, 10), 70_000_000n);
  assert.equal(royalePot(2n ** 63n, 10), null);
});
