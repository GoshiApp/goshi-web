// Reads the entry options from the game server without a wallet: open the socket, take the hello, close it.
// Used by the home page and the play page to show "$1 about 0.007 SOL" before anybody connects.

import { decodeServer } from "./protocol.ts";
import { parseFeeOptions, type FeeOption } from "./quick.ts";

export interface FeeInfo { options: FeeOption[]; solUsd: number | null; cluster: string }

const CACHE_KEY = "goshi-fee-options";
const CACHE_MS = 60_000;

/** One cached read per minute per browser session, so moving between pages does not open a socket every time. */
export function fetchFeeOptions(url: string, timeoutMs: number = 7000): Promise<FeeInfo | null> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { at: number; url: string; options: { lamports: string; usd: number }[]; solUsd: number | null; cluster: string };
      if (v.url === url && Date.now() - v.at < CACHE_MS) return Promise.resolve({ options: parseFeeOptions(v.options), solUsd: v.solUsd, cluster: v.cluster });
    }
  } catch { /* no storage */ }
  return new Promise((resolve) => {
    let done = false;
    let ws: WebSocket | null = null;
    const finish = (info: FeeInfo | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws?.close(); } catch { /* already closed */ }
      resolve(info);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      ws = new WebSocket(url);
    } catch {
      finish(null);
      return;
    }
    ws.onmessage = (ev) => {
      const m = decodeServer(ev.data);
      if (!m || m.t !== "hello") return;
      const options = parseFeeOptions(m.feeOptions ?? []);
      const info: FeeInfo = { options, solUsd: m.solUsd ?? null, cluster: m.cluster };
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          at: Date.now(), url, options: options.map((o) => ({ lamports: o.lamports.toString(), usd: o.usd })), solUsd: info.solUsd, cluster: info.cluster,
        }));
      } catch { /* private mode */ }
      finish(options.length ? info : null);
    };
    ws.onerror = () => finish(null);
    ws.onclose = () => finish(null);
  });
}
