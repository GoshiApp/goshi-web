// What a room pays, in lamports, for the "what do I win" lines of the page. The same integer rules as the program
// (native/src/lib.rs settle_royale, settle_vs, settle_duel) and server/src/game/settlement.ts.

const pct = (a: bigint, p: bigint): bigint => (a * p) / 100n;

export interface RoyalePrizes { pot: bigint; first: bigint; second: bigint; third: bigint; saboteurPool: bigint; house: bigint }

/** A full royale room (10 paid seats): 88% of the pot to the top three as 60/25/15, 2% to the saboteurs, the rest to the house. */
export function royalePrizes(fee: bigint, paidSeats = 10n): RoyalePrizes {
  const pot = fee * paidSeats;
  const pool = pct(pot, 88n);
  const first = pct(pool, 60n), second = pct(pool, 25n);
  const saboteurPool = pct(pot, 2n);
  return { pot, first, second, third: pool - first - second, saboteurPool, house: pot - pool - saboteurPool };
}

export interface VsPrizes { pot: bigint; winner: bigint; loser: bigint; house: bigint }

/** VS: 10% rake, everybody but the winner keeps 80% of the net entry, the winner takes the rest. */
export function vsPrizes(fee: bigint, players: bigint): VsPrizes {
  const pot = fee * players;
  const rake = pct(pot, 10n);
  const loser = pct(fee - pct(fee, 10n), 80n);
  return { pot, winner: pot - rake - loser * (players - 1n), loser, house: rake };
}

/** Duel: the winner takes the pot minus a 3% fee. */
export function duelPrize(fee: bigint, players: bigint): { pot: bigint; winner: bigint; house: bigint } {
  const pot = fee * players;
  const house = pct(pot, 3n);
  return { pot, winner: pot - house, house };
}

/** How a house share is split: 10% buy-back and burn, 15% infrastructure, 25% liquidity, the rest the super pot. */
export function houseSplit(house: bigint): { burn: bigint; infra: bigint; liquidity: bigint; jackpot: bigint } {
  const burn = pct(house, 10n), infra = pct(house, 15n), liquidity = pct(house, 25n);
  return { burn, infra, liquidity, jackpot: house - burn - infra - liquidity };
}
