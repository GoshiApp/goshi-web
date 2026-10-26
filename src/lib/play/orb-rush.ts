// "Orb Rush": the canvas side of the real-time arena. It implements RealtimeArena (arena-adapter.ts).
// The game is simulated ONLY on the server. This file draws the snapshots it is given, reads the pointer, touch and
// keyboard, and sends the steering back (at most 20 times per second). It never decides anything about the match.

import type { TrapSnap } from "./protocol.ts";
import type { ArenaContext, ArenaOutcome, ArenaStatus, RealtimeArena } from "./arena-adapter.ts";
import { SnapBuffer, TickClock } from "./interp.ts";
import { coinAmount } from "./coins.ts";
import { ArenaPainter, BIG_ORB_MASS, type Floater, type PaintStrings, SABOTEUR_BODY, SABOTEUR_COLOR, colorFor, orbRadius, uiScale, type LooseOrb } from "./arena-paint.ts";
import { TIER_SCALE, orbTier, shakeAmplitude, shakeOffset } from "./arena-fx.ts";
import { ArenaDiag } from "./arena-diag.ts";
import { ReportRecorder, buildReport, type Env } from "./arena-report.ts";
import { LEVEL_NAMES, SETTINGS, type QualityManager } from "./arena-quality.ts";
import type { ArenaSound } from "./arena-sound.ts";
import { aliveRank, protectionSecondsLeft, viewSpan } from "./arena-view.ts";
import { phaseKey, zoneDamagePerSecond, zoneStatus, zoneText, type ZoneStrings } from "./arena-zone.ts";
import { MIN_MASS, START_MASS, speedOf, turnRateOf, advance, ahead, effectiveSpeed, extendBodyInto, headingOf, lookAheadSeconds, reconcile, smoothingFactor, type Kin } from "./predict.ts";
import { classifyDeath, deathLine, type DeathStrings } from "./death.ts";
import type { PlayerSnap, ServerMsg, TrapK } from "./protocol.ts";

/** The cash arena only runs on the Solana devnet: its payouts are linked there on Solscan. */
const CLUSTER_QS = "?cluster=devnet";

type Start = Extract<ServerMsg, { t: "start" }>;
type Snap = Extract<ServerMsg, { t: "snap" }>;
type End = Extract<ServerMsg, { t: "end" }>;

const NO_TRAPS: readonly TrapSnap[] = [];
export interface OrbStrings {
  you: string;
  startAnnounce: string;
  /** The zone line for each state (calm, warn, shrink, hold, final). Also said once when a phase begins. */
  zoneLines: ZoneStrings;
  /** Label of the final circle on the map. */
  finalZone: string;
  /** Label of the next circle on the map. */
  nextZone: string;
  /** "You are outside the safe zone: losing {n} mass per second" */
  zoneOutBanner: string;
  /** "Your bag: {n} SOL" (a room paid by bag) */
  bagLine?: string;
  /** Rules 6: the boss line ({name}, {n} seconds) in each part of its cycle, and the cash out countdown. */
  bossCalm?: string;
  bossWarn?: string;
  bossOpen?: string;
  cashingOut?: string;
  /** "For the big orbs you need mass {n}" (live arena) */
  bigOrbNeed?: string;
  /** "On the map {free} SOL · In the players' bags {held} SOL" */
  solSplit?: string;
  /** Cash arena info panel: title, lines ({n}, {in}, {pool}, {house}, {cut}, {outs}, {paid}, {kills}, {left}) and rotating tips. */
  cashInfoTitle?: string;
  cashInfoLines?: string[];
  cashTips?: string[];
  /** Rules 7: "Last 3: the zone holds still for {n} s, grab the coins" */
  final3Freeze?: string;
  /** Cash arena: the bag line ({bag}, {x}, {k}), the line once cashing out is open, the cash out result, and the boss call. */
  cashLine?: string;
  cashReady?: string;
  cashedOut?: string;
  /** Cash out result card and live lines: title, text ({bag}, {x}), stopped halfway ({bag}, {name}), the link, the sending line, others warned ({name}), the wallet line ({n}). */
  cashOutTitle?: string;
  /** The big result after a cash out: gain or loss lines ({bag}, {x}). */
  cashGain?: string;
  cashLoss?: string;
  cashOutText?: string;
  cashOutStopped?: string;
  cashOutStoppedText?: string;
  cashOutSending?: string;
  solscan?: string;
  cashOtherWarn?: string;
  cashToWallet?: string;
  cashEntryOk?: string;
  cashEntryBad?: string;
  cashSignIn?: string;
  bossAttack?: string;
  showerIn: string;
  showerLanded: string;
  endAnnounce: string;
  countdown: string;
  deadTitle: string;
  /** "You finished in place {rank}." */
  deadText: string;
  /** One line for each way a player can die, and the same for what happens to the others. */
  death: DeathStrings;
  zone: string;
  /** "Protected {s}" */
  protectedHint: string;
  /** "{n} ms" */
  pingValue: string;
  /** "{rank} of {n}" */
  rankValue: string;
  /** "Back to the safe zone ({n})" */
  backToZone: string;
  /** After pressing "Copy report". */
  reportCopied: string;
  reportManual: string;
  /** Short labels drawn on the canvas. */
  nitro: string;
  mass: string;
  /** "{n} players" (before the first snapshot) */
  playersValue: string;
  /** "measuring" */
  pingWait: string;
  /** "Out, place {rank}" */
  outValue: string;
}

/** What the arena needs from a connection: steering out, a ping, and the measured round trip. */
export interface ArenaLink {
  sendInput(dx: number, dy: number, boost: boolean): boolean;
  ping(): boolean;
  readonly rttMs: number;
  readonly rttKnown: boolean;
  /** Characters received so far (for the diagnostics line). */
  readonly bytesIn?: number;
  /** The latest raw round trip sample (for the report). */
  readonly rttLastMs?: number;
  /** Sets a trap behind the tail (1 laser, 2 puddle). Absent on links that cannot (the replay viewer). */
  trap?(kind: TrapK): boolean;
  /** Messages of the connection (the arena reads the answers to its traps). */
  on?(e: "message", f: (m: { t: string; left?: string; reason?: string; bag?: number; entry?: number; id?: string; kind?: string | number; at?: number; hash?: string; ok?: boolean; lamports?: number; why?: string; sig?: string; full?: boolean; by?: string }) => void): () => void;
}

export interface OrbDeps {
  client: ArenaLink;
  strings: OrbStrings;
  /** Polite screen reader announcement. */
  announce(text: string): void;
  /** Formats a mass or score for the HUD. */
  format(n: number): string;
  /** Blips for eating, boosting and dying. Off until the person switches it on. */
  sound?: ArenaSound;
  /** The color index (0..7) the player picked for its own goshi; null for the default. Read at start and on change. */
  ownColor?: () => number | null;
  /** The skin id the local player chose (shown at once for you, the others come from the server). */
  ownSkin?: () => string | null;
  /** Adaptive render quality (and the person's manual choice). */
  quality?: QualityManager;
  /** The diagnostics line template: {fps} {worst} {sps} {jit} {kbs} {ping} {draw} {q}. */
  diagLine?: string;
}

const DEAD_ZONE_PX = 12;
export { SABOTEUR_BODY, SABOTEUR_COLOR, colorFor, orbRadius, viewSpan };
const EMPTY_PLAYERS: PlayerSnap[] = [];
const NO_SHAKE: readonly [number, number] = [0, 0];

/** Pointer offset from the canvas center to a steering vector: a dead zone, then full speed at a third of the board. */
export function steerFromPointer(vx: number, vy: number, cssW: number, cssH: number): { dx: number; dy: number } {
  const len = Math.hypot(vx, vy);
  const full = Math.max(DEAD_ZONE_PX + 1, Math.min(cssW, cssH) / 3);
  if (len <= DEAD_ZONE_PX) return { dx: 0, dy: 0 };
  const mag = Math.min(1, (len - DEAD_ZONE_PX) / (full - DEAD_ZONE_PX));
  return { dx: (vx / len) * mag, dy: (vy / len) * mag };
}

/** WASD and arrow keys to a steering vector (diagonals are normalized). */
export function steerFromKeys(keys: ReadonlySet<string>): { dx: number; dy: number } | null {
  const l = keys.has("a") || keys.has("arrowleft");
  const r = keys.has("d") || keys.has("arrowright");
  const u = keys.has("w") || keys.has("arrowup");
  const d = keys.has("s") || keys.has("arrowdown");
  const dx = (r ? 1 : 0) - (l ? 1 : 0);
  const dy = (d ? 1 : 0) - (u ? 1 : 0);
  if (dx === 0 && dy === 0) return l || r || u || d ? { dx: 0, dy: 0 } : null;
  const n = Math.hypot(dx, dy);
  return { dx: dx / n, dy: dy / n };
}

/** A match longer than this is the survival mode; its camera may open up to nearly the whole map. */
const SURVIVAL_MS = 3_600_000;
const SURVIVAL_SPAN = 2700;

export class OrbRushArena implements RealtimeArena {
  readonly id = "orb-rush";
  readonly name = { es: "Orb Rush", en: "Orb Rush" } as const;
  status: ArenaStatus = "idle";

