// A compact plain text report of the last 30 seconds of the arena, for the person to paste to us when it feels choppy.
// The recorder keeps fixed size ring buffers (nothing is allocated per frame); the builder is a pure function of
// plain samples, so it is unit tested with synthetic data.

export const WINDOW_MS = 30_000;
const FRAMES = 4096;
const SNAPS = 1024;
const PINGS = 256;
const TASKS = 256;

export interface Samples {
  /** Time between consecutive frames (ms), oldest first. */
  frameGaps: number[];
  /** Time spent drawing each frame (ms). */
  draws: number[];
  /** Quality level of each frame (0 high, 1 medium, 2 low). */
  levels: number[];
  /** Time between consecutive snapshots (ms). */
  snapGaps: number[];
  snapBytes: number;
  /** Span of time the snapshots cover (ms), for the bytes per second. */
  snapSpanMs: number;
  /** Round trip samples (ms). */
  pings: number[];
  longTasks: { count: number; maxMs: number; totalMs: number; supported: boolean };
  visibilityChanges: number;
  /** The window really covered (ms): less than 30 s early in a match. */
  coveredMs: number;
}

export interface Env {
  at: string;
  page: string;
  userAgent: string;
  dpr: number;
  canvasCss: [number, number];
  canvasPx: [number, number];
  cores: number | null;
  memoryGB: number | null;
  gpu: string;
  reducedMotion: boolean;
  heapMB: number | null;
  qualityMode: string;
  qualityLevel: string;
  zone: string;
  /** document.visibilityState when the report was made: a hidden tab is throttled by the browser to about 1 fps. */
  visibility: string;
}

export type Cause = "network" | "main-thread" | "render" | "none" | "no-data";

export interface Metrics {
  fpsAvg: number;
  p50: number; p95: number; p99: number; max: number;
  over33: number; over50: number;
  drawP50: number; drawP95: number;
  sps: number;
  gapP50: number; gapP95: number; gapMax: number; jitter: number;
  kbps: number;
  pingMin: number; pingAvg: number; pingMax: number;
  levelMs: [number, number, number];
  causes: Cause[];
}

/** Percentile with linear interpolation (p in 0..100). Empty input gives 0. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (Math.max(0, Math.min(100, p)) / 100) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const mean = (a: readonly number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const stddev = (a: readonly number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
};

/**
 * Which cause is likely. Network: snapshots arrive with big gaps (p95 above 120 ms). Main thread: the browser reported
 * long tasks (over 50 ms). Render: drawing is slow (p95 above 8 ms) or frames are long while snapshots are steady.
 */
export function likelyCauses(m: Pick<Metrics, "gapP95" | "drawP95" | "over33" | "p50">, frames: number, longTasks: number, hasData: boolean): Cause[] {
  if (!hasData) return ["no-data"];
  const out: Cause[] = [];
  const steady = m.gapP95 <= 120;
  if (!steady) out.push("network");
  if (longTasks > 0) out.push("main-thread");
  if (m.drawP95 > 8 || (steady && frames > 0 && m.over33 / frames > 0.02)) out.push("render");
  return out.length ? out : ["none"];
}

export function computeMetrics(s: Samples): Metrics {
  const g = s.frameGaps;
  const have = g.length >= 10;
  const gapP95 = percentile(s.snapGaps, 95);
  const base = {
    gapP95,
    drawP95: percentile(s.draws, 95),
    over33: g.filter((x) => x > 33).length,
    p50: percentile(g, 50),
  };
  const levelMs: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < g.length; i++) {
    const l = s.levels[i] ?? 0;
    levelMs[l > 2 ? 2 : l < 0 ? 0 : l] += g[i];
  }
  const spanS = s.snapSpanMs / 1000;
  return {
    fpsAvg: g.length ? 1000 / mean(g) : 0,
    p50: base.p50,
    p95: percentile(g, 95),
    p99: percentile(g, 99),
    max: g.length ? Math.max(...g) : 0,
    over33: base.over33,
    over50: g.filter((x) => x > 50).length,
    drawP50: percentile(s.draws, 50),
    drawP95: base.drawP95,
    sps: spanS > 0 ? s.snapGaps.length / spanS : 0,
    gapP50: percentile(s.snapGaps, 50),
    gapP95,
    gapMax: s.snapGaps.length ? Math.max(...s.snapGaps) : 0,
    jitter: stddev(s.snapGaps),
    kbps: spanS > 0 ? s.snapBytes / 1024 / spanS : 0,
    pingMin: s.pings.length ? Math.min(...s.pings) : 0,
    pingAvg: mean(s.pings),
    pingMax: s.pings.length ? Math.max(...s.pings) : 0,
    levelMs,
    causes: likelyCauses(base, g.length, s.longTasks.count, have),
  };
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const sec = (ms: number) => `${Math.round(ms / 100) / 10}s`;

