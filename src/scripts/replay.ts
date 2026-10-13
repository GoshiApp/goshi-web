// The replay page: a room number (or a match record file) in, the whole match out (src/scripts/match-viewer.ts).
import { mountArenaFile, mountRoom, type Strings } from "./match-viewer.ts";
import { manager, restoreWallet } from "../lib/play/wallet-session.ts";

const boot = JSON.parse(document.getElementById("replay-data")?.textContent ?? "null") as { api: string; t: any; verifyHref: string } | null;
if (boot) {
  const { api } = boot;
  const t = { ...boot.t, ...boot.t.viewer, verifyHref: boot.verifyHref } as Strings;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const msg = $("replay-msg"), host = $("replay-host"), drop = $("replay-drop");
  let stop: (() => void) | null = null;
  const focus = () => { const s = manager.current; return s.status === "connected" ? s.address : null; };

  async function openRoom(room: string) {
    stop?.();
    msg.textContent = "";
    try { stop = await mountRoom(host, room, { api, t, focus: focus() }); host.scrollIntoView({ behavior: "smooth", block: "start" }); }
    catch { msg.textContent = t.error; }
  }
  async function openFile(f: File) {
    stop?.();
    msg.textContent = "";
    stop = mountArenaFile(host, new Uint8Array(await f.arrayBuffer()), f.name, { api, t, focus: focus() });
  }

  $<HTMLFormElement>("replay-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $<HTMLInputElement>("replay-room").value.trim();
    if (v) { history.replaceState(null, "", `#${encodeURIComponent(v)}`); void openRoom(v); }
  });
  $<HTMLInputElement>("replay-file").addEventListener("change", (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void openFile(f); });
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); const f = (e as DragEvent).dataTransfer?.files?.[0]; if (f) void openFile(f); });

  const h = decodeURIComponent(location.hash.slice(1));
  if (/^\d{10,24}$/.test(h)) { $<HTMLInputElement>("replay-room").value = h; void restoreWallet().finally(() => void openRoom(h)); }
}
