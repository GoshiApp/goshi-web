import { test } from "node:test";
import assert from "node:assert/strict";
import { b58hex, jackpotDrawn } from "./proof-check.ts";

test("the super pot draw in the browser is the one of the server (values computed with server/src/game/settlement.ts)", async () => {
  const secret = new Uint8Array(32).fill(7), block = new Uint8Array(32).fill(9);
  for (const id of ["1791844410630628", "1791844410630673"]) assert.equal(await jackpotDrawn(secret, block, id, 100), true, id);
  for (const id of ["1791844410630345", "1791844410630346"]) assert.equal(await jackpotDrawn(secret, block, id, 100), false, id);
  assert.equal(await jackpotDrawn(secret, block, "1", 1), true);
  assert.equal(await jackpotDrawn(secret, block, "1", 0), false);
});

test("a blockhash in base58 becomes the hex of its 32 bytes", () => {
  assert.equal(b58hex("11111111111111111111111111111111"), "00".repeat(32));
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let t = "";
  while (n > 0n) { t = A[Number(n % 58n)] + t; n /= 58n; }
  assert.equal(b58hex(t), Buffer.from(bytes).toString("hex"));
  assert.equal(b58hex("0OIl"), "", "characters outside the alphabet");
});
