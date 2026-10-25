import { youWord } from "../lib/play/staff.ts";
// The live part of the play page: the game server connection, creating rooms, test funds, the lobby, the VS offer,
// the arena canvas and the result. Loaded lazily by play.ts the first time a wallet connects.
import { setLivePot, solBtc } from "./pot-live.ts";
import { setPodiumPrizes } from "../lib/play/arena-paint.ts";
import { duelPrize, royalePrizes, vsPrizes } from "../lib/play/prizes.ts";
import { fill, node } from "../lib/play/dom.ts";
import { verifyMatch } from "../lib/play/proof-check.ts";
import { explorerTxUrl, shortAddress, type Cluster } from "../lib/play/config.ts";
import { formatAmount } from "../lib/play/amounts.ts";
import type { PlayCopy } from "../content/types.ts";
import type { ServerMsg } from "../lib/play/protocol.ts";
import type { RoomView } from "../lib/play/rooms.ts";
import type { ServerClient } from "../lib/play/server-client.ts";
import { SessionStore } from "../lib/play/session.ts";
import { usdText } from "../lib/play/quick.ts";
import { getShell } from "./arena-shell.ts";
import { buildSummary, dailyAndShare } from "./result-card.ts";
import type { WalletManager, WalletState } from "../lib/play/wallet.ts";

export interface LiveHost {
  cluster: Cluster;
  explorerCluster: Cluster;
  unitSol: string;
  unitGoshi: string;
  locale: string;
  settings: { programId: string; goshiMint: string; serverUrl: string; rpcUrl?: string };
  t: PlayCopy["live"];
  vsText: PlayCopy["vsOffer"];
  potLabels: Record<"first" | "second" | "third" | "burn" | "infra" | "liquidity" | "jackpot" | "pot" | "rake" | "prizePool", string>;
  wallet: WalletManager;
  /** Lamports as "0.1" and token base units as "12.5 {unit}". */
  sol(lamports: bigint): string;
  goshi(units: bigint): string;
  gateOk(): boolean;
  rooms(): RoomView[];
  refreshRooms(): Promise<void>;
  refreshBalances(): Promise<void>;
  isBusy(): boolean;
  /** Puts a failure in the transaction status area, naming the step. */
  fail(step: "server" | "login" | "network" | "room" | "seat", message: string, retry?: () => void): void;
  log(...args: unknown[]): void;
  /** The actions of the result card: the quick match loop lives in play.ts. */
  quickActions: { again(): void; change(): void; leave(): void };
}

export interface Live {
  /** `userInitiated`: the person just clicked Connect, so the wallet may be asked to sign the login. */
  walletChanged(s: WalletState, opts?: { userInitiated?: boolean }): void;
  /** Whether to offer "fill with test bots": a test network, and the server said so (or has not said). */
  devBots(): boolean;
  fillWithBots(roomId: string): void;
  openGame(roomId: string): void;
  /** Takes the player back into a match they are seated in (a reload, the same link, another tab). No-op when already in it. */
  resume(roomId: string): void;
  /** Call after the person took a seat on the network: enters the room on the server. */
  joined(roomId: string): void;
  /** Asks the server for a room with this entry (lamports): the fullest waiting one, or a new one. */
  quick(fee: bigint): Promise<{ roomId: string; created: boolean; paid: number }>;
  /** Creates a private duel on the server (the creator then takes a seat like in any room). */
  createDuel(fee: bigint, guests: string[]): Promise<{ roomId: string; tx: string; players: number }>;
  /** The creator starts a duel before it is full (2 or more seated). */
  startDuel(roomId: string): void;
  /** Test network: asks the server for free test SOL and resolves when it arrives (or after a while). */
  faucet(): Promise<void>;
}

type Start = Extract<ServerMsg, { t: "start" }>;
type End = Extract<ServerMsg, { t: "end" }>;

