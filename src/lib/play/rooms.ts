// Room state helpers (program v3). They mirror the checks of `join_room` and `join_free` in the same order,
// so the page can say why a seat cannot be taken before it asks the wallet to sign.

import { MAX_FREE, MAX_PAID } from "./split.ts";

export type RoomState = "waiting" | "active";
export type RoomMode = "royale" | "vs" | "duel";

export interface RoomView {
  roomId: bigint;
  /** Entry fee in lamports. */
  entryFee: bigint;
  state: RoomState;
  mode: RoomMode;
  /** Base58 wallets of the paid seats (up to 10) and the saboteur seats (up to 3), in join order. */
  paid: string[];
  free: string[];
  /** 1 when a pass seat took one of the paid seats (nobody paid for it). */
  passes: number;
  /** The invited wallets of a duel; empty for any other room. */
  guests: string[];
}

/** Anchor decodes a Rust enum as an object with one key, e.g. `{ waiting: {} }` (camelCase of the IDL's variant). */
function variant<T extends string>(raw: unknown, allowed: readonly T[]): T {
  if (raw && typeof raw === "object") {
    const keys = Object.keys(raw).map((k) => k.toLowerCase());
    for (const a of allowed) if (keys.includes(a)) return a;
  }
  throw new Error("Unknown enum value");
}

export const parseRoomState = (raw: unknown): RoomState => variant(raw, ["waiting", "active"] as const);
export const parseRoomMode = (raw: unknown): RoomMode => variant(raw, ["royale", "vs", "duel"] as const);

interface RawRoom {
  roomId: { toString(): string };
  entryFee: { toString(): string };
  state: unknown;
  mode: unknown;
  paid: { toBase58(): string }[];
  free: { toBase58(): string }[];
  passes?: number;
  guests?: { toBase58(): string }[];
}

/** Converts a decoded `MatchRoom` account into plain data. */
export function toRoomView(raw: RawRoom): RoomView {
  return {
    roomId: BigInt(raw.roomId.toString()),
    entryFee: BigInt(raw.entryFee.toString()),
    state: parseRoomState(raw.state),
    mode: parseRoomMode(raw.mode),
    paid: raw.paid.map((p) => p.toBase58()),
    free: raw.free.map((p) => p.toBase58()),
    passes: raw.passes ?? 0,
    guests: (raw.guests ?? []).map((g) => g.toBase58()),
  };
}

export const paidSeatsLeft = (r: RoomView): number => Math.max(0, MAX_PAID - r.paid.length);
export const freeSeatsLeft = (r: RoomView): number => Math.max(0, MAX_FREE - r.free.length);
export const hasJoined = (r: RoomView, wallet: string | null | undefined): boolean =>
  !!wallet && (r.paid.includes(wallet) || r.free.includes(wallet));
export const isPaidPlayer = (r: RoomView, wallet: string | null | undefined): boolean => !!wallet && r.paid.includes(wallet);
export const isSaboteur = (r: RoomView, wallet: string | null | undefined): boolean => !!wallet && r.free.includes(wallet);

/** The pot of a royale room: the entry fee times the paid players. In lamports. */
export const roomPot = (r: RoomView): bigint => r.entryFee * BigInt(r.paid.length);

export type JoinCheck =
  | { ok: true }
  | { ok: false; reason: "notWaiting" | "roomFull" | "alreadyJoined" | "notEnoughGoshi" };

/** A paid seat: state, then seats, then repeated join (the order of `join_room`). */
export function canJoinPaid(room: RoomView, wallet: string | null | undefined): JoinCheck {
  if (room.state !== "waiting") return { ok: false, reason: "notWaiting" };
  if (room.paid.length >= MAX_PAID) return { ok: false, reason: "roomFull" };
  if (hasJoined(room, wallet)) return { ok: false, reason: "alreadyJoined" };
  // A duel is private by contract: the program only seats the host and the invited wallets.
  if (room.mode === "duel" && !(wallet && room.guests.includes(wallet))) return { ok: false, reason: "notWaiting" };
  return { ok: true };
}

/**
 * A saboteur seat (`join_free`): the wallet must hold at least `minHolder` $GOSHI (base units). Pass null for a balance
 * that is not known yet: then only the room rules are checked. VS rooms have no saboteurs and are not waiting.
 */
export function canJoinFree(
  room: RoomView,
  wallet: string | null | undefined,
  goshiBalance: bigint | null,
  minHolder: bigint | null,
): JoinCheck {
  if (room.state !== "waiting" || room.mode !== "royale") return { ok: false, reason: "notWaiting" };
  if (room.free.length >= MAX_FREE) return { ok: false, reason: "roomFull" };
  if (hasJoined(room, wallet)) return { ok: false, reason: "alreadyJoined" };
  if (goshiBalance !== null && minHolder !== null && goshiBalance < minHolder) return { ok: false, reason: "notEnoughGoshi" };
  return { ok: true };
}

/** Open rooms first, then by room number. Does not change the input. */
export function sortRooms(rooms: readonly RoomView[]): RoomView[] {
  const order = (r: RoomView) => (r.state === "waiting" ? 0 : 1);
  return [...rooms].sort((a, b) => order(a) - order(b) || (a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0));
}
