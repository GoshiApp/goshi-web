import { test } from "node:test";
import assert from "node:assert/strict";
import { ServerClient, type SocketLike } from "./server-client.ts";

class FakeSocket implements SocketLike {
  readyState = 1;
  sent: unknown[] = [];
  closed = false;
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.closed = true; this.readyState = 3; }
  recv(m: object | string) { this.onmessage?.({ data: typeof m === "string" ? m : JSON.stringify(m) }); }
  drop() { this.readyState = 3; this.onclose?.({}); }
}

const flush = () => new Promise((r) => setImmediate(r));

function setup(signFn?: () => Promise<Uint8Array>) {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number; id: number; live: boolean }[] = [];
  let clock = 0;
  const client = new ServerClient(
    "ws://test",
    { address: "WALLET", signMessage: signFn ?? (async () => new Uint8Array([0, 1])) },
    {
      socketFactory: () => { const s = new FakeSocket(); sockets.push(s); return s; },
      now: () => clock,
      setTimer: (fn, ms) => { const t = { fn, ms, id: timers.length, live: true }; timers.push(t); return t.id; },
      clearTimer: (id) => { const t = timers[id as number]; if (t) t.live = false; },
      rand: () => 0.5,
    },
  );
  const statuses: string[] = [];
  client.on("status", (s) => statuses.push(s.status));
  return { client, sockets, timers, statuses, setClock: (n: number) => { clock = n; } };
}

const HELLO = {
  t: "hello", nonce: "abc", cluster: "devnet", programId: "P", mint: "M", devBots: true,
  feePresets: ["100000000"], minHolder: "1000000000", rules: { matchMs: 300000, shrinkStartMs: 120000, tickRate: 20, paidSlots: 10, freeSlots: 3 },
};

test("hello then a signed auth, then ready", async () => {
  const { client, sockets, statuses } = setup();
  const infos: unknown[] = [];
  client.on("hello", (i) => infos.push(i));
  client.connect();
  sockets[0].recv(HELLO);
  await flush();
  assert.deepEqual(infos, [{
    cluster: "devnet", programId: "P", mint: "M", devBots: true,
    feePresets: [100_000_000n], feeOptions: [], solUsd: null, minHolder: 1_000_000_000n, rules: HELLO.rules,
  }]);
  assert.deepEqual(sockets[0].sent, [{ t: "auth", wallet: "WALLET", signature: "12" }]); // bytes [0,1] in base58
  assert.equal(client.send({ t: "ping" }), false, "nothing is sent before authed");
  sockets[0].recv({ t: "authed", wallet: "WALLET" });
  assert.equal(client.isReady, true);
  assert.deepEqual(statuses, ["connecting", "authenticating", "ready"]);
  assert.equal(client.enter("7"), true);
  assert.deepEqual(sockets[0].sent[1], { t: "enter", roomId: "7" });
});

test("typed events are delivered and junk frames are ignored", async () => {
  const { client, sockets } = setup();
  const got: string[] = [];
  client.on("lobby", (m) => got.push("lobby " + m.roomId));
  client.on("end", (m) => got.push("end " + m.roomId));
  client.on("error", (m) => got.push("error " + m.code));
  client.connect();
  sockets[0].recv("junk");
  sockets[0].recv({ t: "lobby", roomId: "1", state: "waiting", mode: "royale", entryFee: "1", paid: [], free: [], waitedMs: 0 });
  sockets[0].recv({ t: "lobby", roomId: "bad" });
  sockets[0].recv({ t: "error", code: "not_in_room", message: "m" });
  assert.deepEqual(got, ["lobby 1", "error not_in_room"]);
});

