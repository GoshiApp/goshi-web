// The pot of the room being played, live on the board: SOL, and what that SOL is worth in BTC right now (prices from the
// ticker of the page). It is there to make the challenge felt. Shown only in rooms with an entry, never in free play.
const el = () => document.querySelector<HTMLElement>("[data-pot-live]");

/** The price in dollars that the ticker shows for a coin ("$104.07" -> 104.07), or null while it is not known. */
function tickerUsd(sym: string): number | null {
  const t = document.querySelector<HTMLElement>(`[data-price="${sym}"]`)?.textContent ?? "";
  const n = Number(t.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

let lamports: bigint | null = null;

/** "0.057 SOL ≈ 0.000071 BTC" for an amount in lamports (the BTC part only while the ticker has both prices). */
export function solBtc(l: bigint): string {
  const sol = Number(l) / 1e9;
  const solUsd = tickerUsd("SOL"), btcUsd = tickerUsd("BTC");
  const btc = solUsd && btcUsd ? (sol * solUsd) / btcUsd : null;
  return `${sol.toFixed(sol < 1 ? 4 : 2)} SOL${btc !== null ? ` ≈ ${btc.toFixed(btc < 0.01 ? 6 : 4)} BTC` : ""}`;
}

function paint() {
  const box = el();
  if (!box) return;
  if (lamports === null || lamports <= 0n) { box.hidden = true; return; }
  const sol = Number(lamports) / 1e9;
  const solUsd = tickerUsd("SOL"), btcUsd = tickerUsd("BTC");
  const btc = solUsd && btcUsd ? (sol * solUsd) / btcUsd : null;
  void sol; void btc;
  box.textContent = `${box.dataset.label ?? "Pot"}: ${solBtc(lamports)}`;
  box.hidden = false;
}

/** The pot of the room on screen, in lamports; null hides it. */
export function setLivePot(value: bigint | null): void {
  lamports = value;
  paint();
}

// The prices move: the line follows them.
setInterval(() => { if (lamports !== null) paint(); }, 5000);
