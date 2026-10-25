// The VAR of the cash arena: the clips the game server recorded (GET /var/recent), played on a big screen with the game's own
// painter, checked against their SHA-256 fingerprint in the browser, and easy to share (a link that opens the clip, or a post on X).
import { ArenaPainter } from "../lib/play/arena-paint.ts";

interface Summary { id: string; at: number; victim: string; by: string; kind: "eliminated" | "cashout"; bag: number; entry: number; hash: string; paySig?: string; spot?: [number, number] }
type Body = [string, number, number, number, number, number, number, number[]];
interface Clip extends Summary { names: Record<string, string>; skins?: Record<string, string>; frames: { t: number; b: Body[]; o?: number[] }[] }

const box = document.getElementById("var-board");
if (box) {
  const api = box.dataset.api ?? "";
  const t = JSON.parse(box.dataset.t ?? "{}") as Record<string, string>;
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const list = $("var-list") as HTMLUListElement;
  const canvas = $("var-canvas") as HTMLCanvasElement;
  const g = canvas.getContext("2d")!;
  const painter = new ArenaPainter();
  const short = (w: string) => (w.length > 12 ? `${w.slice(0, 4)}..${w.slice(-4)}` : w);
  const sol = (l: number) => (l / 1e9).toFixed(9);
  const mult = (s: Summary) => (s.entry > 0 ? ` · ${(s.bag / s.entry).toFixed(2)}x` : "");
  const headline = (s: Summary, names?: Record<string, string>) =>
    (s.kind === "cashout" ? t.cashout : t.eliminated).replace("{victim}", names?.[s.victim] ?? short(s.victim)).replace("{bag}", sol(s.bag)) + (s.kind === "cashout" ? mult(s) : "");
  let playing = 0;
  let all: Summary[] = [];
  let tab = "mine";

  // An idle screen: the arena floor, waiting for a clip.
  const idle = () => { g.fillStyle = "#0b0f1e"; g.fillRect(0, 0, canvas.width, canvas.height); };
  idle();

  const verify = async (c: Clip): Promise<boolean> => {
    // The payout signature is added after the clip was fingerprinted, so it is left out of the check.
    const { hash, paySig: _pay, ...rest } = c;
    const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rest))));
    return [...d].map((x) => x.toString(16).padStart(2, "0")).join("") === hash;
  };

  const shareUrl = (id: string) => `${location.origin}${location.pathname}?var=${encodeURIComponent(id)}#var-board`;

  const play = async (id: string) => {
    const r = await fetch(`${api}/var/${id}`);
    if (!r.ok) { $("var-title").textContent = t.empty; return; }
    const c = (await r.json()) as Clip;
    const ok = await verify(c);
    const title = $("var-title");
    title.textContent = headline(c, c.names);
    title.className = `var-title ${c.kind === "cashout" ? "is-win" : "is-loss"}`;
    $("var-sub").textContent = `${new Date(c.at).toLocaleString()}${c.kind === "eliminated" && c.by && c.by !== "zone" ? ` · ${t.by.replace("{by}", c.names[c.by] ?? short(c.by))}` : ""}`;
    const badge = $("var-badge");
    badge.hidden = false;
    badge.textContent = ok ? `✓ ${c.hash.slice(0, 10)}` : "✗";
    badge.className = `var-badge ${ok ? "ok" : "bad"}`;
    badge.title = ok ? t.hashOk : t.hashBad;
    // Share: the phone's own sheet when there is one, else the link is copied; and a ready post for X.
    $("var-actions").hidden = false;
    const url = shareUrl(c.id);
    const text = t.shareText.replace("{what}", headline(c, c.names));
    const share = $("var-share") as HTMLButtonElement;
    share.onclick = async () => {
      try {
        if (navigator.share) await navigator.share({ text, url });
        else { await navigator.clipboard.writeText(`${text} ${url}`); $("var-msg").textContent = t.copied; }
      } catch { /* the person closed the sheet */ }
    };
    // A cash out: its payout on chain, on Solscan.
    const pay = document.getElementById("var-pay") as HTMLAnchorElement | null;
    if (pay) { pay.hidden = !c.paySig; if (c.paySig) { pay.href = `https://solscan.io/tx/${c.paySig}?cluster=devnet`; pay.textContent = `${t.solscan} · ${c.paySig.slice(0, 8)}…`; } }
    ($("var-x") as HTMLAnchorElement).href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    painter.setSkins(c.skins ?? {}, null);
    const run = ++playing;
    const t0 = c.frames[0].t, tEnd = c.frames[c.frames.length - 1].t;
    // The player: it starts 15 s before the end (the moment that matters), plays at the chosen speed, and the bar moves it anywhere.
    // Ten seconds: it starts at the beginning (eight before, two after).
    let vt = t0;
    let speed = 1;
    let paused = false;
    let last = performance.now();
    const seek = $("var-seek") as HTMLInputElement, playBtn = $("var-playpause") as HTMLButtonElement, speedSel = $("var-speed") as HTMLSelectElement, clock = $("var-clock");
    $("var-controls").hidden = false;
    seek.min = "0"; seek.max = String(tEnd - t0); seek.step = "100";
    const paintBtn = () => { playBtn.textContent = paused ? "\u25B6" : "\u275A\u275A"; playBtn.setAttribute("aria-pressed", String(!paused)); };
    paintBtn();
    playBtn.onclick = () => { if (vt >= tEnd) vt = t0; paused = !paused; paintBtn(); };
    speedSel.value = "1";
    speedSel.onchange = () => { speed = Number(speedSel.value) || 1; };
    seek.oninput = () => { vt = t0 + Number(seek.value); };
    const fmt = (ms: number) => { const sec = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
    const tick = (now: number) => {
      if (run !== playing) return;
      const dt = now - last; last = now;
      if (!paused) { vt = Math.min(tEnd, vt + dt * speed); if (vt >= tEnd) { paused = true; paintBtn(); } }
      if (document.activeElement !== seek) seek.value = String(vt - t0);
      clock.textContent = `${fmt(vt - t0)} / ${fmt(tEnd - t0)}`;
      let i = 0;
      while (i + 1 < c.frames.length && c.frames[i + 1].t <= vt) i++;
      const f = c.frames[i];
      const players = f.b.map((b) => {
        const pts: [number, number][] = [];
        for (let k = 0; k + 1 < b[7].length; k += 2) pts.push([b[7][k], b[7][k + 1]]);
        return { w: b[0], n: c.names[b[0]] ?? short(b[0]), role: "paid" as const, bot: false, alive: b[6] === 1 || (c.kind === "cashout" && b[0] === c.victim), zout: false, prot: false, h: 0, m: b[4], r: b[3], head: [b[1], b[2]] as [number, number], body: pts };
      });
      // The coins of that moment (older clips have none recorded).
      const orbs = new Map<number, { id: number; x: number; y: number; v: number; l?: number; c?: string; q?: number }>();
      const o = f.o ?? [];
      for (let k = 0; k + 3 < o.length; k += 4) orbs.set(k, { id: k, x: o[k], y: o[k + 1], v: o[k + 2], ...(o[k + 3] > 0 ? { l: o[k + 3], c: "SOL", q: o[k + 3] / 1e9 } : {}) });
      const me = f.b.find((b) => b[0] === c.victim) ?? f.b[0];
      painter.frame({
        bare: true, g, W: canvas.width, H: canvas.height, dpr: 1, ui: 1.3, now, players, zone: { cx: 1500, cy: 1500, r: 99999 }, orbs,
        world: { w: 3000, h: 3000 }, you: c.victim, cam: { x: me?.[1] ?? 1500, y: me?.[2] ?? 1500 }, scale: 1.1, shake: [0, 0],
        meAlive: false, myMass: 0, boosting: false, protectLeft: 0, hasState: true, reduced: true, floaters: [],
        strings: { you: "", protectedHint: "", backToZone: "", countdown: "", finalZone: "", nextZone: "", nitro: "", mass: "" },
      } as never);
      // The moment it happened: a red ring on the spot and why, for the two seconds after.
      if (c.spot && vt >= c.at) {
        const sc = 1.1, cx = me?.[1] ?? 1500, cy = me?.[2] ?? 1500;
        const x = canvas.width / 2 + (c.spot[0] - cx) * sc, y = canvas.height / 2 + (c.spot[1] - cy) * sc;
        const pulse = 0.5 + 0.5 * Math.sin(now / 110);
        g.strokeStyle = c.kind === "cashout" ? `rgba(125,255,176,${0.6 + 0.4 * pulse})` : `rgba(255,59,59,${0.6 + 0.4 * pulse})`;
        g.lineWidth = 6;
        g.beginPath(); g.arc(x, y, 46 + pulse * 10, 0, Math.PI * 2); g.stroke();
        const why = c.kind === "cashout" ? t.causeCashout : c.by === "zone" ? t.causeZone : c.by === "wall" ? t.causeWall : (t.causeBody ?? "").replace("{by}", c.names[c.by] ?? short(c.by));
        g.font = "900 30px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "bottom";
        g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.75)"; g.strokeText(why, x, y - 64);
        g.fillStyle = c.kind === "cashout" ? "#7dffb0" : "#ff4a4a"; g.fillText(why, x, y - 64);
      }
      // A small corner tag: VAR, the speed and the time left.
      g.fillStyle = "rgba(10,12,30,0.75)"; g.fillRect(16, 16, 250, 40);
      g.fillStyle = "#ff4a4a"; g.font = "900 24px system-ui, sans-serif"; g.textBaseline = "middle"; g.textAlign = "left";
      g.fillText(`VAR · ${speed}x · -${((tEnd - vt) / 1000).toFixed(1)} s`, 26, 36);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const card = (s: Summary): HTMLLIElement => {
    const li = document.createElement("li");
    li.className = `var-card ${s.kind === "cashout" ? "is-win" : "is-loss"}`;
    const icon = document.createElement("span");
    icon.className = "var-icon";
    icon.textContent = s.kind === "cashout" ? "↑" : "✕";
    const body = document.createElement("div");
    const amount = document.createElement("p");
    amount.className = "var-amount";
    amount.textContent = `${s.kind === "cashout" ? "+" : ""}${sol(s.bag)} SOL${s.kind === "cashout" ? mult(s) : ""}`;
    const what = document.createElement("p");
    what.className = "var-what";
    what.textContent = `${headline(s)} · ${new Date(s.at).toLocaleTimeString()}`;
    body.append(amount, what);
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn btn-glass btn-sm"; b.textContent = t.watch;
    b.addEventListener("click", () => { box.querySelector(".var-stage")?.scrollIntoView({ block: "start", behavior: "smooth" }); void play(s.id); });
    li.append(icon, body, b);
    return li;
  };

  const mine = (): Summary[] => {
    try { return (JSON.parse(localStorage.getItem("goshi-var-history") ?? "[]") as Summary[]).map((s) => ({ ...s, victim: s.victim ?? "", by: s.by ?? "", entry: s.entry ?? 0 })); } catch { return []; }
  };
  const render = () => {
    const items = tab === "mine" ? mine() : tab === "cashout" ? all.filter((s) => s.kind === "cashout") : all;
    list.textContent = "";
    for (const s of items) list.append(card(s));
    const empty = $("var-empty");
    empty.hidden = items.length > 0;
    empty.textContent = tab === "mine" ? t.emptyMine : t.empty;
  };
  for (const b of Array.from(box.querySelectorAll<HTMLButtonElement>("[data-var-tab]"))) {
    b.addEventListener("click", () => {
      tab = b.dataset.varTab ?? "all";
      for (const x of Array.from(box.querySelectorAll("[data-var-tab]"))) x.classList.toggle("on", x === b);
      render();
    });
  }
  // With no clips of your own yet, start on every clip.
  if (!mine().length) { tab = "all"; for (const x of Array.from(box.querySelectorAll<HTMLElement>("[data-var-tab]"))) x.classList.toggle("on", x.dataset.varTab === "all"); }

  void (async () => {
    try {
      const r = await fetch(`${api}/var/recent?limit=60`);
      all = ((await r.json()) as { items: Summary[] }).items;
    } catch { all = []; }
    render();
    // A shared link (?var=<id>) opens that clip; otherwise the newest cash out (or the newest clip) is ready to watch.
    const asked = new URLSearchParams(location.search).get("var");
    if (asked && /^[0-9a-z-]{6,40}$/.test(asked)) { box.querySelector(".var-stage")?.scrollIntoView({ block: "start" }); void play(asked); }
    else { const first = all.find((s) => s.kind === "cashout") ?? all[0]; if (first) void play(first.id); }
  })();
}
