import { test } from "node:test";
import assert from "node:assert/strict";
import { configProblems, explorerAddressUrl, explorerClusterOf, explorerTxUrl, isMainnet, isPublicKeyText, shortAddress, type PlayConfig } from "./config.ts";

const KEY = "34vmx44dDnjqKnA3PcXEEAKayGNMVHdu6dBcPD9958Gw";
const good: PlayConfig = {
  enabled: true,
  cluster: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
  serverUrl: "ws://localhost:8787",
  token: { symbol: "GOSHI", name: "Goshi" },
  audited: false,
  programId: KEY,
  goshiMint: KEY,
  infraWallet: KEY,
  liquidityWallet: KEY,
};

test("a complete config has no problems", () => {
  assert.deepEqual(configProblems(good), []);
});

test("every empty address and a non https RPC is reported by field name", () => {
  const bad = configProblems({ ...good, rpcUrl: "http://x.test", goshiMint: "", infraWallet: "nope" });
  assert.deepEqual(bad, ["rpcUrl (https URL)", "goshiMint", "infraWallet"]);
  for (const url of ["ws://example.org", "http://localhost:8787", "", "wss://"]) {
    assert.deepEqual(configProblems({ ...good, serverUrl: url }), ["serverUrl (wss:// URL, or ws:// for localhost)"], url);
  }
  for (const url of ["ws://localhost:8787", "ws://127.0.0.1:8787/x", "wss://play.goshi.app"]) assert.deepEqual(configProblems({ ...good, serverUrl: url }), [], url);
});

test("explorer links carry the cluster except on mainnet", () => {
  assert.equal(explorerTxUrl("devnet", "abc"), "https://explorer.solana.com/tx/abc?cluster=devnet");
  assert.equal(explorerTxUrl("mainnet-beta", "abc"), "https://explorer.solana.com/tx/abc");
  assert.equal(explorerAddressUrl("testnet", KEY), `https://explorer.solana.com/address/${KEY}?cluster=testnet`);
  assert.equal(isMainnet("mainnet-beta"), true);
  assert.equal(isMainnet("devnet"), false);
});

test("address helpers", () => {
  assert.equal(isPublicKeyText(KEY), true);
  assert.equal(isPublicKeyText("0OIl" + KEY.slice(4)), false); // 0, O, I, l are not base58
  assert.equal(shortAddress(KEY), "34vm...58Gw");
  assert.equal(shortAddress("abc"), "abc");
});

test("the token symbol and name are checked", () => {
  assert.deepEqual(configProblems({ ...good, token: { symbol: "goshi", name: "Goshi" } }), ["token.symbol (2 to 10 capital letters or digits)"]);
  assert.deepEqual(configProblems({ ...good, token: { symbol: "GOSHI", name: " " } }), ["token.name"]);
  assert.deepEqual(configProblems({ ...good, token: { symbol: "G", name: "x" } }), ["token.symbol (2 to 10 capital letters or digits)"]);
});

test("mainnet needs a wss server and a mainnet explorer", () => {
  const m = { ...good, cluster: "mainnet-beta" as const };
  assert.deepEqual(configProblems(m), ["serverUrl (wss:// is required on mainnet-beta)"]);
  assert.deepEqual(configProblems({ ...m, serverUrl: "wss://play.example.org" }), []);
  assert.deepEqual(configProblems({ ...m, serverUrl: "wss://play.example.org", explorerCluster: "devnet" }), ["explorerCluster (must be mainnet-beta on mainnet-beta)"]);
});

test("explorer cluster: override, default and no parameter on mainnet", () => {
  assert.equal(explorerClusterOf({ cluster: "devnet" }), "devnet");
  assert.equal(explorerClusterOf({ cluster: "devnet", explorerCluster: "testnet" }), "testnet");
  assert.equal(explorerTxUrl(explorerClusterOf({ cluster: "mainnet-beta" }), "S"), "https://explorer.solana.com/tx/S");
});
