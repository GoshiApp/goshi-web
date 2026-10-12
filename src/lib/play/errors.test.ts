import { test } from "node:test";
import assert from "node:assert/strict";
import { ERRORS } from "./escrow-native.ts";
import { ESCROW_ERROR_BASE, ESCROW_ERROR_NAMES, PlayError, classifyConnectError, classifyError, classifySignError, txErrorText } from "./errors.ts";

test("the error list matches the program client, code by code", () => {
  const codes = Object.keys(ERRORS).map(Number).sort((x, y) => x - y);
  assert.equal(codes.length, ESCROW_ERROR_NAMES.length);
  codes.forEach((code, i) => {
    assert.equal(code, ESCROW_ERROR_BASE + i);
    assert.equal(ERRORS[code], ESCROW_ERROR_NAMES[i]);
  });
});

test("our own errors keep their kind", () => {
  assert.equal(classifyError(new PlayError("noWallet")), "noWallet");
});

test("closing or declining the wallet pop-up is 'rejected'", () => {
  assert.equal(classifyError({ code: 4001, message: "User rejected the request." }), "rejected");
  assert.equal(classifyError(new Error("WalletSignTransactionError: User rejected the request")), "rejected");
});

test("Anchor errors by name", () => {
  assert.equal(classifyError({ error: { errorCode: { code: "RoomFull" } }, message: "x" }), "roomFull");
  assert.equal(classifyError({ message: "failed", logs: ["Program log: AnchorError ... Error Code: AlreadyJoined. Error Number: 6007."] }), "alreadyJoined");
  assert.equal(classifyError({ error: { errorCode: { code: "RoomNotWaiting" } } }), "notWaiting");
  assert.equal(classifyError({ error: { errorCode: { code: "NotEnoughGoshi" } } }), "notEnoughGoshi");
  assert.equal(classifyError({ error: { errorCode: { code: "WrongWallet" } } }), "wrongConfig");
  assert.equal(classifyError({ message: "AnchorError caused by account: player_token. Error Code: AccountNotInitialized." }), "noTokenAccount");
});

test("raw program error numbers", () => {
  assert.equal(classifyError(new Error("Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1775")), "roomFull"); // 6005
});

test("the system program's 0x1 is 'not enough SOL'", () => {
  assert.equal(classifyError(new Error("custom program error: 0x1")), "insufficientSol");
  assert.equal(classifyError({ message: "x", logs: ["Program log: Error: insufficient funds"] }), "notEnoughGoshi");
});

test("not enough SOL for fees", () => {
  assert.equal(classifyError({ message: "Attempt to debit an account but found no record of a prior credit." }), "insufficientSol");
  assert.equal(classifyError({ message: "failed", logs: ["Transfer: insufficient lamports 10, need 20", "custom program error: 0x1"] }), "insufficientSol");
});

test("expired blockhash and network trouble", () => {
  assert.equal(classifyError(new Error("Blockhash not found")), "expired");
  assert.equal(classifyError(new Error("TransactionExpiredBlockheightExceededError: block height exceeded")), "expired");
  assert.equal(classifyError(new TypeError("Failed to fetch")), "network");
  assert.equal(classifyError(new Error("429 Too Many Requests")), "rateLimited");
  assert.equal(classifyError({ message: "failed", logs: [] }), "unknown");
});

test("anything else is unknown, and odd inputs do not throw", () => {
  assert.equal(classifyError(new Error("something odd")), "unknown");
  assert.equal(classifyError(undefined), "unknown");
  assert.equal(classifyError(null), "unknown");
  assert.equal(classifyError("plain string"), "unknown");
  assert.equal(classifyError(42), "unknown");
});

test("a confirmed transaction error becomes readable text", () => {
  assert.equal(txErrorText({ InstructionError: [0, { Custom: 6007 }] }), "custom program error: 0x1777");
  assert.equal(classifyError({ message: txErrorText({ InstructionError: [0, { Custom: 6005 }] }) }), "roomFull");
  assert.equal(classifyError({ message: txErrorText({ InstructionError: [1, { Custom: 1 }] }) }), "insufficientSol");
  assert.equal(txErrorText("BlockhashNotFound"), '"BlockhashNotFound"');
  assert.equal(new PlayError("network", "x", "SIG").signature, "SIG");
});

test("a quick rejection of a connect is the wallet's own warning, a slow one is a person saying no", () => {
  const rejected = { code: 4001, message: "User rejected the request." };
  assert.equal(classifyConnectError(rejected, 300), "walletBlocked");
  assert.equal(classifyConnectError(rejected, 1499), "walletBlocked");
  assert.equal(classifyConnectError(rejected, 1500), "rejected");
  assert.equal(classifyConnectError(rejected, 9000), "rejected");
  assert.equal(classifyConnectError(new Error("something else"), 100), "unknown");
  assert.equal(classifyConnectError(new PlayError("noWallet"), 10), "noWallet");
});

test("a wallet that fails to simulate a transaction means the wrong network", () => {
  assert.equal(classifySignError(new Error("Transaction simulation failed: Attempt to load a program that does not exist")), "wrongNetwork");
  assert.equal(classifySignError({ message: "Error al simular los resultados de esta solicitud" }), "wrongNetwork");
  assert.equal(classifySignError({ code: 4001, message: "User rejected the request." }), "rejected");
  assert.equal(classifySignError(new Error("Failed to fetch")), "network");
});

test("PlayError carries exact amounts", () => {
  const e = new PlayError("insufficientSol", "x", undefined, { need: "110000000", have: "5" });
  assert.equal(e.data?.need, "110000000");
});
