// WebSocket client for the Goshi play server (protocol: ~/goshi-escrow/server/PROTOCOL.md).
// Logs in with a wallet message signature, keeps the socket alive with pings, reconnects with backoff,
// and turns frames into typed events. It holds no game logic: the server simulates, the page draws.

import { selectedSkin } from "./skins.ts";
import { storedReferral } from "./referral.ts";
import { visitorId } from "./visitor.ts";
import type { TrapK } from "./protocol.ts";
import {
  authMessage, siwsMessage, backoffMs, bytesToBase58, createRoomMessage, decodeServer, encodeClient, inputMessage, RateLimiter,
  type ClientMsg, type Rules, type ServerMsg,
} from "./protocol.ts";
import { RttMeter } from "./predict.ts";
import type { SessionStore } from "./session.ts";

export type ConnectionStatus = "idle" | "connecting" | "authenticating" | "ready" | "reconnecting" | "closed";

/** What the client needs from the wallet. */
export interface MessageSigner {
  address: string;
  signMessage(text: string): Promise<Uint8Array>;
}

/** The part of WebSocket we use, so tests can pass a fake. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}
export type SocketFactory = (url: string) => SocketLike;

export interface ServerInfo {
  cluster: string;
  programId: string;
  mint: string;
  devBots: boolean | undefined;
  /** Entry fees the server opens rooms for, in lamports. */
  feePresets: bigint[];
  /** The entry options in dollars at the live SOL price (empty from an older server). */
  feeOptions: { lamports: bigint; usd: number }[];
  solUsd: number | null;
  /** $GOSHI base units a wallet must hold for a saboteur seat. */
  minHolder: bigint;
  rules: Rules;
}

export interface ClientEvents {
  status: { status: ConnectionStatus; attempt: number };
  /** The server's hello, before login. The page compares cluster, program and mint with its own settings. */
  hello: ServerInfo;
  authed: { wallet: string; viaToken: boolean };
  /** There is no valid login token and the page did not ask for a wallet popup: show a "Sign in" button. */
  signinNeeded: Record<string, never>;
  /** Every decoded message, including the ones that also have their own event. */
  message: ServerMsg;
  roomCreated: Extract<ServerMsg, { t: "roomCreated" }>;
  duelTx: Extract<ServerMsg, { t: "duelTx" }>;
  invite: Extract<ServerMsg, { t: "invite" }>;
  peerLeft: Extract<ServerMsg, { t: "peerLeft" }>;
  peerBack: Extract<ServerMsg, { t: "peerBack" }>;
  matchOver: Extract<ServerMsg, { t: "matchOver" }>;
  quickRoom: Extract<ServerMsg, { t: "quickRoom" }>;
  passOffer: Extract<ServerMsg, { t: "passOffer" }>;
  passTaken: Extract<ServerMsg, { t: "passTaken" }>;
  botsJoining: Extract<ServerMsg, { t: "botsJoining" }>;
  faucetDone: Extract<ServerMsg, { t: "faucet" }>;
  vsOffer: Extract<ServerMsg, { t: "vsOffer" }>;
  vsStarted: Extract<ServerMsg, { t: "vsStarted" }>;
  vsDeclined: Extract<ServerMsg, { t: "vsDeclined" }>;
  entered: Extract<ServerMsg, { t: "entered" }>;
  groomCreated: Extract<ServerMsg, { t: "groom_created" }>;
  groomUpdate: Extract<ServerMsg, { t: "groom_update" }>;
  lobby: Extract<ServerMsg, { t: "lobby" }>;
  start: Extract<ServerMsg, { t: "start" }>;
  live: Extract<ServerMsg, { t: "live" }>;
  skins: Extract<ServerMsg, { t: "skins" }>;
  snap: Extract<ServerMsg, { t: "snap" }>;
  fsnap: Extract<ServerMsg, { t: "fsnap" }>;
  fend: Extract<ServerMsg, { t: "fend" }>;
  stats: Extract<ServerMsg, { t: "stats" }>;
  end: Extract<ServerMsg, { t: "end" }>;
  error: Extract<ServerMsg, { t: "error" }>;
  /** The login failed because the wallet refused to sign or could not. Reconnecting will not retry by itself. */
  signFailed: { error: unknown };
}

type Handler<K extends keyof ClientEvents> = (payload: ClientEvents[K]) => void;

