// The entry of the downloaded replay page: it reads the match from the page itself and mounts the same viewer as the site.
// Built by scripts/build-standalone.mjs into public/standalone/viewer.js (one file, no imports at run time).
import { dataFromFiles, mountData, type Item, type Strings } from "../scripts/match-viewer.ts";
import type { ReplayPayload } from "../lib/play/standalone-export.ts";

(globalThis as { __GOSHI_STANDALONE__?: boolean }).__GOSHI_STANDALONE__ = true;

const b64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const app = document.getElementById("replay");
const raw = document.getElementById("goshi-data")?.textContent;
if (app && raw) {
  const p = JSON.parse(raw) as ReplayPayload;
  const t = p.t as unknown as Strings;
  const d = dataFromFiles(
    (p.item as Item | null) ?? null,
    p.arena ? b64(p.arena) : null,
    p.minute.map((m) => ({ w: m.w, bytes: b64(m.b) })),
    p.title || undefined,
  );
  const head = document.createElement("header");
  head.className = "sa-head";
  const brand = document.createElement("strong");
  brand.textContent = "GOSHI";
  const note = document.createElement("span");
  note.className = "muted small";
  note.textContent = String(t.standaloneNote ?? "");
  head.append(brand, note);
  const host = document.createElement("div");
  app.append(head, host);
  mountData(host, d, { api: "", t, focus: null });
}
