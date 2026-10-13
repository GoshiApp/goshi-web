// The person's own invite link and numbers. The wallet comes from the shared connection; the numbers are public and are read
// from the game server (they are sums of a public ledger).
import { manager, restoreWallet, subscribe } from "../lib/play/wallet-session.ts";
import { WALLET_IDS, WALLET_INSTALL_URLS, WALLET_NAMES, isInstalled } from "../lib/play/wallet.ts";

const boot = JSON.parse(document.getElementById("invite-data")?.textContent ?? "null") as { api: string; home: string; t: any } | null;
if (boot) {
  const { api, home, t } = boot;
  const $ = (id: string) => document.getElementById(id)!;
  const need = $("invite-need"), connect = $("invite-connect"), mine = $("invite-mine");
  const linkEl = $("invite-link") as HTMLInputElement, stats = $("invite-stats"), msg = $("invite-msg");
  const sol = (l: string) => `${(Number(BigInt(l)) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
  let shown = "";

  function buttons() {
    connect.textContent = "";
    for (const id of WALLET_IDS) {
      if (isInstalled(id)) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "btn btn-gold"; b.textContent = `${t.connect} ${WALLET_NAMES[id]}`;
        b.addEventListener("click", () => void manager.connect(id).catch(() => undefined));
        connect.append(b);
      } else {
        const a = document.createElement("a");
        a.className = "btn btn-glass"; a.href = WALLET_INSTALL_URLS[id]; a.rel = "noopener noreferrer"; a.textContent = `${t.install} ${WALLET_NAMES[id]}`;
        connect.append(a);
      }
    }
  }

  async function render() {
    const s = manager.current;
    if (s.status !== "connected") {
      shown = "";
      mine.hidden = true; need.hidden = false; connect.hidden = false;
      buttons();
      return;
    }
    need.hidden = true; connect.hidden = true; mine.hidden = false;
    if (shown === s.address) return;
    shown = s.address;
    linkEl.value = `${home}?ref=${s.address}`;
    stats.textContent = "";
    try {
      const r = await fetch(`${api}/referrals/${s.address}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { referred: number; rooms: number; lamports: string };
      const rows: [string, string][] = [[t.stats.referred, String(j.referred)], [t.stats.rooms, String(j.rooms)], [t.stats.earned, sol(j.lamports)]];
      for (const [k, v] of rows) {
        const li = document.createElement("li");
        const a = document.createElement("span"); a.textContent = k;
        const b = document.createElement("b"); b.textContent = v;
        li.append(a, b);
        stats.append(li);
      }
      msg.textContent = "";
    } catch {
      msg.textContent = t.unavailable;
    }
  }

  $("invite-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(linkEl.value); msg.textContent = t.share.copied; } catch { linkEl.select(); }
  });
  subscribe(() => void render());
  void restoreWallet().then(() => render());
  void render();
}
