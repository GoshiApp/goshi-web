// One wallet connection for the whole page, shared by the header chip and the play page.
// A page loads this module once, so both scripts talk to the same WalletManager.
// The last wallet that was connected is remembered in this browser (its name only, never an address or a key) and restored
// silently on the next page: the wallet is asked with onlyIfTrusted, which never opens a pop-up.

import { WALLET_IDS, WalletManager, isInstalled, type WalletId, type WalletState } from "./wallet.ts";

const STORAGE_KEY = "goshi-wallet";

type Listener = (state: WalletState) => void;
const listeners = new Set<Listener>();

export function rememberedWallet(): WalletId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return WALLET_IDS.includes(v as WalletId) ? (v as WalletId) : null;
  } catch {
    return null;
  }
}
const remember = (id: WalletId | null) => {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the connection just lasts for this page.
  }
};

let last: WalletState["status"] = "disconnected";
export const manager = new WalletManager((state) => {
  if (state.status === "connected") remember(state.id);
  // Remember across a silent failure. Forget only when the person disconnects on purpose (see disconnectWallet).
  last = state.status;
  for (const l of [...listeners]) l(state);
});

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export async function disconnectWallet(): Promise<void> {
  remember(null);
  await manager.disconnect();
}

let restoring: Promise<void> | null = null;
/**
 * Restores the last connection without a pop-up. Wallet browsers inject their provider a moment after the page starts,
 * so it waits for it (up to about 1.5 seconds). Never throws.
 */
export function restoreWallet(): Promise<void> {
  restoring ??= (async () => {
    const id = rememberedWallet();
    if (!id || manager.current.status !== "disconnected") return;
    for (let i = 0; i < 15 && !isInstalled(id); i++) await new Promise((r) => setTimeout(r, 100));
    if (!isInstalled(id) || last === "connected") return;
    try {
      await manager.connect(id, { silent: true });
    } catch {
      // The wallet does not trust this site yet (or is locked). The person can connect with the button.
    }
  })();
  return restoring;
}