  private readonly deps: OrbDeps;
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private host: HTMLElement | null = null;
  private reduced = false;
  private roomId = "";
  private you = "";
  private world: { w: number; h: number; x0?: number; y0?: number } = { w: 3000, h: 3000 };
  private zoneStart = { cx: 1500, cy: 1500, r0: 1450, rMin: 150 };
  private matchMs = 300_000;
  private shrinkStartMs = 120_000;
  private readonly buf = new SnapBuffer();
  private cam = { x: 1500, y: 1500 };
  private camSet = false;
  /** World units visible along the short side, smoothed. */
  private span = 0;
  private raf = 0;
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private hudTimer: ReturnType<typeof setInterval> | null = null;
  private timeLeftMs = 0;
  private dropIn = 0;
  private dropAt = 0;
  private alive = 0;
  private myMass = 0;
  private dead = false;
  private kills = 0;
  private finalRank = 0;
  private peakMass = 0;
  private pointer: { x: number; y: number } | null = null;
  private readonly keys = new Set<string>();
  private boostKey = false;
  private boostButton = false;
  /** Spectator camera: follow a player (default: the heaviest) or fly free over the map. */
  private specFree = false;
  /** After elimination the whole map is shown first; the buttons switch to following a player or to a free camera. */
  private specMap = true;
  private specTarget: string | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** The predicted head of the local player (what is drawn), and the heading the player is steering toward. */
  private local: Kin | null = null;
  private want: number | null = null;
  private lastFrameAt = 0;
  private readonly painter = new ArenaPainter();
  /** Orbs, with the ones that came out of a dead body marked as loot. */
  private orbs = new Map<number, LooseOrb>();
  /** Who is boosting, from the speed between the last two snapshots (the snapshot has no boost flag). */
  private readonly boosting = new Set<string>();
  private sparkAcc = 0;
  private readonly diag = new ArenaDiag();
  /** The last 30 seconds, for the report (it keeps filling after you die, until the match ends). */
  private readonly rec = new ReportRecorder();
  private longTaskObserver: PerformanceObserver | null = null;
  private lastPingSeen = 0;
  private gpuName: string | null = null;
  private paintStrings: PaintStrings | null = null;
  private cashUi = false;
  private cashUiForce = true;
  private readonly selfSnap = {} as PlayerSnap;
  private readonly selfHead: [number, number] = [0, 0];
  private readonly selfBody: [number, number][] = [];
  private showDiag = false;
  private lastBytes = 0;
  private lastPhaseKey: string | null = null;
  /** "-N" numbers while you are outside the zone, one a second. */
  private readonly floaters: Floater[] = [];
  /** A room paid by bag: the lamports of your coins, from the last snapshot (null elsewhere). */
  private myBag: number | null = null;
  /** Rules 6: the boss of the last snapshot. */
  private bossInfo: { w: string; st: "calm" | "warn" | "open"; in: number } | null = null;
  /** Rules 7: seconds the zone still holds for the last three (0 when it does not). */
  private freezeLeft = 0;
  /** Rooms with money: SOL free on the map and SOL held in bags, from the last snapshot. */
  private solNow: { free: number; held: number } | null = null;
  private floaterAt = 0;
  private outNow = false;
  private lastQualityLevel = -1;
  /** Reused for each snapshot (no new Map per message). */
  private readonly beforeMap = new Map<string, PlayerSnap>();
  /** Stamps snapshots by server tick and measures the jitter that sets the live delay. */
  private readonly clock = new TickClock();
  private readonly afterMap = new Map<string, PlayerSnap>();
  private shakeAt = -1e9;
  private shakeAmp = 0;
  private lastSent = "";
  private lastSentAt = 0;
  private readonly listeners: ((o: ArenaOutcome) => void)[] = [];
  private readonly cleanups: (() => void)[] = [];

  constructor(deps: OrbDeps) {
    this.deps = deps;
  }

  // ------------------------------------------------------------------ RealtimeArena

