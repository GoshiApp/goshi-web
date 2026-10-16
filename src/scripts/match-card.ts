// One match of the archive as a card: what happened in one line, the "Watch it" button always in sight, and (unfolded) the
// ranking in columns, the explorer link, the records and the in-browser check. Shared by the search page, the profile and the
// global history. Text is written with textContent.
import { dataFromFiles, fetchRoomFiles, mountRoom, type Item, type Strings } from "./match-viewer.ts";
import { verifyMatch } from "../lib/play/proof-check.ts";
import { manager } from "../lib/play/wallet-session.ts";
import { houseSplit } from "../lib/play/prizes.ts";
import { explorerTxUrl, shortAddress, type Cluster } from "../lib/play/config.ts";

export interface Rec {
  roomId: string; at: number; mode: string; cluster: string; tx: string | null; entryFee: string; wallets: string[];
  ranking: { w: string; rank: number; score: number; role: string }[]; proof: any; payout?: any;
}
export interface CardCtx { api: string; rpc: string; cluster: Cluster; t: any; r: any; verifyHref: string; m?: any }

export const el = (tag: string, text = "", cls = ""): HTMLElement => {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
export const link = (href: string, text: string): HTMLAnchorElement => {
  const a = el("a", text, "link-btn") as HTMLAnchorElement;
  a.href = href; a.rel = "noopener noreferrer"; a.target = "_blank";
  return a;
};

const sol = (lamports: string): string => {
  const n = Number(lamports) / 1e9;
  return n >= 1 ? n.toFixed(2) : n.toFixed(n >= 0.01 ? 3 : 4).replace(/0+$/, "").replace(/\.$/, "");
};

/** `global`: the card is in the list of everybody's matches, so the head says what the match was instead of how you did. */
export function renderCard(r: Rec, focus: string | null, ctx: CardCtx, opts: { global?: boolean } = {}): HTMLElement {
  const { api, rpc, t } = ctx;
  const li = el("li", "", "match-card glass");
  const paid = r.ranking.filter((x) => x.role !== "saboteur");
  const mine = focus ? r.ranking.find((x) => x.w === focus) : null;

  const head = el("div", "", "match-head");
  const toggle = el("button", "", "match-toggle") as HTMLButtonElement;
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  const roomText = t.match.replace("{id}", r.roomId.length > 8 ? "…" + r.roomId.slice(-6) : r.roomId);
  const dateText = `${new Date(r.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} · ${r.cluster}`;
  if (opts.global && ctx.m) {
    const m = ctx.m;
    const winner = paid[0] ?? r.ranking[0];
    const modeName = m.modes?.[r.mode] ?? r.mode;
    toggle.append(
      el("span", `${modeName} · ${m.players.replace("{n}", String(r.ranking.length))}${r.entryFee !== "0" ? ` · ${sol(r.entryFee)} SOL` : ""}`, "match-place"),
      el("span", `${m.winner.replace("{w}", winner ? shortAddress(winner.w) : "?")} · ${roomText} · ${dateText}`, "muted small"),
    );
  } else if (mine) {
    const idx = paid.findIndex((x) => x.w === focus);
    toggle.append(
      el("span", t.place.replace("{rank}", String(idx >= 0 ? idx + 1 : mine.rank)).replace("{of}", String(paid.length)), "match-place"),
      el("span", `${roomText} · ${dateText}`, "muted small"),
    );
  } else {
    toggle.append(el("span", roomText, "match-room"), el("span", dateText, "muted small"));
  }
  head.append(toggle);
  const viewer = el("div", "", "mv-inline");
  const body = el("div", "", "match-body");
  body.hidden = true;
  toggle.addEventListener("click", () => {
    body.hidden = !body.hidden;
    toggle.setAttribute("aria-expanded", String(!body.hidden));
  });

  if (r.proof) {
    const watch = el("button", t.watch, "btn btn-gold btn-sm") as HTMLButtonElement;
    watch.type = "button";
    let stopFn: (() => void) | null = null;
    const close = () => { stopFn?.(); stopFn = null; viewer.replaceChildren(); watch.textContent = t.watch; };
    watch.addEventListener("click", async () => {
      if (stopFn) { close(); return; }
      watch.disabled = true;
      const s = manager.current;
      const strings = { ...ctx.r, ...ctx.r.viewer, verifyHref: ctx.verifyHref } as Strings;
      try {
        stopFn = await mountRoom(viewer, r.roomId, { api, t: strings, focus: focus ?? (s.status === "connected" ? s.address : null), onClose: close }, r as unknown as Item);
        watch.textContent = ctx.r.viewer.close;
        viewer.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch { viewer.replaceChildren(el("p", "muted", t.error)); }
      watch.disabled = false;
    });
    head.append(watch);
    // One tap, no need to open the viewer: the whole replay as a single file that works offline (follow and mark any player).
    if (ctx.r.viewer.interactiveShort) {
      const dl = el("button", ctx.r.viewer.interactiveShort, "btn btn-glass btn-sm") as HTMLButtonElement;
      dl.type = "button";
      dl.title = ctx.r.viewer.downloadInteractive ?? "";
      dl.setAttribute("aria-label", ctx.r.viewer.downloadInteractive ?? ctx.r.viewer.interactiveShort);
      dl.addEventListener("click", async () => {
        dl.disabled = true;
        const label = dl.textContent;
        dl.textContent = ctx.r.viewer.preparingFile;
        try {
          const { arena, files } = await fetchRoomFiles(api, r as unknown as Item);
          const d = dataFromFiles(r as unknown as Item, arena, files);
          const { downloadInteractive } = await import("../lib/play/standalone-export.ts");
          await downloadInteractive({
            item: r, arena, files: d.files, t: { ...ctx.r, ...ctx.r.viewer, verifyHref: ctx.verifyHref },
            fileName: `goshi-${r.roomId}-interactive.html`,
          });
          dl.textContent = label;
        } catch {
          dl.textContent = ctx.r.viewer.downloadFailed || label;
        } finally {
          dl.disabled = false;
        }
      });
      head.append(dl);
    }
  }

  // The ranking, compact: three columns on a phone, four on a wide screen.
  const grid = el("ul", "", "match-grid");
  for (const x of r.ranking.slice(0, 12)) {
    const row = el("li", "", `${x.w === focus ? "me" : ""}${x.role === "saboteur" ? " sab" : ""}`.trim());
    const small = el("small");
    small.append(el("b", `#${x.rank}`), ` · ${Math.round(x.score)}`);
    row.append(el("span", shortAddress(x.w)), small);
    grid.append(row);
  }
  body.append(grid);
  // Where the money went, from the record of the match (the same numbers the closing transaction carries).
  const pay = ctx.t.pay as Record<string, string> | undefined;
  const po = r.payout;
  if (pay && po && typeof po.pot === "string") {
    const box = el("div", "", "match-pay");
    box.append(el("h4", pay.title));
    const rows = el("ul", "", "plain match-pay-list");
    const line = (label: string, lamports: string | bigint, strong = false) => {
      const li = el("li", "", strong ? "strong" : "");
      li.append(el("span", label), el("b", `${(Number(lamports) / 1e9).toFixed(5).replace(/0+$/, "").replace(/\.$/, "")} SOL`));
      rows.append(li);
    };
    line(pay.pot, po.pot, true);
    const podium: { w: string; rank: number; lamports: string }[] = Array.isArray(po.podium) ? po.podium : [];
    for (const x of podium) line(`${pay.first.replace("{n}", String(x.rank))} · ${shortAddress(x.w)}`, x.lamports);
    const sabs: { w: string; lamports: string }[] = Array.isArray(po.saboteurs) ? po.saboteurs : [];
    if (sabs.length > 0) line(pay.saboteurs.replace("{n}", String(sabs.length)), sabs[0].lamports);
    if (typeof po.rake === "string" && po.rake !== "0") {
      const hs = houseSplit(BigInt(po.rake));
      line(pay.house, po.rake, true);
      line(pay.burn, hs.burn);
      line(pay.infra, hs.infra);
      line(pay.liquidity, hs.liquidity);
      line(pay.jackpot, hs.jackpot);
    }
    box.append(rows, el("p", pay.note, "muted small"));
    body.append(box);
  }
  const links = el("p", "", "idea-meta small");
  links.append(r.tx ? link(explorerTxUrl(ctx.cluster === "mainnet-beta" || r.cluster === "mainnet-beta" ? "mainnet-beta" : (r.cluster as Cluster), r.tx), t.tx) : el("span", t.noTx, "muted"));
  if (r.proof) links.append(link(`${api}/replay/${encodeURIComponent(r.roomId)}/arena`, t.arenaFile));
  const who = focus ?? paid[0]?.w ?? null;
  if (who && r.proof) links.append(link(`${api}/replay/${encodeURIComponent(r.roomId)}/${encodeURIComponent(who)}`, t.yourFile));
  body.append(links);
  if (r.proof && who) {
    const btn = el("button", t.check, "btn btn-glass btn-sm") as HTMLButtonElement;
    btn.type = "button";
    const out = el("ul", "", "result-list plain");
    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = t.checking;
      const steps = await verifyMatch({ serverHttp: api, rpcUrl: rpc, roomId: r.roomId, wallet: who, proof: r.proof, claimedMass: null, tx: r.tx });
      out.replaceChildren(...steps.map((s) => el("li", `${s.ok === true ? "✓" : s.ok === false ? "✗" : "–"} ${t.steps[s.id]}: ${s.ok === true ? t.ok : s.ok === false ? t.bad : t.unknown}${s.ok !== true && s.detail ? ` (${s.detail})` : ""}`)));
      btn.disabled = false; btn.textContent = t.check;
    });
    body.append(btn, out);
  }
  li.append(head, viewer, body);
  return li;
}