const CAUSE_TEXT: Record<Cause, string> = {
  network: "NETWORK: snapshots arrive in bursts (gap p95 above 120 ms), the picture waits for the server",
  "main-thread": "MAIN THREAD: the browser reports long tasks (over 50 ms), something blocks the page",
  render: "RENDER: drawing a frame is slow or frames are long while snapshots are steady, try quality low",
  none: "NONE SEEN: frame times and snapshot gaps are fine in this window",
  "no-data": "NOT ENOUGH DATA: play a few seconds first",
};

/** The report text and the numbers it was built from. */
export function buildReport(s: Samples, env: Env): { text: string; metrics: Metrics } {
  const m = computeMetrics(s);
  const lt = s.longTasks;
  const lines = [
    `Goshi arena report (last ${sec(s.coveredMs)})`,
    `time: ${env.at}  page: ${env.page}`,
    `likely cause: ${m.causes.map((c) => CAUSE_TEXT[c]).join(" | ")}`,
    `fps avg ${f1(m.fpsAvg)} | frame ms p50 ${f1(m.p50)} p95 ${f1(m.p95)} p99 ${f1(m.p99)} max ${f1(m.max)}`,
    `frames over 33 ms: ${m.over33} | over 50 ms: ${m.over50} | frames: ${s.frameGaps.length}`,
    `draw ms p50 ${f1(m.drawP50)} p95 ${f1(m.drawP95)}`,
    `long tasks: ${lt.supported ? `${lt.count} (max ${f1(lt.maxMs)} ms, total ${f1(lt.totalMs)} ms)` : "not supported by this browser"}`,
    `snapshots ${f1(m.sps)}/s | gap ms p50 ${f1(m.gapP50)} p95 ${f1(m.gapP95)} max ${f1(m.gapMax)} | jitter sd ${f1(m.jitter)} ms | ${f1(m.kbps)} KB/s`,
    `ping ms min ${f1(m.pingMin)} avg ${f1(m.pingAvg)} max ${f1(m.pingMax)} (${s.pings.length} samples)`,
    `quality ${env.qualityMode} now ${env.qualityLevel} | time at high ${sec(m.levelMs[0])} medium ${sec(m.levelMs[1])} low ${sec(m.levelMs[2])}`,
    `dpr ${env.dpr} | canvas css ${env.canvasCss[0]}x${env.canvasCss[1]} backing ${env.canvasPx[0]}x${env.canvasPx[1]}`,
    `cores ${env.cores ?? "?"} | memory ${env.memoryGB ?? "?"} GB | heap ${env.heapMB === null ? "?" : `${f1(env.heapMB)} MB`}`,
    `gpu: ${env.gpu}`,
    `reduced motion: ${env.reducedMotion ? "yes" : "no"} | visibility changes: ${s.visibilityChanges} | page now: ${env.visibility}${env.visibility === "visible" ? "" : " (a hidden tab is throttled by the browser, slow frames are not the game)"}`,
    `zone: ${env.zone}`,
    `ua: ${env.userAgent}`,
  ];
  return { text: lines.join("\n"), metrics: m };
}

