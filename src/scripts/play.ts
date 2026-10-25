// Client side of the on-chain games page. Loaded only when site.play is enabled.
// The Anchor client (and web3.js with it) is imported lazily, the first time the page needs the network.
// Everything shown comes from textContent, never from HTML strings, so no value can inject markup.
import { chooseRegion, regionOfRoom } from "../lib/play/region.ts";
import { Buffer } from "buffer";
import { formatAmount, formatLamports } from "../lib/play/amounts.ts";
import { royalePot, settleRoyale, settleVs } from "../lib/play/split.ts";
import { canJoinFree, canJoinPaid, hasJoined, isPaidPlayer, isSaboteur, roomPot, type RoomState, type RoomView } from "../lib/play/rooms.ts";
import { PlayError, classifyError, type ErrorKind } from "../lib/play/errors.ts";
import { explorerTxUrl, shortAddress, type Cluster } from "../lib/play/config.ts";
import { fill, node } from "../lib/play/dom.ts";
import { isMobileDevice, mobileWalletLinks, shouldOfferMobileLinks } from "../lib/play/mobile.ts";
import { WALLET_IDS, isInstalled, type WalletId, type WalletState } from "../lib/play/wallet.ts";
import { disconnectWallet, manager as wallet, restoreWallet, subscribe } from "../lib/play/wallet-session.ts";
import type { ChainConfig, PlayClient, SendCallbacks } from "../lib/play/client.ts";
import type { Live } from "./play-live.ts";
import { getShell } from "./arena-shell.ts";
import { fetchFeeOptions } from "../lib/play/fee-options.ts";
import { SpendGuard, feeLabel, solText, usdText, type FeeOption } from "../lib/play/quick.ts";
import type { PlayCopy } from "../content/types.ts";
import { startPlayFocus } from "./play-focus.ts";
import { mountBoostSetup } from "./boost-placement.ts";
import { setYouLabel } from "../lib/play/you-marker.ts";
import { youWord, enableStaffLabels } from "../lib/play/staff.ts";
import { needsWalletBrowser, phantomLink, solflareLink } from "../lib/play/deeplink.ts";
import { duelPrize, royalePrizes, vsPrizes } from "../lib/play/prizes.ts";
import { setLeadStrings } from "../lib/play/lead-strings.ts";

interface Data {
  locale: string;
  mainnet: boolean;
  cluster: Cluster;
  explorerCluster: Cluster;
  symbol: string;
  unitSol: string;
  unitGoshi: string;
  settings: ConstructorParameters<typeof PlayClient>[0] & { serverUrl: string; liveUrl?: string; regions?: { id: string; url: string }[]; regionSlot?: number };
  walletNames: Record<WalletId, string>;
  homeHref: string;
  t: {
    quick: PlayCopy["quick"];
    duel: PlayCopy["duel"];
    wallet: PlayCopy["wallet"];
    rooms: PlayCopy["rooms"];
    pot: { room: string; unavailable: string };
    entry: PlayCopy["entry"];
    vsOffer: PlayCopy["vsOffer"];
    gate: { required: string };
    tx: PlayCopy["tx"];
    errors: Record<ErrorKind, string>;
    exact: PlayCopy["exact"];
    live: PlayCopy["live"];
    potLabels: Record<"first" | "second" | "third" | "burn" | "infra" | "liquidity" | "jackpot" | "pot" | "rake" | "prizePool", string>;
  };
}

const dataEl = document.getElementById("play-data");
if (dataEl && document.getElementById("play-main")) void boot(JSON.parse(dataEl.textContent ?? "{}") as Data);

