// The match viewer: the minute of frenzy of EVERYONE on the same map, then the arena, played again in the browser from the
// public records (nothing is uploaded, nothing is trusted: the same files the hash on chain fixes). Built for phones and
// large screens: one column on a phone, the map and a side panel on a wide screen.
import { ArenaPainter, colorFor, orbRadius, type LooseOrb } from "../lib/play/arena-paint.ts";
import { TIER_SCALE, orbTier } from "../lib/play/arena-fx.ts";
import { SETTINGS } from "../lib/play/arena-quality.ts";
import { Replay, TICK_S, decodeRecord, orbMap, snapPlayers, zoneOf } from "../lib/play/arena-record.ts";
import { viewSpan } from "../lib/play/arena-view.ts";
import { COINS } from "../lib/play/coins.ts";
import { shortAddress } from "../lib/play/config.ts";
import { FRENZY, laserActive, type FrenzyMap } from "../lib/play/frenzy-sim.ts";
import { mapFor, runMinute, type Run } from "../lib/play/frenzy-record.ts";
import { decodeReplay } from "../lib/play/frenzy-sim.ts";
import type { PlayerSnap } from "../lib/play/protocol.ts";

export interface Item {
  roomId: string; at: number; mode: string; cluster: string; tx: string | null; entryFee: string; wallets: string[];
  ranking: { w: string; rank: number; score: number; role: string }[];
  proof: { seedReveal: string; blockhash: string; snapshot: { mass: Record<string, number> }; replays: { w: string; hash: string }[] } | null;
}
export type Strings = Record<string, string> & { paint: Record<string, string> };
export interface ViewerControls { toggle(): void; setSpeed(v: number): void; getSpeed(): number; seekBy(seconds: number): void }
export interface Options { api: string; t: Strings; focus?: string | null; onClose?: () => void; /** TV mode: open on this tab, at this speed, and call onEnd once the arena replay reaches its end. */ startTab?: "minute" | "arena"; /** Play the minute of frenzy and then the arena by itself. */ chain?: boolean; startSpeed?: number; onEnd?: () => void }

const standalone = (): boolean => (globalThis as { __GOSHI_STANDALONE__?: boolean }).__GOSHI_STANDALONE__ === true;

const SYM = ["SOL", "DOGE", "AVAX", "ETH", "BNB", "BTC"];
const SYM_COLOR = SYM.map((s) => COINS.find((c) => c[0] === s)?.[1] ?? "#fff");
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_m, k) => String(v[k] ?? ""));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export async function fetchItem(api: string, room: string): Promise<Item | null> {
  const r = await fetch(`${api}/matches/room/${encodeURIComponent(room)}`);
  if (!r.ok) throw new Error(String(r.status));
  const j = (await r.json()) as { items: Item[] };
  return j.items[0] ?? null;
}
async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try { const r = await fetch(url); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; }
}

/** The raw files of a match of the archive: the arena record and the minute of each player. */
export async function fetchRoomFiles(api: string, it: Item): Promise<{ arena: Uint8Array | null; files: { w: string; bytes: Uint8Array | null }[] }> {
  const room = it.roomId;
  const wallets = it.proof?.replays.filter((r) => r.w !== "arena").map((r) => r.w) ?? [];
  const [arena, files] = await Promise.all([
    fetchBytes(`${api}/replay/${encodeURIComponent(room)}/arena`),
    Promise.all(wallets.map((w) => fetchBytes(`${api}/replay/${encodeURIComponent(room)}/${encodeURIComponent(w)}`))),
  ]);
  return { arena, files: files.map((bytes, i) => ({ w: wallets[i], bytes })) };
}

/** Opens the viewer for a room of the archive. Returns a function that stops it. */
export async function mountRoom(host: HTMLElement, room: string, o: Options, item?: Item | null): Promise<() => void> {
  host.replaceChildren(el("p", "muted", o.t.loading));
  const it = item ?? (await fetchItem(o.api, room));
  if (!it) { host.replaceChildren(el("p", "muted", o.t.notFound)); return () => {}; }
  const wallets = it.proof?.replays.filter((r) => r.w !== "arena").map((r) => r.w) ?? [];
  const [arena, files] = await Promise.all([
    fetchBytes(`${o.api}/replay/${encodeURIComponent(room)}/arena`),
    Promise.all(wallets.map((w) => fetchBytes(`${o.api}/replay/${encodeURIComponent(room)}/${encodeURIComponent(w)}`))),
  ]);
  return mountData(host, dataFromFiles(it, arena, files.map((bytes, i) => ({ w: wallets[i], bytes }))), o);
}

/** What the viewer needs, built from the raw files of a match: the arena record and one minute file per player. */
export function dataFromFiles(item: Item | null, arena: Uint8Array | null, files: { w: string; bytes: Uint8Array | null }[], title?: string): Data {
  const runs: Run[] = [];
  const kept: { w: string; bytes: Uint8Array }[] = [];
  let map: FrenzyMap | null = null;
  for (const f of files) {
    if (!f.bytes || !item?.proof) continue;
    try {
      const rep = decodeReplay(f.bytes);
      map ??= mapFor(rep.seed, item.proof.snapshot.mass as never);
      runs.push(runMinute(map, f.w, f.bytes));
      kept.push({ w: f.w, bytes: f.bytes });
    } catch { /* a damaged file: that player is left out */ }
  }
  return { item, runs, map, arena, title, files: kept };
}

/** Opens the viewer for one arena record file (the minute is not in it). */
export function mountArenaFile(host: HTMLElement, bytes: Uint8Array, title: string, o: Options): () => void {
  try { decodeRecord(bytes); } catch { host.replaceChildren(el("p", "muted", o.t.badFile)); return () => {}; }
  return mountData(host, dataFromFiles(null, bytes, [], title), o);
}

export interface Data { item: Item | null; runs: Run[]; map: FrenzyMap | null; arena: Uint8Array | null; title?: string; files: { w: string; bytes: Uint8Array }[] }

