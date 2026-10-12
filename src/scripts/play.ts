// Client side of the on-chain games page. Loaded only when site.play is enabled.
// The Anchor client (and web3.js with it) is imported lazily, the first time the page needs the network.
// Everything shown comes from textContent, never from HTML strings, so no value can inject markup.
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

interface Data {
  locale: string;
  mainnet: boolean;
  cluster: Cluster;
  explorerCluster: Cluster;
  symbol: string;
  unitSol: string;
  unitGoshi: string;
  settings: ConstructorParameters<typeof PlayClient>[0] & { serverUrl: string };
  walletNames: Record<WalletId, string>;
  homeHref: string;
  t: {
    quick: PlayCopy["quick"];
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
    entryOk.setAttribute("aria-disabled", String(!understood));
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
        if (!entryAccept.checked) { setText(entryMsg, t.entry.mustAccept); entryAccept.focus(); return; }
        try { sessionStorage.setItem("goshi-entry-v1", "1"); } catch { /* private mode */ }
        finish(true);
      };
      const onCancel = () => finish(false);
      const onAccept = () => {
        entryOk.setAttribute("aria-disabled", String(!entryAccept.checked));
        if (entryAccept.checked) setText(entryMsg, "");
      };
      entryOk.addEventListener("click", onOk);
      cancel.addEventListener("click", onCancel);
      entryAccept.addEventListener("change", onAccept);
      entryDialog.addEventListener("cancel", onCancel);
      entryDialog.addEventListener("close", onCancel);
      entryDialog.showModal();
    });
  }

  // ------------------------------------------------------------------ wallet
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
  $("play-disconnect").addEventListener("click", () => void disconnectWallet());

  function onWalletChange(s: WalletState) {
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

  function renderRooms() {
    const wallet0 = me();
    const minHolder = chain?.minHolder ?? null;
    roomList.replaceChildren(
      ...rooms.map((r) => {
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

  async function refreshRooms() {
    if (firstLoad) setText(roomsMsg, t.rooms.loading);
    try {
      const c = await getClient();
      chain = await c.verifyConfig();
      rooms = await c.listRooms();
      firstLoad = false;
      setText(roomsMsg, rooms.length === 0 ? t.rooms.empty : "");
      setText(updatedEl, fill(t.rooms.updated, { time: new Date().toLocaleTimeString(d.locale) }));
      if (selected !== null && !rooms.some((r) => r.roomId === selected)) selected = null;
      renderRooms();
      renderPot();
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
    if (busy || !gateOk() || !needWallet()) return false;
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
    const ok = await confirmEntry(fill(asSaboteur ? t.entry.freeTitle : t.entry.paidTitle, { id }), asSaboteur ? t.entry.freeText : t.entry.paidText, lines, asSaboteur);
    if (!ok) return false;
    // Only now does the page ask the wallet to sign. When the join is final on the network, enter the room on the game server.
    const done = await runTx(async (cb) => {
      const c = await getClient();
      return asSaboteur ? c.joinFree(roomId, wallet.signer, cb) : c.joinRoom(roomId, wallet.signer, cb);
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
      document.getElementById("play-wallet")?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelector<HTMLElement>("[data-connect]")?.focus();
      return;
    }
    if (!gateOk()) { pendingQuick = i; return; }
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
      const ok = await onJoin(room.roomId, false);
      if (ok) { spend.add(room.entryFee); renderSpend(); quickSay(""); }
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
