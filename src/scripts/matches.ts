// The global history: everybody's matches, newest first, from the archive of the game server (GET /matches/recent).
// Same cards as the search page: ranking, "Watch it" (the viewer opens inside the card), records and the in-browser check.
import { renderCard, type Rec, type CardCtx } from "./match-card.ts";
import { dataFromFiles, fetchRoomFiles, mountData, type Item, type Strings, type ViewerControls } from "./match-viewer.ts";
import type { Cluster } from "../lib/play/config.ts";
import { ArenaSound } from "../lib/play/arena-sound.ts";

const boot = JSON.parse(document.getElementById("matches-data")?.textContent ?? "null") as
  { api: string; rpc: string; cluster: Cluster; t: any; r: any; m: any; verifyHref: string; domain: string; ca: string } | null;
if (boot) {
  const { api, m } = boot;
  const cluster = boot.cluster;
  const vt = boot.t;
  const ctx: CardCtx = { api, rpc: boot.rpc, cluster: boot.cluster, t: boot.t, r: boot.r, verifyHref: boot.verifyHref, m };
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const list = $("matches-list"), msg = $("matches-msg"), more = $<HTMLButtonElement>("matches-more");
  const chips = [...document.querySelectorAll<HTMLButtonElement>("#matches-filter [data-mode]")];
  let mode = "", next: number | null = null, shown = 0, busy = false, gen = 0, pages = 0;
  // The matches on screen, in order: the television mode plays them one after another.
  let loaded: Rec[] = [];

  async function load(reset: boolean) {
    if (busy) return;
    busy = true;
    const mine = ++gen;
    if (reset) { list.textContent = ""; shown = 0; next = null; more.hidden = true; pages = 0; loaded = []; }
    msg.textContent = m.loading;
    try {
      const qs = new URLSearchParams({ limit: "15" });
      if (mode) qs.set("mode", mode);
      if (!reset && next !== null) qs.set("before", String(next));
      const r = await fetch(`${api}/matches/recent?${qs}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { items: Rec[]; next: number | null };
      if (mine !== gen) return;
      // Test and real matches live in different places: each site shows only its own network.
      const mineItems = j.items.filter((it) => !it.cluster || it.cluster === cluster);
      for (const it of mineItems) { list.append(renderCard(it, null, ctx, { global: true })); loaded.push(it); }
      shown += mineItems.length;
      next = j.next;
      // A page that was all from the other network must not look like an empty history: keep looking a few pages.
      if (shown < 10 && next !== null && pages++ < 8) { busy = false; void load(false); return; }
      msg.textContent = shown === 0 ? m.empty : m.shown.replace("{n}", String(shown));
      more.hidden = next === null;
    } catch {
      msg.textContent = m.error;
    } finally {
      busy = false;
    }
  }

  chips.forEach((c) => c.addEventListener("click", () => {
    mode = c.dataset.mode ?? "";
    chips.forEach((x) => x.classList.toggle("on", x === c));
    void load(true);
  }));
  $("matches-refresh").addEventListener("click", () => void load(true));
  more.addEventListener("click", () => void load(false));
  // Search: a wallet, a room, a transaction or the hash of a record.
  const kindOf = (q: string): "wallet" | "tx" | "room" | "hash" | null => {
    if (/^[0-9a-fA-F]{64}$/.test(q)) return "hash";
    if (/^\d{10,24}$/.test(q)) return "room";
    if (/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(q)) return "tx";
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)) return "wallet";
    return null;
  };
  const form = $<HTMLFormElement>("matches-search"), qIn = $<HTMLInputElement>("matches-q"), clear = $<HTMLButtonElement>("matches-clear");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = qIn.value.trim();
    const kind = kindOf(q);
    if (!kind) { msg.textContent = vt.none; return; }
    gen++;
    more.hidden = true;
    list.textContent = "";
    msg.textContent = m.loading;
    try {
      const r = await fetch(`${api}/matches/${kind}/${encodeURIComponent(kind === "hash" ? q.toLowerCase() : q)}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { items: Rec[] };
      const items = j.items.filter((it) => !it.cluster || it.cluster === cluster);
      for (const it of items) list.append(renderCard(it, kind === "wallet" ? q : null, ctx));
      msg.textContent = items.length === 0 ? vt.none : `${vt.kinds[kind]}: ${items.length}`;
      clear.hidden = false;
    } catch {
      msg.textContent = m.error;
    }
  });
  clear.addEventListener("click", () => { qIn.value = ""; clear.hidden = true; void load(true); });
  // Television mode: every match on screen, one after another, arena replay at 4x, with the next one starting by itself.
  let store: Storage | null = null;
  try { store = window.localStorage; } catch { /* blocked */ }
  const sound = new ArenaSound({ storage: store, enhanced: true });
  const startTv = (broadcast: boolean): void => {
    let queue = loaded.filter((r) => r.proof);
    if (queue.length === 0) { msg.textContent = m.tvEmpty; return; }
    // The click that opened this is what lets the browser play audio.
    sound.autoEnable();
    sound.setIntensity(1);
    sound.startMusic();
    const strings = { ...boot.r, ...boot.r.viewer, verifyHref: boot.verifyHref } as Strings;
    const layer = document.createElement("div");
    layer.className = "tv-layer";
    const bar = document.createElement("div");
    bar.className = "tv-bar";
    const count = document.createElement("span");
    const nextBtn = document.createElement("button");
    nextBtn.type = "button"; nextBtn.className = "btn btn-glass btn-sm"; nextBtn.textContent = m.tvNext;
    const exitBtn = document.createElement("button");
    exitBtn.type = "button"; exitBtn.className = "btn btn-gold btn-sm"; exitBtn.textContent = m.tvExit;
    const mk = (text: string, label: string, fn: () => void) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn btn-glass btn-sm"; b.textContent = text; b.setAttribute("aria-label", label); b.title = label;
      b.addEventListener("click", fn);
      return b;
    };
    let ctl: ViewerControls | null = null;
    let tvSpeed = 4;
    const speedSel = document.createElement("select");
    for (const v of [0.5, 1, 2, 4, 8, 16]) speedSel.append(new Option(`x${v}`, String(v)));
    speedSel.value = "4";
    speedSel.setAttribute("aria-label", "Speed");
    speedSel.addEventListener("change", () => { tvSpeed = Number(speedSel.value) || 1; ctl?.setSpeed(tvSpeed); });
    const prevBtn = mk("\u23ee", "Previous", () => void play(idx - 1));
    const back = mk("-10 s", "-10 s", () => ctl?.seekBy(-10));
    const pp = mk("\u23ef", "Play / pause", () => ctl?.toggle());
    const fwd = mk("+10 s", "+10 s", () => ctl?.seekBy(10));
    const musicBtn = mk(sound.music && sound.enabled ? m.tvMusicOn : m.tvMusicOff, "Music", () => {
      if (!sound.enabled) { sound.toggle(); }
      const on = sound.toggleMusic();
      musicBtn.textContent = on ? m.tvMusicOn : m.tvMusicOff;
      if (on) sound.startMusic();
    });
    bar.append(count, prevBtn, back, pp, fwd, speedSel, musicBtn, nextBtn, exitBtn);
    const host = document.createElement("div");
    host.className = "tv-host";
    layer.append(bar, host);
    document.body.append(layer);
    document.documentElement.classList.add("tv-on");
    let idx = -1, stop: (() => void) | null = null, alive = true, timer: ReturnType<typeof setTimeout> | null = null;
    let refresher: ReturnType<typeof setInterval> | null = null, rotator: ReturnType<typeof setInterval> | null = null;
    if (broadcast) {
      // The live show: no controls in the way, a LIVE badge and a line that changes every few seconds inviting people in.
      layer.classList.add("tv-live");
      const badge = document.createElement("div");
      badge.className = "tv-badge";
      badge.textContent = m.liveBadge;
      const line = document.createElement("div");
      line.className = "tv-line";
      const lines = (m.liveLines as string[]).map((t) => t.replace("{domain}", boot.domain));
      if (boot.ca) lines.push(`$GOSHI CA: ${boot.ca}`);
      let li = 0;
      line.textContent = lines[0] ?? "";
      rotator = setInterval(() => { li = (li + 1) % lines.length; line.textContent = lines[li]; }, 9000);
      layer.append(badge, line);
      // New matches keep arriving: the list is read again every few minutes without stopping what is on screen.
      refresher = setInterval(async () => {
        try {
          const r = await fetch(`${api}/matches/recent?limit=15`);
          if (!r.ok) return;
          const j = (await r.json()) as { items: Rec[] };
          const fresh = j.items.filter((it) => it.proof && (!it.cluster || it.cluster === cluster));
          if (fresh.length > 0) queue = fresh;
        } catch { /* keep the list we have */ }
      }, 300_000);
    }
    const close = () => {
      alive = false;
      if (timer) clearTimeout(timer);
      stop?.();
      layer.remove();
      document.documentElement.classList.remove("tv-on");
      document.removeEventListener("keydown", onKey);
      sound.stopMusic();
      if (refresher) clearInterval(refresher);
      if (rotator) clearInterval(rotator);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); else if (e.key === "ArrowRight") void play(idx + 1); };
    async function play(i: number) {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      stop?.(); stop = null; host.textContent = "";
      idx = ((i % queue.length) + queue.length) % queue.length;
      const rec = queue[idx];
      count.textContent = m.tvCount.replace("{i}", String(idx + 1)).replace("{n}", String(queue.length));
      try {
        const { arena, files } = await fetchRoomFiles(api, rec as unknown as Item);
        if (!alive) return;
        const d = dataFromFiles(rec as unknown as Item, arena, files);
        if (!d.arena) { void play(idx + 1); return; }
        ctl = null;
        const mine = idx;
        const st = mountData(host, d, { api, t: strings, startTab: broadcast ? "minute" : "arena", chain: broadcast, startSpeed: tvSpeed, onEnd: () => { timer = setTimeout(() => { if (alive && idx === mine) void play(idx + 1); }, 2500); } });
        stop = st;
        ctl = (st as unknown as { ctl?: ViewerControls }).ctl ?? null;
        ctl?.setSpeed(tvSpeed);
      } catch {
        timer = setTimeout(() => void play(idx + 1), 800);
      }
    }
    nextBtn.addEventListener("click", () => void play(idx + 1));
    exitBtn.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    void play(0);
  };
  $("matches-tv").addEventListener("click", () => startTv(false));
  // The live show: /matches/?live=1 opens a start screen (one click lets the audio play) and then runs by itself.
  if (new URLSearchParams(location.search).get("live") === "1") {
    const gate = document.createElement("div");
    gate.className = "tv-gate";
    const go = document.createElement("button");
    go.type = "button"; go.className = "btn btn-gold btn-lg"; go.textContent = m.liveStart;
    go.addEventListener("click", async () => {
      go.disabled = true;
      // The list may still be loading: wait a few seconds for the first matches.
      for (let i = 0; i < 40 && loaded.filter((r) => r.proof).length === 0; i++) await new Promise((r) => setTimeout(r, 250));
      gate.remove();
      startTv(true);
    });
    gate.append(go);
    document.body.append(gate);
  }
  void load(true);
}
