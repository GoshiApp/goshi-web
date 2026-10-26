// The season ranking of the cash arenas: who won the most SOL (net of entries), from the server's ledger, with the time left.
const box = document.getElementById("season-board");
if (box) {
  const api = box.dataset.api ?? "";
  const t = JSON.parse(box.dataset.t ?? "{}") as Record<string, string>;
  const sub = box.querySelector<HTMLElement>("[data-season-sub]")!;
  const list = box.querySelector<HTMLOListElement>("[data-season-list]")!;
  const short = (w: string) => `${w.slice(0, 4)}..${w.slice(-4)}`;
  const sol = (l: number) => (l / 1e9).toFixed(4);
  let to = 0;
  const left = () => {
    const ms = to - Date.now();
    if (ms <= 0) return t.ended ?? "";
    const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000);
    return (t.sub ?? "").replace("{d}", (t.days ?? "{d} d {h} h").replace("{d}", String(d)).replace("{h}", String(h)));
  };
  const load = async () => {
    try {
      const j = (await (await fetch(`${api}/leaderboard`, { signal: AbortSignal.timeout(15_000) })).json()) as { season: { to: number }; rows: { wallet: string; net: number; won: number; cashouts: number; best: number }[] };
      to = j.season.to;
      sub.textContent = left();
      list.replaceChildren();
      if (!j.rows.length) { const li = document.createElement("li"); li.className = "muted"; li.textContent = t.empty ?? ""; list.append(li); return; }
      j.rows.slice(0, 20).forEach((r, i) => {
        const li = document.createElement("li");
        li.className = `season-row${i < 10 ? " is-top" : ""}`;
        const who = document.createElement("span"); who.className = "season-who"; who.textContent = `${i + 1}. ${short(r.wallet)}`;
        const net = document.createElement("strong"); net.className = r.net >= 0 ? "is-gain" : "is-loss"; net.textContent = `${r.net >= 0 ? "+" : ""}${sol(r.net)} SOL ${t.net ?? ""}`;
        const more = document.createElement("span"); more.className = "season-more"; more.textContent = `${t.best ?? ""} ${r.best.toFixed(2)}x · ${r.cashouts} ${t.outs ?? ""}`;
        li.append(who, net, more);
        list.append(li);
      });
    } catch { /* keep what is shown; the next refresh tries again */ }
  };
  void load();
  setInterval(() => void load(), 60_000);
  setInterval(() => { if (to) sub.textContent = left(); }, 30_000);
}
