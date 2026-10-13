// The match search. Wallet, transaction, room or hash in; the matches out, each with the explorer link, the downloadable
// records and a button that re-checks everything in this browser (lib/play/proof-check.ts). Text is written with textContent.
import { renderCard, type Rec, type CardCtx } from "./match-card.ts";
import { manager, restoreWallet, subscribe } from "../lib/play/wallet-session.ts";
import type { Cluster } from "../lib/play/config.ts";

const boot = JSON.parse(document.getElementById("verify-data")?.textContent ?? "null") as { api: string; rpc: string; cluster: Cluster; t: any; replayHref: string; r: any; verifyHref: string } | null;
if (boot) {
  const { api, t } = boot;
  const ctx: CardCtx = { api, rpc: boot.rpc, cluster: boot.cluster, t, r: boot.r, verifyHref: boot.verifyHref };
  const form = document.getElementById("verify-form") as HTMLFormElement;
  const input = document.getElementById("verify-q") as HTMLInputElement;
  const go = document.getElementById("verify-go") as HTMLButtonElement;
  const msg = document.getElementById("verify-msg")!;
  const list = document.getElementById("verify-list")!;

  const kindOf = (q: string): "wallet" | "tx" | "room" | "hash" | null => {
    if (/^[0-9a-fA-F]{64}$/.test(q)) return "hash";
    if (/^\d{10,24}$/.test(q)) return "room";
    if (/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(q)) return "tx";
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)) return "wallet";
    return null;
  };

  async function search(q: string) {
    const kind = kindOf(q);
    list.textContent = "";
    if (!kind) { msg.textContent = t.none; return; }
    msg.textContent = t.searching;
    go.disabled = true;
    try {
      const r = await fetch(`${api}/matches/${kind}/${encodeURIComponent(kind === "hash" ? q.toLowerCase() : q)}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { items: Rec[] };
      msg.textContent = j.items.length === 0 ? t.none : `${t.kinds[kind]}: ${j.items.length}`;
      for (const it of j.items) list.append(renderCard(it, kind === "wallet" ? q : null, ctx));
    } catch {
      msg.textContent = t.error;
    } finally {
      go.disabled = false;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    history.replaceState(null, "", q ? `#${encodeURIComponent(q)}` : location.pathname);
    void search(q);
  });
  document.getElementById("verify-mine")?.addEventListener("click", async () => {
    await restoreWallet();
    const st = manager.current;
    if (st.status !== "connected") { msg.textContent = t.mineNeedWallet; return; }
    input.value = st.address;
    history.replaceState(null, "", `#${st.address}`);
    void search(st.address);
  });
  const fromHash = ((): string => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return ""; } })();
  if (fromHash && kindOf(fromHash)) { input.value = fromHash; void search(fromHash); }
  else if (document.getElementById("verify")?.dataset.autoWallet) {
    // No search asked for: list the matches of the connected wallet, now or as soon as it connects.
    let shown = "";
    const show = () => {
      const st = manager.current;
      if (st.status === "connected" && st.address !== shown) { shown = st.address; input.value = st.address; void search(st.address); }
    };
    subscribe(show);
    void restoreWallet().then(show);
  }
}
