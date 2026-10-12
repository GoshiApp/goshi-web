import { test } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { findBatchPda, findConfigPda, findCreditPda, findPoolPda, findRoomPda, findVaultPda, u64le } from "./pda.ts";

// Expected addresses were derived with @solana/web3.js in the goshi-escrow repo with the same seeds as lib.rs.
const PROGRAM = new PublicKey("34vmx44dDnjqKnA3PcXEEAKayGNMVHdu6dBcPD9958Gw");

test("singleton PDAs: config, vault and pool", () => {
  assert.equal(findConfigPda(PROGRAM).toBase58(), "7Q8JbkbFRPuTXRFkGzyNXhbegWNNMKYToPNZEQCpxMxz");
  assert.equal(findVaultPda(PROGRAM).toBase58(), "Bgorg5jkDixCRtNG7R15MunjXCvigSbUTBGSApkGpjC4");
  assert.equal(findPoolPda(PROGRAM).toBase58(), "7UxF9xq6eG4i4GBpU9rBws2JK5sXAc3GHnTJQ2sA4n5Q");
});

test("the PDAs of the program deployed on devnet match devnet-config.json", () => {
  const live = new PublicKey("87w9LH9NFTeqdoQ6mh2ZjmUGsHgkd5C5CiPk9gFLymTQ");
  assert.equal(findConfigPda(live).toBase58(), "DHXfV9zico2UpDPCZU4iTrTZgMC261pCveY5G6JF42te");
  assert.equal(findVaultPda(live).toBase58(), "5ApvAYhhdtHMANacRZdJVc2v4mVLFp6d16SCjcvoacnR");
  assert.equal(findPoolPda(live).toBase58(), "4DuVLGvro2NkzCSU1pKrRymqJYikD7mdTGBVbbDDdSJ2");
});

test("room and batch PDAs by id", () => {
  const cases: [bigint, string, string][] = [
    [0n, "3eTfoi1ECtL4m3ARuAdpgtcLbUrpgXXQZWpxB3pDf5VT", "7ZWNHBuj4bMh8SzgBfti4HLhR944c5AkpCjBVqFhh6Ft"],
    [1n, "FmfDnEmHc59wY8VPBEy3o228SeMusXR7Gau8dv64fLs9", "96RcHjRtHu5ZJXAhRE7zMgfz8JFt1sKSnBFe7zdfi8sf"],
    [255n, "5vzwLniGfT8psgpSxpM1dUuVCMrPofkAWgMBY5aPqxcJ", "Copt2iwMxY5iKxvJKFRZh8GVHABraV4JPCtGkXq8pFeX"],
    [18446744073709551615n, "BHoWjmZrhMkCaPzvgtcLJxAsSHvLEHEqJPRSsZS9WGbC", "CHvUnHUEtqGY4mCH1KgAQiBT4ThEbxGd5jp2D36bcMs6"],
  ];
  for (const [id, room, batch] of cases) {
    assert.equal(findRoomPda(PROGRAM, id).toBase58(), room, `room ${id}`);
    assert.equal(findBatchPda(PROGRAM, id).toBase58(), batch, `batch ${id}`);
  }
});

test("credit PDA is ['credit', room, wallet]", () => {
  const room = findRoomPda(PROGRAM, 1n);
  const wallet = new PublicKey("DiAQBixUdJxCNUdY3NyogaBXScgMiCWPeireAtHEHRC8");
  assert.equal(findCreditPda(PROGRAM, room, wallet).toBase58(), "Ditrqm51mF3C8njUpAD1waWNKjxXzWCzjxXYzCE9jb4s");
});

test("u64 little endian", () => {
  assert.deepEqual([...u64le(1n)], [1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...u64le(256n)], [0, 1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...u64le(0x0102030405060708n)], [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.throws(() => u64le(-1n), RangeError);
  assert.throws(() => u64le(18446744073709551616n), RangeError);
});
