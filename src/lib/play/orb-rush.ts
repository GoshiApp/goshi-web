// "Orb Rush": the canvas side of the real-time arena. It implements RealtimeArena (arena-adapter.ts).
// The game is simulated ONLY on the server. This file draws the snapshots it is given, reads the pointer, touch and
// keyboard, and sends the steering back (at most 20 times per second). It never decides anything about the match.

import type { ArenaContext, ArenaOutcome, ArenaStatus, RealtimeArena } from "./arena-adapter.ts";
import { SnapBuffer } from "./interp.ts";
import { ArenaPainter, type Floater, type PaintStrings, SABOTEUR_BODY, SABOTEUR_COLOR, colorFor, orbRadius, type LooseOrb } from "./arena-paint.ts";
import { TIER_SCALE, orbTier, shakeAmplitude, shakeOffset } from "./arena-fx.ts";
import { ArenaDiag } from "./arena-diag.ts";
import { ReportRecorder, buildReport, type Env } from "./arena-report.ts";
import { LEVEL_NAMES, SETTINGS, type QualityManager } from "./arena-quality.ts";
import type { ArenaSound } from "./arena-sound.ts";
import { aliveRank, protectionSecondsLeft, viewSpan } from "./arena-view.ts";
import { phaseKey, zoneDamagePerSecond, zoneStatus, zoneText, type ZoneStrings } from "./arena-zone.ts";
import { MIN_MASS, START_MASS, speedOf, advance, ahead, effectiveSpeed, extendBodyInto, headingOf, lookAheadSeconds, reconcile, smoothingFactor, type Kin } from "./predict.ts";
import { classifyDeath, deathLine, type DeathStrings } from "./death.ts";
import type { PlayerSnap, ServerMsg } from "./protocol.ts";

