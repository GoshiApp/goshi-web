// Fills the "next games" card of the home with the three most voted community ideas. Read only, no account, no tracking.
const data = JSON.parse(document.getElementById("games-hub-data")?.textContent ?? "null") as { api: string; empty: string; ideasHref: string } | null;
const list = document.querySelector<HTMLOListElement>("[data-top-ideas]");
if (data && list) {
  void (async () => {
    try {
      const r = await fetch(`${data.api}/ideas?sort=top&limit=3`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { items: { id: string; title: string; net: number }[] };
      list.textContent = "";
      if (j.items.length === 0) {
        const li = document.createElement("li");
        li.className = "muted";
        li.textContent = data.empty;
        list.append(li);
        return;
      }
      for (const it of j.items) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `${data.ideasHref}#${it.id}`;
        a.textContent = it.title;
        const n = document.createElement("span");
        n.className = "top-net";
        n.textContent = (it.net > 0 ? "+" : "") + it.net;
        li.append(a, n);
        list.append(li);
      }
    } catch {
      list.textContent = "";
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = data.empty;
      list.append(li);
    }
  })();
}
