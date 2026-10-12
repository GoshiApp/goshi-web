// The game server login token. The wallet signs the login message ONCE; the server answers with a token valid for
// 12 hours and the browser keeps it per wallet, so a new page, a reload, a dropped connection or a new match never
// opens the wallet again. The token only proves the same wallet signed earlier: every transaction still needs the
// wallet's approval. Pure logic with injected storage and clock, unit tested.

export const SESSION_PREFIX = "goshi-session:";
/** A token that expires within this margin is not used: it could be refused on the way. */
export const EXPIRY_MARGIN_MS = 60_000;

export interface SessionStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

interface Stored { token: string; expiresAt: number }

export class SessionStore {
  private readonly store: SessionStorage | null;
  private readonly now: () => number;
  /** Used when the storage is blocked (private mode): the token still lasts for this page session. */
  private readonly memory = new Map<string, Stored>();

  constructor(store: SessionStorage | null, now: () => number = () => Date.now()) {
    this.store = store;
    this.now = now;
  }

  /** The token for a wallet, or null when there is none or it is about to expire. */
  get(wallet: string): string | null {
    if (!wallet) return null;
    let s: Stored | null = null;
    try {
      const raw = this.store?.getItem(SESSION_PREFIX + wallet);
      if (raw) {
        const v = JSON.parse(raw) as Partial<Stored>;
        if (typeof v.token === "string" && typeof v.expiresAt === "number") s = { token: v.token, expiresAt: v.expiresAt };
      }
    } catch { /* unreadable: ignore it */ }
    s ??= this.memory.get(wallet) ?? null;
    if (!s) return null;
    if (s.expiresAt - this.now() <= EXPIRY_MARGIN_MS) {
      this.clear(wallet);
      return null;
    }
    return s.token;
  }

  set(wallet: string, token: string, expiresAt: number): void {
    if (!wallet || !token || !Number.isFinite(expiresAt)) return;
    const s: Stored = { token, expiresAt };
    this.memory.set(wallet, s);
    try { this.store?.setItem(SESSION_PREFIX + wallet, JSON.stringify(s)); } catch { /* blocked: memory only */ }
  }

  clear(wallet: string): void {
    this.memory.delete(wallet);
    try { this.store?.removeItem(SESSION_PREFIX + wallet); } catch { /* blocked */ }
  }
}

/** Runs `fn` once while a call is pending: callers that arrive meanwhile get the same promise. */
export class SingleFlight<T> {
  private pending: Promise<T> | null = null;

  get busy(): boolean {
    return this.pending !== null;
  }

  run(fn: () => Promise<T>): Promise<T> {
    if (this.pending) return this.pending;
    const p = fn().finally(() => { if (this.pending === p) this.pending = null; });
    this.pending = p;
    return p;
  }
}
