// The wallet chip in the header. Shows "Connect wallet" or the short address with the wallet name and the network, restores the
// last connection silently (no pop-up) and lets the person disconnect. The wallet state is shared with the play page
// (src/lib/play/wallet-session.ts), so the chip and the page always agree.
import { disconnectWallet, manager, restoreWallet, subscribe } from "../lib/play/wallet-session.ts";
import { shortAddress } from "../lib/play/config.ts";
import { WALLET_NAMES, type WalletState } from "../lib/play/wallet.ts";

const root = document.querySelector<HTMLElement>("[data-wallet-chip]");
if (root) {
  const t = JSON.parse(document.getElementById("wallet-chip-i18n")?.textContent ?? "{}") as {
    connect: string; connected: string; announceConnected: string; announceDisconnected: string; network: string; showNetwork: boolean;
  };
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const btn = $<HTMLButtonElement>("wallet-chip-btn");
  const text = btn.querySelector<HTMLElement>(".chip-text")!;
  const badge = $("wallet-chip-badge");
  const pop = $("wallet-chip-pop");
  const live = $("wallet-chip-live");
  const connectLabel = btn.getAttribute("aria-label") ?? t.connect;
  let was: WalletState["status"] = "disconnected";

  const closePop = () => { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  const announce = (s: string) => { live.textContent = ""; setTimeout(() => { live.textContent = s; }, 30); };

  function render(s: WalletState) {
    root!.dataset.state = s.status;
    if (s.status === "connected") {
      text.textContent = shortAddress(s.address, 4, 4);
      badge.textContent = t.network;
      badge.hidden = !t.showNetwork;
      btn.setAttribute("aria-label", `${t.connected}: ${WALLET_NAMES[s.id]} ${shortAddress(s.address, 4, 4)}${t.showNetwork ? `, ${t.network}` : ""}`);
      $("wallet-chip-name").textContent = WALLET_NAMES[s.id];
      $("wallet-chip-addr").textContent = s.address;
      if (was !== "connected") announce(t.announceConnected.replace("{address}", shortAddress(s.address, 4, 4)));
    } else {
      text.textContent = s.status === "connecting" ? "..." : t.connect;
      badge.hidden = true;
      btn.setAttribute("aria-label", connectLabel);
      closePop();
      if (was === "connected") announce(t.announceDisconnected);
    }
    was = s.status;
  }

  btn.addEventListener("click", () => {
    const s = manager.current;
    if (s.status === "connected") {
      const open = pop.hidden;
      pop.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      return;
    }
    // Disconnected: on the play page jump to the connect buttons, anywhere else go to the play page.
    const wallet = document.getElementById("play-wallet");
    if (wallet) {
      wallet.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      const target = document.querySelector<HTMLElement>("#play-wallet-choose:not([hidden]) [data-connect], #play-wallet-mobile:not([hidden]) a");
      (target ?? wallet).focus({ preventScroll: true });
    } else {
      location.href = root!.dataset.playHref ?? "/";
    }
  });
  $("wallet-chip-disconnect").addEventListener("click", () => { void disconnectWallet(); closePop(); btn.focus(); });
  document.addEventListener("click", (e) => { if (!root!.contains(e.target as Node)) closePop(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { closePop(); btn.focus(); } });

  subscribe(render);
  render(manager.current);
  void restoreWallet();
}