  async mount(host: HTMLElement, ctx: ArenaContext): Promise<void> {
    this.dispose();
    this.host = host;
    this.reduced = ctx.reducedMotion;
    const canvas = host.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) throw new Error("The arena needs a canvas element");
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.status = "ready";
    this.bind();
    // The diagnostics line may already be showing (a new match on the same card): keep it going.
    this.observeLongTasks();
    this.painter.setOwnColor(this.deps.ownColor?.() ?? null);
    this.painter.setSkins({}, this.deps.ownSkin?.() ?? null);
    this.showDiag = !(host.querySelector<HTMLElement>("[data-diag]")?.hidden ?? true);
    this.host.querySelector("[data-diag-toggle]")?.setAttribute("aria-pressed", String(this.showDiag));
    this.resize();
  }

  /** Called when the server says the match starts. */
  start(): void {
    this.status = "running";
    this.deps.sound?.play("start");
    this.deps.sound?.startMusic();
    this.schedule();
    this.inputTimer = setInterval(() => this.pushInput(), 50);
    this.hudTimer = setInterval(() => this.updateHud(), 250);
    // The round trip drives how far ahead the picture is drawn: measure it every couple of seconds during a match.
    this.deps.client.ping();
    this.pingTimer = setInterval(() => this.deps.client.ping(), 2000);
  }

  onFinish(listener: (outcome: ArenaOutcome) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** What a result card needs: the last mass, the best mass, the eliminations and the player's name. */
  /** True once the person's own body was eliminated. */
  get isDead(): boolean { return this.dead; }

  get stats(): { mass: number; peak: number; kills: number; you: string } {
    return { mass: this.myMass, peak: this.peakMass, kills: this.kills, you: this.you };
  }

  /** The skins the others wear (the live arena announces them as people come and go). */
  setPlayerSkins(map: Record<string, string>): void {
    this.painter.setSkins(map, this.deps.ownSkin?.() ?? null);
  }

  /** The live arena: a viewer takes a place, so the body they steer is now this one. */
  setYou(w: string): void {
    this.you = w;
    this.dead = false;
    this.specMap = false;
    this.specFree = false;
    this.specTarget = null;
    // A new body: the power buttons come back as the next picture says (only cash out in the cash arena).
    this.cashUiForce = true;
    this.kills = 0;
    this.peakMass = 0;
    this.setDeadOverlay(null);
    this.painter.resetYouMarker();
  }

  /** Changes the color of the local goshi at once. */
  setOwnSkin(id: string | null): void {
    this.painter.setSkins(undefined, id);
  }

  setOwnColor(index: number | null): void {
    this.painter.setOwnColor(index);
  }

  /** The name a wallet had in the latest snapshot. */
  nameOf(w: string): string {
    return this.buf.latest?.players.find((p) => p.w === w)?.n ?? w.slice(0, 4);
  }

  dispose(): void {
    this.deps.sound?.stopMusic();
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
    this.stopLoops();
    for (const c of this.cleanups.splice(0)) c();
    this.canvas = this.g = this.host = null;
    this.status = "idle";
  }

  // ------------------------------------------------------------------ server messages (fed by the page)

  handleStart(msg: Start): void {
    this.roomId = msg.roomId;
    this.you = msg.you;
    this.world = msg.world;
    this.zoneStart = msg.zone;
    this.matchMs = msg.matchMs;
    this.shrinkStartMs = msg.shrinkStartMs;
    this.orbs = new Map(msg.orbs.map((o) => [o.id, o]));
    this.boosting.clear();
    this.lastPhaseKey = null;
    this.floaters.length = 0;
    this.setOutBanner(false, 0);
    this.diag.reset();
    this.rec.reset();
    this.lastBytes = this.deps.client.bytesIn ?? 0;
    this.painter.fx.clear();
    this.shakeAmp = 0;
    this.buf.clear();
    this.dead = false;
    // A viewer of the live arena (no body of their own yet) follows the heaviest body instead of seeing the whole map.
    this.specMap = !msg.you.startsWith("spec_");
    this.local = null;
    this.want = null;
    // Real placeholders until the first snapshot: the whole match to go, the start mass, everybody alive.
    this.myMass = START_MASS;
    this.peakMass = START_MASS;
    this.kills = 0;
    this.finalRank = 0;
    this.alive = Object.keys(msg.roles).length;
    this.painter.setSkins(msg.skins, this.deps.ownSkin?.() ?? null);
    this.timeLeftMs = msg.matchMs;
    this.cam = { x: msg.zone.cx, y: msg.zone.cy };
    this.camSet = false;
    this.span = 0;
    this.setDeadOverlay(null);
    this.cashUiForce = true;
    this.stopLoops();
    this.start();
    this.deps.announce(this.deps.strings.startAnnounce);
  }

  handleSnap(msg: Snap): void {
    if (msg.roomId !== this.roomId) return;
    const prev = this.buf.latest;
    const before = this.beforeMap;
    before.clear();
    if (prev) for (const p of prev.players) before.set(p.w, p);
    const arrival = performance.now();
    const at = this.clock.stamp(arrival, msg.tick);
    this.buf.push({ at, tick: msg.tick, players: msg.players, zone: msg.zone });
    this.traps = msg.traps ?? NO_TRAPS;
    // A trap that was not there before, or a shield going up: its owner makes its special face (popcat pops...).
    const nowMs = performance.now();
    for (const t of this.traps) {
      const key = `${t.o}:${t.k}:${t.x}:${t.y}`;
      if (!this.seenTraps.has(key)) { this.seenTraps.add(key); this.painter.noteFired(t.o, nowMs); }
    }
    if (this.seenTraps.size > 400) this.seenTraps.clear();
    for (const p of msg.players) {
      if (p.sh && !this.shieldUp.has(p.w)) this.painter.noteFired(p.w, nowMs);
      if (p.sh) this.shieldUp.add(p.w); else this.shieldUp.delete(p.w);
    }
    if (msg.world) this.world = msg.world;
    const total = this.deps.client.bytesIn ?? 0;
    this.diag.snapshot(arrival, total - this.lastBytes);
    this.rec.snapshot(arrival, total - this.lastBytes);
    this.lastBytes = total;
    // Each new phase or state is said once: the next zone is marked, it closes, the final zone.
    const key = phaseKey(msg.zone);
    if (key !== null && key !== this.lastPhaseKey) {
      this.lastPhaseKey = key;
      const st = zoneStatus(msg.zone);
      if (st.line === "warn" || st.line === "shrink" || st.line === "final") { this.deps.announce(zoneText(st, this.deps.strings.zoneLines)); if (st.line === "warn") this.deps.sound?.play("zone"); }
    }
    this.snapshotEffects(msg, before, prev?.tick);
    this.timeLeftMs = msg.timeLeftMs;
    if (msg.dropIn !== undefined) { this.dropIn = msg.dropIn; this.dropAt = performance.now(); }
    if (msg.drop) {
      this.deps.announce(this.deps.strings.showerLanded);
      this.feedLine(this.deps.strings.showerLanded, false);
      this.deps.sound?.play("bonus");
    }
    this.alive = msg.players.filter((p) => p.alive).length;
    this.deps.sound?.setIntensity(this.alive <= 3 ? 2 : this.alive <= 6 ? 1 : 0);
    const me = msg.players.find((p) => p.w === this.you);
    if (me) {
      this.myMass = me.m;
      if (me.m > this.peakMass) this.peakMass = me.m;
    }
    // Outside the zone: the banner with what it costs, and a "-N" number near the head once a second.
    const out = !!me && me.alive && me.zout === true;
    if (out && me) {
      const loss = zoneDamagePerSecond(me.m, msg.zone.phase ?? 0);
      this.setOutBanner(true, loss);
      if (at - this.floaterAt >= 1000) {
        this.floaterAt = at;
        this.floaters.push({ x: me.head[0], y: me.head[1], text: `-${Math.round(loss)}`, age: 0 });
        if (this.floaters.length > 5) this.floaters.shift();
      }
    } else if (this.outNow) {
      this.setOutBanner(false, 0);
    }
    const after = this.afterMap;
    after.clear();
    for (const p of msg.players) after.set(p.w, p);
    const nameOf = (w: string) => after.get(w)?.n ?? before.get(w)?.n ?? w.slice(0, 4);
    for (const ev of msg.events) {
      // A dead player has no mass and no body in the snapshot: its size is from the snapshot before, its head from this one.
      const body = (w: string) => {
        const now = after.get(w);
        const old = before.get(w);
        const src = now && now.alive ? now : old;
        const head = now?.head ?? old?.head;
        return src && head ? { m: src.m, r: src.r, head } : undefined;
      };
      const cause = classifyDeath(ev, body(ev.w), body(ev.by));
      const line = deathLine(cause, ev.w, this.you, nameOf, this.deps.strings.death);
      this.deps.announce(line);
      this.feedLine(line, ev.w === this.you);
      if (ev.by === this.you && ev.w !== this.you) { this.kills++; this.deps.sound?.play("kill"); }
      if (ev.w === this.you) {
        this.dead = true;
        // Nothing is forced: the card offers the whole map, following someone, or looking around freely.
        this.specMap = false;
        // Dead, no power can be used: every power button goes away until the next body.
        for (const b of Array.from(this.host?.querySelectorAll<HTMLElement>("[data-trap]") ?? [])) b.hidden = true;
        this.cashUi = true;
        this.finalRank = ev.rank;
        const mine = before.get(this.you);
        if (ev.by === "cashout" || (mine?.cb ?? 0) > 0) this.setCashOverlay(null, ev.by !== "cashout");
        else this.setDeadOverlay({ rank: ev.rank, why: line });
      }
    }
  }

  /** What this device and page look like, for the report. */
  private environment(): Env {
    const c = this.canvas;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const qm = this.deps.quality;
    const latest = this.buf.latest;
    const z = latest?.zone;
    return {
      at: new Date().toISOString(),
      page: location.pathname,
      userAgent: navigator.userAgent,
      dpr: window.devicePixelRatio || 1,
      canvasCss: [c?.clientWidth ?? 0, c?.clientHeight ?? 0],
      canvasPx: [c?.width ?? 0, c?.height ?? 0],
      cores: nav.hardwareConcurrency ?? null,
      memoryGB: nav.deviceMemory ?? null,
      gpu: this.gpu(),
      reducedMotion: this.reduced,
      heapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
      qualityMode: qm?.mode ?? "n/a",
      qualityLevel: qm ? LEVEL_NAMES[qm.level] : "high",
      visibility: document.visibilityState,
      zone: z ? `phase ${z.phase ?? "?"} ${z.state ?? "?"} r ${Math.round(z.r)}` : "no snapshot",
    };
  }

  /** The graphics card name, from a throwaway WebGL context (cached). */
  private gpu(): string {
    if (this.gpuName !== null) return this.gpuName;
    let name = "unknown";
    try {
      const c = document.createElement("canvas");
      const gl = (c.getContext("webgl") ?? c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      if (gl) {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } else name = "no WebGL";
    } catch { /* blocked */ }
    this.gpuName = name;
    return name;
  }

  private observeLongTasks() {
    if (this.longTaskObserver || typeof PerformanceObserver === "undefined") return;
    try {
      const o = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) this.rec.longTask(e.startTime, e.duration);
      });
      o.observe({ entryTypes: ["longtask"] });
      this.longTaskObserver = o;
      this.rec.longTaskSupported = true;
    } catch { this.rec.longTaskSupported = false; }
  }

  /** The report text of the last 30 seconds. */
  report(): string {
    return buildReport(this.rec.collect(performance.now()), this.environment()).text;
  }

  /** Copies the report and shows it in a text box (the fallback when the clipboard is blocked). */
  private async copyReport() {
    const text = this.report();
    const box = this.host?.querySelector<HTMLTextAreaElement>("[data-report-text]");
    const note = this.host?.querySelector<HTMLElement>("[data-report-note]");
    if (box) { box.value = text; box.hidden = false; }
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try { box?.focus(); box?.select(); ok = document.execCommand("copy"); } catch { ok = false; }
    }
    if (note) {
      note.hidden = false;
      note.textContent = ok ? this.deps.strings.reportCopied : this.deps.strings.reportManual;
    }
    console.info("[goshi] arena report\n" + text);
  }

  private setDiag(on: boolean) {
    this.showDiag = on;
    const el = this.host?.querySelector<HTMLElement>("[data-diag]");
    if (el) el.hidden = !on;
    const btn = this.host?.querySelector<HTMLElement>("[data-diag-toggle]");
    btn?.setAttribute("aria-pressed", String(on));
    if (on) this.updateDiag();
  }

  private updateDiag() {
    const el = this.host?.querySelector<HTMLElement>("[data-diag]");
    if (!el || !this.showDiag) return;
    const m = this.diag.summary(performance.now());
    const q = this.deps.quality;
    const level = q ? LEVEL_NAMES[q.level] : "high";
    const label = q && q.mode === "auto" ? `${level} (auto)` : level;
    const ping = this.deps.client.rttKnown ? String(Math.round(this.deps.client.rttMs)) : "-";
    const tpl = this.deps.diagLine ?? "FPS {fps} | worst {worst} ms | snapshots {sps}/s | jitter {jit} ms | {kbs} KB/s | ping {ping} ms | draw {draw} ms | quality {q}";
    el.textContent = tpl
      .replace("{fps}", String(m.fps))
      .replace("{worst}", String(Math.round(m.worstMs)))
      .replace("{sps}", m.sps.toFixed(1))
      .replace("{jit}", m.jitterMs.toFixed(1))
      .replace("{kbs}", (m.bytesPerSec / 1024).toFixed(1))
      .replace("{ping}", ping)
      .replace("{draw}", m.drawMs.toFixed(1))
      .replace("{q}", label);
  }

  /** Feeds the frame time to the quality manager and applies the level it picks (before the canvas is resized). */
  private adaptQuality(now: number) {
    const qm = this.deps.quality;
    if (!qm) return;
    if (this.frameGap > 0) qm.record(this.frameGap, now);
    const lvl = qm.level;
    if (lvl !== this.lastQualityLevel) {
      this.lastQualityLevel = lvl;
      this.painter.quality = SETTINGS[lvl];
      this.resize();
    }
  }

  private setOutBanner(on: boolean, loss: number) {
    this.outNow = on;
    const el = this.host?.querySelector<HTMLElement>("[data-zone-banner]");
    if (!el) return;
    el.hidden = !on;
    if (on) {
      const text = this.deps.strings.zoneOutBanner.replace("{n}", String(Math.round(loss * 10) / 10));
      if (el.textContent !== text) el.textContent = text;
    }
  }

  /** Eat pops, loot marking, the boost detection and the death bursts for one snapshot. */
  private snapshotEffects(msg: Snap, before: Map<string, PlayerSnap>, prevTick: number | undefined) {
    const fx = this.painter.fx;
    const fresh = !this.reduced && this.painter.quality.particles;
    const me = msg.players.find((p) => p.w === this.you);
    this.myBag = me && me.bag !== undefined ? me.bag : null;
    // A room paid by bag: the board shows every bag, not the mass.
    if (msg.players.some((p) => p.bag !== undefined)) this.painter.setBags(new Map(msg.players.map((p) => [p.w, p.bag ?? 0])));
    this.bossInfo = msg.boss ?? null;
    // The SOL of a boost that just ended explodes from the head and flies to the coins it became all over the map.
    for (const pop of msg.pops ?? []) {
      const coins = pop.ids.map((id) => this.orbs.get(id)).filter((o): o is NonNullable<typeof o> => !!o);
      const who = msg.players.find((p) => p.w === pop.w);
      // A big flash at the head (the coins themselves fly far, often off screen) and the amount that left.
      if (coins.length) this.painter.supernova([pop.x, pop.y], [], Math.max(14, (who?.r ?? 10) * 1.6), "#14f195", coins, performance.now());
      const lost = coins.reduce((n, o) => n + (o.q ?? 0), 0);
      if (lost > 0) this.floaters.push({ x: pop.x, y: pop.y, text: `-${lost.toFixed(9)} SOL`, age: -1 });
    }
    // The cash arena has only one power, cashing out: the other buttons are not shown there.
    const cashNow = !!me?.en;
    if (me && me.alive && (cashNow !== this.cashUi || this.cashUiForce)) {
      this.cashUiForce = false;
      this.cashUi = cashNow;
      for (const b of Array.from(this.host?.querySelectorAll<HTMLElement>("[data-trap]") ?? [])) b.hidden = b.dataset.trap !== "5" && cashNow;
    }
    this.freezeLeft = msg.freeze ?? 0;
    this.solNow = msg.sol ?? null;
    this.cashInfo(msg.cashInfo);
    // Coins that fused on the map: a beam from one into the other and a swell where they meet.
    if (fresh) for (const [ax, ay, bx, by] of msg.fuses ?? []) fx.fuse(ax, ay, bx, by, 14, 3);
    // Coins the zone left outside: they leave without a mouth near them, and fuse into a new coin inside (rules 5).
    const outside: LooseOrb[] = [];
    const z = msg.zone;
    for (const id of msg.eatenOrbs) {
      const o = this.orbs.get(id);
      if (!o) continue;
      this.orbs.delete(id);
      if (z && Math.hypot(o.x - z.cx, o.y - z.cy) > z.r && !msg.players.some((p) => p.alive && Math.hypot(p.head[0] - o.x, p.head[1] - o.y) < p.r + 40)) {
        outside.push(o);
        continue;
      }
      if (fresh) {
        const tier = orbTier(o.v, o.loot === true);
        fx.pop(o.x, o.y, orbRadius(o.v) * TIER_SCALE[tier] * 1.6, tier);
      }
      if (me && me.alive && Math.hypot(me.head[0] - o.x, me.head[1] - o.y) < me.r + 36) {
        this.deps.sound?.play(o.v >= 4 ? "bonus" : "eat");
        // A coin of the market says what it was: "+24 sats", "+0.25 DOGE".
        // Only a coin that really carries SOL says what it was worth: "+0.0012 SOL".
        if (o.c === "SOL" && o.q) this.floaters.push({ x: o.x, y: o.y, text: `+${coinAmount(o.c, o.q)}`, age: 0 });
      }
      // Whoever has the orb at its mouth is the one that ate it: a happy face for a moment.
      for (const p of msg.players) {
        if (p.alive && Math.hypot(p.head[0] - o.x, p.head[1] - o.y) < p.r + 40) { this.painter.noteAte(p.w, performance.now()); break; }
      }
    }
    // A body turned into orbs arrives as a batch next to a death: those are drawn bigger and golden.
    const lootBatch = msg.events.length > 0 && msg.newOrbs.length >= 6;
    if (msg.orbIds) { const keep = new Set(msg.orbIds); for (const id of [...this.orbs.keys()]) if (!keep.has(id)) this.orbs.delete(id); }
    // A coin born and eaten in the same picture is never drawn (otherwise it would stay on screen, gone on the server).
    const eatenHere = new Set(msg.eatenOrbs);
    for (const o of msg.newOrbs) {
      if (eatenHere.has(o.id)) continue;
      const loot = lootBatch || !Number.isInteger(o.v);
      this.orbs.set(o.id, loot ? { ...o, loot: true } : o);
    }
    // Each piece left outside glows, and they fly together into the bigger coin they fused into, just inside the edge.
    if (outside.length && fresh && z) {
      const now = performance.now();
      const groups = new Map<Snap["newOrbs"][number], LooseOrb[]>();
      for (const o of outside) {
        let best: Snap["newOrbs"][number] | null = null, bd = Infinity;
        for (const n of msg.newOrbs) {
          const d = Math.hypot(n.x - o.x, n.y - o.y);
          if (d < bd && Math.hypot(n.x - z.cx, n.y - z.cy) <= z.r) { bd = d; best = n; }
        }
        if (!best) continue;
        fx.pop(o.x, o.y, orbRadius(o.v) * 2.4, 3);
        const g = groups.get(best);
        if (g) g.push(o); else groups.set(best, [o]);
      }
      for (const [target, pieces] of groups) {
        const cx = pieces.reduce((n, o) => n + o.x, 0) / pieces.length, cy = pieces.reduce((n, o) => n + o.y, 0) / pieces.length;
        this.painter.supernova([cx, cy], [], orbRadius(target.v) * 1.5, "#ffd34d", [this.orbs.get(target.id) ?? target], now);
      }
    }
    // Boost: a player that moved clearly faster than its normal speed since the last snapshot.
    this.boosting.clear();
    if (prevTick !== undefined && msg.tick > prevTick) {
      const dtS = ((msg.tick - prevTick) * 50) / 1000;
      for (const p of msg.players) {
        const q = before.get(p.w);
        if (!q || !q.alive || !p.alive) continue;
        const v = Math.hypot(p.head[0] - q.head[0], p.head[1] - q.head[1]) / dtS;
        if (v > speedOf(p.m) * 1.35) this.boosting.add(p.w);
      }
    }
    // Death: a supernova where the body was (the snapshot of the death has no body any more), and its coins fly to where they land.
    const deadNow = msg.events.filter((ev) => before.get(ev.w)?.alive);
    const lootCoins = deadNow.length && msg.newOrbs.length >= 6 ? msg.newOrbs : [];
    deadNow.forEach((ev, k) => {
      const old = before.get(ev.w)!;
      const share = lootCoins.filter((_, i) => i % deadNow.length === k);
      if (fresh) this.painter.supernova(old.head, old.body, old.r, this.painter.styleFor(old).body, share, performance.now());
    });
    for (const ev of msg.events) {
      const old = before.get(ev.w);
      if (!old || !old.alive) continue;
      if (fresh) {
        const color = this.painter.effectColor(old);
        fx.burst(old.head[0], old.head[1], 16, 180, old.r * 0.5, color);
        this.painter.noteDeath(old.head[0], old.head[1], old.r, color, performance.now());
        for (let i = 2; i < old.body.length; i += Math.max(2, Math.ceil(old.body.length / 8))) {
          fx.burst(old.body[i][0], old.body[i][1], 3, 120, old.r * 0.45, color);
        }
      }
      if (ev.w === this.you) {
        this.shakeAt = performance.now();
        this.shakeAmp = 14;
        this.deps.sound?.play("death");
      }
    }
  }

  handleEnd(msg: End): void {
    if (msg.roomId !== this.roomId) return;
    this.stopLoops();
    this.deps.sound?.stopMusic();
    if (msg.payout.podium[0]?.w === this.you) this.deps.sound?.play("win");
    this.status = "finished";
    this.draw(performance.now());
    this.deps.announce(this.deps.strings.endAnnounce);
    const podium = msg.payout.podium.map((p) => p.w);
    const outcome: ArenaOutcome = {
      // Practice matches have ids like "practice-1a2b3c4d": no room number then.
      roomId: /^\d+$/.test(msg.roomId) ? BigInt(msg.roomId) : 0n,
      podium: [podium[0] ?? "", podium[1] ?? "", podium[2] ?? ""],
      resultId: msg.tx ?? undefined,
    };
    for (const l of [...this.listeners]) l(outcome);
  }

  private infoAt = 0;
  /** Cash arena: the numbers of the arena and a tip that changes every 7 s, refreshed twice a second at most. */
  private cashInfo(ci?: { in: number; n: number; house: number; paid: number; outs: number; kills: number; cut: number; left: number }) {
    const el = this.host?.querySelector<HTMLElement>("[data-cash-info]");
    const s = this.deps.strings;
    if (!el) return;
    if (!ci || !s.cashInfoLines) { el.hidden = true; return; }
    const now = performance.now();
    if (now - this.infoAt < 500) return;
    this.infoAt = now;
    const sol = (l: number) => (l / 1e9).toFixed(9);
    const pool = (this.solNow?.free ?? 0) + (this.solNow?.held ?? 0);
    const vals: Record<string, string> = { n: String(ci.n), in: sol(ci.in), pool: sol(pool), house: sol(ci.house), cut: sol(ci.cut), outs: String(ci.outs), paid: sol(ci.paid), kills: String(ci.kills), left: String(ci.left) };
    const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? "");
    const tips = s.cashTips ?? [];
    const tip = tips.length ? tips[Math.floor(now / 7000) % tips.length] : "";
    el.replaceChildren();
    const b = document.createElement("b"); b.textContent = s.cashInfoTitle ?? ""; el.append(b);
    for (const t of s.cashInfoLines) { const d = document.createElement("div"); d.textContent = fill(t); el.append(d); }
    if (tip) { const d = document.createElement("div"); d.className = "tip"; d.textContent = tip; el.append(d); }
    el.hidden = false;
  }

  /** A short kill feed on the canvas: the last few lines, each fades after a few seconds. */
  private feedLine(text: string, mine: boolean) {
    const list = this.host?.querySelector<HTMLElement>("[data-feed]");
    if (!list) return;
    const li = document.createElement("li");
    li.textContent = text;
    if (mine) li.className = "me";
    list.append(li);
    while (list.children.length > 4) list.firstElementChild?.remove();
    setTimeout(() => li.remove(), 7000);
  }

  /** The card after a cash out: never "eliminated". While the payout is on its way it says so; then the amount, the multiple and
   *  the payout on Solscan. Stopped halfway, it says what reached the wallet and that the rest fell on the map. */
  /** The big result after a cash out, in the middle of the screen: what reached the wallet, the multiple, and the gain (green)
   *  or the loss (red) against the entry. It stays a few seconds; the card below keeps the details. */
  private cashResult(bag: number, entry: number): void {
    const host = this.host?.querySelector<HTMLElement>(".game-canvas") ?? this.host;
    if (!host) return;
    host.querySelector(".cash-result")?.remove();
    const s = this.deps.strings;
    const net = bag - entry;
    const box = document.createElement("div");
    box.className = `cash-result ${net >= 0 ? "is-gain" : "is-loss"}`;
    const big = document.createElement("strong");
    big.textContent = `${net >= 0 ? "+" : "-"}${(Math.abs(net) / 1e9).toFixed(9).replace(/0+$/, "").replace(/\.$/, "")} SOL`;
    const line = document.createElement("span");
    line.textContent = (net >= 0 ? s.cashGain ?? "" : s.cashLoss ?? "").replace("{bag}", (bag / 1e9).toFixed(9)).replace("{x}", entry ? (bag / entry).toFixed(2) : "0");
    box.append(big, line);
    host.append(box);
    setTimeout(() => box.remove(), 7000);
  }

  private setCashOverlay(m: { bag: number; entry: number; sig?: string; by?: string } | null, stopped: boolean) {
    const el = this.host?.querySelector<HTMLElement>("[data-dead]");
    if (!el) return;
    el.hidden = false;
    const s = this.deps.strings;
    const t = el.querySelector<HTMLElement>("[data-dead-title]");
    const x = el.querySelector<HTMLElement>("[data-dead-text]");
    const k = el.querySelector<HTMLElement>("[data-dead-by]");
    if (t) t.textContent = (stopped ? s.cashOutStopped : s.cashOutTitle) ?? "";
    if (!m) { if (x) x.textContent = s.cashOutSending ?? ""; if (k) k.textContent = ""; return; }
    this.cashResult(m.bag, m.entry);
    if (!stopped) window.dispatchEvent(new CustomEvent("goshi-cashed-out"));
    const bag = (m.bag / 1e9).toFixed(9), mult = m.entry ? (m.bag / m.entry).toFixed(2) : "0";
    const name = m.by ? (this.buf.latest?.players.find((p) => p.w === m.by)?.n ?? `${m.by.slice(0, 4)}..${m.by.slice(-4)}`) : "";
    if (x) x.textContent = (stopped ? s.cashOutStoppedText ?? "" : s.cashOutText ?? "").replace("{bag}", bag).replace("{x}", mult).replace("{name}", name);
    if (k) {
      k.textContent = "";
      if (m.sig) {
        const a = document.createElement("a");
        a.href = `https://solscan.io/tx/${m.sig}${CLUSTER_QS}`;
        a.target = "_blank"; a.rel = "noopener";
        a.className = "link-btn";
        a.textContent = `${s.solscan ?? "Solscan"} · ${m.sig.slice(0, 8)}…`;
        k.append(a);
      }
    }
  }

  private setDeadOverlay(info: { rank: number; why: string } | null) {
    const el = this.host?.querySelector<HTMLElement>("[data-dead]");
    if (!el) return;
    el.hidden = info === null;
    if (!info) return;
    const s = this.deps.strings;
    const t = el.querySelector<HTMLElement>("[data-dead-title]");
    const x = el.querySelector<HTMLElement>("[data-dead-text]");
    const k = el.querySelector<HTMLElement>("[data-dead-by]");
    if (t) t.textContent = s.deadTitle;
    if (x) x.textContent = s.deadText.replace("{rank}", String(info.rank));
    if (k) k.textContent = info.why;
  }

  // ------------------------------------------------------------------ input

  private bind() {
    const canvas = this.canvas!;
    const on = <T extends Event>(target: EventTarget, type: string, fn: (e: T) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    const rel = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
    };
    // Touch: "joystick" (default) steers by how far the finger moved from where it first touched, like the .io games on a phone;
    // "follow" steers toward the finger from the center of the board. The choice is kept in this browser.
    const joyEl = this.host?.querySelector<HTMLElement>("[data-joy]");
    const knob = this.host?.querySelector<HTMLElement>("[data-joy-knob]");
    const ctrlBtn = this.host?.querySelector<HTMLElement>("[data-ctrl-toggle]");
    const JOY_R = 64;
    let joystick = true;
    try { joystick = localStorage.getItem("goshi-ctrl") !== "follow"; } catch { /* default */ }
    const paintCtrl = () => { if (ctrlBtn) ctrlBtn.textContent = (joystick ? ctrlBtn.dataset.joyLabel : ctrlBtn.dataset.followLabel) ?? ""; };
    paintCtrl();
    if (ctrlBtn) on<MouseEvent>(ctrlBtn, "click", () => {
      joystick = !joystick;
      try { localStorage.setItem("goshi-ctrl", joystick ? "joystick" : "follow"); } catch { /* optional */ }
      paintCtrl();
    });
    let origin: { x: number; y: number } | null = null;
    const hideJoy = () => { origin = null; if (joyEl) joyEl.hidden = true; };
    const moveJoy = (e: PointerEvent) => {
      if (!origin) return;
      let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
      const len = Math.hypot(dx, dy);
      this.pointer = { x: dx, y: dy };
      if (len > JOY_R) { dx = (dx / len) * JOY_R; dy = (dy / len) * JOY_R; }
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    on<PointerEvent>(canvas, "pointermove", (e) => {
      if (e.pointerType !== "mouse" && joystick) return moveJoy(e);
      this.pointer = rel(e);
    });
    on<PointerEvent>(canvas, "pointerdown", (e) => {
      // Eliminated: a tap on the map moves the camera to the next player still alive.
      if (this.dead && !this.specFree && !this.specMap) this.nextSpectateTarget();
      if (e.pointerType !== "mouse" && joystick) {
        origin = { x: e.clientX, y: e.clientY };
        if (joyEl) {
          const r = canvas.getBoundingClientRect();
          joyEl.style.left = `${e.clientX - r.left}px`;
          joyEl.style.top = `${e.clientY - r.top}px`;
          joyEl.hidden = false;
        }
        if (knob) knob.style.transform = "translate(0px, 0px)";
        this.pointer = { x: 0, y: 0 };
      } else this.pointer = rel(e);
      canvas.setPointerCapture?.(e.pointerId);
      canvas.focus({ preventScroll: true });
    });
    const release = (e: PointerEvent) => { if (e.pointerType !== "mouse") { this.pointer = null; hideJoy(); } };
    on<PointerEvent>(canvas, "pointerup", release);
    on<PointerEvent>(canvas, "pointercancel", release);
    on<PointerEvent>(canvas, "pointerleave", (e) => { if (e.pointerType === "mouse") this.pointer = null; });
    // A right click must never open the browser menu over a running match: the menu takes the pointer and the body goes straight on.
    on<Event>(window, "contextmenu", (e) => { if (this.status === "running") e.preventDefault(); });

    const keyName = (e: KeyboardEvent) => e.key.toLowerCase();
    const steering = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    };
    on<KeyboardEvent>(window, "keydown", (e) => {
      if (this.status !== "running" || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = keyName(e);
      if (steering.has(k)) { this.keys.add(k); e.preventDefault(); }
      else if ((k === "1" || k === "2" || k === "3" || k === "4" || k === "5") && this.host?.querySelector(`[data-trap="${k}"]`)) { this.setTrap(Number(k) as TrapK); e.preventDefault(); }
      else if (k === " " || k === "shift") {
        if (!this.boostKey) this.deps.sound?.play("boost");
        this.boostKey = true;
        if (k === " ") e.preventDefault();
      }
    });
    on<KeyboardEvent>(window, "keydown", (e) => {
      if (this.status !== "running" || typing(e) || !this.dead) return;
      const k = keyName(e);
      if (k === "c") this.toggleSpectateFree();
      else if (k === "n" || k === "tab") { this.nextSpectateTarget(); if (k === "tab") e.preventDefault(); }
    });
    // The elimination card: collapse it with the minus button, drag it by its title bar.
    const deadBox = this.host?.querySelector<HTMLElement>("[data-dead]");
    const deadMin = this.host?.querySelector<HTMLElement>("[data-dead-min]");
    if (deadBox && deadMin) {
      on<MouseEvent>(deadMin, "click", () => {
        const min = deadBox.classList.toggle("min");
        deadMin.textContent = min ? "+" : "\u2212";
        deadMin.setAttribute("aria-expanded", String(!min));
      });
      const head = deadBox.querySelector<HTMLElement>("[data-dead-drag]");
      if (head) {
        on<PointerEvent>(head, "pointerdown", (e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          const parent = deadBox.offsetParent as HTMLElement | null;
          if (!parent) return;
          const pr = parent.getBoundingClientRect(), br = deadBox.getBoundingClientRect();
          const dx = e.clientX - br.left, dy = e.clientY - br.top;
          head.setPointerCapture(e.pointerId);
          const move = (m: PointerEvent) => {
            const x = Math.min(Math.max(0, m.clientX - dx - pr.left), pr.width - br.width);
            const y = Math.min(Math.max(0, m.clientY - dy - pr.top), pr.height - br.height);
            deadBox.style.inset = "auto"; deadBox.style.left = `${x}px`; deadBox.style.top = `${y}px`;
          };
          const up = () => { head.removeEventListener("pointermove", move); head.removeEventListener("pointerup", up); head.removeEventListener("pointercancel", up); };
          head.addEventListener("pointermove", move); head.addEventListener("pointerup", up); head.addEventListener("pointercancel", up);
        });
      }
    }
    const specMapBtn = this.host?.querySelector<HTMLElement>("[data-spectate-map]");
    if (specMapBtn) on<MouseEvent>(specMapBtn, "click", () => { this.specMap = true; this.specFree = false; this.host?.querySelector<HTMLElement>("[data-spectate-free]")?.setAttribute("aria-pressed", "false"); });
    const specFreeBtn = this.host?.querySelector<HTMLElement>("[data-spectate-free]");
    if (specFreeBtn) on<MouseEvent>(specFreeBtn, "click", () => this.toggleSpectateFree());
    const specNextBtn = this.host?.querySelector<HTMLElement>("[data-spectate-next]");
    if (specNextBtn) on<MouseEvent>(specNextBtn, "click", () => this.nextSpectateTarget());
    on<KeyboardEvent>(window, "keyup", (e) => {
      const k = keyName(e);
      this.keys.delete(k);
      if (k === " " || k === "shift") this.boostKey = false;
    });
    on<Event>(window, "blur", () => { this.keys.clear(); this.boostKey = false; this.pointer = null; });
    // Nothing is drawn while the tab is hidden, and the loop restarts when it is back (never two loops).
    on<Event>(document, "visibilitychange", () => {
      this.rec.visibilityChange(performance.now());
      if (document.visibilityState === "hidden") {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
      } else {
        this.lastFrameAt = 0;
        this.diag.reset();
        this.schedule();
      }
    });
    on<KeyboardEvent>(window, "keydown", (e) => {
      if (e.key === "F3" && this.status === "running") { e.preventDefault(); this.setDiag(!this.showDiag); }
      if (e.key === "F4" && (this.status === "running" || this.status === "finished")) { e.preventDefault(); void this.copyReport(); }
    });
    const reportBtn = this.host?.querySelector<HTMLElement>("[data-report-button]");
    if (reportBtn) on<MouseEvent>(reportBtn, "click", () => void this.copyReport());
    const diagBtn = this.host?.querySelector<HTMLElement>("[data-diag-toggle]");
    if (diagBtn) on<MouseEvent>(diagBtn, "click", () => this.setDiag(!this.showDiag));

    // Trap buttons, and what the server answers: the backpack left, or why a trap was refused (shown over the head).
    const trapBox = this.host?.querySelector<HTMLElement>("[data-traps]");
    for (const b of Array.from(this.host?.querySelectorAll<HTMLElement>("[data-trap]") ?? [])) {
      on<PointerEvent>(b, "pointerdown", (e) => { e.preventDefault(); this.setTrap(Number(b.dataset.trap) as TrapK); });
    }
    const link = this.deps.client;
    if (trapBox && link.on) {
      const leftEl = trapBox.querySelector<HTMLElement>("[data-trap-left]");
      const off = link.on("message", (m) => {
        if (m.t === "trapOk" && leftEl && m.left && m.left !== "0") leftEl.textContent = (trapBox.dataset.left ?? "").replace("{n}", (Number(m.left) / 1e9).toFixed(4));
        if (m.t === "varClip" && m.id) {
          // The server recorded your clip: it goes to your history, and the VAR button opens it (checked, on the matches page).
          try {
            const key = "goshi-var-history";
            const list = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[];
            list.unshift({ id: m.id, kind: m.kind, bag: m.bag, at: m.at, hash: m.hash });
            localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
          } catch { /* private mode */ }
          const vb = this.host?.querySelector<HTMLAnchorElement>("[data-var-button]");
          if (vb) { vb.href = `${vb.dataset.varHref ?? "/"}?var=${encodeURIComponent(m.id)}#var-board`; vb.hidden = false; }
        }
        if (m.t === "cashEntry") {
          const s2 = this.deps.strings;
          const me = this.buf.latest?.players.find((p) => p.w === this.you);
          // The ticket bought its place (or was already used): this browser forgets it.
          if ((m.ok || m.why === "used") && m.sig) window.dispatchEvent(new CustomEvent("goshi-ticket-used", { detail: { sig: m.sig } }));
          const text = m.ok ? (s2.cashEntryOk ?? "").replace("{n}", ((m.lamports ?? 0) / 1e9).toFixed(9)) : m.why === "sign_in" ? s2.cashSignIn ?? "" : (s2.cashEntryBad ?? "").replace("{why}", m.why ?? "");
          if (text) { this.deps.announce(text); this.floaters.push({ x: me?.head[0] ?? this.cam.x, y: me?.head[1] ?? this.cam.y, text, age: -2 }); }
        }
        if (m.t === "cashedOut" && this.deps.strings.cashedOut && m.bag !== undefined) {
          const me = this.buf.latest?.players.find((p) => p.w === this.you);
          const text = this.deps.strings.cashedOut.replace("{bag}", (m.bag / 1e9).toFixed(9)).replace("{x}", m.entry ? (m.bag / m.entry).toFixed(1) : "0") + (m.sig ? ` · tx ${m.sig.slice(0, 8)}…` : "");
          this.floaters.push({ x: me?.head[0] ?? this.cam.x, y: me?.head[1] ?? this.cam.y, text, age: -2 });
          this.setCashOverlay({ bag: m.bag, entry: m.entry ?? 0, sig: m.sig, by: m.by }, m.full === false);
        }
        if (m.t === "trapNo") {
          const me = this.buf.latest?.players.find((p) => p.w === this.you);
          const text = m.reason === "no_backpack" ? trapBox.dataset.noBackpack : m.reason === "too_soon" ? trapBox.dataset.tooSoon : m.reason === "not_now" ? trapBox.dataset.notNow ?? "" : "";
          if (me && text) this.floaters.push({ x: me.head[0], y: me.head[1], text, age: 0 });
        }
      });
      this.cleanups.push(off);
    }

    for (const boostBtn of Array.from(this.host?.querySelectorAll<HTMLElement>("[data-boost-button]") ?? [])) {
      const set = (v: boolean) => { this.boostButton = v; boostBtn.setAttribute("aria-pressed", String(v)); };
      on<PointerEvent>(boostBtn, "pointerdown", (e) => { e.preventDefault(); this.deps.sound?.play("boost"); set(true); });
      on<PointerEvent>(boostBtn, "pointerup", () => set(false));
      on<PointerEvent>(boostBtn, "pointerleave", () => set(false));
      on<PointerEvent>(boostBtn, "pointercancel", () => set(false));
      on<KeyboardEvent>(boostBtn, "keydown", (e) => { if (e.key === "Enter") set(true); });
      on<KeyboardEvent>(boostBtn, "keyup", (e) => { if (e.key === "Enter") set(false); });
    }

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(canvas);
      this.cleanups.push(() => ro.disconnect());
    }
  }

  private toggleSpectateFree() {
    this.specFree = !this.specFree;
    if (this.specFree) this.specMap = false;
    const b = this.host?.querySelector<HTMLElement>("[data-spectate-free]");
    b?.setAttribute("aria-pressed", String(this.specFree));
  }

  /** Cycles through the players that are alive, heaviest first. */
  private nextSpectateTarget() {
    const alive = (this.buf.latest?.players ?? []).filter((p) => p.alive).sort((a, b) => b.m - a.m || (a.w < b.w ? -1 : 1));
    if (alive.length === 0) return;
    const i = alive.findIndex((p) => p.w === this.specTarget);
    this.specTarget = alive[(i + 1) % alive.length].w;
    this.specFree = false;
    this.specMap = false;
    this.host?.querySelector<HTMLElement>("[data-spectate-free]")?.setAttribute("aria-pressed", "false");
  }

  private steering(): { dx: number; dy: number } {
    const k = steerFromKeys(this.keys);
    if (k) return k;
    if (this.pointer && this.canvas) {
      const r = this.canvas.getBoundingClientRect();
      // While a joystick is held the vector is relative to its origin and full speed is its radius (64 px).
      const joy = this.host?.querySelector<HTMLElement>("[data-joy]");
      if (joy && !joy.hidden) return steerFromPointer(this.pointer.x, this.pointer.y, 192, 192);
      return steerFromPointer(this.pointer.x, this.pointer.y, r.width, r.height);
    }
    return { dx: 0, dy: 0 };
  }

  private pushInput() {
    if (this.dead) return; // spectators send nothing
    const { dx, dy } = this.steering();
    const boost = this.boostKey || this.boostButton;
    const sig = `${dx.toFixed(2)},${dy.toFixed(2)},${boost}`;
    const now = performance.now();
    // Only on change, plus a heartbeat twice a second so the server never keeps stale steering.
    if (sig === this.lastSent && now - this.lastSentAt < 500) return;
    if (this.deps.client.sendInput(dx, dy, boost)) {
      this.lastSent = sig;
      this.lastSentAt = now;
    }
  }

  // ------------------------------------------------------------------ drawing

  private resize() {
    const c = this.canvas;
    if (!c) return;
    // The canvas has at most as many device pixels as the quality level allows (1.5 per CSS pixel on high, 1 on low).
    // Also at most about 3.2 million device pixels: a big screen at 2x would repaint 8 million every frame.
    const area = Math.max(1, c.clientWidth * c.clientHeight);
    const dpr = Math.max(1, Math.min(this.painter.quality.dprCap, window.devicePixelRatio || 1, Math.sqrt(3_200_000 / area)));
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }

  /** One animation loop at most: a second call while one is pending does nothing. */
  private schedule() {
    if (this.raf || this.status !== "running" || document.visibilityState === "hidden") return;
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = () => {
    this.raf = 0;
    if (this.status !== "running" || document.visibilityState === "hidden") return;
    const t0 = performance.now();
    // A frame that throws must never stop the loop: the next frame tries again (a stopped loop leaves a blank board).
    try {
      this.draw(t0);
    } catch (e) {
      this.drawErrors++;
      this.lastDrawError = String((e as Error)?.stack ?? e).slice(0, 400);
      if (this.drawErrors <= 3) console.error("[goshi] draw failed", e);
    }
    const drawMs = performance.now() - t0;
    this.diag.frame(this.frameGap, drawMs, t0);
    if (this.frameGap > 0) this.rec.frame(t0, this.frameGap, drawMs, this.deps.quality?.level ?? 0);
    this.schedule();
  };
  private frameGap = 0;
  private drawErrors = 0;
  private lastDrawError = "";

  private stopLoops() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.inputTimer) clearInterval(this.inputTimer);
    if (this.hudTimer) clearInterval(this.hudTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.inputTimer = this.hudTimer = this.pingTimer = null;
  }

  private draw(now: number) {
    const c = this.canvas;
    const g = this.g;
    if (!c || !g) return;
    this.resize();
    const W = c.width;
    const H = c.height;
    const dpr = c.clientWidth > 0 ? W / c.clientWidth : 1;
    const dt = this.lastFrameAt ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 0;
    this.frameGap = this.lastFrameAt ? now - this.lastFrameAt : 0;
    this.lastFrameAt = now;
    this.adaptQuality(now);
    const scene = this.buf.sampleLive(now, this.deps.client.rttMs, this.clock.delay());
    const players = scene ? this.withPredictedSelf(scene.players, now, dt) : EMPTY_PLAYERS;
    const zone = scene?.zone ?? { cx: this.zoneStart.cx, cy: this.zoneStart.cy, r: this.zoneStart.r0 };
    let me: PlayerSnap | null = null;
    let heavy: PlayerSnap | null = null;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.w === this.you) me = p;
      if (p.alive && (!heavy || p.m > heavy.m)) heavy = p;
    }
    const meAlive = !!me && me.alive;
    // The camera follows your head. After you are eliminated it follows the heaviest player alive (spectator mode).
    let followed: PlayerSnap | null = heavy;
    if (!meAlive && this.specTarget) {
      const t = players.find((p) => p.w === this.specTarget && p.alive);
      if (t) followed = t;
      else this.specTarget = null;
    }
    const target = meAlive ? me : this.specFree ? null : followed;
    if (!meAlive && this.specFree) {
      const v = steerFromKeys(this.keys) ?? (this.pointer && this.canvas
        ? (() => { const r = this.canvas!.getBoundingClientRect(); return steerFromPointer(this.pointer!.x, this.pointer!.y, r.width, r.height); })()
        : null);
      if (v) {
        const sp = (this.span || viewSpan(20)) * 0.9;
        const ox = this.world.x0 ?? 0, oy = this.world.y0 ?? 0;
        this.cam.x = Math.max(ox, Math.min(ox + this.world.w, this.cam.x + v.dx * sp * dt));
        this.cam.y = Math.max(oy, Math.min(oy + this.world.h, this.cam.y + v.dy * sp * dt));
      }
      this.camSet = true;
    }
    const fullMap = !meAlive && this.specMap && !this.specFree;
    if (fullMap) {
      // The whole arena, centered: nothing is followed, everybody can be seen at once.
      this.cam.x = (this.world.x0 ?? 0) + this.world.w / 2;
      this.cam.y = (this.world.y0 ?? 0) + this.world.h / 2;
      this.camSet = true;
    }
    const wantSpan = fullMap ? Math.max(this.world.w, this.world.h) * 1.04 : viewSpan(target?.m ?? 20, this.matchMs > SURVIVAL_MS ? SURVIVAL_SPAN : undefined);
    if (!this.span || this.reduced) this.span = wantSpan;
    else this.span += (wantSpan - this.span) * smoothingFactor(dt, 0.6);
    // A small screen (a phone) sees a little more of the arena, so the bodies are not drawn huge.
    const scale = (Math.min(W, H) / this.span) * (Math.min(W, H) / dpr < 500 ? 0.8 : 1);
    if (target && !fullMap) {
      const [hx, hy] = target.head;
      if (this.reduced || meAlive || !this.camSet) { this.cam.x = hx; this.cam.y = hy; }
      else { const k = smoothingFactor(dt, 0.2); this.cam.x += (hx - this.cam.x) * k; this.cam.y += (hy - this.cam.y) * k; }
      this.camSet = true;
    }

    const boosting = meAlive && (this.boostKey || this.boostButton) && this.myMass > MIN_MASS;
    this.effects(dt, players, boosting, me);

    const amp = this.reduced ? 0 : shakeAmplitude(this.shakeAmp, now - this.shakeAt);
    const shake = amp > 0 ? shakeOffset(amp * dpr, now) : NO_SHAKE;
    const s = this.deps.strings;
    this.paintStrings ??= { you: s.you, protectedHint: s.protectedHint, backToZone: s.backToZone, countdown: s.countdown, finalZone: s.finalZone, nextZone: s.nextZone, nitro: s.nitro, mass: s.mass };
    this.painter.frame({
      g, W, H, dpr, ui: dpr * uiScale(W / dpr, H / dpr), traps: this.traps, massUsd: this.matchMs > SURVIVAL_MS, pingMs: this.deps.client.rttKnown ? this.deps.client.rttMs : undefined, now, players, zone, orbs: this.orbs, world: this.world, you: this.you, cam: this.cam, scale, shake,
      meAlive, myMass: this.myMass, boosting, protectLeft: protectionSecondsLeft(this.matchMs, this.timeLeftMs),
      hasState: this.buf.latest !== null, reduced: this.reduced,
      strings: this.paintStrings,
      floaters: this.floaters,
    });
    // A room paid by bag: what your coins are worth right now, gold at the top of the board.
    const meRaw = this.buf.latest?.players.find((p) => p.w === this.you);
    if (meRaw && meRaw.en && meRaw.alive && s.cashLine && s.cashReady) {
      // Cash arena: the bag, its multiple of the entry (like the x of a trade) and the eliminations still needed to cash out.
      const ui = dpr * uiScale(W / dpr, H / dpr);
      const bag = meRaw.bag ?? 0, k = meRaw.qk ?? 0;
      const tpl = k >= 3 ? s.cashReady : s.cashLine;
      const text = tpl.replace("{bag}", (bag / 1e9).toFixed(9)).replace("{x}", (bag / meRaw.en).toFixed(2)).replace("{entry}", (meRaw.en / 1e9).toFixed(9).replace(/0+$/, "")).replace("{k}", String(k)).replace("{left}", String(Math.max(0, 3 - k))).replace("{max}", (Math.min(bag, meRaw.en * (1 + k)) / 1e9).toFixed(9).replace(/0+$/, "")).replace("{mx}", String(1 + k));
      g.save();
      g.font = `700 ${Math.round(18 * ui)}px system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "top"; g.lineWidth = 4 * ui; g.strokeStyle = "rgba(0,0,0,0.7)";
      g.fillStyle = k >= 3 ? "#7dffb0" : "#ffd34d";
      g.strokeText(text, W / 2, 46 * ui); g.fillText(text, W / 2, 46 * ui);
      g.restore();
    } else if (this.myBag !== null && s.bagLine) {
      const ui = dpr * uiScale(W / dpr, H / dpr);
      g.save();
      g.font = `700 ${Math.round(18 * ui)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "top";
      g.lineWidth = 4 * ui;
      g.strokeStyle = "rgba(0,0,0,0.7)";
      g.fillStyle = "#ffd34d";
      const text = s.bagLine.replace("{n}", (this.myBag / 1e9).toFixed(9));
      g.strokeText(text, W / 2, 46 * ui);
      g.fillText(text, W / 2, 46 * ui);
      g.restore();
    }
    this.drawBoss(g, players, W, H, dpr, scale);
  }

  /** Rules 6: the boss's exposed back (red while it can be bitten, gold while announced), its shield, the boss line and your cash out. */
  private drawBoss(g: CanvasRenderingContext2D, players: readonly PlayerSnap[], W: number, H: number, dpr: number, scale: number) {
    const s = this.deps.strings;
    const ui = dpr * uiScale(W / dpr, H / dpr);
    const toS = (x: number, y: number): [number, number] => [(x - this.cam.x) * scale + W / 2, (y - this.cam.y) * scale + H / 2];
    const latest = this.buf.latest?.players;
    const line = (text: string, y: number, color: string) => {
      g.font = `700 ${Math.round(17 * ui)}px system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "top"; g.lineWidth = 4 * ui; g.strokeStyle = "rgba(0,0,0,0.75)"; g.fillStyle = color;
      g.strokeText(text, W / 2, y); g.fillText(text, W / 2, y);
    };
    g.save();
    const bi = this.bossInfo;
    const b = bi ? players.find((p) => p.w === bi.w && p.alive) : undefined;
    if (bi && b) {
      if (bi.st !== "calm" && b.body.length > 3) {
        g.lineCap = "round"; g.lineJoin = "round";
        g.strokeStyle = bi.st === "open" ? "rgba(255,70,70,0.55)" : "rgba(255,211,77,0.35)";
        g.lineWidth = Math.max(4, b.r * 2.4 * scale);
        g.beginPath();
        b.body.slice(Math.floor(b.body.length * 0.75)).forEach((q, i) => { const [x, y] = toS(q[0], q[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      }
      if (latest?.find((p) => p.w === bi.w)?.sh) {
        const [x, y] = toS(b.head[0], b.head[1]);
        g.strokeStyle = "rgba(120,200,255,0.9)"; g.lineWidth = 4 * dpr;
        g.beginPath(); g.arc(x, y, Math.max(20, b.r * scale * 3), 0, Math.PI * 2); g.stroke();
      }
      const tpl = bi.st === "open" ? s.bossOpen : bi.st === "warn" ? s.bossWarn : s.bossCalm;
      if (tpl) line(tpl.replace("{name}", b.n).replace("{n}", String(bi.in)), 76 * ui, bi.st === "open" ? "#ff6b6b" : bi.st === "warn" ? "#ffd34d" : "#ffffff");
      // While the tail is exposed, a big call in the middle of the screen, so nobody misses the moment to attack.
      if (bi.st === "open" && s.bossAttack) {
        const pulse = 1 + 0.08 * Math.sin(performance.now() / 120);
        g.font = `900 ${Math.round(30 * ui * pulse)}px system-ui, sans-serif`;
        g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = 6 * ui; g.strokeStyle = "rgba(0,0,0,0.8)"; g.fillStyle = "#ff4a4a";
        g.strokeText(s.bossAttack, W / 2, H * 0.3); g.fillText(s.bossAttack, W / 2, H * 0.3);
      }
    }
    // Near a big orb you cannot eat yet: say what it takes, once you are close enough to try.
    const meNow = players.find((p) => p.w === this.you && p.alive);
    if (meNow && s.bigOrbNeed) {
      for (const o of this.orbs.values()) {
        if (!o.t || meNow.m >= BIG_ORB_MASS[o.t]) continue;
        if (Math.hypot(o.x - meNow.head[0], o.y - meNow.head[1]) < meNow.r * 2.5 + 80) { line(s.bigOrbNeed.replace("{n}", String(BIG_ORB_MASS[o.t])), 160 * ui, "#ff8a8a"); break; }
      }
    }
    // On a phone the SOL split line is left out (the bags are on the board): the top of the screen stays clear.
    if (this.solNow && s.solSplit && W / dpr >= 560) line(s.solSplit.replace("{free}", (this.solNow.free / 1e9).toFixed(9)).replace("{held}", (this.solNow.held / 1e9).toFixed(9)), 20 * ui, "#b6f7d2");
    if (this.freezeLeft > 0 && s.final3Freeze) line(s.final3Freeze.replace("{n}", String(this.freezeLeft)), 132 * ui, "#7dffb0");
    const me = latest?.find((p) => p.w === this.you);
    // Boosting in the cash arena: the SOL it is costing, piling up over the head until the boost stops and it explodes.
    if (me && me.alive && me.bs) {
      const mineB = players.find((p) => p.w === this.you);
      if (mineB) {
        const [x, y] = toS(mineB.head[0], mineB.head[1]);
        g.font = `800 ${Math.round(16 * ui)}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "bottom";
        g.lineWidth = 4 * ui; g.strokeStyle = "rgba(0,0,0,0.8)"; g.fillStyle = "#ff6b6b";
        const tx = `-${(me.bs / 1e9).toFixed(9)} SOL`;
        g.strokeText(tx, x, y - mineB.r * scale * 2.6 - 6 * ui); g.fillText(tx, x, y - mineB.r * scale * 2.6 - 6 * ui);
      }
    }
    // Danger: your head about to touch another body (it would be your end) turns red, so a crash never comes as a surprise.
    if (me && me.alive) {
      const mine = players.find((p) => p.w === this.you);
      if (mine) {
        let worst = Infinity;
        for (const o of players) {
          if (o.w === this.you || !o.alive) continue;
          const lim = mine.r + o.r;
          for (const q of [o.head, ...o.body]) {
            const d = Math.hypot(q[0] - mine.head[0], q[1] - mine.head[1]) - lim;
            if (d < worst) worst = d;
          }
        }
        // Closer than about two head widths: red, stronger the closer it is.
        const near = Math.max(0, Math.min(1, 1 - worst / (mine.r * 4)));
        if (near > 0) {
          const [x, y] = toS(mine.head[0], mine.head[1]);
          const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 70);
          g.strokeStyle = `rgba(255,40,40,${(0.35 + 0.65 * near) * pulse})`;
          g.lineWidth = (3 + 5 * near) * dpr;
          g.beginPath(); g.arc(x, y, Math.max(18 * dpr, mine.r * scale * 1.9), 0, Math.PI * 2); g.stroke();
          g.fillStyle = `rgba(255,30,30,${0.18 * near * pulse})`;
          g.fill();
        }
      }
    }
    if (me && me.alive && me.co !== undefined && s.cashingOut) {
      const mine = players.find((p) => p.w === this.you);
      if (mine) {
        const [x, y] = toS(mine.head[0], mine.head[1]);
        g.strokeStyle = "#ffd34d"; g.lineWidth = 5 * dpr;
        g.beginPath(); g.arc(x, y, Math.max(24, mine.r * scale * 2.6), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, me.co / 5)); g.stroke();
      }
      line(s.cashingOut.replace("{n}", String(Math.max(0, Math.ceil(5 - me.co)))), 104 * ui, "#ffd34d");
      // Cash arena: the SOL leaves the body and flies into the wallet at the top, which counts up as it arrives.
      if (me.en && mine) {
        const k = Math.min(1, me.co / 5);
        const coin = this.painter.solCoin();
        const wx = W / 2, wy = 150 * ui;
        const pts = [mine.head, ...mine.body];
        for (let i = 0; i < 14; i++) {
          const t = (me.co * 0.9 + i / 14) % 1;
          const q = pts[Math.floor((i / 14) * pts.length)] ?? mine.head;
          const [sx, sy] = toS(q[0], q[1]);
          const x = sx + (wx - sx) * t, y = sy + (wy - sy) * t - Math.sin(t * Math.PI) * 80 * ui;
          const size = 26 * ui * (1 - t * 0.4);
          g.drawImage(coin, x - size, y - size, size * 2, size * 2);
        }
        g.fillStyle = "rgba(10,12,30,0.85)"; g.strokeStyle = "#7dffb0"; g.lineWidth = 2 * ui;
        g.beginPath(); g.roundRect(wx - 110 * ui, wy - 22 * ui, 220 * ui, 44 * ui, 12 * ui); g.fill(); g.stroke();
        line((s.cashToWallet ?? "{n} SOL").replace("{n}", ((me.cb ?? (me.bag ?? 0) * k) / 1e9).toFixed(9)), wy - 11 * ui, "#7dffb0");
      }
    }
    // Cash arena: anybody cashing out is shown to everybody else, with a pulsing ring: stop them and their bag falls on the map.
    if (me?.en !== undefined || this.solNow) {
      const others = players.filter((p) => p.alive && p.w !== this.you && p.co !== undefined);
      for (const o of others) {
        const [x, y] = toS(o.head[0], o.head[1]);
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
        g.strokeStyle = `rgba(255,211,77,${0.5 + 0.5 * pulse})`; g.lineWidth = 4 * dpr;
        g.beginPath(); g.arc(x, y, Math.max(26, o.r * scale * (2.4 + pulse * 0.6)), 0, Math.PI * 2); g.stroke();
      }
      if (others.length && s.cashOtherWarn) line(s.cashOtherWarn.replace("{name}", others.map((o) => o.n).join(", ")), 186 * ui, "#ffd34d");
    }
    g.restore();
  }

  /** Effects that depend on the scene: the boost trail, and stepping the pools. */
  private effects(dt: number, players: readonly PlayerSnap[], myBoost: boolean, me: PlayerSnap | null) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      this.floaters[i].age += dt;
      if (this.floaters[i].age > 1.2) this.floaters.splice(i, 1);
    }
    if (this.reduced || !this.painter.quality.particles) { this.painter.fx.clear(); return; }
    this.painter.fx.step(dt);
    this.sparkAcc += dt;
    if (this.sparkAcc < 0.045) return;
    this.sparkAcc = 0;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.alive || p.body.length < 2) continue;
      const boosting = p.w === this.you ? myBoost && me !== null : this.boosting.has(p.w);
      if (!boosting) continue;
      const tail = p.body[Math.min(p.body.length - 1, 3)];
      this.painter.fx.spark(tail[0], tail[1], p.r * 0.8, this.painter.effectColor(p));
    }
  }

  /**
   * Replaces the local player in the scene by its predicted self: the latest snapshot moved ahead by the time since it
   * arrived plus half the round trip, turning at once toward the pointer, and corrected smoothly toward the server.
   */
  /** Traps on the map, from the latest snapshot. */
  private traps: readonly TrapSnap[] = NO_TRAPS;
  private readonly seenTraps = new Set<string>();
  private readonly shieldUp = new Set<string>();
  private lastTrapAt = 0;
  /** Sets a trap behind the tail (keys 1 and 2, or the trap buttons). The server says no when the backpack is short. */
  setTrap(kind: TrapK): void {
    if (this.status !== "running" || this.dead || !this.deps.client.trap) return;
    const now = performance.now();
    if (now - this.lastTrapAt < 400) return;
    this.lastTrapAt = now;
    if (this.deps.client.trap(kind)) this.deps.sound?.play("boost");
  }

  /** CEO mode (key "ñ"): the server steers this body, the pointer is ignored. */
  autopilot = false;

  private withPredictedSelf(players: PlayerSnap[], now: number, dt: number): PlayerSnap[] {
    const latest = this.buf.latest;
    const snapMe = latest?.players.find((p) => p.w === this.you);
    // CEO mode: the server plays the body, so the pointer is not predicted and the body is drawn as the server sends it.
    if (!latest || !snapMe || !snapMe.alive || this.autopilot) {
      this.local = null;
      return players;
    }
    const st = this.steering();
    if (st.dx !== 0 || st.dy !== 0) this.want = headingOf(st.dx, st.dy);
    const boost = this.boostKey || this.boostButton;
    const speed = effectiveSpeed(snapMe.m, boost);
    const look = lookAheadSeconds(now - latest.at, this.deps.client.rttMs);
    const ref = ahead(snapMe.head, snapMe.h, speed, look);
    if (!this.local) {
      this.local = { x: ref[0], y: ref[1], h: snapMe.h };
    } else {
      const moved = advance(this.local, this.want, speed, dt, turnRateOf(snapMe.m));
      this.local = reconcile(moved, ref, dt).kin;
    }
    // Built in reused buffers: the object, the head and the body tuples are the same every frame.
    const self = this.selfSnap;
    Object.assign(self, snapMe);
    self.head = this.selfHead;
    self.head[0] = this.local.x;
    self.head[1] = this.local.y;
    extendBodyInto(this.selfBody, snapMe.head[0], snapMe.head[1], snapMe.body, this.local.x, this.local.y);
    self.body = this.selfBody;
    self.h = this.local.h;
    for (let i = 0; i < players.length; i++) if (players[i].w === this.you) { players[i] = self; break; }
    return players;
  }

  private updateHud() {
    this.updateDiag();
    const last = this.deps.client.rttLastMs ?? 0;
    if (last > 0 && last !== this.lastPingSeen) {
      this.lastPingSeen = last;
      this.rec.ping(performance.now(), last);
    }
    const q = (s: string) => this.host?.querySelector<HTMLElement>(s);
    // Survival has no end: the clock counts what you have lived instead of what is left.
    const secs = this.matchMs > SURVIVAL_MS ? Math.max(0, Math.floor((this.matchMs - this.timeLeftMs) / 1000)) : Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    const t = q("[data-hud-time]");
    if (t) t.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    const m = q("[data-hud-mass]");
    if (m) m.textContent = this.deps.format(this.myMass || START_MASS);
    const a = q("[data-hud-alive]");
    if (a) a.textContent = String(this.alive);
    const pg = q("[data-hud-ping]");
    if (pg) pg.textContent = this.deps.client.rttKnown ? this.deps.strings.pingValue.replace("{n}", String(Math.round(this.deps.client.rttMs))) : this.deps.strings.pingWait;
    const rk = q("[data-hud-rank]");
    if (rk) {
      const r = aliveRank(this.buf.latest?.players ?? [], this.you);
      const s = this.deps.strings;
      rk.textContent = this.dead
        ? s.outValue.replace("{rank}", String(this.finalRank))
        : r ? s.rankValue.replace("{rank}", String(r.rank)).replace("{n}", String(r.of)) : s.playersValue.replace("{n}", String(this.alive));
    }
    const z = q("[data-hud-zone]");
    if (z) {
      const latest = this.buf.latest;
      if (latest && this.matchMs > SURVIVAL_MS) {
        // Survival: the zone never closes, so the line says when the next airdrop of rich coins lands instead.
        z.textContent = this.deps.strings.showerIn.replace("{n}", String(Math.max(0, this.dropIn - Math.floor((performance.now() - this.dropAt) / 1000))));
      } else if (latest) {
        z.textContent = zoneText(zoneStatus(latest.zone, performance.now() - latest.at), this.deps.strings.zoneLines);
      } else {
        // Before the first snapshot: the match has not begun, the first circle comes after the calm part.
        z.textContent = zoneText({ line: "calm", seconds: Math.ceil(this.shrinkStartMs / 1000), phase: 0 }, this.deps.strings.zoneLines);
      }
    }
    // In full screen the numbers bar is out of sight: the time, place and zone ride on the canvas.
    const fsHud = q("[data-fs-hud]");
    if (fsHud && this.host?.querySelector(".game-canvas.is-fs")) {
      fsHud.textContent = [t, q("[data-hud-rank]"), q("[data-hud-zone]")].map((e) => e?.textContent ?? "").filter(Boolean).join("   ");
    }
    const list = q("[data-hud-scores]");
    const latest = this.buf.latest;
    if (list && latest) {
      const top = [...latest.players].filter((p) => p.alive).sort((x, y) => y.m - x.m).slice(0, 10);
      list.replaceChildren(
        ...top.map((p) => {
          const li = document.createElement("li");
          li.textContent = `${p.w === this.you ? `${p.n} (${this.deps.strings.you})` : p.n}: ${this.deps.format(p.m)}`;
          if (p.w === this.you) li.className = "me";
          if (p.role === "saboteur") li.className += " sab";
          return li;
        }),
      );
    }
  }
}