test("a dropped socket reconnects with backoff and never opens the wallet by itself without a token", async () => {
  const { client, sockets, timers, statuses } = setup();
  client.connect();
  sockets[0].recv(HELLO);
  await flush();
  sockets[0].recv({ t: "authed", wallet: "WALLET" });
  sockets[0].drop();
  assert.equal(statuses.at(-1), "reconnecting");
  const retry = timers.filter((t) => t.live && t.ms === 500);
  assert.equal(retry.length, 1);
  retry[0].fn();
  assert.equal(sockets.length, 2);
  const needed: number[] = [];
  client.on("signinNeeded", () => needed.push(1));
  sockets[1].recv({ ...HELLO, nonce: "second" });
  await flush();
  assert.equal(sockets[1].sent.length, 0, "no signature request from a reconnection");
  assert.equal(needed.length, 1, "the page is told to offer Sign in");
  client.signIn();
  await flush();
  assert.equal(sockets[1].sent.length, 1, "a click asks once");
  sockets[1].recv({ t: "authed", wallet: "WALLET" });
  assert.equal(client.isReady, true);
  // The attempt counter went back to zero after the login, so the next drop waits 500 ms again.
  sockets[1].drop();
  assert.ok(timers.some((t) => t.live && t.ms === 500));
});

test("reconnect delays grow and stop after the limit", () => {
  const { client, sockets, timers, statuses } = setup();
  client.connect();
  const delays: number[] = [];
  for (let i = 0; i < 12; i++) {
    sockets[sockets.length - 1].drop();
    const t = timers.filter((x) => x.live).at(-1);
    if (!t) break;
    delays.push(t.ms);
    t.live = false;
    t.fn();
  }
  assert.deepEqual(delays.slice(0, 5), [500, 1000, 2000, 4000, 8000]);
  assert.equal(statuses.at(-1), "closed");
  assert.ok(delays.length <= 8);
});

test("close() is final: no reconnect, socket closed", () => {
  const { client, sockets, timers } = setup();
  client.connect();
  client.close();
  assert.equal(sockets[0].closed, true);
  sockets[0].drop();
  assert.equal(timers.filter((t) => t.live && t.ms === 500).length, 0);
  assert.equal(client.status, "closed");
});

test("if the wallet refuses to sign, the client stops instead of looping", async () => {
  const { client, sockets, timers } = setup(async () => { throw new Error("User rejected the request."); });
  let failed = 0;
  client.on("signFailed", () => failed++);
  client.connect();
  sockets[0].recv(HELLO);
  await flush();
  assert.equal(failed, 1);
  assert.equal(client.status, "closed");
  assert.equal(timers.filter((t) => t.live).length, 0);
  assert.deepEqual(sockets[0].sent, []);
});

test("input goes out at most 20 times per second", async () => {
  const { client, sockets, setClock } = setup();
  client.connect();
  sockets[0].recv(HELLO);
  await flush();
  sockets[0].recv({ t: "authed", wallet: "WALLET" });
  let sent = 0;
  for (let ms = 0; ms < 1000; ms += 10) {
    setClock(ms);
    if (client.sendInput(0.5, -0.5, false)) sent++;
  }
  assert.equal(sent, 20);
  assert.deepEqual(sockets[0].sent.at(-1), { t: "input", dx: 0.5, dy: -0.5, boost: false });
});

test("createRoom, vs and fillWithBots send the v2 messages", async () => {
  const { client, sockets } = setup();
  client.connect();
  sockets[0].recv(HELLO);
  await flush();
  sockets[0].recv({ t: "authed", wallet: "WALLET" });
  assert.throws(() => client.createRoom(0n));
  assert.equal(client.createRoom(100_000_000n), true);
  assert.deepEqual(sockets[0].sent.at(-1), { t: "createRoom", entryFee: "100000000" });
  assert.equal(client.fillWithBots("7", 9, 3), true);
  assert.deepEqual(sockets[0].sent.at(-1), { t: "fillWithBots", roomId: "7", paid: 9, free: 3 });
  assert.equal(client.vs("7", true), true);
  assert.deepEqual(sockets[0].sent.at(-1), { t: "vs", roomId: "7", accept: true });
});

test("the faucet answer and a vs offer are typed events", async () => {
  const { client, sockets } = setup();
  const got: string[] = [];
  client.on("faucetDone", (m) => got.push(`faucet ${m.sol} ${m.goshi}`));
  client.on("vsOffer", (m) => got.push(`offer ${m.paid}`));
  client.connect();
  sockets[0].recv({ t: "faucet", sol: "1000000000", goshi: "5", tx: "s" });
  sockets[0].recv({ t: "vsOffer", roomId: "7", paid: 4, expiresInMs: 60000 });
  assert.deepEqual(got, ["faucet 1000000000 5", "offer 4"]);
});

