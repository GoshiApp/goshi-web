// Mobile wallets. Safari and Chrome on a phone have no injected wallet provider, so the page cannot talk to a wallet there.
// The simple, robust way: open this same page inside the wallet's own browser, where the provider exists and the normal flow works.
//   Phantom   https://phantom.app/ul/browse/<encoded page url>?ref=<encoded origin>
//   Solflare  https://solflare.com/ul/v1/browse/<encoded page url>?ref=<encoded origin>
// TODO(owner): later, WalletConnect or the Solana Mobile Wallet Adapter can be added so wallets that are not opened through their
// own browser can connect. They are not added now because they are heavy libraries and this page must stay light.

import type { WalletId } from "./wallet.ts";

export interface MobileNav {
  userAgent: string;
  maxTouchPoints?: number;
  platform?: string;
}

/** A phone or a tablet. iPadOS Safari reports a desktop user agent, so a touch screen on "MacIntel" counts as mobile. */
export function isMobileDevice(nav: MobileNav): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(nav.userAgent)) return true;
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

/** Wallet in-app browsers announce themselves in the user agent on some versions. Only a hint: the injected provider is the proof. */
export function inAppBrowserHint(userAgent: string): WalletId | null {
  if (/Phantom/i.test(userAgent)) return "phantom";
  if (/Solflare/i.test(userAgent)) return "solflare";
  return null;
}

/** The page address to hand to a wallet: no #fragment. */
export function cleanPageUrl(href: string): string {
  const i = href.indexOf("#");
  return i < 0 ? href : href.slice(0, i);
}

export function phantomBrowseUrl(pageUrl: string, origin: string): string {
  return `https://phantom.app/ul/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(origin)}`;
}

export function solflareBrowseUrl(pageUrl: string, origin: string): string {
  return `https://solflare.com/ul/v1/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(origin)}`;
}

export function mobileWalletLinks(href: string, origin: string): Record<WalletId, string> {
  const page = cleanPageUrl(href);
  return { phantom: phantomBrowseUrl(page, origin), solflare: solflareBrowseUrl(page, origin) };
}

export interface OfferInput {
  mobile: boolean;
  /** Which wallet providers are injected in this browser (so we are inside a wallet's own browser, or on a desktop with the extension). */
  installed: Record<WalletId, boolean>;
  userAgent: string;
}

/** Show "Open in Phantom / Solflare" only on a phone, when no wallet is injected and we are not inside a wallet's browser. */
export function shouldOfferMobileLinks(i: OfferInput): boolean {
  if (!i.mobile) return false;
  if (i.installed.phantom || i.installed.solflare) return false;
  return inAppBrowserHint(i.userAgent) === null;
}
