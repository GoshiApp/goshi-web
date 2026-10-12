import { test } from "node:test";
import assert from "node:assert/strict";
import { canJoinFree, canJoinPaid, parseRoomMode, parseRoomState, roomPot, sortRooms, toRoomView, type RoomView } from "./rooms.ts";

const room = (over: Partial<RoomView> = {}): RoomView => ({
  roomId: 1n, entryFee: 100_000_000n, state: "waiting", mode: "royale", paid: [], free: [], passes: 0, ...over,
});
const wallets = (n: number, p = "w") => Array.from({ length: n }, (_, i) => `${p}${i}`);

test("Anchor enum objects become states and modes", () => {
  assert.equal(parseRoomState({ waiting: {} }), "waiting");
  assert.equal(parseRoomState({ Active: {} }), "active");
  assert.equal(parseRoomMode({ royale: {} }), "royale");
  assert.equal(parseRoomMode({ Vs: {} }), "vs");
  assert.throws(() => parseRoomState({ completed: {} }));
  assert.throws(() => parseRoomMode(null));
});

test("toRoomView reads BN-like numbers and public keys", () => {
  const v = toRoomView({
    roomId: { toString: () => "7" },
    entryFee: { toString: () => "250000000" },
    state: { waiting: {} },
    mode: { royale: {} },
    paid: [{ toBase58: () => "A" }, { toBase58: () => "B" }],
    free: [{ toBase58: () => "S" }],
  });
  assert.deepEqual(v, { roomId: 7n, entryFee: 250_000_000n, state: "waiting", mode: "royale", paid: ["A", "B"], free: ["S"], passes: 0 });
});

test("the pot is the fee times the paid players (saboteurs add nothing)", () => {
  assert.equal(roomPot(room({ paid: wallets(4), free: wallets(3, "s") })), 400_000_000n);
  assert.equal(roomPot(room()), 0n);
});

test("a paid seat follows the program's order of checks", () => {
  assert.deepEqual(canJoinPaid(room(), "me"), { ok: true });
  assert.deepEqual(canJoinPaid(room(), null), { ok: true });
  assert.deepEqual(canJoinPaid(room({ state: "active", paid: wallets(10) }), "me"), { ok: false, reason: "notWaiting" });
  assert.deepEqual(canJoinPaid(room({ paid: wallets(10) }), "me"), { ok: false, reason: "roomFull" });
  assert.deepEqual(canJoinPaid(room({ paid: ["me"] }), "me"), { ok: false, reason: "alreadyJoined" });
  // A saboteur of the room cannot also take a paid seat.
  assert.deepEqual(canJoinPaid(room({ free: ["me"] }), "me"), { ok: false, reason: "alreadyJoined" });
});

test("a saboteur seat needs a waiting royale, a free seat and enough $GOSHI", () => {
  const min = 1_000_000_000n;
  assert.deepEqual(canJoinFree(room(), "me", min, min), { ok: true });
  assert.deepEqual(canJoinFree(room(), "me", min - 1n, min), { ok: false, reason: "notEnoughGoshi" });
  assert.deepEqual(canJoinFree(room(), "me", null, min), { ok: true }); // balance not known yet
  assert.deepEqual(canJoinFree(room({ free: wallets(3, "s") }), "me", min, min), { ok: false, reason: "roomFull" });
  assert.deepEqual(canJoinFree(room({ paid: ["me"] }), "me", min, min), { ok: false, reason: "alreadyJoined" });
  assert.deepEqual(canJoinFree(room({ mode: "vs", state: "active" }), "me", min, min), { ok: false, reason: "notWaiting" });
  assert.deepEqual(canJoinFree(room({ state: "active", paid: wallets(10) }), "me", min, min), { ok: false, reason: "notWaiting" });
});

test("sortRooms puts waiting rooms first and orders by number, without touching the input", () => {
  const input = [room({ roomId: 5n, state: "active" }), room({ roomId: 9n }), room({ roomId: 2n, state: "active" }), room({ roomId: 3n })];
  const copy = [...input];
  assert.deepEqual(sortRooms(input).map((r) => r.roomId), [3n, 9n, 2n, 5n]);
  assert.deepEqual(input, copy);
});
