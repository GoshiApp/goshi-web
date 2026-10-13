// The global history: everybody's matches, newest first, from the archive of the game server (GET /matches/recent).
// Same cards as the search page: ranking, "Watch it" (the viewer opens inside the card), records and the in-browser check.
import { renderCard, type Rec, type CardCtx } from "./match-card.ts";
import type { Cluster } from "../lib/play/config.ts";

const boot = JSON.parse(document.getElementById("matches-data")?.textContent ?? "null") as
  { api: string; rpc: string; cluster: Cluster; t: any; r: any; m: any; verifyHref: string } | null;
if (boot) {
  const { api, m } = boot;
  const ctx: CardCtx = { api, rpc: boot.rpc, cluster: boot.cluster, t: boot.t, r: boot.r, verifyHref: boot.verifyHref, m };
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const list = $("matches-list"), msg = $("matches-msg"), more = $<HTMLButtonElement>("matches-more");
  const chips = [...document.querySelectorAll<HTMLButtonElement>("#matches-filter [data-mode]")];
  let mode = "", next: number | null = null, shown = 0, busy = false, gen = 0;

  async function load(reset: boolean) {
    if (busy) return;
    busy = true;
    const mine = ++gen;
    if (reset) { list.textContent = ""; shown = 0; next = null; more.hidden = true; }
    msg.textContent = m.loading;
    try {
      const qs = new URLSearchParams({ limit: "15" });
      if (mode) qs.set("mode", mode);
      if (!reset && next !== null) qs.set("before", String(next));
      const r = await fetch(`${api}/matches/recent?${qs}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { items: Rec[]; next: number | null };
      if (mine !== gen) return;
      for (const it of j.items) list.append(renderCard(it, null, ctx, { global: true }));
      shown += j.items.length;
      next = j.next;
      msg.textContent = shown === 0 ? m.empty : m.shown.replace("{n}", String(shown));
      more.hidden = next === null;
    } catch {
      msg.textContent = m.error;
    } finally {
      busy = false;
    }
  }

  chips.forEach((c) => c.addEventListener("click", () => {
    mode = c.dataset.mode ?? "";
    chips.forEach((x) => x.classList.toggle("on", x === c));
    void load(true);
  }));
  $("matches-refresh").addEventListener("click", () => void load(true));
  more.addEventListener("click", () => void load(false));
  void load(true);
}
