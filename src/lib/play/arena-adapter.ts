// PLACEHOLDER. There is no real-time game yet.
//
// This file is the contract a future real-time arena has to implement to plug into the on-chain rooms.
// Nothing in the site implements it today, and the page shows a "In design" card (RealtimeArena.astro).
//
// Ground rules for whoever builds it (they follow the escrow program and docs/legal-review.md):
//  - The browser NEVER decides who won. The game server collects the result, and only the platform's
//    server key can sign `finalize_match` with the three winners. The client only displays the outcome.
//  - Only players of the room (RoomView.players) can take part, and only when the room is `active`.
//  - The game must be skill based. No chance, no paid re-rolls.
//  - No wallet private keys, seeds or signing inside the game. It receives addresses only.

import type { RoomView } from "./rooms.ts";

/** Who is playing. Addresses are the on-chain players of the room. */
export interface ArenaPlayer {
  address: string;
  /** Optional nickname chosen on the site. Never required. */
  displayName?: string;
}

/** What the game hands to the page when the match ends. The server remains the source of truth. */
export interface ArenaOutcome {
  roomId: bigint;
  /** The three best players, first to third, as wallet addresses. All different, all in the room. */
  podium: readonly [string, string, string];
  /** Server side identifier of the signed result, so the page can link to the replay or the proof. */
  resultId?: string;
}

export interface ArenaContext {
  room: RoomView;
  /** The connected wallet, or null for a spectator. */
  me: ArenaPlayer | null;
  players: readonly ArenaPlayer[];
  /** Lets the game honour reduced motion and sound preferences. */
  reducedMotion: boolean;
  lang: "es" | "en";
}

export type ArenaStatus = "idle" | "loading" | "ready" | "running" | "finished" | "error";

export interface RealtimeArena {
  /** Stable id, e.g. "cell-cleanup". Used in URLs and logs. */
  readonly id: string;
  /** Human name per language. */
  readonly name: Readonly<Record<"es" | "en", string>>;
  readonly status: ArenaStatus;
  /** Draws into `host` and connects to the game server. Resolves when the arena is ready to start. */
  mount(host: HTMLElement, ctx: ArenaContext): Promise<void>;
  /** Called by the page when the room is active and every player is connected. */
  start(): void;
  /** Subscribe to the end of the match. Returns an unsubscribe function. */
  onFinish(listener: (outcome: ArenaOutcome) => void): () => void;
  /** Leaves the match and frees the host element, sockets and timers. Safe to call twice. */
  dispose(): void;
}

let installed: RealtimeArena | null = null;

/** A future game calls this once when its module loads. */
export function registerArena(arena: RealtimeArena): void {
  installed = arena;
}

/** The registered arena, or null while none exists (today, always). */
export function getArena(): RealtimeArena | null {
  return installed;
}
