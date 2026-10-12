import { test } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter, authMessage, backoffMs, bytesToBase58, createRoomMessage, decodeServer, encodeClient, inputMessage } from "./protocol.ts";

test("the auth message is the text the server expects", () => {
  assert.equal(authMessage("ab12"), "goshi-play:ab12");
});

test("base58 matches known vectors", () => {
  assert.equal(bytesToBase58(new Uint8Array([])), "");
  assert.equal(bytesToBase58(new Uint8Array([0])), "1");
  assert.equal(bytesToBase58(new Uint8Array([0, 0, 1])), "112");
  assert.equal(bytesToBase58(new TextEncoder().encode("Hello World!")), "2NEpo7TZRRrLZSi2U");
  assert.equal(bytesToBase58(new Uint8Array([255])), "5Q");
  assert.equal(bytesToBase58(new Uint8Array(32)), "1".repeat(32)); // 32 zero bytes: the Solana system program id
});

test("client messages encode to the documented JSON", () => {
  assert.equal(encodeClient({ t: "ping" }), '{"t":"ping"}');
  assert.deepEqual(JSON.parse(encodeClient(createRoomMessage(100_000_000n))), { t: "createRoom", entryFee: "100000000" });
  assert.deepEqual(JSON.parse(encodeClient({ t: "faucet" })), { t: "faucet" });
  assert.deepEqual(JSON.parse(encodeClient({ t: "fillWithBots", roomId: "7", paid: 9, free: 3 })), { t: "fillWithBots", roomId: "7", paid: 9, free: 3 });
  assert.deepEqual(JSON.parse(encodeClient({ t: "vs", roomId: "7", accept: true })), { t: "vs", roomId: "7", accept: true });
});

test("createRoom refuses a zero fee", () => {
  assert.throws(() => createRoomMessage(0n), RangeError);
  assert.doesNotThrow(() => createRoomMessage(1n));
});

test("input is clamped, rounded and never NaN", () => {
  assert.deepEqual(inputMessage(2, -3, true), { t: "input", dx: 1, dy: -1, boost: true });
  assert.deepEqual(inputMessage(0.123456, -0.5, false), { t: "input", dx: 0.12, dy: -0.5, boost: false });
  assert.deepEqual(inputMessage(NaN, Infinity, false), { t: "input", dx: 0, dy: 0, boost: false });
});

const RULES = { matchMs: 300000, shrinkStartMs: 120000, tickRate: 20, paidSlots: 10, freeSlots: 3 };
const HELLO = { t: "hello", nonce: "n", cluster: "devnet", programId: "P", mint: "M", feePresets: ["50000000", "100000000"], minHolder: "1000000000", rules: RULES };
const PLAYER = { w: "a", n: "A", role: "paid", bot: false, alive: true, prot: false, h: 0, m: 20, r: 7.7, head: [1, 2], body: [[0, 2], [-1, 2]] };
const PAYOUT = {
  pot: "1000000000", rake: "100000000",
  podium: [{ w: "a", rank: 1, kind: "sol", lamports: "540000000" }, { w: "s", rank: 2, kind: "goshi", lamports: "2000000" }],
  unclaimed: "700000000",
  jackpot: { triggered: false, amount: "0", winner: null },
};

test("hello decodes with the v2 fields, with and without devBots and authMessage", () => {
  const m = decodeServer(JSON.stringify(HELLO));
  assert.deepEqual(m, { ...HELLO, devBots: undefined, authMessage: undefined });
  const withBots = decodeServer(JSON.stringify({ ...HELLO, devBots: true, authMessage: "goshi-play:n" })) as { devBots?: boolean; authMessage?: string };
  assert.equal(withBots.devBots, true);
  assert.equal(withBots.authMessage, "goshi-play:n");
});

