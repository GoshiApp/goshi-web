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
      mine.send(JSON.stringify({ t: "stats", on: true }));
    };
    mine.onmessage = (ev) => {
      const m = decodeServer(ev.data);
      if (!m || m.t !== "stats") return;
      set('[data-stat="online"]', String(m.online));
      set('[data-stat="playing"]', String(m.playing));
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
