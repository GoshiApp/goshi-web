import { test } from "node:test";
import assert from "node:assert/strict";
import { EXPIRY_MARGIN_MS, SESSION_PREFIX, SessionStore, SingleFlight } from "./session.ts";
import { ServerClient, type SocketLike } from "./server-client.ts";

class Store {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

test("a token is kept per wallet and used until it is about to expire", () => {
  let now = 1_000_000;
  const store = new Store();
  const s = new SessionStore(store, () => now);
  assert.equal(s.get("A"), null);
  s.set("A", "tokA", now + 12 * 3600_000);
  s.set("B", "tokB", now + 3600_000);
  assert.equal(s.get("A"), "tokA");
  assert.equal(s.get("B"), "tokB");
  assert.ok(store.getItem(`${SESSION_PREFIX}A`)?.includes("tokA"));
  // A new page (a new store object over the same storage) finds it.
  assert.equal(new SessionStore(store, () => now).get("A"), "tokA");
  now += 3600_000 - EXPIRY_MARGIN_MS + 1;
  assert.equal(s.get("B"), null, "inside the margin it is not used");
  assert.equal(store.getItem(`${SESSION_PREFIX}B`), null, "and it is removed");
  assert.equal(s.get("A"), "tokA");
});

test("clear removes only that wallet, and bad data is ignored", () => {
  const store = new Store();
  const s = new SessionStore(store, () => 0);
  s.set("A", "a", 10 * 60_000);
  s.set("B", "b", 10 * 60_000);
  s.clear("A");
  assert.equal(s.get("A"), null);
  assert.equal(s.get("B"), "b");
  store.setItem(`${SESSION_PREFIX}C`, "{not json");
  assert.equal(s.get("C"), null);
  s.set("", "x", 1e9);
  assert.equal(s.get(""), null);
});

test("with blocked storage the token still lasts for the page session", () => {
  const bad = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); }, removeItem() { throw new Error("no"); } };
  const s = new SessionStore(bad, () => 0);
  s.set("A", "tok", 10 * 60_000);
  assert.equal(s.get("A"), "tok");
  s.clear("A");
  assert.equal(s.get("A"), null);
});

test("single flight: callers during a pending request share it, and a new one can start after", async () => {
  const f = new SingleFlight<number>();
  let calls = 0;
  let release!: (n: number) => void;
  const first = f.run(() => { calls++; return new Promise<number>((r) => { release = r; }); });
  const second = f.run(() => { calls++; return Promise.resolve(99); });
  assert.equal(f.busy, true);
  assert.equal(first, second);
  release(7);
  assert.equal(await first, 7);
  assert.equal(calls, 1);
  assert.equal(f.busy, false);
  assert.equal(await f.run(() => { calls++; return Promise.resolve(8); }), 8);
  assert.equal(calls, 2);
  // A failure also frees it.
  await assert.rejects(f.run(() => Promise.reject(new Error("x"))));
  assert.equal(f.busy, false);
});

// ---- the client with a token store

class FakeSocket implements SocketLike {
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.readyState = 3; }
  recv(m: object) { this.onmessage?.({ data: JSON.stringify(m) }); }
  drop() { this.readyState = 3; this.onclose?.({}); }
}
const flush = () => new Promise((r) => setImmediate(r));
const HELLO = {
  t: "hello", nonce: "n1", cluster: "devnet", programId: "P", mint: "M", feePresets: ["100000000"], minHolder: "1",
  rules: { matchMs: 1, shrinkStartMs: 1, tickRate: 20, paidSlots: 10, freeSlots: 3 },
};

function make(store: SessionStore, address = "WALLET", signs: { n: number; resolve?: (u: Uint8Array) => void; hold?: boolean } = { n: 0 }) {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const client = new ServerClient(
    "ws://t",
    {
      address,
      signMessage: () => {
        signs.n++;
        return signs.hold ? new Promise<Uint8Array>((r) => { signs.resolve = r; }) : Promise.resolve(new Uint8Array([1, 2]));
      },
    },
    {
      socketFactory: () => { const s = new FakeSocket(); sockets.push(s); return s; },
      now: () => 0,
      setTimer: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; },
      clearTimer: (id) => { const t = timers[id as number]; if (t) t.live = false; },
      rand: () => 0.5,
      sessions: store,
    },
  );
  return { client, sockets, timers, signs };
}

test("the first login signs once and keeps the token the server gives", async () => {
  const store = new SessionStore(new Store(), () => 0);
  const { client, sockets, signs } = make(store);
  client.connect({ prompt: true });
  sockets[0].recv(HELLO);
  await flush();
  assert.equal(signs.n, 1);
  assert.equal(sockets[0].sent[0].t, "auth");
  assert.ok(sockets[0].sent[0].signature);
  sockets[0].recv({ t: "authed", wallet: "WALLET", session: "TOKEN1", expiresAt: 12 * 3600_000 });
  assert.equal(store.get("WALLET"), "TOKEN1");
});

