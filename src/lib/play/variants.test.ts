import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCopy, resolveString, type Variant } from "./variants.ts";

const test_: Variant = { mainnet: false, audited: false, symbol: "GOSHI", tokenName: "Goshi" };
const main: Variant = { mainnet: true, audited: false, symbol: "GSH", tokenName: "Goshi Token" };

test("test and mainnet markers choose the sentence", () => {
  const s = "Runs on [[t:a test network]][[m:Solana mainnet]].";
  assert.equal(resolveString(s, test_), "Runs on a test network.");
  assert.equal(resolveString(s, main), "Runs on Solana mainnet.");
});

test("audit markers", () => {
  const s = "[[n:It has not been audited.]][[y:It was audited.]]";
  assert.equal(resolveString(s, main), "It has not been audited.");
  assert.equal(resolveString(s, { ...main, audited: true }), "It was audited.");
});

test("the token symbol replaces $GOSHI and the placeholders", () => {
  assert.equal(resolveString("$GOSHI and {symbol} ({tokenName})", main), "$GSH and GSH (Goshi Token)");
  assert.equal(resolveString("$GOSHI", test_), "$GOSHI");
  assert.equal(resolveString("GOSHIX", main), "GOSHIX");
});

test("the result is trimmed", () => {
  assert.equal(resolveString("a [[m:c]]", test_), "a");
});

test("markers can span lines and nest text with punctuation", () => {
  assert.equal(resolveString("a [[t:b, c. d]] e", test_), "a b, c. d e");
});

test("array items that the markers empty are dropped, other values are kept", () => {
  const tree = { list: ["keep", "[[t:test only]]", "", "[[m:main only]]"], n: 3, o: { s: "[[m:x]]y" } };
  assert.deepEqual(resolveCopy(tree, test_), { list: ["keep", "test only", ""], n: 3, o: { s: "y" } });
  assert.deepEqual(resolveCopy(tree, main), { list: ["keep", "", "main only"], n: 3, o: { s: "xy" } });
});

test("resolveCopy does not change its input", () => {
  const tree = { a: ["[[t:x]]"] };
  resolveCopy(tree, main);
  assert.equal(tree.a[0], "[[t:x]]");
});
