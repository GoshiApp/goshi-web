import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanPageUrl, inAppBrowserHint, isMobileDevice, mobileWalletLinks, phantomBrowseUrl, shouldOfferMobileLinks, solflareBrowseUrl,
} from "./mobile.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

test("phones and tablets are mobile, desktops are not", () => {
  assert.equal(isMobileDevice({ userAgent: IPHONE }), true);
  assert.equal(isMobileDevice({ userAgent: ANDROID }), true);
  assert.equal(isMobileDevice({ userAgent: DESKTOP, platform: "MacIntel", maxTouchPoints: 0 }), false);
  // iPadOS Safari looks like a Mac but has a touch screen.
  assert.equal(isMobileDevice({ userAgent: DESKTOP, platform: "MacIntel", maxTouchPoints: 5 }), true);
});

test("deep link builders encode the page and the origin exactly", () => {
  const page = "https://goshi.app/en/play/?x=1&y=a b";
  const origin = "https://goshi.app";
  assert.equal(
    phantomBrowseUrl(page, origin),
    "https://phantom.app/ul/browse/https%3A%2F%2Fgoshi.app%2Fen%2Fplay%2F%3Fx%3D1%26y%3Da%20b?ref=https%3A%2F%2Fgoshi.app",
  );
  assert.equal(
    solflareBrowseUrl(page, origin),
    "https://solflare.com/ul/v1/browse/https%3A%2F%2Fgoshi.app%2Fen%2Fplay%2F%3Fx%3D1%26y%3Da%20b?ref=https%3A%2F%2Fgoshi.app",
  );
});

test("the fragment is dropped and both links are built from the current address", () => {
  assert.equal(cleanPageUrl("https://goshi.app/es/jugar/#wallet"), "https://goshi.app/es/jugar/");
  assert.equal(cleanPageUrl("https://goshi.app/es/jugar/"), "https://goshi.app/es/jugar/");
  const l = mobileWalletLinks("https://goshi.app/es/jugar/#x", "https://goshi.app");
  assert.ok(l.phantom.startsWith("https://phantom.app/ul/browse/https%3A%2F%2Fgoshi.app%2Fes%2Fjugar%2F?ref="));
  assert.ok(l.solflare.startsWith("https://solflare.com/ul/v1/browse/https%3A%2F%2Fgoshi.app%2Fes%2Fjugar%2F?ref="));
});

test("in-app browser hints from the user agent", () => {
  assert.equal(inAppBrowserHint(IPHONE + " Phantom/ios"), "phantom");
  assert.equal(inAppBrowserHint(ANDROID + " Solflare"), "solflare");
  assert.equal(inAppBrowserHint(IPHONE), null);
});

test("the buttons show only on a phone with no injected wallet and outside a wallet browser", () => {
  const none = { phantom: false, solflare: false };
  assert.equal(shouldOfferMobileLinks({ mobile: true, installed: none, userAgent: IPHONE }), true);
  assert.equal(shouldOfferMobileLinks({ mobile: true, installed: none, userAgent: ANDROID }), true);
  // Desktop: never.
  assert.equal(shouldOfferMobileLinks({ mobile: false, installed: none, userAgent: DESKTOP }), false);
  // Inside Phantom or Solflare: the provider is injected, the buttons disappear.
  assert.equal(shouldOfferMobileLinks({ mobile: true, installed: { phantom: true, solflare: false }, userAgent: IPHONE }), false);
  assert.equal(shouldOfferMobileLinks({ mobile: true, installed: { phantom: false, solflare: true }, userAgent: ANDROID }), false);
  // The provider is not injected yet but the user agent says we are in a wallet browser: do not offer a loop.
  assert.equal(shouldOfferMobileLinks({ mobile: true, installed: none, userAgent: IPHONE + " Phantom/ios" }), false);
});