const OPEN = 1;
const PING_EVERY_MS = 25_000;
const MAX_ATTEMPTS = 8;

export interface ClientOptions {
  socketFactory?: SocketFactory;
  /** Injected in tests. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  rand?: () => number;
  /**
   * Free practice: no wallet, no login. The server says hello, and the client is ready at once. Practice matches live
   * on the socket, so a dropped connection is final (no automatic reconnect: the match is gone with it).
   */
  anonymous?: boolean;
  /** Where the login token is kept. Without it the wallet signs on every connection. */
  sessions?: SessionStore;
}

export class ServerClient {
  private readonly url: string;
  private readonly signer: MessageSigner;
  private readonly factory: SocketFactory;
  private readonly now: () => number;
  private readonly setT: (fn: () => void, ms: number) => unknown;
  private readonly clearT: (id: unknown) => void;
  private readonly rand: () => number;
  private readonly anonymous: boolean;
  private readonly sessions: SessionStore | null;
  /** Whether the wallet may be asked to sign now: only after a click, never from a reconnect. */
  private mayPrompt = true;
  private helloSiws: { nonce: string; chain: string } | null = null;
  private signing = false;
  private usedToken = false;
  private helloText: string | null = null;
  /** The socket a login was already sent on: it is never asked to sign again. */
  private loginSentOn: SocketLike | null = null;
  private socket: SocketLike | null = null;
  private handlers: { [K in keyof ClientEvents]?: Handler<K>[] } = {};
  private attempt = 0;
  private wantOpen = false;
  private authed = false;
  private pingTimer: unknown = null;
  private retryTimer: unknown = null;
  private readonly limiter = new RateLimiter();
  private readonly rtt = new RttMeter();
  private _bytesIn = 0;
  private _status: ConnectionStatus = "idle";

  constructor(url: string, signer: MessageSigner, opts: ClientOptions = {}) {
    this.url = url;
    this.signer = signer;
    this.factory = opts.socketFactory ?? ((u) => new WebSocket(u) as unknown as SocketLike);
    this.now = opts.now ?? (() => performance.now());
    this.setT = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearT = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
    this.rand = opts.rand ?? Math.random;
    this.anonymous = opts.anonymous === true;
    this.sessions = opts.sessions ?? null;
  }

  get status(): ConnectionStatus { return this._status; }
  get isReady(): boolean { return this._status === "ready"; }
  /** Text received so far, in characters (the size after the browser undid the compression). */
  get bytesIn(): number { return this._bytesIn; }
  /** Smoothed round trip time to the server in ms (0 until the first ping was answered). */
  get rttMs(): number { return this.rtt.ms; }
  get rttKnown(): boolean { return this.rtt.known; }
  /** The latest raw round trip sample (ms), 0 before the first. */
  get rttLastMs(): number { return this.rtt.last; }

  /** Sends a ping and measures how long the pong takes. Used every couple of seconds while a match runs. */
  ping(): boolean {
    if (!this.sendRaw({ t: "ping" })) return false;
    this.rtt.sent(this.now());
    return true;
  }