test("a later connection (a new page, a dropped socket) uses the token and never signs", async () => {
  const store = new SessionStore(new Store(), () => 0);
  store.set("WALLET", "TOKEN1", 12 * 3600_000);
  const { client, sockets, signs, timers } = make(store);
  client.connect({ prompt: false });
  sockets[0].recv(HELLO);
  await flush();
  assert.deepEqual(sockets[0].sent, [{ t: "auth", token: "TOKEN1" }]);
  sockets[0].recv({ t: "authed", wallet: "WALLET", session: "TOKEN2", expiresAt: 12 * 3600_000 + 5, viaToken: true });
  assert.equal(store.get("WALLET"), "TOKEN2", "the fresh token replaces the old one");
  sockets[0].drop();
  timers.filter((t) => t.live && t.ms === 500)[0].fn();
  sockets[1].recv({ ...HELLO, nonce: "n2" });
  await flush();
  assert.deepEqual(sockets[1].sent, [{ t: "auth", token: "TOKEN2" }]);
  assert.equal(signs.n, 0);
});

test("a restored connection without a token asks the page for a Sign in click instead of opening the wallet", async () => {
  const store = new SessionStore(new Store(), () => 0);
  const { client, sockets, signs } = make(store);
  let needed = 0;
  client.on("signinNeeded", () => needed++);
  client.connect({ prompt: false });
  sockets[0].recv(HELLO);
  await flush();
  assert.equal(signs.n, 0);
  assert.equal(needed, 1);
  client.signIn();
  await flush();
  assert.equal(signs.n, 1);
  client.signIn(); // a second click while authenticating must not ask again once authed
  await flush();
  sockets[0].recv({ t: "authed", wallet: "WALLET", session: "T", expiresAt: 1e9 });
  client.signIn();
  await flush();
  assert.equal(signs.n, 1, "a login already sent on this socket is never signed again");
});

test("one signature request at a time: a second sign in while the wallet window is open does nothing", async () => {
  const store = new SessionStore(new Store(), () => 0);
  const signs = { n: 0, hold: true } as { n: number; hold: boolean; resolve?: (u: Uint8Array) => void };
  const { client, sockets } = make(store, "WALLET", signs);
  client.connect({ prompt: false });
  sockets[0].recv(HELLO);
  await flush();
  client.signIn();
  client.signIn();
  client.signIn();
  await flush();
  assert.equal(signs.n, 1);
  signs.resolve?.(new Uint8Array([9]));
  await flush();
  assert.equal(sockets[0].sent.length, 1);
});

test("a rejected token is dropped and the next connection does not sign by itself", async () => {
  const store = new SessionStore(new Store(), () => 0);
  store.set("WALLET", "OLD", 12 * 3600_000);
  const { client, sockets, signs, timers } = make(store);
  const errors: string[] = [];
  client.on("error", (m) => errors.push(m.code));
  client.connect({ prompt: false });
  sockets[0].recv(HELLO);
  await flush();
  sockets[0].recv({ t: "error", code: "auth_failed", message: "no" });
  assert.deepEqual(errors, [], "the page does not see a login error for a stale token");
  assert.equal(store.get("WALLET"), null);
  sockets[0].drop();
  timers.filter((t) => t.live && t.ms === 500)[0].fn();
  let needed = 0;
  client.on("signinNeeded", () => needed++);
  sockets[1].recv({ ...HELLO, nonce: "n2" });
  await flush();
  assert.equal(signs.n, 0);
  assert.equal(needed, 1);
  client.signIn();
  await flush();
  assert.equal(signs.n, 1, "then exactly one signature");
});

test("another wallet's token is not used", async () => {
  const store = new SessionStore(new Store(), () => 0);
  store.set("OTHER", "OTHERTOKEN", 12 * 3600_000);
  const { client, sockets } = make(store, "WALLET");
  client.connect({ prompt: false });
  sockets[0].recv(HELLO);
  await flush();
  assert.equal(sockets[0].sent.length, 0);
});

test("practice never signs and never uses a token", async () => {
  const store = new SessionStore(new Store(), () => 0);
  store.set("", "x", 1e9);
  const sockets: FakeSocket[] = [];
  let signed = 0;
  const c = new ServerClient("ws://t", { address: "", signMessage: async () => { signed++; return new Uint8Array(); } }, {
    anonymous: true, sessions: store, socketFactory: () => { const s = new FakeSocket(); sockets.push(s); return s; },
    setTimer: () => 0, clearTimer: () => {}, now: () => 0,
  });
  c.connect();
  sockets[0].recv(HELLO);
  await flush();
  assert.equal(signed, 0);
  assert.deepEqual(sockets[0].sent, []);
  assert.equal(c.isReady, true);
});