type Start = Extract<ServerMsg, { t: "start" }>;
type Snap = Extract<ServerMsg, { t: "snap" }>;
type End = Extract<ServerMsg, { t: "end" }>;

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
  private world = { w: 3000, h: 3000 };
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
  private readonly selfSnap = {} as PlayerSnap;
  private readonly selfHead: [number, number] = [0, 0];
  private readonly selfBody: [number, number][] = [];
  private showDiag = false;
  private lastBytes = 0;
  private lastPhaseKey: string | null = null;
  /** "-N" numbers while you are outside the zone, one a second. */
  private readonly floaters: Floater[] = [];
  private floaterAt = 0;
  private outNow = false;
  private lastQualityLevel = -1;
  /** Reused for each snapshot (no new Map per message). */
  private readonly beforeMap = new Map<string, PlayerSnap>();
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
    this.showDiag = !(host.querySelector<HTMLElement>("[data-diag]")?.hidden ?? true);
    this.host.querySelector("[data-diag-toggle]")?.setAttribute("aria-pressed", String(this.showDiag));
    this.resize();
  }

  /** Called when the server says the match starts. */
  start(): void {
    this.status = "running";
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
  get stats(): { mass: number; peak: number; kills: number; you: string } {
    return { mass: this.myMass, peak: this.peakMass, kills: this.kills, you: this.you };
  }

  /** Changes the color of the local goshi at once. */
  setOwnColor(index: number | null): void {
    this.painter.setOwnColor(index);
  }

  /** The name a wallet had in the latest snapshot. */
  nameOf(w: string): string {
    return this.buf.latest?.players.find((p) => p.w === w)?.n ?? w.slice(0, 4);
  }

  dispose(): void {
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
    this.local = null;
    this.want = null;
    // Real placeholders until the first snapshot: the whole match to go, the start mass, everybody alive.
    this.myMass = START_MASS;
    this.peakMass = START_MASS;
    this.kills = 0;
    this.finalRank = 0;
    this.alive = Object.keys(msg.roles).length;
    this.timeLeftMs = msg.matchMs;
    this.cam = { x: msg.zone.cx, y: msg.zone.cy };
    this.camSet = false;
    this.span = 0;
    this.setDeadOverlay(null);
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
    const at = performance.now();
    this.buf.push({ at, tick: msg.tick, players: msg.players, zone: msg.zone });
    const total = this.deps.client.bytesIn ?? 0;
    this.diag.snapshot(at, total - this.lastBytes);
    this.rec.snapshot(at, total - this.lastBytes);
    this.lastBytes = total;
    // Each new phase or state is said once: the next zone is marked, it closes, the final zone.
    const key = phaseKey(msg.zone);
    if (key !== null && key !== this.lastPhaseKey) {
      this.lastPhaseKey = key;
      const st = zoneStatus(msg.zone);
      if (st.line === "warn" || st.line === "shrink" || st.line === "final") this.deps.announce(zoneText(st, this.deps.strings.zoneLines));
    }
    this.snapshotEffects(msg, before, prev?.tick);
    this.timeLeftMs = msg.timeLeftMs;
    this.alive = msg.players.filter((p) => p.alive).length;
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
      if (ev.by === this.you && ev.w !== this.you) this.kills++;
      if (ev.w === this.you) {
        this.dead = true;
        this.finalRank = ev.rank;
        this.setDeadOverlay({ rank: ev.rank, why: line });
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
    for (const id of msg.eatenOrbs) {
      const o = this.orbs.get(id);
      if (!o) continue;
      this.orbs.delete(id);
      if (fresh) {
        const tier = orbTier(o.v, o.loot === true);
        fx.pop(o.x, o.y, orbRadius(o.v) * TIER_SCALE[tier] * 1.6, tier);
      }
      if (me && me.alive && Math.hypot(me.head[0] - o.x, me.head[1] - o.y) < me.r + 36) this.deps.sound?.play("eat");
      // Whoever has the orb at its mouth is the one that ate it: a happy face for a moment.
      for (const p of msg.players) {
        if (p.alive && Math.hypot(p.head[0] - o.x, p.head[1] - o.y) < p.r + 40) { this.painter.noteAte(p.w, performance.now()); break; }
      }
    }
    // A body turned into orbs arrives as a batch next to a death: those are drawn bigger and golden.
    const lootBatch = msg.events.length > 0 && msg.newOrbs.length >= 6;
    for (const o of msg.newOrbs) {
      const loot = lootBatch || !Number.isInteger(o.v);
      this.orbs.set(o.id, loot ? { ...o, loot: true } : o);
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
    // Death: a burst along the body that was there (the snapshot of the death has no body any more).
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
    on<PointerEvent>(canvas, "pointermove", (e) => { this.pointer = rel(e); });
    on<PointerEvent>(canvas, "pointerdown", (e) => {
      this.pointer = rel(e);
      canvas.setPointerCapture?.(e.pointerId);
      canvas.focus({ preventScroll: true });
    });
    const release = (e: PointerEvent) => { if (e.pointerType !== "mouse") this.pointer = null; };
    on<PointerEvent>(canvas, "pointerup", release);
    on<PointerEvent>(canvas, "pointercancel", release);
    on<PointerEvent>(canvas, "pointerleave", (e) => { if (e.pointerType === "mouse") this.pointer = null; });

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

    const boostBtn = this.host?.querySelector<HTMLElement>("[data-boost-button]");
    if (boostBtn) {
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
    this.host?.querySelector<HTMLElement>("[data-spectate-free]")?.setAttribute("aria-pressed", "false");
  }

  private steering(): { dx: number; dy: number } {
    const k = steerFromKeys(this.keys);
    if (k) return k;
    if (this.pointer && this.canvas) {
      const r = this.canvas.getBoundingClientRect();
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
    const dpr = Math.min(this.painter.quality.dprCap, window.devicePixelRatio || 1);
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
    this.draw(t0);
    const drawMs = performance.now() - t0;
    this.diag.frame(this.frameGap, drawMs, t0);
    if (this.frameGap > 0) this.rec.frame(t0, this.frameGap, drawMs, this.deps.quality?.level ?? 0);
    this.schedule();
  };
  private frameGap = 0;

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
    const scene = this.buf.sampleLive(now, this.deps.client.rttMs);
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
        this.cam.x = Math.max(0, Math.min(this.world.w, this.cam.x + v.dx * sp * dt));
        this.cam.y = Math.max(0, Math.min(this.world.h, this.cam.y + v.dy * sp * dt));
      }
      this.camSet = true;
    }
    const wantSpan = viewSpan(target?.m ?? 20);
    if (!this.span || this.reduced) this.span = wantSpan;
    else this.span += (wantSpan - this.span) * smoothingFactor(dt, 0.6);
    const scale = Math.min(W, H) / this.span;
    if (target) {
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
      g, W, H, dpr, now, players, zone, orbs: this.orbs, world: this.world, you: this.you, cam: this.cam, scale, shake,
      meAlive, myMass: this.myMass, boosting, protectLeft: protectionSecondsLeft(this.matchMs, this.timeLeftMs),
      hasState: this.buf.latest !== null, reduced: this.reduced,
      strings: this.paintStrings,
      floaters: this.floaters,
    });
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
  private withPredictedSelf(players: PlayerSnap[], now: number, dt: number): PlayerSnap[] {
    const latest = this.buf.latest;
    const snapMe = latest?.players.find((p) => p.w === this.you);
    if (!latest || !snapMe || !snapMe.alive) {
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
      const moved = advance(this.local, this.want, speed, dt);
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
    const secs = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
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
      if (latest) {
        z.textContent = zoneText(zoneStatus(latest.zone, performance.now() - latest.at), this.deps.strings.zoneLines);
      } else {
        // Before the first snapshot: the match has not begun, the first circle comes after the calm part.
        z.textContent = zoneText({ line: "calm", seconds: Math.ceil(this.shrinkStartMs / 1000), phase: 0 }, this.deps.strings.zoneLines);
      }
    }
    const list = q("[data-hud-scores]");
    const latest = this.buf.latest;
    if (list && latest) {
      const top = [...latest.players].filter((p) => p.alive).sort((x, y) => y.m - x.m).slice(0, 5);
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
