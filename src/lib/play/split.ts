// The money rules of the escrow program v3, written once more in BigInt.
// This mirrors programs/goshi-escrow/src/lib.rs (settle_royale, settle_vs) and server/src/game/settlement.ts,
// including the integer rounding (floor) and "the last share is the remainder".
// The numbers shown on the page and the numbers the program moves must never disagree: split.test.ts holds the
// Rust unit tests and the server's own settlement tests as vectors.
//
// Entry fees are in lamports (1 SOL = 1_000_000_000). Saboteurs do not compete: they share 2% of the pot, paid in SOL.

import { U64_MAX } from "./amounts.ts";
import { CONTRACT_V6 } from "./contract.ts";

/** VS mode only: rake taken from every entry (percent of the pot). */
export const RAKE_PCT = CONTRACT_V6 ? 3n : 10n;
/** Royale (contract v6): prizes are 95% of the cash in the room, saboteurs share 2% equally, the house keeps the rest (3%). */
export const PRIZE_POOL_PCT = CONTRACT_V6 ? 95n : 88n;
export const SABOTEUR_POOL_PCT = 2n;
/** Prize split (percent of the prize pool). The third place is the remainder (15). */
export const PRIZE_FIRST_PCT = 60n;
export const PRIZE_SECOND_PCT = 25n;
/** What the house keeps is split (percent of it). The super pot is the remainder (50). */
export const RAKE_BURN_PCT = 10n;
export const RAKE_INFRA_PCT = 15n;
export const RAKE_LIQ_PCT = 25n;
/** VS mode: everyone but the winner keeps 80% of their net entry. */
export const VS_LOSER_KEEPS_PCT = 80n;

export const MAX_PAID = 10;
export const MAX_FREE = 3;
export const MIN_VS_PLAYERS = 2;
export const MAX_VS_PLAYERS = 9;

export interface RoyaleSplit {
  /** The entry fee times the paid seats (a pass seat counts) and what the room really holds. */
  nominal: bigint;
  cash: bigint;
  prizePool: bigint;
  /** SOL paid to the Top 3 paid players, in rank order. */
  prizes: [bigint, bigint, bigint];
  /** The 2% pool, one equal share per seated saboteur, and what is really paid out to them (dust stays with the house). */
  saboteurPool: bigint;
  saboteurEach: bigint;
  saboteurTotal: bigint;
  /** What the house keeps: the cash minus the prizes minus the saboteurs. Exactly 3% of the pot with three saboteurs and no pass seat. */
  rake: bigint;
  buybackBurn: bigint;
  infra: bigint;
  liquidity: bigint;
  /** The part of the house share that goes to the super pot (the remainder). */
  rakeJackpot: bigint;
}

export interface VsSplit {
  pot: bigint;
  rake: bigint;
  buybackBurn: bigint;
  infra: bigint;
  liquidity: bigint;
  rakeJackpot: bigint;
  winner: bigint;
  loser: bigint;
}

/** u64 checked multiply-divide, like `pct` in lib.rs. Null where Rust returns None. */
function pct(amount: bigint, percent: bigint): bigint | null {
  if (amount < 0n || amount > U64_MAX) return null;
  const v = (amount * percent) / 100n; // BigInt division truncates toward zero, like u128 division
  return v > U64_MAX ? null : v;
}

function rakeParts(rake: bigint) {
  const buybackBurn = pct(rake, RAKE_BURN_PCT);
  const infra = pct(rake, RAKE_INFRA_PCT);
  const liquidity = pct(rake, RAKE_LIQ_PCT);
  if (buybackBurn === null || infra === null || liquidity === null) return null;
  return { buybackBurn, infra, liquidity, rakeJackpot: rake - buybackBurn - infra - liquidity };
}

/**
 * A royale of contract v3. `nominal` is the entry fee times the paid seats (a pass seat counts), `cash` is what the room
 * really holds, `saboteurs` the seated saboteurs. Mirrors `settle_royale` in lib.rs. Null on overflow or when the cash
 * cannot cover the prizes and the saboteur shares (two pass seats would).
 */
export function settleRoyale(nominal: bigint, cash: bigint, saboteurs: number): RoyaleSplit | null {
  if (!Number.isInteger(saboteurs) || saboteurs < 0 || saboteurs > MAX_FREE) return null;
  if (nominal < 0n || nominal > U64_MAX) return null;
  const base = CONTRACT_V6 ? cash : nominal;
  const prizePool = pct(base, PRIZE_POOL_PCT);
  const sabPool = pct(base, SABOTEUR_POOL_PCT);
  if (prizePool === null || sabPool === null || cash < 0n || cash > U64_MAX) return null;
  const first = pct(prizePool, PRIZE_FIRST_PCT);
  const second = pct(prizePool, PRIZE_SECOND_PCT);
  if (first === null || second === null) return null;
  const n = BigInt(saboteurs);
  const saboteurEach = n === 0n ? 0n : sabPool / n;
  const saboteurTotal = saboteurEach * n;
  const rake = cash - prizePool - saboteurTotal;
  if (rake < 0n) return null;
  const parts = rakeParts(rake);
  if (!parts) return null;
  return {
    nominal, cash, prizePool, prizes: [first, second, prizePool - first - second], saboteurPool: sabPool, saboteurEach, saboteurTotal,
    rake, ...parts,
  };
}

/** A VS match of 2 to 9 paid players. Null outside that range or on overflow. */
export function settleVs(entry: bigint, players: number): VsSplit | null {
  if (!Number.isInteger(players) || players < MIN_VS_PLAYERS || players > MAX_VS_PLAYERS) return null;
  const n = BigInt(players);
  const pot = entry * n;
  if (entry < 0n || pot > U64_MAX) return null;
  const rake = pct(pot, RAKE_PCT);
  const entryRake = pct(entry, RAKE_PCT);
  if (rake === null || entryRake === null) return null;
  const net = entry - entryRake;
  const loser = pct(net, VS_LOSER_KEEPS_PCT);
  if (loser === null) return null;
  const winner = pot - rake - loser * (n - 1n);
  const parts = rakeParts(rake);
  if (!parts) return null;
  return { pot, rake, ...parts, winner, loser };
}

/** The pot of a royale room: the entry fee times the paid players. Null above u64. */
export function royalePot(entryFee: bigint, paidPlayers: number): bigint | null {
  const pot = entryFee * BigInt(paidPlayers);
  return pot > U64_MAX ? null : pot;
}