/** Mounts the viewer on data that is already in memory (a room of the archive, a file, or the data inside a downloaded page). */
export function mountData(host: HTMLElement, d: Data, o: Options): () => void {
  const { t } = o;
  const hasMinute = d.runs.length > 0 && !!d.map;
  const hasArena = !!d.arena;
  let tab: "minute" | "arena" = o.startTab === "arena" && hasArena ? "arena" : hasMinute ? "minute" : "arena";
  let endedOnce = false;
  let raf = 0, dead = false;

  const root = el("div", "mv glass");
  const head = el("div", "mv-head");
  const title = el("h3", "", d.item ? fill(t.match, { id: d.item.roomId.length > 8 ? "…" + d.item.roomId.slice(-6) : d.item.roomId }) : d.title ?? "");
  const tabs = el("div", "mv-tabs");
  const tabMinute = el("button", "btn btn-glass btn-sm", t.minuteTab), tabArena = el("button", "btn btn-glass btn-sm", t.arenaTab);
  tabMinute.type = tabArena.type = "button";
  if (hasMinute) tabs.append(tabMinute);
  if (hasArena) tabs.append(tabArena);
  head.append(title, tabs);
  if (o.onClose) { const x = el("button", "btn btn-glass btn-sm mv-close", "✕"); x.type = "button"; x.title = t.close; x.setAttribute("aria-label", t.close); x.addEventListener("click", () => { stop(); o.onClose!(); }); head.append(x); }
  const note = el("p", "muted small mv-note");
  const grid = el("div", "mv-grid");
  const stageBox = el("div", "mv-stage");
  const canvas = el("canvas", "mv-canvas");
  canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", t.match.replace("{id}", ""));
  const fsBtn = el("button", "mv-fs", "⛶"); fsBtn.type = "button"; fsBtn.title = t.fullscreen; fsBtn.setAttribute("aria-label", t.fullscreen);
  stageBox.append(canvas, fsBtn);
  const side = el("div", "mv-side");
  const boardTitle = el("h4", "", t.players);
  const board = el("ol", "mv-board");
  side.append(boardTitle, board);
  grid.append(stageBox, side);
  const bar = el("div", "mv-bar");
  const playBtn = el("button", "btn btn-gold btn-sm", t.pause); playBtn.type = "button";
  const speedSel = el("select"); for (const s of [0.5, 1, 2, 4, 8]) speedSel.append(new Option(`x${s}`, String(s)));
  const viewSel = el("select");
  const followSel = el("select");
  const clock = el("span", "muted small mv-clock");
  const markBtn = el("button", "btn btn-glass btn-sm", t.markPlayer); markBtn.type = "button"; markBtn.setAttribute("aria-pressed", "false");
  const hint = el("p", "muted small mv-hint", t.tapHint);
  const canRecord = typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;
  const recBtn = el("button", "btn btn-glass btn-sm", t.recordHd); recBtn.type = "button";
  const recMsg = el("p", "muted small mv-recmsg"); recMsg.setAttribute("role", "status"); recMsg.hidden = true;
  const seek = el("input"); seek.type = "range"; seek.min = "0"; seek.step = "1"; seek.className = "mv-seek"; seek.setAttribute("aria-label", t.time);
  const lab = (text: string, c: HTMLElement) => { const l = el("label", "", text + " "); l.append(c); return l; };
  bar.append(playBtn, lab(t.speed, speedSel), lab(t.follow, followSel), lab(t.view, viewSel), markBtn);
  if (canRecord) bar.append(recBtn);
  bar.append(clock);
  const chart = el("canvas", "mv-chart");
  chart.setAttribute("aria-hidden", "true");
  const extra = el("div", "mv-extra");
  const links = el("p", "mv-links small");
  root.append(head, note, grid, hint, seek, bar, recMsg, chart, extra, links);
  host.replaceChildren(root);
  if (d.item && d.item.proof) {
    const v = el("a", "link-btn small", t.verifyLink); v.href = `${t.verifyHref}#${encodeURIComponent(d.item.roomId)}`;
    links.append(v);
    if (d.arena && o.api) { const a = el("a", "link-btn small", t.downloadLink); a.href = `${o.api}/replay/${encodeURIComponent(d.item.roomId)}/arena`; a.rel = "noopener noreferrer"; a.target = "_blank"; links.append(a); }
  }
  // The whole replay as one page that works offline: the viewer, the records and everything to follow or mark any player.
  if (!standalone() && (d.arena || d.files.length > 0) && t.downloadInteractive) {
    const dl = el("button", "link-btn small", t.downloadInteractive); dl.type = "button";
    dl.addEventListener("click", async () => {
      dl.disabled = true;
      const label = dl.textContent;
      dl.textContent = t.preparingFile;
      try {
        const { downloadInteractive } = await import("../lib/play/standalone-export.ts");
        await downloadInteractive({
          item: d.item, arena: d.arena, files: d.files, t: t as unknown as Record<string, unknown>, title: d.title,
          fileName: `goshi-${d.item?.roomId ?? "match"}-interactive.html`,
        });
        dl.textContent = label;
      } catch {
        dl.textContent = t.downloadFailed || label;
      } finally {
        dl.disabled = false;
      }
    });
    links.append(dl);
  }

  const g = canvas.getContext("2d")!;
  const cg = chart.getContext("2d")!;
  let playing = true, speed = o.startSpeed ?? 1, last = 0, boardAt = 0;
  let followed = "";
  let zoom: "full" | "follow" = "full";
  // Tap a player to follow them, tap again to mark them (a ring that pulses, a star and the name, whoever the camera follows).
  const marked = new Set<string>();
  let hits: { w: string; x: number; y: number; r: number }[] = [];
  let collect = false;

  // ---- minute state
  const N = FRENZY.ticks;
  let mTick = 0;
  const runBy = new Map(d.runs.map((r) => [r.w, r]));
  const order = d.runs.map((r) => r.w);
  const finalSorted = [...d.runs].sort((a, b) => b.final.m - a.final.m);
  const maxMass = Math.max(40, ...d.runs.map((r) => r.final.m)) * 1.05;
  const gemColor = (s: number) => SYM_COLOR[s] ?? "#fff";

  // ---- arena state
  let rp: Replay | null = null;
  let prev: PlayerSnap[] = [], cur: PlayerSnap[] = [];
  let orbs: Map<number, LooseOrb> = new Map();
  let acc = 0;
  const painter = new ArenaPainter();
  painter.quality = SETTINGS[0];
  const cam = { x: 1500, y: 1500 };
  let deathsDone: { t: number; w: string; by: string }[] | null = null;

  function startArena() {
    if (!d.arena || rp) return;
    rp = new Replay(decodeRecord(d.arena));
    cur = prev = snapPlayers(rp.arena);
    orbs = orbMap(rp.arena.orbs) as Map<number, LooseOrb>;
  }
  function arenaDeaths() {
    if (deathsDone || !d.arena) return deathsDone ?? [];
    const full = new Replay(decodeRecord(d.arena));
    while (full.step());
    deathsDone = full.deaths;
    return deathsDone;
  }
  const refreshArena = () => {
    if (!rp) return;
    prev = cur; cur = snapPlayers(rp.arena);
    if (prev.length !== cur.length) prev = cur;
    orbs = orbMap(rp.arena.orbs) as Map<number, LooseOrb>;
  };

  const you = o.focus ?? "";
  const nameOf = (w: string) => `${shortAddress(w)}${w === you ? ` (${t.youTag})` : ""}`;
  function defaultFocus(): string {
    if (you && (runBy.has(you) || d.item?.wallets.includes(you))) return you;
    return finalSorted[0]?.w ?? d.item?.ranking[0]?.w ?? "";
  }
  followed = defaultFocus();

  function fillSelects() {
    speedSel.value = String(speed);
    viewSel.replaceChildren(new Option(tab === "minute" ? t.mapFull : t.autoCam, "full"), new Option(t.mapFollow, "follow"));
    viewSel.value = zoom;
    const wl = tab === "minute" ? order : (d.item?.ranking.map((r) => r.w) ?? rp?.rec.players.map((p) => p.w) ?? []);
    followSel.replaceChildren(...(tab === "arena" ? [new Option(t.auto, "auto")] : []), ...wl.map((w) => new Option(nameOf(w), w)));
    followSel.value = tab === "arena" && !wl.includes(followed) ? "auto" : followed;
  }

  function setTab(next: "minute" | "arena") {
    if (rec && rec.tab !== next) stopRec(true);
    tab = next;
    tabMinute.classList.toggle("on", tab === "minute");
    tabArena.classList.toggle("on", tab === "arena");
    chart.hidden = tab !== "minute";
    if (tab === "arena") { startArena(); if (!followed || (rp && !rp.rec.players.some((p) => p.w === followed))) followed = defaultFocus(); }
    note.textContent = tab === "minute" ? t.minuteNote : t.arenaNote;
    seek.max = String(tab === "minute" ? N : rp?.totalTicks ?? 0);
    seek.value = String(tab === "minute" ? mTick : rp?.tick ?? 0);
    fillSelects();
    buildExtra();
    refreshMarkBtn();
    setPlaying(true);
  }
  tabMinute.addEventListener("click", () => setTab("minute"));
  tabArena.addEventListener("click", () => setTab("arena"));

  function setPlaying(on: boolean) {
    playing = on;
    const done = tab === "minute" ? mTick >= N : !!rp?.done;
    playBtn.textContent = on ? t.pause : done ? t.again : t.play;
  }
  playBtn.addEventListener("click", () => {
    const done = tab === "minute" ? mTick >= N : !!rp?.done;
    if (done && !playing) { if (tab === "minute") mTick = 0; else { rp?.reset(); refreshArena(); } acc = 0; }
    setPlaying(!playing);
  });
  speedSel.addEventListener("change", () => { speed = Number(speedSel.value) || 1; });
  viewSel.addEventListener("change", () => { zoom = viewSel.value === "follow" ? "follow" : "full"; });
  followSel.addEventListener("change", () => { followed = followSel.value; buildExtra(); refreshMarkBtn(); });
  seek.addEventListener("input", () => {
    const v = Number(seek.value);
    if (tab === "minute") mTick = v;
    else if (rp) { rp.seek(v); for (const pt of painters()) pt.fx.clear(); cur = prev = snapPlayers(rp.arena); refreshArena(); acc = 0; }
  });
  // Full screen: the whole viewer (map, controls and list). The Fullscreen API where it exists; on a phone, a fixed layer.
  let full = false;
  // A fixed layer inside a card with a blur or a transform is positioned against the card, not the screen (that is how it
  // stayed small on a phone): in full screen the viewer lives directly under <body> and goes back where it was afterwards.
  const holder = document.createComment("mv");
  const setFull = (on: boolean) => {
    full = on;
    if (on && root.parentNode && root.parentNode !== document.body) { root.parentNode.insertBefore(holder, root); document.body.append(root); }
    else if (!on && holder.parentNode) holder.replaceWith(root);
    root.classList.toggle("mv-full", on);
    document.documentElement.style.overflow = on ? "hidden" : "";
    fsBtn.textContent = on ? "✕" : "⛶";
    fsBtn.title = on ? t.exitFullscreen : t.fullscreen;
    fsBtn.setAttribute("aria-label", fsBtn.title);
  };
  const onFsChange = () => { if (full && document.fullscreenElement !== root) setFull(false); };
  document.addEventListener("fullscreenchange", onFsChange);
  fsBtn.addEventListener("click", async () => {
    if (full) {
      if (document.fullscreenElement === root) await document.exitFullscreen().catch(() => {});
      setFull(false);
      return;
    }
    setFull(true);
    if (root.requestFullscreen) await root.requestFullscreen().catch(() => { /* the fixed layer is already showing */ });
  });
  const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && full && !document.fullscreenElement) setFull(false); };
  document.addEventListener("keydown", onEsc);

  // ---- tap a player on the map: follow them; tap the same one again: mark / unmark
  function refreshMarkBtn() {
    const on = !!followed && followed !== "auto" && marked.has(followed);
    markBtn.setAttribute("aria-pressed", String(on));
    markBtn.textContent = on ? t.unmarkPlayer : t.markPlayer;
    markBtn.disabled = !followed || followed === "auto";
  }
  function toggleMark(w: string) {
    if (marked.has(w)) marked.delete(w); else marked.add(w);
    refreshMarkBtn();
    boardAt = 0;
  }
  function follow(w: string) {
    followed = w;
    zoom = "follow";
    fillSelects();
    buildExtra();
    refreshMarkBtn();
    boardAt = 0;
  }
  markBtn.addEventListener("click", () => { if (followed && followed !== "auto") toggleMark(followed); });
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const k = canvas.width / rect.width;
    const px = (e.clientX - rect.left) * k, py = (e.clientY - rect.top) * (canvas.height / rect.height);
    let best: { w: string; d: number } | null = null;
    for (const h of hits) {
      const dd = Math.hypot(h.x - px, h.y - py);
      if (dd <= Math.max(h.r * 1.8, 30 * k) && (!best || dd < best.d)) best = { w: h.w, d: dd };
    }
    if (!best) return;
    if (best.w === followed) toggleMark(best.w); else follow(best.w);
  });

  // ---- the tables under the map
  function buildExtra() {
    extra.replaceChildren();
    if (tab === "minute") {
      const winner = finalSorted[0];
      const me = runBy.get(followed);
      if (winner && me) {
        const why = el("div", "mv-why");
        why.append(el("h4", "", t.whyTitle));
        if (me.w === winner.w) {
          why.append(el("p", "", fill(t.whyWinner, { w: nameOf(me.w), m: me.final.m.toFixed(1) })));
        } else {
          why.append(el("p", "", fill(t.whyText, {
            w: nameOf(winner.w), wm: winner.final.m.toFixed(1), y: nameOf(me.w), ym: me.final.m.toFixed(1),
            diff: (winner.final.m - me.final.m).toFixed(1), gw: winner.final.eaten, gy: me.final.eaten, lw: winner.final.hits, ly: me.final.hits,
            bw: winner.final.btc, by: me.final.btc,
          })));
        }
        extra.append(why);
      }
      const tbl = el("table", "mv-table");
      const hr = el("tr");
      for (const h of [t.place, t.player, t.mass, t.gems, t.lasers, t.btc, t.nitro]) hr.append(el("th", "", h));
      const thead = el("thead"); thead.append(hr); tbl.append(thead);
      const tb = el("tbody");
      finalSorted.forEach((r, i) => {
        const tr = el("tr", r.w === followed ? "me" : "");
        tr.tabIndex = 0;
        const cells = [`#${i + 1}`, nameOf(r.w), r.final.m.toFixed(1), String(r.final.eaten), String(r.final.hits), String(r.final.btc), r.final.nitroS.toFixed(1)];
        cells.forEach((c) => tr.append(el("td", "", c)));
        tr.addEventListener("click", () => { followed = r.w; fillSelects(); buildExtra(); refreshMarkBtn(); });
        tb.append(tr);
      });
      tbl.append(tb);
      const wrap = el("div", "mv-table-wrap"); wrap.append(tbl);
      extra.append(wrap);
    } else {
      const list = arenaDeaths();
      extra.append(el("h4", "", t.deathsTitle));
      const ul = el("ul", "mv-deaths");
      for (const x of list) {
        const by = x.by === "zone" ? t.byZone : x.by === "wall" ? t.byWall : shortAddress(x.by);
        const li = el("li", x.w === followed ? "me" : "", `${mmss(x.t)}  ${fill(t.deathLine, { a: nameOf(x.w), b: by })}`);
        li.tabIndex = 0;
        li.addEventListener("click", () => { if (rp) { rp.seek(Math.max(0, Math.round((x.t - 3) / TICK_S))); cur = prev = snapPlayers(rp.arena); refreshArena(); seek.value = String(rp.tick); } });
        ul.append(li);
      }
      if (!list.length) ul.append(el("li", "muted", t.noDeaths));
      extra.append(ul);
    }
  }

  // ---- drawing
  /** Canvas pixels per CSS pixel: the screen's own ratio, never below 1.5 (a 1x monitor is drawn at 1.5x and scaled down, which
   *  is what makes the lines and the text crisp) and up to 3. A replay has no input to keep up with, so it can afford it. */
  const pixelRatio = () => Math.min(3, Math.max(1.5, window.devicePixelRatio || 1));
  interface Surf { g: CanvasRenderingContext2D; x: number; y: number; w: number; h: number; dpr: number }
  function size(c: HTMLCanvasElement): Surf {
    const dpr = pixelRatio();
    const W = Math.max(200, Math.floor(c.clientWidth * dpr)), H = Math.max(120, Math.floor(c.clientHeight * dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    return { g: c.getContext("2d")!, x: 0, y: 0, w: W, h: H, dpr };
  }

  // The coins of the minute as the game draws them: a glowing bubble with its ticker.
  const coinCache = new Map<number, HTMLCanvasElement>();
  function coinSprite(si: number): HTMLCanvasElement {
    let c = coinCache.get(si);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!, col = gemColor(si), h = 64;
    const halo = x.createRadialGradient(h, h, 0, h, h, h);
    halo.addColorStop(0, `${col}bb`); halo.addColorStop(0.45, `${col}44`); halo.addColorStop(1, `${col}00`);
    x.fillStyle = halo; x.fillRect(0, 0, 128, 128);
    x.fillStyle = col; x.beginPath(); x.arc(h, h, h * 0.6, 0, Math.PI * 2); x.fill();
    x.lineWidth = 3; x.strokeStyle = "rgba(255,255,255,0.85)"; x.stroke();
    x.fillStyle = "#0b1030"; x.font = "800 24px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(SYM[si] ?? "", h, h + 1);
    coinCache.set(si, c);
    return c;
  }

  /** The goshi: body behind, head, white rim, cheeks, eyes, mouth. Small ones are a plain dot. */
  function drawHead(g: CanvasRenderingContext2D, x: number, y: number, R: number, heading: number, color: string, stunned: boolean, mine: boolean, dpr: number) {
    g.fillStyle = color; g.globalAlpha = 0.35;
    g.beginPath(); g.arc(x, y, R * 1.7, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    const fx = Math.cos(heading), fy = Math.sin(heading), qx = -fy, qy = fx;
    g.fillStyle = color;
    g.beginPath(); g.arc(x - fx * R * 0.9, y - fy * R * 0.9, R * 0.9, 0, Math.PI * 2); g.fill();
    g.fillStyle = stunned ? "#ffc2cf" : color;
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
    g.lineWidth = Math.max(1.5 * dpr, R * 0.14); g.strokeStyle = mine ? "#fff" : "rgba(255,255,255,0.7)"; g.stroke();
    if (R < 6 * dpr) return;
    for (const side of [-1, 1]) {
      const ex = x + fx * R * 0.25 + qx * R * 0.42 * side, ey = y + fy * R * 0.25 + qy * R * 0.42 * side;
      g.fillStyle = "#fff"; g.beginPath(); g.arc(ex, ey, R * 0.32, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#0b1130"; g.beginPath(); g.arc(ex + fx * R * 0.12, ey + fy * R * 0.12, R * 0.17, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = "#0b1130"; g.lineWidth = Math.max(1, R * 0.07); g.lineCap = "round";
    g.beginPath(); g.arc(x + fx * R * 0.76, y + fy * R * 0.76, R * 0.17, heading + Math.PI * 0.55, heading + Math.PI * 1.45); g.stroke();
  }
  /** The direction a run was going at a tick (the last one it actually moved in). */
  function headingAt(r: Run, t: number): number {
    for (let i = Math.min(t, N - 1); i > Math.max(0, t - 40); i--) {
      const dx = r.xs[i + 1] - r.xs[i], dy = r.ys[i + 1] - r.ys[i];
      if (dx !== 0 || dy !== 0) return Math.atan2(dy, dx);
    }
    return 0;
  }

  /** A marked player: a pulsing gold ring, a star and the name, so it can be found at a glance in a crowd. */
  function drawMark(g: CanvasRenderingContext2D, x: number, y: number, R: number, dpr: number, name: string) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
    g.save();
    g.lineJoin = "round";
    g.strokeStyle = "rgba(5,8,25,0.85)"; g.lineWidth = (5 + pulse) * dpr;
    g.beginPath(); g.arc(x, y, R * (1.9 + 0.3 * pulse) + 3 * dpr, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "#ffd84a"; g.lineWidth = (2.6 + pulse) * dpr;
    g.beginPath(); g.arc(x, y, R * (1.9 + 0.3 * pulse) + 3 * dpr, 0, Math.PI * 2); g.stroke();
    g.font = `900 ${Math.round(13 * dpr)}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "bottom";
    g.lineWidth = 4 * dpr; g.strokeStyle = "rgba(5,8,25,0.9)"; g.fillStyle = "#ffd84a";
    const label = `\u2605 ${name}`;
    g.strokeText(label, x, y - R * 2.4 - 6 * dpr); g.fillText(label, x, y - R * 2.4 - 6 * dpr);
    g.restore();
  }

  /** The map of the minute with everybody on it, in the rectangle of the surface. */
  function drawMinute(s: Surf, tf: number) {
    const map = d.map!, { g, x: X, y: Y, w: W, h: H, dpr } = s;
    const t0 = Math.min(N, Math.floor(tf)), t1 = Math.min(N, t0 + 1), k = tf - t0;
    const me = runBy.get(followed);
    const follow = zoom === "follow" && me;
    const scale = follow ? Math.min(W, H) / 700 : Math.min(W, H) / map.w;
    const cx = follow ? me!.xs[t0] + (me!.xs[t1] - me!.xs[t0]) * k : map.w / 2;
    const cy = follow ? me!.ys[t0] + (me!.ys[t1] - me!.ys[t0]) * k : map.h / 2;
    const sx = (x: number) => (x - cx) * scale + X + W / 2, sy = (y: number) => (y - cy) * scale + Y + H / 2;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath(); g.rect(X, Y, W, H); g.clip();
    g.fillStyle = "#0b1030"; g.fillRect(X, Y, W, H);
    g.strokeStyle = "rgba(120,140,255,0.08)"; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x <= map.w; x += 100) { g.moveTo(sx(x), sy(0)); g.lineTo(sx(x), sy(map.h)); }
    for (let y = 0; y <= map.h; y += 100) { g.moveTo(sx(0), sy(y)); g.lineTo(sx(map.w), sy(y)); }
    g.stroke();
    g.strokeStyle = "#7be3c3"; g.lineWidth = 2.5 * dpr; g.strokeRect(sx(0), sy(0), map.w * scale, map.h * scale);
    g.fillStyle = "#2c3770";
    for (const q of map.walls) g.fillRect(sx(q.x), sy(q.y), Math.max(1, q.w * scale), Math.max(1, q.h * scale));
    for (const l of map.lasers) {
      const on = laserActive(l, t0);
      g.fillStyle = on ? "#ff3b6b" : "rgba(255,59,107,0.2)";
      if (on) { g.shadowColor = "#ff3b6b"; g.shadowBlur = 10 * dpr; }
      g.fillRect(sx(l.x), sy(l.y), Math.max(2, l.w * scale), Math.max(2, l.h * scale));
      g.shadowBlur = 0;
    }
    // coins: what the followed player has not eaten yet, as bubbles with their ticker
    const hidden = new Set<number>();
    if (me) for (const tk of me.takes) if (tk.t <= t0 && t0 < tk.back) hidden.add(tk.id);
    for (const gm of map.gems) {
      if (hidden.has(gm.id)) continue;
      const half = Math.max(gm.btc ? 7 : 3.2, (gm.btc ? 26 : gm.m >= 3 ? 19 : 15) * scale) * 1.7;
      const px = sx(gm.x), py = sy(gm.y);
      if (px < X - half || py < Y - half || px > X + W + half || py > Y + H + half) continue;
      g.drawImage(coinSprite(gm.s), px - half, py - half, half * 2, half * 2);
    }
    // everyone's route so far, then the heads
    g.lineJoin = "round"; g.lineCap = "round";
    const stepI = follow ? 1 : 2;
    for (const r of d.runs) {
      const mine = r.w === followed;
      g.strokeStyle = colorFor(r.w);
      g.globalAlpha = mine ? 0.95 : 0.42;
      g.lineWidth = (mine ? 3.2 : 1.5) * dpr;
      g.beginPath();
      const from = Math.max(0, t0 - (mine ? N : 400));
      for (let i = from; i <= t0; i += stepI) { const x = sx(r.xs[i]), y = sy(r.ys[i]); if (i === from) g.moveTo(x, y); else g.lineTo(x, y); }
      g.lineTo(sx(r.xs[t0] + (r.xs[t1] - r.xs[t0]) * k), sy(r.ys[t0] + (r.ys[t1] - r.ys[t0]) * k));
      g.stroke();
    }
    g.globalAlpha = 1;
    g.font = `800 ${Math.round(11.5 * dpr)}px system-ui, sans-serif`; g.textAlign = "center";
    const sorted = [...d.runs].sort((a, b) => (a.w === followed ? 1 : 0) - (b.w === followed ? 1 : 0));
    for (const r of sorted) {
      const x = sx(r.xs[t0] + (r.xs[t1] - r.xs[t0]) * k), y = sy(r.ys[t0] + (r.ys[t1] - r.ys[t0]) * k);
      const mine = r.w === followed;
      const m = r.ms[t0];
      const R = Math.max((mine ? 7.5 : 5.5) * dpr, 15 * scale * (1 + Math.min(0.8, (m - 20) / 140)));
      if (collect) hits.push({ w: r.w, x, y, r: R });
      drawHead(g, x, y, R, headingAt(r, t0), colorFor(r.w), r.stun[t0] > 0, mine, dpr);
      if (marked.has(r.w)) drawMark(g, x, y, R, dpr, shortAddress(r.w));
      if (mine || zoom === "follow" || d.runs.length <= 4) {
        g.fillStyle = "#fff"; g.strokeStyle = "rgba(5,8,25,0.8)"; g.lineWidth = 3 * dpr;
        g.strokeText(shortAddress(r.w), x, y - R * 1.5 - 3 * dpr); g.fillText(shortAddress(r.w), x, y - R * 1.5 - 3 * dpr);
      }
    }
    g.restore();
  }

  /** Mass of everyone over the minute, with the cursor. */
  function drawChart(s: Surf, tf: number, thick = 1) {
    const { g, x: X0, y: Y0, w: W, h: H, dpr } = s;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "rgba(5,8,25,0.6)"; g.fillRect(X0, Y0, W, H);
    const px = 8 * dpr, py = 10 * dpr;
    const X = (tick: number) => X0 + px + (tick / N) * (W - px * 2), Y = (m: number) => Y0 + H - py - (m / maxMass) * (H - py * 2);
    g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 1;
    g.beginPath(); for (const q of [0.25, 0.5, 0.75]) { g.moveTo(X(N * q), Y0); g.lineTo(X(N * q), Y0 + H); } g.stroke();
    g.lineJoin = "round";
    for (const r of [...d.runs].sort((a, b) => (a.w === followed ? 1 : 0) - (b.w === followed ? 1 : 0))) {
      const mine = r.w === followed;
      g.strokeStyle = colorFor(r.w); g.globalAlpha = mine ? 1 : 0.55; g.lineWidth = (mine ? 3.2 : 1.5) * dpr * thick;
      g.beginPath();
      for (let i = 0; i <= N; i += 5) { if (i === 0) g.moveTo(X(i), Y(r.ms[i])); else g.lineTo(X(i), Y(r.ms[i])); }
      g.stroke();
    }
    g.globalAlpha = 1;
    g.strokeStyle = "#ffd84a"; g.lineWidth = 2 * dpr * thick;
    g.beginPath(); g.moveTo(X(tf), Y0); g.lineTo(X(tf), Y0 + H); g.stroke();
    g.restore();
  }
  let dragging = false;
  const chartSeek = (e: PointerEvent) => {
    const r = chart.getBoundingClientRect();
    mTick = Math.max(0, Math.min(N, Math.round(((e.clientX - r.left) / r.width) * N)));
    seek.value = String(mTick);
  };
  chart.addEventListener("pointerdown", (e) => { dragging = true; chart.setPointerCapture(e.pointerId); chartSeek(e); });
  chart.addEventListener("pointermove", (e) => { if (dragging) chartSeek(e); });
  chart.addEventListener("pointerup", () => { dragging = false; });

  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  function blended(k: number): PlayerSnap[] {
    if (k <= 0 || prev === cur) return cur;
    return cur.map((p, i) => {
      const q = prev[i];
      if (!q || !p.alive || !q.alive) return p;
      const head: [number, number] = [lerp(q.head[0], p.head[0], k), lerp(q.head[1], p.head[1], k)];
      const body = p.body.length === q.body.length ? p.body.map((b, j) => [lerp(q.body[j][0], b[0], k), lerp(q.body[j][1], b[1], k)] as [number, number]) : p.body;
      return { ...p, head, body };
    });
  }

  function drawArena(s: Surf, pt: ArenaPainter, nowMs: number) {
    if (!rp) return;
    const players = blended(playing ? acc / TICK_S : 0);
    const alive = players.filter((p) => p.alive);
    const focus = followed && followed !== "auto" ? players.find((p) => p.w === followed) : [...alive].sort((a, b) => b.m - a.m)[0];
    let scale: number;
    if (zoom === "follow" && focus && focus.alive) { cam.x = focus.head[0]; cam.y = focus.head[1]; scale = Math.min(s.w, s.h) / viewSpan(focus.m); }
    else { cam.x = 1500; cam.y = 1500; scale = Math.min(s.w, s.h) / 3000; }
    pt.frame({
      g: s.g, W: s.w, H: s.h, dpr: s.dpr, now: nowMs, players, zone: zoneOf(rp.arena), orbs, world: { w: 3000, h: 3000 }, you: focus?.w ?? "", cam, scale, shake: [0, 0],
      meAlive: !!focus && focus.alive, myMass: focus?.m ?? 0, boosting: false, protectLeft: 0, hasState: true, floaters: [], reduced: false, strings: t.paint as never,
    });
    // On top of the painter: the heads that can be tapped, and the marks (the painter leaves the screen space transform in place).
    const g = s.g;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    for (const p of players) {
      if (!p.alive) continue;
      const x = (p.head[0] - cam.x) * scale + s.w / 2, y = (p.head[1] - cam.y) * scale + s.h / 2;
      const R = Math.max(9 * s.dpr, p.r * scale);
      if (collect) hits.push({ w: p.w, x, y, r: R });
      if (marked.has(p.w)) drawMark(g, x, y, R, s.dpr, shortAddress(p.w));
    }
    g.restore();
  }

  // ---- the effects of the arena (eaten rings, death bursts), fed from what each tick did
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const painters = (): ArenaPainter[] => (rec ? [painter, rec.painter] : [painter]);
  function arenaEffects() {
    if (!rp || reduced) return;
    const nowMs = performance.now();
    for (const pt of painters()) {
      for (const o of rp.lastEaten) {
        const tier = orbTier(o.v, !Number.isInteger(o.v));
        pt.fx.pop(o.x, o.y, orbRadius(o.v) * TIER_SCALE[tier] * 1.6, tier);
        for (const p of cur) if (p.alive && Math.hypot(p.head[0] - o.x, p.head[1] - o.y) < p.r + 40) { pt.noteAte(p.w, nowMs); break; }
      }
      for (const ev of rp.lastDeaths) {
        const old = cur.find((p) => p.w === ev.w);
        if (!old || !old.alive) continue;
        const color = pt.effectColor(old);
        pt.fx.burst(old.head[0], old.head[1], 16, 180, old.r * 0.5, color);
        pt.noteDeath(old.head[0], old.head[1], old.r, color, nowMs);
        for (let i = 2; i < old.body.length; i += Math.max(2, Math.ceil(old.body.length / 8))) pt.fx.burst(old.body[i][0], old.body[i][1], 3, 120, old.r * 0.45, color);
      }
    }
  }

  function leaderboard() {
    let rows: { w: string; m: number; out: boolean }[];
    if (tab === "minute") {
      const t0 = Math.min(N, Math.floor(mTick));
      rows = d.runs.map((r) => ({ w: r.w, m: r.ms[t0], out: false })).sort((a, b) => b.m - a.m);
    } else {
      rows = cur.map((p) => ({ w: p.w, m: p.m, out: !p.alive })).sort((a, b) => (a.out === b.out ? b.m - a.m : a.out ? 1 : -1));
    }
    board.replaceChildren(...rows.slice(0, 12).map((r, i) => {
      const li = el("li", `${r.out ? "out" : ""}${r.w === followed ? " me" : ""}${marked.has(r.w) ? " mk" : ""}`);
      const dot = el("i"); dot.style.background = colorFor(r.w);
      li.append(dot, el("span", "", `${i + 1}. ${marked.has(r.w) ? "\u2605 " : ""}${nameOf(r.w)}`), el("em", "", r.out ? t.died : String(Math.round(r.m))));
      li.tabIndex = 0;
      li.addEventListener("click", () => { followed = r.w; fillSelects(); buildExtra(); refreshMarkBtn(); });
      return li;
    }));
  }

  // ---- video: the viewer records itself in HD (1920x1080) with the match name and a leaderboard, to share
  interface Rec { mr: MediaRecorder; c: HTMLCanvasElement; g: CanvasRenderingContext2D; painter: ArenaPainter; mime: string; chunks: BlobPart[]; endAt: number; tab: string; discard: boolean }
  let rec: Rec | null = null;
  const RW = 1920, RH = 1080;
  const roomTag = d.item ? (d.item.roomId.length > 8 ? "…" + d.item.roomId.slice(-6) : d.item.roomId) : (d.title ?? "");

  function startRec() {
    if (rec || !canRecord) return;
    const mimes = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) { recMsg.hidden = false; recMsg.textContent = t.recUnsupported; return; }
    const c = document.createElement("canvas");
    c.width = RW; c.height = RH;
    const rg = c.getContext("2d")!;
    let mr: MediaRecorder;
    try { mr = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6_000_000 }); }
    catch { recMsg.hidden = false; recMsg.textContent = t.recUnsupported; return; }
    const rp2 = new ArenaPainter();
    rp2.quality = SETTINGS[0];
    const chunks: BlobPart[] = [];
    const me: Rec = { mr, c, g: rg, painter: rp2, mime, chunks, endAt: 0, tab, discard: false };
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      const was = me;
      if (rec === was) rec = null;
      recBtn.textContent = t.recordHd;
      if (was.discard) { recMsg.hidden = true; return; }
      const type = was.mime.split(";")[0];
      const blob = new Blob(was.chunks, { type });
      const a = el("a", "btn btn-gold btn-sm", `${t.recSave} (${(blob.size / 1048576).toFixed(1)} MB)`);
      a.href = URL.createObjectURL(blob);
      a.download = `goshi-${d.item?.roomId ?? "match"}-${was.tab}.${type.includes("mp4") ? "mp4" : "webm"}`;
      recMsg.replaceChildren(el("span", "", `${t.recSaved} `), a);
      recMsg.hidden = false;
    };
    // play the whole thing again from the start
    if (tab === "minute") { mTick = 0; acc = 0; seek.value = "0"; }
    else if (rp) { rp.reset(); for (const pt of painters()) pt.fx.clear(); refreshArena(); acc = 0; seek.value = "0"; }
    rec = me;
    mr.start(1000);
    setPlaying(true);
    recBtn.textContent = t.recStop;
    recMsg.hidden = false;
    recMsg.textContent = t.recording;
  }
  function stopRec(discard: boolean) {
    if (!rec) return;
    rec.discard = discard;
    try { rec.mr.state !== "inactive" && rec.mr.stop(); } catch { rec = null; }
  }
  recBtn.addEventListener("click", () => { if (rec) stopRec(false); else startRec(); });

  function recOverlay(g: CanvasRenderingContext2D, label: string) {
    g.save();
    g.fillStyle = "rgba(5,8,25,0.72)"; g.beginPath(); g.roundRect?.(24, 24, 760, 64, 16); if (!g.roundRect) g.rect(24, 24, 760, 64); g.fill();
    g.textAlign = "left"; g.textBaseline = "middle";
    g.fillStyle = "#ffd84a"; g.font = "900 34px system-ui, sans-serif"; g.fillText("GOSHI", 44, 57);
    g.fillStyle = "#e8eeff"; g.font = "700 26px system-ui, sans-serif"; g.fillText(label, 170, 57);
    g.textAlign = "right"; g.fillStyle = "rgba(255,255,255,0.78)"; g.font = "700 24px system-ui, sans-serif";
    g.fillText(t.recMark, RW - 28, RH - 30);
    g.restore();
  }
  function drawRecMinute(r: Rec, tf: number) {
    const g = r.g, S = RH;
    drawMinute({ g, x: 0, y: 0, w: S, h: S, dpr: 1 }, tf);
    // the panel on the right: title, clock, leaderboard with bars, mass over time
    const X = S, W = RW - S, pad = 36, t0 = Math.min(N, Math.floor(tf));
    g.save();
    g.fillStyle = "#070b22"; g.fillRect(X, 0, W, RH);
    g.textBaseline = "alphabetic"; g.textAlign = "left";
    g.fillStyle = "#ffd84a"; g.font = "900 52px system-ui, sans-serif"; g.fillText("GOSHI", X + pad, pad + 44);
    g.fillStyle = "#9fb2ff"; g.font = "700 26px system-ui, sans-serif"; g.fillText(`${t.match.replace("{id}", roomTag)} · ${t.minuteTab}`, X + pad, pad + 86);
    g.textAlign = "right"; g.fillStyle = "#fff"; g.font = "800 52px system-ui, sans-serif"; g.fillText(mmss(tf / FRENZY.tickRate), X + W - pad, pad + 44);
    const rows = d.runs.map((q) => ({ w: q.w, m: q.ms[t0] })).sort((a, b) => b.m - a.m).slice(0, 10);
    const top = Math.max(...rows.map((q) => q.m), 1);
    const y0 = 170, rh = 48;
    rows.forEach((q, i) => {
      const y = y0 + i * rh;
      g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(X + pad, y, W - pad * 2, rh - 8);
      g.fillStyle = colorFor(q.w); g.globalAlpha = 0.45; g.fillRect(X + pad, y, (W - pad * 2) * (q.m / top), rh - 8); g.globalAlpha = 1;
      g.textAlign = "left"; g.fillStyle = "#fff"; g.font = "800 24px system-ui, sans-serif";
      g.fillText(`${i + 1}  ${shortAddress(q.w)}${q.w === you ? ` (${t.youTag})` : ""}`, X + pad + 12, y + 30);
      g.textAlign = "right"; g.fillText(String(Math.round(q.m)), X + W - pad - 12, y + 30);
    });
    drawChart({ g, x: X + pad, y: RH - 330, w: W - pad * 2, h: 250, dpr: 1 }, tf, 1.4);
    g.textAlign = "right"; g.fillStyle = "rgba(255,255,255,0.78)"; g.font = "700 24px system-ui, sans-serif";
    g.fillText(t.recMark, X + W - pad, RH - 30);
    g.restore();
  }
  function drawRecArena(r: Rec, nowMs: number) {
    drawArena({ g: r.g, x: 0, y: 0, w: RW, h: RH, dpr: 1 }, r.painter, nowMs);
    const secs = rp ? Math.min(rp.rec.matchMs / 1000, rp.seconds) : 0;
    recOverlay(r.g, `${t.match.replace("{id}", roomTag)} · ${t.arenaTab} · ${mmss(secs)}`);
  }

  function frame(nowMs: number) {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (nowMs - last) / 1000) : 0;
    last = nowMs;
    const vis = size(canvas);
    let finished = false;
    if (tab === "minute") {
      if (playing) {
        acc += dt * speed * FRENZY.tickRate;
        if (acc >= 1) { mTick = Math.min(N, mTick + Math.floor(acc)); acc -= Math.floor(acc); }
        if (mTick >= N) { mTick = N; acc = 0; setPlaying(false); if (o.chain && hasArena) setTab("arena"); }
        seek.value = String(mTick);
      }
      const tf = Math.min(N, mTick + (playing ? acc : 0));
      hits = []; collect = true;
      drawMinute(vis, tf);
      collect = false;
      drawChart(size(chart), tf);
      clock.textContent = `${mmss(tf / FRENZY.tickRate)} / 1:00`;
      if (rec && rec.tab === "minute") { drawRecMinute(rec, tf); finished = mTick >= N; }
    } else if (rp) {
      if (playing) {
        acc += dt * speed;
        let n = 0;
        while (acc >= TICK_S && n < 40) {
          acc -= TICK_S;
          if (!rp.step()) { acc = 0; setPlaying(false); if (!endedOnce) { endedOnce = true; o.onEnd?.(); } break; }
          arenaEffects();
          n++;
        }
        if (n > 0) { refreshArena(); seek.value = String(rp.tick); }
        if (rp.done && playing) setPlaying(false);
        if (rp.done && !endedOnce) { endedOnce = true; o.onEnd?.(); }
        if (!reduced) for (const pt of painters()) pt.fx.step(dt);
      }
      hits = []; collect = true;
      drawArena(vis, painter, nowMs);
      collect = false;
      const alive = cur.filter((p) => p.alive).length;
      clock.textContent = `${mmss(Math.min(rp.rec.matchMs / 1000, rp.seconds))} · ${alive}/${cur.length} ${t.alive}`;
      if (rec && rec.tab === "arena") { drawRecArena(rec, nowMs); finished = rp.done; }
    }
    if (rec) {
      if (finished) { rec.endAt ||= nowMs; if (nowMs - rec.endAt > 1500) stopRec(false); }
      else {
        const secs = tab === "minute" ? mTick / FRENZY.tickRate : rp?.seconds ?? 0;
        recMsg.textContent = `${t.recording} ${mmss(secs)}`;
      }
    }
    if (nowMs - boardAt > 250) { boardAt = nowMs; leaderboard(); }
  }

  function stop() {
    dead = true; cancelAnimationFrame(raf);
    stopRec(true);
    document.removeEventListener("fullscreenchange", onFsChange); document.removeEventListener("keydown", onEsc);
    if (full) { if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {}); setFull(false); }
  }
  tabMinute.classList.toggle("on", tab === "minute");
  tabArena.classList.toggle("on", tab === "arena");
  setTab(tab);
  raf = requestAnimationFrame(frame);
  // Controls for a page that wants its own buttons (the television mode): play or pause, speed and jumps in the replay.
  const ctl: ViewerControls = {
    toggle: () => playBtn.click(),
    setSpeed: (v) => { speed = v; speedSel.value = String(v); },
    getSpeed: () => speed,
    seekBy: (sec) => {
      const step = tab === "minute" ? FRENZY.tickRate : 1 / TICK_S;
      const v = Math.max(0, Math.min(Number(seek.max) || 0, Number(seek.value) + sec * step));
      seek.value = String(Math.round(v));
      seek.dispatchEvent(new Event("input"));
    },
  };
  (stop as unknown as { ctl: ViewerControls }).ctl = ctl;
  return stop;
}
