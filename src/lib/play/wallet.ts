// Wallet adapters for the two wallets we support, through the providers they inject in the page:
//   Phantom  -> window.phantom.solana
//   Solflare -> window.solflare
// No wallet library is bundled. Only types are imported from web3.js, so this file costs almost nothing.
// The wallet signs; the site never sees a key. Sending the transaction is done with our own RPC connection.

import type { PublicKey, Transaction } from "@solana/web3.js";
import { PlayError, classifyConnectError, classifyError, classifySignError } from "./errors.ts";

export type WalletId = "phantom" | "solflare";
export const WALLET_IDS: readonly WalletId[] = ["phantom", "solflare"];
export const WALLET_NAMES: Record<WalletId, string> = { phantom: "Phantom", solflare: "Solflare" };
export const WALLET_INSTALL_URLS: Record<WalletId, string> = {
  phantom: "https://phantom.com/download",
  solflare: "https://solflare.com/download",
};

type Listener = (...args: unknown[]) => void;

/** The part of an injected provider that we use. */
interface InjectedProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: PublicKey | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<unknown>;
  disconnect(): Promise<void>;
  signTransaction(tx: Transaction): Promise<Transaction>;
  /** Phantom resolves { signature }; some Solflare versions resolve the signature bytes directly. */
  signMessage?(message: Uint8Array, display?: "utf8" | "hex"): Promise<{ signature: Uint8Array } | Uint8Array>;
  on(event: string, listener: Listener): unknown;
  off?(event: string, listener: Listener): unknown;
  removeListener?(event: string, listener: Listener): unknown;
}

interface WalletWindow {
  phantom?: { solana?: InjectedProvider };
  solflare?: InjectedProvider;
}

/** The provider for a wallet, or null when it is not installed (yet). Extensions can inject late, so call this when needed. */
export function getProvider(id: WalletId, win: WalletWindow = window as unknown as WalletWindow): InjectedProvider | null {
  if (id === "phantom") {
    const p = win.phantom?.solana;
    return p?.isPhantom ? p : null;
  }
  const p = win.solflare;
  return p?.isSolflare ? p : null;
}

export const isInstalled = (id: WalletId, win?: WalletWindow): boolean => getProvider(id, win) !== null;

export type WalletState =
  | { status: "disconnected" }
  | { status: "connecting"; id: WalletId }
  | { status: "connected"; id: WalletId; address: string; publicKey: PublicKey };

/** What the Anchor client needs from a connected wallet. */
export interface Signer {
  publicKey: PublicKey;
  signTransaction(tx: Transaction): Promise<Transaction>;
}

/**
 * Holds one wallet connection. Handles connect, disconnect and the wallet's own events
 * (the person switches account, or disconnects from inside the extension).
 */
export class WalletManager {
  private provider: InjectedProvider | null = null;
  private state: WalletState = { status: "disconnected" };
  private readonly handlers = new Map<string, Listener>();

  constructor(private readonly onChange: (state: WalletState) => void) {}

  get current(): WalletState {
    return this.state;
  }

  /** The signer for the connected wallet. Throws a PlayError when nothing is connected. */
  get signer(): Signer {
    const s = this.state;
    const p = this.provider;
    if (s.status !== "connected" || !p) throw new PlayError("noWallet", "No wallet connected");
    return {
      publicKey: s.publicKey,
      signTransaction: async (tx) => {
        try {
          return await p.signTransaction(tx);
        } catch (err) {
          if (err instanceof PlayError) throw err;
          throw new PlayError(classifySignError(err), err instanceof Error ? err.message : String(err));
        }
      },
    };
  }

  /** Signs a text message (no transaction, no fee). Used to log in to the play server. */
  async signMessage(text: string): Promise<Uint8Array> {
    const p = this.provider;
    if (this.state.status !== "connected" || !p) throw new PlayError("noWallet", "No wallet connected");
    if (!p.signMessage) throw new PlayError("unknown", "This wallet cannot sign messages");
    try {
      const res = await p.signMessage(new TextEncoder().encode(text), "utf8");
      return res instanceof Uint8Array ? res : res.signature;
    } catch (err) {
      throw err instanceof PlayError ? err : new PlayError(classifyError(err), err instanceof Error ? err.message : String(err));
    }
  }

  private set(state: WalletState) {
    this.state = state;
    this.onChange(state);
  }

  /**
   * Connects. With `silent`, only a site the wallet already trusts is connected, with no pop-up (used to restore the
   * connection on page load). A refusal then simply leaves the wallet disconnected.
   */
  async connect(id: WalletId, opts: { silent?: boolean } = {}): Promise<void> {
    const provider = getProvider(id);
    if (!provider) throw new PlayError("noWallet", `${WALLET_NAMES[id]} is not installed`);
    if (this.state.status === "connecting") return;
    this.detach();
    this.set({ status: "connecting", id });
    const started = Date.now();
    try {
      // Phantom resolves with { publicKey }; Solflare resolves with a boolean and sets provider.publicKey.
      const res = (await provider.connect(opts.silent ? { onlyIfTrusted: true } : undefined)) as { publicKey?: PublicKey } | undefined;
      const publicKey = provider.publicKey ?? res?.publicKey;
      if (!publicKey) throw new PlayError("rejected", "The wallet did not return an account");
      this.provider = provider;
      this.attach(id, provider);
      this.set({ status: "connected", id, address: publicKey.toBase58(), publicKey });
    } catch (err) {
      this.provider = null;
      this.set({ status: "disconnected" });
      if (err instanceof PlayError) throw err;
      throw new PlayError(classifyConnectError(err, Date.now() - started), err instanceof Error ? err.message : String(err));
    }
  }

  async disconnect(): Promise<void> {
    const p = this.provider;
    this.detach();
    this.provider = null;
    this.set({ status: "disconnected" });
    try {
      await p?.disconnect();
    } catch {
      // The wallet may already be disconnected. The page state is what matters.
    }
  }

  private attach(id: WalletId, provider: InjectedProvider) {
    const onDisconnect: Listener = () => {
      this.detach();
      this.provider = null;
      this.set({ status: "disconnected" });
    };
    const onAccountChanged: Listener = (next) => {
      const pk = next as PublicKey | null | undefined;
      if (pk && typeof pk.toBase58 === "function") {
        this.set({ status: "connected", id, address: pk.toBase58(), publicKey: pk });
        return;
      }
      // The new account has not approved this site. Try silently; if the wallet says no, show disconnected.
      provider
        .connect({ onlyIfTrusted: true })
        .then(() => {
          const now = provider.publicKey;
          if (now) this.set({ status: "connected", id, address: now.toBase58(), publicKey: now });
          else onDisconnect();
        })
        .catch(onDisconnect);
    };
    this.handlers.set("disconnect", onDisconnect);
    this.handlers.set("accountChanged", onAccountChanged);
    provider.on("disconnect", onDisconnect);
    provider.on("accountChanged", onAccountChanged);
  }

  private detach() {
    const p = this.provider;
    if (p) {
      const off = (p.off ?? p.removeListener)?.bind(p);
      for (const [event, fn] of this.handlers) off?.(event, fn);
    }
    this.handlers.clear();
  }
}