async function boot(d: Data) {
  const t = d.t;
  // One game server per region: everything on this page (rooms, duels, practice) talks to the one chosen here.
  const regions = d.settings.regions ?? [];
  if (regions.length > 1) {
    const qs = new URLSearchParams(location.search);
    const slot = await chooseRegion(regions, qs.get("duel") ?? qs.get("room"));
    d.settings.serverUrl = regions[slot].url;
    d.settings.regionSlot = slot;
  }
  startPlayFocus(t.live.arenaState.showAll);
  { const a = t.live.arenaState; mountBoostSetup({ boost: a.boostWord, left: a.boostLeft, right: a.boostRight, bigger: a.boostBigger, smaller: a.boostSmaller }); }
  enableStaffLabels(d.cluster === "mainnet-beta");
  setYouLabel(t.live.game.you);
  setLeadStrings({ top: t.live.arenaState.leadTop, youLead: t.live.arenaState.leadYou, youBehind: t.live.arenaState.leadBehind });
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const sol = (lamports: bigint) => formatLamports(lamports, { locale: d.locale });
  const withSol = (lamports: bigint) => `${sol(lamports)} ${d.unitSol}`;
  const goshi = (units: bigint) => `${formatAmount(units, { locale: d.locale })} ${d.unitGoshi}`;
  const networkName = d.cluster === "mainnet-beta" ? "mainnet" : d.cluster === "testnet" ? "Testnet" : "Devnet";
  const log = (...a: unknown[]) => console.info("[goshi]", ...a);
  /** The plain sentence for a failure, with the exact amounts when the error carries them. */
  function errText(kind: ErrorKind, data?: Record<string, string>): string {
    if (kind === "insufficientSol" && data?.need) {
      return fill(t.exact.insufficientSol, {
        need: sol(BigInt(data.need)), fee: sol(BigInt(data.fee)), network: sol(BigInt(data.network)), have: sol(BigInt(data.have)), unit: d.unitSol,
      });
    }
    if (kind === "notEnoughGoshi" && data?.min) {
      return fill(t.exact.notEnoughGoshi, { min: formatAmount(BigInt(data.min), { locale: d.locale }), have: formatAmount(BigInt(data.have), { locale: d.locale }), unit: d.unitGoshi });
    }
    return fill(t.errors[kind], { unit: d.unitGoshi, network: networkName });
  }

  // ------------------------------------------------------------------ state
  let clientPromise: Promise<PlayClient> | null = null;
  let rooms: RoomView[] = [];
  /** The rooms shown in the list: every room except the private duels. */
  let publicRooms: RoomView[] = [];
  /** The test bots of the server (devnet only), to say how many seats of a room are people. */
  let botSet = new Set<string>();
  let selected: bigint | null = null;
  let accepted = false;
  let busy = false;
  let firstLoad = true;
  let chain: ChainConfig | null = null;
  let goshiBalance: bigint | null = null;

  const getClient = (): Promise<PlayClient> => {
    clientPromise ??= (async () => {
      // web3.js and Anchor expect a global Buffer in the browser.
      (globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;
      const { PlayClient } = await import("../lib/play/client.ts");
      return new PlayClient(d.settings);
    })().catch((e) => {
      clientPromise = null;
      throw e;
    });
    return clientPromise;
  };

  let live: Live | null = null;
  let pendingEnter: string | null = null;
  // Quick match: entry options (from the server's hello), the session spend guard, and a click waiting for the wallet.
  let feeOptions: FeeOption[] = [];
  let pendingQuick: number | null = null;
  let lastQuick = 0;
  let quickBusy = false;
  let spend: SpendGuard;
  try { spend = new SpendGuard(window.sessionStorage); } catch { spend = new SpendGuard(null); }
  let liveLoading: Promise<void> | null = null;
  let lastWalletStatus: WalletState["status"] = "disconnected";
  const me = () => (wallet.current.status === "connected" ? wallet.current.address : null);

  // ------------------------------------------------------------------ elements
  const walletChoose = $("play-wallet-choose");
  const walletConnected = $("play-wallet-connected");
  const walletMsg = $("play-wallet-msg");
  const walletHelp = $<HTMLAnchorElement>("play-wallet-help");
  const roomList = $<HTMLUListElement>("play-room-list");
  const roomsMsg = $("play-rooms-msg");
  const updatedEl = $("play-updated");
  const gateBox = $<HTMLInputElement>("play-gate-check");
  const gateMsg = $("play-gate-msg");
  const gateFieldset = $("play-gate");
  const txMsg = $("play-tx-msg");
  const txSpin = $("play-tx-spin");
  const txErr = $("play-tx-error");
  const txLink = $<HTMLAnchorElement>("play-tx-link");
  const entryDialog = $<HTMLDialogElement>("play-entry");
  const setText = (el: HTMLElement, text: string) => { el.textContent = text; };

  // ------------------------------------------------------------------ acceptance gate
  // The notice is accepted once: the choice is remembered on this device so it is not asked on every visit.
  const GATE_KEY = "goshi-gate-v1";
  try {
    if (localStorage.getItem(GATE_KEY) === "1") { gateBox.checked = true; accepted = true; }
  } catch { /* private mode */ }
  // On a test network the person must also confirm that the wallet is on that network (the usual cause of a "malicious dApp"
  // or "Simulation failed" screen in Phantom). It is remembered on this device.
  const NET_KEY = `goshi-net-${d.cluster}-v1`;
  const netBox = document.getElementById("play-gate-net") as HTMLInputElement | null;
  try {
    if (netBox && localStorage.getItem(NET_KEY) === "1") netBox.checked = true;
  } catch { /* private mode */ }
  netBox?.addEventListener("change", () => {
    try { if (netBox.checked) localStorage.setItem(NET_KEY, "1"); else localStorage.removeItem(NET_KEY); } catch { /* private mode */ }
    gateFieldset.classList.remove("needs");
    setText(gateMsg, "");
  });
  gateBox.addEventListener("change", () => {
    accepted = gateBox.checked;
    try { if (accepted) localStorage.setItem(GATE_KEY, "1"); else localStorage.removeItem(GATE_KEY); } catch { /* private mode */ }
    gateFieldset.classList.remove("needs");
    setText(gateMsg, "");
  });
  function gateOk(): boolean {
    if (accepted && netBox && !netBox.checked) {
      gateFieldset.classList.add("needs");
      const msg = gateMsg.dataset.netRequired ?? t.gate.required;
      setText(gateMsg, msg);
      fail("gate", msg);
      netBox.focus();
      return false;
    }
    if (accepted) return true;
    gateFieldset.classList.add("needs");
    setText(gateMsg, t.gate.required);
    fail("gate", t.gate.required);
    gateBox.focus();
    return false;
  }

  // ------------------------------------------------------------------ transaction status
  type TxState = "idle" | "signing" | "sent" | "confirmed" | "unconfirmed" | "failed";
  function setTx(state: TxState, signature?: string, reason?: string) {
    setText(txMsg, t.tx[state]);
    txSpin.hidden = !(state === "signing" || state === "sent");
    txErr.hidden = state !== "failed" || !reason;
    setText(txErr, state === "failed" && reason ? reason : "");
    if (signature) {
      txLink.href = explorerTxUrl(d.explorerCluster, signature);
      setText(txLink, fill(t.tx.view, { cluster: d.cluster }));
      txLink.hidden = false;
    } else {
      txLink.hidden = true;
    }
  }
  function say(message: string) {
    setText(txMsg, message);
    txSpin.hidden = true;
    txErr.hidden = true;
    txLink.hidden = true;
  }
  type Step = keyof PlayCopy["tx"]["steps"];
  const retryBtn = $<HTMLButtonElement>("play-tx-retry");
  let retryAction: (() => void) | null = null;
  retryBtn.addEventListener("click", () => { const a = retryAction; retryAction = null; retryBtn.hidden = true; a?.(); });
  /**
   * Every failure ends here: the transaction status area says which step failed and why, in plain words,
   * and the same details go to the console for debugging.
   */
  function fail(step: Step, message: string, opts: { signature?: string; retry?: () => void; detail?: unknown } = {}) {
    log("failed at", step, message, opts.detail ?? "");
    setText(txMsg, fill(t.tx.failedAt, { step: t.tx.steps[step] }));
    txSpin.hidden = true;
    txErr.hidden = false;
    setText(txErr, message);
    if (opts.signature) {
      txLink.href = explorerTxUrl(d.explorerCluster, opts.signature);
      setText(txLink, fill(t.tx.view, { cluster: d.cluster }));
      txLink.hidden = false;
    } else txLink.hidden = true;
    retryAction = opts.retry ?? null;
    retryBtn.hidden = !opts.retry;
    $("play-tx-panel").scrollIntoView({ behavior: "auto", block: "nearest" });
  }
  /** Which step a failure belongs to. */
  const stepOf = (kind: ErrorKind): Step => {
    switch (kind) {
      case "roomGone": case "notWaiting": case "wrongConfig": return "room";
      case "roomFull": case "alreadyJoined": return "seat";
      case "insufficientSol": return "balance";
      case "notEnoughGoshi": case "noTokenAccount": return "saboteur";
      case "rejected": case "wrongNetwork": return "sign";
      case "network": case "rateLimited": case "expired": return "network";
      case "noWallet": case "walletBlocked": return "wallet";
      default: return "simulate";
    }
  };

  function setBusy(on: boolean) {
    busy = on;
    document.querySelectorAll<HTMLElement>("[data-join], [data-join-free]").forEach((b) => b.setAttribute("aria-disabled", String(on)));
  }

  async function runTx(send: (cb: SendCallbacks) => Promise<string>, retry?: () => void): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    retryBtn.hidden = true;
    log("sending transaction");
    setTx("signing");
    let signature: string | undefined;
    try {
      signature = await send({
        onSubmitted: (s) => {
          signature = s;
          setTx("sent", s);
        },
      });
      log("confirmed", signature);
      setTx("confirmed", signature);
      void refreshAll();
      return true;
    } catch (err) {
      const kind = classifyError(err);
      const sig = (err instanceof PlayError && err.signature) || signature;
      const data = err instanceof PlayError ? err.data : undefined;
      if (sig && (kind === "network" || kind === "expired")) {
        log("unconfirmed", sig, err);
        setTx("unconfirmed", sig);
      } else {
        fail(stepOf(kind), errText(kind, data), { signature: sig, detail: err, retry: kind === "network" || kind === "rateLimited" || kind === "expired" ? retry : undefined });
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------ the pre-entry modal
  const entryOk = $("play-entry-ok");
  const entryAccept = $<HTMLInputElement>("play-entry-accept");
  const entryMsg = $("play-entry-msg");
  function confirmEntry(title: string, text: string, lines: { label: string; value: string; total?: boolean }[], isFree: boolean): Promise<boolean> {
    setText($("play-entry-title"), title);
    setText($("play-entry-text"), text);
    $("play-entry-lines").replaceChildren(
      ...lines.map((l) => node("div", { class: l.total ? "total" : "" }, [node("dt", { text: l.label }), node("dd", { text: l.value })])),
    );
    entryDialog.querySelector<HTMLElement>(".entry-saboteurs")!.dataset.free = String(isFree);
    // Read once per browser session: the person already understood it, do not make them tick it before every seat.
    let understood = false;
    try { understood = sessionStorage.getItem("goshi-entry-v1") === "1"; } catch { /* private mode */ }
    entryAccept.checked = understood;
    // Everything to accept is in this one window: the notice of the page (age, local law, test network) is ticked here too
    // when it was not ticked yet, so nobody has to hunt for a box further down the page.
    const gateWrap = document.getElementById("play-entry-gate-wrap");
    const gateHere = document.getElementById("play-entry-gate") as HTMLInputElement | null;
    const needGate = !accepted || (netBox !== null && !netBox.checked);
    if (gateWrap && gateHere) {
      gateWrap.hidden = !needGate;
      gateHere.checked = false;
      const netText = netBox ? ` ${document.querySelector("#play-gate .gate-check:nth-of-type(2) span")?.textContent ?? ""}` : "";
      setText(document.getElementById("play-entry-gate-text")!, `${document.querySelector("#play-gate .gate-check span")?.textContent ?? ""}${netText}`);
    }
    const ready = () => entryAccept.checked && (!needGate || !!gateHere?.checked);
    entryOk.setAttribute("aria-disabled", String(!ready()));
    setText(entryMsg, "");
    return new Promise<boolean>((resolve) => {
      const cancel = $("play-entry-cancel");
      let settled = false;
      const finish = (answer: boolean) => {
        if (settled) return;
        settled = true;
        entryOk.removeEventListener("click", onOk);
        cancel.removeEventListener("click", onCancel);
        entryAccept.removeEventListener("change", onAccept);
        entryDialog.removeEventListener("cancel", onCancel);
        entryDialog.removeEventListener("close", onCancel);
        if (entryDialog.open) entryDialog.close();
        resolve(answer);
      };
      // The confirm button only works after the box is ticked. It stays focusable and says why.
      const onOk = () => {
        if (!ready()) { setText(entryMsg, t.entry.mustAccept); (entryAccept.checked ? gateHere : entryAccept)?.focus(); return; }
        if (needGate) {
          for (const g of [gateBox, netBox]) if (g && !g.checked) { g.checked = true; g.dispatchEvent(new Event("change", { bubbles: true })); }
        }
        try { sessionStorage.setItem("goshi-entry-v1", "1"); } catch { /* private mode */ }
        finish(true);
      };
      const onCancel = () => finish(false);
      const onAccept = () => {
        entryOk.setAttribute("aria-disabled", String(!ready()));
        if (ready()) setText(entryMsg, "");
      };
      gateHere?.addEventListener("change", onAccept);
      entryOk.addEventListener("click", onOk);
      cancel.addEventListener("click", onCancel);
      entryAccept.addEventListener("change", onAccept);
      entryDialog.addEventListener("cancel", onCancel);
      entryDialog.addEventListener("close", onCancel);
      entryDialog.showModal();
    });
  }

  // ------------------------------------------------------------------ wallet
  /** Brings the connect buttons into view, opening "Advanced options" first on the test site (they live behind it there). */
  function showWallet() {
    const adv = document.getElementById("play-advanced") as HTMLDetailsElement | null;
    if (adv && !adv.open) adv.open = true;
    requestAnimationFrame(() => document.getElementById("play-wallet")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
  // Arrived with #play-wallet (the header button on another page): the wallet must be visible at once.
  if (location.hash === "#play-wallet") showWallet();
  function detectWallets() {
    for (const id of WALLET_IDS) {
      const found = isInstalled(id);
      setText(document.querySelector<HTMLElement>(`[data-wallet-state="${id}"]`)!, found ? t.wallet.detected : t.wallet.missing);
      document.querySelector<HTMLElement>(`[data-install="${id}"]`)!.hidden = found;
    }
  }
  detectWallets();
  // Extensions can inject after the page script runs.
  window.addEventListener("load", detectWallets);

  // Phones: Safari and Chrome have no injected wallet. Offer to open this page in the wallet's own browser instead.
  const mobileBox = $("play-wallet-mobile");
  function updateMobile() {
    const installed = { phantom: isInstalled("phantom"), solflare: isInstalled("solflare") };
    const offer = shouldOfferMobileLinks({
      mobile: isMobileDevice({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, platform: navigator.platform }),
      installed,
      userAgent: navigator.userAgent,
    });
    if (offer) {
      const links = mobileWalletLinks(location.href, location.origin);
      for (const id of WALLET_IDS) document.querySelector<HTMLAnchorElement>(`[data-open-wallet="${id}"]`)!.href = links[id];
    }
    mobileBox.hidden = !offer;
    walletChoose.hidden = offer || wallet.current.status === "connected";
  }
  // Wallet browsers inject their provider a moment after the page starts: wait before deciding, and re-check once.
  window.addEventListener("load", () => { setTimeout(updateMobile, 700); setTimeout(updateMobile, 2500); });

  /** True only while a Connect button click is being handled: that is the one time the login may open the wallet. */
  let userConnect = false;
  document.querySelectorAll<HTMLButtonElement>("[data-connect]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.connect as WalletId;
      detectWallets();
      setText(walletMsg, "");
      walletHelp.hidden = true;
      userConnect = true;
      try {
        await wallet.connect(id);
      } catch (err) {
        const kind = classifyError(err);
        log("connect failed", kind, err);
        setText(walletMsg, errText(kind));
        // A quick refusal is usually the wallet's own warning for a new site: point to its help page.
        walletHelp.hidden = kind !== "walletBlocked";
      } finally {
        userConnect = false;
      }
    }),
  );
  {
    const box = $("play-wallet-connected"), btn = $("play-privacy");
    const apply = (priv: boolean) => { box.dataset.private = priv ? "1" : "0"; btn.textContent = priv ? btn.dataset.show ?? "" : btn.dataset.hide ?? ""; };
    let priv = true;
    try { priv = localStorage.getItem("goshi-show-details") !== "1"; } catch { /* default hidden */ }
    apply(priv);
    btn.addEventListener("click", () => {
      priv = !priv; apply(priv);
      try { localStorage.setItem("goshi-show-details", priv ? "0" : "1"); } catch { /* ignore */ }
    });
  }
  $("play-disconnect").addEventListener("click", () => void disconnectWallet());

  function onWalletChange(s: WalletState) {
    setYouLabel(youWord(s.status === "connected" ? s.address : null, t.live.game.you));
    const connecting = s.status === "connecting";
    document.querySelectorAll<HTMLButtonElement>("[data-connect]").forEach((b) => {
      b.disabled = connecting;
      const id = b.dataset.connect as WalletId;
      setText(b, connecting && s.id === id ? t.wallet.connecting : fill(t.wallet.connectWith, { wallet: d.walletNames[id] }));
    });
    const connected = s.status === "connected";
    walletChoose.hidden = connected;
    walletConnected.hidden = !connected;
    if (s.status === "connected") {
      setText($("play-wallet-who"), fill(t.wallet.connectedWith, { wallet: d.walletNames[s.id] }));
      setText($("play-wallet-address"), s.address);
      setText(walletMsg, fill(t.wallet.announceConnected, { address: shortAddress(s.address) }));
      void refreshBalances();
    } else {
      goshiBalance = null;
      if (lastWalletStatus === "connected") setText(walletMsg, t.wallet.announceDisconnected);
    }
    lastWalletStatus = s.status;
    renderRooms();
    // Read now: the game server code loads a moment later, after the click handler has finished.
    const initiated = userConnect;
    // The game server code is loaded only when a wallet is connected.
    if (s.status === "connected" && !live) {
      liveLoading ??= import("./play-live.ts").then(({ createLive }) => {
        live = createLive({
          cluster: d.cluster, explorerCluster: d.explorerCluster, unitSol: d.unitSol, unitGoshi: d.unitGoshi, locale: d.locale, settings: d.settings,
          t: d.t.live, potLabels: d.t.potLabels, vsText: d.t.vsOffer, wallet,
          sol, goshi, gateOk, rooms: () => rooms, refreshRooms, refreshBalances, isBusy: () => busy, fail: (step, message, retry) => fail(step, message, { retry }), log,
          quickActions: {
            again: () => void startQuick(lastQuick),
            change: () => { getShell()?.clear(); document.getElementById("play-quick")?.scrollIntoView({ behavior: "smooth", block: "center" }); },
            leave: () => { void disconnectWallet().finally(() => { location.href = d.homeHref; }); },
          },
        });
        live.walletChanged(wallet.current, { userInitiated: initiated });
        renderRooms();
        if (pendingEnter) { const id = pendingEnter; pendingEnter = null; live.joined(id); }
      });
    } else if (live) live.walletChanged(s, { userInitiated: initiated });
    // A quick match chosen before the wallet was connected continues now (the game server module is loading by this point).
    if (s.status === "connected" && pendingQuick !== null && !quickBusy) {
      const i = pendingQuick;
      pendingQuick = null;
      void startQuick(i);
    }
  }

  async function refreshBalances() {
    const s = wallet.current;
    if (s.status !== "connected") return;
    setText($("play-bal-sol"), "...");
    setText($("play-bal-goshi"), "...");
    try {
      const c = await getClient();
      const [lamports, tokens] = await Promise.all([c.getSolBalance(s.publicKey), c.getGoshiBalance(s.publicKey)]);
      // The account may have changed while we waited.
      if (wallet.current.status !== "connected" || wallet.current.address !== s.address) return;
      goshiBalance = tokens;
      setText($("play-bal-sol"), withSol(lamports));
      setText($("play-bal-goshi"), goshi(tokens));
      renderRooms();
    } catch (err) {
      setText($("play-bal-sol"), "?");
      setText($("play-bal-goshi"), "?");
      setText(walletMsg, errText(classifyError(err)));
    }
  }

  // ------------------------------------------------------------------ rooms
  const STATE_CLASS: Record<RoomState, string> = { waiting: "s-next", active: "s-optional" };

  /** Who sits and what each place wins in this room (the rules of the program), with the test bots told apart on devnet. */
  function prizeText(r: RoomView): string {
    const bots = r.paid.filter((w) => botSet.has(w)).length;
    const seats = bots > 0 ? fill(t.rooms.seatsBots, { h: r.paid.length - bots, b: bots }) : fill(t.rooms.seatsPeople, { h: r.paid.length });
    let prize: string;
    if (r.mode === "royale") {
      const p = royalePrizes(r.entryFee);
      prize = fill(t.rooms.prizeRoyale, { fee: sol(r.entryFee), pot: sol(p.pot), unit: d.unitSol, a: sol(p.first), b: sol(p.second), c: sol(p.third), s: sol(p.saboteurPool) });
    } else if (r.mode === "vs") {
      const p = vsPrizes(r.entryFee, BigInt(Math.max(2, r.paid.length)));
      prize = fill(t.rooms.prizeVs, { fee: sol(r.entryFee), unit: d.unitSol, a: sol(p.winner), b: sol(p.loser) });
    } else {
      prize = fill(t.rooms.prizeDuel, { fee: sol(r.entryFee), unit: d.unitSol, a: sol(duelPrize(r.entryFee, BigInt(Math.max(2, r.paid.length))).winner) });
    }
    return `${seats}. ${prize}${bots > 0 ? ` ${t.rooms.botsNote}` : ""}`;
  }

  function renderRooms() {
    const wallet0 = me();
    const minHolder = chain?.minHolder ?? null;
    roomList.replaceChildren(
      ...publicRooms.map((r) => {
        const id = r.roomId.toString();
        const st = t.rooms.states[r.state];
        const tier = feeOptions.find((o) => o.lamports === r.entryFee);
        const chips = node("div", { class: "room-chips" }, [
          ...(tier ? [node("span", { class: "status s-devnet" }, [fill(t.rooms.tier, { usd: usdText(tier.usd, d.locale) })])] : []),
          ...(r.passes > 0 ? [node("span", { class: "status s-design" }, [t.rooms.passSeat])] : []),
          node("span", { class: "status s-design" }, [t.rooms.modes[r.mode]]),
          node("span", { class: `status ${STATE_CLASS[r.state]}` }, [
            st.label,
            node("span", { class: "sr", text: ` (${st.help})` }),
          ]),
        ]);
        const actions = node("div", { class: "room-actions" });
        actions.append(node("button", { class: "btn btn-glass btn-sm", text: t.rooms.details, attrs: {
          type: "button", "data-details": id, "aria-pressed": String(selected === r.roomId), "aria-label": fill(t.rooms.detailsAria, { id }),
        } }));
        const notes: HTMLElement[] = [];
        const inRoom = hasJoined(r, wallet0);
        if (live && wallet0 && inRoom) {
          actions.append(node("button", { class: "btn btn-glass btn-sm", text: t.live.room.open, attrs: {
            type: "button", "data-open": id, "aria-label": fill(t.live.room.openAria, { id }),
          } }));
        }
        if (live?.devBots() && r.state === "waiting" && r.mode === "royale") {
          actions.append(node("button", { class: "btn btn-glass btn-sm", text: t.live.bots.button, attrs: {
            type: "button", "data-bots": id, "aria-label": fill(t.live.bots.aria, { id }),
          } }));
        }
        if (isPaidPlayer(r, wallet0)) notes.push(node("p", { class: "room-note", text: t.rooms.youArePaid }));
        else if (isSaboteur(r, wallet0)) notes.push(node("p", { class: "room-note", text: t.rooms.youAreSaboteur }));
        else {
          const paid = canJoinPaid(r, wallet0);
          if (paid.ok) {
            actions.append(node("button", { class: "btn btn-gold btn-sm", text: t.rooms.joinPaid, attrs: {
              type: "button", "data-join": id, "aria-disabled": String(busy),
              "aria-label": fill(t.rooms.joinPaidAria, { id, fee: sol(r.entryFee), unit: d.unitSol }),
            } }));
          }
          const free = canJoinFree(r, wallet0, goshiBalance, minHolder);
          if (r.state === "waiting" && r.mode === "royale" && (free.ok || free.reason === "notEnoughGoshi")) {
            const blocked = !free.ok;
            const noteId = `free-note-${id}`;
            actions.append(node("button", { class: "btn btn-glass btn-sm", text: t.rooms.joinFree, attrs: {
              type: "button", "data-join-free": id, "aria-disabled": String(busy || blocked), "aria-label": fill(t.rooms.joinFreeAria, { id }),
              ...(blocked ? { "aria-describedby": noteId } : {}),
            } }));
            if (blocked && minHolder !== null) {
              notes.push(node("p", { class: "demo-note", text: fill(t.rooms.freeNeed, { min: formatAmount(minHolder, { locale: d.locale }), unit: d.unitGoshi, have: goshiBalance === null ? "0" : formatAmount(goshiBalance, { locale: d.locale }) }), attrs: { id: noteId } }));
            }
          } else if (!paid.ok) {
            notes.push(node("p", { class: "room-note", text: r.state === "active" ? t.rooms.inProgress : t.rooms.full }));
          }
          if (wallet0 === null && minHolder !== null && r.state === "waiting") {
            notes.push(node("p", { class: "demo-note", text: fill(t.rooms.freeUnknown, { min: formatAmount(minHolder, { locale: d.locale }), unit: d.unitGoshi }) }));
          }
        }
        return node("li", { class: "room", attrs: { "data-selected": String(selected === r.roomId) } }, [
          node("div", { class: "room-head" }, [node("h3", { text: fill(t.rooms.roomName, { id }) }), chips]),
          node("p", { class: "room-prizes muted small", text: prizeText(r) }),
          node("dl", {}, [
            node("div", {}, [node("dt", { text: t.rooms.fee }), node("dd", { text: withSol(r.entryFee) })]),
            node("div", {}, [node("dt", { text: t.rooms.pot }), node("dd", { text: withSol(roomPot(r)) })]),
            node("div", {}, [node("dt", { text: t.rooms.paid }), node("dd", { text: `${r.paid.length} / 10` })]),
            node("div", {}, [node("dt", { text: t.rooms.saboteurs }), node("dd", { text: `${r.free.length} / 3` })]),
          ]),
          actions,
          ...notes,
        ]);
      }),
    );
  }

  // A wallet seated in a match that is running goes back into it by itself: after a reload, with the same link or from another tab.
  let resumedFor: string | null = null;
  function resumeSeatedMatch() {
    const w = wallet.current;
    if (!live || w.status !== "connected") return;
    const mine = rooms.find((r) => r.state === "active" && (r.paid.includes(w.address) || r.free.includes(w.address)));
    if (!mine) { resumedFor = null; return; }
    const id = mine.roomId.toString();
    if (resumedFor === id) return;
    resumedFor = id;
    live.resume(id);
  }

  async function refreshRooms() {
    if (firstLoad) setText(roomsMsg, t.rooms.loading);
    try {
      const c = await getClient();
      chain = await c.verifyConfig();
      rooms = await c.listRooms();
      // Only the rooms of this region: the others are run by another server (pick that region to see them).
      if (regions.length > 1) rooms = rooms.filter((x) => regionOfRoom(x.roomId, regions) === (d.settings.regionSlot ?? 0));
      // Private duels are reached by their link, not from the public list.
      try {
        const r = await fetch(`${d.settings.serverUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:")}/duels`);
        const j = (await r.json()) as { ids: string[] };
        const hidden = new Set(j.ids);
        publicRooms = rooms.filter((x) => !hidden.has(x.roomId.toString()));
      } catch { publicRooms = rooms; }
      try {
        const lr = await fetch(`${d.settings.serverUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:")}/live`);
        const lj = (await lr.json()) as { bots?: string[] };
        botSet = new Set(lj.bots ?? []);
      } catch { /* the page still works without the bot list */ }
      firstLoad = false;
      setText(roomsMsg, publicRooms.length === 0 ? t.rooms.empty : "");
      setText(updatedEl, fill(t.rooms.updated, { time: new Date().toLocaleTimeString(d.locale) }));
      if (selected !== null && !rooms.some((r) => r.roomId === selected)) selected = null;
      renderRooms();
      renderPot();
      resumeSeatedMatch();
    } catch (err) {
      setText(roomsMsg, fill(t.rooms.loadError, { reason: errText(classifyError(err)) }));
    }
  }

  async function refreshAll() {
    await Promise.all([refreshRooms(), refreshBalances()]);
  }

  roomList.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-details], [data-join], [data-join-free], [data-open], [data-bots]");
    if (!target) return;
    if (target.dataset.open) { live?.openGame(target.dataset.open); return; }
    if (target.dataset.bots) { if (gateOk()) live?.fillWithBots(target.dataset.bots); return; }
    if (target.dataset.details) {
      selected = BigInt(target.dataset.details);
      renderRooms();
      renderPot();
      return;
    }
    if (target.getAttribute("aria-disabled") === "true") return;
    if (target.dataset.join) void onJoin(BigInt(target.dataset.join), false);
    if (target.dataset.joinFree) void onJoin(BigInt(target.dataset.joinFree), true);
  });
  $("play-refresh").addEventListener("click", () => void refreshAll());

  // ------------------------------------------------------------------ pot
  const potKeys = ["first", "second", "third", "saboteurs", "burn", "infra", "liquidity", "jackpot", "prizePool", "rake", "pot"] as const;

  function renderPot() {
    const none = $("play-pot-none");
    const body = $("play-pot-body");
    const room = selected === null ? undefined : rooms.find((r) => r.roomId === selected);
    none.hidden = !!room;
    body.hidden = !room;
    if (!room) return;
    setText($("play-pot-room"), fill(t.pot.room, { id: room.roomId.toString() }));
    const pot = roomPot(room);
    const full = royalePot(room.entryFee, 10);
    setText($("play-pot-live"), withSol(pot));
    setText($("play-pot-full"), full === null ? t.pot.unavailable : withSol(full));
    // Top 3 paid players, the saboteurs that are seated (or 3 for a full room), and a pass seat holds one entry less in cash.
    const sabs = room.free.length > 0 ? room.free.length : 3;
    const cash = room.passes > 0 && pot >= room.entryFee ? pot - room.entryFee : pot;
    const s = settleRoyale(pot, cash, sabs);
    const values: Record<(typeof potKeys)[number], bigint | null> = s
      ? { first: s.prizes[0], second: s.prizes[1], third: s.prizes[2], saboteurs: s.saboteurEach, burn: s.buybackBurn, infra: s.infra, liquidity: s.liquidity, jackpot: s.rakeJackpot, prizePool: s.prizePool, rake: s.rake, pot }
      : { first: null, second: null, third: null, saboteurs: null, burn: null, infra: null, liquidity: null, jackpot: null, prizePool: null, rake: null, pot: null };
    if (room.mode === "vs") {
      const v = room.paid.length >= 2 ? settleVs(room.entryFee, room.paid.length) : null;
      if (v) {
        values.first = v.winner; values.second = v.loser; values.third = v.loser;
        values.saboteurs = 0n;
        values.burn = v.buybackBurn; values.infra = v.infra; values.liquidity = v.liquidity; values.jackpot = v.rakeJackpot;
        values.prizePool = v.pot - v.rake; values.rake = v.rake;
      }
    }
    for (const k of potKeys) {
      const cell = document.querySelector<HTMLElement>(`[data-amt="${k}"]`);
      if (cell) setText(cell, values[k] === null ? t.pot.unavailable : withSol(values[k]!));
    }
  }

  // ------------------------------------------------------------------ actions
  function needWallet(): boolean {
    if (wallet.current.status === "connected") return true;
    fail("wallet", t.tx.connectFirst);
    document.querySelector<HTMLElement>("[data-connect]")?.focus();
    return false;
  }

  async function onJoin(roomId: bigint, asSaboteur: boolean): Promise<boolean> {
    if (busy || !needWallet()) return false;
    const room = rooms.find((r) => r.roomId === roomId);
    if (!room) return false;
    const id = roomId.toString();
    const lines = asSaboteur
      ? [
          { label: t.entry.youHold, value: goshi(goshiBalance ?? 0n) },
          { label: t.entry.youPay, value: t.entry.youKeep, total: true },
        ]
      : [
          { label: t.entry.youPay, value: withSol(room.entryFee), total: true },
          { label: t.entry.goesTo, value: fill(t.entry.room, { id }) },
        ];
    // The backpack (contract v6, test site): a share of the entry kept for traps and refunded when it is not spent.
    const bpSel = document.getElementById("play-entry-backpack") as HTMLSelectElement | null;
    const bpWrap = document.getElementById("play-entry-backpack-wrap");
    if (bpSel && bpWrap) {
      bpWrap.hidden = asSaboteur;
      bpSel.replaceChildren(
        node("option", { text: bpSel.dataset.none ?? "", attrs: { value: "0" } }),
        ...[25n, 50n, 100n].map((pct) => node("option", { text: fill(bpSel.dataset.option ?? "", { pct: String(pct), n: sol((room.entryFee * pct) / 100n) }), attrs: { value: ((room.entryFee * pct) / 100n).toString() } })),
      );
      bpSel.value = (room.entryFee / 2n).toString();
    }
    const ok = await confirmEntry(fill(asSaboteur ? t.entry.freeTitle : t.entry.paidTitle, { id }), asSaboteur ? t.entry.freeText : t.entry.paidText, lines, asSaboteur);
    if (!ok) return false;
    const backpack = !asSaboteur && bpSel ? BigInt(bpSel.value || "0") : 0n;
    // Only now does the page ask the wallet to sign. When the join is final on the network, enter the room on the game server.
    const done = await runTx(async (cb) => {
      const c = await getClient();
      return asSaboteur ? c.joinFree(roomId, wallet.signer, cb) : c.joinRoom(roomId, wallet.signer, cb, backpack);
    }, () => void onJoin(roomId, asSaboteur));
    if (done) {
      // Take the seat to the game server without a reload. If the live module is still loading it is entered as soon as it is ready.
      if (live) live.joined(id);
      else pendingEnter = id;
    }
    return done;
  }

  // ------------------------------------------------------------------ quick match
  const quickMsg = $("play-quick-msg");
  const quickBtns = [...document.querySelectorAll<HTMLButtonElement>("[data-quick-opt]")];
  const spentEl = $("play-spent");
  const limitSel = $<HTMLSelectElement>("play-limit");
  const quickNote = $("play-quick-note");

  function renderSpend() {
    setText(spentEl, fill(t.quick.spent, { n: solText(spend.spent, d.locale), unit: d.unitSol }));
    limitSel.value = spend.limit === null ? "" : spend.limit.toString();
  }
  function renderQuickOptions() {
    quickBtns.forEach((b, i) => {
      const o = feeOptions[i];
      const small = b.querySelector("[data-sol]");
      if (!o) { b.disabled = true; return; }
      const l = feeLabel(o, d.locale);
      const strong = b.querySelector("strong");
      if (strong) strong.textContent = l.usd;
      if (small) small.textContent = fill(t.quick.about, { sol: l.sol, unit: d.unitSol });
      b.disabled = false;
    });
    if (feeOptions.length) {
      const first = usdText(feeOptions[0].usd, d.locale), last = usdText(feeOptions[feeOptions.length - 1].usd, d.locale);
      setText(quickNote, fill(t.quick.noteTest, { usd: first === last ? first : `${first} - ${last}` }));
    }
  }
  const quickSay = (text: string) => setText(quickMsg, text);

  async function startQuick(i: number) {
    const opt = feeOptions[i];
    if (!opt || quickBusy || busy) return;
    lastQuick = i;
    quickBtns.forEach((b, k) => b.classList.toggle("is-picked", k === i));
    if (!spend.allows(opt.lamports)) {
      quickSay(fill(t.quick.limitReached, { spent: solText(spend.spent, d.locale), limit: solText(spend.limit ?? 0n, d.locale), unit: d.unitSol }));
      return;
    }
    if (wallet.current.status !== "connected") {
      // The connect popup only ever opens from a click on Connect: remember the choice and continue when connected.
      pendingQuick = i;
      quickSay(fill(t.quick.needWallet, { usd: usdText(opt.usd, d.locale) }));
      showWallet();
      document.querySelector<HTMLElement>("[data-connect]")?.focus();
      return;
    }
    quickBusy = true;
    quickSay(t.quick.searching);
    try {
      // The game server code loads when the wallet connects.
      if (!live) await liveLoading;
      if (!live) throw new Error("server");
      const r = await live.quick(opt.lamports);
      quickSay(fill(r.created ? t.quick.opened : t.quick.found, { id: r.roomId, paid: r.paid }));
      let room = rooms.find((x) => x.roomId.toString() === r.roomId);
      for (let k = 0; k < 4 && !room; k++) {
        await new Promise((res) => setTimeout(res, 1200));
        await refreshRooms();
        room = rooms.find((x) => x.roomId.toString() === r.roomId);
      }
      if (!room || room.state !== "waiting") { quickSay(t.quick.roomGone); return; }
      // On the test network one tap does everything: top up the test SOL when it is short, take the seat and fill the room with bots.
      if (live.devBots() && wallet.current.status === "connected") {
        try {
          const have = await (await getClient()).getSolBalance(wallet.current.publicKey);
          if (have < room.entryFee + 3_000_000n) { quickSay(t.quick.topUp); await live.faucet(); await refreshBalances(); }
        } catch { /* the join below reports a missing balance clearly */ }
      }
      const ok = await onJoin(room.roomId, false);
      if (ok) {
        spend.add(room.entryFee);
        renderSpend();
        quickSay("");
        if (live.devBots()) live.fillWithBots(room.roomId.toString());
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      quickSay(m === "signin" ? t.quick.signin : fill(t.quick.failed, { message: m === "server" ? t.live.create.needServer : m }));
    } finally {
      quickBusy = false;
    }
  }

  quickBtns.forEach((b, i) => b.addEventListener("click", () => void startQuick(i)));
  limitSel.addEventListener("change", () => {
    const v = limitSel.value;
    spend.setLimit(v === "" ? null : BigInt(v));
    renderSpend();
  });
  renderSpend();
  void fetchFeeOptions(d.settings.serverUrl).then((info) => {
    if (!info) { setText(quickNote, t.quick.unavailable); return; }
    feeOptions = info.options;
    renderQuickOptions();
    renderDuelTiers();
    // Arrived from the home page with ?quick=<dollars>: carry on with that entry.
    const q = new URLSearchParams(location.search).get("quick");
    if (q !== null) {
      const idx = feeOptions.findIndex((o) => String(o.usd) === q);
      const params = new URLSearchParams(location.search);
      params.delete("quick");
      const rest = params.toString();
      history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
      if (idx >= 0) void startQuick(idx);
    }
  });


  // ------------------------------------------------------------------ duels
  // A private duel by contract: the host names wallets, signs one transaction (pays the first seat), and only those wallets can sit.
  const duelMsg = $("play-duel-msg");
  const duelTiers = $("play-duel-tiers");
  const duelCreate = $<HTMLButtonElement>("play-duel-create");
  const duelAdd = $<HTMLButtonElement>("play-duel-add");
  const duelShare = $("play-duel-share");
  const duelLink = $<HTMLInputElement>("play-duel-link");
  const duelStart = $<HTMLButtonElement>("play-duel-start");
  const duelNative = $<HTMLButtonElement>("play-duel-native");
  const duelIncoming = $("play-duel-incoming");
  const duelAccept = $<HTMLButtonElement>("play-duel-accept");
  const duelInvites = $("play-duel-invites");
  const duelLive = $("play-duel-live");
  const guestInputs = Array.from(document.querySelectorAll<HTMLInputElement>(".duel-guest"));
  let duelTier = 0;
  let duelBusy = false;
  const dt = t.duel;
  const duelSay = (text: string) => setText(duelMsg, text);
  const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const short = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;

  function renderDuelTiers() {
    duelTiers.textContent = "";
    feeOptions.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `quick-btn${i === duelTier ? " is-picked" : ""}`;
      const strong = document.createElement("strong");
      strong.textContent = `$${o.usd}`;
      const small = document.createElement("small");
      small.textContent = `${solText(o.lamports, d.locale)} ${d.unitSol}`;
      b.append(strong, small);
      b.addEventListener("click", () => { duelTier = i; renderDuelTiers(); });
      duelTiers.append(b);
    });
  }

  duelAdd.addEventListener("click", () => {
    const next = guestInputs.find((g) => g.hidden);
    if (next) { next.hidden = false; next.focus(); }
    if (!guestInputs.some((g) => g.hidden)) duelAdd.hidden = true;
  });

  function showDuelLink(id: string, expected: number) {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("duel", id);
    duelLink.value = url.toString();
    duelShare.hidden = false;
    duelStart.hidden = false;
    duelStart.onclick = () => { if (live) live.startDuel(id); };
    if (typeof navigator.share === "function") {
      duelNative.hidden = false;
      duelNative.onclick = () => { void navigator.share({ title: "Goshi", text: `${dt.shareText}\nPhantom: ${phantomLink(duelLink.value, location.origin)}`, url: duelLink.value }).catch(() => undefined); };
    }
    duelSay(`${dt.created} ${dt.waiting.replace("{n}", "1").replace("{max}", String(expected))}`);
  }

  duelCreate.addEventListener("click", async () => {
    const opt = feeOptions[duelTier];
    if (!opt || duelBusy || busy) return;
    if (wallet.current.status !== "connected") {
      duelSay(dt.needWallet);
      showWallet();
      document.querySelector<HTMLElement>("[data-connect]")?.focus();
      return;
    }
    const guests = guestInputs.map((g) => g.value.trim()).filter(Boolean);
    if (guests.length === 0) { duelSay(dt.needGuest); return; }
    if (guests.some((g) => !BASE58.test(g))) { duelSay(dt.badGuest); return; }
    if (!gateOk()) return;
    duelBusy = true;
    duelSay(dt.creating);
    try {
      if (!live) await liveLoading;
      if (!live) throw new Error("server");
      const r = await live.createDuel(opt.lamports, guests);
      duelSay(dt.signing);
      const client = await getClient();
      await client.sendPrebuilt(r.tx, wallet.signer, { entryFee: BigInt(opt.lamports), guests }, {});
      spend.add(opt.lamports);
      renderSpend();
      showDuelLink(r.roomId, r.players);
      void refreshRooms();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      duelSay(dt.failed.replace("{message}", m === "server" ? t.live.create.needServer : errText(classifyError(e)) || m));
    } finally {
      duelBusy = false;
    }
  });

  duelLink.addEventListener("focus", () => duelLink.select());
  $("play-duel-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(duelLink.value); duelSay(dt.copied); } catch { duelLink.select(); }
  });

  // The invited wallet sees the challenge as soon as it is connected: a banner with the host, the entry and an Accept button.
  async function acceptDuel(roomId: string) {
    if (wallet.current.status !== "connected") {
      duelSay(dt.needWallet);
      showWallet();
      document.querySelector<HTMLElement>("[data-connect]")?.focus();
      return;
    }
    await refreshRooms();
    const room = rooms.find((x) => x.roomId.toString() === roomId);
    if (!room || room.state !== "waiting") { duelSay(dt.gone); return; }
    if (room.guests.length > 0 && room.paid.length >= 5) { duelSay(dt.full); return; }
    const ok = await onJoin(room.roomId, false);
    if (ok) { spend.add(room.entryFee); renderSpend(); duelSay(""); }
  }
  // The invitation comes to the player: one full screen sheet with the entry and a big Accept, wherever they are on the page.
  let sheet: HTMLElement | null = null;
  function closeSheet() { sheet?.remove(); sheet = null; }
  function openInviteSheet(roomId: string, feeLamports: bigint) {
    closeSheet();
    const wrap = document.createElement("div");
    wrap.className = "invite-sheet";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    const card = document.createElement("div");
    card.className = "invite-card";
    const h = document.createElement("h3");
    h.textContent = t.live.arenaState.inviteTitle;
    const p = document.createElement("p");
    p.textContent = t.live.arenaState.incomingRoom.replace("{fee}", solText(feeLamports, d.locale)).replace("{unit}", d.unitSol);
    const note = document.createElement("p");
    note.className = "muted small";
    const row = document.createElement("div");
    row.className = "btn-row";
    // Opened from a chat in an ordinary phone browser: the wallet is not there. Say so and open the page inside the wallet.
    if (needsWalletBrowser()) {
      const here = location.href;
      const a = document.createElement("a");
      a.className = "btn btn-gold btn-lg";
      a.href = phantomLink(here, location.origin);
      a.textContent = "Open in Phantom";
      const b = document.createElement("a");
      b.className = "btn btn-glass btn-lg";
      b.href = solflareLink(here, location.origin);
      b.textContent = "Open in Solflare";
      card.append(a, b);
    }
    // One tick instead of the whole gate: it sets the two boxes of the acceptance form.
    const gateA = document.getElementById("play-gate-check") as HTMLInputElement | null;
    const gateB = document.getElementById("play-gate-net") as HTMLInputElement | null;
    const gateText = document.querySelector("#play-gate .gate-check span")?.textContent ?? "";
    let sure: HTMLInputElement | null = null;
    if (gateA && !gateA.checked) {
      const lab = document.createElement("label");
      lab.className = "invite-sure";
      sure = document.createElement("input");
      sure.type = "checkbox";
      const sp = document.createElement("span");
      sp.textContent = gateText;
      lab.append(sure, sp);
      card.append(lab);
    }
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn btn-gold btn-lg";
    ok.textContent = dt.accept;
    const no = document.createElement("button");
    no.type = "button";
    no.className = "btn btn-glass btn-lg";
    no.textContent = t.live.arenaState.notNow;
    ok.addEventListener("click", () => {
      if (sure && !sure.checked) { note.textContent = gateText; sure.focus(); return; }
      if (sure?.checked) {
        for (const g of [gateA, gateB]) if (g && !g.checked) { g.checked = true; g.dispatchEvent(new Event("change", { bubbles: true })); }
      }
      if (wallet.current.status !== "connected") {
        // Connect first, then come back to the same sheet: no hunting for buttons.
        note.textContent = t.live.arenaState.connectFirst;
        closeSheet();
        document.querySelector<HTMLElement>("[data-connect]")?.click();
        let tries = 0;
        const timer = setInterval(() => {
          tries++;
          if (wallet.current.status === "connected") { clearInterval(timer); openInviteSheet(roomId, feeLamports); }
          else if (tries > 90) clearInterval(timer);
        }, 700);
        return;
      }
      closeSheet();
      void acceptDuel(roomId);
    });
    no.addEventListener("click", closeSheet);
    row.append(ok, no);
    card.append(h, p, note, row);
    wrap.append(card);
    (document.fullscreenElement ?? document.body).append(wrap);
    sheet = wrap;
    ok.focus({ preventScroll: true });
  }
  const shownInvites = new Set<string>();
  window.addEventListener("goshi-invite", (ev) => {
    const m = (ev as CustomEvent<{ roomId: string; entryFee: string; host: string; players: number }>).detail;
    if (shownInvites.has(m.roomId)) return;
    shownInvites.add(m.roomId);
    duelInvites.hidden = false;
    const row = document.createElement("div");
    row.className = "duel-invite";
    const text = document.createElement("span");
    text.textContent = dt.inviteBanner.replace("{host}", short(m.host)).replace("{fee}", solText(BigInt(m.entryFee), d.locale)).replace("{unit}", d.unitSol);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-gold btn-sm";
    btn.textContent = dt.accept;
    btn.addEventListener("click", () => { void acceptDuel(m.roomId); });
    row.append(text, btn);
    duelInvites.append(row);
    openInviteSheet(m.roomId, BigInt(m.entryFee));
  });

  // Arrived through a duel link: show the challenge and the button that takes the seat.
  const incomingDuel = new URLSearchParams(location.search).get("duel");
  if (incomingDuel && /^\d{10,24}$/.test(incomingDuel)) {
    duelIncoming.hidden = false;
    duelAccept.hidden = false;
    setText(duelIncoming, dt.incoming.replace("{fee}", "-").replace("{unit}", d.unitSol));
    void refreshRooms().then(() => {
      const room = rooms.find((x) => x.roomId.toString() === incomingDuel);
      if (room && room.state === "waiting") {
        openInviteSheet(incomingDuel, room.entryFee);
        setText(duelIncoming, dt.incoming.replace("{fee}", solText(room.entryFee, d.locale)).replace("{unit}", d.unitSol) + " " + dt.waiting.replace("{n}", String(room.paid.length)).replace("{max}", String(room.guests.length + 1)));
      }
    });
    duelAccept.addEventListener("click", () => { void acceptDuel(incomingDuel); });
  }

  // Arrived through a room link (?room=<id>): show the invitation and the button that takes a seat.
  const incomingRoom = new URLSearchParams(location.search).get("room");
  if (incomingRoom && /^\d{10,24}$/.test(incomingRoom) && !incomingDuel) {
    void refreshRooms().then(() => {
      const room = rooms.find((x) => x.roomId.toString() === incomingRoom);
      if (!room || room.state !== "waiting") { duelIncoming.hidden = false; setText(duelIncoming, dt.gone); return; }
      duelIncoming.hidden = false;
      duelAccept.hidden = false;
      openInviteSheet(incomingRoom, room.entryFee);
      setText(duelIncoming, t.live.arenaState.incomingRoom.replace("{fee}", solText(room.entryFee, d.locale)).replace("{unit}", d.unitSol));
      duelAccept.addEventListener("click", () => { void acceptDuel(incomingRoom); });
      duelIncoming.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // Duels being played now: anyone can watch them.
  async function refreshLive() {
    try {
      const r = await fetch(`${d.settings.serverUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:")}/live`);
      const j = (await r.json()) as { duels: { roomId: string; entryFee: string; players: string[] }[] };
      duelLive.textContent = "";
      if (j.duels.length === 0) {
        const li = document.createElement("li");
        li.className = "muted";
        li.textContent = dt.liveNone;
        duelLive.append(li);
        return;
      }
      for (const m of j.duels) {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = `${dt.liveLine.replace("{a}", short(m.players[0] ?? "")).replace("{b}", m.players.slice(1).map(short).join(", "))} · ${solText(BigInt(m.entryFee), d.locale)} ${d.unitSol}`;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-glass btn-sm";
        b.textContent = dt.watch;
        b.addEventListener("click", () => { if (live) live.openGame(m.roomId); });
        li.append(label, b);
        duelLive.append(li);
      }
    } catch { /* the list is optional */ }
  }
  void refreshLive();
  setInterval(() => { if (document.visibilityState === "visible") void refreshLive(); }, 15_000);

  // ------------------------------------------------------------------ bought length (live arena)
  // The live arena asks for one step of length: this page holds the wallet, so it pays the house and hands the signature back.
  window.addEventListener("goshi-pay-length", () => {
    void (async () => {
      let sig: string | null = null;
      try {
        if (wallet.current.status !== "connected") throw new Error("wallet");
        const c = await getClient();
        sig = await c.payHouse(10_000_000n, wallet.signer);
        void refreshBalances();
      } catch (e) {
        log("length payment failed", e);
      }
      window.dispatchEvent(new CustomEvent("goshi-length-paid", { detail: { sig } }));
    })();
  });

  // ------------------------------------------------------------------ cash arena entry (test network)
  // Tickets bought in this browser, by wallet (kept 48 h, like a ticket on the server; dropped once the server says it was used).
  const TICKETS_KEY = "goshi-cash-tickets";
  type LocalTicket = { w: string; sig: string; lamports: number; at: number };
  const readTickets = (): LocalTicket[] => { try { return (JSON.parse(localStorage.getItem(TICKETS_KEY) ?? "[]") as LocalTicket[]).filter((t) => Date.now() - t.at < 48 * 3600_000); } catch { return []; } };
  const writeTickets = (l: LocalTicket[]) => { try { localStorage.setItem(TICKETS_KEY, JSON.stringify(l)); } catch { /* private mode */ } };
  function rememberTicket(w: string, sig: string, lamports: number) { writeTickets([...readTickets().filter((t) => t.sig !== sig), { w, sig, lamports, at: Date.now() }]); }
  function localTickets(w: string) { return readTickets().filter((t) => t.w === w).map((t) => ({ sig: t.sig, lamports: t.lamports })); }
  window.addEventListener("goshi-ticket-used", (e) => { const sig = (e as CustomEvent<{ sig: string }>).detail.sig; writeTickets(readTickets().filter((t) => t.sig !== sig)); });

  // The page asks for the unused tickets of the connected wallet (to show them next to the arena button).
  window.addEventListener("goshi-cash-tickets-ask", () => {
    void (async () => {
      let tickets: { sig: string; lamports: number }[] = [];
      try {
        const a = me();
        if (a) {
          const base = (d.settings.liveUrl ?? d.settings.serverUrl).replace(/^wss:/, "https:").replace(/^ws:/, "http:");
          tickets = ((await (await fetch(`${base}/cash/tickets/${a}`, { signal: AbortSignal.timeout(8000) })).json()) as { tickets?: { sig: string; lamports: number }[] }).tickets ?? [];
        }
      } catch { /* the server list failed: the ones kept here still show */ }
      const a2 = me();
      if (a2) for (const t of localTickets(a2)) if (!tickets.some((x) => x.sig === t.sig)) tickets.push(t);
      window.dispatchEvent(new CustomEvent("goshi-cash-tickets", { detail: { tickets } }));
    })();
  });

  // The cash arenas of the test network, one per entry, for the chooser.
  window.addEventListener("goshi-arenas-ask", () => {
    void (async () => {
      let arenas: unknown[] = [];
      try {
        const r = await fetch(`${(d.settings.liveUrl ?? d.settings.serverUrl).replace(/^wss:/, "https:").replace(/^ws:/, "http:")}/live`, { signal: AbortSignal.timeout(6000) });
        arenas = ((await r.json()) as { arenas?: unknown[] }).arenas ?? [];
      } catch { /* none: the page goes straight to the only arena */ }
      window.dispatchEvent(new CustomEvent("goshi-arenas", { detail: { arenas } }));
    })();
  });

  // Buying a ticket for a cash arena (test network): one payment of that arena's entry from the wallet to the vault. The ticket is
  // the payment itself, on chain; it is also kept in this browser at once (the server's list can take a few seconds to show it).
  window.addEventListener("goshi-cash-buy", (ev) => {
    const want = (ev as CustomEvent<{ arena: string }>).detail.arena;
    void (async () => {
      let out: { sig: string | null; lamports: number; error?: string } = { sig: null, lamports: 0 };
      try {
        const a = me();
        if (!a) throw new Error("wallet");
        const r = await fetch(`${(d.settings.liveUrl ?? d.settings.serverUrl).replace(/^wss:/, "https:").replace(/^ws:/, "http:")}/live`, { signal: AbortSignal.timeout(8000) });
        const j = (await r.json()) as { arena?: { cash?: { vault: string } }; arenas?: { id: string; entry: number }[] };
        const vault = j.arena?.cash?.vault;
        const pick = j.arenas?.find((x) => x.id === want);
        if (!vault || !pick) throw new Error("arena");
        out.lamports = pick.entry;
        const c = await getClient();
        out.sig = await c.payTo(vault, BigInt(pick.entry), wallet.signer);
        rememberTicket(a, out.sig, pick.entry);
        void refreshBalances();
      } catch (err) {
        log("ticket purchase failed", err);
        out.error = String((err as Error)?.message ?? err).slice(0, 80);
      }
      window.dispatchEvent(new CustomEvent("goshi-cash-bought", { detail: out }));
    })();
  });

  // ------------------------------------------------------------------ start
  // The header chip restores the last connection silently; this page follows the same wallet session.
  subscribe(onWalletChange);
  onWalletChange(wallet.current);
  void restoreWallet();
  setTx("idle");
  await refreshRooms();
  // Keep the list fresh while the tab is visible.
  setInterval(() => {
    if (!document.hidden && !busy) void refreshAll();
  }, 20_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !busy) void refreshAll();
  });
}
