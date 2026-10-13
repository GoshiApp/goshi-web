import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { GoshiEscrow } from "./escrow-native.ts";
import { checkDuelTx, type DuelExpectation } from "./prebuilt.ts";

const programId = Keypair.generate().publicKey;
const escrow = new GoshiEscrow(programId);
const authority = Keypair.generate();
const host = Keypair.generate().publicKey;
const guests = [Keypair.generate().publicKey, Keypair.generate().publicKey];
const fee = 5_000_000n;
const roomId = 1791844410630345n;
const expect: DuelExpectation = { programId, authority: authority.publicKey, host, entryFee: fee, guests, configPda: escrow.pda.config, roomPda: (id) => escrow.pda.room(id) };

function build(over: { ix?: any; payer?: PublicKey; extra?: boolean } = {}): Transaction {
  const ix = over.ix ?? escrow.createDuel(authority.publicKey, host, roomId, fee, new Uint8Array(32).fill(7), guests);
  const tx = new Transaction({ feePayer: over.payer ?? authority.publicKey, recentBlockhash: "11111111111111111111111111111111" }).add(ix);
  if (over.extra) tx.add(SystemProgram.transfer({ fromPubkey: host, toPubkey: Keypair.generate().publicKey, lamports: 1n }));
  return tx;
}

test("the transaction the server should send passes", () => {
  const r = checkDuelTx(build(), expect);
  assert.deepEqual(r, { ok: true, roomId });
});

test("anything else is refused before the wallet is asked to sign", () => {
  const reason = (tx: Transaction, e: DuelExpectation = expect) => { const r = checkDuelTx(tx, e); return r.ok ? "ok" : r.reason; };
  // an extra instruction that moves the host's money
  assert.equal(reason(build({ extra: true })), "instructions");
  // another program
  assert.equal(reason(build(), { ...expect, programId: Keypair.generate().publicKey }), "program");
  // another amount than the one the player chose
  assert.equal(reason(build(), { ...expect, entryFee: fee + 1n }), "entry fee");
  // other guests than the ones typed
  assert.equal(reason(build(), { ...expect, guests: [guests[0], Keypair.generate().publicKey] }), "guest");
  assert.equal(reason(build(), { ...expect, guests: [guests[0]] }), "data size");
  // a different host than the connected wallet
  assert.match(reason(build(), { ...expect, host: Keypair.generate().publicKey }), /account 1|signers/);
  // the fee payer is not the authority of the program
  assert.equal(reason(build({ payer: Keypair.generate().publicKey })), "fee payer");
  // a different instruction of the same program (finalize instead of create)
  const wrong = escrow.cancelRoom(authority.publicKey, roomId, []);
  assert.notEqual(reason(build({ ix: wrong })), "ok");
});
