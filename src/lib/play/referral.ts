// The invite link: `?ref=<wallet>` on any page. The first one a browser sees is kept (never replaced, never itself) and the
// game server checks it when the person signs in. Only a public wallet address is stored, in this browser.
const KEY = "goshi-ref";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function captureReferral(search: string = location.search): void {
  try {
    const ref = new URLSearchParams(search).get("ref");
    if (ref && BASE58.test(ref) && !localStorage.getItem(KEY)) localStorage.setItem(KEY, ref);
  } catch { /* private mode */ }
}

export function storedReferral(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && BASE58.test(v) ? v : null;
  } catch { return null; }
}

/** The link to share: this site's address with the wallet as the referrer, or the plain address without one. */
export function inviteLink(wallet: string | null, origin: string = location.origin, lang = "es"): string {
  return `${origin}/${lang}/${wallet ? `?ref=${wallet}` : ""}`;
}
