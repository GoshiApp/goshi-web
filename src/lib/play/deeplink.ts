// Links that open a page inside the wallet's own browser, where the wallet can sign. A plain link opened from a chat or a
// notification lands in Safari or Chrome, which cannot reach the wallet.
export const phantomLink = (url: string, origin: string): string =>
  `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(origin)}`;
export const solflareLink = (url: string, origin: string): string =>
  `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(origin)}`;

/** True on a phone browser that has no wallet inside it. */
export function needsWalletBrowser(): boolean {
  const w = window as unknown as { phantom?: { solana?: unknown }; solflare?: unknown; solana?: unknown };
  const phone = /iPhone|iPad|Android/i.test(navigator.userAgent);
  return phone && !w.phantom?.solana && !w.solflare && !w.solana;
}