test("each server message type decodes", () => {
  const ok = (m: object) => assert.equal(decodeServer(JSON.stringify(m))?.t, (m as { t: string }).t);
  ok({ t: "authed", wallet: "W" });
  ok({ t: "pong" });
  ok({ t: "roomCreated", roomId: "7", tx: "sig" });
  ok({ t: "botsJoining", roomId: "7", paid: 9, free: 3 });
  ok({ t: "faucet", sol: "1000000000", goshi: "2000000000", tx: "sig" });
  ok({ t: "entered", roomId: "7", role: "saboteur" });
  ok({ t: "lobby", roomId: "7", state: "waiting", mode: "royale", entryFee: "1", paid: ["a"], free: [], waitedMs: 1000 });
  ok({ t: "vsOffer", roomId: "7", paid: 5, expiresInMs: 60000 });
  ok({ t: "vsStarted", roomId: "7" });
  ok({ t: "vsDeclined", roomId: "7" });
  ok({ t: "start", roomId: "7", mode: "royale", startsAt: 1, matchMs: 300000, shrinkStartMs: 120000, world: { w: 3000, h: 3000 }, zone: { cx: 1500, cy: 1500, r0: 1450, rMin: 150 }, orbs: [{ id: 1, x: 1, y: 2, v: 3 }], you: "a", roles: { a: "paid", s: "saboteur" } });
  ok({ t: "snap", roomId: "7", tick: 1, timeLeftMs: 5, zone: { cx: 1500, cy: 1500, r: 1400 }, players: [PLAYER], eatenOrbs: [1], newOrbs: [{ id: 2, x: 0, y: 0, v: 1 }], events: [{ k: "death", w: "b", by: "zone", rank: 9 }] });
  ok({ t: "error", code: "paused", message: "no" });
  ok({ t: "end", roomId: "7", mode: "royale", ranking: [{ w: "a", rank: 1, score: 40, role: "paid" }], payout: PAYOUT, tx: null, error: "x" });
  ok({ t: "end", roomId: "7", mode: "vs", ranking: [], payout: { ...PAYOUT, jackpot: { triggered: true, amount: "5000000", winner: "a" } }, tx: "sig", error: null });
});

test("malformed, unknown or hostile frames decode to null", () => {
  for (const bad of [
    "not json", "[]", "null", '{"t":1}', '{"t":"nope"}', '{"t":"authed"}',
    '{"t":"faucet","sol":"x","goshi":"1","tx":"s"}',
    '{"t":"entered","roomId":"1","role":"admin"}',
    '{"t":"lobby","roomId":"1","state":"completed","mode":"royale","entryFee":"1","paid":[],"free":[],"waitedMs":0}',
    '{"t":"snap","roomId":"1","tick":1,"timeLeftMs":1,"zone":{"cx":1,"cy":1,"r":1},"players":[{"w":"a"}],"eatenOrbs":[],"newOrbs":[],"events":[]}',
    '{"t":"start","roomId":"1","mode":"royale","startsAt":1,"matchMs":1,"shrinkStartMs":1,"world":{"w":1},"zone":{},"orbs":[],"you":"a","roles":{}}',
    '{"t":"end","roomId":"1","mode":"royale","ranking":[],"payout":{},"tx":null,"error":null}',
    JSON.stringify({ ...HELLO, minHolder: "x" }),
  ]) assert.equal(decodeServer(bad), null, bad);
  assert.equal(decodeServer(42), null);
  assert.equal(decodeServer(new Uint8Array(3)), null);
});

test("an error without a message still decodes", () => {
  assert.deepEqual(decodeServer('{"t":"error","code":"rate_limited"}'), { t: "error", code: "rate_limited", message: "" });
});

test("the input rate limiter lets 20 per second through", () => {
  const rl = new RateLimiter();
  let passed = 0;
  for (let ms = 0; ms < 1000; ms += 5) if (rl.take(ms)) passed++;
  assert.equal(passed, 20);
  assert.equal(new RateLimiter().take(0), true);
});

test("backoff doubles, caps at 30 s and stays within the jitter", () => {
  const mid = () => 0.5;
  assert.deepEqual([0, 1, 2, 3, 4].map((a) => backoffMs(a, mid)), [500, 1000, 2000, 4000, 8000]);
  assert.equal(backoffMs(20, mid), 30_000);
  assert.equal(backoffMs(0, () => 0), 400);
  assert.equal(backoffMs(0, () => 1), 600);
  assert.equal(backoffMs(-3, mid), 500);
});

test("a snapshot from a server without prot and h gets them filled in", () => {
  const { prot: _p, h: _h, ...old } = { ...PLAYER, head: [10, 0], body: [[0, 0], [-10, 0]] } as Record<string, unknown>;
  const msg = decodeServer(JSON.stringify({ t: "snap", roomId: "1", tick: 1, timeLeftMs: 1, zone: { cx: 1, cy: 1, r: 1 }, players: [old], eatenOrbs: [], newOrbs: [], events: [] }));
  assert.ok(msg && msg.t === "snap");
  assert.equal(msg.players[0].prot, false);
  assert.equal(msg.players[0].h, 0);
  const wrong = decodeServer(JSON.stringify({ t: "snap", roomId: "1", tick: 1, timeLeftMs: 1, zone: { cx: 1, cy: 1, r: 1 }, players: [{ ...PLAYER, prot: "yes" }], eatenOrbs: [], newOrbs: [], events: [] }));
  assert.equal(wrong, null);
});