test("a stale socket cannot talk to the client after a reconnect", async () => {
  const { client, sockets, timers } = setup();
  client.connect();
  sockets[0].drop();
  timers.filter((t) => t.live).at(-1)!.fn();
  const got: string[] = [];
  client.on("message", (m) => got.push(m.t));
  sockets[0].recv({ t: "pong" });
  assert.deepEqual(got, []);
});

test("ping and pong measure the round trip", async () => {
  const { client, sockets, setClock } = setup();
  client.connect();
  sockets[0].recv(HELLO);
  await flush();
  sockets[0].recv({ t: "authed", wallet: "WALLET" });
  assert.equal(client.rttKnown, false);
  setClock(1000);
  assert.equal(client.ping(), true);
  assert.deepEqual(sockets[0].sent.at(-1), { t: "ping" });
  setClock(1135);
  sockets[0].recv({ t: "pong" });
  assert.equal(client.rttKnown, true);
  assert.equal(client.rttMs, 135);
});

function setupAnonymous() {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number; id: number; live: boolean }[] = [];
  const client = new ServerClient(
    "ws://test",
    { address: "", signMessage: async () => { throw new Error("practice never signs"); } },
    {
      anonymous: true,
      socketFactory: () => { const s = new FakeSocket(); sockets.push(s); return s; },
      now: () => 0,
      setTimer: (fn, ms) => { const t = { fn, ms, id: timers.length, live: true }; timers.push(t); return t.id; },
      clearTimer: (id) => { const t = timers[id as number]; if (t) t.live = false; },
      rand: () => 0.5,
    },
  );
  const statuses: string[] = [];
  client.on("status", (s) => statuses.push(s.status));
  return { client, sockets, timers, statuses };
}

test("practice: ready right after hello, no login and no wallet, and the practice message goes out", async () => {
  const { client, sockets, statuses } = setupAnonymous();
  client.connect();
  sockets[0].recv(HELLO);
  await flush();
  assert.deepEqual(sockets[0].sent, [], "nothing to sign: no auth message");
  assert.equal(client.isReady, true);
  assert.deepEqual(statuses.slice(-1), ["ready"]);
  assert.equal(client.practice("Ana"), true);
  assert.deepEqual(sockets[0].sent, [{ t: "practice", name: "Ana" }]);
  assert.equal(client.sendInput(1, 0, false), true, "steering works on the same socket");
});

test("practice: a dropped socket is final, the match is gone with it", async () => {
  const { client, sockets, statuses, timers } = setupAnonymous();
  client.connect();
  sockets[0].recv(HELLO);
  await flush();
  sockets[0].drop();
  assert.equal(statuses.at(-1), "closed");
  assert.equal(sockets.length, 1, "no new socket");
  assert.equal(timers.filter((t) => t.live && t.ms < 25_000).length, 0, "no retry timer");
});

test("practice: start and end carry the practice flag and an empty podium", async () => {
  const { client, sockets } = setupAnonymous();
  const got: { t: string; practice?: boolean }[] = [];
  client.on("start", (m) => got.push(m));
  client.on("end", (m) => got.push(m));
  client.connect();
  sockets[0].recv(HELLO);
  await flush();
  sockets[0].recv({
    t: "start", roomId: "practice-ab12", mode: "royale", startsAt: 1, matchMs: 180000, shrinkStartMs: 60000, world: { w: 3000, h: 3000 },
    zone: { cx: 1500, cy: 1500, r0: 1450, rMin: 150 }, orbs: [], you: "you_1", roles: { you_1: "paid", bot_1: "saboteur" }, practice: true,
  });
  sockets[0].recv({
    t: "end", roomId: "practice-ab12", mode: "royale", practice: true, ranking: [{ w: "you_1", rank: 1, score: 40, role: "paid" }],
    payout: { pot: "0", rake: "0", podium: [], unclaimed: "0", jackpot: { triggered: false, amount: "0", winner: null } }, tx: null, error: null,
  });
  assert.deepEqual(got.map((m) => [m.t, m.practice]), [["start", true], ["end", true]]);
});
