// The skin collection: shows what is unlocked (by games played, best mass, or $GOSHI held), lets the person choose one and
// tells the rest of the page. Holder skins need a wallet: the balance is read by the game server after a free signature.
import { SKINS, isUnlocked, readStats, selectSkin, selectedSkin, type Skin } from "../lib/play/skins.ts";

interface Strings {
  useLabel: string; inUse: string; locked: string; connect: string; verifying: string; balance: string; notHolder: string;
  rarity: Record<string, string>; names: Record<string, string>; unlock: Record<string, string>; api: string;
}
const root = document.querySelector<HTMLElement>("[data-skins]");
const t = JSON.parse(root?.querySelector("[data-skins-i18n]")?.textContent ?? "null") as Strings | null;
if (root && t) {
  const grid = root.querySelector<HTMLUListElement>("[data-skin-grid]")!;
  const connect = root.querySelector<HTMLButtonElement>("[data-skin-connect]")!;
  const note = root.querySelector<HTMLElement>("[data-skin-note]")!;
  const HELD_KEY = "goshi-held";
  let founder = false;
  try { founder = sessionStorage.getItem("goshi-founder") === "1"; } catch { /* none */ }
  let held = 0;
  try { held = Number(sessionStorage.getItem(HELD_KEY) ?? "0") || 0; } catch { /* none */ }

  const fmt = (n: number) => n.toLocaleString();
  const describe = (s: Skin): string => {
    const u = s.unlock;
    return (t.unlock[u.kind] ?? "").replace("{n}", "n" in u ? fmt(u.n) : "");
  };
  const swatch = (s: Skin): string => `linear-gradient(90deg, ${s.style.body} 0 50%, ${s.style.alt ?? s.style.body} 50% 100%)`;

  function draw() {
    const st = readStats();
    const sel = selectedSkin();
    grid.textContent = "";
    for (const s of SKINS) {
      const ok = isUnlocked(s, st, held, founder);
      const li = document.createElement("li");
      li.className = `skin skin-${s.rarity}${ok ? "" : " is-locked"}${sel === s.id ? " is-on" : ""}`;
      const sw = document.createElement("span");
      sw.className = "skin-swatch";
      sw.style.background = swatch(s);
      const name = document.createElement("b");
      name.textContent = t!.names[s.id] ?? s.id;
      const r = document.createElement("span");
      r.className = "skin-rarity";
      r.textContent = t!.rarity[s.rarity];
      const need = document.createElement("span");
      need.className = "muted small";
      need.textContent = ok ? "" : `${t!.locked}: ${describe(s)}`;
      if (ok && s.unlock.kind !== "free") need.textContent = describe(s);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-glass btn-sm";
      b.disabled = !ok;
      b.textContent = sel === s.id ? t!.inUse : t!.useLabel;
      b.addEventListener("click", () => {
        selectSkin(s.id);
        window.dispatchEvent(new CustomEvent("goshi-skin-change"));
        draw();
      });
      li.append(sw, name, r, need, b);
      grid.append(li);
    }
    // The same choice, as a row of small swatches next to the practice button.
    const quick = document.querySelector<HTMLElement>("[data-skin-quick-list]");
    if (quick) {
      quick.textContent = "";
      for (const s of SKINS) {
        if (!isUnlocked(s, st, held, founder)) continue;
        const b = document.createElement("button");
        b.type = "button";
        b.className = `skin-dot${sel === s.id ? " is-on" : ""}`;
        b.style.background = swatch(s);
        b.title = t!.names[s.id] ?? s.id;
        b.setAttribute("aria-label", t!.names[s.id] ?? s.id);
        b.setAttribute("aria-pressed", String(sel === s.id));
        b.addEventListener("click", () => {
          selectSkin(sel === s.id ? null : s.id);
          window.dispatchEvent(new CustomEvent("goshi-skin-change"));
          draw();
        });
        quick.append(b);
      }
    }
  }

  async function verify() {
    connect.disabled = true;
    note.textContent = t!.verifying;
    try {
      const [{ manager, restoreWallet }, { siwsMessage, bytesToBase58 }, w] = await Promise.all([
        import("../lib/play/wallet-session.ts"), import("../lib/play/protocol.ts"), import("../lib/play/wallet.ts"),
      ]);
      await restoreWallet();
      if (manager.current.status !== "connected") {
        const id = w.WALLET_IDS.find((x) => w.isInstalled(x));
        if (!id) { note.textContent = t!.connect; connect.disabled = false; return; }
        await manager.connect(id);
      }
      const address = (manager.current as { address: string }).address;
      const n = (await (await fetch(`${t!.api}/ideas/nonce`)).json()) as { nonce: string; chain: string };
      const message = siwsMessage({ domain: location.host, address, uri: location.origin, chain: n.chain, nonce: n.nonce, issuedAt: new Date().toISOString() });
      const sig = await manager.signMessage(message);
      const r = await fetch(`${t!.api}/ideas/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: address, message, signature: bytesToBase58(sig) }) });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { balance: number; balanceUsd?: number; founder?: boolean };
      held = j.balanceUsd ?? 0;
      founder = j.founder === true;
      try { sessionStorage.setItem("goshi-founder", founder ? "1" : "0"); } catch { /* optional */ }
      try { sessionStorage.setItem(HELD_KEY, String(held)); } catch { /* optional */ }
      note.textContent = t!.balance.replace("{n}", fmt(Math.round(held)));
      draw();
    } catch {
      note.textContent = t!.notHolder;
    } finally {
      connect.disabled = false;
    }
  }

  connect.hidden = false;
  connect.textContent = t.connect;
  connect.addEventListener("click", () => void verify());
  if (held > 0) note.textContent = t.balance.replace("{n}", fmt(Math.round(held)));
  draw();
  window.addEventListener("goshi-stats-change", draw);
}