test("a snapshot zone may carry the final circle, and a broken one is refused", () => {
  const base = { t: "snap", roomId: "1", tick: 1, timeLeftMs: 1, players: [], eatenOrbs: [], newOrbs: [], events: [] };
  const ok1 = decodeServer(JSON.stringify({ ...base, zone: { cx: 1700, cy: 1400, r: 1400, target: { cx: 2000, cy: 1000, r: 150 } } }));
  assert.ok(ok1 && ok1.t === "snap");
  assert.deepEqual(ok1.zone, { cx: 1700, cy: 1400, r: 1400, target: { cx: 2000, cy: 1000, r: 150 } });
  const ok2 = decodeServer(JSON.stringify({ ...base, zone: { cx: 1500, cy: 1500, r: 1450 } }));
  assert.ok(ok2 && ok2.t === "snap");
  assert.deepEqual(ok2.zone, { cx: 1500, cy: 1500, r: 1450 });
  assert.equal(decodeServer(JSON.stringify({ ...base, zone: { cx: 1, cy: 1, r: 1, target: { cx: "x" } } })), null);
});

test("a snapshot carries the zone phase, state, countdown and the next circle, and each player zout", () => {
  const p = { w: "a", n: "A", role: "paid", bot: false, alive: true, prot: false, zout: true, h: 0, m: 20, r: 15, head: [1, 2], body: [] };
  const zone = { cx: 1700, cy: 1300, r: 1050, phase: 2, state: "warn", inMs: 7000, target: { cx: 1800, cy: 1200, r: 720 } };
  const msg = decodeServer(JSON.stringify({ t: "snap", roomId: "1", tick: 1, timeLeftMs: 1, zone, players: [p], eatenOrbs: [], newOrbs: [], events: [] }));
  assert.ok(msg && msg.t === "snap");
  assert.deepEqual(msg.zone, zone);
  assert.equal(msg.players[0].zout, true);
  const old = decodeServer(JSON.stringify({ t: "snap", roomId: "1", tick: 1, timeLeftMs: 1, zone: { cx: 1, cy: 1, r: 1 }, players: [{ ...p, zout: undefined }], eatenOrbs: [], newOrbs: [], events: [] }));
  assert.ok(old && old.t === "snap");
  assert.equal(old.players[0].zout, false, "an older server has no zout");
  assert.equal(old.zone.phase, undefined);
  const bad = decodeServer(JSON.stringify({ t: "snap", roomId: "1", tick: 1, timeLeftMs: 1, zone: { cx: 1, cy: 1, r: 1, state: "melting" }, players: [], eatenOrbs: [], newOrbs: [], events: [] }));
  assert.equal(bad, null);
});

test("the v3 end payout (cash, saboteur shares, no unclaimed) and the pass messages decode", () => {
  const payout = { pot: "10000000000", cash: "9000000000", rake: "3", podium: [{ w: "a", rank: 1, kind: "sol", lamports: "5280000000" }], saboteurs: [{ w: "s", lamports: "66666666" }], jackpot: { triggered: false, amount: "0", winner: null } };
  const end = decodeServer(JSON.stringify({ t: "end", roomId: "1", mode: "royale", ranking: [], payout, tx: "sig", error: null }));
  assert.ok(end && end.t === "end");
  assert.deepEqual(end.payout.saboteurs, [{ w: "s", lamports: "66666666" }]);
  assert.equal(end.payout.unclaimed, undefined);
  const offer = decodeServer(JSON.stringify({ t: "passOffer", roomId: "9", tierUsd: 7.5, entryFee: "50000000", rank: 1, paid: 9, expiresInMs: 20000 }));
  assert.deepEqual(offer, { t: "passOffer", roomId: "9", tierUsd: 7.5, entryFee: "50000000", rank: 1, paid: 9, expiresInMs: 20000 });
  assert.deepEqual(decodeServer(JSON.stringify({ t: "passTaken", roomId: "9", tx: "sig" })), { t: "passTaken", roomId: "9", tx: "sig" });
  assert.equal(decodeServer(JSON.stringify({ t: "passOffer", roomId: "9" })), null);
  assert.deepEqual(encodeClient({ t: "acceptPass", roomId: "9" }), '{"t":"acceptPass","roomId":"9"}');
});
