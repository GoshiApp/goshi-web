// The community board. Anyone proposes a game, attaches screenshots and votes. No account, no wallet: the browser keeps a
// random id in its own storage and sends it with each vote, the server keeps a short hash of it. Text is always written with
// textContent, never as HTML.
interface Idea { id: string; title: string; text: string; at: number; status: string; up: number; down: number; net: number; images: number; mine: number }
interface T {
  formH2: string; submit: string; sending: string; thanks: string; imagesRemove: string;
  errors: Record<"short" | "image" | "tooMany" | "network" | "full", string>;
  status: Record<string, string>; empty: string; loading: string; offline: string; count: string;
  gate: Record<"title" | "text" | "connect" | "install" | "signing" | "ok" | "notHolder" | "rpc" | "sessionLost" | "tokenLink", string>;
  up: string; down: string; report: string; reported: string; showImages: string; hideImages: string;
}

const boot = JSON.parse(document.getElementById("ideas-data")?.textContent ?? "null") as { api: string; t: T; tokenHref: string } | null;
if (boot) {
  const { api, t, tokenHref } = boot;
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
  const form = $<HTMLFormElement>("idea-form");
  const msg = $("idea-msg");
  const submit = $<HTMLButtonElement>("idea-submit");
  const list = $<HTMLUListElement>("idea-list");
  const thumbs = $<HTMLUListElement>("idea-thumbs");
  const files = $<HTMLInputElement>("idea-files");
  const sortSel = $<HTMLSelectElement>("idea-sort");
  const statusSel = $<HTMLSelectElement>("idea-status");
  const count = $("idea-count");

  // A random id that only lives in this browser. Without storage (private mode) it lasts for the page.
  const voter = (() => {
    const key = "goshi-voter";
    try {
      let v = localStorage.getItem(key);
      if (!v || !/^[A-Za-z0-9_-]{16,64}$/.test(v)) {
        v = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
        localStorage.setItem(key, v);
      }
      return v;
    } catch {
      return Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
    }
  })();

  const say = (s: string, bad = false) => { msg.textContent = s; msg.dataset.bad = bad ? "1" : "0"; };

  // ───────── images: shrink in the browser until each is small enough ─────────
  const picked: string[] = [];
  async function shrink(file: File): Promise<string | null> {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return null;
    try {
      const bmp = await createImageBitmap(file);
      let w = bmp.width, h = bmp.height;
      const scale = Math.min(1, 1280 / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
      const c = document.createElement("canvas");
      for (let q = 0.82, step = 0; step < 6; step++, q -= 0.1) {
        c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
        const url = c.toDataURL("image/jpeg", Math.max(q, 0.3));
        if (Math.floor((url.length - 23) * 0.75) <= 270_000) return url;
        w = Math.round(w * 0.8); h = Math.round(h * 0.8);
      }
    } catch { /* falls through */ }
    return null;
  }
  function renderThumbs() {
    thumbs.textContent = "";
    picked.forEach((src, i) => {
      const li = document.createElement("li");
      const img = document.createElement("img");
      img.src = src; img.alt = "";
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn btn-glass small"; b.textContent = t.imagesRemove;
      b.addEventListener("click", () => { picked.splice(i, 1); renderThumbs(); });
      li.append(img, b);
      thumbs.append(li);
    });
  }
  files.addEventListener("change", async () => {
    say("");
    for (const f of Array.from(files.files ?? [])) {
      if (picked.length >= 3) break;
      const d = await shrink(f);
      if (d) picked.push(d); else say(t.errors.image, true);
    }
    files.value = "";
    renderThumbs();
  });


  // ───────── holder gate (only when the server asks for it) ─────────
  let gateOn = false;
  let session = "";
  let holder = true;
  const gateBox = $("idea-gate");
  const gateText = $("idea-gate-text");
  const gateActions = $("idea-gate-actions");
  const gateMsg = $("idea-gate-msg");
  const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString();

  function drawGate(extra = "") {
    gateActions.textContent = "";
    gateMsg.textContent = extra;
    form.querySelectorAll<HTMLElement>("input, textarea, button").forEach((el) => { if (el.id !== "idea-files") (el as HTMLInputElement).disabled = !holder; });
    form.classList.toggle("is-locked", !holder);
    if (!gateOn || holder) return;
    void (async () => {
      const w = await import("../lib/play/wallet.ts");
      for (const id of w.WALLET_IDS) {
        const a = document.createElement(w.isInstalled(id) ? "button" : "a");
        a.className = "btn btn-gold";
        if (a instanceof HTMLButtonElement) {
          a.type = "button";
          a.textContent = `${t.gate.connect} ${w.WALLET_NAMES[id]}`;
          a.addEventListener("click", () => void connectAndVerify(id));
        } else {
          a.setAttribute("href", w.WALLET_INSTALL_URLS[id]);
          a.setAttribute("rel", "noopener noreferrer");
          a.textContent = `${t.gate.install} ${w.WALLET_NAMES[id]}`;
          a.className = "btn btn-glass";
        }
        gateActions.append(a);
      }
      const tl = document.createElement("a");
      tl.className = "btn btn-glass"; tl.href = tokenHref; tl.textContent = t.gate.tokenLink;
      gateActions.append(tl);
    })();
  }

  async function connectAndVerify(id: "phantom" | "solflare") {
    try {
      const [{ manager }, { siwsMessage, bytesToBase58 }] = await Promise.all([import("../lib/play/wallet-session.ts"), import("../lib/play/protocol.ts")]);
      if (manager.current.status !== "connected") await manager.connect(id);
      const address = (manager.current as { address: string }).address;
      const n = (await (await fetch(`${api}/ideas/nonce`)).json()) as { nonce: string; chain: string };
      const message = siwsMessage({ domain: location.host, address, uri: location.origin, chain: n.chain, nonce: n.nonce, issuedAt: new Date().toISOString() });
      gateMsg.textContent = t.gate.signing;
      const sig = await manager.signMessage(message);
      const r = await fetch(`${api}/ideas/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: address, message, signature: bytesToBase58(sig) }) });
      if (r.status === 502) return drawGate(t.gate.rpc);
      if (!r.ok) return drawGate(t.errors.network);
      const j = (await r.json()) as { token: string; holder: boolean; balance: number; balanceUsd: number; minUsd: number };
      session = j.token;
      holder = j.holder;
      try { sessionStorage.setItem("goshi-ideas-session", JSON.stringify({ token: j.token, holder: j.holder, balance: j.balance })); } catch { /* optional */ }
      drawGate(j.holder ? t.gate.ok.replace("{balance}", fmt(j.balanceUsd)) : t.gate.notHolder.replace("{balance}", fmt(j.balanceUsd)).replace("{min}", fmt(j.minUsd)));
      if (j.holder) { gateBox.hidden = false; await load(); }
    } catch {
      drawGate(t.errors.network);
    }
  }

  async function initGate() {
    try {
      const g = (await (await fetch(`${api}/ideas/gate`)).json()) as { on: boolean; minUsd: number };
      gateOn = g.on;
      if (!gateOn) return;
      gateText.textContent = t.gate.text.replace("{min}", fmt(g.minUsd));
      gateBox.hidden = false;
      try {
        const saved = JSON.parse(sessionStorage.getItem("goshi-ideas-session") ?? "null");
        if (saved?.token) { session = saved.token; holder = saved.holder === true; }
        else holder = false;
      } catch { holder = false; }
      drawGate(holder ? t.gate.ok.replace("{balance}", "") : "");
    } catch { /* the gate endpoint is down: the board stays read only through the list */ }
  }
  const who = () => (gateOn ? { session } : { voter });
  const needHolder = (): boolean => {
    if (gateOn && !holder) { gateBox.scrollIntoView({ block: "center" }); return true; }
    return false;
  };

  // ───────── list ─────────
  const when = (ms: number) => new Date(ms).toLocaleDateString(document.documentElement.lang || undefined, { day: "numeric", month: "short", year: "numeric" });
  const reported = new Set<string>();

  async function vote(i: Idea, v: 1 | -1) {
    if (needHolder()) return;
    const next = i.mine === v ? 0 : v;
    try {
      const r = await fetch(`${api}/ideas/${i.id}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...who(), v: next }) });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { idea: Idea };
      Object.assign(i, j.idea);
      draw(items);
    } catch { /* the list stays as it was */ }
  }

  function card(i: Idea): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "idea glass";
    li.id = i.id;
    const rail = document.createElement("div");
    rail.className = "idea-vote";
    const up = document.createElement("button");
    up.type = "button"; up.className = "vote-btn"; up.setAttribute("aria-label", t.up); up.setAttribute("aria-pressed", String(i.mine === 1)); up.textContent = "▲";
    const net = document.createElement("b");
    net.textContent = String(i.net);
    const down = document.createElement("button");
    down.type = "button"; down.className = "vote-btn"; down.setAttribute("aria-label", t.down); down.setAttribute("aria-pressed", String(i.mine === -1)); down.textContent = "▼";
    up.addEventListener("click", () => void vote(i, 1));
    down.addEventListener("click", () => void vote(i, -1));
    rail.append(up, net, down);

    const body = document.createElement("div");
    body.className = "idea-body";
    const h = document.createElement("h3");
    h.textContent = i.title;
    const badge = document.createElement("span");
    badge.className = `idea-status st-${i.status}`;
    badge.textContent = t.status[i.status] ?? i.status;
    const head = document.createElement("div");
    head.className = "idea-head";
    head.append(h, badge);
    const p = document.createElement("p");
    p.className = "idea-text";
    p.textContent = i.text;
    const meta = document.createElement("div");
    meta.className = "idea-meta muted small";
    const date = document.createElement("span");
    date.textContent = `${when(i.at)} · ▲ ${i.up} · ▼ ${i.down}`;
    meta.append(date);
    const gal = document.createElement("div");
    gal.className = "idea-gallery";
    if (i.images > 0) {
      const tog = document.createElement("button");
      tog.type = "button"; tog.className = "link-btn"; tog.textContent = `${t.showImages} (${i.images})`;
      let open = false;
      tog.addEventListener("click", async () => {
        open = !open;
        tog.textContent = open ? t.hideImages : `${t.showImages} (${i.images})`;
        gal.textContent = "";
        if (!open) return;
        try {
          const r = await fetch(`${api}/ideas/${i.id}/images`);
          const j = (await r.json()) as { images: string[] };
          for (const s of j.images) {
            const img = document.createElement("img");
            img.src = s; img.alt = i.title; img.loading = "lazy";
            gal.append(img);
          }
        } catch { gal.textContent = t.offline; }
      });
      meta.append(tog);
    }
    const rep = document.createElement("button");
    rep.type = "button"; rep.className = "link-btn";
    const done = reported.has(i.id);
    rep.textContent = done ? t.reported : t.report;
    rep.disabled = done;
    rep.addEventListener("click", async () => {
      reported.add(i.id); rep.textContent = t.reported; rep.disabled = true;
      try { await fetch(`${api}/ideas/${i.id}/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(who()) }); } catch { /* best effort */ }
    });
    meta.append(rep);
    body.append(head, p, meta, gal);
    li.append(rail, body);
    return li;
  }

  let items: Idea[] = [];
  function draw(rows: Idea[]) {
    list.textContent = "";
    if (rows.length === 0) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = t.empty;
      list.append(li);
    } else for (const i of rows) list.append(card(i));
    count.textContent = t.count.replace("{n}", String(rows.length));
  }

  async function load() {
    list.textContent = "";
    const li = document.createElement("li"); li.className = "muted"; li.textContent = t.loading; list.append(li);
    try {
      const q = new URLSearchParams({ sort: sortSel.value, status: statusSel.value, v: voter, limit: "100" });
      if (gateOn && session) q.set("s", session);
      const r = await fetch(`${api}/ideas?${q}`);
      if (!r.ok) throw new Error(String(r.status));
      items = ((await r.json()) as { items: Idea[] }).items;
      draw(items);
      const hash = decodeURIComponent(location.hash.slice(1));
      if (hash && /^[A-Za-z0-9_-]{6,20}$/.test(hash)) document.getElementById(hash)?.scrollIntoView({ block: "center" });
    } catch {
      list.textContent = "";
      const e = document.createElement("li"); e.className = "muted"; e.textContent = t.offline; list.append(e);
    }
  }
  sortSel.addEventListener("change", () => void load());
  statusSel.addEventListener("change", () => void load());

  // ───────── submit ─────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (needHolder()) return;
    const fd = new FormData(form);
    const title = String(fd.get("title") ?? "").trim();
    const text = String(fd.get("text") ?? "").trim();
    if (title.length < 4 || text.length < 20) return say(t.errors.short, true);
    submit.disabled = true;
    submit.textContent = t.sending;
    say("");
    try {
      const r = await fetch(`${api}/ideas`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...who(), title, text, images: picked, website: String(fd.get("website") ?? "") }),
      });
      if (r.status === 429) say(t.errors.tooMany, true);
      else if (r.status === 503) say(t.errors.full, true);
      else if (r.status === 403) { const e = (await r.json().catch(() => ({}))).error; holder = false; session = e === "session" ? "" : session; drawGate(t.gate.sessionLost); }
      else if (r.status === 400) say((await r.json().catch(() => ({}))).error === "image" ? t.errors.image : t.errors.short, true);
      else if (!r.ok) say(t.errors.network, true);
      else {
        form.reset();
        picked.length = 0;
        renderThumbs();
        say(t.thanks);
        sortSel.value = "new";
        await load();
        document.getElementById("ideas-board")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch {
      say(t.errors.network, true);
    } finally {
      submit.disabled = false;
      submit.textContent = t.submit;
    }
  });

  void initGate().then(() => load());
}