  on<K extends keyof ClientEvents>(event: K, handler: Handler<K>): () => void {
    const list = (this.handlers[event] ??= []) as Handler<K>[];
    list.push(handler);
    return () => {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }

  private emit<K extends keyof ClientEvents>(event: K, payload: ClientEvents[K]) {
    for (const h of [...((this.handlers[event] ?? []) as Handler<K>[])]) h(payload);
  }

  private setStatus(status: ConnectionStatus) {
    this._status = status;
    this.emit("status", { status, attempt: this.attempt });
  }

  // ------------------------------------------------------------------ connection

  /**
   * `prompt` says whether the wallet may be asked to sign the login when there is no valid token. Pass true for what a
   * click started, false for a restored connection (a "Sign in" button is then offered instead of a surprise popup).
   * Reconnections never prompt on their own.
   */
  connect(opts: { prompt?: boolean } = {}): void {
    this.mayPrompt = opts.prompt ?? true;
    this.wantOpen = true;
    this.attempt = 0;
    this.open();
  }

  /** Closes for good. No reconnect. */
  close(): void {
    this.wantOpen = false;
    this.clearTimers();
    const s = this.socket;
    this.socket = null;
    this.authed = false;
    try { s?.close(); } catch { /* already closed */ }
    this.setStatus("closed");
  }

  private open() {
    this.clearTimers();
    this.authed = false;
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    let s: SocketLike;
    try {
      s = this.factory(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = s;
    s.onmessage = (ev) => this.onFrame(s, ev.data);
    s.onerror = () => { /* onclose follows */ };
    s.onclose = () => {
      if (this.socket !== s) return;
      this.socket = null;
      this.authed = false;
      this.clearTimers();
      if (this.wantOpen && !this.anonymous) this.scheduleRetry();
      else { this.wantOpen = false; this.setStatus("closed"); }
    };
  }

  private scheduleRetry() {
    if (this.attempt >= MAX_ATTEMPTS) {
      this.wantOpen = false;
      this.setStatus("closed");
      return;
    }
    const delay = backoffMs(this.attempt, this.rand);
    this.attempt++;
    this.setStatus("reconnecting");
    this.retryTimer = this.setT(() => { if (this.wantOpen) this.open(); }, delay);
  }

  private clearTimers() {
    if (this.pingTimer !== null) this.clearT(this.pingTimer);
    if (this.retryTimer !== null) this.clearT(this.retryTimer);
    this.pingTimer = this.retryTimer = null;
  }

  /** The person pressed "Sign in": the one place a login signature is requested after a restored connection. */
  signIn(): void {
    this.mayPrompt = true;
    if (this.anonymous) return;
    if (this.socket && this.helloText && !this.authed) void this.sign(this.socket);
    else if (!this.socket) this.connect({ prompt: true });
  }

  private startPing() {
    if (this.pingTimer !== null) return;
    const tick = () => {
      this.ping();
      this.pingTimer = this.setT(tick, PING_EVERY_MS);
    };
    this.pingTimer = this.setT(tick, PING_EVERY_MS);
  }

  // ------------------------------------------------------------------ frames

  private async onFrame(from: SocketLike, data: unknown) {
    if (this.socket !== from) return;
    if (typeof data === "string") this._bytesIn += data.length;
    const msg = decodeServer(data);
    if (!msg) return; // ignore anything that is not part of the protocol
    this.emit("message", msg);
    switch (msg.t) {
      case "hello":
        this.emit("hello", {
          cluster: msg.cluster, programId: msg.programId, mint: msg.mint, devBots: msg.devBots,
          feePresets: msg.feePresets.map((f) => BigInt(f)), minHolder: BigInt(msg.minHolder), rules: msg.rules,
          feeOptions: (msg.feeOptions ?? []).map((o) => ({ lamports: BigInt(o.lamports), usd: o.usd })),
          solUsd: msg.solUsd ?? null,
        });
        if (this.anonymous) {
          // Practice needs no login: the server accepts `practice`, `input`, `leave` and `ping` from any socket.
          this.authed = true;
          this.attempt = 0;
          this.startPing();
          this.setStatus("ready");
          return;
        }
        this.helloText = msg.authMessage ?? authMessage(msg.nonce);
        this.helloSiws = msg.siws === true ? { nonce: msg.nonce, chain: msg.cluster === "mainnet-beta" ? "mainnet" : msg.cluster } : null;
        // Keep the socket alive while the wallet window is open (the server closes idle sockets after 60 s).
        this.startPing();
        await this.login(from);
        return;
      case "authed":
        this.authed = true;
        this.attempt = 0;
        // Keep the token the server gave: the next page, reload or reconnection needs no signature.
        if (msg.session && msg.expiresAt && this.sessions) this.sessions.set(msg.wallet || this.signer.address, msg.session, msg.expiresAt);
        this.mayPrompt = false;
        this.usedToken = false;
        this.startPing();
        this.setStatus("ready");
        this.sendSkin();
        try { const r = storedReferral(); if (r) this.send({ t: "ref", ref: r }); } catch { /* optional */ }
        this.emit("authed", { wallet: msg.wallet, viaToken: msg.viaToken === true });
        return;
      case "pong": this.rtt.received(this.now()); return;
      case "roomCreated": this.emit("roomCreated", msg); return;
      case "duelTx": this.emit("duelTx", msg); return;
      case "invite": this.emit("invite", msg); return;
      case "peerLeft": this.emit("peerLeft", msg); return;
      case "peerBack": this.emit("peerBack", msg); return;
      case "matchOver": this.emit("matchOver", msg); return;
      case "quickRoom": this.emit("quickRoom", msg); return;
      case "passOffer": this.emit("passOffer", msg); return;
      case "passTaken": this.emit("passTaken", msg); return;
      case "botsJoining": this.emit("botsJoining", msg); return;
      case "faucet": this.emit("faucetDone", msg); return;
      case "vsOffer": this.emit("vsOffer", msg); return;
      case "vsStarted": this.emit("vsStarted", msg); return;
      case "vsDeclined": this.emit("vsDeclined", msg); return;
      case "entered": this.emit("entered", msg); return;
      case "groom_created": this.emit("groomCreated", msg); return;
      case "groom_update": this.emit("groomUpdate", msg); return;
      case "lobby": this.emit("lobby", msg); return;
      case "start": this.emit("start", msg); return;
      case "live": this.emit("live", msg); return;
      case "skins": this.emit("skins", msg); return;
      case "snap": this.emit("snap", msg); return;
      case "fsnap": this.emit("fsnap", msg); return;
      case "fend": this.emit("fend", msg); return;
      case "stats": this.emit("stats", msg); return;
      case "end": this.emit("end", msg); return;
      case "error":
        // The server refused our token (expired, or its secret changed): forget it. The server closes the socket; the
        // reconnection then has no token and offers "Sign in" rather than opening the wallet by itself.
        if (msg.code === "auth_failed" && this.usedToken) {
          this.usedToken = false;
          this.sessions?.clear(this.signer.address);
          this.attempt = 0;
          return;
        }
        this.emit("error", msg);
        return;
    }
  }

  private async login(from: SocketLike) {
    const token = this.sessions?.get(this.signer.address) ?? null;
    if (token) {
      // A login we already signed: no popup.
      this.usedToken = true;
      this.loginSentOn = from;
      this.setStatus("authenticating");
      this.sendRaw({ t: "auth", token, ...(visitorId() ? { vid: visitorId() } : {}) });
      return;
    }
    this.usedToken = false;
    if (!this.mayPrompt) {
      this.setStatus("authenticating");
      this.emit("signinNeeded", {});
      return;
    }
    await this.sign(from);
  }

  /** Asks the wallet to sign the login. One request at a time: a second call while one is open does nothing. */
  private async sign(from: SocketLike) {
    if (this.signing || !this.helloText || this.loginSentOn === from) return;
    this.signing = true;
    this.setStatus("authenticating");
    try {
      // A server that speaks Sign In With Solana gets the standard text, which wallets show without a warning.
      const siws = this.helloSiws && typeof location !== "undefined"
        ? siwsMessage({ domain: location.host, address: this.signer.address, uri: location.origin, chain: this.helloSiws.chain, nonce: this.helloSiws.nonce, issuedAt: new Date().toISOString() })
        : null;
      const sig = await this.signer.signMessage(siws ?? this.helloText);
      if (this.socket !== from) return; // the socket was replaced while the wallet window was open
      this.loginSentOn = from;
      this.sendRaw({ t: "auth", wallet: this.signer.address, signature: bytesToBase58(sig), ...(siws ? { message: siws } : {}), ...(visitorId() ? { vid: visitorId() } : {}) });
    } catch (error) {
      // The person closed the wallet window, or the wallet cannot sign. Do not loop on pop-ups.
      this.wantOpen = false;
      this.emit("signFailed", { error });
      this.close();
    } finally {
      this.signing = false;
    }
  }

  // ------------------------------------------------------------------ sending

  private sendRaw(msg: ClientMsg): boolean {
    const s = this.socket;
    if (!s || s.readyState !== OPEN) return false;
    s.send(encodeClient(msg));
    return true;
  }

  /** Sends a message that needs a logged in session. Returns false when it cannot be sent right now. */
  send(msg: ClientMsg): boolean {
    return this.authed ? this.sendRaw(msg) : false;
  }

  /** `entryFee` in lamports. The server only accepts one of its presets. */
  /** Tells the server which cosmetic skin this wallet wears (it is checked there). Cheap: sent at sign in and at every entry. */
  sendSkin(): void {
    try {
      // The skin, or the goshi color as "hue:N": every screen and every replay show the body as its owner chose it.
      let id = selectedSkin();
      if (!id) { try { const h = localStorage.getItem("goshi-color"); if (h !== null && /^[0-7]$/.test(h)) id = `hue:${h}`; } catch { /* storage blocked */ } }
      if (id) this.send({ t: "skin", id });
    } catch { /* cosmetic only */ }
  }
  createRoom(entryFee: bigint): boolean { this.sendSkin(); return this.send(createRoomMessage(entryFee)); }
  /** Takes the pass seat offered in a `passOffer`. Answer: `passTaken` or an error (`no_pass`, `pass_gone`). */
  acceptPass(roomId: string): boolean { return this.send({ t: "acceptPass", roomId }); }
  /** Asks for a room with this entry: the fullest waiting one, or a new one. Answer: `quickRoom`. */
  createDuel(entryFee: bigint, guests: string[]): boolean { return this.send({ t: "createDuel", entryFee: entryFee.toString(), guests }); }
  startDuel(roomId: string): boolean { return this.send({ t: "startDuel", roomId }); }
  quick(entryFee: bigint): boolean { this.sendSkin(); return this.send({ t: "quick", entryFee: entryFee.toString() }); }
  fillWithBots(roomId: string, paid: number, free: number): boolean { return this.send({ t: "fillWithBots", roomId, paid, free }); }
  /** Answers a VS offer. */
  vs(roomId: string, accept: boolean): boolean { return this.send({ t: "vs", roomId, accept }); }
  faucet(): boolean { return this.send({ t: "faucet" }); }
  /** Starts a free practice match against bots (no wallet, no money). `name` is cleaned and cut by the server. */
  /** The live arena chosen (one per entry on the test network); null is the first one. */
  liveArena: string | null = null;
  liveWatch(): boolean { return this.send({ t: "live_watch", ...(this.liveArena ? { arena: this.liveArena } : {}) }); }
  liveJoin(name?: string, wallet?: string, skin?: string, entrySig?: string): boolean { return this.send({ t: "live_join", ...(this.liveArena ? { arena: this.liveArena } : {}), ...(name ? { name } : {}), ...(wallet ? { wallet } : {}), ...(skin ? { skin } : {}), ...(entrySig ? { entrySig } : {}) }); }
  liveLeave(): boolean { return this.send({ t: "live_leave" }); }
  afk(on: boolean): boolean { return this.send({ t: "afk", on }); }
  /** Sets a trap behind the tail: 1 a laser, 2 a slowing puddle. */
  trap(kind: TrapK): boolean { return this.send({ t: "trap", kind }); }
  /** Live arena: one more step of length, paid with the transaction `sig` (checked on chain by the server). */
  buyLength(sig: string): boolean { return this.send({ t: "buyLength", sig }); }
  practice(name: string, wallet?: string, difficulty?: "easy" | "medium" | "hard" | "insane", mode?: "survival" | "show"): boolean { return this.send({ t: "practice", name, ...(wallet ? { wallet } : {}), ...(difficulty ? { difficulty } : {}), ...(mode ? { mode } : {}) }); }
  watch(roomId: string): boolean { return this.send({ t: "watch", roomId }); }
  enter(roomId: string): boolean { this.sendSkin(); return this.send({ t: "enter", roomId }); }
  leave(roomId: string): boolean { return this.send({ t: "leave", roomId }); }
  /** Opens a free guest room and answers with `groom_created` (devnet/test servers only). */
  groomCreate(name: string): boolean { return this.send({ t: "groom_create", name }); }
  /** Joins a free guest room by its code. Answer: `groom_created`, or `error no_room | busy`. */
  groomJoin(name: string, code: string): boolean { return this.send({ t: "groom_join", name, code }); }
  /** Starts the guest room of this socket (host only). Answer: `entered` + `start`, or `error not_host`. */
  groomStart(): boolean { return this.send({ t: "groom_start" }); }
  /** Leaves the guest room of this socket. The others get a `groom_update`. */
  groomLeave(): boolean { return this.send({ t: "groom_leave" }); }

  /** Steering. At most 20 per second: extra calls are dropped (the next one carries the latest value). */
  sendInput(dx: number, dy: number, boost: boolean): boolean {
    if (!this.limiter.take(this.now())) return false;
    return this.send(inputMessage(dx, dy, boost));
  }
}
