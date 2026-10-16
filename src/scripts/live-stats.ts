import { visitorId } from "../lib/play/visitor.ts";
// Fills the live ticker from the game server. One read-only socket, closed when the tab is hidden.
import { decodeServer } from "../lib/play/protocol.ts";

const root = document.querySelector<HTMLElement>("[data-ticker]");
if (root && root.dataset.server) {
  const url = root.dataset.server;
  let ws: WebSocket | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const set = (sel: string, text: string) => {
    const el = root.querySelector<HTMLElement>(sel);
    if (el) el.textContent = text;
  };
  const money = (n: number) => (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 1 ? n.toFixed(2) : n.toFixed(4));
  const sol = (lamports: string) => {
    const v = Number(BigInt(lamports) / 1_000_000n) / 1000;
    return v >= 100 ? v.toFixed(0) : v.toFixed(2);
  };
  const close = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    ws?.close();
    ws = null;
  };
  const open = () => {
    if (ws || document.visibilityState === "hidden") return;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    const mine = ws;
    mine.onopen = () => {
      attempt = 0;
      root.classList.remove("offline");
      // One visit per browser tab session: a reload in the same tab does not count again. Only a number is sent and kept.
      let visit = false;
      try {
        // The tab is marked as counted only when the server says so (below): a failed connection must not lose the visit.
        if (sessionStorage.getItem("goshi-visit") !== "1") visit = true;
      } catch {
        // Storage blocked: the page still works, the visit is simply not counted.
      }
      // The team's own browsers (opened once with ?team=1) are never counted. Everybody else sends a random id that stays in
      // their browser; the server keeps only a hash of it for the day, so reloads and reopenings are one visitor.
      const vid = visitorId();
      if (!vid) visit = false;
      // The id travels with every stats subscription (to count tabs of one browser as one person); `visit` only on the first.
      mine.send(JSON.stringify({ t: "stats", on: true, ...(vid ? { vid } : {}), ...(visit && vid ? { visit: true } : {}) }));
    };
    mine.onmessage = (ev) => {
      const m = decodeServer(ev.data);
      if (!m || m.t !== "stats") return;
      if (m.counted === true) { try { sessionStorage.setItem("goshi-visit", "1"); } catch { /* optional */ } }
      const bar = root.querySelector<HTMLElement>("[data-maint]");
      if (bar) {
        const mt = m.maintenance;
        if (mt && (mt.state === "soon" || mt.state === "draining" || mt.state === "down")) {
          const when = new Date(mt.state === "down" ? mt.endsAt : mt.startsAt);
          // While down, only the expected hour is shown, in Spain time (the team's), without a date.
          const at = mt.state === "down"
            ? when.toLocaleTimeString(document.documentElement.lang || undefined, { timeStyle: "short", timeZone: "Europe/Madrid" })
            : when.toLocaleString(document.documentElement.lang || undefined, { dateStyle: "short", timeStyle: "short" });
          const tpl = root.dataset[`maint${mt.state[0].toUpperCase()}${mt.state.slice(1)}`] ?? "";
          bar.textContent = tpl.replace("{time}", at);
          bar.hidden = false;
          bar.dataset.state = mt.state;
        } else {
          bar.hidden = true;
        }
      }
      set('[data-stat="online"]', String(m.online));
      set('[data-stat="playing"]', String(m.playing));
      if (typeof m.visits === "number") set('[data-stat="visits"]', m.visits.toLocaleString("en-US"));
      if (typeof m.wallets === "number") set('[data-stat="wallets"]', m.wallets.toLocaleString("en-US"));
      set('[data-stat="matches"]', String(m.matches));
      set('[data-stat="volume"]', sol(m.volume));
      if (m.prices) for (const [s, v] of Object.entries(m.prices.usd)) set(`[data-price="${s}"]`, `$${money(v)}`);
    };
    mine.onclose = () => {
      if (ws === mine) ws = null;
      root.classList.add("offline");
      if (document.visibilityState === "hidden") return;
      attempt++;
      timer = setTimeout(open, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
    };
    mine.onerror = () => mine.close();
  };
  document.addEventListener("visibilitychange", () => (document.visibilityState === "hidden" ? close() : open()));
  open();
}
