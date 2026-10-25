// The crypto bubbles that are the edible orbs of the arena: shared by the game painter and the illustrations of the site.

/** [ticker, color]. The first group is small (memes and small caps), then the big chains, then the richest. */
export const COINS: readonly [string, string][] = [
  ["DOGE", "#c2a633"], ["SHIB", "#e5811f"], ["PEPE", "#4c9a2a"], ["BONK", "#f5a623"], ["WIF", "#b98d5c"], ["FLOKI", "#e6a52e"],
  ["POPCAT", "#e58fa7"], ["BRETT", "#2f6fed"], ["MOG", "#b8860b"], ["TURBO", "#f26b3a"], ["GIGA", "#7a6bff"], ["PNUT", "#c89b5a"],
  ["GOAT", "#7d8590"], ["NEIRO", "#d9a441"], ["PENGU", "#4fb3d9"], ["TRUMP", "#d4472f"],
  ["SOL", "#9945ff"], ["AVAX", "#e84142"], ["BNB", "#f3ba2f"], ["ADA", "#2a71d0"], ["LINK", "#2a5ada"], ["XRP", "#5f6b7a"],
  ["TON", "#0098ea"], ["NEAR", "#00a67e"], ["SUI", "#4da2ff"], ["APT", "#12a39a"], ["ARB", "#28a0f0"], ["OP", "#ff0420"],
  ["TRX", "#d80027"], ["DOT", "#e6007a"], ["ATOM", "#5d6285"],
  ["BTC", "#f7931a"], ["ETH", "#627eea"],
];
const SMALL = 16, MID = 15; // COINS[0..15] small, COINS[16..30] medium, COINS[31..32] rich
/** How a person writes an amount of a coin: BTC in sats, the rest with a couple of significant digits. */
export function coinAmount(sym: string, q: number): string {
  // SOL with six decimals, so a growing bag is seen growing.
  if (sym === "SOL") return `${q.toFixed(9)} SOL`;
  if (sym === "BTC") { const sats = Math.round(q * 1e8); return `${sats.toLocaleString("en-US")} sats`; }
  const s = q >= 1 ? q.toFixed(2).replace(/\.?0+$/, "") : q.toPrecision(2).replace(/0+$/, "");
  return `${s} ${sym}`;
}

/** The coin a named orb shows (BTC, ETH, DOGE...), or null when it is not one of the drawn coins. */
export function coinIndexOf(sym: string): number | null {
  const i = COINS.findIndex((c) => c[0] === sym);
  return i < 0 ? null : i;
}

/** The coin an orb shows, from its value and id: stable for an orb, varied across the map. */
export function coinIndex(value: number, id: number): number {
  if (value < 1.5) return id % SMALL;
  if (value < 3.5) return SMALL + (id % MID);
  return SMALL + MID + (id % 2);
}