export function createLive(host: LiveHost): Live {
  const t = host.t;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const setText = (el: HTMLElement, text: string) => { el.textContent = text; };

  const serverStatus = $("play-server-status");
  const createBtn = $<HTMLButtonElement>("play-create-btn");
  const createMsg = $("play-create-msg");
  const createLink = $<HTMLAnchorElement>("play-create-link");
  const feeBox = $("play-fee-options");
  // The test faucet and the test bots exist only on a test network: on mainnet-beta nothing here is reachable,
  // whatever the server says. The faucet markup is not even rendered there.
  const testNetwork = host.cluster !== "mainnet-beta";
  const faucetBox = document.getElementById("play-faucet-box");
  const faucetBtn = document.getElementById("play-faucet") as HTMLButtonElement | null;
  const faucetMsg = document.getElementById("play-faucet-msg");
  const liveError = $("play-live-error");
  const lobbyEl = $("play-lobby");
  const shell = getShell()!;
  const resultEl = $("play-result");
  const resultBody = $("play-result-body");
  const vsDialog = $<HTMLDialogElement>("play-vs");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The login token (see session.ts): the wallet signs the login once, then every connection uses the token.
  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { /* blocked */ }
  const sessions = new SessionStore(storage);
  const signinBtn = $<HTMLButtonElement>("play-signin");
  let clientAddress: string | null = null;
  let client: ServerClient | null = null;
  let devBotsFlag: boolean | undefined;
  let compatible = true;
  let signFailedShown = false;
  let enterTries = 0;
  let currentRoom: string | null = null;
  let pendingEnter: string | null = null;
  let lastLobby: Extract<ServerMsg, { t: "lobby" }> | null = null;
  let vsTimer: ReturnType<typeof setInterval> | null = null;

  const showError = (text: string) => { liveError.hidden = !text; setText(liveError, text); };
  const serverErr = (m: Extract<ServerMsg, { t: "error" }>) =>
    t.errors[m.code] ?? fill(t.errorGeneric, { message: m.message || m.code });
  const showFaucet = () => { if (faucetBox) faucetBox.hidden = !(testNetwork && host.cluster === "devnet" && (devBotsFlag ?? true)); };

  // ------------------------------------------------------------------ connection

  function renderFees(presets: bigint[]) {
    feeBox.replaceChildren(
      ...presets.map((f, i) => {
        const label = node("label", { class: "chip-radio" });
        const input = node("input", { attrs: { type: "radio", name: "play-fee", value: f.toString() } });
        if (i === 0) input.checked = true;
        label.append(input, node("span", { text: fill(t.create.feeOption, { n: host.sol(f), unit: host.unitSol }) }));
        return label;
      }),
    );
  }

  async function startClient(wallet: Extract<WalletState, { status: "connected" }>, prompt: boolean) {
    if (client && client.status !== "closed") return;
    signFailedShown = false;
    signinBtn.hidden = true;
    setText(serverStatus, t.server.connecting);
    const { ServerClient } = await import("../lib/play/server-client.ts");
    const c = new ServerClient(host.settings.serverUrl, {
      address: wallet.address,
      signMessage: (text) => host.wallet.signMessage(text),
    }, { sessions });
    client = c;
    clientAddress = wallet.address;
    c.on("signinNeeded", () => {
      if (client !== c) return;
      // No token and nobody clicked: offer a button instead of opening the wallet by surprise.
      signinBtn.hidden = false;
      setText(serverStatus, t.server.signinNeeded);
    });
    c.on("authed", () => { if (client === c) signinBtn.hidden = true; });
    c.on("status", ({ status }) => {
      if (client !== c) return;
      const map = { idle: t.server.closed, connecting: t.server.connecting, authenticating: t.server.authenticating, ready: t.server.ready, reconnecting: t.server.reconnecting, closed: t.server.closed } as const;
      if (compatible && !signFailedShown) setText(serverStatus, map[status]);
      if (status === "ready" && pendingEnter) { const id = pendingEnter; pendingEnter = null; enter(id); }
    });
    c.on("hello", (info) => {
      devBotsFlag = info.devBots;
      compatible = info.cluster === host.cluster && info.programId === host.settings.programId && info.mint === host.settings.goshiMint;
      renderFees(info.feePresets);
      showFaucet();
      if (!compatible) {
        setText(serverStatus, t.server.mismatch);
        host.log("server mismatch", info, host.settings);
        host.fail("server", t.server.mismatch);
        c.close();
      }
      void host.refreshRooms();
    });
    c.on("signFailed", ({ error }) => {
      signFailedShown = true;
      setText(serverStatus, t.server.signFailed);
      host.log("login signing failed", error);
      host.fail("login", t.server.signFailed);
    });
    c.on("error", (m) => {
      if (m.code === "no_pass" || m.code === "pass_gone") { passHandlers?.gone(); return; }
      createBtn.disabled = false;
      if (faucetBtn) faucetBtn.disabled = false;
      setText(createMsg, "");
      if (faucetMsg) setText(faucetMsg, "");
      // The seat is on-chain but the server cannot see it yet (its node may lag a little): ask again a few times.
      if (m.code === "not_in_room" && currentRoom && enterTries < 4) {
        enterTries++;
        host.log("not_in_room, asking again", enterTries);
        const id = currentRoom;
        setTimeout(() => { if (client && client.isReady) client.enter(id); }, 2000);
        return;
      }
      const text = serverErr(m);
      showError(text);
      host.log("server error", m.code, m.message);
      host.fail(m.code === "auth_failed" ? "login" : "server", text);
    });
    c.on("roomCreated", (m) => {
      createBtn.disabled = false;
      setText(createMsg, fill(t.create.created, { id: m.roomId }));
      createLink.href = explorerTxUrl(host.explorerCluster, m.tx);
      setText(createLink, t.create.view);
      createLink.hidden = false;
      c.watch(m.roomId);
      void host.refreshRooms();
    });
    c.on("invite", (m) => { window.dispatchEvent(new CustomEvent("goshi-invite", { detail: m })); });
    const say = (text: string, ms = 9000, cls = "match-toast") => {
      const el = document.createElement("div");
      el.className = cls;
      el.setAttribute("role", "status");
      el.textContent = text;
      // In full screen only the full screen element is drawn: a notice outside it would never be seen.
      (document.fullscreenElement ?? document.body).append(el);
      if (ms > 0) setTimeout(() => el.remove(), ms);
    };
    // A match whose messages stop (a dropped message, a socket that is alive but dead, the hand-over from the minute of frenzy
    // to the arena that never came) must not leave the player in front of a still screen: ask the server for the match again.
    let lastGameMsgAt = Date.now();
    let matchRunning = false;
    c.on("message", (m) => {
      if (m.t === "snap" || m.t === "fsnap" || m.t === "fend") lastGameMsgAt = Date.now();
      if (m.t === "start") { matchRunning = true; lastGameMsgAt = Date.now(); }
      if (m.t === "end" || m.t === "matchOver") matchRunning = false;
    });
    const watchdog = setInterval(() => {
      if (client !== c) { clearInterval(watchdog); return; }
      if (!matchRunning || !currentRoom || document.visibilityState === "hidden") return;
      if (Date.now() - lastGameMsgAt < 4000) return;
      lastGameMsgAt = Date.now();
      host.log("watchdog: no game messages, asking again", currentRoom);
      try { c.enter(currentRoom); } catch { /* the socket is closed: the reconnect logic takes over */ }
    }, 2000);
    c.on("peerBack", (m) => {
      const me = host.wallet.current.status === "connected" ? host.wallet.current.address : null;
      if (m.roomId !== currentRoom || m.wallet === me) return;
      say(host.t.arenaState.peerBack.replace("{player}", shortAddress(m.wallet)), 5000);
    });
    // The match is over and the prizes are being sent: say so at once, so the board never just stands still.
    c.on("matchOver", (m) => {
      if (m.roomId !== currentRoom) return;
      document.querySelectorAll(".match-over").forEach((n) => n.remove());
      const me = host.wallet.current.status === "connected" ? host.wallet.current.address : null;
      const mine = m.ranking.find((r) => r.w === me);
      const text = mine
        ? host.t.arenaState.matchOverRank.replace("{rank}", String(mine.rank)).replace("{n}", String(m.ranking.filter((r) => r.role === "paid").length))
        : host.t.arenaState.matchOver;
      say(text, 0, "match-toast match-over");
    });
    c.on("peerLeft", (m) => {
      const me = host.wallet.current.status === "connected" ? host.wallet.current.address : null;
      if (m.roomId !== currentRoom || m.wallet === me) return;
      // Said out loud on the board, so a player never wonders why the other body stopped.
      const el = document.createElement("div");
      el.className = "match-toast";
      el.setAttribute("role", "status");
      const who = shortAddress(m.wallet);
      el.textContent = m.graceSeconds && m.graceSeconds > 0
        ? host.t.arenaState.peerLeftGrace.replace("{player}", who).replace("{s}", String(m.graceSeconds))
        : host.t.arenaState.peerLeft.replace("{player}", who);
      (document.fullscreenElement ?? document.body).append(el);
      setTimeout(() => el.remove(), 9000);
    });
    c.on("botsJoining", (m) => {
      if (!testNetwork) return;
      setText(createMsg, fill(t.bots.joining, { id: m.roomId, paid: m.paid, free: m.free }));
      // The bots join on the network one after the other: look a few times.
      [2500, 6000, 12000].forEach((ms) => setTimeout(() => void host.refreshRooms(), ms));
    });
    c.on("faucetDone", (m) => {
      if (!testNetwork || !faucetBtn || !faucetMsg) return;
      faucetBtn.disabled = false;
      setText(faucetMsg, fill(t.faucet.done, { sol: host.sol(BigInt(m.sol)), unit: host.unitSol, goshi: formatAmount(BigInt(m.goshi), { locale: host.locale }), goshiUnit: host.unitGoshi }));
      void host.refreshBalances();
    });
    c.on("entered", (m) => {
      setText(lobbyEl, fill(t.room.role, { role: m.role === "saboteur" ? host.t.result.saboteur : m.role }));
    });
    c.on("lobby", (m) => {
      if (m.roomId !== currentRoom) return;
      lastLobby = m;
      // The pot of a room with an entry: every paid seat's fee, live on the board.
      setLivePot(BigInt(m.entryFee) * BigInt(m.paid.length));
      // What places 1 to 3 would take if it ended now, next to them on the board.
      const fee = BigInt(m.entryFee), n = BigInt(Math.max(2, m.paid.length));
      if (m.mode === "royale") { const p = royalePrizes(fee, BigInt(m.paid.length)); setPodiumPrizes([solBtc(p.first), solBtc(p.second), solBtc(p.third)]); }
      else if (m.mode === "vs") { const p = vsPrizes(fee, n); setPodiumPrizes([solBtc(p.winner), solBtc(p.loser), solBtc(p.loser)]); }
      else setPodiumPrizes([solBtc(duelPrize(fee, n).winner)]);
      showLobbyView();
      if (m.state === "waiting") {
        setText(lobbyEl, fill(m.mode === "vs" ? t.lobby.vsWaiting : t.lobby.waiting, { id: m.roomId, paid: m.paid.length, free: m.free.length }));
      } else {
        setText(lobbyEl, fill(t.lobby.full, { id: m.roomId }));
      }
      void host.refreshRooms();
    });
    c.on("vsOffer", (m) => showVsOffer(c, m.roomId, m.paid, m.expiresInMs));
    c.on("vsStarted", () => { closeVs(); setText(lobbyEl, host.vsText.started); });
    c.on("vsDeclined", () => { closeVs(); setText(lobbyEl, host.vsText.declined); });
    c.on("start", (m) => onStart(c, m));
    c.on("snap", (m) => shell.roomSnap(m));
    c.on("fsnap", (m) => shell.roomFrenzySnap(m));
    c.on("fend", (m) => { lastFend = m; shell.roomFrenzyEnd(m); });
    c.on("passOffer", (m) => showPassOffer(c, m));
    c.on("passTaken", (m) => passHandlers?.taken(m.roomId));
    c.on("end", (m) => onEnd(m));
    c.connect({ prompt });
  }

  function stopClient() {
    const c = client;
    client = null;
    // Disconnecting forgets the login: the next person to connect must sign.
    if (clientAddress) sessions.clear(clientAddress);
    clientAddress = null;
    signinBtn.hidden = true;
    c?.close();
    compatible = true;
    closeVs();
    lastLobby = null;
    shell.roomLobby(null);
    setText(serverStatus, t.server.needWallet);
    if (faucetBox) faucetBox.hidden = true;
  }

  // ------------------------------------------------------------------ the VS offer

  function closeVs() {
    if (vsTimer) clearInterval(vsTimer);
    vsTimer = null;
    if (vsDialog.open) vsDialog.close();
  }

  function showVsOffer(c: ServerClient, roomId: string, paid: number, expiresInMs: number) {
    const deadline = Date.now() + expiresInMs;
    setText($("play-vs-text"), fill(host.vsText.text, { id: roomId, paid }));
    const count = $("play-vs-count");
    const tick = () => {
      const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setText(count, fill(host.vsText.countdown, { s }));
      if (s <= 0) closeVs();
    };
    tick();
    if (vsTimer) clearInterval(vsTimer);
    vsTimer = setInterval(tick, 500);
    const answer = (accept: boolean) => {
      c.vs(roomId, accept);
      setText(lobbyEl, accept ? host.vsText.accepted : host.vsText.declined);
      closeVs();
    };
    $("play-vs-accept").onclick = () => answer(true);
    $("play-vs-decline").onclick = () => answer(false);
    if (!vsDialog.open) vsDialog.showModal();
  }

  // ------------------------------------------------------------------ start, snapshots (the arena is arena-shell.ts)

  /** The waiting room view of the arena panel: seats, time waited, the VS timer and the buttons. */
  function showLobbyView() {
    const m = lastLobby;
    if (!m || m.roomId !== currentRoom || m.state !== "waiting") { shell.roomLobby(null); return; }
    shell.roomLobby({
      roomId: m.roomId,
      paid: m.paid,
      free: m.free,
      waitedMs: m.waitedMs,
      mode: m.mode,
      you: host.wallet.current.status === "connected" ? host.wallet.current.address : null,
      canFill: testNetwork && host.cluster === "devnet" && (devBotsFlag ?? true),
      network: host.cluster === "devnet" ? "Devnet" : host.cluster === "testnet" ? "Testnet" : "mainnet",
      onFill: () => { if (currentRoom) live.fillWithBots(currentRoom); },
      short: shortAddress,
    });
  }

  function onStart(c: ServerClient, m: Start) {
    currentRoom = m.roomId;
    closeVs();
    shell.roomStart(m, c);
  }

  function onEnd(m: End) {
    setLivePot(null);
    setPodiumPrizes(null);
    document.querySelectorAll(".match-over").forEach((n) => n.remove());
    // The result card lives outside the full screen board: leave full screen so it is on screen, not behind a still board.
    window.dispatchEvent(new Event("goshi-leave-fs"));
    lastLobby = null;
    shell.roomLobby(null);
    shell.roomEnd(m, () => showResult(m));
    void host.refreshRooms();
    void host.refreshBalances();
    // The payout lands a moment after the end message.
    setTimeout(() => void host.refreshBalances(), 5000);
  }

  // ------------------------------------------------------------------ result

  const PASS_WAIT_MS = 3000;
  let summaryEl: HTMLElement | null = null;
  let passTimer: ReturnType<typeof setTimeout> | null = null;
  let offerShown = false;
  let passClock: ReturnType<typeof setInterval> | null = null;

  /** Hides (or shows) the prize line and the buttons of the summary while a pass offer may still arrive. */
  function passWait(summary: HTMLElement, hide: boolean) {
    summary.querySelectorAll<HTMLElement>(".result-prize, .result-actions").forEach((el) => { el.hidden = hide; });
  }

  /** The prominent card: take the tenth seat of a higher room, for free, before the time runs out. */
  function showPassOffer(c: ServerClient, m: Extract<ServerMsg, { t: "passOffer" }>) {
    offerShown = true;
    if (passTimer) clearTimeout(passTimer);
    const slot = summaryEl?.querySelector<HTMLElement>(".result-pass-slot") ?? resultBody;
    if (resultEl.hidden) resultEl.hidden = false;
    const usd = usdText(m.tierUsd, host.locale);
    const deadline = Date.now() + m.expiresInMs;
    const title = node("h3", { class: "pass-title", text: fill(t.result.passTitle, { usd, paid: m.paid }) });
    const text = node("p", { text: t.result.passText });
    const clock = node("p", { class: "pass-clock", attrs: { role: "timer" } });
    const state = node("p", { class: "play-msg", attrs: { role: "status", "aria-live": "polite" } });
    const accept = node("button", { class: "btn btn-gold btn-lg", text: t.result.passAccept, attrs: { type: "button" } });
    const card = node("div", { class: "pass-card" }, [title, text, clock, accept, state]);
    slot.replaceChildren(card);
    const finish = (message: string, ok: boolean) => {
      if (passClock) clearInterval(passClock);
      passClock = null;
      accept.hidden = true;
      clock.hidden = true;
      state.textContent = message;
      if (!ok && summaryEl) passWait(summaryEl, false);
    };
    const tick = () => {
      const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      clock.textContent = fill(t.result.passIn, { s });
      if (s <= 0) finish(t.result.passGone, false);
    };
    tick();
    passClock = setInterval(tick, 250);
    accept.addEventListener("click", () => {
      accept.disabled = true;
      state.textContent = t.result.passTaking;
      if (!c.acceptPass(m.roomId)) { accept.disabled = false; state.textContent = t.create.needServer; }
    });
    passHandlers = {
      taken: (roomId) => {
        finish(t.result.passDone, true);
        void host.refreshRooms();
        enter(roomId);
      },
      gone: () => finish(t.result.passGone, false),
    };
  }
  let passHandlers: { taken(roomId: string): void; gone(): void } | null = null;

  let lastFend: Extract<ServerMsg, { t: "fend" }> | null = null;

  /** The "verify this match" card: one button, five checks, all done in this browser. */
  function proofBlock(m: End, wallet: string): HTMLElement {
    const pr = t.proof;
    const box = node("div", { class: "proof-box" });
    const out = node("ul", { class: "result-list plain" });
    const btn = node("button", { class: "btn btn-glass btn-sm", text: pr.button, attrs: { type: "button" } }) as HTMLButtonElement;
    const http = host.settings.serverUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = pr.running;
      const steps = await verifyMatch({
        serverHttp: http, rpcUrl: host.settings.rpcUrl ?? "https://api.devnet.solana.com", roomId: m.roomId, wallet,
        proof: m.proof!, claimedMass: lastFend && lastFend.roomId === m.roomId ? lastFend.mass : null, tx: m.tx,
      });
      out.replaceChildren(...steps.map((s) => node("li", {
        class: s.ok === true ? "me" : "",
        text: `${s.ok === true ? "✓" : s.ok === false ? "✗" : "–"} ${pr.steps[s.id]}: ${s.ok === true ? pr.ok : s.ok === false ? pr.bad : pr.unknown}${s.ok !== true && s.detail ? ` (${s.detail})` : ""}`,
      })));
      btn.textContent = pr.button;
      btn.disabled = false;
    });
    const link = node("a", { class: "btn btn-glass btn-sm", text: pr.download, attrs: { href: `${http}/replay/${encodeURIComponent(m.roomId)}/arena`, rel: "noopener noreferrer", download: `goshi-${m.roomId}-arena.bin` } });
    box.append(node("h4", { text: pr.h }), node("p", { class: "play-msg", text: pr.text }), btn, link, out);
    return box;
  }

  function showResult(m: End) {
    const mine = host.wallet.current.status === "connected" ? host.wallet.current.address : "";
    const name = (w: string) => (w === mine ? `${shortAddress(w)} (${youWord(mine, t.game.you)})` : shortAddress(w));
    const lam = (v: string) => `${host.sol(BigInt(v))} ${host.unitSol}`;
    const kids: Node[] = [];
    const podiumWallets = m.payout.podium.map((p) => p.w);
    // The summary first: place, mass, eliminations, the prize line and what to do next.
    const stats = shell.stats();
    // Saboteurs do not compete: places and the field size count the paid players only.
    const paidRanking = m.ranking.filter((r) => r.role !== "saboteur");
    const mineIdx = paidRanking.findIndex((r) => r.w === mine);
    const mineRaw = m.ranking.find((r) => r.w === mine);
    const mineRank = mineRaw ? { ...mineRaw, rank: mineIdx >= 0 ? mineIdx + 1 : mineRaw.rank } : undefined;
    const fieldSize = m.mode === "vs" ? m.ranking.length : Math.max(1, paidRanking.length);
    const mySab = (m.payout.saboteurs ?? []).find((s) => s.w === mine);
    const onPodium = podiumWallets.includes(mine);
    const actions = {
      again: () => host.quickActions.again(),
      change: () => host.quickActions.change(),
      practice: () => { shell.clear(); shell.startPractice(); },
      leave: () => host.quickActions.leave(),
    };
    if (mineRank && mySab) {
      // A saboteur does not compete: its share is the line, not a place.
      kids.push(buildSummary({
        t: t.result, rank: mineRank.rank, of: fieldSize, mass: 0, kills: 0, hideStats: true,
        headline: fill(t.result.saboteurShare, { amount: host.sol(BigInt(mySab.lamports)), unit: host.unitSol }),
        note: t.result.saboteurNoPodium,
        prize: null, actions,
      }));
    } else if (mineRank) {
      const summary = buildSummary({
        t: t.result, rank: mineRank.rank, of: fieldSize, mass: stats?.mass || mineRank.score, kills: stats?.kills ?? 0,
        extra: dailyAndShare({
          t: t.result, rank: mineRank.rank, of: fieldSize, mass: stats?.peak || mineRank.score, url: location.origin,
          massLabel: t.result.yourMass, placeLabel: fill(t.result.placeOf, { rank: mineRank.rank, n: fieldSize }),
        }),
        prize: onPodium ? { kind: "sent", href: m.tx ? explorerTxUrl(host.explorerCluster, m.tx) : null } : { kind: "none" },
        actions,
      });
      kids.push(summary);
      // A podium player may be offered a pass a moment after the end: the prize line and the usual buttons wait 3 seconds.
      summaryEl = summary;
      if (onPodium && m.mode === "royale") {
        passWait(summary, true);
        if (passTimer) clearTimeout(passTimer);
        passTimer = setTimeout(() => { if (!offerShown) passWait(summary, false); }, PASS_WAIT_MS);
      }
    }
    kids.push(node("p", { class: "result-lead", text: podiumWallets.includes(mine) ? t.result.inTop : t.result.notInTop }));

    kids.push(node("h4", { text: t.result.winners }));
    kids.push(node("ul", { class: "result-list plain" }, m.payout.podium.map((p) => {
      const how = p.kind === "sol"
        ? `${lam(p.lamports)}`
        : `${lam(p.lamports)} ${fill(t.result.goshi, { goshi: host.unitGoshi })}`;
      return node("li", { class: p.w === mine ? "me" : "", text: `${t.result.place[Math.min(2, Math.max(0, p.rank - 1))]}: ${name(p.w)}, ${how}` });
    })));

    kids.push(node("h4", { text: t.result.ranking }));
    kids.push(node("ol", { class: "result-list" }, m.ranking.map((r) => node("li", {
      class: r.w === mine ? "me" : "",
      text: `${name(r.w)}${r.role === "saboteur" ? ` (${t.result.saboteur})` : ""}: ${fill(t.result.score, { n: Math.round(r.score * 10) / 10 })}`,
    }))));

    kids.push(node("h4", { text: t.result.payout }));
    const rows: [string, string][] = [
      [host.potLabels.pot, lam(m.payout.pot)],
      [host.potLabels.rake, lam(m.payout.rake)],
      [t.result.unclaimed, lam(String((m.payout.saboteurs ?? []).reduce((a, x) => a + BigInt(x.lamports), 0n)))],
    ];
    kids.push(node("dl", { class: "play-dl play-dl-lines" }, rows.map(([label, v], i) => node("div", { class: i === 0 ? "total" : "" }, [node("dt", { text: label }), node("dd", { text: v })]))));

    const jp = m.payout.jackpot;
    kids.push(node("p", { class: "play-msg", text: jp.triggered ? fill(t.result.jackpotYes, { amount: formatAmount(BigInt(jp.amount), { locale: host.locale }), goshi: host.unitGoshi }) : t.result.jackpotNo }));

    if (m.tx) {
      kids.push(node("p", {}, [node("a", { text: fill(t.result.viewTx, { cluster: host.cluster }), attrs: { href: explorerTxUrl(host.explorerCluster, m.tx), rel: "noopener noreferrer" } })]));
    } else {
      kids.push(node("p", { class: "play-msg", text: t.result.noTx }));
    }
    if (m.error) kids.push(node("p", { class: "play-error", text: fill(t.result.error, { message: m.error }), attrs: { role: "alert" } }));
    if (m.proof && mine && m.proof.replays.some((r) => r.w === mine)) kids.push(proofBlock(m, mine));

    resultBody.replaceChildren(...kids);
    resultEl.hidden = false;
    resultEl.focus({ preventScroll: true });
    resultEl.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
  }
  $("play-result-close").addEventListener("click", () => shell.clear());

  // ------------------------------------------------------------------ actions

  function ready(): ServerClient | null {
    if (!client || !client.isReady || !compatible) {
      // The wallet is connected but this browser has not signed in to the game server yet: the person just clicked an
      // action, so asking for the one free signature now is expected. Say so instead of "not connected".
      if (client && compatible && !signinBtn.hidden) {
        showError(t.server.signinNeeded);
        signinBtn.hidden = true;
        signFailedShown = false;
        client.signIn();
        return null;
      }
      showError(t.create.needServer);
      return null;
    }
    showError("");
    return client;
  }

  function enter(roomId: string) {
    // The server connection may still be logging in: remember the room and enter as soon as it is ready.
    if (!client || !client.isReady || !compatible) { pendingEnter = roomId; return; }
    const c = client;
    currentRoom = roomId;
    enterTries = 0;
    host.log("entering room", roomId);
    setText(lobbyEl, fill(t.lobby.entering, { id: roomId }));
    shell.roomEntering(roomId, c);
    c.watch(roomId);
    c.enter(roomId);
  }

  signinBtn.addEventListener("click", () => {
    signinBtn.hidden = true;
    signFailedShown = false;
    client?.signIn();
  });

  createBtn.addEventListener("click", () => {
    // Opening a room costs the player nothing: the notice is accepted in the window that takes the seat.
    const c = ready();
    if (!c) return;
    const fee = document.querySelector<HTMLInputElement>('input[name="play-fee"]:checked')?.value;
    if (!fee) { showError(t.create.needServer); return; }
    createLink.hidden = true;
    createBtn.disabled = true;
    setText(createMsg, t.create.creating);
    if (!c.createRoom(BigInt(fee))) {
      createBtn.disabled = false;
      setText(createMsg, "");
      showError(t.create.needServer);
    }
  });

  faucetBtn?.addEventListener("click", () => {
    if (!testNetwork) return;
    const c = ready();
    if (!c || !faucetBtn || !faucetMsg) return;
    faucetBtn.disabled = true;
    setText(faucetMsg, t.faucet.asking);
    if (!c.faucet()) faucetBtn.disabled = false;
  });

  const live: Live = {
    walletChanged(s, opts) {
      if (s.status === "connected") {
        // Another account in the same wallet: the old login is not valid for it.
        if (client && clientAddress && clientAddress !== s.address) stopClient();
        void startClient(s, opts?.userInitiated === true);
      } else if (s.status === "disconnected") stopClient();
    },
    devBots: () => testNetwork && host.cluster === "devnet" && (devBotsFlag ?? true),
    fillWithBots(roomId) {
      if (!testNetwork) return;
      const c = ready();
      if (!c) return;
      const room = host.rooms().find((r) => r.roomId.toString() === roomId);
      const seen = lastLobby && lastLobby.roomId === roomId ? lastLobby : null;
      const paid = seen ? seen.paid.length : (room?.paid.length ?? 0);
      const free = seen ? seen.free.length : (room?.free.length ?? 0);
      // Fill every free seat: the bots are the server's own funded wallets.
      c.fillWithBots(roomId, Math.max(0, 10 - paid), Math.max(0, 3 - free));
    },
    openGame: enter,
    resume(roomId) {
      if (currentRoom === roomId && shell.source === "room") return;
      enter(roomId);
    },
    joined(roomId) {
      enter(roomId);
    },
    async createDuel(fee, guests) {
      for (let k = 0; k < 15 && !client; k++) await new Promise((r) => setTimeout(r, 200));
      return new Promise((resolve, reject) => {
        const c = client;
        if (!c) { reject(new Error("server")); return; }
        const offs: (() => void)[] = [];
        let timer: ReturnType<typeof setTimeout> | null = null;
        const done = (fn: () => void) => { offs.forEach((o) => o()); if (timer) clearTimeout(timer); fn(); };
        offs.push(c.on("duelTx", (m) => done(() => resolve({ roomId: m.roomId, tx: m.tx, players: m.players }))));
        offs.push(c.on("error", (m) => done(() => reject(new Error(serverErr(m))))));
        offs.push(c.on("signinNeeded", () => done(() => reject(new Error("signin")))));
        const go = () => { if (!c.createDuel(fee, guests)) done(() => reject(new Error("server"))); };
        if (c.isReady) go();
        else {
          offs.push(c.on("status", ({ status }) => { if (status === "ready") go(); else if (status === "closed") done(() => reject(new Error("server"))); }));
          timer = setTimeout(() => done(() => reject(new Error("server"))), 20_000);
        }
      });
    },
    startDuel(roomId) {
      client?.startDuel(roomId);
    },
    faucet() {
      return new Promise<void>((resolve) => {
        const c = client;
        if (!c || !c.isReady || !testNetwork) { resolve(); return; }
        const offs: (() => void)[] = [];
        const done = () => { offs.forEach((o) => o()); clearTimeout(timer); resolve(); };
        const timer = setTimeout(done, 25_000);
        offs.push(c.on("faucetDone", done));
        offs.push(c.on("error", done));
        if (!c.faucet()) done();
      });
    },
    async quick(fee) {
      // The server connection is created a moment after the wallet connects.
      for (let k = 0; k < 15 && !client; k++) await new Promise((r) => setTimeout(r, 200));
      return new Promise((resolve, reject) => {
        const c = client;
        if (!c) { reject(new Error("server")); return; }
        const offs: (() => void)[] = [];
        let timer: ReturnType<typeof setTimeout> | null = null;
        const done = (fn: () => void) => { offs.forEach((o) => o()); if (timer) clearTimeout(timer); fn(); };
        offs.push(c.on("quickRoom", (m) => done(() => resolve({ roomId: m.roomId, created: m.created, paid: m.paid }))));
        offs.push(c.on("error", (m) => done(() => reject(new Error(serverErr(m))))));
        offs.push(c.on("signinNeeded", () => done(() => reject(new Error("signin")))));
        const go = () => { if (!c.quick(fee)) done(() => reject(new Error("server"))); };
        if (c.isReady) go();
        else {
          offs.push(c.on("status", ({ status }) => { if (status === "ready") go(); else if (status === "closed") done(() => reject(new Error("server"))); }));
          timer = setTimeout(() => done(() => reject(new Error("server"))), 20_000);
        }
      });
    },
  };
  return live;
}