/** Fixed size rolling recorder of the last 30 seconds. `now` is performance.now() style milliseconds. */
export class ReportRecorder {
  private readonly ft = new Float64Array(FRAMES);
  private readonly fg = new Float32Array(FRAMES);
  private readonly fd = new Float32Array(FRAMES);
  private readonly fl = new Uint8Array(FRAMES);
  private fi = 0;
  private fn = 0;
  private readonly st = new Float64Array(SNAPS);
  private readonly sb = new Float64Array(SNAPS);
  private si = 0;
  private sn = 0;
  private readonly pt = new Float64Array(PINGS);
  private readonly pv = new Float32Array(PINGS);
  private pi = 0;
  private pn = 0;
  private readonly lt = new Float64Array(TASKS);
  private readonly ld = new Float32Array(TASKS);
  private li = 0;
  private ln = 0;
  private readonly vis = new Float64Array(64);
  private vi = 0;
  private vn = 0;
  longTaskSupported = false;

  frame(now: number, gapMs: number, drawMs: number, level: number): void {
    this.ft[this.fi] = now; this.fg[this.fi] = gapMs; this.fd[this.fi] = drawMs; this.fl[this.fi] = level;
    this.fi = (this.fi + 1) % FRAMES;
    if (this.fn < FRAMES) this.fn++;
  }

  snapshot(now: number, bytes: number): void {
    this.st[this.si] = now; this.sb[this.si] = bytes;
    this.si = (this.si + 1) % SNAPS;
    if (this.sn < SNAPS) this.sn++;
  }

  ping(now: number, ms: number): void {
    this.pt[this.pi] = now; this.pv[this.pi] = ms;
    this.pi = (this.pi + 1) % PINGS;
    if (this.pn < PINGS) this.pn++;
  }

  longTask(now: number, durationMs: number): void {
    this.lt[this.li] = now; this.ld[this.li] = durationMs;
    this.li = (this.li + 1) % TASKS;
    if (this.ln < TASKS) this.ln++;
  }

  visibilityChange(now: number): void {
    this.vis[this.vi] = now;
    this.vi = (this.vi + 1) % this.vis.length;
    if (this.vn < this.vis.length) this.vn++;
  }

  reset(): void {
    this.fn = this.sn = this.pn = this.ln = this.vn = 0;
    this.fi = this.si = this.pi = this.li = this.vi = 0;
  }

  /** The samples of the last `windowMs` ms ending at `now`. */
  collect(now: number, windowMs: number = WINDOW_MS): Samples {
    const from = now - windowMs;
    const frameGaps: number[] = [], draws: number[] = [], levels: number[] = [];
    // Oldest to newest.
    for (let k = 0; k < this.fn; k++) {
      const i = (this.fi - this.fn + k + FRAMES) % FRAMES;
      if (this.ft[i] < from) continue;
      frameGaps.push(this.fg[i]); draws.push(this.fd[i]); levels.push(this.fl[i]);
    }
    const snapGaps: number[] = [];
    let bytes = 0, first = -1, last = -1;
    for (let k = 0; k < this.sn; k++) {
      const i = (this.si - this.sn + k + SNAPS) % SNAPS;
      const t = this.st[i];
      if (t < from) continue;
      if (last >= 0) snapGaps.push(t - last);
      else first = t;
      last = t;
      bytes += this.sb[i];
    }
    const pings: number[] = [];
    for (let k = 0; k < this.pn; k++) {
      const i = (this.pi - this.pn + k + PINGS) % PINGS;
      if (this.pt[i] >= from) pings.push(this.pv[i]);
    }
    let count = 0, max = 0, total = 0;
    for (let k = 0; k < this.ln; k++) {
      const i = (this.li - this.ln + k + TASKS) % TASKS;
      if (this.lt[i] < from) continue;
      count++; total += this.ld[i]; if (this.ld[i] > max) max = this.ld[i];
    }
    let vc = 0;
    for (let k = 0; k < this.vn; k++) if (this.vis[k] >= from) vc++;
    let covered = 0;
    for (const g of frameGaps) covered += g;
    return {
      frameGaps, draws, levels, snapGaps, snapBytes: bytes,
      snapSpanMs: first >= 0 && last > first ? last - first : 0,
      pings, longTasks: { count, maxMs: max, totalMs: total, supported: this.longTaskSupported },
      visibilityChanges: vc, coveredMs: Math.min(windowMs, covered),
    };
  }
}
